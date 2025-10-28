# Testing Framework

This directory contains the test suite for the Google Wallet Loyalty Card POC.

## Structure

```
test/
├── unit/               # Unit tests for individual modules
│   ├── jwt-service.test.js
│   └── retry.test.js
├── integration/        # Integration tests for API endpoints
│   └── api.test.js
├── helpers/           # Test utilities and helpers
│   └── test-utils.js
├── fixtures/          # Mock data and credentials
│   └── mock-credentials.json
├── setup.js           # Jest setup file
└── README.md          # This file
```

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode (Auto-rerun on changes)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```

### Unit Tests Only
```bash
npm run test:unit
```

### Integration Tests Only
```bash
npm run test:integration
```

### Verbose Output
```bash
npm run test:verbose
```

## Test Categories

### Unit Tests
Unit tests focus on testing individual functions and modules in isolation:

- **JWT Service Tests** (`test/unit/jwt-service.test.js`)
  - JWT creation and validation
  - Loyalty object payload generation
  - Edge cases and error handling

- **Retry Utility Tests** (`test/unit/retry.test.js`)
  - Retry logic with exponential backoff
  - Error classification (retryable vs non-retryable)
  - Circuit breaker pattern
  - Delay calculations with jitter

### Integration Tests
Integration tests verify that components work together correctly:

- **API Integration Tests** (`test/integration/api.test.js`)
  - Health check endpoints
  - JWT generation endpoints
  - Points management endpoints
  - Notification endpoints
  - Input validation
  - Rate limiting
  - Security headers
  - Error handling

## Test Utilities

The `test/helpers/test-utils.js` file provides common utilities:

- `generateTestUserId()` - Generate random test user IDs
- `generateTestUserIds(count)` - Generate multiple user IDs
- `createMockGoogleWalletClient()` - Mock Google Wallet API client
- `createMockGoogleApiError(code, message)` - Create mock API errors
- `wait(ms)` - Async wait utility
- `createMockLogger()` - Mock logger for testing
- `isValidJWTStructure(token)` - Validate JWT format
- `createMockRequest(options)` - Create mock Express request
- `createMockResponse()` - Create mock Express response

## Environment

Tests use a separate test environment configuration:
- Environment variables are loaded from `.env.test`
- Mock Google Wallet credentials are used
- Test database/storage is isolated from development

## Custom Matchers

The test suite includes custom Jest matchers:

```javascript
expect(token).toBeValidJWT(); // Validates JWT structure
```

## Writing New Tests

### Unit Test Template

```javascript
const moduleToTest = require('../../src/path/to/module');
const { generateTestUserId } = require('../helpers/test-utils');

describe('Module Name', () => {
  describe('functionName', () => {
    test('should do something', () => {
      const result = moduleToTest.functionName();
      expect(result).toBeDefined();
    });
  });
});
```

### Integration Test Template

```javascript
const request = require('supertest');
const app = require('../../src/server');

describe('Endpoint Tests', () => {
  test('GET /endpoint should return 200', async () => {
    const response = await request(app)
      .get('/endpoint')
      .expect(200);

    expect(response.body).toHaveProperty('success', true);
  });
});
```

## Coverage Goals

The project aims for:
- **80%+ code coverage** overall
- **90%+ coverage** for critical paths (JWT, authentication, payments)
- **100% coverage** for security-related code

View coverage reports in the `coverage/` directory after running `npm run test:coverage`.

## Continuous Integration

Tests are designed to run in CI/CD pipelines:
- Fast execution (< 30 seconds for full suite)
- No external dependencies (uses mocks)
- Clear success/failure reporting
- Coverage reports generated for analysis

## Troubleshooting

### Tests Failing Due to Missing Credentials

If you see errors about missing Google credentials:
1. Make sure `.env.test` exists
2. Verify `test/fixtures/mock-credentials.json` is present
3. Check that `GOOGLE_APPLICATION_CREDENTIALS` points to mock credentials

### Port Already in Use

If integration tests fail with "port already in use":
1. Stop any running development servers
2. The test server runs on port 3002 by default
3. Change `PORT` in `.env.test` if needed

### Timeout Errors

If tests timeout:
1. Increase timeout in `jest.config.js`
2. Check for infinite loops or missing async/await
3. Verify network mocks are properly configured

## Best Practices

1. **Isolation**: Each test should be independent
2. **Clean Up**: Use `afterEach` to clean up test data
3. **Mocking**: Mock external services (Google Wallet API, etc.)
4. **Descriptive Names**: Use clear test descriptions
5. **Arrange-Act-Assert**: Structure tests consistently
6. **Edge Cases**: Test boundary conditions and error cases
7. **Fast**: Keep tests fast (< 100ms per test when possible)

## Contributing

When adding new features:
1. Write tests first (TDD approach)
2. Ensure all tests pass
3. Maintain or improve coverage
4. Update this README if adding new test categories
