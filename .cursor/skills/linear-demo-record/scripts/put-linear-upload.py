#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PUT a local file to Linear's signed upload URL.

Reads the JSON returned by prepare_attachment_upload, sends the file bytes
with every signed header verbatim, and prints the assetUrl on success.

Usage:
  python3 put-linear-upload.py <file> <prepare.json>
"""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


def _unwrap(payload: Any) -> dict:
    if not isinstance(payload, dict):
        raise ValueError("prepare JSON must be an object")
    if isinstance(payload.get("uploadRequest"), dict):
        return payload
    for key in ("result", "data", "content"):
        inner = payload.get(key)
        if isinstance(inner, dict) and (
            "uploadRequest" in inner or "url" in inner
        ):
            return _unwrap(inner)
        if isinstance(inner, list):
            for item in inner:
                if isinstance(item, dict):
                    try:
                        return _unwrap(item)
                    except ValueError:
                        continue
                if isinstance(item, str):
                    try:
                        parsed = json.loads(item)
                    except json.JSONDecodeError:
                        continue
                    if isinstance(parsed, dict):
                        return _unwrap(parsed)
    if "url" in payload and "headers" in payload:
        return {"uploadRequest": payload, "assetUrl": payload.get("assetUrl")}
    raise ValueError(
        "Could not find uploadRequest in prepare JSON. "
        "Save the prepare_attachment_upload tool result to the json file."
    )


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: put-linear-upload.py <file> <prepare.json>", file=sys.stderr)
        return 2

    file_path = Path(sys.argv[1])
    json_path = Path(sys.argv[2])

    if not file_path.is_file():
        print(f"File not found: {file_path}", file=sys.stderr)
        return 2

    payload = _unwrap(json.loads(json_path.read_text()))
    request = payload["uploadRequest"]
    url = request.get("url")
    headers = dict(request.get("headers") or {})
    if not url:
        print("uploadRequest.url missing", file=sys.stderr)
        return 2
    if not headers:
        print(
            "uploadRequest.headers missing; Linear's signed PUT will 403 without them",
            file=sys.stderr,
        )
        return 2

    data = file_path.read_bytes()
    req = urllib.request.Request(url, data=data, method="PUT", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            status = getattr(resp, "status", 200)
            print(f"PUT {status}")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        print(f"PUT {exc.code}: {body[:500]}", file=sys.stderr)
        return 1

    asset_url = payload.get("assetUrl") or ""
    if asset_url:
        print(f"assetUrl {asset_url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
