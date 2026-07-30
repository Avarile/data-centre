import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { axios } from '../axios';
import { registerRoute, urlBuilder } from '../utils';
import { z } from '../zod';
import {
  knowledgeGraphLinkSchema,
  knowledgeGraphNodeSchema,
  knowledgeGraphStatsSchema,
} from './types';

export const GET_KNOWLEDGE_GRAPH = '/base/{baseId}/knowledge-graph';

export const getKnowledgeGraphVoSchema = z.object({
  version: z.number().int().meta({ description: 'Payload shape version.' }),
  etag: z.string().meta({ description: 'Strong ETag over nodes + links + stats.' }),
  nodes: knowledgeGraphNodeSchema.array(),
  links: knowledgeGraphLinkSchema.array(),
  stats: knowledgeGraphStatsSchema,
});

export type IGetKnowledgeGraphVo = z.infer<typeof getKnowledgeGraphVoSchema>;

export const GetKnowledgeGraphRoute: RouteConfig = registerRoute({
  method: 'get',
  path: GET_KNOWLEDGE_GRAPH,
  description:
    'Get the knowledge graph for a base: a synthetic core, one node per type, one per knowledge',
  request: {
    params: z.object({
      baseId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'The assembled knowledge graph.',
      content: {
        'application/json': {
          schema: getKnowledgeGraphVoSchema,
        },
      },
    },
  },
  tags: ['knowledge-graph'],
});

export const getKnowledgeGraph = async (baseId: string) => {
  return axios.get<IGetKnowledgeGraphVo>(urlBuilder(GET_KNOWLEDGE_GRAPH, { baseId }));
};
