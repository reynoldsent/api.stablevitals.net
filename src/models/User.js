const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email format'],
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    barnId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Barn',
      required: true,
    },
    role: {
      type: String,
      enum: ['all_access', 'basic_access', 'view_only'],
      default: 'basic_access',
    },
    allowedHorseIds: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['active', 'invited'],
      default: 'active',
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Instance method to compare passwords
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Static method to hash a password
userSchema.statics.hashPassword = async function (plaintext) {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(plaintext, salt);
};

module.exports = mongoose.model('User', userSchema);
