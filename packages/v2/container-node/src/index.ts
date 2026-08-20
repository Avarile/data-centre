import { createHash } from 'crypto';
import { PapaparseCsvParser } from '@teable/v2-adapter-csv-parser-papaparse';
import {
  PostgresUnitOfWork,
  registerV2PostgresDataDb,
  registerV2PostgresMetaDb,
  registerV2PostgresDb,
  v2DataDbTokens,
  v2MetaDbTokens,
  v2PostgresDbTokens,
} from '@teable/v2-adapter-db-postgres-pg';
import type { IV2PostgresStateAdapterConfig } from '@teable/v2-adapter-repository-postgres';
import { registerV2PostgresStateAdapter } from '@teable/v2-adapter-repository-postgres';
import {
  createTypeValidationStrategy,
  isTerminalDriverError,
  registerV2TableRepositoryPostgresAdapter,
  startComputedUpdatePollingIfEnabled,
  v2RecordRepositoryPostgresTokens,
  type IV2TableRepositoryPostgresConfig,
} from '@teable/v2-adapter-table-repository-postgres';
import { registerCommandExplainModule } from '@teable/v2-command-explain';
import {
  AsyncMemoryEventBus,
  MemoryCommandBus,
  MemoryQueryBus,
  NoopLogger,
  NoopRealtimeEngine,
  NoopTracer,
  registerV2CoreServices,
  v2CoreTokens,
  type ICommandBusMiddleware,
  type IHasher,
  type IQueryBusMiddleware,
  type ILogger,
  type ITracer,
} from '@teable/v2-core';
import type { DependencyContainer } from '@teable/v2-di';
import { Lifecycle, container } from '@teable/v2-di';
import { DotTeaParser } from '@teable/v2-dottea';

/**
 * Node.js crypto-based hasher implementation.
 */
class NodeCryptoHasher implements IHasher {
  sha256(input: string): string {
    return createHash('sha256').update(input).digest('hex');
  }
}

export interface IV2NodePgContainerOptions {
  connectionString?: string;
  metaConnectionString?: string;
  dataConnectionString?: string;
  ensureSchema?: boolean;
  seed?: Partial<IV2PostgresStateAdapterConfig['seed']>;
  maxFreeRowLimit?: number;
  logger?: ILogger;
  tracer?: ITracer;
  commandBusMiddlewares?: ReadonlyArray<ICommandBusMiddleware>;
  queryBusMiddlewares?: ReadonlyArray<IQueryBusMiddleware>;
  computedUpdate?: IV2TableRepositoryPostgresConfig['computedUpdate'];
}

const createEventHandlerLogger = (
  logger: ILogger,
  handlerName: string,
  eventName: string
): ILogger => {
  const baseLogger = logger
    .scope('eventHandler', { name: handlerName })
    .scope('event', { name: eventName });
  if (handlerName.endsWith('Projection')) {
    return baseLogger.scope('projection', { name: handlerName });
  }
  return baseLogger;
};

export const registerV2NodePgDependencies = async (
  c: DependencyContainer = container,
  options: IV2NodePgContainerOptions
): Promise<DependencyContainer> => {
  const metaConnectionString =
    options.metaConnectionString ??
    options.connectionString ??
    process.env.PRISMA_META_DATABASE_URL ??
    process.env.PRISMA_DATABASE_URL ??
    process.env.DATABASE_URL;
  if (!metaConnectionString) {
    throw new Error(
      'Missing pg meta connectionString (options.metaConnectionString or PRISMA_META_DATABASE_URL)'
    );
  }
  const dataConnectionString =
    options.dataConnectionString ?? process.env.PRISMA_DATA_DATABASE_URL ?? metaConnectionString;

  if (metaConnectionString === dataConnectionString) {
    await registerV2PostgresDb(c, { pg: { connectionString: metaConnectionString } });
  } else {
    await registerV2PostgresMetaDb(c, { pg: { connectionString: metaConnectionString } });
    await registerV2PostgresDataDb(c, { pg: { connectionString: dataConnectionString } });
    const metaDb = c.resolve(v2MetaDbTokens.db);
    c.registerInstance(v2PostgresDbTokens.db, metaDb);
    c.registerInstance(v2PostgresDbTokens.config, {
      pg: { connectionString: metaConnectionString },
    });
  }
  const metaDb = c.resolve(v2MetaDbTokens.db) as IV2PostgresStateAdapterConfig['db'];
  const dataDb = c.resolve(v2DataDbTokens.db) as IV2PostgresStateAdapterConfig['db'];

  const maxFreeRowLimit = resolveMaxFreeRowLimit(options.maxFreeRowLimit);

  await registerV2PostgresStateAdapter(c, {
    db: metaDb,
    ensureSchema: options.ensureSchema,
    seed: options.seed as IV2PostgresStateAdapterConfig['seed'],
    ...(maxFreeRowLimit ? { maxFreeRowLimit } : {}),
  });

  const typeValidationStrategy = await createTypeValidationStrategy(dataDb);
  registerV2TableRepositoryPostgresAdapter(c, {
    db: dataDb,
    metaDb,
    computedUpdate: options.computedUpdate,
    typeValidationStrategy,
  });

  c.register(v2CoreTokens.unitOfWork, PostgresUnitOfWork, {
    lifecycle: Lifecycle.Singleton,
  });

  const logger = options.logger ?? new NoopLogger();
  c.registerInstance(v2CoreTokens.logger, logger);

  const commandBus = new MemoryCommandBus(c, options.commandBusMiddlewares);
  c.registerInstance(v2CoreTokens.commandBus, commandBus);
  c.registerInstance(v2CoreTokens.internalCommandBus, commandBus);
  c.registerInstance(v2CoreTokens.queryBus, new MemoryQueryBus(c, options.queryBusMiddlewares));
  c.registerInstance(
    v2CoreTokens.eventBus,
    new AsyncMemoryEventBus(c, {
      recordPublishedEvents: false,
      onError: ({ error, event, handlerName }) => {
        const eventName = event.name.toString();
        const scopedLogger = createEventHandlerLogger(logger, handlerName, eventName);
        scopedLogger.error('Async event handler failed', {
          error,
          event: eventName,
          handler: handlerName,
        });
      },
    })
  );

  if (options.tracer) {
    c.registerInstance(v2CoreTokens.tracer, options.tracer);
  } else {
    c.register(v2CoreTokens.tracer, NoopTracer, {
      lifecycle: Lifecycle.Singleton,
    });
  }

  if (!c.isRegistered(v2CoreTokens.realtimeEngine)) {
    c.register(v2CoreTokens.realtimeEngine, NoopRealtimeEngine, {
      lifecycle: Lifecycle.Singleton,
    });
  }

  // Register CSV parser
  if (!c.isRegistered(v2CoreTokens.csvParser)) {
    c.register(v2CoreTokens.csvParser, PapaparseCsvParser, {
      lifecycle: Lifecycle.Singleton,
    });
  }

  if (!c.isRegistered(v2CoreTokens.dotTeaParser)) {
    c.register(v2CoreTokens.dotTeaParser, DotTeaParser, {
      lifecycle: Lifecycle.Singleton,
    });
  }

  // Register hasher
  if (!c.isRegistered(v2CoreTokens.hasher)) {
    c.register(v2CoreTokens.hasher, NodeCryptoHasher, {
      lifecycle: Lifecycle.Singleton,
    });
  }

  // Register core services (uses defaults unless already registered)
  registerV2CoreServices(c, { lifecycle: Lifecycle.Singleton });

  // Register command explain module
  registerCommandExplainModule(c);

  startComputedUpdatePollingIfEnabled(c);

  return c;
};

const resolveMaxFreeRowLimit = (value?: number): number | undefined => {
  if (typeof value === 'number' && value > 0) return value;
  const envValue = process.env.MAX_FREE_ROW_LIMIT;
  if (!envValue) return undefined;
  const parsed = Number(envValue);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

export const createV2NodePgContainer = async (
  options: IV2NodePgContainerOptions = {}
): Promise<DependencyContainer> => {
  const c = container.createChildContainer();
  await registerV2NodePgDependencies(c, options);
  return c;
};

/**
 * Tear down a container created by `createV2NodePgContainer`.
 *
 * `registerV2NodePgDependencies` starts a background computed-update poller as a
 * side effect, so a container that is merely dropped leaves a live `setTimeout`
 * holding a `Kysely` instance. The poller must be stopped *before* the driver is
 * destroyed — otherwise its next tick fails with `driver has already been
 * destroyed`, which is exactly the shutdown noise this helper exists to prevent.
 *
 * Every consumer of `createV2NodePgContainer` must call this; the container
 * cannot clean itself up, because tsyringe has no disposal semantics here.
 *
 * Idempotent and non-throwing: safe to call twice, and safe on a container that
 * never registered the polling or db tokens.
 */
export const disposeV2NodePgContainer = async (c: DependencyContainer): Promise<void> => {
  if (c.isRegistered(v2RecordRepositoryPostgresTokens.computedUpdatePollingService)) {
    const pollingService = c.resolve<{ stop(): Promise<void> }>(
      v2RecordRepositoryPostgresTokens.computedUpdatePollingService
    );
    // Deliberately not gated on `computedUpdatePollingConfig.enabled`: a poller
    // started by hand on a disabled config still owns a timer, and skipping it
    // would orphan that timer past the `destroy()` below.
    await pollingService.stop();
  }

  // The same `Kysely` instance is registered under several tokens when the meta
  // and data DSNs match, so dedupe before destroying.
  const closers = new Set<{ destroy(): Promise<void> }>();
  for (const token of [v2MetaDbTokens.db, v2DataDbTokens.db, v2PostgresDbTokens.db]) {
    if (!c.isRegistered(token)) continue;
    closers.add(c.resolve<{ destroy(): Promise<void> }>(token));
  }

  await Promise.all(
    Array.from(closers, async (db) => {
      try {
        await db.destroy();
      } catch (error) {
        // A driver torn down by an earlier dispose is the expected outcome of a
        // second call; anything else is a real failure and must surface.
        if (!isTerminalDriverError(error)) throw error;
      }
    })
  );
};
