"""Small, dependency-free Paperclip REST client.

The client accepts only an explicit HTTP(S) endpoint, rejects URL credentials,
and defaults to loopback-only operation. It never reads Paperclip's datastore.
"""
from __future__ import annotations

import json
from collections import Counter
from ipaddress import ip_address
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlparse
from urllib.request import Request, urlopen


class PaperclipAPIError(RuntimeError):
    def __init__(self, message: str, *, status: int | None = None):
        super().__init__(message)
        self.status = status


def _is_loopback(hostname: str | None) -> bool:
    if not hostname:
        return False
    if hostname.lower() == "localhost":
        return True
    try:
        return ip_address(hostname).is_loopback
    except ValueError:
        return False


def _items(payload: Any, *keys: str) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [x for x in payload if isinstance(x, dict)]
    if isinstance(payload, dict):
        for key in keys:
            value = payload.get(key)
            if isinstance(value, list):
                return [x for x in value if isinstance(x, dict)]
    return []


class PaperclipClient:
    def __init__(
        self,
        base_url: str = "http://127.0.0.1:3102",
        company_id: str = "",
        timeout_seconds: int = 10,
        allow_remote: bool = False,
    ) -> None:
        parsed = urlparse(str(base_url).strip())
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise ValueError("base_url must be an absolute http(s) URL")
        if parsed.username or parsed.password or parsed.fragment or parsed.query:
            raise ValueError("base_url must not contain credentials, query parameters, or a fragment")
        if not allow_remote and not _is_loopback(parsed.hostname):
            raise ValueError("non-loopback Paperclip endpoints require allow_remote=true")
        self.base_url = str(base_url).rstrip("/")
        self.configured_company_id = str(company_id or "").strip()
        self.timeout_seconds = max(1, min(int(timeout_seconds), 60))

    def request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> Any:
        if not path.startswith("/"):
            raise ValueError("API path must start with /")
        query = ""
        if params:
            clean = {k: v for k, v in params.items() if v is not None and v != ""}
            if clean:
                query = "?" + urlencode(clean, doseq=True)
        data = None if json_body is None else json.dumps(json_body).encode("utf-8")
        headers = {"Accept": "application/json"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        req = Request(self.base_url + path + query, data=data, headers=headers, method=method.upper())
        try:
            with urlopen(req, timeout=self.timeout_seconds) as response:
                raw = response.read()
        except HTTPError as exc:
            raw = exc.read(2048).decode("utf-8", errors="replace")
            raise PaperclipAPIError(f"Paperclip HTTP {exc.code}: {raw[:500]}", status=exc.code) from exc
        except (URLError, TimeoutError, OSError) as exc:
            raise PaperclipAPIError(f"Paperclip connection failed: {exc}") from exc
        if not raw:
            return {}
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise PaperclipAPIError("Paperclip returned a non-JSON response") from exc

    def health(self) -> dict[str, Any]:
        value = self.request("GET", "/api/health")
        return value if isinstance(value, dict) else {"response": value}

    def companies(self) -> list[dict[str, Any]]:
        return _items(self.request("GET", "/api/companies"), "companies", "items", "data")

    def company_id(self) -> str:
        if self.configured_company_id:
            return self.configured_company_id
        companies = self.companies()
        if len(companies) != 1:
            raise PaperclipAPIError(
                f"company_id is required when Paperclip exposes {len(companies)} companies"
            )
        ident = companies[0].get("id")
        if not isinstance(ident, str) or not ident:
            raise PaperclipAPIError("Paperclip company record has no id")
        return ident

    def dashboard(self) -> dict[str, Any]:
        value = self.request("GET", f"/api/companies/{quote(self.company_id())}/dashboard")
        return value if isinstance(value, dict) else {"response": value}

    def list_issues(self, *, status: str = "", limit: int = 50) -> list[dict[str, Any]]:
        cid = quote(self.company_id())
        issues = _items(self.request("GET", f"/api/companies/{cid}/issues"), "issues", "items", "data")
        if status:
            issues = [issue for issue in issues if issue.get("status") == status]
        issues.sort(key=lambda x: str(x.get("updatedAt") or x.get("createdAt") or ""), reverse=True)
        return issues[: max(1, min(int(limit), 200))]

    def get_issue(self, issue_id: str) -> dict[str, Any]:
        value = self.request("GET", f"/api/issues/{quote(issue_id)}")
        return value if isinstance(value, dict) else {"response": value}

    def issue_comments(self, issue_id: str) -> list[dict[str, Any]]:
        value = self.request("GET", f"/api/issues/{quote(issue_id)}/comments")
        return _items(value, "comments", "items", "data")

    def create_issue(self, payload: dict[str, Any]) -> dict[str, Any]:
        value = self.request(
            "POST", f"/api/companies/{quote(self.company_id())}/issues", json_body=payload
        )
        return value if isinstance(value, dict) else {"response": value}

    def update_issue(self, issue_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        value = self.request("PATCH", f"/api/issues/{quote(issue_id)}", json_body=payload)
        return value if isinstance(value, dict) else {"response": value}

    def add_comment(self, issue_id: str, body: str) -> dict[str, Any]:
        value = self.request(
            "POST", f"/api/issues/{quote(issue_id)}/comments", json_body={"body": body}
        )
        return value if isinstance(value, dict) else {"response": value}

    def agents(self) -> list[dict[str, Any]]:
        cid = quote(self.company_id())
        return _items(self.request("GET", f"/api/companies/{cid}/agents"), "agents", "items", "data")

    def live_runs(self) -> list[dict[str, Any]]:
        cid = quote(self.company_id())
        return _items(self.request("GET", f"/api/companies/{cid}/live-runs"), "runs", "items", "data")

    def overview(self) -> dict[str, Any]:
        health = self.health()
        companies = self.companies()
        cid = self.company_id()
        issues = self.list_issues(limit=200)
        agents = self.agents()
        runs = self.live_runs()
        counts = Counter(str(issue.get("status") or "unknown") for issue in issues)
        assigned = sum(bool(issue.get("assigneeAgentId") or issue.get("assigneeUserId")) for issue in issues)
        return {
            "connected": True,
            "health": health,
            "company_id": cid,
            "company": next((x for x in companies if x.get("id") == cid), None),
            "issue_total": len(issues),
            "issue_counts": dict(sorted(counts.items())),
            "assigned_issue_count": assigned,
            "agent_count": len(agents),
            "live_run_count": len(runs),
            "recent_issues": issues[:10],
            "agents": agents,
            "live_runs": runs,
        }
