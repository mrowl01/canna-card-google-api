const loyaltyObjectService = require('./loyalty-object');
const dbService = require('../database/db-service');

class PointsManager {
  constructor() {
    // Using Supabase instead of in-memory storage
  }

  // Add transaction to database
  async addTransaction(userId, transactionType, points, reason, balanceBefore, balanceAfter, relatedUserId = null) {
    return await dbService.createTransaction(
      userId,
      transactionType,
      points,
      reason,
      balanceBefore,
      balanceAfter,
      relatedUserId
    );
  }

  // Get transaction history for a user
  async getTransactionHistory(userId, limit = 50) {
    return await dbService.getTransactionHistory(userId, limit);
  }

  // Add points to user account
  async addPoints(userId, points, reason = 'Points added', metadata = {}) {
    try {
      // Get card from database
      const card = await dbService.getCard(userId);

      if (!card) {
        return {
          success: false,
          error: 'User card not found',
          message: 'User must have a loyalty card before adding points'
        };
      }

      const currentPoints = card.points || 0;
      const newPoints = currentPoints + points;

      // Validate points
      if (points <= 0) {
        return {
          success: false,
          error: 'Invalid points amount',
          message: 'Points to add must be greater than 0'
        };
      }

      if (newPoints > 999999) {
        return {
          success: false,
          error: 'Points limit exceeded',
          message: 'Total points cannot exceed 999,999'
        };
      }

      // Determine new tier based on points
      let newTier = card.tier;
      if (newPoints >= 2000) newTier = 'Gold';
      else if (newPoints >= 500) newTier = 'Silver';
      else newTier = 'Bronze';

      // Update points in Google Wallet (pass tier for front card display)
      const updateResult = await loyaltyObjectService.updatePoints(userId, newPoints, newTier);

      if (updateResult.success) {
        // Update in database
        await dbService.updateCardPoints(userId, newPoints, newTier);

        // Record transaction
        await this.addTransaction(userId, 'add', points, reason, currentPoints, newPoints);

        return {
          success: true,
          userId: userId,
          pointsAdded: points,
          previousBalance: currentPoints,
          newBalance: newPoints,
          newTier: newTier,
          tierUpgraded: newTier !== card.tier,
          message: `Successfully added ${points} points`
        };
      } else {
        return updateResult;
      }

    } catch (error) {
      console.error('❌ Failed to add points:', error.message);
      return {
        success: false,
        error: error.message,
        message: 'Failed to add points'
      };
    }
  }

  // Redeem/subtract points from user account
  async redeemPoints(userId, points, reason = 'Points redeemed', metadata = {}) {
    try {
      // Get card from database
      const card = await dbService.getCard(userId);

      if (!card) {
        return {
          success: false,
          error: 'User card not found',
          message: 'User must have a loyalty card before redeeming points'
        };
      }

      const currentPoints = card.points || 0;
      const newPoints = currentPoints - points;

      // Validate points
      if (points <= 0) {
        return {
          success: false,
          error: 'Invalid points amount',
          message: 'Points to redeem must be greater than 0'
        };
      }

      if (newPoints < 0) {
        return {
          success: false,
          error: 'Insufficient points',
          message: `User has ${currentPoints} points but tried to redeem ${points}`
        };
      }

      // Determine new tier based on points
      let newTier = card.tier;
      if (newPoints >= 2000) newTier = 'Gold';
      else if (newPoints >= 500) newTier = 'Silver';
      else newTier = 'Bronze';

      // Update points in Google Wallet (pass tier for front card display)
      const updateResult = await loyaltyObjectService.updatePoints(userId, newPoints, newTier);

      if (updateResult.success) {
        // Update in database
        await dbService.updateCardPoints(userId, newPoints, newTier);

        // Record transaction
        await this.addTransaction(userId, 'redeem', points, reason, currentPoints, newPoints);

        return {
          success: true,
          userId: userId,
          pointsRedeemed: points,
          previousBalance: currentPoints,
          newBalance: newPoints,
          newTier: newTier,
          message: `Successfully redeemed ${points} points`
        };
      } else {
        return updateResult;
      }

    } catch (error) {
      console.error('❌ Failed to redeem points:', error.message);
      return {
        success: false,
        error: error.message,
        message: 'Failed to redeem points'
      };
    }
  }

  // Process points delta (positive = add, negative = redeem)
  async processPointsDelta(userId, pointsDelta, reason = 'Points adjustment', metadata = {}) {
    if (pointsDelta === 0) {
      return {
        success: false,
        error: 'Invalid delta',
        message: 'Points delta cannot be zero'
      };
    }

    if (pointsDelta > 0) {
      return await this.addPoints(userId, pointsDelta, reason, metadata);
    } else {
      return await this.redeemPoints(userId, Math.abs(pointsDelta), reason, metadata);
    }
  }

  // Get user's current points balance
  async getPointsBalance(userId) {
    try {
      const card = await dbService.getCard(userId);

      if (!card) {
        return {
          success: false,
          error: 'User card not found',
          message: 'User does not have a loyalty card'
        };
      }

      return {
        success: true,
        userId: userId,
        balance: card.points || 0,
        tier: card.tier,
        message: 'Points balance retrieved successfully'
      };

    } catch (error) {
      console.error('❌ Failed to get points balance:', error.message);
      return {
        success: false,
        error: error.message,
        message: 'Failed to get points balance'
      };
    }
  }

  // Transfer points between users
  async transferPoints(fromUserId, toUserId, points, reason = 'Points transfer') {
    try {
      // Check if both users have cards
      const fromCard = await dbService.getCard(fromUserId);
      const toCard = await dbService.getCard(toUserId);

      if (!fromCard) {
        return {
          success: false,
          error: 'Sender card not found',
          message: 'Sender must have a loyalty card'
        };
      }

      if (!toCard) {
        return {
          success: false,
          error: 'Recipient card not found',
          message: 'Recipient must have a loyalty card'
        };
      }

      // Redeem from sender
      const redeemResult = await this.redeemPoints(
        fromUserId,
        points,
        `${reason} (sent to ${toUserId})`,
        { transferTo: toUserId }
      );

      if (!redeemResult.success) {
        return redeemResult;
      }

      // Add to recipient
      const addResult = await this.addPoints(
        toUserId,
        points,
        `${reason} (from ${fromUserId})`,
        { transferFrom: fromUserId }
      );

      if (!addResult.success) {
        // Rollback: add points back to sender
        await this.addPoints(fromUserId, points, 'Rollback: failed transfer');
        return {
          success: false,
          error: 'Transfer failed',
          message: 'Failed to add points to recipient, transfer cancelled'
        };
      }

      return {
        success: true,
        fromUserId: fromUserId,
        toUserId: toUserId,
        pointsTransferred: points,
        senderNewBalance: redeemResult.newBalance,
        recipientNewBalance: addResult.newBalance,
        message: `Successfully transferred ${points} points from ${fromUserId} to ${toUserId}`
      };

    } catch (error) {
      console.error('❌ Failed to transfer points:', error.message);
      return {
        success: false,
        error: error.message,
        message: 'Failed to transfer points'
      };
    }
  }

  // Get transaction statistics for a user
  async getTransactionStats(userId) {
    try {
      const history = await this.getTransactionHistory(userId, 1000); // Get all transactions

      const stats = {
        totalTransactions: history.length,
        totalEarned: 0,
        totalRedeemed: 0,
        netGain: 0,
        lastTransaction: history[0] || null,
        transactionsByType: {
          add: 0,
          redeem: 0,
          initial: 0
        }
      };

      history.forEach(txn => {
        if (txn.transaction_type === 'add') {
          stats.totalEarned += txn.points;
          stats.transactionsByType.add++;
        } else if (txn.transaction_type === 'redeem') {
          stats.totalRedeemed += txn.points;
          stats.transactionsByType.redeem++;
        } else if (txn.transaction_type === 'initial') {
          stats.totalEarned += txn.points;
          stats.transactionsByType.initial++;
        }
      });

      stats.netGain = stats.totalEarned - stats.totalRedeemed;

      return {
        success: true,
        userId: userId,
        stats: stats,
        message: 'Transaction statistics retrieved successfully'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to get transaction statistics'
      };
    }
  }
}

module.exports = new PointsManager();