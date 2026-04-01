/**
 * Structured Logger for ERICA MVP
 *
 * Provides a centralized, configurable logging system that:
 * - Respects LOG_LEVEL environment variable (debug, info, warn, error)
 * - Outputs structured JSON for production deployments
 * - Supports both development (pretty) and production (JSON) modes
 *
 * Usage:
 *   import { logger } from './Logger';
 *   logger.debug('message', { context: 'data' });
 *   logger.info('User action', { userId: 123 });
 *   logger.warn('Potential issue', { severity: 'medium' });
 *   logger.error('Error occurred', error);
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
declare class Logger {
    private logLevel;
    private logLevelHierarchy;
    constructor();
    /**
     * Check if a given log level should be output based on current LOG_LEVEL setting
     */
    private shouldLog;
    /**
     * Validate if a string is a valid log level
     */
    private isValidLogLevel;
    /**
     * Format the log entry for output
     */
    private formatEntry;
    /**
     * Output the log entry to console
     */
    private output;
    /**
     * Log a debug message (lowest priority)
     */
    debug(message: string, context?: Record<string, any>): void;
    /**
     * Log an info message
     */
    info(message: string, context?: Record<string, any>): void;
    /**
     * Log a warning message
     */
    warn(message: string, context?: Record<string, any>): void;
    /**
     * Log an error message (highest priority)
     */
    error(message: string, errorOrContext?: Error | Record<string, any>): void;
    /**
     * Get the current log level
     */
    getLogLevel(): LogLevel;
    /**
     * Set the log level (useful for testing)
     */
    setLogLevel(level: LogLevel): void;
}
export declare const logger: Logger;
export default logger;
//# sourceMappingURL=Logger.d.ts.map