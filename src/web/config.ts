import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { InvalidEnvConfigError } from "../errors";

const providerSchema = z.object({
	id: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,47}$/),
	name: z.string().trim().min(1).max(80),
	issuer: z.string().url(),
	clientId: z.string().trim().min(1),
	clientSecretEnv: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
	projectId: z.string().regex(/^[0-9]+$/),
	requiredRole: z.string().trim().min(1).default("cakemcp-viewer"),
}).strict();
const documentSchema = z.object({
	sso: z.object({ providers: z.array(providerSchema).default([]) }).strict().optional(),
}).strict();

export type SsoProvider = z.infer<typeof providerSchema> & { clientSecret: string };
export type WebConfig = { enabled: false } | {
	enabled: true;
	port: number;
	host: string;
	basePath?: string;
	baseUrl?: string;
	sessionSecret?: string;
	providers: SsoProvider[];
	babelshark?: { projectId: number; accessCode: string };
};

/** Reads an inline JSON object or a literal, readable local JSON file. */
export function readWebDocument(value: string | undefined): z.infer<typeof documentSchema> {
	const input = value?.trim();
	if(!input) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(input);
	} catch{
		if(/^[{[]/.test(input)) throw new InvalidEnvConfigError("WEB_UI_CONFIG contains invalid JSON");
		if(/[\x00-\x1f\x7f]/.test(input) || /^[a-z][a-z0-9+.-]*:/i.test(input)) {
			throw new InvalidEnvConfigError("WEB_UI_CONFIG must be JSON or a local file path");
		}
		try {
			const filename = resolve(input);
			if(!statSync(filename).isFile()) throw new Error("Not a regular file");
			parsed = JSON.parse(readFileSync(filename, "utf8"));
		} catch{
			throw new InvalidEnvConfigError("WEB_UI_CONFIG must reference a readable regular JSON file");
		}
	}
	const result = documentSchema.safeParse(parsed);
	if(!result.success) throw new InvalidEnvConfigError("WEB_UI_CONFIG does not match the documented configuration schema");
	return result.data;
}

/** Allows insecure HTTP only on a development loopback origin. */
export function isLocalHttp(url: URL): boolean {
	return url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

/** Validates a configured OIDC issuer or the public application origin. */
function validateUrl(value: string, field: string, production: boolean): URL {
	let url: URL;
	try { url = new URL(value); } catch{ throw new InvalidEnvConfigError(`${field} must be a valid URL`); }
	if(url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && (production || !isLocalHttp(url)))) {
		throw new InvalidEnvConfigError(`${field} must use HTTPS (HTTP loopback is allowed outside production)`);
	}
	return url;
}

/** Resolves the optional viewer without changing MCP authentication settings. */
export function readWebConfig(env: NodeJS.ProcessEnv, transport: string, mcpPort: number): WebConfig {
	const enabled = env.WEB_UI_ENABLED?.trim() || "false";
	if(!["false", "true", "0", "1"].includes(enabled)) throw new InvalidEnvConfigError("WEB_UI_ENABLED must be true or false");
	if(enabled === "false" || enabled === "0") return { enabled: false };
	const portText = env.WEB_UI_PORT?.trim() ?? "";
	const port = Number(portText);
	if(!/^\d+$/.test(portText) || port < 1 || port > 65535) throw new InvalidEnvConfigError("WEB_UI_PORT must be an integer from 1 to 65535");
	if(transport === "httpStream" && port === mcpPort) throw new InvalidEnvConfigError("WEB_UI_PORT must differ from the MCP HTTP port");
	const basePath = (env.WEB_UI_BASE_PATH?.trim() || "/").replace(/\/$/, "");
	if(basePath && (!/^\/(?:[a-zA-Z0-9_-]+)(?:\/[a-zA-Z0-9_-]+)*$/.test(basePath))) throw new InvalidEnvConfigError("WEB_UI_BASE_PATH must be / or a path of letters, digits, underscores and hyphens");
	const doc = readWebDocument(env.WEB_UI_CONFIG);
	const ids = new Set<string>();
	const production = env.NODE_ENV === "production";
	const providers = (doc.sso?.providers ?? []).map((provider) => {
		if(ids.has(provider.id)) throw new InvalidEnvConfigError("SSO provider IDs must be unique");
		ids.add(provider.id);
		validateUrl(provider.issuer, "SSO issuer", production);
		const clientSecret = env[provider.clientSecretEnv]?.trim();
		if(!clientSecret) throw new InvalidEnvConfigError(`Missing SSO secret environment variable: ${provider.clientSecretEnv}`);
		return { ...provider, clientSecret };
	});
	let baseUrl: string | undefined;
	let sessionSecret: string | undefined;
	if(providers.length) {
		const url = validateUrl(env.WEB_UI_BASE_URL ?? "", "WEB_UI_BASE_URL", production);
		if(url.pathname !== "/") throw new InvalidEnvConfigError("WEB_UI_BASE_URL must be an origin without a path");
		baseUrl = url.origin;
		sessionSecret = env.WEB_UI_SESSION_SECRET?.trim();
		if(!sessionSecret || Buffer.byteLength(sessionSecret) < 32) throw new InvalidEnvConfigError("WEB_UI_SESSION_SECRET must contain at least 32 bytes of random secret material");
	}
	let babelshark: { projectId: number; accessCode: string } | undefined;
	const projectId = env.BABELSHARK_PROJECT_ID?.trim();
	const accessCode = env.BABELSHARK_ACCESS_CODE?.trim();
	if(projectId && accessCode) {
		if(!/^\d+$/.test(projectId) || !Number.isSafeInteger(Number(projectId)) || Number(projectId) < 1) {
			throw new InvalidEnvConfigError("BABELSHARK_PROJECT_ID must be a positive safe integer");
		}
		babelshark = { projectId: Number(projectId), accessCode };
	}
	return { enabled: true, port, host: env.WEB_UI_HOST?.trim() || "0.0.0.0", providers, basePath, baseUrl, sessionSecret, babelshark };
}
