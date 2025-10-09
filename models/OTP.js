const mongoose = require("mongoose");
const otpSchema = new mongoose.Schema({
  identifier: { type: String, required: true }, // phone or email
  otp: { type: String, required: true },
  expiresAt: { type: Date, required: true }
});
module.exports = mongoose.model("OTP", otpSchema);
