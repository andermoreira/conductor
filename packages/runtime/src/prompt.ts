import type { AgentDefinition } from "@conductor/core";

export interface PromptInput {
  name: string;
  content: string;
}

export function composeAgentPrompt(
  agent: AgentDefinition,
  task: string,
  inputs: PromptInput[]
): string {
  const artifacts = inputs
    .filter((input) => input.name !== "task")
    .map((input) => `## Artifact: ${input.name}\n\n${input.content}`)
    .join("\n\n");

  return [
    `# Role\n\nYou are the **${agent.role}** agent in a bounded multi-agent workflow.`,
    `# Instructions\n\n${agent.prompt.trim()}`,
    `# Task\n\n${task}`,
    artifacts ? `# Prior artifacts\n\n${artifacts}` : "",
    [
      "# Runtime constraints",
      "",
      `- Filesystem: ${agent.permissions.filesystem}`,
      `- Shell: ${agent.permissions.shell ? "allowed by profile" : "not allowed by profile"}`,
      `- Network: ${agent.permissions.network ? "allowed by profile" : "not allowed by profile"}`,
      "- Do not broaden the task.",
      "- Do not commit, push, or alter git history.",
      "- Your final response is an artifact consumed by the next workflow step."
    ].join("\n")
  ].filter(Boolean).join("\n\n");
}
