const crypto = require('crypto');
const { validationResult } = require('express-validator');
const Subscription = require('../models/Subscription');

const sendValidationError = (res, errors) =>
  res.status(422).json({ success: false, errors: errors.array() });

/**
 * GET /api/v1/subscription
 * all_access only
 */
const getSubscription = async (req, res, next) => {
  try {
    const subscription = await Subscription.findOne({ barnId: req.user.barnId }).lean();
    if (!subscription) {
      return res.status(404).json({ success: false, message: 'Subscription not found' });
    }
    return res.status(200).json({ success: true, subscription });
  } catch (err) {
    next(err);
  }
};

const renewalDate = (plan) => {
  const renewsAt = new Date();
  if (plan === 'monthly') renewsAt.setMonth(renewsAt.getMonth() + 1);
  if (plan === 'yearly') renewsAt.setFullYear(renewsAt.getFullYear() + 1);
  return renewsAt;
};

/**
 * POST /api/v1/subscription/checkout
 * all_access only – start a plan purchase. Payment is applied by the webhook.
 * Body: { plan, cardLast4 }
 */
const checkout = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors);

  try {
    const { plan, cardLast4 } = req.body;
    const checkoutId = crypto.randomUUID();

    const subscription = await Subscription.findOneAndUpdate(
      { barnId: req.user.barnId },
      {
        $set: {
          pendingCheckout: {
            checkoutId,
            plan,
            cardLast4: String(cardLast4).slice(-4),
          },
        },
        $setOnInsert: { status: 'none' },
      },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      success: true,
      checkout: { checkoutId, plan, status: 'pending' },
      subscription,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/webhooks/payment
 * Payment provider confirmation. Body: { checkoutId, event }
 */
const confirmPayment = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return sendValidationError(res, errors);

  try {
    const { checkoutId, event } = req.body;

    const existing = await Subscription.findOne({
      $or: [{ 'pendingCheckout.checkoutId': checkoutId }, { lastCheckoutId: checkoutId }],
    });

    if (!existing) {
      return res.status(404).json({ success: false, message: 'Checkout not found' });
    }

    const stillPending =
      existing.pendingCheckout && existing.pendingCheckout.checkoutId === checkoutId;
    if (!stillPending) {
      const alreadyApplied =
        existing.lastCheckoutId === checkoutId &&
        ((event === 'payment.succeeded' && existing.status === 'active') ||
          (event === 'payment.failed' && existing.status === 'missed'));
      if (alreadyApplied) {
        return res.status(200).json({ success: true, subscription: existing });
      }
      return res.status(409).json({ success: false, message: 'Checkout is no longer pending' });
    }

    const update =
      event === 'payment.succeeded'
        ? {
            $set: {
              plan: existing.pendingCheckout.plan,
              status: 'active',
              cardLast4: existing.pendingCheckout.cardLast4,
              renewsAt: renewalDate(existing.pendingCheckout.plan),
              lastCheckoutId: checkoutId,
            },
            $unset: { pendingCheckout: '' },
          }
        : {
            $set: { status: 'missed', lastCheckoutId: checkoutId },
            $unset: { pendingCheckout: '' },
          };

    const subscription = await Subscription.findOneAndUpdate(
      { _id: existing._id, 'pendingCheckout.checkoutId': checkoutId },
      update,
      { new: true }
    );

    if (!subscription) {
      const current = await Subscription.findOne({ lastCheckoutId: checkoutId });
      if (current) return res.status(200).json({ success: true, subscription: current });
      return res.status(404).json({ success: false, message: 'Checkout not found' });
    }

    return res.status(200).json({ success: true, subscription });
  } catch (err) {
    next(err);
  }
};

module.exports = { getSubscription, checkout, confirmPayment };
