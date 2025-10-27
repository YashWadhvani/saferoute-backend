// Resend-only email sender. Nodemailer has been removed because SMTP may be blocked
// on some PaaS providers (Render). This module now requires RESEND_API_KEY to be
// set in the environment. It exposes sendEmail(to, subject, text, html).

let resendClient;
try {
  // require the official resend package
  const Resend = require('resend').default || require('resend');
  if (process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
    // optional: test that client exists
    // console.log('Resend client initialized');
  }
} catch (err) {
  // If the package isn't installed, we'll surface an error when sendEmail is called
  resendClient = null;
}

async function sendEmail(to, subject, text, html) {
  if (!resendClient) {
    throw new Error('Resend client not configured. Set RESEND_API_KEY and install the `resend` package.');
  }
  const from = process.env.RESEND_FROM || process.env.EMAIL_USER;
  // Resend expects an object { from, to, subject, text, html }
  return await resendClient.emails.send({ from, to, subject, text, html });
}

module.exports = sendEmail;
