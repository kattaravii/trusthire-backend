const brevo = require('@getbrevo/brevo');
require('dotenv').config();

const sendEmail = async (to, subject, text, replyTo = null, senderName = "TrustHire AI", html = null) => {
    try {
        // Modern Brevo Initialization (v2.x+)
        const apiInstance = new brevo.TransactionalEmailsApi();
        
        // Setup API Key securely
        const apiKey = apiInstance.authentications['apiKey'];
        apiKey.apiKey = process.env.BREVO_API_KEY;

        const sendSmtpEmail = new brevo.SendSmtpEmail();
        sendSmtpEmail.subject = subject;
        
        if (html) {
            sendSmtpEmail.htmlContent = html;
        }
        if (text && !html) {
            sendSmtpEmail.textContent = text;
        }

        sendSmtpEmail.sender = { name: senderName, email: process.env.EMAIL_USER };
        sendSmtpEmail.to = [{ email: to }];
        sendSmtpEmail.replyTo = { email: replyTo || process.env.EMAIL_USER };

        await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log(`Automated email successfully sent to: ${to} via Brevo API`);
    } catch (error) {
        console.error("Email failed to send via Brevo:");
        // Prints the exact error from Brevo if something goes wrong
        console.error(error.response ? error.response.text : error.message);
    }
};

module.exports = sendEmail;