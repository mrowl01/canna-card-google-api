/**
 * Unit Tests for Retry Utility
 */

const retry = require('../../src/utils/retry');
const { createMockGoogleApiError, wait } = require('../helpers/test-utils');

describe('Retry Utility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('retry', () => {
    test('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await retry.retry(operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should retry on retryable error', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(createMockGoogleApiError(503, 'Service unavailable'))
        .mockResolvedValueOnce('success');

      const result = await retry.retry(operation, {
        maxAttempts: 3,
        initialDelay: 100,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    test('should fail after max attempts', async () => {
      const error = createMockGoogleApiError(500, 'Internal error');
      const operation = jest.fn().mockRejectedValue(error);

      await expect(
        retry.retry(operation, { maxAttempts: 3, initialDelay: 50 })
      ).rejects.toThrow();

      expect(operation).toHaveBeenCalledTimes(3);
    });

    test('should not retry on non-retryable error', async () => {
      const error = createMockGoogleApiError(400, 'Bad request');
      const operation = jest.fn().mockRejectedValue(error);

      await expect(
        retry.retry(operation, { maxAttempts: 3 })
      ).rejects.toThrow();

      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should respect maxAttempts option', async () => {
      const error = createMockGoogleApiError(503);
      const operation = jest.fn().mockRejectedValue(error);

      await expect(
        retry.retry(operation, { maxAttempts: 2, initialDelay: 50 })
      ).rejects.toThrow();

      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('isRetryable', () => {
    test('should identify retryable status codes', () => {
      const retryableCodes = [429, 500, 502, 503, 504];

      retryableCodes.forEach(code => {
        const error = createMockGoogleApiError(code);
        expect(retry.isRetryable(error)).toBe(true);
      });
    });

    test('should identify non-retryable status codes', () => {
      const nonRetryableCodes = [400, 401, 403, 404, 409];

      nonRetryableCodes.forEach(code => {
        const error = createMockGoogleApiError(code);
        expect(retry.isRetryable(error)).toBe(false);
      });
    });

    test('should identify retryable error messages', () => {
      const retryableMessages = [
        'timeout',
        'network error',
        'connection refused',
        'service unavailable',
      ];

      retryableMessages.forEach(message => {
        const error = new Error(message);
        expect(retry.isRetryable(error)).toBe(true);
      });
    });

    test('should identify network errors as retryable', () => {
      const networkErrors = ['ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'];

      networkErrors.forEach(code => {
        const error = new Error('Network error');
        error.code = code;
        expect(retry.isRetryable(error)).toBe(true);
      });
    });
  });

  describe('retryGoogleApi', () => {
    test('should successfully execute Google API operation', async () => {
      const mockResult = { data: { id: 'test_id' } };
      const operation = jest.fn().mockResolvedValue(mockResult);

      const result = await retry.retryGoogleApi(operation, {
        operation: 'testOperation',
        resourceId: 'test_123'
      });

      expect(result).toEqual(mockResult);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should retry Google API operation on failure', async () => {
      const mockResult = { data: { id: 'test_id' } };
      const operation = jest.fn()
        .mockRejectedValueOnce(createMockGoogleApiError(503))
        .mockResolvedValueOnce(mockResult);

      const result = await retry.retryGoogleApi(operation, {
        operation: 'testOperation',
      });

      expect(result).toEqual(mockResult);
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('calculateDelay', () => {
    test('should return base delay when jitter is disabled', () => {
      const baseDelay = 1000;
      const config = { jitter: false };

      const delay = retry.calculateDelay(baseDelay, config);

      expect(delay).toBe(baseDelay);
    });

    test('should add jitter when enabled', () => {
      const baseDelay = 1000;
      const config = { jitter: true };

      const delay = retry.calculateDelay(baseDelay, config);

      // Delay should be within ±25% of base delay
      expect(delay).toBeGreaterThanOrEqual(750);
      expect(delay).toBeLessThanOrEqual(1250);
      expect(delay).toBeGreaterThanOrEqual(100); // Minimum delay
    });
  });

  describe('sleep', () => {
    test('should wait for specified duration', async () => {
      const start = Date.now();
      await retry.sleep(100);
      const duration = Date.now() - start;

      expect(duration).toBeGreaterThanOrEqual(90); // Allow for small timing variations
    });
  });

  describe('Circuit Breaker', () => {
    test('should execute operation in CLOSED state', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      const circuitBreaker = retry.createCircuitBreaker(operation, {
        failureThreshold: 3
      });

      const result = await circuitBreaker();

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should open circuit after threshold failures', async () => {
      const error = new Error('Test error');
      const operation = jest.fn().mockRejectedValue(error);
      const circuitBreaker = retry.createCircuitBreaker(operation, {
        failureThreshold: 3,
        resetTimeout: 1000
      });

      // Trigger 3 failures
      await expect(circuitBreaker()).rejects.toThrow();
      await expect(circuitBreaker()).rejects.toThrow();
      await expect(circuitBreaker()).rejects.toThrow();

      // Circuit should now be OPEN
      await expect(circuitBreaker()).rejects.toThrow('Circuit breaker is OPEN');

      // Operation should only have been called 3 times (not 4)
      expect(operation).toHaveBeenCalledTimes(3);
    });

    test('should transition to HALF_OPEN after reset timeout', async () => {
      const error = new Error('Test error');
      const operation = jest.fn()
        .mockRejectedValue(error)
        .mockRejectedValue(error)
        .mockRejectedValue(error)
        .mockResolvedValue('success');

      const circuitBreaker = retry.createCircuitBreaker(operation, {
        failureThreshold: 2,
        resetTimeout: 100 // Short timeout for testing
      });

      // Trigger failures to open circuit
      await expect(circuitBreaker()).rejects.toThrow();
      await expect(circuitBreaker()).rejects.toThrow();

      // Circuit is now OPEN
      await expect(circuitBreaker()).rejects.toThrow('Circuit breaker is OPEN');

      // Wait for reset timeout
      await wait(150);

      // Circuit should allow one attempt (HALF_OPEN)
      const result = await circuitBreaker();
      expect(result).toBe('success');
    });
  });
});
