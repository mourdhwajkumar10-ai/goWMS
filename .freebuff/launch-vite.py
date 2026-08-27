#!/usr/bin/env python3
import subprocess, os, sys

os.chdir("/Users/yudhistherkumar/Downloads/goWMS/web")
env = os.environ.copy()
env["PATH"] = "/Users/yudhistherkumar/.nvm/versions/node/v26.1.0/bin:" + env.get("PATH", "")

with open("/Users/yudhistherkumar/Downloads/goWMS/.freebuff/preview-5173.log", "w") as log:
    proc = subprocess.Popen(
        ["node", "./node_modules/vite/bin/vite.js", "--port", "5173", "--host", "0.0.0.0"],
        stdout=log, stderr=log, env=env, start_new_session=True
    )
    print(f"Vite PID: {proc.pid}")
