const mongoose = require("mongoose");
const ngeohash = require('ngeohash');

const policeStationSchema = new mongoose.Schema({
  placeId: { type: String, unique: true }, // Google Place ID
  name: { type: String, required: true },
  address: { type: String },
  phone: { type: String },
  // Store canonical geo + geohash only. Lat/lng are derived on response for convenience.
  location: {
    geohash: { type: String, index: true },
    // GeoJSON point for geospatial queries
    geo: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] } // [lng, lat]
    }
  },
  // rating and user_ratings_total removed for simplicity; keep lastUpdated for sync checks
  lastUpdated: { type: Date, default: Date.now }
});

// Convenience method to set lat/lng and derive geo/geohash
policeStationSchema.methods.setLatLng = function(lat, lng) {
  this.location = this.location || {};
  this.location.geo = { type: 'Point', coordinates: [lng, lat] };
  this.location.geohash = ngeohash.encode(lat, lng, 7);
};

// Expose lat/lng on JSON responses derived from geo.coordinates for compatibility
policeStationSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    try {
      if (ret.location && ret.location.geo && Array.isArray(ret.location.geo.coordinates)) {
        ret.location.lat = ret.location.geo.coordinates[1];
        ret.location.lng = ret.location.geo.coordinates[0];
      }
    } catch (e) {
      // ignore
    }
    return ret;
  }
});

// 2dsphere index for geo queries
policeStationSchema.index({ 'location.geo': '2dsphere' });

module.exports = mongoose.model("PoliceStation", policeStationSchema);
