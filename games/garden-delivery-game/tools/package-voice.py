#!/usr/bin/env python3
"""Package transcript-approved QLOBE Studio voice jobs for Garden Delivery."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
import shutil
import subprocess


ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / "games/garden-delivery-game"
MEDIA = ROOT / "shared/media"
AUDIO = GAME / "assets/audio"
PROVENANCE = GAME / "assets/source/local-api/voice"

# Alternate seeds are selected only when their Whisper transcript is a closer
# exact match than the first accepted render. The runtime keys never change.
SELECTED = {
    "rose-intro": "rose-intro-v2",
    "tulip-bloom": "tulip-bloom-v2",
}


def duration(path: Path) -> float:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        raise RuntimeError("ffprobe is required to build the voice manifest")
    result = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        check=True, capture_output=True, text=True,
    )
    return round(float(result.stdout.strip()), 3)


def main() -> None:
    config = json.loads((GAME / "config.json").read_text())
    lines = config["voice"]
    AUDIO.mkdir(parents=True, exist_ok=True)
    PROVENANCE.mkdir(parents=True, exist_ok=True)
    manifest = {}
    qa_index = {}

    for key, text in lines.items():
        source_key = SELECTED.get(key, key)
        media_id = f"garden-delivery-voice-{source_key}"
        source = MEDIA / media_id
        qa = json.loads((source / "qa-transcript.json").read_text())
        recipe = json.loads((source / "recipe.json").read_text())
        if qa.get("intended") != text:
            raise RuntimeError(f"{key}: staged intended text differs from config.json")
        if qa.get("match") is not True or float(qa.get("ratio") or 0) < 0.8:
            raise RuntimeError(f"{key}: transcript QA did not pass: {qa}")

        staged_clip = source / f"{media_id}.m4a"
        runtime_clip = AUDIO / f"{key}.m4a"
        shutil.copy2(staged_clip, runtime_clip)
        evidence = PROVENANCE / key
        evidence.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source / "qa-transcript.json", evidence / "qa-transcript.json")
        shutil.copy2(source / "recipe.json", evidence / "recipe.json")

        manifest[key] = {
            "file": runtime_clip.name,
            "dur": duration(runtime_clip),
            "textHash": hashlib.sha256(text.encode("utf-8")).hexdigest()[:16],
        }
        qa_index[key] = {
            "mediaId": media_id,
            "seed": recipe["steps"][0]["seed"],
            "ratio": qa["ratio"],
            "heard": qa["heard"],
            "match": qa["match"],
        }

    (AUDIO / "lines.json").write_text(json.dumps(lines, indent=2, ensure_ascii=False) + "\n")
    (AUDIO / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (PROVENANCE / "qa-index.json").write_text(json.dumps(qa_index, indent=2, ensure_ascii=False) + "\n")
    print(f"packaged {len(manifest)} transcript-approved Garden Delivery lines")


if __name__ == "__main__":
    main()
