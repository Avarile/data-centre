import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { saveChatFileRoSchema, type ISaveChatFileRo } from '@teable/openapi';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { ChatFileService } from './chat-file.service';

@Controller('api/:baseId/chat-files')
export class ChatFileController {
  constructor(private readonly chatFileService: ChatFileService) {}

  @Get()
  @Permissions('base|read')
  async listFiles(@Param('baseId') baseId: string) {
    return this.chatFileService.listFiles(baseId);
  }

  @Post()
  @Permissions('base|read')
  async saveFile(
    @Param('baseId') baseId: string,
    @Body(new ZodValidationPipe(saveChatFileRoSchema)) body: ISaveChatFileRo
  ) {
    return this.chatFileService.saveFile(baseId, body);
  }

  @Delete(':fileId')
  @Permissions('base|delete')
  async deleteFile(@Param('baseId') baseId: string, @Param('fileId') fileId: string) {
    await this.chatFileService.deleteFile(baseId, fileId);
    return null;
  }
}
