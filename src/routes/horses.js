const express = require('express');
const { body, query } = require('express-validator');
const router = express.Router();

const {
  listHorses,
  createHorse,
  getHorse,
  updateHorse,
  archiveHorse,
  awayHorse,
  moveHorse,
  updateMonitoring,
  approveBaseline,
  getLogNotes,
  addLogNote,
  getCareEntries,
  addCareEntry,
  getCareReport,
} = require('../controllers/horseController');

const { authenticate } = require('../middleware/auth');

const isJsonBoolean = (value) => value === true || value === false;
const { requireRole } = require('../middleware/roles');

const allAccess = requireRole('all_access');
const notViewOnly = requireRole('all_access', 'basic_access');

// ── Validators ────────────────────────────────────────────────────────────────

const createHorseValidators = [
  body('name').trim().notEmpty().withMessage('Horse name is required'),
  body('stall').trim().notEmpty().withMessage('Stall is required'),
  body('aisle').optional().trim(),
  body('age').optional().isNumeric().withMessage('Age must be a number'),
  body('dob').optional().isISO8601().withMessage('DOB must be a valid ISO date'),
  body('waterTarget').optional().isNumeric(),
  body('waterTargetRange').optional().isNumeric(),
  body('lowWaterCheckPercent').optional().isNumeric(),
  body('urgentNoDrinkHours').optional().isNumeric(),
  body('highWaterPercent').optional().isNumeric(),
  body('hoursWithoutDrink').optional().isNumeric(),
];

const updateHorseValidators = [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('stall').optional().trim().notEmpty().withMessage('Stall cannot be empty'),
  body('age').optional().isNumeric().withMessage('Age must be a number'),
  body('dob').optional().isISO8601().withMessage('DOB must be a valid ISO date'),
];

const moveValidators = [
  body('stall').trim().notEmpty().withMessage('Stall is required'),
  body('effectiveAt').optional().isISO8601().withMessage('effectiveAt must be a valid ISO date'),
];

const monitoringValidators = [
  body('monitoringEnabled')
    .optional()
    .custom(isJsonBoolean)
    .withMessage('monitoringEnabled must be true or false'),
  body('waterTarget').optional().isNumeric(),
  body('waterTargetRange').optional().isNumeric(),
  body('lowWaterCheckPercent').optional().isNumeric(),
  body('urgentNoDrinkHours').optional().isNumeric(),
  body('highWaterPercent').optional().isNumeric(),
  body('hoursWithoutDrink').optional().isNumeric(),
];

const logNoteValidators = [
  body('text').trim().notEmpty().withMessage('Note text is required'),
];

const careEntryValidators = [
  body('category')
    .isIn(['food', 'electrolyte', 'supplement', 'other'])
    .withMessage('Invalid category'),
  body('item').trim().notEmpty().withMessage('Item is required'),
  body('amount').optional().trim(),
  body('notes').optional().trim(),
  body('at').isISO8601().withMessage('Event time (at) must be a valid ISO date'),
];

// ── Routes ────────────────────────────────────────────────────────────────────

router.use(authenticate);

// Core CRUD
router.get('/', listHorses);
router.post('/', allAccess, createHorseValidators, createHorse);
router.get('/:id', getHorse);
router.patch('/:id', allAccess, updateHorseValidators, updateHorse);

// Status mutations
router.post('/:id/archive', allAccess, archiveHorse);
router.post('/:id/away', notViewOnly, awayHorse);
router.post('/:id/move', allAccess, moveValidators, moveHorse);
router.patch('/:id/monitoring', notViewOnly, monitoringValidators, updateMonitoring);
router.post('/:id/approve-baseline', allAccess, approveBaseline);

// Log Notes
router.get('/:id/log-notes', getLogNotes);
router.post('/:id/log-notes', notViewOnly, logNoteValidators, addLogNote);

// Care Entries
router.get('/:id/care-entries', getCareEntries);
router.post('/:id/care-entries', notViewOnly, careEntryValidators, addCareEntry);
router.get('/:id/care-report', getCareReport);

module.exports = router;
