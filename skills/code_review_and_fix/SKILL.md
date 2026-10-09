---
name: code_review_and_fix
description: Analyzes code files for syntax errors, bugs, performance bottlenecks, and security vulnerabilities, and generates patches.
parameters:
  file_path: Absolute or relative path to the file to review
---

# Code Review & Fix Skill

## Objective
Thoroughly inspect the target code file, identify any issues, and produce fixes.

## Step-by-Step Workflow
1. Read the target code file using file inspection tools.
2. Check for:
   - Syntax or runtime errors.
   - Resource leaks (unclosed sockets, files, memory).
   - Security vulnerabilities (SQL injection, shell injection, hardcoded secrets).
   - Logic or edge-case flaws.
3. Formulate the corrected code block.
4. Present a clear explanation in Bengali and apply the fix to the file if instructed.
