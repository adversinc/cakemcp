import path from "node:path";
import os from "node:os";
import { mkdtemp, writeFile } from "node:fs/promises";
import { describe, expect, test } from "bun:test";

import { loadConfig } from "../src/config";
import { InvalidEnvConfigError } from "../src/errors";

describe("loadConfig", () => {
  test("loads REGISTRY_KEY from REGISTRY_KEY_FILE when inline key is absent", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cakemcp-config-test-"));
    const keyFile = path.join(root, "registry-key.txt");
    await writeFile(keyFile, "secret-token\n", "utf8");

    const config = loadConfig({
      CONTEXT_REGISTRY: "https://bitbucket.org/acme/private-registry.git",
      REGISTRY_KEY_FILE: keyFile,
    });

    expect(config.registryKey).toBe("secret-token");
    expect(config.registryDir).toBe("contexts");
  });

  test("throws a config error when REGISTRY_KEY_FILE is empty", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "cakemcp-config-test-"));
    const keyFile = path.join(root, "registry-key.txt");
    await writeFile(keyFile, "\n", "utf8");

    expect(() =>
      loadConfig({
        CONTEXT_REGISTRY: "https://bitbucket.org/acme/private-registry.git",
        REGISTRY_KEY_FILE: keyFile,
      }),
    ).toThrow(InvalidEnvConfigError);
  });

  test("uses REGISTRY_DIR when it is provided", () => {
    const config = loadConfig({
      CONTEXT_REGISTRY: "/tmp/context-registry",
      REGISTRY_DIR: "registry-data",
    });

    expect(config.registryDir).toBe("registry-data");
  });

  test("defaults transport to stdio", () => {
    const config = loadConfig({
      CONTEXT_REGISTRY: "/tmp/context-registry",
    });

    expect(config.transportType).toBe("stdio");
  });

  test("requires OAUTH_AUTH_ENDPOINT to be set explicitly for httpStream", () => {
    expect(() =>
      loadConfig({
        CONTEXT_REGISTRY: "/tmp/context-registry",
        MCP_TRANSPORT: "httpStream",
      }),
    ).toThrow(
      'OAUTH_AUTH_ENDPOINT or ACCESS_API_KEY is required when MCP_TRANSPORT=httpStream. Set to "OAUTH_AUTH_ENDPOINT=NONE" if you want leave your MCP server open.',
    );
  });

  test("supports open httpStream mode when OAUTH_AUTH_ENDPOINT=NONE", () => {
    const config = loadConfig({
      CONTEXT_REGISTRY: "/tmp/context-registry",
      MCP_TRANSPORT: "httpStream",
      OAUTH_AUTH_ENDPOINT: "NONE",
    });

    expect(config.transportType).toBe("httpStream");
    expect(config.auth).toEqual({ mode: "none" });
  });

  test("rejects configuring OAuth and API key auth together", () => {
    expect(() =>
      loadConfig({
        ACCESS_API_KEY: "secret",
        CONTEXT_REGISTRY: "/tmp/context-registry",
        OAUTH_AUTH_ENDPOINT: "https://auth.example.com/oauth/authorize",
      }),
    ).toThrow("Can not use both OAUTH_AUTH_ENDPOINT and ACCESS_API_KEY, please choose one.");
  });

  test("loads API key auth when ACCESS_API_KEY is set", () => {
    const config = loadConfig({
      ACCESS_API_KEY: "secret",
      CONTEXT_REGISTRY: "/tmp/context-registry",
      OAUTH_AUTH_ENDPOINT: "NONE",
    });

    expect(config.auth).toEqual({
      mode: "apiKey",
      accessApiKey: "secret",
    });
  });

  test("allows httpStream when ACCESS_API_KEY is set", () => {
    const config = loadConfig({
      ACCESS_API_KEY: "secret",
      CONTEXT_REGISTRY: "/tmp/context-registry",
      MCP_TRANSPORT: "httpStream",
    });

    expect(config.transportType).toBe("httpStream");
    expect(config.auth).toEqual({
      mode: "apiKey",
      accessApiKey: "secret",
    });
  });

  test("loads OAuth config when OAuth env vars are provided", () => {
    const config = loadConfig({
      CONTEXT_REGISTRY: "/tmp/context-registry",
      OAUTH_AUTH_ENDPOINT: "https://auth.example.com/oauth/authorize",
      OAUTH_BASE_URL: "https://mcp.example.com",
      OAUTH_CLIENT_ID: "client-id",
      OAUTH_CLIENT_SECRET: "client-secret",
      OAUTH_SCOPES: "openid,profile email",
      OAUTH_TOKEN_ENDPOINT: "https://auth.example.com/oauth/token",
    });

    expect(config.auth).toEqual({
      mode: "oauth",
      authorizationEndpoint: "https://auth.example.com/oauth/authorize",
      baseUrl: "https://mcp.example.com",
      clientId: "client-id",
      clientSecret: "client-secret",
      scopes: ["openid", "profile", "email"],
      tokenEndpoint: "https://auth.example.com/oauth/token",
    });
  });
});
