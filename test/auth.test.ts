import { describe, expect, test } from "bun:test";

import { buildAuthOptions } from "../src/auth";
import type { AppConfig } from "../src/config";

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

describe("buildAuthOptions", () => {
  test("returns no auth handlers when auth mode is none", () => {
    expect(buildAuthOptions(createBaseConfig())).toEqual({});
  });

  test("builds OAuth authenticate and oauth config when oauth mode is enabled", () => {
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
    );

    expect(typeof options.authenticate).toBe("function");
    expect(options.oauth?.enabled).toBe(true);
  });

  test("authenticates x-api-key when api key auth is enabled", async () => {
    const options = buildAuthOptions(
      {
        ...createBaseConfig(),
        auth: {
          mode: "apiKey",
          accessApiKey: "secret",
        },
      },
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
    const options = buildAuthOptions(
      {
        ...createBaseConfig(),
        auth: {
          mode: "apiKey",
          accessApiKey: "secret",
        },
      },
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
  });
});
