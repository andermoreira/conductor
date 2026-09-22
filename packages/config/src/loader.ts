import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import YAML from "yaml";
import type {
  AgentDefinition,
  RoutingBinding,
  VerificationGate,
  WorkflowDefinition
} from "@conductor/core";
import {
  agentSchema,
  routingSchema,
  verificationSchema,
  workflowSchema
} from "./schema.js";

export interface ConductorConfig {
  agents: Record<string, AgentDefinition>;
  workflows: Record<string, WorkflowDefinition>;
  routing: Record<string, RoutingBinding>;
  gates: Record<string, VerificationGate>;
}

async function readYaml(path: string): Promise<unknown> {
  return YAML.parse(await readFile(path, "utf8"));
}

async function loadYamlDirectory<T>(
  directory: string,
  parser: (value: unknown) => T,
  getId: (value: T) => string
): Promise<Record<string, T>> {
  const entries = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const result: Record<string, T> = {};
  for (const entry of entries) {
    const parsed = parser(await readYaml(join(directory, entry.name)));
    const id = getId(parsed);
    if (result[id]) {
      throw new Error(`Duplicate configuration id: ${id}`);
    }
    result[id] = parsed;
  }
  return result;
}

export async function loadConfig(root: string): Promise<ConductorConfig> {
  const agents = await loadYamlDirectory(
    join(root, "agents"),
    (value) => agentSchema.parse(value) as AgentDefinition,
    (value) => value.id
  );

  const workflows = await loadYamlDirectory(
    join(root, "workflows"),
    (value) => workflowSchema.parse(value) as WorkflowDefinition,
    (value) => value.id
  );

  const routing = routingSchema.parse(
    await readYaml(join(root, "policies", "routing.yaml"))
  ).agents as Record<string, RoutingBinding>;

  const rawGates = verificationSchema.parse(
    await readYaml(join(root, "policies", "verification.yaml"))
  ).gates;

  const gates: Record<string, VerificationGate> = Object.fromEntries(
    Object.entries(rawGates).map(([id, value]) => [
      id,
      { id, commands: value.commands }
    ])
  );

  for (const workflow of Object.values(workflows)) {
    for (const step of workflow.steps) {
      if (step.type === "agent") {
        if (!agents[step.agent]) {
          throw new Error(`Workflow ${workflow.id} references unknown agent ${step.agent}`);
        }
        if (!routing[step.agent]) {
          throw new Error(`No routing binding for agent ${step.agent}`);
        }
      } else if (!gates[step.gate]) {
        throw new Error(`Workflow ${workflow.id} references unknown gate ${step.gate}`);
      }
    }
  }

  return { agents, workflows, routing, gates };
}
