const { fetchHistoricalCandles } = require('./server/services/metaApiMarketData.service.js');
async function run() {
  require('dotenv').config({ path: './server/.env' });
  console.log("Fetching...");
  const res = await fetchHistoricalCandles('XAUUSD', '1m', { limit: 5 });
  console.log("Result:", res);
}
run();
