import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";

import { GitRefreshFailedError, RegistryUnavailableError } from "../errors";
import type { Logger } from "../logger";
import { resolveRegistryRoot } from "../utils/registry";
import type { RegistryProvider } from "./types";

type GitRunOptions = {
	cwd?: string;
};

type GitAuth = {
	header?: string;
	mode: "none" | "basic" | "bearer" | "bitbucket-token";
};

export class GitRegistryProvider implements RegistryProvider {
	public readonly type = "git" as const;

	private readonly cacheDir: string;
	private readonly auth: GitAuth;
	private lastRefreshAt = 0;
	private currentRevision?: string;

	/**
	 *
	 */
	constructor(
		private readonly repoUrl: string,
		private readonly registryDir: string,
		cacheExpirySeconds: number,
		registryKey: string | undefined,
		private readonly logger: Logger,
	) {
		const repoHash = createHash("sha256").update(repoUrl).digest("hex").slice(0, 16);
		this.cacheDir = path.join(os.tmpdir(), "cakemcp", repoHash);
		this.cacheExpiryMs = cacheExpirySeconds * 1000;
		this.auth = buildGitAuth(repoUrl, registryKey);
	}

	private readonly cacheExpiryMs: number;

	/**
	 *
	 */
	async getRootPath(): Promise<string> {
		await mkdir(path.dirname(this.cacheDir), { recursive: true });

		const hasLocalCopy = existsSync(path.join(this.cacheDir, ".git"));
		const cacheExpired = Date.now() - this.lastRefreshAt >= this.cacheExpiryMs;

		if(!hasLocalCopy) {
			this.logger.info("Cloning git registry", { provider: "git" });
			await this.clone();
			this.lastRefreshAt = Date.now();
			this.currentRevision = await this.readHeadRevision();
			return resolveRegistryRoot(this.cacheDir, this.registryDir);
		}

		if(cacheExpired) {
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

		if(!existsSync(this.cacheDir)) {
			throw new RegistryUnavailableError("Git registry cache is unavailable");
		}

		if(!this.currentRevision) {
			this.currentRevision = await this.readHeadRevision();
		}

		return resolveRegistryRoot(this.cacheDir, this.registryDir);
	}

	async getFileRevision(_filePath: string): Promise<string> {
		await this.getRootPath();
		if(!this.currentRevision) {
			this.currentRevision = await this.readHeadRevision();
		}

		return this.currentRevision;
	}

	private async clone(): Promise<void> {
		try {
			await rm(this.cacheDir, { recursive: true, force: true });
			await this.runGit(["clone", "--depth", "1", this.repoUrl, this.cacheDir]);
		} catch (error) {
			throw new RegistryUnavailableError(
				`Failed to clone registry repository from ${sanitizeRepoUrl(this.repoUrl)}`,
				buildGitErrorDetails(error, this.auth.mode),
			);
		}
	}

	/**
	 *
	 */
	private async refresh(): Promise<void> {
		try {
			await this.runGit(["fetch", "--depth", "1", "origin"], { cwd: this.cacheDir });
			const branchRef = (await this.runGit(["symbolic-ref", "refs/remotes/origin/HEAD"], { cwd: this.cacheDir }))
				.trim()
				.replace("refs/remotes/origin/", "");
			const branch = branchRef || "main";
			await this.runGit(["reset", "--hard", `origin/${branch}`], { cwd: this.cacheDir });
		} catch (error) {
			throw new GitRefreshFailedError(
				`Failed to refresh git registry from ${sanitizeRepoUrl(this.repoUrl)}`,
				buildGitErrorDetails(error, this.auth.mode),
			);
		}
	}

	private async readHeadRevision(): Promise<string> {
		const revision = await this.runGit(["rev-parse", "HEAD"], { cwd: this.cacheDir });
		return revision.trim();
	}

	/**
	 *
	 */
	private async runGit(args: string[], options: GitRunOptions = {}): Promise<string> {
		const env = {
			...process.env,
			GIT_TERMINAL_PROMPT: "0",
		};
		const command = buildGitCommand(args, this.auth.header);

		const proc = Bun.spawn(command, {
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

		if(code !== 0) {
			throw new GitCommandError(args, code, stdout, stderr);
		}

		return stdout;
	}
}

class GitCommandError extends Error {
	constructor(
		public readonly args: string[],
		public readonly exitCode: number,
		public readonly stdout: string,
		public readonly stderr: string,
	) {
		super(`git ${args.join(" ")} failed with exit code ${exitCode}: ${stderr || stdout}`);
		this.name = "GitCommandError";
	}
}

/**
 * Builds the git HTTP auth strategy for the registry URL and optional registry key.
 */
export function buildGitAuth(repoUrl: string, registryKey: string | undefined): GitAuth {
	if(!registryKey || !repoUrl.startsWith("https://")) {
		return { mode: "none" };
	}

	if(registryKey.includes(":")) {
		const encoded = Buffer.from(registryKey).toString("base64");
		return {
			header: `Authorization: Basic ${encoded}`,
			mode: "basic",
		};
	}

	if(isBitbucketUrl(repoUrl)) {
		const encoded = Buffer.from(`x-token-auth:${registryKey}`).toString("base64");
		return {
			header: `Authorization: Basic ${encoded}`,
			mode: "bitbucket-token",
		};
	}

	return {
		header: `Authorization: Bearer ${registryKey}`,
		mode: "bearer",
	};
}

export function buildGitCommand(args: string[], authHeader?: string): string[] {
	return authHeader ? ["git", "-c", `http.extraHeader=${authHeader}`, ...args] : ["git", ...args];
}

function isBitbucketUrl(repoUrl: string): boolean {
	try {
		const host = new URL(repoUrl).hostname.toLowerCase();
		return host === "bitbucket.org" || host.endsWith(".bitbucket.org");
	} catch{
		return false;
	}
}

function sanitizeRepoUrl(repoUrl: string): string {
	try {
		const url = new URL(repoUrl);
		url.username = "";
		url.password = "";
		return url.toString();
	} catch{
		return repoUrl.replace(/\/\/[^/@]+@/, "//");
	}
}

/**
 * Converts a git command failure into structured, sanitized error details for logs and errors.
 */
function buildGitErrorDetails(error: unknown, authMode: GitAuth["mode"]): Record<string, unknown> {
	if(error instanceof GitCommandError) {
		return {
			auth_mode: authMode,
			git_command: `git ${error.args.join(" ")}`,
			exit_code: error.exitCode,
			stderr: sanitizeGitOutput(error.stderr),
			stdout: sanitizeGitOutput(error.stdout),
			hint: buildGitHint(authMode, error.stderr || error.stdout),
		};
	}

	return {
		auth_mode: authMode,
		error: asErrorMessage(error),
	};
}

function sanitizeGitOutput(output: string): string | undefined {
	const trimmed = output.trim();
	if(!trimmed) {
		return undefined;
	}

	return trimmed.replace(/https:\/\/([^/\s:@]+):([^@\s]+)@/g, "https://$1:***@");
}

/**
 * Derives a likely remediation hint from git auth mode and command output.
 */
function buildGitHint(authMode: GitAuth["mode"], output: string): string | undefined {
	const lower = output.toLowerCase();

	if(authMode === "bitbucket-token" && (lower.includes("authentication failed") || lower.includes("access denied"))) {
		return "Bitbucket token auth uses Basic auth with username 'x-token-auth'. Verify the token has repository read access.";
	}

	if(lower.includes("repository not found")) {
		return "Verify the repository URL and confirm the token can access that repository.";
	}

	if(lower.includes("could not read username") || lower.includes("authentication failed")) {
		return "Git rejected the HTTP credentials. Verify the token value and authentication mode.";
	}

	return undefined;
}

function asErrorMessage(error: unknown): string {
	if(error instanceof Error) {
		return error.message;
	}

	return String(error);
}
