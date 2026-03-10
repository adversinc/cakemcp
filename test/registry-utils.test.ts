import path from "node:path";
import os from "node:os";
import { mkdtemp, mkdir } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

import { resolveRegistryRoot } from "../src/utils/registry";

describe("resolveRegistryRoot", () => {
  test("uses the root directory when registry folders are top-level", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cakemcp-registry-root-"));
    await mkdir(path.join(root, "projects"), { recursive: true });
    await mkdir(path.join(root, "layers"), { recursive: true });

    expect(resolveRegistryRoot(root, ".")).toBe(root);
  });

  test("detects the configured nested registry directory as the registry root", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cakemcp-registry-root-"));
    await mkdir(path.join(root, "contexts", "projects"), { recursive: true });
    await mkdir(path.join(root, "contexts", "layers"), { recursive: true });

    expect(resolveRegistryRoot(root, "contexts")).toBe(path.join(root, "contexts"));
  });
});
