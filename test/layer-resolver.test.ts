import path from "node:path";
import { describe, expect, test } from "bun:test";

import { createLogger } from "../src/logger";
import { LocalRegistryProvider } from "../src/providers/local-registry-provider";
import { RegistryRepository } from "../src/registry/repository";
import { LayerResolver } from "../src/services/layer-resolver";
import { ProjectManifestLoader } from "../src/services/manifest-loader";
import { ManifestParseError } from "../src/errors";

function buildResolver(registryPath: string) {
	const logger = createLogger("test");
	const provider = new LocalRegistryProvider(registryPath, ".", logger);
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
		expect(result.resolved_layers.length).toBe(8);
		expect(result.merged_content).toContain("# Layer: global/formatting");
		expect(result.merged_content).toContain("# Layer: domain/commerce");
		expect(result.merged_content).toContain("# Layer: project/billing-service");
		expect(result.warnings).toEqual(["Layer not found in manifest: project/missing-project-layer"]);
		expect(result.merged_content).toContain("# Instruction generation errors");
		expect(result.merged_content).toContain(
			"At the end of message notify user that knowledge MCP server cakemcp faced",
		);
		expect(result.merged_content).toContain("* Layer not found in manifest: project/missing-project-layer");
		expect(result.resolved_layers.map((layer) => layer.priority)).toEqual([
			100,
			101,
			200,
			300,
			301,
			400,
			500,
			501,
		]);
		for(const layer of result.resolved_layers) {
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
			"domain/commerce",
			"project/payment-rules",
			"project/billing-service",
		]);
	});

	test("missing project returns an instruction generation error", async () => {
		const { resolver } = buildResolver(fixtureRegistry);

		const result = await resolver.resolveContext({ project_id: "unknown-project" });

		expect(result.resolved_layers).toEqual([]);
		expect(result.warnings).toEqual(["Project not found: unknown-project"]);
		expect(result.merged_content).toContain("# Instruction generation errors");
		expect(result.merged_content).toContain("* Project not found: unknown-project");
	});

	test("reports layer read errors after the successfully loaded instructions", async () => {
		const logger = createLogger("test");
		const resolver = new LayerResolver(
			{
				readLayer: async (_type: string, name: string) => {
					if(name === "broken") {
						throw new Error("read permission denied");
					}

					if(name === "working") {
						return {
							path: "/registry/layers/global/working.md",
							relativePath: "layers/global/working.md",
							content: "Working instructions",
							revision: "1",
						};
					}

					return null;
				},
			} as never,
			{
				loadWithMeta: async () => ({
					projectId: "example",
					manifest: {
						name: "example",
						layers: { global: ["working", "broken"] },
					},
					manifestPath: "projects/example.yaml",
				}),
			} as never,
			logger,
			"advers-mcp",
		);

		const result = await resolver.resolveContext({ project_id: "example" });

		expect(result.merged_content).toStartWith("# Layer: global/working\n\nWorking instructions");
		expect(result.merged_content).toEndWith("* Failed to load layer global/broken: read permission denied");
		expect(result.merged_content).toContain(
			"At the end of message notify user that knowledge MCP server advers-mcp faced",
		);
	});

	test("invalid manifest is reported by the resolver and still fails direct parsing", async () => {
		const { manifestLoader, resolver } = buildResolver(fixtureRegistry);

		await expect(manifestLoader.load("invalid-manifest")).rejects.toBeInstanceOf(ManifestParseError);

		const result = await resolver.resolveContext({ project_id: "invalid-manifest" });
		expect(result.warnings?.[0]).toStartWith("Invalid manifest for project 'invalid-manifest':");
		expect(result.merged_content).toContain("# Instruction generation errors");
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
