const express = require('express');
const pool = require('../config/db');
const auth = require('../middleware/authMiddleware');
const sendEmail = require('../utils/sendEmail'); 
const router = express.Router();

const isNotCompany = (user) => {
    return !user || !user.role || user.role.toLowerCase() !== 'company';
};

router.get('/applications', auth, async (req, res) => {
    try {
        if (isNotCompany(req.user)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const query = `
            SELECT a.application_id, s.full_name, u.email, a.applied_role, 
                   a.ats_score, a.trust_score, a.status, a.resume_url, s.skills 
            FROM applications a
            JOIN Students s ON a.student_id = s.student_id
            JOIN Users u ON s.student_id = u.id
        `;
        
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error("Fetch Applications Error:", err);
        res.status(500).json({ error: 'Server error fetching applications' });
    }
});

router.delete('/applications/:id', auth, async (req, res) => {
    try {
        if (isNotCompany(req.user)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const appId = req.params.id;

        const appData = await pool.query(`
            SELECT a.applied_role, s.full_name, u.email 
            FROM applications a
            JOIN Students s ON a.student_id = s.student_id
            JOIN Users u ON s.student_id = u.id
            WHERE a.application_id = $1
        `, [appId]);

        await pool.query('DELETE FROM applications WHERE application_id = $1', [appId]);

        if (appData.rows.length > 0) {
            const { applied_role, full_name, email } = appData.rows[0];
            const subject = `Application Status Update - ${applied_role}`;
            const message = `Dear ${full_name},\n\n`
                + `Thank you for taking the time to apply for the ${applied_role} position through TrustHire AI.\n\n`
                + `Our partner company has thoroughly reviewed your application, including your resume and the AI-generated skill metrics.\n\n`
                + `While your qualifications are impressive, the hiring team has decided to move forward with other candidates whose profiles more closely align with the specific requirements of this role at this time.\n\n`
                + `Please do not let this discourage you. We highly recommend continuing to refine your skills, update your resume, and utilize the TCU AI Mentor for interview preparation.\n\n`
                + `We appreciate your interest and wish you the absolute best in your continued job search and future career endeavors.\n\n`
                + `Warm regards,\n`
                + `The TrustHire AI Team`;
            
            sendEmail(email, subject, message).catch(emailErr => {
                console.warn("⚠️ Background rejection email failed (Check Wi-Fi/Network):", emailErr.message);
            });
        }

        res.json({ message: 'Application deleted successfully.' });
    } catch (err) {
        console.error("Delete Application Error:", err);
        res.status(500).json({ error: 'Server error deleting application' });
    }
});

router.get('/jobs', auth, async (req, res) => {
    try {
        if (isNotCompany(req.user)) {
            return res.status(403).json({ error: 'Access denied.' });
        }
        
        const companyId = req.user.id;
        const result = await pool.query('SELECT * FROM jobs WHERE company_id = $1 ORDER BY job_id DESC', [companyId]);
        res.json(result.rows);
    } catch (err) {
        console.error("Fetch Jobs Error:", err);
        res.status(500).json({ error: 'Server error fetching jobs' });
    }
});

router.post('/jobs', auth, async (req, res) => {
    try {
        if (isNotCompany(req.user)) {
            return res.status(403).json({ error: 'Access denied.' });
        }
        
        const companyId = req.user.id;
        const companyData = await pool.query('SELECT rid_status FROM Users WHERE id = $1', [companyId]);
        
        if (companyData.rows.length === 0 || companyData.rows[0].rid_status !== 'Active') {
            return res.status(403).json({ error: 'Account Pending. You need an active TrustHire RID to post jobs.' });
        }

        const { title, experience, location, expectedZone, salary, skills } = req.body;
        
        await pool.query(
            `INSERT INTO jobs (title, company_id, experience, location, expected_zone, salary, skills) 
             VALUES ($1, $2, $3, $4, $5, $6, $7)`, 
            [title, companyId, experience, location, expectedZone, salary, skills]
        );

        res.json({ message: 'Job posted successfully!' });
    } catch (err) {
        console.error("Post Job Error:", err);
        res.status(500).json({ error: 'Server error posting job' });
    }
});

router.delete('/jobs/:id', auth, async (req, res) => {
    try {
        if (isNotCompany(req.user)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const jobId = req.params.id;
        const companyId = req.user.id;

        await pool.query('DELETE FROM jobs WHERE job_id = $1 AND company_id = $2', [jobId, companyId]);
        res.json({ message: 'Job removed successfully.' });
    } catch (err) {
        console.error("Delete Job Error:", err);
        res.status(500).json({ error: 'Server error deleting job' });
    }
});

router.post('/send-mail', auth, async (req, res) => {
    try {
        if (isNotCompany(req.user)) {
            return res.status(403).json({ error: 'Access denied.' });
        }

        const { email, subject, body, companyName } = req.body;

        if (!email || !subject || !body) {
            return res.status(400).json({ error: 'Missing email details.' });
        }

        const formattedSubject = `[${companyName || 'TrustHire Partner'}] ${subject}`;
        
        // Passing 'body' directly without appending the HR email signature
        await sendEmail(email, formattedSubject, body);
        res.json({ message: 'Email sent successfully!' });
    } catch (err) {
        console.error('Direct email sending error:', err);
        res.status(500).json({ error: 'Server error sending email.' });
    }
});

router.post('/verify-rid', auth, async (req, res) => {
    try {
        if (isNotCompany(req.user)) return res.status(403).json({ error: 'Access denied.' });

        const { rid } = req.body;
        const companyId = req.user.id;

        const userCheck = await pool.query('SELECT rid FROM Users WHERE id = $1', [companyId]);
        
        if (!userCheck.rows[0].rid) {
            return res.status(400).json({ error: 'TrustHire Team has not assigned an RID yet. Please wait for the email.' });
        }

        if (userCheck.rows[0].rid !== rid.trim()) {
            return res.status(400).json({ error: 'Invalid RID. Please check the email from TrustHire.' });
        }

        await pool.query("UPDATE Users SET rid_status = 'Active' WHERE id = $1", [companyId]);
        res.json({ message: 'RID Verified Successfully! Your account is now Active.' });
    } catch (err) {
        console.error("Verify RID Error:", err);
        res.status(500).json({ error: 'Server error verifying RID' });
    }
});

router.post('/test-trigger-admin-rid', auth, async (req, res) => {
    try {
        const companyId = req.user.id;
        const companyData = await pool.query('SELECT email FROM Users WHERE id = $1', [companyId]);
        const companyEmail = companyData.rows[0].email;

        const uniqueRid = 'TH-' + Math.random().toString(36).substring(2, 8).toUpperCase();
        await pool.query(`UPDATE Users SET rid = $1, rid_status = 'Assigned' WHERE id = $2`, [uniqueRid, companyId]);

        const trustHireTeamEmail = process.env.EMAIL_USER || 'trusthireai@gmail.com'; 
        const subject = `New RID Generated for ${companyEmail}`;
        const message = `Hello TrustHire Team,\n\nA new Registration ID (RID) has been generated for a pending company.\n\nCompany Email: ${companyEmail}\nGenerated RID: ${uniqueRid}\n\nPlease cross-verify this company's details. If they are legitimate, please manually email this RID to them.\n\nSystem Auto-Notification`;
        
        sendEmail(trustHireTeamEmail, subject, message).catch(e => console.warn("Admin RID email notice failed:", e.message));
        res.json({ message: 'RID generated and securely sent to the TrustHire Team inbox!' });
    } catch (err) {
        console.error("Admin RID Trigger Error:", err);
        res.status(500).json({ error: 'Server error simulating admin approval' });
    }
});

module.exports = router;