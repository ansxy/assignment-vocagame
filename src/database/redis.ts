import { createClient, RedisClientType } from 'redis';

import { env } from '../config/env';

let redisClient: RedisClientType | null = null;

const getRedisUrl = (): string => {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }

  return `redis://${env.redis.host}:${env.redis.port}`;
};

export const getRedisClient = async (): Promise<RedisClientType> => {
  if (!redisClient) {
    redisClient = createClient({
      url: getRedisUrl()
    });

    redisClient.on('error', (error: unknown) => {
      console.error('Redis error:', error);
    });
  }

  if (!redisClient.isOpen) {
    await redisClient.connect();
  }

  return redisClient;
};

export const initializeRedis = async (): Promise<void> => {
  await getRedisClient();
};
