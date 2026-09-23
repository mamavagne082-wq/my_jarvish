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
                "version": "1.0",
                "persona": "Alamin Miah (Age 50, IT Software Manager)"
            }
            self.wfile.write(json.dumps(resp).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/analyze":
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length)
            try:
                data = json.loads(post_data.decode("utf-8"))
                logger.info(f"Received survey analysis request from browser: {data.get('title', 'Unknown Page')}")
                
                # Echo back success confirmation
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self._send_cors_headers()
                self.end_headers()
                
                resp = {
                    "success": True,
                    "message": "Survey synced with Jarvis Desktop",
                    "timestamp": data.get("timestamp")
                }
                self.wfile.write(json.dumps(resp).encode("utf-8"))
            except Exception as e:
                logger.error(f"Error handling analyze POST: {e}")
                self.send_response(500)
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
        else:
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
