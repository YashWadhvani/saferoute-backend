const mongoose = require("mongoose");
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true, sparse: true },
  phone: { type: String, unique: true, sparse: true },
  authProvider: { type: String, enum: ["otp", "google"], default: "otp" },
  emergencyContacts: [{ name: String, phone: String }],
  recentRoutes: [{
    origin: { type: String, default: '' },
    destination: { type: String, default: '' },
    distance: { type: String, default: '' },
    duration: { type: String, default: '' },
    safety: { type: Number, default: 0 },
    tags: [{ type: String }],
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model("User", userSchema);
