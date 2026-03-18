import type { OAuthServerSession } from "../auth";
import type { Logger } from "../logger";

type RoleCheckConfig = {
	claimPath?: string;
	requiredRole?: string;
};

/**
 * Verifies that the authenticated OAuth session contains the configured role claim.
 */
export function hasRequiredRole(
	auth: OAuthServerSession | undefined,
	logger: Logger,
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	const config = readRoleCheckConfig(env);

	if(!config) {
		logger.info("Role access check skipped", {
			reason: "role_check_not_configured",
		});
		return true;
	}

	logger.info("Role access check started", {
		claim_path: config.claimPath,
		required_role: config.requiredRole,
	});

	if(!auth?.idToken) {
		logger.warn("Role access check failed", {
			reason: "missing_id_token",
		});
		return false;
	}

	const decodedToken = decodeJwtPayload(auth.idToken, logger);
	if(!decodedToken) {
		return false;
	}

	const claimObject = readClaimObject(decodedToken, config.claimPath, logger);
	if(!claimObject) {
		return false;
	}

	if(!(config.requiredRole in claimObject)) {
		logger.warn("Role access check failed", {
			reason: "required_role_missing",
			claim_path: config.claimPath,
			required_role: config.requiredRole,
			available_roles: Object.keys(claimObject),
		});
		return false;
	}

	logger.info("Role access check passed", {
		claim_path: config.claimPath,
		required_role: config.requiredRole,
	});
	return true;
}

/**
 * Reads the role-check settings only when both claim path and required role are configured.
 */
function readRoleCheckConfig(env: NodeJS.ProcessEnv): Required<RoleCheckConfig> | undefined {
	const claimPath = env.OAUTH_ROLE_CLAIM_PATH?.trim();
	const requiredRole = env.OAUTH_REQUIRED_ROLE?.trim();

	if(!claimPath || !requiredRole) {
		return undefined;
	}

	return {
		claimPath,
		requiredRole,
	};
}

/**
 * Decodes the JWT payload section into an object for role-claim inspection.
 */
function decodeJwtPayload(token: string, logger: Logger): Record<string, unknown> | undefined {
	const parts = token.split(".");

	if(parts.length < 2 || !parts[1]) {
		logger.warn("Role access check failed", {
			reason: "invalid_jwt_format",
		});
		return undefined;
	}

	try {
		const payload = Buffer.from(toBase64(parts[1]), "base64").toString("utf8");
		const decoded = JSON.parse(payload);

		if(!isRecord(decoded)) {
			logger.warn("Role access check failed", {
				reason: "invalid_jwt_payload_type",
			});
			return undefined;
		}

		logger.info("Role access check token decoded", {
			payload_keys: Object.keys(decoded),
		});
		return decoded;
	} catch (error) {
		logger.warn("Role access check failed", {
			reason: "jwt_decode_error",
			error_message: error instanceof Error ? error.message : String(error),
		});
		return undefined;
	}
}

/**
 * Walks a dotted claim path and returns the object that should contain role keys.
 */
function readClaimObject(
	tokenPayload: Record<string, unknown>,
	claimPath: string,
	logger: Logger,
): Record<string, unknown> | undefined {
	const segments = claimPath.split(".").map((segment) => segment.trim()).filter(Boolean);
	let current: unknown = tokenPayload;

	for(const segment of segments) {
		if(!isRecord(current) || !(segment in current)) {
			logger.warn("Role access check failed", {
				reason: "claim_path_missing",
				claim_path: claimPath,
				missing_segment: segment,
			});
			return undefined;
		}

		current = current[segment];
	}

	if(!isRecord(current)) {
		logger.warn("Role access check failed", {
			reason: "claim_path_not_object",
			claim_path: claimPath,
			claim_value_type: Array.isArray(current) ? "array" : typeof current,
		});
		return undefined;
	}

	logger.info("Role access check claim object found", {
		claim_path: claimPath,
		available_roles: Object.keys(current),
	});
	return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toBase64(value: string): string {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padding = normalized.length % 4;

	if(padding === 0) {
		return normalized;
	}

	return `${normalized}${"=".repeat(4 - padding)}`;
}
