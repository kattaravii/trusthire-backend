const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
const nodemailer = require('nodemailer'); 
require('dotenv').config();

const app = express();

// 1. Bulletproof CORS setup to explicitly allow your React frontend
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json()); 
 
app.use('/uploads', express.static('uploads')); 

// Import Routes
const authRoutes = require('./routes/auth');
const companyRoutes = require('./routes/company');
const studentRoutes = require('./routes/student'); 
const chatbotRoutes = require('./routes/chatbot');  
const adminRoutes = require('./routes/admin'); // <-- NEW: Imported Admin Routes

// Use Routes
app.use('/api/auth', authRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/student', studentRoutes); 
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/admin', adminRoutes); // <-- NEW: Linked Admin Routes to the API

app.get('/test-db', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({ success: true, time: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Temporary test route for sending an email
app.get('/test-email', async (req, res) => {
    try {
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS
            }
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_USER, 
            subject: 'TrustHire AI - Test Email',
            text: 'Hello! Your TrustHire AI mailing system is working perfectly!'
        };

        await transporter.sendMail(mailOptions);
        console.log("Test email sent!");
        res.send("Success! Check your Gmail inbox.");
        
    } catch (error) {
        console.error("Error sending email:", error);
        res.status(500).send("Failed to send email. Check your terminal for errors.");
    }
});

app.get('/', (req, res) => {
    res.send('TrustHire Backend is Running Perfectly!');
});

const PORT = process.env.PORT || 5000;

// 2. Bind to 0.0.0.0 to prevent localhost IPv6 resolution blocks
app.listen(PORT, '0.0.0.0', () => {
    console.log(`TrustHire Backend running on port ${PORT} (Bound to all network interfaces)`);
});