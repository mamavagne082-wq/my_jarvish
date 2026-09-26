"""
Jarvis Window Manager - Foreground Elevation & Auto-Minimize Controller
Handles:
1. Piercing Windows Foreground Lock Timeout (SPI_SETFOREGROUNDLOCKTIMEOUT) to force Jarvis UI to the absolute front on "Hey Jarvis".
2. Auto-minimizing Jarvis UI back to the background after 20-30 seconds of inactivity/silence.
3. Detecting Jarvis browser windows (Chrome/Edge app mode or tab).
4. Audio activation chimes.
"""

import os
import sys
import time
import logging
import threading
import subprocess
from typing import List, Optional

logger = logging.getLogger("jarvis_window_manager")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO, format="[WindowManager] %(asctime)s: %(message)s")

# Windows API constants
SW_HIDE = 0
SW_NORMAL = 1
SW_SHOWMINIMIZED = 2
SW_MAXIMIZE = 3
SW_SHOWNOACTIVATE = 4
SW_SHOW = 5
SW_MINIMIZE = 6
SW_SHOWMINNOACTIVE = 7
SW_SHOWNA = 8
SW_RESTORE = 9
SW_SHOWDEFAULT = 10

HWND_TOPMOST = -1
HWND_NOTOPMOST = -2
HWND_TOP = 0

SWP_NOSIZE = 0x0001
SWP_NOMOVE = 0x0002
SWP_NOZORDER = 0x0004
SWP_SHOWWINDOW = 0x0040

VK_MENU = 0x12
KEYEVENTF_KEYUP = 0x0002

JARVIS_DEFAULT_URL = "https://localhost:3000?auto=true"

WAKE_PHRASES = [
    "hey jarvis", "ok jarvis", "okay jarvis", "hi jarvis", "hello jarvis", "jarvis",
    "hey jarvish", "jarvish", "aye jarvis", "yo jarvis",
    "হে জারভিস", "ও জারভিস", "হ্যালো জারভিস", "জারভিস",
    "হে জার্ভিস", "ও জার্ভিস", "হ্যালো জার্ভিস", "জার্ভিস",
    "শুনতে পাচ্ছো", "শুনতে পাচ্ছ", "তুমি কি আমাকে শুনতে পাচ্ছো", "তুমি কি শুনতে পাচ্ছো",
    "হে জার্ভিস তুমি কি আমাকে শুনতে পাচ্ছো", "হে জার্ভিস শুনতে পাচ্ছো",
    "হে জারভিস তুমি কি আমাকে শুনতে পাচ্ছো", "হে জারভিস শুনতে পাচ্ছো",
    "can you hear me", "hey jarvis can you hear me", "are you listening",
    "listen to me", "কথা শোনো", "শোনো"
]


class JarvisWindowManager:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(JarvisWindowManager, cls).__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, idle_timeout: float = 25.0):
        if self._initialized:
            return
        self._initialized = True
        self.idle_timeout = idle_timeout  # Default 25s (within 20-30s range)
        self.last_activity_time = time.time()
        self.is_foreground = False
        self._lock = threading.Lock()
        self._watcher_thread: Optional[threading.Thread] = None
        self._stop_watcher = threading.Event()
        self._last_front_elevation_time = 0.0

    @staticmethod
    def _send_ipc(cmd: str):
        try:
            import socket
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(0.15)
                s.connect(("127.0.0.1", 47395))
                s.sendall(f"{cmd}\n".encode("utf-8"))
        except Exception:
            pass

    def record_activity(self):
        """Call this whenever user speaks, Jarvis speaks, or any interaction occurs."""
        with self._lock:
            self.last_activity_time = time.time()
        self._send_ipc("ACTIVITY")

    def get_last_activity_time(self) -> float:
        with self._lock:
            return self.last_activity_time

    def is_ui_foreground(self) -> bool:
        with self._lock:
            return self.is_foreground

    def set_ui_foreground(self, state: bool):
        with self._lock:
            self.is_foreground = state
            if state:
                self.last_activity_time = time.time()
        if state:
            self._send_ipc("SHOW")
        else:
            self._send_ipc("MINIMIZE")

    @staticmethod
    def is_wake_word(text: str) -> bool:
        if not text:
            return False
        t = text.lower().strip()
        if any(k in t for k in ("jarvis", "jarvish", "জারভিস", "জার্ভিস")):
            return True
        for phrase in WAKE_PHRASES:
            if phrase in t:
                return True
        return False

    @staticmethod
    def play_activation_sound():
        def _beep():
            try:
                import winsound
                winsound.Beep(1200, 80)
                time.sleep(0.04)
                winsound.Beep(1600, 110)
            except Exception:
                pass
        threading.Thread(target=_beep, daemon=True).start()

    @staticmethod
    def get_browser_command() -> Optional[str]:
        candidates = [
            os.path.expandvars(r"%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"),
            os.path.expandvars(r"%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"),
            os.path.expandvars(r"%ProgramFiles%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%LocalAppData%\Google\Chrome\Application\chrome.exe"),
            os.path.expandvars(r"%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe"),
            os.path.expandvars(r"%LocalAppData%\BraveSoftware\Brave-Browser\Application\brave.exe"),
        ]
        for p in candidates:
            if os.path.isfile(p):
                return p
        return None

    def launch_browser_ui(self, url: str = JARVIS_DEFAULT_URL, minimized: bool = False):
        """Launches the Jarvis UI in app mode."""
        bpath = self.get_browser_command()
        cmd = []
        if bpath:
            cmd = [
                bpath,
                f"--app={url}",
                "--autoplay-policy=no-user-gesture-required",
                "--ignore-certificate-errors",
                "--disable-features=Translate",
                "--window-size=1200,800"
            ]
        else:
            import webbrowser
            webbrowser.open(url)
            return

        try:
            startupinfo = None
            if minimized and sys.platform == "win32":
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                startupinfo.wShowWindow = SW_SHOWMINNOACTIVE
            subprocess.Popen(cmd, startupinfo=startupinfo)
            logger.info(f"Launched Jarvis UI browser process (minimized={minimized})")
        except Exception as e:
            logger.error(f"Failed to launch browser: {e}")

    def find_jarvis_windows(self) -> List[int]:
        """Finds all top-level window handles (HWNDs) corresponding to the Jarvis UI."""
        if sys.platform != "win32":
            return []

        try:
            import win32gui
            import win32process
            import psutil
        except ImportError:
            return []

        hwnds = []

        def _enum_callback(hwnd, extra):
            try:
                if not win32gui.IsWindow(hwnd):
                    return True
                title = win32gui.GetWindowText(hwnd).strip().lower()
                cls_name = win32gui.GetClassName(hwnd)

                if not title and cls_name != "Chrome_WidgetWin_1":
                    return True

                # Exclude developer tools, editors, terminals
                ignored_patterns = [
                    "visual studio", "vs code", "antigravity", "cursor",
                    "powershell", "cmd.exe", "bash", "terminal", "pyinstaller"
                ]
                if any(p in title for p in ignored_patterns):
                    return True

                # Match criteria:
                # 1. Title contains 'jarvis' or 'localhost:3000' or '127.0.0.1:3000'
                # 2. Window class is 'Chrome_WidgetWin_1' or process is a browser
                is_match = False
                if "jarvis" in title or "localhost:3000" in title or "127.0.0.1:3000" in title:
                    is_match = True
                elif cls_name == "Chrome_WidgetWin_1" and ("jarvis" in title or "3000" in title):
                    is_match = True

                if is_match:
                    try:
                        _, pid = win32process.GetWindowThreadProcessId(hwnd)
                        pname = psutil.Process(pid).name().lower()
                        if any(b in pname for b in ("msedge", "chrome", "brave", "firefox", "browser", "electron")):
                            extra.append(hwnd)
                        elif "jarvis" in title:
                            extra.append(hwnd)
                    except Exception:
                        extra.append(hwnd)
            except Exception:
                pass
            return True

        try:
            win32gui.EnumWindows(_enum_callback, hwnds)
        except Exception as e:
            logger.debug(f"EnumWindows notice: {e}")
        return hwnds

    def force_bring_to_front(self, play_sound: bool = True) -> bool:
        """
        Pierces Windows 10/11 foreground restrictions and elevates the Jarvis UI to the absolute front.
        """
        now = time.time()
        # Cooldown protection: don't rapidly re-elevate within 0.8s
        if now - self._last_front_elevation_time < 0.8:
            self.record_activity()
            return True

        self._last_front_elevation_time = now
        self.set_ui_foreground(True)

        if play_sound:
            self.play_activation_sound()

        if sys.platform != "win32":
            return False

        hwnds = self.find_jarvis_windows()
        if not hwnds:
            logger.info("No Jarvis UI window found; launching browser...")
            self.launch_browser_ui(minimized=False)
            # Give browser a second to render window
            time.sleep(1.2)
            hwnds = self.find_jarvis_windows()

        if not hwnds:
            logger.warning("Could not find or launch Jarvis UI window.")
            return False

        target_hwnd = hwnds[0]

        try:
            import ctypes
            user32 = ctypes.windll.user32
            kernel32 = ctypes.windll.kernel32

            # 1. Restore if minimized
            if user32.IsIconic(target_hwnd):
                user32.ShowWindow(target_hwnd, SW_RESTORE)
            else:
                user32.ShowWindow(target_hwnd, SW_SHOW)

            # 2. Attach thread input of current foreground window to our thread
            fore_hwnd = user32.GetForegroundWindow()
            curr_thread = kernel32.GetCurrentThreadId()
            fore_thread = user32.GetWindowThreadProcessId(fore_hwnd, None) if fore_hwnd else 0
            target_thread = user32.GetWindowThreadProcessId(target_hwnd, None)

            attached_fore = False
            attached_target = False
            if fore_thread and fore_thread != curr_thread:
                user32.AttachThreadInput(fore_thread, curr_thread, True)
                attached_fore = True
            if target_thread and target_thread != curr_thread:
                user32.AttachThreadInput(target_thread, curr_thread, True)
                attached_target = True

            # 3. Simulate an ALT key press/release to bypass Windows focus prevention
            user32.keybd_event(VK_MENU, 0, 0, 0)
            user32.keybd_event(VK_MENU, 0, KEYEVENTF_KEYUP, 0)

            # 4. Bring window to top, elevate to TOPMOST momentarily then drop back to NOTOPMOST
            user32.SetWindowPos(target_hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW)
            user32.BringWindowToTop(target_hwnd)
            user32.SetForegroundWindow(target_hwnd)
            user32.SetWindowPos(target_hwnd, HWND_NOTOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW)
            user32.SwitchToThisWindow(target_hwnd, True)

            # 5. Clean up attached threads
            if attached_fore:
                user32.AttachThreadInput(fore_thread, curr_thread, False)
            if attached_target:
                user32.AttachThreadInput(target_thread, curr_thread, False)

            logger.info(f"Jarvis UI (HWND: {target_hwnd}) successfully brought to front!")
            return True
        except Exception as e:
            logger.error(f"Error bringing Jarvis UI to front: {e}")
            return False

    def minimize_to_background(self) -> bool:
        """Minimizes the Jarvis UI window silently back to the background."""
        if sys.platform != "win32":
            return False

        try:
            import ctypes
            user32 = ctypes.windll.user32
            hwnds = self.find_jarvis_windows()
            minimized_count = 0
            for h in hwnds:
                if not user32.IsIconic(h):
                    user32.ShowWindow(h, SW_MINIMIZE)
                    minimized_count += 1

            self.set_ui_foreground(False)
            if minimized_count > 0:
                logger.info(f"Auto-minimized {minimized_count} Jarvis window(s) back to background (idle).")
            return True
        except Exception as e:
            logger.error(f"Error minimizing Jarvis UI: {e}")
            return False

    def start_idle_watcher(self, timeout_seconds: Optional[float] = None):
        """
        Starts a background daemon thread that monitors inactivity.
        If UI is foreground and no activity occurs for timeout_seconds (20-30s), minimizes UI.
        """
        if timeout_seconds is not None:
            self.idle_timeout = timeout_seconds

        if self._watcher_thread and self._watcher_thread.is_alive():
            return

        self._stop_watcher.clear()

        def _watcher_loop():
            logger.info(f"Idle watcher started (timeout: {self.idle_timeout}s).")
            while not self._stop_watcher.is_set():
                time.sleep(1.0)
                if self.is_ui_foreground():
                    elapsed = time.time() - self.get_last_activity_time()
                    if elapsed >= self.idle_timeout:
                        logger.info(f"Jarvis idle for {elapsed:.1f}s (>= {self.idle_timeout}s) -> Minimizing UI")
                        self.minimize_to_background()

        self._watcher_thread = threading.Thread(target=_watcher_loop, daemon=True, name="JarvisIdleWatcher")
        self._watcher_thread.start()

    def stop_idle_watcher(self):
        self._stop_watcher.set()


# Global Singleton instance
window_manager = JarvisWindowManager()
