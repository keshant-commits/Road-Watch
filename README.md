# RoadWatch 🛣️

A citizen road infrastructure monitoring system built for a hackathon.

## Features
- 📍 Live GPS complaint submission with photo
- 🗺️ Leaflet map with complaint pins
- 🤖 Gemini AI chatbot for road queries
- 📊 Admin dashboard with complaint management
- 🔒 SHA-256 budget transparency log
- 📴 Offline complaint saving with auto-sync

## Tech Stack
- Frontend: HTML + Tailwind CSS + Leaflet.js
- Backend: Python + FastAPI
- Database: SQLite
- AI: Google Gemini API

## Setup
1. Clone the repo
2. Create a `.env` file with your `GEMINI_API_KEY`
3. Run `pip install -r requirement.txt`
4. Run `python main.py`
5. Open `http://localhost:8000`