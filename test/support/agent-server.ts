import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
// Use only fixture data and a disposable key, regardless of the developer's .env.
const child = Bun.spawn([process.execPath, "--no-env-file", "run", "src/index.ts"], {
	cwd: root,
	env: {
		PATH: process.env.PATH ?? "",
		CONTEXT_REGISTRY: resolve(root, "test/fixtures/local-registry"),
		MCP_TRANSPORT: "httpStream",
		HOST: "127.0.0.1",
		PORT: "18080",
		ACCESS_API_KEY: "integration-test-key",
	},
	stdout: "inherit",
	stderr: "inherit",
});

process.on("SIGINT", () => child.kill());
process.on("SIGTERM", () => child.kill());
console.log("Fixture MCP: http://127.0.0.1:18080/mcp (x-api-key: integration-test-key)");
process.exit(await child.exited);
