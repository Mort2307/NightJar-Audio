#!/usr/bin/env python3
"""One-time, least-privilege Nightjar audio CORS setup for Google Cloud Shell.

Run with a project owner / permitted Google Cloud account, NOT the GitHub
deployment service account. Requires Python 3 and an authenticated gcloud CLI.

Updates only the cors property on exactly one known Nightjar bucket after
explicit confirmation. Preserves all previous CORS rules, uses an optimistic
concurrency precondition, and verifies the updated metadata with a fresh GET.
Does NOT change Storage object IAM/ACL, Firebase Storage rules or signed URLs.
"""
import json
import subprocess
import sys
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen

PROJECT = "nightjar-audio"
BUCKET = "nightjar-audio.firebasestorage.app"
ORIGINS = ("https://nightjar-audio.web.app", "https://nightjar-audio.firebaseapp.com")
HEADERS = ("Content-Type", "Content-Length", "Content-Range", "Accept-Ranges")
RULE = {
    "origin": list(ORIGINS),
    "method": ["GET", "HEAD"],
    "responseHeader": list(HEADERS),
    "maxAgeSeconds": 3600,
}
BASE_URL = "https://storage.googleapis.com/storage/v1/b/" + BUCKET


def command(*args):
    return subprocess.check_output(args, stderr=subprocess.PIPE, text=True).strip()


def authorised_rule(rule):
    return (
        all(origin in rule.get("origin", []) for origin in ORIGINS)
        and "GET" in rule.get("method", [])
        and all(
            any(str(header).lower() == item.lower() for item in rule.get("responseHeader", []))
            for header in HEADERS
        )
    )


def api_request(token, suffix, method="GET", payload=None):
    headers = {"Authorization": "Bearer " + token, "Accept": "application/json"}
    body = None
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = Request(BASE_URL + suffix, headers=headers, data=body, method=method)
    try:
        with urlopen(req, timeout=25) as response:
            return json.load(response)
    except HTTPError as error:
        try:
            details = json.loads(error.read().decode("utf-8"))
            detail = details.get("error", {}).get("message", "Unknown Cloud Storage error")
        except (ValueError, UnicodeDecodeError):
            detail = "Unknown Cloud Storage error"
        raise RuntimeError("Google Cloud Storage HTTP " + str(error.code) + ": " + str(detail)[:500]) from None
    except URLError:
        raise RuntimeError("Could not contact Google Cloud Storage; check your Cloud Shell connection") from None


def main():
    if command("gcloud", "config", "get-value", "project") != PROJECT:
        raise RuntimeError("Wrong project selected. First run: gcloud config set project nightjar-audio")
    account = command("gcloud", "config", "get-value", "account")
    if not account or account == "(unset)":
        raise RuntimeError("Cloud Shell is not authenticated with your Google Cloud account")
    token = command("gcloud", "auth", "print-access-token")
    if not token:
        raise RuntimeError("No Google Cloud access token available")

    current = api_request(token, "?fields=name,metageneration,cors")
    if current.get("name") != BUCKET:
        raise RuntimeError("Unexpected bucket identity; nothing changed")
    before = current.get("cors", [])
    if not isinstance(before, list):
        raise RuntimeError("Unexpected existing CORS configuration; nothing changed")

    print("NIGHTJAR — SECURE ONE-TIME EQ CORS SETUP")
    print("Authenticated account:", account)
    print("Project:", PROJECT)
    print("Bucket:", BUCKET)
    print("Existing CORS rules:", len(before))
    print("Nightjar HTTPS origins:", ", ".join(ORIGINS))

    if any(authorised_rule(rule) for rule in before):
        print("PASS: required EQ CORS already active. No change needed.")
        return

    updated = before + [RULE]
    if len(updated) > 100:
        raise RuntimeError("Cloud Storage CORS rule limit reached; no change made")
    print("Planned change: append 1 restrictive CORS rule permitting GET/HEAD only.")
    print("No public reads, object permissions, signed URL changes, or backend deployments.")
    answer = input("Type ENABLE-NIGHTJAR-AUDIO-EQ to approve this bucket-only change: ").strip()
    if answer != "ENABLE-NIGHTJAR-AUDIO-EQ":
        raise RuntimeError("Confirmation not received. No change made.")

    generation = str(current.get("metageneration", ""))
    if not generation.isdigit():
        raise RuntimeError("Missing bucket metageneration; refusing an unguarded write")
    patch_query = "?ifMetagenerationMatch=" + quote(generation) + "&fields=name,cors"
    api_request(token, patch_query, method="PATCH", payload={"cors": updated})

    verified = api_request(token, "?fields=name,cors")
    if verified.get("name") != BUCKET:
        raise RuntimeError("Wrong bucket on verification")
    after = verified.get("cors", [])
    if not any(authorised_rule(rule) for rule in after):
        raise RuntimeError("CORS rule was not verified after update")
    if not all(any(candidate == rule for candidate in after) for rule in before):
        raise RuntimeError("Verification error: an existing CORS rule changed")
    print("PASS: Nightjar audio EQ CORS activated and verified.")
    print("All previous CORS rules preserved; private object access unchanged.")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, subprocess.CalledProcessError, OSError) as error:
        print("STOP:", error, file=sys.stderr)
        sys.exit(1)
