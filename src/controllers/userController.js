const crypto = require('crypto');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const Barn = require('../models/Barn');
const Horse = require('../models/Horse');

const sendValidationError = (res, errors) =>
  res.status(422).json({ success: false, errors: errors.array() });

const horsesBelongToBarn = async (barnId, ids) => {
  if (!ids || ids.length === 0) return true;
  const unique = [...new Set(ids.map(String))];
  const count = await Horse.countDocuments({ _id: { $in: unique }, barnId });
  return count === unique.length;
};

/**
 * GET /api/v1/users
 * all_access only – list all users in the barn.
 */
const listUsers = async (req, res, next) => {
  try {
    const users = await User.find({ barnId: req.user.barnId })
      .select('-passwordHash')
      .lean();
    return res.status(200).json({ success: true, users });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/users/invite
 * all_access only – create an invited user with a temporary password.
 */
const inviteUser = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors);

  try {
    const { name, email, role, allowedHorseIds } = req.body;

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }

    if (!(await horsesBelongToBarn(req.user.barnId, allowedHorseIds))) {
      return res.status(422).json({
        success: false,
        message: 'One or more horses are not in this barn',
      });
    }

    const temporaryPassword = crypto.randomBytes(12).toString('base64url');
    const passwordHash = await User.hashPassword(temporaryPassword);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      passwordHash,
      barnId: req.user.barnId,
      role: role || 'basic_access',
      allowedHorseIds: (allowedHorseIds || []).map(String),
      status: 'invited',
    });

    return res.status(201).json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        barnId: user.barnId,
        status: user.status,
        allowedHorseIds: user.allowedHorseIds,
        createdAt: user.createdAt,
      },
      temporaryPassword,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/users/:userId
 * all_access only – update role and/or allowedHorseIds.
 */
const updateUser = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors);

  try {
    const { id: userId } = req.params;
    const { role, allowedHorseIds } = req.body;

    const user = await User.findOne({ _id: userId, barnId: req.user.barnId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const barn = await Barn.findById(req.user.barnId).lean();
    if (barn && barn.ownerId.toString() === userId && role && role !== 'all_access') {
      return res.status(400).json({ success: false, message: "Cannot change the barn owner's role" });
    }
    if (userId === req.user._id.toString() && role && role !== user.role) {
      return res.status(400).json({ success: false, message: 'You cannot change your own role' });
    }
    if (!(await horsesBelongToBarn(req.user.barnId, allowedHorseIds))) {
      return res.status(422).json({
        success: false,
        message: 'One or more horses are not in this barn',
      });
    }

    if (role !== undefined) user.role = role;
    if (allowedHorseIds !== undefined) user.allowedHorseIds = allowedHorseIds.map(String);
    await user.save();

    return res.status(200).json({
      success: true,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        barnId: user.barnId,
        status: user.status,
        allowedHorseIds: user.allowedHorseIds,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/v1/users/:userId
 * all_access only – cannot delete the barn owner.
 */
const removeUser = async (req, res, next) => {
  try {
    const { id: userId } = req.params;

    const user = await User.findOne({ _id: userId, barnId: req.user.barnId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const barn = await Barn.findById(req.user.barnId).lean();
    if (barn && barn.ownerId.toString() === userId) {
      return res
        .status(400)
        .json({ success: false, message: 'Cannot remove the barn owner' });
    }
    if (req.user._id.toString() === userId) {
      return res.status(400).json({ success: false, message: 'You cannot remove yourself' });
    }

    await user.deleteOne();

    return res.status(200).json({ success: true, message: 'User removed successfully' });
  } catch (err) {
    next(err);
  }
};

module.exports = { listUsers, inviteUser, updateUser, removeUser };
