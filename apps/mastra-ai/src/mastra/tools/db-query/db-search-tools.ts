import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { searchKnowledgesByTitle, getKnowledgesByIds } from './knowledges/knowledge.js';
import { searchGoalsByTitle, getGoalsByIds } from './project-management/goals.js';
import { searchProjectsByTitle, getProjectsByIds } from './project-management/projects.js';
import { searchTasksByTitle, getTasksByIds } from './project-management/tasks.js';

// ── Shared output types ────────────────────────────────────────────────────

const titleResult = z.object({ id: z.string(), title: z.string() });
const knowledgeTitleResult = titleResult.extend({ knowledge_type: z.string().optional() });

const contextResult = z.object({
  id: z.string(),
  title: z.string(),
  context: z.string().optional(),
});
const knowledgeContextResult = contextResult.extend({ knowledge_type: z.string().optional() });

const keywordInput = z.object({
  keyword: z.string().min(1).describe('Keyword to search for in titles (substring match)'),
  take: z.number().int().min(1).max(50).optional().default(20),
});

const idsInput = z.object({
  recordIds: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe('Teable record IDs (recXXX) — max 5, selected from Round 1 results'),
});

// ── Round 1 — Title search ─────────────────────────────────────────────────

export const searchKnowledgeTitlesTool = createTool({
  id: 'search-knowledge-titles',
  description:
    'ROUND 1 — Search knowledge records whose title contains the keyword. ' +
    'Returns id, title, and knowledge_type only. ' +
    'Pick the ≤5 most relevant results (considering both title and knowledge_type), ' +
    'then call get-knowledge-contexts with those IDs.',
  inputSchema: keywordInput,
  outputSchema: z.object({ results: z.array(knowledgeTitleResult), total: z.number() }),
  execute: async ({ keyword, take }) => {
    const result = await searchKnowledgesByTitle(keyword, { take });
    return {
      results: result.records.map((r) => ({
        id: r.id,
        title: String(r.fields.title ?? ''),
        knowledge_type: r.fields.knowledge_type ? String(r.fields.knowledge_type) : undefined,
      })),
      total: result.records.length,
    };
  },
});

export const searchGoalTitlesTool = createTool({
  id: 'search-goal-titles',
  description:
    'ROUND 1 — Search goal records whose title contains the keyword. ' +
    'Returns id and title only. ' +
    'Pick the ≤5 most relevant results, then call get-goal-contexts with those IDs.',
  inputSchema: keywordInput,
  outputSchema: z.object({ results: z.array(titleResult), total: z.number() }),
  execute: async ({ keyword, take }) => {
    const result = await searchGoalsByTitle(keyword, { take });
    return {
      results: result.records.map((r) => ({
        id: r.id,
        title: String(r.fields.title ?? ''),
      })),
      total: result.records.length,
    };
  },
});

export const searchProjectTitlesTool = createTool({
  id: 'search-project-titles',
  description:
    'ROUND 1 — Search project records whose title contains the keyword. ' +
    'Returns id and title only. ' +
    'Pick the ≤5 most relevant results, then call get-project-contexts with those IDs.',
  inputSchema: keywordInput,
  outputSchema: z.object({ results: z.array(titleResult), total: z.number() }),
  execute: async ({ keyword, take }) => {
    const result = await searchProjectsByTitle(keyword, { take });
    return {
      results: result.records.map((r) => ({
        id: r.id,
        title: String(r.fields.title ?? ''),
      })),
      total: result.records.length,
    };
  },
});

export const searchTaskTitlesTool = createTool({
  id: 'search-task-titles',
  description:
    'ROUND 1 — Search task records whose title contains the keyword. ' +
    'Returns id and title only. ' +
    'Pick the ≤5 most relevant results, then call get-task-contexts with those IDs.',
  inputSchema: keywordInput,
  outputSchema: z.object({ results: z.array(titleResult), total: z.number() }),
  execute: async ({ keyword, take }) => {
    const result = await searchTasksByTitle(keyword, { take });
    return {
      results: result.records.map((r) => ({
        id: r.id,
        title: String(r.fields.title ?? ''),
      })),
      total: result.records.length,
    };
  },
});

// ── Round 2 — Context fetch ────────────────────────────────────────────────

export const getKnowledgeContextsTool = createTool({
  id: 'get-knowledge-contexts',
  description:
    'ROUND 2 — Fetch full title + context for up to 5 knowledge records by their IDs. ' +
    'Call this after search-knowledge-titles with the IDs of the most relevant results.',
  inputSchema: idsInput,
  outputSchema: z.object({ records: z.array(knowledgeContextResult) }),
  execute: async ({ recordIds }) => {
    const records = await getKnowledgesByIds(recordIds);
    return {
      records: records.map((r) => ({
        id: r.id,
        title: String(r.fields.title ?? ''),
        context: r.fields.context ? String(r.fields.context) : undefined,
        knowledge_type: r.fields.knowledge_type ? String(r.fields.knowledge_type) : undefined,
      })),
    };
  },
});

export const getGoalContextsTool = createTool({
  id: 'get-goal-contexts',
  description:
    'ROUND 2 — Fetch full title + context for up to 5 goal records by their IDs. ' +
    'Call this after search-goal-titles with the IDs of the most relevant results.',
  inputSchema: idsInput,
  outputSchema: z.object({ records: z.array(contextResult) }),
  execute: async ({ recordIds }) => {
    const records = await getGoalsByIds(recordIds);
    return {
      records: records.map((r) => ({
        id: r.id,
        title: String(r.fields.title ?? ''),
        context: r.fields.context ? String(r.fields.context) : undefined,
      })),
    };
  },
});

export const getProjectContextsTool = createTool({
  id: 'get-project-contexts',
  description:
    'ROUND 2 — Fetch full title + context for up to 5 project records by their IDs. ' +
    'Call this after search-project-titles with the IDs of the most relevant results.',
  inputSchema: idsInput,
  outputSchema: z.object({ records: z.array(contextResult) }),
  execute: async ({ recordIds }) => {
    const records = await getProjectsByIds(recordIds);
    return {
      records: records.map((r) => ({
        id: r.id,
        title: String(r.fields.title ?? ''),
        context: r.fields.context ? String(r.fields.context) : undefined,
      })),
    };
  },
});

export const getTaskContextsTool = createTool({
  id: 'get-task-contexts',
  description:
    'ROUND 2 — Fetch full title + context for up to 5 task records by their IDs. ' +
    'Call this after search-task-titles with the IDs of the most relevant results.',
  inputSchema: idsInput,
  outputSchema: z.object({ records: z.array(contextResult) }),
  execute: async ({ recordIds }) => {
    const records = await getTasksByIds(recordIds);
    return {
      records: records.map((r) => ({
        id: r.id,
        title: String(r.fields.title ?? ''),
        context: r.fields.context ? String(r.fields.context) : undefined,
      })),
    };
  },
});
