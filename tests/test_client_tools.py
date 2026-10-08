from __future__ import annotations

import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from euphoria_paperclip.client import PaperclipClient
from euphoria_paperclip import tools

COMPANY = "11111111-1111-1111-1111-111111111111"
ISSUE = "22222222-2222-2222-2222-222222222222"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        return

    def _json(self, status, payload):
        raw = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _body(self):
        size = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(size) or b"{}")

    def do_GET(self):
        routes = {
            "/api/health": {"ok": True, "version": "test"},
            "/api/companies": [{"id": COMPANY, "name": "Euphoria"}],
            f"/api/companies/{COMPANY}/issues": [{"id": ISSUE, "identifier": "EUP-1", "title": "Test", "status": "todo", "priority": "high"}],
            f"/api/issues/{ISSUE}": {"id": ISSUE, "identifier": "EUP-1", "status": "todo"},
            f"/api/issues/{ISSUE}/comments": [{"id": "c1", "body": "hello"}],
            f"/api/companies/{COMPANY}/agents": [{"id": "a1", "status": "paused"}],
            f"/api/companies/{COMPANY}/live-runs": [],
            f"/api/companies/{COMPANY}/dashboard": {"ok": True},
        }
        self._json(200, routes.get(self.path, {"path": self.path}))

    def do_POST(self):
        body = self._body()
        if self.path.endswith("/issues"):
            self._json(201, {"id": ISSUE, **body})
        elif self.path.endswith("/comments"):
            self._json(201, {"id": "c2", **body})
        else:
            self._json(404, {"error": "missing"})

    def do_PATCH(self):
        self._json(200, {"id": ISSUE, **self._body()})


class PluginTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.client = PaperclipClient(f"http://127.0.0.1:{cls.server.server_port}")

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown(); cls.server.server_close(); cls.thread.join(timeout=2)

    def test_rejects_remote_by_default(self):
        with self.assertRaises(ValueError):
            PaperclipClient("https://example.com")

    def test_overview_distinguishes_config_from_activity(self):
        data = self.client.overview()
        self.assertEqual(data["issue_total"], 1)
        self.assertEqual(data["agent_count"], 1)
        self.assertEqual(data["live_run_count"], 0)
        self.assertEqual(data["assigned_issue_count"], 0)

    def test_get_issue_and_comments(self):
        result = json.loads(tools.issues(self.client, False, {"action": "get", "issue_id": ISSUE}))
        self.assertTrue(result["ok"])
        self.assertEqual(result["comments"][0]["body"], "hello")

    def test_write_requires_both_setting_and_confirmation(self):
        denied = json.loads(tools.issues(self.client, False, {"action": "comment", "issue_id": ISSUE, "comment": "x", "confirm": True}))
        self.assertFalse(denied["ok"])
        denied2 = json.loads(tools.issues(self.client, True, {"action": "comment", "issue_id": ISSUE, "comment": "x"}))
        self.assertFalse(denied2["ok"])
        allowed = json.loads(tools.issues(self.client, True, {"action": "comment", "issue_id": ISSUE, "comment": "x", "confirm": True}))
        self.assertTrue(allowed["ok"])

    def test_update_is_allowlisted(self):
        result = json.loads(tools.issues(self.client, True, {"action": "update", "issue_id": ISSUE, "status": "done", "confirm": True, "dangerous": "ignored"}))
        self.assertTrue(result["ok"])
        self.assertEqual(result["issue"]["status"], "done")
        self.assertNotIn("dangerous", result["issue"])


if __name__ == "__main__":
    unittest.main()
