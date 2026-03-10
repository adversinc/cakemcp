export type LayerType = "global" | "language" | "framework" | "project";

export type LayerRecord = {
  type: LayerType;
  name: string;
  path: string;
  relativePath: string;
  priority: number;
  revision: string;
  content: string;
};

export type ResolvedLayer = {
  type: LayerType;
  name: string;
  path: string;
  priority: number;
  revision: string;
};

export type ProjectManifest = {
  name: string;
  layers: Partial<Record<LayerType, string[]>>;
};

export type ResolveContextInput = {
  project_id: string;
  task_type?: string;
  path?: string;
  changed_files?: string[];
};

export type ResolveContextResult = {
  project_id: string;
  project_name: string;
  resolved_layers: ResolvedLayer[];
  merged_content: string;
  warnings?: string[];
};

export type ResolveContextDebugInfo = {
  projectId: string;
  manifestPath: string;
  layerPaths: string[];
  warnings: string[];
  mergedSize: number;
  cacheHits: number;
  cacheMisses: number;
};

export type ResolveContextExecution = {
  result: ResolveContextResult;
  debug: ResolveContextDebugInfo;
};
