import { describe, expect, test } from "bun:test";
import { UserError } from "fastmcp";

import { RegistryUnavailableError } from "../src/errors";
import type { Logger } from "../src/logger";
import { mapError } from "../src/tools/register-tools";

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
