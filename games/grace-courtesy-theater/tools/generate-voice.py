#!/usr/bin/env python3
"""Generate Grace & Courtesy Theater clips with LAN Qwen TTS and Whisper QA."""
from __future__ import annotations
import argparse, difflib, hashlib, json, os, re, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
OUT = GAME / "assets/audio"
RAW = GAME / "assets/source/local-api/voice"
REF = ROOT / "shared/assets/refs/voice-teacher.wav"
LINES = OUT / "lines.json"

def read(path, default):
    try: return json.loads(path.read_text("utf-8"))
    except (OSError, json.JSONDecodeError): return default

def norm(s): return " ".join(re.findall(r"[a-z0-9]+", s.lower()))

def duration(path):
    r = subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",str(path)], capture_output=True, text=True)
    try: return round(float(r.stdout.strip()), 3)
    except ValueError: return 0

def plausible(text, seconds):
    return 0.25 <= seconds <= 1.9 + max(1, len(text.split())) * .72

def post(url, fields, output, min_size=1):
    cmd = ["curl", "-sS", "-X", "POST", url]
    for field in fields: cmd += ["-F", field]
    cmd += ["--output", str(output), "--max-time", "900"]
    r = subprocess.run(cmd, capture_output=True, timeout=930)
    return r.returncode == 0 and output.exists() and output.stat().st_size >= min_size

def encode(raw, final):
    r = subprocess.run(["ffmpeg","-y","-loglevel","error","-i",str(raw),"-vn","-af","silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_silence=0.10:start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-2:LRA=9","-c:a","aac","-b:a","80k","-ar","24000","-ac","1","-movflags","+faststart",str(final)], capture_output=True, timeout=180)
    return r.returncode == 0 and final.exists() and final.stat().st_size > 1500

def main():
    p = argparse.ArgumentParser(); p.add_argument("--seed", type=int, default=7); p.add_argument("--only", nargs="*", default=None); p.add_argument("--force", action="store_true")
    a = p.parse_args(); lines = read(LINES, {})
    if not lines: raise SystemExit(f"missing {LINES}")
    state = read(ROOT / "tools/state/local.json", {}); base = (os.environ.get("QLOBE_QWEN_URL") or state.get("qwenUrl") or "").rstrip("/")
    if not base: raise SystemExit("Qwen endpoint missing")
    if not REF.exists(): raise SystemExit(f"missing approved reference {REF}")
    keys = a.only or list(lines); unknown = [k for k in keys if k not in lines]
    if unknown: raise SystemExit("unknown keys: " + ", ".join(unknown))
    OUT.mkdir(parents=True, exist_ok=True); RAW.mkdir(parents=True, exist_ok=True)
    tts = f"{base}/workflows/qwen3-tts-voiceclone?sync=true"; whisper = f"{base}/workflows/whisper-stt?sync=true"
    generated = {}; qa = read(OUT / "qa.json", {}); previous = read(OUT / "manifest.json", {}); manifest = {k:v for k,v in previous.items() if k in lines and isinstance(v, dict)}
    for key in keys:
        text = lines[key]; final = OUT / f"{key}.m4a"; raw = RAW / f"{key}-seed{a.seed}.flac"
        if not a.force and final.exists() and plausible(text, duration(final)):
            generated[key] = {"seed": a.seed, "status": "kept", "duration": duration(final)}; continue
        print(f"{key}: TTS seed {a.seed}", flush=True)
        if a.force or not raw.exists() or raw.stat().st_size <= 1500:
            if not post(tts, [f"voice=@{REF}", f"text={text}", f"seed={a.seed}"], raw, 1500): generated[key] = {"seed":a.seed,"status":"tts-failed"}; continue
        if not encode(raw, final): generated[key] = {"seed":a.seed,"status":"encode-failed"}; continue
        generated[key] = {"seed":a.seed,"status":"encoded","duration":duration(final)}
    for key in keys:
        text = lines[key]; final = OUT / f"{key}.m4a"; seconds = duration(final) if final.exists() else 0
        if not final.exists() or not plausible(text, seconds):
            qa[key] = {"accepted":False,"reason":"missing or implausible duration","want":text,"duration":seconds,"seed":a.seed}
            manifest.pop(key, None)
            continue
        transcript = RAW / f"{key}-seed{a.seed}-transcript.json"
        ok = post(whisper, [f"audio=@{final}","model_size=base","language=en","initial_prompt=Grace and Courtesy Theater. Poppy and Coco. Please. Thank you. Hello."], transcript)
        payload = read(transcript, {}) if ok else {}; heard_raw = str(payload.get("text") or payload.get("transcript") or "").strip(); want = norm(text); heard = norm(heard_raw)
        score = difflib.SequenceMatcher(None, want, heard).ratio(); ww = want.split(); hw = heard.split(); coverage = sum(w in hw for w in ww) / max(1,len(ww)); accepted = heard == want if len(ww) <= 3 else score >= .86 and coverage >= .90
        qa[key] = {"accepted":accepted,"score":round(score,3),"coverage":round(coverage,3),"want":text,"transcript":heard_raw,"seed":a.seed,"duration":seconds}
        if accepted:
            manifest[key] = {"file":final.name,"dur":seconds,"textHash":hashlib.sha256(text.encode()).hexdigest()[:16],"seed":a.seed}
        else:
            manifest.pop(key, None)
        print(f"{key}: {'accepted' if accepted else 'fallback'} {score:.2f}/{coverage:.2f} -> {heard_raw}", flush=True)
    manifest = {"_v":hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest()[:12], **dict(sorted(manifest.items()))}
    (OUT / "manifest.json").write_text(json.dumps(manifest,indent=2)+"\n", "utf-8"); (OUT / "qa.json").write_text(json.dumps(dict(sorted(qa.items())),indent=2,ensure_ascii=False)+"\n", "utf-8")
    receipt = {"format":"qlobe-voice-production-receipt","formatVersion":1,"game":GAME.name,"createdAt":datetime.now(timezone.utc).isoformat(),"workflow":"qwen3-tts-voiceclone -> AAC/M4A -> whisper-stt transcript QA","endpoint":"authorized local workflow API (address intentionally omitted)","reference":str(REF.relative_to(ROOT)).replace("\\","/"),"generation":dict(sorted(generated.items())),"accepted":[k for k in lines if k in manifest],"fallback":[k for k in lines if k not in manifest]}
    (RAW / "receipt.json").write_text(json.dumps(receipt,indent=2)+"\n", "utf-8"); print(f"voice complete: {len(receipt['accepted'])}/{len(lines)} accepted")

if __name__ == "__main__": sys.exit(main())
