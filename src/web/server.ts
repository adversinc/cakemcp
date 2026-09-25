import path from "node:path";
import { stat } from "node:fs/promises";
import type { WebConfig } from "./config";
import { WebAuth } from "./auth";
import { layerTypes, ViewerData, type WebDependencies } from "./data";
import type { LayerType } from "../types";
import { describeRegistryError } from "./errors";
import { createLogger } from "../logger";

/** Creates the isolated read-only viewer handler, also usable in integration tests. */
export function createWebHandler(config: Extract<WebConfig, { enabled: true }>, deps: WebDependencies, assets = path.resolve(import.meta.dir, "../../dist/web")) {
	const logger = createLogger("cakemcp-web");
	const auth = new WebAuth(config);
	const data = new ViewerData(deps);
	const json = (value: unknown, status = 200) => Response.json(value, { status });
	const handle = async (request: Request): Promise<Response> => {
		const url = new URL(request.url);
		const pathname = url.pathname;
		if(pathname.startsWith("/auth/")) return auth.handle(request, pathname);
		if(request.method !== "GET" && request.method !== "HEAD") return json({ error: "This API is read-only." }, 405);
		const viewer = await auth.viewer(request);
		if(pathname === "/api/session") return json({
			mode: config.providers.length ? "sso" : "public", viewer: viewer ? { name: viewer.name, providerId: viewer.providerId } : null,
			providers: config.providers.map(({ id, name }) => ({ id, name })), babelshark: config.babelshark ?? null,
		});
		if(pathname === "/api" || pathname.startsWith("/api/")) {
			if(config.providers.length && !viewer) return json({ error: "Sign in to view the registry." }, 401);
			if(pathname === "/api/catalog") return json(await data.catalog());
			if(pathname === "/api/registry") return json(await data.status());
			const project = /^\/api\/projects\/([a-zA-Z0-9._-]+)$/.exec(pathname);
			if(project) {
				const result = await data.project(project[1]!);
				return result ? json(result) : json({ error: "Project not found." }, 404);
			}
			const layer = /^\/api\/layers\/([a-z]+)\/([a-zA-Z0-9._-]+)$/.exec(pathname);
			if(layer && layerTypes.includes(layer[1] as LayerType)) {
				const result = await deps.repository.readLayer(layer[1] as LayerType, layer[2]!);
				return result ? json({ type: layer[1], name: layer[2], content: result.content, revision: result.revision }) : json({ error: "Layer not found." }, 404);
			}
			return json({ error: "Not found." }, 404);
		}
		if(pathname.startsWith("/assets/")) {
			const relative = decodeURIComponent(pathname).slice(1);
			const target = path.resolve(assets, relative);
			if(!target.startsWith(`${path.resolve(assets)}/assets/`)) return new Response(null, { status: 404 });
			const file = Bun.file(target);
			if(!await file.exists() || !(await stat(target)).isFile()) return new Response(null, { status: 404 });
			return new Response(file, { headers: { "Cache-Control": "public, max-age=31536000, immutable" } });
		}
		const html = Bun.file(path.join(assets, "index.html"));
		if(!await html.exists()) return new Response("Web UI assets are missing. Run bun run build:web.", { status: 503 });
		return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
	};
	return async (request: Request): Promise<Response> => {
		let response: Response;
		try { response = await handle(request); } catch(error) {
			const failure = describeRegistryError(error, deps.provider.type);
			logger.error("Web UI request failed", { error_code: failure.code, provider: deps.provider.type, message: failure.error });
			response = json(failure, 503);
		}
		response.headers.set("X-Content-Type-Options", "nosniff");
		response.headers.set("Referrer-Policy", "no-referrer");
		response.headers.set("X-Frame-Options", "DENY");
		if(!response.headers.has("Cache-Control")) response.headers.set("Cache-Control", "no-store");
		if(request.method === "HEAD") return new Response(null, { status: response.status, headers: response.headers });
		return response;
	};
}

/** Starts a second listener only when explicitly enabled, sharing application services. */
export function startWebServer(config: WebConfig, deps: WebDependencies) {
	if(!config.enabled) return undefined;
	try {
		return Bun.serve({ hostname: config.host, port: config.port, fetch: createWebHandler(config, deps) });
	} catch{
		throw new Error(`Unable to start Web UI on ${config.host}:${config.port}. Check the address and port availability.`);
	}
}
