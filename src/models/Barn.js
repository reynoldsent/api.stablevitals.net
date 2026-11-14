const mongoose = require('mongoose');

const barnSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Barn name is required'],
      trim: true,
      maxlength: [150, 'Barn name cannot exceed 150 characters'],
    },
    timezone: {
      type: String,
      default: 'UTC',
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    settings: {
      checkSensitivity: {
        type: String,
        enum: ['more', 'standard', 'less'],
        default: 'standard',
      },
      notifyUrgent: {
        type: Boolean,
        default: true,
      },
      notifyCheck: {
        type: Boolean,
        default: true,
      },
      notifyOffline: {
        type: Boolean,
        default: true,
      },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Barn', barnSchema);
