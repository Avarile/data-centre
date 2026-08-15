import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { GlobalModule } from '../../global/global.module';
import { TableModule } from './table.module';
import { TableService } from './table.service';

describe('TableService', () => {
  let service: TableService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [GlobalModule, TableModule],
    }).compile();

    service = module.get<TableService>(TableService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should convert table name to valid db table name', () => {
    const dbTableName = service.generateValidName('!@#$1_a ha3ha 中文');
    expect(dbTableName).toBe('t1_a_ha3ha_Zhong_Wen');
  });

  it('should limit table name to 40', () => {
    const dbTableName = service.generateValidName('t'.repeat(50));
    expect(dbTableName).toBe('t'.repeat(40));
  });

  it('should convert chinese to pin yin', () => {
    const dbTableName = service.generateValidName('中文');
    expect(dbTableName).toBe('Zhong_Wen');
  });

  it('should convert empty table name unnamed', () => {
    const dbTableName = service.generateValidName('');
    expect(dbTableName).toBe('unnamed');
  });

  describe('cleanupCreatedDataTable', () => {
    const dropSql = 'DROP TABLE IF EXISTS "bse1"."tbl1" CASCADE';

    const createHarness = (inTransaction: boolean) => {
      const executeRawUnsafe = vi.fn().mockResolvedValue(1);
      const logger = { error: vi.fn(), debug: vi.fn() };
      const txClient = { $executeRawUnsafe: executeRawUnsafe };
      const dataPrismaService = {
        $executeRawUnsafe: executeRawUnsafe,
        // txClient() hands back the service itself only when nothing wraps the call in a
        // transaction; inside one it returns a distinct transaction client.
        txClient: () => (inTransaction ? txClient : dataPrismaService),
      };

      const target = Object.create(TableService.prototype);
      Object.assign(target, {
        logger,
        dataPrismaService,
        dbProvider: { dropTable: vi.fn().mockReturnValue(dropSql) },
      });

      return { target, executeRawUnsafe, logger };
    };

    it('leaves the drop to the rollback when it runs inside a transaction', async () => {
      const { target, executeRawUnsafe, logger } = createHarness(true);

      await target.cleanupCreatedDataTable('bse1.tbl1', new Error('schema does not exist'));

      // Issuing it here could only raise 25P02 and would log an ERROR blaming cleanup for a
      // failure it did not cause.
      expect(executeRawUnsafe).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('schema does not exist'));
    });

    it('still drops the table when no transaction will roll it back', async () => {
      const { target, executeRawUnsafe, logger } = createHarness(false);

      await target.cleanupCreatedDataTable('bse1.tbl1', new Error('boom'));

      expect(executeRawUnsafe).toHaveBeenCalledWith(dropSql);
      expect(logger.error).not.toHaveBeenCalled();
    });
  });
});
