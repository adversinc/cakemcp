import path from "node:path";
import { readdir, readFile } from "node:fs/promises";

import type { Logger } from "../logger";
import type { LayerType } from "../types";
import { TimedCache } from "../cache/timed-cache";
import { sanitizeName } from "../utils/registry";
import type { RegistryProvider } from "../providers/types";

export type RequestCacheStats = {
  hits: number;
  misses: number;
};

export class RegistryRepository {
  private readonly projectsCache: TimedCache<string[]>;
  private readonly fileCache = new Map<string, TimedCache<string>>();
  private readonly fileCacheTtlMs: number;

  constructor(
    private readonly provider: RegistryProvider,
    cacheExpirySeconds: number,
    private readonly logger: Logger,
  ) {
    const ttlMs = cacheExpirySeconds * 1000;
    this.projectsCache = new TimedCache<string[]>(ttlMs);
    this.fileCacheTtlMs = ttlMs;
  }

  async listProjectIds(): Promise<string[]> {
    return this.projectsCache.getOrLoad(async () => {
      const rootPath = await this.provider.getRootPath();
      const projectDir = path.join(rootPath, "projects");
      const files = await readdir(projectDir, { withFileTypes: true });
      const ids = files
        .filter((entry) => entry.isFile() && (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")))
        .map((entry) => entry.name.replace(/\.ya?ml$/, ""))
        .sort();

      this.logger.debug("Loaded project ids", { count: ids.length });
      return ids;
    });
  }

  async readProjectManifestFile(
    projectId: string,
    cacheStats?: RequestCacheStats,
  ): Promise<{ path: string; relativePath: string; content: string } | null> {
    const cleanId = sanitizeName(projectId);
    const rootPath = await this.provider.getRootPath();
    const yamlRelativePath = path.join("projects", `${cleanId}.yaml`);
    const yamlPath = path.join(rootPath, yamlRelativePath);

    const content = await this.readOptionalFile(yamlPath, cacheStats);
    if (content !== null) {
      return { path: yamlPath, relativePath: yamlRelativePath, content };
    }

    const ymlRelativePath = path.join("projects", `${cleanId}.yml`);
    const ymlPath = path.join(rootPath, ymlRelativePath);
    const ymlContent = await this.readOptionalFile(ymlPath, cacheStats);
    if (ymlContent !== null) {
      return { path: ymlPath, relativePath: ymlRelativePath, content: ymlContent };
    }

    return null;
  }

  async readLayer(
    type: LayerType,
    name: string,
    cacheStats?: RequestCacheStats,
  ): Promise<{ path: string; relativePath: string; content: string; revision: string } | null> {
    const cleanName = sanitizeName(name);
    const rootPath = await this.provider.getRootPath();
    const relativePath = path.join("layers", type, `${cleanName}.md`);
    const layerPath = path.join(rootPath, relativePath);
    const content = await this.readOptionalFile(layerPath, cacheStats);

    if (content === null) {
      return null;
    }

    let revision = "unknown";
    try {
      revision = await this.provider.getFileRevision(layerPath);
    } catch (error) {
      this.logger.warn("Failed to resolve file revision", {
        file_path: layerPath,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return {
      path: layerPath,
      relativePath,
      content,
      revision,
    };
  }

  private async readOptionalFile(filePath: string, cacheStats?: RequestCacheStats): Promise<string | null> {
    const cache = this.fileCache.get(filePath) ?? this.newFileCache(filePath);

    try {
      const { value, status } = await cache.getOrLoadWithStatus(async () => {
        this.logger.debug("Reading registry file", { file_path: filePath });
        return readFile(filePath, "utf8");
      });

      if (cacheStats) {
        if (status === "hit") {
          cacheStats.hits += 1;
        } else {
          cacheStats.misses += 1;
        }
      }

      return value;
    } catch {
      return null;
    }
  }

  private newFileCache(filePath: string): TimedCache<string> {
    const cache = new TimedCache<string>(this.fileCacheTtlMs);
    this.fileCache.set(filePath, cache);
    return cache;
  }
}
