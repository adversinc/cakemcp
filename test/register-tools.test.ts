import { describe, expect, test } from "bun:test";
import { UserError } from "fastmcp";

import { RegistryUnavailableError } from "../src/errors";
import type { Logger } from "../src/logger";
import { mapError, registerTools } from "../src/tools/register-tools";

function createMockLogger(): { logger: Logger; entries: Array<{ message: string; fields?: Record<string, unknown> }> } {
  const entries: Array<{ message: string; fields?: Record<string, unknown> }> = [];

  return {
    logger: {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: (message, fields) => {
        entries.push({ message, fields });
      },
    },
    entries,
  };
}

describe("mapError", () => {
  test("logs AppError values as errors before converting them to UserError", () => {
    const { logger, entries } = createMockLogger();

    const result = mapError(new RegistryUnavailableError("Registry cache is unavailable"), logger);

    expect(result).toBeInstanceOf(UserError);
    expect(result.message).toBe("[registry_unavailable] Registry cache is unavailable");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
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

    for (const tool of tools) {
      expect(typeof tool.canAccess).toBe("function");
      expect((tool.canAccess as (auth?: Record<string, unknown>) => boolean)(undefined)).toBe(false);
      expect((tool.canAccess as (auth?: Record<string, unknown>) => boolean)({ id: 1 })).toBe(true);
    }
  });
});
