const brevo = require('@getbrevo/brevo');
require('dotenv').config();

// The parameters stay exactly the same so it doesn't break your other files!
const sendEmail = async (to, subject, text, replyTo = null, senderName = "TrustHire AI", html = null) => {
    try {
        // Initialize the Brevo API Client
        const defaultClient = brevo.ApiClient.instance;
        const apiKey = defaultClient.authentications['api-key'];
        
        // This grabs the new API key you saved in Render or your .env file
        apiKey.apiKey = process.env.BREVO_API_KEY; 

        const apiInstance = new brevo.TransactionalEmailsApi();
        const sendSmtpEmail = new brevo.SendSmtpEmail();

        sendSmtpEmail.subject = subject;
        
        // Brevo supports both plain text and beautiful HTML UIs
        if (html) {
            sendSmtpEmail.htmlContent = html;
        }
        if (text && !html) {
            sendSmtpEmail.textContent = text;
        }

        // Sender and Receiver mapping
        sendSmtpEmail.sender = { 
            name: senderName, 
            email: process.env.EMAIL_USER // Assuming your verified trusthireai@gmail.com is still saved here
        };
        sendSmtpEmail.to = [{ email: to }];
        
        // Reply-To logic
        sendSmtpEmail.replyTo = { email: replyTo || process.env.EMAIL_USER };

        // Send the email via web API (bypassing Render's SMTP firewall)
        await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log(`Automated email successfully sent to: ${to} via Brevo API`);
    } catch (error) {
        console.error("Email failed to send via Brevo:");
        // This will print the exact Brevo error message if something is misconfigured
        console.error(error.response ? error.response.text : error);
    }
};

module.exports = sendEmail;