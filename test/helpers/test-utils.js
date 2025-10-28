/**
 * Test Utilities and Helpers
 * Common functions used across test files
 */

/**
 * Generate a random user ID for testing
 * @param {string} prefix - Optional prefix for the user ID
 * @returns {string} Random user ID
 */
function generateTestUserId(prefix = 'test_user') {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Generate multiple test user IDs
 * @param {number} count - Number of user IDs to generate
 * @param {string} prefix - Optional prefix
 * @returns {string[]} Array of user IDs
 */
function generateTestUserIds(count, prefix = 'test_user') {
  return Array.from({ length: count }, () => generateTestUserId(prefix));
}

/**
 * Create mock Google Wallet API client
 * @returns {Object} Mock client
 */
function createMockGoogleWalletClient() {
  return {
    loyaltyclass: {
      insert: jest.fn().mockResolvedValue({
        data: {
          id: 'mock_class_id',
          programName: 'Test Program',
        }
      }),
      get: jest.fn().mockResolvedValue({
        data: {
          id: 'mock_class_id',
          programName: 'Test Program',
        }
      }),
      list: jest.fn().mockResolvedValue({
        data: {
          resources: [
            { id: 'class_1', programName: 'Program 1' },
            { id: 'class_2', programName: 'Program 2' },
          ]
        }
      }),
      update: jest.fn().mockResolvedValue({
        data: {
          id: 'mock_class_id',
          programName: 'Updated Program',
        }
      }),
    },
    loyaltyobject: {
      insert: jest.fn().mockResolvedValue({
        data: {
          id: 'mock_object_id',
          accountId: 'test_user_123',
          loyaltyPoints: {
            balance: { string: '100' }
          }
        }
      }),
      get: jest.fn().mockResolvedValue({
        data: {
          id: 'mock_object_id',
          accountId: 'test_user_123',
          loyaltyPoints: {
            balance: { string: '100' }
          }
        }
      }),
      list: jest.fn().mockResolvedValue({
        data: {
          resources: [
            { id: 'object_1', accountId: 'user_1' },
            { id: 'object_2', accountId: 'user_2' },
          ]
        }
      }),
      update: jest.fn().mockResolvedValue({
        data: {
          id: 'mock_object_id',
          accountId: 'test_user_123',
          loyaltyPoints: {
            balance: { string: '200' }
          }
        }
      }),
    },
  };
}

/**
 * Create mock Google API error
 * @param {number} code - HTTP status code
 * @param {string} message - Error message
 * @returns {Error} Mock error
 */
function createMockGoogleApiError(code, message = 'Mock Google API Error') {
  const error = new Error(message);
  error.code = code;
  error.status = code;
  error.response = {
    data: {
      error: {
        code,
        message,
        status: code >= 400 && code < 500 ? 'INVALID_ARGUMENT' : 'INTERNAL'
      }
    }
  };
  return error;
}

/**
 * Wait for a specified amount of time
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create mock logger
 * @returns {Object} Mock logger
 */
function createMockLogger() {
  return {
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    googleApiError: jest.fn().mockReturnValue({
      type: 'MOCK_ERROR',
      message: 'Mock error message',
      retryable: false,
      userMessage: 'A mock error occurred'
    }),
    logRequest: jest.fn(),
    logResponse: jest.fn(),
    logGoogleWalletOperation: jest.fn(),
    logTransaction: jest.fn(),
    logSecurityEvent: jest.fn(),
    logPerformance: jest.fn(),
    logNotification: jest.fn(),
  };
}

/**
 * Validate JWT structure
 * @param {string} token - JWT token
 * @returns {boolean} Whether token has valid structure
 */
function isValidJWTStructure(token) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  return parts.length === 3;
}

/**
 * Create mock Express request
 * @param {Object} options - Request options
 * @returns {Object} Mock request
 */
function createMockRequest(options = {}) {
  return {
    method: options.method || 'GET',
    path: options.path || '/',
    params: options.params || {},
    query: options.query || {},
    body: options.body || {},
    headers: options.headers || {},
    ip: options.ip || '127.0.0.1',
    get: jest.fn((header) => options.headers?.[header]),
    ...options
  };
}

/**
 * Create mock Express response
 * @returns {Object} Mock response
 */
function createMockResponse() {
  const res = {
    statusCode: 200,
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    get: jest.fn(),
  };
  return res;
}

module.exports = {
  generateTestUserId,
  generateTestUserIds,
  createMockGoogleWalletClient,
  createMockGoogleApiError,
  wait,
  createMockLogger,
  isValidJWTStructure,
  createMockRequest,
  createMockResponse,
};
