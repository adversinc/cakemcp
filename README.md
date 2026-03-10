# advers-mcp

Production-oriented MVP of a remote MCP server for centrally distributing project context to coding agents.

Stack:
- TypeScript
- Bun runtime
- [`punkpeye/fastmcp`](https://github.com/punkpeye/fastmcp)

## Run

```bash
bun install
cp .env.example .env
bun run start
```

By default, the server starts with `stdio` transport.

For remote mode:

```bash
MCP_TRANSPORT=httpStream PORT=8080 bun run start
```

## Environment Variables

- `CONTEXT_REGISTRY` (required)
  - local path to the registry
  - or git URL (`https://...`, `ssh://...`, `git@...`, `*.git`)
- `REGISTRY_KEY` (optional)
  - key/token for private HTTPS git registry access
  - if it contains `:`, it is treated as Basic auth (`username:password`)
  - otherwise it is treated as a Bearer token
- `CACHE_EXPIRY` (optional)
  - cache TTL in seconds (default `300`)
- `MCP_TRANSPORT` (optional)
  - `stdio` (default) or `httpStream`
- `PORT`, `HOST` (optional)
  - used for `httpStream`
- `DEBUG_MCP` (optional)
  - set to `1` to enable resolve_context debug traces
- `DEBUG_MCP_OUTPUT` (optional)
  - output file path for debug traces (default `./data/output.log`)

## Registry Layout

```text
projects/*.yaml
layers/global/*.md
layers/language/*.md
layers/framework/*.md
layers/project/*.md
```

Layer authoring note:
- Prefer level-2 headings (`##`) inside layer markdown files, because the merged output already uses a top-level layer header (`# Layer: ...`) per block.

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
    - payment-rules
```

Rules:
- `name` is optional (defaults to `project_id` if missing)
- `layers.*` are optional
- project manifest is resolved from `projects/${project_id}.yaml` (or `.yml`)
- auto-layer is always attempted as `layers/project/${name}.md`

## MCP Tools

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

## Error Handling and Degradation

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
- if refresh fails but local copy exists, stale cache is used and an error is logged

## Logging

JSON structured logs include:
- startup summary (without secrets)
- provider type (`local`/`git`)
- cache hit / refresh events
- project lookup
- warnings for missing layers
- git refresh failures

## Tests

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

## Current MVP Limitations

- no database, vector DB, or embeddings
- no UI/admin/auth platform
- no heavy enterprise abstractions
- tool output is returned as a JSON string (MCP-client friendly)

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
