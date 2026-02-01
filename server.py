#!/usr/bin/env python3
"""
Contest Scoring - shared data server.
Run this so all users/laptops see the same data.
  python3 server.py
Then open http://localhost:5000
"""
import json
import threading
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__, static_folder=".", static_url_path="")
DATA_FILE = Path(__file__).resolve().parent / "data.json"
_write_lock = threading.Lock()

CONTESTS = ["iq", "sanskriti", "maths", "sudoku"]


def default_data():
    return {
        "data": {c: [] for c in CONTESTS},
        "backup1": None,
        "backup2": None,
    }


def load_store():
    if not DATA_FILE.exists():
        return default_data()
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            out = json.load(f)
        if "data" not in out:
            out["data"] = {c: [] for c in CONTESTS}
        for c in CONTESTS:
            if c not in out["data"]:
                out["data"][c] = []
        return out
    except Exception:
        return default_data()


def save_store(store):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(store, f, indent=2)


@app.route("/api/contestant", methods=["POST"])
def api_add_contestant():
    """Append a single contestant. Safe when two people submit at the same time."""
    try:
        body = request.get_json(force=True, silent=True) or {}
        contest_id = body.get("contestId")
        entry = body.get("entry")
        if not contest_id or contest_id not in CONTESTS or not isinstance(entry, dict):
            return jsonify({"ok": False, "error": "invalid request"}), 400
    except Exception:
        return jsonify({"ok": False, "error": "invalid request"}), 400
    with _write_lock:
        store = load_store()
        if contest_id not in store["data"]:
            store["data"][contest_id] = []
        store["data"][contest_id].append(entry)
        save_store(store)
    return jsonify({"ok": True, "store": store})


@app.route("/api/data", methods=["GET"])
def api_get_data():
    store = load_store()
    resp = jsonify(store)
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
    resp.headers["Pragma"] = "no-cache"
    return resp


@app.route("/api/data", methods=["POST"])
def api_post_data():
    try:
        incoming = request.get_json(force=True, silent=True) or {}
    except Exception:
        incoming = {}
    with _write_lock:
        current = load_store()
        if "data" in incoming and isinstance(incoming["data"], dict):
            for c in CONTESTS:
                if c in incoming["data"] and isinstance(incoming["data"][c], list):
                    current["data"][c] = incoming["data"][c]
        if "backup1" in incoming:
            current["backup1"] = incoming["backup1"]
        if "backup2" in incoming:
            current["backup2"] = incoming["backup2"]
        save_store(current)
    return {"ok": True}


@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.route("/<path:path>")
def static_file(path):
    return send_from_directory(".", path)


if __name__ == "__main__":
    print("Contest Scoring server - data is shared for all users.")
    print("Open http://localhost:5000")
    print("Press Ctrl+C to stop.")
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
