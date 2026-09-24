# Local MCP verification

Run `bun run test:mcp` for deterministic HTTP and MCP SDK coverage. This starts and stops an isolated
server using fixture data; no model or production credentials are required.

Covered: API-key rejection, SDK initialization and initialized notifications, negotiated protocol headers,
all four tools, 24 concurrent calls across two clients, application errors, invalid parameters,
unknown tools, calls after errors, a fresh connection after client close, and the capability-warning regression.
The reconnect check is a deliberate close followed by a new client connection, not a simulated network failure.

## Codex CLI on macOS

If `codex` from PATH fails with `ENOENT`, try the CLI bundled with the desktop application.
On this Mac, the working binary is:

```sh
"/Applications/AI Tools/ChatGPT.app/Contents/Resources/codex" --version
"/Applications/AI Tools/ChatGPT.app/Contents/Resources/codex" exec --help
```

Use that quoted absolute path instead of `codex` when running the agent smoke test.
Verify it with `--version` before use; the application installation path may change.
A broken PATH launcher does not mean that the Codex CLI is unavailable.

## Optional real-agent smoke test

Run `bun run test:agent:server` in a terminal. Keep it running for the test, then stop it with Ctrl-C.
It binds only to loopback on port 18080, uses `test/fixtures/local-registry`, and ignores developer .env settings.
If that port is occupied, stop the conflicting test process first; do not use its responses as evidence.

Add a separate MCP entry to your test Codex configuration, leaving the production entry unchanged:

```toml
[mcp_servers.cakemcp_test]
url = "http://127.0.0.1:18080/mcp"
http_headers = { "x-api-key" = "integration-test-key" }
```

Start a fresh agent session that loads this entry. Give the agent this prompt:

> Use only the cakemcp_test MCP tools, not shell or file reads, to answer these questions.
> What projects are available? What is the manifest name of name-fallback?
> What formatting rules apply to name-fallback? Read the global formatting layer directly as well.
> Try reading the global layer missing-layer and report the error without inventing its content.
> Finally list the projects again to confirm you can still use the server after the error.

Verify both the tool-call trace and the answer:

- Calls target `cakemcp_test`, never the production MCP server.
- All four tools are used: list_projects, get_project_manifest, resolve_context, get_layer.
- The project list includes name-fallback and dedupe-auto-layer.
- The manifest name is name-fallback.
- The formatting layer says: "Use consistent formatting. Prefer explicit naming."
- The absent layer produces layer_not_found and the subsequent list_projects succeeds.
- Server output has no "could not infer client capabilities" warning after waiting at least two seconds.

This is a manual semantic smoke test, not part of `bun test`. Record the agent/client version and the
actual tool trace with its result. An SDK pass does not count as a real-agent pass, and one agent pass
cannot guarantee all client implementations. For unattended runs, use a working `codex exec` installation
with a test-only MCP configuration and validate its tool events as well as its final answer.

References:
- https://developers.openai.com/codex/mcp
- https://developers.openai.com/codex/noninteractive
