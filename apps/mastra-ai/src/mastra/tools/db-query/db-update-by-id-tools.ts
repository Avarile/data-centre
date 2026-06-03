import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { updateKnowledge } from './knowledges/knowledge.js';
import { updateKnowledgeType } from './knowledges/knowledge-type.js';
import { updateGoal } from './project-management/goals.js';
import { updateProject } from './project-management/projects.js';
import { updateTask } from './project-management/tasks.js';

const recordSchema = z.object({ id: z.string(), fields: z.record(z.string(), z.unknown()) });
const mutationOutput = z.object({
  success: z.boolean(),
  record: recordSchema.optional(),
  error: z.string().optional(),
});

const recordIdField = z.string().describe('Teable record ID (e.g. recXXX)');

// ── Knowledge ──────────────────────────────────────────────────────────────

export const updateKnowledgeTool = createTool({
  id: 'update-knowledge',
  description: 'Update a knowledge record by its Teable record ID.',
  inputSchema: z.object({
    recordId: recordIdField,
    title: z.string().optional(),
    context: z.string().optional(),
    is_active: z.boolean().optional(),
    knowledge_type: z.string().optional().describe('Knowledge type title'),
  }),
  outputSchema: mutationOutput,
  execute: async ({ recordId, ...fields }) => {
    try {
      const result = await updateKnowledge(recordId, fields);
      return { success: true, record: result.record };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});

// ── Knowledge Type ─────────────────────────────────────────────────────────

export const updateKnowledgeTypeTool = createTool({
  id: 'update-knowledge-type',
  description: 'Update a knowledge type record by its Teable record ID.',
  inputSchema: z.object({
    recordId: recordIdField,
    title: z.string().optional(),
    context: z.string().optional(),
    is_active: z.boolean().optional(),
  }),
  outputSchema: mutationOutput,
  execute: async ({ recordId, ...fields }) => {
    try {
      const result = await updateKnowledgeType(recordId, fields);
      return { success: true, record: result.record };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});

// ── Goal ───────────────────────────────────────────────────────────────────

export const updateGoalTool = createTool({
  id: 'update-goal',
  description: 'Update a goal record by its Teable record ID.',
  inputSchema: z.object({
    recordId: recordIdField,
    title: z.string().optional(),
    context: z.string().optional(),
    is_active: z.boolean().optional(),
    deadline: z.string().optional().describe('ISO 8601 date string'),
  }),
  outputSchema: mutationOutput,
  execute: async ({ recordId, ...fields }) => {
    try {
      const result = await updateGoal(recordId, fields);
      return { success: true, record: result.record };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});

// ── Project ────────────────────────────────────────────────────────────────

export const updateProjectTool = createTool({
  id: 'update-project',
  description: 'Update a project record by its Teable record ID.',
  inputSchema: z.object({
    recordId: recordIdField,
    title: z.string().optional(),
    context: z.string().optional(),
    is_active: z.boolean().optional(),
    progress: z
      .enum([
        'backlog',
        'preparing',
        'initiated',
        'in-progress',
        'finished-reviewing',
        'finished-validating',
        'finished-testing',
        'finalized',
        'onhold',
        'cancelled',
      ])
      .optional(),
  }),
  outputSchema: mutationOutput,
  execute: async ({ recordId, ...fields }) => {
    try {
      const result = await updateProject(recordId, fields);
      return { success: true, record: result.record };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});

// ── Task ───────────────────────────────────────────────────────────────────

export const updateTaskTool = createTool({
  id: 'update-task',
  description: 'Update a task record by its Teable record ID.',
  inputSchema: z.object({
    recordId: recordIdField,
    title: z.string().optional(),
    context: z.string().optional(),
    is_active: z.boolean().optional(),
    progress: z
      .enum([
        'backlog',
        'in-progress',
        'finished_reviewing',
        'finished_validating',
        'onhold',
        'cancelled',
      ])
      .optional(),
    priority: z.enum(['urgent', 'important', 'prioritise', 'normal', 'can wait']).optional(),
    started_at: z.string().optional(),
    finished_at: z.string().optional(),
  }),
  outputSchema: mutationOutput,
  execute: async ({ recordId, ...fields }) => {
    try {
      const result = await updateTask(recordId, fields);
      return { success: true, record: result.record };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});
