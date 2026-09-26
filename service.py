import os
import sys

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
JARVIS_DIR = os.path.join(BASE_DIR, "Jarvis")
if os.path.exists(os.path.join(JARVIS_DIR, "service.py")):
    service_path = os.path.join(JARVIS_DIR, "service.py")
else:
    service_path = os.path.join(BASE_DIR, "service.py")

with open(service_path, "rb") as f:
    code = compile(f.read(), service_path, "exec")
    globs = {
        "__file__": service_path,
        "__name__": "__main__",
        "__package__": None,
    }
    exec(code, globs)
