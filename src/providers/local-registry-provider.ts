import path from "node:path";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";

import { RegistryUnavailableError } from "../errors";
import type { Logger } from "../logger";
import type { RegistryProvider } from "./types";

export class LocalRegistryProvider implements RegistryProvider {
  public readonly type = "local" as const;

  private readonly rootPath: string;

  constructor(registryPath: string, private readonly logger: Logger) {
    this.rootPath = path.resolve(registryPath);
  }

  async getRootPath(): Promise<string> {
    if (!existsSync(this.rootPath)) {
      throw new RegistryUnavailableError(`Registry path does not exist: ${this.rootPath}`);
    }

    this.logger.debug("Using local registry path", { registry_path: this.rootPath });
    return this.rootPath;
  }

  async getFileRevision(filePath: string): Promise<string> {
    const fileStat = await stat(filePath);
    return String(Math.floor(fileStat.mtimeMs / 1000));
  }
}
