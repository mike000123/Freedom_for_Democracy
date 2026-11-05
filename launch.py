"""Εκκινητής χωρίς κονσόλα: ξεκινά τον server στο παρασκήνιο και ανοίγει τον browser.

Χρήση (με το Python του .venv):
    launch.py              ξεκινά (αν δεν τρέχει ήδη) και ανοίγει τον browser
    launch.py --no-browser ξεκινά χωρίς να ανοίξει browser
    launch.py --stop       σταματά τον server
Προεπιλεγμένη θύρα 8010, αλλιώς η πρώτη ελεύθερη από 8010 έως 8030.
Το αρχείο launcher.log δείχνει τα μηνύματα του server (μην το μοιράζεστε: μπορεί να έχει διευθύνσεις).
"""
import json
import os
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATE = ROOT / "launcher.state.json"
LOG = ROOT / "launcher.log"
PORTS = range(8010, 8031)
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)
DETACHED = getattr(subprocess, "DETACHED_PROCESS", 0)


def healthy(port, timeout=1.5):
    """Έλεγχος υγείας χωρίς proxy, ώστε να μη χρησιμοποιηθεί ο proxy του συστήματος."""
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(f"http://127.0.0.1:{port}/health/", timeout=timeout) as r:
            return json.load(r).get("application") == "freedom-for-democracy"
    except Exception:
        return False


def port_free(port):
    with socket.socket() as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 0)
        return s.connect_ex(("127.0.0.1", port)) != 0


def read_state():
    try:
        return json.loads(STATE.read_text())
    except Exception:
        return {}


def stop():
    state = read_state()
    pid = state.get("pid")
    if pid:
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, creationflags=NO_WINDOW)
        else:
            try:
                os.kill(pid, 15)
            except OSError:
                pass
    STATE.unlink(missing_ok=True)
    print("Ο server σταμάτησε.")


def start(open_browser=True):
    state = read_state()
    if state.get("port") and healthy(state["port"]):
        port = state["port"]
    else:
        port = next((p for p in PORTS if port_free(p)), None)
        if port is None:
            print("Δεν βρέθηκε ελεύθερη θύρα από 8010 έως 8030.")
            return 1
        log = open(LOG, "ab")
        proc = subprocess.Popen(
            [sys.executable, "manage.py", "runserver", f"127.0.0.1:{port}", "--noreload"],
            cwd=ROOT, stdout=log, stderr=log, stdin=subprocess.DEVNULL,
            creationflags=NO_WINDOW | DETACHED if os.name == "nt" else 0,
            start_new_session=(os.name != "nt"),
        )
        STATE.write_text(json.dumps({"pid": proc.pid, "port": port}))
        for _ in range(40):
            if healthy(port):
                break
            if proc.poll() is not None:
                print(f"Ο server τερματίστηκε. Δείτε το {LOG.name}.")
                STATE.unlink(missing_ok=True)
                return 1
            time.sleep(0.5)
        else:
            print(f"Ο server δεν απάντησε εγκαίρως. Δείτε το {LOG.name}.")
            return 1
    url = f"http://127.0.0.1:{port}/"
    print(f"Έτοιμο: {url}")
    if open_browser:
        webbrowser.open(url)
    return 0


if __name__ == "__main__":
    if "--stop" in sys.argv:
        stop()
    else:
        sys.exit(start(open_browser="--no-browser" not in sys.argv))
