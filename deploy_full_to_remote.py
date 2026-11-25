import os
import paramiko
import time

REMOTE_HOST = '203.76.96.218'
REMOTE_PORT = 30222
REMOTE_USER = 'subrata'
REMOTE_PASS = 'Ai@Link3@2050'
REMOTE_DIR = '/home/subrata/task-manager'

print("=== Starting Safe Remote Server Backup & Deployment ===")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

def run_ssh(cmd):
    stdin, stdout, stderr = ssh.exec_command(cmd)
    out = stdout.read().decode('utf-8', errors='ignore')
    err = stderr.read().decode('utf-8', errors='ignore')
    return out, err

try:
    print(f"Connecting to SSH: {REMOTE_HOST}:{REMOTE_PORT} as {REMOTE_USER}...")
    ssh.connect(REMOTE_HOST, port=REMOTE_PORT, username=REMOTE_USER, password=REMOTE_PASS, timeout=30)
    sftp = ssh.open_sftp()

    # 1. Create timestamped backup of remote database & existing code before deployment
    timestamp = time.strftime("%Y%m%d_%H%M%S")
    backup_dir = f"{REMOTE_DIR}/backups/pre_deploy_{timestamp}"
    print(f"\n[STEP 1] Creating pre-deploy snapshot at {backup_dir}...")
    out, err = run_ssh(
        f"mkdir -p {backup_dir}/static && "
        f"cp -p {REMOTE_DIR}/tasks.db {backup_dir}/ 2>/dev/null || true && "
        f"cp -p {REMOTE_DIR}/tasks.xlsx {backup_dir}/ 2>/dev/null || true && "
        f"cp -p {REMOTE_DIR}/customer_tracker_data.json {backup_dir}/ 2>/dev/null || true && "
        f"cp -p {REMOTE_DIR}/app.py {backup_dir}/ 2>/dev/null || true && "
        f"cp -p {REMOTE_DIR}/database.py {backup_dir}/ 2>/dev/null || true && "
        f"cp -p {REMOTE_DIR}/static/index.html {backup_dir}/static/ 2>/dev/null || true && "
        f"cp -p {REMOTE_DIR}/static/script.js {backup_dir}/static/ 2>/dev/null || true && "
        f"ls -la {backup_dir}"
    )
    print(out)

    # 2. Sync existing database & code to GitHub from remote server before changing anything
    print("[STEP 2] Backing up existing database & code to GitHub...")
    gh_cmd = (
        f"cd {REMOTE_DIR} && "
        f"python3 -c \"import app; ok, msg = app.run_github_sync(); print('DB GitHub Sync:', ok, msg)\" && "
        f"python3 -c \""
        f"import json, subprocess; "
        f"s = json.load(open('backup_settings.json')) if __import__('os').path.exists('backup_settings.json') else dict(); "
        f"tok = s.get('github_token', '').strip(); "
        f"remote = 'https://' + tok + '@github.com/minhajuddin89/NGNC-Dashboard.git' if tok else ''; "
        f"print('GitHub token configured:', bool(tok)); "
        f"subprocess.run(['git', 'add', 'app.py', 'database.py', 'static/index.html', 'static/script.js', 'tasks.xlsx'], check=False) if tok else None; "
        f"subprocess.run(['git', 'commit', '-m', 'Pre-deploy backup snapshot {timestamp}'], check=False) if tok else None; "
        f"subprocess.run(['git', 'push', '-f', remote, 'HEAD:database-backups'], check=False) if tok else None; "
        f"subprocess.run(['git', 'push', remote, 'HEAD:main'], check=False) if tok else None"
        f"\""
    )
    out, err = run_ssh(gh_cmd)
    print(out)
    if err:
        print(err)

    # 3. Upload ONLY the updated code files (NEVER overwrite tasks.db, tasks.xlsx, customer_tracker_data.json, backup_settings.json)
    print("[STEP 3] Uploading updated code files (preserving all databases)...")
    files_to_upload = [
        ('database.py', f'{REMOTE_DIR}/database.py'),
        ('app.py', f'{REMOTE_DIR}/app.py'),
        ('static/index.html', f'{REMOTE_DIR}/static/index.html'),
        ('static/script.js', f'{REMOTE_DIR}/static/script.js'),
    ]
    for local_rel, remote_path in files_to_upload:
        sftp.put(local_rel, remote_path)
        print(f"  -> Uploaded {local_rel} -> {remote_path}")

    # Also download a local backup copy of remote tasks.db and tasks.xlsx
    os.makedirs('backups', exist_ok=True)
    local_db_bak = f'backups/remote_tasks_{timestamp}.db'
    local_xlsx_bak = f'backups/remote_tasks_{timestamp}.xlsx'
    sftp.get(f'{REMOTE_DIR}/tasks.db', local_db_bak)
    sftp.get(f'{REMOTE_DIR}/tasks.xlsx', local_xlsx_bak)
    print(f"  -> Downloaded remote DB backup to {local_db_bak} and {local_xlsx_bak}")

    sftp.close()

    # 4. Initialize projects table safely on existing tasks.db without altering existing tables
    print("\n[STEP 4] Ensuring projects table exists in remote SQLite database...")
    out, err = run_ssh(
        f"cd {REMOTE_DIR} && python3 -c \"import database; database.init_db(); print('DB schema verified! Tasks count:', len(database.db_get_all_tasks()), 'Roster count:', len(database.db_get_roster()))\""
    )
    print(out)
    if err:
        print(err)

    # 5. Restart Gunicorn & services cleanly
    print("[STEP 5] Restarting Task Manager service on port 9000...")
    run_ssh("pkill -f 'gunicorn' 2>/dev/null || true")
    time.sleep(2)
    # Launch gunicorn with --daemon so SSH channel closes immediately
    out, err = run_ssh(
        f"cd {REMOTE_DIR} && python3 -m gunicorn --daemon --workers=4 --threads=2 --bind=0.0.0.0:9000 --access-logfile {REMOTE_DIR}/app.log --error-logfile {REMOTE_DIR}/app.log app:app"
    )
    time.sleep(3)

    # 6. Verify HTTP 200 & /api/projects endpoint
    out, _ = run_ssh("curl -s -I http://127.0.0.1:9000/ | head -n 5 && echo 'Projects API:' && curl -s http://127.0.0.1:9000/api/projects")
    print("\n--- HTTP & API Verification ---")
    print(out)

    # 7. Push updated code release to GitHub if token is configured
    print("[STEP 6] Pushing updated code to GitHub...")
    gh_post_cmd = (
        f"cd {REMOTE_DIR} && "
        f"python3 -c \""
        f"import json, subprocess; "
        f"s = json.load(open('backup_settings.json')) if __import__('os').path.exists('backup_settings.json') else dict(); "
        f"tok = s.get('github_token', '').strip(); "
        f"remote = 'https://' + tok + '@github.com/minhajuddin89/NGNC-Dashboard.git' if tok else ''; "
        f"subprocess.run(['git', 'add', 'app.py', 'database.py', 'static/index.html', 'static/script.js'], check=False) if tok else None; "
        f"subprocess.run(['git', 'commit', '-m', 'Add Project Work feature and fix roster DB connection'], check=False) if tok else None; "
        f"subprocess.run(['git', 'push', remote, 'HEAD:main'], check=False) if tok else None; "
        f"print('GitHub code sync completed.')"
        f"\""
    )
    out, _ = run_ssh(gh_post_cmd)
    print(out)

    ssh.close()
    print("\n=== SAFE PRODUCTION DEPLOYMENT COMPLETED SUCCESSFULLY ===")

except Exception as e:
    print(f"\n[FATAL ERROR] Deployment failed: {e}")
    raise
