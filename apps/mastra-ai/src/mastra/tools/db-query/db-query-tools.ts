import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { listKnowledges, listKnowledgesByType } from './knowledges/knowledge.js';
import { listKnowledgeTypes } from './knowledges/knowledge-type.js';
import { listGoals } from './project-management/goals.js';
import { listProjects } from './project-management/projects.js';
import { listTasks, getTaskById } from './project-management/tasks.js';
import { getGoalWithProjects, getProjectWithTasks } from './project-management/project-service.js';
import { listFrameworks, listFrameworksByType } from './framework.js';
import type { FrameworkType } from './framework.js';

const pagination = {
  take: z.number().int().min(1).max(200).optional().default(50),
  skip: z.number().int().min(0).optional(),
  search: z.string().optional().describe('Text search against record fields (e.g. title keyword)'),
};

const recordSchema = z.object({ id: z.string(), fields: z.record(z.string(), z.unknown()) });
const listOutput = z.object({ records: z.array(recordSchema), total: z.number() });

type GR = { id: string; fields: Record<string, unknown> };
const gr = (r: { id: string; fields: object }) => r as GR;

// ── Knowledge ──────────────────────────────────────────────────────────────

export const listKnowledgesTool = createTool({
  id: 'list-knowledges',
  description:
    'List structured knowledge records from the Teable database. ' +
    'Pass typeName to filter by knowledge type.',
  inputSchema: z.object({
    ...pagination,
    typeName: z.string().optional().describe('Filter by knowledge type title'),
  }),
  outputSchema: listOutput,
  execute: async ({ take, skip, search, typeName }) => {
    const result = typeName
      ? await listKnowledgesByType(typeName, { take, skip, search })
      : await listKnowledges({ take, skip, search });
    return { records: result.records.map(gr), total: result.records.length };
  },
});

// ── Knowledge Types ────────────────────────────────────────────────────────

export const listKnowledgeTypesTool = createTool({
  id: 'list-knowledge-types',
  description: 'List all knowledge type records (the taxonomy/categories for knowledge records).',
  inputSchema: z.object({ ...pagination }),
  outputSchema: listOutput,
  execute: async ({ take, skip, search }) => {
    const result = await listKnowledgeTypes({ take, skip, search });
    return { records: result.records.map(gr), total: result.records.length };
  },
});

// ── Goals ──────────────────────────────────────────────────────────────────

export const listGoalsTool = createTool({
  id: 'list-goals',
  description: 'List goal records. Pass search to filter by title keyword.',
  inputSchema: z.object({ ...pagination }),
  outputSchema: listOutput,
  execute: async ({ take, skip, search }) => {
    const result = await listGoals({ take, skip, search });
    return { records: result.records.map(gr), total: result.records.length };
  },
});

export const getGoalWithProjectsTool = createTool({
  id: 'get-goal-with-projects',
  description: 'Get a goal by its Teable record ID with all linked project records fully resolved.',
  inputSchema: z.object({
    goalRecordId: z.string().describe('Teable record ID of the goal (e.g. recXXX)'),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    goal: recordSchema.optional(),
    projects: z.array(recordSchema).optional(),
  }),
  execute: async ({ goalRecordId }) => {
    const result = await getGoalWithProjects(goalRecordId);
    if (!result) return { found: false };
    return { found: true, goal: gr(result.goal), projects: result.projects.map(gr) };
  },
});

// ── Projects ───────────────────────────────────────────────────────────────

export const listProjectsTool = createTool({
  id: 'list-projects',
  description: 'List project records. Pass search to filter by title keyword.',
  inputSchema: z.object({ ...pagination }),
  outputSchema: listOutput,
  execute: async ({ take, skip, search }) => {
    const result = await listProjects({ take, skip, search });
    return { records: result.records.map(gr), total: result.records.length };
  },
});

export const getProjectWithTasksTool = createTool({
  id: 'get-project-with-tasks',
  description: 'Get a project by its Teable record ID with all linked task records fully resolved.',
  inputSchema: z.object({
    projectRecordId: z.string().describe('Teable record ID of the project (e.g. recXXX)'),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    project: recordSchema.optional(),
    tasks: z.array(recordSchema).optional(),
  }),
  execute: async ({ projectRecordId }) => {
    const result = await getProjectWithTasks(projectRecordId);
    if (!result) return { found: false };
    return { found: true, project: gr(result.project), tasks: result.tasks.map(gr) };
  },
});

// ── Tasks ──────────────────────────────────────────────────────────────────

export const listTasksTool = createTool({
  id: 'list-tasks',
  description: 'List task records. Pass search to filter by title keyword.',
  inputSchema: z.object({ ...pagination }),
  outputSchema: listOutput,
  execute: async ({ take, skip, search }) => {
    const result = await listTasks({ take, skip, search });
    return { records: result.records.map(gr), total: result.records.length };
  },
});

export const getTaskTool = createTool({
  id: 'get-task',
  description: 'Get a single task by its Teable record ID.',
  inputSchema: z.object({
    taskRecordId: z.string().describe('Teable record ID of the task (e.g. recXXX)'),
  }),
  outputSchema: z.object({
    found: z.boolean(),
    task: recordSchema.optional(),
  }),
  execute: async ({ taskRecordId }) => {
    const task = await getTaskById(taskRecordId);
    if (!task) return { found: false };
    return { found: true, task: gr(task) };
  },
});

// ── Frameworks (read-only) ─────────────────────────────────────────────────

export const listFrameworksTool = createTool({
  id: 'list-frameworks',
  description:
    'List framework records. Pass type to filter by category: ' +
    'goal-management, project-management, meeting-strategy, or conversation-strategy.',
  inputSchema: z.object({
    ...pagination,
    type: z
      .enum(['goal-management', 'project-management', 'meeting-strategy', 'conversation-strategy'])
      .optional()
      .describe('Framework category to filter by'),
  }),
  outputSchema: listOutput,
  execute: async ({ take, skip, search, type }) => {
    const result = type
      ? await listFrameworksByType(type as FrameworkType, { take, skip, search })
      : await listFrameworks({ take, skip, search });
    return { records: result.records.map(gr), total: result.records.length };
  },
});
