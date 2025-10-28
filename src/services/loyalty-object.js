const googleWalletAuth = require('../auth/google-wallet-auth');
const jwtService = require('./jwt-service');
const logger = require('../utils/logger');
const retry = require('../utils/retry');

class LoyaltyObjectService {
  constructor() {
    this.issuerId = process.env.ISSUER_ID;
    this.objectSuffix = process.env.OBJECT_SUFFIX;
    this.classSuffix = process.env.CLASS_SUFFIX;
  }

  // Generate unique object ID for a user
  generateObjectId(userId) {
    return `${this.issuerId}.${this.objectSuffix}-${userId}`;
  }

  // Generate class ID
  generateClassId() {
    return `${this.issuerId}.${this.classSuffix}`;
  }

  // Create loyalty object definition
  createObjectDefinition(userId, options = {}) {
    const {
      classId = this.generateClassId(),
      points = 0,
      tier = 'Bronze',
      memberName = `Member ${userId}`,
      memberSince = new Date().toISOString().split('T')[0],
      state = 'ACTIVE',
      barcode,
      template,
      label_4_value,
      label_5_value
    } = options;

    const objectId = this.generateObjectId(userId);

    const nextRewardPoints = this.getNextReward(points, tier);

    // Prepare text modules - MUST include card front fields with these IDs
    const textModulesData = [
      {
        header: 'Name',
        body: memberName,
        id: 'card_name'
      },
      {
        header: 'Points',
        body: points.toString(),
        id: 'card_points'
      },
      {
        header: 'Tier',
        body: tier,
        id: 'card_tier'
      },
      {
        header: 'Next Reward',
        body: `${nextRewardPoints} pts`,
        id: 'card_next_reward'
      },
      {
        header: 'Member Since',
        body: memberSince,
        id: 'member_since'
      },
      {
        header: 'Tier Benefits',
        body: this.getTierBenefits(tier),
        id: 'tier_benefits'
      }
    ];

    return {
      id: objectId,
      classId: classId,
      state: state,
      loyaltyPoints: {
        label: 'Points',
        balance: {
          string: points.toString()
        }
      },
      rewardsTier: tier,
      secondaryRewardsTier: `${nextRewardPoints} pts`,
      accountName: memberName,
      accountId: userId,
      textModulesData,
      barcode: barcode ? {
        type: barcode.type || 'QR_CODE',
        value: barcode.value || `LOYALTY_${userId}_${Date.now()}`,
        alternateText: `Member ID: ${userId}`
      } : {
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
      hasUsers: true,
      smartTapRedemptionValue: points.toString(),
      enableSmartTap: true
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

  // Calculate next reward points needed
  getNextReward(currentPoints, tier) {
    if (tier === 'Gold' || currentPoints >= 2000) {
      // Already at max tier, show next milestone
      const nextMilestone = Math.ceil(currentPoints / 1000) * 1000;
      return nextMilestone > currentPoints ? nextMilestone : currentPoints + 1000;
    } else if (tier === 'Silver' || currentPoints >= 500) {
      // Next tier is Gold at 2000 points
      return 2000;
    } else {
      // Next tier is Silver at 500 points
      return 500;
    }
  }

  // Create loyalty object via Google Wallet API
  async createObject(userId, options = {}) {
    try {
      const objectDefinition = this.createObjectDefinition(userId, options);

      logger.info('Creating Loyalty Object', {
        objectId: objectDefinition.id,
        userId,
        points: options.points || 0,
        tier: options.tier || 'Bronze'
      });

      const result = await retry.retryGoogleApi(
        async () => {
          const client = await googleWalletAuth.getClient();
          return await client.loyaltyobject.insert({
            requestBody: objectDefinition
          });
        },
        {
          operation: 'createLoyaltyObject',
          objectId: objectDefinition.id,
          userId
        }
      );

      logger.info('Loyalty Object Created Successfully', {
        objectId: result.data.id,
        userId
      });

      return {
        success: true,
        objectId: result.data.id,
        userId: userId,
        data: result.data,
        message: 'Loyalty object created successfully'
      };

    } catch (error) {
      const errorDetails = logger.googleApiError(error, {
        operation: 'createLoyaltyObject',
        userId
      });

      // Handle specific Google API errors
      if (error.code === 409) {
        return {
          success: false,
          error: 'Object already exists',
          message: 'A loyalty object with this ID already exists',
          objectId: this.generateObjectId(userId)
        };
      }

      return {
        success: false,
        error: errorDetails.type,
        message: errorDetails.userMessage,
        details: error.response?.data || error
      };
    }
  }

  // Get existing loyalty object
  async getObject(objectId) {
    try {
      const result = await retry.retryGoogleApi(
        async () => {
          const client = await googleWalletAuth.getClient();
          return await client.loyaltyobject.get({
            resourceId: objectId
          });
        },
        {
          operation: 'getLoyaltyObject',
          objectId
        }
      );

      return {
        success: true,
        data: result.data,
        message: 'Loyalty object retrieved successfully'
      };

    } catch (error) {
      const errorDetails = logger.googleApiError(error, {
        operation: 'getLoyaltyObject',
        objectId
      });

      if (error.code === 404) {
        return {
          success: false,
          error: 'Object not found',
          message: 'Loyalty object does not exist'
        };
      }

      return {
        success: false,
        error: errorDetails.type,
        message: errorDetails.userMessage
      };
    }
  }

  // Add message with push notification
  async addMessage(objectId, message) {
    try {
      logger.info('Adding Message to Loyalty Object', {
        objectId,
        messageType: message.messageType,
        header: message.header
      });

      const result = await retry.retryGoogleApi(
        async () => {
          const client = await googleWalletAuth.getClient();
          return await client.loyaltyobject.addmessage({
            resourceId: objectId,
            requestBody: {
              message: message
            }
          });
        },
        {
          operation: 'addMessageToLoyaltyObject',
          objectId
        }
      );

      logger.info('Message Added Successfully', {
        objectId: result.data.id
      });

      return {
        success: true,
        objectId: result.data.id,
        data: result.data,
        message: 'Message added successfully'
      };

    } catch (error) {
      const errorDetails = logger.googleApiError(error, {
        operation: 'addMessageToLoyaltyObject',
        objectId
      });

      if (error.code === 404) {
        return {
          success: false,
          error: 'Object not found',
          message: 'Loyalty object does not exist'
        };
      }

      return {
        success: false,
        error: errorDetails.type,
        message: errorDetails.userMessage
      };
    }
  }

  // Update loyalty object (using PATCH for partial updates)
  async updateObject(objectId, updates) {
    try {
      logger.info('Updating Loyalty Object', {
        objectId,
        updates: {
          points: updates.loyaltyPoints?.balance?.string,
          tier: updates.rewardsTier,
          notifyPreference: updates.notifyPreference
        }
      });

      const result = await retry.retryGoogleApi(
        async () => {
          const client = await googleWalletAuth.getClient();
          return await client.loyaltyobject.patch({
            resourceId: objectId,
            requestBody: updates
          });
        },
        {
          operation: 'updateLoyaltyObject',
          objectId
        }
      );

      logger.info('Loyalty Object Updated Successfully', {
        objectId: result.data.id
      });

      return {
        success: true,
        objectId: result.data.id,
        data: result.data,
        message: 'Loyalty object updated successfully'
      };

    } catch (error) {
      const errorDetails = logger.googleApiError(error, {
        operation: 'updateLoyaltyObject',
        objectId
      });

      if (error.code === 404) {
        return {
          success: false,
          error: 'Object not found',
          message: 'Loyalty object does not exist'
        };
      }

      return {
        success: false,
        error: errorDetails.type,
        message: errorDetails.userMessage
      };
    }
  }

  // Update points for a user's loyalty object
  async updatePoints(userId, newPoints, tier) {
    try {
      const objectId = this.generateObjectId(userId);

      // First, get current object to preserve existing textModulesData
      const currentObj = await this.getObject(objectId);
      if (!currentObj.success) {
        return currentObj;
      }

      // Find and update the card_points module in textModulesData
      const textModules = currentObj.data.textModulesData || [];
      const updatedTextModules = textModules.map(module => {
        if (module.id === 'card_points') {
          return { ...module, body: newPoints.toString() };
        }
        return module;
      });

      // Update BOTH loyaltyPoints balance AND textModulesData for card display
      // Per Google Wallet docs, PATCH updates specific fields without overwriting others
      const updates = {
        loyaltyPoints: {
          label: 'Points',
          balance: {
            string: newPoints.toString()
          }
        },
        textModulesData: updatedTextModules,
        notifyPreference: 'notifyOnUpdate'  // Triggers field-update push notification
        // NOTE: Do NOT include smartTapRedemptionValue - causes "multiple balance types" error
      };

      return await this.updateObject(objectId, updates);

    } catch (error) {
      logger.error('Failed to Update Points', {
        error: error.message,
        userId,
        newPoints
      });
      return {
        success: false,
        error: error.message,
        message: 'Failed to update points'
      };
    }
  }

  // Update tier for a user's loyalty object
  async updateTier(userId, newTier) {
    try {
      const objectId = this.generateObjectId(userId);

      // First get the current object
      const currentObject = await this.getObject(objectId);

      if (!currentObject.success) {
        return currentObject;
      }

      // Update tier and benefits with push notification
      const updates = {
        ...currentObject.data,
        rewardsTier: newTier,
        textModulesData: [
          {
            header: 'Member Since',
            body: currentObject.data.textModulesData?.find(t => t.header === 'Member Since')?.body || new Date().toISOString().split('T')[0],
            id: 'member_since'
          },
          {
            header: 'Tier Benefits',
            body: this.getTierBenefits(newTier),
            id: 'tier_benefits'
          }
        ],
        notifyPreference: 'notifyOnUpdate'  // Triggers push notification for field update
      };

      return await this.updateObject(objectId, updates);

    } catch (error) {
      logger.error('Failed to Update Tier', {
        error: error.message,
        userId,
        newTier
      });
      return {
        success: false,
        error: error.message,
        message: 'Failed to update tier'
      };
    }
  }

  // List loyalty objects for this issuer
  async listObjects() {
    try {
      const result = await retry.retryGoogleApi(
        async () => {
          const client = await googleWalletAuth.getClient();
          return await client.loyaltyobject.list({
            classId: this.generateClassId()
          });
        },
        {
          operation: 'listLoyaltyObjects',
          classId: this.generateClassId()
        }
      );

      return {
        success: true,
        objects: result.data.resources || [],
        count: result.data.resources ? result.data.resources.length : 0,
        message: 'Loyalty objects retrieved successfully'
      };

    } catch (error) {
      const errorDetails = logger.googleApiError(error, {
        operation: 'listLoyaltyObjects',
        classId: this.generateClassId()
      });

      return {
        success: false,
        error: errorDetails.type,
        message: errorDetails.userMessage
      };
    }
  }

  // Create object and generate save URL in one call
  async createObjectWithSaveUrl(userId, options = {}) {
    try {
      // Create the object in Google Wallet
      const createResult = await this.createObject(userId, options);

      if (!createResult.success) {
        // If object already exists, that's okay - we can still generate save URL
        if (createResult.error !== 'Object already exists') {
          return createResult;
        }
      }

      // Generate save URL using JWT service
      const jwtResult = jwtService.createUserWalletPass(userId, options);

      if (jwtResult.success) {
        return {
          success: true,
          userId: userId,
          objectId: this.generateObjectId(userId),
          classId: this.generateClassId(),
          jwt: jwtResult.jwt,
          saveUrl: jwtResult.saveUrl,
          objectCreated: createResult.success,
          message: 'Loyalty object and save URL created successfully'
        };
      } else {
        return jwtResult;
      }

    } catch (error) {
      logger.error('Failed to Create Object with Save URL', {
        error: error.message,
        userId
      });
      return {
        success: false,
        error: error.message,
        message: 'Failed to create object with save URL'
      };
    }
  }

  // Check if user has loyalty object
  async checkUserObject(userId) {
    const objectId = this.generateObjectId(userId);
    const result = await this.getObject(objectId);

    return {
      success: true,
      userId: userId,
      objectId: objectId,
      exists: result.success,
      data: result.success ? result.data : null,
      message: result.success ? 'User has loyalty object' : 'User does not have loyalty object'
    };
  }
}

module.exports = new LoyaltyObjectService();