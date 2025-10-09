// weights can be tuned later
const weights = {
  lighting: 0.25,
  crowd: 0.20,
  police: 0.25,
  incidents: 0.20,
  accidents: 0.10
};

function calculateSafetyScore(factors) {
  // ensure each factor exists (0-10)
  let total = 0, wsum = 0;
  for (const k in weights) {
    const val = Math.max(0, Math.min(10, (factors && factors[k]) || 5)); // default 5
    total += val * weights[k];
    wsum += weights[k];
  }
  return +(total / wsum).toFixed(2);
}

module.exports = calculateSafetyScore;
