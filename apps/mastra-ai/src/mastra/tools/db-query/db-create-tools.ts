import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { createKnowledgeWithType } from './knowledges/knowledge-service.js';
import { createKnowledgeType } from './knowledges/knowledge-type.js';
import { createGoal } from './project-management/goals.js';
import { createProject } from './project-management/projects.js';
import { createTask } from './project-management/tasks.js';
import {
  createProjectUnderGoal,
  createTaskUnderProject,
} from './project-management/project-service.js';

const recordSchema = z.object({ id: z.string(), fields: z.record(z.string(), z.unknown()) });
const mutationOutput = z.object({
  success: z.boolean(),
  record: recordSchema.optional(),
  error: z.string().optional(),
});

// ── Knowledge ──────────────────────────────────────────────────────────────

export const createKnowledgeTool = createTool({
  id: 'create-knowledge',
  description:
    'Create a new structured knowledge record. The knowledge_type is auto-created if it does not exist.',
  inputSchema: z.object({
    title: z.string().min(1),
    context: z.string().optional(),
    is_active: z.boolean().optional().default(true),
    typeName: z.string().describe('Knowledge type title — created automatically if absent'),
    typeContext: z.string().optional().describe('Context for the type when it needs to be created'),
  }),
  outputSchema: mutationOutput,
  execute: async ({ title, context, is_active, typeName, typeContext }) => {
    try {
      const { knowledge } = await createKnowledgeWithType(
        { title, context, is_active },
        typeName,
        typeContext
      );
      return { success: true, record: knowledge };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});

// ── Knowledge Type ─────────────────────────────────────────────────────────

export const createKnowledgeTypeTool = createTool({
  id: 'create-knowledge-type',
  description: 'Create a new knowledge type record.',
  inputSchema: z.object({
    title: z.string().min(1),
    context: z.string().optional(),
    is_active: z.boolean().optional().default(true),
  }),
  outputSchema: mutationOutput,
  execute: async ({ title, context, is_active }) => {
    try {
      const record = await createKnowledgeType({ title, context, is_active });
      return { success: true, record };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});

// ── Goal ───────────────────────────────────────────────────────────────────

export const createGoalTool = createTool({
  id: 'create-goal',
  description: 'Create a new goal record.',
  inputSchema: z.object({
    title: z.string().min(1),
    context: z.string().optional(),
    is_active: z.boolean().optional().default(true),
    deadline: z.string().optional().describe('ISO 8601 date string (e.g. 2025-12-31)'),
  }),
  outputSchema: mutationOutput,
  execute: async ({ title, context, is_active, deadline }) => {
    try {
      const record = await createGoal({ title, context, is_active, deadline });
      return { success: true, record };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});

// ── Project ────────────────────────────────────────────────────────────────

export const createProjectTool = createTool({
  id: 'create-project',
  description: 'Create a new project record. Pass goalRecordId to link it under an existing goal.',
  inputSchema: z.object({
    title: z.string().min(1),
    context: z.string().optional(),
    is_active: z.boolean().optional().default(true),
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
    goalRecordId: z
      .string()
      .optional()
      .describe('Teable record ID of the parent goal (e.g. recXXX)'),
  }),
  outputSchema: mutationOutput,
  execute: async ({ title, context, is_active, progress, goalRecordId }) => {
    try {
      const record = goalRecordId
        ? (await createProjectUnderGoal({ title, context, is_active, progress }, goalRecordId))
            .project
        : await createProject({ title, context, is_active, progress });
      return { success: true, record };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});

// ── Task ───────────────────────────────────────────────────────────────────

export const createTaskTool = createTool({
  id: 'create-task',
  description:
    'Create a new task record. Pass projectRecordId to link it under an existing project.',
  inputSchema: z.object({
    title: z.string().min(1),
    context: z.string().optional(),
    is_active: z.boolean().optional().default(true),
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
    started_at: z.string().optional().describe('ISO 8601 datetime'),
    finished_at: z.string().optional().describe('ISO 8601 datetime'),
    projectRecordId: z
      .string()
      .optional()
      .describe('Teable record ID of the parent project (e.g. recXXX)'),
  }),
  outputSchema: mutationOutput,
  execute: async ({
    title,
    context,
    is_active,
    progress,
    priority,
    started_at,
    finished_at,
    projectRecordId,
  }) => {
    try {
      const taskFields = { title, context, is_active, progress, priority, started_at, finished_at };
      const record = projectRecordId
        ? (await createTaskUnderProject(taskFields, projectRecordId)).task
        : await createTask(taskFields);
      return { success: true, record };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});
