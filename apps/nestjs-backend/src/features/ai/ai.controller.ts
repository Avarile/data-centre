import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { aiGenerateRoSchema, IAiGenerateRo } from '@teable/openapi';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { ZodValidationPipe } from '../../zod.validation.pipe';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { TablePipe } from '../table/open-api/table.pipe';
import { AiService } from './ai.service';

const INGEST_ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);
const INGEST_MAX_FILE_SIZE = 10 * 1024 * 1024;

@Controller('api/:baseId/ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('/generate-stream')
  @Permissions('base|read')
  async generateStream(
    @Param('baseId') baseId: string,
    @Body(new ZodValidationPipe(aiGenerateRoSchema), TablePipe) aiGenerateRo: IAiGenerateRo,
    @Res() res: Response
  ) {
    await this.aiService.generateStream(baseId, aiGenerateRo, res);
  }

  @Get('/config')
  @Permissions('base|read')
  async getAIConfig(@Param('baseId') baseId: string) {
    return await this.aiService.getSimplifiedAIConfig(baseId);
  }

  @Get('/disable-ai-actions')
  @Permissions('base|read')
  async getAIDisableAIActions(@Param('baseId') baseId: string) {
    return await this.aiService.getAIDisableAIActions(baseId);
  }

  @Post('/tts')
  @Permissions('base|read')
  async tts(
    @Param('baseId') _baseId: string,
    @Body() body: { text?: string },
    @Res() res: Response
  ) {
    if (!body?.text?.trim()) throw new BadRequestException('text is required');
    await this.aiService.tts(body.text.trim(), res);
  }

  @Post('/ingest-stream')
  @Permissions('base|read')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: memoryStorage(),
      fileFilter: (_req, file, cb) => {
        if (INGEST_ALLOWED_MIME_TYPES.has(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException(`Unsupported file type: ${file.mimetype}`), false);
        }
      },
      limits: { fileSize: INGEST_MAX_FILE_SIZE },
    })
  )
  async ingestStream(
    @Param('baseId') baseId: string,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('targetTable') targetTable: string,
    @Body('description') description: string | undefined,
    @Res() res: Response
  ) {
    if (!files?.length) throw new BadRequestException('At least one file is required');
    if (!targetTable?.trim()) throw new BadRequestException('targetTable is required');

    await this.aiService.ingestStream(baseId, files, targetTable.trim(), description, res);
  }
}
