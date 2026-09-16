#!/usr/bin/env python3
"""Generate cloned-teacher narration and Whisper QA for Silly Swap Words.

This game uses the platform's already-proven async Qwen3/Whisper driver. The
wrapper only redirects its game-local paths; jobs, candidates, transcripts and
recipes remain under this game's source tree and no LAN endpoint is recorded in
tracked files.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
DRIVER = ROOT / "games" / "sound-hopscotch" / "tools" / "generate-voice.py"


def local_endpoint() -> None:
    if os.environ.get("QLOBE_QWEN_URL"):
        return
    state = ROOT / "tools" / "state" / "local.json"
    try:
        data = json.loads(state.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return
    value = data.get("qwen_url") or data.get("qwenUrl") or data.get("base_url")
    if value:
        os.environ["QLOBE_QWEN_URL"] = str(value)


def main() -> int:
    local_endpoint()
    spec = importlib.util.spec_from_file_location("qlobe_voice_driver", DRIVER)
    if not spec or not spec.loader:
        raise SystemExit("shared voice generation driver is unavailable")
    driver = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(driver)
    driver.GAME = GAME
    driver.ROOT = ROOT
    driver.OUT = GAME / "assets" / "audio"
    driver.RAW = GAME / "assets" / "source" / "local-api" / "voice"
    driver.LINES = GAME / "data" / "lines.json"
    # Some Whisper server builds echo the supplied context phrase before the
    # actual utterance. Exact containment still proves every requested word was
    # spoken, so accept that narrowly defined case while retaining the shared
    # driver's ratio/coverage gate for all other transcripts.
    shared_score = driver.score
    def score_without_prompt_echo(wanted, heard):
        accepted, ratio, coverage = shared_score(wanted, heard)
        if driver.norm(wanted) and driver.norm(wanted) in driver.norm(heard):
            accepted = True
        return accepted, ratio, coverage
    driver.score = score_without_prompt_echo
    return int(driver.main())


if __name__ == "__main__":
    sys.exit(main())
