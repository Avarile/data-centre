/* eslint-disable @typescript-eslint/naming-convention */
import { Inject } from '@nestjs/common';
import { registerAs } from '@nestjs/config';

export const mcpConfig = registerAs('mcp', () => ({
  /** Master switch. When false the MCP module registers no routes. */
  enabled: process.env.MCP_ENABLED !== 'false',
  /** Drops every non-read-only tool from the catalogue at registry construction. */
  readonly: process.env.MCP_READONLY === 'true',
  /** Hard cap for query_records.take, applied after zod parsing. */
  maxRecordsPerCall: Number(process.env.MCP_MAX_RECORDS_PER_CALL ?? 500),
  /** Hard cap for delete_records, bounding the blast radius of one call. */
  maxDeletePerCall: Number(process.env.MCP_MAX_DELETE_PER_CALL ?? 200),
}));

export const McpConfig = () => Inject(mcpConfig.KEY);

export type IMcpConfig = ReturnType<typeof mcpConfig>;
