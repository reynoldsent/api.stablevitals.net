const { validationResult } = require('express-validator');
const Barn = require('../models/Barn');

const sendValidationError = (res, errors) =>
  res.status(422).json({ success: false, errors: errors.array() });

/**
 * GET /api/v1/settings
 * all_access, basic_access
 */
const getSettings = async (req, res, next) => {
  try {
    const barn = await Barn.findById(req.user.barnId).lean();
    if (!barn) {
      return res.status(404).json({ success: false, message: 'Barn not found' });
    }

    return res.status(200).json({
      success: true,
      settings: {
        barnId: barn._id,
        name: barn.name,
        timezone: barn.timezone,
        ...barn.settings,
      },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/settings
 * all_access, basic_access – update barn notification settings
 */
const updateSettings = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors);

  try {
    const barn = await Barn.findById(req.user.barnId);
    if (!barn) {
      return res.status(404).json({ success: false, message: 'Barn not found' });
    }

    const { name, timezone, checkSensitivity, notifyUrgent, notifyCheck, notifyOffline } =
      req.body;

    // Top-level barn fields
    if (name !== undefined) barn.name = name;
    if (timezone !== undefined) barn.timezone = timezone;

    // Nested settings fields
    if (checkSensitivity !== undefined) barn.settings.checkSensitivity = checkSensitivity;
    if (notifyUrgent !== undefined) barn.settings.notifyUrgent = notifyUrgent;
    if (notifyCheck !== undefined) barn.settings.notifyCheck = notifyCheck;
    if (notifyOffline !== undefined) barn.settings.notifyOffline = notifyOffline;

    await barn.save();

    return res.status(200).json({
      success: true,
      settings: {
        barnId: barn._id,
        name: barn.name,
        timezone: barn.timezone,
        ...barn.settings.toObject(),
      },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getSettings, updateSettings };
