import { Module } from '@nestjs/common';
import { RecordModule } from '../record/record.module';
import { KnowledgeGraphController } from './knowledge-graph.controller';
import { KnowledgeGraphService } from './knowledge-graph.service';

/**
 * AuthModule is deliberately absent: it does not export PermissionService.
 * PermissionService injects because PermissionModule is @Global() via
 * GlobalModule.
 */
@Module({
  imports: [RecordModule],
  controllers: [KnowledgeGraphController],
  providers: [KnowledgeGraphService],
  exports: [KnowledgeGraphService],
})
export class KnowledgeGraphModule {}
