const http = require('http');
const socketIo = require('socket.io');
require('dotenv').config();

// Import app configuration
const app = require('./app');

// Import configurations
const connectDatabase = require('./config/database');
const { connectRedis, getRedisClient, closeRedis } = require('./config/redis');

// Import socket handler
const socketHandler = require('./socket/socketHandler');

// Import logger
const logger = require('./utils/logger');

const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Socket.IO setup
const io = socketIo(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000
});

// Initialize server
async function startServer() {
  try {
    // Connect to databases
    logger.info('Initializing databases...');
    await connectDatabase();
    await connectRedis();
    
    // Initialize Socket.IO handler with Redis client
    const redisClient = getRedisClient();
    socketHandler(io, redisClient);
    
    // Start server
    server.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`🔌 Socket.IO ready for connections`);
      logger.info(`📚 API Documentation: http://localhost:${PORT}/`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  
  try {
    // Close server first to stop accepting new connections
    server.close(() => {
      logger.info('HTTP server closed');
    });

    // Close Socket.IO server
    io.close(() => {
      logger.info('Socket.IO server closed');
    });
    
    // Close Redis connection
    await closeRedis();
    
    // MongoDB connection will be closed by the database config
    
    logger.info('Graceful shutdown completed');
    process.exit(0);
    
  } catch (error) {
    logger.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

// Handle process signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
startServer();