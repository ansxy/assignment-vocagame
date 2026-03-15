import { getRedisClient } from '../../database/redis';
import { BadRequestError } from '../errors/http-error';
import { ERROR_MESSAGE } from '../constant/common';

interface IdempotentOptions {
  processingTtlSeconds?: number;
  completedTtlSeconds?: number;
}

export const runIdempotent = async (
  scope: string,
  idempotencyKey: string,
  work: () => Promise<void>,
  options: IdempotentOptions = {}
): Promise<void> => {
  const normalizedKey = idempotencyKey.trim();

  if (!normalizedKey) {
    throw new BadRequestError(ERROR_MESSAGE.IDEMPOTENCY_KEY_REQUIRED);
  }

  const processingTtlSeconds = options.processingTtlSeconds ?? 120;
  const completedTtlSeconds = options.completedTtlSeconds ?? 24 * 60 * 60;

  const lockKey = `idempotency:lock:${scope}:${normalizedKey}`;
  const doneKey = `idempotency:done:${scope}:${normalizedKey}`;

  const redis = await getRedisClient();

  const existingDone = await redis.get(doneKey);
  if (existingDone) {
    throw new BadRequestError(ERROR_MESSAGE.DUPLICATE_REQUEST);
  }

  const lock = await redis.set(lockKey, '1', {
    NX: true,
    EX: processingTtlSeconds
  });

  if (!lock) {
    throw new BadRequestError(ERROR_MESSAGE.REQUEST_IN_PROGRESS);
  }

  try {
    await work();

    await redis.set(doneKey, '1', {
      EX: completedTtlSeconds
    });
  } catch (error) {
    await redis.del(lockKey);
    throw error;
  }

  await redis.del(lockKey);
};
