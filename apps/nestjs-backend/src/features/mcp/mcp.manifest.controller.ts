import { Controller, Get } from '@nestjs/common';
import type { GetMcpManifestVo } from '@teable/openapi';
import { BaseConfig, type IBaseConfig } from '../../configs/base.config';
import { TokenAccess } from '../auth/decorators/token.decorator';
import { McpToolRegistry } from './tool-registry';

/**
 * REST, unlike the MCP endpoint itself — this is what the settings UI renders,
 * so it belongs in the openapi contract. Any logged-in user may read the
 * catalogue: it exposes tool names and the scopes they require, never data.
 */
@Controller('api/mcp/manifest')
export class McpManifestController {
  constructor(
    @BaseConfig() private readonly baseConfig: IBaseConfig,
    private readonly registry: McpToolRegistry
  ) {}

  @TokenAccess()
  @Get()
  getManifest(): GetMcpManifestVo {
    const runtime = this.registry.runtime;
    return {
      endpoint: `${this.baseConfig.publicOrigin}/api/mcp`,
      writesEnabled: !runtime.readonly,
      maxRecordsPerCall: runtime.maxRecordsPerCall,
      maxDeletePerCall: runtime.maxDeletePerCall,
      tools: this.registry.list().map((tool) => ({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        group: this.registry.groupOf(tool.name),
        requiredActions: tool.requiredActions,
        annotations: tool.annotations,
      })),
    };
  }
}
