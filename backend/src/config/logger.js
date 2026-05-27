/**
 * Winston Logger Configuration
 * Structured JSON logging for production, pretty for development
 */

const { createLogger, format, transports } = require('winston');

const { combine, timestamp, json, colorize, printf, errors } = format;

const isProd = process.env.NODE_ENV === 'production';

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack }) =>
    stack ? `${timestamp} ${level}: ${message}\n${stack}` : `${timestamp} ${level}: ${message}`
  )
);

const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  json()
);

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: isProd ? prodFormat : devFormat,
  transports: [
    new transports.Console(),
  ],
  // Don't crash on unhandled promise rejections
  exitOnError: false,
});

// Add http level for morgan
logger.http = (message) => logger.log('http', message);

module.exports = logger;
