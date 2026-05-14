import { Module } from '@nestjs/common';
import { StorageModule } from '../attachments/plugins/storage.module';
import { ChatFileController } from './chat-file.controller';
import { ChatFileService } from './chat-file.service';

@Module({
  imports: [StorageModule],
  controllers: [ChatFileController],
  providers: [ChatFileService],
  exports: [ChatFileService],
})
export class ChatFileModule {}
