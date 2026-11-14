const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    barnId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Barn',
      required: true,
      unique: true,
    },
    plan: {
      type: String,
      enum: ['monthly', 'yearly'],
    },
    status: {
      type: String,
      enum: ['none', 'active', 'missed'],
      default: 'none',
    },
    cardLast4: {
      type: String,
      trim: true,
      maxlength: 4,
    },
    renewsAt: {
      type: Date,
    },
    pendingCheckout: {
      checkoutId: { type: String },
      plan: { type: String, enum: ['monthly', 'yearly'] },
      cardLast4: { type: String, maxlength: 4 },
    },
    lastCheckoutId: {
      type: String,
    },
  },
  { timestamps: true }
);

subscriptionSchema.index({ 'pendingCheckout.checkoutId': 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
