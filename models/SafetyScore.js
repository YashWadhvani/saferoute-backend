const mongoose = require("mongoose");
const safetyScoreSchema = new mongoose.Schema({
  areaId: { type: String, required: true, index: true }, // geohash
  score: { type: Number, min: 0, max: 10, default: 5 },
  factors: {
    lighting: { type: Number, min:0, max:10, default: 5 },
    crowd: { type: Number, min:0, max:10, default: 5 },
    police: { type: Number, min:0, max:10, default: 5 },
    incidents: { type: Number, min:0, max:10, default: 5 },
    accidents: { type: Number, min:0, max:10, default: 5 }
  },
  nearestPolice: {
    placeId: { type: String },
    name: { type: String },
    phone: { type: String },
    lat: { type: Number },
    lng: { type: Number },
    distance_m: { type: Number }
  },
  lastUpdated: { type: Date, default: Date.now }
});
module.exports = mongoose.model("SafetyScore", safetyScoreSchema);
