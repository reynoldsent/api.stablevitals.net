const notFound = (req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
};

const errorHandler = (err, req, res, _next) => {
  if (err.name === 'CastError') {
    return res.status(400).json({ success: false, message: 'Invalid id' });
  }

  if (err.name === 'ValidationError') {
    return res.status(422).json({ success: false, message: err.message });
  }

  if (err.code === 11000) {
    return res.status(409).json({ success: false, message: 'Duplicate value' });
  }

  console.error(err);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Server error' : err.message,
  });
};

module.exports = { notFound, errorHandler };
