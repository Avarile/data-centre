import type { ILogger } from '@teable/v2-core';
import { v2CoreTokens } from '@teable/v2-core';
import { inject, injectable } from '@teable/v2-di';

import { isTerminalDriverError } from '../../../shared/errors';
import { v2RecordRepositoryPostgresTokens } from '../../di/tokens';
import { toErrorLogFields } from '../errorLog';
import type { ComputedUpdateWorker } from './ComputedUpdateWorker';

/**
 * Configuration for the polling service.
 */
export type ComputedUpdatePollingConfig = {
  /**
   * Whether to auto-start polling on construction.
   * Set to true for hybrid/external modes.
   */
  enabled: boolean;

  /**
   * Unique worker ID for this polling instance.
   */
  workerId: string;

  /**
   * Number of tasks to claim per poll.
   * @default 50
   */
  batchSize: number;

  /**
   * Poll interval in milliseconds.
   * @default 1000
   */
  pollIntervalMs: number;

  /**
   * Maximum consecutive errors before backing off.
   * @default 5
   */
  maxConsecutiveErrors: number;

  /**
   * Backoff duration after max errors (ms).
   * @default 30000
   */
  errorBackoffMs: number;
};

export const defaultPollingConfig: ComputedUpdatePollingConfig = {
  enabled: false, // Disabled by default, enabled for hybrid/external
  workerId: `computed-poll-${process.pid}`,
  batchSize: 50,
  pollIntervalMs: 1000,
  maxConsecutiveErrors: 5,
  errorBackoffMs: 30000,
};

/**
 * Hybrid mode config: inline push + background polling as fallback.
 */
export const hybridPollingConfig: ComputedUpdatePollingConfig = {
  ...defaultPollingConfig,
  enabled: true,
};

/**
 * External mode config: only polling, no inline push.
 */
export const externalPollingConfig: ComputedUpdatePollingConfig = {
  ...defaultPollingConfig,
  enabled: true,
  pollIntervalMs: 500, // More aggressive polling for external mode
};

let pollingWorkerSequence = 0;

/**
 * Build a worker id that is unique per container, not just per process.
 *
 * `process.pid` alone collides whenever a process holds more than one V2
 * container (dev-server hot reloads, the ad-hoc container in
 * `contract-http-implementation`, tests). Colliding ids make outbox leases
 * ambiguous — `renewLease` / `releaseForRetry` are keyed by `workerId` — and
 * make it impossible to tell two pollers apart in the logs.
 */
export const createPollingWorkerId = (): string => {
  pollingWorkerSequence += 1;
  return `computed-poll-${process.pid}-${pollingWorkerSequence}`;
};

/**
 * Background polling service for computed field updates.
 *
 * Uses `FOR UPDATE SKIP LOCKED` to safely run multiple instances.
 * Auto-starts if config.enabled is true.
 *
 * @example
 * ```typescript
 * // Auto-start on construction (if enabled)
 * const service = container.resolve(ComputedUpdatePollingService);
 *
 * // Or manually control
 * service.start();
 * await service.stop();
 * ```
 */
@injectable()
export class ComputedUpdatePollingService {
  private running = false;
  private stopRequested = false;
  private terminated = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private autoStartHandle: ReturnType<typeof setImmediate> | null = null;
  private immediateHandle: ReturnType<typeof setImmediate> | null = null;
  private backoffTimer: ReturnType<typeof setTimeout> | null = null;
  private wakeBackoff: (() => void) | null = null;
  private consecutiveErrors = 0;
  private currentPollPromise: Promise<void> | null = null;

  constructor(
    @inject(v2RecordRepositoryPostgresTokens.computedUpdateWorker)
    private readonly worker: ComputedUpdateWorker,
    @inject(v2RecordRepositoryPostgresTokens.computedUpdatePollingConfig)
    private readonly config: ComputedUpdatePollingConfig = defaultPollingConfig,
    @inject(v2CoreTokens.logger)
    private readonly logger: ILogger
  ) {
    // Auto-start if enabled
    if (this.config.enabled) {
      this.logger.debug('computed:polling:auto_start_scheduled', {
        workerId: this.config.workerId,
        batchSize: this.config.batchSize,
        pollIntervalMs: this.config.pollIntervalMs,
      });
      // Deferred so the constructor never blocks. The handle is retained so
      // `stop()` can cancel a start that has not happened yet: promise
      // continuations (microtasks) run before this `setImmediate`, so a
      // container that is disposed while it is still being built would
      // otherwise destroy the driver and *then* start polling it.
      this.autoStartHandle = setImmediate(() => {
        this.autoStartHandle = null;
        if (this.stopRequested || this.terminated) return;
        this.start();
      });
    }
  }

  /**
   * Start the polling loop.
   */
  start(): void {
    if (this.terminated) {
      this.logger.warn('computed:polling:start_after_terminated', {
        workerId: this.config.workerId,
      });
      return;
    }

    if (this.running) {
      this.logger.warn('computed:polling:already_running', {
        workerId: this.config.workerId,
      });
      return;
    }

    this.running = true;
    this.stopRequested = false;
    this.consecutiveErrors = 0;

    this.logger.info('computed:polling:started', {
      workerId: this.config.workerId,
      batchSize: this.config.batchSize,
      pollIntervalMs: this.config.pollIntervalMs,
    });

    this.currentPollPromise = this.poll();
  }

  /**
   * Stop the polling loop gracefully.
   *
   * Safe to call before the loop has started (it cancels the pending
   * auto-start) and safe to call while a poll is in flight (it waits for the
   * in-flight query to settle). Once this resolves, no further database work
   * can be issued, so the caller may destroy the connection pool.
   */
  async stop(): Promise<void> {
    // Set first, unconditionally: a stop that lands before `start()` must still
    // be remembered, otherwise the deferred auto-start resurrects the loop
    // after the caller has torn the driver down.
    const wasIdle = !this.running;
    this.stopRequested = true;
    this.clearPendingWork();

    if (wasIdle) {
      this.running = false;
      return;
    }

    this.logger.info('computed:polling:stopping', {
      workerId: this.config.workerId,
    });

    await this.drainCurrentPoll();

    this.running = false;

    this.logger.info('computed:polling:stopped', {
      workerId: this.config.workerId,
    });
  }

  /**
   * Check if polling is running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Run a single poll iteration (for testing).
   */
  async runOnce(): Promise<number> {
    const result = await this.worker.runOnce({
      workerId: this.config.workerId,
      limit: this.config.batchSize,
    });

    if (result.isErr()) {
      this.logger.warn('computed:polling:runOnce_error', {
        workerId: this.config.workerId,
        ...toErrorLogFields(result.error),
      });
      return 0;
    }

    return result.value;
  }

  /**
   * Cancel every pending wake-up. Does not touch in-flight work.
   */
  private clearPendingWork(): void {
    if (this.autoStartHandle) {
      clearImmediate(this.autoStartHandle);
      this.autoStartHandle = null;
    }

    if (this.immediateHandle) {
      clearImmediate(this.immediateHandle);
      this.immediateHandle = null;
    }

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    // Wake an in-progress error backoff so `stop()` does not block on it.
    this.wakeBackoff?.();
  }

  /**
   * Wait for the in-flight poll — and anything it chained — to settle.
   *
   * `stopRequested` is already set, so no iteration can schedule a successor;
   * the loop exists only to absorb a successor that was scheduled in the
   * instant before `stop()` ran.
   */
  private async drainCurrentPoll(): Promise<void> {
    let pending = this.currentPollPromise;

    while (pending) {
      // `stop()` runs on the shutdown path and must never reject: the caller
      // destroys the connection pool right after it resolves.
      await pending.catch((error: unknown) => {
        this.logger.warn('computed:polling:drain_error', {
          workerId: this.config.workerId,
          ...toErrorLogFields(error),
        });
      });
      pending = this.currentPollPromise === pending ? null : this.currentPollPromise;
    }
  }

  /**
   * Permanently stop the loop. Used when the driver is gone for good.
   */
  private terminate(reason: string, error: unknown): void {
    this.terminated = true;
    this.stopRequested = true;
    this.running = false;
    this.clearPendingWork();

    // `warn`, not `error`: the only thing that terminates a loop is a driver that
    // has been torn down, which is the expected outcome of shutting the process
    // down. Reporting it as an error makes a clean stop look like a crash.
    this.logger.warn('computed:polling:terminated', {
      workerId: this.config.workerId,
      reason,
      ...toErrorLogFields(error),
    });
  }

  private schedulePoll(delayMs: number): void {
    if (this.stopRequested) return;

    this.logger.debug('computed:polling:scheduled', {
      workerId: this.config.workerId,
      delayMs,
    });

    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      this.currentPollPromise = this.poll();
    }, delayMs);
    // A pending poll must never be the reason the process stays alive; without
    // this the loop pins the event loop and shutdown has to be forced.
    this.pollTimer.unref?.();
  }

  private scheduleImmediatePoll(): void {
    if (this.stopRequested) return;

    this.immediateHandle = setImmediate(() => {
      this.immediateHandle = null;
      this.currentPollPromise = this.poll();
    });
  }

  /**
   * Sleep that resolves early when `stop()` is called.
   */
  private async delay(ms: number): Promise<void> {
    await new Promise<void>((resolve) => {
      const finish = (): void => {
        if (this.backoffTimer) {
          clearTimeout(this.backoffTimer);
          this.backoffTimer = null;
        }
        this.wakeBackoff = null;
        resolve();
      };

      this.wakeBackoff = finish;
      this.backoffTimer = setTimeout(finish, ms);
      this.backoffTimer.unref?.();
    });
  }

  private async poll(): Promise<void> {
    if (this.stopRequested || this.terminated) return;

    try {
      this.logger.debug('computed:polling:tick', {
        workerId: this.config.workerId,
        batchSize: this.config.batchSize,
        consecutiveErrors: this.consecutiveErrors,
      });

      const result = await this.worker.runOnce({
        workerId: this.config.workerId,
        limit: this.config.batchSize,
      });

      if (result.isErr()) {
        // A destroyed driver never recovers, and its `setTimeout` would keep
        // the event loop alive forever. Give up instead of retrying.
        if (isTerminalDriverError(result.error)) {
          this.terminate('driver_destroyed', result.error);
          return;
        }

        this.consecutiveErrors++;
        this.logger.warn('computed:polling:poll_error', {
          workerId: this.config.workerId,
          ...toErrorLogFields(result.error),
          consecutiveErrors: this.consecutiveErrors,
        });

        if (this.consecutiveErrors >= this.config.maxConsecutiveErrors) {
          this.logger.warn('computed:polling:backing_off', {
            workerId: this.config.workerId,
            backoffMs: this.config.errorBackoffMs,
          });
          await this.delay(this.config.errorBackoffMs);
          this.consecutiveErrors = 0;
        }
      } else {
        this.consecutiveErrors = 0;
        const processed = result.value;

        if (processed > 0) {
          this.logger.debug('computed:polling:processed', {
            workerId: this.config.workerId,
            count: processed,
          });
        } else {
          this.logger.debug('computed:polling:idle', {
            workerId: this.config.workerId,
            pollIntervalMs: this.config.pollIntervalMs,
          });
        }

        // If we processed a full batch, poll again immediately
        if (processed >= this.config.batchSize) {
          this.logger.debug('computed:polling:continue_immediately', {
            workerId: this.config.workerId,
            batchSize: this.config.batchSize,
            processed,
          });
          this.scheduleImmediatePoll();
          return;
        }
      }
    } catch (error) {
      if (isTerminalDriverError(error)) {
        this.terminate('driver_destroyed', error);
        return;
      }

      this.consecutiveErrors++;
      this.logger.error('computed:polling:unexpected_error', {
        workerId: this.config.workerId,
        ...toErrorLogFields(error),
        consecutiveErrors: this.consecutiveErrors,
      });
    }

    this.schedulePoll(this.config.pollIntervalMs);
  }
}
