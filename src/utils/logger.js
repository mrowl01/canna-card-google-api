const fs = require('fs');
const path = require('path');

class Logger {
  constructor() {
    this.levels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    };

    this.currentLevel = process.env.LOG_LEVEL ?
      this.levels[process.env.LOG_LEVEL.toUpperCase()] :
      this.levels.INFO;

    this.colors = {
      ERROR: '\x1b[31m', // Red
      WARN: '\x1b[33m',  // Yellow
      INFO: '\x1b[36m',  // Cyan
      DEBUG: '\x1b[37m', // White
      RESET: '\x1b[0m'
    };

    this.emojis = {
      ERROR: '❌',
      WARN: '⚠️',
      INFO: 'ℹ️',
      DEBUG: '🔍'
    };

    // Ensure logs directory exists (use /tmp on Vercel serverless)
    const isVercel = process.env.VERCEL === '1';
    this.logDir = isVercel ? '/tmp/logs' : path.join(__dirname, '../../logs');

    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }
      this.logFile = path.join(this.logDir, `app-${new Date().toISOString().split('T')[0]}.log`);
    } catch (err) {
      // If we can't create log directory (Vercel read-only filesystem), just log to console
      this.logFile = null;
      console.warn('Unable to create log directory, logging to console only:', err.message);
    }
  }

  formatMessage(level, message, metadata = {}) {
    const timestamp = new Date().toISOString();
    const color = this.colors[level];
    const emoji = this.emojis[level];
    const reset = this.colors.RESET;

    // Create structured log object
    const logObject = {
      timestamp,
      level,
      message,
      ...metadata
    };

    // Console output with colors and emojis
    const consoleMessage = `${color}${emoji} [${timestamp}] ${level}: ${message}${reset}`;

    // File output as JSON
    const fileMessage = JSON.stringify(logObject);

    return { consoleMessage, fileMessage, logObject };
  }

  writeToFile(message) {
    // Skip file writing if logFile is not available (Vercel serverless)
    if (!this.logFile) return;

    try {
      fs.appendFileSync(this.logFile, message + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }

  shouldLog(level) {
    return this.levels[level] <= this.currentLevel;
  }

  log(level, message, metadata = {}) {
    if (!this.shouldLog(level)) return;

    const { consoleMessage, fileMessage } = this.formatMessage(level, message, metadata);

    console.log(consoleMessage);

    // Also show metadata if it exists
    if (Object.keys(metadata).length > 0) {
      console.log(`${this.colors[level]}   Metadata:${this.colors.RESET}`, metadata);
    }

    this.writeToFile(fileMessage);
  }

  error(message, metadata = {}) {
    this.log('ERROR', message, metadata);
  }

  warn(message, metadata = {}) {
    this.log('WARN', message, metadata);
  }

  info(message, metadata = {}) {
    this.log('INFO', message, metadata);
  }

  debug(message, metadata = {}) {
    this.log('DEBUG', message, metadata);
  }

  // Google API specific error handling
  googleApiError(error, context = {}) {
    const errorDetails = this.interpretGoogleApiError(error);

    this.error('Google API Error', {
      context,
      error: errorDetails,
      originalError: {
        message: error.message,
        code: error.code,
        status: error.status
      }
    });

    return errorDetails;
  }

  interpretGoogleApiError(error) {
    const errorInfo = {
      type: 'UNKNOWN_ERROR',
      message: error.message,
      code: error.code,
      status: error.status,
      retryable: false,
      userMessage: 'An unexpected error occurred'
    };

    // HTTP status code interpretation
    if (error.code || error.status) {
      const statusCode = error.code || error.status;

      switch (statusCode) {
        case 400:
          errorInfo.type = 'BAD_REQUEST';
          errorInfo.userMessage = 'Invalid request data';
          errorInfo.retryable = false;
          break;

        case 401:
          errorInfo.type = 'UNAUTHORIZED';
          errorInfo.userMessage = 'Authentication failed';
          errorInfo.retryable = false;
          break;

        case 403:
          errorInfo.type = 'FORBIDDEN';
          errorInfo.userMessage = 'Access denied';
          errorInfo.retryable = false;
          break;

        case 404:
          errorInfo.type = 'NOT_FOUND';
          errorInfo.userMessage = 'Resource not found';
          errorInfo.retryable = false;
          break;

        case 409:
          errorInfo.type = 'CONFLICT';
          errorInfo.userMessage = 'Resource already exists';
          errorInfo.retryable = false;
          break;

        case 429:
          errorInfo.type = 'RATE_LIMITED';
          errorInfo.userMessage = 'Too many requests, please try again later';
          errorInfo.retryable = true;
          break;

        case 500:
          errorInfo.type = 'INTERNAL_SERVER_ERROR';
          errorInfo.userMessage = 'Server error, please try again';
          errorInfo.retryable = true;
          break;

        case 502:
        case 503:
        case 504:
          errorInfo.type = 'SERVICE_UNAVAILABLE';
          errorInfo.userMessage = 'Service temporarily unavailable';
          errorInfo.retryable = true;
          break;
      }
    }

    // Google Wallet specific error patterns
    if (error.message) {
      const message = error.message.toLowerCase();

      if (message.includes('not found')) {
        errorInfo.type = 'RESOURCE_NOT_FOUND';
        errorInfo.userMessage = 'The requested resource was not found';
      } else if (message.includes('already exists')) {
        errorInfo.type = 'RESOURCE_EXISTS';
        errorInfo.userMessage = 'Resource already exists';
      } else if (message.includes('invalid')) {
        errorInfo.type = 'INVALID_DATA';
        errorInfo.userMessage = 'Invalid data provided';
      } else if (message.includes('permission') || message.includes('access')) {
        errorInfo.type = 'ACCESS_DENIED';
        errorInfo.userMessage = 'Access denied';
      } else if (message.includes('quota') || message.includes('limit')) {
        errorInfo.type = 'QUOTA_EXCEEDED';
        errorInfo.userMessage = 'API quota exceeded';
        errorInfo.retryable = true;
      } else if (message.includes('class id')) {
        errorInfo.type = 'MISSING_CLASS_ID';
        errorInfo.userMessage = 'Missing or invalid class ID';
      }
    }

    return errorInfo;
  }

  // Request/Response logging
  logRequest(req, metadata = {}) {
    this.info('HTTP Request', {
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      contentType: req.get('Content-Type'),
      ...metadata
    });
  }

  logResponse(req, res, duration, metadata = {}) {
    const level = res.statusCode >= 400 ? 'ERROR' : 'INFO';

    this[level.toLowerCase()]('HTTP Response', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      ...metadata
    });
  }

  // Google Wallet operation logging
  logGoogleWalletOperation(operation, data, result) {
    this.info('Google Wallet Operation', {
      operation,
      data: {
        ...data,
        // Don't log sensitive data
        credentials: data.credentials ? '[REDACTED]' : undefined
      },
      success: result.success,
      error: result.error || null,
      duration: result.duration || null
    });
  }

  // Transaction logging
  logTransaction(userId, transaction, metadata = {}) {
    this.info('Points Transaction', {
      userId,
      transaction: {
        type: transaction.type,
        amount: transaction.amount,
        previousBalance: transaction.previousBalance,
        newBalance: transaction.newBalance,
        reason: transaction.reason,
        timestamp: transaction.timestamp,
        id: transaction.id
      },
      ...metadata
    });
  }

  // Security event logging
  logSecurityEvent(event, details = {}) {
    this.warn('Security Event', {
      event,
      timestamp: new Date().toISOString(),
      ...details
    });
  }

  // Performance logging
  logPerformance(operation, duration, metadata = {}) {
    const level = duration > 2000 ? 'WARN' : 'DEBUG';

    this[level]('Performance', {
      operation,
      duration: `${duration}ms`,
      slow: duration > 2000,
      ...metadata
    });
  }

  // Notification logging
  logNotification(userId, type, result, metadata = {}) {
    this.info('Notification Sent', {
      userId,
      type,
      success: result.success,
      error: result.error || null,
      remaining: result.remaining,
      ...metadata
    });
  }
}

// Create singleton instance
const logger = new Logger();

module.exports = logger;