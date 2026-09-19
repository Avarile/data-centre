import { z } from 'zod';
import { defineTool } from '../types';
import type { IMcpTool } from '../types';
import { baseIdSchema, spaceIdSchema, tableIdSchema } from './ids';

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };

const baseIdArg = z.object({ baseId: baseIdSchema });
const tableIdArg = z.object({ tableId: tableIdSchema });

/**
 * Discovery is a disclosure surface: a caller must never learn the name of a
 * space or base its token cannot reach.
 *
 * The two list tools resolve to no single resource, so validPermissions cannot
 * guard them and the filtering has to hold on its own. The two backing
 * services differ, and the difference matters:
 *   - SpaceService.getSpaceList already applies filterSpaceListWithAccessToken
 *     (space.service.ts:117), so list_spaces is token-safe as it stands.
 *   - BaseService.getAllBaseList filters by USER only, with no token step at
 *     all, so list_bases must apply the restriction itself. See its execute().
 */
export const buildDiscoveryTools = (): IMcpTool[] => [
  defineTool({
    name: 'list_spaces',
    title: 'List spaces',
    description:
      'List every space the current token can reach. Start here when you do not yet know which space or base to work in.',
    inputSchema: z.object({}),
    annotations: readOnly,
    requiredActions: ['space|read'],
    resolveResource: () => null,
    execute: async (_args, ctx) => {
      const spaces = await ctx.spaceService.getSpaceList();
      return spaces.map(({ id, name }) => ({ id, name }));
    },
  }),

  defineTool({
    name: 'list_bases',
    title: 'List bases',
    description:
      'List the bases in a space, or every reachable base when spaceId is omitted. A base contains tables.',
    inputSchema: z.object({
      spaceId: spaceIdSchema.optional().describe('Restrict to one space, e.g. spcXXXXXXXX'),
    }),
    annotations: readOnly,
    requiredActions: ['base|read'],
    resolveResource: (args) => args.spaceId ?? null,
    execute: async (args, ctx) => {
      const bases = (
        args.spaceId
          ? await ctx.spaceService.getBaseListBySpaceId(args.spaceId)
          : await ctx.baseService.getAllBaseList()
      ) as {
        id: string;
        name: string;
        spaceId: string;
      }[];

      // getAllBaseList filters by USER but not by TOKEN — unlike
      // SpaceService.getSpaceList, it has no filterSpaceListWithAccessToken
      // equivalent. Without this a token restricted to one base would
      // enumerate every base its owner can see. Mirrors the containment rule
      // in permission.service.ts:243-245.
      const scope = ctx.tokenScope;
      const visible =
        !scope || scope.hasFullAccess
          ? bases
          : bases.filter(
              (base) => scope.baseIds?.includes(base.id) || scope.spaceIds?.includes(base.spaceId)
            );

      return visible.map(({ id, name, spaceId }) => ({ id, name, spaceId }));
    },
  }),

  defineTool({
    name: 'list_tables',
    title: 'List tables',
    description: 'List the tables in a base, with their ids, names and descriptions.',
    inputSchema: baseIdArg,
    annotations: readOnly,
    requiredActions: ['table|read'],
    resolveResource: (args) => args.baseId,
    execute: async (args, ctx) => {
      const tables = await ctx.tableService.getTables(args.baseId);
      return (tables as { id: string; name: string; description?: string | null }[]).map(
        ({ id, name, description }) => ({ id, name, description: description ?? null })
      );
    },
  }),

  defineTool({
    name: 'get_table_schema',
    title: 'Get table schema',
    description:
      'Get a table with its full field list. Call this before querying or writing records so you know the field ids, types and options.',
    inputSchema: tableIdArg,
    annotations: readOnly,
    requiredActions: ['table|read', 'field|read'],
    resolveResource: (args) => args.tableId,
    execute: async (args, ctx) => {
      const baseId = await ctx.resolveBaseId(args.tableId);
      const [table, fields] = await Promise.all([
        ctx.tableService.getTable(baseId, args.tableId),
        ctx.fieldService.getFields(args.tableId, {}),
      ]);
      const { id, name, description } = table as {
        id: string;
        name: string;
        description?: string | null;
      };
      return {
        id,
        name,
        description: description ?? null,
        baseId,
        fields: (
          fields as {
            id: string;
            name: string;
            type: string;
            isPrimary?: boolean;
            isComputed?: boolean;
            notNull?: boolean;
            options?: unknown;
          }[]
        ).map((f) => ({
          id: f.id,
          name: f.name,
          type: f.type,
          isPrimary: f.isPrimary ?? false,
          isComputed: f.isComputed ?? false,
          notNull: f.notNull ?? false,
          options: f.options,
        })),
      };
    },
  }),

  defineTool({
    name: 'list_views',
    title: 'List views',
    description:
      'List the views of a table. A view id can be passed to query_records to apply that view filters and sort.',
    inputSchema: tableIdArg,
    annotations: readOnly,
    requiredActions: ['view|read'],
    resolveResource: (args) => args.tableId,
    execute: async (args, ctx) => {
      const views = await ctx.viewService.getViews(args.tableId);
      return views.map(({ id, name, type }) => ({ id, name, type }));
    },
  }),
];
