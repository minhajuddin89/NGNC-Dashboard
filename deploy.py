import os
import sys
import time
import paramiko

# Enforce UTF-8 encoding on standard output to prevent Windows console encoding crashes
try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

def run_remote_command(ssh, cmd):
    print(f"Executing: {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    
    out_lines = []
    while not stdout.channel.exit_status_ready():
        if stdout.channel.recv_ready():
            chunk = stdout.channel.recv(1024).decode('utf-8', errors='ignore')
            sys.stdout.write(chunk)
            sys.stdout.flush()
            out_lines.append(chunk)
        time.sleep(0.1)
    
    # Read remaining output
    remaining = stdout.read().decode('utf-8', errors='ignore')
    sys.stdout.write(remaining)
    sys.stdout.flush()
    out_lines.append(remaining)
    
    exit_status = stdout.channel.recv_exit_status()
    print(f"Exit code: {exit_status}\n")
    return exit_status, "".join(out_lines)

def sftp_mkdir_safe(sftp, path):
    try:
        sftp.mkdir(path)
    except IOError:
        pass

def sftp_upload_dir(sftp, local_dir, remote_dir, uploaded_files=None):
    if uploaded_files is None:
        uploaded_files = []
    sftp_mkdir_safe(sftp, remote_dir)
    for entry in os.listdir(local_dir):
        if entry in ['.git', '__pycache__', 'node_modules', 'deploy.py', 'deploy.log', 'run.bat', 'test_app.py', '.agents', '.system_generated', 'task.md', 'walkthrough.md', 'implementation_plan.md', 'PulseTrace.exe', 'ping-monitor.exe', 'Ping-monitor.zip', 'server.log', 'app.log', 'backups', 'VLAN Search.exe_extracted', 'extracted_vlan_search'] or entry.endswith('.exe') or entry.startswith('VLAN Search'):
            continue
        local_path = os.path.join(local_dir, entry)
        remote_path = remote_dir + '/' + entry
        
        if os.path.isdir(local_path):
            sftp_upload_dir(sftp, local_path, remote_path, uploaded_files)
        else:
            if entry == 'tasks.xlsx':
                try:
                    sftp.stat(remote_path)
                    print(f"--> Skipping upload of {entry} (remote database already exists and will be preserved)")
                    continue
                except IOError:
                    pass
            
            local_stat = os.stat(local_path)
            should_upload = True
            try:
                remote_stat = sftp.stat(remote_path)
                is_web_file = 'static' in local_path or entry.endswith(('.html', '.js', '.css', '.py'))
                if not is_web_file and remote_stat.st_size == local_stat.st_size and int(remote_stat.st_mtime) == int(local_stat.st_mtime):
                    should_upload = False
            except IOError:
                pass
                
            if should_upload:
                print(f"--> Uploading {local_path} -> {remote_path}")
                sftp.put(local_path, remote_path)
                try:
                    sftp.utime(remote_path, (int(local_stat.st_atime), int(local_stat.st_mtime)))
                except Exception:
                    pass
                uploaded_files.append(entry)
            else:
                print(f"--> Skipping {entry} (no changes detected)")
    return uploaded_files

def main():
    host = '203.76.96.218'
    port = 30222
    username = 'subrata'
    password = 'Ai@Link3@2050'
    
    print(f"Connecting to remote server {host}:{port} as {username}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        ssh.connect(host, port=port, username=username, password=password, timeout=15)
        print("Connected successfully!")
        
        # 1. Create target deployment directory
        remote_dir = '/home/subrata/task-manager'
        print(f"Creating remote deployment directory: {remote_dir}")
        run_remote_command(ssh, f"mkdir -p {remote_dir}")
        
        # 2. Open SFTP and upload files
        print("Starting file upload via SFTP...")
        sftp = ssh.open_sftp()
        uploaded_files = sftp_upload_dir(sftp, '.', remote_dir)
        sftp.close()
        print("File upload completed!")

        # Docker Compose is disabled due to environment limitations. Running directly as native system daemon.
        docker_run_success = False
        
        if not docker_run_success:
            print("\n-----------------------------------------------------------")
            print("FALLBACK: Launching application as native system daemon...")
            print("-----------------------------------------------------------")
            
            # Install python requirements globally only if requirements.txt was updated
            if 'requirements.txt' in uploaded_files:
                print("Installing python requirements on remote host...")
                run_remote_command(ssh, f"python3 -m pip install -r {remote_dir}/requirements.txt --break-system-packages")
            else:
                print("Skipping requirements installation (no changes detected in requirements.txt)")
            
            # Install npm dependencies for ping-monitor if needed
            print("Checking ping-monitor dependencies on remote host...")
            run_remote_command(ssh, f"cd {remote_dir}/ping-monitor && npm install --omit=dev")
            
            # Write start.sh helper script
            start_script = (
                "#!/bin/bash\n"
                "echo 'Stopping any existing Task Manager & PulseTrace processes...'\n"
                "pkill -f 'python3 /home/subrata/task-manager/app.py' 2>/dev/null || true\n"
                "pkill -f 'gunicorn' 2>/dev/null || true\n"
                "pkill -f 'node server.js' 2>/dev/null || true\n"
                "sleep 3\n"
                "echo 'Starting PulseTrace diagnostic daemon on port 3000...'\n"
                "cd /home/subrata/task-manager/ping-monitor && nohup node server.js > /home/subrata/task-manager/ping-monitor/server.log 2>&1 &\n"
                "echo 'Starting Task Manager with Gunicorn (4 workers, 2 threads) on port 9000...'\n"
                "cd /home/subrata/task-manager && nohup python3 -m gunicorn --workers=4 --threads=2 --bind=0.0.0.0:9000 app:app > /home/subrata/task-manager/app.log 2>&1 &\n"
                "sleep 5\n"
                "echo 'All services started.'\n"
            )
            
            print("Writing start.sh control script...")
            sftp = ssh.open_sftp()
            with sftp.file(f"{remote_dir}/start.sh", "w") as f:
                f.write(start_script)
            sftp.close()
            
            # Run quick links database migration script
            print("Running quick links database migration on remote host...")
            run_remote_command(ssh, f"cd {remote_dir} && python3 migrate_quick_links.py")
            
            run_remote_command(ssh, f"chmod +x {remote_dir}/start.sh")
            
            print("Executing start.sh...")
            run_remote_command(ssh, f"{remote_dir}/start.sh")
            
            # Reconnect SSH if closed during service restart
            try:
                ssh.exec_command("echo ping")
            except Exception:
                print("Re-establishing SSH connection for verification...")
                ssh.connect(host, port=port, username=username, password=password, timeout=30)

            # Verify connectivity with retries for Gunicorn startup
            print("Verifying response from port 9000...")
            verified = False
            for attempt in range(1, 6):
                time.sleep(3)
                verify_code, _ = run_remote_command(ssh, "curl -I http://127.0.0.1:9000/")
                if verify_code == 0:
                    verified = True
                    break
                print(f"Attempt {attempt}/5 failed, retrying in 3s...")
            
            if verified:
                print("\nNative service fallback deployment completed successfully!")
            else:
                print("\nError verifying port 9000 interface after 5 attempts.")
                sys.exit(1)
        
        print(f"\nDeployment completed successfully! Access the app at http://{host}:9000")
        
    except Exception as e:
        print(f"Deployment failed: {e}")
        sys.exit(1)
    finally:
        ssh.close()

if __name__ == '__main__':
    main()
