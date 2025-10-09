const express = require("express");
const OTP = require("../models/OTP");
const User = require("../models/User");
const sendEmail = require("../utils/sendEmail");
const sendSMS = require("../utils/sendSMS");
const jwt = require("jsonwebtoken");

const router = express.Router();

// simple rate-limiting: allow once per 60s per identifier (basic)
/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Authentication and OTP endpoints
 */
const lastSent = new Map();

/**
 * @swagger
 * /api/auth/send-otp:
 *   post:
 *     summary: Send a one-time password (OTP) to an identifier (email or phone)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - identifier
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: Email address or phone number to send the OTP to
 *                 example: user@example.com
 *     responses:
 *       '200':
 *         description: OTP sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: OTP sent
 *       '400':
 *         description: Missing or invalid request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       '429':
 *         description: Rate limit - request too soon
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       '500':
 *         description: Server error
 */
router.post("/send-otp", async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ error: "identifier required" });

    const now = Date.now();
    const last = lastSent.get(identifier);
    if (last && now - last < 60 * 1000) {
      return res.status(429).json({ error: "Wait before requesting OTP again" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    await OTP.deleteMany({ identifier });
    await OTP.create({ identifier, otp, expiresAt });

    if (identifier.includes("@")) {
      await sendEmail(identifier, "SafeRoute OTP", `Your OTP is ${otp}. Expires in 5 minutes.`);
    } else {
      await sendSMS(identifier, `SafeRoute OTP: ${otp}. Expires in 5 minutes.`);
    }

    lastSent.set(identifier, now);
    res.json({ message: "OTP sent" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * @swagger
 * /api/auth/verify-otp:
 *   post:
 *     summary: Verify an OTP and return a JWT for the user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - identifier
 *               - otp
 *             properties:
 *               identifier:
 *                 type: string
 *                 description: Email address or phone number used to request the OTP
 *                 example: user@example.com
 *               otp:
 *                 type: string
 *                 description: 6-digit one-time password
 *                 example: '123456'
 *     responses:
 *       '200':
 *         description: Verified - returns JWT and user object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT token
 *                 user:
 *                   type: object
 *                   description: User document
 *       '400':
 *         description: Missing fields, invalid or expired OTP
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       '500':
 *         description: Server error
 */
router.post("/verify-otp", async (req, res) => {
  try {
    const { identifier, otp } = req.body;
    if (!identifier || !otp) return res.status(400).json({ error: "identifier and otp required" });

    const record = await OTP.findOne({ identifier });
    if (!record) return res.status(400).json({ error: "OTP not found" });
    if (record.otp !== otp || record.expiresAt < new Date()) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }
    await OTP.deleteOne({ identifier });

    // find or create user
    let user = await User.findOne({ $or: [{ email: identifier }, { phone: identifier }] });
    if (!user) {
      user = new User(identifier.includes("@") ? { email: identifier } : { phone: identifier });
      await user.save();
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
