import { AppError } from "../errors";
import type { RegistryProviderType } from "../providers/types";

/** Maps operational failures to actionable messages without exposing exception text. */
export function describeRegistryError(error: unknown, provider: RegistryProviderType): { code: string; error: string } {
	if(provider === "git" && error instanceof AppError && error.details && typeof error.details === "object") {
		const details = error.details as Record<string, unknown>;
		const output = [details.stderr, details.stdout].filter((value): value is string => typeof value === "string").join("\n");
		if(/authentication failed|access denied|could not read (?:username|password)|permission denied \(publickey\)|invalid credentials|HTTP[^\n]*(?:401|403)/i.test(output)) {
			return { code: "registry_authentication_failed", error: "Git registry authentication failed. Check REGISTRY_KEY or REGISTRY_KEY_FILE and repository access." };
		}
		if(/repository not found|does not appear to be a git repository/i.test(output)) {
			return { code: "registry_not_found", error: "Git registry was not found or access was denied. Check CONTEXT_REGISTRY and Git credentials." };
		}
		if(/could not resolve|failed to connect|connection timed out|network is unreachable|unable to access/i.test(output)) {
			return { code: "registry_connection_failed", error: "Unable to connect to the Git registry. Check the network and CONTEXT_REGISTRY." };
		}
	}
	const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
	if(code === "ENOENT" || code === "ENOTDIR") {
		return { code: "registry_layout_invalid", error: "Registry folders are missing. Check CONTEXT_REGISTRY and REGISTRY_DIR; the registry must contain projects/ and layers/." };
	}
	if(code === "EACCES" || code === "EPERM") {
		return { code: "registry_permission_denied", error: "Registry files are not readable. Check filesystem permissions for the service." };
	}
	if(code === "registry_unavailable") {
		return { code: "registry_unavailable", error: provider === "local" ? "Registry directory is unavailable. Check CONTEXT_REGISTRY and filesystem access." : "Git registry is unavailable. Check CONTEXT_REGISTRY, Git credentials and network access." };
	}
	return { code: "registry_read_failed", error: "Unable to read the registry. Check the server configuration and try again." };
}
