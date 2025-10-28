const googleWalletAuth = require('../auth/google-wallet-auth');
const logger = require('../utils/logger');
const retry = require('../utils/retry');

class LoyaltyClassService {
  constructor() {
    this.issuerId = process.env.ISSUER_ID;
    this.classSuffix = process.env.CLASS_SUFFIX;
  }

  // Generate class ID
  generateClassId(customSuffix = null) {
    const suffix = customSuffix || this.classSuffix;
    return `${this.issuerId}.${suffix}`;
  }

  // Create Teiga Tech loyalty class definition
  createClassDefinition(options = {}) {
    const {
      programName = process.env.PROGRAM_NAME || "Teiga Tech Rewards",
      logoUrl = process.env.PROGRAM_LOGO_URL || "https://example.com/logo.png",
      brandColor = process.env.BRAND_COLOR || "#1976D2",
      backgroundColor = process.env.BACKGROUND_COLOR || "#FFFFFF",
      classSuffix = this.classSuffix
    } = options;

    const classId = this.generateClassId(classSuffix);

    return {
      id: classId,
      issuerName: "Teiga Tech",
      programName: programName,
      programLogo: {
        sourceUri: {
          uri: logoUrl
        }
      },
      wideProgramLogo: {
        sourceUri: {
          uri: logoUrl
        }
      },
      hexBackgroundColor: brandColor,
      localizedProgramName: {
        defaultValue: {
          language: "en-US",
          value: programName
        }
      },
      localizedIssuerName: {
        defaultValue: {
          language: "en-US",
          value: "Teiga Tech"
        }
      },
      loyaltyPoints: {
        label: "Points",
        localizedLabel: {
          defaultValue: {
            language: "en-US",
            value: "Points"
          }
        }
      },
      rewardsTier: "Bronze",
      localizedRewardsTier: {
        defaultValue: {
          language: "en-US",
          value: "Member Tier"
        }
      },
      accountNameLabel: "Member Name",
      localizedAccountNameLabel: {
        defaultValue: {
          language: "en-US",
          value: "Member Name"
        }
      },
      accountIdLabel: "Member ID",
      localizedAccountIdLabel: {
        defaultValue: {
          language: "en-US",
          value: "Member ID"
        }
      },
      messages: [
        {
          header: "Welcome to Teiga Tech Rewards!",
          body: "Start earning points with every purchase and unlock exclusive benefits.",
          localizedHeader: {
            defaultValue: {
              language: "en-US",
              value: "Welcome to Teiga Tech Rewards!"
            }
          },
          localizedBody: {
            defaultValue: {
              language: "en-US",
              value: "Start earning points with every purchase and unlock exclusive benefits."
            }
          }
        }
      ],
      reviewStatus: "UNDER_REVIEW",
      allowMultipleUsersPerObject: false
    };
  }

  // Create loyalty class via Google Wallet API
  async createClass(classDefinition) {
    try {
      logger.info('Creating Loyalty Class', {
        classId: classDefinition.id,
        programName: classDefinition.programName,
        hasClassTemplateInfo: !!classDefinition.classTemplateInfo,
        cardRowCount: classDefinition.classTemplateInfo?.cardTemplateOverride?.cardRowTemplateInfos?.length
      });

      const result = await retry.retryGoogleApi(
        async () => {
          const client = await googleWalletAuth.getClient();
          return await client.loyaltyclass.insert({
            requestBody: classDefinition
          });
        },
        {
          operation: 'createLoyaltyClass',
          classId: classDefinition.id
        }
      );

      logger.info('Loyalty Class Created Successfully', {
        classId: result.data.id
      });

      return {
        success: true,
        classId: result.data.id,
        data: result.data,
        message: 'Loyalty class created successfully'
      };

    } catch (error) {
      const errorDetails = logger.googleApiError(error, {
        operation: 'createLoyaltyClass',
        classId: classDefinition.id
      });

      // Handle specific Google API errors
      if (error.code === 409) {
        return {
          success: false,
          error: 'Class already exists',
          message: 'A loyalty class with this ID already exists',
          classId: classDefinition.id
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

  // Get existing loyalty class
  async getClass(classId) {
    try {
      const result = await retry.retryGoogleApi(
        async () => {
          const client = await googleWalletAuth.getClient();
          return await client.loyaltyclass.get({
            resourceId: classId
          });
        },
        {
          operation: 'getLoyaltyClass',
          classId
        }
      );

      return {
        success: true,
        data: result.data,
        message: 'Loyalty class retrieved successfully'
      };

    } catch (error) {
      const errorDetails = logger.googleApiError(error, {
        operation: 'getLoyaltyClass',
        classId
      });

      if (error.code === 404) {
        return {
          success: false,
          error: 'Class not found',
          message: 'Loyalty class does not exist'
        };
      }

      return {
        success: false,
        error: errorDetails.type,
        message: errorDetails.userMessage
      };
    }
  }

  // List all loyalty classes for this issuer
  async listClasses() {
    try {
      const result = await retry.retryGoogleApi(
        async () => {
          const client = await googleWalletAuth.getClient();
          return await client.loyaltyclass.list({
            issuerId: this.issuerId
          });
        },
        {
          operation: 'listLoyaltyClasses',
          issuerId: this.issuerId
        }
      );

      return {
        success: true,
        classes: result.data.resources || [],
        count: result.data.resources ? result.data.resources.length : 0,
        message: 'Loyalty classes retrieved successfully'
      };

    } catch (error) {
      const errorDetails = logger.googleApiError(error, {
        operation: 'listLoyaltyClasses',
        issuerId: this.issuerId
      });

      return {
        success: false,
        error: errorDetails.type,
        message: errorDetails.userMessage
      };
    }
  }

  // Update existing loyalty class
  async updateClass(classId, updates) {
    try {
      const result = await retry.retryGoogleApi(
        async () => {
          const client = await googleWalletAuth.getClient();
          return await client.loyaltyclass.update({
            resourceId: classId,
            requestBody: updates
          });
        },
        {
          operation: 'updateLoyaltyClass',
          classId
        }
      );

      logger.info('Loyalty Class Updated Successfully', {
        classId: result.data.id
      });

      return {
        success: true,
        classId: result.data.id,
        data: result.data,
        message: 'Loyalty class updated successfully'
      };

    } catch (error) {
      const errorDetails = logger.googleApiError(error, {
        operation: 'updateLoyaltyClass',
        classId
      });

      return {
        success: false,
        error: errorDetails.type,
        message: errorDetails.userMessage,
        details: error.response?.data || error
      };
    }
  }

  // Patch existing loyalty class (partial update)
  async patchClass(classId, updates) {
    try {
      const result = await retry.retryGoogleApi(
        async () => {
          const client = await googleWalletAuth.getClient();
          return await client.loyaltyclass.patch({
            resourceId: classId,
            requestBody: updates
          });
        },
        {
          operation: 'patchLoyaltyClass',
          classId
        }
      );

      logger.info('Loyalty Class Patched Successfully', {
        classId: result.data.id
      });

      return {
        success: true,
        classId: result.data.id,
        data: result.data,
        message: 'Loyalty class patched successfully'
      };

    } catch (error) {
      const errorDetails = logger.googleApiError(error, {
        operation: 'patchLoyaltyClass',
        classId
      });

      return {
        success: false,
        error: errorDetails.type,
        message: errorDetails.userMessage,
        details: error.response?.data || error
      };
    }
  }

  // Create or update loyalty class (tries create first, updates if exists)
  async createOrUpdateClass(classDefinition) {
    try {
      // Try to create first
      const createResult = await this.createClass(classDefinition);

      // If creation successful, return
      if (createResult.success) {
        return createResult;
      }

      // If class already exists (409), update instead
      if (createResult.error === 'Class already exists') {
        logger.info('Class exists, updating instead', { classId: classDefinition.id });
        return await this.updateClass(classDefinition.id, classDefinition);
      }

      // Other error, return it
      return createResult;

    } catch (error) {
      logger.error('Error in createOrUpdateClass', { error: error.message });
      return {
        success: false,
        error: 'Internal error',
        message: error.message
      };
    }
  }
}

module.exports = new LoyaltyClassService();