import type { IncomingMessage } from "node:http";

import { OAuthProvider, type ServerOptions } from "fastmcp";

import type { AppConfig } from "./config";

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

export function buildAuthOptions(
  config: AppConfig,
): Pick<ServerOptions<ServerSession>, "authenticate" | "oauth"> {
  if (config.auth.mode === "oauth") {
    const provider = new OAuthProvider<OAuthServerSession>({
      authorizationEndpoint: config.auth.authorizationEndpoint,
      baseUrl: config.auth.baseUrl,
      clientId: config.auth.clientId,
      clientSecret: config.auth.clientSecret,
      scopes: config.auth.scopes,
      tokenEndpoint: config.auth.tokenEndpoint,
    });

    return {
      authenticate: async (request: IncomingMessage) => {
        try {
          const session = await provider.authenticate(request);

          if (!session) {
            throw new Response(null, {
              status: 401,
              statusText: "Unauthorized",
            });
          }

          return session;
        } catch (error) {
          throw error;
        }
      },
      oauth: provider.getOAuthConfig(),
    };
  }

  if (config.auth.mode === "apiKey") {
    const { accessApiKey } = config.auth;

    return {
      authenticate: async (request: IncomingMessage) => {
        const apiKeyHeader = request.headers["x-api-key"];
        const apiKey = Array.isArray(apiKeyHeader) ? apiKeyHeader[0] : apiKeyHeader;

        if (apiKey !== accessApiKey) {
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
