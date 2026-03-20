import { UserError, requireAuth, type FastMCP } from "fastmcp";
import { z } from "zod";

import type { ServerSession } from "../auth";
import { AppError, LayerNotFoundError } from "../errors";
import type { Logger } from "../logger";
import type { RegistryRepository } from "../registry/repository";
import type { LayerResolver } from "../services/layer-resolver";
import type { ProjectManifestLoader } from "../services/manifest-loader";
import type { McpDebugLogger } from "../debug/mcp-debug-logger";
import { hasRequiredRole } from "./role-access-check";

/**
 * Registers the public MCP tools and applies auth and role checks when configured.
 */
export function registerTools(
	server: FastMCP<ServerSession>,
	deps: {
		repository: RegistryRepository;
		manifestLoader: ProjectManifestLoader;
		layerResolver: LayerResolver;
		logger: Logger;
		debugLogger?: McpDebugLogger;
		authRequired: boolean;
		authMode: "none" | "apiKey" | "oauth";
	},
): void {
	const { repository, manifestLoader, layerResolver, logger, debugLogger, authRequired, authMode } = deps;

	const canAccess = authRequired ?
		((auth: ServerSession | undefined) => {
			logger.info("Tool access auth received", {
				auth,
			});

			if(!requireAuth(auth)) {
				logger.warn("Tool access denied", {
					reason: "authentication_required",
				});
				return false;
			}

			if(authMode !== "oauth") {
				return true;
			}

			return hasRequiredRole(auth as Extract<ServerSession, { idToken?: string }>, logger);
		}) :
		undefined;

	server.addTool({
		name: "resolve_context",
		description: "Resolve merged context layers for a project",
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
		},
		...(canAccess ? { canAccess } : {}),
		parameters: z.object({
			project_id: z.string().min(1),
			task_type: z.string().optional(),
			path: z.string().optional(),
			changed_files: z.array(z.string()).optional(),
		}),
		execute: withToolExecutionLogging(logger, "resolve_context", async (args, context) => {
			const startedAt = Date.now();

			try {
				const execution = await layerResolver.resolveContextWithDebug(args);

				if(debugLogger) {
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
		}),
	});

	server.addTool({
		name: "list_projects",
		description: "List available project IDs from the registry",
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
		},
		...(canAccess ? { canAccess } : {}),
		execute: withToolExecutionLogging(logger, "list_projects", async () => {
			try {
				const projectIds = await repository.listProjectIds();
				return JSON.stringify({ project_ids: projectIds }, null, 2);
			} catch (error) {
				throw mapError(error, logger);
			}
		}),
	});

	server.addTool({
		name: "get_project_manifest",
		description: "Get parsed project manifest by project_id",
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
		},
		...(canAccess ? { canAccess } : {}),
		parameters: z.object({
			project_id: z.string().min(1),
		}),
		execute: withToolExecutionLogging(logger, "get_project_manifest", async ({ project_id }) => {
			try {
				const manifest = await manifestLoader.load(project_id);
				return JSON.stringify(manifest, null, 2);
			} catch (error) {
				throw mapError(error, logger);
			}
		}),
	});

	server.addTool({
		name: "get_layer",
		description: "Get raw content of a specific layer",
		annotations: {
			readOnlyHint: true,
			destructiveHint: false,
			idempotentHint: true,
		},
		...(canAccess ? { canAccess } : {}),
		parameters: z.object({
			type: z.enum(["global", "language", "framework", "project"]),
			name: z.string().min(1),
		}),
		execute: withToolExecutionLogging(logger, "get_layer", async ({ type, name }) => {
			try {
				const layer = await repository.readLayer(type, name);
				if(!layer) {
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
		}),
	});
}

type ToolContext = {
	requestId?: string;
};

type ToolExecutor<TArgs, TResult> = (args: TArgs, context: ToolContext) => Promise<TResult>;

function withToolExecutionLogging<TArgs, TResult>(
	logger: Logger,
	toolName: string,
	execute: ToolExecutor<TArgs, TResult>,
): ToolExecutor<TArgs, TResult> {
	return async (args: TArgs, context: ToolContext) => {
		const startedAt = Date.now();
		const requestId = context.requestId ?? "unknown";

		logger.info("Tool execution started", {
			tool_name: toolName,
			request_id: requestId,
			args,
		});

		try {
			const result = await execute(args, context);

			logger.info("Tool execution completed", {
				tool_name: toolName,
				request_id: requestId,
				duration_ms: Date.now() - startedAt,
			});

			return result;
		} catch (error) {
			logger.error("Tool execution failed", {
				tool_name: toolName,
				request_id: requestId,
				duration_ms: Date.now() - startedAt,
				error_message: error instanceof Error ? error.message : String(error),
			});
			throw error;
		}
	};
}

/**
 * Normalizes thrown values into user-facing tool errors and logs server-side details.
 */
export function mapError(error: unknown, logger: Logger): Error {
	if(error instanceof UserError) {
		return error;
	}

	if(error instanceof AppError) {
		logger.error("Tool execution failed", {
			error_code: error.code,
			error_name: error.name,
			error_message: error.message,
			error_details: error.details,
		});
		return new UserError(`[${error.code}] ${error.message}`);
	}

	if(error instanceof Error) {
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
