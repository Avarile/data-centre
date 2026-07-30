import type { RouteConfig } from '@asteasolutions/zod-to-openapi';
import { axios } from '../axios';
import { registerRoute, urlBuilder } from '../utils';
import { z } from '../zod';
import { knowledgeDetailTierSchema } from './types';

export const GET_KNOWLEDGE_GRAPH_NODE = '/base/{baseId}/knowledge-graph/node/{nodeId}';

/**
 * `createdTime` / `lastModifiedTime` are nullable: `IRecord` types them as
 * `string | undefined` and the underlying column can be null for rows that
 * have never been modified.
 */
export const getKnowledgeGraphNodeVoSchema = z.object({
  id: z.string(),
  recordId: z.string(),
  tier: knowledgeDetailTierSchema,
  label: z.string(),
  context: z.string().nullable().meta({ description: 'Full body text; may be long.' }),
  typeId: z.string().nullable(),
  typeLabel: z.string().nullable().meta({ description: 'Carried free by the link cell.' }),
  createdTime: z.string().nullable(),
  lastModifiedTime: z.string().nullable(),
});

export type IGetKnowledgeGraphNodeVo = z.infer<typeof getKnowledgeGraphNodeVoSchema>;

export const GetKnowledgeGraphNodeRoute: RouteConfig = registerRoute({
  method: 'get',
  path: GET_KNOWLEDGE_GRAPH_NODE,
  description: 'Get the detail of a single knowledge graph node',
  request: {
    params: z.object({
      baseId: z.string(),
      nodeId: z.string(),
    }),
  },
  responses: {
    200: {
      description: 'Returns the record behind the node.',
      content: {
        'application/json': {
          schema: getKnowledgeGraphNodeVoSchema,
        },
      },
    },
  },
  tags: ['knowledge-graph'],
});

export const getKnowledgeGraphNode = async (baseId: string, nodeId: string) => {
  return axios.get<IGetKnowledgeGraphNodeVo>(
    urlBuilder(GET_KNOWLEDGE_GRAPH_NODE, { baseId, nodeId })
  );
};
