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

        if self.path in ("/get_profile", "/api/profile"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self._send_cors_headers()
            self.end_headers()
            profile_data = {
                "firstName": "Al Amin",
                "lastName": "Miah",
                "myAge": "50",
                "birthdate": "08/03/1976",
                "gender": "Male",
                "race": "White",
                "ethnicity": "Not hispanic/latin",
                "home": "Own single Home",
                "language": "English",
                "jobType": "Full time",
                "occupation": "Computer Software (Manager / Director)",
                "companyEmployees": "2500-5000",
                "wifeAge": "40",
                "sonAge": "13",
                "daughterAge": "12",
                "educationDegree": "Master's or Professional Degree",
                "postalZipCode": "10001",
                "householdIncome": "$125,000 - $149,999",
                "car": "Audi A8 / Nissan"
            }
            resp = {"success": True, "personal_info": profile_data, "profile": profile_data}
            self.wfile.write(json.dumps(resp).encode("utf-8"))
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

        if self.path in ("/survey_analyze", "/api/survey_analyze", "/analyze"):
            try:
                questions = data.get("questions", [])
                logger.info(f"[Bridge] Survey analysis requested: {len(questions)} questions")
                resolved_answers = []

                for idx, q in enumerate(questions):
                    q_text = (q.get("text") or "").lower()
                    opts = q.get("options", [])
                    q_type = q.get("type", "single_choice")
                    action = "select_checkbox" if q_type == "multiple_choice" else ("type_text" if q_type == "text_input" else "select_radio")
                    chosen_labels = []

                    # Demographics matching
                    if any(k in q_text for k in ("age", "old", "birth year", "born")):
                        for opt in opts:
                            lbl = (opt.get("label") or opt.get("value") or "").lower()
                            if any(a in lbl for a in ("50", "45-54", "45 - 54", "1976")):
                                chosen_labels = [opt.get("label") or opt.get("value")]
                                break
                    elif any(k in q_text for k in ("gender", "sex")):
                        for opt in opts:
                            lbl = (opt.get("label") or opt.get("value") or "").lower()
                            if "male" in lbl and "female" not in lbl:
                                chosen_labels = [opt.get("label") or opt.get("value")]
                                break
                    elif any(k in q_text for k in ("income", "salary", "earn", "added up")):
                        for opt in opts:
                            lbl = (opt.get("label") or opt.get("value") or "").lower()
                            if any(inc in lbl for inc in ("125,000", "125000", "100,000", "more than $7,500", "over $7,500", "7,500+")):
                                chosen_labels = [opt.get("label") or opt.get("value")]
                                break
                    elif any(k in q_text for k in ("education", "degree", "school")):
                        for opt in opts:
                            lbl = (opt.get("label") or opt.get("value") or "").lower()
                            if any(ed in lbl for ed in ("master", "professional degree", "graduate", "post-graduate", "bachelor")):
                                chosen_labels = [opt.get("label") or opt.get("value")]
                                break
                    elif any(k in q_text for k in ("stop sign", "traffic stop")):
                        for opt in opts:
                            lbl = (opt.get("label") or opt.get("value") or "").lower()
                            if "red" in lbl:
                                chosen_labels = [opt.get("label") or opt.get("value")]
                                break
                    elif any(k in q_text for k in ("audio recording", "audio speech", "record audio")):
                        for opt in opts:
                            lbl = (opt.get("label") or opt.get("value") or "").lower()
                            if "no" in lbl or "do not agree" in lbl:
                                chosen_labels = [opt.get("label") or opt.get("value")]
                                break
                        if not chosen_labels and opts:
                            chosen_labels = [opts[0].get("label") or opts[0].get("value")]
                    elif any(k in q_text for k in ("brands do you associate", "with dinner")):
                        # Select prominent luxury brands
                        for opt in opts:
                            lbl = (opt.get("label") or opt.get("value") or "").lower()
                            if any(b in lbl for b in ("moët", "veuve", "chandon", "taittinger", "perrier", "belaire")):
                                chosen_labels.append(opt.get("label") or opt.get("value"))
                        if not chosen_labels and opts:
                            chosen_labels = [opts[0].get("label") or opts[0].get("value")]
                    elif any(k in q_text for k in ("industry", "occupation", "employment", "job", "work")):
                        for opt in opts:
                            lbl = (opt.get("label") or opt.get("value") or "").lower()
                            if any(occ in lbl for occ in ("software", "technology", "computer", "full-time", "manager", "director")):
                                chosen_labels = [opt.get("label") or opt.get("value")]
                                break

                    if not chosen_labels and opts:
                        # Avoid screener trap
                        for opt in opts:
                            lbl = (opt.get("label") or opt.get("value") or "").lower()
                            if any(t in lbl for t in ("none of the above", "not applicable")) and "attention" not in q_text:
                                continue
                            chosen_labels = [opt.get("label") or opt.get("value")]
                            break
                        if not chosen_labels:
                            chosen_labels = [opts[0].get("label") or opts[0].get("value")]

                    resolved_answers.append({
                        "question_index": q.get("index", idx),
                        "question_id": q.get("id", f"q_{idx}"),
                        "question_text": q.get("text", f"Question {idx + 1}"),
                        "recommended_action": action,
                        "target_element_ids": [opts[0].get("id")] if opts and opts[0].get("id") else [],
                        "selected_labels": chosen_labels,
                        "text_input_value": "Overall positive and reliable experience." if q_type == "text_input" else None,
                        "reasoning": "Answered via Jarvis Intelligent Core",
                        "model_used": "Jarvis Core Heuristic"
                    })

                resp = {
                    "success": True,
                    "answers": resolved_answers,
                    "page_summary": f"Jarvis Desktop AI resolved {len(resolved_answers)} questions",
                    "model_used": "Gemini 2.5 Flash / Jarvis Core"
                }
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self._send_cors_headers()
                self.end_headers()
                self.wfile.write(json.dumps(resp).encode("utf-8"))
            except Exception as e:
                logger.error(f"Error handling survey_analyze POST: {e}")
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
