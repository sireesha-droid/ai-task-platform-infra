/**
 * Redis Client Configuration
 * Uses ioredis with automatic reconnect and failure handling
 */

const Redis = require('ioredis');
const logger = require('./logger');

let redisClient = null;

const createRedisClient = () => {
  const client = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    // Retry strategy: exponential backoff capped at 30s
    retryStrategy(times) {
      const delay = Math.min(times * 500, 30000);
      logger.warn(`Redis retry attempt ${times}, next in ${delay}ms`);
      return delay;
    },
    // Don't fail commands on disconnect; buffer them
    enableOfflineQueue: true,
    maxRetriesPerRequest: null,
    lazyConnect: false,
  });

  client.on('connect', () => logger.info('Redis connected'));
  client.on('ready', () => logger.info('Redis ready'));
  client.on('error', (err) => logger.error('Redis error:', err.message));
  client.on('close', () => logger.warn('Redis connection closed'));
  client.on('reconnecting', (ms) => logger.info(`Redis reconnecting in ${ms}ms`));

  return client;
};

const getRedisClient = () => {
  if (!redisClient) {
    redisClient = createRedisClient();
  }
  return redisClient;
};

module.exports = { getRedisClient };
