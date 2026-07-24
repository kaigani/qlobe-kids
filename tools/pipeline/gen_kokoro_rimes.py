#!/usr/bin/env python3
"""Generate phoneme-exact Kokoro reference clips for VC (vowel-consonant)
rimes, as the "correct pronunciation" reference for acoustic QA / A/B review.

Ported from tools/content-pipeline/gen_kokoro_rimes.py (predecessor repo,
hardcoded paths + a hardcoded LAN host). Self-contained: the rime -> IPA map
is linguistic data, not repo-specific, so this tool needs no words.json.

Proven behaviors preserved:
  - phoneme-exact synthesis via geeky-kokoro-tts's `use_phonemes=true`
  - the IPA phoneme map (primary stress before the vowel, to keep it full)
  - skip-existing idempotency (output already >1500 bytes -> skip)
  - size validation on both the raw wav and the converted m4a
  - wav (raw model output) -> m4a (aac 64k) via ffmpeg

Stdlib only; ffmpeg is an external binary invoked via subprocess.

The API host is NEVER hardcoded: pass --api-url or set QLOBE_QWEN_URL.
--dry-run lists planned work and makes zero network calls; it needs neither.
"""
import argparse
import os
import shutil
import subprocess
import sys

# misaki/IPA phonemes, primary stress before the vowel to keep it full.
# short a=ae  e=eh  i=ih  o=aa  u=uh
IPA = {
    "at": "ˈæt", "an": "ˈæn", "ap": "ˈæp", "ag": "ˈæɡ",
    "am": "ˈæm", "ad": "ˈæd", "ab": "ˈæb", "ax": "ˈæks",
    "ak": "ˈæk",
    "ed": "ˈɛd", "eg": "ˈɛɡ", "em": "ˈɛm", "en": "ˈɛn",
    "et": "ˈɛt", "eb": "ˈɛb",
    "ig": "ˈɪɡ", "in": "ˈɪn", "ip": "ˈɪp", "it": "ˈɪt",
    "ix": "ˈɪks", "ib": "ˈɪb", "id": "ˈɪd",
    "og": "ˈɑɡ", "op": "ˈɑp", "ot": "ˈɑt", "ox": "ˈɑks",
    "ob": "ˈɑb", "od": "ˈɑd", "om": "ˈɑm",
    "un": "ˈʌn", "up": "ˈʌp", "ug": "ˈʌɡ", "ub": "ˈʌb",
    "ud": "ˈʌd", "um": "ˈʌm", "ut": "ˈʌt", "us": "ˈʌs",
}


def build_parser():
    p = argparse.ArgumentParser(
        description="Generate phoneme-exact Kokoro reference clips for every rime "
                    "via the geeky-kokoro-tts ComfyUI workflow (use_phonemes=true).",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--root", default=os.getcwd(), help="repo/content root")
    p.add_argument("--api-url", default=os.environ.get("QLOBE_QWEN_URL"),
                   help="ComfyUI wrapper base URL (or QLOBE_QWEN_URL env); host is never committed")
    p.add_argument("--dry-run", action="store_true", help="list planned work; make no network calls")
    p.add_argument("--voice", default="\U0001f1fa\U0001f1f8 \U0001f6ba Heart ❤️",
                   help="Kokoro voice id")
    p.add_argument("--out", default=None,
                   help="output dir for m4a reference clips (default <root>/assets/audio/ref_kokoro)")
    p.add_argument("--raw-dir", default=None,
                   help="raw wav staging dir (default <root>/generated/raw/kokoro)")
    p.add_argument("--ffmpeg", default=shutil.which("ffmpeg") or "ffmpeg", help="ffmpeg binary")
    p.add_argument("--max-time", type=int, default=300, help="per-request curl timeout (seconds)")
    return p


def gen(api_url, voice, rime, ipa, out_dir, raw_dir, ffmpeg, max_time):
    out = os.path.join(out_dir, f"{rime}.m4a")
    if os.path.exists(out) and os.path.getsize(out) > 1500:
        return "skip"
    raw = os.path.join(raw_dir, f"{rime}.wav")
    endpoint = f"{api_url.rstrip('/')}/workflows/geeky-kokoro-tts?sync=true"
    try:
        subprocess.run(
            ["curl", "-s", "-X", "POST", endpoint, "-F", f"text={ipa}",
             "-F", "use_phonemes=true", "-F", f"voice={voice}",
             "--output", raw, "--max-time", str(max_time)],
            capture_output=True, timeout=max_time + 20)
    except subprocess.TimeoutExpired:
        return "FAIL(timeout)"
    if not (os.path.exists(raw) and os.path.getsize(raw) > 1500):
        return "FAIL(no audio)"
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", raw, "-c:a", "aac", "-b:a", "64k", out],
                   capture_output=True)
    return "ok" if os.path.exists(out) else "FAIL(convert)"


def main():
    parser = build_parser()
    args = parser.parse_args()
    out_dir = args.out or os.path.join(args.root, "assets", "audio", "ref_kokoro")
    raw_dir = args.raw_dir or os.path.join(args.root, "generated", "raw", "kokoro")

    if args.dry_run:
        print(f"[dry-run] would generate {len(IPA)} kokoro reference clip(s), voice={args.voice!r}")
        for rime, ipa in IPA.items():
            out = os.path.join(out_dir, f"{rime}.m4a")
            mark = "skip (exists)" if os.path.exists(out) and os.path.getsize(out) > 1500 else "would generate"
            print(f"  {rime:4s} {ipa:8s} -> {out}  [{mark}]")
        print("[dry-run] zero network calls made")
        return 0

    if not args.api_url:
        parser.error("no --api-url / QLOBE_QWEN_URL set (generation needs a host; use --dry-run to preview with none)")

    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(raw_dir, exist_ok=True)
    results = []
    for rime, ipa in IPA.items():
        r = gen(args.api_url, args.voice, rime, ipa, out_dir, raw_dir, args.ffmpeg, args.max_time)
        results.append((rime, r))
        print(rime, ipa, r, flush=True)
    print("=== KOKORO RIMES DONE ===")
    fails = [x for x in results if x[1].startswith("FAIL")]
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
