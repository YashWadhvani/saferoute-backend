// Send email using Resend when available, otherwise fall back to nodemailer.
// Resend avoids blocked ports on some PaaS (e.g., Render) and is recommended.
// Set RESEND_API_KEY and RESEND_FROM in your environment to use Resend.

let resendClient;
try {
  // require lazily so environments without the package won't break at import time
  const Resend = require('resend').default || require('resend');
  if (process.env.RESEND_API_KEY) resendClient = new Resend(process.env.RESEND_API_KEY);
} catch (e) {
  // package not installed or not used — nodemailer fallback will be used instead
  resendClient = null;
}

// Lazy-create nodemailer transporter only if needed
let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  } catch (e) {
    transporter = null;
  }
  return transporter;
}

async function sendEmail(to, subject, text, html) {
  // Prefer Resend if configured
  if (resendClient) {
    const from = process.env.RESEND_FROM || process.env.EMAIL_USER;
    // Resend client expects { from, to, subject, text, html }
    return await resendClient.emails.send({ from, to, subject, text, html });
  }

  // Fallback to nodemailer
  const t = getTransporter();
  if (!t) throw new Error('No mail transport configured: set RESEND_API_KEY or EMAIL_USER/EMAIL_PASS');
  const mail = { from: process.env.EMAIL_USER, to, subject };
  if (html) mail.html = html; else mail.text = text;
  return await t.sendMail(mail);
}

module.exports = sendEmail;
