import paramiko

def main():
    host = '203.76.96.218'
    port = 30222
    username = 'subrata'
    password = 'Ai@Link3@2050'
    
    print(f"Connecting to remote server...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        ssh.connect(host, port=port, username=username, password=password, timeout=15)
        print("Connected!")
        
        # Check active Python/Gunicorn processes
        print("\nChecking active Python/Gunicorn processes:")
        stdin, stdout, stderr = ssh.exec_command("ps aux | grep -E 'gunicorn|app.py' | grep -v grep")
        print(stdout.read().decode('utf-8'))
        
        # Test port 9000 curl
        print("\nTesting port 9000 status (curl):")
        stdin, stdout, stderr = ssh.exec_command("curl -I http://127.0.0.1:9000/")
        print(stdout.read().decode('utf-8'))
        
        # Tail app.log
        print("\nTailing app.log:")
        stdin, stdout, stderr = ssh.exec_command("tail -n 25 /home/subrata/task-manager/app.log")
        print(stdout.read().decode('utf-8'))
            
        ssh.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
