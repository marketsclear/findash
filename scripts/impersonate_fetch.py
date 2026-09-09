#!/usr/bin/env python3
"""
Perform HTTP requests with a Chrome TLS/HTTP2 fingerprint (curl_cffi), sharing cookies across the
sequence. Used for issuers behind Akamai bot management, which refuse Node's and curl's handshakes.

stdin:  {"impersonate": "chrome", "requests": [{"url": ..., "method": "GET", "headers": {...}, "json": {...}}]}
stdout: [{"status": 200, "headers": {...}, "text": "..."}]
A request may contain "headers" values of the form {"$json": "<index>.<path>"} to inject a value
parsed from an earlier JSON response (e.g. a CSRF token).
"""
import json
import sys

from curl_cffi import requests

spec = json.load(sys.stdin)
session = requests.Session(impersonate=spec.get("impersonate", "chrome"))
results = []


def resolve(value):
    if isinstance(value, dict) and "$json" in value:
        idx, _, path = value["$json"].partition(".")
        data = json.loads(results[int(idx)]["text"])
        for key in path.split("."):
            data = data[key]
        return str(data)
    return value


for req in spec["requests"]:
    headers = {k: resolve(v) for k, v in (req.get("headers") or {}).items()}
    kwargs = {"headers": headers, "timeout": req.get("timeout", 60)}
    if "json" in req:
        kwargs["json"] = req["json"]
    response = session.request(req.get("method", "GET"), req["url"], **kwargs)
    results.append({"status": response.status_code, "headers": dict(response.headers), "text": response.text})

json.dump(results, sys.stdout)
