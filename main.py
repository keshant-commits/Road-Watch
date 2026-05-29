from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from routes import roads, complaints, budget, chatbot
import os

# --- APP INITIALIZATION ---
app = FastAPI(title="RoadWatch API")

# --- ENSURE REQUIRED FOLDERS EXIST ---
# These folders must exist before StaticFiles mounts, otherwise startup crashes
os.makedirs("static", exist_ok=True)
os.makedirs("static/uploads", exist_ok=True)  # FIX: pre-create uploads folder so photo saves never fail

# --- STATIC FILE SERVING ---
# Anything in /static/ is served directly to the browser (HTML, CSS, JS, images)
# e.g. http://localhost:8000/static/app.js
app.mount("/static", StaticFiles(directory="static"), name="static")

# --- ROUTE REGISTRATION ---
# Each router file handles its own group of endpoints
app.include_router(roads.router,      tags=["Roads"])
app.include_router(complaints.router, tags=["Complaints"])
app.include_router(budget.router,     tags=["Budget"])
app.include_router(chatbot.router,    tags=["AI Chatbot"])

# --- PAGE ROUTES ---

@app.get("/", response_class=FileResponse)
async def read_index():
    """Serves the citizen-facing complaint portal."""
    return FileResponse("static/index.html")

@app.get("/admin", response_class=FileResponse)
async def read_admin():
    """Serves the government admin dashboard."""
    return FileResponse("static/admin.html")

# --- ENTRY POINT ---
if __name__ == "__main__":
    import uvicorn
    # reload=True means the server auto-restarts when you save a Python file
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)