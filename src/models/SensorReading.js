const mongoose = require('mongoose');

const sensorReadingSchema = new mongoose.Schema(
  {
    barnId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Barn',
      required: true,
      index: true,
    },
    horseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Horse',
      required: true,
      index: true,
    },
    waterConsumedLiters: {
      type: Number,
      required: [true, 'Water consumed is required'],
      min: [0, 'Water consumed must be non-negative'],
    },
    recordedAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

sensorReadingSchema.index({ horseId: 1, recordedAt: -1 });

module.exports = mongoose.model('SensorReading', sensorReadingSchema);
