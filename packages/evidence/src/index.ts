import type { RunManifest } from "@conductor/core";
import { changedFiles } from "@conductor/workspace";

export interface RunEvidence {
  runId: string;
  workflow: string;
  status: RunManifest["status"];
  repository: string;
  workspace: string;
  changedFiles: string[];
  steps: Array<{
    id: string;
    type: string;
    status: string;
    agent?: string;
    provider?: string;
    model?: string;
    artifact?: string;
    error?: string;
  }>;
  generatedAt: string;
}

export async function collectEvidence(manifest: RunManifest): Promise<RunEvidence> {
  return {
    runId: manifest.id,
    workflow: manifest.workflow,
    status: manifest.status,
    repository: manifest.repository,
    workspace: manifest.workspace,
    changedFiles: await changedFiles(manifest.workspace),
    steps: manifest.steps.map((step) => ({
      id: step.id,
      type: step.type,
      status: step.status,
      ...(step.agent ? { agent: step.agent } : {}),
      ...(step.provider ? { provider: step.provider } : {}),
      ...(step.model ? { model: step.model } : {}),
      ...(step.artifact ? { artifact: step.artifact } : {}),
      ...(step.error ? { error: step.error } : {})
    })),
    generatedAt: new Date().toISOString()
  };
}
