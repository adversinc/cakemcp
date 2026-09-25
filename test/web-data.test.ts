import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { LocalRegistryProvider } from "../src/providers/local-registry-provider";
import { RegistryRepository } from "../src/registry/repository";
import { ProjectManifestLoader } from "../src/services/manifest-loader";
import { LayerResolver } from "../src/services/layer-resolver";
import { ViewerData } from "../src/web/data";
import { createWebHandler, startWebServer } from "../src/web/server";

const logger = { info() {}, warn() {}, error() {}, debug() {} };
const root = resolve(import.meta.dir, "fixtures/local-registry");
const provider = new LocalRegistryProvider(root, ".", logger);
const repository = new RegistryRepository(provider, 300, logger);
const manifestLoader = new ProjectManifestLoader(repository);
const layerResolver = new LayerResolver(repository, manifestLoader, logger);
const deps = { provider, repository, manifestLoader, layerResolver };
const data = new ViewerData(deps);

test("viewer matches MCP output and marks implicit layers without exposing filesystem paths", async () => {
	const mcp = await layerResolver.resolveContext({ project_id: "billing-service" });
	const project = await data.project("billing-service");
	expect(project?.context).toBe(mcp.merged_content);
	expect(project?.layers.map(layer => `${layer.type}/${layer.name}`)).toEqual(mcp.resolved_layers.map(layer => `${layer.type}/${layer.name}`));
	expect(project?.layers.find(layer => layer.name === "billing-service")?.automatic).toBe(true);
	expect(JSON.stringify(project)).not.toContain(root);
	expect((await data.project("dedupe-auto-layer"))?.layers.find(layer => layer.name === "billing-service")?.automatic).toBe(false);
});

test("catalog includes implicit usages and diagnostics while invalid YAML remains viewable", async () => {
	const catalog = await data.catalog();
	expect(catalog.layers.find(layer => layer.name === "billing-service")?.usedBy).toContain("dedupe-auto-layer");
	expect(catalog.layers.find(layer => layer.name === "name-fallback")?.usedBy).toContain("name-fallback");
	expect(catalog.diagnostics.some(item => item.projectId === "invalid-manifest" && item.severity === "error")).toBe(true);
	expect(catalog.diagnostics.some(item => item.layer?.includes("missing-project-layer"))).toBe(true);
	const invalid = await data.project("invalid-manifest");
	expect(invalid?.rawManifest.length).toBeGreaterThan(0);
	expect(invalid?.warnings.length).toBeGreaterThan(0);
	expect(await data.project("not-there")).toBeNull();
});

test("public read-only API, disabled listener, deep links and static path boundaries", async () => {
	expect(startWebServer({ enabled: false }, deps)).toBeUndefined();
	const handler = createWebHandler({ enabled: true, port: 8081, host: "127.0.0.1", providers: [] }, deps);
	const call = (path: string, method = "GET") => handler(new Request(`http://localhost${path}`, { method }));
	expect((await (await call("/api/session")).json() as{ mode: string }).mode).toBe("public");
	expect((await call("/api/catalog")).status).toBe(200);
	expect((await call("/api/catalog", "POST")).status).toBe(405);
	expect((await call("/api/projects/not-there")).status).toBe(404);
	expect((await call("/api/layers/global/formatting")).status).toBe(200);
	expect((await call("/api/unknown")).status).toBe(404);
	expect((await call("/assets/%2e%2e%2fsrc/config.ts")).status).toBe(404);
	const detail = await call("/api/projects/billing-service");
	expect(detail.headers.get("cache-control")).toBe("no-store");
	expect(await detail.text()).not.toContain(root);
});

test("SSO data routes deny absent and forged cookies while login metadata stays public", async () => {
	const handler = createWebHandler({ enabled: true, host: "127.0.0.1", port: 8081, baseUrl: "https://viewer.example", sessionSecret: "x".repeat(32), providers: [{ id: "one", name: "One", issuer: "https://issuer.example", clientId: "client", clientSecretEnv: "SECRET", clientSecret: "secret", projectId: "123", requiredRole: "cakemcp-viewer" }] }, deps);
	for(const route of ["/api/catalog", "/api/projects/billing-service", "/api/layers/global/formatting", "/api/registry"]) {
		for(const cookie of ["", "__Host-cakemcp-session=forged"]) {
			const response = await handler(new Request(`https://viewer.example${route}`, { headers: { cookie } }));
			expect(response.status).toBe(401);
		}
	}
	const response = await handler(new Request("https://viewer.example/api/session"));
	expect(response.status).toBe(200);
	const body = await response.text();
	expect(body).toContain('"name":"One"');
	expect(body).not.toContain("secret");
	expect(body).not.toContain("issuer.example");
});


test("runtime prefix scopes API, assets and deep links without affecting root mode", async () => {
	const assets = await mkdtemp(resolve(tmpdir(), "cakemcp-web-assets-"));
	try {
		await mkdir(resolve(assets, "assets"));
		await writeFile(resolve(assets, "index.html"), '<html><head></head><body><script src="./assets/app.js"></script></body></html>');
		await writeFile(resolve(assets, "assets/app.js"), "export {};");
		const handler = createWebHandler({ enabled: true, port: 8081, host: "127.0.0.1", providers: [], basePath: "/browse" }, deps, assets);
		const call = (path: string) => handler(new Request(`http://localhost${path}`));
		expect((await call("/browse?x=1")).headers.get("location")).toBe("/browse/?x=1");
		for(const path of ["/api/catalog", "/browse-other/api/catalog", "/projects"]) expect((await call(path)).status).toBe(404);
		expect((await call("/browse/api/catalog")).status).toBe(200);
		const html = await (await call("/browse/projects/name-fallback")).text();
		expect(html).toContain('<base href="/browse/">');
		const asset = /src="\.\/(assets\/[^" ]+)"/.exec(html)?.[1];
		expect(asset).toBeDefined();
		expect((await call(`/browse/${asset}`)).status).toBe(200);
	} finally { await rm(assets, { recursive: true, force: true }); }
});
