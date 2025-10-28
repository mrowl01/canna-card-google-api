const logger = require('../utils/logger');

/**
 * Centralized error handler for API endpoints
 * Logs the error with full context and sends appropriate response
 */
class ErrorHandler {
  /**
   * Handle endpoint errors with structured logging
   * @param {Error} error - The error object
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {String} endpoint - Endpoint name for logging
   * @param {Number} defaultStatus - Default status code (default: 500)
   */
  handleEndpointError(error, req, res, endpoint, defaultStatus = 500) {
    // Log error with full context
    logger.error(`Error in ${endpoint}`, {
      error: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
      ip: req.ip,
      params: req.params,
      query: req.query,
      body: this.sanitizeBody(req.body)
    });

    // Determine status code
    const statusCode = error.statusCode || error.status || defaultStatus;

    // Send error response
    res.status(statusCode).json({
      success: false,
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred while processing your request'
    });
  }

  /**
   * Handle Google API errors specifically
   * @param {Error} error - The error object
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {String} endpoint - Endpoint name for logging
   */
  handleGoogleApiError(error, req, res, endpoint) {
    // Interpret and log the Google API error
    const googleError = logger.googleApiError(error, {
      endpoint,
      path: req.path,
      params: req.params,
      ip: req.ip
    });

    // Determine status code
    const statusCode = error.code || error.status || 500;

    // Send error response
    res.status(statusCode).json({
      success: false,
      error: googleError.type,
      message: googleError.userMessage,
      retryable: googleError.retryable
    });
  }

  /**
   * Sanitize request body for logging (remove sensitive data)
   * @param {Object} body - Request body
   * @returns {Object} Sanitized body
   */
  sanitizeBody(body) {
    if (!body || typeof body !== 'object') return body;

    const sanitized = { ...body };
    const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'api_key', 'credentials'];

    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Async error wrapper for route handlers
   * Wraps async route handlers to catch errors and pass to error middleware
   * @param {Function} fn - Async route handler function
   * @returns {Function} Wrapped function
   */
  asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * Create a custom error with status code
   * @param {String} message - Error message
   * @param {Number} statusCode - HTTP status code
   * @returns {Error} Error object with statusCode
   */
  createError(message, statusCode = 500) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
  }
}

// Export singleton instance
module.exports = new ErrorHandler();
