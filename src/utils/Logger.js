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
class Logger {
    constructor() {
        this.logLevelHierarchy = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3,
        };
        // Check if we're in Node.js or browser environment
        const isNodeEnv = typeof process !== 'undefined' && process.env;
        const envLevel = isNodeEnv
            ? String(process.env.LOG_LEVEL || 'info').toLowerCase()
            : typeof globalThis !== 'undefined' && globalThis.LOG_LEVEL
                ? String(globalThis.LOG_LEVEL).toLowerCase()
                : 'info';
        this.logLevel = this.isValidLogLevel(envLevel) ? envLevel : 'info';
    }
    /**
     * Check if a given log level should be output based on current LOG_LEVEL setting
     */
    shouldLog(level) {
        return this.logLevelHierarchy[level] >= this.logLevelHierarchy[this.logLevel];
    }
    /**
     * Validate if a string is a valid log level
     */
    isValidLogLevel(level) {
        return ['debug', 'info', 'warn', 'error'].includes(level);
    }
    /**
     * Format the log entry for output
     */
    formatEntry(level, message, context, error) {
        const entry = {
            timestamp: new Date().toISOString(),
            level,
            message,
        };
        if (context && Object.keys(context).length > 0) {
            entry.context = context;
        }
        if (error) {
            entry.error = {
                name: error.name,
                message: error.message,
                stack: error.stack,
            };
        }
        return entry;
    }
    /**
     * Output the log entry to console
     */
    output(entry) {
        const isNodeEnv = typeof process !== 'undefined' && process.env;
        const isProduction = isNodeEnv
            ? process.env.NODE_ENV === 'production'
            : false; // Default to development in browser
        if (isProduction) {
            // Production: output structured JSON
            console.log(JSON.stringify(entry));
        }
        else {
            // Development: pretty-print with colors
            const colors = {
                debug: '\x1b[36m', // Cyan
                info: '\x1b[32m', // Green
                warn: '\x1b[33m', // Yellow
                error: '\x1b[31m', // Red
                reset: '\x1b[0m',
            };
            const color = (isNodeEnv ? colors[entry.level] : '');
            const timestamp = entry.timestamp;
            const prefix = isNodeEnv
                ? `${color}[${timestamp}] [${entry.level.toUpperCase()}]${colors.reset}`
                : `[${timestamp}] [${entry.level.toUpperCase()}]`;
            let logMessage = `${prefix} ${entry.message}`;
            if (entry.context) {
                logMessage += ` ${JSON.stringify(entry.context)}`;
            }
            if (entry.error) {
                logMessage += `\n  Error: ${entry.error.name}: ${entry.error.message}`;
                if (entry.error.stack && isNodeEnv) {
                    logMessage += `\n${entry.error.stack}`;
                }
            }
            console.log(logMessage);
        }
    }
    /**
     * Log a debug message (lowest priority)
     */
    debug(message, context) {
        if (this.shouldLog('debug')) {
            const entry = this.formatEntry('debug', message, context);
            this.output(entry);
        }
    }
    /**
     * Log an info message
     */
    info(message, context) {
        if (this.shouldLog('info')) {
            const entry = this.formatEntry('info', message, context);
            this.output(entry);
        }
    }
    /**
     * Log a warning message
     */
    warn(message, context) {
        if (this.shouldLog('warn')) {
            const entry = this.formatEntry('warn', message, context);
            this.output(entry);
        }
    }
    /**
     * Log an error message (highest priority)
     */
    error(message, errorOrContext) {
        if (this.shouldLog('error')) {
            if (errorOrContext instanceof Error) {
                const entry = this.formatEntry('error', message, undefined, errorOrContext);
                this.output(entry);
            }
            else {
                const entry = this.formatEntry('error', message, errorOrContext);
                this.output(entry);
            }
        }
    }
    /**
     * Get the current log level
     */
    getLogLevel() {
        return this.logLevel;
    }
    /**
     * Set the log level (useful for testing)
     */
    setLogLevel(level) {
        if (this.isValidLogLevel(level)) {
            this.logLevel = level;
        }
    }
}
// Singleton instance
export const logger = new Logger();
export default logger;
//# sourceMappingURL=Logger.js.map