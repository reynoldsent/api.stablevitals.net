const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

const { signup, login, logout, forgotPassword, verifyOtp, resetPassword } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// ── Validators ────────────────────────────────────────────────────────────────

const signupValidators = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('barnName').optional().trim(),
  body('timezone').optional().trim(),
];

const loginValidators = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

const forgotValidators = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
];

const verifyOtpValidators = [
  body('email').isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('otp')
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage('Code must be 6 digits'),
];

const resetValidators = [
  body('resetToken').notEmpty().withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
];

// ── Routes ────────────────────────────────────────────────────────────────────

router.post('/signup', signupValidators, signup);
router.post('/login', loginValidators, login);
router.post('/forgot-password', forgotValidators, forgotPassword);
router.post('/verify-otp', verifyOtpValidators, verifyOtp);
router.post('/reset-password', resetValidators, resetPassword);
router.post('/logout', authenticate, logout);

module.exports = router;
