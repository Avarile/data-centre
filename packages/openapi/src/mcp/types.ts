import { z } from '../zod';

export const McpToolGroupValues = ['discovery', 'record', 'schema'] as const;

export type IMcpToolGroup = (typeof McpToolGroupValues)[number];

export const mcpToolAnnotationsSchema = z.object({
  readOnlyHint: z.boolean(),
  destructiveHint: z.boolean(),
  idempotentHint: z.boolean(),
});

export const mcpToolItemSchema = z.object({
  name: z.string(),
  title: z.string(),
  description: z.string(),
  group: z.enum(McpToolGroupValues),
  /** Actions the caller must hold on the resolved resource for this tool. */
  requiredActions: z.array(z.string()),
  annotations: mcpToolAnnotationsSchema,
});

export type IMcpToolItem = z.infer<typeof mcpToolItemSchema>;
