import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { deleteKnowledge } from './knowledges/knowledge.js';
import { deleteKnowledgeType } from './knowledges/knowledge-type.js';
import { deleteGoal } from './project-management/goals.js';
import { deleteProject } from './project-management/projects.js';
import { deleteTask } from './project-management/tasks.js';

const deleteOutput = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

const recordIdInput = z.object({
  recordId: z.string().describe('Teable record ID (e.g. recXXX)'),
});

export const deleteKnowledgeTool = createTool({
  id: 'delete-knowledge',
  description: 'Permanently delete a knowledge record by its Teable record ID.',
  inputSchema: recordIdInput,
  outputSchema: deleteOutput,
  execute: async ({ recordId }) => {
    try {
      await deleteKnowledge(recordId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});

export const deleteKnowledgeTypeTool = createTool({
  id: 'delete-knowledge-type',
  description: 'Permanently delete a knowledge type record by its Teable record ID.',
  inputSchema: recordIdInput,
  outputSchema: deleteOutput,
  execute: async ({ recordId }) => {
    try {
      await deleteKnowledgeType(recordId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});

export const deleteGoalTool = createTool({
  id: 'delete-goal',
  description: 'Permanently delete a goal record by its Teable record ID.',
  inputSchema: recordIdInput,
  outputSchema: deleteOutput,
  execute: async ({ recordId }) => {
    try {
      await deleteGoal(recordId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});

export const deleteProjectTool = createTool({
  id: 'delete-project',
  description: 'Permanently delete a project record by its Teable record ID.',
  inputSchema: recordIdInput,
  outputSchema: deleteOutput,
  execute: async ({ recordId }) => {
    try {
      await deleteProject(recordId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});

export const deleteTaskTool = createTool({
  id: 'delete-task',
  description: 'Permanently delete a task record by its Teable record ID.',
  inputSchema: recordIdInput,
  outputSchema: deleteOutput,
  execute: async ({ recordId }) => {
    try {
      await deleteTask(recordId);
      return { success: true };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
});
