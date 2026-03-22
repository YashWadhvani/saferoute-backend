const express = require("express");
const axios = require("axios");
const ngeohash = require("ngeohash");
const Hospital = require("../models/Hospital");

const router = express.Router();

// Utility function to delay pagination requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
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
 *       '500':
 *         description: Server error (missing API key or external API failure)
 */
router.get("/fetch-hospitals", async (req, res) => {
    try {
        const API_KEY = process.env.GOOGLE_MAPS_KEY;
        if (!API_KEY) return res.status(500).json({ error: "Missing Google API Key" });

        const city = (req.query.city || 'Ahmedabad').trim();
        if (!city) return res.status(400).json({ error: 'city query parameter is required' });

        let allResults = [];
        let nextPageToken = null;
        let page = 1;

        do {
            const url = `https://places.googleapis.com/v1/places:searchText?key=${API_KEY}`;
            const body = { textQuery: `hospitals in ${city}`, pageSize: 50 };
            if (nextPageToken) body.pageToken = nextPageToken;

            console.log(`Fetching page ${page} for city ${city} (Places v1)...`);
            console.log('Request body:', JSON.stringify(body));
            const defaultMask = process.env.GOOGLE_PLACES_FIELD_MASK || '*';
            const fieldMask = req.query.fieldMask || defaultMask;
            console.log('Using X-Goog-FieldMask:', fieldMask);
            let data;
            try {
                const resp = await axios.post(url, body, { headers: { 'Content-Type': 'application/json', 'X-Goog-FieldMask': fieldMask } });
                data = resp.data;
            } catch (axErr) {
                const errBody = axErr.response && axErr.response.data ? axErr.response.data : axErr.message;
                console.error('Places API request failed:', errBody);
                return res.status(500).json({ error: 'Places API request failed', details: errBody });
            }

            const items = data.results || data.places || data.candidates || [];
            if (items.length) allResults.push(...items);

            nextPageToken = data.nextPageToken || data.next_page_token || null;
            if (nextPageToken) {
                console.log('Next page token found, waiting 2 seconds...');
                await delay(2000);
                page++;
            }

            if (data.error || data.status === 'PERMISSION_DENIED' || data.status === 'REQUEST_DENIED') {
                console.error('Places API returned error:', data.error || data.status);
                break;
            }
        } while (nextPageToken);

        console.log(`Fetched ${allResults.length} hospitals total for ${city}.`);

        for (const hospital of allResults) {
            try {
                const placeId = hospital.place_id || hospital.id || hospital.name || null;
                const name = (hospital.displayName && hospital.displayName.text) || hospital.name || hospital.formattedAddress || hospital.formatted_address || hospital.shortFormattedAddress || '';
                const address = hospital.formattedAddress || hospital.formatted_address || hospital.shortFormattedAddress || (hospital.postalAddress && hospital.postalAddress.addressLines && hospital.postalAddress.addressLines.join(', ')) || '';
                const phone = hospital.internationalPhoneNumber || hospital.international_phone_number || hospital.formatted_phone_number || hospital.nationalPhoneNumber || null;
                let lat = null, lng = null;
                if (hospital.geometry && hospital.geometry.location) {
                    lat = hospital.geometry.location.lat;
                    lng = hospital.geometry.location.lng;
                } else if (hospital.location && (hospital.location.latitude !== undefined || hospital.location.lat !== undefined)) {
                    lat = hospital.location.latitude ?? hospital.location.lat;
                    lng = hospital.location.longitude ?? hospital.location.lon ?? hospital.location.lng;
                } else if (hospital.geometry && hospital.geometry.lat && hospital.geometry.lng) {
                    lat = hospital.geometry.lat; lng = hospital.geometry.lng;
                }
                if (lat == null || lng == null) {
                    console.warn('Skipping hospital without coordinates:', placeId || name);
                    continue;
                }
                const geohash = ngeohash.encode(lat, lng, 7);
                await Hospital.updateOne(
                    { placeId: placeId || `${geohash}-${Math.random().toString(36).slice(2, 9)}` },
                    {
                        placeId: placeId,
                        name,
                        address,
                        phone,
                        location: { geohash, geo: { type: 'Point', coordinates: [lng, lat] } },
                        lastUpdated: new Date()
                    },
                    { upsert: true }
                );
            } catch (e) {
                console.error('Error saving hospital:', e && e.message || e);
            }
        }

        res.status(200).json({
            message: `Successfully fetched and saved ${allResults.length} hospitals for ${city}.`,
            count: allResults.length,
        });

    } catch (err) {
        console.error("Error fetching hospitals:", err.message);
        res.status(500).json({ error: "Internal Server Error", details: err.message });
    }
});

module.exports = router;
