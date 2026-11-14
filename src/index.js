require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const { authenticate } = require('./middleware/auth');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { me } = require('./controllers/authController');

const authRoutes = require('./routes/auth');
const horseRoutes = require('./routes/horses');
const userRoutes = require('./routes/users');
const alertRoutes = require('./routes/alerts');
const settingsRoutes = require('./routes/settings');
const subscriptionRoutes = require('./routes/subscription');
const webhookRoutes = require('./routes/webhooks');
const sensorReadingRoutes = require('./routes/sensorReadings');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    success: connected,
    db: connected ? 'connected' : 'disconnected',
  });
});

app.use('/api/v1/auth', authRoutes);
app.get('/api/v1/me', authenticate, me);
app.use('/api/v1', sensorReadingRoutes);
app.use('/api/v1/horses', horseRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/alerts', alertRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/subscription', subscriptionRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

app.use(notFound);
app.use(errorHandler);

if (require.main === module) {
  if (!process.env.MONGODB_URI || !process.env.JWT_SECRET) {
    console.error('MONGODB_URI and JWT_SECRET are required');
    process.exit(1);
  }

  const port = process.env.PORT || 3000;
  connectDB().then(() => {
    app.listen(port, () => {
      console.log(`API listening on port ${port}`);
    });
  });
}

module.exports = app;
