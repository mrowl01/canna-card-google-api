const logger = require('./logger');

class RetryUtility {
  constructor() {
    this.defaultOptions = {
      maxAttempts: 3,
      initialDelay: 1000, // 1 second
      maxDelay: 10000,    // 10 seconds
      backoffFactor: 2,   // Exponential backoff
      jitter: true        // Add randomness to prevent thundering herd
    };
  }

  // Main retry function
  async retry(operation, options = {}) {
    const config = { ...this.defaultOptions, ...options };
    let lastError;
    let delay = config.initialDelay;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        logger.debug('Retry Attempt', {
          operation: operation.name || 'anonymous',
          attempt,
          maxAttempts: config.maxAttempts,
          delay: attempt > 1 ? delay : 0
        });

        const result = await operation();

        if (attempt > 1) {
          logger.info('Retry Success', {
            operation: operation.name || 'anonymous',
            attempt,
            totalAttempts: attempt
          });
        }

        return result;

      } catch (error) {
        lastError = error;

        logger.warn('Retry Attempt Failed', {
          operation: operation.name || 'anonymous',
          attempt,
          maxAttempts: config.maxAttempts,
          error: error.message,
          retryable: this.isRetryable(error)
        });

        // Don't retry if error is not retryable
        if (!this.isRetryable(error)) {
          logger.error('Non-retryable Error', {
            operation: operation.name || 'anonymous',
            error: error.message,
            attempt
          });
          throw error;
        }

        // Don't wait after the last attempt
        if (attempt === config.maxAttempts) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const actualDelay = this.calculateDelay(delay, config);

        logger.debug('Retry Delay', {
          operation: operation.name || 'anonymous',
          attempt,
          delay: actualDelay
        });

        await this.sleep(actualDelay);
        delay = Math.min(delay * config.backoffFactor, config.maxDelay);
      }
    }

    logger.error('Retry Exhausted', {
      operation: operation.name || 'anonymous',
      maxAttempts: config.maxAttempts,
      finalError: lastError.message
    });

    throw lastError;
  }

  // Determine if an error is retryable
  isRetryable(error) {
    // HTTP status codes that are retryable
    const retryableStatusCodes = [429, 500, 502, 503, 504];

    if (error.code && retryableStatusCodes.includes(error.code)) {
      return true;
    }

    if (error.status && retryableStatusCodes.includes(error.status)) {
      return true;
    }

    // Network errors are usually retryable
    if (error.code === 'ECONNRESET' ||
        error.code === 'ENOTFOUND' ||
        error.code === 'ECONNREFUSED' ||
        error.code === 'ETIMEDOUT') {
      return true;
    }

    // Google API specific retryable errors
    if (error.message) {
      const message = error.message.toLowerCase();

      if (message.includes('timeout') ||
          message.includes('network') ||
          message.includes('connection') ||
          message.includes('service unavailable') ||
          message.includes('rate limit') ||
          message.includes('quota')) {
        return true;
      }
    }

    return false;
  }

  // Calculate delay with jitter
  calculateDelay(baseDelay, config) {
    if (!config.jitter) {
      return baseDelay;
    }

    // Add random jitter (±25% of base delay)
    const jitter = baseDelay * 0.25 * (Math.random() - 0.5) * 2;
    return Math.max(100, baseDelay + jitter); // Minimum 100ms delay
  }

  // Sleep utility
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Retry with exponential backoff specifically for Google API calls
  async retryGoogleApi(operation, context = {}) {
    const options = {
      maxAttempts: 3,
      initialDelay: 1000,
      maxDelay: 5000,
      backoffFactor: 2,
      jitter: true
    };

    const wrappedOperation = async () => {
      const startTime = Date.now();
      try {
        const result = await operation();
        const duration = Date.now() - startTime;

        logger.logGoogleWalletOperation(context.operation || 'unknown', context, {
          success: true,
          duration
        });

        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorDetails = logger.interpretGoogleApiError(error);

        logger.logGoogleWalletOperation(context.operation || 'unknown', context, {
          success: false,
          error: errorDetails,
          duration
        });

        throw error;
      }
    };

    return this.retry(wrappedOperation, options);
  }

  // Retry for notification operations
  async retryNotification(operation, userId, type) {
    const options = {
      maxAttempts: 2, // Fewer retries for notifications
      initialDelay: 500,
      maxDelay: 2000,
      backoffFactor: 2,
      jitter: true
    };

    const wrappedOperation = async () => {
      const startTime = Date.now();
      try {
        const result = await operation();
        const duration = Date.now() - startTime;

        logger.logNotification(userId, type, result, { duration });
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        logger.logNotification(userId, type, { success: false, error: error.message }, { duration });
        throw error;
      }
    };

    return this.retry(wrappedOperation, options);
  }

  // Circuit breaker pattern for repeated failures
  createCircuitBreaker(operation, options = {}) {
    const config = {
      failureThreshold: 5,    // Open circuit after 5 failures
      resetTimeout: 60000,    // Try to close circuit after 1 minute
      monitoringWindow: 300000, // 5 minute monitoring window
      ...options
    };

    let state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    let failures = 0;
    let lastFailureTime = null;
    let successes = 0;

    return async (...args) => {
      const now = Date.now();

      // Reset failure count if monitoring window has passed
      if (lastFailureTime && (now - lastFailureTime) > config.monitoringWindow) {
        failures = 0;
        successes = 0;
        state = 'CLOSED';
      }

      // If circuit is open, check if we should try again
      if (state === 'OPEN') {
        if (lastFailureTime && (now - lastFailureTime) > config.resetTimeout) {
          state = 'HALF_OPEN';
          successes = 0;
          logger.info('Circuit Breaker Half-Open', {
            operation: operation.name || 'anonymous',
            failures: failures
          });
        } else {
          throw new Error('Circuit breaker is OPEN - operation temporarily disabled');
        }
      }

      try {
        const result = await operation(...args);

        // Success in HALF_OPEN state
        if (state === 'HALF_OPEN') {
          successes++;
          if (successes >= 2) {
            state = 'CLOSED';
            failures = 0;
            logger.info('Circuit Breaker Closed', {
              operation: operation.name || 'anonymous'
            });
          }
        }

        return result;

      } catch (error) {
        failures++;
        lastFailureTime = now;

        if (state === 'HALF_OPEN' || failures >= config.failureThreshold) {
          state = 'OPEN';
          logger.error('Circuit Breaker Opened', {
            operation: operation.name || 'anonymous',
            failures: failures,
            threshold: config.failureThreshold
          });
        }

        throw error;
      }
    };
  }
}

// Create singleton instance
const retryUtility = new RetryUtility();

module.exports = retryUtility;