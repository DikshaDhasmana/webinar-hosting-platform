const logger = require('../utils/logger');

const errorHandler = (error, req, res, next) => {
  let statusCode = 500;
  let message = 'Internal Server Error';

  // Mongoose validation error
  if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    const errors = Object.values(error.errors).map(err => err.message);
    return res.status(statusCode).json({
      success: false,
      message,
      errors
    });
  }

  // Mongoose duplicate key error
  if (error.code === 11000) {
    statusCode = 409;
    message = 'Duplicate field value';
    const field = Object.keys(error.keyValue)[0];
    return res.status(statusCode).json({
      success: false,
      message: `${field} already exists`
    });
  }

  // Mongoose cast error (invalid ObjectId)
  if (error.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
    return res.status(statusCode).json({
      success: false,
      message
    });
  }

  // JWT errors
  if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
    return res.status(statusCode).json({
      success: false,
      message
    });
  }

  if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
    return res.status(statusCode).json({
      success: false,
      message
    });
  }

  // Custom application errors
  if (error.isOperational) {
    statusCode = error.statusCode || 400;
    message = error.message;
    return res.status(statusCode).json({
      success: false,
      message
    });
  }

  // Log error details
  logger.error('Unhandled error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Don't expose error details in production
  if (process.env.NODE_ENV === 'production') {
    message = 'Something went wrong';
  } else {
    message = error.message;
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
  });
};

// Custom error class
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

// Async error wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = errorHandler;
module.exports.AppError = AppError;
module.exports.asyncHandler = asyncHandler;