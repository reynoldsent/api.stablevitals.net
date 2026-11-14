const { validationResult } = require('express-validator');
const Horse = require('../models/Horse');
const SensorReading = require('../models/SensorReading');
const { canAccessHorse } = require('../utils/horseAccess');

const sendValidationError = (res, errors) =>
  res.status(422).json({ success: false, errors: errors.array() });

const recordSensorReading = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors);

  try {
    const horse = await Horse.findById(req.body.horseId).lean();
    if (!horse) {
      return res.status(404).json({ success: false, message: 'Horse not found' });
    }

    const reading = await SensorReading.create({
      barnId: horse.barnId,
      horseId: horse._id,
      waterConsumedLiters: req.body.waterConsumedLiters,
      recordedAt: req.body.recordedAt ? new Date(req.body.recordedAt) : new Date(),
    });

    return res.status(201).json({ success: true, reading });
  } catch (err) {
    next(err);
  }
};

const getSensorReadings = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors);

  try {
    const horse = await Horse.findById(req.params.id).lean();
    if (!horse || !canAccessHorse(req.user, horse)) {
      return res.status(404).json({ success: false, message: 'Horse not found or access denied' });
    }

    const readings = await SensorReading.find({
      horseId: horse._id,
      barnId: req.user.barnId,
    })
      .sort({ recordedAt: -1, _id: -1 })
      .limit(Number(req.query.limit) || 50)
      .lean();

    return res.status(200).json({ success: true, readings });
  } catch (err) {
    next(err);
  }
};

const getLatestSensorReading = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors);

  try {
    const horse = await Horse.findById(req.params.id).lean();
    if (!horse || !canAccessHorse(req.user, horse)) {
      return res.status(404).json({ success: false, message: 'Horse not found or access denied' });
    }

    const reading = await SensorReading.findOne({
      horseId: horse._id,
      barnId: req.user.barnId,
    })
      .sort({ recordedAt: -1, _id: -1 })
      .lean();

    return res.status(200).json({ success: true, reading });
  } catch (err) {
    next(err);
  }
};

module.exports = { recordSensorReading, getSensorReadings, getLatestSensorReading };
