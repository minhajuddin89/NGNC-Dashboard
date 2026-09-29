import os
import paramiko
import time

REMOTE_HOST = '203.76.96.218'
REMOTE_PORT = 30222
REMOTE_USER = 'subrata'
REMOTE_PASS = 'Ai@Link3@2050'
REMOTE_DIR = '/home/subrata/task-manager'

print("=== Starting Full Remote Server Deployment ===")

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    print(f"Connecting to SSH: {REMOTE_HOST}:{REMOTE_PORT} as {REMOTE_USER}...")
    ssh.connect(REMOTE_HOST, port=REMOTE_PORT, username=REMOTE_USER, password=REMOTE_PASS, timeout=30)
    sftp = ssh.open_sftp()

    def sftp_mkdir_p(remote_path):
        dirs = []
        p = remote_path
        while p and p != '/':
            dirs.append(p)
            p = os.path.dirname(p)
        for d in reversed(dirs):
            try:
                sftp.mkdir(d)
            except Exception:
                pass

    def upload_dir(local_dir, remote_base):
        for root, dirs, files in os.walk(local_dir):
            # Skip git and cache directories
            if '.git' in root or '__pycache__' in root or 'extracted' in root:
                continue
            rel_path = os.path.relpath(root, local_dir)
            target_remote_dir = os.path.join(remote_base, rel_path).replace('\\', '/')
            sftp_mkdir_p(target_remote_dir)

            for file in files:
                if file.endswith(('.pyc', '.exe', '.zip', '.tar', '.gz')) or file == '.gitignore' or 'extracted' in file:
                    continue
                local_file_path = os.path.join(root, file)
                remote_file_path = os.path.join(target_remote_dir, file).replace('\\', '/')
                try:
                    sftp.put(local_file_path, remote_file_path)
                    print(f"  Uploaded: {rel_path}/{file}", flush=True)
                except Exception as e:
                    print(f"  [ERROR] Failed to upload {file}: {e}", flush=True)

    # 1. Backup remote tasks.xlsx before deployment
    try:
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        sftp_mkdir_p(f"{REMOTE_DIR}/backups")
        remote_db = f"{REMOTE_DIR}/tasks.xlsx"
        backup_db = f"{REMOTE_DIR}/backups/tasks_backup_{timestamp}.xlsx"
        
        try:
            sftp.stat(remote_db)
            print(f"Creating remote database backup: {backup_db}")
            # Run SSH command to copy the remote database file safely on the host
            ssh.exec_command(f"cp {remote_db} {backup_db}")
            time.sleep(1) # Let the copy finish
        except FileNotFoundError:
            print("No remote tasks.xlsx found. Skipping backup.")
    except Exception as e:
        print(f"Warning: Remote backup failed: {e}")

    # 2. Upload root python files and data (tasks.xlsx is explicitly excluded to protect live data)
    root_files = ['app.py', 'release.py']
    for rf in root_files:
        if os.path.exists(rf):
            remote_rf = f"{REMOTE_DIR}/{rf}"
            print(f"Uploading root file: {rf} -> {remote_rf}")
            sftp.put(rf, remote_rf)

    # 2. Upload static/ folder recursively
    print("\nUploading static directory tree...")
    upload_dir('static', f"{REMOTE_DIR}/static")

    # 3. Upload olt_backend/ folder recursively if present
    if os.path.exists('olt_backend'):
        print("\nUploading olt_backend directory tree...")
        upload_dir('olt_backend', f"{REMOTE_DIR}/olt_backend")

    sftp.close()
    print("\n[SUCCESS] File synchronization complete!")

    # 4. Restart services on remote server
    print("\nRestarting services via start.sh...")
    ssh.exec_command(f"nohup bash {REMOTE_DIR}/start.sh > {REMOTE_DIR}/deploy_start.log 2>&1 &")
    time.sleep(4)

    # 5. Check remote status
    stdin, stdout, stderr = ssh.exec_command("ps aux | grep -E 'gunicorn|python3' | grep -v grep")
    print("\n--- Remote Process Status ---")
    print(stdout.read().decode())

    # 6. Verify HTTP 200
    stdin, stdout, stderr = ssh.exec_command("curl -s -I http://127.0.0.1:9000/")
    print("\n--- HTTP Health Check ---")
    print(stdout.read().decode())

    ssh.close()
    print("\n=== FULL PRODUCTION DEPLOYMENT FINISHED SUCCESSFULLY ===")

except Exception as e:
    print(f"\n[FATAL ERROR] Deployment failed: {e}")
