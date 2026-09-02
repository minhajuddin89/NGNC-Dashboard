import os
import sys
import datetime

def get_local_now():
    # Bangladesh timezone is UTC+6
    tz_bd = datetime.timezone(datetime.timedelta(hours=6))
    return datetime.datetime.now(tz_bd)
import io
from flask import Flask, request, jsonify, send_from_directory, send_file

# Try importing CORS defensively
try:
    from flask_cors import CORS
    has_cors = True
except ImportError:
    has_cors = False

# Try importing openpyxl and handle automatic installation if missing
try:
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
except ImportError:
    print("Installing openpyxl dependency...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl"])
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

# Apply process-safe retry wrappers to openpyxl to support concurrent Gunicorn workers
try:
    import requests
except ImportError:
    print("Installing requests dependency...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "requests"])
    import requests
import threading
import time
import zipfile
original_load_workbook = openpyxl.load_workbook
def load_workbook_with_retry(*args, **kwargs):
    for i in range(15): # retry up to 15 times (1.5 seconds total)
        try:
            return original_load_workbook(*args, **kwargs)
        except (PermissionError, zipfile.BadZipFile, KeyError, OSError):
            if i == 14:
                raise
            time.sleep(0.1)
openpyxl.load_workbook = load_workbook_with_retry

original_save_workbook = openpyxl.Workbook.save
def save_workbook_with_retry(self, *args, **kwargs):
    for i in range(15): # retry up to 15 times (1.5 seconds total)
        try:
            return original_save_workbook(self, *args, **kwargs)
        except (PermissionError, OSError):
            if i == 14:
                raise
            time.sleep(0.1)
openpyxl.Workbook.save = save_workbook_with_retry

app = Flask(__name__, static_folder="static", static_url_path="")
if has_cors:
    CORS(app)

# Register OLT Troubleshooting blueprint
try:
    from olt_backend.server import olt_bp
    app.register_blueprint(olt_bp, url_prefix='/api/olt')
    print("OLT Troubleshooting blueprint registered successfully.")
except Exception as e:
    print(f"Error registering OLT blueprint: {e}")

EXCEL_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tasks.xlsx")
MASTER_ADMIN_USER = "admin"
MASTER_ADMIN_PASS = "admin123"
ONLINE_USERS = {} # username (lower) -> last active datetime

SHIFT_HOURS = {
    "M": {"start": "09:30", "end": "18:30", "name": "Morning Shift"},
    "EE": {"start": "11:00", "end": "20:00", "name": "Early Evening Shift"},
    "E": {"start": "14:00", "end": "22:00", "name": "Evening Shift"},
}

def format_datetime(dt_str):
    """Normalize datetime strings from browser inputs (YYYY-MM-DDTHH:MM) to YYYY-MM-DD HH:MM"""
    if not dt_str:
        return ""
    return dt_str.replace("T", " ")

def calculate_duration(start_str, end_str):
    if not start_str or not end_str:
        return ""
    try:
        start_str = format_datetime(start_str)
        end_str = format_datetime(end_str)
        
        formats = ["%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%d"]
        start_dt = None
        end_dt = None
        
        for fmt in formats:
            try:
                if not start_dt:
                    start_dt = datetime.datetime.strptime(start_str, fmt)
            except ValueError:
                pass
            try:
                if not end_dt:
                    end_dt = datetime.datetime.strptime(end_str, fmt)
            except ValueError:
                pass
                
        if start_dt and end_dt:
            diff = end_dt - start_dt
            total_seconds = int(diff.total_seconds())
            if total_seconds < 0:
                return "Invalid Range"
            
            days = diff.days
            hours, remainder = divmod(diff.seconds, 3600)
            minutes, _ = divmod(remainder, 60)
            
            parts = []
            if days > 0:
                parts.append(f"{days}d")
            if hours > 0:
                parts.append(f"{hours}h")
            if minutes > 0 or not parts:
                parts.append(f"{minutes}m")
            return " ".join(parts)
    except Exception as e:
        print(f"Error calculating duration: {e}")
    return ""

def init_excel():
    """Initializes Excel file with Tasks, Owners, Users, and Roster sheets if they do not exist"""
    headers_tasks = ["Task ID", "Description", "Owner", "Start Time", "End Time", "Duration", "Status", "Last Updated", "Pending Reason", "Escalation History", "Config Status", "MIS Status", "Assigned Time", "Assignment History"]
    headers_users = ["User ID", "Full Name", "Password", "Created At", "Reports Access"]
    headers_roster = ["Operator Name", "Date", "Shift Code", "Start Time", "End Time", "Shift Name"]
    headers_shifts = ["Shift Code", "Shift Name", "Start Time", "End Time"]
    headers_links = ["Portal Name", "URL"]
    
    # Common styles
    header_fill = PatternFill(start_color="107C41", end_color="107C41", fill_type="solid") # Excel green
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    center_align = Alignment(horizontal="center", vertical="center")
    
    if not os.path.exists(EXCEL_FILE):
        wb = openpyxl.Workbook()
        
        # Sheet 1: Tasks
        ws_tasks = wb.active
        ws_tasks.title = "Tasks"
        ws_tasks.append(headers_tasks)
        for col_idx in range(1, len(headers_tasks) + 1):
            cell = ws_tasks.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = center_align
        
        # Sheet 2: Owners
        ws_owners = wb.create_sheet(title="Owners")
        ws_owners.append(["Owner Name"])
        ws_owners.cell(row=1, column=1).fill = header_fill
        ws_owners.cell(row=1, column=1).font = header_font
        ws_owners.cell(row=1, column=1).alignment = center_align
        ws_owners.column_dimensions['A'].width = 25
        
        # Add default owners
        default_owners = ["Minhaj Uddin", "System Administrator", "Operator A", "Operator B"]
        for owner in default_owners:
            ws_owners.append([owner])
            
        # Sheet 3: Users (Credentials)
        ws_users = wb.create_sheet(title="Users")
        ws_users.append(headers_users)
        for col_idx in range(1, len(headers_users) + 1):
            cell = ws_users.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = center_align
            
        # Add master admin default row
        now_str = get_local_now().strftime("%Y-%m-%d %H:%M")
        ws_users.append([MASTER_ADMIN_USER, "System Administrator", MASTER_ADMIN_PASS, now_str, "true"])
        
        # Autofit column widths for Users
        for col in ws_users.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws_users.column_dimensions[col_letter].width = max(max_len + 3, 15)
        # Sheet 4: Roster
        ws_roster = wb.create_sheet(title="Roster")
        ws_roster.append(headers_roster)
        for col_idx in range(1, len(headers_roster) + 1):
            cell = ws_roster.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = center_align
        ws_roster.column_dimensions['A'].width = 25
        ws_roster.column_dimensions['B'].width = 15
        ws_roster.column_dimensions['C'].width = 12
        ws_roster.column_dimensions['D'].width = 12
        ws_roster.column_dimensions['E'].width = 12
        ws_roster.column_dimensions['F'].width = 20

        # Sheet 5: Shifts
        ws_shifts = wb.create_sheet(title="Shifts")
        ws_shifts.append(headers_shifts)
        for col_idx in range(1, len(headers_shifts) + 1):
            cell = ws_shifts.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = center_align
        ws_shifts.column_dimensions['A'].width = 12
        ws_shifts.column_dimensions['B'].width = 25
        ws_shifts.column_dimensions['C'].width = 15
        ws_shifts.column_dimensions['D'].width = 15
        
        # Default shift schedules
        default_shifts = [
            ["M", "Morning Shift", "09:30", "18:30"],
            ["EE", "Early Evening Shift", "11:00", "20:00"],
            ["E", "Evening Shift", "14:00", "22:00"],
            ["LE", "Late Evening Shift", "16:00", "00:00"]
        ]
        for ds in default_shifts:
            ws_shifts.append(ds)

        # Sheet 6: QuickLinks
        ws_links = wb.create_sheet(title="QuickLinks")
        ws_links.append(headers_links)
        for col_idx in range(1, len(headers_links) + 1):
            cell = ws_links.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = center_align
        ws_links.column_dimensions['A'].width = 25
        ws_links.column_dimensions['B'].width = 50
        ws_links.append(["IPAM", "http://phpipam.link3.net/index.php?page=login"])

        wb.save(EXCEL_FILE)
    else:
        # If excel exists, verify all sheets are present
        try:
            wb = openpyxl.load_workbook(EXCEL_FILE)
            dirty = False
            
            if "Owners" not in wb.sheetnames:
                ws_owners = wb.create_sheet(title="Owners")
                ws_owners.append(["Owner Name"])
                ws_owners.cell(row=1, column=1).fill = header_fill
                ws_owners.cell(row=1, column=1).font = header_font
                ws_owners.cell(row=1, column=1).alignment = center_align
                ws_owners.column_dimensions['A'].width = 25
                for owner in ["Minhaj Uddin", "System Administrator"]:
                    ws_owners.append([owner])
                dirty = True
                
            if "Users" not in wb.sheetnames:
                ws_users = wb.create_sheet(title="Users")
                ws_users.append(headers_users)
                for col_idx in range(1, len(headers_users) + 1):
                    cell = ws_users.cell(row=1, column=col_idx)
                    cell.fill = header_fill
                    cell.font = header_font
                    cell.alignment = center_align
                now_str = get_local_now().strftime("%Y-%m-%d %H:%M")
                ws_users.append([MASTER_ADMIN_USER, "System Administrator", MASTER_ADMIN_PASS, now_str])
                dirty = True
            if "Roster" not in wb.sheetnames:
                ws_roster = wb.create_sheet(title="Roster")
                ws_roster.append(headers_roster)
                for col_idx in range(1, len(headers_roster) + 1):
                    cell = ws_roster.cell(row=1, column=col_idx)
                    cell.fill = header_fill
                    cell.font = header_font
                    cell.alignment = center_align
                ws_roster.column_dimensions['A'].width = 25
                ws_roster.column_dimensions['B'].width = 15
                ws_roster.column_dimensions['C'].width = 12
                ws_roster.column_dimensions['D'].width = 12
                ws_roster.column_dimensions['E'].width = 12
                ws_roster.column_dimensions['F'].width = 20
                dirty = True

            if "Shifts" not in wb.sheetnames:
                ws_shifts = wb.create_sheet(title="Shifts")
                ws_shifts.append(headers_shifts)
                for col_idx in range(1, len(headers_shifts) + 1):
                    cell = ws_shifts.cell(row=1, column=col_idx)
                    cell.fill = header_fill
                    cell.font = header_font
                    cell.alignment = center_align
                ws_shifts.column_dimensions['A'].width = 12
                ws_shifts.column_dimensions['B'].width = 25
                ws_shifts.column_dimensions['C'].width = 15
                ws_shifts.column_dimensions['D'].width = 15
                default_shifts = [
                    ["M", "Morning Shift", "09:30", "18:30"],
                    ["EE", "Early Evening Shift", "11:00", "20:00"],
                    ["E", "Evening Shift", "14:00", "22:00"],
                    ["LE", "Late Evening Shift", "16:00", "00:00"]
                ]
                for ds in default_shifts:
                    ws_shifts.append(ds)
                dirty = True

            if "QuickLinks" not in wb.sheetnames:
                ws_links = wb.create_sheet(title="QuickLinks")
                ws_links.append(headers_links)
                for col_idx in range(1, len(headers_links) + 1):
                    cell = ws_links.cell(row=1, column=col_idx)
                    cell.fill = header_fill
                    cell.font = header_font
                    cell.alignment = center_align
                ws_links.column_dimensions['A'].width = 25
                ws_links.column_dimensions['B'].width = 50
                ws_links.append(["IPAM", "http://phpipam.link3.net/index.php?page=login"])
                dirty = True

            # Migration check for Reports Access column
            if "Users" in wb.sheetnames:
                ws_users = wb["Users"]
                headers = [str(cell.value or '').strip() for cell in ws_users[1]]
                if "Reports Access" not in headers:
                    ws_users.cell(row=1, column=5).value = "Reports Access"
                    ws_users.cell(row=1, column=5).fill = header_fill
                    ws_users.cell(row=1, column=5).font = header_font
                    ws_users.cell(row=1, column=5).alignment = center_align
                    for r in range(2, ws_users.max_row + 1):
                        username_val = str(ws_users.cell(row=r, column=1).value or '').strip().lower()
                        if username_val == MASTER_ADMIN_USER:
                            ws_users.cell(row=r, column=5).value = "true"
                        else:
                            ws_users.cell(row=r, column=5).value = "false"
                    dirty = True

            if dirty:
                wb.save(EXCEL_FILE)
            wb.close()
        except PermissionError as pe:
            raise pe
        except Exception as e:
            print(f"Error checking/adding subsheets: {e}")

# --- Automated Outlook/OneDrive Cloud Backup Scheduler Helpers ---
BACKUP_SETTINGS_FILE = "backup_settings.json"

def init_backup_settings():
    import json
    if not os.path.exists(BACKUP_SETTINGS_FILE):
        default = {
            "enabled": False,
            "interval_hours": 24,
            "type": "webhook",
            "target_url": "",
            "last_run": "",
            "last_status": "Never Run",
            "last_error": "",
            "github_enabled": False,
            "github_interval_hours": 1.0,
            "github_token": "",
            "github_last_tag": "db-v1.0.0",
            "github_last_run": "",
            "github_last_status": "Never Run",
            "github_last_error": ""
        }
        try:
            with open(BACKUP_SETTINGS_FILE, 'w') as f:
                json.dump(default, f, indent=4)
        except Exception as e:
            print("Error initializing backup settings file:", e)

def load_backup_settings():
    import json
    init_backup_settings()
    try:
        if os.path.exists(BACKUP_SETTINGS_FILE):
            with open(BACKUP_SETTINGS_FILE, 'r') as f:
                data = json.load(f)
                
                # Dynamic self-migration for new schema fields
                updated = False
                defaults = {
                    "github_enabled": False,
                    "github_interval_hours": 1.0,
                    "github_token": "",
                    "github_last_tag": "db-v1.0.0",
                    "github_last_run": "",
                    "github_last_status": "Never Run",
                    "github_last_error": ""
                }
                for k, v in defaults.items():
                    if k not in data:
                        data[k] = v
                        updated = True
                if updated:
                    save_backup_settings(data)
                return data
    except Exception as e:
        print("Error loading backup settings:", e)
    return {
        "enabled": False,
        "interval_hours": 24,
        "type": "webhook",
        "target_url": "",
        "last_run": "",
        "last_status": "Never Run",
        "last_error": "Read Error",
        "github_enabled": False,
        "github_interval_hours": 1.0,
        "github_token": "",
        "github_last_tag": "db-v1.0.0",
        "github_last_run": "",
        "github_last_status": "Never Run",
        "github_last_error": ""
    }

def save_backup_settings(settings):
    import json
    try:
        with open(BACKUP_SETTINGS_FILE, 'w') as f:
            json.dump(settings, f, indent=4)
        return True
    except Exception as e:
        print("Error saving backup settings:", e)
        return False

def trigger_backup_execution(settings=None):
    if not settings:
        settings = load_backup_settings()
        
    if not settings.get("enabled"):
        return False, "Backup is disabled."
        
    target_url = settings.get("target_url", "").strip()
    if not target_url:
        return False, "Cloud Sync destination URL is not configured."
        
    try:
        if not os.path.exists(EXCEL_FILE):
            return False, "Database tasks.xlsx file not found."
            
        with open(EXCEL_FILE, 'rb') as f:
            file_data = f.read()
            
        timestamp_str = get_local_now().strftime('%Y%m%d_%H%M%S')
        headers = {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": f"attachment; filename=\"tasks_backup_{timestamp_str}.xlsx\""
        }
        
        res = requests.post(target_url, data=file_data, headers=headers, timeout=30)
        
        if res.status_code in [200, 201, 202]:
            settings["last_run"] = get_local_now().strftime("%Y-%m-%d %H:%M:%S")
            settings["last_status"] = "Success"
            settings["last_error"] = ""
            save_backup_settings(settings)
            return True, "Database backup uploaded successfully."
        else:
            err_msg = f"HTTP Error {res.status_code}: {res.text[:100]}"
            settings["last_status"] = "Failed"
            settings["last_error"] = err_msg
            save_backup_settings(settings)
            return False, err_msg
            
    except Exception as e:
        err_msg = str(e)
        settings["last_status"] = "Failed"
        settings["last_error"] = err_msg
        save_backup_settings(settings)
        return False, err_msg

def run_github_sync(settings=None):
    if not settings:
        settings = load_backup_settings()
        
    token = settings.get("github_token", "").strip()
    if not token:
        return False, "GitHub Personal Access Token is not configured."
        
    try:
        import subprocess
        # Determine target directory
        repo_dir = "/home/subrata/task-manager"
        if not os.path.exists(repo_dir):
            repo_dir = os.path.dirname(os.path.abspath(__file__))
            
        # Clean config lock file to prevent blockages
        lock_file = os.path.join(repo_dir, ".git", "config.lock")
        if os.path.exists(lock_file):
            try:
                os.remove(lock_file)
            except Exception:
                pass
            
        # 1. Initialize git if not present
        if not os.path.exists(os.path.join(repo_dir, ".git")):
            subprocess.run(["git", "init"], cwd=repo_dir, check=True, capture_output=True)
            subprocess.run(["git", "config", "user.name", "Task Manager Auto-Sync"], cwd=repo_dir, check=True)
            subprocess.run(["git", "config", "user.email", "backup@taskmanager.local"], cwd=repo_dir, check=True)
            
        # 2. Add database file
        subprocess.run(["git", "add", "tasks.xlsx"], cwd=repo_dir, check=True, capture_output=True)
        
        # Check if there are changes before committing
        status_res = subprocess.run(["git", "status", "--porcelain", "tasks.xlsx"], cwd=repo_dir, check=True, capture_output=True, text=True)
        if not status_res.stdout.strip():
            settings["github_last_run"] = get_local_now().strftime("%Y-%m-%d %H:%M:%S")
            settings["github_last_status"] = "Success"
            settings["github_last_error"] = ""
            save_backup_settings(settings)
            return True, "No database changes found. Git workspace is clean."
            
        # 3. Commit changes
        timestamp = get_local_now().strftime("%Y-%m-%d %H:%M:%S")
        subprocess.run(["git", "commit", "-m", f"Auto-backup database: {timestamp}"], cwd=repo_dir, check=True, capture_output=True)
        
        # 4. Parse existing version tags to determine next sequential database version tag
        tag_res = subprocess.run(["git", "tag", "-l", "db-v*"], cwd=repo_dir, check=True, capture_output=True, text=True)
        tags = [t.strip() for t in tag_res.stdout.split("\n") if t.strip()]
        
        next_tag = "db-v1.0.0"
        if tags:
            import re
            highest_patch = -1
            highest_minor = 0
            highest_major = 1
            for t in tags:
                m = re.match(r"db-v(\d+)\.(\d+)\.(\d+)", t)
                if m:
                    major, minor, patch = int(m.group(1)), int(m.group(2)), int(m.group(3))
                    if (major, minor, patch) > (highest_major, highest_minor, highest_patch):
                        highest_major = major
                        highest_minor = minor
                        highest_patch = patch
            if highest_patch != -1:
                next_tag = f"db-v{highest_major}.{highest_minor}.{highest_patch + 1}"
            else:
                next_tag = "db-v1.0.1"
        else:
            # Try fetching remote tags to be sure
            remote_url = f"https://{token}@github.com/minhajuddin89/NGNC-Dashboard.git"
            subprocess.run(["git", "fetch", remote_url, "--tags"], cwd=repo_dir, capture_output=True)
            tag_res = subprocess.run(["git", "tag", "-l", "db-v*"], cwd=repo_dir, check=True, capture_output=True, text=True)
            tags = [t.strip() for t in tag_res.stdout.split("\n") if t.strip()]
            if tags:
                import re
                highest_patch = -1
                highest_minor = 0
                highest_major = 1
                for t in tags:
                    m = re.match(r"db-v(\d+)\.(\d+)\.(\d+)", t)
                    if m:
                        major, minor, patch = int(m.group(1)), int(m.group(2)), int(m.group(3))
                        if (major, minor, patch) > (highest_major, highest_minor, highest_patch):
                            highest_major = major
                            highest_minor = minor
                            highest_patch = patch
                if highest_patch != -1:
                    next_tag = f"db-v{highest_major}.{highest_minor}.{highest_patch + 1}"
            
        # 5. Apply Git Tag
        subprocess.run(["git", "tag", next_tag], cwd=repo_dir, check=True, capture_output=True)
        
        # 6. Push branch & tag using authenticated HTTPS URL directly (avoids modifying config file origin)
        remote_url = f"https://{token}@github.com/minhajuddin89/NGNC-Dashboard.git"
        subprocess.run(["git", "push", "-f", remote_url, "HEAD:database-backups"], cwd=repo_dir, check=True, capture_output=True)
        subprocess.run(["git", "push", remote_url, next_tag], cwd=repo_dir, check=True, capture_output=True)
        
        # Reload fresh settings before saving status
        settings = load_backup_settings()
        settings["github_last_tag"] = next_tag
        settings["github_last_run"] = get_local_now().strftime("%Y-%m-%d %H:%M:%S")
        settings["github_last_status"] = "Success"
        settings["github_last_error"] = ""
        save_backup_settings(settings)
        
        return True, f"Successfully committed, tagged as {next_tag}, and pushed database to GitHub backups branch."
        
    except subprocess.CalledProcessError as cpe:
        err_msg = f"Git operation failed: {cpe.stderr.decode().strip() if cpe.stderr else str(cpe)}"
        settings = load_backup_settings()
        settings["github_last_status"] = "Failed"
        settings["github_last_error"] = err_msg
        save_backup_settings(settings)
        return False, err_msg
    except Exception as e:
        err_msg = str(e)
        settings = load_backup_settings()
        settings["github_last_status"] = "Failed"
        settings["github_last_error"] = err_msg
        save_backup_settings(settings)
        return False, err_msg


def backup_scheduler_loop():
    time.sleep(10)
    while True:
        try:
            settings = load_backup_settings()
            
            # 1. OneDrive/Outlook Webhook Sync Check
            if settings.get("enabled") and settings.get("target_url"):
                interval_hours = float(settings.get("interval_hours", 24))
                last_run_str = settings.get("last_run", "")
                
                should_run = False
                if not last_run_str:
                    should_run = True
                else:
                    try:
                        last_run_dt = datetime.datetime.strptime(last_run_str, "%Y-%m-%d %H:%M:%S")
                        elapsed_seconds = (get_local_now().replace(tzinfo=None) - last_run_dt).total_seconds()
                        if elapsed_seconds >= (interval_hours * 3600) - 10:
                            should_run = True
                    except Exception:
                        should_run = True
                        
                if should_run:
                    settings["last_run"] = get_local_now().strftime("%Y-%m-%d %H:%M:%S")
                    settings["last_status"] = "Running..."
                    save_backup_settings(settings)
                    trigger_backup_execution(settings)
            
            # 2. GitHub Version Sync Check
            settings = load_backup_settings()
            if settings.get("github_enabled") and settings.get("github_token"):
                git_interval_hours = float(settings.get("github_interval_hours", 1.0))
                last_git_run_str = settings.get("github_last_run", "")
                
                should_run_git = False
                if not last_git_run_str:
                    should_run_git = True
                else:
                    try:
                        last_git_dt = datetime.datetime.strptime(last_git_run_str, "%Y-%m-%d %H:%M:%S")
                        elapsed_git_seconds = (get_local_now().replace(tzinfo=None) - last_git_dt).total_seconds()
                        if elapsed_git_seconds >= (git_interval_hours * 3600) - 10:
                            should_run_git = True
                    except Exception:
                        should_run_git = True
                        
                if should_run_git:
                    settings["github_last_run"] = get_local_now().strftime("%Y-%m-%d %H:%M:%S")
                    settings["github_last_status"] = "Running..."
                    save_backup_settings(settings)
                    run_github_sync(settings)
            
            time.sleep(60)
        except Exception as e:
            print("Error in backup scheduler loop:", e)
            time.sleep(60)

# Start background scheduler thread
try:
    init_backup_settings()
    scheduler_thread = threading.Thread(target=backup_scheduler_loop, daemon=True)
    scheduler_thread.start()
    print("OneDrive Cloud Backup scheduler background thread started.")
except Exception as e:
    print("Error starting backup scheduler thread:", e)

# In-memory database cache to prevent Excel disk bottlenecks under high concurrency
DB_CACHE = {
    "mtime": 0,
    "tasks": [],
    "users": [],
    "roster": [],
    "shifts": {}
}

def load_all_data_cached():
    current_mtime = 0
    try:
        if os.path.exists(EXCEL_FILE):
            current_mtime = os.path.getmtime(EXCEL_FILE)
    except Exception:
        pass
        
    # If the file hasn't changed and cache is populated, return cache
    if DB_CACHE["mtime"] == current_mtime and DB_CACHE["tasks"]:
        return DB_CACHE["tasks"], DB_CACHE["users"], DB_CACHE["roster"], DB_CACHE["shifts"]
        
    try:
        init_excel()
        wb = openpyxl.load_workbook(EXCEL_FILE, data_only=True)
        
        # 1. Parse Tasks
        tasks = []
        if "Tasks" in wb.sheetnames:
            ws = wb["Tasks"]
            for row in ws.iter_rows(min_row=2, values_only=True):
                if not row[0]:
                    continue
                start_val = row[3]
                if isinstance(start_val, (datetime.datetime, datetime.date)):
                    start_val = start_val.strftime("%Y-%m-%d %H:%M")
                end_val = row[4]
                if isinstance(end_val, (datetime.datetime, datetime.date)):
                    end_val = end_val.strftime("%Y-%m-%d %H:%M")
                updated_val = row[7]
                if isinstance(updated_val, (datetime.datetime, datetime.date)):
                    updated_val = updated_val.strftime("%Y-%m-%d %H:%M")
                pending_reason = str(row[8]) if len(row) > 8 and row[8] is not None else ""
                escalation_history = str(row[9]) if len(row) > 9 and row[9] is not None else ""
                config_status = str(row[10]) if len(row) > 10 and row[10] is not None else ""
                mis_status = str(row[11]) if len(row) > 11 and row[11] is not None else "Not Closed"
                assigned_time = str(row[12]) if len(row) > 12 and row[12] is not None else ""
                assignment_history = str(row[13]) if len(row) > 13 and row[13] is not None else ""
                
                import re
                desc = str(row[1]) if row[1] is not None else ""
                desc_lower = desc.lower()
                forwarded_list = []
                if re.search(r'\bncss\b', desc_lower):
                    forwarded_list.append("NCSS")
                if re.search(r'\bbnoc\b', desc_lower):
                    forwarded_list.append("BNOC")
                if re.search(r'\bsat\b', desc_lower):
                    forwarded_list.append("SAT")
                if re.search(r'\bsales\b', desc_lower):
                    forwarded_list.append("Sales")
                if re.search(r'\bnmc\b', desc_lower):
                    forwarded_list.append("NMC")
                if re.search(r'\bbackbone\b', desc_lower):
                    forwarded_list.append("Backbone")
                if re.search(r'\bini\b', desc_lower):
                    forwarded_list.append("INI")
                if re.search(r'\bngnc\b', desc_lower):
                    forwarded_list.append("NGNC")
                if re.search(r'\bsystem\s+team\b', desc_lower):
                    forwarded_list.append("System Team")
                if re.search(r'\bpower\s+team\b', desc_lower):
                    forwarded_list.append("Power Team")
                if re.search(r'\bproject\b', desc_lower):
                    forwarded_list.append("PROJECT")
                forwarded_by = ", ".join(forwarded_list) if forwarded_list else ""
                
                tasks.append({
                    "id": str(row[0]),
                    "description": desc,
                    "owner": str(row[2]) if row[2] is not None else "",
                    "start_time": str(start_val) if start_val is not None else "",
                    "end_time": str(end_val) if end_val is not None else "",
                    "duration": str(row[5]) if row[5] is not None else "",
                    "status": str(row[6]) if row[6] is not None else "Pending",
                    "last_updated": str(updated_val) if updated_val is not None else "",
                    "pending_reason": pending_reason,
                    "escalation_history": escalation_history,
                    "config_status": config_status,
                    "mis_status": mis_status,
                    "assigned_time": assigned_time,
                    "assignment_history": assignment_history,
                    "forwarded_by": forwarded_by
                })
                
        # 2. Parse Users
        users = []
        if "Users" in wb.sheetnames:
            ws = wb["Users"]
            for row in ws.iter_rows(min_row=2, values_only=True):
                if not row[0]:
                    continue
                created_val = row[3]
                if isinstance(created_val, (datetime.datetime, datetime.date)):
                    created_val = created_val.strftime("%Y-%m-%d %H:%M")
                
                reports_access = "false"
                if len(row) > 4 and row[4] is not None:
                    reports_access = str(row[4]).strip().lower()
                
                # Master admin always has access
                if str(row[0]).strip().lower() == MASTER_ADMIN_USER:
                    reports_access = "true"

                users.append({
                    "username": str(row[0]).strip(),
                    "name": str(row[1]).strip() if row[1] else "",
                    "password": str(row[2]) if row[2] else "",
                    "created_at": str(created_val) if created_val else "",
                    "reports_access": reports_access
                })
        # Always guarantee master admin is returned
        if not any(u["username"] == MASTER_ADMIN_USER for u in users):
            users.append({
                "username": MASTER_ADMIN_USER,
                "name": "System Administrator",
                "password": MASTER_ADMIN_PASS,
                "created_at": "",
                "reports_access": "true"
            })
            
        # 3. Parse Roster
        roster = []
        if "Roster" in wb.sheetnames:
            ws = wb["Roster"]
            for row in ws.iter_rows(min_row=2, values_only=True):
                if not row[0]:
                    continue
                date_val = row[1]
                if isinstance(date_val, (datetime.datetime, datetime.date)):
                    date_val = date_val.strftime("%Y-%m-%d")
                start_val = row[3]
                if isinstance(start_val, datetime.time):
                    start_val = start_val.strftime("%H:%M")
                end_val = row[4]
                if isinstance(end_val, datetime.time):
                    end_val = end_val.strftime("%H:%M")
                roster.append({
                    "owner": str(row[0]).strip(),
                    "date": str(date_val).strip() if date_val is not None else "",
                    "code": str(row[2]).strip(),
                    "start_time": str(start_val).strip() if start_val is not None else "",
                    "end_time": str(end_val).strip() if end_val is not None else "",
                    "shift_name": str(row[5]).strip() if row[5] is not None else ""
                })
                
        # 4. Parse Shifts
        shifts = {}
        if "Shifts" in wb.sheetnames:
            ws = wb["Shifts"]
            for row in ws.iter_rows(min_row=2, values_only=True):
                if not row[0]:
                    continue
                code = str(row[0]).strip().upper()
                name = str(row[1]).strip() if row[1] is not None else ""
                start = str(row[2]).strip() if row[2] is not None else ""
                end = str(row[3]).strip() if row[3] is not None else ""
                shifts[code] = {"start": start, "end": end, "name": name}
        if not shifts:
            shifts = {
                "M": {"start": "09:30", "end": "18:30", "name": "Morning Shift"},
                "EE": {"start": "11:00", "end": "20:00", "name": "Early Evening Shift"},
                "E": {"start": "14:00", "end": "22:00", "name": "Evening Shift"},
                "LE": {"start": "16:00", "end": "00:00", "name": "Late Evening Shift"}
            }
            
        wb.close()
        
        # Save to cache
        DB_CACHE["mtime"] = current_mtime
        DB_CACHE["tasks"] = tasks
        DB_CACHE["users"] = users
        DB_CACHE["roster"] = roster
        DB_CACHE["shifts"] = shifts
        
        return tasks, users, roster, shifts
    except PermissionError as pe:
        raise pe
    except Exception as e:
        print(f"Error loading workbook for DB cache: {e}")
        if DB_CACHE["tasks"]:
            return DB_CACHE["tasks"], DB_CACHE["users"], DB_CACHE["roster"], DB_CACHE["shifts"]
        raise

def load_tasks_from_excel():
    tasks, _, _, _ = load_all_data_cached()
    
    # Auto-migration of legacy descriptions containing escalation logs
    import re
    migrated = False
    for t in tasks:
        desc = t.get("description", "")
        esc_history = t.get("escalation_history", "")
        pattern = r'\s*\[Escalated by [^\]]+\]'
        matches = re.findall(r'(\[Escalated by [^\]]+\])', desc)
        if matches:
            cleaned_desc = re.sub(pattern, '', desc).strip()
            t["description"] = cleaned_desc
            new_logs = []
            if esc_history:
                new_logs.extend([line.strip() for line in esc_history.split('\n') if line.strip()])
            for m in matches:
                if m not in new_logs:
                    new_logs.append(m)
            t["escalation_history"] = '\n'.join(new_logs)
            migrated = True
    
    if migrated:
        try:
            save_tasks_to_excel(tasks)
        except Exception as se:
            print(f"Error auto-migrating tasks to Excel: {se}")
            
    return tasks

def load_shifts_from_excel():
    _, _, _, shifts = load_all_data_cached()
    return shifts

def load_quick_links_from_excel():
    init_excel()
    links = []
    try:
        wb = openpyxl.load_workbook(EXCEL_FILE, data_only=True)
        if "QuickLinks" in wb.sheetnames:
            ws = wb["QuickLinks"]
            for row in ws.iter_rows(min_row=2, values_only=True):
                if not row[0]:
                    continue
                name = str(row[0]).strip()
                url = str(row[1]).strip() if row[1] is not None else ""
                links.append({"name": name, "url": url})
        wb.close()
    except Exception as e:
        print(f"Error loading quick links: {e}")
    if not links:
        links = [{"name": "IPAM", "url": "http://phpipam.link3.net/index.php?page=login"}]
    return links

def save_tasks_to_excel(tasks):
    init_excel()
    wb = openpyxl.load_workbook(EXCEL_FILE)
    
    if "Tasks" in wb.sheetnames:
        del wb["Tasks"]
        
    ws = wb.create_sheet(title="Tasks", index=0)
    headers = ["Task ID", "Description", "Owner", "Start Time", "End Time", "Duration", "Status", "Last Updated", "Pending Reason", "Escalation History", "Config Status", "MIS Status", "Assigned Time", "Assignment History"]
    ws.append(headers)
    
    header_fill = PatternFill(start_color="107C41", end_color="107C41", fill_type="solid")
    header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
    center_align = Alignment(horizontal="center", vertical="center")
    
    for col_idx in range(1, len(headers) + 1):
        cell = ws.cell(row=1, column=col_idx)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = center_align
    
    thin_border = Border(
        left=Side(style='thin', color='D9D9D9'),
        right=Side(style='thin', color='D9D9D9'),
        top=Side(style='thin', color='D9D9D9'),
        bottom=Side(style='thin', color='D9D9D9')
    )
    
    data_font = Font(name="Segoe UI", size=10)
    
    for idx, t in enumerate(tasks):
        row_idx = idx + 2
        row_data = [
            t.get("id", ""),
            t.get("description", ""),
            t.get("owner", ""),
            format_datetime(t.get("start_time", "")),
            format_datetime(t.get("end_time", "")),
            t.get("duration", ""),
            t.get("status", "Pending"),
            format_datetime(t.get("last_updated", "")),
            t.get("pending_reason", ""),
            t.get("escalation_history", ""),
            t.get("config_status", ""),
            t.get("mis_status", "Not Closed"),
            t.get("assigned_time", ""),
            t.get("assignment_history", "")
        ]
        ws.append(row_data)
        
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=row_idx, column=col_idx)
            cell.font = data_font
            cell.border = thin_border
            
            if col_idx in [1, 4, 5, 6, 7, 8, 12]:  # ID, Times, Duration, Status, Updated, MIS Status
                cell.alignment = center_align
            else:
                cell.alignment = Alignment(horizontal="left", vertical="center")
            
            status = t.get("status", "Pending")
            if col_idx == 7:  # Status
                if status == "Completed":
                    cell.fill = PatternFill(start_color="D9EAD3", end_color="D9EAD3", fill_type="solid")
                    cell.font = Font(name="Segoe UI", size=10, color="274E13", bold=True)
                elif status == "In Progress":
                    cell.fill = PatternFill(start_color="FCE5CD", end_color="FCE5CD", fill_type="solid")
                    cell.font = Font(name="Segoe UI", size=10, color="783F04", bold=True)
                else:  # Pending
                    cell.fill = PatternFill(start_color="FFF2CC", end_color="FFF2CC", fill_type="solid")
                    cell.font = Font(name="Segoe UI", size=10, color="7F6000", bold=True)

    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            val = str(cell.value or '')
            if len(val) > max_len:
                max_len = len(val)
        ws.column_dimensions[col_letter].width = max(max_len + 3, 12)
        
    wb.save(EXCEL_FILE)

# --- Owners Sheet Functions ---

def load_owners_from_excel():
    init_excel()
    owners = []
    try:
        wb = openpyxl.load_workbook(EXCEL_FILE, data_only=True)
        if "Owners" in wb.sheetnames:
            ws = wb["Owners"]
            for row in ws.iter_rows(min_row=2, max_col=1, values_only=True):
                if row[0]:
                    owners.append(str(row[0]).strip())
        wb.close()
    except PermissionError as pe:
        raise pe
    except Exception as e:
        print(f"Error loading owners: {e}")
    if not owners:
        owners = ["Minhaj Uddin", "System Administrator"]
    return owners

def add_owner_to_excel(name):
    init_excel()
    try:
        wb = openpyxl.load_workbook(EXCEL_FILE)
        if "Owners" in wb.sheetnames:
            ws = wb["Owners"]
            existing = [str(row[0]).strip().lower() for row in ws.iter_rows(min_row=2, max_col=1, values_only=True) if row[0]]
            if name.strip().lower() not in existing:
                ws.append([name.strip()])
                wb.save(EXCEL_FILE)
                wb.close()
                return True
        wb.close()
        return False
    except Exception as e:
        print(f"Error adding owner: {e}")
        raise e

# --- Users Sheet Functions ---

def load_users_from_excel():
    _, users, _, _ = load_all_data_cached()
    return users

def load_roster_from_excel():
    _, _, roster, _ = load_all_data_cached()
    return roster

def add_user_to_excel(username, name, password):
    init_excel()
    username_clean = username.strip().lower()
    if not username_clean:
        return False, "Username cannot be empty."
        
    try:
        wb = openpyxl.load_workbook(EXCEL_FILE)
        if "Users" in wb.sheetnames:
            ws = wb["Users"]
            
            # Check for duplicate
            for row in ws.iter_rows(min_row=2, max_col=1, values_only=True):
                if row[0] and str(row[0]).strip().lower() == username_clean:
                    wb.close()
                    return False, "Username already exists."
                    
            now_str = get_local_now().strftime("%Y-%m-%d %H:%M")
            ws.append([username.strip(), name.strip(), password, now_str])
            
            # Re-apply column widths
            for col in ws.columns:
                max_len = max(len(str(cell.value or '')) for cell in col)
                col_letter = get_column_letter(col[0].column)
                ws.column_dimensions[col_letter].width = max(max_len + 3, 15)
                
            wb.save(EXCEL_FILE)
            wb.close()
            
            # Also add their name to the Owners list automatically!
            add_owner_to_excel(name.strip())
            return True, "User created successfully."
        wb.close()
        return False, "Users sheet not found."
    except Exception as e:
        print(f"Error adding user: {e}")
        raise e

def delete_user_from_excel(username):
    init_excel()
    username_clean = username.strip().lower()
    if username_clean == MASTER_ADMIN_USER:
        return False, "Cannot delete the master admin account."
        
    try:
        wb = openpyxl.load_workbook(EXCEL_FILE)
        if "Users" in wb.sheetnames:
            ws = wb["Users"]
            rows_to_delete = []
            
            # Find row index to delete (1-indexed, headers are row 1)
            for row_idx, row in enumerate(ws.iter_rows(values_only=True), start=1):
                if row[0] and str(row[0]).strip().lower() == username_clean:
                    rows_to_delete.append(row_idx)
            
            if rows_to_delete:
                # Delete rows in reverse order to keep indices correct
                for r in sorted(rows_to_delete, reverse=True):
                    ws.delete_rows(r)
                wb.save(EXCEL_FILE)
                wb.close()
                return True, "User deleted successfully."
        wb.close()
        return False, "User not found."
    except Exception as e:
        print(f"Error deleting user: {e}")
        raise e

# --- Flask Routes ---

@app.route("/")
def serve_index():
    return send_from_directory("static", "index.html")

@app.route("/t-shoot")
@app.route("/troubleshoot")
@app.route("/tshoot-tools")
def serve_tshoot_hub():
    return send_from_directory("static/t-shoot", "index.html")

@app.route("/script-gen")
@app.route("/script-generator")
def serve_script_gen():
    return send_from_directory("static/script-gen", "index.html")

@app.route("/bgp")
@app.route("/bgp-generator")
def serve_bgp():
    return send_from_directory("static/bgp-peering", "index.html")

@app.route("/cisco-vpn")
@app.route("/vpn-generator")
def serve_cisco_vpn():
    return send_from_directory("static/cisco-vpn", "index.html")

@app.route("/eoip")
@app.route("/eoip-generator")
def serve_eoip():
    return send_from_directory("static/eoip-generator", "index.html")

@app.route("/<path:path>")
def serve_static(path):
    return send_from_directory("static", path)

# --- Authentication Endpoint ---
@app.route("/api/auth/login", methods=["POST"])
def login():
    try:
        data = request.json or {}
        username = data.get("username", "").strip()
        password = data.get("password", "")
        
        if not username or not password:
            return jsonify({"error": "invalid_input", "message": "Username and password are required."}), 400
            
        # Hardcoded master check OR sheet lookup
        if username.lower() == MASTER_ADMIN_USER and password == MASTER_ADMIN_PASS:
            return jsonify({
                "success": True,
                "user": {
                    "username": MASTER_ADMIN_USER,
                    "name": "System Administrator",
                    "role": "admin",
                    "reports_access": "true"
                }
            })
            
        # Lookup in Users sheet
        users = load_users_from_excel()
        for u in users:
            if u["username"].lower() == username.lower() and u["password"] == password:
                # Determine role: username "admin" is always admin, others are user
                role = "admin" if u["username"].lower() == MASTER_ADMIN_USER else "user"
                return jsonify({
                    "success": True,
                    "user": {
                        "username": u["username"],
                        "name": u["name"],
                        "role": role,
                        "reports_access": u.get("reports_access", "false")
                    }
                })
                
        return jsonify({"error": "unauthorized", "message": "Invalid username or password."}), 401
        
    except Exception as e:
        return jsonify({"error": "error", "message": str(e)}), 500

# --- User Management Endpoints (Admin Only) ---
@app.route("/api/users", methods=["GET"])
def get_users():
    try:
        active_username = request.args.get("username", "").strip().lower()
        if active_username:
            ONLINE_USERS[active_username] = get_local_now()
            
        users = load_users_from_excel()
        # Strip passwords for response
        safe_users = []
        now = get_local_now()
        for u in users:
            u_name = u["username"].lower()
            is_online = u_name in ONLINE_USERS and (now - ONLINE_USERS[u_name]).total_seconds() < 25
            
            safe_users.append({
                "username": u["username"],
                "name": u["name"],
                "created_at": u["created_at"],
                "role": "admin" if u_name == MASTER_ADMIN_USER else "user",
                "reports_access": u.get("reports_access", "false"),
                "is_online": is_online
            })
        return jsonify(safe_users)
    except Exception as e:
        return jsonify({"error": "error", "message": str(e)}), 500

@app.route("/api/users", methods=["POST"])
def create_user():
    try:
        data = request.json or {}
        username = data.get("username", "").strip()
        name = data.get("name", "").strip()
        password = data.get("password", "")
        
        if not username or not name or not password:
            return jsonify({"error": "invalid_input", "message": "All fields are required."}), 400
            
        success, msg = add_user_to_excel(username, name, password)
        if success:
            return jsonify({"success": True, "message": msg}), 201
        else:
            return jsonify({"error": "failed", "message": msg}), 400
    except PermissionError:
        return jsonify({"error": "excel_locked", "message": "Excel file is currently open. Please close 'tasks.xlsx' and try again."}), 423
    except Exception as e:
        return jsonify({"error": "error", "message": str(e)}), 500

@app.route("/api/users/<username>", methods=["DELETE"])
def delete_user(username):
    try:
        success, msg = delete_user_from_excel(username)
        if success:
            return jsonify({"success": True, "message": msg})
        else:
            return jsonify({"error": "failed", "message": msg}), 400
    except PermissionError:
        return jsonify({"error": "excel_locked", "message": "Excel file is currently open. Please close 'tasks.xlsx' and try again."}), 423
    except Exception as e:
        return jsonify({"error": "error", "message": str(e)}), 500

@app.route("/api/admin/toggle-reports-access", methods=["POST"])
def toggle_reports_access():
    try:
        data = request.json or {}
        username_to_toggle = data.get("username", "").strip().lower()
        new_status = data.get("reports_access", "false").strip().lower()
        
        if not username_to_toggle:
            return jsonify({"error": "invalid_input", "message": "Username is required."}), 400
            
        if username_to_toggle == MASTER_ADMIN_USER:
            return jsonify({"error": "forbidden", "message": "Cannot toggle reports access for System Administrator."}), 403
            
        wb = openpyxl.load_workbook(EXCEL_FILE)
        if "Users" in wb.sheetnames:
            ws = wb["Users"]
            headers = [str(cell.value or '').strip() for cell in ws[1]]
            
            # Make sure Reports Access header is there
            if "Reports Access" not in headers:
                ws.cell(row=1, column=5).value = "Reports Access"
                
            row_updated = False
            for r in range(2, ws.max_row + 1):
                username_val = str(ws.cell(row=r, column=1).value or '').strip().lower()
                if username_val == username_to_toggle:
                    ws.cell(row=r, column=5).value = new_status
                    row_updated = True
                    break
                    
            if row_updated:
                wb.save(EXCEL_FILE)
                wb.close()
                # Clear database cache to force reload
                DB_CACHE["mtime"] = 0
                DB_CACHE["tasks"] = []
                return jsonify({"success": True, "message": f"Reports access updated to {new_status} for {username_to_toggle}."})
            
            wb.close()
            return jsonify({"error": "not_found", "message": "User not found."}), 404
            
        wb.close()
        return jsonify({"error": "not_found", "message": "Users sheet not found."}), 404
        
    except Exception as e:
        return jsonify({"error": "error", "message": str(e)}), 500

@app.route("/api/admin/backup-settings", methods=["GET"])
def get_backup_settings():
    settings = load_backup_settings()
    return jsonify(settings)

@app.route("/api/admin/backup-settings", methods=["POST"])
def update_backup_settings():
    try:
        data = request.json or {}
        settings = load_backup_settings()
        
        # OneDrive configurations
        settings["enabled"] = bool(data.get("enabled", False))
        settings["interval_hours"] = float(data.get("interval_hours", 24))
        settings["target_url"] = str(data.get("target_url", "")).strip()
        
        # GitHub configurations
        settings["github_enabled"] = bool(data.get("github_enabled", False))
        settings["github_interval_hours"] = float(data.get("github_interval_hours", 1.0))
        settings["github_token"] = str(data.get("github_token", "")).strip()
        
        save_backup_settings(settings)
        return jsonify({"success": True, "message": "Backup settings saved successfully."})
    except Exception as e:
        return jsonify({"error": "error", "message": str(e)}), 500

@app.route("/api/admin/backup-settings/test", methods=["POST"])
def test_backup_sync():
    settings = load_backup_settings()
    original_enabled = settings.get("enabled", False)
    
    settings["enabled"] = True
    success, msg = trigger_backup_execution(settings)
    
    settings = load_backup_settings()
    settings["enabled"] = original_enabled
    save_backup_settings(settings)
    
    if success:
        return jsonify({"success": True, "message": msg})
    else:
        return jsonify({"error": "failed", "message": msg}), 400

@app.route("/api/admin/backup-settings/test-github", methods=["POST"])
def test_github_sync():
    settings = load_backup_settings()
    original_enabled = settings.get("github_enabled", False)
    
    settings["github_enabled"] = True
    success, msg = run_github_sync(settings)
    
    settings = load_backup_settings()
    settings["github_enabled"] = original_enabled
    save_backup_settings(settings)
    
    if success:
        return jsonify({"success": True, "message": msg})
    else:
        return jsonify({"error": "failed", "message": msg}), 400

@app.route("/api/tasks/import", methods=["POST"])
def import_tasks_db():
    try:
        if 'file' not in request.files:
            return jsonify({"error": "invalid_input", "message": "No file part in the request."}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "invalid_input", "message": "No selected file."}), 400
            
        # Parse spreadsheet using openpyxl in-memory
        wb_upload = openpyxl.load_workbook(file, read_only=True)
        if "Tasks" not in wb_upload.sheetnames:
            wb_upload.close()
            return jsonify({"error": "invalid_sheet", "message": "Excel file must contain a 'Tasks' sheet."}), 400
            
        # Verify columns inside the uploaded Tasks sheet
        ws_upload = wb_upload["Tasks"]
        first_row = next(ws_upload.iter_rows(values_only=True))
        if "Task ID" not in [str(c or '').strip() for c in first_row]:
            wb_upload.close()
            return jsonify({"error": "invalid_columns", "message": "'Tasks' sheet must contain a 'Task ID' column."}), 400
        wb_upload.close()
        
        # 1. Create a timestamped backup of the current database before replacing Tasks sheet
        try:
            timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_dir = os.path.join(os.path.dirname(EXCEL_FILE), 'backups')
            os.makedirs(backup_dir, exist_ok=True)
            backup_path = os.path.join(backup_dir, f"tasks_before_import_{timestamp}.xlsx")
            import shutil
            shutil.copy2(EXCEL_FILE, backup_path)
            print(f"Backup created before import: {backup_path}")
        except Exception as e:
            print(f"Warning: failed to backup database before import: {e}")
            
        # 2. Open both workbooks to copy Tasks sheet
        wb_dest = openpyxl.load_workbook(EXCEL_FILE)
        wb_src = openpyxl.load_workbook(file, data_only=True)
        
        # Delete old Tasks sheet
        if "Tasks" in wb_dest.sheetnames:
            del wb_dest["Tasks"]
            
        # Create a new Tasks sheet in destination
        ws_dest = wb_dest.create_sheet(title="Tasks", index=0)
        ws_src = wb_src["Tasks"]
        
        # Style headers
        header_fill = PatternFill(start_color="107C41", end_color="107C41", fill_type="solid")
        header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
        center_align = Alignment(horizontal="center", vertical="center")
        
        # Copy rows
        row_count = 0
        for r_idx, row in enumerate(ws_src.iter_rows(values_only=True), start=1):
            if r_idx == 1:
                # header row
                ws_dest.append(row)
                for col_idx in range(1, len(row) + 1):
                    cell = ws_dest.cell(row=1, column=col_idx)
                    cell.fill = header_fill
                    cell.font = header_font
                    cell.alignment = center_align
            else:
                if not row[0]: # stop if Task ID is empty
                    continue
                ws_dest.append(row)
            row_count += 1
            
        # Autofit column widths
        for col in ws_dest.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws_dest.column_dimensions[col_letter].width = max(max_len + 3, 15)
            
        wb_dest.save(EXCEL_FILE)
        wb_dest.close()
        wb_src.close()
        
        # Clear database cache to force reload
        DB_CACHE["mtime"] = 0
        DB_CACHE["tasks"] = []
        
        return jsonify({"success": True, "message": f"Successfully imported {row_count - 1} tasks into the database."})
        
    except Exception as e:
        print(f"Error importing tasks database: {e}")
        return jsonify({"error": "error", "message": str(e)}), 500

# --- Roster Import Endpoint ---
@app.route("/api/users/import", methods=["POST"])
def import_roster():
    import re
    try:
        SHIFT_HOURS = load_shifts_from_excel()
        if 'file' not in request.files:
            return jsonify({"error": "invalid_input", "message": "No file part in the request."}), 400
            
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "invalid_input", "message": "No selected file."}), 400
            
        # Parse the uploaded file using openpyxl in-memory
        wb = openpyxl.load_workbook(file, data_only=True)
        ws = wb.active  # Use the active sheet
        
        # --- 1. Smart Target Month & Year Detection ---
        MONTH_MAP = {
            "january": 1, "jan": 1,
            "february": 2, "feb": 2,
            "march": 3, "mar": 3,
            "april": 4, "apr": 4,
            "may": 5,
            "june": 6, "jun": 6,
            "july": 7, "jul": 7,
            "august": 8, "aug": 8,
            "september": 9, "sep": 9, "sept": 9,
            "october": 10, "oct": 10,
            "november": 11, "nov": 11,
            "december": 12, "dec": 12
        }
        
        detected_month = None
        detected_year = None
        
        # Scan filename, sheet title, and top 5 rows for month & year keywords
        search_texts = [str(file.filename or ''), str(ws.title or '')]
        for r in range(1, min(6, ws.max_row + 1)):
            for c in range(1, min(20, ws.max_column + 1)):
                v = ws.cell(row=r, column=c).value
                if v is not None:
                    if isinstance(v, (datetime.datetime, datetime.date)):
                        detected_year = v.year
                        detected_month = v.month
                    elif isinstance(v, str):
                        search_texts.append(v)
                        
        combined_text = " ".join(search_texts).lower()
        
        if not detected_month:
            for m_name in sorted(MONTH_MAP.keys(), key=len, reverse=True):
                pattern = r'\b' + re.escape(m_name) + r'\b'
                if re.search(pattern, combined_text):
                    detected_month = MONTH_MAP[m_name]
                    break
                    
        if not detected_year:
            m_year = re.search(r'\b(202[4-9]|203[0-9])\b', combined_text)
            if m_year:
                detected_year = int(m_year.group(1))
            else:
                m_short = re.search(r"['\-_/](2[4-9])\b", combined_text)
                if m_short:
                    detected_year = 2000 + int(m_short.group(1))
                    
        # If month or year still not found, apply month-end upload heuristic
        now = get_local_now()
        if not detected_month or not detected_year:
            if now.day >= 20:
                # Month-end upload: targeting upcoming month
                if now.month == 12:
                    fb_month = 1
                    fb_year = now.year + 1
                else:
                    fb_month = now.month + 1
                    fb_year = now.year
            else:
                fb_month = now.month
                fb_year = now.year
                
            if not detected_month:
                detected_month = fb_month
            if not detected_year:
                detected_year = fb_year
                
        # --- 2. Dynamic Header Row & Date Columns Scanning ---
        priority_keywords = ["full name", "operator name", "employee name", "staff name", "name", "operator", "owner", "staff", "user", "engineer"]
        header_row_idx = 1
        name_col_idx = 1
        date_columns = []
        
        for r_idx in range(1, min(6, ws.max_row + 1)):
            temp_dates = []
            temp_name_col = -1
            
            for c_idx in range(1, ws.max_column + 1):
                val = ws.cell(row=r_idx, column=c_idx).value
                if val is None:
                    continue
                v_str = str(val).strip()
                
                # Check for employee name column header
                for kw in priority_keywords:
                    if kw in v_str.lower():
                        temp_name_col = c_idx
                        break
                        
                # Check for date or day number
                parsed_d = None
                if isinstance(val, (datetime.datetime, datetime.date)):
                    parsed_d = val.date()
                elif v_str.isdigit() and 1 <= int(v_str) <= 31:
                    try:
                        parsed_d = datetime.date(detected_year, detected_month, int(v_str))
                    except ValueError:
                        pass
                else:
                    for fmt in ["%Y-%m-%d", "%d-%b-%Y", "%d-%b", "%m/%d/%Y", "%d/%m/%Y", "%b-%d", "%d/%m", "%d-%m-%Y"]:
                        try:
                            p_dt = datetime.datetime.strptime(v_str, fmt)
                            y = detected_year if "%Y" not in fmt and "%y" not in fmt else p_dt.year
                            m = detected_month if "%m" not in fmt and "%b" not in fmt and "%B" not in fmt else p_dt.month
                            parsed_d = datetime.date(y, m, p_dt.day)
                            break
                        except ValueError:
                            pass
                            
                if parsed_d:
                    temp_dates.append((c_idx, parsed_d.strftime("%Y-%m-%d")))
                    
            # If row has 5 or more date columns, it is our header row
            if len(temp_dates) >= 5:
                header_row_idx = r_idx
                date_columns = temp_dates
                if temp_name_col != -1:
                    name_col_idx = temp_name_col
                break
                
        # Fallback if less than 5 date columns found
        if not date_columns:
            for c_idx in range(1, ws.max_column + 1):
                val = ws.cell(row=1, column=c_idx).value
                if val is None or c_idx == name_col_idx:
                    continue
                v_str = str(val).strip()
                parsed_d = None
                if isinstance(val, (datetime.datetime, datetime.date)):
                    parsed_d = val.date()
                elif v_str.isdigit() and 1 <= int(v_str) <= 31:
                    try:
                        parsed_d = datetime.date(detected_year, detected_month, int(v_str))
                    except ValueError:
                        pass
                if parsed_d:
                    date_columns.append((c_idx, parsed_d.strftime("%Y-%m-%d")))
                    
        # Load existing users to check for duplicates
        existing_users = load_users_from_excel()
        existing_usernames = {u["username"].lower() for u in existing_users}
        existing_names = {u["name"].lower() for u in existing_users}
        
        imported_users = []
        skipped_count = 0
        roster_entries_to_save = []
        
        # --- 3. Process Employee Rows & All Shift Codes (Including D/O & LEAVE) ---
        for row in range(header_row_idx + 1, ws.max_row + 1):
            cell_val = ws.cell(row=row, column=name_col_idx).value
            if cell_val is None:
                continue
                
            full_name = str(cell_val).strip()
            if not full_name:
                continue
                
            # Skip summary / total / legend rows
            if full_name.lower() in ["total", "count", "shift summary", "morning", "evening", "off", "remarks", "note", "legend", "summary"]:
                continue
                
            # User registration
            clean_name = full_name.lower()
            clean_name = re.sub(r'[^a-z0-9\s.-]', '', clean_name)
            username = clean_name.replace(" ", ".")
            username = re.sub(r'\.+', '.', username)
            username = username.strip(".")
            
            if username:
                orig_username = username
                counter = 1
                while username in existing_usernames and username not in [u["username"] for u in existing_users]:
                    username = f"{orig_username}{counter}"
                    counter += 1
                
                if full_name.lower() not in existing_names:
                    default_pass = username
                    success, msg = add_user_to_excel(username, full_name, default_pass)
                    if success:
                        imported_users.append({"username": username, "name": full_name})
                        existing_usernames.add(username)
                        existing_names.add(full_name.lower())
                        
            # Shifts parsing: capture EVERY day for EVERY engineer
            for col_idx, date_str in date_columns:
                shift_val = ws.cell(row=row, column=col_idx).value
                val_str = str(shift_val).strip() if shift_val is not None else ""
                val_upper = val_str.upper()
                
                code = "D/O"
                start_time = ""
                end_time = ""
                shift_name = "Day off"
                
                if not val_str or val_upper in ["D/O", "DO", "D / O", "OFF", "DUTY OFF", "DAY OFF", "WEEKEND", "W/O", "OFFDAY", "OFF DAY"]:
                    code = "D/O"
                    shift_name = "Day off"
                elif val_upper in ["LEAVE", "L", "CASUAL LEAVE", "SICK LEAVE", "CL", "SL", "PL", "AL", "ANNUAL LEAVE", "EL"]:
                    code = "LEAVE"
                    shift_name = "Leave"
                elif val_upper in SHIFT_HOURS:
                    code = val_upper
                    s_info = SHIFT_HOURS[val_upper]
                    shift_name = s_info.get("name", "Duty Shift")
                    start_time = s_info.get("start", "")
                    end_time = s_info.get("end", "")
                else:
                    # Case-insensitive check in SHIFT_HOURS
                    matched_sc = None
                    for sc in SHIFT_HOURS:
                        if sc.upper() == val_upper:
                            matched_sc = sc
                            break
                    if matched_sc:
                        code = matched_sc
                        s_info = SHIFT_HOURS[matched_sc]
                        shift_name = s_info.get("name", "Duty Shift")
                        start_time = s_info.get("start", "")
                        end_time = s_info.get("end", "")
                    elif "LEAVE" in val_upper:
                        code = "LEAVE"
                        shift_name = "Leave"
                    elif "OFF" in val_upper or "DO" in val_upper:
                        code = "D/O"
                        shift_name = "Day off"
                    else:
                        code = val_upper
                        shift_name = f"Shift ({val_upper})"
                        
                roster_entries_to_save.append([
                    full_name,
                    date_str,
                    code,
                    start_time,
                    end_time,
                    shift_name
                ])
                
        # --- 4. Write Complete Roster (Including D/O & LEAVE) to Database ---
        if roster_entries_to_save:
            wb_roster = openpyxl.load_workbook(EXCEL_FILE)
            if "Roster" in wb_roster.sheetnames:
                ws_ros = wb_roster["Roster"]
                # Clear all previous roster entries (keep header row 1)
                if ws_ros.max_row > 1:
                    ws_ros.delete_rows(2, ws_ros.max_row - 1)
                
                # Write all daily assignments
                for entry in roster_entries_to_save:
                    ws_ros.append(entry)
                
                wb_roster.save(EXCEL_FILE)
            wb_roster.close()
            
            # Invalidate in-memory cache to force immediate reload across all clients
            DB_CACHE["mtime"] = 0
            DB_CACHE["roster"] = []
            DB_CACHE["tasks"] = []
            
        wb.close()
        return jsonify({
            "success": True,
            "imported_count": len(imported_users),
            "skipped_count": skipped_count,
            "imported_users": imported_users,
            "imported_shifts_count": len(roster_entries_to_save),
            "month_detected": f"{detected_year}-{str(detected_month).zfill(2)}"
        }), 200
        
    except PermissionError:
        return jsonify({"error": "excel_locked", "message": "Excel file is currently open. Please close 'tasks.xlsx' and try again."}), 423
    except Exception as e:
        print(f"Error importing roster: {e}")
        return jsonify({"error": "error", "message": str(e)}), 500

# --- Tasks Endpoints ---
@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    tasks = load_tasks_from_excel()
    today_str = get_local_now().strftime("%Y-%m-%d")
    
    filtered_tasks = []
    for t in tasks:
        status = t.get("status", "")
        if status == "Completed":
            end_time = t.get("end_time", "")
            if end_time and end_time.startswith(today_str):
                filtered_tasks.append(t)
            else:
                # Fallback to last_updated if end_time is not set
                lu = t.get("last_updated", "")
                if not end_time and lu and lu.startswith(today_str):
                    filtered_tasks.append(t)
        else:
            filtered_tasks.append(t)
            
    return jsonify(filtered_tasks)

@app.route("/api/tasks/implementations", methods=["GET"])
def get_implementations():
    try:
        tasks = load_tasks_from_excel()
        
        def extract_reference(description):
            if not description:
                return ""
            import re
            match = re.search(r'\b(CR|TKI|L3)\s*[-_]?\s*\d[a-z0-9-_]*', description, re.IGNORECASE)
            if match:
                return re.sub(r'\s+', '', match.group(0).upper())
            return ""
            
        impl_tasks = []
        for t in tasks:
            desc = t.get("description", "")
            ref = extract_reference(desc)
            if ref and (ref.startswith("CR") or ref.startswith("TKI")):
                t["category"] = "IMPLEMENTATION"
                t["reference"] = ref
                impl_tasks.append(t)
                
        return jsonify(impl_tasks)
    except Exception as e:
        return jsonify({"error": "error", "message": str(e)}), 500

@app.route("/api/roster", methods=["GET"])
def get_roster():
    try:
        roster = load_roster_from_excel()
        return jsonify(roster)
    except PermissionError:
        return jsonify({"error": "excel_locked", "message": "Excel file is currently open. Please close 'tasks.xlsx' and try again."}), 423
    except Exception as e:
        return jsonify({"error": "error", "message": str(e)}), 500

@app.route("/api/roster/batch-update", methods=["POST"])
def batch_update_roster():
    try:
        init_excel()
        SHIFT_HOURS = load_shifts_from_excel()
        data = request.json or {}
        updates = data.get("updates", [])
        
        if not isinstance(updates, list):
            return jsonify({"error": "invalid_input", "message": "Updates list is required."}), 400
            
        wb = openpyxl.load_workbook(EXCEL_FILE)
        if "Roster" in wb.sheetnames:
            ws = wb["Roster"]
            
            # Create a dictionary of existing rows for quick lookup
            # key: (owner.lower(), date_str), value: row_number
            existing_rows = {}
            for idx in range(2, ws.max_row + 1):
                row_owner = ws.cell(row=idx, column=1).value
                row_date = ws.cell(row=idx, column=2).value
                if row_owner and row_date:
                    existing_rows[(str(row_owner).strip().lower(), str(row_date).strip())] = idx
                    
            for item in updates:
                owner = item.get("owner", "").strip()
                date_str = item.get("date", "").strip()
                code = item.get("code", "").strip().upper()
                
                if not owner or not date_str or not code:
                    continue
                    
                # Get shift details
                shift_name = "Day off"
                start_time = ""
                end_time = ""
                
                if code in SHIFT_HOURS:
                    shift = SHIFT_HOURS[code]
                    shift_name = shift["name"]
                    start_time = shift["start"]
                    end_time = shift["end"]
                elif code == "LEAVE":
                    shift_name = "Casual/Sick Leave"
                    
                key = (owner.lower(), date_str)
                if key in existing_rows:
                    row_idx = existing_rows[key]
                    ws.cell(row=row_idx, column=3).value = code
                    ws.cell(row=row_idx, column=4).value = start_time
                    ws.cell(row=row_idx, column=5).value = end_time
                    ws.cell(row=row_idx, column=6).value = shift_name
                else:
                    ws.append([owner, date_str, code, start_time, end_time, shift_name])
                    existing_rows[key] = ws.max_row
                    
            wb.save(EXCEL_FILE)
        wb.close()
        return jsonify({"success": True, "message": "Roster shifts saved successfully."})
        
    except PermissionError:
        return jsonify({"error": "excel_locked", "message": "Excel file is currently open. Please close 'tasks.xlsx' and try again."}), 423
    except Exception as e:
        print(f"Error saving roster updates: {e}")
        return jsonify({"error": "error", "message": str(e)}), 500

@app.route("/api/owners", methods=["GET"])
def get_owners():
    owners = load_owners_from_excel()
    return jsonify(owners)

@app.route("/api/owners", methods=["POST"])
def create_owner():
    try:
        data = request.json or {}
        name = data.get("name", "").strip()
        if not name:
            return jsonify({"error": "invalid", "message": "Owner name cannot be empty."}), 400
            
        added = add_owner_to_excel(name)
        return jsonify({"success": True, "added": added})
    except PermissionError:
        return jsonify({"error": "excel_locked", "message": "Excel file is currently open. Please close 'tasks.xlsx' and try again."}), 423
    except Exception as e:
        return jsonify({"error": "error", "message": str(e)}), 500

@app.route("/api/tasks", methods=["POST"])
def add_task():
    try:
        data = request.json or {}
        tasks = load_tasks_from_excel()
        
        next_id_num = 1001
        if tasks:
            ids = []
            for t in tasks:
                try:
                    num = int(t["id"].split("-")[1])
                    ids.append(num)
                except (IndexError, ValueError):
                    pass
            if ids:
                next_id_num = max(ids) + 1
        
        task_id = f"TSK-{next_id_num}"
        now_str = get_local_now().strftime("%Y-%m-%d %H:%M")
        
        start_time = data.get("start_time", "")
        end_time = data.get("end_time", "")
        status = data.get("status", "Pending")
        
        if status == "In Progress" and not start_time:
            start_time = now_str
        elif status == "Completed":
            if not start_time:
                start_time = now_str
            if not end_time:
                end_time = now_str
                
        duration = calculate_duration(start_time, end_time)
        
        owner = data.get("owner", "").strip() or "Unassigned"
        assigned_time = ""
        assignment_history = ""
        if owner != "Unassigned":
            assigned_time = now_str
            assignment_history = f"[{now_str}] Task assigned to {owner}"
        
        if status == "Pending":
            pending_reason = data.get("pending_reason", "").strip()
            reason_str = f" (Reason: {pending_reason})" if pending_reason else ""
            if assignment_history:
                assignment_history += f"\n[{now_str}] Moved to Pending{reason_str}"
            else:
                assignment_history = f"[{now_str}] Moved to Pending{reason_str}"

        new_task = {
            "id": task_id,
            "description": data.get("description", "").strip(),
            "owner": owner,
            "start_time": start_time,
            "end_time": end_time,
            "duration": duration,
            "status": status,
            "last_updated": now_str,
            "pending_reason": data.get("pending_reason", "").strip(),
            "assigned_time": assigned_time,
            "assignment_history": assignment_history
        }
        
        tasks.append(new_task)
        save_tasks_to_excel(tasks)
        return jsonify(new_task), 201
        
    except PermissionError:
        return jsonify({"error": "excel_locked", "message": "Excel file is currently open. Please close 'tasks.xlsx' and try again."}), 423
    except Exception as e:
        return jsonify({"error": "error", "message": str(e)}), 500

@app.route("/api/tasks/export", methods=["GET"])
def export_tasks():
    try:
        start_date_str = request.args.get("start_date", "").strip()
        end_date_str = request.args.get("end_date", "").strip()

        tasks = load_tasks_from_excel()

        # Parse query dates
        start_date = None
        end_date = None
        if start_date_str:
            try:
                start_date = datetime.datetime.strptime(start_date_str, "%Y-%m-%d").date()
            except ValueError:
                return jsonify({"error": "invalid", "message": "Start date must be in YYYY-MM-DD format."}), 400
        if end_date_str:
            try:
                end_date = datetime.datetime.strptime(end_date_str, "%Y-%m-%d").date()
            except ValueError:
                return jsonify({"error": "invalid", "message": "End date must be in YYYY-MM-DD format."}), 400

        # Helper function to extract date from task dates
        def get_task_date(t):
            st = t.get("start_time", "")
            if st and st != "—":
                try:
                    return datetime.datetime.strptime(st.split(" ")[0], "%Y-%m-%d").date()
                except ValueError:
                    pass
            lu = t.get("last_updated", "")
            if lu and lu != "—":
                try:
                    return datetime.datetime.strptime(lu.split(" ")[0], "%Y-%m-%d").date()
                except ValueError:
                    pass
            return None

        # Helper function to extract reference dynamically
        def extract_reference(description):
            if not description:
                return ""
            import re
            match = re.search(r'\b(CR|TKI|L3)\s*[-_]?\s*\d[a-z0-9-_]*', description, re.IGNORECASE)
            if match:
                return re.sub(r'\s+', '', match.group(0).upper())
            return ""

        # Helper function to extract only the escalation recipient names
        def extract_escalated_to(escalation_history):
            if not escalation_history:
                return ""
            import re
            recipients = []
            for line in escalation_history.split('\n'):
                line = line.strip()
                if not line:
                    continue
                match = re.search(r'to\s+([a-zA-Z0-9_\-\.\s]+?)(?:\s+at|\s+on|\]|\:|\s*$|\s+because)', line, re.IGNORECASE)
                if match:
                    recipients.append(match.group(1).strip())
            return ", ".join(recipients) if recipients else ""

        filtered_tasks = []
        for t in tasks:
            if not start_date and not end_date:
                filtered_tasks.append(t)
                continue
            t_date = get_task_date(t)
            if not t_date:
                continue
            if start_date and t_date < start_date:
                continue
            if end_date and t_date > end_date:
                continue
            filtered_tasks.append(t)

        # Create a new workbook in memory
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "Tasks"

        headers = [
            "Description", "Reference", "Category", "Forwarded By", "Owner", 
            "Start Time", "End Time", "Duration", "Status", "MIS Status", "Last Updated", 
            "Pending Reason", "Config Status", "Verified By"
        ]
        ws.append(headers)

        # Styles
        header_fill = PatternFill(start_color="107C41", end_color="107C41", fill_type="solid")
        header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
        center_align = Alignment(horizontal="center", vertical="center")
        thin_border = Border(
            left=Side(style='thin', color='D9D9D9'),
            right=Side(style='thin', color='D9D9D9'),
            top=Side(style='thin', color='D9D9D9'),
            bottom=Side(style='thin', color='D9D9D9')
        )
        data_font = Font(name="Segoe UI", size=10)

        # Style header
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = center_align

        # Populate data
        for idx, t in enumerate(filtered_tasks):
            row_idx = idx + 2
            
            # Resolve Reference and Forwarded By dynamically
            reference = extract_reference(t.get("description", ""))
            forwarded_by = t.get("forwarded_by", "")
            if not forwarded_by:
                desc = t.get("description", "")
                desc_lower = desc.lower()
                import re
                forwarded_list = []
                if re.search(r'\bncss\b', desc_lower):
                    forwarded_list.append("NCSS")
                if re.search(r'\bbnoc\b', desc_lower):
                    forwarded_list.append("BNOC")
                if re.search(r'\bsat\b', desc_lower):
                    forwarded_list.append("SAT")
                if re.search(r'\bsales\b', desc_lower):
                    forwarded_list.append("Sales")
                if re.search(r'\bnmc\b', desc_lower):
                    forwarded_list.append("NMC")
                if re.search(r'\bbackbone\b', desc_lower):
                    forwarded_list.append("Backbone")
                if re.search(r'\bini\b', desc_lower):
                    forwarded_list.append("INI")
                if re.search(r'\bngnc\b', desc_lower):
                    forwarded_list.append("NGNC")
                if re.search(r'\bsystem\s+team\b', desc_lower):
                    forwarded_list.append("System Team")
                if re.search(r'\bpower\s+team\b', desc_lower):
                    forwarded_list.append("Power Team")
                if re.search(r'\bproject\b', desc_lower):
                    forwarded_list.append("PROJECT")
                forwarded_by = ", ".join(forwarded_list) if forwarded_list else ""

            escalated_to = extract_escalated_to(t.get("escalation_history", ""))

            # Calculate Category dynamically
            category = "—"
            desc_lower = t.get("description", "").lower()
            if "meeting" in desc_lower:
                category = "MEETING"
            elif reference and (reference.startswith("TKI") or reference.startswith("CR")):
                category = "IMPLEMENTATION"
            elif "backbone" in desc_lower:
                category = "BACKBONE"
            elif "project" in desc_lower:
                category = "PROJECT"

            # Resolve verification values
            cfg_val = t.get("config_status", "")
            cfg_state = "Unverified"
            verified_by = "—"
            if cfg_val and cfg_val.strip() != "":
                cfg_state = "Verified"
                verified_by = cfg_val.replace("Verified by ", "")

            row_data = [
                t.get("description", ""),
                reference,
                category,
                forwarded_by,
                t.get("owner", ""),
                t.get("start_time", ""),
                t.get("end_time", ""),
                t.get("duration", ""),
                t.get("status", "Pending"),
                t.get("mis_status", "Not Closed"),
                t.get("last_updated", ""),
                t.get("pending_reason", ""),
                cfg_state,
                verified_by
            ]
            ws.append(row_data)

            # Style data row
            for col_idx in range(1, len(headers) + 1):
                cell = ws.cell(row=row_idx, column=col_idx)
                cell.font = data_font
                cell.border = thin_border
                
                # Center align appropriate columns (Ref, Cat, Forwarded, Owner, Times, Duration, Status, MIS Status, Updated, Config, Verified By)
                if col_idx in [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 14]:
                    cell.alignment = center_align
                else:
                    cell.alignment = Alignment(horizontal="left", vertical="center")

                # Color status column (column 9)
                if col_idx == 9:
                    status = t.get("status", "Pending")
                    if status == "Completed":
                        cell.fill = PatternFill(start_color="E2F0D9", end_color="E2F0D9", fill_type="solid")
                        cell.font = Font(name="Segoe UI", size=10, color="385723", bold=True)
                    elif status == "In Progress":
                        cell.fill = PatternFill(start_color="DDEBF7", end_color="DDEBF7", fill_type="solid")
                        cell.font = Font(name="Segoe UI", size=10, color="1F4E78", bold=True)
                    elif status == "Pending":
                        cell.fill = PatternFill(start_color="FFF2CC", end_color="FFF2CC", fill_type="solid")
                        cell.font = Font(name="Segoe UI", size=10, color="7F6000", bold=True)

        # Auto width
        for col in ws.columns:
            max_len = max(len(str(cell.value or '')) for cell in col)
            col_letter = get_column_letter(col[0].column)
            ws.column_dimensions[col_letter].width = max(max_len + 3, 12)

        # Save to buffer
        file_stream = io.BytesIO()
        wb.save(file_stream)
        file_stream.seek(0)
        wb.close()

        filename = f"tasks_report_{start_date_str}_to_{end_date_str}.xlsx" if (start_date_str and end_date_str) else "tasks_report_full.xlsx"
        return send_file(
            file_stream,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        print(f"Error exporting tasks: {e}")
        return jsonify({"error": "error", "message": str(e)}), 500

@app.route("/api/tasks/<task_id>", methods=["PUT"])
def update_task(task_id):
    try:
        data = request.json or {}
        tasks = load_tasks_from_excel()
        
        task_index = -1
        for idx, t in enumerate(tasks):
            if t["id"] == task_id:
                task_index = idx
                break
                
        if task_index == -1:
            return jsonify({"error": "not_found", "message": "Task not found"}), 404
            
        task = tasks[task_index]
        now_str = get_local_now().strftime("%Y-%m-%d %H:%M")
        
        old_owner = task.get("owner", "Unassigned")
        old_status = task.get("status", "Pending")
        old_pending_reason = task.get("pending_reason", "")
        
        if "description" in data:
            task["description"] = data["description"].strip()
        if "owner" in data:
            task["owner"] = data["owner"].strip() or "Unassigned"
        if "pending_reason" in data:
            task["pending_reason"] = data["pending_reason"].strip()
        if "escalation_history" in data:
            task["escalation_history"] = data["escalation_history"].strip()
        if "config_status" in data:
            task["config_status"] = data["config_status"].strip()
        if "mis_status" in data:
            task["mis_status"] = data["mis_status"].strip() or "Not Closed"
            
        old_status = task["status"]
        new_status = data.get("status", old_status)

        if new_status != "Pending":
            task["pending_reason"] = ""
        
        start_time = data.get("start_time", task["start_time"])
        end_time = data.get("end_time", task["end_time"])
        
        if new_status != old_status:
            task["status"] = new_status
            if new_status == "In Progress":
                if not start_time:
                    start_time = now_str
                end_time = ""
            elif new_status == "Completed":
                if not start_time:
                    start_time = now_str
                if not end_time:
                    end_time = now_str
            elif new_status == "Pending":
                start_time = ""
                end_time = ""
        else:
            if start_time and new_status == "Pending":
                task["status"] = "In Progress"
            if end_time and new_status != "Completed":
                task["status"] = "Completed"
                
        task["start_time"] = start_time
        task["end_time"] = end_time
        task["duration"] = calculate_duration(start_time, end_time)
        # History Logging logic:
        history_logs = []
        new_owner = task.get("owner", "Unassigned")
        new_status = task.get("status", "Pending")
        new_pending_reason = task.get("pending_reason", "")

        if new_owner != old_owner:
            if new_owner != "Unassigned":
                task["assigned_time"] = now_str
                history_logs.append(f"[{now_str}] Task assigned to {new_owner}")
            else:
                task["assigned_time"] = ""
                history_logs.append(f"[{now_str}] Task unassigned")

        if new_status != old_status:
            if new_status == "Pending":
                reason_str = f" (Reason: {new_pending_reason})" if new_pending_reason else ""
                history_logs.append(f"[{now_str}] Moved to Pending{reason_str}")
            elif old_status == "Pending":
                history_logs.append(f"[{now_str}] Moved to {new_status} (Cleared pending status)")
            else:
                history_logs.append(f"[{now_str}] Moved to {new_status}")
        elif new_status == "Pending" and new_pending_reason != old_pending_reason:
            history_logs.append(f"[{now_str}] Pending reason updated to: {new_pending_reason}")

        if history_logs:
            old_history = task.get("assignment_history", "")
            log_str = "\n".join(history_logs)
            if old_history and old_history.strip() != "":
                task["assignment_history"] = old_history.strip() + "\n" + log_str
            else:
                task["assignment_history"] = log_str

        task["last_updated"] = now_str
        
        tasks[task_index] = task
        save_tasks_to_excel(tasks)
        return jsonify(task)
        
    except PermissionError:
        return jsonify({"error": "excel_locked", "message": "Excel file is currently open. Please close 'tasks.xlsx' and try again."}), 423
    except Exception as e:
        return jsonify({"error": "error", "message": str(e)}), 500

@app.route("/api/tasks/<task_id>", methods=["DELETE"])
def delete_task(task_id):
    try:
        tasks = load_tasks_from_excel()
        filtered_tasks = [t for t in tasks if t["id"] != task_id]
        
        if len(filtered_tasks) == len(tasks):
            return jsonify({"error": "not_found", "message": "Task not found"}), 404
            
        save_tasks_to_excel(filtered_tasks)
        return jsonify({"success": True})
        
    except PermissionError:
        return jsonify({"error": "excel_locked", "message": "Excel file is currently open. Please close 'tasks.xlsx' and try again."}), 423
    except Exception as e:
        return jsonify({"error": "error", "message": str(e)}), 500

@app.route("/api/tasks", methods=["DELETE"])
def clear_all_tasks():
    try:
        init_excel()
        wb = openpyxl.load_workbook(EXCEL_FILE)
        if "Tasks" in wb.sheetnames:
            ws = wb["Tasks"]
            if ws.max_row > 1:
                ws.delete_rows(2, ws.max_row - 1)
                wb.save(EXCEL_FILE)
        wb.close()
        return jsonify({"success": True, "message": "All tasks cleared successfully."})
    except PermissionError:
        return jsonify({"error": "excel_locked", "message": "Excel file is currently open. Please close 'tasks.xlsx' and try again."}), 423
    except Exception as e:
        print(f"Error clearing all tasks: {e}")
        return jsonify({"error": "error", "message": str(e)}), 500

@app.route("/api/tasks/open", methods=["POST"])
def open_excel():
    try:
        init_excel()
        if sys.platform == "win32":
            os.startfile(EXCEL_FILE)
            return jsonify({"success": True, "path": EXCEL_FILE})
        else:
            return jsonify({"error": "unsupported_platform", "message": "Opening Excel is only supported directly on Windows."}), 400
    except Exception as e:
        return jsonify({"error": "error", "message": str(e)}), 500

@app.route("/api/shifts", methods=["GET"])
def get_shifts():
    try:
        shifts = load_shifts_from_excel()
        return jsonify(shifts)
    except Exception as e:
        return jsonify({"error": "error", "message": str(e)}), 500

@app.route("/api/shifts", methods=["POST"])
def save_shifts():
    try:
        data = request.json or {}
        wb = openpyxl.load_workbook(EXCEL_FILE)
        if "Shifts" in wb.sheetnames:
            del wb["Shifts"]
        
        ws = wb.create_sheet(title="Shifts")
        headers = ["Shift Code", "Shift Name", "Start Time", "End Time"]
        ws.append(headers)
        
        header_fill = PatternFill(start_color="107C41", end_color="107C41", fill_type="solid")
        header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
        center_align = Alignment(horizontal="center", vertical="center")
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = center_align
            
        for code, details in data.items():
            ws.append([
                code.upper().strip(),
                details.get("name", "").strip(),
                details.get("start", "").strip(),
                details.get("end", "").strip()
            ])
            
        ws.column_dimensions['A'].width = 12
        ws.column_dimensions['B'].width = 25
        ws.column_dimensions['C'].width = 15
        ws.column_dimensions['D'].width = 15
        
        wb.save(EXCEL_FILE)
        wb.close()
        return jsonify({"success": True, "message": "Shifts saved to Excel successfully."})
    except PermissionError:
        return jsonify({"error": "excel_locked", "message": "Excel file is currently open. Please close 'tasks.xlsx' and try again."}), 423
    except Exception as e:
        return jsonify({"error": "error", "message": str(e)}), 500

@app.route("/api/quicklinks", methods=["GET"])
def get_quick_links():
    try:
        links = load_quick_links_from_excel()
        return jsonify(links)
    except Exception as e:
        return jsonify({"error": "error", "message": str(e)}), 500

@app.route("/api/quicklinks", methods=["POST"])
def save_quick_links():
    try:
        data = request.json or {}
        links_list = data.get("links", [])
        
        wb = openpyxl.load_workbook(EXCEL_FILE)
        if "QuickLinks" in wb.sheetnames:
            del wb["QuickLinks"]
            
        ws = wb.create_sheet(title="QuickLinks")
        headers = ["Portal Name", "URL"]
        ws.append(headers)
        
        header_fill = PatternFill(start_color="107C41", end_color="107C41", fill_type="solid")
        header_font = Font(name="Segoe UI", size=11, bold=True, color="FFFFFF")
        center_align = Alignment(horizontal="center", vertical="center")
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=1, column=col_idx)
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = center_align
            
        for item in links_list:
            name = item.get("name", "").strip()
            url = item.get("url", "").strip()
            if name and url:
                ws.append([name, url])
                
        ws.column_dimensions['A'].width = 25
        ws.column_dimensions['B'].width = 50
        
        wb.save(EXCEL_FILE)
        wb.close()
        return jsonify({"success": True, "message": "Quick links saved to Excel successfully."})
    except PermissionError:
        return jsonify({"error": "excel_locked", "message": "Excel file is currently open. Please close 'tasks.xlsx' and try again."}), 423
    except Exception as e:
        return jsonify({"error": "error", "message": str(e)}), 500

@app.route("/api/dashboard-state", methods=["GET"])
def get_dashboard_state():
    try:
        active_username = request.args.get("username", "").strip().lower()
        if active_username:
            ONLINE_USERS[active_username] = get_local_now()
            
        tasks = load_tasks_from_excel()
        today_str = get_local_now().strftime("%Y-%m-%d")
        filtered_tasks = []
        for t in tasks:
            status = t.get("status", "")
            if status == "Completed":
                end_time = t.get("end_time", "")
                if end_time and end_time.startswith(today_str):
                    filtered_tasks.append(t)
                else:
                    lu = t.get("last_updated", "")
                    if not end_time and lu and lu.startswith(today_str):
                        filtered_tasks.append(t)
            else:
                filtered_tasks.append(t)
                
        users = load_users_from_excel()
        safe_users = []
        now = get_local_now()
        for u in users:
            u_name = u["username"].lower()
            is_online = u_name in ONLINE_USERS and (now - ONLINE_USERS[u_name]).total_seconds() < 25
            safe_users.append({
                "username": u["username"],
                "name": u["name"],
                "created_at": u["created_at"],
                "role": "admin" if u_name == MASTER_ADMIN_USER else "user",
                "reports_access": u.get("reports_access", "false"),
                "is_online": is_online
            })
            
        roster = load_roster_from_excel()
        shifts = load_shifts_from_excel()
        
        return jsonify({
            "tasks": filtered_tasks,
            "users": safe_users,
            "roster": roster,
            "shifts": shifts
        })
    except PermissionError:
        return jsonify({"error": "excel_locked", "message": "Excel file is currently open. Please close 'tasks.xlsx' and try again."}), 423
    except Exception as e:
        print(f"Error loading dashboard state: {e}")
        return jsonify({"error": "error", "message": str(e)}), 500

def format_vlan_ranges(vlan_list):
    """Convert [101, 102, 103, 105, 108, 109, 110] into '101-103, 105, 108-110'"""
    if not vlan_list:
        return ""
    sorted_vlans = sorted(list(set(vlan_list)))
    ranges = []
    start = sorted_vlans[0]
    end = sorted_vlans[0]
    
    for v in sorted_vlans[1:]:
        if v == end + 1:
            end = v
        else:
            if start == end:
                ranges.append(str(start))
            else:
                ranges.append(f"{start}-{end}")
            start = v
            end = v
    if start == end:
        ranges.append(str(start))
    else:
        ranges.append(f"{start}-{end}")
    return ", ".join(ranges)

@app.route("/vlan-search")
@app.route("/vlan-search/")
def serve_vlan_search():
    return send_from_directory(os.path.join(app.static_folder, "vlan-search"), "index.html")

@app.route("/t-shoot")
@app.route("/t-shoot/")
def serve_t_shoot():
    return send_from_directory(os.path.join(app.static_folder, "t-shoot"), "index.html")

@app.route("/api/vlan/search", methods=["POST"])
def api_vlan_search():
    try:
        data = request.json or {}
        host_ip = data.get("host_ip", "").strip()
        username = data.get("username", "").strip()
        password = data.get("password", "")
        port = int(data.get("port", 22))
        device_type = data.get("device_type", "huawei").strip().lower()
        vlan_min = int(data.get("vlan_min", 1))
        vlan_max = int(data.get("vlan_max", 4094))

        if not host_ip or not username or not password:
            return jsonify({"success": False, "message": "Host IP, Username, and Password are required."}), 400

        import paramiko
        import re
        import time

        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        
        try:
            client.connect(
                hostname=host_ip,
                port=port,
                username=username,
                password=password,
                timeout=12,
                allow_agent=False,
                look_for_keys=False
            )
        except Exception as conn_err:
            return jsonify({"success": False, "message": f"SSH Connection failed: {str(conn_err)}"}), 400

        channel = client.invoke_shell()
        time.sleep(0.5)

        # Device specific commands
        if device_type == "huawei":
            commands = [
                "screen-length 0 temporary",
                "dis current-configuration | in vlan-type dot1q",
                "undo screen-length temporary",
                "quit"
            ]
        elif device_type == "cisco":
            commands = [
                "terminal length 0",
                "sh running-config | in encapsulation dot1Q",
                "exit"
            ]
        elif device_type == "juniper":
            commands = [
                "set cli screen-length 0",
                "show configuration | match vlan-id",
                "exit"
            ]
        elif device_type == "mikrotik":
            commands = [
                "/interface vlan print terse",
                "quit"
            ]
        else: # default fallback
            commands = [
                "dis current-configuration | in vlan-type dot1q",
                "sh running-config | in encapsulation dot1Q",
                "quit"
            ]

        for cmd in commands:
            channel.send(cmd + "\n")
            time.sleep(0.8)

        output = ""
        while channel.recv_ready():
            chunk = channel.recv(65535).decode("utf-8", errors="ignore")
            output += chunk
            time.sleep(0.2)

        client.close()

        # Extract configured VLANs
        configured_vlans_set = set()
        matched_details = []

        lines = output.splitlines()
        for line in lines:
            line_str = line.strip()
            # Ignore echo of the search commands themselves
            if any(cmd.lower() in line_str.lower() for cmd in commands):
                continue
            
            # Find all numbers in the configuration line
            numbers = [int(n) for n in re.findall(r'\b\d+\b', line_str)]
            for num in numbers:
                if 1 <= num <= 4094:
                    configured_vlans_set.add(num)
                    matched_details.append({
                        "vlan_id": num,
                        "line": line_str
                    })

        sorted_configured = sorted(list(configured_vlans_set))
        
        # Calculate available free VLANs within requested range
        full_range_set = set(range(vlan_min, vlan_max + 1))
        available_set = full_range_set - configured_vlans_set
        sorted_available = sorted(list(available_set))

        return jsonify({
            "success": True,
            "device_type": device_type,
            "host_ip": host_ip,
            "vlan_min": vlan_min,
            "vlan_max": vlan_max,
            "total_configured": len(sorted_configured),
            "total_available": len(sorted_available),
            "configured_vlans": sorted_configured,
            "configured_details": matched_details,
            "available_vlans": sorted_available,
            "available_ranges": format_vlan_ranges(sorted_available),
            "configured_ranges": format_vlan_ranges(sorted_configured),
            "raw_output": output
        })

    except Exception as e:
        return jsonify({"success": False, "message": f"Server error processing VLAN search: {str(e)}"}), 500

if __name__ == "__main__":
    try:
        init_excel()
    except PermissionError:
        print("[WARNING] tasks.xlsx is currently open. The database will initialize when the file is closed.")
    port = int(os.environ.get("PORT", 5050))
    app.run(host="0.0.0.0", port=port, debug=True)
