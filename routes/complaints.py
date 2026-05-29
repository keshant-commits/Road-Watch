from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from database import get_db_connection
from dotenv import load_dotenv
import google.generativeai as genai
import shutil, os, uuid, base64, json, re, io

router = APIRouter()

# --- LOAD .env FILE ---
# This reads GEMINI_API_KEY from the .env file in your project root
load_dotenv()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# --- GEMINI VISION SETUP ---
# Used to check if a submitted photo is real or a screenshot
genai.configure(api_key=GEMINI_API_KEY)
vision_model = genai.GenerativeModel('gemini-2.0-flash')

# Upload folder — photos are saved here and served via /static/uploads/<filename>
UPLOAD_DIR = "static/uploads"


# ============================================================
# PHOTO AUTHENTICITY CHECK
# Sends the photo to Gemini Vision and asks if it's a real
# camera photo or a photo of another screen.
#
# HOW TO TOGGLE:
#   - Testing mode:  return True, "Check skipped (testing mode)"
#   - Live mode:     comment out that line and use the real check below
# ============================================================
async def is_photo_authentic(photo_bytes: bytes, skip_check: bool = False) -> tuple[bool, str]:

    # --- BYPASS FLAG ---
    # Set skip_check=True when calling from offline sync
    # so blank placeholder photos don't get rejected
    if skip_check:
        return True, "Check skipped (offline sync)"

    # --- TESTING MODE ---
    # Comment this line out before the hackathon demo to enable real checking
    return True, "Check skipped (testing mode)"

    # -------------------------------------------------------
    # REAL GEMINI VISION CHECK (active when line above is removed)
    # -------------------------------------------------------

    # Convert raw bytes to base64 string so Gemini can read the image
    image_data = base64.b64encode(photo_bytes).decode('utf-8')

    # Strict prompt — defaults to rejecting if uncertain
    prompt = """You are a photo forensics expert. Your job is to detect if this image
was taken directly by a camera pointed at a real-world scene, OR if it is a photo
of another device screen (phone, monitor, TV, laptop).

Look very carefully for ANY of these signs of a screen photo:
- Visible screen pixels, dot matrix, or RGB subpixel patterns
- Screen glare, reflections, or bright spots on glass
- Visible device bezels, phone frame, or monitor edges
- Slight color distortion or banding typical of photographing a lit screen
- The image appears to be inside another device's screen
- Unusual sharpness loss or moire interference patterns
- The background around the image shows a hand holding a phone

IMPORTANT RULES:
- If you see ANY of the above signs, mark authentic as false.
- If the image shows a road, pothole, or street scene with no screen signs, mark true.
- If you are even slightly unsure, mark authentic as false.
- Do NOT give benefit of the doubt. Be strict.

Respond ONLY with this exact JSON format, nothing else:
{"authentic": true, "reason": "one sentence explanation"}
or
{"authentic": false, "reason": "one sentence explanation"}"""

    try:
        response = vision_model.generate_content([
            {"mime_type": "image/jpeg", "data": image_data},
            prompt
        ])

        print(f"🤖 Gemini raw response: {response.text}")

        # Extract the JSON object from Gemini's response text
        match = re.search(r'\{[^{}]*"authentic"[^{}]*\}', response.text, re.DOTALL)
        if not match:
            # Cannot parse — reject for safety
            print("⚠️ Could not parse Gemini response — rejecting for safety")
            return False, "Could not verify photo authenticity — please retake the photo"

        result = json.loads(match.group())
        is_authentic = result.get("authentic", False)  # Default False — strict
        reason = result.get("reason", "No reason given")
        return is_authentic, reason

    except Exception as e:
        print(f"⚠️ Gemini Vision check error: {e}")
        # On any API error — reject the photo
        return False, f"Photo verification failed — please try again. ({str(e)})"


# ============================================================
# POST /complaint
# Receives a complaint from the citizen form.
# Steps: auth check → save photo → save to DB → return success
# ============================================================
@router.post("/complaint")
async def file_complaint(
    description:  str        = Form(...),   # Text description from the form
    lat:          float      = Form(...),   # GPS latitude  (hidden field)
    lng:          float      = Form(...),   # GPS longitude (hidden field)
    photo:        UploadFile = File(...),   # Live photo from the camera
    skip_auth:    str        = Form("no")  # "yes" = skip auth (used by offline sync)
):
    print(f"📩 Incoming complaint: '{description}' at ({lat}, {lng})")

    # Ensure uploads folder exists before trying to save
    os.makedirs(UPLOAD_DIR, exist_ok=True)

    # Read photo bytes once — reused for both Gemini check and disk save
    photo_bytes = await photo.read()

    # --- AUTHENTICITY CHECK ---
    # skip_auth="yes" is sent by storage.js during offline sync
    # so placeholder images don't get rejected by Gemini
    should_skip = (skip_auth.lower() == "yes")
    print("🔍 Running photo authenticity check...")
    is_real, reason = await is_photo_authentic(photo_bytes, skip_check=should_skip)

    if not is_real:
        print(f"🚫 Photo REJECTED — reason: {reason}")
        raise HTTPException(
            status_code=400,
            detail=f"Photo rejected: {reason}"
        )

    print(f"✅ Photo PASSED: {reason}")

    # Reset file pointer — after .read() the pointer is at end of file,
    # wrapping in BytesIO lets shutil read it again from the beginning
    photo.file = io.BytesIO(photo_bytes)

    # --- GENERATE UNIQUE FILENAME ---
    # Prevents two users uploading at the same time from overwriting each other
    ext = os.path.splitext(photo.filename)[-1] or ".jpg"
    unique_filename = f"photo_{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(UPLOAD_DIR, unique_filename)
    print(f"💾 Saving photo to: {file_path}")

    # --- SAVE PHOTO TO DISK ---
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(photo.file, buffer)
    except Exception as e:
        print(f"❌ File save failed: {e}")
        raise HTTPException(status_code=500, detail=f"Could not save photo: {str(e)}")

    # --- SAVE COMPLAINT TO DATABASE ---
    # Only the filename is stored (not the full path).
    # Frontend builds the full URL as: /static/uploads/<filename>
    try:
        conn = get_db_connection()
        conn.execute(
            "INSERT INTO complaints (lat, lng, photo_path, description, status) VALUES (?, ?, ?, ?, ?)",
            (lat, lng, unique_filename, description, "Pending")
        )
        conn.commit()
        conn.close()
        print(f"✅ Complaint saved to DB: {unique_filename}")
    except Exception as e:
        print(f"❌ Database insert failed: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

    return {
        "status": "success",
        "message": "Complaint registered successfully!",
        "photo_url": f"/static/uploads/{unique_filename}"
    }


# ============================================================
# PATCH /complaint/{id}/status
# Admin endpoint — updates the status of a single complaint.
# Valid values: Pending | Work In Progress | Issue Fixed | Dropped
# ============================================================
@router.patch("/complaint/{complaint_id}/status")
async def update_complaint_status(complaint_id: int, status: str = Form(...)):

    # Only allow these 4 statuses — reject anything else to prevent bad data
    valid_statuses = ["Pending", "Work In Progress", "Issue Fixed", "Dropped"]
    if status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
        )

    try:
        conn = get_db_connection()

        # Make sure the complaint exists before trying to update it
        row = conn.execute(
            "SELECT id FROM complaints WHERE id = ?", (complaint_id,)
        ).fetchone()

        if not row:
            conn.close()
            raise HTTPException(status_code=404, detail=f"Complaint #{complaint_id} not found")

        # Update the status column
        conn.execute(
            "UPDATE complaints SET status = ? WHERE id = ?",
            (status, complaint_id)
        )
        conn.commit()
        conn.close()

        print(f"✅ Complaint #{complaint_id} → {status}")
        return {"status": "success", "complaint_id": complaint_id, "new_status": status}

    except HTTPException:
        raise  # Re-raise 404s and 400s as-is without wrapping them
    except Exception as e:
        print(f"❌ Status update error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# GET /complaints
# Returns all complaints ordered newest first.
# Used by citizen map, admin map, and admin complaints table.
# ============================================================
@router.get("/complaints")
async def get_complaints():
    try:
        conn = get_db_connection()
        rows = conn.execute(
            "SELECT * FROM complaints ORDER BY timestamp DESC"
        ).fetchall()
        conn.close()
        return [dict(row) for row in rows]
    except Exception as e:
        print(f"❌ Fetch complaints error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    