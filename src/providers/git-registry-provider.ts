import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";

import { GitRefreshFailedError, RegistryUnavailableError } from "../errors";
import type { Logger } from "../logger";
import type { RegistryProvider } from "./types";

type GitRunOptions = {
  cwd?: string;
};

export class GitRegistryProvider implements RegistryProvider {
  public readonly type = "git" as const;

  private readonly cacheDir: string;
  private readonly authHeader?: string;
  private lastRefreshAt = 0;
  private currentRevision?: string;

  constructor(
    private readonly repoUrl: string,
    cacheExpirySeconds: number,
    registryKey: string | undefined,
    private readonly logger: Logger,
  ) {
    const repoHash = createHash("sha256").update(repoUrl).digest("hex").slice(0, 16);
    this.cacheDir = path.join(os.tmpdir(), "advers-mcp-registry", repoHash);
    this.cacheExpiryMs = cacheExpirySeconds * 1000;
    this.authHeader = buildAuthHeader(repoUrl, registryKey);
  }

  private readonly cacheExpiryMs: number;

  async getRootPath(): Promise<string> {
    await mkdir(path.dirname(this.cacheDir), { recursive: true });

    const hasLocalCopy = existsSync(path.join(this.cacheDir, ".git"));
    const cacheExpired = Date.now() - this.lastRefreshAt >= this.cacheExpiryMs;

    if (!hasLocalCopy) {
      this.logger.info("Cloning git registry", { provider: "git" });
      await this.clone();
      this.lastRefreshAt = Date.now();
      this.currentRevision = await this.readHeadRevision();
      return this.cacheDir;
    }

    if (cacheExpired) {
      this.logger.info("Refreshing git registry cache", { provider: "git" });
      try {
        await this.refresh();
        this.lastRefreshAt = Date.now();
        this.currentRevision = await this.readHeadRevision();
      } catch (error) {
        this.logger.error("Git refresh failed; using stale cache", {
          provider: "git",
          error: asErrorMessage(error),
        });
      }
    } else {
      this.logger.debug("Git registry cache hit", { provider: "git" });
    }

    if (!existsSync(this.cacheDir)) {
      throw new RegistryUnavailableError("Git registry cache is unavailable");
    }

    if (!this.currentRevision) {
      this.currentRevision = await this.readHeadRevision();
    }

    return this.cacheDir;
  }

  async getFileRevision(_filePath: string): Promise<string> {
    await this.getRootPath();
    if (!this.currentRevision) {
      this.currentRevision = await this.readHeadRevision();
    }

    return this.currentRevision;
  }

  private async clone(): Promise<void> {
    try {
      await rm(this.cacheDir, { recursive: true, force: true });
      await this.runGit(["clone", "--depth", "1", this.repoUrl, this.cacheDir]);
    } catch (error) {
      throw new RegistryUnavailableError("Failed to clone registry repository", error);
    }
  }

  private async refresh(): Promise<void> {
    try {
      await this.runGit(["fetch", "--depth", "1", "origin"], { cwd: this.cacheDir });
      const branchRef = (await this.runGit(["symbolic-ref", "refs/remotes/origin/HEAD"], { cwd: this.cacheDir }))
        .trim()
        .replace("refs/remotes/origin/", "");
      const branch = branchRef || "main";
      await this.runGit(["reset", "--hard", `origin/${branch}`], { cwd: this.cacheDir });
    } catch (error) {
      throw new GitRefreshFailedError("Failed to refresh git registry", error);
    }
  }

  private async readHeadRevision(): Promise<string> {
    const revision = await this.runGit(["rev-parse", "HEAD"], { cwd: this.cacheDir });
    return revision.trim();
  }

  private async runGit(args: string[], options: GitRunOptions = {}): Promise<string> {
    const env = {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      ...(this.authHeader ? { GIT_HTTP_EXTRA_HEADER: this.authHeader } : {}),
    };

    const proc = Bun.spawn(["git", ...args], {
      cwd: options.cwd,
      env,
      stderr: "pipe",
      stdout: "pipe",
    });

    const [stdoutBuf, stderrBuf, code] = await Promise.all([
      new Response(proc.stdout).arrayBuffer(),
      new Response(proc.stderr).arrayBuffer(),
      proc.exited,
    ]);

    const stdout = new TextDecoder().decode(stdoutBuf);
    const stderr = new TextDecoder().decode(stderrBuf);

    if (code !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${stderr || stdout}`);
    }

    return stdout;
  }
}

function buildAuthHeader(repoUrl: string, registryKey: string | undefined): string | undefined {
  if (!registryKey || !repoUrl.startsWith("https://")) {
    return undefined;
  }

  if (registryKey.includes(":")) {
    const encoded = Buffer.from(registryKey).toString("base64");
    return `Authorization: Basic ${encoded}`;
  }

  return `Authorization: Bearer ${registryKey}`;
}

function asErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
