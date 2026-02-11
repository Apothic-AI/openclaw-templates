# openclaw-templates

CLI for managing and building OpenClaw workspace include templates.

`openclaw-templates` reads `~/.openclaw/openclaw.json`, prepares per-agent template trees in `~/.openclaw-templates`, and builds rendered files into agent workspaces using [`markdown-include`](https://www.npmjs.com/package/markdown-include).

## Features

- Uses agent `id` values from `~/.openclaw/openclaw.json`.
- Treats `templates/.base/*.md` as entrypoint templates.
- Reuses shared include fragments from `templates/.includes/**`.
- Builds recursively (files + subdirectories).
- Compiles markdown files that contain `#include "..."` tags.
- Supports selective overwrite and wipe behavior.
- Protects workspace git metadata (`.git`) during build/wipe.

## Requirements

- Node.js (tested on Node 25; CI runs Node 22)
- pnpm
- Existing OpenClaw config at:
  - `~/.openclaw/openclaw.json`

## Install

### Global (from npm, once published)

```bash
pnpm add -g openclaw-templates
```

### Local development (this repo)

```bash
pnpm install
pnpm link --global
```

Then:

```bash
openclaw-templates --help
```

## Usage

```text
openclaw-templates init [--force]
openclaw-templates doctor
openclaw-templates build [workspace] [--overwrite] [--wipe] [--force]
```

## Commands

### `init [--force]`

Initializes `~/.openclaw-templates` from the repository templates.

- Reads agent IDs/workspaces from `~/.openclaw/openclaw.json`.
- Copies `templates/.includes` to `~/.openclaw-templates/.includes`.
- Creates one directory per agent id in `~/.openclaw-templates/<agent-id>/`.
- Copies all `templates/.base/*.md` entrypoints into each agent directory.

Behavior:

- If `~/.openclaw-templates` already exists:
  - fails by default
  - recreates it when `--force` is supplied

### `doctor`

Validates local setup:

- OpenClaw config exists and parses as JSON
- `.agents.list` is an array
- no duplicate agent IDs
- no duplicate workspace paths
- `templates/.base` contains entrypoint markdown files
- `templates/.includes` exists

Outputs a summary with agent count and template count.

### `build [workspace] [--overwrite] [--wipe] [--force]`

Builds templates from `~/.openclaw-templates` into workspace directories.

Selection:

- No `workspace` argument: build all configured agents.
- With `workspace` argument:
  - exact workspace path from config, or
  - agent id

Path safety:

- If `workspace` is passed as a path outside `~/.openclaw`, build is blocked.
- Use `--force` to allow that explicit external workspace-path target.

Build behavior:

- Recursively walks `~/.openclaw-templates/<agent-id>/`.
- For markdown files:
  - if file has active include tags, compile and overwrite destination.
  - if file has no include tags, copy only when destination is missing (unless `--overwrite`).
- For non-markdown files:
  - copy only when destination is missing (unless `--overwrite`).

Flags:

- `--overwrite`
  - allows overwriting non-include files (markdown without include tags and non-markdown files)
- `--wipe`
  - clears workspace contents before build
  - preserves `.git` directory
- `--force`
  - with explicit workspace-path selector, allows targets outside `~/.openclaw`

## Git Safety Guarantees

`openclaw-templates` will not delete or overwrite workspace `.git` metadata:

- `--wipe` skips deleting `.git`.
- Build skips any template path that includes a `.git` segment.

## Template Layout

```text
templates/
  .base/
    *.md               # entrypoint templates copied per agent
  .includes/
    **/*.md            # shared include fragments
```

## Example Flow

```bash
# 1) Validate setup
openclaw-templates doctor

# 2) Initialize local include workspace
openclaw-templates init

# 3) Build all agents
openclaw-templates build

# 4) Build a single agent by id
openclaw-templates build tom-assistant

# 5) Build a single explicit workspace path (outside ~/.openclaw requires --force)
openclaw-templates build /path/to/workspace --force
```

## Development

Run tests:

```bash
pnpm test
```

CI:

- GitHub Actions workflow at `.github/workflows/ci.yml`
- Runs `pnpm test` on pushes and pull requests
