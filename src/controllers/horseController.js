const { validationResult } = require('express-validator');
const Horse = require('../models/Horse');
const LogNote = require('../models/LogNote');
const CareEntry = require('../models/CareEntry');
const Alert = require('../models/Alert');
const { canAccessHorse } = require('../utils/horseAccess');

const sendValidationError = (res, errors) =>
  res.status(422).json({ success: false, errors: errors.array() });

// ─── Access helpers ───────────────────────────────────────────────────────────

/**
 * Checks if the requesting user can access a given horseId.
 * view_only: only allowed horses; others: any horse in same barn.
 */
// ─── Horse CRUD ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/horses
 */
const listHorses = async (req, res, next) => {
  try {
    const filter = { barnId: req.user.barnId };

    // view_only: restrict to allowed horses
    if (req.user.role === 'view_only') {
      filter._id = { $in: req.user.allowedHorseIds };
    }

    // Optional query filters
    if (req.query.archived !== undefined) {
      filter.archived = req.query.archived === 'true';
    }
    if (req.query.away !== undefined) {
      filter.away = req.query.away === 'true';
    }

    const horses = await Horse.find(filter).sort({ aisle: 1, stall: 1, name: 1 }).lean();
    return res.status(200).json({ success: true, horses });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/horses
 * all_access only
 */
const createHorse = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors);

  try {
    const {
      name, stall, aisle, type, age, dob, discipline,
      workLevel, photoUrl, waterTarget, waterTargetRange,
      lowWaterCheckPercent, urgentNoDrinkHours, highWaterPercent, hoursWithoutDrink,
    } = req.body;

    // Auto-generate sensorId: SV-<stall padded to 4>
    const sensorId = `SV-${String(stall).padStart(4, '0')}`;

    const horse = await Horse.create({
      barnId: req.user.barnId,
      name,
      stall,
      aisle: aisle || 'A',
      type,
      age,
      dob,
      discipline,
      workLevel,
      photoUrl,
      sensorId,
      waterTarget: waterTarget !== undefined ? waterTarget : 12,
      waterTargetRange: waterTargetRange !== undefined ? waterTargetRange : 2,
      lowWaterCheckPercent: lowWaterCheckPercent !== undefined ? lowWaterCheckPercent : 20,
      urgentNoDrinkHours: urgentNoDrinkHours !== undefined ? urgentNoDrinkHours : 8,
      highWaterPercent: highWaterPercent !== undefined ? highWaterPercent : 35,
      hoursWithoutDrink: hoursWithoutDrink !== undefined ? hoursWithoutDrink : 6,
    });

    return res.status(201).json({ success: true, horse });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/horses/:id
 */
const getHorse = async (req, res, next) => {
  try {
    const horse = await Horse.findById(req.params.id).lean();
    if (!horse) {
      return res.status(404).json({ success: false, message: 'Horse not found' });
    }
    if (!canAccessHorse(req.user, horse)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const [noteCount, careEntryCount, openAlertCount] = await Promise.all([
      LogNote.countDocuments({ horseId: horse._id, barnId: req.user.barnId }),
      CareEntry.countDocuments({ horseId: horse._id, barnId: req.user.barnId }),
      Alert.countDocuments({
        horseId: horse._id,
        barnId: req.user.barnId,
        state: { $ne: 'resolved' },
      }),
    ]);

    return res.status(200).json({
      success: true,
      horse,
      summary: { noteCount, careEntryCount, openAlertCount },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/horses/:id
 * all_access only
 */
const updateHorse = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors);

  try {
    const horse = await Horse.findOne({ _id: req.params.id, barnId: req.user.barnId });
    if (!horse) {
      return res.status(404).json({ success: false, message: 'Horse not found' });
    }

    const allowedFields = [
      'name', 'stall', 'aisle', 'type', 'age', 'dob', 'discipline',
      'workLevel', 'photoUrl',
    ];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) horse[field] = req.body[field];
    });

    await horse.save();
    return res.status(200).json({ success: true, horse });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/horses/:id/archive
 * all_access only – toggle archived state
 */
const archiveHorse = async (req, res, next) => {
  try {
    const horse = await Horse.findOne({ _id: req.params.id, barnId: req.user.barnId });
    if (!horse) {
      return res.status(404).json({ success: false, message: 'Horse not found' });
    }

    if (typeof req.body.archived !== 'boolean') {
      return res.status(422).json({ success: false, message: '`archived` (boolean) is required' });
    }

    horse.archived = req.body.archived;
    await horse.save();

    return res.status(200).json({ success: true, horse });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/horses/:id/away
 * all_access, basic_access – toggle away state
 */
const awayHorse = async (req, res, next) => {
  try {
    const horse = await Horse.findOne({ _id: req.params.id, barnId: req.user.barnId });
    if (!horse) {
      return res.status(404).json({ success: false, message: 'Horse not found' });
    }

    if (typeof req.body.away !== 'boolean') {
      return res.status(422).json({ success: false, message: '`away` (boolean) is required' });
    }

    horse.away = req.body.away;
    await horse.save();

    return res.status(200).json({ success: true, horse });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/horses/:id/move
 * all_access only – move horse to a new stall
 */
const moveHorse = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors);

  try {
    const horse = await Horse.findOne({ _id: req.params.id, barnId: req.user.barnId });
    if (!horse) {
      return res.status(404).json({ success: false, message: 'Horse not found' });
    }

    const { stall, effectiveAt } = req.body;
    horse.stall = stall;
    horse.stallEffectiveAt = effectiveAt ? new Date(effectiveAt) : new Date();
    // Regenerate sensorId based on new stall
    horse.sensorId = `SV-${String(stall).padStart(4, '0')}`;
    await horse.save();

    return res.status(200).json({ success: true, horse });
  } catch (err) {
    next(err);
  }
};

/**
 * PATCH /api/v1/horses/:id/monitoring
 * all_access, basic_access – update water targets and thresholds
 */
const updateMonitoring = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors);

  try {
    const horse = await Horse.findOne({ _id: req.params.id, barnId: req.user.barnId });
    if (!horse) {
      return res.status(404).json({ success: false, message: 'Horse not found' });
    }

    const monitoringFields = [
      'monitoringEnabled', 'waterTarget', 'waterTargetRange',
      'lowWaterCheckPercent', 'urgentNoDrinkHours', 'highWaterPercent', 'hoursWithoutDrink',
    ];
    monitoringFields.forEach((field) => {
      if (req.body[field] !== undefined) horse[field] = req.body[field];
    });

    await horse.save();
    return res.status(200).json({ success: true, horse });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/horses/:id/approve-baseline
 * all_access only
 */
const approveBaseline = async (req, res, next) => {
  try {
    const horse = await Horse.findOne({ _id: req.params.id, barnId: req.user.barnId });
    if (!horse) {
      return res.status(404).json({ success: false, message: 'Horse not found' });
    }

    horse.baselineApproved = true;
    await horse.save();

    return res.status(200).json({ success: true, horse });
  } catch (err) {
    next(err);
  }
};

// ─── Log Notes ────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/horses/:id/log-notes
 */
const getLogNotes = async (req, res, next) => {
  try {
    const horse = await Horse.findById(req.params.id).lean();
    if (!horse || !canAccessHorse(req.user, horse)) {
      return res.status(404).json({ success: false, message: 'Horse not found or access denied' });
    }

    const notes = await LogNote.find({ horseId: req.params.id, barnId: req.user.barnId })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ success: true, notes });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/horses/:id/log-notes
 * all_access, basic_access
 */
const addLogNote = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors);

  try {
    const horse = await Horse.findById(req.params.id).lean();
    if (!horse || !canAccessHorse(req.user, horse)) {
      return res.status(404).json({ success: false, message: 'Horse not found or access denied' });
    }

    const note = await LogNote.create({
      barnId: req.user.barnId,
      horseId: req.params.id,
      text: req.body.text,
      author: req.user.name, // always from token, never client
    });

    return res.status(201).json({ success: true, note });
  } catch (err) {
    next(err);
  }
};

// ─── Care Entries ─────────────────────────────────────────────────────────────

/**
 * GET /api/v1/horses/:id/care-entries
 * Supports ?from=&to= date filters (ISO strings)
 */
const getCareEntries = async (req, res, next) => {
  try {
    const horse = await Horse.findById(req.params.id).lean();
    if (!horse || !canAccessHorse(req.user, horse)) {
      return res.status(404).json({ success: false, message: 'Horse not found or access denied' });
    }

    const filter = { horseId: req.params.id, barnId: req.user.barnId };

    if (req.query.from || req.query.to) {
      filter.at = {};
      if (req.query.from) filter.at.$gte = new Date(req.query.from);
      if (req.query.to) filter.at.$lte = new Date(req.query.to);
    }

    const entries = await CareEntry.find(filter).sort({ at: -1 }).lean();
    return res.status(200).json({ success: true, entries });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/horses/:id/care-entries
 * all_access, basic_access
 */
const addCareEntry = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors);

  try {
    const horse = await Horse.findById(req.params.id).lean();
    if (!horse || !canAccessHorse(req.user, horse)) {
      return res.status(404).json({ success: false, message: 'Horse not found or access denied' });
    }

    const { category, item, amount, notes, at } = req.body;

    const entry = await CareEntry.create({
      barnId: req.user.barnId,
      horseId: req.params.id,
      category,
      item,
      amount,
      notes,
      author: req.user.name, // always from token
      at: at ? new Date(at) : new Date(),
    });

    return res.status(201).json({ success: true, entry });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/horses/:id/care-report
 * Returns a summary grouped by category for the last 30 days.
 */
const getCareReport = async (req, res, next) => {
  try {
    const horse = await Horse.findById(req.params.id).lean();
    if (!horse || !canAccessHorse(req.user, horse)) {
      return res.status(404).json({ success: false, message: 'Horse not found or access denied' });
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const entries = await CareEntry.find({
      horseId: req.params.id,
      barnId: req.user.barnId,
      at: { $gte: thirtyDaysAgo },
    })
      .sort({ at: -1 })
      .lean();

    if (req.query.format && !['json', 'csv'].includes(req.query.format)) {
      return res.status(422).json({ success: false, message: 'format must be json or csv' });
    }

    if (req.query.format === 'csv') {
      const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const lines = ['category,item,amount,notes,author,at'];
      entries.forEach((entry) => {
        lines.push(
          [
            entry.category,
            entry.item,
            entry.amount,
            entry.notes,
            entry.author,
            new Date(entry.at).toISOString(),
          ]
            .map(escape)
            .join(',')
        );
      });
      const filename = `${String(horse.name).replace(/[^a-z0-9-_]+/gi, '-') || 'horse'}-care-report.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.status(200).send(lines.join('\n'));
    }

    // Group by category
    const grouped = entries.reduce((acc, entry) => {
      if (!acc[entry.category]) acc[entry.category] = [];
      acc[entry.category].push(entry);
      return acc;
    }, {});

    return res.status(200).json({
      success: true,
      horse: { _id: horse._id, name: horse.name, stall: horse.stall },
      reportPeriod: { from: thirtyDaysAgo, to: new Date() },
      totalEntries: entries.length,
      byCategory: grouped,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
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
};
