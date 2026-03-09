import { FastMCP } from "fastmcp";

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

export async function buildServer() {
  const config = loadConfig();
  const logger = createLogger("advers-mcp");

  const provider: RegistryProvider = isGitUrl(config.contextRegistry)
    ? new GitRegistryProvider(config.contextRegistry, config.cacheExpirySeconds, config.registryKey, logger)
    : new LocalRegistryProvider(config.contextRegistry, logger);

  logger.info("Startup config", {
    provider: provider.type,
    cache_expiry_seconds: config.cacheExpirySeconds,
    transport: config.transportType,
    http_port: config.httpPort,
    has_registry_key: Boolean(config.registryKey),
    debug_mcp: config.debugMcp,
    debug_output_path: config.debugMcpOutputPath,
  });

  const repository = new RegistryRepository(provider, config.cacheExpirySeconds, logger);
  const manifestLoader = new ProjectManifestLoader(repository);
  const layerResolver = new LayerResolver(repository, manifestLoader, logger);
  const debugLogger = config.debugMcp ? new McpDebugLogger(config.debugMcpOutputPath) : undefined;

  const server = new FastMCP({
    name: "central-context-registry",
    version: "0.1.0",
  });

  registerTools(server, { repository, manifestLoader, layerResolver, debugLogger });

  return {
    config,
    server,
  };
}
