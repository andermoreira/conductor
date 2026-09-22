import { z } from "zod";

const permissionsSchema = z.object({
  filesystem: z.enum(["read-only", "workspace-write"]),
  shell: z.boolean(),
  network: z.boolean()
});

export const agentSchema = z.object({
  id: z.string().min(1),
  role: z.string().min(1),
  description: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  permissions: permissionsSchema,
  prompt: z.string().min(1)
});

const agentStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal("agent"),
  agent: z.string().min(1),
  inputs: z.array(z.string()).default(["task"]),
  output: z.string().optional()
});

const gateStepSchema = z.object({
  id: z.string().min(1),
  type: z.literal("gate"),
  gate: z.string().min(1)
});

export const workflowSchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(z.discriminatedUnion("type", [agentStepSchema, gateStepSchema])).min(1)
});

export const routingSchema = z.object({
  agents: z.record(
    z.string(),
    z.object({
      provider: z.string().min(1),
      model: z.string().min(1).optional(),
      effort: z.enum(["low", "medium", "high", "xhigh"]).optional()
    })
  )
});

export const verificationSchema = z.object({
  gates: z.record(
    z.string(),
    z.object({
      commands: z.array(
        z.object({
          command: z.string().min(1),
          args: z.array(z.string()).default([]),
          timeoutMs: z.number().int().positive().optional()
        })
      ).default([])
    })
  )
});
