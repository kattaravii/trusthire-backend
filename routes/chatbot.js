const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const auth = require('../middleware/authMiddleware'); 
const pool = require('../config/db'); 
const sendEmail = require('../utils/sendEmail'); 
const router = express.Router();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

router.post('/ask', auth, async (req, res) => {
    try {
        const { message, context, history } = req.body; 

        if (!message) {
            return res.status(400).json({ error: 'Message is required.' });
        }

        let systemInstruction = `You are TCU (TrustHire Consultant Unit), a practical career assistant for students and job seekers. Your job is to answer the user's exact question directly and concisely.

Rules:
1. Always answer the specific question asked and strictly respect the conversation history.
2. If the user asks about a company, give information about that specific company.
3. Keep answers easy to understand for students. Use Markdown for readability.
4. RESOURCE REQUESTS (CRITICAL): Always provide a MINIMUM of 3 distinct resources or suggestions when a user asks to learn a new topic. DO NOT use robotic labels like "Intent:" or "Resource:". Present them naturally in a bulleted list.
5. YOUTUBE LINKS (CRITICAL): NEVER guess specific video or playlist IDs (they will break). ALWAYS generate a YouTube search query link. To ensure the link opens a playlist, always append '+playlist' to the search query. Format it exactly like this: [Channel Name - Topic](https://www.youtube.com/results?search_query=Channel+Name+Topic+playlist). Replace spaces with '+' in the URL.
6. NON-YOUTUBE LINKS: For official company websites or documentation, provide the standard clean URL.
7. After answering, optionally offer one relevant follow-up question.`;

        if (context && context.skills) {
            systemInstruction += `\n\nStudent Profile Context (CRITICAL: Use this ONLY if relevant to the user's question. Do NOT force these specific technologies into general descriptions!):
- Current Skills: ${context.skills}
- Missing Skills to Learn: ${context.missing_skills}
- Recommended Projects to Build: ${context.recommended_projects}

Use this context to personalize advice. Do NOT explicitly say "Based on your data". Just talk to them naturally.`;
        }

        const model = genAI.getGenerativeModel({ 
            model: "gemini-2.5-flash",
            systemInstruction: systemInstruction
        });

        const chat = model.startChat({
            history: history || []
        });

        const result = await chat.sendMessage(message);
        const text = result.response.text();

        res.json({ reply: text });

    } catch (error) {
        console.error('❌ Gemini API Error:', error);
        res.status(500).json({ error: 'TCU Chatbot is currently taking a break. Please try again later.' });
    }
});

// --- UPDATED ROUTE: Email-Safe HTML Chat History ---
router.post('/email-chat', auth, async (req, res) => {
    try {
        const { chatHistory } = req.body;

        const userQuery = await pool.query('SELECT email FROM Users WHERE id = $1', [req.user.id]);
        if (userQuery.rows.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }
        const userEmail = userQuery.rows[0].email;

        // Helper to convert Gemini's Markdown to Email HTML
        const formatForEmail = (text) => {
            if (!text) return '';
            return text
                .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" style="color: #38bdf8; text-decoration: none; font-weight: bold;">$1</a>')
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br />');
        };

        // Build the Email-Safe HTML Template (No Flexbox!)
        let htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #0f172a; color: #f8fafc; border-radius: 8px; overflow: hidden; border: 1px solid #1e293b;">
            
            <!-- Header -->
            <div style="background-color: #38bdf8; padding: 20px; text-align: center;">
                <h1 style="color: #0f172a; margin: 0; font-size: 22px; font-weight: bold;">TrustHire AI Mentorship</h1>
                <p style="color: #0f172a; margin: 5px 0 0 0; font-size: 14px;">Your Saved Session Transcript</p>
            </div>

            <!-- Body -->
            <div style="padding: 20px;">
                <p style="font-size: 16px; margin-bottom: 20px; color: #f8fafc;">Hello Student,</p>
                <p style="font-size: 14px; color: #cbd5e1; margin-bottom: 30px;">Here is the career roadmap and resource list you discussed with the TrustHire Consultant Unit (TCU):</p>

                <!-- Wrapper (Display block ensures it stacks vertically) -->
                <div style="display: block; width: 100%;">
        `;
        
        chatHistory.forEach(msg => {
            if (msg.role === 'bot') {
                htmlContent += `
                    <!-- TCU Bubble -->
                    <div style="background-color: #1e293b; border-left: 4px solid #38bdf8; padding: 15px; margin-bottom: 15px; border-radius: 4px; display: block;">
                        <strong style="color: #38bdf8; font-size: 14px; display: block; margin-bottom: 8px;">🤖 TCU Mentor</strong>
                        <div style="font-size: 14px; line-height: 1.5; color: #e2e8f0;">
                            ${formatForEmail(msg.text)}
                        </div>
                    </div>
                `;
            } else {
                htmlContent += `
                    <!-- User Bubble -->
                    <div style="background-color: #0f2942; border-left: 4px solid #94a3b8; padding: 15px; margin-bottom: 15px; border-radius: 4px; display: block;">
                        <strong style="color: #f8fafc; font-size: 14px; display: block; margin-bottom: 8px;">👤 You</strong>
                        <div style="font-size: 14px; color: #f8fafc;">
                            ${msg.text}
                        </div>
                    </div>
                `;
            }
        });
        
        htmlContent += `
                </div>
            </div>

            <!-- Footer -->
            <div style="background-color: #020617; padding: 20px; text-align: center; border-top: 1px solid #1e293b;">
                <p style="margin: 0; color: #94a3b8; font-size: 12px;">Keep upskilling! Your next opportunity is waiting.</p>
                <p style="margin: 5px 0 0 0; color: #64748b; font-size: 12px;">&copy; ${new Date().getFullYear()} TrustHire AI Platform</p>
            </div>
        </div>
        `;

        const plainTextFallback = "Please view this email in a client that supports HTML to see your chat transcript.";

        // 3. Send the email (Passing htmlContent as the 6th argument!)
        await sendEmail(
            userEmail, 
            "Your TrustHire AI Mentorship Session 🚀", 
            plainTextFallback, 
            null, 
            "TrustHire AI Mentor", 
            htmlContent
        );

        res.json({ message: 'Email sent successfully!' });
    } catch (error) {
        console.error('Email Chat Error:', error);
        res.status(500).json({ error: 'Failed to send email.' });
    }
});

module.exports = router;