import type { IncomingMessage } from "node:http";

import { OAuthProvider, type ServerOptions } from "fastmcp";

import type { AppConfig } from "./config";
import type { Logger } from "./logger";

export type ApiKeySession = {
	authType: "api-key";
};

export type OAuthServerSession = Record<string, unknown> & {
	accessToken: string;
	claims?: Record<string, unknown>;
	expiresAt?: number;
	idToken?: string;
	refreshToken?: string;
	scopes?: string[];
};

export type ServerSession = ApiKeySession | OAuthServerSession;

/**
 * Builds the FastMCP auth hooks for the configured authentication mode.
 */
export function buildAuthOptions(
	config: AppConfig,
	logger: Logger,
): Pick<ServerOptions<ServerSession>, "authenticate" | "auth"> {
	if(config.auth.mode === "oauth") {
		console.log("endpoint:", config.auth.authorizationEndpoint);
		const provider = new OAuthProvider<OAuthServerSession>({
			authorizationEndpoint: config.auth.authorizationEndpoint,
			baseUrl: config.auth.baseUrl,
			clientId: config.auth.clientId,
			clientSecret: config.auth.clientSecret,
			scopes: config.auth.scopes,
			tokenEndpoint: config.auth.tokenEndpoint,
		});

		return {

			auth: provider,
		};
	}

	if(config.auth.mode === "apiKey") {
		const { accessApiKey } = config.auth;

		return {
			authenticate: async (request: IncomingMessage) => {
				const apiKeyHeader = request.headers["x-api-key"];
				const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

				if(apiKey !== accessApiKey) {
					logger.warn("API key authentication failed", {
					});
					throw new Response(null, {
						status: 401,
						statusText: "Unauthorized",
					});
				}

				return {
					authType: "api-key",
				};
			},
		};
	}

	return {};
}
