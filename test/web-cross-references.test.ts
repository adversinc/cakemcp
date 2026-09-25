import { expect, test } from "bun:test";
import { buildCrossReferences } from "../src/web/cross-references";
import type { LayerSummary } from "../src/web/data";

test("recognizes wrapped Graphify instructions without connecting separate Markdown blocks", () => {
	const instruction = 'If you are building or rebuilding Graphify graph for this project, call "resolve_context" with\nproject_id=graphify-build.';
	const content = `## Graph build\n\n${instruction}\n\nresolve_context\n\nproject_id=unrelated\n\n- resolve_context\n- project_id=another-item\n\nresolve_context\n## Section\nproject_id=another-section`;
	const result = buildCrossReferences([{ type: "global", name: "graphify", content, usedBy: ["app"], revision: "1" }], [{ id: "graphify-build", name: "graphify-build", layers: [], issues: 0 }]);
	expect(result).toEqual([{ sourceProjectIds: ["app"], layer: "global/graphify", targetProjectId: "graphify-build", targetExists: true, line: 3, text: instruction }]);
});

test("groups conditional calls across layer users with source lines and target availability", () => {
	const layer: LayerSummary = { type: "project", name: "shared", revision: "1", usedBy: ["app", "other"], content: [
		"# Instructions",
		'If you are building or rebuilding Graphify graph for this project, call "resolve_context" with project_id=graphify-build.',
		"",
		'Call resolve_context with project_id = "missing" or project_id=\'other\'.',
		"",
		'Call `resolve_context` with `project_id=app` and project_id=app.',
		"",
		"project_id=ignored",
		"",
		"resolve_context without an assignment",
		"resolve_context project_id=${dynamic}",
		"resolve_context project_id=invalid/path",
		"resolve_context project_id=",
		"",
		"next-line",
	].join("\r\n") };
	const projects = ["app", "other", "graphify-build"].map(id => ({ id, name: id, layers: [], issues: 0 }));
	const result = buildCrossReferences([layer], projects);
	expect(result).toHaveLength(4);
	expect(result.map(item => [item.targetProjectId, item.line, item.targetExists])).toEqual([
		["graphify-build", 2, true], ["missing", 4, false], ["other", 4, true], ["app", 6, true],
	]);
	expect(result[0]?.text).toBe(layer.content.split("\r\n")[1]);
	expect(result.every(item => JSON.stringify(item.sourceProjectIds) === JSON.stringify(["app", "other"]))).toBe(true);
	expect(result[0]?.layer).toBe("project/shared");
	expect(buildCrossReferences([{ ...layer, usedBy: [] }], projects).every(item => item.sourceProjectIds.length === 0)).toBe(true);
});
