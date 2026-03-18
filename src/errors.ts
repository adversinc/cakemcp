export class AppError extends Error {
	public readonly details?: unknown;

	constructor(
		public readonly code: string,
		message: string,
		details?: unknown,
	) {
		super(message);
		this.name = this.constructor.name;
		this.details = details;
	}
}

export class InvalidEnvConfigError extends AppError {
	constructor(message: string) {
		super("invalid_env_config", message);
	}
}

export class RegistryUnavailableError extends AppError {
	constructor(message: string, details?: unknown) {
		super("registry_unavailable", message, details);
	}
}

export class GitRefreshFailedError extends AppError {
	constructor(message: string, details?: unknown) {
		super("git_refresh_failed", message, details);
	}
}

export class ProjectNotFoundError extends AppError {
	constructor(projectId: string) {
		super("project_not_found", `Project not found: ${projectId}`);
	}
}

export class ManifestParseError extends AppError {
	constructor(projectId: string, message: string, details?: unknown) {
		super("manifest_parse_error", `Invalid manifest for project '${projectId}': ${message}`, details);
	}
}

export class LayerNotFoundError extends AppError {
	constructor(type: string, name: string) {
		super("layer_not_found", `Layer not found: ${type}/${name}`);
	}
}
