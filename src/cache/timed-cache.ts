export type CacheStatus = "hit" | "miss";

export class TimedCache<T> {
  private value: T | null = null;
  private expiresAt = 0;

  constructor(private readonly ttlMs: number) {}

  async getOrLoad(loader: () => Promise<T>): Promise<T> {
    const { value } = await this.getOrLoadWithStatus(loader);
    return value;
  }

  async getOrLoadWithStatus(loader: () => Promise<T>): Promise<{ value: T; status: CacheStatus }> {
    const now = Date.now();

    if (this.value !== null && now < this.expiresAt) {
      return { value: this.value, status: "hit" };
    }

    const loaded = await loader();
    this.value = loaded;
    this.expiresAt = now + this.ttlMs;
    return { value: loaded, status: "miss" };
  }

  invalidate(): void {
    this.value = null;
    this.expiresAt = 0;
  }
}
