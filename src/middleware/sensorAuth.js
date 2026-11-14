const crypto = require('crypto');

const authenticateSensor = (req, res, next) => {
  const expectedKey = process.env.SENSOR_API_KEY;
  if (!expectedKey) {
    return res.status(503).json({
      success: false,
      message: 'Sensor API is not configured',
    });
  }

  const providedKey = req.get('x-sensor-api-key');
  if (
    !providedKey ||
    Buffer.byteLength(providedKey) !== Buffer.byteLength(expectedKey) ||
    !crypto.timingSafeEqual(Buffer.from(providedKey), Buffer.from(expectedKey))
  ) {
    return res.status(401).json({ success: false, message: 'Invalid sensor API key' });
  }

  next();
};

module.exports = { authenticateSensor };
