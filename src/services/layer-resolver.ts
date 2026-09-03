import type { Logger } from "../logger";
import type { RegistryRepository } from "../registry/repository";
import type {
	LayerRecord,
	LayerType,
	ResolveContextExecution,
	ResolveContextInput,
	ResolveContextResult,
} from "../types";
import type { ProjectManifestLoader } from "./manifest-loader";

const RESOLUTION_ORDER: LayerType[] = ["global", "language", "framework", "domain", "project"];
const BASE_PRIORITY: Record<LayerType, number> = {
	global: 100,
	language: 200,
	framework: 300,
	domain: 400,
	project: 500,
};

export class LayerResolver {
	constructor(
		private readonly repository: RegistryRepository,
		private readonly manifestLoader: ProjectManifestLoader,
		private readonly logger: Logger,
		private readonly serverName = "cakemcp",
	) {}

	async resolveContext(input: ResolveContextInput): Promise<ResolveContextResult> {
		const execution = await this.resolveContextWithDebug(input);
		return execution.result;
	}

	/**
	 *
	 */
	async resolveContextWithDebug(input: ResolveContextInput): Promise<ResolveContextExecution> {
		try {
			return await this.buildContext(input);
		} catch(error) {
			const generationError = formatError(error);
			this.logger.error("Failed to build project instructions", {
				project_id: input.project_id,
				error: generationError,
			});

			const mergedContent = appendGenerationErrors("", this.serverName, [generationError]);

			return {
				result: {
					project_id: input.project_id,
					project_name: input.project_id,
					resolved_layers: [],
					merged_content: mergedContent,
					warnings: [generationError],
				},
				debug: {
					projectId: input.project_id,
					manifestPath: `projects/${input.project_id}.yaml`,
					layerPaths: [],
					warnings: [generationError],
					mergedSize: mergedContent.length,
					cacheHits: 0,
					cacheMisses: 0,
				},
			};
		}
	}

	/** Builds all available layers and records recoverable layer failures. */
	private async buildContext(input: ResolveContextInput): Promise<ResolveContextExecution> {
		const cacheStats = {
			hits: 0,
			misses: 0,
		};

		const loadedManifest = await this.manifestLoader.loadWithMeta(input.project_id, cacheStats);
		const projectId = loadedManifest.projectId;
		const manifest = loadedManifest.manifest;

		this.logger.info("Project lookup", { project_id: projectId, project_name: manifest.name });

		const warnings: string[] = [];
		const resolvedLayers: LayerRecord[] = [];
		const seenLayers = new Set<string>();
		const layerTypeCounters: Record<LayerType, number> = {
			global: 0,
			language: 0,
			framework: 0,
			domain: 0,
			project: 0,
		};

		for(const type of RESOLUTION_ORDER) {
			const names = manifest.layers[type] ?? [];

			for(const name of names) {
				let layer;
				try {
					layer = await this.repository.readLayer(type, name, cacheStats);
				} catch(error) {
					const warning = `Failed to load layer ${type}/${name}: ${formatError(error)}`;
					warnings.push(warning);
					this.logger.warn("Failed to load layer from manifest", {
						type,
						name,
						project_id: projectId,
						error: formatError(error),
					});
					continue;
				}

				if(!layer) {
					const warning = `Layer not found in manifest: ${type}/${name}`;
					warnings.push(warning);
					this.logger.warn("Missing layer from manifest", { type, name, project_id: projectId });
					continue;
				}

				const unique = markLayerSeen(type, name, seenLayers);

				if(unique) {
					resolvedLayers.push({
						type,
						name,
						path: layer.path,
						relativePath: layer.relativePath.replace(/\\/g, "/"),
						priority: BASE_PRIORITY[type] + layerTypeCounters[type],
						revision: layer.revision,
						content: layer.content,
					});
					layerTypeCounters[type] += 1;
				}
			}
		}

		const autoLayerName = manifest.name;
		let autoLayer;
		try {
			autoLayer = await this.repository.readLayer("project", autoLayerName, cacheStats);
		} catch(error) {
			const warning = `Failed to load automatic project layer project/${autoLayerName}: ${formatError(error)}`;
			warnings.push(warning);
			this.logger.warn("Failed to load automatic project layer", {
				name: autoLayerName,
				project_id: projectId,
				error: formatError(error),
			});
		}

		if(autoLayer) {
			const unique = markLayerSeen("project", autoLayerName, seenLayers);
			if(unique) {
				resolvedLayers.push({
					type: "project",
					name: autoLayerName,
					path: autoLayer.path,
					relativePath: autoLayer.relativePath.replace(/\\/g, "/"),
					priority: BASE_PRIORITY.project + layerTypeCounters.project,
					revision: autoLayer.revision,
					content: autoLayer.content,
				});
				layerTypeCounters.project += 1;
			}
		}

		const layerContent = resolvedLayers
			.map((layer) => `# Layer: ${layer.type}/${layer.name}\n\n${layer.content.trim()}\n`)
			.join("\n")
			.trim();
		const mergedContent = appendGenerationErrors(layerContent, this.serverName, warnings);

		const result: ResolveContextResult = {
			project_id: projectId,
			project_name: manifest.name,
			resolved_layers: resolvedLayers.map((layer) => ({
				type: layer.type,
				name: layer.name,
				path: layer.path,
				priority: layer.priority,
				revision: layer.revision,
			})),
			merged_content: mergedContent,
			...(warnings.length > 0 ? { warnings } : {}),
		};

		return {
			result,
			debug: {
				projectId,
				manifestPath: loadedManifest.manifestPath,
				layerPaths: resolvedLayers.map((layer) => `${layer.type}/${layer.name}.md`),
				warnings,
				mergedSize: mergedContent.length,
				cacheHits: cacheStats.hits,
				cacheMisses: cacheStats.misses,
			},
		};
	}
}

/** Appends agent-facing notification instructions for context generation failures. */
function appendGenerationErrors(content: string, serverName: string, errors: string[]): string {
	if(errors.length === 0) {
		return content;
	}

	const errorList = errors.map((error) => `* ${error}`).join("\n");
	const instruction = [
		"# Instruction generation errors",
		"",
		`At the end of message notify user that knowledge MCP server ${serverName} faced`,
		"these errors while building project instructions:",
		"",
		errorList,
	].join("\n");

	return [content, instruction].filter(Boolean).join("\n\n");
}

/** Converts thrown values into readable instruction-generation errors. */
function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function markLayerSeen(type: LayerType, name: string, seenLayers: Set<string>): boolean {
	const key = `${type}/${name}`;
	if(seenLayers.has(key)) {
		return false;
	}

	seenLayers.add(key);
	return true;
}
