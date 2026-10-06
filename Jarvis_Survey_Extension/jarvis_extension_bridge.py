"""
Jarvis Browser Extension Local Bridge Server
Listens on http://127.0.0.1:8765 to connect Chrome Extension directly to Jarvis Desktop AI.
"""

import json
import logging
from http.server import HTTPServer, BaseHTTPRequestHandler

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("JarvisSurveyBridge")

PORT = 8765

import queue
import time

_bridge_commands = queue.Queue()

class JarvisBridgeHandler(BaseHTTPRequestHandler):
    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    def do_GET(self):
        if self.path == "/status" or self.path == "/":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.end_headers()
            resp = {
                "status": "online",
                "service": "Jarvis Desktop Survey Bridge",
                "version": "2.0",
                "persona": "Alamin Miah (Age 50, IT Software Manager)"
            }
            self.wfile.write(json.dumps(resp).encode("utf-8"))
            return

        if self.path == "/pending_command":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.end_headers()
            try:
                cmd = _bridge_commands.get_nowait()
                self.wfile.write(json.dumps({"has_command": True, "command": cmd}).encode("utf-8"))
            except queue.Empty:
                self.wfile.write(json.dumps({"has_command": False}).encode("utf-8"))
            return

        if self.path in ("/get_config", "/api/config"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.end_headers()
            try:
                import os
                config_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "user_config.json")
                if os.path.exists(config_path):
                    with open(config_path, "r", encoding="utf-8") as f:
                        cfg = json.load(f)
                    api_keys = cfg.get("api_keys", {})
                    resp = {
                        "success": True,
                        "geminiApiKey": api_keys.get("google", ""),
                        "geminiApiKey2": api_keys.get("google_backup_1", ""),
                        "geminiApiKey3": api_keys.get("google_backup_2", ""),
                        "openRouterApiKey": api_keys.get("openrouter", ""),
                        "openRouterApiKey2": api_keys.get("openrouter_backup_1", ""),
                        "openRouterApiKey3": api_keys.get("openrouter_backup_2", ""),
                        "torveAiApiKey": api_keys.get("torveai", api_keys.get("torve", "")),
                        "torveAiApiKey2": api_keys.get("torveai_backup_1", ""),
                        "torveAiApiKey3": api_keys.get("torveai_backup_2", ""),
                        "geminiAcc1Email": api_keys.get("gemini_web_plus_account", "plus.alamin@gmail.com"),
                        "geminiAcc2Email": api_keys.get("gemini_web_pro_account", "pro.alamin@gmail.com"),
                        "geminiAcc3Email": api_keys.get("gemini_web_ultra_account", "alaminmiah1976@gmail.com")
                    }
                else:
                    resp = {"success": False, "error": "user_config.json not found"}
            except Exception as ce:
                resp = {"success": False, "error": str(ce)}
            self.wfile.write(json.dumps(resp).encode("utf-8"))
            return

        if self.path in ("/api/gemini_session", "/gemini_session"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.end_headers()
            try:
                import os
                session_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "gemini_session.json")
                if os.path.exists(session_path):
                    with open(session_path, "r", encoding="utf-8") as f:
                        session_data = json.load(f)
                    self.wfile.write(json.dumps(session_data).encode("utf-8"))
                else:
                    self.wfile.write(json.dumps({"success": False, "error": "No saved session"}).encode("utf-8"))
            except Exception as se:
                self.wfile.write(json.dumps({"success": False, "error": str(se)}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()


    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)
        try:
            data = json.loads(post_data.decode("utf-8")) if post_data else {}
        except Exception:
            data = {}

        if self.path == "/analyze":
            try:
                logger.info(f"Received survey analysis request from browser: {data.get('title', 'Unknown Page')}")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self._send_cors_headers()
                self.end_headers()
                resp = {
                    "success": True,
                    "message": "Survey synced with Jarvis Desktop",
                    "timestamp": data.get("timestamp", time.time())
                }
                self.wfile.write(json.dumps(resp).encode("utf-8"))
            except Exception as e:
                logger.error(f"Error handling analyze POST: {e}")
                self.send_response(500)
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        if self.path in ("/notify_api_limit", "/api/notify_limit", "/push_alert"):
            api_name = data.get("api_name", "Unknown API")
            alert_id = f"alert_{int(time.time() * 1000)}"
            cmd_data = {
                "id": alert_id,
                "command": "API_LIMIT_WARNING",
                "payload": data,
                "timestamp": time.time()
            }
            _bridge_commands.put(cmd_data)
            logger.warning(f"[Bridge] API limit alert queued for extension: {api_name} - {data.get('warning_message')}")
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "alert_id": alert_id, "queued": True}).encode("utf-8"))
            return

        if self.path == "/command_result":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.end_headers()
            self.wfile.write(json.dumps({"status": "acknowledged"}).encode("utf-8"))
        if self.path in ("/api/gemini_session", "/gemini_session"):
            try:
                import os
                session_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "gemini_session.json")
                with open(session_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"success": True, "message": "Session saved to disk"}).encode("utf-8"))
            except Exception as e:
                self.send_response(500)
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()


    def log_message(self, format, *args):
        # Suppress noisy default logging
        logger.info(format % args)

def run():
    server_address = ("127.0.0.1", PORT)
    httpd = HTTPServer(server_address, JarvisBridgeHandler)
    logger.info(f"Jarvis Survey Extension Bridge running on http://127.0.0.1:{PORT}")
    logger.info("Ready to communicate with Chrome/Edge Extension.")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        logger.info("Bridge server stopping...")
        httpd.server_close()

if __name__ == "__main__":
    run()
