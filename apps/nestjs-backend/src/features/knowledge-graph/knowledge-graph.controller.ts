import { Controller, Get, HttpStatus, Param, Req, Res } from '@nestjs/common';
import type { IGetKnowledgeGraphNodeVo, IGetKnowledgeGraphVo } from '@teable/openapi';
import type { Request, Response } from 'express';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { KnowledgeGraphService } from './knowledge-graph.service';

/**
 * Mounted under `api/base/:baseId` because PermissionGuard resolves the
 * resource from `req.params.baseId | spaceId | tableId` — a @Permissions route
 * exposing none of them throws at runtime. @Permissions is also mandatory
 * rather than optional: without it API tokens are blocked entirely.
 *
 * AuthGuard and PermissionGuard are global APP_GUARDs, so no @UseGuards here,
 * and deliberately no @AllowAnonymous().
 */
@Controller('api/base/:baseId/knowledge-graph')
export class KnowledgeGraphController {
  constructor(private readonly knowledgeGraphService: KnowledgeGraphService) {}

  @Permissions('record|read')
  @Get()
  async getKnowledgeGraph(
    @Param('baseId') baseId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ): Promise<IGetKnowledgeGraphVo | undefined> {
    const vo = await this.knowledgeGraphService.getGraph(baseId);

    res.setHeader('ETag', vo.etag);
    res.setHeader('Cache-Control', 'private, no-cache');
    res.setHeader('Vary', 'Cookie, Authorization');

    // Browser XHR never observes this: with `no-cache` the browser revalidates
    // and serves the stored body as a 200. The branch is for non-browser
    // callers that send If-None-Match themselves.
    if (req.headers['if-none-match'] === vo.etag) {
      res.status(HttpStatus.NOT_MODIFIED);
      return undefined;
    }

    return vo;
  }

  @Permissions('record|read')
  @Get('node/:nodeId')
  async getKnowledgeGraphNode(
    @Param('baseId') baseId: string,
    @Param('nodeId') nodeId: string
  ): Promise<IGetKnowledgeGraphNodeVo> {
    return this.knowledgeGraphService.getNode(baseId, nodeId);
  }
}
