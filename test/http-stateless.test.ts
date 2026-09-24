import { expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createServer } from "node:net";
import { resolve } from "node:path";

/** Reserves an available loopback port for the isolated server process. */
async function availablePort(): Promise<number> {
	const listener = createServer();
	await new Promise<void>((resolve, reject) => {
		listener.once("error", reject);
		listener.listen(0, "127.0.0.1", resolve);
	});
	const address = listener.address();
	if(!address || typeof address === "string") {
		throw new Error("Expected a TCP address");
	}

	await new Promise<void>((resolve, reject) => {
		listener.close((error) => error ? reject(error) : resolve());
	});
	return address.port;
}

/** Waits for startup without relying on a fixed process initialization delay. */
async function waitForHealth(baseUrl: string): Promise<void> {
	for(let attempt = 0; attempt < 100; attempt++) {
		try {
			const response = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(500) });
			await response.text();
			if(response.ok) {
				return;
			}
		} catch{
			// The child may not have bound its HTTP listener yet.
		}
		await Bun.sleep(50);
	}
	throw new Error("MCP server did not become healthy");
}

test("stateless HTTP supports SDK lifecycle, errors and concurrent clients without capability warnings", async () => {
	const root = resolve(import.meta.dir, "..");
	const port = await availablePort();
	const baseUrl = `http://127.0.0.1:${port}`;
	// Keep developer credentials and .env settings out of this integration test.
	const child = Bun.spawn([process.execPath, "--no-env-file", "run", "src/index.ts"], {
		cwd: root,
		env: {
			PATH: process.env.PATH ?? "",
			CONTEXT_REGISTRY: resolve(root, "test/fixtures/local-registry"),
			MCP_TRANSPORT: "httpStream",
			HOST: "127.0.0.1",
			PORT: String(port),
			ACCESS_API_KEY: "integration-test-key",
		},
		stdout: "pipe",
		stderr: "pipe",
	});
	const stdout = new Response(child.stdout).text();
	const stderr = new Response(child.stderr).text();
	const headers = {
		"content-type": "application/json",
		"accept": "application/json, text/event-stream",
		"x-api-key": "integration-test-key",
		"mcp-protocol-version": "2024-11-05",
	};

	/** Posts JSON-RPC and decodes either JSON or a Streamable HTTP SSE response. */
	const request = async (id: number, method: string, params: object) => {
		const response = await fetch(`${baseUrl}/mcp`, {
			method: "POST",
			headers,
			body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
			signal: AbortSignal.timeout(3000),
		});
		expect(response.status).toBe(200);
		expect(response.headers.get("mcp-session-id")).toBeNull();

		const body = await response.text();
		const data = response.headers.get("content-type")?.includes("text/event-stream") ?
			body.split("\n").find((line) => line.startsWith("data:"))?.slice(5) : body;
		expect(data).toBeDefined();
		const message = JSON.parse(data!);
		expect(message.id).toBe(id);
		expect(message.error).toBeUndefined();
		return message.result;
	};

	try {
		await waitForHealth(baseUrl);
		for(const key of [undefined, "wrong-key"]) {
			const authHeaders: Record<string, string> = { ...headers };
			if(key === undefined) {
				delete authHeaders["x-api-key"];
			} else {
				authHeaders["x-api-key"] = key;
			}
			const denied = await fetch(`${baseUrl}/mcp`, {
				method: "POST",
				headers: authHeaders,
				body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "tools/list", params: {} }),
				signal: AbortSignal.timeout(3000),
			});
			await denied.text();
			expect(denied.status).toBe(401);
		}

		const initialized = await request(1, "initialize", {
			protocolVersion: "2024-11-05",
			capabilities: {},
			clientInfo: { name: "cakemcp-integration-test", version: "1.0.0" },
		});
		expect(initialized.serverInfo.name).toBe("cakemcp");
		const listed = await request(2, "tools/list", {});
		expect(listed.tools.some((tool: { name: string }) => tool.name === "resolve_context")).toBe(true);

		// Separate requests must work without carrying an MCP session ID.
		for(const id of [3, 4]) {
			const result = await request(id, "tools/call", {
				name: "resolve_context",
				arguments: { project_id: "name-fallback" },
			});
			expect(result.isError).not.toBe(true);
			const context = JSON.parse(result.content[0].text);
			expect(context.project_id).toBe("name-fallback");
			expect(context.merged_content).toContain("formatting");
		}

		const exchanges: { method?: string; protocol?: string | null; accept?: string | null }[] = [];
		const clients: Client[] = [];

		/** Uses real SDK negotiation and records outgoing protocol messages without credentials. */
		const connectClient = async (name: string) => {
			const client = new Client({ name, version: "1.0.0" }, { capabilities: {} });
			clients.push(client);
			const transport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`), {
				requestInit: { headers: { "x-api-key": "integration-test-key" } },
				fetch: async (url, init) => {
					const outgoing = new Headers(init?.headers);
					const message = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
					exchanges.push({
						method: message?.method,
						protocol: outgoing.get("mcp-protocol-version"),
						accept: outgoing.get("accept"),
					});
					return fetch(url, init);
				},
			});
			await client.connect(transport);
			expect(transport.sessionId).toBeUndefined();
			expect(client.getServerVersion()?.name).toBe("cakemcp");
			return client;
		};

		/** Decodes the application's JSON text envelope after SDK validation. */
		const call = async (client: Client, name: string, args?: Record<string, unknown>) => {
			const result = await client.callTool({ name, ...(args ? { arguments: args } : {}) });
			expect(result.isError).not.toBe(true);
			const content = result.content as{ type: string; text: string }[];
			expect(content[0]?.type).toBe("text");
			return JSON.parse(content[0]!.text);
		};

		try {
			const first = await connectClient("agent-one");
			const second = await connectClient("agent-two");
			const tools = await first.listTools();
			expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
				"get_layer", "get_project_manifest", "list_projects", "resolve_context",
			]);
			expect((await call(first, "list_projects")).project_ids).toContain("name-fallback");
			expect((await call(first, "get_project_manifest", { project_id: "name-fallback" })).name)
				.toBe("name-fallback");

			// Both clients reuse their own request-ID sequences. Responses must stay isolated.
			const jobs = Array.from({ length: 24 }, (_, index) => (async () => {
				const client = index % 2 === 0 ? first : second;
				if(index % 3 === 0) {
					const layer = await call(client, "get_layer", { type: "global", name: "formatting" });
					expect(layer.name).toBe("formatting");
					expect(layer.content).toContain("Prefer explicit naming.");
				} else {
					const project = index % 3 === 1 ? "name-fallback" : "dedupe-auto-layer";
					const context = await call(client, "resolve_context", { project_id: project });
					expect(context.project_id).toBe(project);
					expect(context.merged_content).toContain("Prefer explicit naming.");
				}
			})());
			// Drain every request even on failure before closing the clients.
			const settled = await Promise.allSettled(jobs);
			for(const result of settled) {
				if(result.status === "rejected") {
					throw result.reason;
				}
			}

			const missing = await first.callTool({
				name: "get_layer", arguments: { type: "global", name: "missing-layer" },
			});
			expect(missing.isError).toBe(true);
			expect(JSON.stringify(missing.content)).toContain("layer_not_found");
			await expect(first.callTool({ name: "resolve_context", arguments: {} }))
				.rejects.toMatchObject({ code: -32602 });
			await expect(first.callTool({ name: "unknown_tool", arguments: {} }))
				.rejects.toMatchObject({ code: -32601 });
			expect((await call(first, "list_projects")).project_ids).toContain("name-fallback");

			await first.close();
			const reconnected = await connectClient("agent-one-reconnected");
			expect((await call(reconnected, "resolve_context", { project_id: "name-fallback" })).project_id)
				.toBe("name-fallback");
			expect((await call(second, "list_projects")).project_ids).toContain("name-fallback");

			expect(exchanges.filter((entry) => entry.method === "initialize")).toHaveLength(3);
			expect(exchanges.filter((entry) => entry.method === "notifications/initialized")).toHaveLength(3);
			const toolRequests = exchanges.filter((entry) => entry.method === "tools/call");
			expect(toolRequests.length).toBeGreaterThan(24);
			for(const entry of toolRequests) {
				expect(entry.protocol).toBeTruthy();
				expect(entry.accept).toContain("text/event-stream");
			}
		} finally {
			await Promise.allSettled(clients.map((client) => client.close()));
		}

		// FastMCP 3.x warned in the background after 10 attempts at 100 ms.
		await Bun.sleep(1300);
	} finally {
		child.kill();
		await child.exited;
	}

	const logs = `${await stdout}\n${await stderr}`;
	expect(logs).not.toContain("could not infer client capabilities");
	expect(logs).not.toContain("[FastMCP error]");
}, 15000);
