const mongoose = require('mongoose');

const careEntrySchema = new mongoose.Schema(
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
    category: {
      type: String,
      enum: ['food', 'electrolyte', 'supplement', 'other'],
      required: [true, 'Category is required'],
    },
    item: {
      type: String,
      required: [true, 'Item is required'],
      trim: true,
      maxlength: [200, 'Item cannot exceed 200 characters'],
    },
    amount: {
      type: String,
      trim: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters'],
    },
    author: {
      type: String,
      required: true,
    },
    at: {
      type: Date,
      required: [true, 'Event time is required'],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CareEntry', careEntrySchema);
