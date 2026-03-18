import { describe, expect, test } from "bun:test";

import { buildAuthOptions } from "../src/auth";
import type { AppConfig } from "../src/config";
import type { Logger } from "../src/logger";

/**
 * Creates a minimal valid config object that tests can override per scenario.
 */
function createBaseConfig(): AppConfig {
	return {
		auth: { mode: "none" },
		cacheExpirySeconds: 300,
		contextRegistry: "/tmp/context-registry",
		debugMcp: false,
		debugMcpOutputPath: "./output.log",
		httpHost: "0.0.0.0",
		httpPort: 8080,
		registryDir: "contexts",
		transportType: "stdio",
	};
}

/**
 * Captures warning log entries so auth tests can assert on failed API key attempts.
 */
function createMockLogger(): {
	entries: Array<{ fields?: Record<string, unknown>; message: string }>;
	logger: Logger;
} {
	const entries: Array<{ fields?: Record<string, unknown>; message: string }> = [];

	return {
		entries,
		logger: {
			debug: () => {},
			error: () => {},
			info: () => {},
			warn: (message, fields) => {
				entries.push({ message, fields });
			},
		},
	};
}

describe("buildAuthOptions", () => {
	test("returns no auth handlers when auth mode is none", () => {
		const { logger } = createMockLogger();

		expect(buildAuthOptions(createBaseConfig(), logger)).toEqual({});
	});

	test("builds OAuth authenticate and oauth config when oauth mode is enabled", () => {
		const { logger } = createMockLogger();
		const options = buildAuthOptions(
			{
				...createBaseConfig(),
				auth: {
					mode: "oauth",
					authorizationEndpoint: "https://auth.example.com/oauth/authorize",
					baseUrl: "https://mcp.example.com",
					clientId: "client-id",
					clientSecret: "client-secret",
					scopes: ["openid", "profile"],
					tokenEndpoint: "https://auth.example.com/oauth/token",
				},
			},
			logger,
		);

		expect(typeof options.authenticate).toBe("function");
		expect(options.auth).toBeDefined();
	});

	test("authenticates x-api-key when api key auth is enabled", async () => {
		const { logger } = createMockLogger();
		const options = buildAuthOptions(
			{
				...createBaseConfig(),
				auth: {
					mode: "apiKey",
					accessApiKey: "secret",
				},
			},
			logger,
		);

		const session = await options.authenticate?.({
			headers: {
				"x-api-key": "secret",
			},
		} as never);

		expect(session).toEqual({
			authType: "api-key",
		});
	});

	test("rejects requests with an invalid x-api-key", async () => {
		const { entries, logger } = createMockLogger();
		const options = buildAuthOptions(
			{
				...createBaseConfig(),
				auth: {
					mode: "apiKey",
					accessApiKey: "secret",
				},
			},
			logger,
		);

		expect(
			options.authenticate?.({
				headers: {
					"x-api-key": "wrong",
				},
			} as never),
		).rejects.toMatchObject({
			status: 401,
			statusText: "Unauthorized",
		});

		expect(entries).toEqual([
			{
				message: "API key authentication failed",
				fields: {
				},
			},
		]);
	});
});
