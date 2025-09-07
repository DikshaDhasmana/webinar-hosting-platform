const redis = require('redis');
const logger = require('../utils/logger');

let redisClient = null;

const connectRedis = async () => {
  try {
    if (redisClient) {
      return redisClient;
    }

    const redisUrl = process.env.REDIS_URL || 'redis://:redis123@localhost:6379';
    
    redisClient = redis.createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Redis: Maximum reconnection attempts exceeded');
            return false;
          }
          return Math.min(retries * 50, 1000);
        }
      },
      // Enable offline queue to buffer commands when disconnected
      enable_offline_queue: true
    });

    // Event handlers
    redisClient.on('connect', () => {
      logger.info('Redis: Connecting...');
    });

    redisClient.on('ready', () => {
      logger.info('Redis: Connected and ready');
    });

    redisClient.on('error', (err) => {
      logger.error('Redis Client Error:', err);
    });

    redisClient.on('end', () => {
      logger.warn('Redis: Connection closed');
    });

    redisClient.on('reconnecting', (params) => {
      logger.info(`Redis: Reconnecting... (attempt ${params.attempt}, delay ${params.delay}ms)`);
    });

    // Connect to Redis
    await redisClient.connect();
    
    logger.info('Redis connected successfully');
    return redisClient;

  } catch (error) {
    logger.error('Redis connection failed:', error);
    throw error;
  }
};

// Graceful shutdown
const closeRedis = async () => {
  if (redisClient) {
    try {
      await redisClient.quit();
      redisClient = null;
      logger.info('Redis connection closed gracefully');
    } catch (error) {
      logger.error('Error closing Redis connection:', error);
      if (redisClient) {
        await redisClient.disconnect();
        redisClient = null;
      }
    }
  }
};

// Get Redis client instance
const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call connectRedis() first.');
  }
  return redisClient;
};

// Redis health check
const isRedisHealthy = async () => {
  try {
    if (!redisClient || !redisClient.isReady) {
      return false;
    }
    
    const pong = await redisClient.ping();
    return pong === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return false;
  }
};

// Graceful shutdown handler
process.on('SIGINT', async () => {
  await closeRedis();
});

process.on('SIGTERM', async () => {
  await closeRedis();
});

module.exports = {
  connectRedis,
  closeRedis,
  getRedisClient,
  isRedisHealthy
};