const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { getSettings, updateSettings } = require('../controllers/settingsController');

const isJsonBoolean = (value) => value === true || value === false;
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

const notViewOnly = requireRole('all_access', 'basic_access');

// ── Validators ────────────────────────────────────────────────────────────────

const updateValidators = [
  body('name').optional().trim().notEmpty().withMessage('Barn name cannot be empty'),
  body('timezone').optional().trim(),
  body('checkSensitivity')
    .optional()
    .isIn(['more', 'standard', 'less'])
    .withMessage('checkSensitivity must be more, standard, or less'),
  body('notifyUrgent').optional().custom(isJsonBoolean).withMessage('notifyUrgent must be true or false'),
  body('notifyCheck').optional().custom(isJsonBoolean).withMessage('notifyCheck must be true or false'),
  body('notifyOffline').optional().custom(isJsonBoolean).withMessage('notifyOffline must be true or false'),
];

// ── Routes ────────────────────────────────────────────────────────────────────

router.use(authenticate);

router.get('/', notViewOnly, getSettings);
router.patch('/', notViewOnly, updateValidators, updateSettings);

module.exports = router;
