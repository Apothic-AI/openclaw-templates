# openclaw-templates

CLI for managing and building OpenClaw workspace include templates.

`openclaw-templates` reads `<openclaw-dir>/openclaw.json` (default: `~/.openclaw/openclaw.json`), prepares per-agent template trees in `<template-dir>` (default: `~/.openclaw-templates`), and builds rendered files into agent workspaces using [`markdown-include`](https://www.npmjs.com/package/markdown-include).

## Features

- Entrypoint templates for all OpenClaw workspace .md files.
- Uses agent values from `<openclaw-dir>/openclaw.json` (default: `~/.openclaw/openclaw.json`) to discover agent workspaces.
- Reuses shared include fragments from `<template-dir>/.includes/**` (default: `~/.openclaw-templates/.includes/**`).
- Builds recursively (files + subdirectories).
- Compiles all markdown files that contain `#include "..."` tags.
- Supports selective overwrite and wipe behavior.
- Protects workspace git metadata (`.git`) during build/wipe.

## Quick Start

### Install

```bash
npm install -g openclaw-templates
```

### Initialize

After installing, initialize openclaw-templates. This will create a subdirectory under your template directory (default: `~/.openclaw-templates`) for each of your existing openclaw workspaces.

```bash
openclaw-templates init
```

You will also now have a `~/.openclaw-templates/.includes` directory containing prompt file sections to be injected/included in your workspace templates.

**Example (With just the default agent):**

```
> tree -a ~/.openclaw-templates
/home/user/.openclaw-templates
├── .includes
│   ├── AGENTS
│   │   ├── EVERY_SESSION.md
│   │   ├── EXTERNAL_VS_INTERNAL.md
│   │   ├── FIRST_RUN.md
│   │   ├── GROUP_CHATS.md
│   │   ├── HEADER.md
│   │   ├── HEARTBEATS.md
│   │   ├── HEARTBEAT_VS_CRON.md
│   │   ├── KNOW_WHEN_TO_SPEAK.md
│   │   ├── MAKE_IT_YOURS.md
│   │   ├── MEMORY_MAINTENANCE.md
│   │   ├── MEMORY.md
│   │   ├── MEMORY_MD_LONG_TERM.md
│   │   ├── PROACTIVE_WORK.md
│   │   ├── REACT_LIKE_A_HUMAN.md
│   │   ├── SAFETY.md
│   │   ├── THINGS_TO_CHECK.md
│   │   ├── TOOLS.md
│   │   ├── WHEN_TO_REACH_OUT.md
│   │   ├── WHEN_TO_STAY_QUIET.md
│   │   ├── WRITE_IT_DOWN.md
│   │   └── YOUR_WORKSPACE.md
│   ├── BOOT
│   │   ├── CONTENT.md
│   │   └── HEADER.md
│   ├── BOOTSTRAP
│   │   ├── AFTER_YOU_KNOW_WHO_YOU_ARE.md
│   │   ├── CONNECT_OPTIONAL.md
│   │   ├── FOOTER.md
│   │   ├── HEADER.md
│   │   ├── THE_CONVERSATION.md
│   │   └── WHEN_YOU_ARE_DONE.md
│   ├── HEARTBEAT
│   │   ├── CONTENT.md
│   │   └── HEADER.md
│   ├── IDENTITY
│   │   ├── HEADER.md
│   │   ├── NOTES.md
│   │   └── PROFILE.md
│   ├── SOUL
│   │   ├── BOUNDARIES.md
│   │   ├── CONTINUITY.md
│   │   ├── CORE_TRUTHS.md
│   │   ├── FOOTER.md
│   │   ├── HEADER.md
│   │   └── VIBE.md
│   ├── TOOLS
│   │   ├── EXAMPLES.md
│   │   ├── FOOTER.md
│   │   ├── HEADER.md
│   │   ├── WHAT_GOES_HERE.md
│   │   └── WHY_SEPARATE.md
│   └── USER
│       ├── CONTEXT.md
│       ├── FOOTER.md
│       ├── HEADER.md
│       └── PROFILE.md
└── main
    ├── AGENTS.md
    ├── BOOT.md
    ├── BOOTSTRAP.md
    ├── HEARTBEAT.md
    ├── IDENTITY.md
    ├── SOUL.md
    ├── TOOLS.md
    └── USER.md

11 directories, 57 files
```

### Edit

The easiest way to manually manage your workspace templates is in an IDE like Visual Studio Code:

```bash
code ~/.openclaw-templates
```

### Build

Once your templates meet your standards you can build them back into your OpenClaw directory (default: `~/.openclaw`).

**Build all your templates:**

```bash
openclaw-templates build
```

**OR selectively build one by agent ID:**

```bash
openclaw-templates build main
```

### New Agents

If you created new OpenClaw agents after running `openclaw-templates init` you will need to initialize their templates.

**Pull new agents into `~/.openclaw-templates`:**

```bash
openclaw-templates pull-agents
```

and you will now see their template structures in `~/.openclaw-templates`

## Requirements

- Node.js (tested on Node 25; CI runs Node 22)
- pnpm
- Existing OpenClaw config at:
  - default: `~/.openclaw/openclaw.json`
  - or pass `--openclaw-dir <path>`
  - or set `OCLAWTPL_OPENCLAW`

### Local development (this repo)

```bash
pnpm install
pnpm link --global
```

Then:

```bash
openclaw-templates --help
```

## Full Usage

```text
openclaw-templates [--openclaw-dir <path>] [--templates <path>] init [--force]
openclaw-templates [--openclaw-dir <path>] [--templates <path>] pull-agents
openclaw-templates [--openclaw-dir <path>] [--templates <path>] doctor
openclaw-templates [--openclaw-dir <path>] [--templates <path>] build [workspace] [--overwrite] [--wipe] [--force]
```

## Commands

### Global options

- `--openclaw-dir <path>`
  - OpenClaw root directory containing `openclaw.json`
  - defaults to `~/.openclaw`
  - environment fallback: `OCLAWTPL_OPENCLAW`
- `--templates <path>`
  - Templates root directory used by `init`, `pull-agents`, and `build`
  - defaults to `~/.openclaw-templates`
  - environment fallback: `OCLAWTPL_TEMPLATES`

Precedence:

- CLI flags (`--openclaw-dir`, `--templates`) override environment variables.
- Environment variables override built-in defaults.

### `init [--force]`

Initializes `<template-dir>` (default: `~/.openclaw-templates`) from the repository templates.

- Reads agent IDs/workspaces from `<openclaw-dir>/openclaw.json` (default: `~/.openclaw/openclaw.json`).
- Copies `templates/.includes` to `<template-dir>/.includes`.
- Creates one directory per agent id in `<template-dir>/<agent-id>/`.
- Copies all `templates/.base/*.md` entrypoints into each agent directory.

Behavior:

- If `<template-dir>` already exists:
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

### `pull-agents`

Adds templates for agent IDs that are present in `<openclaw-dir>/openclaw.json` but not yet present in `<template-dir>`.

Behavior:

- Requires `<template-dir>` to already exist (run `init` first).
- Creates missing per-agent directories in `<template-dir>/<agent-id>/`.
- Copies `templates/.base/*.md` entrypoints only for newly added agents.
- Does not overwrite existing agent template files/directories.
- Ensures `<template-dir>/.includes` exists.

### `build [workspace] [--overwrite] [--wipe] [--force]`

Builds templates from `<template-dir>` (default: `~/.openclaw-templates`) into workspace directories.

Selection:

- No `workspace` argument: build all configured agents.
- With `workspace` argument:
  - exact workspace path from config, or
  - agent id

Path safety:

- If `workspace` is passed as a path outside `<openclaw-dir>` (default: `~/.openclaw`), build is blocked.
- Use `--force` to allow that explicit external workspace-path target.

Build behavior:

- Recursively walks `<template-dir>/<agent-id>/`.
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
  - with explicit workspace-path selector, allows targets outside `<openclaw-dir>`

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

# 3) If new agents are later added to openclaw.json, sync only missing template dirs
openclaw-templates pull-agents

# 4) Build all agents
openclaw-templates build

# 5) Build a single agent by id
openclaw-templates build tom-assistant

# 6) Build a single explicit workspace path (outside ~/.openclaw requires --force)
openclaw-templates build /path/to/workspace --force

# 7) Use a non-default OpenClaw directory
openclaw-templates --openclaw-dir /path/to/openclaw doctor

# 8) Use a non-default templates directory
openclaw-templates --templates /path/to/openclaw-templates init

# 9) Use environment variables instead of flags
OCLAWTPL_OPENCLAW=/path/to/openclaw OCLAWTPL_TEMPLATES=/path/to/openclaw-templates openclaw-templates doctor
```

## Development

Run tests:

```bash
pnpm test
```

CI:

- GitHub Actions workflow at `.github/workflows/ci.yml`
- Runs `pnpm test` on pushes and pull requests

## License

Apache License 2.0. See `LICENSE`.
