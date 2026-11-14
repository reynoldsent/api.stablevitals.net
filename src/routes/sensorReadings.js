const express = require('express');
const { body, param, query } = require('express-validator');
const { authenticateSensor } = require('../middleware/sensorAuth');
const { authenticate } = require('../middleware/auth');
const {
  recordSensorReading,
  getSensorReadings,
  getLatestSensorReading,
} = require('../controllers/sensorReadingController');

const router = express.Router();

const horseIdParam = param('id').isMongoId().withMessage('Horse ID must be a valid MongoDB ID');
const limitQuery = query('limit')
  .optional()
  .isInt({ min: 1, max: 100 })
  .withMessage('limit must be an integer between 1 and 100');

router.post(
  '/sensor/readings',
  authenticateSensor,
  body('horseId').isMongoId().withMessage('horseId must be a valid MongoDB ID'),
  body('waterConsumedLiters')
    .isFloat({ min: 0 })
    .withMessage('waterConsumedLiters must be a non-negative number'),
  body('recordedAt').optional().isISO8601().withMessage('recordedAt must be a valid ISO date'),
  recordSensorReading
);

router.get('/horses/:id/sensor-readings', authenticate, horseIdParam, limitQuery, getSensorReadings);
router.get(
  '/horses/:id/sensor-readings/latest',
  authenticate,
  horseIdParam,
  getLatestSensorReading
);

module.exports = router;
