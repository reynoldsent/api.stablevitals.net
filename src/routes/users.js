const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const {
  listUsers,
  inviteUser,
  updateUser,
  removeUser,
} = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/roles');

const allAccess = requireRole('all_access');

// ── Validators ────────────────────────────────────────────────────────────────

const inviteValidators = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('role')
    .optional()
    .isIn(['all_access', 'basic_access', 'view_only'])
    .withMessage('Invalid role'),
  body('allowedHorseIds').optional().isArray().withMessage('allowedHorseIds must be an array'),
];

const updateValidators = [
  body('role')
    .optional()
    .isIn(['all_access', 'basic_access', 'view_only'])
    .withMessage('Invalid role'),
  body('allowedHorseIds').optional().isArray().withMessage('allowedHorseIds must be an array'),
];

// ── Routes ────────────────────────────────────────────────────────────────────

router.use(authenticate);

router.get('/', allAccess, listUsers);
router.post('/invite', allAccess, inviteValidators, inviteUser);
router.patch('/:id', allAccess, updateValidators, updateUser);
router.delete('/:id', allAccess, removeUser);

module.exports = router;
