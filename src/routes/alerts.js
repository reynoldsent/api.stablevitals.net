const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  createAlert,
  listAlerts,
  getAlert,
  acknowledgeAlert,
  resolveAlert,
} = require('../controllers/alertController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

const notViewOnly = requireRole('all_access', 'basic_access');

// ── Validators ────────────────────────────────────────────────────────────────

const createValidators = [
  body('horseId').isMongoId().withMessage('Valid horseId is required'),
  body('severity').isIn(['check', 'urgent']).withMessage('Severity must be check or urgent'),
  body('kind')
    .isIn(['lowWaterCheck', 'urgentLowWater', 'urgentHighWater', 'persistentHighWater', 'noDrink'])
    .withMessage('Invalid alert kind'),
  body('message').trim().notEmpty().withMessage('Message is required'),
];

const resolveValidators = [
  body('action')
    .isIn([
      'drankAfterCheck',
      'manualWaterOffered',
      'electrolytesOrWetFeed',
      'trainerContacted',
      'veterinarianContacted',
      'horseMoved',
      'watererOrSensorIssue',
      'other',
    ])
    .withMessage('Resolution action is required'),
  body('note').optional().trim(),
];

// ── Routes ────────────────────────────────────────────────────────────────────

router.use(authenticate);

router.get('/', listAlerts);
router.post('/', notViewOnly, createValidators, createAlert);
router.get('/:id', getAlert);
router.post('/:id/acknowledge', notViewOnly, acknowledgeAlert);
router.post('/:id/resolve', notViewOnly, resolveValidators, resolveAlert);

module.exports = router;
