import { expect, test } from "bun:test";
import { resolve } from "node:path";

/** Reserves an unused port for an isolated child process. */
function availablePort(): number {
	const listener = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
	const port = listener.port!;
	listener.stop(true);
	return port;
}

/** Waits for a child HTTP listener without assuming a fixed startup duration. */
async function ready(port: number) {
	for(let attempt = 0; attempt < 100; attempt++) {
		try {
			const response = await fetch(`http://127.0.0.1:${port}/api/session`, { signal: AbortSignal.timeout(300) });
			if(response.ok) return;
		} catch{ /* Wait for the child listener. */ }
		await Bun.sleep(30);
	}
	throw new Error("Viewer did not start");
}

for(const transport of ["stdio", "httpStream"]) {
	test(`viewer starts and stops alongside MCP ${transport}`, async () => {
		const port = availablePort();
		let mcpPort = availablePort();
		while(mcpPort === port) mcpPort = availablePort();
		const child = Bun.spawn([process.execPath, "--no-env-file", "run", "src/index.ts"], {
			stdin: "pipe", stdout: "pipe", stderr: "pipe",
			env: { PATH: process.env.PATH ?? "", CONTEXT_REGISTRY: resolve(import.meta.dir, "fixtures/local-registry"), MCP_TRANSPORT: transport, HOST: "127.0.0.1", PORT: String(mcpPort), ACCESS_API_KEY: "test-mcp-key", WEB_UI_ENABLED: "true", WEB_UI_HOST: "127.0.0.1", WEB_UI_PORT: String(port) },
		});
		const stdout = new Response(child.stdout).text();
		const stderr = new Response(child.stderr).text();
		try {
			await ready(port);
			expect((await fetch(`http://127.0.0.1:${port}/api/catalog`)).status).toBe(200);
			if(transport === "httpStream") expect((await fetch(`http://127.0.0.1:${mcpPort}/health`)).status).toBe(200);
		} finally { child.kill("SIGTERM"); await child.exited; }
		expect(child.exitCode).toBe(0);
		if(transport === "stdio") expect(await stdout).toBe("");
		expect(await stderr).toContain("Web UI started");
		await expect(fetch(`http://127.0.0.1:${port}/api/session`)).rejects.toThrow();
	}, 10000);
}

test("occupied viewer port fails startup instead of leaving only MCP running", async () => {
	const listener = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
	const child = Bun.spawn([process.execPath, "--no-env-file", "run", "src/index.ts"], {
		stdout: "pipe", stderr: "pipe", stdin: "pipe",
		env: { PATH: process.env.PATH ?? "", CONTEXT_REGISTRY: resolve(import.meta.dir, "fixtures/local-registry"), WEB_UI_ENABLED: "true", WEB_UI_HOST: "127.0.0.1", WEB_UI_PORT: String(listener.port) },
	});
	try {
		const stderr = new Response(child.stderr).text();
		const timeout = setTimeout(() => child.kill("SIGKILL"), 5000);
		await child.exited;
		clearTimeout(timeout);
		expect(child.exitCode).not.toBe(0);
		expect(await stderr).toContain("Unable to start Web UI");
	} finally { listener.stop(true); child.kill(); }
}, 10000);
