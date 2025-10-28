const jwt = require('jsonwebtoken');
const fs = require('fs');
const googleWalletAuth = require('../auth/google-wallet-auth');

class JWTService {
  constructor() {
    this.credentials = null;
    this.loadCredentials();
  }

  // Load service account credentials
  loadCredentials() {
    try {
      // Support both JSON env variable (Vercel) and file path (local)
      if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        // Parse from environment variable (Vercel deployment)
        this.credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        console.log('✅ JWT service credentials loaded from environment variable');
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        // Load from file (local development)
        const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
        if (!fs.existsSync(credentialsPath)) {
          throw new Error('Google service account credentials file not found');
        }
        this.credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'));
        console.log('✅ JWT service credentials loaded from file');
      } else {
        throw new Error('No Google credentials found. Set either GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS');
      }
    } catch (error) {
      console.error('❌ Failed to load JWT credentials:', error.message);
      throw error;
    }
  }

  // Generate JWT for Save to Wallet
  generateSaveToWalletJWT(loyaltyObject) {
    try {
      if (!this.credentials) {
        throw new Error('JWT credentials not loaded');
      }

      const now = Math.floor(Date.now() / 1000);
      const origins = process.env.ORIGINS ? process.env.ORIGINS.split(',') : ['http://localhost:3001'];

      // JWT payload with required claims
      const payload = {
        iss: this.credentials.client_email,
        aud: 'google',
        typ: 'savetowallet',
        iat: now,
        exp: now + (60 * 60), // 1 hour expiration
        origins: origins,
        payload: {
          loyaltyObjects: [loyaltyObject]
        }
      };

      // Sign the JWT with the service account private key
      const token = jwt.sign(payload, this.credentials.private_key, {
        algorithm: 'RS256',
        noTimestamp: true // We set iat manually
      });

      console.log('✅ JWT generated successfully for object:', loyaltyObject.id);

      return {
        success: true,
        jwt: token,
        payload: payload,
        message: 'JWT generated successfully'
      };

    } catch (error) {
      console.error('❌ Failed to generate JWT:', error.message);
      return {
        success: false,
        error: error.message,
        message: 'Failed to generate JWT'
      };
    }
  }

  // Generate Save to Wallet URL
  generateSaveToWalletURL(loyaltyObject) {
    try {
      const jwtResult = this.generateSaveToWalletJWT(loyaltyObject);

      if (!jwtResult.success) {
        return jwtResult;
      }

      const saveUrl = `https://pay.google.com/gp/v/save/${jwtResult.jwt}`;

      return {
        success: true,
        jwt: jwtResult.jwt,
        saveUrl: saveUrl,
        message: 'Save to Wallet URL generated successfully'
      };

    } catch (error) {
      console.error('❌ Failed to generate Save to Wallet URL:', error.message);
      return {
        success: false,
        error: error.message,
        message: 'Failed to generate Save to Wallet URL'
      };
    }
  }

  // Validate JWT structure (for testing)
  validateJWT(token) {
    try {
      if (!this.credentials) {
        throw new Error('JWT credentials not loaded');
      }

      // Decode without verification first to inspect structure
      const decoded = jwt.decode(token, { complete: true });

      if (!decoded) {
        throw new Error('Invalid JWT format');
      }

      // Verify signature
      const verified = jwt.verify(token, this.credentials.private_key, {
        algorithms: ['RS256']
      });

      return {
        success: true,
        header: decoded.header,
        payload: decoded.payload,
        verified: verified,
        message: 'JWT validation successful'
      };

    } catch (error) {
      console.error('❌ JWT validation failed:', error.message);
      return {
        success: false,
        error: error.message,
        message: 'JWT validation failed'
      };
    }
  }

  // Create loyalty object payload for JWT
  createLoyaltyObjectPayload(userId, options = {}) {
    const {
      classId = `${process.env.ISSUER_ID}.${process.env.CLASS_SUFFIX}`,
      points = 0,
      tier = 'Bronze',
      memberName = `Member ${userId}`,
      memberSince = new Date().toISOString().split('T')[0]
    } = options;

    const objectId = `${process.env.ISSUER_ID}.${process.env.OBJECT_SUFFIX}-${userId}`;

    return {
      id: objectId,
      classId: classId,
      state: 'ACTIVE',
      loyaltyPoints: {
        label: 'Points',
        balance: {
          string: points.toString()
        }
      },
      rewardsTier: tier,
      accountName: memberName,
      accountId: userId,
      textModulesData: [
        {
          header: 'Member Since',
          body: memberSince
        },
        {
          header: 'Tier Benefits',
          body: this.getTierBenefits(tier)
        }
      ],
      barcode: {
        type: 'QR_CODE',
        value: `LOYALTY_${userId}_${Date.now()}`,
        alternateText: `Member ID: ${userId}`
      },
      locations: [
        {
          latitude: 37.7749,
          longitude: -122.4194
        }
      ],
      hasUsers: true
    };
  }

  // Get tier benefits description
  getTierBenefits(tier) {
    const benefits = {
      'Bronze': '5% cashback on purchases',
      'Silver': '10% cashback + free shipping',
      'Gold': '15% cashback + free shipping + priority support'
    };
    return benefits[tier] || benefits['Bronze'];
  }

  // Generate complete Save to Wallet solution for a user
  createUserWalletPass(userId, options = {}) {
    try {
      // Create loyalty object payload
      const loyaltyObject = this.createLoyaltyObjectPayload(userId, options);

      // Generate Save to Wallet URL
      const result = this.generateSaveToWalletURL(loyaltyObject);

      if (result.success) {
        return {
          success: true,
          userId: userId,
          objectId: loyaltyObject.id,
          classId: loyaltyObject.classId,
          jwt: result.jwt,
          saveUrl: result.saveUrl,
          loyaltyObject: loyaltyObject,
          message: 'User wallet pass created successfully'
        };
      } else {
        return result;
      }

    } catch (error) {
      console.error('❌ Failed to create user wallet pass:', error.message);
      return {
        success: false,
        error: error.message,
        message: 'Failed to create user wallet pass'
      };
    }
  }
}

module.exports = new JWTService();