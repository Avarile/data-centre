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
  parentId: z.string().nullable().meta({
    description:
      'Parent node id: a parent type for a type; a parent knowledge for a nested knowledge, otherwise its type.',
  }),
  parentLabel: z.string().nullable(),
  ancestors: z.object({ id: z.string(), label: z.string() }).array().meta({
    description:
      'Root-first breadcrumb, excluding this node. For a nested knowledge it spans both hierarchies: the type chain of the root knowledge, then the knowledge chain down to the immediate parent. Empty for a root type.',
  }),
  relatedCount: z.number().int().meta({ description: 'Peer relations; always 0 for a type node.' }),
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
