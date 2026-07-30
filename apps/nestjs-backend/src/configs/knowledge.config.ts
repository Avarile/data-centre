/* eslint-disable @typescript-eslint/naming-convention */
import { Inject } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';

/**
 * Identifies the two Teable tables that back the knowledge graph, plus the
 * node budget that bounds a single graph response.
 *
 * Defaults live here rather than in the Joi schema on purpose: Joi writes its
 * defaults back onto `process.env` before this factory runs, which would make
 * the `??` fallbacks below dead code and split the default across two files.
 */
export const knowledgeConfig = registerAs('knowledge', () => ({
  knowledgeTableId: process.env.KNOWLEDGE_TABLE_ID ?? 'tblVTWb1kxXSFPBq4Fq',
  knowledgeTypeTableId: process.env.KNOWLEDGE_TYPE_TABLE_ID ?? 'tblWcq6Kof1AFHvbC5e',
  maxKnowledgeNodes: Number(process.env.KNOWLEDGE_GRAPH_MAX_NODES ?? 2000),
}));

export const KnowledgeConfig = () => Inject(knowledgeConfig.KEY);

export type IKnowledgeConfig = ConfigType<typeof knowledgeConfig>;
