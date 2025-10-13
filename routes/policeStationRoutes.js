const express = require("express");
const axios = require("axios");
const ngeohash = require("ngeohash");
const PoliceStation = require("../models/PoliceStation");

const router = express.Router();

// Utility function to delay pagination requests
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * @swagger
 * /api/police/fetch-police-stations:
 *   get:
 *     summary: Fetch police stations for a city from Google Places and save them
 *     tags:
 *       - Police
 *     parameters:
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         description: City name to search police stations in (e.g. "Ahmedabad"). If omitted, a default city will be used.
 *     responses:
 *       '200':
 *         description: Fetched and saved police stations count
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
 *               message: "Successfully fetched and saved 24 police stations."
 *               count: 24
 *       '400':
 *         description: Bad request
 *       '500':
 *         description: Server error (missing API key or external API failure)
 */
router.get("/fetch-police-stations", async (req, res) => {
  try {
    const API_KEY = process.env.GOOGLE_MAPS_KEY;
    if (!API_KEY) return res.status(500).json({ error: "Missing Google API Key" });

    const city = (req.query.city || 'Ahmedabad').trim();
    if (!city) return res.status(400).json({ error: 'city query parameter is required' });

    let allResults = [];
    let nextPageToken = null;
    let page = 1;

    // Use Places API v1: places:searchText (POST). Handle pagination via nextPageToken if present.
    // The Places v1 text search expects a textQuery object: { textQuery: { query: '...' }, pageSize }
    do {
  const url = `https://places.googleapis.com/v1/places:searchText?key=${API_KEY}`;
  // Places v1 accepts textQuery as a string in some examples. Send as string to match samples.
  const body = { textQuery: `police stations in ${city}`, pageSize: 50 };
  if (nextPageToken) body.pageToken = nextPageToken;

      console.log(`Fetching page ${page} for city ${city} (Places v1)...`);
      console.log('Request body:', JSON.stringify(body));
      // FieldMask header required by Places v1; allow override via query or env
      const defaultMask = process.env.GOOGLE_PLACES_FIELD_MASK || '*';
      const fieldMask = req.query.fieldMask || defaultMask;
      console.log('Using X-Goog-FieldMask:', fieldMask);
      let data;
      try {
        const resp = await axios.post(url, body, { headers: { 'Content-Type': 'application/json', 'X-Goog-FieldMask': fieldMask } });
        data = resp.data;
      } catch (axErr) {
        // surface detailed error from Google Places API if available
        const errBody = axErr.response && axErr.response.data ? axErr.response.data : axErr.message;
        console.error('Places API request failed:', errBody);
        return res.status(500).json({ error: 'Places API request failed', details: errBody });
      }

      // Accept different response shapes (results, places, candidates)
      const items = data.results || data.places || data.candidates || [];
      if (items.length) allResults.push(...items);

      // The new API may return nextPageToken or next_page_token
      nextPageToken = data.nextPageToken || data.next_page_token || null;
      if (nextPageToken) {
        console.log('Next page token found, waiting 2 seconds...');
        await delay(2000);
        page++;
      }

      // If API returned an error-like status, break and surface it
      if (data.error || data.status === 'PERMISSION_DENIED' || data.status === 'REQUEST_DENIED') {
        console.error('Places API returned error:', data.error || data.status);
        break;
      }
    } while (nextPageToken);

    console.log(`Fetched ${allResults.length} police stations total for ${city}.`);

    // Process and save results (support legacy Place responses and new Places v1 shapes)
    for (const station of allResults) {
      try {
        // id / placeId
        const placeId = station.place_id || station.id || station.name || null;

        // human-friendly name
        const name = (station.displayName && station.displayName.text) || station.name || station.formattedAddress || station.formatted_address || station.shortFormattedAddress || '';

        // address
        const address = station.formattedAddress || station.formatted_address || station.shortFormattedAddress || (station.postalAddress && station.postalAddress.addressLines && station.postalAddress.addressLines.join(', ')) || '';

        // phone
        const phone = station.internationalPhoneNumber || station.international_phone_number || station.formatted_phone_number || station.nationalPhoneNumber || null;

        // coordinates: handle multiple shapes
        let lat = null, lng = null;
        if (station.geometry && station.geometry.location) {
          lat = station.geometry.location.lat;
          lng = station.geometry.location.lng;
        } else if (station.location && (station.location.latitude !== undefined || station.location.lat !== undefined)) {
          lat = station.location.latitude ?? station.location.lat;
          lng = station.location.longitude ?? station.location.lon ?? station.location.lng;
        } else if (station.geometry && station.geometry.lat && station.geometry.lng) {
          lat = station.geometry.lat; lng = station.geometry.lng;
        }

        if (lat == null || lng == null) {
          console.warn('Skipping station without coordinates:', placeId || name);
          continue;
        }

        const geohash = ngeohash.encode(lat, lng, 7);

        await PoliceStation.updateOne(
          { placeId: placeId || `${geohash}-${Math.random().toString(36).slice(2,9)}` },
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
        console.error('Error saving station:', e && e.message || e);
      }
    }

    res.status(200).json({
      message: `Successfully fetched and saved ${allResults.length} police stations for ${city}.`,
      count: allResults.length,
    });

  } catch (err) {
    console.error("Error fetching police stations:", err.message);
    res.status(500).json({ error: "Internal Server Error", details: err.message });
  }
});


/**
 * @swagger
 * /api/police/{placeId}:
 *   get:
 *     summary: Get police station details by placeId
 *     tags: [Police]
 *     parameters:
 *       - in: path
 *         name: placeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Google Place ID or internal place identifier
 *     responses:
 *       '200':
 *         description: Police station document
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PoliceStation'
 *       '404':
 *         description: Not found
 */
router.get('/:placeId', async (req, res) => {
  try {
    const { placeId } = req.params;
    const doc = await PoliceStation.findOne({ placeId });
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/police:
 *   get:
 *     summary: List police stations
 *     tags: [Police]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Max number of stations to return
 *       - in: query
 *         name: bbox
 *         schema:
 *           type: string
 *         description: Bounding box as minLat,minLng,maxLat,maxLng
 *     responses:
 *       '200':
 *         description: List of police stations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/PoliceStation'
 */
router.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit || '500', 10);
    const bbox = req.query.bbox; // minLat,minLng,maxLat,maxLng
    const q = {};
    if (bbox) {
      const parts = String(bbox).split(',').map(s=>parseFloat(s.trim()));
      if (parts.length === 4) {
        const [minLat, minLng, maxLat, maxLng] = parts;
        q['location.geo'] = { $geoWithin: { $geometry: { type: 'Polygon', coordinates: [[ [minLng,minLat], [maxLng,minLat], [maxLng,maxLat], [minLng,maxLat], [minLng,minLat] ]] } } };
      }
    }
    const docs = await PoliceStation.find(q).limit(limit).lean();
    res.json(docs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

