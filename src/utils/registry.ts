import path from "node:path";
import { existsSync } from "node:fs";

export function isGitUrl(input: string): boolean {
	return (
		input.startsWith("http://") ||
    input.startsWith("https://") ||
    input.startsWith("ssh://") ||
    input.startsWith("git@") ||
    input.endsWith(".git")
	);
}

export function sanitizeName(input: string): string {
	if(!/^[a-zA-Z0-9._-]+$/.test(input)) {
		throw new Error(`Invalid name: '${input}'`);
	}

	return input;
}

/**
 * Finds the effective registry root, supporting both top-level and nested registry layouts.
 */
export function resolveRegistryRoot(rootPath: string, registryDir: string): string {
	const normalizedRegistryDir = registryDir.trim();
	const candidates = [path.join(rootPath, normalizedRegistryDir), rootPath];

	for(const candidate of candidates) {
		if(hasRegistryLayout(candidate)) {
			return candidate;
		}
	}

	return rootPath;
}

function hasRegistryLayout(rootPath: string): boolean {
	return existsSync(path.join(rootPath, "projects")) && existsSync(path.join(rootPath, "layers"));
}
