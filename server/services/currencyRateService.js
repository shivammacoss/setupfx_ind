/**
 * Currency Rate Service
 * Fetches and caches live USD/INR exchange rate
 */

let cachedRate = 83; // Default fallback rate
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

/**
 * Fetch live USD/INR rate from external API
 * Caches the rate for 5 minutes to avoid excessive API calls
 */
async function fetchUsdInrRate() {
  const now = Date.now();
  
  // Return cached rate if still valid
  if (now - lastFetchTime < CACHE_DURATION && cachedRate > 0) {
    return cachedRate;
  }
  
  try {
    // Try primary API (exchangerate-api.com - free, no key required)
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD', {
      timeout: 5000
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.rates && data.rates.INR) {
        cachedRate = data.rates.INR;
        lastFetchTime = now;
        console.log(`[CurrencyRateService] Live USD/INR rate fetched: ${cachedRate}`);
        return cachedRate;
      }
    }
  } catch (error) {
    console.error('[CurrencyRateService] Primary API failed:', error.message);
  }
  
  try {
    // Fallback API (open.er-api.com)
    const response = await fetch('https://open.er-api.com/v6/latest/USD', {
      timeout: 5000
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.rates && data.rates.INR) {
        cachedRate = data.rates.INR;
        lastFetchTime = now;
        console.log(`[CurrencyRateService] Fallback USD/INR rate fetched: ${cachedRate}`);
        return cachedRate;
      }
    }
  } catch (error) {
    console.error('[CurrencyRateService] Fallback API failed:', error.message);
  }
  
  // Return cached rate if APIs fail
  console.log(`[CurrencyRateService] Using cached/default rate: ${cachedRate}`);
  return cachedRate;
}

/**
 * Get current USD/INR rate (cached or fresh)
 */
async function getUsdInrRate() {
  return await fetchUsdInrRate();
}

/**
 * Get current cached rate without fetching (for sync operations)
 */
function getCachedUsdInrRate() {
  return cachedRate;
}

/**
 * Force refresh the rate
 */
async function refreshRate() {
  lastFetchTime = 0; // Reset cache
  return await fetchUsdInrRate();
}

module.exports = {
  getUsdInrRate,
  getCachedUsdInrRate,
  refreshRate
};
