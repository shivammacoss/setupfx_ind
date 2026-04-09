/**
 * Settlement Cron Jobs
 * Handles scheduled tasks for IB and Copy Trading systems
 * Includes auto square-off for Indian markets (excludes MCX)
 */

const settlementService = require('../services/settlement.service');
const NettingEngine = require('../engines/NettingEngine');
const HedgingEngine = require('../engines/HedgingEngine');
const { NettingPosition } = require('../models/Position');

// Store interval references for cleanup
let dailySettlementInterval = null;
let endOfDayInterval = null;
let autoSquareOffInterval = null;
let optionExpirySettlementInterval = null;
let swapSchedulerInterval = null;

// Netting engine instance for auto square-off
let nettingEngine = null;
// Socket.IO reference for notifications
let ioRef = null;

/**
 * Set Socket.IO reference for expiry notifications
 */
function setSocketIO(io) {
  ioRef = io;
}

/**
 * Initialize cron jobs
 */
function initializeCronJobs() {
  console.log('[Cron] Initializing settlement cron jobs...');

  // Daily settlement at midnight UTC
  // Using setInterval for simplicity - in production, use node-cron or similar
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0); // Next midnight UTC
  
  const msUntilMidnight = midnight.getTime() - now.getTime();
  
  // Schedule first run at midnight, then every 24 hours
  setTimeout(() => {
    runDailySettlement();
    dailySettlementInterval = setInterval(runDailySettlement, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);

  console.log(`[Cron] Daily settlement scheduled for ${midnight.toISOString()}`);

  // End of day settlement (5 PM UTC - typical market close)
  const fivePM = new Date(now);
  fivePM.setUTCHours(17, 0, 0, 0);
  if (fivePM <= now) {
    fivePM.setDate(fivePM.getDate() + 1);
  }
  
  const msUntilFivePM = fivePM.getTime() - now.getTime();
  
  setTimeout(() => {
    runEndOfDaySettlement();
    endOfDayInterval = setInterval(runEndOfDaySettlement, 24 * 60 * 60 * 1000);
  }, msUntilFivePM);

  console.log(`[Cron] End-of-day settlement scheduled for ${fivePM.toISOString()}`);

  // Initialize netting engine for auto square-off
  nettingEngine = new NettingEngine(null);
  
  // Auto square-off check - runs every minute during Indian market hours
  // Triggers at 15:15 for NSE/NFO/BSE/BFO, 16:55 for CDS
  // MCX is EXCLUDED from auto square-off
  autoSquareOffInterval = setInterval(checkAutoSquareOff, 60 * 1000); // Every 1 minute
  console.log('[Cron] Auto square-off scheduler initialized (excludes MCX)');

  // F&O option expiry: intrinsic settlement after exchange close on expiry day (IST)
  optionExpirySettlementInterval = setInterval(checkOptionExpirySettlement, 2 * 60 * 1000);
  console.log('[Cron] Option expiry settlement scheduler initialized (every 2 min, IST weekdays)');

  // Per-segment swap scheduler: checks every 60s for segments whose swapTime matches current IST minute
  swapSchedulerInterval = setInterval(runSwapScheduler, 60 * 1000);
  console.log('[Cron] Per-segment swap scheduler initialized (every 60s)');
}

/**
 * Cash-settle netting option positions at intrinsic value; cancel pending on expired contracts.
 * Also sends notifications to users about their expired positions.
 */
async function checkOptionExpirySettlement() {
  if (!nettingEngine) {
    nettingEngine = new NettingEngine(null);
  }
  try {
    const result = await nettingEngine.settleExpiredNettingOptionPositions(ioRef);
    
    // Notify users about their closed positions
    if (result && (result.settled > 0 || result.cancelled > 0) && ioRef) {
      // Get unique users who had positions settled
      const settledUsers = result.settledPositions || [];
      for (const pos of settledUsers) {
        if (pos.userId) {
          ioRef.to(pos.userId).emit('expirySettlement', {
            type: 'position_closed',
            symbol: pos.symbol,
            profit: pos.profit,
            message: `Your ${pos.symbol} position was automatically closed due to contract expiry. P/L: ${pos.profit >= 0 ? '+' : ''}${pos.profit?.toFixed(2) || 0}`
          });
          
          // Also emit position update
          const updatedPositions = await NettingPosition.find({ userId: pos.userId, status: 'open' }).lean();
          ioRef.to(pos.userId).emit('positionUpdate', { 
            mode: 'netting', 
            positions: updatedPositions.map(p => ({ ...p, mode: 'netting' }))
          });
        }
      }
    }
  } catch (error) {
    console.error('[Cron] Option expiry settlement error:', error.message);
  }
}

/**
 * Run daily settlement
 */
async function runDailySettlement() {
  console.log('[Cron] Running daily settlement...');
  try {
    const results = await settlementService.runDailySettlement();
    console.log('[Cron] Daily settlement completed:', results);
  } catch (error) {
    console.error('[Cron] Daily settlement error:', error);
  }
}

/**
 * Run end of day settlement
 */
async function runEndOfDaySettlement() {
  console.log('[Cron] Running end-of-day settlement...');
  try {
    await settlementService.processEndOfDaySettlement();
    console.log('[Cron] End-of-day settlement completed');
    // Note: Netting swap is now handled by per-segment swap scheduler (runSwapScheduler).
    // Hedging swap still runs here since hedging doesn't have per-segment swap times.
    try {
      const hedgingEngine = new HedgingEngine();
      const hedgingSwap = await hedgingEngine.applyOvernightSwap();
      console.log('[Cron] Hedging overnight swap:', {
        positionsProcessed: hedgingSwap.positionsProcessed,
        totalSwapCharged: hedgingSwap.totalSwapCharged.toFixed(2),
        dayOfWeek: hedgingSwap.dayOfWeek
      });
    } catch (hedgeSwapErr) {
      console.error('[Cron] Hedging overnight swap error:', hedgeSwapErr);
    }
  } catch (error) {
    console.error('[Cron] End-of-day settlement error:', error);
  }
}

/**
 * Apply overnight swap to all open carryforward positions
 * SWAP LONG: Interest charged/earned for holding BUY positions overnight
 * SWAP SHORT: Interest charged/earned for holding SELL positions overnight
 * TRIPLE SWAP DAY: Day when swap is charged 3x (accounts for weekend)
 */
async function applyOvernightSwap() {
  console.log('[Cron] Applying overnight swap (netting + hedging)...');
  try {
    if (!nettingEngine) {
      nettingEngine = new NettingEngine(null);
    }
    const nettingSwap = await nettingEngine.applyOvernightSwap();
    console.log('[Cron] Netting overnight swap:', {
      positionsProcessed: nettingSwap.positionsProcessed,
      totalSwapCharged: nettingSwap.totalSwapCharged.toFixed(2),
      dayOfWeek: nettingSwap.dayOfWeek
    });

    const hedgingEngine = new HedgingEngine();
    const hedgingSwap = await hedgingEngine.applyOvernightSwap();
    console.log('[Cron] Hedging overnight swap:', {
      positionsProcessed: hedgingSwap.positionsProcessed,
      totalSwapCharged: hedgingSwap.totalSwapCharged.toFixed(2),
      dayOfWeek: hedgingSwap.dayOfWeek
    });
  } catch (error) {
    console.error('[Cron] Overnight swap error:', error);
  }
}

/**
 * Check and execute auto square-off for Indian markets
 * Runs every minute during market hours
 * EXCLUDES: MCX (commodity futures/options)
 */
async function checkAutoSquareOff() {
  const now = new Date();
  const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  
  // Skip weekends
  if (day === 0 || day === 6) return;
  
  const currentHour = ist.getHours();
  const currentMinute = ist.getMinutes();
  const currentTime = currentHour * 60 + currentMinute;
  
  // Market square-off times (IST) - EXCLUDING MCX
  // Changed to 15:30 to match NettingEngine.marketTimings, 10-minute window
  const squareOffTimes = {
    NSE: 15 * 60 + 30,  // 15:30
    NFO: 15 * 60 + 30,  // 15:30
    BSE: 15 * 60 + 30,  // 15:30
    BFO: 15 * 60 + 30,  // 15:30
    CDS: 16 * 60 + 55   // 16:55
    // MCX EXCLUDED - no auto square-off
  };

  // Check if any market needs square-off (within 10-minute window)
  const needsSquareOff = Object.values(squareOffTimes).some(time =>
    currentTime >= time && currentTime < time + 10
  );
  
  if (needsSquareOff && nettingEngine) {
    console.log(`[Auto Square-Off] Checking positions at ${ist.toLocaleTimeString('en-IN')}`);
    try {
      // Get current prices from Zerodha service (empty object as fallback)
      const ZerodhaService = require('../services/zerodha.service');
      const currentPrices = ZerodhaService.getLastPrices ? ZerodhaService.getLastPrices() : {};
      
      await nettingEngine.autoSquareOff(currentPrices);
    } catch (error) {
      console.error('[Auto Square-Off] Error:', error.message);
    }
  }
}

/**
 * Per-segment swap scheduler: runs every 60s.
 * For each NettingSegment whose swapTime === current IST HH:MM and hasn't run today,
 * calls nettingEngine.applyOvernightSwap({ segmentName }) and marks lastSwapAppliedDate.
 */
async function runSwapScheduler() {
  try {
    const NettingSegment = require('../models/NettingSegment');
    const now = new Date();
    const ist = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const hh = String(ist.getHours()).padStart(2, '0');
    const mm = String(ist.getMinutes()).padStart(2, '0');
    const currentISTMinute = `${hh}:${mm}`;
    const todayIST = `${ist.getFullYear()}-${String(ist.getMonth() + 1).padStart(2, '0')}-${String(ist.getDate()).padStart(2, '0')}`;

    // Find segments whose swap time matches now and haven't been processed today
    const segments = await NettingSegment.find({
      swapTime: currentISTMinute,
      $or: [
        { lastSwapAppliedDate: { $ne: todayIST } },
        { lastSwapAppliedDate: null }
      ]
    });

    if (segments.length === 0) return;

    if (!nettingEngine) {
      nettingEngine = new NettingEngine(null);
    }

    for (const seg of segments) {
      try {
        console.log(`[SwapScheduler] Applying swap for ${seg.name} at ${currentISTMinute} IST`);
        const result = await nettingEngine.applyOvernightSwap({ segmentName: seg.name });
        console.log(`[SwapScheduler] ${seg.name}: ${result.positionsProcessed} positions, swap=${result.totalSwapCharged.toFixed(2)}`);
        seg.lastSwapAppliedDate = todayIST;
        await seg.save();
      } catch (segErr) {
        console.error(`[SwapScheduler] Error for ${seg.name}:`, segErr.message);
      }
    }
  } catch (err) {
    console.error('[SwapScheduler] Error:', err.message);
  }
}

/**
 * Manual trigger for daily settlement (admin use)
 */
async function triggerDailySettlement() {
  return await settlementService.runDailySettlement();
}

/**
 * Manual trigger for end-of-day settlement (admin use)
 */
async function triggerEndOfDaySettlement() {
  return await settlementService.processEndOfDaySettlement();
}

/**
 * Manual trigger: run F&O option expiry settlement (same logic as the 2‑minute cron).
 */
async function triggerOptionExpirySettlement() {
  if (!nettingEngine) {
    nettingEngine = new NettingEngine(null);
  }
  return await nettingEngine.settleExpiredNettingOptionPositions();
}

/**
 * Cleanup cron jobs on shutdown
 */
function cleanupCronJobs() {
  if (dailySettlementInterval) {
    clearInterval(dailySettlementInterval);
  }
  if (endOfDayInterval) {
    clearInterval(endOfDayInterval);
  }
  if (autoSquareOffInterval) {
    clearInterval(autoSquareOffInterval);
  }
  if (optionExpirySettlementInterval) {
    clearInterval(optionExpirySettlementInterval);
  }
  if (swapSchedulerInterval) {
    clearInterval(swapSchedulerInterval);
  }
  console.log('[Cron] Cron jobs cleaned up');
}

module.exports = {
  initializeCronJobs,
  setSocketIO,
  triggerDailySettlement,
  triggerEndOfDaySettlement,
  triggerOptionExpirySettlement,
  cleanupCronJobs
};
