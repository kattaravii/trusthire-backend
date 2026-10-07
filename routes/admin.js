const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/authMiddleware');
const sendEmail = require('../utils/sendEmail');
const router = express.Router();

// Get all companies for verification
router.get('/companies', auth, async (req, res) => {
    try {
        if (req.user.role.toLowerCase() !== 'admin') return res.status(403).json({ error: 'Access denied.' });
        
        const companies = await pool.query(`SELECT id, email, rid, rid_status, created_at FROM Users WHERE role = 'company' ORDER BY created_at DESC`);
        res.json(companies.rows);
    } catch (err) {
        res.status(500).json({ error: 'Server error fetching companies' });
    }
});

// TrustHire Team Generates & Assigns RID
router.post('/assign-rid', auth, async (req, res) => {
    try {
        if (req.user.role.toLowerCase() !== 'admin') return res.status(403).json({ error: 'Access denied.' });

        const { companyId, companyEmail } = req.body;
        
        // Generate secure, unique RID
        const uniqueRid = 'TH-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        
        await pool.query(
            `UPDATE Users SET rid = $1, rid_status = 'Active' WHERE id = $2`, 
            [uniqueRid, companyId]
        );

        const subject = "Your TrustHire Verified Registration ID (RID)";
        const message = `Hello,\n\nYour company account has been successfully verified by the TrustHire Team.\n\nYour official Registration ID is: ${uniqueRid}\n\nYou can now use this RID to log in and access live hiring features.\n\nBest,\nTrustHire Admin Team`;
        
        await sendEmail(companyEmail, subject, message);
        res.json({ message: 'RID assigned and emailed securely to the company!', rid: uniqueRid });
    } catch (err) {
        res.status(500).json({ error: 'Server error assigning RID' });
    }
});

module.exports = router;