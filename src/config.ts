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
	auth: AuthConfig;
	debugMcp: boolean;
	debugMcpOutputPath: string;
};

export type AuthConfig =
  | {
  	mode: "none";
  } |
  {
  	mode: "apiKey";
  	accessApiKey: string;
  } |
  {
  	mode: "oauth";
  	authorizationEndpoint: string;
  	baseUrl: string;
  	clientId: string;
  	clientSecret: string;
  	scopes: string[];
  	tokenEndpoint: string;
  };

/**
 * Reads process environment variables and converts them into the validated app config.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
	const contextRegistry = env.CONTEXT_REGISTRY?.trim();

	if(!contextRegistry) {
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
	const auth = readAuthConfig(env, transportType);

	return {
		contextRegistry,
		registryDir: readRegistryDir(env),
		registryKey: readRegistryKey(env),
		cacheExpirySeconds,
		transportType,
		httpPort,
		httpHost,
		auth,
		debugMcp: env.DEBUG_MCP === "1",
		debugMcpOutputPath: env.DEBUG_MCP_OUTPUT?.trim() || "./output.log",
	};
}

function readRegistryDir(env: NodeJS.ProcessEnv): string {
	return env.REGISTRY_DIR?.trim() || DEFAULT_REGISTRY_DIR;
}

/**
 * Reads the registry access token from either an inline env var or a file path.
 */
function readRegistryKey(env: NodeJS.ProcessEnv): string | undefined {
	const inlineKey = env.REGISTRY_KEY?.trim();
	if(inlineKey) {
		return inlineKey;
	}

	const keyFile = env.REGISTRY_KEY_FILE?.trim();
	if(!keyFile) {
		return undefined;
	}

	try {
		const fileValue = readFileSync(keyFile, "utf8").trim();
		if(!fileValue) {
			throw new InvalidEnvConfigError(`REGISTRY_KEY_FILE is empty: ${keyFile}`);
		}

		return fileValue;
	} catch (error) {
		if(error instanceof InvalidEnvConfigError) {
			throw error;
		}

		const message = error instanceof Error ? error.message : String(error);
		throw new InvalidEnvConfigError(`Failed to read REGISTRY_KEY_FILE '${keyFile}': ${message}`);
	}
}

/**
 * Parses a positive integer env var and falls back to the provided default when absent.
 */
function parsePositiveInt(value: string | undefined, fallback: number, fieldName: string): number {
	if(!value) {
		return fallback;
	}

	const parsed = Number.parseInt(value, 10);

	if(!Number.isFinite(parsed) || parsed <= 0) {
		throw new InvalidEnvConfigError(`${fieldName} must be a positive integer`);
	}

	return parsed;
}

/**
 * Resolves auth configuration and enforces the transport-specific auth requirements.
 */
function readAuthConfig(
	env: NodeJS.ProcessEnv,
	transportType: AppConfig["transportType"],
): AuthConfig {
	const oauthAuthorizationEndpoint = env.OAUTH_AUTH_ENDPOINT?.trim();
	const accessApiKey = env.ACCESS_API_KEY?.trim();

	if(transportType === "httpStream" && !oauthAuthorizationEndpoint && !accessApiKey) {
		throw new InvalidEnvConfigError(
			'OAUTH_AUTH_ENDPOINT or ACCESS_API_KEY is required when MCP_TRANSPORT=httpStream. Set to "OAUTH_AUTH_ENDPOINT=NONE" if you want leave your MCP server open.',
		);
	}

	if(oauthAuthorizationEndpoint && oauthAuthorizationEndpoint !== "NONE" && accessApiKey) {
		throw new InvalidEnvConfigError(
			"Can not use both OAUTH_AUTH_ENDPOINT and ACCESS_API_KEY, please choose one.",
		);
	}

	if(accessApiKey) {
		return {
			mode: "apiKey",
			accessApiKey,
		};
	}

	if(!oauthAuthorizationEndpoint || oauthAuthorizationEndpoint === "NONE") {
		return {
			mode: "none",
		};
	}

	return {
		mode: "oauth",
		authorizationEndpoint: oauthAuthorizationEndpoint,
		baseUrl: readRequiredEnv(env.OAUTH_BASE_URL, "OAUTH_BASE_URL"),
		clientId: readRequiredEnv(env.OAUTH_CLIENT_ID, "OAUTH_CLIENT_ID"),
		clientSecret: readRequiredEnv(env.OAUTH_CLIENT_SECRET, "OAUTH_CLIENT_SECRET"),
		scopes: parseScopes(env.OAUTH_SCOPES),
		tokenEndpoint: readRequiredEnv(env.OAUTH_TOKEN_ENDPOINT, "OAUTH_TOKEN_ENDPOINT"),
	};
}

function readRequiredEnv(value: string | undefined, fieldName: string): string {
	const trimmed = value?.trim();

	if(!trimmed) {
		throw new InvalidEnvConfigError(`${fieldName} is required`);
	}

	return trimmed;
}

/**
 * Parses the configured OAuth scopes, defaulting to openid/profile when omitted.
 */
function parseScopes(value: string | undefined): string[] {
	const trimmed = value?.trim();

	if(!trimmed) {
		return ["openid", "profile"];
	}

	return trimmed
		.split(/[,\s]+/)
		.map((scope) => scope.trim())
		.filter((scope) => scope.length > 0);
}
