import { InvalidEnvConfigError } from "./errors";

const DEFAULT_CACHE_EXPIRY_SECONDS = 300;

export type AppConfig = {
  contextRegistry: string;
  registryKey?: string;
  cacheExpirySeconds: number;
  transportType: "stdio" | "httpStream";
  httpPort: number;
  httpHost: string;
  debugMcp: boolean;
  debugMcpOutputPath: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const contextRegistry = env.CONTEXT_REGISTRY?.trim();

  if (!contextRegistry) {
    throw new InvalidEnvConfigError("CONTEXT_REGISTRY is required");
  }

  const cacheExpirySeconds = parsePositiveInt(
    env.CACHE_EXPIRY,
    DEFAULT_CACHE_EXPIRY_SECONDS,
    "CACHE_EXPIRY",
  );

  const transportType = env.MCP_TRANSPORT === "httpStream" ? "httpStream" : "stdio";
  const httpPort = parsePositiveInt(env.PORT, 8080, "PORT");
  const httpHost = env.HOST?.trim() || "0.0.0.0";

  return {
    contextRegistry,
    registryKey: env.REGISTRY_KEY,
    cacheExpirySeconds,
    transportType,
    httpPort,
    httpHost,
    debugMcp: env.DEBUG_MCP === "1",
    debugMcpOutputPath: env.DEBUG_MCP_OUTPUT?.trim() || "./output.log",
  };
}

function parsePositiveInt(value: string | undefined, fallback: number, fieldName: string): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new InvalidEnvConfigError(`${fieldName} must be a positive integer`);
  }

  return parsed;
}
