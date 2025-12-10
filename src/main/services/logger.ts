import { app } from 'electron';
import { join } from 'path';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { isVerboseMode } from '../runtimeFlags';

// Log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Log colors
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
};

winston.addColors(colors);

// Log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json(),
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(
    (info) =>
      `${info.timestamp} ${info.level}: ${info.message}${info.stack ? `\n${info.stack}` : ''}`,
  ),
);

// Get log directory
const logDir = join(app.getPath('userData'), 'logs');

const verboseMode = isVerboseMode();

// Inform about log directory
console.log('Log files will be stored in:', logDir);

// Create transports
const transports = [
  // Console transport for development
  new winston.transports.Console({
    format: consoleFormat,
    level:
      process.env.NODE_ENV === 'development' || verboseMode ? 'debug' : 'info',
  }),

  // Daily rotating file for all logs
  new DailyRotateFile({
    filename: join(logDir, 'devwp-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: process.env.LOG_MAX_FILES || '14d',
    format: format,
    level: verboseMode ? 'debug' : process.env.LOG_LEVEL || 'info',
  }),

  // Separate file for errors
  new DailyRotateFile({
    filename: join(logDir, 'devwp-error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles: '30d',
    format: format,
    level: 'error',
  }),
];

// Create logger instance
export const logger = winston.createLogger({
  levels,
  transports,
  exitOnError: false,
});

if (verboseMode) {
  logger.debug('Verbose mode enabled');
}

// Utility functions for structured logging
export const logSiteOperation = (
  operation: string,
  domain: string,
  details?: Record<string, unknown>,
): void => {
  logger.info('Site operation', {
    operation,
    domain,
    ...details,
  });
};

export const logDockerOperation = (
  operation: string,
  container: string,
  details?: Record<string, unknown>,
): void => {
  logger.info('Docker operation', {
    operation,
    container,
    ...details,
  });
};

export const logError = (
  context: string,
  error: Error,
  details?: Record<string, unknown>,
): void => {
  logger.error('Error occurred', {
    context,
    error: error.message,
    stack: error.stack,
    ...details,
  });
};

export const logDatabaseOperation = (
  operation: string,
  details?: Record<string, unknown>,
): void => {
  logger.info('Database operation', {
    operation,
    ...details,
  });
};

export const logNginxOperation = (
  operation: string,
  details?: Record<string, unknown>,
): void => {
  logger.info('Nginx operation', {
    operation,
    ...details,
  });
};

export const logWpCliCommand = (
  domain: string,
  command: string,
  details?: Record<string, unknown>,
): void => {
  logger.info('WP-CLI command', {
    domain,
    command,
    ...details,
  });
};

// Export logger as default
export default logger;
