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
  *                     $ref: '#/components/schemas/Route'
  *             example:
  *               routes:
  *                 - summary: 'Main St'
  *                   polyline: 'abcd'
  *                   distance: { text: '3 km', value: 3000 }
  *                   duration: { text: '8 mins', value: 480 }
  *                   safety_score: 7.1
  *                   color: 'green'
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

/**
 * @swagger
 * /api/routes/compute:
 *   post:
 *     summary: Compute route(s), decode polyline(s), ensure SafetyScore cells exist for each geohash along the route
 *     tags: [Routes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [origin,destination]
 *             properties:
 *               origin:
 *                 type: string
 *               destination:
 *                 type: string
 *               alternatives:
 *                 type: boolean
 *                 description: Whether to request alternative routes (default true)
 *     responses:
 *       '200':
 *         description: Routes processed and SafetyScore cells ensured
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
 *                       summary: { type: string }
 *                       polyline: { type: string }
 *                       decoded_point_count: { type: number }
 *                       created_cells_count: { type: number }
 *       '400':
 *         description: Missing origin/destination
 *       '500':
 *         description: Server error
 */
router.post('/compute', async (req, res) => {
  try {
    const { origin, destination } = req.body;
    const alternatives = req.body.alternatives !== false; // default true
    if (!origin || !destination) return res.status(400).json({ error: 'origin and destination required' });

    const apiUrl = `https://routes.googleapis.com/directions/v2:computeRoutes?key=${GOOGLE_KEY}`;

    // build request body for Routes API
    function parseLoc(s) {
      if (!s) return null;
      const parts = String(s).split(',').map(p => p.trim());
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return { latLng: { latitude: Number(parts[0]), longitude: Number(parts[1]) } };
      }
      return { address: s };
    }

    const body = {
      origin: parseLoc(origin),
      destination: parseLoc(destination),
      travelMode: 'DRIVE',
      computeAlternativeRoutes: true
    };

  const fieldMask = 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline';
  const gres = await axios.post(apiUrl, body, { headers: { 'Content-Type': 'application/json', 'X-Goog-FieldMask': fieldMask } });
    if (!gres.data || !gres.data.routes || !gres.data.routes.length) return res.status(404).json({ error: 'No routes found' });

    const results = [];
    for (const route of gres.data.routes) {
      // Routes API returns encoded polyline in different places depending on API version;
      // try a few known fields defensively.
      // Extract encoded polyline string from possible shapes returned by Routes API
      let encoded = null;
      try {
        if (route.polyline) {
          if (typeof route.polyline === 'string') encoded = route.polyline;
          else if (typeof route.polyline.encodedPolyline === 'string') encoded = route.polyline.encodedPolyline;
          else if (typeof route.polyline.encodedPolyline === 'object' && typeof route.polyline.encodedPolyline.polyline === 'string') encoded = route.polyline.encodedPolyline.polyline;
          else if (typeof route.polyline.points === 'string') encoded = route.polyline.points;
        }
        if (!encoded) {
          if (route.overview_polyline && typeof route.overview_polyline.points === 'string') encoded = route.overview_polyline.points;
          else if (typeof route.encodedPolyline === 'string') encoded = route.encodedPolyline;
        }
      } catch (e) {
        console.warn('Error extracting polyline', e.message);
      }

      if (!encoded) {
        console.warn('No encoded polyline found on route, skipping');
        continue;
      }

      let pts = [];
      // debug: show a short snippet of the encoded polyline when diagnosing issues
      try { console.log('Decoded polyline snippet:', String(encoded).slice(0,200)); } catch(e){}

      // Try decoding with a few fallback cleaning steps to handle various formats/escaping
      const tryDecode = (str) => {
        try {
          const p = polyline.decode(str);
          if (Array.isArray(p) && p.length) return p;
        } catch (e) {
          // ignore
        }
        return null;
      };

      pts = tryDecode(encoded) || [];

      if (!pts.length) {
        // strip surrounding braces sometimes present
        let cleaned = encoded;
        if (cleaned.startsWith('{') && cleaned.endsWith('}')) cleaned = cleaned.slice(1, -1);
        // unescape double backslashes
        cleaned = cleaned.replace(/\\\\/g, '\\');
        pts = tryDecode(cleaned) || [];
        if (pts.length) encoded = cleaned;
      }

      if (!pts.length) {
        // last resort: attempt JSON unescape of escape sequences
        try {
          const unescaped = JSON.parse('"' + String(encoded).replace(/"/g, '\\"') + '"');
          pts = tryDecode(unescaped) || [];
          if (pts.length) encoded = unescaped;
        } catch (e) {
          // ignore
        }
      }

      console.log('Decoded points count:', pts.length);

      // compute all geohashes for route points
      const hashes = new Set();
      for (const [lat, lng] of pts) hashes.add(encode(lat, lng));
      const hashArray = Array.from(hashes);

      // find existing cells
      const existing = await SafetyScore.find({ areaId: { $in: hashArray } }).lean();
      const existingSet = new Set(existing.map(e => e.areaId));

      // identify missing
      const missing = hashArray.filter(h => !existingSet.has(h));

      // upsert missing using bulkWrite for efficiency
      if (missing.length) {
        const ops = missing.map(h => ({ updateOne: { filter: { areaId: h }, update: { $setOnInsert: { areaId: h } }, upsert: true } }));
        await SafetyScore.bulkWrite(ops);
      }

      results.push({
        summary: route.summary || '',
        polyline: encoded,
        decoded_point_count: pts.length,
        created_cells_count: missing.length,
        created_cells: missing.slice(0, 50)
      });
    }

    res.json({ routes: results });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
