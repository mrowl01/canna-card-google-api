const loyaltyObjectService = require('./loyalty-object');
const logger = require('../utils/logger');

class NotificationService {
  constructor() {
    // Stateless - no rate limiting (frontend should handle if needed)
  }

  // Check if user can receive notifications (always allowed in stateless mode)
  async canSendNotification(userId) {
    // No database, no rate limiting - always allow
    return {
      allowed: true,
      remaining: 999, // Unlimited
      count: 0
    };
  }

  // Record notification sent (no-op in stateless mode)
  async recordNotificationSent(userId, type, message, data, silent) {
    // No database - just log for debugging
    logger.info('Notification sent (not recorded)', { userId, type, message: message.substring(0, 50) });
    return { success: true };
  }

  // Create notification message templates
  getMessageTemplate(type, data = {}) {
    const templates = {
      POINTS_EARNED: {
        header: 'Points Earned! 🎉',
        body: `You earned ${data.points} points! ${data.reason || 'Thank you for your loyalty.'}`,
        footerText: 'Total: ' + (data.newBalance || 0) + ' points'
      },
      POINTS_REDEEMED: {
        header: 'Points Redeemed ✅',
        body: `You redeemed ${data.points} points! ${data.reason || 'Enjoy your reward!'}`,
        footerText: 'Remaining: ' + (data.newBalance || 0) + ' points'
      },
      TIER_UPGRADE: {
        header: 'Tier Upgrade! 🏆',
        body: `Congratulations! You've been upgraded to ${data.newTier} tier. Enjoy your new benefits!`,
        footerText: 'Keep earning for more rewards'
      },
      WELCOME: {
        header: data.header || 'Welcome! 👋',
        body: data.body || 'Your loyalty card is ready! Start earning points with every purchase.',
        footerText: 'Start your rewards journey today'
      },
      CUSTOM: {
        header: data.header || 'Teiga Tech Rewards',
        body: data.body || 'You have a new update!',
        footerText: data.footer || 'Thank you for your loyalty'
      },
      TRANSFER_RECEIVED: {
        header: 'Points Received! 💝',
        body: `You received ${data.points} points from a friend! ${data.reason || 'Lucky you!'}`,
        footerText: 'Total: ' + (data.newBalance || 0) + ' points'
      },
      BALANCE_UPDATE: {
        header: 'Balance Updated 📊',
        body: `Your points balance has been updated. New balance: ${data.newBalance} points`,
        footerText: 'Keep earning rewards!'
      }
    };

    return templates[type] || templates.CUSTOM;
  }

  // Send notification to a single user
  async sendNotification(userId, type, data = {}, silent = false) {
    try {
      // Check rate limiting unless it's a silent update
      if (!silent) {
        const rateLimitCheck = await this.canSendNotification(userId);
        if (!rateLimitCheck.allowed) {
          return {
            success: false,
            error: 'Rate limit exceeded',
            message: `User has reached daily notification limit (${this.maxNotificationsPerDay}/day)`,
            remaining: rateLimitCheck.remaining
          };
        }
      }

      // Check if user has a loyalty card in database
      const card = await dbService.getCard(userId);
      if (!card) {
        return {
          success: false,
          error: 'User not found',
          message: 'User does not have a loyalty card'
        };
      }

      // Get message template
      const messageTemplate = this.getMessageTemplate(type, data);

      // Create message with proper Google Wallet structure
      const message = {
        header: messageTemplate.header,
        body: messageTemplate.body,
        messageType: silent ? 'TEXT' : 'TEXT_AND_NOTIFY'  // This triggers push notification
      };

      // Send notification via Google Wallet addMessage API
      const updateResult = await loyaltyObjectService.addMessage(
        card.object_id,
        message
      );

      if (updateResult.success) {
        // Record notification in database
        await this.recordNotificationSent(userId, type, messageTemplate.body, data, silent);

        const remaining = silent ? null : (await this.canSendNotification(userId)).remaining;

        logger.info('Notification Sent Successfully', {
          userId,
          type,
          silent,
          remaining
        });

        return {
          success: true,
          userId: userId,
          type: type,
          notificationMessage: messageTemplate.body,
          silent: silent,
          remainingNotifications: remaining,
          message: 'Notification sent successfully'
        };
      } else {
        logger.warn('Notification Send Failed', {
          userId,
          type,
          error: updateResult.error
        });
        return updateResult;
      }

    } catch (error) {
      logger.error('Failed to Send Notification', {
        error: error.message,
        stack: error.stack,
        userId,
        type
      });
      return {
        success: false,
        error: error.message,
        message: 'Failed to send notification'
      };
    }
  }

  // Send batch notifications to multiple users
  async sendBatchNotification(userIds, type, data = {}, silent = false) {
    try {
      const results = [];
      const successful = [];
      const failed = [];

      logger.info('Sending Batch Notification', {
        userCount: userIds.length,
        type,
        silent
      });

      // Send notifications concurrently with Promise.allSettled
      const promises = userIds.map(userId =>
        this.sendNotification(userId, type, data, silent)
      );

      const settledResults = await Promise.allSettled(promises);

      // Process results
      settledResults.forEach((result, index) => {
        const userId = userIds[index];

        if (result.status === 'fulfilled' && result.value.success) {
          successful.push({
            userId: userId,
            result: result.value
          });
        } else {
          failed.push({
            userId: userId,
            error: result.status === 'fulfilled' ? result.value.error : result.reason.message,
            result: result.status === 'fulfilled' ? result.value : null
          });
        }

        results.push({
          userId: userId,
          success: result.status === 'fulfilled' && result.value.success,
          result: result.status === 'fulfilled' ? result.value : { error: result.reason.message }
        });
      });

      logger.info('Batch Notification Completed', {
        totalSent: userIds.length,
        successful: successful.length,
        failed: failed.length,
        type
      });

      return {
        success: true,
        totalSent: userIds.length,
        successful: successful.length,
        failed: failed.length,
        results: results,
        successfulUsers: successful,
        failedUsers: failed,
        message: `Batch notification completed: ${successful.length}/${userIds.length} successful`
      };

    } catch (error) {
      logger.error('Failed to Send Batch Notification', {
        error: error.message,
        stack: error.stack,
        userCount: userIds.length,
        type
      });
      return {
        success: false,
        error: error.message,
        message: 'Failed to send batch notification'
      };
    }
  }

  // Get notification history for a user
  getNotificationHistory(userId) {
    const userHistory = this.notificationHistory.get(userId) || [];
    const rateLimitInfo = this.canSendNotification(userId);

    return {
      success: true,
      userId: userId,
      notificationCount: userHistory.length,
      notifications: userHistory.map(timestamp => ({
        timestamp: timestamp,
        date: new Date(timestamp).toISOString()
      })),
      rateLimit: {
        maxPerDay: this.maxNotificationsPerDay,
        remaining: rateLimitInfo.remaining,
        resetTime: rateLimitInfo.resetTime,
        canSend: rateLimitInfo.allowed
      },
      message: 'Notification history retrieved successfully'
    };
  }

  // Send welcome notification to new users
  async sendWelcomeNotification(userId) {
    return await this.sendNotification(userId, 'WELCOME', {}, false);
  }

  // Send points notification with automatic type detection
  async sendPointsNotification(userId, pointsChange, newBalance, reason = '') {
    const type = pointsChange > 0 ? 'POINTS_EARNED' : 'POINTS_REDEEMED';
    const points = Math.abs(pointsChange);

    return await this.sendNotification(userId, type, {
      points: points,
      newBalance: newBalance,
      reason: reason
    });
  }

  // Send tier upgrade notification
  async sendTierUpgradeNotification(userId, newTier, oldTier) {
    return await this.sendNotification(userId, 'TIER_UPGRADE', {
      newTier: newTier,
      oldTier: oldTier
    });
  }

  // Send transfer notification
  async sendTransferNotification(userId, points, newBalance, reason = '') {
    return await this.sendNotification(userId, 'TRANSFER_RECEIVED', {
      points: points,
      newBalance: newBalance,
      reason: reason
    });
  }

  // Silent balance update (no push notification)
  async sendSilentUpdate(userId, newBalance) {
    return await this.sendNotification(userId, 'BALANCE_UPDATE', {
      newBalance: newBalance
    }, true);
  }
}

module.exports = new NotificationService();