import subprocess
import sys
import json
import os
import datetime

GIT_EXE = r"C:\Program Files\Git\cmd\git.exe"

def run_cmd(cmd_list):
    res = subprocess.run(cmd_list, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"Error running {' '.join(cmd_list)}:\n{res.stderr}")
        return False, res.stderr
    return True, res.stdout.strip()

def get_latest_tag():
    ok, out = run_cmd([GIT_EXE, "tag", "--sort=-v:refname"])
    if ok and out:
        tags = [t.strip() for t in out.splitlines() if t.strip()]
        return tags[0] if tags else "v1.0.0"
    return "v1.0.0"

def bump_version(current_tag, bump_type="patch"):
    tag_clean = current_tag.lstrip('v')
    parts = tag_clean.split('.')
    while len(parts) < 3:
        parts.append('0')
    major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])
    
    if bump_type == "major":
        major += 1
        minor = 0
        patch = 0
    elif bump_type == "minor":
        minor += 1
        patch = 0
    else:
        patch += 1
        
    return f"v{major}.{minor}.{patch}"

def create_release(message, bump_type="patch"):
    print("=== Creating New Release Version ===")
    latest = get_latest_tag()
    new_version = bump_version(latest, bump_type)
    print(f"Current version: {latest} -> New version: {new_version}")
    
    # 1. Stage all changes
    print("Staging all changes...")
    run_cmd([GIT_EXE, "add", "."])
    
    # 2. Check if there are changes to commit
    ok, status = run_cmd([GIT_EXE, "status", "--porcelain"])
    if status:
        commit_msg = f"Release {new_version}: {message}"
        print(f"Committing changes: {commit_msg}")
        run_cmd([GIT_EXE, "commit", "-m", commit_msg])
    else:
        print("No uncommitted changes detected. Tagging current HEAD.")
        
    # 3. Create annotated Git Tag
    tag_msg = f"{new_version} - {message} ({datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')})"
    print(f"Creating Git Tag: {new_version}...")
    run_cmd([GIT_EXE, "tag", "-a", new_version, "-m", tag_msg])
    
    # 4. Push commit and tag to GitHub
    print("Pushing to GitHub (main + tags)...")
    run_cmd([GIT_EXE, "push", "origin", "main"])
    run_cmd([GIT_EXE, "push", "origin", new_version])
    
    print(f"\n[SUCCESS] Release {new_version} successfully pushed to GitHub!")
    print(f"To rollback to this version at any time, simply run:")
    print(f"  git checkout {new_version}")

if __name__ == "__main__":
    msg = sys.argv[1] if len(sys.argv) > 1 else "Incremental update"
    b_type = sys.argv[2] if len(sys.argv) > 2 else "patch"
    create_release(msg, b_type)
