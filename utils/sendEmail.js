const nodemailer = require('nodemailer');
require('dotenv').config();

// Added 'html' as the 6th parameter (defaults to null so it doesn't break older emails)
const sendEmail = async (to, subject, text, replyTo = null, senderName = "TrustHire AI", html = null) => {
    try {
        const transporter = nodemailer.createTransport({
            host: 'smtp.gmail.com',
            port: 587,
            secure: false, // Must be false for 587
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            },
            tls: {
                rejectUnauthorized: false
            }
        });

        const mailOptions = {
            from: `"${senderName}" <${process.env.EMAIL_USER}>`, 
            to: to,
            subject: subject,
            text: text, // Plain text fallback for older email clients
            html: html, // The beautiful UI version (if provided)
            replyTo: replyTo || process.env.EMAIL_USER 
        };

        await transporter.sendMail(mailOptions);
        console.log(`Automated email successfully sent to: ${to}`);
    } catch (error) {
        console.error("Email failed to send:", error);
    }
};

module.exports = sendEmail;