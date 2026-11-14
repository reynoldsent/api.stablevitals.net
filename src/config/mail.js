const nodemailer = require('nodemailer');

let transport;

const mailConfigured = () => Boolean(process.env.SMTP_HOST);

const getTransport = () => {
  if (!mailConfigured()) return null;
  if (!transport) {
    const port = Number(process.env.SMTP_PORT || 587);
    transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === 'true' || port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transport;
};

const fromAddress = () => process.env.SMTP_FROM || process.env.SMTP_USER;

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Sends the 6-digit password reset code.
 */
const sendPasswordResetCode = async ({ to, name, otp }) => {
  const sender = getTransport();
  if (!sender || !fromAddress()) {
    const err = new Error('Email is not configured');
    err.status = 503;
    throw err;
  }

  const greeting = name ? `Hi ${name},` : 'Hi,';
  await sender.sendMail({
    from: fromAddress(),
    to,
    subject: 'Your Stable Vitals reset code',
    text: [
      greeting,
      '',
      `Your password reset code is ${otp}.`,
      'It expires in 10 minutes.',
      '',
      'If you did not request this, you can ignore this email.',
    ].join('\n'),
    html: `
      <p>${escapeHtml(greeting)}</p>
      <p>Your password reset code is <strong style="font-size:20px;letter-spacing:3px">${otp}</strong>.</p>
      <p>It expires in 10 minutes.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  });
};

module.exports = { mailConfigured, sendPasswordResetCode };
