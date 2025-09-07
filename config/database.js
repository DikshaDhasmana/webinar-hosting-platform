const mongoose = require('mongoose');
const logger = require('../utils/logger');

const connectDatabase = async () => {
  try {
    const conn = await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://admin:password123@localhost:27017/webinar_db?authSource=admin',
      {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        maxPoolSize: 10, // Maintain up to 10 socket connections
        serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
        socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
        family: 4 // Use IPv4, skip trying IPv6
      }
    );

    logger.info(`MongoDB Connected: ${conn.connection.host}:${conn.connection.port}/${conn.connection.name}`);
    
    return conn;
  } catch (error) {
    logger.error('Database connection error:', error);
    process.exit(1);
  }
};

// Connection event handlers
mongoose.connection.on('connected', () => {
  logger.info('MongoDB connected successfully');
});

mongoose.connection.on('error', (err) => {
  logger.error('MongoDB connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

// Graceful shutdown
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed through app termination');
    process.exit(0);
  } catch (error) {
    logger.error('Error closing MongoDB connection:', error);
    process.exit(1);
  }
});

module.exports = connectDatabase;