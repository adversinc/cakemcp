import { resolve } from "node:path";
import { LocalRegistryProvider } from "../../src/providers/local-registry-provider";
import { RegistryRepository } from "../../src/registry/repository";
import { ProjectManifestLoader } from "../../src/services/manifest-loader";
import { LayerResolver } from "../../src/services/layer-resolver";
import { createWebHandler } from "../../src/web/server";

const logger = { info() {}, warn() {}, error() {}, debug() {} };
const provider = new LocalRegistryProvider(resolve(import.meta.dir, "../fixtures/local-registry"), ".", logger);
const repository = new RegistryRepository(provider, 300, logger);
const manifestLoader = new ProjectManifestLoader(repository);
const layerResolver = new LayerResolver(repository, manifestLoader, logger);
const port = Number(process.env.E2E_PORT || 4178);
const rootHandler = createWebHandler({ enabled: true, host: "127.0.0.1", port, providers: [] }, { provider, repository, manifestLoader, layerResolver });
const prefixHandler = createWebHandler({ enabled: true, host: "127.0.0.1", port, providers: [], basePath: "/browse" }, { provider, repository, manifestLoader, layerResolver });
const server = Bun.serve({ hostname: "127.0.0.1", port, fetch: request => new URL(request.url).pathname.startsWith("/browse") ? prefixHandler(request) : rootHandler(request) });
process.once("SIGTERM", () => { server.stop(true); process.exit(0); });
