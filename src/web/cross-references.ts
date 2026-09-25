import type { LayerSummary, ProjectSummary } from "./data";

export type CrossReference = { sourceProjectIds: string[]; layer: string; targetProjectId: string; targetExists: boolean; line: number; text: string };

/** Indexes literal context calls within Markdown text blocks without interpreting or executing Markdown. */
export function buildCrossReferences(layers: LayerSummary[], projects: ProjectSummary[]): CrossReference[] {
	const projectIds = new Set(projects.map(project => project.id));
	const references: CrossReference[] = [];
	for(const layer of layers) {
		for(const { line, text } of markdownBlocks(layer.content)) {
			if(!/\bresolve_context\b/.test(text)) continue;
			const targets = new Set<string>();
			const assignments = /\bproject_id\b["'`]?\s*=\s*(?:"([a-zA-Z0-9._-]+)"|'([a-zA-Z0-9._-]+)'|`([a-zA-Z0-9._-]+)`|([a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*)(?=$|[\s,.;:)\]}`]))/g;
			for(const match of text.matchAll(assignments)) {
				const target = match[1] ?? match[2] ?? match[3] ?? match[4];
				if(target) targets.add(target);
			}
			for(const targetProjectId of targets) {
				references.push({ sourceProjectIds: [...new Set(layer.usedBy)].sort(), layer: `${layer.type}/${layer.name}`, targetProjectId, targetExists: projectIds.has(targetProjectId), line, text });
			}
		}
	}
	return references.sort((a, b) => a.layer.localeCompare(b.layer) || a.line - b.line || a.targetProjectId.localeCompare(b.targetProjectId));
}

/** Keeps wrapped instructions together without crossing paragraphs or Markdown block boundaries. */
function markdownBlocks(content: string): { line: number; text: string }[] {
	const blocks: { line: number; text: string }[] = [];
	let lines: string[] = [];
	let start = 1;
	const flush = () => {
		if(lines.length) blocks.push({ line: start, text: lines.join("\n") });
		lines = [];
	};
	for(const [index, line] of content.split(/\r?\n/).entries()) {
		if(!line.trim() || /^\s*(?:#{1,6}\s|`{3,}|~{3,})/.test(line)) { flush(); continue; }
		if(/^\s*(?:[-+*]|\d+[.)])\s/.test(line)) flush();
		if(!lines.length) start = index + 1;
		lines.push(line);
	}
	flush();
	return blocks;
}
