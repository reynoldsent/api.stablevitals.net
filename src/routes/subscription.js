const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { getSubscription, checkout } = require('../controllers/subscriptionController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

const allAccess = requireRole('all_access');

// ── Validators ────────────────────────────────────────────────────────────────

const buyValidators = [
  body('plan').isIn(['monthly', 'yearly']).withMessage('Plan must be monthly or yearly'),
  body('cardLast4')
    .isLength({ min: 4, max: 4 })
    .isNumeric()
    .withMessage('cardLast4 must be exactly 4 digits'),
];

// ── Routes ────────────────────────────────────────────────────────────────────

router.use(authenticate, allAccess);

router.get('/', getSubscription);
router.post('/checkout', buyValidators, checkout);

module.exports = router;
