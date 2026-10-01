#!/usr/bin/env python3
"""Thin wrapper: the real work is in make_puzzles.js (needs the JS engine)."""
import subprocess
import os

HERE = os.path.dirname(os.path.abspath(__file__))
subprocess.run(["node", os.path.join(HERE, "make_puzzles.js")], check=True)
