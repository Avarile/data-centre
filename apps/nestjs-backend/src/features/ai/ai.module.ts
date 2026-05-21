import { Module } from '@nestjs/common';
import { ChatFileModule } from '../chat-file/chat-file.module';
import { SettingModule } from '../setting/setting.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import {
  AiConfigService,
  GatewayModelService,
  GenerationService,
  ModelCapabilityService,
  ModelResolverService,
  TtsService,
} from './service';

const subServices = [
  AiConfigService,
  GatewayModelService,
  ModelResolverService,
  ModelCapabilityService,
  GenerationService,
  TtsService,
];

@Module({
  imports: [SettingModule, ChatFileModule],
  controllers: [AiController],
  providers: [AiService, ...subServices],
  exports: [AiService],
})
export class AiModule {}
