/**
 * @swagger
 * /api/hospital/{placeId}:
 *   get:
 *     summary: Get hospital details by placeId
 *     tags: [Hospital]
 *     parameters:
 *       - in: path
 *         name: placeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Google Place ID or internal place identifier
 *     responses:
 *       '200':
 *         description: Hospital document
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Hospital'
 *       '404':
 *         description: Not found
 */
router.get('/:placeId', async (req, res) => {
    try {
        const { placeId } = req.params;
        const doc = await Hospital.findOne({ placeId });
        if (!doc) return res.status(404).json({ error: 'Not found' });
        res.json(doc);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * @swagger
 * /api/hospital:
 *   get:
 *     summary: List hospitals
 *     tags: [Hospital]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Max number of hospitals to return
 *       - in: query
 *         name: bbox
 *         schema:
 *           type: string
 *         description: Bounding box as minLat,minLng,maxLat,maxLng
 *     responses:
 *       '200':
 *         description: List of hospitals
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Hospital'
 */
router.get('/', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit || '500', 10);
        const bbox = req.query.bbox; // minLat,minLng,maxLat,maxLng
        const q = {};
        if (bbox) {
            const parts = String(bbox).split(',').map(s => parseFloat(s.trim()));
            if (parts.length === 4) {
                const [minLat, minLng, maxLat, maxLng] = parts;
                q['location.geo'] = { $geoWithin: { $geometry: { type: 'Polygon', coordinates: [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]] } } };
            }
        }
        const docs = await Hospital.find(q).limit(limit).lean();
        res.json(docs);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
const express = require("express");
const axios = require("axios");
const ngeohash = require("ngeohash");
const Hospital = require("../models/Hospital");

const router = express.Router();

// Utility function to delay pagination requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * @swagger
 * /api/hospital/fetch-hospitals:
 *   get:
 *     summary: Fetch hospitals for a city from Google Places and save them
 *     tags:
 *       - Hospital
 *     parameters:
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         description: City name to search hospitals in (e.g. "Ahmedabad"). If omitted, a default city will be used.
 *     responses:
 *       '200':
 *         description: Fetched and saved hospitals count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 count:
 *                   type: integer
 *             example:
 *               message: "Successfully fetched and saved 24 hospitals."
 *               count: 24
 *       '400':
 *         description: Bad request
 */
// ... Implement similar endpoints as policeStationRoutes.js for hospitals ...

module.exports = router;
