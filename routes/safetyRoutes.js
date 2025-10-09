const express = require("express");
const SafetyScore = require("../models/SafetyScore");
const calculateSafetyScore = require("../utils/calculateSafetyScore");
const { encode } = require("../utils/geohashUtils");

const router = express.Router();

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
 *               type: object
 *       '400':
 *         description: Missing areaId and lat/lng
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
 *       '404':
 *         description: Not found
 *       '500':
 *         description: Server error
 */
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
