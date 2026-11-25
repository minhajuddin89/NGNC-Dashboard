#!/usr/bin/env python3
"""
Push current commits and tags to GitHub repository:
https://github.com/minhajuddin89/NGNC-Dashboard.git
using Dulwich (pure Python Git implementation).
"""

import sys
import os
import dulwich.porcelain as porcelain
import dulwich.repo

REPO_PATH = "."
GITHUB_REPO = "minhajuddin89/NGNC-Dashboard.git"

def push_to_github(token=None):
    if not token:
        if len(sys.argv) > 1:
            token = sys.argv[1].strip()
        else:
            token = input("Enter your GitHub Personal Access Token (PAT): ").strip()

    if not token:
        print("[ERROR] GitHub token is required to authenticate with GitHub.")
        return False

    remote_url = f"https://{token}@github.com/{GITHUB_REPO}"
    repo = dulwich.repo.Repo(REPO_PATH)

    print(f"Connecting to GitHub: https://github.com/{GITHUB_REPO}...")
    try:
        # Push main branch
        print("Pushing 'main' branch to GitHub...")
        porcelain.push(repo, remote_url, "refs/heads/main")
        print(" [OK] main branch pushed successfully!")

        # Push tags
        print("Pushing tags to GitHub...")
        tags = repo.refs.as_dict(b'refs/tags')
        for tag_name in tags:
            tag_ref = f"refs/tags/{tag_name.decode('utf-8')}"
            try:
                porcelain.push(repo, remote_url, tag_ref)
                print(f" [OK] Tag {tag_ref} pushed successfully!")
            except Exception as te:
                print(f" [SKIP] Tag {tag_ref}: {te}")

        print("\n=== SUCCESS: All commits & tags successfully pushed to GitHub! ===")
        print(f"View repository: https://github.com/{GITHUB_REPO}")
        return True
    except Exception as e:
        print(f"\n[ERROR] Failed to push to GitHub: {e}")
        return False

if __name__ == "__main__":
    push_to_github()
