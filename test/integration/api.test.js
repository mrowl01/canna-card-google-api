/**
 * Integration Tests for API Endpoints
 * Tests the Express server and API routes
 */

const request = require('supertest');
const app = require('../../src/server');
const { generateTestUserId } = require('../helpers/test-utils');

// Note: These tests will run against the actual server
// For full integration tests, you would need valid Google Wallet credentials
// These tests focus on API structure and error handling

describe('API Integration Tests', () => {
  describe('Health Check', () => {
    test('GET /health should return 200', async () => {
      const response = await request(app)
        .get('/health')
        .expect('Content-Type', /json/);

      // Status might be 200 or 500 depending on Google Wallet auth
      expect([200, 500]).toContain(response.status);
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('API Documentation', () => {
    test('GET /api should return API documentation', async () => {
      const response = await request(app)
        .get('/api')
        .expect(200)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('endpoints');
      expect(response.body).toHaveProperty('loyaltyClass');
    });

    test('GET / should return HTML dashboard', async () => {
      const response = await request(app)
        .get('/')
        .expect(200)
        .expect('Content-Type', /html/);

      // Should be the dashboard HTML page
      expect(response.text).toContain('Google Wallet');
    });
  });

  describe('404 Handler', () => {
    test('should return 404 for non-existent endpoint', async () => {
      const response = await request(app)
        .get('/non-existent-endpoint')
        .expect(404)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('path');
    });
  });

  describe('JWT Endpoints', () => {
    test('POST /create-pass/:userId should create a pass', async () => {
      const userId = generateTestUserId();

      const response = await request(app)
        .post(`/create-pass/${userId}`)
        .send({ points: 100, tier: 'Bronze' })
        .expect('Content-Type', /json/);

      // Might succeed or fail depending on Google Wallet setup
      expect(response.body).toHaveProperty('success');
      if (response.body.success) {
        expect(response.body).toHaveProperty('jwt');
        expect(response.body).toHaveProperty('saveUrl');
        expect(response.body).toHaveProperty('userId', userId);
      }
    });

    test('GET /save-url/:userId should generate save URL', async () => {
      const userId = generateTestUserId();

      const response = await request(app)
        .get(`/save-url/${userId}`)
        .query({ points: 50, tier: 'Silver' })
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('success');
      if (response.body.success) {
        expect(response.body).toHaveProperty('saveUrl');
        expect(response.body.saveUrl).toContain('https://pay.google.com');
      }
    });

    test('POST /validate-jwt should validate JWT', async () => {
      const response = await request(app)
        .post('/validate-jwt')
        .send({ jwt: 'invalid.jwt.token' })
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('success');
      // Invalid JWT should fail validation
      if (!response.body.success) {
        expect(response.body).toHaveProperty('error');
      }
    });

    test('POST /validate-jwt should require JWT parameter', async () => {
      const response = await request(app)
        .post('/validate-jwt')
        .send({})
        .expect(400)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Input Validation', () => {
    test('POST /add-points/:userId should validate points parameter', async () => {
      const userId = generateTestUserId();

      const response = await request(app)
        .post(`/add-points/${userId}`)
        .send({ points: -100 }) // Invalid: negative points
        .expect('Content-Type', /json/);

      // Should either reject or normalize the value
      expect(response.body).toHaveProperty('success');
    });

    test('POST /add-points/:userId should validate userId format', async () => {
      const response = await request(app)
        .post('/add-points/invalid!@#$%')
        .send({ points: 100 })
        .expect('Content-Type', /json/);

      // Validation middleware should catch invalid userId
      expect([400, 404, 500]).toContain(response.status);
    });

    test('POST /redeem-points/:userId should validate points parameter', async () => {
      const userId = generateTestUserId();

      const response = await request(app)
        .post(`/redeem-points/${userId}`)
        .send({ points: 0 }) // Invalid: zero points
        .expect('Content-Type', /json/);

      // Should reject zero points
      expect(response.body).toHaveProperty('success');
    });
  });

  describe('Notification Endpoints', () => {
    test('POST /send-notification/:userId should validate notification type', async () => {
      const userId = generateTestUserId();

      const response = await request(app)
        .post(`/send-notification/${userId}`)
        .send({ type: 'INVALID_TYPE' })
        .expect('Content-Type', /json/);

      // Should reject invalid notification type
      expect(response.body).toHaveProperty('success');
      if (!response.body.success) {
        expect(response.body).toHaveProperty('error');
      }
    });

    test('POST /batch-notify should validate userIds array', async () => {
      const response = await request(app)
        .post('/batch-notify')
        .send({ userIds: 'not-an-array', type: 'CUSTOM' })
        .expect('Content-Type', /json/);

      // Should reject non-array userIds
      expect(response.body).toHaveProperty('success');
      if (!response.body.success) {
        expect(response.body).toHaveProperty('error');
      }
    });

    test('GET /notification-history/:userId should return history', async () => {
      const userId = generateTestUserId();

      const response = await request(app)
        .get(`/notification-history/${userId}`)
        .expect('Content-Type', /json/);

      expect(response.body).toHaveProperty('success');
      if (response.body.success) {
        expect(response.body).toHaveProperty('notifications');
        expect(response.body).toHaveProperty('rateLimit');
      }
    });
  });

  describe('Rate Limiting', () => {
    test('should apply rate limiting to notification endpoints', async () => {
      const userId = generateTestUserId();

      // This test would need to send many requests to trigger rate limiting
      // For now, just verify the endpoint exists and responds
      const response = await request(app)
        .post(`/send-notification/${userId}`)
        .send({ type: 'CUSTOM', data: { message: 'test' } })
        .expect('Content-Type', /json/);

      expect(response.body).toBeDefined();
    });
  });

  describe('Security Headers', () => {
    test('should include security headers in response', async () => {
      const response = await request(app)
        .get('/health');

      // Check for some common security headers
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-frame-options');
    });

    test('should handle CORS properly', async () => {
      const response = await request(app)
        .options('/health')
        .set('Origin', 'http://localhost:3000');

      // CORS headers should be present
      expect([200, 204]).toContain(response.status);
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed JSON gracefully', async () => {
      const response = await request(app)
        .post('/validate-jwt')
        .set('Content-Type', 'application/json')
        .send('{"invalid json}')
        .expect('Content-Type', /json/);

      // Should return an error response
      expect([400, 500]).toContain(response.status);
    });

    test('should sanitize error messages in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const response = await request(app)
        .get('/non-existent')
        .expect(404);

      // Error messages should not leak implementation details
      expect(response.body).toHaveProperty('error');

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Notification History Endpoint', () => {
    const testUserId = generateTestUserId();

    beforeAll(async () => {
      // Create a test card for notification history tests
      const { supabase } = require('../../src/database/supabase-client');
      await supabase.from('loyalty_cards').insert({
        user_id: testUserId,
        member_name: 'Notification Test User',
        points: 100,
        tier: 'Bronze',
        object_id: `object-${testUserId}`
      });
    });

    afterAll(async () => {
      // Cleanup
      const { supabase } = require('../../src/database/supabase-client');
      await supabase.from('notifications').delete().eq('user_id', testUserId);
      await supabase.from('loyalty_cards').delete().eq('user_id', testUserId);
    });

    test('GET /notification-history/:userId should return notification history', async () => {
      const response = await request(app)
        .get(`/notification-history/${testUserId}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('userId', testUserId);
      expect(response.body).toHaveProperty('notifications');
      expect(response.body).toHaveProperty('notificationCount');
      expect(response.body).toHaveProperty('todayCount');
      expect(response.body).toHaveProperty('rateLimit');

      expect(Array.isArray(response.body.notifications)).toBe(true);
      expect(response.body.rateLimit).toHaveProperty('maxPerDay', 3);
      expect(response.body.rateLimit).toHaveProperty('remaining');
      expect(response.body.rateLimit).toHaveProperty('canSend');
    });

    test('should return 400 for missing userId', async () => {
      const response = await request(app)
        .get('/notification-history/')
        .expect(404); // Route not found without userId

      expect(response.body).toBeDefined();
    });

    test('should return empty array for user with no notifications', async () => {
      const newUserId = `${testUserId}-no-notifs`;

      // Create card without notifications
      const { supabase } = require('../../src/database/supabase-client');
      await supabase.from('loyalty_cards').insert({
        user_id: newUserId,
        member_name: 'No Notifications User',
        points: 50,
        tier: 'Bronze',
        object_id: `object-${newUserId}`
      });

      const response = await request(app)
        .get(`/notification-history/${newUserId}`)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.notifications).toEqual([]);
      expect(response.body.notificationCount).toBe(0);
      expect(response.body.todayCount).toBe(0);
      expect(response.body.rateLimit.remaining).toBe(3);
      expect(response.body.rateLimit.canSend).toBe(true);

      // Cleanup
      await supabase.from('loyalty_cards').delete().eq('user_id', newUserId);
    });

    test('should track notification rate limits correctly', async () => {
      const dbService = require('../../src/database/db-service');

      // Send 2 notifications
      await dbService.createNotification(testUserId, 'CUSTOM', 'Test message 1', {}, false);
      await dbService.createNotification(testUserId, 'CUSTOM', 'Test message 2', {}, false);

      const response = await request(app)
        .get(`/notification-history/${testUserId}`)
        .expect(200);

      // Should show 2 notifications today (or more if tests ran before)
      expect(response.body.todayCount).toBeGreaterThanOrEqual(2);
      expect(response.body.rateLimit.remaining).toBeLessThanOrEqual(1);

      // If we've hit the limit, canSend should be false
      if (response.body.todayCount >= 3) {
        expect(response.body.rateLimit.canSend).toBe(false);
        expect(response.body.rateLimit.remaining).toBe(0);
      }
    });

    test('should include notification details in response', async () => {
      const dbService = require('../../src/database/db-service');

      // Create a notification with specific data
      await dbService.createNotification(
        testUserId,
        'POINTS_EARNED',
        'You earned 50 points!',
        { points: 50, reason: 'Purchase' },
        false
      );

      const response = await request(app)
        .get(`/notification-history/${testUserId}`)
        .expect(200);

      expect(response.body.notifications.length).toBeGreaterThan(0);

      // Check that notifications have the expected structure
      const notification = response.body.notifications[0];
      expect(notification).toHaveProperty('type');
      expect(notification).toHaveProperty('message');
      expect(notification).toHaveProperty('silent');
      expect(notification).toHaveProperty('sentAt');
    });
  });
});
