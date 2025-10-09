const express = require("express");
const axios = require("axios");
const polyline = require("@mapbox/polyline");
const { encode } = require("../utils/geohashUtils");
const SafetyScore = require("../models/SafetyScore");

const router = express.Router();
const GOOGLE_KEY = process.env.GOOGLE_MAPS_KEY;

/**
 * @swagger
 * tags:
 *   - name: Routes
 *     description: Route comparison and mapping endpoints
 */

// Helper: sample indices to limit to ~30 samples per route
function sampleIndices(n, maxSamples = 30) {
  const step = Math.max(1, Math.ceil(n / maxSamples));
  const indices = [];
  for (let i = 0; i < n; i += step) indices.push(i);
  return indices;
}

// Color coding
function colorFromScore(score) {
  if (score === "N/A") return "gray";
  if (score >= 7.5) return "green";
  if (score >= 5) return "yellow";
  return "red";
}

/**
 * @swagger
 * /api/routes/compare:
 *   get:
 *     summary: Compare alternative routes between origin and destination and return safety scores
 *     tags: [Routes]
 *     parameters:
 *       - in: query
 *         name: origin
 *         required: true
 *         schema:
 *           type: string
 *         description: Origin address or latitude,longitude
 *       - in: query
 *         name: destination
 *         required: true
 *         schema:
 *           type: string
 *         description: Destination address or latitude,longitude
 *     responses:
 *       '200':
 *         description: List of alternative routes with safety scores
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 routes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       summary:
 *                         type: string
 *                       polyline:
 *                         type: string
 *                       distance:
 *                         type: object
 *                       duration:
 *                         type: object
 *                       safety_score:
 *                         type: number
 *                         description: Average safety score for route (1-10)
 *                       color:
 *                         type: string
 *       '400':
 *         description: Missing origin or destination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       '404':
 *         description: No routes found
 *       '500':
 *         description: Server error
 */
router.get("/compare", async (req, res) => {
  try {
    const { origin, destination } = req.query;
    if (!origin || !destination) return res.status(400).json({ error: "origin and destination required" });

    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&alternatives=true&key=${GOOGLE_KEY}`;
    const gres = await axios.get(url);
    if (!gres.data.routes || !gres.data.routes.length) return res.status(404).json({ error: "No routes found" });

    const results = [];
    for (const route of gres.data.routes) {
      const encoded = route.overview_polyline.points;
      const pts = polyline.decode(encoded); // [[lat,lng],...]
      // sample to limit DB lookups
      const sampleIdx = sampleIndices(pts.length, 40);
      const hashes = new Set();
      for (const i of sampleIdx) {
        const [lat, lng] = pts[i];
        hashes.add(encode(lat, lng));
      }

      // fetch all safety docs for these hashes in one query
      const hashArray = Array.from(hashes);
      const cells = await SafetyScore.find({ areaId: { $in: hashArray } }).lean();

      // map areaId -> score
      const map = new Map();
      for (const c of cells) map.set(c.areaId, c.score);

      // ensure missing cells are created lazily with default score 5
      let total = 0, count = 0;
      for (const h of hashArray) {
        if (map.has(h)) {
          total += map.get(h);
          count++;
        } else {
          // create default doc (non-blocking)
          // upsert with default score 5 and default factors (handled by model defaults)
          await SafetyScore.updateOne({ areaId: h }, { $setOnInsert: { areaId: h } }, { upsert: true });
          total += 5;
          count++;
        }
      }
      const avg = count ? +(total / count).toFixed(2) : "N/A";

      results.push({
        summary: route.summary || "",
        polyline: encoded,
        distance: route.legs[0].distance,
        duration: route.legs[0].duration,
        safety_score: avg,
        color: colorFromScore(avg)
      });
    }

    // sort results by safety_score desc, and include original order as fallback
    results.sort((a, b) => {
      if (a.safety_score === "N/A") return 1;
      if (b.safety_score === "N/A") return -1;
      return b.safety_score - a.safety_score;
    });

    res.json({ routes: results });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
