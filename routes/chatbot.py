from fastapi import APIRouter
import google.generativeai as genai
from database import get_db_connection
from dotenv import load_dotenv
import os

router = APIRouter()


load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel('gemini-2.0-flash')

@router.post("/chat")
async def chat(message: str):
    """
    Accepts a user question, injects your road database as context,
    and returns an intelligent AI response using Gemini.
    """

    # --- STEP 1: Fetch live road data from the database ---
    # This is pasted into the AI's system prompt so it can answer
    # questions like "Who maintains NH6?" or "When was Ring Road last repaired?"
    try:
        conn = get_db_connection()
        roads = conn.execute("SELECT * FROM roads").fetchall()
        complaints = conn.execute(
            "SELECT id, description, timestamp FROM complaints ORDER BY timestamp DESC LIMIT 10"
        ).fetchall()
        conn.close()
        road_data    = [dict(r) for r in roads]
        recent_issues = [dict(c) for c in complaints]
    except Exception as e:
        road_data    = []
        recent_issues = []
        print(f"⚠️ DB fetch for chatbot failed: {e}")

    # --- STEP 2: Build the system prompt with real data ---
    # The more specific this is, the better the AI answers
    system_prompt = f"""
You are RoadWatch AI, an intelligent assistant for a road infrastructure monitoring system in India.
You help citizens and government officials with road-related queries.

Your knowledge base (live from database):
ROADS: {road_data}
RECENT COMPLAINTS (last 10): {recent_issues}

Rules:
- Only answer road, infrastructure, contractor, budget, or complaint related questions.
- If asked about a specific road, use the data above to give accurate answers.
- Be concise and helpful. Use ₹ for currency. Mention contractor names when relevant.
- If you don't have enough data to answer, say so honestly.
"""

    # --- STEP 3: Call the Gemini API ---
    try:
        full_prompt = f"{system_prompt}\n\nUser Question: {message}"
        response = model.generate_content(full_prompt)
        return {"response": response.text}
    except Exception as e:
        print(f"❌ Gemini API error: {e}")
        # Return a friendly fallback so the UI doesn't break
        return {"response": f"AI is temporarily offline. Please try again. (Error: {str(e)})"}