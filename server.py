#!/usr/bin/env python3
"""
Contest Scoring - shared data server.
Run this so all users/laptops see the same data.
  python3 server.py
Then open http://localhost:5000
"""
import json
import os
from pathlib import Path

from flask import Flask, request, send_from_directory

app = Flask(__name__, static_folder=".", static_url_path="")
DATA_FILE = Path(__file__).resolve().parent / "data.json"

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


@app.route("/api/data", methods=["GET"])
def api_get_data():
    store = load_store()
    return store


@app.route("/api/data", methods=["POST"])
def api_post_data():
    try:
        store = request.get_json(force=True, silent=True) or default_data()
    except Exception:
        store = default_data()
    if "data" not in store:
        store["data"] = {c: [] for c in CONTESTS}
    for c in CONTESTS:
        if c not in store["data"]:
            store["data"][c] = []
    save_store(store)
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
