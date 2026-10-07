require('dotenv').config();
const Groq = require('groq-sdk');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

async function testGroq() {
    try {
        console.log("⏳ Connecting to Groq AI...");
        
        const response = await groq.chat.completions.create({
            messages: [
                {
                    role: "user",
                    content: "Reply with exactly these words: 'Hello, your Groq AI is successfully connected!'"
                }
            ],
            // Using the available model from your list!
            model: "openai/gpt-oss-20b", 
        });

        console.log("✅ RESPONSE FROM AI:");
        console.log(response.choices[0].message.content);
        
    } catch (error) {
        console.error("❌ ERROR:", error.message);
    }
}

testGroq();