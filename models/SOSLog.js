const mongoose = require("mongoose");

const sosSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  location: {
    lat: Number,
    lng: Number
  },
  contactsNotified: [{ type: String }],
  status: { type: String, enum: ["triggered", "sent", "resolved"], default: "triggered" },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("SOSLog", sosSchema);
    