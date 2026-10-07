const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto'); 
const pool = require('../config/db'); 
const sendEmail = require('../utils/sendEmail'); 
const router = express.Router();

router.post('/register', async (req, res) => {
    try {
        const { email, password, role, fullName } = req.body;
        const normalizedRole = (role || 'student').toLowerCase().trim();

        const userExists = await pool.query('SELECT * FROM Users WHERE email = $1', [email]);
        if (userExists.rows.length > 0) {
            return res.status(400).json({ error: 'User already exists with this email.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const displayName = fullName || (normalizedRole === 'student' ? 'New Student' : 'New Company');

        if (normalizedRole === 'company') {
            const otp = crypto.randomInt(100000, 1000000).toString();
            const otpHash = await bcrypt.hash(otp, salt);
            const expiresAt = new Date(Date.now() + 5 * 60000); 

            await pool.query(
                `INSERT INTO pending_companies (company_name, email, password_hash, otp_hash, expires_at, attempts)
                 VALUES ($1, $2, $3, $4, $5, 0)
                 ON CONFLICT (email) DO UPDATE SET
                 otp_hash = EXCLUDED.otp_hash, expires_at = EXCLUDED.expires_at, attempts = 0, password_hash = EXCLUDED.password_hash, company_name = EXCLUDED.company_name`,
                [displayName, email, hashedPassword, otpHash, expiresAt]
            );

            const subject = "TrustHire - Company Verification OTP";
            const message = `Hello ${displayName},\n\nYour verification code is: ${otp}\n\nThis code will expire in 5 minutes.\n\nBest,\nThe TrustHire AI Team`;
            
            await sendEmail(email, subject, message);

            return res.json({ 
                requiresOtp: true, 
                message: 'OTP sent to your company email. Please verify to complete registration.' 
            });
        }

        const newUser = await pool.query(
            'INSERT INTO Users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role',
            [email, hashedPassword, normalizedRole]
        );

        const userId = newUser.rows[0].id;

        if (normalizedRole === 'student') {
            await pool.query(
                'INSERT INTO Students (student_id, full_name) VALUES ($1, $2)',
                [userId, displayName]
            );
        }

        const subject = "Welcome to TrustHire AI!";
        const message = `Hello ${displayName},\n\nYour student account has been successfully created. You can now build your resume and apply for jobs!\n\nBest,\nThe TrustHire AI Team`;

        await sendEmail(email, subject, message);

        res.json({ message: 'Registration successful and welcome email sent!' });
    } catch (err) {
        console.error('Register Error:', err.message);
        res.status(500).json({ error: 'Server error during registration' });
    }
});

router.post('/verify-company-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;

        const pending = await pool.query('SELECT * FROM pending_companies WHERE email = $1', [email]);
        if (pending.rows.length === 0) {
            return res.status(404).json({ error: 'No pending registration found for this email.' });
        }

        const record = pending.rows[0];

        if (new Date() > new Date(record.expires_at)) {
            return res.status(400).json({ error: 'OTP has expired. Please register again.' });
        }

        if (record.attempts >= 5) {
            return res.status(400).json({ error: 'Maximum attempts reached. Please request a new OTP.' });
        }

        const isValidOtp = await bcrypt.compare(otp.toString(), record.otp_hash);
        if (!isValidOtp) {
            await pool.query('UPDATE pending_companies SET attempts = attempts + 1 WHERE email = $1', [email]);
            return res.status(400).json({ error: 'Invalid OTP code.' });
        }

        const newUser = await pool.query(
            'INSERT INTO Users (email, password_hash, role, rid_status) VALUES ($1, $2, $3, $4) RETURNING id',
            [record.email, record.password_hash, 'company', 'Pending']
        );

        const userId = newUser.rows[0].id;

        await pool.query(
            'INSERT INTO companies (company_id, company_name) VALUES ($1, $2)',
            [userId, record.company_name]
        );

        await pool.query('DELETE FROM pending_companies WHERE email = $1', [email]);

        // --- NEW: NOTIFY TRUSTHIRE ADMIN TEAM OF NEW REGISTRATION ---
        const trustHireTeamEmail = 'admin@trusthire.com'; // Change to your actual admin email
        const adminSubject = `New Company Pending Verification`;
        const adminMessage = `Hello TrustHire Team,\n\nA new company has verified their email and is pending cross-verification.\n\nCompany Name: ${record.company_name}\nEmail: ${record.email}\n\nPlease cross-verify their details and use the Admin Portal to assign their RID.\n\nSystem Auto-Notification`;
        await sendEmail(trustHireTeamEmail, adminSubject, adminMessage);

        const token = jwt.sign(
            { id: userId, role: 'company' },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '1h' }
        );

        res.json({ 
            message: 'Company verified and account created successfully!',
            token,
            role: 'company'
        });

    } catch (err) {
        console.error('Verify OTP Error:', err.message);
        res.status(500).json({ error: 'Server error during OTP verification' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await pool.query('SELECT * FROM Users WHERE email = $1', [email]);
        if (user.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        const validPassword = await bcrypt.compare(password, user.rows[0].password_hash);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        const userRole = user.rows[0].role.toLowerCase().trim();

        const token = jwt.sign(
            { id: user.rows[0].id, role: userRole },
            process.env.JWT_SECRET || 'fallback_secret',
            { expiresIn: '1h' }
        );

        res.json({ 
            token, 
            role: userRole 
        });

    } catch (err) {
        console.error('Login Error:', err.message);
        res.status(500).json({ error: 'Server error during login' });
    }
});

module.exports = router;