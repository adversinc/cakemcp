import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { GitRegistryProvider } from "../src/providers/git-registry-provider";

/** Runs Git only against isolated temporary repositories. */
async function git(cwd: string, ...args: string[]) {
	const process = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
	const stderr = new Response(process.stderr).text();
	if(await process.exited !== 0) throw new Error(await stderr);
}

test("Git status exposes revision and stale fallback without filesystem details", async () => {
	const root = await mkdtemp(join(tmpdir(), "cakemcp-sync-"));
	const origin = join(root, "origin");
	let checkout: string | undefined;
	try {
		await mkdir(join(origin, "projects"), { recursive: true });
		await mkdir(join(origin, "layers"));
		await writeFile(join(origin, "projects/example.yaml"), "name: example\n");
		await writeFile(join(origin, "layers/.keep"), "");
		await git(origin, "init", "--initial-branch=main");
		await git(origin, "add", ".");
		await git(origin, "-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "Fixture");
		const provider = new GitRegistryProvider(origin, ".", 0, undefined, { info() {}, warn() {}, error() {}, debug() {} });
		const [first, second] = await Promise.all([provider.getRootPath(), provider.getRootPath()]);
		expect(first).toBe(second);
		checkout = first;
		const status = provider.getStatus();
		expect(status.revision).toMatch(/^[0-9a-f]{40}$/);
		expect(status.lastSuccessfulUpdate).toBeDefined();
		expect(status.stale).toBe(false);
		await rename(origin, join(root, "offline"));
		expect(await provider.getRootPath()).toBe(first);
		expect(provider.getStatus().stale).toBe(true);
		expect(provider.getStatus().revision).toBe(status.revision);
		expect(JSON.stringify(provider.getStatus())).not.toContain(root);
		await rename(join(root, "offline"), origin);
		await provider.getRootPath();
		expect(provider.getStatus().stale).toBe(false);
	} finally {
		await rm(root, { recursive: true, force: true });
		if(checkout) await rm(checkout, { recursive: true, force: true });
	}
}, 10000);
