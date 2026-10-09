/* =========================================
   EduFinance - Gemini client (no API key here)
   Calls the secure proxy hosted on Vercel.
   ========================================= */

const GEMINI_API_URL = "https://edufinanceapi.vercel.app/api/gemini";

async function getGeminiFinancialAdvice(summaryData) {
    
    try {
        const user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
        if (!user) return null;
        const idToken = await user.getIdToken();
        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + idToken
            },
            body: JSON.stringify({ summaryData })
        });
        if (!response.ok) return null;
        const data = await response.json();
        return data.advice || null;
    } catch (e) {
        console.error("Gemini request failed:", e);
        return null;
    }
}
