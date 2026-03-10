import path from "node:path";
import { describe, expect, test } from "bun:test";

import { createLogger } from "../src/logger";
import { LocalRegistryProvider } from "../src/providers/local-registry-provider";
import { RegistryRepository } from "../src/registry/repository";
import { LayerResolver } from "../src/services/layer-resolver";
import { ProjectManifestLoader } from "../src/services/manifest-loader";
import { ManifestParseError, ProjectNotFoundError } from "../src/errors";

function buildResolver(registryPath: string) {
  const logger = createLogger("test");
  const provider = new LocalRegistryProvider(registryPath, logger);
  const repository = new RegistryRepository(provider, 300, logger);
  const manifestLoader = new ProjectManifestLoader(repository);
  const resolver = new LayerResolver(repository, manifestLoader, logger);
  return { resolver, manifestLoader };
}

const fixtureRegistry = path.resolve(import.meta.dir, "fixtures/local-registry");

describe("LayerResolver", () => {
  test("resolve_context works in local registry mode", async () => {
    const { resolver } = buildResolver(fixtureRegistry);

    const result = await resolver.resolveContext({ project_id: "billing-service" });

    expect(result.project_id).toBe("billing-service");
    expect(result.project_name).toBe("billing-service");
    expect(result.resolved_layers.length).toBe(7);
    expect(result.merged_content).toContain("# Layer: global/formatting");
    expect(result.merged_content).toContain("# Layer: project/billing-service");
    expect(result.warnings).toEqual(["Layer not found in manifest: project/missing-project-layer"]);
    expect(result.resolved_layers.map((layer) => layer.priority)).toEqual([100, 101, 200, 300, 301, 400, 401]);
    for (const layer of result.resolved_layers) {
      expect(layer.revision).toMatch(/^\d+$/);
    }
  });

  test("applies layers in strict order and auto-adds project name layer at the end", async () => {
    const { resolver } = buildResolver(fixtureRegistry);

    const result = await resolver.resolveContext({ project_id: "billing-service" });
    const ordered = result.resolved_layers.map((layer) => `${layer.type}/${layer.name}`);

    expect(ordered).toEqual([
      "global/formatting",
      "global/engineering",
      "language/typescript",
      "framework/nextjs",
      "framework/bun",
      "project/payment-rules",
      "project/billing-service",
    ]);
  });

  test("missing project throws project_not_found", async () => {
    const { resolver } = buildResolver(fixtureRegistry);

    await expect(resolver.resolveContext({ project_id: "unknown-project" })).rejects.toBeInstanceOf(
      ProjectNotFoundError,
    );
  });

  test("invalid manifest fails parsing", async () => {
    const { manifestLoader } = buildResolver(fixtureRegistry);

    await expect(manifestLoader.load("invalid-manifest")).rejects.toBeInstanceOf(ManifestParseError);
  });

  test("name defaults to project_id when manifest name is missing", async () => {
    const { resolver } = buildResolver(fixtureRegistry);

    const result = await resolver.resolveContext({ project_id: "name-fallback" });
    const ordered = result.resolved_layers.map((layer) => `${layer.type}/${layer.name}`);

    expect(result.project_id).toBe("name-fallback");
    expect(result.project_name).toBe("name-fallback");
    expect(ordered).toEqual(["global/formatting", "project/name-fallback"]);
  });

  test("deduplicates project auto-layer when it is already listed in manifest project layers", async () => {
    const { resolver } = buildResolver(fixtureRegistry);

    const result = await resolver.resolveContext({ project_id: "dedupe-auto-layer" });
    const ordered = result.resolved_layers.map((layer) => `${layer.type}/${layer.name}`);

    expect(result.project_id).toBe("dedupe-auto-layer");
    expect(result.project_name).toBe("billing-service");
    expect(ordered).toEqual(["global/formatting", "project/billing-service"]);
  });
});
