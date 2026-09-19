import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { HttpException, Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { McpToolRegistry } from './tool-registry';

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(private readonly registry: McpToolRegistry) {}

  /**
   * One McpServer and transport per request, in stateless mode
   * (sessionIdGenerator undefined). No session map means no sticky-session
   * requirement, which matters because replica count is not pinned to 1.
   */
  async handleRequest(req: Request, res: Response) {
    const server = new McpServer(
      { name: 'teable', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    for (const tool of this.registry.list()) {
      server.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: (tool.inputSchema as z.ZodObject<z.ZodRawShape>).shape,
          annotations: tool.annotations,
        },
        async (args: unknown) => this.runTool(tool.name, args)
      );
    }

    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

    res.on('close', () => {
      void transport.close();
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  /**
   * Tool execution failures come back as tool results, not protocol errors, so
   * the model can read the message and self-correct — "I may not write to that
   * table, but I may read it" is something it can only learn this way.
   */
  private async runTool(name: string, args: unknown) {
    try {
      const result = await this.registry.invoke(name, args);
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      const message = this.toSafeMessage(error);
      // Log the real error, return only the safe message.
      this.logger.warn(
        `MCP tool "${name}" failed: ${error instanceof Error ? error.stack : String(error)}`
      );
      return {
        isError: true,
        content: [{ type: 'text' as const, text: message }],
      };
    }
  }

  /**
   * User-facing text only.
   *
   * Only HttpException messages are passed through: those are deliberately
   * written for users and are i18n-keyed. Anything else — a Prisma error, a
   * driver error, an unexpected throw — carries query fragments, table names
   * and stack context, so it is replaced with a generic line and the detail
   * goes to the log instead.
   */
  private toSafeMessage(error: unknown): string {
    if (error instanceof z.ZodError) {
      return `Invalid arguments: ${error.issues
        .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
        .join('; ')}`;
    }
    if (error instanceof HttpException) {
      return error.message;
    }
    return 'The tool failed. Check the server logs for details.';
  }
}
