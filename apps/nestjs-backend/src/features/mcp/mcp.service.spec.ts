/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Server } from 'http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { ForbiddenException } from '@nestjs/common';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { McpService } from './mcp.service';
import type { IMcpTool } from './types';

const recordRead = 'record|read';

/**
 * Protocol-level coverage: drives McpService with the real MCP SDK client over
 * a real HTTP socket, so handshake, tool discovery and tool invocation are
 * proven against the SDK rather than against our assumptions. The registry is
 * stubbed, so this needs no database.
 */

const echoTool: IMcpTool = {
  name: 'echo',
  title: 'Echo',
  description: 'Returns what it is given.',
  inputSchema: z.object({ text: z.string() }),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  requiredActions: [recordRead],
  resolveResource: () => null,
  execute: async (args: any) => ({ echoed: args.text }),
};

const leakyTool: IMcpTool = {
  name: 'leak',
  title: 'Leak',
  description: 'Throws a raw driver-style error.',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  requiredActions: [recordRead],
  resolveResource: () => null,
  execute: async () => {
    throw new Error('Invalid `prisma.record.findMany()` — SELECT * FROM "visible_tbl_secret"');
  },
};

const explodingTool: IMcpTool = {
  name: 'explode',
  title: 'Explode',
  description: 'Always fails.',
  inputSchema: z.object({}),
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
  requiredActions: [recordRead],
  resolveResource: () => null,
  execute: async () => {
    throw new ForbiddenException('not allowed to operate record|read on tbl1');
  },
};

describe('McpService (protocol)', () => {
  let server: Server;
  let baseUrl: URL;
  const invoke = vi.fn(async (name: string, args: unknown) => {
    const tool = [echoTool, explodingTool, leakyTool].find((t) => t.name === name);
    if (!tool) throw new Error(`Unknown tool "${name}"`);
    return tool.execute(tool.inputSchema.parse(args ?? {}) as never, {} as never);
  });

  beforeAll(async () => {
    const registry = {
      list: () => [echoTool, explodingTool, leakyTool],
      get: vi.fn(),
      invoke,
    } as any;
    const service = new McpService(registry);

    const app = express();
    app.use(express.json());
    app.post('/api/mcp', async (req, res) => {
      await service.handleRequest(req as never, res as never);
    });

    server = await new Promise<Server>((resolve) => {
      const s = app.listen(0, () => resolve(s));
    });
    const { port } = server.address() as { port: number };
    baseUrl = new URL(`http://127.0.0.1:${port}/api/mcp`);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const connect = async () => {
    const client = new Client({ name: 'test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(baseUrl));
    return client;
  };

  it('completes the initialize handshake', async () => {
    const client = await connect();
    expect(client.getServerVersion()).toMatchObject({ name: 'teable' });
    await client.close();
  });

  it('lists the registered tools with their annotations', async () => {
    const client = await connect();
    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual(['echo', 'explode', 'leak']);
    const echo = tools.find((t) => t.name === 'echo');
    expect(echo?.description).toContain('Returns what it is given');
    expect(echo?.annotations?.readOnlyHint).toBe(true);
    await client.close();
  });

  it('invokes a tool and returns its result', async () => {
    const client = await connect();
    const result: any = await client.callTool({ name: 'echo', arguments: { text: 'hi' } });

    expect(result.isError).toBeFalsy();
    expect(JSON.parse(result.content[0].text)).toEqual({ echoed: 'hi' });
    await client.close();
  });

  it('surfaces an execution failure as an error RESULT, not a protocol error', async () => {
    // The model must be able to read the message and self-correct; a protocol
    // error would abort the call and teach it nothing.
    const client = await connect();
    const result: any = await client.callTool({ name: 'explode', arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not allowed to operate');
    await client.close();
  });

  it('reports invalid arguments as a readable error result', async () => {
    const client = await connect();
    const result: any = await client.callTool({ name: 'echo', arguments: { text: 123 } });

    expect(result.isError).toBe(true);
    await client.close();
  });

  it('never leaks a stack trace', async () => {
    const client = await connect();
    const result: any = await client.callTool({ name: 'explode', arguments: {} });

    expect(result.content[0].text).not.toContain('at ');
    expect(result.content[0].text).not.toContain('.ts:');
    await client.close();
  });

  it('replaces a non-HTTP error with a generic message', async () => {
    // A Prisma or driver error carries query fragments and table names, so
    // only deliberately user-facing HttpException messages pass through.
    const client = await connect();
    const result: any = await client.callTool({ name: 'leak', arguments: {} });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain('SELECT');
    expect(result.content[0].text).toContain('Check the server logs');
    await client.close();
  });
});
