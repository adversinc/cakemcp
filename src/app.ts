import { FastMCP } from "fastmcp";

import { buildAuthOptions, type ServerSession } from "./auth";
import { loadConfig } from "./config";
import { McpDebugLogger } from "./debug/mcp-debug-logger";
import { createLogger } from "./logger";
import { GitRegistryProvider } from "./providers/git-registry-provider";
import { LocalRegistryProvider } from "./providers/local-registry-provider";
import type { RegistryProvider } from "./providers/types";
import { RegistryRepository } from "./registry/repository";
import { LayerResolver } from "./services/layer-resolver";
import { ProjectManifestLoader } from "./services/manifest-loader";
import { registerTools } from "./tools/register-tools";
import { isGitUrl } from "./utils/registry";

/**
 * Builds the MCP server, registry dependencies, and tool registrations from env config.
 */
export async function buildServer() {
	const config = loadConfig();
	const logger = createLogger("cakemcp");

	const provider: RegistryProvider = isGitUrl(config.contextRegistry) ?
		new GitRegistryProvider(
			config.contextRegistry,
			config.registryDir,
			config.cacheExpirySeconds,
			config.registryKey,
			logger,
		) :
		new LocalRegistryProvider(config.contextRegistry, config.registryDir, logger);

	logger.info("Startup config", {
		provider: provider.type,
		registry_dir: config.registryDir,
		cache_expiry_seconds: config.cacheExpirySeconds,
		transport: config.transportType,
		http_port: config.httpPort,
		has_registry_key: Boolean(config.registryKey),
		auth_mode: config.auth.mode,
		debug_mcp: config.debugMcp,
		debug_output_path: config.debugMcpOutputPath,
	});

	const repository = new RegistryRepository(provider, config.cacheExpirySeconds, logger);
	const manifestLoader = new ProjectManifestLoader(repository);
	const layerResolver = new LayerResolver(repository, manifestLoader, logger);
	const debugLogger = config.debugMcp ? new McpDebugLogger(config.debugMcpOutputPath) : undefined;

	const authOptions = buildAuthOptions(config, logger);
	//console.log("authOptions:", authOptions);

	const server = new FastMCP<ServerSession>({
		name: "cakemcp",
		version: "0.2.1",
		...authOptions,
	});

	registerTools(server, {
		repository,
		manifestLoader,
		layerResolver,
		logger,
		debugLogger,
		authRequired: config.auth.mode !== "none",
		authMode: config.auth.mode,
	});

	return {
		config,
		server,
	};
}
