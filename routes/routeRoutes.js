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

// Color coding
function colorFromScore(score) {
  if (score === "N/A") return "gray";
  if (score >= 7.5) return "green";
  if (score >= 5) return "yellow";
  return "red";
}

// Shared helpers
function parseLoc(s) {
  if (!s) return null;
  // If s is an object with lat/lng, use latLng
  if (typeof s === 'object' && s !== null) {
    if (typeof s.lat === 'number' && typeof s.lng === 'number') {
      return { latLng: { latitude: s.lat, longitude: s.lng } };
    }
    // If s has a name property, use it as address string
    if (typeof s.name === 'string') {
      return { address: s.name };
    }
  }
  // If s is a string that looks like lat,lng
  const parts = String(s).split(',').map(p => p.trim());
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { latLng: { latitude: Number(parts[0]), longitude: Number(parts[1]) } };
  }
  // Otherwise, treat as address string
  return { address: String(s) };
}

function extractEncodedPolyline(route) {
  try {
    if (route.polyline) {
      if (typeof route.polyline === 'string') return route.polyline;
      if (typeof route.polyline.encodedPolyline === 'string') return route.polyline.encodedPolyline;
      if (typeof route.polyline.encodedPolyline === 'object' && typeof route.polyline.encodedPolyline.polyline === 'string') return route.polyline.encodedPolyline.polyline;
      if (typeof route.polyline.points === 'string') return route.polyline.points;
    }
    if (route.overview_polyline && typeof route.overview_polyline.points === 'string') return route.overview_polyline.points;
    if (typeof route.encodedPolyline === 'string') return route.encodedPolyline;
  } catch (e) {
    // fall through
  }
  return null;
}

const tryDecodePolyline = (encoded) => {
  const tryDecode = (str) => {
    try {
      const p = polyline.decode(str);
      if (Array.isArray(p) && p.length) return p;
    } catch (e) {
      // ignore
    }
    return null;
  };

  let pts = tryDecode(encoded) || [];
  if (pts.length) return { pts, encoded };

  // strip surrounding braces
  let cleaned = encoded;
  if (cleaned && cleaned.startsWith('{') && cleaned.endsWith('}')) cleaned = cleaned.slice(1, -1);
  cleaned = cleaned.replace(/\\\\/g, '\\');
  pts = tryDecode(cleaned) || [];
  if (pts.length) return { pts, encoded: cleaned };

  try {
    const unescaped = JSON.parse('"' + String(encoded).replace(/"/g, '\\"') + '"');
    pts = tryDecode(unescaped) || [];
    if (pts.length) return { pts, encoded: unescaped };
  } catch (e) {
    // ignore
  }

  return { pts: [], encoded: encoded };
};

async function ensureSafetyCells(hashArray) {
  if (!hashArray || !hashArray.length) return { missing: [], created: 0 };
  const existing = await SafetyScore.find({ areaId: { $in: hashArray } }).lean();
  const existingSet = new Set(existing.map(e => e.areaId));
  const missing = hashArray.filter(h => !existingSet.has(h));
  if (missing.length) {
    const ops = missing.map(h => ({ updateOne: { filter: { areaId: h }, update: { $setOnInsert: { areaId: h } }, upsert: true } }));
    await SafetyScore.bulkWrite(ops);
  }
  return { missing, created: missing.length };
}

function formatDistance(r){
  try{
    if (r.legs && Array.isArray(r.legs) && r.legs[0] && r.legs[0].distance) return r.legs[0].distance;
    if (r.distanceMeters != null) return { text: `${(r.distanceMeters/1000).toFixed(2)} km`, value: r.distanceMeters };
  }catch(e){}
  return null;
}

function formatDuration(r){
  try{
    if (r.legs && Array.isArray(r.legs) && r.legs[0] && r.legs[0].duration) return r.legs[0].duration;
    if (r.duration != null && typeof r.duration === 'object' && r.duration.seconds != null) return { text: `${Math.round(r.duration.seconds/60)} mins`, value: r.duration.seconds };
    if (r.durationSeconds != null) return { text: `${Math.round(r.durationSeconds/60)} mins`, value: r.durationSeconds };
  }catch(e){}
  return null;
}

// process provider routes into our normalized result items
async function processProviderRoutes(routes, opts = {}) {
  const showProvider = !!process.env.SHOW_PROVIDER_BODY;
  const results = [];
  for (const route of routes) {
    const encodedRaw = extractEncodedPolyline(route);
    if (!encodedRaw) {
      if (showProvider) console.warn('No encoded polyline found on route (provider snippet):', JSON.stringify(route).slice(0,1000));
      continue;
    }

    const { pts, encoded } = tryDecodePolyline(encodedRaw);
    if (!pts.length) {
      if (showProvider) console.warn('Failed to decode polyline (snippet):', String(encodedRaw).slice(0,200));
    }

    // compute geohashes (do not upsert here; scoring will ensure cells then re-query)
    const hashes = new Set();
    for (const pair of pts) {
      if (Array.isArray(pair) && pair.length >= 2) {
        const [lat, lng] = pair;
        hashes.add(encode(lat, lng));
      }
    }
    const hashArray = Array.from(hashes);

    // extract distance/duration
    let dist = formatDistance(route);
    let dur = formatDuration(route);

    // estimate duration if missing and distance present
    if ((!dur || dur.value == null) && dist && dist.value != null) {
      const avgKmph = parseFloat(process.env.ROUTES_AVG_SPEED_KMPH || '30');
      const secs = Math.round((dist.value / 1000) / avgKmph * 3600);
      dur = { text: `~${Math.round(secs/60)} mins`, value: secs };
    }

    results.push({
      summary: route.summary || '',
      polyline: encoded,
      distance: dist,
      duration: dur,
      decoded_point_count: pts.length,
      created_cells_count: 0,
      created_cells: [],
      areaIds: hashArray
    });
  }
  return results;
}

// Score and tag results: compute safety_score, color and tags for an array of result objects
async function scoreAndTagResults(results) {
  // compute union of all areaIds and fetch their scores
  const allHashes = new Set();
  for (const r of results) {
    if (Array.isArray(r.areaIds)) for (const h of r.areaIds) allHashes.add(h);
  }
  const hashArray = Array.from(allHashes);
  let scoreMap = new Map();
  let createdMap = new Map();
  if (hashArray.length) {
    // upsert missing cells in bulk first
    const { missing, created } = await ensureSafetyCells(hashArray);
    // record created set for reporting
    for (const m of missing) createdMap.set(m, true);
    // re-query so newly created docs are returned
    const cells = await SafetyScore.find({ areaId: { $in: hashArray } }).lean();
    for (const c of cells) scoreMap.set(c.areaId, (typeof c.score === 'number') ? c.score : 5);
  }

  // compute per-route safety_score
  for (const r of results) {
    const ids = Array.isArray(r.areaIds) ? r.areaIds : [];
    if (!ids.length) {
      r.safety_score = "N/A";
      r.color = colorFromScore(r.safety_score);
      continue;
    }
    let total = 0, count = 0;
    for (const id of ids) {
      const s = scoreMap.has(id) ? scoreMap.get(id) : 5; // default 5
      total += s; count++;
    }
    const avg = count ? +(total / count).toFixed(2) : "N/A";
    r.safety_score = avg;
    r.color = colorFromScore(avg);
    // mark created cells count for this route
    const createdList = ids.filter(id => createdMap.has(id));
    r.created_cells_count = createdList.length;
    r.created_cells = createdList.slice(0,50);
  }

  // tag routes: safest, fastest, shortest
  const numericScores = results.map((r, i) => ({ i, v: (typeof r.safety_score === 'number') ? r.safety_score : -Infinity }));
  const safestIndex = numericScores.reduce((best, cur) => (cur.v > best.v ? cur : best), { i: -1, v: -Infinity }).i;

  const durationVals = results.map((r, i) => ({ i, v: (r.duration && typeof r.duration.value === 'number') ? r.duration.value : Infinity }));
  const fastestIndex = durationVals.reduce((best, cur) => (cur.v < best.v ? cur : best), { i: -1, v: Infinity }).i;

  const distanceVals = results.map((r, i) => ({ i, v: (r.distance && typeof r.distance.value === 'number') ? r.distance.value : Infinity }));
  const shortestIndex = distanceVals.reduce((best, cur) => (cur.v < best.v ? cur : best), { i: -1, v: Infinity }).i;

  for (let i = 0; i < results.length; i++) {
    results[i].tags = [];
    if (i === safestIndex) results[i].tags.push('safest');
    if (i === fastestIndex) results[i].tags.push('fastest');
    if (i === shortestIndex) results[i].tags.push('shortest');
  }

  return results;
}

/**
 * @swagger
 * /api/routes/compare:
 *   post:
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
router.post('/compare', async (req, res) => {
  try {
  // accept origin/destination from body (preferred) or query
  console.log('---- Incoming from client ----');
  console.log('Headers:', req.headers);
  console.log('Raw body (parsed):', JSON.stringify(req.body, null, 2));

  // If you want raw bytes too (optional, requires raw-body middleware):
  // const getRawBody = require('raw-body');
  // getRawBody(req).then(buf => console.log('Raw bytes:', buf.toString())).catch(()=>{});

  const reqBody = req.body || {};
  const origin = reqBody.origin || req.query.origin;
  const destination = reqBody.destination || req.query.destination;
    if (!origin || !destination) return res.status(400).json({ error: 'origin and destination required' });

    const apiUrl = `https://routes.googleapis.com/directions/v2:computeRoutes?key=${GOOGLE_KEY}`;
    const apiBody = {
      origin: {location: parseLoc(origin)},
      destination: {location: parseLoc(destination)},
      travelMode: 'DRIVE',
      computeAlternativeRoutes: true
    };
    const fieldMask = 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline';
  if (process.env.SHOW_PROVIDER_BODY) console.debug('Routes API request body:', JSON.stringify(apiBody));
  const gres = await axios.post(apiUrl, apiBody, { headers: { 'Content-Type': 'application/json', 'X-Goog-FieldMask': fieldMask } });
    if (!gres.data || !gres.data.routes || !gres.data.routes.length) {
      if (process.env.SHOW_PROVIDER_BODY) console.warn('No routes found from provider:', JSON.stringify(gres.data));
      return res.status(404).json({ error: 'No routes found', provider: process.env.SHOW_PROVIDER_BODY ? gres.data : undefined });
    }

    let results = await processProviderRoutes(gres.data.routes);
    results = await scoreAndTagResults(results);

  const single = String((reqBody.single !== undefined ? reqBody.single : req.query.single) || '').toLowerCase() === 'true';
  const prefer = ((reqBody.prefer !== undefined ? reqBody.prefer : req.query.prefer) || '').toLowerCase();
    if (single) {
      // choose based on prefer
      const safest = results.find(r => r.tags && r.tags.includes('safest'));
      const fastest = results.find(r => r.tags && r.tags.includes('fastest'));
      const shortest = results.find(r => r.tags && r.tags.includes('shortest'));
      let chosen = safest || results[0] || null;
      if (prefer === 'fastest' && fastest) chosen = fastest;
      else if (prefer === 'shortest' && shortest) chosen = shortest;
      else if (prefer === 'safest' && safest) chosen = safest;
      return res.json({ route: chosen });
    }

    res.json({ routes: results });
  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
