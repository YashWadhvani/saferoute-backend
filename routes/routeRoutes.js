const express = require("express");
const axios = require("axios");
const polyline = require("@mapbox/polyline");
const jwt = require('jsonwebtoken');
const { encode } = require("../utils/geohashUtils");
const SafetyScore = require("../models/SafetyScore");
const Pothole = require('../models/Pothole');
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');

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
      return { location: { latLng: { latitude: s.lat, longitude: s.lng } } };
    }
    // If s has a name property, use it as address string
    if (typeof s.name === 'string') {
      return { address: s.name };
    }
  }
  // If s is a string that looks like lat,lng
  const parts = String(s).split(',').map(p => p.trim());
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return { location: { latLng: { latitude: Number(parts[0]), longitude: Number(parts[1]) } } };
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

function formatDistance(r) {
  try {
    if (r.legs && Array.isArray(r.legs) && r.legs[0] && r.legs[0].distance) return r.legs[0].distance;
    if (r.distanceMeters != null) return { text: `${(r.distanceMeters / 1000).toFixed(2)} km`, value: r.distanceMeters };
  } catch (e) { }
  return null;
}

function formatDuration(r) {
  try {
    if (r.legs && Array.isArray(r.legs) && r.legs[0] && r.legs[0].duration) return r.legs[0].duration;
    if (r.duration != null && typeof r.duration === 'object' && r.duration.seconds != null) return { text: `${Math.round(r.duration.seconds / 60)} mins`, value: r.duration.seconds };
    if (r.durationSeconds != null) return { text: `${Math.round(r.durationSeconds / 60)} mins`, value: r.durationSeconds };
  } catch (e) { }
  return null;
}

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parseDistanceKm(distanceObj) {
  const meters = distanceObj && typeof distanceObj.value === 'number' ? distanceObj.value : 0;
  return meters > 0 ? meters / 1000 : 0;
}

function toRounded(value, digits = 2) {
  return Number.isFinite(value) ? +value.toFixed(digits) : 0;
}

function parseLocationLabel(input) {
  if (!input) return '';
  if (typeof input === 'string') return input;
  if (typeof input === 'object') {
    if (typeof input.name === 'string' && input.name.trim()) return input.name.trim();
    if (typeof input.lat === 'number' && typeof input.lng === 'number') {
      return `${input.lat.toFixed(6)},${input.lng.toFixed(6)}`;
    }
  }
  return String(input);
}

async function getUserFromRequest(req) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (!payload || !payload.id) return null;
    return await User.findById(payload.id);
  } catch (err) {
    return null;
  }
}

async function saveRecentRouteForUser(user, origin, destination, results) {
  if (!user || !Array.isArray(results) || !results.length) return;
  const safest = results.find(r => Array.isArray(r.tags) && r.tags.includes('safest')) || results[0];
  const recentEntry = {
    origin: parseLocationLabel(origin),
    destination: parseLocationLabel(destination),
    distance: safest?.distance?.text || '',
    duration: safest?.duration?.text || '',
    safety: typeof safest?.safety_score === 'number' ? safest.safety_score : 0,
    tags: Array.isArray(safest?.tags) ? safest.tags : [],
    createdAt: new Date()
  };

  const current = Array.isArray(user.recentRoutes) ? user.recentRoutes : [];
  current.unshift(recentEntry);
  user.recentRoutes = current.slice(0, 20);
  if (typeof user.markModified === 'function') user.markModified('recentRoutes');
  await user.save();
}

// process provider routes into our normalized result items
async function processProviderRoutes(routes, opts = {}) {
  const showProvider = !!process.env.SHOW_PROVIDER_BODY;
  const results = [];
  for (const route of routes) {
    const encodedRaw = extractEncodedPolyline(route);
    if (!encodedRaw) {
      if (showProvider) console.warn('No encoded polyline found on route (provider snippet):', JSON.stringify(route).slice(0, 1000));
      continue;
    }

    const { pts, encoded } = tryDecodePolyline(encodedRaw);
    if (!pts.length) {
      if (showProvider) console.warn('Failed to decode polyline (snippet):', String(encodedRaw).slice(0, 200));
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
      dur = { text: `~${Math.round(secs / 60)} mins`, value: secs };
    }

    results.push({
      summary: route.summary || '',
      polyline: encoded,
      distance: dist,
      duration: dur,
      decoded_points: pts.map((p) => ({ lat: p[0], lng: p[1] })),
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
      r.safety_score = 0;
      r.safety_score_excluding_potholes = 0;
      r.safety_score_including_potholes = 0;
      r.pothole_count = 0;
      r.pothole_intensity = 0;
      r.pothole_penalty = 0;
      r.comparative_analysis = {
        score_excluding_potholes: 0,
        score_including_potholes: 0,
        pothole_intensity: 0,
        pothole_penalty: 0,
        score_drop_percent: 0
      };
      r.color = colorFromScore(0);
      continue;
    }
    let total = 0, count = 0;
    for (const id of ids) {
      const s = scoreMap.has(id) ? scoreMap.get(id) : 5; // default 5
      total += s; count++;
    }
    const baseSafety = count ? +(total / count).toFixed(2) : 0;

    // pothole intensity = potholes along route / route distance (km)
    const routePoints = Array.isArray(r.decoded_points) ? r.decoded_points : [];
    const routeDistanceKm = parseDistanceKm(r.distance);
    let potholeCount = 0;

    if (routePoints.length && routeDistanceKm > 0) {
      const lats = routePoints.map(p => p.lat);
      const lngs = routePoints.map(p => p.lng);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);

      const candidates = await Pothole.find({
        location: {
          $geoWithin: {
            $box: [
              [minLng, minLat],
              [maxLng, maxLat]
            ]
          }
        }
      }).lean();

      const maxRouteDistanceMeters = 20;
      for (const candidate of candidates) {
        const coords = candidate?.location?.coordinates;
        if (!Array.isArray(coords) || coords.length < 2) continue;
        const [candLng, candLat] = coords;

        let touchesRoute = false;
        for (const p of routePoints) {
          const d = haversineMeters(p.lat, p.lng, candLat, candLng);
          if (d <= maxRouteDistanceMeters) {
            touchesRoute = true;
            break;
          }
        }

        if (touchesRoute) potholeCount += 1;
      }
    }

    const potholeIntensity = routeDistanceKm > 0 ? toRounded(potholeCount / routeDistanceKm, 2) : 0;
    const potholePenalty = Math.min(4, toRounded(potholeIntensity * 0.35, 2));
    const inclusiveSafety = toRounded(Math.max(0, baseSafety - potholePenalty), 2);
    const scoreDropPercent = baseSafety > 0
      ? toRounded(((baseSafety - inclusiveSafety) / baseSafety) * 100, 2)
      : 0;

    r.safety_score_excluding_potholes = baseSafety;
    r.safety_score_including_potholes = inclusiveSafety;
    r.safety_score = inclusiveSafety;
    r.pothole_count = potholeCount;
    r.pothole_intensity = potholeIntensity;
    r.pothole_penalty = potholePenalty;
    r.comparative_analysis = {
      score_excluding_potholes: baseSafety,
      score_including_potholes: inclusiveSafety,
      pothole_intensity: potholeIntensity,
      pothole_penalty: potholePenalty,
      score_drop_percent: scoreDropPercent
    };
    r.color = colorFromScore(inclusiveSafety);
    // mark created cells count for this route
    const createdList = ids.filter(id => createdMap.has(id));
    r.created_cells_count = createdList.length;
    r.created_cells = createdList.slice(0, 50);
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

  // additional comparisons for safest route against fastest/shortest
  const safestRoute = safestIndex >= 0 ? results[safestIndex] : null;
  const fastestRoute = fastestIndex >= 0 ? results[fastestIndex] : null;
  const shortestRoute = shortestIndex >= 0 ? results[shortestIndex] : null;
  if (safestRoute) {
    const safestScore = typeof safestRoute.safety_score === 'number' ? safestRoute.safety_score : 0;
    const fastestScore = typeof fastestRoute?.safety_score === 'number' ? fastestRoute.safety_score : 0;
    const shortestScore = typeof shortestRoute?.safety_score === 'number' ? shortestRoute.safety_score : 0;

    const saferThanFastestPercent = fastestScore > 0
      ? toRounded(((safestScore - fastestScore) / fastestScore) * 100, 2)
      : 0;
    const saferThanShortestPercent = shortestScore > 0
      ? toRounded(((safestScore - shortestScore) / shortestScore) * 100, 2)
      : 0;

    safestRoute.additional_comparisons = {
      safer_than_fastest_percent: saferThanFastestPercent,
      safer_than_shortest_percent: saferThanShortestPercent
    };
  }

  // internal-only raw points are not needed by API consumers
  for (const r of results) {
    delete r.decoded_points;
  }

  return results;
}

router.get('/recent', auth, async (req, res) => {
  try {
    const routes = Array.isArray(req.user?.recentRoutes) ? req.user.recentRoutes : [];
    const normalized = routes
      .slice()
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .map((r) => ({
        origin: r.origin || '',
        destination: r.destination || '',
        distance: r.distance || '',
        duration: r.duration || '',
        safety: typeof r.safety === 'number' ? r.safety : 0,
        tags: Array.isArray(r.tags) ? r.tags : [],
        createdAt: r.createdAt || null
      }));
    res.json({ recentRoutes: normalized });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

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
      origin: parseLoc(origin),
      destination: parseLoc(destination),
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

    // Save a recent route entry for authenticated users (best-effort, non-blocking for failures)
    try {
      const user = await getUserFromRequest(req);
      if (user) await saveRecentRouteForUser(user, origin, destination, results);
    } catch (saveErr) {
      console.warn('Failed to save recent route:', saveErr.message);
    }

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
