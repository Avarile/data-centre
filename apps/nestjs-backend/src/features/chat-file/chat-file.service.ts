import { Readable } from 'stream';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { HttpErrorCode } from '@teable/core';
import { PrismaService } from '@teable/db-main-prisma';
import { UploadType } from '@teable/openapi';
import type { ISaveChatFileRo } from '@teable/openapi';
import { ClsService } from 'nestjs-cls';
import { CustomHttpException } from '../../custom.exception';
import type { IClsStore } from '../../types/cls';
import StorageAdapter from '../attachments/plugins/adapter';
import { InjectStorageAdapter } from '../attachments/plugins/storage';

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/html',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

@Injectable()
export class ChatFileService {
  private readonly logger = new Logger(ChatFileService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly cls: ClsService<IClsStore>,
    @InjectStorageAdapter() private readonly storageAdapter: StorageAdapter
  ) {}

  async listFiles(baseId: string) {
    const records = await this.prismaService.chatFile.findMany({
      where: { baseId, deletedTime: null },
      orderBy: { createdTime: 'desc' },
    });

    return records.map((r) => ({
      id: r.id,
      token: r.token,
      name: r.name,
      size: Number(r.size),
      mimetype: r.mimetype,
      path: r.path,
      baseId: r.baseId,
      createdBy: r.createdBy,
      createdTime: r.createdTime.toISOString(),
    }));
  }

  async saveFile(baseId: string, dto: ISaveChatFileRo) {
    if (!ALLOWED_MIME_TYPES.has(dto.mimetype)) {
      throw new CustomHttpException(
        `File type ${dto.mimetype} is not allowed`,
        HttpErrorCode.VALIDATION_ERROR
      );
    }

    if (dto.size > MAX_FILE_SIZE) {
      throw new CustomHttpException(
        'File size exceeds 10 MB limit',
        HttpErrorCode.VALIDATION_ERROR
      );
    }

    const userId = this.cls.get('user.id');

    const record = await this.prismaService.chatFile.create({
      data: {
        token: dto.token,
        name: dto.name,
        size: BigInt(dto.size),
        mimetype: dto.mimetype,
        path: dto.path,
        baseId,
        createdBy: userId,
      },
    });

    return {
      id: record.id,
      token: record.token,
      name: record.name,
      size: Number(record.size),
      mimetype: record.mimetype,
      path: record.path,
      baseId: record.baseId,
      createdBy: record.createdBy,
      createdTime: record.createdTime.toISOString(),
    };
  }

  async deleteFile(baseId: string, fileId: string) {
    const record = await this.prismaService.chatFile.findFirst({
      where: { id: fileId, baseId, deletedTime: null },
    });

    if (!record) {
      throw new NotFoundException('Chat file not found');
    }

    await this.prismaService.chatFile.update({
      where: { id: fileId },
      data: { deletedTime: new Date() },
    });

    try {
      const bucket = StorageAdapter.getBucket(UploadType.ChatFile);
      await this.storageAdapter.deleteFile(bucket, record.path);
    } catch (err) {
      this.logger.warn(`Failed to delete file from storage: ${record.path}`, err);
    }
  }

  async extractTextFromTokens(tokens: string[]): Promise<string> {
    if (!tokens.length) return '';

    const records = await this.prismaService.chatFile.findMany({
      where: { token: { in: tokens }, deletedTime: null },
    });

    const parts: string[] = [];
    const bucket = StorageAdapter.getBucket(UploadType.ChatFile);

    for (const record of records) {
      try {
        const text = await this.extractTextFromFile(
          bucket,
          record.path,
          record.mimetype,
          record.name
        );
        if (text) {
          parts.push(`--- File: ${record.name} ---\n${text}`);
        }
      } catch (err) {
        this.logger.warn(`Failed to extract text from file ${record.name}`, err);
      }
    }

    return parts.join('\n\n');
  }

  private async streamToBuffer(stream: Readable): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    });
  }

  private async extractTextFromFile(
    bucket: string,
    path: string,
    mimetype: string,
    filename: string
  ): Promise<string> {
    const stream = await this.storageAdapter.downloadFile(bucket, path);
    const buffer = await this.streamToBuffer(stream as Readable);

    if (mimetype === 'application/pdf') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
      const result = await pdfParse(buffer);
      return result.text;
    }

    if (
      mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimetype === 'application/msword'
    ) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require('mammoth') as {
        extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
      };
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    }

    // text/plain, text/markdown, text/html, text/csv — readable directly
    return buffer.toString('utf-8');
  }
}
