import sqlite3
import os

DB_PATH = "roadwatch.db"

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()

    # --- TABLE 1: Roads ---
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS roads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            type TEXT,
            contractor TEXT,
            last_repair TEXT,
            budget TEXT
        )
    ''')

    # --- TABLE 2: Complaints ---
    # NEW: added "status" column with default "Pending"
    # Status can be: Pending | Work In Progress | Issue Fixed | Dropped
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS complaints (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lat REAL,
            lng REAL,
            photo_path TEXT,
            description TEXT,
            status TEXT DEFAULT 'Pending',
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # --- ADD status column if upgrading from old DB that doesn't have it ---
    # This handles the case where the DB file already exists without the column
    try:
        cursor.execute("ALTER TABLE complaints ADD COLUMN status TEXT DEFAULT 'Pending'")
        print("✅ Added 'status' column to existing complaints table.")
    except Exception:
        pass  # Column already exists — that's fine, ignore the error

    # --- TABLE 3: Budget Log ---
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS budget_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            road_id INTEGER,
            amount REAL,
            type TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            hash TEXT
        )
    ''')

    # --- PRE-FILL SAMPLE DATA ---
    cursor.execute("SELECT count(*) FROM roads")
    if cursor.fetchone()[0] == 0:
        roads_data = [
            ('National Highway 6',  'NH',  'BuildCorp Ltd.', 'Oct 2023',  '₹4.2 Cr'),
            ('Ring Road East',      'SH',  'Metro Infra',    'Jan 2024',  '₹1.8 Cr'),
            ('City Center Bypass',  'MDR', 'RoadWays Inc.',  'June 2023', '₹90 Lakhs'),
            ('MG Road',             'SH',  'CityBuild Co.',  'Mar 2024',  '₹2.1 Cr'),
            ('Outer Ring Road',     'NH',  'BuildCorp Ltd.', 'Dec 2023',  '₹5.0 Cr'),
        ]
        cursor.executemany(
            "INSERT INTO roads (name, type, contractor, last_repair, budget) VALUES (?,?,?,?,?)",
            roads_data
        )

    cursor.execute("SELECT count(*) FROM complaints")
    if cursor.fetchone()[0] == 0:
        complaints_data = [
            (21.2514, 81.6296, 'sample_placeholder', 'Large pothole near NH6 junction',  'Pending',         '2024-05-01 10:00:00'),
            (21.2600, 81.6350, 'sample_placeholder', 'Road surface cracking badly',       'Work In Progress','2024-05-02 12:00:00'),
            (21.2450, 81.6200, 'sample_placeholder', 'Drainage issue flooding road',      'Issue Fixed',     '2024-05-03 09:30:00'),
        ]
        cursor.executemany(
            "INSERT INTO complaints (lat, lng, photo_path, description, status, timestamp) VALUES (?,?,?,?,?,?)",
            complaints_data
        )

    cursor.execute("SELECT count(*) FROM budget_log")
    if cursor.fetchone()[0] == 0:
        import hashlib, time
        budget_entries = [
            (1, 42000000, 'Sanctioned'),
            (1, 38000000, 'Spent'),
            (2, 18000000, 'Sanctioned'),
            (2, 15500000, 'Spent'),
            (3,  9000000, 'Sanctioned'),
        ]
        for road_id, amount, btype in budget_entries:
            ts = str(time.time())
            h = hashlib.sha256(f"{road_id}{amount}{ts}".encode()).hexdigest()
            cursor.execute(
                "INSERT INTO budget_log (road_id, amount, type, hash) VALUES (?,?,?,?)",
                (road_id, amount, btype, h)
            )

    conn.commit()
    conn.close()
    print("✅ Database initialized successfully.")

init_db()