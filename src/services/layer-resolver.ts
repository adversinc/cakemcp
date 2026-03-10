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
const BASE_PRIORITY: Record<LayerType, number> = {
  global: 100,
  language: 200,
  framework: 300,
  project: 400,
};

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
      project: 0,
    };

    for (const type of RESOLUTION_ORDER) {
      const names = manifest.layers[type] ?? [];

      for (const name of names) {
        const layer = await this.repository.readLayer(type, name, cacheStats);
        if (!layer) {
          const warning = `Layer not found in manifest: ${type}/${name}`;
          warnings.push(warning);
          this.logger.warn("Missing layer from manifest", { type, name, project_id: projectId });
          continue;
        }

        const unique = markLayerSeen(type, name, seenLayers);

        if (unique) {
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
    const autoLayer = await this.repository.readLayer("project", autoLayerName, cacheStats);

    if (autoLayer) {
      const unique = markLayerSeen("project", autoLayerName, seenLayers);
      if (unique) {
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

    const mergedContent = resolvedLayers
      .map((layer) => `# Layer: ${layer.type}/${layer.name}\n\n${layer.content.trim()}\n`)
      .join("\n")
      .trim();

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

function markLayerSeen(type: LayerType, name: string, seenLayers: Set<string>): boolean {
  const key = `${type}/${name}`;
  if (seenLayers.has(key)) {
    return false;
  }

  seenLayers.add(key);
  return true;
}
