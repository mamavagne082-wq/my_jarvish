import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

with open(r'c:\Users\Al Amin\Downloads\Compressed\Jarvis\Jarvis\Jarvis_code\agent.py', 'r', encoding='utf-8') as f:
    content = f.read()

# Find the block using ASCII parts as anchors
lines = content.split('\n')
start_line = None
end_line = None
for i, line in enumerate(lines):
    if 'user_disp = user_id or "ALAMIN"' in line and start_line is None:
        # check if the next line is greeting_instruction
        if i+1 < len(lines) and 'greeting_instruction = (' in lines[i+1]:
            start_line = i
    if start_line is not None and i > start_line and line.strip() == ')':
        # Check if next meaningful line is about _is_first_session_connect
        for j in range(i+1, min(i+5, len(lines))):
            if '_is_first_session_connect' in lines[j]:
                end_line = i
                break
        if end_line is not None:
            break

print(f"Found block: lines {start_line} to {end_line}")
print("OLD BLOCK:")
for ln in lines[start_line:end_line+1]:
    print(f"  {repr(ln[:80])}")
