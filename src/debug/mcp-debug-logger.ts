import path from "node:path";
import { appendFile, mkdir } from "node:fs/promises";

import type { ResolveContextDebugInfo } from "../types";

export type ResolveContextDebugLogInput = {
	requestId: string;
	time: string;
	tool: "resolve_context";
	durationMs: number;
	cache: "hit" | "miss";
	details: ResolveContextDebugInfo;
};

export class McpDebugLogger {
	constructor(private readonly outputPath: string) {}

	/**
	 *
	 */
	async writeResolveContext(entry: ResolveContextDebugLogInput): Promise<void> {
		await mkdir(path.dirname(this.outputPath), { recursive: true });

		const layersBlock = entry.details.layerPaths
			.map((layerPath) => `  ${layerPath},`)
			.join("\n");

		const block = [
			`request_id=${entry.requestId}`,
			`time=${entry.time}`,
			`tool=${entry.tool}`,
			`project_id=${entry.details.projectId}`,
			`manifest=${entry.details.manifestPath}`,
			"layers=[",
			layersBlock,
			"]",
			`warnings=${JSON.stringify(entry.details.warnings)}`,
			`merged_size=${entry.details.mergedSize}`,
			`cache=${entry.cache}`,
			`duration_ms=${entry.durationMs}`,
			"",
		].join("\n");

		await appendFile(this.outputPath, block, "utf8");
	}
}
