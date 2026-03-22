// Migration script: group potholes by geohash cell and write per-cell potholes factor to SafetyScore
// Usage: node scripts/migrate-potholes-to-safety.js

const mongoose = require('mongoose');
require('dotenv').config();
const Pothole = require('../models/Pothole');
const SafetyScore = require('../models/SafetyScore');
const { encode } = require('../utils/geohashUtils');
const calculateSafetyScore = require('../utils/calculateSafetyScore');

const MONGO = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/saferoute';

async function main() {
    console.log('Connecting to', MONGO);
    await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('Connected');

    // diagnostic: log pothole collection count and a sample of documents so we can see why cursor may be empty
    try {
        const totalInCollection = await Pothole.countDocuments();
        console.log('Pothole collection count:', totalInCollection);
        const sample = await Pothole.find({}).limit(5).lean();
        console.log('Pothole sample (up to 5 docs):', sample.map(d => ({ _id: d._id, location: d.location, intensity: d.intensity, reports: d.reports })));
    } catch (e) {
        console.warn('Failed to read pothole sample for diagnostics:', e && e.message);
    }

    const cursor = Pothole.find({}).cursor();
    const buckets = new Map(); // areaId -> { sum, count }

    let totalDocs = 0, skippedDocs = 0;
    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
        totalDocs++;
        if (!doc.location || !Array.isArray(doc.location.coordinates) || doc.location.coordinates.length < 2) {
            skippedDocs++;
            continue;
        }
        const lng = doc.location.coordinates[0];
        const lat = doc.location.coordinates[1];
        const areaId = encode(lat, lng);
        const intensity = typeof doc.intensity === 'number' ? doc.intensity : 0;
        const b = buckets.get(areaId) || { sum: 0, count: 0 };
        b.sum += intensity;
        b.count += 1;
        buckets.set(areaId, b);
    }

    console.log('Scanned', totalDocs, 'pothole documents (skipped', skippedDocs, 'invalid)');

    console.log('Computed', buckets.size, 'cells from potholes');

    let i = 0;
    for (const [areaId, { sum, count }] of buckets.entries()) {
        const avgIntensity = sum / count;
        const safeFactor = Math.max(0, Math.min(10, 10 - avgIntensity));
        const doc = await SafetyScore.findOne({ areaId }).lean();
        const newFactors = Object.assign({}, (doc && doc.factors) || {}, { potholes: safeFactor });
        const newScore = calculateSafetyScore(newFactors);
        await SafetyScore.findOneAndUpdate({ areaId }, { areaId, factors: newFactors, score: newScore, lastUpdated: new Date() }, { upsert: true });
        i++;
        if (i % 100 === 0) console.log('Updated', i, 'cells');
    }

    console.log('Migration complete. Updated', i, 'cells.');
    await mongoose.disconnect();
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
