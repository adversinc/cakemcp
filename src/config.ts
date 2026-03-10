import { readFileSync } from "node:fs";

import { InvalidEnvConfigError } from "./errors";

const DEFAULT_CACHE_EXPIRY_SECONDS = 300;
const DEFAULT_REGISTRY_DIR = "contexts";

export type AppConfig = {
  contextRegistry: string;
  registryDir: string;
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
    registryDir: readRegistryDir(env),
    registryKey: readRegistryKey(env),
    cacheExpirySeconds,
    transportType,
    httpPort,
    httpHost,
    debugMcp: env.DEBUG_MCP === "1",
    debugMcpOutputPath: env.DEBUG_MCP_OUTPUT?.trim() || "./output.log",
  };
}

function readRegistryDir(env: NodeJS.ProcessEnv): string {
  return env.REGISTRY_DIR?.trim() || DEFAULT_REGISTRY_DIR;
}

function readRegistryKey(env: NodeJS.ProcessEnv): string | undefined {
  const inlineKey = env.REGISTRY_KEY?.trim();
  if (inlineKey) {
    return inlineKey;
  }

  const keyFile = env.REGISTRY_KEY_FILE?.trim();
  if (!keyFile) {
    return undefined;
  }

  try {
    const fileValue = readFileSync(keyFile, "utf8").trim();
    if (!fileValue) {
      throw new InvalidEnvConfigError(`REGISTRY_KEY_FILE is empty: ${keyFile}`);
    }

    return fileValue;
  } catch (error) {
    if (error instanceof InvalidEnvConfigError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new InvalidEnvConfigError(`Failed to read REGISTRY_KEY_FILE '${keyFile}': ${message}`);
  }
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
