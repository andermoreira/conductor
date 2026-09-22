# Architecture

Conductor separates **roles**, **provider bindings**, and **execution**.

```text
workflow
  |
  +--> agent role --------> routing binding --------> provider adapter
        explorer            cursor                    cursor-agent
        architect           claude/opus               claude
        implementer         codex/gpt-5.6-sol         codex
        reviewer            antigravity               agy
```

## Principles

1. **Provider-agnostic core** — workflows refer to agent IDs, never vendor CLIs.
2. **Artifact-based handoff** — an agent receives the task plus only the artifacts declared by its workflow step.
3. **Bounded workflows** — control flow is declarative and inspectable; no model decides the workflow graph.
4. **Isolated execution** — each run gets a dedicated Git worktree under `CONDUCTOR_HOME`.
5. **Independent review** — the default reviewer is a different provider from the implementer.
6. **Observable runs** — manifest, per-step JSONL events, artifacts, and evidence are persisted.
7. **No credential extraction** — adapters invoke the official CLIs and rely on their existing authenticated sessions.

## Runtime layout

By default, state is written under `~/.conductor`:

```text
~/.conductor/
├── runs/<run-id>/
│   ├── manifest.json
│   ├── evidence.json
│   ├── artifacts/
│   └── events/
└── worktrees/<repo>/<run-id>/
```

## Permission boundary

Provider-native permission flags are used where they exist. In addition, every agent declared as `read-only` is protected by a provider-independent workspace fingerprint. If tracked or untracked content changes during that step, the run fails.

This is a detection boundary, not an OS-level sandbox. The Git worktree is the containment boundary for repository writes; running Conductor inside a VM or other sandbox remains recommended for stronger host isolation.

## v0.1 non-goals

- shared conversational memory
- autonomous planner or swarm
- LLM-based routing
- automatic retries or fallbacks
- parallel steps
- provider quota optimization
- automatic merge/push
- dashboard/UI
