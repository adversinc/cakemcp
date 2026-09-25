/** Registry categories in the same application order as the context resolver. */
export const layerCategories = [
	{ id: "global", name: "Global", description: "Shared agreements and engineering standards across all projects. These instructions form the foundation of its context.", path: "layers/global/*.md" },
	{ id: "domain", name: "Domain", description: "Business rules and terminology shared by projects in the same product or business area. Domain layers are explicitly selected in the manifest.", path: "layers/domain/*.md" },
	{ id: "language", name: "Language", description: "Language-specific conventions, formatting rules, and patterns for the languages used by the project.", path: "layers/language/*.md" },
	{ id: "framework", name: "Framework", description: "Instructions for frameworks, libraries, and runtimes, building on the language-level conventions.", path: "layers/framework/*.md" },
	{ id: "project", name: "Project", description: "Project-specific architecture, workflows, and constraints. Listed project layers are applied after the shared categories.", path: "layers/project/*.md" },
] as const;
