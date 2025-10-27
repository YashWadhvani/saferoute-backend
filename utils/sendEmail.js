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
  if (!resendClient)
    throw new Error('Resend not configured. Set RESEND_API_KEY and RESEND_FROM.');

  const from = process.env.RESEND_FROM;
  return await resendClient.emails.send({
    from,
    to,
    subject,
    text,
    html,
  });
}

module.exports = sendEmail;
