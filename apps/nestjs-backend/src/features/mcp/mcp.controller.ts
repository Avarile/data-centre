import { Controller, Delete, Get, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TokenAccess } from '../auth/decorators/token.decorator';
import { McpService } from './mcp.service';

/**
 * Deliberately carries @TokenAccess() and NO @Permissions.
 *
 * PermissionGuard resolves required actions from @Permissions metadata and the
 * resource id from req.params (permission.guard.ts:34,241-245). This is one
 * route dispatching N operations whose resource and actions are only knowable
 * after the JSON-RPC body is parsed, so the decorator model cannot express it.
 * permission.guard.ts:246-254 defers to IS_TOKEN_ACCESS exactly for this case,
 * and McpToolRegistry.invoke() then authorizes per tool call.
 *
 * Consequence: the guard authorizes nothing here. Any code path that reaches a
 * tool's execute() without going through the registry is an unauthenticated
 * data path.
 */
@Controller('api/mcp')
export class McpController {
  constructor(private readonly mcpService: McpService) {}

  @TokenAccess()
  @Post()
  async handle(@Req() req: Request, @Res() res: Response) {
    await this.mcpService.handleRequest(req, res);
  }

  @TokenAccess()
  @Get()
  getNotAllowed(@Res() res: Response) {
    this.methodNotAllowed(res);
  }

  @TokenAccess()
  @Delete()
  deleteNotAllowed(@Res() res: Response) {
    this.methodNotAllowed(res);
  }

  /**
   * Stateless mode has no server-to-client stream to resume and no session to
   * terminate, so GET and DELETE are answered honestly rather than 404'd.
   */
  private methodNotAllowed(res: Response) {
    res.status(HttpStatus.METHOD_NOT_ALLOWED).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message:
          'This MCP endpoint is stateless: it accepts POST only. There is no session to resume or terminate.',
      },
      id: null,
    });
  }
}
