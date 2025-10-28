require('dotenv').config();
const express = require('express');
const { validateEnvironment, logValidationResults } = require('../config/env-validation');
const googleWalletAuth = require('./auth/google-wallet-auth');
const loyaltyClassService = require('./services/loyalty-class');
const jwtService = require('./services/jwt-service');
const loyaltyObjectService = require('./services/loyalty-object');
const security = require('./middleware/security');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/error-handler');

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy for Vercel (required for rate limiting and IP detection)
if (process.env.VERCEL === '1') {
  app.set('trust proxy', 1);
}

// Security Middleware
app.use(security.securityHeaders);
app.use(security.cors);
app.use(security.generalRateLimit);
app.use(security.requestLogger);
app.use(security.sanitizeInput);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API Key Authentication (enforced in production)
app.use(security.validateApiKey);

// =====================================
// API Root - Service Info
// =====================================

app.get('/', (req, res) => {
  res.json({
    service: 'Google Wallet Loyalty Card API',
    version: '2.0.0',
    status: 'production',
    environment: process.env.NODE_ENV || 'development',
    description: 'Stateless REST API for Google Wallet loyalty card management',
    endpoints: {
      health: 'GET /health',
      documentation: 'GET /api',
      createClass: 'POST /create-class',
      createCard: 'POST /create-card',
      updatePoints: 'POST /update-points/:objectId',
      sendNotification: 'POST /send-notification/:objectId',
      getSaveUrl: 'POST /get-save-url'
    }
  });
});

// =====================================
// Health Check
// =====================================

app.get('/health', async (req, res) => {
  try {
    // Simple health check - don't reveal internal details
    const envValidation = validateEnvironment();
    const walletTest = await googleWalletAuth.testConnection();

    // Check if system is healthy
    const isHealthy = envValidation.valid && walletTest.success;

    if (isHealthy) {
      res.json({
        status: 'OK'
      });
    } else {
      res.status(503).json({
        status: 'DEGRADED'
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'ERROR'
    });
  }
});

// =====================================
// API Documentation
// =====================================

app.get('/api', (req, res) => {
  res.json({
    service: 'Google Wallet Loyalty Card API',
    version: '2.0.0',
    description: 'Stateless REST API for managing Google Wallet loyalty cards',
    authentication: 'None (add API key authentication in production)',
    endpoints: {
      loyaltyClass: {
        createClass: {
          method: 'POST',
          path: '/create-class',
          description: 'Create a new loyalty class (template)',
          body: {
            classId: 'string (required) - Format: ISSUER_ID.unique_suffix',
            programName: 'string (required)',
            issuerName: 'string (optional)',
            programLogoUrl: 'string (optional)',
            heroImageUrl: 'string (optional)',
            hexBackgroundColor: 'string (optional)',
            brandColor: 'string (optional)'
          }
        },
        getClass: {
          method: 'GET',
          path: '/class/:classId',
          description: 'Get loyalty class details'
        },
        listClasses: {
          method: 'GET',
          path: '/classes',
          description: 'List all loyalty classes'
        }
      },
      loyaltyObject: {
        createCard: {
          method: 'POST',
          path: '/create-card',
          description: 'Create a loyalty card (object) for a user',
          body: {
            classId: 'string (required) - The loyalty class ID',
            userId: 'string (required) - Unique user identifier',
            memberName: 'string (required)',
            points: 'number (optional, default: 0)',
            tier: 'string (optional) - Bronze, Silver, Gold',
            barcodeType: 'string (optional) - QR_CODE, CODE_128, etc',
            barcodeValue: 'string (optional)',
            validFrom: 'string (optional) - ISO date',
            validUntil: 'string (optional) - ISO date'
          }
        },
        getObject: {
          method: 'GET',
          path: '/object/:objectId',
          description: 'Get loyalty object details'
        },
        listObjects: {
          method: 'GET',
          path: '/objects',
          description: 'List all loyalty objects'
        },
        updatePoints: {
          method: 'POST',
          path: '/update-points/:objectId',
          description: 'Update points for a loyalty card',
          body: {
            points: 'number (required) - New points balance',
            tier: 'string (optional) - New tier (auto-calculated if not provided)'
          }
        }
      },
      notifications: {
        sendNotification: {
          method: 'POST',
          path: '/send-notification/:objectId',
          description: 'Send push notification to a loyalty card',
          body: {
            header: 'string (optional)',
            body: 'string (required)',
            footer: 'string (optional)'
          }
        }
      },
      jwt: {
        getSaveUrl: {
          method: 'POST',
          path: '/get-save-url',
          description: 'Generate Save to Google Wallet URL',
          body: {
            objectId: 'string (required) - The loyalty object ID'
          }
        }
      }
    }
  });
});

// =====================================
// Loyalty Class Management
// =====================================

// Create loyalty class (template)
app.post('/create-class', async (req, res) => {
  try {
    const {
      classId,
      programName,
      issuerName = 'Teiga Tech',
      programLogoUrl,
      heroImageUrl,
      hexBackgroundColor = '#1976D2',
      brandColor = '#1976D2',
      accountIdLabel = 'Member ID',
      accountNameLabel = 'Name',
      rewardsTierLabel = 'Tier',
      textModules = [],
      imageModules = [],
      linksModule = { uris: [] },
      merchantLocations = [],
      appLinkData
    } = req.body;

    if (!classId || !programName) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'classId and programName are required'
      });
    }

    // Build loyalty class definition
    const classDefinition = {
      id: classId,
      issuerName,
      programName,
      hexBackgroundColor,
      reviewStatus: 'UNDER_REVIEW',
      allowMultipleUsersPerObject: false,
      localizedIssuerName: {
        defaultValue: { language: 'en-US', value: issuerName }
      },
      localizedProgramName: {
        defaultValue: { language: 'en-US', value: programName }
      },
      accountIdLabel,
      localizedAccountIdLabel: {
        defaultValue: { language: 'en-US', value: accountIdLabel }
      },
      accountNameLabel,
      localizedAccountNameLabel: {
        defaultValue: { language: 'en-US', value: accountNameLabel }
      },
      rewardsTierLabel,
      localizedRewardsTierLabel: {
        defaultValue: { language: 'en-US', value: rewardsTierLabel }
      },
      loyaltyPoints: {
        label: 'Points',
        localizedLabel: {
          defaultValue: { language: 'en-US', value: 'Points' }
        }
      }
    };

    // Add optional fields
    if (programLogoUrl) {
      classDefinition.programLogo = { sourceUri: { uri: programLogoUrl } };
      classDefinition.wideProgramLogo = { sourceUri: { uri: programLogoUrl } };
    }

    if (heroImageUrl) {
      classDefinition.heroImage = { sourceUri: { uri: heroImageUrl } };
    }

    if (textModules && textModules.length > 0) {
      classDefinition.textModulesData = textModules;
    }

    if (imageModules && imageModules.length > 0) {
      classDefinition.imageModulesData = imageModules;
    }

    if (linksModule && linksModule.uris && linksModule.uris.length > 0) {
      classDefinition.linksModuleData = linksModule;
    }

    if (merchantLocations && merchantLocations.length > 0) {
      classDefinition.locations = merchantLocations;
    }

    if (appLinkData) {
      classDefinition.appLinkData = appLinkData;
    }

    const result = await loyaltyClassService.createOrUpdateClass(classDefinition);

    if (result.success) {
      res.status(201).json({
        success: true,
        classId: result.classId,
        message: 'Loyalty class created successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        message: result.message
      });
    }

  } catch (error) {
    errorHandler.handleEndpointError(error, req, res, '/create-class');
  }
});

// Get loyalty class
app.get('/class/:classId', async (req, res) => {
  try {
    const { classId } = req.params;

    const result = await loyaltyClassService.getClass(classId);

    if (result.success) {
      res.json({
        success: true,
        class: result.data
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error,
        message: result.message
      });
    }

  } catch (error) {
    errorHandler.handleEndpointError(error, req, res, '/class/:classId');
  }
});

// List all loyalty classes
app.get('/classes', async (req, res) => {
  try {
    const result = await loyaltyClassService.listClasses();

    if (result.success) {
      res.json({
        success: true,
        classes: result.classes,
        count: result.count
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        message: result.message
      });
    }

  } catch (error) {
    errorHandler.handleEndpointError(error, req, res, '/classes');
  }
});

// =====================================
// Loyalty Object (Card) Management
// =====================================

// Create loyalty card
app.post('/create-card', async (req, res) => {
  try {
    const {
      classId,
      userId,
      memberName,
      points = 0,
      tier,
      barcodeType = 'QR_CODE',
      barcodeValue,
      validFrom,
      validUntil,
      accountId
    } = req.body;

    // Validation
    if (!classId) {
      return res.status(400).json({
        success: false,
        error: 'Class ID is required',
        message: 'Please provide a classId'
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
        message: 'Please provide a userId'
      });
    }

    if (!memberName) {
      return res.status(400).json({
        success: false,
        error: 'Member name is required',
        message: 'Please provide a memberName'
      });
    }

    // Generate object ID
    const objectId = `${classId.split('.')[0]}.${userId}`;

    // Calculate tier if not provided
    let calculatedTier = tier;
    if (!tier) {
      if (points >= 2000) calculatedTier = 'Gold';
      else if (points >= 500) calculatedTier = 'Silver';
      else calculatedTier = 'Bronze';
    }

    // Build loyalty object
    const loyaltyObject = {
      id: objectId,
      classId: classId,
      state: 'ACTIVE',
      accountId: accountId || userId,
      accountName: memberName,
      loyaltyPoints: {
        balance: {
          string: String(points)
        }
      },
      barcode: {
        type: barcodeType,
        value: barcodeValue || `MEMBER_${userId}`,
        alternateText: userId
      }
    };

    // Add tier
    loyaltyObject.secondaryLoyaltyPoints = {
      label: 'Tier',
      localizedLabel: {
        defaultValue: { language: 'en-US', value: 'Tier' }
      },
      balance: {
        string: calculatedTier
      }
    };

    // Add validity dates if provided
    if (validFrom || validUntil) {
      loyaltyObject.validTimeInterval = {};
      if (validFrom) {
        loyaltyObject.validTimeInterval.start = { date: validFrom };
      }
      if (validUntil) {
        loyaltyObject.validTimeInterval.end = { date: validUntil };
      }
    }

    // Create object in Google Wallet
    // Call Google Wallet API directly instead of using createObject
    const googleWalletAuth = require('./auth/google-wallet-auth');
    const retry = require('./utils/retry');

    const result = await retry.retryGoogleApi(
      async () => {
        const client = await googleWalletAuth.getClient();
        return await client.loyaltyobject.insert({
          requestBody: loyaltyObject
        });
      },
      {
        operation: 'createLoyaltyObject',
        objectId: objectId,
        userId: userId
      }
    );

    // Generate Save to Wallet URL
    const saveUrlResult = jwtService.generateSaveToWalletURL(loyaltyObject);

    res.status(201).json({
      success: true,
      objectId: objectId,
      classId: classId,
      userId: userId,
      memberName: memberName,
      points: points,
      tier: calculatedTier,
      saveUrl: saveUrlResult.saveUrl,
      message: 'Loyalty card created successfully'
    });

  } catch (error) {
    errorHandler.handleEndpointError(error, req, res, '/create-card');
  }
});

// Get loyalty object
app.get('/object/:objectId', async (req, res) => {
  try {
    const { objectId } = req.params;

    const result = await loyaltyObjectService.getObject(objectId);

    if (result.success) {
      res.json({
        success: true,
        object: result.data
      });
    } else {
      res.status(404).json({
        success: false,
        error: result.error,
        message: result.message
      });
    }

  } catch (error) {
    errorHandler.handleEndpointError(error, req, res, '/object/:objectId');
  }
});

// List all loyalty objects
app.get('/objects', async (req, res) => {
  try {
    const result = await loyaltyObjectService.listObjects();

    if (result.success) {
      res.json({
        success: true,
        objects: result.objects,
        count: result.count
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
        message: result.message
      });
    }

  } catch (error) {
    errorHandler.handleEndpointError(error, req, res, '/objects');
  }
});

// Update points
app.post('/update-points/:objectId', async (req, res) => {
  try {
    const { objectId } = req.params;
    const { points, tier } = req.body;

    if (points === undefined || points === null) {
      return res.status(400).json({
        success: false,
        error: 'Points value is required',
        message: 'Please provide a points value'
      });
    }

    // Calculate tier if not provided
    let calculatedTier = tier;
    if (!tier) {
      if (points >= 2000) calculatedTier = 'Gold';
      else if (points >= 500) calculatedTier = 'Silver';
      else calculatedTier = 'Bronze';
    }

    // Get current object
    const getResult = await loyaltyObjectService.getObject(objectId);
    if (!getResult.success) {
      return res.status(404).json({
        success: false,
        error: 'Object not found',
        message: `Loyalty object ${objectId} not found`
      });
    }

    // Update object
    const updatedObject = {
      ...getResult.data,
      loyaltyPoints: {
        balance: {
          string: String(points)
        }
      },
      secondaryLoyaltyPoints: {
        label: 'Tier',
        localizedLabel: {
          defaultValue: { language: 'en-US', value: 'Tier' }
        },
        balance: {
          string: calculatedTier
        }
      }
    };

    const result = await loyaltyObjectService.updateObject(objectId, updatedObject);

    if (result.success) {
      res.json({
        success: true,
        objectId: objectId,
        points: points,
        tier: calculatedTier,
        message: 'Points updated successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        message: result.message
      });
    }

  } catch (error) {
    errorHandler.handleEndpointError(error, req, res, '/update-points/:objectId');
  }
});

// =====================================
// Push Notifications
// =====================================

// Send notification
app.post('/send-notification/:objectId', async (req, res) => {
  try {
    const { objectId } = req.params;
    const { header, body, footer } = req.body;

    if (!body) {
      return res.status(400).json({
        success: false,
        error: 'Message body is required',
        message: 'Please provide a message body'
      });
    }

    // Get current object
    const getResult = await loyaltyObjectService.getObject(objectId);
    if (!getResult.success) {
      return res.status(404).json({
        success: false,
        error: 'Object not found',
        message: `Loyalty object ${objectId} not found`
      });
    }

    const currentObject = getResult.data;

    // Add or update message
    const message = {
      header: header || 'Notification',
      body: body,
      localizedHeader: {
        defaultValue: { language: 'en-US', value: header || 'Notification' }
      },
      localizedBody: {
        defaultValue: { language: 'en-US', value: body }
      }
    };

    if (footer) {
      message.localizedFooter = {
        defaultValue: { language: 'en-US', value: footer }
      };
    }

    const updatedObject = {
      ...currentObject,
      messages: [message]
    };

    const result = await loyaltyObjectService.updateObject(objectId, updatedObject);

    if (result.success) {
      res.json({
        success: true,
        objectId: objectId,
        message: 'Notification sent successfully',
        notification: {
          header: header || 'Notification',
          body: body,
          footer: footer
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
        message: result.message
      });
    }

  } catch (error) {
    errorHandler.handleEndpointError(error, req, res, '/send-notification/:objectId');
  }
});

// =====================================
// JWT / Save to Wallet
// =====================================

// Generate Save to Wallet URL
app.post('/get-save-url', async (req, res) => {
  try {
    const { objectId } = req.body;

    if (!objectId) {
      return res.status(400).json({
        success: false,
        error: 'Object ID is required',
        message: 'Please provide an objectId'
      });
    }

    // Get object from Google Wallet
    const getResult = await loyaltyObjectService.getObject(objectId);
    if (!getResult.success) {
      return res.status(404).json({
        success: false,
        error: 'Object not found',
        message: `Loyalty object ${objectId} not found`
      });
    }

    // Generate JWT
    const jwt = jwtService.generateJWT({
      iss: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      aud: 'google',
      typ: 'savetowallet',
      payload: {
        loyaltyObjects: [getResult.data]
      }
    });

    const saveUrl = `https://pay.google.com/gp/v/save/${jwt}`;

    res.json({
      success: true,
      objectId: objectId,
      saveUrl: saveUrl,
      message: 'Save URL generated successfully'
    });

  } catch (error) {
    errorHandler.handleEndpointError(error, req, res, '/get-save-url');
  }
});

// =====================================
// Error Handling
// =====================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} not found`,
    availableEndpoints: 'GET /api for documentation'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred'
      : err.message
  });
});

// =====================================
// Start Server
// =====================================

app.listen(PORT, async () => {
  console.log(`\n🚀 Google Wallet Loyalty Card API v2.0.0`);
  console.log(`📡 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\n📖 Endpoints:`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   API docs: http://localhost:${PORT}/api`);
  console.log(`   Root: http://localhost:${PORT}/`);
  console.log(`\n🔒 CORS allowed origins:`);
  console.log(`   ${process.env.NODE_ENV === 'production' ? 'Production URLs only' : 'Development + Production URLs'}`);

  // Validate environment on startup
  const validation = validateEnvironment();
  logValidationResults(validation);

  // Initialize Google Wallet authentication
  try {
    const authTest = await googleWalletAuth.testConnection();
    if (authTest.success) {
      console.log(`\n✅ Google Wallet API: Connected`);
      console.log(`   Issuer ID: ${process.env.ISSUER_ID}`);
      console.log(`   Classes found: ${authTest.classCount || 0}`);
    } else {
      console.error(`\n❌ Google Wallet API: ${authTest.message}`);
    }
  } catch (error) {
    console.error(`\n❌ Google Wallet API Error: ${error.message}`);
  }

  console.log(`\n✨ API ready for requests\n`);
});

module.exports = app;
