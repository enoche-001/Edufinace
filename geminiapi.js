/* =========================================
   EduFinance - Gemini API Integration (Backend-ready placeholder)
   ========================================= */

const GEMINI_API_KEY = "AQ.Ab8RN6LYWCVt7UQwLMHTHzhcuedROluSgB2onV0zpCGOq01POA"; // Test key in code for testing before secure backend migration

async function getGeminiFinancialAdvice(summaryData) {
    if (!GEMINI_API_KEY) {
        return null;
    }
    try {
        const prompt = `You are an expert, non-judgmental financial intelligence assistant for student finance. Analyze this small financial summary and provide 2-3 sentences of useful, encouraging financial insight and observation:\n${JSON.stringify(summaryData)}`;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });
        const data = await response.json();
        if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
            return data.candidates[0].content.parts[0].text;
        }
    } catch (e) {
        console.error("Gemini API error:", e);
    }
    return null;
}
