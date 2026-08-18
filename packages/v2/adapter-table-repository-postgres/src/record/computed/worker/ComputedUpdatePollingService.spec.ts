import type { ILogger } from '@teable/v2-core';
import { domainError } from '@teable/v2-core';
import { err, ok } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ComputedUpdatePollingService, defaultPollingConfig } from './ComputedUpdatePollingService';

const createLogger = (): ILogger => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
  scope: vi.fn().mockReturnThis(),
});

describe('ComputedUpdatePollingService', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('auto-starts and drains backlog when polling is enabled', async () => {
    vi.useFakeTimers();

    const worker = {
      runOnce: vi.fn().mockResolvedValue(ok(1)),
    };
    const logger = createLogger();

    const service = new ComputedUpdatePollingService(
      worker as never,
      {
        ...defaultPollingConfig,
        enabled: true,
        workerId: 'poll-test',
        batchSize: 10,
        pollIntervalMs: 1000,
      },
      logger
    );

    await vi.advanceTimersByTimeAsync(1);
    await service.stop();

    expect(worker.runOnce).toHaveBeenCalledWith({
      workerId: 'poll-test',
      limit: 10,
    });
    expect(logger.info).toHaveBeenCalledWith(
      'computed:polling:started',
      expect.objectContaining({ workerId: 'poll-test' })
    );
  });

  it('emits debug logs for idle polling cycles', async () => {
    vi.useFakeTimers();

    const worker = {
      runOnce: vi.fn().mockResolvedValue(ok(0)),
    };
    const logger = createLogger();

    const service = new ComputedUpdatePollingService(
      worker as never,
      {
        ...defaultPollingConfig,
        enabled: true,
        workerId: 'poll-debug',
        batchSize: 5,
        pollIntervalMs: 1000,
      },
      logger
    );

    await vi.advanceTimersByTimeAsync(1);
    await service.stop();

    expect(logger.debug).toHaveBeenCalledWith(
      'computed:polling:auto_start_scheduled',
      expect.objectContaining({ workerId: 'poll-debug' })
    );
    expect(logger.debug).toHaveBeenCalledWith(
      'computed:polling:tick',
      expect.objectContaining({ workerId: 'poll-debug', batchSize: 5 })
    );
    expect(logger.debug).toHaveBeenCalledWith(
      'computed:polling:idle',
      expect.objectContaining({ workerId: 'poll-debug', pollIntervalMs: 1000 })
    );
    expect(logger.debug).toHaveBeenCalledWith(
      'computed:polling:scheduled',
      expect.objectContaining({ workerId: 'poll-debug', delayMs: 1000 })
    );
  });
  it('does not start when stopped before the deferred auto-start fires', async () => {
    vi.useFakeTimers();

    const worker = {
      runOnce: vi.fn().mockResolvedValue(ok(0)),
    };
    const logger = createLogger();

    const service = new ComputedUpdatePollingService(
      worker as never,
      {
        ...defaultPollingConfig,
        enabled: true,
        workerId: 'poll-stop-before-start',
        pollIntervalMs: 500,
      },
      logger
    );

    // The auto-start is a `setImmediate`; a container disposed while it is still
    // being built stops the service from a microtask, i.e. strictly earlier.
    await service.stop();
    await vi.advanceTimersByTimeAsync(5000);

    expect(worker.runOnce).not.toHaveBeenCalled();
    expect(service.isRunning()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('terminates instead of retrying once the driver is destroyed', async () => {
    vi.useFakeTimers();

    const worker = {
      runOnce: vi.fn().mockResolvedValue(
        err(
          domainError.infrastructure({
            message: 'Outbox transaction failed: Error: driver has already been destroyed',
          })
        )
      ),
    };
    const logger = createLogger();

    const service = new ComputedUpdatePollingService(
      worker as never,
      {
        ...defaultPollingConfig,
        enabled: true,
        workerId: 'poll-destroyed',
        pollIntervalMs: 500,
      },
      logger
    );

    await vi.advanceTimersByTimeAsync(1);
    expect(worker.runOnce).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(worker.runOnce).toHaveBeenCalledTimes(1);
    expect(service.isRunning()).toBe(false);
    // Nothing left holding the event loop open.
    expect(vi.getTimerCount()).toBe(0);
    expect(logger.error).toHaveBeenCalledWith(
      'computed:polling:terminated',
      expect.objectContaining({ workerId: 'poll-destroyed', reason: 'driver_destroyed' })
    );

    await service.stop();
  });

  it('waits for a rescheduled in-flight poll before resolving stop', async () => {
    vi.useFakeTimers();

    let releasePoll: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releasePoll = resolve;
    });
    // Only the *second* iteration hangs. That one runs from the poll timer, not
    // from `start()`, so it is the iteration a naive `stop()` fails to await.
    const worker = {
      runOnce: vi
        .fn()
        .mockResolvedValueOnce(ok(0))
        .mockImplementation(() => gate.then(() => ok(0))),
    };
    const logger = createLogger();

    const service = new ComputedUpdatePollingService(
      worker as never,
      {
        ...defaultPollingConfig,
        enabled: true,
        workerId: 'poll-drain',
        pollIntervalMs: 500,
      },
      logger
    );

    await vi.advanceTimersByTimeAsync(1);
    expect(worker.runOnce).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);
    expect(worker.runOnce).toHaveBeenCalledTimes(2);

    let stopped = false;
    const stopping = service.stop().then(() => {
      stopped = true;
    });

    await vi.advanceTimersByTimeAsync(1);
    // The query is still open, so the pool must not be destroyed yet.
    expect(stopped).toBe(false);

    releasePoll?.();
    await stopping;

    expect(stopped).toBe(true);
    expect(service.isRunning()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('interrupts the error backoff when stopping', async () => {
    vi.useFakeTimers();

    const worker = {
      runOnce: vi.fn().mockResolvedValue(err(domainError.infrastructure({ message: 'boom' }))),
    };
    const logger = createLogger();

    const service = new ComputedUpdatePollingService(
      worker as never,
      {
        ...defaultPollingConfig,
        enabled: true,
        workerId: 'poll-backoff',
        pollIntervalMs: 500,
        maxConsecutiveErrors: 1,
        errorBackoffMs: 30_000,
      },
      logger
    );

    await vi.advanceTimersByTimeAsync(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'computed:polling:backing_off',
      expect.objectContaining({ workerId: 'poll-backoff', backoffMs: 30_000 })
    );

    // Resolves without advancing the fake clock by the full 30s backoff.
    await service.stop();

    expect(service.isRunning()).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
