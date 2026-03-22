const express = require("express");
const SafetyScore = require("../models/SafetyScore");
const calculateSafetyScore = require("../utils/calculateSafetyScore");
const { encode } = require("../utils/geohashUtils");

const router = express.Router();
const ngeohash = require('ngeohash');
const PoliceStation = require('../models/PoliceStation');
const Hospital = require('../models/Hospital');

// Create or update safety cell by geohash OR lat/lng
/**
 * @swagger
 * tags:
 *   - name: Safety
 *     description: Safety score cells management
 */

/**
 * @swagger
 * /api/safety/update:
 *   post:
 *     summary: Create or update a safety cell by areaId or lat/lng
 *     tags: [Safety]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               areaId:
 *                 type: string
 *                 description: Geohash area id (optional if lat/lng provided)
 *               lat:
 *                 type: number
 *               lng:
 *                 type: number
 *               factors:
 *                 type: object
 *                 description: Factors used to calculate safety score (0-10 each)
 *                 properties:
 *                   lighting:
 *                     type: number
 *                   crowd:
 *                     type: number
 *                   police:
 *                     type: number
 *                   incidents:
 *                     type: number
 *                   accidents:
 *                     type: number
 *     responses:
 *       '200':
 *         description: Saved safety cell document
 *         content:
 *           application/json:
  *             schema:
  *               $ref: '#/components/schemas/SafetyScore'
  *             example:
  *               _id: '64f1b2c3d4e5f6a7b8c9d999'
  *               areaId: 'dr5regw'
  *               score: 6.5
  *               factors: { lighting: 7, crowd: 6, police: 5, incidents: 4, accidents: 3 }
  *               lastUpdated: '2025-10-09T12:00:00.000Z'
 *       '400':
 *         description: Missing areaId and lat/lng
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '500':
 *         description: Server error
 *     security:
 *       - bearerAuth: []
 */
router.post("/update", async (req, res) => {
  try {
    let { areaId, lat, lng, factors } = req.body;
    if (!areaId) {
      if (lat == null || lng == null) return res.status(400).json({ error: "Provide areaId or lat/lng" });
      areaId = encode(lat, lng);
    }
    // factors: { lighting, crowd, police, incidents, accidents } - expected 0..10
    const score = calculateSafetyScore(factors);
    const doc = await SafetyScore.findOneAndUpdate(
      { areaId },
      { areaId, score, factors, lastUpdated: new Date() },
      { upsert: true, new: true }
    );
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// fetch cell
/**
 * @swagger
 * /api/safety/{areaId}:
 *   get:
 *     summary: Fetch safety cell by areaId
 *     tags: [Safety]
 *     parameters:
 *       - in: path
 *         name: areaId
 *         required: true
 *         schema:
 *           type: string
 *         description: Geohash area id
 *     responses:
 *       '200':
 *         description: Safety cell document
 *         content:
 *           application/json:
  *             schema:
  *               $ref: '#/components/schemas/SafetyScore'
  *             example:
  *               _id: '64f1b2c3d4e5f6a7b8c9d999'
  *               areaId: 'dr5regw'
  *               score: 6.5
  *               factors: { lighting: 7, crowd: 6, police: 5, incidents: 4, accidents: 3 }
  *               lastUpdated: '2025-10-09T12:00:00.000Z'
 *       '404':
 *         description: Not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       '500':
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
// return GeoJSON FeatureCollection for a list of areaIds
/**
 * @swagger
 * /api/safety/geojson:
 *   get:
 *     summary: Return GeoJSON FeatureCollection for list of areaIds
 *     tags: [Safety]
 *     parameters:
 *       - in: query
 *         name: areaIds
 *         schema:
 *           type: string
 *         description: Comma-separated list of geohash areaIds
 *     responses:
 *       '200':
 *         description: GeoJSON FeatureCollection
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GeoJSONFeatureCollection'
 *       '400':
 *         description: Missing areaIds
 */
router.get("/geojson", async (req, res) => {
  try {
    const { areaIds } = req.query; // comma separated
    if (!areaIds) return res.status(400).json({ error: "areaIds query param required" });
    const ids = String(areaIds).split(",").map(s => s.trim()).filter(Boolean);
    const docs = await SafetyScore.find({ areaId: { $in: ids } }).lean();
    const features = docs.map(d => {
      // decode bbox to polygon
      const bbox = ngeohash.decode_bbox(d.areaId); // [minLat, minLon, maxLat, maxLon]
      const [minLat, minLon, maxLat, maxLon] = bbox;
      const coords = [
        [minLon, minLat],
        [maxLon, minLat],
        [maxLon, maxLat],
        [minLon, maxLat],
        [minLon, minLat]
      ];
      return {
        type: "Feature",
        properties: { areaId: d.areaId, score: d.score, factors: d.factors },
        geometry: { type: "Polygon", coordinates: [coords] }
      };
    });
    res.json({ type: "FeatureCollection", features });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

// return GeoJSON FeatureCollection for a cursor (all or limited)
/**
 * @swagger
 * /api/safety/all-geojson:
 *   get:
 *     summary: Return GeoJSON FeatureCollection for all safety cells (limited)
 *     tags: [Safety]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Max number of cells to return (default 1000)
 *     responses:
 *       '200':
 *         description: GeoJSON FeatureCollection
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/GeoJSONFeatureCollection'
 */
router.get('/all-geojson', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '1000', 10);
    // fetch up to `limit` SafetyScore docs
    const docs = await SafetyScore.find({}).limit(limit).lean();
    const features = docs.map(d => {
      const bbox = ngeohash.decode_bbox(d.areaId);
      const [minLat, minLon, maxLat, maxLon] = bbox;
      const coords = [
        [minLon, minLat],
        [maxLon, minLat],
        [maxLon, maxLat],
        [minLon, maxLat],
        [minLon, minLat]
      ];
      return {
        type: 'Feature',
        properties: { areaId: d.areaId, score: d.score, factors: d.factors },
        geometry: { type: 'Polygon', coordinates: [coords] }
      };
    });
    res.json({ type: 'FeatureCollection', features });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Map geohashes to nearest police station, compute distance, score and update SafetyScore
/**
 * @swagger
 * /api/safety/map-nearest-police:
 *   post:
 *     summary: Find nearest police station for safety cells, update 'police' factor and return mapping
 *     tags: [Safety]
 *     parameters:
 *       - in: query
 *         name: areaIds
 *         schema:
 *           type: string
 *         description: Optional comma-separated list of areaIds to process. If omitted, processes up to `limit` cells.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Max number of cells to process when areaIds not provided (default 100)
 *       - in: query
 *         name: dry
 *         schema:
 *           type: boolean
 *         description: If true, don't write updates to DB; just return computed results
 *     responses:
 *       '200':
 *         description: Mapping results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 processed:
 *                   type: integer
 *                 updated:
 *                   type: integer
 *                 results:
 *                   type: array
 *             example:
 *               processed: 10
 *               updated: 10
 *               results: [{ areaId: 'ts5em1y', nearest: { name: 'Ahmedabad City Police Force', distance_m: 120 }, policeScore: 8 }]
 */
router.post('/map-nearest-police', async (req, res) => {
  try {
    const { areaIds } = req.query;
    const limit = parseInt(req.query.limit || '100', 10);
    const dry = req.query.dry === 'true' || req.query.dry === '1';

    const ids = areaIds ? String(areaIds).split(',').map(s => s.trim()).filter(Boolean) : null;

    // helper: haversine
    const toRad = v => v * Math.PI / 180;
    function haversine(lat1, lon1, lat2, lon2) {
      const R = 6371000; // meters
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    // helper: map distance (meters) to police factor 0..10 (adjusted thresholds)
    function mapDistanceToPoliceScore(m) {
      if (m <= 250) return 10;
      if (m <= 500) return 8;
      if (m <= 1000) return 6;
      if (m <= 2000) return 4;
      if (m <= 4000) return 2;
      return 0;
    }

    // helper: find nearest police using MongoDB $geoNear on location.geo
    async function findNearestPolice(lat, lng) {
      try {
        const agg = await PoliceStation.aggregate([
          {
            $geoNear: {
              near: { type: 'Point', coordinates: [lng, lat] },
              distanceField: 'dist.calculated',
              spherical: true
            }
          },
          { $limit: 1 }
        ]).allowDiskUse(true).exec();
        if (agg && agg.length) {
          const best = agg[0];
          return { station: best, distance_m: Math.round(best.dist && best.dist.calculated || 0) };
        }
      } catch (err) {
        console.error('geoNear error', err && err.message);
      }
      return null;
    }

    // cursor over SafetyScore docs
    const cursor = ids ? SafetyScore.find({ areaId: { $in: ids } }).cursor() : SafetyScore.find({}).limit(limit).cursor();
    const results = [];
    let processed = 0, updated = 0;
    const ops = [];
    const batchSize = 200;
    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      processed++;
      try {
        const areaId = doc.areaId;
        const bbox = ngeohash.decode_bbox(areaId);
        const [minLat, minLon, maxLat, maxLon] = bbox;
        const lat = (minLat + maxLat) / 2;
        const lng = (minLon + maxLon) / 2;

        const nearest = await findNearestPolice(lat, lng);
        if (!nearest) {
          results.push({ areaId, nearest: null });
          continue;
        }
        const policeScore = mapDistanceToPoliceScore(nearest.distance_m);

        const setObj = {
          'factors.police': policeScore,
          score: calculateSafetyScore(Object.assign({}, doc.factors || {}, { police: policeScore })),
          lastUpdated: new Date(),
          // store only placeId and distance to avoid duplicating mutable POI data
          nearestPolice: {
            placeId: nearest.station.placeId,
            distance_m: nearest.distance_m
          }
        };

        results.push({ areaId, nearest: setObj.nearestPolice, policeScore });

        if (!dry) {
          ops.push({ updateOne: { filter: { areaId }, update: { $set: setObj } } });
        }

        if (ops.length >= batchSize) {
          const resBulk = await SafetyScore.bulkWrite(ops, { ordered: false });
          updated += resBulk.modifiedCount || 0;
          ops.length = 0; // clear
        }
      } catch (err) {
        console.error('Error mapping areaId', doc && doc.areaId, err && err.message);
      }
    }

    if (ops.length && !dry) {
      const resBulk = await SafetyScore.bulkWrite(ops, { ordered: false });
      updated += resBulk.modifiedCount || 0;
    }

    res.json({ processed, updated: dry ? 0 : updated, results });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Map geohashes to nearest hospital, compute distance, score and update SafetyScore
/**
 * POST /api/safety/map-nearest-hospital
 * Same as map-nearest-police but for hospitals and 'hospital' factor
 */
/**
 * @swagger
 * /api/safety/map-nearest-hospital:
 *   post:
 *     summary: Find nearest hospital for safety cells, update 'hospital' factor and return mapping
 *     tags: [Safety]
 *     parameters:
 *       - in: query
 *         name: areaIds
 *         schema:
 *           type: string
 *         description: Optional comma-separated list of areaIds to process. If omitted, processes up to `limit` cells.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Max number of cells to process when areaIds not provided (default 100)
 *       - in: query
 *         name: dry
 *         schema:
 *           type: boolean
 *         description: If true, don't write updates to DB; just return computed results
 *     responses:
 *       '200':
 *         description: Mapping results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 processed:
 *                   type: integer
 *                 updated:
 *                   type: integer
 *                 results:
 *                   type: array
 *             example:
 *               processed: 10
 *               updated: 10
 *               results: [{ areaId: 'ts5em1y', nearest: { placeId: 'abc', distance_m: 120 }, hospitalScore: 8 }]
 */
router.post('/map-nearest-hospital', async (req, res) => {
  try {
    const { areaIds } = req.query;
    const limit = parseInt(req.query.limit || '100', 10);
    const dry = req.query.dry === 'true' || req.query.dry === '1';

    const ids = areaIds ? String(areaIds).split(',').map(s => s.trim()).filter(Boolean) : null;

    // helper: haversine (same as above)
    const toRad = v => v * Math.PI / 180;
    function haversine(lat1, lon1, lat2, lon2) {
      const R = 6371000; // meters
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    }

    // helper: map distance (meters) to hospital factor 0..10
    function mapDistanceToHospitalScore(m) {
      if (m <= 250) return 10;
      if (m <= 500) return 8;
      if (m <= 1000) return 6;
      if (m <= 2000) return 4;
      if (m <= 4000) return 2;
      return 0;
    }

    // helper: find nearest hospital using MongoDB $geoNear on location.geo
    async function findNearestHospital(lat, lng) {
      try {
        const agg = await Hospital.aggregate([
          {
            $geoNear: {
              near: { type: 'Point', coordinates: [lng, lat] },
              distanceField: 'dist.calculated',
              spherical: true
            }
          },
          { $limit: 1 }
        ]).allowDiskUse(true).exec();
        if (agg && agg.length) {
          const best = agg[0];
          return { hospital: best, distance_m: Math.round(best.dist && best.dist.calculated || 0) };
        }
      } catch (err) {
        console.error('geoNear hospital error', err && err.message);
      }
      return null;
    }

    // cursor over SafetyScore docs
    const cursor = ids ? SafetyScore.find({ areaId: { $in: ids } }).cursor() : SafetyScore.find({}).limit(limit).cursor();
    const results = [];
    let processed = 0, updated = 0;
    const ops = [];
    const batchSize = 200;
    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      processed++;
      try {
        const areaId = doc.areaId;
        const bbox = ngeohash.decode_bbox(areaId);
        const [minLat, minLon, maxLat, maxLon] = bbox;
        const lat = (minLat + maxLat) / 2;
        const lng = (minLon + maxLon) / 2;

        const nearest = await findNearestHospital(lat, lng);
        if (!nearest) {
          results.push({ areaId, nearest: null });
          continue;
        }
        const hospitalScore = mapDistanceToHospitalScore(nearest.distance_m);

        const setObj = {
          'factors.hospital': hospitalScore,
          score: calculateSafetyScore(Object.assign({}, doc.factors || {}, { hospital: hospitalScore })),
          lastUpdated: new Date(),
          nearestHospital: {
            placeId: nearest.hospital.placeId,
            distance_m: nearest.distance_m
          }
        };

        results.push({ areaId, nearest: setObj.nearestHospital, hospitalScore });

        if (!dry) {
          ops.push({ updateOne: { filter: { areaId }, update: { $set: setObj } } });
        }

        if (ops.length >= batchSize) {
          const resBulk = await SafetyScore.bulkWrite(ops, { ordered: false });
          updated += resBulk.modifiedCount || 0;
          ops.length = 0; // clear
        }
      } catch (err) {
        console.error('Error mapping areaId', doc && doc.areaId, err && err.message);
      }
    }

    if (ops.length && !dry) {
      const resBulk = await SafetyScore.bulkWrite(ops, { ordered: false });
      updated += resBulk.modifiedCount || 0;
    }

    res.json({ processed, updated: dry ? 0 : updated, results });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET nearest hospital for a lat/lng (convenience for map UI)
/**
 * @swagger
 * /api/safety/map/nearest-hospital:
 *   get:
 *     summary: Get nearest hospital for a given lat/lng and a computed hospitalScore (0-100)
 *     tags: [Safety]
 *     parameters:
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *         required: true
 *         description: Latitude
 *       - in: query
 *         name: lng
 *         schema:
 *           type: number
 *         required: true
 *         description: Longitude
 *     responses:
 *       '200':
 *         description: Nearest hospital and score
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 hospital:
 *                   type: object
 *                 distanceMeters:
 *                   type: integer
 *                 hospitalScore:
 *                   type: integer
 *             example:
 *               hospital: { name: 'City Hospital', placeId: 'abc', location: {...} }
 *               distanceMeters: 320
 *               hospitalScore: 80
 *       '400':
 *         description: Missing lat or lng
 *       '404':
 *         description: No hospital found
 */
router.get('/map/nearest-hospital', async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return res.status(400).json({ error: 'lat and lng required' });

    // try geo query
    let nearest = null;
    try {
      const agg = await Hospital.aggregate([
        { $geoNear: { near: { type: 'Point', coordinates: [lng, lat] }, distanceField: 'dist.calculated', spherical: true } },
        { $limit: 1 }
      ]).allowDiskUse(true).exec();
      if (agg && agg.length) nearest = { hospital: agg[0], distance_m: Math.round(agg[0].dist && agg[0].dist.calculated || 0) };
    } catch (e) {
      console.error('nearest hospital geo error', e && e.message);
    }

    if (!nearest) return res.status(404).json({ error: 'No hospital found' });

    // map distance to 0..10 then to 0..100 hospitalScore
    function mapDistanceToHospitalScore(m) {
      if (m <= 250) return 10;
      if (m <= 500) return 8;
      if (m <= 1000) return 6;
      if (m <= 2000) return 4;
      if (m <= 4000) return 2;
      return 0;
    }
    const hScore = mapDistanceToHospitalScore(nearest.distance_m);
    const hospitalScore = Math.round((hScore / 10) * 100);

    res.json({ hospital: nearest.hospital, distanceMeters: nearest.distance_m, hospitalScore });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get("/:areaId", async (req, res) => {
  try {
    const { areaId } = req.params;
    const doc = await SafetyScore.findOne({ areaId });
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;

