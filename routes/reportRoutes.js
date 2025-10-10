const express = require('express');
const Report = require('../models/Report');
const auth = require('../middleware/authMiddleware');
const { encode, decode } = require('../utils/geohashUtils');

const router = express.Router();

/**
 * @swagger
 * /api/reports:
 *   post:
 *     summary: Create a report
 *     tags: [Report]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, location]
 *             properties:
 *               type:
 *                 type: string
 *               description:
 *                 type: string
 *               location:
 *                 type: object
 *                 properties:
 *                   lat: { type: number }
 *                   lng: { type: number }
 */
router.post('/', auth, async (req, res) => {
  try {
    const { type, description, location, severity } = req.body;
    if (!type || !location || location.lat == null || location.lng == null) return res.status(400).json({ error: 'type and location required' });
    const report = new Report({ user: req.user._id, type, description, location, severity });
    await report.save();
    res.json(report);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 *   responses:
 *     '200':
 *       description: Created report
 *       content:
 *         application/json:
  *           schema:
  *             $ref: '#/components/schemas/Report'
  *           example:
  *             _id: '64f1b2c3d4e5f6a7b8c90001'
  *             user: '64f1b2c3d4e5f6a7b8c90000'
  *             type: 'dark_area'
  *             description: 'Poorly lit alley behind the store'
  *             location: { lat: 40.7128, lng: -74.0060 }
  *             severity: 3
 *     '400':
 *       description: Bad request
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/reports:
 *   get:
 *     summary: Query reports (optionally by location)
 *     tags: [Report]
 *     parameters:
 *       - in: query
 *         name: lat
 *         schema:
 *           type: number
 *       - in: query
 *         name: lng
 *         schema:
 *           type: number
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *         description: radius in meters (uses geohash precision rounding)
 */
router.get('/', async (req, res) => {
  try {
    const { lat, lng, radius, type } = req.query;
    let q = {};
    if (type) q.type = type;
    if (lat != null && lng != null) {
      // simple geohash area match at current precision
      const h = encode(Number(lat), Number(lng));
      q['location'] = { $exists: true };
      // naive: search reports where their geohash prefix equals h (requires precomputed hash for scale)
      // we'll approximate by searching reports within nearby lat/lng box using simple comparisons
      const delta = 0.02; // ~2km box; for production use better geospatial queries
      q['location.lat'] = { $gte: Number(lat) - delta, $lte: Number(lat) + delta };
      q['location.lng'] = { $gte: Number(lng) - delta, $lte: Number(lng) + delta };
    }
    const docs = await Report.find(q).sort({ createdAt: -1 }).limit(200);
    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/reports/{id}:
 *   get:
 *     summary: Get a report by id
 *     tags: [Report]
 */
router.get('/:id', async (req, res) => {
  try {
    const doc = await Report.findById(req.params.id).populate('user', 'name email phone');
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
