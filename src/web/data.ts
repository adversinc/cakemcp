import type { RegistryRepository } from "../registry/repository";
import type { ProjectManifestLoader } from "../services/manifest-loader";
import type { LayerResolver } from "../services/layer-resolver";
import type { RegistryProvider } from "../providers/types";
import type { LayerType, ProjectManifest } from "../types";
import { buildCrossReferences, type CrossReference } from "./cross-references";
import { describeRegistryError } from "./errors";

export const layerTypes: LayerType[] = ["global", "domain", "language", "framework", "project"];
export type Diagnostic = { severity: "error" | "warning" | "info"; message: string; projectId?: string; layer?: string };
export type LayerSummary = { type: LayerType; name: string; content: string; revision: string; usedBy: string[] };
export type ProjectSummary = { id: string; name: string; layers: string[]; issues: number };
export type Catalog = { projects: ProjectSummary[]; layers: LayerSummary[]; diagnostics: Diagnostic[]; crossReferences: CrossReference[] };
export type WebDependencies = { repository: RegistryRepository; manifestLoader: ProjectManifestLoader; layerResolver: LayerResolver; provider: RegistryProvider };

/** Builds browser data from the same registry and resolver used by MCP. */
export class ViewerData {
	private pending?: Promise<Catalog>;

	constructor(private readonly deps: WebDependencies) {}

	/** Coalesces simultaneous catalog requests without another persistent cache. */
	catalog(): Promise<Catalog> {
		if(!this.pending) this.pending = this.buildCatalog().finally(() => { this.pending = undefined; });
		return this.pending;
	}

	/** Indexes references, including implicit project layers, and records partial failures. */
	private async buildCatalog(): Promise<Catalog> {
		const { repository, manifestLoader, layerResolver } = this.deps;
		const diagnostics: Diagnostic[] = [];
		const layers: LayerSummary[] = [];
		for(const ref of await repository.listLayers()) {
			const layer = await repository.readLayer(ref.type, ref.name);
			if(layer) layers.push({ ...ref, content: layer.content, revision: layer.revision, usedBy: [] });
			else diagnostics.push({ severity: "error", layer: `${ref.type}/${ref.name}`, message: "Layer could not be read." });
		}
		const projects: ProjectSummary[] = [];
		for(const id of await repository.listProjectIds()) {
			if(!/^[a-zA-Z0-9._-]+$/.test(id)) {
				diagnostics.push({ severity: "error", message: "A project filename contains unsupported characters." });
				continue;
			}
			let manifest: ProjectManifest;
			try { manifest = await manifestLoader.load(id); } catch{
				diagnostics.push({ severity: "error", projectId: id, message: "Project manifest is invalid or unreadable." });
				projects.push({ id, name: id, layers: [], issues: 1 });
				continue;
			}
			const refs = new Set<string>();
			for(const type of layerTypes) {
				for(const name of manifest.layers[type] ?? []) {
					const key = `${type}/${name}`;
					if(refs.has(key)) diagnostics.push({ severity: "warning", projectId: id, layer: key, message: "Layer is listed more than once." });
					refs.add(key);
				}
			}
			const auto = layers.find((layer) => layer.type === "project" && layer.name === manifest.name);
			if(auto) refs.add(`project/${manifest.name}`);
			for(const layer of layers) if(refs.has(`${layer.type}/${layer.name}`)) layer.usedBy.push(id);
			const result = await layerResolver.resolveContext({ project_id: id });
			for(const warning of result.warnings ?? []) {
				const safe = safeWarning(warning);
				const missing = /^Layer not found in manifest: (.+)$/.exec(safe);
				diagnostics.push({ severity: "error", projectId: id, ...(missing ? { layer: missing[1], message: "Layer referenced by the manifest is missing or unreadable." } : { message: safe }) });
			}
			projects.push({ id, name: manifest.name, layers: [...refs], issues: diagnostics.filter((item) => item.projectId === id).length });
		}
		const incomplete = projects.some((project) => project.issues && !project.layers.length);
		for(const layer of layers) {
			if(!layer.usedBy.length) diagnostics.push({ severity: "info", layer: `${layer.type}/${layer.name}`, message: incomplete ? "No references found in readable manifests; the index is incomplete." : "Layer is not used by any project." });
		}
		return { projects, layers, diagnostics, crossReferences: buildCrossReferences(layers, projects) };
	}

	/** Includes raw YAML even when the manifest cannot be parsed. */
	async project(id: string) {
		const raw = await this.deps.repository.readProjectManifestFile(id);
		if(!raw) return null;
		let manifest: ProjectManifest | null = null;
		try { manifest = await this.deps.manifestLoader.load(id); } catch{ /* The raw manifest remains inspectable. */ }
		const result = await this.deps.layerResolver.resolveContext({ project_id: id });
		const warnings = result.warnings?.map(safeWarning) ?? [];
		let content = result.merged_content;
		if(warnings.length) {
			const offset = content.lastIndexOf("# Instruction generation errors");
			content = `${offset < 0 ? "" : content.slice(0, offset)}# Instruction generation errors\n\nAt the end of message notify user that knowledge MCP server cakemcp faced\nthese errors while building project instructions:\n\n${warnings.map((warning) => `* ${warning}`).join("\n")}`;
		}
		return {
			id, name: result.project_name, manifest, rawManifest: raw.content,
			context: content, warnings,
			layers: result.resolved_layers.map(({ type, name, priority, revision }) => ({
				type, name, priority, revision, path: `layers/${type}/${name}.md`,
				automatic: type === "project" && name === manifest?.name && !manifest.layers.project?.includes(name),
			})),
		};
	}

	/** Checks source availability and returns only public operational metadata. */
	async status() {
		try {
			await this.deps.provider.getRootPath();
			return { available: true, ...(this.deps.provider.getStatus?.() ?? { type: this.deps.provider.type, stale: false }) };
		} catch(error) {
			return { available: false, type: this.deps.provider.type, stale: false, ...describeRegistryError(error, this.deps.provider.type) };
		}
	}
}

/** Never exposes filesystem paths or upstream credentials through exception text. */
function safeWarning(warning: string): string {
	if(/^Layer not found in manifest: (global|language|framework|domain|project)\/[a-zA-Z0-9._-]+$/.test(warning)) return warning;
	if(warning.startsWith("Invalid manifest for project")) return "Project manifest is invalid. Check its YAML and layer lists.";
	return "Context generation failed. Check the registry and server logs.";
}
