const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');
const { validateEnvironment } = require('../../config/env-validation');
const logger = require('../utils/logger');
const retryUtility = require('../utils/retry');

class GoogleWalletAuth {
  constructor() {
    this.auth = null;
    this.walletClient = null;
    this.isInitialized = false;
  }

  async initialize() {
    const startTime = Date.now();

    try {
      logger.info('Initializing Google Wallet Authentication');

      // Validate environment before initializing
      const validation = validateEnvironment();
      if (!validation.valid) {
        const error = new Error('Environment validation failed. Check your .env configuration.');
        logger.error('Environment Validation Failed', {
          missing: validation.missing,
          invalid: validation.invalid
        });
        throw error;
      }

      // Initialize Google Auth with service account with retry logic
      const initializeAuth = async () => {
        // Support both file-based credentials (local) and JSON string (Vercel)
        const authConfig = {
          scopes: ['https://www.googleapis.com/auth/wallet_object.issuer']
        };

        if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
          // Use JSON credentials from environment variable (for Vercel)
          authConfig.credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
          // Use file-based credentials (for local development)
          authConfig.keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        } else {
          throw new Error('No Google credentials found. Set either GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS');
        }

        this.auth = new GoogleAuth(authConfig);

        // Create authenticated client
        const authClient = await this.auth.getClient();

        // Initialize Google Wallet API client
        this.walletClient = google.walletobjects({
          version: 'v1',
          auth: authClient
        });

        return true;
      };

      await retryUtility.retryGoogleApi(initializeAuth, {
        operation: 'google_wallet_auth_init'
      });

      this.isInitialized = true;
      const duration = Date.now() - startTime;

      logger.info('Google Wallet Authentication Initialized', {
        duration: `${duration}ms`,
        scopes: ['wallet_object.issuer']
      });

      return true;

    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error('Google Wallet Authentication Failed', {
        duration: `${duration}ms`,
        error: error.message,
        credentialsFile: process.env.GOOGLE_APPLICATION_CREDENTIALS ? '[SET]' : '[MISSING]'
      });
      throw error;
    }
  }

  async getClient() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return this.walletClient;
  }

  async getAuthClient() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return await this.auth.getClient();
  }

  async testConnection() {
    try {
      const client = await this.getClient();

      // Test API connection by listing loyalty classes
      const response = await client.loyaltyclass.list({
        issuerId: process.env.ISSUER_ID
      });

      console.log('✅ Google Wallet API connection test successful');
      return {
        success: true,
        message: 'Successfully connected to Google Wallet API',
        classCount: response.data.resources ? response.data.resources.length : 0
      };
    } catch (error) {
      console.error('❌ Google Wallet API connection test failed:', error.message);
      return {
        success: false,
        message: error.message,
        error: error
      };
    }
  }

  // Generate JWT for Save to Wallet
  async generateJWT(payload) {
    try {
      const authClient = await this.getAuthClient();

      const jwt = require('jsonwebtoken');
      const credentials = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);

      const now = Math.floor(Date.now() / 1000);
      const jwtPayload = {
        iss: credentials.client_email,
        aud: 'google',
        typ: 'savetowallet',
        iat: now,
        origins: process.env.ORIGINS.split(','),
        payload: payload
      };

      const token = jwt.sign(jwtPayload, credentials.private_key, {
        algorithm: 'RS256'
      });

      return token;
    } catch (error) {
      console.error('❌ Failed to generate JWT:', error.message);
      throw error;
    }
  }

  // Helper method to check if service is ready
  isReady() {
    return this.isInitialized;
  }

  // Get issuer ID
  getIssuerId() {
    return process.env.ISSUER_ID;
  }

  // Get class suffix
  getClassSuffix() {
    return process.env.CLASS_SUFFIX;
  }

  // Get object suffix
  getObjectSuffix() {
    return process.env.OBJECT_SUFFIX;
  }
}

// Create singleton instance
const googleWalletAuth = new GoogleWalletAuth();

module.exports = googleWalletAuth;