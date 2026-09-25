import { reactive, shallowRef } from "vue";

export type Diagnostic = { severity: "error" | "warning" | "info"; message: string; projectId?: string; layer?: string };
export type Layer = { type: string; name: string; content: string; revision: string; usedBy: string[] };
export type Project = { id: string; name: string; layers: string[]; issues: number };
export type CrossReference = { sourceProjectIds: string[]; layer: string; targetProjectId: string; targetExists: boolean; line: number; text: string };
export type Catalog = { projects: Project[]; layers: Layer[]; diagnostics: Diagnostic[]; crossReferences: CrossReference[] };
export type ProjectDetail = { id: string; name: string; rawManifest: string; context: string; warnings: string[]; layers: { type: string; name: string; priority: number; revision: string; automatic: boolean }[] };
export type Session = { mode: "public" | "sso"; viewer: { name: string; providerId: string } | null; providers: { id: string; name: string }[]; babelshark: { projectId: number; accessCode: string } | null };
export const session = shallowRef<Session>();
export const catalog = shallowRef<Catalog>();
export const state = reactive({ loading: false, error: "" });

/** Reads same-origin data and invalidates the visible identity on session expiry. */
export async function api<T>(path: string): Promise<T> {
	const response = await fetch(`/api${path}`, { credentials: "same-origin" });
	if(response.status === 401) {
		catalog.value = undefined;
		if(session.value) session.value = { ...session.value, viewer: null };
		throw new Error("Your session has expired. Please sign in again.");
	}
	const data = await response.json();
	if(!response.ok) throw new Error(data.error || "The request could not be completed.");
	return data;
}

let pending: Promise<void> | undefined;

/** Loads the catalog once per refresh and shares it across pages. */
export function loadCatalog(force = false): Promise<void> {
	if(pending) return pending;
	if(catalog.value && !force) return Promise.resolve();
	state.loading = true;
	state.error = "";
	pending = api<Catalog>("/catalog").then((value) => { catalog.value = value; }).catch((error) => {
		state.error = error.message;
	}).finally(() => { state.loading = false; pending = undefined; });
	return pending;
}
