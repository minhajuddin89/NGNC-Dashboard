import os
import sys
import sqlite3
import datetime
import threading
import time
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_FILE = os.path.join(BASE_DIR, "tasks.db")
EXCEL_FILE = os.path.join(BASE_DIR, "tasks.xlsx")

MASTER_ADMIN_USER = "admin"
MASTER_ADMIN_PASS = "admin123"

_sync_lock = threading.Lock()
_pending_excel_sync = False
_sync_timer = None

def get_local_now():
    tz_bd = datetime.timezone(datetime.timedelta(hours=6))
    return datetime.datetime.now(tz_bd)

def get_db():
    conn = sqlite3.connect(DB_FILE, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA busy_timeout = 30000;")
    return conn

def compute_forwarded_by(desc):
    import re
    if not desc:
        return ""
    desc_lower = str(desc).lower()
    forwarded_list = []
    if re.search(r'\bncss\b', desc_lower): forwarded_list.append("NCSS")
    if re.search(r'\bbnoc\b', desc_lower): forwarded_list.append("BNOC")
    if re.search(r'\bsat\b', desc_lower): forwarded_list.append("SAT")
    if re.search(r'\bsales\b', desc_lower): forwarded_list.append("Sales")
    if re.search(r'\bnmc\b', desc_lower): forwarded_list.append("NMC")
    if re.search(r'\bbackbone\b', desc_lower): forwarded_list.append("Backbone")
    if re.search(r'\bini\b', desc_lower): forwarded_list.append("INI")
    if re.search(r'\bngnc\b', desc_lower): forwarded_list.append("NGNC")
    if re.search(r'\bsystem\s+team\b', desc_lower): forwarded_list.append("System Team")
    if re.search(r'\bpower\s+team\b', desc_lower): forwarded_list.append("Power Team")
    if re.search(r'\bproject\b', desc_lower): forwarded_list.append("PROJECT")
    return ", ".join(forwarded_list) if forwarded_list else ""

def init_db():
    """Initializes tables in SQLite database if they do not exist."""
    conn = get_db()
    with conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS tasks (
            id TEXT PRIMARY KEY,
            description TEXT,
            owner TEXT,
            start_time TEXT,
            end_time TEXT,
            duration TEXT,
            status TEXT DEFAULT 'Pending',
            last_updated TEXT,
            pending_reason TEXT,
            escalation_history TEXT,
            config_status TEXT,
            mis_status TEXT DEFAULT 'Not Closed',
            assigned_time TEXT,
            assignment_history TEXT,
            forwarded_by TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
        CREATE INDEX IF NOT EXISTS idx_tasks_owner ON tasks(owner);
        CREATE INDEX IF NOT EXISTS idx_tasks_last_updated ON tasks(last_updated);

        CREATE TABLE IF NOT EXISTS owners (
            name TEXT PRIMARY KEY
        );

        CREATE TABLE IF NOT EXISTS users (
            username TEXT PRIMARY KEY,
            name TEXT,
            password TEXT,
            created_at TEXT,
            reports_access TEXT DEFAULT 'false'
        );

        CREATE TABLE IF NOT EXISTS shifts (
            code TEXT PRIMARY KEY,
            name TEXT,
            start_time TEXT,
            end_time TEXT
        );

        CREATE TABLE IF NOT EXISTS roster (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            owner TEXT,
            date TEXT,
            code TEXT,
            start_time TEXT,
            end_time TEXT,
            shift_name TEXT,
            UNIQUE(owner, date)
        );
        CREATE INDEX IF NOT EXISTS idx_roster_date ON roster(date);
        CREATE INDEX IF NOT EXISTS idx_roster_owner ON roster(owner);

        CREATE TABLE IF NOT EXISTS quicklinks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            url TEXT
        );

        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            assigned_to TEXT,
            created_by TEXT,
            created_at TEXT,
            target_date TEXT DEFAULT '',
            finished_at TEXT DEFAULT '',
            status TEXT DEFAULT 'In Progress',
            progress INTEGER DEFAULT 0,
            last_updated TEXT,
            updates_json TEXT DEFAULT '[]'
        );
        """)
    conn.close()

def migrate_excel_to_sqlite():
    """Reads tasks.xlsx if present and migrates all sheets into tasks.db."""
    init_db()
    conn = get_db()
    
    # Check if tasks table already has data
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM tasks")
    task_count = cur.fetchone()[0]
    
    if task_count > 0:
        # DB already populated
        conn.close()
        return False

    if not os.path.exists(EXCEL_FILE):
        # Insert defaults
        with conn:
            conn.execute("INSERT OR IGNORE INTO users VALUES (?, ?, ?, ?, ?)",
                         (MASTER_ADMIN_USER, "System Administrator", MASTER_ADMIN_PASS,
                          get_local_now().strftime("%Y-%m-%d %H:%M"), "true"))
            for o in ["Minhaj Uddin", "System Administrator"]:
                conn.execute("INSERT OR IGNORE INTO owners VALUES (?)", (o,))
            default_shifts = [
                ("M", "Morning Shift", "09:30", "18:30"),
                ("EE", "Early Evening Shift", "11:00", "20:00"),
                ("E", "Evening Shift", "14:00", "22:00"),
                ("LE", "Late Evening Shift", "16:00", "00:00")
            ]
            for s in default_shifts:
                conn.execute("INSERT OR IGNORE INTO shifts VALUES (?, ?, ?, ?)", s)
            conn.execute("INSERT INTO quicklinks (name, url) VALUES (?, ?)",
                         ("IPAM", "http://phpipam.link3.net/index.php?page=login"))
        conn.close()
        return True

    print(f"[MIGRATION] Migrating data from {EXCEL_FILE} to {DB_FILE}...")
    try:
        wb = openpyxl.load_workbook(EXCEL_FILE, data_only=True)
    except Exception as e:
        print(f"[MIGRATION ERROR] Could not open {EXCEL_FILE}: {e}")
        conn.close()
        return False

    with conn:
        # 1. Tasks
        if "Tasks" in wb.sheetnames:
            ws = wb["Tasks"]
            for row in ws.iter_rows(min_row=2, values_only=True):
                if not row or not row[0]:
                    continue
                task_id = str(row[0]).strip()
                desc = str(row[1]) if row[1] is not None else ""
                owner = str(row[2]) if row[2] is not None else ""
                
                start_val = row[3]
                if isinstance(start_val, (datetime.datetime, datetime.date)):
                    start_val = start_val.strftime("%Y-%m-%d %H:%M")
                start_time = str(start_val) if start_val is not None else ""

                end_val = row[4]
                if isinstance(end_val, (datetime.datetime, datetime.date)):
                    end_val = end_val.strftime("%Y-%m-%d %H:%M")
                end_time = str(end_val) if end_val is not None else ""

                duration = str(row[5]) if row[5] is not None else ""
                status = str(row[6]) if row[6] is not None else "Pending"

                up_val = row[7]
                if isinstance(up_val, (datetime.datetime, datetime.date)):
                    up_val = up_val.strftime("%Y-%m-%d %H:%M")
                last_updated = str(up_val) if up_val is not None else ""

                pending_reason = str(row[8]) if len(row) > 8 and row[8] is not None else ""
                escalation_history = str(row[9]) if len(row) > 9 and row[9] is not None else ""
                config_status = str(row[10]) if len(row) > 10 and row[10] is not None else ""
                mis_status = str(row[11]) if len(row) > 11 and row[11] is not None else "Not Closed"
                assigned_time = str(row[12]) if len(row) > 12 and row[12] is not None else ""
                assignment_history = str(row[13]) if len(row) > 13 and row[13] is not None else ""
                forwarded_by = compute_forwarded_by(desc)

                conn.execute("""
                INSERT OR REPLACE INTO tasks 
                (id, description, owner, start_time, end_time, duration, status, last_updated,
                 pending_reason, escalation_history, config_status, mis_status, assigned_time,
                 assignment_history, forwarded_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (task_id, desc, owner, start_time, end_time, duration, status, last_updated,
                      pending_reason, escalation_history, config_status, mis_status, assigned_time,
                      assignment_history, forwarded_by))

        # 2. Owners
        if "Owners" in wb.sheetnames:
            ws = wb["Owners"]
            for row in ws.iter_rows(min_row=2, max_col=1, values_only=True):
                if row and row[0]:
                    name = str(row[0]).strip()
                    if name:
                        conn.execute("INSERT OR IGNORE INTO owners (name) VALUES (?)", (name,))

        # 3. Users
        if "Users" in wb.sheetnames:
            ws = wb["Users"]
            for row in ws.iter_rows(min_row=2, values_only=True):
                if not row or not row[0]:
                    continue
                username = str(row[0]).strip().lower()
                name = str(row[1]).strip() if len(row) > 1 and row[1] else username
                password = str(row[2]).strip() if len(row) > 2 and row[2] else ""
                
                cr_val = row[3] if len(row) > 3 else ""
                if isinstance(cr_val, (datetime.datetime, datetime.date)):
                    cr_val = cr_val.strftime("%Y-%m-%d %H:%M")
                created_at = str(cr_val) if cr_val else ""

                rep_access = "false"
                if len(row) > 4 and row[4] is not None:
                    rep_access = str(row[4]).strip().lower()
                if username == MASTER_ADMIN_USER:
                    rep_access = "true"

                conn.execute("""
                INSERT OR REPLACE INTO users (username, name, password, created_at, reports_access)
                VALUES (?, ?, ?, ?, ?)
                """, (username, name, password, created_at, rep_access))

        # Ensure admin exists
        conn.execute("INSERT OR IGNORE INTO users VALUES (?, ?, ?, ?, ?)",
                     (MASTER_ADMIN_USER, "System Administrator", MASTER_ADMIN_PASS,
                      get_local_now().strftime("%Y-%m-%d %H:%M"), "true"))

        # 4. Shifts
        if "Shifts" in wb.sheetnames:
            ws = wb["Shifts"]
            for row in ws.iter_rows(min_row=2, values_only=True):
                if not row or not row[0]:
                    continue
                code = str(row[0]).strip().upper()
                s_name = str(row[1]).strip() if len(row) > 1 and row[1] else ""
                start_t = str(row[2]).strip() if len(row) > 2 and row[2] else ""
                end_t = str(row[3]).strip() if len(row) > 3 and row[3] else ""
                conn.execute("INSERT OR REPLACE INTO shifts VALUES (?, ?, ?, ?)",
                             (code, s_name, start_t, end_t))

        # 5. Roster
        if "Roster" in wb.sheetnames:
            ws = wb["Roster"]
            for row in ws.iter_rows(min_row=2, values_only=True):
                if not row or not row[0]:
                    continue
                r_owner = str(row[0]).strip()
                date_val = row[1] if len(row) > 1 else ""
                if isinstance(date_val, (datetime.datetime, datetime.date)):
                    date_val = date_val.strftime("%Y-%m-%d")
                date_str = str(date_val).strip() if date_val else ""

                code = str(row[2]).strip().upper() if len(row) > 2 and row[2] else ""

                start_val = row[3] if len(row) > 3 else ""
                if isinstance(start_val, datetime.time):
                    start_val = start_val.strftime("%H:%M")
                start_t = str(start_val).strip() if start_val else ""

                end_val = row[4] if len(row) > 4 else ""
                if isinstance(end_val, datetime.time):
                    end_val = end_val.strftime("%H:%M")
                end_t = str(end_val).strip() if end_val else ""

                shift_n = str(row[5]).strip() if len(row) > 5 and row[5] else ""

                if "HOLIDAY" in code or code == "H" or "HOLIDAY" in shift_n.upper():
                    code = "HOLIDAY"
                    shift_n = "Holiday"
                    start_t = ""
                    end_t = ""

                conn.execute("""
                INSERT OR REPLACE INTO roster (owner, date, code, start_time, end_time, shift_name)
                VALUES (?, ?, ?, ?, ?, ?)
                """, (r_owner, date_str, code, start_t, end_t, shift_n))

        # 6. QuickLinks
        if "QuickLinks" in wb.sheetnames:
            ws = wb["QuickLinks"]
            for row in ws.iter_rows(min_row=2, values_only=True):
                if not row or not row[0]:
                    continue
                ql_name = str(row[0]).strip()
                ql_url = str(row[1]).strip() if len(row) > 1 and row[1] else ""
                conn.execute("INSERT INTO quicklinks (name, url) VALUES (?, ?)", (ql_name, ql_url))

    wb.close()
    conn.close()
    print("[MIGRATION SUCCESS] SQLite migration completed successfully.")
    return True

# --- High-Speed DB Access APIs ---

def db_get_all_tasks():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM tasks")
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

def db_get_filtered_dashboard_tasks():
    today_str = get_local_now().strftime("%Y-%m-%d")
    conn = get_db()
    cur = conn.cursor()
    # Filter: Non-completed tasks OR completed today
    query = """
    SELECT * FROM tasks 
    WHERE status != 'Completed' 
       OR end_time LIKE ? 
       OR (end_time = '' AND last_updated LIKE ?)
    """
    cur.execute(query, (f"{today_str}%", f"{today_str}%"))
    rows = [dict(r) for r in cur.fetchall()]
    conn.close()
    return rows

def db_get_task_by_id(task_id):
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
    row = cur.fetchone()
    conn.close()
    return dict(row) if row else None

def db_insert_task(task):
    task["forwarded_by"] = compute_forwarded_by(task.get("description", ""))
    conn = get_db()
    with conn:
        conn.execute("""
        INSERT INTO tasks 
        (id, description, owner, start_time, end_time, duration, status, last_updated,
         pending_reason, escalation_history, config_status, mis_status, assigned_time,
         assignment_history, forwarded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            task["id"],
            task.get("description", ""),
            task.get("owner", "Unassigned"),
            task.get("start_time", ""),
            task.get("end_time", ""),
            task.get("duration", ""),
            task.get("status", "Pending"),
            task.get("last_updated", ""),
            task.get("pending_reason", ""),
            task.get("escalation_history", ""),
            task.get("config_status", ""),
            task.get("mis_status", "Not Closed"),
            task.get("assigned_time", ""),
            task.get("assignment_history", ""),
            task["forwarded_by"]
        ))
    conn.close()
    schedule_excel_sync()
    return task

def db_update_task(task):
    task["forwarded_by"] = compute_forwarded_by(task.get("description", ""))
    conn = get_db()
    with conn:
        conn.execute("""
        UPDATE tasks SET
            description = ?,
            owner = ?,
            start_time = ?,
            end_time = ?,
            duration = ?,
            status = ?,
            last_updated = ?,
            pending_reason = ?,
            escalation_history = ?,
            config_status = ?,
            mis_status = ?,
            assigned_time = ?,
            assignment_history = ?,
            forwarded_by = ?
        WHERE id = ?
        """, (
            task.get("description", ""),
            task.get("owner", "Unassigned"),
            task.get("start_time", ""),
            task.get("end_time", ""),
            task.get("duration", ""),
            task.get("status", "Pending"),
            task.get("last_updated", ""),
            task.get("pending_reason", ""),
            task.get("escalation_history", ""),
            task.get("config_status", ""),
            task.get("mis_status", "Not Closed"),
            task.get("assigned_time", ""),
            task.get("assignment_history", ""),
            task["forwarded_by"],
            task["id"]
        ))
    conn.close()
    schedule_excel_sync()
    return task

def db_delete_task(task_id):
    conn = get_db()
    with conn:
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.close()
    schedule_excel_sync()

def db_clear_all_tasks():
    conn = get_db()
    with conn:
        conn.execute("DELETE FROM tasks")
    conn.close()
    schedule_excel_sync()

def db_get_users():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users")
    users = [dict(u) for u in cur.fetchall()]
    conn.close()
    # Ensure master admin is always present
    if not any(u["username"].lower() == MASTER_ADMIN_USER for u in users):
        users.append({
            "username": MASTER_ADMIN_USER,
            "name": "System Administrator",
            "password": MASTER_ADMIN_PASS,
            "created_at": "",
            "reports_access": "true"
        })
    return users

def db_add_user(username, name, password):
    u_clean = username.strip().lower()
    if not u_clean:
        return False, "Username cannot be empty."
    conn = get_db()
    try:
        with conn:
            cur = conn.cursor()
            cur.execute("SELECT username FROM users WHERE LOWER(username) = ?", (u_clean,))
            if cur.fetchone():
                return False, "Username already exists."
            now_str = get_local_now().strftime("%Y-%m-%d %H:%M")
            conn.execute("INSERT INTO users (username, name, password, created_at, reports_access) VALUES (?, ?, ?, ?, ?)",
                         (username.strip(), name.strip(), password, now_str, "false"))
            conn.execute("INSERT OR IGNORE INTO owners (name) VALUES (?)", (name.strip(),))
    finally:
        conn.close()
    schedule_excel_sync()
    return True, "User created successfully."

def db_delete_user(username):
    u_clean = username.strip().lower()
    if u_clean == MASTER_ADMIN_USER:
        return False, "Cannot delete the master admin account."
    conn = get_db()
    try:
        with conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM users WHERE LOWER(username) = ?", (u_clean,))
            deleted = cur.rowcount > 0
    finally:
        conn.close()
    if deleted:
        schedule_excel_sync()
        return True, "User deleted successfully."
    return False, "User not found."

def db_update_user_password(username, current_password, new_password, is_admin_override=False):
    u_clean = username.strip().lower()
    if not u_clean:
        return False, "Username cannot be empty."
    if not new_password or len(str(new_password).strip()) < 3:
        return False, "New password must be at least 3 characters."

    conn = get_db()
    try:
        with conn:
            cur = conn.cursor()
            cur.execute("SELECT password FROM users WHERE LOWER(username) = ?", (u_clean,))
            row = cur.fetchone()
            if not row:
                return False, "User not found."
            if not is_admin_override:
                if str(row["password"] or "") != str(current_password or ""):
                    return False, "Current password does not match."
            conn.execute("UPDATE users SET password = ? WHERE LOWER(username) = ?", (str(new_password).strip(), u_clean))
    finally:
        conn.close()
    schedule_excel_sync()
    return True, "Password updated successfully."

def db_toggle_reports_access(username, status_str):
    u_clean = username.strip().lower()
    if u_clean == MASTER_ADMIN_USER:
        return True, "Master admin retains full access."
    conn = get_db()
    try:
        with conn:
            conn.execute("UPDATE users SET reports_access = ? WHERE LOWER(username) = ?", (status_str.lower(), u_clean))
    finally:
        conn.close()
    schedule_excel_sync()
    return True, f"Reports access updated to {status_str}."

def db_get_owners():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT name FROM owners ORDER BY name ASC")
    owners = [r["name"] for r in cur.fetchall()]
    conn.close()
    if not owners:
        owners = ["Minhaj Uddin", "System Administrator"]
    return owners

def db_add_owner(name):
    clean_name = name.strip()
    if not clean_name:
        return False
    conn = get_db()
    added = False
    try:
        with conn:
            cur = conn.cursor()
            cur.execute("SELECT name FROM owners WHERE LOWER(name) = ?", (clean_name.lower(),))
            if not cur.fetchone():
                conn.execute("INSERT INTO owners (name) VALUES (?)", (clean_name,))
                added = True
    finally:
        conn.close()
    if added:
        schedule_excel_sync()
    return added

def db_get_shifts():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT * FROM shifts")
    rows = cur.fetchall()
    shifts = {}
    for r in rows:
        shifts[r["code"]] = {"name": r["name"], "start": r["start_time"], "end": r["end_time"]}
    conn.close()
    if not shifts:
        shifts = {
            "M": {"start": "09:30", "end": "18:30", "name": "Morning Shift"},
            "EE": {"start": "11:00", "end": "20:00", "name": "Early Evening Shift"},
            "E": {"start": "14:00", "end": "22:00", "name": "Evening Shift"},
            "LE": {"start": "16:00", "end": "00:00", "name": "Late Evening Shift"}
        }
    return shifts

def db_save_shifts(shifts_dict):
    conn = get_db()
    with conn:
        conn.execute("DELETE FROM shifts")
        for code, details in shifts_dict.items():
            conn.execute("INSERT INTO shifts VALUES (?, ?, ?, ?)", (
                code.upper().strip(),
                details.get("name", "").strip(),
                details.get("start", "").strip(),
                details.get("end", "").strip()
            ))
    conn.close()
    schedule_excel_sync()

def db_get_roster():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT owner, date, code, start_time, end_time, shift_name FROM roster")
    roster = [dict(r) for r in cur.fetchall()]
    conn.close()
    return roster

def db_batch_update_roster(updates_list, shift_hours=None):
    if shift_hours is None:
        shift_hours = db_get_shifts()
    conn = get_db()
    with conn:
        for item in updates_list:
            owner = item.get("owner", "").strip()
            date_str = item.get("date", "").strip()
            code = item.get("code", "").strip().upper()
            if not owner or not date_str or not code:
                continue

            shift_name = "Day off"
            start_time = ""
            end_time = ""
            if code in shift_hours:
                sh = shift_hours[code]
                shift_name = sh.get("name", "")
                start_time = sh.get("start", "")
                end_time = sh.get("end", "")
            elif code == "LEAVE":
                shift_name = "Casual/Sick Leave"
            elif "HOLIDAY" in code or code == "H":
                code = "HOLIDAY"
                shift_name = "Holiday"
                start_time = ""
                end_time = ""

            conn.execute("""
            INSERT INTO roster (owner, date, code, start_time, end_time, shift_name)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(owner, date) DO UPDATE SET
                code = excluded.code,
                start_time = excluded.start_time,
                end_time = excluded.end_time,
                shift_name = excluded.shift_name
            """, (owner, date_str, code, start_time, end_time, shift_name))
    conn.close()
    schedule_excel_sync()

def db_get_quicklinks():
    conn = get_db()
    cur = conn.cursor()
    cur.execute("SELECT name, url FROM quicklinks")
    links = [dict(r) for r in cur.fetchall()]
    conn.close()
    if not links:
        links = [{"name": "IPAM", "url": "http://phpipam.link3.net/index.php?page=login"}]
    return links

def db_save_quicklinks(links_list):
    conn = get_db()
    with conn:
        conn.execute("DELETE FROM quicklinks")
        for item in links_list:
            name = item.get("name", "").strip()
            url = item.get("url", "").strip()
            if name and url:
                conn.execute("INSERT INTO quicklinks (name, url) VALUES (?, ?)", (name, url))
    conn.close()
    schedule_excel_sync()

# --- Asynchronous Background Excel Sync (Zero User Latency) ---

def schedule_excel_sync(delay_seconds=3.0):
    """Debounces Excel file writes so multiple rapid task updates result in a single clean write."""
    global _sync_timer, _pending_excel_sync
    _pending_excel_sync = True
    if _sync_timer and _sync_timer.is_alive():
        _sync_timer.cancel()
    _sync_timer = threading.Timer(delay_seconds, _do_background_excel_sync)
    _sync_timer.daemon = True
    _sync_timer.start()

def _do_background_excel_sync():
    """Worker thread target to sync SQLite state into tasks.xlsx safely."""
    global _pending_excel_sync
    with _sync_lock:
        if not _pending_excel_sync:
            return
        _pending_excel_sync = False
        try:
            write_full_excel_from_db(EXCEL_FILE)
            print(f"[{get_local_now().strftime('%H:%M:%S')}] Background Excel sync completed successfully.")
        except Exception as e:
            print(f"[BACKGROUND EXCEL SYNC WARNING] Could not write to {EXCEL_FILE}: {e}")

def write_full_excel_from_db(target_path):
    """Generates the full, styled tasks.xlsx workbook containing all 6 sheets from SQLite."""
    wb = openpyxl.Workbook()
    header_fill = PatternFill(start_color="107C41", end_color="107C41", fill_type="solid")
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    center_align = Alignment(horizontal="center", vertical="center")
    data_font = Font(name="Segoe UI", size=10)
    thin_border = Border(
        left=Side(style='thin', color='D9D9D9'),
        right=Side(style='thin', color='D9D9D9'),
        top=Side(style='thin', color='D9D9D9'),
        bottom=Side(style='thin', color='D9D9D9')
    )

    # 1. Sheet: Tasks
    ws_tasks = wb.active
    ws_tasks.title = "Tasks"
    headers_tasks = ["Task ID", "Description", "Owner", "Start Time", "End Time", "Duration", "Status",
                     "Last Updated", "Pending Reason", "Escalation History", "Config Status", "MIS Status",
                     "Assigned Time", "Assignment History"]
    ws_tasks.append(headers_tasks)
    for col_idx in range(1, len(headers_tasks) + 1):
        cell = ws_tasks.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center_align

    tasks = db_get_all_tasks()
    for idx, t in enumerate(tasks):
        row_idx = idx + 2
        row_data = [
            t.get("id", ""),
            t.get("description", ""),
            t.get("owner", ""),
            t.get("start_time", ""),
            t.get("end_time", ""),
            t.get("duration", ""),
            t.get("status", "Pending"),
            t.get("last_updated", ""),
            t.get("pending_reason", ""),
            t.get("escalation_history", ""),
            t.get("config_status", ""),
            t.get("mis_status", "Not Closed"),
            t.get("assigned_time", ""),
            t.get("assignment_history", "")
        ]
        ws_tasks.append(row_data)
        for col_idx in range(1, len(headers_tasks) + 1):
            cell = ws_tasks.cell(row=row_idx, column=col_idx)
            cell.font = data_font
            cell.border = thin_border
            if col_idx in [1, 4, 5, 6, 7, 8, 12]:
                cell.alignment = center_align
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")

            status = t.get("status", "Pending")
            if col_idx == 7:  # Status column
                if status == "Completed":
                    cell.fill = PatternFill(start_color="D9EAD3", end_color="D9EAD3", fill_type="solid")
                    cell.font = Font(name="Segoe UI", size=10, color="274E13", bold=True)
                elif status == "In Progress":
                    cell.fill = PatternFill(start_color="FCE5CD", end_color="FCE5CD", fill_type="solid")
                    cell.font = Font(name="Segoe UI", size=10, color="783F04", bold=True)
                else:
                    cell.fill = PatternFill(start_color="FFF2CC", end_color="FFF2CC", fill_type="solid")
                    cell.font = Font(name="Segoe UI", size=10, color="7F6000", bold=True)

    for col in ws_tasks.columns:
        col_letter = get_column_letter(col[0].column)
        max_len = max(len(str(cell.value or '')) for cell in col)
        ws_tasks.column_dimensions[col_letter].width = max(max_len + 3, 12)

    # 2. Sheet: Owners
    ws_owners = wb.create_sheet(title="Owners")
    ws_owners.append(["Owner Name"])
    ws_owners.cell(row=1, column=1).fill = header_fill
    ws_owners.cell(row=1, column=1).font = header_font
    ws_owners.cell(row=1, column=1).alignment = center_align
    ws_owners.column_dimensions['A'].width = 25
    for o in db_get_owners():
        ws_owners.append([o])

    # 3. Sheet: Users
    ws_users = wb.create_sheet(title="Users")
    headers_users = ["User ID", "Full Name", "Password", "Created At", "Reports Access"]
    ws_users.append(headers_users)
    for col_idx in range(1, len(headers_users) + 1):
        cell = ws_users.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center_align
    for u in db_get_users():
        ws_users.append([u["username"], u["name"], u["password"], u["created_at"], u.get("reports_access", "false")])
    for col in ws_users.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = get_column_letter(col[0].column)
        ws_users.column_dimensions[col_letter].width = max(max_len + 3, 15)

    # 4. Sheet: Roster
    ws_roster = wb.create_sheet(title="Roster")
    headers_roster = ["Operator Name", "Date", "Shift Code", "Start Time", "End Time", "Shift Name"]
    ws_roster.append(headers_roster)
    for col_idx in range(1, len(headers_roster) + 1):
        cell = ws_roster.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center_align
    for r in db_get_roster():
        ws_roster.append([r["owner"], r["date"], r["code"], r["start_time"], r["end_time"], r["shift_name"]])
    ws_roster.column_dimensions['A'].width = 25
    ws_roster.column_dimensions['B'].width = 15
    ws_roster.column_dimensions['C'].width = 12
    ws_roster.column_dimensions['D'].width = 12
    ws_roster.column_dimensions['E'].width = 12
    ws_roster.column_dimensions['F'].width = 20

    # 5. Sheet: Shifts
    ws_shifts = wb.create_sheet(title="Shifts")
    headers_shifts = ["Shift Code", "Shift Name", "Start Time", "End Time"]
    ws_shifts.append(headers_shifts)
    for col_idx in range(1, len(headers_shifts) + 1):
        cell = ws_shifts.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center_align
    for code, sh in db_get_shifts().items():
        ws_shifts.append([code, sh.get("name", ""), sh.get("start", ""), sh.get("end", "")])
    ws_shifts.column_dimensions['A'].width = 12
    ws_shifts.column_dimensions['B'].width = 25
    ws_shifts.column_dimensions['C'].width = 15
    ws_shifts.column_dimensions['D'].width = 15

    # 6. Sheet: QuickLinks
    ws_links = wb.create_sheet(title="QuickLinks")
    headers_links = ["Portal Name", "URL"]
    ws_links.append(headers_links)
    for col_idx in range(1, len(headers_links) + 1):
        cell = ws_links.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center_align
    for ql in db_get_quicklinks():
        ws_links.append([ql.get("name", ""), ql.get("url", "")])
    ws_links.column_dimensions['A'].width = 25
    ws_links.column_dimensions['B'].width = 50

    # 7. Sheet: Projects
    ws_projects = wb.create_sheet(title="Projects")
    headers_projects = ["Project ID", "Project Name", "Description", "Assigned To", "Created By", "Created At", "Target Finish Date", "Finished At", "Status", "Progress (%)", "Last Updated", "Updates Log"]
    ws_projects.append(headers_projects)
    for col_idx in range(1, len(headers_projects) + 1):
        cell = ws_projects.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center_align
    for p in db_get_all_projects():
        updates_text = "\n".join(
            f"[{u.get('timestamp', '')}] ({u.get('user', '')} - {u.get('progress', 0)}%): {u.get('note', '')}"
            for u in p.get("updates", [])
        )
        ws_projects.append([
            p.get("id", ""),
            p.get("name", ""),
            p.get("description", ""),
            p.get("assigned_to", ""),
            p.get("created_by", ""),
            p.get("created_at", ""),
            p.get("target_date", ""),
            p.get("finished_at", ""),
            p.get("status", "In Progress"),
            p.get("progress", 0),
            p.get("last_updated", ""),
            updates_text
        ])
    ws_projects.column_dimensions['A'].width = 14
    ws_projects.column_dimensions['B'].width = 28
    ws_projects.column_dimensions['C'].width = 35
    ws_projects.column_dimensions['D'].width = 22
    ws_projects.column_dimensions['E'].width = 20
    ws_projects.column_dimensions['F'].width = 18
    ws_projects.column_dimensions['G'].width = 18
    ws_projects.column_dimensions['H'].width = 18
    ws_projects.column_dimensions['I'].width = 15
    ws_projects.column_dimensions['J'].width = 14
    ws_projects.column_dimensions['K'].width = 18
    ws_projects.column_dimensions['L'].width = 50

    # Safe atomic replace for Excel file
    temp_target = target_path + ".tmp"
    wb.save(temp_target)
    wb.close()
    if os.path.exists(target_path):
        try:
            os.replace(temp_target, target_path)
        except OSError:
            # Fallback if locked
            time.sleep(0.5)
            os.replace(temp_target, target_path)
    else:
        os.rename(temp_target, target_path)

def reload_tasks_from_excel_file(excel_path):
    """Reloads tasks table from an external or uploaded excel file."""
    if not os.path.exists(excel_path):
        return 0
    wb = openpyxl.load_workbook(excel_path, data_only=True)
    if "Tasks" not in wb.sheetnames:
        wb.close()
        return 0
    ws = wb["Tasks"]
    conn = get_db()
    count = 0
    with conn:
        conn.execute("DELETE FROM tasks")
        for row in ws.iter_rows(min_row=2, values_only=True):
            if not row or not row[0]:
                continue
            task_id = str(row[0]).strip()
            desc = str(row[1]) if row[1] is not None else ""
            owner = str(row[2]) if row[2] is not None else ""
            start_val = row[3]
            if isinstance(start_val, (datetime.datetime, datetime.date)):
                start_val = start_val.strftime("%Y-%m-%d %H:%M")
            start_time = str(start_val) if start_val is not None else ""
            end_val = row[4]
            if isinstance(end_val, (datetime.datetime, datetime.date)):
                end_val = end_val.strftime("%Y-%m-%d %H:%M")
            end_time = str(end_val) if end_val is not None else ""
            duration = str(row[5]) if row[5] is not None else ""
            status = str(row[6]) if row[6] is not None else "Pending"
            up_val = row[7]
            if isinstance(up_val, (datetime.datetime, datetime.date)):
                up_val = up_val.strftime("%Y-%m-%d %H:%M")
            last_updated = str(up_val) if up_val is not None else ""
            pending_reason = str(row[8]) if len(row) > 8 and row[8] is not None else ""
            escalation_history = str(row[9]) if len(row) > 9 and row[9] is not None else ""
            config_status = str(row[10]) if len(row) > 10 and row[10] is not None else ""
            mis_status = str(row[11]) if len(row) > 11 and row[11] is not None else "Not Closed"
            assigned_time = str(row[12]) if len(row) > 12 and row[12] is not None else ""
            assignment_history = str(row[13]) if len(row) > 13 and row[13] is not None else ""
            forwarded_by = compute_forwarded_by(desc)

            conn.execute("""
            INSERT OR REPLACE INTO tasks 
            (id, description, owner, start_time, end_time, duration, status, last_updated,
             pending_reason, escalation_history, config_status, mis_status, assigned_time,
             assignment_history, forwarded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (task_id, desc, owner, start_time, end_time, duration, status, last_updated,
                  pending_reason, escalation_history, config_status, mis_status, assigned_time,
                  assignment_history, forwarded_by))
            count += 1
    wb.close()
    conn.close()
    schedule_excel_sync()
    return count


def reload_roster_from_excel_file(excel_path):
    """Reloads roster table from an external or uploaded excel file."""
    if not os.path.exists(excel_path):
        return 0
    wb = openpyxl.load_workbook(excel_path, data_only=True)
    if "Roster" not in wb.sheetnames:
        wb.close()
        return 0
    ws = wb["Roster"]
    conn = get_db()
    count = 0
    with conn:
        conn.execute("DELETE FROM roster")
        for row in ws.iter_rows(min_row=2, values_only=True):
            if not row or not row[0]:
                continue
            r_owner = str(row[0]).strip()
            date_val = row[1] if len(row) > 1 else ""
            if isinstance(date_val, (datetime.datetime, datetime.date)):
                date_val = date_val.strftime("%Y-%m-%d")
            date_str = str(date_val).strip() if date_val else ""
            code = str(row[2]).strip().upper() if len(row) > 2 and row[2] else ""
            start_val = row[3] if len(row) > 3 else ""
            if isinstance(start_val, datetime.time):
                start_val = start_val.strftime("%H:%M")
            start_t = str(start_val).strip() if start_val else ""
            end_val = row[4] if len(row) > 4 else ""
            if isinstance(end_val, datetime.time):
                end_val = end_val.strftime("%H:%M")
            end_t = str(end_val).strip() if end_val else ""
            shift_n = str(row[5]).strip() if len(row) > 5 and row[5] else ""

            if "HOLIDAY" in code or code == "H" or "HOLIDAY" in shift_n.upper():
                code = "HOLIDAY"
                shift_n = "Holiday"
                start_t = ""
                end_t = ""

            conn.execute("""
            INSERT OR REPLACE INTO roster (owner, date, code, start_time, end_time, shift_name)
            VALUES (?, ?, ?, ?, ?, ?)
            """, (r_owner, date_str, code, start_t, end_t, shift_n))
            count += 1
    wb.close()
    conn.close()
    schedule_excel_sync()
    return count

def db_replace_roster(roster_entries):
    """Directly replaces the roster table in SQLite and schedules background Excel sync."""
    conn = get_db()
    count = 0
    try:
        with conn:
            conn.execute("DELETE FROM roster")
            for entry in roster_entries:
                if not entry or len(entry) < 6:
                    continue
                r_owner, date_str, code, start_t, end_t, shift_n = entry[:6]
                conn.execute("""
                INSERT OR REPLACE INTO roster (owner, date, code, start_time, end_time, shift_name)
                VALUES (?, ?, ?, ?, ?, ?)
                """, (str(r_owner).strip(), str(date_str).strip(), str(code).strip().upper(),
                      str(start_t).strip(), str(end_t).strip(), str(shift_n).strip()))
                count += 1
    finally:
        conn.close()
    schedule_excel_sync()
    return count


# --- Project Work & Progress Tracking APIs ---

def _ensure_projects_table(conn):
    conn.execute("""
    CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        assigned_to TEXT,
        created_by TEXT,
        created_at TEXT,
        target_date TEXT DEFAULT '',
        finished_at TEXT DEFAULT '',
        status TEXT DEFAULT 'In Progress',
        progress INTEGER DEFAULT 0,
        last_updated TEXT,
        updates_json TEXT DEFAULT '[]'
    )
    """)
    try:
        conn.execute("ALTER TABLE projects ADD COLUMN target_date TEXT DEFAULT ''")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE projects ADD COLUMN finished_at TEXT DEFAULT ''")
    except Exception:
        pass

def db_get_all_projects():
    import json
    conn = get_db()
    try:
        _ensure_projects_table(conn)
        cur = conn.cursor()
        cur.execute("SELECT * FROM projects ORDER BY last_updated DESC, created_at DESC")
        rows = cur.fetchall()
        projects = []
        for r in rows:
            d = dict(r)
            d["target_date"] = d.get("target_date") or ""
            d["finished_at"] = d.get("finished_at") or ""
            try:
                d["updates"] = json.loads(d.get("updates_json") or "[]")
            except Exception:
                d["updates"] = []
            d.pop("updates_json", None)
            projects.append(d)
        return projects
    finally:
        conn.close()

def db_create_project(name, description, assigned_to, created_by, target_date=""):
    import json
    clean_name = (name or "").strip()
    if not clean_name:
        return None
    clean_desc = (description or "").strip()
    clean_assigned = (assigned_to or "Unassigned").strip()
    clean_creator = (created_by or "Admin").strip()
    clean_target = (target_date or "").strip()
    now_str = get_local_now().strftime("%Y-%m-%d %H:%M")

    conn = get_db()
    try:
        with conn:
            _ensure_projects_table(conn)
            cur = conn.cursor()
            cur.execute("SELECT id FROM projects")
            ids = []
            for r in cur.fetchall():
                try:
                    ids.append(int(str(r[0]).split("-")[1]))
                except (IndexError, ValueError):
                    pass
            next_num = (max(ids) + 1) if ids else 1001
            project_id = f"PRJ-{next_num}"

            init_note = f"Project created and assigned to {clean_assigned}."
            if clean_target:
                init_note += f" Target finish date: {clean_target}."

            initial_updates = [{
                "timestamp": now_str,
                "user": clean_creator,
                "note": init_note,
                "progress": 0,
                "status": "In Progress"
            }]
            updates_json = json.dumps(initial_updates, ensure_ascii=False)

            conn.execute("""
            INSERT INTO projects (id, name, description, assigned_to, created_by, created_at, target_date, finished_at, status, progress, last_updated, updates_json)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (project_id, clean_name, clean_desc, clean_assigned, clean_creator, now_str, clean_target, "", "In Progress", 0, now_str, updates_json))
    finally:
        conn.close()

    schedule_excel_sync()
    return {
        "id": project_id,
        "name": clean_name,
        "description": clean_desc,
        "assigned_to": clean_assigned,
        "created_by": clean_creator,
        "created_at": now_str,
        "target_date": clean_target,
        "finished_at": "",
        "status": "In Progress",
        "progress": 0,
        "last_updated": now_str,
        "updates": initial_updates
    }

def db_add_project_update(project_id, note, progress=None, status=None, updated_by="User"):
    import json
    clean_note = (note or "").strip()
    if not clean_note:
        return None
    now_str = get_local_now().strftime("%Y-%m-%d %H:%M")

    conn = get_db()
    try:
        with conn:
            _ensure_projects_table(conn)
            cur = conn.cursor()
            cur.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
            row = cur.fetchone()
            if not row:
                return None
            proj = dict(row)
            try:
                updates = json.loads(proj.get("updates_json") or "[]")
            except Exception:
                updates = []

            new_progress = proj.get("progress", 0)
            if progress is not None:
                try:
                    new_progress = max(0, min(100, int(progress)))
                except (ValueError, TypeError):
                    pass

            new_status = (status or proj.get("status") or "In Progress").strip()
            if new_progress == 100 and status is None:
                new_status = "Completed"
            elif new_status == "Completed" and progress is None:
                new_progress = 100

            finished_at = proj.get("finished_at") or ""
            if new_status == "Completed":
                new_progress = 100
                if not finished_at:
                    finished_at = now_str
            else:
                finished_at = ""

            update_entry = {
                "timestamp": now_str,
                "user": (updated_by or "User").strip(),
                "note": clean_note,
                "progress": new_progress,
                "status": new_status
            }
            updates.insert(0, update_entry)
            updates_json = json.dumps(updates, ensure_ascii=False)

            conn.execute("""
            UPDATE projects
            SET status = ?, progress = ?, finished_at = ?, last_updated = ?, updates_json = ?
            WHERE id = ?
            """, (new_status, new_progress, finished_at, now_str, updates_json, project_id))

            proj["status"] = new_status
            proj["progress"] = new_progress
            proj["finished_at"] = finished_at
            proj["last_updated"] = now_str
            proj["updates"] = updates
            proj.pop("updates_json", None)
    finally:
        conn.close()

    schedule_excel_sync()
    return proj

def db_finish_project(project_id, updated_by="User", note=None):
    import json
    now_str = get_local_now().strftime("%Y-%m-%d %H:%M")
    clean_user = (updated_by or "User").strip()
    clean_note = (note or "").strip()
    if not clean_note:
        clean_note = f"Project marked as Finished / Completed at {now_str}."

    conn = get_db()
    try:
        with conn:
            _ensure_projects_table(conn)
            cur = conn.cursor()
            cur.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
            row = cur.fetchone()
            if not row:
                return None
            proj = dict(row)
            try:
                updates = json.loads(proj.get("updates_json") or "[]")
            except Exception:
                updates = []

            updates.insert(0, {
                "timestamp": now_str,
                "user": clean_user,
                "note": clean_note,
                "progress": 100,
                "status": "Completed"
            })
            updates_json = json.dumps(updates, ensure_ascii=False)

            conn.execute("""
            UPDATE projects
            SET status = 'Completed', progress = 100, finished_at = ?, last_updated = ?, updates_json = ?
            WHERE id = ?
            """, (now_str, now_str, updates_json, project_id))

            proj["status"] = "Completed"
            proj["progress"] = 100
            proj["finished_at"] = now_str
            proj["last_updated"] = now_str
            proj["updates"] = updates
            proj.pop("updates_json", None)
    finally:
        conn.close()

    schedule_excel_sync()
    return proj

def db_update_project(project_id, name=None, description=None, assigned_to=None, target_date=None, status=None, progress=None, updated_by="Admin"):
    import json
    now_str = get_local_now().strftime("%Y-%m-%d %H:%M")
    conn = get_db()
    try:
        with conn:
            _ensure_projects_table(conn)
            cur = conn.cursor()
            cur.execute("SELECT * FROM projects WHERE id = ?", (project_id,))
            row = cur.fetchone()
            if not row:
                return None
            proj = dict(row)
            try:
                updates = json.loads(proj.get("updates_json") or "[]")
            except Exception:
                updates = []

            new_name = (name.strip() if name is not None and name.strip() else proj["name"])
            new_desc = (description.strip() if description is not None else proj.get("description", ""))
            old_assigned = proj.get("assigned_to", "")
            new_assigned = (assigned_to.strip() if assigned_to is not None and assigned_to.strip() else old_assigned)
            old_target = proj.get("target_date") or ""
            new_target = (target_date.strip() if target_date is not None else old_target)
            new_status = (status.strip() if status is not None and status.strip() else proj.get("status", "In Progress"))
            new_progress = proj.get("progress", 0)
            if progress is not None:
                try:
                    new_progress = max(0, min(100, int(progress)))
                except (ValueError, TypeError):
                    pass

            change_notes = []
            if new_assigned != old_assigned:
                change_notes.append(f"Project reassigned from {old_assigned} to {new_assigned}.")
            if new_target != old_target:
                change_notes.append(f"Target finish date updated to {new_target or 'None'}.")
            if change_notes:
                updates.insert(0, {
                    "timestamp": now_str,
                    "user": (updated_by or "Admin").strip(),
                    "note": " ".join(change_notes),
                    "progress": new_progress,
                    "status": new_status
                })

            updates_json = json.dumps(updates, ensure_ascii=False)
            conn.execute("""
            UPDATE projects
            SET name = ?, description = ?, assigned_to = ?, target_date = ?, status = ?, progress = ?, last_updated = ?, updates_json = ?
            WHERE id = ?
            """, (new_name, new_desc, new_assigned, new_target, new_status, new_progress, now_str, updates_json, project_id))

            proj["name"] = new_name
            proj["description"] = new_desc
            proj["assigned_to"] = new_assigned
            proj["target_date"] = new_target
            proj["status"] = new_status
            proj["progress"] = new_progress
            proj["last_updated"] = now_str
            proj["updates"] = updates
            proj.pop("updates_json", None)
    finally:
        conn.close()

    schedule_excel_sync()
    return proj

def db_delete_project(project_id):
    conn = get_db()
    deleted = False
    try:
        with conn:
            _ensure_projects_table(conn)
            cur = conn.cursor()
            cur.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            deleted = cur.rowcount > 0
    finally:
        conn.close()
    if deleted:
        schedule_excel_sync()
    return deleted



