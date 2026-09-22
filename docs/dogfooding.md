# Integration dogfooding (PR #2)

This record distinguishes adapter compatibility from the access available in the environment that
ran the checks. It contains no account identifiers, tokens, or raw authentication output.

## Clean-room baseline

- Fresh clone of `main` at `6061f4b`.
- `npm install` completed with a temporary writable npm cache because the host's shared npm cache
  contains files that this process cannot modify.
- `npm run check` passed before the change (3 tests) and after the change (6 tests).
- `conductor doctor` found Claude Code, Codex CLI, and Cursor CLI; Antigravity (`agy`) was absent.
- `npm run dogfood` now creates an empty, committed Git fixture and executes `doctor --verbose` plus
  the default `feature` workflow against it. It retains the fixture and state paths it prints, so a
  failed provider step remains inspectable.

## Observed CLIs

| CLI | Observed version | Login probe | Headless adapter flags | Runtime result |
| --- | --- | --- | --- | --- |
| Claude Code | 2.1.280 | authenticated | supported | A read-only JSONL probe returned its final artifact. A local SessionStart hook attempted a home-directory write and reported an EPERM warning, but the CLI completed successfully. |
| Codex CLI | 0.155.1 | authenticated | supported | A read-only JSONL probe could not initialize its local state database because the host denies writes under `~/.codex`. |
| Cursor CLI | 2026.07.23-e383d2b | authenticated | supported | The default Conductor workflow reached the explorer step, then Cursor failed while creating its project state under `~/.cursor`. |
| Antigravity | not installed | not available | not available | Not exercised. |

The `doctor --verbose` probes use provider-native status commands only to derive an
`authenticated`, `not authenticated`, or `unknown` state. They do not print those commands'
raw output, preventing account metadata or credentials from entering Conductor output.

## Follow-up probe: Antigravity 1.2.8

The [official installer](https://www.antigravity.google/docs/cli/install/) was reviewed, then used
with a custom writable target and an isolated `HOME`. It downloaded version 1.2.8 and verified its
SHA-512 before installation. Its real help output confirms the adapter's `-p`, `--output-format
stream-json`, `--sandbox`, `--mode plan`, and `--effort high` flags. The adapter now supplies
`--mode plan` for a Conductor read-only agent. The matching JSONL lifecycle is documented in the
[official headless-mode reference](https://www.agy.dev/docs/cli/headless/).

`--mode plan` is not an OS-level or filesystem read-only boundary in headless mode; that mode can
still inherit workspace write permissions from the user's Antigravity settings. Conductor therefore
treats it as an intent signal only and retains its provider-independent workspace fingerprint as
post-step mutation detection. A fully preventive boundary requires running the CLI in an isolated
VM or container with filesystem permissions enforced outside the provider.

This version does not expose a non-interactive `status` subcommand. `doctor --verbose` therefore
reports its authentication state as `unknown` rather than invoking a nonexistent command. A
headless probe correctly requested an interactive Google authorization; it cannot be completed by
the automated runner without a user-approved signed-in session.

## Findings and changes

1. Codex CLI 0.155.1 supports `exec --json --sandbox`, but not the previously passed
   `--ask-for-approval never` flag. The Codex adapter no longer passes that obsolete flag.
2. Cursor CLI exposes `--mode plan` for a read-only session. The Cursor adapter now selects it for
   Conductor read-only agents; Conductor's existing workspace fingerprint remains the independent
   policy check.
3. No `run status`, `run inspect`, or automatic cleanup command was added. The persisted manifest,
   JSONL events, artifacts, and retained worktree already provide the evidence needed for these
   failures. Automatic cleanup would discard useful failure state and is not required to address a
   compatibility issue found here.

## Evidence boundary

The PR validates argument construction, JSONL parsing, process event normalization, repository
isolation, and the available CLI help/status interfaces. A full default workflow could not complete
in this managed host because the authenticated CLIs also require writable per-user state directories,
and one required executable (`agy`) is missing. That is an environment limitation, not evidence of
an unauthenticated provider. Re-run the default workflow in a VM or workstation where each CLI can
write its own approved state directory before claiming end-to-end provider coverage.
