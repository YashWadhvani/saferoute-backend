const mongoose = require("mongoose");
const ngeohash = require('ngeohash');

const hospitalSchema = new mongoose.Schema({
    placeId: { type: String, unique: true }, // Google Place ID
    name: { type: String, required: true },
    address: { type: String },
    phone: { type: String },
    location: {
        geohash: { type: String, index: true },
        geo: {
            type: { type: String, enum: ['Point'], default: 'Point' },
            coordinates: { type: [Number], default: [0, 0] } // [lng, lat]
        }
    },
    lastUpdated: { type: Date, default: Date.now }
});

hospitalSchema.methods.setLatLng = function (lat, lng) {
    this.location = this.location || {};
    this.location.geo = { type: 'Point', coordinates: [lng, lat] };
    this.location.geohash = ngeohash.encode(lat, lng, 7);
};

hospitalSchema.set('toJSON', {
    virtuals: true,
    transform: function (doc, ret) {
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

module.exports = mongoose.model("Hospital", hospitalSchema);
