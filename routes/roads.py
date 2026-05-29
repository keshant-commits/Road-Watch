from fastapi import APIRouter, HTTPException
from database import get_db_connection

router = APIRouter()

@router.get("/roads")
async def get_roads():
    """
    Returns all roads from the database.
    Used by the admin road asset table and the AI chatbot context.
    """
    try:
        conn = get_db_connection()
        rows = conn.execute("SELECT * FROM roads").fetchall()
        conn.close()
        return [dict(row) for row in rows]
    except Exception as e:
        print(f"❌ Roads fetch error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/roads/{road_id}")
async def get_road(road_id: int):
    """
    Returns a single road by its ID.
    Used when a complaint pin is clicked and we need to show which road it belongs to.
    """
    try:
        conn = get_db_connection()
        row = conn.execute("SELECT * FROM roads WHERE id = ?", (road_id,)).fetchone()
        conn.close()
        if row is None:
            raise HTTPException(status_code=404, detail="Road not found")
        return dict(row)
    except HTTPException:
        raise  # re-raise 404s as-is
    except Exception as e:
        print(f"❌ Road fetch error: {e}")
        raise HTTPException(status_code=500, detail=str(e))