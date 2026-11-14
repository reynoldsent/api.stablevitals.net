const crypto = require('crypto');
const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { confirmPayment } = require('../controllers/subscriptionController');

const requireWebhookSecret = (req, res, next) => {
  const expected = process.env.PAYMENT_WEBHOOK_SECRET;
  const provided = req.get('x-webhook-secret') || '';

  if (!expected) {
    return res.status(500).json({ success: false, message: 'Payment webhook is not configured' });
  }

  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  const matches =
    expectedBuf.length === providedBuf.length &&
    crypto.timingSafeEqual(expectedBuf, providedBuf);

  if (!matches) {
    return res.status(401).json({ success: false, message: 'Invalid webhook secret' });
  }

  next();
};

const confirmValidators = [
  body('checkoutId').isUUID().withMessage('checkoutId must be a UUID'),
  body('event')
    .isIn(['payment.succeeded', 'payment.failed'])
    .withMessage('event must be payment.succeeded or payment.failed'),
];

router.post('/payment', requireWebhookSecret, confirmValidators, confirmPayment);

module.exports = router;
