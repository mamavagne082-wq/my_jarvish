import os
import sys

# Locate Jarvis/Jarvis_code directory
ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
JARVIS_CODE_DIR = os.path.join(ROOT_DIR, "Jarvis", "Jarvis_code")
if not os.path.exists(JARVIS_CODE_DIR):
    JARVIS_CODE_DIR = os.path.join(ROOT_DIR, "Jarvis_code")

if os.path.exists(JARVIS_CODE_DIR):
    # Set CWD to Jarvis_code directory
    os.chdir(JARVIS_CODE_DIR)
    if JARVIS_CODE_DIR not in sys.path:
        sys.path.insert(0, JARVIS_CODE_DIR)
    
    agent_path = os.path.join(JARVIS_CODE_DIR, "agent.py")
    with open(agent_path, "rb") as f:
        code = compile(f.read(), agent_path, "exec")
        globs = {
            "__file__": agent_path,
            "__name__": "__main__",
            "__package__": None,
        }
        exec(code, globs)
else:
    print(f"Error: Could not locate Jarvis_code directory at {JARVIS_CODE_DIR}")
    sys.exit(1)
