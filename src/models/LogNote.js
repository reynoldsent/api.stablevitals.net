const mongoose = require('mongoose');

const logNoteSchema = new mongoose.Schema(
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
    text: {
      type: String,
      required: [true, 'Note text is required'],
      trim: true,
      maxlength: [2000, 'Note cannot exceed 2000 characters'],
    },
    author: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LogNote', logNoteSchema);
