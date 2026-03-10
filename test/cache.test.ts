import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

import { createLogger } from "../src/logger";
import { LocalRegistryProvider } from "../src/providers/local-registry-provider";
import { RegistryRepository } from "../src/registry/repository";

describe("RegistryRepository cache", () => {
  test("returns cached file content within TTL and refreshes after expiry", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "advers-mcp-cache-test-"));
    await mkdir(path.join(root, "layers", "global"), { recursive: true });
    await mkdir(path.join(root, "projects"), { recursive: true });

    const layerPath = path.join(root, "layers", "global", "formatting.md");
    await writeFile(layerPath, "v1", "utf8");

    const logger = createLogger("test-cache");
    const provider = new LocalRegistryProvider(root, ".", logger);
    const repository = new RegistryRepository(provider, 1, logger);

    const first = await repository.readLayer("global", "formatting");
    expect(first?.content).toBe("v1");

    await writeFile(layerPath, "v2", "utf8");

    const second = await repository.readLayer("global", "formatting");
    expect(second?.content).toBe("v1");

    await Bun.sleep(1100);

    const third = await repository.readLayer("global", "formatting");
    expect(third?.content).toBe("v2");
  });
});
