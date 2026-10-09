---
name: system_health_audit
description: Audits PC hardware health including CPU usage, RAM utilization, Disk space, and running top processes.
parameters:
  depth: 'quick' or 'deep'
---

# System Health Audit Skill

## Objective
Inspect and report the live performance health of the Windows PC.

## Step-by-Step Workflow
1. Check CPU percentage and core counts via psutil.
2. Check Total and Available RAM.
3. Check Free storage on primary drive (C:).
4. Identify any top CPU or Memory consuming processes.
5. Deliver a natural spoken Bengali diagnostic report:
   "স্যার, আপনার সিস্টেমের অবস্থা বর্তমানে স্বাভাবিক। CPU ব্যবহার ...% এবং র‍্যাম খালি রয়েছে ... GB।"
