const express = require('express');
const Pothole = require('../models/Pothole');
const SafetyScore = require('../models/SafetyScore');
const calculateSafetyScore = require('../utils/calculateSafetyScore');
const { encode } = require('../utils/geohashUtils');
const ngeohash = require('ngeohash');
const auth = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @swagger
 * /api/potholes:
 *   post:
 *     summary: Store or update a pothole
 *     tags: [Pothole]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - latitude
 *               - longitude
 *               - intensity
 *             properties:
 *               latitude:
 *                 type: number
 *                 minimum: -90
 *                 maximum: 90
 *                 example: 23.0225
 *               longitude:
 *                 type: number
 *                 minimum: -180
 *                 maximum: 180
 *                 example: 72.5714
 *               intensity:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 10
 *                 example: 7.5
 *     responses:
 *       '200':
 *         description: Existing pothole updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 isNew:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Pothole'
 *       '201':
 *         description: New pothole created
 *       '400':
 *         description: Invalid input
 *       '401':
 *         description: Unauthorized
 *       '500':
 *         description: Server error
 */
router.post('/', auth, async (req, res) => {
    try {
        console.log('POST /api/potholes body:', JSON.stringify(req.body));
        console.log('Request user:', req.user ? req.user._id : 'no-user');
        const { latitude, longitude, intensity } = req.body;

        // Validation
        if (latitude === undefined || longitude === undefined || intensity === undefined) {
            return res.status(400).json({ error: 'Missing required fields: latitude, longitude, intensity' });
        }

        if (typeof latitude !== 'number' || typeof longitude !== 'number' || typeof intensity !== 'number') {
            return res.status(400).json({ error: 'latitude, longitude, and intensity must be numbers' });
        }

        if (latitude < -90 || latitude > 90) {
            return res.status(400).json({ error: 'Latitude must be between -90 and 90' });
        }

        if (longitude < -180 || longitude > 180) {
            return res.status(400).json({ error: 'Longitude must be between -180 and 180' });
        }

        if (intensity < 0 || intensity > 10) {
            return res.status(400).json({ error: 'Intensity must be between 0 and 10' });
        }

        // Check if pothole exists within 15 meters
        const nearbyPotholes = await Pothole.find({
            location: {
                $near: {
                    $geometry: {
                        type: 'Point',
                        coordinates: [longitude, latitude]
                    },
                    $maxDistance: 15
                }
            }
        }).limit(1);

        let pothole;

        if (nearbyPotholes.length > 0) {
            // Update existing pothole
            pothole = nearbyPotholes[0];
            pothole.reports += 1;
            pothole.intensity = Math.max(pothole.intensity, intensity);
            await pothole.save();

            // update safety cell for potholes factor
            try {
                const lat = pothole.location.coordinates[1];
                const lng = pothole.location.coordinates[0];
                await updateSafetyCellPotholes(lat, lng);
            } catch (e) {
                console.warn('Failed to update safety cell for pothole (update):', e && e.message);
            }

            return res.status(200).json({
                success: true,
                message: 'Pothole report added to existing location',
                data: pothole,
                isNew: false
            });
        } else {
            // Create new pothole
            pothole = new Pothole({
                location: {
                    type: 'Point',
                    coordinates: [longitude, latitude]
                },
                intensity,
                reports: 1
            });

            await pothole.save();

            // update safety cell for potholes factor
            try {
                const lat = pothole.location.coordinates[1];
                const lng = pothole.location.coordinates[0];
                await updateSafetyCellPotholes(lat, lng);
            } catch (e) {
                console.warn('Failed to update safety cell for pothole (create):', e && e.message);
            }

            return res.status(201).json({
                success: true,
                message: 'New pothole created',
                data: pothole,
                isNew: true
            });
        }
    } catch (err) {
        console.error('Error in POST /api/potholes:', err);
        // if validation errors from mongoose, include message
        const msg = err && err.message ? err.message : 'Server error';
        res.status(500).json({ error: msg });
    }
});

/**
 * @swagger
 * /api/potholes:
 *   get:
 *     summary: Fetch potholes in bounding box
 *     tags: [Pothole]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: minLat
 *         required: true
 *         schema:
 *           type: number
 *         description: Minimum latitude (bottom boundary)
 *       - in: query
 *         name: maxLat
 *         required: true
 *         schema:
 *           type: number
 *         description: Maximum latitude (top boundary)
 *       - in: query
 *         name: minLng
 *         required: true
 *         schema:
 *           type: number
 *         description: Minimum longitude (left boundary)
 *       - in: query
 *         name: maxLng
 *         required: true
 *         schema:
 *           type: number
 *         description: Maximum longitude (right boundary)
 *     responses:
 *       '200':
 *         description: Array of potholes in bounding box
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: number
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Pothole'
 *       '400':
 *         description: Missing or invalid query parameters
 *       '401':
 *         description: Unauthorized
 *       '500':
 *         description: Server error
 */
router.get('/', auth, async (req, res) => {
    try {
        const { minLat, maxLat, minLng, maxLng } = req.query;

        // Validation
        if (!minLat || !maxLat || !minLng || !maxLng) {
            return res.status(400).json({ error: 'Missing required query parameters: minLat, maxLat, minLng, maxLng' });
        }

        const minLatNum = parseFloat(minLat);
        const maxLatNum = parseFloat(maxLat);
        const minLngNum = parseFloat(minLng);
        const maxLngNum = parseFloat(maxLng);

        if (isNaN(minLatNum) || isNaN(maxLatNum) || isNaN(minLngNum) || isNaN(maxLngNum)) {
            return res.status(400).json({ error: 'All bounding box parameters must be valid numbers' });
        }

        if (minLatNum < -90 || maxLatNum > 90 || minLatNum >= maxLatNum) {
            return res.status(400).json({ error: 'Invalid latitude range. Must be: -90 <= minLat < maxLat <= 90' });
        }

        if (minLngNum < -180 || maxLngNum > 180 || minLngNum >= maxLngNum) {
            return res.status(400).json({ error: 'Invalid longitude range. Must be: -180 <= minLng < maxLng <= 180' });
        }

        // Fetch potholes in bounding box
        const potholes = await Pothole.find({
            location: {
                $geoWithin: {
                    $box: [
                        [minLngNum, minLatNum], // bottom-left corner [lng, lat]
                        [maxLngNum, maxLatNum]  // top-right corner [lng, lat]
                    ]
                }
            }
        }).sort({ reports: -1, intensity: -1 });

        res.json({
            success: true,
            count: potholes.length,
            data: potholes
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * Public list endpoint to return potholes (optional bbox, limit)
 * Used by docs/map.html to plot potholes on the map
 */
router.get('/list', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit || '500', 10);
        const bbox = req.query.bbox; // minLat,minLng,maxLat,maxLng
        const q = {};
        if (bbox) {
            const parts = String(bbox).split(',').map(s => parseFloat(s.trim()));
            if (parts.length === 4) {
                const [minLat, minLng, maxLat, maxLng] = parts;
                q['location'] = { $geoWithin: { $geometry: { type: 'Polygon', coordinates: [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]] } } };
            }
        }
        const docs = await Pothole.find(q).limit(limit).lean();
        res.json(docs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * @swagger
 * /api/potholes/route-score:
 *   post:
 *     summary: Calculate pothole score for a route
 *     tags: [Pothole]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - routeCoordinates
 *               - routeDistance
 *             properties:
 *               routeCoordinates:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     lat:
 *                       type: number
 *                     lng:
 *                       type: number
 *                 example:
 *                   - lat: 23.0225
 *                     lng: 72.5714
 *                   - lat: 23.0235
 *                     lng: 72.5724
 *               routeDistance:
 *                 type: number
 *                 description: Total route distance in meters
 *                 example: 1500
 *     responses:
 *       '200':
 *         description: Route pothole score calculated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalPotholes:
 *                       type: number
 *                     potholeDensity:
 *                       type: number
 *                     totalIntensity:
 *                       type: number
 *                     intensityScore:
 *                       type: number
 *                     routeDistance:
 *                       type: number
 *                     routeDistanceKm:
 *                       type: number
 *       '400':
 *         description: Invalid input
 *       '401':
 *         description: Unauthorized
 *       '500':
 *         description: Server error
 */
router.post('/route-score', auth, async (req, res) => {
    try {
        const { routeCoordinates, routeDistance } = req.body;

        // Validation
        if (!routeCoordinates || !Array.isArray(routeCoordinates)) {
            return res.status(400).json({ error: 'routeCoordinates must be an array' });
        }

        if (routeCoordinates.length === 0) {
            return res.status(400).json({ error: 'routeCoordinates cannot be empty' });
        }

        if (routeDistance === undefined || typeof routeDistance !== 'number' || routeDistance <= 0) {
            return res.status(400).json({ error: 'routeDistance must be a positive number (in meters)' });
        }

        // Validate each coordinate
        for (let i = 0; i < routeCoordinates.length; i++) {
            const coord = routeCoordinates[i];
            if (!coord.lat || !coord.lng || typeof coord.lat !== 'number' || typeof coord.lng !== 'number') {
                return res.status(400).json({ error: `Invalid coordinate at index ${i}. Each coordinate must have 'lat' and 'lng' as numbers` });
            }

            if (coord.lat < -90 || coord.lat > 90 || coord.lng < -180 || coord.lng > 180) {
                return res.status(400).json({ error: `Invalid coordinate values at index ${i}` });
            }
        }

        // Track unique potholes to avoid double counting
        const foundPotholeIds = new Set();
        let totalIntensity = 0;

        // For each coordinate, find potholes within 20 meters
        for (const coord of routeCoordinates) {
            const nearbyPotholes = await Pothole.find({
                location: {
                    $near: {
                        $geometry: {
                            type: 'Point',
                            coordinates: [coord.lng, coord.lat]
                        },
                        $maxDistance: 20
                    }
                }
            });

            // Add unique potholes
            for (const pothole of nearbyPotholes) {
                const potholeId = pothole._id.toString();
                if (!foundPotholeIds.has(potholeId)) {
                    foundPotholeIds.add(potholeId);
                    totalIntensity += pothole.intensity;
                }
            }
        }

        const totalPotholes = foundPotholeIds.size;
        const routeDistanceKm = routeDistance / 1000;

        // Calculate metrics
        const potholeDensity = routeDistanceKm > 0
            ? parseFloat((totalPotholes / routeDistanceKm).toFixed(2))
            : 0;

        const intensityScore = routeDistanceKm > 0
            ? parseFloat((totalIntensity / routeDistanceKm).toFixed(2))
            : 0;

        res.json({
            success: true,
            data: {
                totalPotholes,
                potholeDensity,
                totalIntensity,
                intensityScore,
                routeDistance,
                routeDistanceKm: parseFloat(routeDistanceKm.toFixed(2))
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * @swagger
 * /api/potholes/stats:
 *   get:
 *     summary: Get overall pothole statistics
 *     tags: [Pothole]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Overall pothole statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalPotholes:
 *                       type: number
 *                     totalReports:
 *                       type: number
 *                     avgIntensity:
 *                       type: number
 *       '401':
 *         description: Unauthorized
 *       '500':
 *         description: Server error
 */
router.get('/stats', auth, async (req, res) => {
    try {
        const totalPotholes = await Pothole.countDocuments();

        const totalReports = await Pothole.aggregate([
            {
                $group: {
                    _id: null,
                    total: { $sum: '$reports' }
                }
            }
        ]);

        const avgIntensity = await Pothole.aggregate([
            {
                $group: {
                    _id: null,
                    avg: { $avg: '$intensity' }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                totalPotholes,
                totalReports: totalReports.length > 0 ? totalReports[0].total : 0,
                avgIntensity: avgIntensity.length > 0 ? parseFloat(avgIntensity[0].avg.toFixed(2)) : 0
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * @swagger
 * /api/potholes/{id}:
 *   delete:
 *     summary: Delete a pothole by ID
 *     tags: [Pothole]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The pothole ID
 *     responses:
 *       '200':
 *         description: Pothole deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       '400':
 *         description: Invalid ID
 *       '401':
 *         description: Unauthorized
 *       '404':
 *         description: Pothole not found
 *       '500':
 *         description: Server error
 */
router.delete('/:id', auth, async (req, res) => {
    try {
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ error: 'Pothole ID required' });
        }

        const pothole = await Pothole.findByIdAndDelete(id);

        if (!pothole) {
            return res.status(404).json({ error: 'Pothole not found' });
        }

        res.json({
            success: true,
            message: 'Pothole deleted successfully'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;

// helper: compute potholes factor for the geohash cell containing lat/lng and update SafetyScore
async function updateSafetyCellPotholes(lat, lng) {
    if (lat == null || lng == null) return;
    const areaId = encode(lat, lng);
    // compute bbox for geohash cell
    const bbox = ngeohash.decode_bbox(areaId); // [minLat, minLon, maxLat, maxLon]
    const [minLat, minLon, maxLat, maxLon] = bbox;
    // find potholes within bbox
    const potholes = await Pothole.find({
        location: {
            $geoWithin: {
                $box: [[minLon, minLat], [maxLon, maxLat]]
            }
        }
    }).lean();

    if (!potholes || potholes.length === 0) {
        // If no potholes in cell, set factor to neutral/high (10)
        const safeFactor = 10;
        const doc = await SafetyScore.findOne({ areaId });
        const newFactors = Object.assign({}, (doc && doc.factors) || {}, { potholes: safeFactor });
        const newScore = calculateSafetyScore(newFactors);
        await SafetyScore.findOneAndUpdate({ areaId }, { areaId, factors: newFactors, score: newScore, lastUpdated: new Date() }, { upsert: true });
        return;
    }

    // compute average intensity (higher intensity == worse)
    let sum = 0;
    for (const p of potholes) sum += (p.intensity || 0);
    const avgIntensity = sum / potholes.length;
    // convert avgIntensity (0..10, higher worse) to safe factor (0..10, higher safer)
    const safeFactor = Math.max(0, Math.min(10, 10 - avgIntensity));

    // update SafetyScore for areaId
    const doc = await SafetyScore.findOne({ areaId });
    const newFactors = Object.assign({}, (doc && doc.factors) || {}, { potholes: safeFactor });
    const newScore = calculateSafetyScore(newFactors);
    await SafetyScore.findOneAndUpdate({ areaId }, { areaId, factors: newFactors, score: newScore, lastUpdated: new Date() }, { upsert: true });
}