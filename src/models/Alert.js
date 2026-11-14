const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
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
    severity: {
      type: String,
      enum: ['check', 'urgent'],
      required: true,
    },
    state: {
      type: String,
      enum: ['open', 'acknowledged', 'resolved'],
      default: 'open',
    },
    kind: {
      type: String,
      enum: [
        'lowWaterCheck',
        'urgentLowWater',
        'urgentHighWater',
        'persistentHighWater',
        'noDrink',
      ],
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    acknowledgedBy: {
      type: String,
    },
    acknowledgedAt: {
      type: Date,
    },
    resolvedBy: {
      type: String,
    },
    resolvedAt: {
      type: Date,
    },
    resolutionAction: {
      type: String,
      enum: [
        'drankAfterCheck',
        'manualWaterOffered',
        'electrolytesOrWetFeed',
        'trainerContacted',
        'veterinarianContacted',
        'horseMoved',
        'watererOrSensorIssue',
        'other',
      ],
    },
    resolutionNote: {
      type: String,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Alert', alertSchema);
