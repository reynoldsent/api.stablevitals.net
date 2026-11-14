const crypto = require('crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

const User = require('../models/User');
const Barn = require('../models/Barn');
const Subscription = require('../models/Subscription');
const RevokedToken = require('../models/RevokedToken');
const PasswordReset = require('../models/PasswordReset');
const { mailConfigured, sendPasswordResetCode } = require('../config/mail');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const OTP_TTL_MS = 10 * 60 * 1000;
const RESET_TTL_MS = 15 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

const signToken = (userId, barnId, role, tokenVersion = 0) =>
  jwt.sign(
    { userId, barnId, role, tokenVersion, jti: crypto.randomUUID() },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

const hashOtp = (otp) =>
  crypto.createHash('sha256').update(`${otp}:${process.env.JWT_SECRET}`).digest('hex');

const otpsMatch = (otp, otpHash) => {
  const actual = Buffer.from(hashOtp(otp));
  const expected = Buffer.from(otpHash);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
};

const sendValidationError = (res, errors) =>
  res.status(422).json({ success: false, errors: errors.array() });

// ─── Controllers ─────────────────────────────────────────────────────────────

const transactionsUnsupported = (err) =>
  /replica set|transaction numbers are only allowed/i.test(err.message || '');

/**
 * Create the barn, owner, and empty subscription together.
 * session is null when the database cannot run transactions.
 */
const createBarnAccount = async ({ name, email, password, barnName, timezone }, session) => {
  const opts = session ? { session } : undefined;
  const normalizedEmail = email.toLowerCase();

  const existingQuery = User.findOne({ email: normalizedEmail });
  if (session) existingQuery.session(session);
  if (await existingQuery) return { conflict: true };

  const [barn] = await Barn.create(
    [
      {
        name: barnName || `${name}'s Barn`,
        timezone: timezone || 'UTC',
        ownerId: new mongoose.Types.ObjectId(),
        settings: {
          checkSensitivity: 'standard',
          notifyUrgent: true,
          notifyCheck: true,
          notifyOffline: true,
        },
      },
    ],
    opts
  );

  const passwordHash = await User.hashPassword(password);
  const [user] = await User.create(
    [
      {
        name,
        email: normalizedEmail,
        passwordHash,
        barnId: barn._id,
        role: 'all_access',
        status: 'active',
      },
    ],
    opts
  );

  barn.ownerId = user._id;
  await barn.save(opts);
  await Subscription.create([{ barnId: barn._id, status: 'none' }], opts);

  return { user, barn };
};

/**
 * POST /api/v1/auth/signup
 * Create Barn + User (all_access) + Subscription (none).
 */
const signup = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors);

  try {
    let account;
    const session = await mongoose.startSession();
    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          session.startTransaction();
          account = await createBarnAccount(req.body, session);
          if (account.conflict) await session.abortTransaction();
          else await session.commitTransaction();
          break;
        } catch (err) {
          if (session.inTransaction()) await session.abortTransaction();
          if (transactionsUnsupported(err)) {
            account = await createBarnAccount(req.body, null);
            break;
          }
          const retryable =
            err.code === 112 ||
            (typeof err.hasErrorLabel === 'function' && err.hasErrorLabel('TransientTransactionError'));
          if (!retryable || attempt === 2) throw err;
        }
      }
    } finally {
      session.endSession();
    }

    if (account.conflict) {
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }

    const { user, barn } = account;
    const token = signToken(user._id.toString(), barn._id.toString(), user.role, user.tokenVersion || 0);

    return res.status(201).json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        barnId: barn._id,
        status: user.status,
      },
      barn: {
        _id: barn._id,
        name: barn.name,
        timezone: barn.timezone,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }
    next(err);
  }
};

/**
 * POST /api/v1/auth/login
 */
const login = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors);

  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const barn = await Barn.findById(user.barnId).lean();

    const token = signToken(
      user._id.toString(),
      user.barnId.toString(),
      user.role,
      user.tokenVersion || 0
    );

    // If user was invited, mark them active on first login after password set
    if (user.status === 'invited') {
      user.status = 'active';
      await user.save();
    }

    return res.status(200).json({
      success: true,
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        barnId: user.barnId,
        status: user.status,
        allowedHorseIds: user.allowedHorseIds,
      },
      barn,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/logout
 * Revoke the current JWT until it would have expired.
 */
const logout = async (req, res, next) => {
  try {
    const expiresAt = req.auth.exp ? new Date(req.auth.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await RevokedToken.updateOne(
      { jti: req.auth.jti },
      { $setOnInsert: { jti: req.auth.jti, expiresAt } },
      { upsert: true }
    );

    return res.status(200).json({ success: true, message: 'Logged out successfully' });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(200).json({ success: true, message: 'Logged out successfully' });
    }
    next(err);
  }
};

/**
 * GET /api/v1/me
 */
const me = async (req, res, next) => {
  try {
    const barn = await Barn.findById(req.user.barnId).lean();
    return res.status(200).json({
      success: true,
      user: {
        _id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        barnId: req.user.barnId,
        status: req.user.status,
        allowedHorseIds: req.user.allowedHorseIds,
        createdAt: req.user.createdAt,
      },
      barn,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/forgot-password
 * Creates a 10-minute code and emails it when SMTP is configured.
 */
const forgotPassword = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors);

  try {
    if (process.env.NODE_ENV === 'production' && !mailConfigured()) {
      return res.status(503).json({ success: false, message: 'Email is not configured' });
    }

    const email = req.body.email.toLowerCase();
    const user = await User.findOne({ email });
    const payload = {
      success: true,
      message: 'If that email is registered, a reset code was sent.',
      expiresInMinutes: 10,
    };

    if (!user) return res.status(200).json(payload);

    const otp = String(crypto.randomInt(100000, 1000000));
    await PasswordReset.deleteMany({ userId: user._id, usedAt: { $exists: false } });
    await PasswordReset.create({
      userId: user._id,
      otpHash: hashOtp(otp),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    const shouldSend = mailConfigured() && process.env.NODE_ENV !== 'test';
    if (shouldSend) {
      try {
        await sendPasswordResetCode({ to: user.email, name: user.name, otp });
      } catch (err) {
        await PasswordReset.deleteMany({ userId: user._id, usedAt: { $exists: false } });
        err.status = 503;
        err.message = 'Could not send the reset email';
        throw err;
      }
    } else if (process.env.NODE_ENV !== 'production') {
      payload.otp = otp;
      payload.message = 'If that email is registered, a reset code is ready.';
    }

    return res.status(200).json(payload);
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/verify-otp
 * Confirms the code and returns a short-lived reset token.
 */
const verifyOtp = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors);

  try {
    const email = req.body.email.toLowerCase();
    const user = await User.findOne({ email });
    const reset = user
      ? await PasswordReset.findOne({
          userId: user._id,
          usedAt: { $exists: false },
          verifiedAt: { $exists: false },
          expiresAt: { $gt: new Date() },
        }).sort({ createdAt: -1 })
      : null;

    if (!reset || reset.attempts >= MAX_OTP_ATTEMPTS) {
      return res.status(401).json({ success: false, message: 'Invalid or expired code' });
    }

    if (!otpsMatch(String(req.body.otp), reset.otpHash)) {
      reset.attempts += 1;
      await reset.save();
      return res.status(401).json({ success: false, message: 'Invalid or expired code' });
    }

    const jti = crypto.randomUUID();
    reset.verifiedAt = new Date();
    reset.resetJti = jti;
    reset.expiresAt = new Date(Date.now() + RESET_TTL_MS);
    await reset.save();

    const resetToken = jwt.sign(
      { purpose: 'password_reset', userId: user._id.toString(), jti },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    return res.status(200).json({
      success: true,
      resetToken,
      expiresInMinutes: 15,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/reset-password
 * Sets a new password and signs out existing sessions.
 */
const resetPassword = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors);

  try {
    let decoded;
    try {
      decoded = jwt.verify(req.body.resetToken, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired reset token' });
    }

    if (decoded.purpose !== 'password_reset' || !decoded.jti) {
      return res.status(401).json({ success: false, message: 'Invalid or expired reset token' });
    }

    const reset = await PasswordReset.findOne({
      userId: decoded.userId,
      resetJti: decoded.jti,
      usedAt: { $exists: false },
      expiresAt: { $gt: new Date() },
    });
    if (!reset || !reset.verifiedAt) {
      return res.status(401).json({ success: false, message: 'Invalid or expired reset token' });
    }

    const user = await User.findById(decoded.userId).select('+passwordHash');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid or expired reset token' });
    }

    if (await user.comparePassword(req.body.password)) {
      return res.status(422).json({
        success: false,
        message: 'New password must be different from the current password',
      });
    }

    user.passwordHash = await User.hashPassword(req.body.password);
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    reset.usedAt = new Date();
    await user.save();
    await reset.save();

    return res.status(200).json({
      success: true,
      message: 'Password updated. Please log in again',
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { signup, login, logout, me, forgotPassword, verifyOtp, resetPassword };
