# cakemcp

MCP server for centrally distributing multiple projects context to coding agents.

`cakemcp` stands for a multi-layered but simple architecture and approach. Like a piece of cake.

## Basics

This project is intended to distribute a centralized knowledge base for multiple projects written in multiple languages. 
It is designed to provide a single source of truth for all AI agents in a company without duplicating or scattering core 
rules across many repositories.

The knowledge base itself is collected from either a git repository (public or private), or a local directory.

The knowledge base is split into layers:
- global agreements
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

## Example usage

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
- no UI/admin/auth platform
- no heavy enterprise abstractions
- tool output is returned as a JSON string (MCP-client friendly)

## Run

```bash
bun install
cp .env.example .env
bun run start
```

By default, the server starts with `stdio` transport.

For remote mode:

```bash
MCP_TRANSPORT=httpStream OAUTH_AUTH_ENDPOINT=NONE PORT=8080 bun run start
```

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
  project:
    - billing-service # This is actually redundant, layers/project/billing-service.md is auto-added
    - payment-rules
```

Rules:
- `name` is optional (defaults to `project_id` if missing)
- `layers.*` are optional
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

`resolve_context` does not fail because of a missing optional layer from the manifest:
- missing layer is added to `warnings`

`resolve_context` fails only when:
- project is not found
- registry is unavailable and no cache is available
- manifest is invalid

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
