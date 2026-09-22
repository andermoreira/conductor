import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type {
  AgentEvent,
  Provider,
  RunManifest,
  StepRun,
  WorkflowStep
} from "@conductor/core";
import type { ConductorConfig } from "@conductor/config";
import { collectEvidence } from "@conductor/evidence";
import {
  assertCleanRepository,
  assertGitRepository,
  createRunWorktree,
  runCommand,
  workspaceFingerprint
} from "@conductor/workspace";
import { composeAgentPrompt } from "./prompt.js";
import { RunStore } from "./run-store.js";

export interface OrchestratorOptions {
  config: ConductorConfig;
  providers: Record<string, Provider>;
  stateRoot?: string;
  onProgress?: (message: string) => void;
  onEvent?: (stepId: string, event: AgentEvent) => void | Promise<void>;
}

export interface RunResult {
  manifest: RunManifest;
  runDir: string;
  evidencePath: string;
}

function isoNow(): string {
  return new Date().toISOString();
}

function makeRunId(): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${timestamp}-${randomUUID().slice(0, 8)}`;
}

function initialStep(step: WorkflowStep): StepRun {
  return {
    id: step.id,
    type: step.type,
    ...(step.type === "agent" ? { agent: step.agent } : {}),
    status: "pending"
  };
}

export class Orchestrator {
  private readonly stateRoot: string;

  constructor(private readonly options: OrchestratorOptions) {
    this.stateRoot = resolve(
      options.stateRoot ?? process.env.CONDUCTOR_HOME ?? join(homedir(), ".conductor")
    );
  }

  async run(workflowId: string, task: string, repository: string): Promise<RunResult> {
    const workflow = this.options.config.workflows[workflowId];
    if (!workflow) throw new Error(`Unknown workflow: ${workflowId}`);

    const repoRoot = await assertGitRepository(repository);
    await assertCleanRepository(repoRoot);

    const runId = makeRunId();
    const store = new RunStore(this.stateRoot, runId);
    await store.init();

    this.progress(`creating isolated worktree for ${runId}`);
    const workspace = await createRunWorktree(repoRoot, this.stateRoot, runId);

    const manifest: RunManifest = {
      id: runId,
      workflow: workflow.id,
      task,
      repository: repoRoot,
      workspace,
      status: "running",
      createdAt: isoNow(),
      updatedAt: isoNow(),
      steps: workflow.steps.map(initialStep)
    };
    await store.writeManifest(manifest);

    try {
      for (let index = 0; index < workflow.steps.length; index += 1) {
        const step = workflow.steps[index];
        const stepRun = manifest.steps[index];
        if (!step || !stepRun) throw new Error("Workflow state is inconsistent");

        if (step.type === "agent") {
          await this.runAgentStep(step, stepRun, manifest, store, task);
        } else {
          await this.runGateStep(step.gate, stepRun, manifest, store);
        }
      }

      manifest.status = "completed";
      manifest.updatedAt = isoNow();
      await store.writeManifest(manifest);
    } catch (error) {
      manifest.status = "failed";
      manifest.updatedAt = isoNow();
      await store.writeManifest(manifest);
      const evidence = await collectEvidence(manifest);
      await store.writeJson("evidence.json", evidence);
      throw error;
    }

    const evidence = await collectEvidence(manifest);
    const evidencePath = await store.writeJson("evidence.json", evidence);
    return { manifest, runDir: store.runDir, evidencePath };
  }

  private async runAgentStep(
    step: Extract<WorkflowStep, { type: "agent" }>,
    stepRun: StepRun,
    manifest: RunManifest,
    store: RunStore,
    task: string
  ): Promise<void> {
    const agent = this.options.config.agents[step.agent];
    const binding = this.options.config.routing[step.agent];
    if (!agent || !binding) throw new Error(`Invalid agent configuration: ${step.agent}`);

    const provider = this.options.providers[binding.provider];
    if (!provider) throw new Error(`Provider adapter not registered: ${binding.provider}`);

    stepRun.status = "running";
    stepRun.startedAt = isoNow();
    stepRun.provider = binding.provider;
    if (binding.model) stepRun.model = binding.model;
    manifest.updatedAt = isoNow();
    await store.writeManifest(manifest);
    this.progress(`${step.id}: ${step.agent} -> ${binding.provider}${binding.model ? `/${binding.model}` : ""}`);

    const inputs = await Promise.all(
      step.inputs.map(async (name) => ({
        name,
        content: name === "task" ? task : await store.readArtifact(name)
      }))
    );

    const prompt = composeAgentPrompt(agent, task, inputs);
    const before = agent.permissions.filesystem === "read-only"
      ? await workspaceFingerprint(manifest.workspace)
      : undefined;

    let finalText = "";
    let failure: string | undefined;

    for await (const event of provider.run({
      agentId: agent.id,
      prompt,
      cwd: manifest.workspace,
      ...(binding.model ? { model: binding.model } : {}),
      ...(binding.effort ? { effort: binding.effort } : {}),
      permissions: agent.permissions
    })) {
      await store.appendEvent(step.id, event);
      await this.options.onEvent?.(step.id, event);

      if (event.type === "completed") finalText = event.finalText;
      if (event.type === "failed") failure = event.error;
    }

    if (failure) {
      stepRun.status = "failed";
      stepRun.error = failure;
      stepRun.completedAt = isoNow();
      manifest.updatedAt = isoNow();
      await store.writeManifest(manifest);
      throw new Error(`${step.id} failed: ${failure}`);
    }

    if (before !== undefined) {
      const after = await workspaceFingerprint(manifest.workspace);
      if (before !== after) {
        stepRun.status = "failed";
        stepRun.error = "Read-only agent modified the workspace";
        stepRun.completedAt = isoNow();
        manifest.updatedAt = isoNow();
        await store.writeManifest(manifest);
        throw new Error(`${step.id} violated read-only workspace policy`);
      }
    }

    if (step.output) {
      if (!finalText.trim()) {
        throw new Error(`${step.id} completed without a final artifact`);
      }
      stepRun.artifact = step.output;
      await store.writeArtifact(step.output, finalText);
    }

    stepRun.status = "completed";
    stepRun.completedAt = isoNow();
    manifest.updatedAt = isoNow();
    await store.writeManifest(manifest);
  }

  private async runGateStep(
    gateId: string,
    stepRun: StepRun,
    manifest: RunManifest,
    store: RunStore
  ): Promise<void> {
    const gate = this.options.config.gates[gateId];
    if (!gate) throw new Error(`Unknown verification gate: ${gateId}`);

    stepRun.status = "running";
    stepRun.startedAt = isoNow();
    manifest.updatedAt = isoNow();
    await store.writeManifest(manifest);
    this.progress(`${stepRun.id}: verification gate ${gateId}`);

    const results = [];
    for (const command of gate.commands) {
      const result = await runCommand(
        command.command,
        command.args,
        manifest.workspace,
        command.timeoutMs
      );
      const record = { command: command.command, args: command.args, ...result };
      results.push(record);
      await store.appendEvent(stepRun.id, { type: "gate-command", ...record });

      if (result.exitCode !== 0) {
        stepRun.status = "failed";
        stepRun.error = `Verification command failed: ${command.command}`;
        stepRun.completedAt = isoNow();
        manifest.updatedAt = isoNow();
        await store.writeManifest(manifest);
        throw new Error(stepRun.error);
      }
    }

    stepRun.artifact = `${stepRun.id}.json`;
    await store.writeArtifact(stepRun.artifact, JSON.stringify({
      gate: gateId,
      commandsConfigured: gate.commands.length,
      results
    }, null, 2));

    stepRun.status = "completed";
    stepRun.completedAt = isoNow();
    manifest.updatedAt = isoNow();
    await store.writeManifest(manifest);
  }

  private progress(message: string): void {
    this.options.onProgress?.(message);
  }
}
