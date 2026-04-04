const axios = require('axios');

let cachedWeights = null;
let lastFetchTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // Cache duration: 5 minutes
const BACKEND_URL = process.env.HOSTED_URL || 'http://localhost:3000'; // Default to localhost if BACKEND_URL is not set

async function fetchWeights() {
  const now = Date.now();
  if (cachedWeights && lastFetchTime && now - lastFetchTime < CACHE_DURATION) {
    return cachedWeights; // Return cached weights if still valid
  }

  try {
    const response = await axios.get(`${BACKEND_URL}/api/weights`); // Fetch weights from API
    cachedWeights = response.data; // Cache the weights
    lastFetchTime = now; // Update the last fetch time
    return cachedWeights;
  } catch (error) {
    console.error('Error fetching weights:', error);
    throw new Error('Failed to fetch weights');
  }
}

async function calculateSafetyScore(factors) {
  const weights = await fetchWeights();

  let total = 0, wsum = 0;
  for (const k in weights) {
    let val = Math.max(0, Math.min(10, (factors && factors[k]) || 5));
    if (k === 'incidents' || k === 'accidents') {
      val = 10 - val;
    }
    total += val * weights[k];
    wsum += weights[k];
  }
  return +(total / wsum).toFixed(2);
}

module.exports = calculateSafetyScore;
