export type FilesystemPermission = "read-only" | "workspace-write";

export interface PermissionProfile {
  filesystem: FilesystemPermission;
  shell: boolean;
  network: boolean;
}

export interface AgentDefinition {
  id: string;
  role: string;
  description?: string;
  capabilities: string[];
  permissions: PermissionProfile;
  prompt: string;
}

export interface RoutingBinding {
  provider: string;
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh";
}

export interface AgentWorkflowStep {
  id: string;
  type: "agent";
  agent: string;
  inputs: string[];
  output?: string;
}

export interface GateWorkflowStep {
  id: string;
  type: "gate";
  gate: string;
}

export type WorkflowStep = AgentWorkflowStep | GateWorkflowStep;

export interface WorkflowDefinition {
  id: string;
  description?: string;
  steps: WorkflowStep[];
}

export interface VerificationCommand {
  command: string;
  args: string[];
  timeoutMs?: number;
}

export interface VerificationGate {
  id: string;
  commands: VerificationCommand[];
}

export type RunStatus = "pending" | "running" | "completed" | "failed" | "blocked";
export type StepStatus = "pending" | "running" | "completed" | "failed" | "blocked";

export interface StepRun {
  id: string;
  type: WorkflowStep["type"];
  agent?: string;
  provider?: string;
  model?: string;
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  artifact?: string;
  error?: string;
}

export interface RunManifest {
  id: string;
  workflow: string;
  task: string;
  repository: string;
  workspace: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  steps: StepRun[];
}

export interface ProviderRunRequest {
  agentId: string;
  prompt: string;
  cwd: string;
  model?: string;
  effort?: RoutingBinding["effort"];
  permissions: PermissionProfile;
  signal?: AbortSignal;
}

export type AgentEvent =
  | { type: "started"; at: string; provider: string; agentId: string }
  | { type: "provider"; at: string; provider: string; agentId: string; payload: unknown }
  | { type: "text"; at: string; provider: string; agentId: string; text: string }
  | { type: "stderr"; at: string; provider: string; agentId: string; text: string }
  | { type: "completed"; at: string; provider: string; agentId: string; exitCode: number; finalText: string }
  | { type: "failed"; at: string; provider: string; agentId: string; exitCode: number | null; error: string };

export interface Provider {
  readonly id: string;
  run(request: ProviderRunRequest): AsyncIterable<AgentEvent>;
}
