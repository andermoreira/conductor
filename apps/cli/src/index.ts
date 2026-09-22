#!/usr/bin/env node
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Command } from "commander";
import { createDefaultProviders } from "@conductor/adapters";
import { loadConfig } from "@conductor/config";
import { Orchestrator } from "@conductor/runtime";
import { runCommand } from "@conductor/workspace";

function isConfigRoot(path: string): boolean {
  return ["agents", "workflows", "policies"].every((name) =>
    existsSync(resolve(path, name))
  );
}

function defaultConfigRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, ".."),
    resolve(here, "../../.."),
    process.cwd()
  ];
  const match = candidates.find(isConfigRoot);
  if (!match) {
    throw new Error("Could not locate Conductor agents/workflows/policies. Pass --config <path>.");
  }
  return match;
}

async function doctor(): Promise<void> {
  const tools = [
    ["claude", "Claude Code"],
    ["codex", "Codex CLI"],
    ["cursor-agent", "Cursor CLI"],
    ["agy", "Antigravity CLI"]
  ] as const;

  let failed = false;
  for (const [command, label] of tools) {
    try {
      const result = await runCommand(command, ["--version"], process.cwd(), 15_000);
      if (result.exitCode === 0) {
        console.log(`✓ ${label}: ${result.stdout.trim() || "available"}`);
      } else {
        failed = true;
        console.log(`✗ ${label}: unavailable`);
      }
    } catch {
      failed = true;
      console.log(`✗ ${label}: unavailable`);
    }
  }

  if (failed) process.exitCode = 1;
}

const program = new Command()
  .name("conductor")
  .description("Provider-agnostic runtime for bounded multi-agent workflows")
  .version("0.1.0");

program
  .command("doctor")
  .description("Check whether supported agent CLIs are installed")
  .action(doctor);

program
  .command("run")
  .description("Run a declarative workflow")
  .argument("<workflow>", "workflow id, for example: feature")
  .argument("<task>", "task description")
  .option("-r, --repo <path>", "target git repository", process.cwd())
  .option("-c, --config <path>", "Conductor configuration root")
  .option("--state-dir <path>", "state directory (default: ~/.conductor)")
  .action(async (workflow: string, task: string, options: {
    repo: string;
    config?: string;
    stateDir?: string;
  }) => {
    const configRoot = resolve(options.config ?? defaultConfigRoot());
    const config = await loadConfig(configRoot);
    const orchestrator = new Orchestrator({
      config,
      providers: createDefaultProviders(),
      ...(options.stateDir ? { stateRoot: options.stateDir } : {}),
      onProgress: (message) => console.log(`→ ${message}`),
      onEvent: (_stepId, event) => {
        if (event.type === "stderr") process.stderr.write(event.text);
      }
    });

    const result = await orchestrator.run(workflow, task, resolve(options.repo));
    console.log("");
    console.log(`✓ run completed: ${result.manifest.id}`);
    console.log(`  workspace: ${result.manifest.workspace}`);
    console.log(`  evidence:  ${result.evidencePath}`);
  });

await program.parseAsync(process.argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
