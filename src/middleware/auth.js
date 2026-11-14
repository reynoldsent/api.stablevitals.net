const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RevokedToken = require('../models/RevokedToken');

/**
 * Middleware: verify JWT from Authorization header, attach req.user.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      const message =
        err.name === 'TokenExpiredError' ? 'Token has expired' : 'Invalid token';
      return res.status(401).json({ success: false, message });
    }

    const tokenId =
      decoded.jti || crypto.createHash('sha256').update(token).digest('hex');
    const revoked = await RevokedToken.findOne({ jti: tokenId });
    if (revoked) {
      return res.status(401).json({ success: false, message: 'Token has been revoked' });
    }

    const user = await User.findById(decoded.userId).select('-passwordHash');
    if (!user) {
      return res.status(401).json({ success: false, message: 'User not found' });
    }

    // Ensure the user belongs to the barn in the token
    if (decoded.purpose === 'password_reset') {
      return res.status(401).json({ success: false, message: 'Invalid token' });
    }

    if (user.barnId.toString() !== decoded.barnId) {
      return res.status(401).json({ success: false, message: 'Token barn mismatch' });
    }

    if ((decoded.tokenVersion || 0) !== (user.tokenVersion || 0)) {
      return res.status(401).json({
        success: false,
        message: 'Password was changed. Please log in again',
      });
    }

    req.user = user;
    req.auth = { ...decoded, jti: tokenId };
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = { authenticate };
