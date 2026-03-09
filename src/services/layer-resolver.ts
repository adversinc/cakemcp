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

const RESOLUTION_ORDER: LayerType[] = ["global", "language", "framework", "project"];

export class LayerResolver {
  constructor(
    private readonly repository: RegistryRepository,
    private readonly manifestLoader: ProjectManifestLoader,
    private readonly logger: Logger,
  ) {}

  async resolveContext(input: ResolveContextInput): Promise<ResolveContextResult> {
    const execution = await this.resolveContextWithDebug(input);
    return execution.result;
  }

  async resolveContextWithDebug(input: ResolveContextInput): Promise<ResolveContextExecution> {
    const cacheStats = {
      hits: 0,
      misses: 0,
    };

    const loadedManifest = await this.manifestLoader.loadWithMeta(input.project_id, cacheStats);
    const manifest = loadedManifest.manifest;

    this.logger.info("Project lookup", { project_id: input.project_id, project_name: manifest.name });

    const warnings: string[] = [];
    const resolvedLayers: LayerRecord[] = [];

    for (const type of RESOLUTION_ORDER) {
      const names = manifest.layers[type] ?? [];

      for (const name of names) {
        const layer = await this.repository.readLayer(type, name, cacheStats);
        if (!layer) {
          const warning = `Layer not found in manifest: ${type}/${name}`;
          warnings.push(warning);
          this.logger.warn("Missing layer from manifest", { type, name, project_id: manifest.id });
          continue;
        }

        resolvedLayers.push({
          type,
          name,
          path: layer.path,
          relativePath: layer.relativePath.replace(/\\/g, "/"),
          content: layer.content,
        });
      }
    }

    const autoLayerName = manifest.name;
    const autoLayer = await this.repository.readLayer("project", autoLayerName, cacheStats);

    if (autoLayer) {
      resolvedLayers.push({
        type: "project",
        name: autoLayerName,
        path: autoLayer.path,
        relativePath: autoLayer.relativePath.replace(/\\/g, "/"),
        content: autoLayer.content,
      });
    }

    const mergedContent = resolvedLayers
      .map((layer) => `## Layer: ${layer.type}/${layer.name}\n${layer.content.trim()}\n`)
      .join("\n")
      .trim();

    const result: ResolveContextResult = {
      project_id: manifest.id,
      project_name: manifest.name,
      resolved_layers: resolvedLayers.map((layer) => ({
        type: layer.type,
        name: layer.name,
        path: layer.path,
      })),
      merged_content: mergedContent,
      ...(warnings.length > 0 ? { warnings } : {}),
    };

    return {
      result,
      debug: {
        projectId: manifest.id,
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
