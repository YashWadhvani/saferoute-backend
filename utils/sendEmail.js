// utils/sendEmail.js
let resendClient;
try {
  const { Resend } = require('resend');
  if (process.env.RESEND_API_KEY)
    resendClient = new Resend(process.env.RESEND_API_KEY);
} catch (e) {
  resendClient = null;
}

async function sendEmail(to, subject, text, html) {
  if (!resendClient) {
    // If running in development, don't fail hard — log the email instead so dev flows work without Resend.
    if ((process.env.NODE_ENV || 'development') !== 'production') {
      console.warn('Resend client not configured — falling back to console.log (development only).');
      console.log('sendEmail (dev):', { to, subject, text, html, from: process.env.RESEND_FROM || process.env.EMAIL_USER });
      return Promise.resolve({ simulated: true });
    }
    throw new Error('Resend client not configured. Set RESEND_API_KEY and RESEND_FROM in the environment.');
  }
  const from = process.env.RESEND_FROM || process.env.EMAIL_USER;
  // Resend expects an object { from, to, subject, text, html }
  return await resendClient.emails.send({ from, to, subject, text, html });
}

module.exports = sendEmail;
