import { axios } from '../axios';
import { registerRoute } from '../utils';
import { z } from '../zod';
import { mcpToolItemSchema } from './types';

export const GET_MCP_MANIFEST = '/mcp/manifest';

export const getMcpManifestVoSchema = z.object({
  /** Absolute URL an MCP client should be pointed at. */
  endpoint: z.string(),
  /** False when MCP_READONLY is set; the catalogue then holds read tools only. */
  writesEnabled: z.boolean(),
  maxRecordsPerCall: z.number(),
  maxDeletePerCall: z.number(),
  tools: z.array(mcpToolItemSchema),
});

export type GetMcpManifestVo = z.infer<typeof getMcpManifestVoSchema>;

export const getMcpManifestRoute = registerRoute({
  method: 'get',
  path: GET_MCP_MANIFEST,
  description: 'Get the MCP tool catalogue and connection details',
  request: {},
  responses: {
    200: {
      description: 'Returns the MCP manifest.',
      content: {
        'application/json': {
          schema: getMcpManifestVoSchema,
        },
      },
    },
  },
  tags: ['mcp'],
});

export const getMcpManifest = async () => {
  return axios.get<GetMcpManifestVo>(GET_MCP_MANIFEST);
};
