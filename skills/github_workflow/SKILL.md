---
name: github_workflow
description: Automates Git operations including status check, branch switching, staging, committing with descriptive messages, and pushing.
parameters:
  action: 'status', 'commit', 'push', 'pull', 'log'
  message: Optional commit message
---

# GitHub & Git Workflow Skill

## Objective
Safely handle day-to-day Git version control tasks without requiring manual terminal commands.

## Step-by-Step Workflow
1. Check repository status (`git status`).
2. If staging & committing:
   - Identify changed files.
   - Run security check ensuring no sensitive files (e.g. `.env`, private keys) are staged.
   - Generate a concise Conventional Commit message.
   - Stage and commit.
3. If pushing or pulling:
   - Verify remote connection.
   - Execute git push/pull.
4. Report the outcome clearly.
