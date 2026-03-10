export type RegistryProviderType = "local" | "git";

export interface RegistryProvider {
  readonly type: RegistryProviderType;
  getRootPath(): Promise<string>;
  getFileRevision(filePath: string): Promise<string>;
}
