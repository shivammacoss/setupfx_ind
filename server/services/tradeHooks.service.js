/**
 * Trade Hooks Service
 * Integrates IB commission and Copy Trading with trade execution
 * Called by trading engines when trades open/close
 */

const commissionService = require('./commission.service');
const copyTradeService = require('./copyTrade.service');

class TradeHooksService {
  /**
   * Called when a trade is opened
   * Triggers copy trading for followers
   */
  async onTradeOpen(tradeData) {
    const {
      userId,
      oderId,
      tradeId,
      positionId,
      symbol,
      side,
      volume,
      entryPrice,
      stopLoss,
      takeProfit,
      mode
    } = tradeData;

    try {
      // Process copy trading - copy trade to all followers
      const copyTrades = await copyTradeService.processMasterTradeOpen(userId, {
        tradeId,
        positionId,
        symbol,
        side,
        volume,
        entryPrice,
        stopLoss,
        takeProfit
      });

      if (copyTrades.length > 0) {
        console.log(`[TradeHooks] Copied trade to ${copyTrades.length} followers`);
      }

      return { copyTrades };
    } catch (error) {
      console.error('[TradeHooks] Error on trade open:', error);
      return { error: error.message };
    }
  }

  /**
   * Called when a trade is closed
   * Triggers IB commission calculation and copy trade closing
   */
  async onTradeClose(tradeData) {
    const {
      userId,
      oderId,
      tradeId,
      positionId,
      symbol,
      side,
      volume,
      entryPrice,
      closePrice,
      profit,
      spread,
      commission: platformCommission,
      mode
    } = tradeData;

    const results = {
      ibCommission: null,
      copyTradeResults: []
    };

    try {
      // 1. Process IB commission
      const ibCommission = await commissionService.processTradeCommission({
        userId,
        oderId,
        tradeId,
        positionId,
        symbol,
        volume,
        entryPrice,
        closePrice,
        profit,
        spread,
        platformCommission
      });

      if (ibCommission) {
        results.ibCommission = ibCommission;
        console.log(`[TradeHooks] IB commission processed: $${ibCommission.amount}`);
      }

      // 2. Process copy trading - close copied trades and calculate fees
      const copyResults = await copyTradeService.processMasterTradeClose(userId, {
        tradeId,
        positionId,
        closePrice,
        profit
      });

      if (copyResults.length > 0) {
        results.copyTradeResults = copyResults;
        console.log(`[TradeHooks] Processed ${copyResults.length} copy trade closes`);
      }

      return results;
    } catch (error) {
      console.error('[TradeHooks] Error on trade close:', error);
      return { ...results, error: error.message };
    }
  }

  /**
   * Called when a trade is modified (SL/TP change)
   * Updates copy trades if applicable
   */
  async onTradeModify(tradeData) {
    const {
      userId,
      positionId,
      stopLoss,
      takeProfit
    } = tradeData;

    try {
      // Update copy trades with new SL/TP
      // This would require additional implementation in copyTradeService
      // For now, we'll just log it
      console.log(`[TradeHooks] Trade modified: ${positionId}`);
      return { success: true };
    } catch (error) {
      console.error('[TradeHooks] Error on trade modify:', error);
      return { error: error.message };
    }
  }
}

module.exports = new TradeHooksService();
