const { BrevoClient } = require('@getbrevo/brevo');
require('dotenv').config();

const sendEmail = async (to, subject, text, replyTo = null, senderName = "TrustHire AI", html = null) => {
    try {
        const brevo = new BrevoClient({ 
            apiKey: process.env.BREVO_API_KEY 
        });

        const payload = {
            subject: subject,
            sender: { name: senderName, email: process.env.EMAIL_USER },
            to: [{ email: to }]
        };

        if (html) {
            payload.htmlContent = html;
        } else if (text) {
            payload.textContent = text;
        }

        if (replyTo) {
            payload.replyTo = { email: replyTo };
        } else {
            payload.replyTo = { email: process.env.EMAIL_USER };
        }

        await brevo.transactionalEmails.sendTransacEmail(payload);
        console.log(`Automated email successfully sent to: ${to} via Brevo API`);
    } catch (error) {
        console.error("Email failed to send via Brevo:");
        console.error(error.rawResponse ? error.rawResponse : error.message);
    }
};

module.exports = sendEmail;