import { parse as parseYaml } from "yaml";

import { ManifestParseError, ProjectNotFoundError } from "../errors";
import type { RegistryRepository, RequestCacheStats } from "../registry/repository";
import type { LayerType, ProjectManifest } from "../types";

const LAYER_TYPES: LayerType[] = ["global", "language", "framework", "project"];

export type LoadedManifest = {
  manifest: ProjectManifest;
  manifestPath: string;
};

export class ProjectManifestLoader {
  constructor(private readonly repository: RegistryRepository) {}

  async load(projectId: string): Promise<ProjectManifest> {
    const loaded = await this.loadWithMeta(projectId);
    return loaded.manifest;
  }

  async loadWithMeta(projectId: string, cacheStats?: RequestCacheStats): Promise<LoadedManifest> {
    const file = await this.repository.readProjectManifestFile(projectId, cacheStats);

    if (!file) {
      throw new ProjectNotFoundError(projectId);
    }

    let raw: unknown;
    try {
      raw = parseYaml(file.content);
    } catch (error) {
      throw new ManifestParseError(projectId, "YAML parse error", error);
    }

    if (!raw || typeof raw !== "object") {
      throw new ManifestParseError(projectId, "Manifest must be an object");
    }

    const record = raw as Record<string, unknown>;
    const id = asString(record.id, "id", projectId);
    const name = asString(record.name, "name", projectId);
    const layers = parseLayers(record.layers, projectId);

    return {
      manifest: {
        id,
        name,
        layers,
      },
      manifestPath: file.relativePath.replace(/\\/g, "/"),
    };
  }
}

function asString(value: unknown, field: string, projectId: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ManifestParseError(projectId, `Field '${field}' is required and must be a non-empty string`);
  }

  return value;
}

function parseLayers(value: unknown, projectId: string): Partial<Record<LayerType, string[]>> {
  if (value == null) {
    return {};
  }

  if (typeof value !== "object") {
    throw new ManifestParseError(projectId, "Field 'layers' must be an object");
  }

  const layersObj = value as Record<string, unknown>;
  const result: Partial<Record<LayerType, string[]>> = {};

  for (const type of LAYER_TYPES) {
    const layerEntries = layersObj[type];
    if (layerEntries == null) {
      continue;
    }

    if (!Array.isArray(layerEntries)) {
      throw new ManifestParseError(projectId, `layers.${type} must be an array of strings`);
    }

    const parsed = layerEntries.map((item) => {
      if (typeof item !== "string" || item.trim() === "") {
        throw new ManifestParseError(projectId, `layers.${type} must contain only non-empty strings`);
      }

      return item;
    });

    result[type] = parsed;
  }

  return result;
}
