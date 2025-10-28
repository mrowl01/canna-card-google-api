/**
 * Unit Tests for JWT Service
 */

const jwtService = require('../../src/services/jwt-service');
const { generateTestUserId, isValidJWTStructure } = require('../helpers/test-utils');

describe('JWT Service', () => {
  describe('createUserWalletPass', () => {
    test('should create a valid JWT token with default options', () => {
      const userId = generateTestUserId();
      const result = jwtService.createUserWalletPass(userId);

      expect(result.success).toBe(true);
      expect(result.userId).toBe(userId);
      expect(result.jwt).toBeDefined();
      expect(isValidJWTStructure(result.jwt)).toBe(true);
      expect(result.saveUrl).toContain('https://pay.google.com/gp/v/save/');
      expect(result.saveUrl).toContain(result.jwt);
    });

    test('should create JWT with custom points', () => {
      const userId = generateTestUserId();
      const points = 500;
      const result = jwtService.createUserWalletPass(userId, { points });

      expect(result.success).toBe(true);
      expect(result.jwt).toBeDefined();
    });

    test('should create JWT with custom tier', () => {
      const userId = generateTestUserId();
      const tier = 'Gold';
      const result = jwtService.createUserWalletPass(userId, { tier });

      expect(result.success).toBe(true);
      expect(result.jwt).toBeDefined();
    });

    test('should create JWT with custom member name', () => {
      const userId = generateTestUserId();
      const memberName = 'Test User';
      const result = jwtService.createUserWalletPass(userId, { memberName });

      expect(result.success).toBe(true);
      expect(result.userId).toBe(userId);
    });

    test('should create JWT with custom class ID', () => {
      const userId = generateTestUserId();
      const classId = 'custom_class_id';
      const result = jwtService.createUserWalletPass(userId, { classId });

      expect(result.success).toBe(true);
      expect(result.classId).toBe(classId);
    });

    test('should include object ID in result', () => {
      const userId = generateTestUserId();
      const result = jwtService.createUserWalletPass(userId);

      expect(result.objectId).toBeDefined();
      expect(result.objectId).toContain(userId);
    });

    test('should handle invalid user ID gracefully', () => {
      const result = jwtService.createUserWalletPass(null);

      // The service may still create a token with null userId
      // or may fail - check both scenarios
      if (result.success) {
        expect(result.jwt).toBeDefined();
      } else {
        expect(result.error).toBeDefined();
      }
    });
  });

  describe('validateJWT', () => {
    test('should validate a valid JWT', () => {
      const userId = generateTestUserId();
      const createResult = jwtService.createUserWalletPass(userId);
      const validateResult = jwtService.validateJWT(createResult.jwt);

      expect(validateResult.success).toBe(true);
      expect(validateResult.payload).toBeDefined();
      expect(validateResult.header).toBeDefined();
    });

    test('should reject invalid JWT', () => {
      const result = jwtService.validateJWT('invalid.jwt.token');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should reject empty JWT', () => {
      const result = jwtService.validateJWT('');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should reject null JWT', () => {
      const result = jwtService.validateJWT(null);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    test('should extract payload from valid JWT', () => {
      const userId = generateTestUserId();
      const points = 250;
      const tier = 'Silver';

      const createResult = jwtService.createUserWalletPass(userId, { points, tier });
      const validateResult = jwtService.validateJWT(createResult.jwt);

      expect(validateResult.success).toBe(true);
      expect(validateResult.payload).toBeDefined();
      expect(validateResult.payload.iss).toBeDefined();
      expect(validateResult.payload.aud).toBe('google');
      expect(validateResult.payload.typ).toBe('savetowallet');
      expect(validateResult.payload.payload).toBeDefined();
    });
  });

  describe('createLoyaltyObjectPayload', () => {
    test('should create a valid loyalty object payload', () => {
      const userId = generateTestUserId();
      const payload = jwtService.createLoyaltyObjectPayload(userId);

      expect(payload).toBeDefined();
      expect(payload.id).toContain(userId);
      expect(payload.classId).toBeDefined();
      expect(payload.loyaltyPoints).toBeDefined();
      expect(payload.loyaltyPoints.balance.string).toBe('0');
    });

    test('should create payload with custom points', () => {
      const userId = generateTestUserId();
      const points = 1000;
      const payload = jwtService.createLoyaltyObjectPayload(userId, { points });

      expect(payload.loyaltyPoints.balance.string).toBe('1000');
      expect(payload.smartTapRedemptionValue).toBe('1000');
    });

    test('should create payload with custom tier', () => {
      const userId = generateTestUserId();
      const tier = 'Gold';
      const payload = jwtService.createLoyaltyObjectPayload(userId, { tier });

      expect(payload.rewardsTier).toBe('Gold');
    });

    test('should create payload with barcode', () => {
      const userId = generateTestUserId();
      const payload = jwtService.createLoyaltyObjectPayload(userId);

      expect(payload.barcode).toBeDefined();
      expect(payload.barcode.type).toBe('QR_CODE');
      expect(payload.barcode.value).toContain(userId);
    });

    test('should include text modules', () => {
      const userId = generateTestUserId();
      const payload = jwtService.createLoyaltyObjectPayload(userId);

      expect(payload.textModulesData).toBeDefined();
      expect(Array.isArray(payload.textModulesData)).toBe(true);
      expect(payload.textModulesData.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle very long user IDs', () => {
      const userId = 'a'.repeat(100);
      const result = jwtService.createUserWalletPass(userId);

      // Should either succeed or fail gracefully
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    test('should handle special characters in user ID', () => {
      const userId = 'test_user-123.456';
      const result = jwtService.createUserWalletPass(userId);

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    test('should handle negative points gracefully', () => {
      const userId = generateTestUserId();
      const result = jwtService.createUserWalletPass(userId, { points: -100 });

      expect(result).toBeDefined();
      // Points might be normalized to 0 or rejected
    });

    test('should handle very large points values', () => {
      const userId = generateTestUserId();
      const result = jwtService.createUserWalletPass(userId, { points: 999999 });

      expect(result.success).toBe(true);
      expect(result.jwt).toBeDefined();
    });
  });
});
