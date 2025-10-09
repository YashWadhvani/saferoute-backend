const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: { 
    type: String, 
    enum: ["harassment", "theft", "accident", "dark_area", "suspicious_activity"],
    required: true 
  },
  description: String,
  location: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true }
  },
  severity: { type: Number, min: 1, max: 5, default: 3 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Report", reportSchema);
