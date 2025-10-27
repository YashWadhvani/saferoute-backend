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
    // normalize
    const contact = { name: name ? String(name).trim() : '', phone: String(phone).trim() };
    req.user.emergencyContacts.push(contact);
    // ensure Mongoose notices the array change in all cases
    if (typeof req.user.markModified === 'function') req.user.markModified('emergencyContacts');
    await req.user.save();
    // re-fetch fresh user from DB to avoid any cached/attached doc surprises
    const fresh = await User.findById(req.user._id).lean();
    if (!fresh) return res.status(500).json({ error: 'Failed to reload user' });
    res.json(fresh.emergencyContacts || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get emergency contacts for current user
/**
 * @swagger
 * /api/users/me/contacts:
 *   get:
 *     summary: Get emergency contacts for current user
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Array of emergency contacts
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   name: { type: string }
 *                   phone: { type: string }
 *       '401':
 *         description: Unauthorized
 */
router.get('/me/contacts', auth, async (req, res) => {
  try {
    const contacts = Array.isArray(req.user?.emergencyContacts) ? req.user.emergencyContacts : [];
    res.json(contacts);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/users/me/contacts/{contactId}:
 *   delete:
 *     summary: Remove an emergency contact by its id
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: contactId
 *         required: true
 *         schema:
 *           type: string
 *         description: The _id of the emergency contact subdocument to remove
 *     responses:
 *       '200':
 *         description: Updated contacts array
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   name: { type: string }
 *                   phone: { type: string }
 *       '400':
 *         description: Bad request
 *       '401':
 *         description: Unauthorized
 */
router.delete('/me/contacts/:contactId', auth, async (req, res) => {
  try {
    const { contactId } = req.params;
    if (!contactId) return res.status(400).json({ error: 'contactId required' });
    // remove by subdocument _id
    const before = Array.isArray(req.user.emergencyContacts) ? req.user.emergencyContacts.length : 0;
    req.user.emergencyContacts = (req.user.emergencyContacts || []).filter(c => String(c._id || c.id || c.phone) !== String(contactId));
    if (typeof req.user.markModified === 'function') req.user.markModified('emergencyContacts');
    await req.user.save();
    const fresh = await User.findById(req.user._id).lean();
    return res.json(fresh?.emergencyContacts || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/users/me/contacts:
 *   delete:
 *     summary: Remove an emergency contact by phone (query) or body
 *     tags: [User]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: phone
 *         schema:
 *           type: string
 *         description: Phone number of contact to remove (optional; can be provided in body)
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               phone:
 *                 type: string
 *     responses:
 *       '200':
 *         description: Updated contacts array
 *       '400':
 *         description: phone required
 */
router.delete('/me/contacts', auth, async (req, res) => {
  try {
    const phone = req.query.phone || (req.body && req.body.phone);
    if (!phone) return res.status(400).json({ error: 'phone required' });
    const norm = String(phone).trim();
    req.user.emergencyContacts = (req.user.emergencyContacts || []).filter(c => String(c.phone).trim() !== norm);
    if (typeof req.user.markModified === 'function') req.user.markModified('emergencyContacts');
    await req.user.save();
    const fresh = await User.findById(req.user._id).lean();
    return res.json(fresh?.emergencyContacts || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
