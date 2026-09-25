# cakemcp

MCP server for centrally distributing multiple projects context to coding agents.

`cakemcp` stands for a multi-layered but simple architecture and approach. Like a piece of cake.

## Basics

This project is intended to distribute a centralized knowledge base for multiple projects written in multiple languages. 
It is designed to provide a single source of truth for all AI agents in a company without duplicating or scattering core 
rules across many repositories.

The knowledge base itself is collected from either a git repository (public or private), or a local directory.

The knowledge base is split into layers:
- global agreements and engineering standards shared across all projects
- domain-level rules shared by projects in the same business or product area
- language-specific rules
- framework-related instructions and agreements
- project-level specifics

Layers are stored together to make de-duplication and sharing easier across projects, including AI-assisted maintenance 
workflows.

`cakemcp` MCP server can be used locally over `stdio` as well as remotely over the network, including authenticated 
deployments.

The service is designed to run safely in Kubernetes environments and is also suitable for Docker-based deployments, 
including setups exposed to the public internet.

Stack:
- TypeScript
- Bun runtime
- [`punkpeye/fastmcp`](https://github.com/punkpeye/fastmcp)

## Installation and usage

### Local run

```bash
bun install
cp .env.example .env
bun run start
```

By default, the server starts with `stdio` transport.

### Network (HTTP) usage

For remote mode set env:

```bash
MCP_TRANSPORT=httpStream ACCESS_API_KEY=1111 PORT=8080 bun run start
```

### Jetbrains AI Assistant

Jetbrains AI Assistant settings contain MCP servers list. Depending on your
deployment add STDIO or HTTP server.

HTTP servers can be used with API key authentication:

```
{
  "mcpServers": {
    "your_server_name": {
      "url": "https://localhost:8080",
      "headers": {
        "X-API-Key": "...."
      }
    }
  }
}
```

### Codex CLI

Codex CLI also supports OAuth authentication. 

1. Add your server to ~/.codex/config.toml:

[mcp_servers.your_server_name]
url = "https://<domain-name>/mcp"
oauth_resource = "https//<domain-name>"

As for 2026-03-20 the `oauth_resource` is required because Codex does not
provide "resource" URL parameter properly due to the bug.

2. Login to your MCP:

```codex mcp login your_server_name```

### Example data

The `demo-data` folders are intended to show example usage for three projects:
- frontend, written in TypeScript + MeteorJS
- backend, written in TypeScript + Bun + Elysia
- billing service, written in C#

Project manifests contain the list of knowledge layers used by each project. Some knowledge is shared across projects, 
for example global agreements used everywhere or language-specific rules reused by both frontend and backend services.

Adding a new project, such as an auth backend service, typically requires creating a project manifest file and, if 
needed, adding project-specific knowledge layers.

Projects do not need to share any knowledge at all. This also supports cases where multiple unrelated company products 
are stored in the same centralized registry.

TODO: The `demo-data` content is currently marked as TODO and will be synced soon.

## Data access paradigm

"All data available once authorized". There is no scope-based access control within the knowledge base itself. 
Any developer or AI agent in the company may access any included project knowledge once they are authorized to use 
`cakemcp`.

This means you need to:
- configure proper IAM access for entry into `cakemcp`
- avoid storing keys, tokens, or secrets inside the knowledge repository (as usual)

If it is truly necessary, sensitive data can be placed in `AGENTS.md` within the corresponding project code 
repository instead.

## Conceptual Limitations

- no database required, vector DB, or embeddings
- optional read-only Web UI; no content editor or account-management platform
- no heavy enterprise abstractions
- tool output is returned as a JSON string (MCP-client friendly)

## Environment Variables

- `CONTEXT_REGISTRY` (required)
  - local path to the registry
  - or git URL (`https://...`, `ssh://...`, `git@...`, `*.git`)
- `REGISTRY_DIR` (optional)
  - directory inside `CONTEXT_REGISTRY` that contains `projects/` and `layers/`
  - defaults to `contexts`
  - use `.` when the registry lives at the repo root
- `REGISTRY_KEY` (optional)
  - key/token for private HTTPS git registry access
  - if it contains `:`, it is treated as Basic auth (`username:password`)
  - otherwise it is treated as a token for HTTPS git authentication
- `REGISTRY_KEY_FILE` (optional)
  - path to a file containing the private registry token/key
  - used only when `REGISTRY_KEY` is not set
- `CACHE_EXPIRY` (optional)
  - repository cache TTL in seconds (default `300`)
- `MCP_TRANSPORT` (optional)
  - `stdio` (default) or `httpStream`
  - when using `httpStream`, `OAUTH_AUTH_ENDPOINT` must be set explicitly
- `PORT`, `HOST` (optional)
  - used for `httpStream`
- `OAUTH_AUTH_ENDPOINT` (optional, but required for `httpStream`)
  - set to an OAuth authorization endpoint URL to enable FastMCP generic OAuth auth
  - set to `NONE` to disable OAuth explicitly and leave the server open
- `OAUTH_BASE_URL` (required when OAuth is enabled)
  - public base URL of this MCP server, used for OAuth callback/proxy endpoints
- `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` (required when OAuth is enabled)
  - upstream OAuth client credentials
- `OAUTH_TOKEN_ENDPOINT` (required when OAuth is enabled)
  - upstream OAuth token endpoint URL
- `OAUTH_SCOPES` (optional)
  - space- or comma-separated scopes for the generic OAuth provider
  - defaults to `openid profile`
- `ACCESS_API_KEY` (optional)
  - enables fixed API key auth via `x-api-key`
  - cannot be used together with an enabled `OAUTH_AUTH_ENDPOINT`
- `DEBUG_MCP` (optional)
  - set to `1` to enable `resolve_context` debug traces. Saves ouput summaries to `DEBUG_MCP_OUTPUT` file 
- `DEBUG_MCP_OUTPUT` (optional)
  - output file path for debug traces (default `./output.log`)

## MCP Access Auth

All tools follow the same auth gate:
- `OAUTH_AUTH_ENDPOINT=NONE` or unset on `stdio`: no auth required
- `OAUTH_AUTH_ENDPOINT=<url>`: FastMCP generic OAuth provider is enabled and every tool uses `canAccess: requireAuth`
- `ACCESS_API_KEY=<key>`: custom auth is enabled and every request must send `x-api-key: <key>`

Invalid combinations:
- `OAUTH_AUTH_ENDPOINT=<url>` together with `ACCESS_API_KEY` throws `Can not use both OAUTH_AUTH_ENDPOINT and ACCESS_API_KEY, please choose one.`
- `MCP_TRANSPORT=httpStream` without `OAUTH_AUTH_ENDPOINT` and without `ACCESS_API_KEY` throws `OAUTH_AUTH_ENDPOINT or ACCESS_API_KEY is required when MCP_TRANSPORT=httpStream. Set to "OAUTH_AUTH_ENDPOINT=NONE" if you want leave your MCP server open.`

## Registry Layout

```text
projects/*.yaml - project manifests
layers/ - layer markdown files
layers/global/*.md
layers/domain/*.md
layers/language/*.md
layers/framework/*.md
layers/project/*.md
```

### Layer authoring note

Prefer level-2 headings (`##`) inside layer markdown files, because the merged output already uses a top-level layer
header (`# Layer: ...`) per block.

### Manifest Example

```yaml
name: billing-service
layers:
  global:
    - formatting
    - engineering
  language:
    - typescript
  framework:
    - nextjs
    - bun
  domain:
    - commerce
  project:
    - billing-service # This is actually redundant, layers/project/billing-service.md is auto-added
    - payment-rules
```

Rules:
- `name` is optional (defaults to `project_id` if missing)
- `layers.*` are optional
- `layers.domain` lists thematic layers shared by a family of related projects; domain layers are not auto-added
- project manifest is resolved by project_id from `projects/${project_id}.yaml`
- auto-layer is always attempted as `layers/project/${name}.md` (even if not specified in `manifest.project`)

## MCP Tools Reference

### `resolve_context`

Input:
- `project_id: string`
- `task_type?: string`
- `path?: string`
- `changed_files?: string[]`

Behavior:
1. Loads `projects/${project_id}.yaml`
2. Applies layers in strict order:
   - `global`
   - `domain`
   - `language`
   - `framework`
   - `project` (from manifest)
3. Always tries to append `layers/project/${projectName}.md`
4. Merges markdown into `merged_content` with layer separators

Output (JSON string):
- `project_id`
- `project_name`
- `resolved_layers[]` (`type`, `name`, `path`, `priority`, `revision`)
- `merged_content`
- `warnings[]` (if any)

`merged_content` example fragment:

```md
# Layer: global/formatting
...content...

# Layer: language/typescript
...content...
```

### `list_projects`
Returns available project IDs.

### `get_project_manifest`
Input: `project_id`.
Returns parsed manifest.

### `get_layer`
Input: `type`, `name`.
Returns raw layer content.

## Implementation Notes

### Error Handling and Degradation

`resolve_context` degrades gracefully when instructions cannot be built
completely:
- missing or unreadable layers are added to `warnings`, while available layers
  are still returned
- project, manifest, registry, and unexpected generation errors return an empty
  partial result with `warnings`
- every generation error is appended to `merged_content` under
  `# Instruction generation errors`
- the appended instruction tells the agent to notify the user about the named
  knowledge MCP server and lists every error

Git provider behavior:
- stores a local checkout in a temp cache directory
- does not perform a full clone on every request
- refreshes no more often than `CACHE_EXPIRY`
- resolves the registry under `REGISTRY_DIR` inside the cloned repo
- if refresh fails but local copy exists, stale cache is used and an error is logged

### Logging

JSON structured logs include:
- startup summary (without secrets)
- provider type (`local`/`git`)
- cache hit / refresh events
- project lookup
- warnings for missing layers
- git refresh failures

### Tests

```bash
bun test
```

Covered scenarios:
- local `resolve_context`
- strict layer order
- auto-add `layers/project/${projectName}.md`
- missing optional layer does not break resolve
- project not found
- manifest parsing
- basic cache behavior

## Debug Mode

Set `DEBUG_MCP=1` to append per-request `resolve_context` traces to `./data/output.log`.

Example format:

```text
request_id=...
time=...
tool=resolve_context
project_id=billing-service
manifest=projects/billing-service.yaml
layers=[
  global/formatting.md,
  language/typescript.md,
  framework/nextjs.md,
  domain/commerce.md,
  project/payment-rules.md,
  project/billing-service.md
]
warnings=[...]
merged_size=18423
cache=hit
duration_ms=47
```

### Further debugging

To debug the actual output of `resolve_context` and other tools, use official SDK inspector:

```bash
npx @modelcontextprotocol/inspector
```

## Web UI

The optional viewer provides **Projects**, **Layers**, **Cross-references**, **Diagnostics**, and **Registry** pages,
with light/dark/system themes, direct links, layer usage, and a `Ctrl+K` / `Cmd+K` quick search.
Project pages include the exact assembled context (with sanitized operational errors), ordered layers,
raw YAML, and diagnostics. Copy or download instructions in their original language.
Registry documents are read-only and embedded HTML is not executed. Remote Markdown images are
rendered as alt text to avoid external tracking requests.

### Enable the viewer

```bash
bun install
bun run build:web
WEB_UI_ENABLED=true WEB_UI_PORT=8081 bun run start
```

Open `http://localhost:8081`. The viewer is disabled by default. It uses a separate Bun HTTP listener
in the same process, sharing registry/resolver instances with MCP. It works with both `stdio` and
`httpStream`; all application logs go to stderr to preserve the stdio protocol stream.
`SIGINT` and `SIGTERM` stop both listeners. A port binding failure stops startup.

| Variable | Default / requirement |
| --- | --- |
| `WEB_UI_ENABLED` | `false`; `true` or `1` enables the viewer |
| `WEB_UI_PORT` | Required when enabled; integer 1–65535, distinct from the MCP HTTP port |
| `WEB_UI_HOST` | `0.0.0.0` |
| `WEB_UI_BASE_PATH` | `/`; optional URL prefix such as `/browse`, configured at runtime |
| `WEB_UI_CONFIG` | Unset/empty means public access; JSON object or local JSON file path |
| `WEB_UI_BASE_URL` | Required with SSO; public origin without a path |
| `WEB_UI_SESSION_SECRET` | Required with SSO; at least 32 bytes of random material, shared across replicas |
| `BABELSHARK_PROJECT_ID` | Optional positive integer; requires access code as well |
| `BABELSHARK_ACCESS_CODE` | Optional public embed code; requires project ID as well |

With no SSO providers, **both the viewer and its read-only API are public**, independently of MCP
authentication. The interface displays **Public access**. Disabling the viewer starts no additional
listener and requires none of its settings.

### Configure multiple SSO providers

Create a **Web** OIDC application in each Zitadel project, using Authorization Code, PKCE S256,
and `client_secret_post` authentication. Set **User Roles Inside ID Token** and ensure the
project-specific roles are returned (the viewer requests `urn:zitadel:iam:org:projects:roles`).
Create and assign the `cakemcp-viewer` project role to authorized users.

Use `web-ui.example.json` as a template. Replace its client and project IDs with your own values.
The callback URL for each provider is:

```text
https://context.example.com/auth/callback/onquests
https://context.example.com/auth/callback/mysmartbots
```

Set configuration using either form:

```bash
# File path; paths are relative to the process working directory unless absolute.
WEB_UI_CONFIG=./web-ui.example.json

# Equivalent inline JSON (one provider shown).
WEB_UI_CONFIG='{"sso":{"providers":[{"id":"onquests","name":"OnQuests","issuer":"https://auth.onquests.ru","clientId":"YOUR_CLIENT_ID","clientSecretEnv":"ONQUESTS_WEB_CLIENT_SECRET","projectId":"123456789","requiredRole":"cakemcp-viewer"}]}}'
```

Set `ONQUESTS_WEB_CLIENT_SECRET` and `MYSMARTBOTS_WEB_CLIENT_SECRET` in the environment, along with
`WEB_UI_BASE_URL` and `WEB_UI_SESSION_SECRET` (`openssl rand -hex 32` can generate the latter).
Never put client secrets in the frontend. Provider names, IDs and BabelShark public embed credentials
are the only configuration exposed by `/api/session`.

`WEB_UI_CONFIG` is parsed as JSON first; successfully parsed values must be objects matching the schema.
Malformed values beginning with `{` or `[` are rejected as JSON. Other values are literal file paths:
URLs and control characters are rejected; shell syntax, `~`, and environment variables are not expanded.
The target must be a readable regular file containing valid JSON. Symlinks to regular files are supported
for Kubernetes mounts. Invalid explicit configuration fails startup rather than opening access.
An empty object, omitted `sso.providers`, or an empty provider array deliberately selects public access.
Settings are read at startup; restart to apply changes.

The backend validates OIDC signatures, issuer, audience, nonce, state, PKCE, and the role under
`urn:zitadel:iam:org:project:{projectId}:roles`. A generic role claim from another project is not sufficient.
Users are identified by `(issuer, sub)`; matching email addresses are not merged.

Sessions use encrypted, authenticated, host-only `HttpOnly; Secure; SameSite=Lax` cookies containing
no OIDC tokens. They expire after one hour, at which point roles are checked on the next login.
Role revocation therefore takes effect within one hour. Provider-policy changes invalidate existing
sessions after restart. A common secret allows multiple replicas without a session database.
Sign out clears the browser session only; it does not log the user out of their other SSO applications.
As with stateless cookies generally, a separately copied cookie remains valid until expiry.
HTTPS is required in production. Plain HTTP is allowed only on loopback origins outside production.

### BabelShark

Provide **both** `BABELSHARK_PROJECT_ID` and `BABELSHARK_ACCESS_CODE` to enable the single embed loader
and language selector. With either value missing, no localization script is loaded and no selector
is shown. If loading fails, the English UI remains usable.

English source strings use BabelShark `__` markers, dynamic values use `__var`, and registry content
uses `__bs-ignore`. There is no parallel translation-key dictionary. Browser language detection is
disabled; users choose the language through the built-in selector. Attribute-only labels remain in
English unless supported by the configured embed version; translatable text labels accompany controls.
Real translation availability depends on the configured BabelShark project.

### Development and verification

```bash
bun run build:web
bun --no-env-file test
bun run typecheck
bun run typecheck:web
bun run lint
bunx playwright install chromium --only-shell
bun run test:e2e
```

For frontend HMR, start the enabled backend and run `WEB_UI_PORT=8081 bun run dev:web` in a second
terminal. Vite proxies `/api` and `/auth` to that backend. For SSO development, set `WEB_UI_BASE_URL`
and the Zitadel callback URL to the Vite origin. Production serves built assets directly from Bun;
no Vite server is needed.

Browser tests use an isolated fixture registry. OIDC integration tests run a local provider with signed
tokens and cover both providers, denial, invalid claims/signatures, PKCE, expiry and logout. BabelShark
browser tests validate configuration, loader isolation and markup with a stub; real SSO and translated
language checks require deployment-specific credentials.

### Docker

The image builds the frontend with development dependencies and includes its static output:

```bash
docker build -t cakemcp .
docker run --rm -i -p 8081:8081 \
  -v "$PWD/demo-data:/registry:ro" \
  -e CONTEXT_REGISTRY=/registry -e REGISTRY_DIR=. \
  -e WEB_UI_ENABLED=true -e WEB_UI_PORT=8081 cakemcp
```

This example uses MCP stdio and public viewer access. With HTTP MCP, additionally publish its port and
configure its existing authentication settings. For SSO mount the JSON config read-only, inject secrets,
and route the public HTTPS origin to the viewer port. TLS termination may be handled by your proxy.

### Read-only API

- `GET /api/session`: public login options, current browser identity and optional BabelShark config.
- `GET /api/catalog`: projects, all layers, usage index and diagnostics.
- `GET /api/projects/:id`: raw manifest, assembled context and ordered layer metadata.
- `GET /api/layers/:type/:name`: source text and revision.
- `GET /api/registry`: availability and sanitized synchronization status.

All data routes require a viewer session when SSO is configured. Responses are not cached by browsers;
registry reads still respect `CACHE_EXPIRY`. Refreshing the UI does not force a Git fetch. Failed Git
refreshes keep serving the previous checkout and retry after the cache interval. No absolute server
paths or provider credentials are included in operational API responses.

### Conditional cross-references

The Cross-references page indexes Markdown text blocks containing both `resolve_context` and a literal
`project_id=...` assignment (with optional whitespace and quotes). Wrapped lines within a paragraph are supported; separate paragraphs and list items are kept apart. Each occurrence shows its layer, starting line number, source projects, target project, and original instruction.
Shared layers list all projects that include them in one row, including automatic project layers. Unused layers and missing targets
are labeled explicitly. This is a textual index, not an evaluation of conditions or a recursive
context expansion. It is rebuilt with the viewer catalog and follows the registry cache lifetime.

### Hosting the viewer under a path

Set `WEB_UI_ENABLED=true`, `WEB_UI_PORT=8081`, and `WEB_UI_BASE_PATH=/browse`.
Route `/browse` with a Kubernetes Ingress `Prefix` path to the viewer service port 8081,
without stripping or rewriting the prefix. Keep the existing `/` route on MCP port 8080.
The same production image supports both root and prefixed hosting; no rebuild for the path is required.
The server redirects `/browse` to `/browse/`, and deep links, assets, API and authentication stay under this prefix.

With SSO, keep `WEB_UI_BASE_URL=https://cakemcp.infra.mysmartbots.com` (origin only) and register
`https://cakemcp.infra.mysmartbots.com/browse/auth/callback/<provider-id>` in each Zitadel application.
Session cookies remain host-only with `Path=/` to retain the `__Host-` security guarantees.
For Vite development use the default root path; test prefixed hosting through the production Bun viewer.
