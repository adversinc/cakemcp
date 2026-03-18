import { afterEach, describe, expect, test } from "bun:test";
import { UserError } from "fastmcp";

import type { OAuthServerSession } from "../src/auth";
import { RegistryUnavailableError } from "../src/errors";
import type { Logger } from "../src/logger";
import { hasRequiredRole } from "../src/tools/role-access-check";
import { mapError, registerTools } from "../src/tools/register-tools";

type LogEntry = {
	fields?: Record<string, unknown>;
	level: "info" | "warn" | "error";
	message: string;
};

/**
 * Creates a logger test double that records info, warn, and error calls for assertions.
 */
function createMockLogger(): { logger: Logger; entries: LogEntry[] } {
	const entries: LogEntry[] = [];

	return {
		logger: {
			debug: () => {},
			info: (message, fields) => {
				entries.push({ level: "info", message, fields });
			},
			warn: (message, fields) => {
				entries.push({ level: "warn", message, fields });
			},
			error: (message, fields) => {
				entries.push({ level: "error", message, fields });
			},
		},
		entries,
	};
}

function createJwt(payload: Record<string, unknown>): string {
	const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
	const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
	return `${header}.${encodedPayload}.signature`;
}

/**
 * Temporarily applies environment variables for the duration of a synchronous test callback.
 */
function withEnv(env: Record<string, string | undefined>, callback: () => void): void {
	const previousValues = new Map<string, string | undefined>();

	for(const [key, value] of Object.entries(env)) {
		previousValues.set(key, process.env[key]);
		if(value === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = value;
		}
	}

	try {
		callback();
	} finally {
		for(const [key, value] of previousValues) {
			if(value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	}
}

afterEach(() => {
	delete process.env.OAUTH_REQUIRED_ROLE;
	delete process.env.OAUTH_ROLE_CLAIM_PATH;
});

describe("mapError", () => {
	test("logs AppError values as errors before converting them to UserError", () => {
		const { logger, entries } = createMockLogger();

		const result = mapError(new RegistryUnavailableError("Registry cache is unavailable"), logger);

		expect(result).toBeInstanceOf(UserError);
		expect(result.message).toBe("[registry_unavailable] Registry cache is unavailable");
		expect(entries).toHaveLength(1);
		expect(entries[0]).toEqual({
			level: "error",
			message: "Tool execution failed",
			fields: {
				error_code: "registry_unavailable",
				error_name: "RegistryUnavailableError",
				error_message: "Registry cache is unavailable",
				error_details: undefined,
			},
		});
	});
});

describe("hasRequiredRole", () => {
	test("passes when role check is not configured", () => {
		const { entries, logger } = createMockLogger();

		expect(hasRequiredRole(undefined, logger, {})).toBe(true);
		expect(entries).toContainEqual({
			level: "info",
			message: "Role access check skipped",
			fields: {
				reason: "role_check_not_configured",
			},
		});
	});

	test("passes when the required role exists in the configured claim object", () => {
		const { entries, logger } = createMockLogger();
		const auth: OAuthServerSession = {
			accessToken: "access-token",
			idToken: createJwt({
				realm_access: {
					admin: true,
					user: true,
				},
			}),
		};

		const result = hasRequiredRole(auth, logger, {
			OAUTH_REQUIRED_ROLE: "admin",
			OAUTH_ROLE_CLAIM_PATH: "realm_access",
		});

		expect(result).toBe(true);
		expect(entries).toContainEqual({
			level: "info",
			message: "Role access check passed",
			fields: {
				claim_path: "realm_access",
				required_role: "admin",
			},
		});
	});

	test("fails when the configured claim path is missing", () => {
		const { entries, logger } = createMockLogger();
		const auth: OAuthServerSession = {
			accessToken: "access-token",
			idToken: createJwt({
				other_claim: {},
			}),
		};

		const result = hasRequiredRole(auth, logger, {
			OAUTH_REQUIRED_ROLE: "admin",
			OAUTH_ROLE_CLAIM_PATH: "realm_access.roles",
		});

		expect(result).toBe(false);
		expect(entries).toContainEqual({
			level: "warn",
			message: "Role access check failed",
			fields: {
				reason: "claim_path_missing",
				claim_path: "realm_access.roles",
				missing_segment: "realm_access",
			},
		});
	});

	test("fails when the required role key is missing from the claim object", () => {
		const { entries, logger } = createMockLogger();
		const auth: OAuthServerSession = {
			accessToken: "access-token",
			idToken: createJwt({
				realm_access: {
					user: true,
				},
			}),
		};

		const result = hasRequiredRole(auth, logger, {
			OAUTH_REQUIRED_ROLE: "admin",
			OAUTH_ROLE_CLAIM_PATH: "realm_access",
		});

		expect(result).toBe(false);
		expect(entries).toContainEqual({
			level: "warn",
			message: "Role access check failed",
			fields: {
				reason: "required_role_missing",
				claim_path: "realm_access",
				required_role: "admin",
				available_roles: ["user"],
			},
		});
	});
});

describe("registerTools", () => {
	test("does not apply access control when auth is disabled", () => {
		const tools: Array<Record<string, unknown>> = [];

		registerTools(
			{
				addTool: (tool: Record<string, unknown>) => {
					tools.push(tool);
				},
			} as never,
			{
				repository: {
					listProjectIds: async () => [],
					readLayer: async () => null,
				} as never,
				manifestLoader: {
					load: async () => ({}),
				} as never,
				layerResolver: {
					resolveContextWithDebug: async () => ({
						debug: { cacheMisses: 0 },
						result: {},
					}),
				} as never,
				logger: createMockLogger().logger,
				authRequired: false,
			},
		);

		expect(tools).toHaveLength(4);
		expect(tools.every((tool) => tool.canAccess === undefined)).toBe(true);
	});

	test("requires an authenticated session for all tools when auth is enabled", () => {
		const tools: Array<Record<string, unknown>> = [];

		registerTools(
			{
				addTool: (tool: Record<string, unknown>) => {
					tools.push(tool);
				},
			} as never,
			{
				repository: {
					listProjectIds: async () => [],
					readLayer: async () => null,
				} as never,
				manifestLoader: {
					load: async () => ({}),
				} as never,
				layerResolver: {
					resolveContextWithDebug: async () => ({
						debug: { cacheMisses: 0 },
						result: {},
					}),
				} as never,
				logger: createMockLogger().logger,
				authRequired: true,
			},
		);

		expect(tools).toHaveLength(4);

		for(const tool of tools) {
			expect(typeof tool.canAccess).toBe("function");
			expect((tool.canAccess as(auth?: Record<string, unknown>) => boolean)(undefined)).toBe(false);
			expect((tool.canAccess as(auth?: Record<string, unknown>) => boolean)({ id: 1 })).toBe(true);
		}
	});

	test("denies tool access when configured role is missing from id token", () => {
		const tools: Array<Record<string, unknown>> = [];
		const { entries, logger } = createMockLogger();

		withEnv(
			{
				OAUTH_REQUIRED_ROLE: "admin",
				OAUTH_ROLE_CLAIM_PATH: "realm_access",
			},
			() => {
				registerTools(
					{
						addTool: (tool: Record<string, unknown>) => {
							tools.push(tool);
						},
					} as never,
					{
						repository: {
							listProjectIds: async () => [],
							readLayer: async () => null,
						} as never,
						manifestLoader: {
							load: async () => ({}),
						} as never,
						layerResolver: {
							resolveContextWithDebug: async () => ({
								debug: { cacheMisses: 0 },
								result: {},
							}),
						} as never,
						logger,
						authRequired: true,
					},
				);
			},
		);

		const auth: OAuthServerSession = {
			accessToken: "access-token",
			idToken: createJwt({
				realm_access: {
					user: true,
				},
			}),
		};

		withEnv(
			{
				OAUTH_REQUIRED_ROLE: "admin",
				OAUTH_ROLE_CLAIM_PATH: "realm_access",
			},
			() => {
				for(const tool of tools) {
					expect(typeof tool.canAccess).toBe("function");
					expect((tool.canAccess as(auth?: OAuthServerSession) => boolean)(auth)).toBe(false);
				}
			},
		);

		expect(entries).toContainEqual({
			level: "warn",
			message: "Role access check failed",
			fields: {
				reason: "required_role_missing",
				claim_path: "realm_access",
				required_role: "admin",
				available_roles: ["user"],
			},
		});
	});

	test("allows tool access when configured role exists in id token", () => {
		const tools: Array<Record<string, unknown>> = [];
		const { logger } = createMockLogger();

		withEnv(
			{
				OAUTH_REQUIRED_ROLE: "admin",
				OAUTH_ROLE_CLAIM_PATH: "realm_access",
			},
			() => {
				registerTools(
					{
						addTool: (tool: Record<string, unknown>) => {
							tools.push(tool);
						},
					} as never,
					{
						repository: {
							listProjectIds: async () => [],
							readLayer: async () => null,
						} as never,
						manifestLoader: {
							load: async () => ({}),
						} as never,
						layerResolver: {
							resolveContextWithDebug: async () => ({
								debug: { cacheMisses: 0 },
								result: {},
							}),
						} as never,
						logger,
						authRequired: true,
					},
				);
			},
		);

		const auth: OAuthServerSession = {
			accessToken: "access-token",
			idToken: createJwt({
				realm_access: {
					admin: true,
				},
			}),
		};

		withEnv(
			{
				OAUTH_REQUIRED_ROLE: "admin",
				OAUTH_ROLE_CLAIM_PATH: "realm_access",
			},
			() => {
				for(const tool of tools) {
					expect(typeof tool.canAccess).toBe("function");
					expect((tool.canAccess as(auth?: OAuthServerSession) => boolean)(auth)).toBe(true);
				}
			},
		);
	});
});
