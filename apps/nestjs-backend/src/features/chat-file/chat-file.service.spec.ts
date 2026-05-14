/* eslint-disable @typescript-eslint/no-explicit-any */
import { NotFoundException } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { PrismaService } from '@teable/db-main-prisma';
import { ClsService } from 'nestjs-cls';
import { Readable } from 'stream';
import type { DeepMockProxy } from 'vitest-mock-extended';
import { mockDeep, mockReset } from 'vitest-mock-extended';
import type { IClsStore } from '../../types/cls';
import StorageAdapter from '../attachments/plugins/adapter';
import { ChatFileService } from './chat-file.service';

// The storage adapter is registered under this symbol token
const STORAGE_ADAPTER_TOKEN = Symbol.for('ObjectStorage');

// ── helpers ──────────────────────────────────────────────────────────────────

function makeReadable(content: string): Readable {
  const stream = new Readable({ read() {} });
  stream.push(content);
  stream.push(null);
  return stream;
}

function makeChatFileRecord(overrides: Partial<any> = {}) {
  return {
    id: 'file-id-1',
    token: 'token-abc',
    name: 'report.pdf',
    size: BigInt(1024),
    mimetype: 'application/pdf',
    path: 'chat-file/report.pdf',
    baseId: 'base-id-1',
    createdBy: 'user-id-1',
    createdTime: new Date('2026-05-14T00:00:00.000Z'),
    deletedTime: null,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe('ChatFileService', () => {
  let service: ChatFileService;
  let prisma: DeepMockProxy<PrismaService>;
  let cls: DeepMockProxy<ClsService<IClsStore>>;
  let storageAdapter: DeepMockProxy<StorageAdapter>;

  beforeEach(async () => {
    prisma = mockDeep<PrismaService>();
    cls = mockDeep<ClsService<IClsStore>>();
    storageAdapter = mockDeep<StorageAdapter>();

    // txClient() is used by some prisma helpers — wire it back to the mock itself
    prisma.txClient.mockReturnValue(prisma as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatFileService,
        { provide: PrismaService, useValue: prisma },
        { provide: ClsService, useValue: cls },
        { provide: STORAGE_ADAPTER_TOKEN, useValue: storageAdapter },
      ],
    }).compile();

    service = module.get<ChatFileService>(ChatFileService);
  });

  afterEach(() => {
    mockReset(prisma);
    mockReset(cls);
    mockReset(storageAdapter);
    vitest.resetAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── listFiles ──────────────────────────────────────────────────────────────

  describe('listFiles', () => {
    it('returns files for a base ordered by createdTime desc', async () => {
      const records = [
        makeChatFileRecord({ id: '1', name: 'a.pdf', size: BigInt(500) }),
        makeChatFileRecord({ id: '2', name: 'b.txt', size: BigInt(200), mimetype: 'text/plain' }),
      ];
      prisma.chatFile.findMany.mockResolvedValue(records as any);

      const result = await service.listFiles('base-id-1');

      expect(prisma.chatFile.findMany).toHaveBeenCalledWith({
        where: { baseId: 'base-id-1', deletedTime: null },
        orderBy: { createdTime: 'desc' },
      });
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: '1',
        name: 'a.pdf',
        size: 500,
        baseId: 'base-id-1',
      });
    });

    it('returns an empty array when no files exist', async () => {
      prisma.chatFile.findMany.mockResolvedValue([]);

      const result = await service.listFiles('base-empty');

      expect(result).toEqual([]);
    });

    it('serialises BigInt size as a plain number', async () => {
      prisma.chatFile.findMany.mockResolvedValue([
        makeChatFileRecord({ size: BigInt(9_999_999) }),
      ] as any);

      const result = await service.listFiles('base-id-1');

      expect(typeof result[0].size).toBe('number');
      expect(result[0].size).toBe(9_999_999);
    });
  });

  // ── saveFile ───────────────────────────────────────────────────────────────

  describe('saveFile', () => {
    const validDto = {
      token: 'tok-1',
      name: 'report.pdf',
      size: 1024,
      mimetype: 'application/pdf',
      path: 'chat-file/report.pdf',
    };

    beforeEach(() => {
      cls.get.mockImplementation((key: any) => {
        if (key === 'user.id') return 'user-id-1';
      });
    });

    it('creates a chat_file row and returns the mapped VO', async () => {
      const created = makeChatFileRecord();
      prisma.chatFile.create.mockResolvedValue(created as any);

      const result = await service.saveFile('base-id-1', validDto);

      expect(prisma.chatFile.create).toHaveBeenCalledWith({
        data: {
          token: validDto.token,
          name: validDto.name,
          size: BigInt(validDto.size),
          mimetype: validDto.mimetype,
          path: validDto.path,
          baseId: 'base-id-1',
          createdBy: 'user-id-1',
        },
      });
      expect(result.token).toBe('token-abc');
      expect(result.size).toBe(1024); // BigInt coerced to number
    });

    it('throws on a disallowed MIME type', async () => {
      await expect(
        service.saveFile('base-id-1', { ...validDto, mimetype: 'video/mp4' })
      ).rejects.toThrow('File type video/mp4 is not allowed');

      expect(prisma.chatFile.create).not.toHaveBeenCalled();
    });

    it('throws when file exceeds 10 MB', async () => {
      const oversized = { ...validDto, size: 11 * 1024 * 1024 };

      await expect(service.saveFile('base-id-1', oversized)).rejects.toThrow(
        'File size exceeds 10 MB limit'
      );

      expect(prisma.chatFile.create).not.toHaveBeenCalled();
    });

    it('accepts every allowed MIME type without throwing', async () => {
      const allowedTypes = [
        'application/pdf',
        'text/plain',
        'text/markdown',
        'text/html',
        'text/csv',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
      ];

      for (const mimetype of allowedTypes) {
        prisma.chatFile.create.mockResolvedValue(makeChatFileRecord({ mimetype }) as any);
        await expect(
          service.saveFile('base-id-1', { ...validDto, mimetype })
        ).resolves.toBeDefined();
      }
    });

    it('accepts a file at exactly 10 MB (boundary)', async () => {
      const boundary = { ...validDto, size: 10 * 1024 * 1024 };
      prisma.chatFile.create.mockResolvedValue(
        makeChatFileRecord({ size: BigInt(boundary.size) }) as any
      );

      await expect(service.saveFile('base-id-1', boundary)).resolves.toBeDefined();
    });

    it('throws for a file one byte over 10 MB (boundary)', async () => {
      const overBoundary = { ...validDto, size: 10 * 1024 * 1024 + 1 };

      await expect(service.saveFile('base-id-1', overBoundary)).rejects.toThrow(
        'File size exceeds 10 MB limit'
      );
    });
  });

  // ── deleteFile ─────────────────────────────────────────────────────────────

  describe('deleteFile', () => {
    it('soft-deletes the row and removes the object from storage', async () => {
      const record = makeChatFileRecord();
      prisma.chatFile.findFirst.mockResolvedValue(record as any);
      prisma.chatFile.update.mockResolvedValue({ ...record, deletedTime: new Date() } as any);
      storageAdapter.deleteFile.mockResolvedValue(undefined);

      await service.deleteFile('base-id-1', 'file-id-1');

      // DB row is soft-deleted
      expect(prisma.chatFile.update).toHaveBeenCalledWith({
        where: { id: 'file-id-1' },
        data: { deletedTime: expect.any(Date) },
      });

      // Object is removed from MinIO
      expect(storageAdapter.deleteFile).toHaveBeenCalledWith(
        expect.any(String), // bucket name from config
        record.path
      );
    });

    it('throws NotFoundException when file does not exist', async () => {
      prisma.chatFile.findFirst.mockResolvedValue(null);

      await expect(service.deleteFile('base-id-1', 'ghost-id')).rejects.toThrow(NotFoundException);

      expect(prisma.chatFile.update).not.toHaveBeenCalled();
      expect(storageAdapter.deleteFile).not.toHaveBeenCalled();
    });

    it('does not expose a storage error — soft-delete still commits', async () => {
      const record = makeChatFileRecord();
      prisma.chatFile.findFirst.mockResolvedValue(record as any);
      prisma.chatFile.update.mockResolvedValue({ ...record, deletedTime: new Date() } as any);
      storageAdapter.deleteFile.mockRejectedValue(new Error('MinIO unreachable'));

      // Should NOT throw even though MinIO failed
      await expect(service.deleteFile('base-id-1', 'file-id-1')).resolves.toBeUndefined();

      // But the DB soft-delete was still committed
      expect(prisma.chatFile.update).toHaveBeenCalled();
    });

    it('rejects a file from a different base (baseId scoping)', async () => {
      // findFirst returns null because the baseId filter does not match
      prisma.chatFile.findFirst.mockResolvedValue(null);

      await expect(service.deleteFile('other-base', 'file-id-1')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  // ── extractTextFromTokens ──────────────────────────────────────────────────

  describe('extractTextFromTokens', () => {
    it('returns empty string for an empty token list', async () => {
      const result = await service.extractTextFromTokens([]);
      expect(result).toBe('');
      expect(prisma.chatFile.findMany).not.toHaveBeenCalled();
    });

    it('returns empty string when no matching records are found', async () => {
      prisma.chatFile.findMany.mockResolvedValue([]);
      const result = await service.extractTextFromTokens(['tok-missing']);
      expect(result).toBe('');
    });

    it('extracts plain text from a text/plain file', async () => {
      const record = makeChatFileRecord({ mimetype: 'text/plain', name: 'notes.txt' });
      prisma.chatFile.findMany.mockResolvedValue([record] as any);
      storageAdapter.downloadFile.mockResolvedValue(makeReadable('Hello world') as any);

      const result = await service.extractTextFromTokens(['token-abc']);

      expect(result).toContain('--- File: notes.txt ---');
      expect(result).toContain('Hello world');
    });

    it('extracts plain text from text/markdown, text/html, and text/csv files', async () => {
      const types = [
        { mimetype: 'text/markdown', name: 'readme.md', content: '# Heading' },
        { mimetype: 'text/html', name: 'page.html', content: '<h1>Hi</h1>' },
        { mimetype: 'text/csv', name: 'data.csv', content: 'a,b\n1,2' },
      ];

      for (const { mimetype, name, content } of types) {
        const record = makeChatFileRecord({ mimetype, name, token: `tok-${name}` });
        prisma.chatFile.findMany.mockResolvedValue([record] as any);
        storageAdapter.downloadFile.mockResolvedValue(makeReadable(content) as any);

        const result = await service.extractTextFromTokens([`tok-${name}`]);
        expect(result).toContain(content);
      }
    });

    it('only queries tokens with deletedTime: null', async () => {
      prisma.chatFile.findMany.mockResolvedValue([]);

      await service.extractTextFromTokens(['tok-1', 'tok-2']);

      expect(prisma.chatFile.findMany).toHaveBeenCalledWith({
        where: { token: { in: ['tok-1', 'tok-2'] }, deletedTime: null },
      });
    });

    it('skips a file and continues when extraction throws', async () => {
      const goodRecord = makeChatFileRecord({
        name: 'good.txt',
        mimetype: 'text/plain',
        token: 'tok-good',
      });
      const badRecord = makeChatFileRecord({ id: 'bad-id', name: 'bad.pdf', token: 'tok-bad' });

      prisma.chatFile.findMany.mockResolvedValue([badRecord, goodRecord] as any);
      storageAdapter.downloadFile
        .mockRejectedValueOnce(new Error('storage error')) // bad.pdf fails
        .mockResolvedValueOnce(makeReadable('Good content') as any); // good.txt succeeds

      const result = await service.extractTextFromTokens(['tok-bad', 'tok-good']);

      // Good file still appears in the output
      expect(result).toContain('Good content');
      // No unhandled rejection — the bad file is skipped silently
    });

    it('separates multiple files with double newlines', async () => {
      const records = [
        makeChatFileRecord({ name: 'a.txt', token: 'tok-a', mimetype: 'text/plain' }),
        makeChatFileRecord({ id: '2', name: 'b.txt', token: 'tok-b', mimetype: 'text/plain' }),
      ];
      prisma.chatFile.findMany.mockResolvedValue(records as any);
      storageAdapter.downloadFile
        .mockResolvedValueOnce(makeReadable('Content A') as any)
        .mockResolvedValueOnce(makeReadable('Content B') as any);

      const result = await service.extractTextFromTokens(['tok-a', 'tok-b']);

      expect(result).toContain('--- File: a.txt ---');
      expect(result).toContain('--- File: b.txt ---');
      // The two file blocks are separated by \n\n
      expect(result).toMatch(/Content A\n\n---/);
    });
  });
});
