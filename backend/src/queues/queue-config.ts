import { QUEUE_NAMES, QueueName } from './names';

const QUEUE_CONCURRENCY_DEFAULTS: Record<QueueName, number> = {
  'tx-submit': 1,
  'claim-events': 5,
  'claim-payouts': 3,
};

export interface QueueRetryConfig {
  maxAttempts: number;
  backoff: { type: 'exponential'; delay: number };
}

/**
 * Per-queue retry budgets.
 *
 * tx-submit     3 attempts / 2 s base — XDR submissions are fast-fail; excess
 *               retries risk double-submission on nonce-sensitive operations.
 * claim-events  5 attempts / 1 s base — event processing is idempotent; brief
 *               network blips are the common failure mode.
 * claim-payouts 7 attempts / 5 s base — high-value token transfers must not be
 *               dropped; longer backoff avoids hammering an overloaded RPC node.
 */
const QUEUE_RETRY_DEFAULTS: Record<QueueName, QueueRetryConfig> = {
  'tx-submit':     { maxAttempts: 3, backoff: { type: 'exponential', delay: 2_000 } },
  'claim-events':  { maxAttempts: 5, backoff: { type: 'exponential', delay: 1_000 } },
  'claim-payouts': { maxAttempts: 7, backoff: { type: 'exponential', delay: 5_000 } },
};

export function getQueueRetryConfig(queueName: QueueName): QueueRetryConfig {
  return QUEUE_RETRY_DEFAULTS[queueName];
}

export function getQueueConcurrency(
  queueName: QueueName,
  concurrencyMapStr?: string,
): number {
  if (!concurrencyMapStr) {
    return QUEUE_CONCURRENCY_DEFAULTS[queueName];
  }

  const map = new Map<string, number>();
  for (const pair of concurrencyMapStr.split(',')) {
    const [name, value] = pair.trim().split('=');
    if (name && value) {
      const concurrency = parseInt(value, 10);
      if (!isNaN(concurrency) && concurrency > 0) {
        map.set(name.trim(), concurrency);
      }
    }
  }

  return map.get(queueName) ?? QUEUE_CONCURRENCY_DEFAULTS[queueName];
}
