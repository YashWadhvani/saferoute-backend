// weights can be tuned later
const weights = {
  lighting: 0.20,
  crowd: 0.15,
  police: 0.20,
  hospital: 0.20, // new hospital parameter
  potholes: 0.10,
  incidents: 0.15,
  accidents: 0.10
};

function calculateSafetyScore(factors) {
  // ensure each factor exists (0-10)
  let total = 0, wsum = 0;
  for (const k in weights) {
    // read/range-clamp value (0..10), default to 5 (neutral)
    let val = Math.max(0, Math.min(10, (factors && factors[k]) || 5));
    // incidents and accidents are inverse: higher value -> more risky -> should reduce safety
    if (k === 'incidents' || k === 'accidents') {
      val = 10 - val; // invert so 10 incidents -> treated as 0 (unsafe), 0 incidents -> 10 (safe)
    }
    // For hospital, higher value means closer (safer), lower value means farther (less safe)
    // For potholes, the factor should be 0..10 where higher == safer (few/no potholes).
    // If your pothole data produces an intensity (higher == worse), convert it to a 0-10 safe score before storing in factors.potholes.
    total += val * weights[k];
    wsum += weights[k];
  }
  return +(total / wsum).toFixed(2);
}

module.exports = calculateSafetyScore;
