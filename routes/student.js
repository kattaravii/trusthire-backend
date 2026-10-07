const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse'); 
const pool = require('../config/db');
const auth = require('../middleware/authMiddleware');
const sendEmail = require('../utils/sendEmail'); 
const { Groq } = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const router = express.Router();

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

router.post('/upload-resume', auth, upload.single('resume'), async (req, res) => {
    try {
        const studentId = req.user.id; 
        if (!req.file) return res.status(400).json({ error: 'Please upload a file' });

        const resumeUrl = `http://localhost:5000/uploads/${req.file.filename}`;
        let resumeText = '';

        try {
            const dataBuffer = fs.readFileSync(req.file.path);
            const data = await pdf(dataBuffer);
            resumeText = data.text || '';
        } catch (parseErr) {
            return res.status(400).json({ error: 'Could not read PDF text. Please ensure it is a text-based PDF.' });
        }

        let aiData;
        const prompt = `
            You are an elite technical recruiter. Analyze the following resume text.
            Respond ONLY with a valid JSON object containing these 5 keys:
            - "ats_score": (number 0-100)
            - "trust_score": (number 0-100)
            - "current_skills": (array of 3-5 strings)
            - "missing_skills": (array of 3 strings)
            - "recommended_projects": (array of 3 strings, under 15 words each)
            Resume Text: ${resumeText.substring(0, 3000)} 
        `;

        try {
            const aiResponse = await groq.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "openai/gpt-oss-20b",
                temperature: 0.1, 
                max_tokens: 1024 
            });

            let rawText = aiResponse.choices[0].message.content.replace(/```json/gi, '').replace(/```/gi, '').trim();
            const jsonStartIndex = rawText.indexOf('{');
            const jsonEndIndex = rawText.lastIndexOf('}');
            if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
                aiData = JSON.parse(rawText.substring(jsonStartIndex, jsonEndIndex + 1));
            } else throw new Error("No valid JSON boundaries.");
        } catch (groqErr) {
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { responseMimeType: "application/json" } });
                const result = await model.generateContent(prompt);
                aiData = JSON.parse(result.response.text().trim());
            } catch (geminiErr) {
                aiData = { ats_score: 50, trust_score: 50, current_skills: ['JavaScript', 'React', 'Node.js'], missing_skills: ['Docker', 'CI/CD'], recommended_projects: ['Build a real-time collaborative workspace.'] };
            }
        }

        const currentSkillsString = aiData.current_skills ? aiData.current_skills.join(', ') : 'N/A';
        const missingSkillsString = aiData.missing_skills ? aiData.missing_skills.join(', ') : 'N/A';
        const projectsString = aiData.recommended_projects ? aiData.recommended_projects.join(' | ') : 'N/A';

        await pool.query(
            `INSERT INTO Students (student_id, full_name, resume_url, ats_score, trust_score, skills, missing_skills, recommended_projects) 
             VALUES ($1, 'Student', $2, $3, $4, $5, $6, $7)
             ON CONFLICT (student_id) 
             DO UPDATE SET resume_url = $2, ats_score = $3, trust_score = $4, skills = $5, missing_skills = $6, recommended_projects = $7`,
            [studentId, resumeUrl, aiData.ats_score || 0, aiData.trust_score || 0, currentSkillsString, missingSkillsString, projectsString]
        );

        res.json({ message: 'Resume analyzed successfully!', resume_url: resumeUrl, ats_score: aiData.ats_score, trust_score: aiData.trust_score });
    } catch (err) {
        res.status(500).json({ error: 'Server error during resume processing: ' + err.message });
    }
});

router.get('/profile', auth, async (req, res) => {
    try {
        const student = await pool.query(
            `SELECT s.full_name, s.university_roll_no, s.mobile_number, s.location, s.year_of_study, 
                    s.course, s.college, s.ats_score, s.trust_score, s.resume_url, s.skills, 
                    s.missing_skills, s.recommended_projects, s.tcu_verified, u.email 
             FROM Students s JOIN Users u ON s.student_id = u.id WHERE s.student_id = $1`, [req.user.id]
        );
        if (student.rows.length === 0) return res.status(404).json({ error: 'Student not found' });
        res.json(student.rows[0]);
    } catch (err) {
        res.status(500).json({ error: 'Server error fetching profile' });
    }
});

router.put('/profile', auth, async (req, res) => {
    try {
        const { fullName, universityRollNo, mobileNumber, location, yearOfStudy } = req.body;
        await pool.query(
            `UPDATE Students SET full_name = $1, university_roll_no = $2, mobile_number = $3, location = $4, year_of_study = $5 WHERE student_id = $6`, 
            [fullName, universityRollNo, mobileNumber, location, yearOfStudy, req.user.id]
        );
        res.json({ message: 'Profile updated successfully!' });
    } catch (err) {
        res.status(500).json({ error: 'Server error updating profile' });
    }
});

router.post('/tcu/send-otp', auth, async (req, res) => {
    try {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        await pool.query('UPDATE Students SET tcu_otp = $1 WHERE student_id = $2', [otp, req.user.id]);
        await sendEmail(req.body.email, "Your TrustHire Verification Code", `Hello,\n\nYour 6-digit verification code is: ${otp}\n\nDo not share this code with anyone.\n\nBest,\nThe TrustHire Team`);
        res.json({ message: 'OTP sent to email.' });
    } catch (err) {
        res.status(500).json({ error: 'Error sending OTP' });
    }
});

router.post('/tcu/verify-otp', auth, async (req, res) => {
    try {
        const { otp, mobile, year } = req.body;
        const result = await pool.query('SELECT tcu_otp FROM Students WHERE student_id = $1', [req.user.id]);
        if (result.rows.length === 0 || result.rows[0].tcu_otp !== otp) return res.status(400).json({ error: 'Invalid OTP' });
        
        await pool.query(
            `UPDATE Students SET tcu_verified = TRUE, tcu_otp = NULL, mobile_number = COALESCE($1, mobile_number), year_of_study = COALESCE($2, year_of_study) WHERE student_id = $3`,
            [mobile, year, req.user.id]
        );
        res.json({ message: 'Verification successful!' });
    } catch (err) {
        res.status(500).json({ error: 'Error verifying OTP' });
    }
});

router.get('/jobs', auth, async (req, res) => {
    try {
        const jobs = await pool.query(`SELECT j.*, u.email as company_email FROM jobs j JOIN Users u ON j.company_id = u.id ORDER BY j.job_id DESC`);
        res.json(jobs.rows);
    } catch (err) { res.status(500).json({ error: 'Server error fetching jobs' }); }
});

router.post('/apply', auth, async (req, res) => {
    try {
        const { appliedRole, companyEmail } = req.body;
        if (!appliedRole) return res.status(400).json({ error: 'Please select a role.' });

        const studentData = await pool.query(`SELECT s.resume_url, s.ats_score, s.trust_score, s.skills, s.full_name, u.email FROM Students s JOIN Users u ON s.student_id = u.id WHERE s.student_id = $1`, [req.user.id]);
        if (studentData.rows.length === 0 || !studentData.rows[0].resume_url) return res.status(400).json({ error: 'Please upload a resume before applying.' });

        const { resume_url, ats_score, trust_score, skills, full_name, email } = studentData.rows[0];
        const status = trust_score >= 80 ? 'Low Risk' : 'Needs Review';

        await pool.query(
            `INSERT INTO applications (student_id, applied_role, resume_url, ats_score, trust_score, status, skills) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [req.user.id, appliedRole, resume_url, ats_score, trust_score, status, skills || 'N/A']
        );

        // 1. Send detailed email to Student
        const studentSubject = `Application Confirmed - ${appliedRole}`;
        const studentMessage = `Hello ${full_name},\n\nYou have successfully submitted your application for the ${appliedRole} position via TrustHire AI.\n\nYour current resume metrics:\n- ATS Score: ${ats_score}%\n- Trust Score: ${trust_score}%\n\nCompanies will review your profile shortly.\n\nBest of luck,\nThe TrustHire AI Team`;
        sendEmail(email, studentSubject, studentMessage).catch(err => console.warn("Student email failed", err));

        // 2. Send detailed email to Company (if job has an associated email)
        if (companyEmail) {
            const companySubject = `New Job Application - ${appliedRole}`;
            const companyMessage = `Hello,\n\nA new candidate (${full_name}) has applied for the ${appliedRole} position.\n\nCandidate Metrics:\n- ATS Score: ${ats_score}%\n- Trust Score: ${trust_score}%\n- Top Skills: ${skills || 'N/A'}\n\nPlease log in to your TrustHire AI Company Portal to review their full resume and approve the application.\n\nBest,\nThe TrustHire AI Team`;
            sendEmail(companyEmail, companySubject, companyMessage).catch(err => console.warn("Company email failed", err));
        }

        res.json({ message: 'Application submitted successfully!' });
    } catch (err) { res.status(500).json({ error: 'Server error during application submission' }); }
});

router.get('/my-applications', auth, async (req, res) => {
    try {
        const apps = await pool.query(`SELECT application_id, applied_role, status FROM applications WHERE student_id = $1 ORDER BY application_id DESC`, [req.user.id]);
        res.json(apps.rows);
    } catch (err) { res.status(500).json({ error: 'Server error fetching applications' }); }
});

router.post('/send-dsa-sheet', auth, async (req, res) => {
    try {
        const studentData = await pool.query('SELECT email FROM Users WHERE id = $1', [req.user.id]);
        if (studentData.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        
        await sendEmail(studentData.rows[0].email, "Your Exclusive DSA Preparation Sheet - TrustHire AI", `Hello,\n\nHere is your curated DSA questions sheet:\nhttps://share.google/6UEiwyBzEO3dlAqVk\n\nHappy coding!`);
        res.json({ message: 'DSA sheet sent successfully!' });
    } catch (err) { res.status(500).json({ error: 'Server error sending email.' }); }
});

// --- LIGHTWEIGHT AI INTERVIEW TOPICS (STRICTLY DYNAMIC) ---
router.get('/generate-prep', auth, async (req, res) => {
    try {
        const studentData = await pool.query(`SELECT skills FROM Students WHERE student_id = $1`, [req.user.id]);
        const skills = studentData.rows[0]?.skills || 'General Computer Science';
        
        const prompt = `
            You are a technical interviewer. The candidate has the following specific skills extracted from their resume: "${skills}".
            Generate a personalized interview preparation guide STRICTLY based on these exact skills. DO NOT give generic topics.
            Respond ONLY with a valid JSON object containing exactly 2 keys:
            - "important_topics": (array of 6 to 8 critical technical concepts tailored exclusively to the skills: ${skills}).
            - "interview_questions": (array of 5 specific technical interview questions testing the skills: ${skills}).
        `;

        let aiData;
        try {
            const aiResponse = await groq.chat.completions.create({
                messages: [{ role: "user", content: prompt }], model: "openai/gpt-oss-20b", temperature: 0.2, max_tokens: 500 
            });
            let rawText = aiResponse.choices[0].message.content.replace(/```json/gi, '').replace(/Lexical/gi, '').replace(/```/gi, '').trim();
            aiData = JSON.parse(rawText.substring(rawText.indexOf('{'), rawText.lastIndexOf('}') + 1));
        } catch (groqErr) {
            try {
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", generationConfig: { responseMimeType: "application/json" } });
                const result = await model.generateContent(prompt);
                aiData = JSON.parse(result.response.text().trim());
            } catch (geminiErr) {
                console.error("Both APIs failed. Using fallback.", geminiErr);
                aiData = {
                    important_topics: ["⚠️ API ERROR: Showing Generic Topics", "Data Structures", "System Design", "Database Management", "API Security"],
                    interview_questions: [
                        "⚠️ Could not connect to AI. Please check your Groq/Gemini API keys or network connection.",
                        "Explain the difference between a REST API and GraphQL?",
                        "How would you optimize a slow-performing database query?"
                    ]
                };
            }
        }
        res.json(aiData);
    } catch (err) { res.status(500).json({ error: 'Failed to generate prep material.' }); }
});

module.exports = router;