# Conductor

Provider-agnostic runtime for **bounded multi-agent software engineering workflows**.

Conductor orchestrates existing coding-agent CLIs instead of calling vendor APIs directly. Each provider keeps its own login/session, while Conductor owns workflow state, artifact handoff, isolation, and evidence.

## v0.1 workflow

```text
Task
  ↓
Explorer      → Cursor CLI
  ↓ discovery.md
Architect     → Claude Code / opus
  ↓ plan.md
Implementer   → Codex CLI / gpt-5.6-sol
  ↓ implementation.md
Reviewer      → Antigravity CLI
  ↓ review.md
Verification  → deterministic commands
```

Agent identity is separate from provider selection. Change `policies/routing.yaml` to move a role to another CLI/model without changing the workflow.

## Why

The project is intentionally greenfield. It does not depend on an existing SSOT, conversation transcript, or vendor-specific agent format.

Core principles:

- provider-agnostic roles
- artifact-based handoff
- bounded, declarative workflows
- isolated Git worktree per run
- independent reviewer
- persisted run telemetry and evidence
- official CLI authentication only; no OAuth/token extraction

See [docs/architecture.md](docs/architecture.md).

## Requirements

- Node.js 22+
- Git
- one or more supported CLIs installed and authenticated

Current adapters:

| Provider | Executable | Machine-readable mode |
| --- | --- | --- |
| Claude Code | `claude` | `--output-format stream-json` |
| Codex | `codex` | `exec --json` |
| Cursor | `cursor-agent` | `--output-format stream-json` |
| Antigravity | `agy` | `--output-format stream-json` |

Authenticate each CLI normally before using Conductor. Conductor does not read or copy their credentials.

## Install from source

```bash
git clone https://github.com/andermoreira/conductor.git
cd conductor
npm install
npm run check
npm run build
npm link
```

Check local integrations:

```bash
conductor doctor
```

## Run

The target repository must currently have a **clean working tree**. v0.1 creates an isolated branch/worktree from `HEAD`, so refusing dirty repositories prevents local uncommitted work from being silently omitted.

```bash
conductor run feature \
  "Add a cancellation endpoint with tests" \
  --repo /path/to/project
```

A successful run prints the isolated workspace and evidence paths. State defaults to `~/.conductor` and can be changed with `CONDUCTOR_HOME` or `--state-dir`.

## Configuration

### Agents

Agents define roles and permissions, not vendors:

```yaml
id: reviewer
role: independent-reviewer
permissions:
  filesystem: read-only
  shell: false
  network: false
prompt: |
  Review the implementation independently.
```

### Routing

Providers/models live separately:

```yaml
agents:
  architect:
    provider: claude
    model: opus

  implementer:
    provider: codex
    model: gpt-5.6-sol
    effort: high

  reviewer:
    provider: antigravity
    effort: high
```

### Workflow

Only declared artifacts flow between steps:

```yaml
- id: plan
  type: agent
  agent: architect
  inputs: [task, discovery.md]
  output: plan.md
```

There is no transcript forwarding between providers.

### Verification

`policies/verification.yaml` contains deterministic commands. The default v0.1 configuration intentionally ships with an empty list because Conductor cannot assume a target project's build system.

Example for a Node project:

```yaml
gates:
  default:
    commands:
      - command: npm
        args: [test]
        timeoutMs: 120000
      - command: npm
        args: [run, lint]
        timeoutMs: 120000
```

Commands are executed directly as argv, not through a shell.

## Run evidence

Each run persists:

```text
runs/<run-id>/
├── manifest.json
├── evidence.json
├── artifacts/
│   ├── discovery.md
│   ├── plan.md
│   ├── implementation.md
│   ├── review.md
│   └── verify.json
└── events/
    ├── discover.jsonl
    ├── plan.jsonl
    ├── implement.jsonl
    ├── review.jsonl
    └── verify.jsonl
```

For `read-only` agents, Conductor fingerprints tracked and untracked workspace content before and after execution. Any mutation fails the run even when the provider itself cannot fully enforce read-only permissions.

## Security model

Conductor deliberately does **not** pass dangerous "skip all permissions" flags. Provider-native sandbox/permission modes are used where available, and every run is placed in its own Git worktree.

The current boundary is repository isolation, not full host isolation. For coding agents that can invoke local tools, a VM/container remains the stronger deployment model.

## Development

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Or run all checks:

```bash
npm run check
```

## Status

v0.1 is intentionally small. It does not yet implement shared memory, automatic retries/fallbacks, parallel steps, dynamic model routing, or automatic merge/push.

## License

MIT
