import path from "node:path";
import os from "node:os";
import { mkdtemp, writeFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

import { loadConfig } from "../src/config";
import { InvalidEnvConfigError } from "../src/errors";

describe("loadConfig", () => {
  test("loads REGISTRY_KEY from REGISTRY_KEY_FILE when inline key is absent", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cakemcp-config-test-"));
    const keyFile = path.join(root, "registry-key.txt");
    await writeFile(keyFile, "secret-token\n", "utf8");

    const config = loadConfig({
      CONTEXT_REGISTRY: "https://bitbucket.org/acme/private-registry.git",
      REGISTRY_KEY_FILE: keyFile,
    });

    expect(config.registryKey).toBe("secret-token");
    expect(config.registryDir).toBe("contexts");
  });

  test("throws a config error when REGISTRY_KEY_FILE is empty", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cakemcp-config-test-"));
    const keyFile = path.join(root, "registry-key.txt");
    await writeFile(keyFile, "\n", "utf8");

    expect(() =>
      loadConfig({
        CONTEXT_REGISTRY: "https://bitbucket.org/acme/private-registry.git",
        REGISTRY_KEY_FILE: keyFile,
      }),
    ).toThrow(InvalidEnvConfigError);
  });

  test("uses REGISTRY_DIR when it is provided", () => {
    const config = loadConfig({
      CONTEXT_REGISTRY: "/tmp/context-registry",
      REGISTRY_DIR: "registry-data",
    });

    expect(config.registryDir).toBe("registry-data");
  });
});
