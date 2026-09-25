export type RegistryProviderType = "local" | "git";

export type RegistryStatus = {
	type: RegistryProviderType;
	revision?: string;
	lastSuccessfulUpdate?: string;
	stale: boolean;
	error?: string;
};

export interface RegistryProvider {
	getStatus?(): RegistryStatus;
	readonly type: RegistryProviderType;
	getRootPath(): Promise<string>;
	getFileRevision(filePath: string): Promise<string>;
}
