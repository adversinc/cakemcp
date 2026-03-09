import path from "node:path";
import { existsSync } from "node:fs";

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
}
