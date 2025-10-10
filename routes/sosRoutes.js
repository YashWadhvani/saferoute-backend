const express = require('express');
const SOSLog = require('../models/SOSLog');
const auth = require('../middleware/authMiddleware');
const { encode } = require('../utils/geohashUtils');
const sendSMS = require('../utils/sendSMS');

const router = express.Router();

/**
 * @swagger
 * /api/sos/trigger:
 *   post:
 *     summary: Trigger an SOS for current user
 *     tags: [SOS]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               location:
 *                 type: object
 *                 properties:
 *                   lat: { type: number }
 *                   lng: { type: number }
 *               contactsNotified:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       '200':
 *         description: Created SOSLog (with contactsNotified/status)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SOSLog'
 *             example:
 *               _id: '64f1b2c3d4e5f6a7b8c90011'
 *               user: '64f1b2c3d4e5f6a7b8c90000'
 *               location: { lat: 40.7128, lng: -74.0060 }
 *               contactsNotified: ['+15551234567']
 *               status: 'sent'
 *       '401':
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/trigger', auth, async (req, res) => {
  try {
    const { location, contactsNotified } = req.body;
    const doc = new SOSLog({ user: req.user._id, location, contactsNotified, status: 'triggered' });
    await doc.save();
    // In production you'd notify contacts here (email/SMS)
    // Notify emergency contacts from the user's profile (if any)
    const contacts = (req.user.emergencyContacts || []).map(c => c.phone).filter(Boolean);
    if (contacts.length) {
      const lat = location?.lat;
      const lng = location?.lng;
      const mapLink = (lat != null && lng != null) ? `https://maps.google.com/?q=${lat},${lng}` : '';
      const name = req.user.name || 'A trusted contact';
      const message = lat != null && lng != null
        ? `SOS from ${name}. Location: ${mapLink}`
        : `SOS from ${name}. Please check on them.`;

      // send SMS in parallel and record successes
      const results = await Promise.allSettled(contacts.map(to => sendSMS(to, message)));
      const succeeded = [];
      results.forEach((r, idx) => {
        if (r.status === 'fulfilled') succeeded.push(contacts[idx]);
        else console.error('SMS send failed to', contacts[idx], r.reason && r.reason.message ? r.reason.message : r.reason);
      });

      doc.contactsNotified = succeeded;
      if (succeeded.length) doc.status = 'sent';
      await doc.save();
    }

    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @swagger
 * /api/sos/{id}/resolve:
 *   patch:
 *     summary: Mark SOS as resolved
 *     tags: [SOS]
 *     security:
 *       - bearerAuth: []
 */
router.patch('/:id/resolve', auth, async (req, res) => {
  try {
    const doc = await SOSLog.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    // allow owner or admin only - simplistic owner check
    if (doc.user && doc.user.toString() !== req.user._id.toString()) return res.status(403).json({ error: 'Forbidden' });
    doc.status = 'resolved';
    await doc.save();
    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
