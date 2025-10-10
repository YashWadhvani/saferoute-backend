const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * @swagger
 * /api/users/me:
 *   get:
 *     summary: Get current user's profile
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: User profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *             example:
 *               _id: '64f1b2c3d4e5f6a7b8c9d012'
 *               name: 'Test User'
 *               email: 'test@example.com'
 *               phone: '+15550001111'
 *               emergencyContacts: [{ name: 'Friend', phone: '+15552223333' }]
 *       '401':
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/me', auth, async (req, res) => {
  res.json(req.user);
});

/**
 * @swagger
 * /api/users/me:
 *   patch:
 *     summary: Update current user's profile
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               emergencyContacts:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     phone:
 *                       type: string
 */
router.patch('/me', auth, async (req, res) => {
  try {
    const updates = req.body;
    // disallow changing email/phone here for safety - handle separately if needed
    delete updates.email;
    delete updates.phone;
    Object.assign(req.user, updates);
    await req.user.save();
    res.json(req.user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/users/me/contacts:
 *   post:
 *     summary: Add an emergency contact
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               phone: { type: string }
 */
router.post('/me/contacts', auth, async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone required' });
    req.user.emergencyContacts.push({ name, phone });
    await req.user.save();
    res.json(req.user.emergencyContacts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
