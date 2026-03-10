import { UserError, type FastMCP } from "fastmcp";
import { z } from "zod";

import { AppError, LayerNotFoundError } from "../errors";
import type { Logger } from "../logger";
import type { RegistryRepository } from "../registry/repository";
import type { LayerResolver } from "../services/layer-resolver";
import type { ProjectManifestLoader } from "../services/manifest-loader";
import type { McpDebugLogger } from "../debug/mcp-debug-logger";

export function registerTools(
  server: FastMCP,
  deps: {
    repository: RegistryRepository;
    manifestLoader: ProjectManifestLoader;
    layerResolver: LayerResolver;
    logger: Logger;
    debugLogger?: McpDebugLogger;
  },
): void {
  const { repository, manifestLoader, layerResolver, logger, debugLogger } = deps;

  server.addTool({
    name: "resolve_context",
    description: "Resolve merged context layers for a project",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    parameters: z.object({
      project_id: z.string().min(1),
      task_type: z.string().optional(),
      path: z.string().optional(),
      changed_files: z.array(z.string()).optional(),
    }),
    execute: async (args, context) => {
      const startedAt = Date.now();

      try {
        const execution = await layerResolver.resolveContextWithDebug(args);

        if (debugLogger) {
          await debugLogger.writeResolveContext({
            requestId: context.requestId ?? "unknown",
            time: new Date().toISOString(),
            tool: "resolve_context",
            details: execution.debug,
            cache: execution.debug.cacheMisses === 0 ? "hit" : "miss",
            durationMs: Date.now() - startedAt,
          });
        }

        return JSON.stringify(execution.result, null, 2);
      } catch (error) {
        throw mapError(error, logger);
      }
    },
  });

  server.addTool({
    name: "list_projects",
    description: "List available project IDs from the registry",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    execute: async () => {
      try {
        const projectIds = await repository.listProjectIds();
        return JSON.stringify({ project_ids: projectIds }, null, 2);
      } catch (error) {
        throw mapError(error, logger);
      }
    },
  });

  server.addTool({
    name: "get_project_manifest",
    description: "Get parsed project manifest by project_id",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    parameters: z.object({
      project_id: z.string().min(1),
    }),
    execute: async ({ project_id }) => {
      try {
        const manifest = await manifestLoader.load(project_id);
        return JSON.stringify(manifest, null, 2);
      } catch (error) {
        throw mapError(error, logger);
      }
    },
  });

  server.addTool({
    name: "get_layer",
    description: "Get raw content of a specific layer",
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
    parameters: z.object({
      type: z.enum(["global", "language", "framework", "project"]),
      name: z.string().min(1),
    }),
    execute: async ({ type, name }) => {
      try {
        const layer = await repository.readLayer(type, name);
        if (!layer) {
          throw new LayerNotFoundError(type, name);
        }

        return JSON.stringify(
          {
            type,
            name,
            path: layer.path,
            content: layer.content,
          },
          null,
          2,
        );
      } catch (error) {
        throw mapError(error, logger);
      }
    },
  });
}

export function mapError(error: unknown, logger: Logger): Error {
  if (error instanceof UserError) {
    return error;
  }

  if (error instanceof AppError) {
    logger.error("Tool execution failed", {
      error_code: error.code,
      error_name: error.name,
      error_message: error.message,
      error_details: error.details,
    });
    return new UserError(`[${error.code}] ${error.message}`);
  }

  if (error instanceof Error) {
    logger.error("Tool execution failed", {
      error_name: error.name,
      error_message: error.message,
    });
    return new UserError(error.message);
  }

  logger.error("Tool execution failed", {
    error_message: String(error),
  });
  return new UserError(String(error));
}
