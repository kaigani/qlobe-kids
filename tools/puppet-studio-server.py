#!/usr/bin/env python3
"""Local authoring server for QLOBE Studio (and legacy Puppet Studio).

The QLOBE Kids runtime remains a static site.  This optional localhost-only
server adds the write and long-running inference endpoints needed while building
a character.  It deliberately has no third-party Python dependencies.

Usage (from the qlobe-kids directory):

    python3 tools/puppet-studio-server.py \
      --qwen-url http://YOUR-MODEL-HOST:8100

Then open http://127.0.0.1:8000/shared/js/studio/
"""

from __future__ import annotations

import argparse
import json
import math
import mimetypes
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
import wave
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, unquote, urlparse
from urllib.request import Request, urlopen


VISEMES = ("a", "o", "e", "wr", "ts", "ln", "uq", "mbp", "fv")
ALL_VISEMES = ("rest",) + VISEMES
BONES = (
    "head", "torso",
    "arm-upper.L", "arm-lower.L", "arm-upper.R", "arm-lower.R",
    "leg-upper.L", "leg-lower.L", "leg-upper.R", "leg-lower.R",
)
ID_RE = re.compile(r"^[a-z][a-z0-9-]{0,39}$")
VALIDATE_TARGET_RE = re.compile(r"^[a-z][a-z0-9-]{0,64}$")
MAX_UPLOAD = 32 * 1024 * 1024
MAX_STUDIO_DOCUMENT = 4 * 1024 * 1024
RHU_TO_VISEME = {
    # Rhubarb's Preston-Blair meanings mapped to QLOBE's canonical heads.
    # Keep B (generic consonants) distinct from C (E) and F (U).
    "X": "rest", "A": "mbp", "B": "ts", "C": "e", "D": "a",
    "E": "o", "F": "uq", "G": "fv", "H": "ln",
}

ARPA_TO_VISEME = {
    "AA": "a", "AH": "a", "AW": "a", "AY": "a",
    "AO": "o", "OW": "o", "OY": "o",
    "AE": "e", "EH": "e", "EY": "e", "IH": "e", "IY": "e",
    "ER": "wr", "R": "wr", "W": "wr",
    "UW": "uq", "UH": "uq",
    "M": "mbp", "B": "mbp", "P": "mbp",
    "F": "fv", "V": "fv",
    "L": "ln", "N": "ln", "NG": "ln",
}
SILENCE_PHONES = {"", "SIL", "SP", "SPN", "<EPS>", "<SIL>", "#"}

JOB_STATUSES = ("queued", "running", "completed", "failed", "interrupted", "cancelled")

# The ComfyUI host is ONE queue that swaps models per request; interleaving
# workflow types craters throughput ~25x (spec §3.5). Each job kind maps to a
# ComfyUI workflow type; the scheduler drains all queued jobs of one workflow
# before switching models. voice-align/whisper-stt are local (ffmpeg + aligner
# venv / Whisper) but keep the same batch grouping for a single coherent model.
WORKFLOW_FOR_KIND = {
    "story-scene": "krea2-turbo-t2i",
    "extract": "qwen-image-layered",
    "voice": "voice-align",
    "transcription": "whisper-stt",
}
# Kinds whose inputs live on disk (reference PNGs, prompt/seed) and are therefore
# safely re-queueable after a crash. voice/transcription depend on an uploaded
# temp file that is lost on restart, so they are not resumable.
RESUMABLE_KINDS = {"story-scene", "extract"}


def public_job(job: dict | None) -> dict | None:
    """Strip the internal re-dispatch recipe before a job crosses the HTTP boundary.

    `dispatch` holds prompts and temp upload paths — an implementation detail of
    the scheduler, never part of the (frozen) job response contract."""
    if not job:
        return job
    return {key: value for key, value in job.items() if key != "dispatch"}


class JobStore:
    """JSON-file-backed job registry under the git-ignored tools/state/ directory.

    Replaces the old in-memory dict: the whole registry is persisted atomically
    on every mutation and reloaded on boot, so jobs (and their history) survive a
    server restart or a kill -9. Deep-copies on read so callers never mutate the
    live store outside the lock."""

    def __init__(self, path: Path):
        self.path = path
        self.lock = threading.RLock()
        self.jobs: dict[str, dict] = {}
        self.order: list[str] = []
        self._load()

    def _load(self):
        if not self.path.is_file():
            return
        try:
            data = json.loads(self.path.read_text("utf-8"))
        except (ValueError, OSError):
            return  # a corrupt store starts empty rather than crashing the server
        jobs = data.get("jobs") if isinstance(data, dict) else None
        if not isinstance(jobs, dict):
            return
        self.jobs = jobs
        order = data.get("order") if isinstance(data, dict) else None
        self.order = [jid for jid in (order or []) if jid in jobs]
        for jid in jobs:
            if jid not in self.order:
                self.order.append(jid)

    def _persist_locked(self):
        atomic_write(self.path, json_bytes({"jobs": self.jobs, "order": self.order}) + b"\n")

    def create(self, record: dict) -> dict:
        with self.lock:
            job_id = record["id"]
            record.setdefault("created", time.time())
            record["updated"] = time.time()
            self.jobs[job_id] = record
            if job_id not in self.order:
                self.order.append(job_id)
            self._persist_locked()
            return json.loads(json.dumps(record))

    def update(self, job_id: str, **values) -> dict | None:
        with self.lock:
            job = self.jobs.get(job_id)
            if job is None:
                return None
            job.update(values)
            job["updated"] = time.time()
            self._persist_locked()
            return json.loads(json.dumps(job))

    def get(self, job_id: str) -> dict | None:
        with self.lock:
            job = self.jobs.get(job_id)
            return json.loads(json.dumps(job)) if job else None

    def list(self, status: str | None = None, kind: str | None = None) -> list[dict]:
        with self.lock:
            out = []
            for job_id in reversed(self.order):  # newest first for the dashboard
                job = self.jobs.get(job_id)
                if not job:
                    continue
                if status and job.get("status") != status:
                    continue
                if kind and kind not in (job.get("kind"), job.get("target"), job.get("workflow")):
                    continue
                out.append(json.loads(json.dumps(job)))
            return out

    def queued_fifo(self) -> list[dict]:
        """Queued, non-interactive jobs in insertion (FIFO) order."""
        with self.lock:
            return [
                json.loads(json.dumps(self.jobs[job_id]))
                for job_id in self.order
                if self.jobs.get(job_id, {}).get("status") == "queued"
                and not self.jobs[job_id].get("interactive")
            ]


class Scheduler:
    """Single worker draining the queue, batched by ComfyUI workflow type.

    Drains every queued job of the current workflow (FIFO within the type) before
    switching to the next workflow — this encodes the single-queue model-swap
    constraint (spec §3.5/§10). `interactive: true` jobs bypass batching and run
    immediately in their own thread (interactive one-offs)."""

    def __init__(self, state: "AuthoringState"):
        self.state = state
        self.store = state.store
        self.cv = threading.Condition()
        self.current_workflow: str | None = None

    def start(self):
        threading.Thread(target=self._run, name="qlobe-scheduler", daemon=True).start()

    def wake(self):
        with self.cv:
            self.cv.notify_all()

    def _pick_locked(self) -> dict | None:
        queued = self.store.queued_fifo()
        if not queued:
            self.current_workflow = None
            return None
        if self.current_workflow:
            same = [job for job in queued if job.get("workflow") == self.current_workflow]
            if same:
                return same[0]
        self.current_workflow = queued[0].get("workflow")
        return queued[0]

    def _run(self):
        while True:
            with self.cv:
                job = self._pick_locked()
                while job is None:
                    self.cv.wait(timeout=5.0)
                    job = self._pick_locked()
            self.state.execute_job(job["id"])

    def run_interactive(self, job_id: str):
        threading.Thread(
            target=self.state.execute_job, args=(job_id,),
            name=f"qlobe-interactive-{job_id}", daemon=True,
        ).start()


class AuthoringState:
    def __init__(self, root: Path, qwen_url: str | None, whisper_url: str | None = None,
                 mfa_bin: str | None = None, mfa_dictionary: str = "english_us_arpa",
                 mfa_acoustic_model: str = "english_us_arpa", mfa_root: str | None = None,
                 whisper_visemes_python: str | None = None, whisper_visemes_script: str | None = None):
        self.root = root.resolve()
        self.reference_root = self.root.parent / "00-reference" / "puppet parts"
        self.character_root = self.root / "shared" / "characters"
        self.qwen_url = qwen_url.rstrip("/") if qwen_url else None
        self.whisper_url = whisper_url
        requested_mfa = os.path.expanduser(mfa_bin) if mfa_bin else None
        bundled_mfa = Path.home() / ".qlobe-mfa" / "envs" / "aligner" / "bin" / "mfa"
        self.mfa_bin = requested_mfa or shutil.which("mfa") or (str(bundled_mfa) if bundled_mfa.is_file() else None)
        self.mfa_root = os.path.expanduser(mfa_root or os.environ.get("QLOBE_MFA_ROOT", "~/.qlobe-mfa/data"))
        self.mfa_dictionary = os.path.expanduser(mfa_dictionary)
        self.mfa_acoustic_model = os.path.expanduser(mfa_acoustic_model)
        self.rhubarb_bin = root.parent / "tools-local" / "Rhubarb-Lip-Sync-1.14.0-macOS" / "rhubarb"
        # Canonical speech aligner (spec §10): the whisper-visemes chain runs from
        # a machine-specific, git-ignored venv (tools/lipsync/venv). Overridable so
        # the aligner path can be pointed at a stub (or a nonexistent path) for tests.
        self.whisper_visemes_python = Path(os.path.expanduser(whisper_visemes_python)) if whisper_visemes_python \
            else (self.root / "tools" / "lipsync" / "venv" / "bin" / "python")
        self.whisper_visemes_script = Path(os.path.expanduser(whisper_visemes_script)) if whisper_visemes_script \
            else (self.root / "tools" / "lipsync" / "whisper-visemes.py")
        self.lock = threading.Lock()  # guards voice-manifest read-modify-write
        # Persistent, restart-surviving job store under tools/state/ (git-ignored,
        # server-managed; created on boot). Replaces the old in-memory job dict.
        self.state_dir = self.root / "tools" / "state"
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.store = JobStore(self.state_dir / "jobs.json")
        self.scheduler = Scheduler(self)

    @property
    def mfa_available(self) -> bool:
        if not self.mfa_bin:
            return False
        resolved = shutil.which(self.mfa_bin) or self.mfa_bin
        return Path(resolved).is_file() and os.access(resolved, os.X_OK)

    @property
    def rhubarb_available(self) -> bool:
        return self.rhubarb_bin.is_file() and os.access(self.rhubarb_bin, os.X_OK)

    @property
    def whisper_visemes_available(self) -> bool:
        return (self.whisper_visemes_python.is_file() and os.access(self.whisper_visemes_python, os.X_OK)
                and self.whisper_visemes_script.is_file())

    # ---- job store delegates (unchanged signatures for the run_*_job workers) --
    def update_job(self, job_id: str, **values):
        self.store.update(job_id, **values)

    def snapshot_job(self, job_id: str):
        return self.store.get(job_id)

    def enqueue(self, kind: str, dispatch: dict, extra: dict, interactive: bool = False) -> str:
        """Create a persistent job and hand it to the scheduler.

        Non-interactive jobs join the workflow-batched queue; interactive:true
        one-offs bypass batching and run immediately."""
        job_id = uuid.uuid4().hex[:12]
        record = {
            "id": job_id, "kind": kind, "workflow": WORKFLOW_FOR_KIND[kind],
            "status": "queued", "interactive": bool(interactive),
            "resumable": kind in RESUMABLE_KINDS,
            "created": time.time(), "dispatch": dispatch, **extra,
        }
        self.store.create(record)
        if interactive:
            self.scheduler.run_interactive(job_id)
        else:
            self.scheduler.wake()
        return job_id

    def execute_job(self, job_id: str):
        """Run one job by re-hydrating its dispatch recipe. Called by the worker
        (batched) or a per-job thread (interactive)."""
        job = self.store.get(job_id)
        if not job or job.get("status") != "queued":
            return  # already running/finished/cancelled — never double-run
        self.update_job(job_id, status="running", startedAt=time.time())
        kind = job.get("kind")
        d = job.get("dispatch", {})
        try:
            if kind == "story-scene":
                run_story_scene_job(self, job_id, d["storyId"], d["prompt"], int(d["seed"]),
                                    self.root / d["destination"])
            elif kind == "extract":
                run_extract_job(self, job_id, d["character"], d["target"], d["prompt"], int(d["seed"]))
            elif kind == "voice":
                source, temp_dir = Path(d["source"]), Path(d["tempDir"])
                if not source.is_file():
                    self.update_job(job_id, status="failed", message="Voice cue generation failed",
                                    error="uploaded voice sample is no longer available (server restart); re-upload it")
                    return
                run_voice_job(self, job_id, d["character"], d["key"], d["label"], d["transcript"],
                              d["aligner"], int(d["leadMs"]), temp_dir, source)
            elif kind == "transcription":
                source, temp_dir = Path(d["source"]), Path(d["tempDir"])
                if not source.is_file():
                    self.update_job(job_id, status="failed", message="Transcription failed",
                                    error="uploaded audio is no longer available (server restart); re-upload it")
                    return
                run_transcription_job(self, job_id, temp_dir, source)
            else:
                self.update_job(job_id, status="failed", error=f"unknown job kind: {kind}")
        except Exception as exc:  # a crashing worker must not wedge the queue
            self.update_job(job_id, status="failed", error=str(exc))
        finally:
            self.scheduler.wake()  # re-evaluate the queue for the next job

    def recover_jobs(self):
        """Boot recovery. Jobs left `running` when the server died are marked
        interrupted; resumable ones are re-queued, the rest fail with a reason.
        Queued jobs simply resume when the scheduler starts (their inputs persist)
        — except non-resumable ones whose uploaded temp file is now gone."""
        resumed = interrupted = failed = 0
        for job in self.store.list():
            job_id, status = job["id"], job.get("status")
            resumable = bool(job.get("resumable"))
            if status == "running":
                interrupted += 1
                if resumable:
                    self.store.update(job_id, status="queued", interrupted=True,
                                      interruptedReason="server restarted mid-run; re-queued",
                                      message="Interrupted by restart — re-queued")
                    resumed += 1
                else:
                    self.store.update(job_id, status="failed", interrupted=True,
                                      message="Interrupted by restart",
                                      error="interrupted by server restart; not resumable (re-run required)")
                    failed += 1
            elif status == "queued":
                source = job.get("dispatch", {}).get("source")
                if not resumable and (not source or not Path(source).is_file()):
                    self.store.update(job_id, status="failed", interrupted=True,
                                      message="Interrupted by restart",
                                      error="queued upload is no longer available after restart; re-run required")
                    failed += 1
                else:
                    resumed += 1
        if interrupted or resumed or failed:
            print(f"Job recovery: {interrupted} interrupted, {resumed} resumable/queued, {failed} failed")


def safe_id(value: str) -> str:
    if not ID_RE.fullmatch(value or ""):
        raise ValueError("character id must be lowercase kebab-case (max 40 characters)")
    return value


def safe_story_id(value: str) -> str:
    parts = value.split("--")
    if len(parts) != 3 or len(set(parts)) != 3 or any(not ID_RE.fullmatch(part) for part in parts):
        raise ValueError("story id must contain three different lowercase stone ids joined by --")
    return "--".join(sorted(parts))


def safe_relative(value: str) -> Path:
    value = unquote(value).replace("\\", "/")
    path = Path(value)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError("unsafe path")
    return path


def destination_for(state: AuthoringState, char_id: str, kind: str) -> Path:
    char_id = safe_id(char_id)
    ref = state.reference_root / char_id
    char = state.character_root / char_id
    fixed = {
        "raw-base": ref / "raw-base.png",
        "head-visemes": ref / "head-visemes.png",
        "sprites": ref / f"sprites-{char_id}.png",
        "rig": char / "rig.json",
        "character-sheet": char / "character-sheet.md",
    }
    if kind in fixed:
        return fixed[kind]
    for prefix, allowed, folder, stem in (
        ("viseme-tile-", VISEMES, ref / "viseme-tiles", "viseme-"),
        ("viseme-cutout-", VISEMES, ref / "viseme-cutouts", "head-"),
        ("anim-", ALL_VISEMES, char / "anim", "head-"),
        ("part-", BONES, char / "parts", ""),
    ):
        if kind.startswith(prefix):
            key = kind[len(prefix):]
            if key not in allowed:
                break
            return folder / f"{stem}{key}.png"
    raise ValueError(f"unsupported file kind: {kind}")


def studio_document_path(state: AuthoringState, value: str) -> Path:
    """Resolve a Studio JSON document inside one of the explicit authoring roots."""
    relative = safe_relative(value)
    parts = relative.parts
    allowed = False
    if len(parts) >= 3 and parts[:2] == ("shared", "characters"):
        safe_id(parts[2]); allowed = True
    elif len(parts) >= 3 and parts[:2] == ("shared", "props"):
        safe_id(parts[2]); allowed = True
    elif len(parts) >= 3 and parts[0] == "games":
        safe_id(parts[1]); allowed = True
    if not allowed or relative.suffix.lower() != ".json":
        raise ValueError("Studio documents must be JSON under shared/characters, shared/props, or games/<id>")
    destination = (state.root / relative).resolve()
    if not destination.is_relative_to(state.root):
        raise ValueError("unsafe Studio document path")
    return destination


def studio_registry_objects(state: AuthoringState) -> list[dict]:
    """Resolve the object-centric registry (qlobe-studio-projects fv2).

    Reads shared/js/studio/projects.json. fv2 documents carry objects[]; fv1
    documents are expanded to their implied objects, mirroring the browser
    adapter in shared/js/studio/projects.js. Every emitted document path is
    re-validated through the Studio allow-list, so this endpoint can never
    surface a path the write APIs would refuse.
    """
    registry_path = state.root / "shared" / "js" / "studio" / "projects.json"
    if not registry_path.is_file():
        raise ValueError("Studio project registry not found")
    registry = json.loads(registry_path.read_text("utf-8"))
    if registry.get("format") != "qlobe-studio-projects" or not isinstance(registry.get("projects"), list):
        raise ValueError("Studio project registry is invalid")

    raw_objects = registry.get("objects")
    if not isinstance(raw_objects, list) or not raw_objects:
        raw_objects = []
        for project in registry["projects"]:
            if not isinstance(project, dict) or "id" not in project:
                continue
            pid = project["id"]
            raw_objects.append({"type": "game", "id": pid, "document": f"games/{pid}/game.json", "project": pid})
            for workspace, config in (project.get("workspaces") or {}).items():
                doc = config.get("document") if isinstance(config, dict) else None
                if isinstance(doc, str):
                    kind = {"stage": "scene-pack", "music": "music-sync"}.get(workspace, workspace)
                    raw_objects.append({"type": kind, "id": f"{pid}-{workspace}", "document": doc, "project": pid})

    objects = []
    for obj in raw_objects:
        if not isinstance(obj, dict) or not isinstance(obj.get("document"), str):
            continue
        try:
            resolved = studio_document_path(state, obj["document"])
        except ValueError:
            continue  # never emit a path outside the write allow-list
        entry = dict(obj)
        entry["exists"] = resolved.is_file()
        objects.append(entry)
    return objects


def studio_asset_path(state: AuthoringState, value: str) -> Path:
    """Resolve an image asset inside a registered-style project asset root."""
    relative = safe_relative(value)
    parts = relative.parts
    allowed = False
    if len(parts) >= 4 and parts[0] == "games" and parts[2] == "assets":
        safe_id(parts[1]); allowed = True
    elif len(parts) >= 4 and parts[:2] == ("shared", "characters"):
        safe_id(parts[2]); allowed = True
    elif len(parts) >= 3 and parts[:2] == ("shared", "props"):
        safe_id(parts[2]); allowed = True
    if not allowed or relative.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
        raise ValueError("Studio assets must be PNG, JPEG, or WebP under a game/shared asset root")
    destination = (state.root / relative).resolve()
    if not destination.is_relative_to(state.root):
        raise ValueError("unsafe Studio asset path")
    return destination


def atomic_write(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    temp.write_bytes(data)
    os.replace(temp, path)


def json_bytes(value) -> bytes:
    return json.dumps(value, indent=2).encode("utf-8")


def http_json(url: str, timeout=8):
    with urlopen(url, timeout=timeout) as response:
        return json.load(response)


def multipart_request(url: str, file_path: Path, fields: dict[str, str], timeout=60,
                      file_field="image"):
    boundary = f"----qlobe-{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            str(value).encode(), b"\r\n",
        ])
    chunks.extend([
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="{file_field}"; filename="{file_path.name}"\r\n'.encode(),
        f"Content-Type: {mimetypes.guess_type(file_path.name)[0] or 'application/octet-stream'}\r\n\r\n".encode(),
        file_path.read_bytes(), b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ])
    body = b"".join(chunks)
    request = Request(url, data=body, method="POST", headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Content-Length": str(len(body)),
    })
    with urlopen(request, timeout=timeout) as response:
        return json.load(response)


def multipart_fields_request(url: str, fields: dict[str, str], timeout=60):
    boundary = f"----qlobe-{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            str(value).encode(), b"\r\n",
        ])
    chunks.append(f"--{boundary}--\r\n".encode())
    body = b"".join(chunks)
    request = Request(url, data=body, method="POST", headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Content-Length": str(len(body)),
    })
    with urlopen(request, timeout=timeout) as response:
        return json.load(response)


def run_story_scene_job(state: AuthoringState, job_id: str, story_id: str,
                        prompt: str, seed: int, destination: Path):
    try:
        if not state.qwen_url:
            raise RuntimeError("local workflow URL is not configured; restart with --qwen-url")
        state.update_job(job_id, status="running", message="Generating Krea scene", progress=1, total=3)
        submitted = multipart_fields_request(
            f"{state.qwen_url}/workflows/krea2-turbo-t2i",
            {"prompt": prompt, "seed": str(seed), "width": "1344", "height": "768", "steps": "8", "cfg": "1"},
            timeout=120,
        )
        remote_id = submitted.get("job_id") or submitted.get("id")
        if not remote_id:
            raise RuntimeError(f"Krea did not return a job id: {submitted}")
        state.update_job(job_id, remoteJob=str(remote_id), message="Waiting for local Krea 2", progress=1)
        deadline = time.time() + 30 * 60
        while time.time() < deadline:
            remote = http_json(f"{state.qwen_url}/jobs/{remote_id}", timeout=20)
            status = str(remote.get("status", "")).lower()
            if status in ("completed", "complete", "succeeded", "success"):
                break
            if status in ("failed", "error", "cancelled", "canceled"):
                raise RuntimeError(remote.get("error") or f"Krea job {status}")
            time.sleep(2)
        else:
            raise TimeoutError("Krea scene generation exceeded 30 minutes")
        state.update_job(job_id, message="Optimizing scene WebP", progress=2)
        with urlopen(f"{state.qwen_url}/jobs/{remote_id}/result", timeout=180) as response:
            source_bytes = response.read(MAX_UPLOAD + 1)
        if len(source_bytes) > MAX_UPLOAD or not source_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
            raise RuntimeError("Krea result was not a valid PNG under 32 MB")
        with tempfile.TemporaryDirectory(prefix="qlobe-story-scene-") as temp:
            temp_path = Path(temp)
            source = temp_path / "source.png"
            encoded = temp_path / "scene.webp"
            source.write_bytes(source_bytes)
            ffmpeg = shutil.which("ffmpeg") or "/usr/local/bin/ffmpeg"
            run = subprocess.run([
                ffmpeg, "-y", "-loglevel", "error", "-i", str(source),
                "-vf", "scale=1344:768:flags=lanczos", "-c:v", "libwebp", "-quality", "86", str(encoded),
            ], capture_output=True, text=True, timeout=180)
            if run.returncode or not encoded.is_file():
                raise RuntimeError(run.stderr.strip() or "ffmpeg could not encode the scene WebP")
            atomic_write(destination, encoded.read_bytes())
        relative = str(destination.relative_to(state.root))
        state.update_job(job_id, status="completed", message="Krea scene saved", progress=3,
                         outputs=[relative], storyId=story_id)
    except Exception as exc:
        state.update_job(job_id, status="failed", error=str(exc), message="Krea scene generation failed")


def extract_one(state: AuthoringState, source: Path, destination: Path,
                prompt: str, seed: int, on_remote_job=None):
    if not state.qwen_url:
        raise RuntimeError("Qwen URL is not configured; restart with --qwen-url")
    if not source.exists():
        raise FileNotFoundError(source)
    submitted = multipart_request(
        f"{state.qwen_url}/workflows/qwen-image-layered",
        source,
        {"prompt": prompt, "layers": "2", "seed": str(seed)},
    )
    remote_id = submitted.get("job_id") or submitted.get("id")
    if not remote_id:
        raise RuntimeError(f"Qwen did not return a job id: {submitted}")
    if on_remote_job:
        on_remote_job(str(remote_id))
    deadline = time.time() + 30 * 60
    while time.time() < deadline:
        remote = http_json(f"{state.qwen_url}/jobs/{remote_id}", timeout=15)
        status = str(remote.get("status", "")).lower()
        if status in ("completed", "complete", "succeeded", "success"):
            break
        if status in ("failed", "error", "cancelled", "canceled"):
            raise RuntimeError(remote.get("error") or f"Qwen job {status}")
        time.sleep(3)
    else:
        raise TimeoutError("Qwen extraction exceeded 30 minutes")
    result_url = f"{state.qwen_url}/jobs/{remote_id}/result?output=layer_2"
    with urlopen(result_url, timeout=120) as response:
        data = response.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise RuntimeError("Qwen result exceeded 32 MB")
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError("Qwen layer_2 was not a PNG")
    atomic_write(destination, data)


def run_extract_job(state: AuthoringState, job_id: str, char_id: str,
                    target: str, prompt: str, seed: int):
    try:
        ref = state.reference_root / char_id
        if target == "base":
            items = [("base", ref / "raw-base.png", ref / f"sprites-{char_id}.png")]
        elif target == "visemes":
            items = [
                (key, ref / "viseme-tiles" / f"viseme-{key}.png",
                 ref / "viseme-cutouts" / f"head-{key}.png")
                for key in VISEMES
            ]
        else:
            raise ValueError("target must be base or visemes")
        state.update_job(job_id, status="running", total=len(items), completed=0)
        for index, (label, source, destination) in enumerate(items):
            state.update_job(job_id, current=label, remote_job=None,
                             message=f"Extracting {label} ({index + 1}/{len(items)})")
            extract_one(
                state, source, destination, prompt, seed,
                lambda rid: state.update_job(job_id, remote_job=rid),
            )
            state.update_job(job_id, completed=index + 1)
        state.update_job(job_id, status="completed", current=None,
                         message=f"Finished {len(items)} extraction(s)")
    except Exception as exc:  # surfaced to the authoring UI
        state.update_job(job_id, status="failed", error=str(exc),
                         message="Extraction failed")


def mapped_rhubarb_cues(raw: dict) -> dict:
    """Convert Rhubarb A-H/X shapes without erasing source boundaries."""
    cues = []
    for cue in raw.get("mouthCues", []):
        source_value = str(cue.get("value", "X")).upper()
        cues.append({
            "start": round(float(cue.get("start", 0)), 3),
            "end": round(float(cue.get("end", 0)), 3),
            "value": RHU_TO_VISEME.get(source_value, "rest"),
            "sourceValue": source_value,
        })
    duration = float(raw.get("metadata", {}).get("duration", cues[-1]["end"] if cues else 0))
    return {
        "metadata": {"duration": round(duration, 3), "source": "rhubarb-1.14"},
        "mouthCues": cues,
    }


def normalized_phone(label: str) -> str:
    return re.sub(r"\d", "", str(label).strip().upper())


def viseme_for_phone(label: str) -> str:
    phone = normalized_phone(label)
    if phone in SILENCE_PHONES:
        return "rest"
    return ARPA_TO_VISEME.get(phone, "ts")


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as handle:
        return handle.getnframes() / handle.getframerate()


def detect_silences(ffmpeg: str, pcm: Path) -> list[tuple[float, float]]:
    """Find meaningful quiet spans; these override falsely active aligner cues."""
    result = subprocess.run([
        ffmpeg, "-hide_banner", "-nostats", "-i", str(pcm),
        "-af", "silencedetect=noise=-40dB:d=0.10", "-f", "null", "-",
    ], check=False, capture_output=True, text=True, timeout=180)
    starts: list[float] = []
    spans: list[tuple[float, float]] = []
    for line in result.stderr.splitlines():
        start_match = re.search(r"silence_start:\s*([0-9.]+)", line)
        if start_match:
            starts.append(float(start_match.group(1)))
        end_match = re.search(r"silence_end:\s*([0-9.]+)", line)
        if end_match and starts:
            spans.append((starts.pop(0), float(end_match.group(1))))
    duration = wav_duration(pcm)
    spans.extend((start, duration) for start in starts)
    return [(max(0.0, start), min(duration, end)) for start, end in spans if end - start >= 0.095]


def apply_silence_rest(cues: list[dict], duration: float,
                       silences: list[tuple[float, float]]) -> list[dict]:
    """Split at acoustic silence boundaries while preserving phone/source cues."""
    boundaries = {0.0, duration}
    for cue in cues:
        boundaries.update((max(0.0, float(cue["start"])), min(duration, float(cue["end"]))))
    for start, end in silences:
        boundaries.update((start, end))
    points = sorted(x for x in boundaries if 0 <= x <= duration)
    output = []
    for start, end in zip(points, points[1:]):
        if end - start < 0.004:
            continue
        mid = (start + end) / 2
        quiet = any(s <= mid < e for s, e in silences)
        source = next((cue for cue in cues if float(cue["start"]) <= mid < float(cue["end"])), None)
        item = {
            "start": round(start, 3), "end": round(end, 3),
            "value": "rest" if quiet or source is None else source["value"],
        }
        if quiet:
            item["sourceValue"] = "silence"
        elif source:
            for key in ("phone", "sourceValue"):
                if source.get(key) is not None:
                    item[key] = source[key]
        output.append(item)
    return output


def run_mfa_alignment(state: AuthoringState, pcm: Path, transcript: str,
                      temp_dir: Path) -> dict:
    if not state.mfa_available:
        raise RuntimeError("MFA executable is unavailable; set QLOBE_MFA_BIN or launch with --mfa-bin")
    if not transcript.strip():
        raise RuntimeError("MFA requires a reviewed transcript")
    dialog = temp_dir / "dialog.txt"
    alignment = temp_dir / "alignment.json"
    dialog.write_text(transcript.strip() + "\n", "utf-8")
    executable = shutil.which(state.mfa_bin or "") or str(state.mfa_bin)
    command = [
        executable, "align_one", str(pcm), str(dialog),
        state.mfa_dictionary, state.mfa_acoustic_model, str(alignment),
        "--output_format", "json",
    ]
    mfa_path = str(Path(executable).resolve().parent)
    try:
        subprocess.run(
            command, check=True, capture_output=True, text=True, timeout=15 * 60,
            env={
                **os.environ, "MFA_ROOT_DIR": state.mfa_root,
                "PATH": f"{mfa_path}{os.pathsep}{os.environ.get('PATH', '')}",
            },
        )
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or str(exc)).strip()
        raise RuntimeError(f"MFA alignment failed: {detail}") from exc
    if not alignment.exists():
        matches = sorted(temp_dir.glob("*.json"), key=lambda path: path.stat().st_mtime, reverse=True)
        if not matches:
            raise RuntimeError("MFA completed without producing alignment JSON")
        alignment = matches[0]
    raw = json.loads(alignment.read_text("utf-8"))
    tiers = raw.get("tiers", {})
    phone_tier = next((tier for name, tier in tiers.items() if name.lower().endswith("phones")), None)
    if not phone_tier:
        raise RuntimeError(f"MFA alignment contains no phone tier: {', '.join(tiers)}")
    cues = []
    for entry in phone_tier.get("entries", []):
        if len(entry) < 3:
            continue
        start, end, label = float(entry[0]), float(entry[1]), str(entry[2])
        if end <= start:
            continue
        cues.append({
            "start": round(start, 3), "end": round(end, 3),
            "value": viseme_for_phone(label), "phone": label,
        })
    if not cues:
        raise RuntimeError("MFA phone tier is empty")
    duration = float(raw.get("end", cues[-1]["end"]))
    return {
        "metadata": {
            "duration": round(duration, 3), "source": "montreal-forced-aligner",
            "dictionary": state.mfa_dictionary, "acousticModel": state.mfa_acoustic_model,
        },
        "mouthCues": cues,
    }


def run_rhubarb_alignment(state: AuthoringState, pcm: Path, transcript: str,
                          temp_dir: Path) -> dict:
    if not state.rhubarb_available:
        raise RuntimeError(f"Rhubarb executable not found: {state.rhubarb_bin}")
    raw_cues = temp_dir / "rhubarb.json"
    command = [str(state.rhubarb_bin), "-f", "json", "--extendedShapes", "GHX", "-o", str(raw_cues)]
    if transcript:
        dialog = temp_dir / "rhubarb-dialog.txt"
        dialog.write_text(transcript, "utf-8")
        command.extend(["-d", str(dialog)])
    command.append(str(pcm))
    subprocess.run(command, check=True, capture_output=True, text=True, timeout=600)
    return mapped_rhubarb_cues(json.loads(raw_cues.read_text("utf-8")))


def run_whisper_visemes_alignment(state: AuthoringState, pcm: Path, temp_dir: Path) -> dict:
    """Canonical DEFAULT aligner (spec §10): faster-whisper word timestamps +
    CMUdict phonemes mapped straight to the 9-viseme set + rest — the chain that
    actually produced the shipping cues (e.g. the bear's). It runs
    tools/lipsync/whisper-visemes.py inside its machine-specific, git-ignored venv
    (tools/lipsync/venv); the server adds NO pip dependencies of its own and only
    invokes the venv as a subprocess. When the venv is absent the aligner is
    unavailable and run_voice_job falls through to MFA, then Rhubarb.

    (Rhubarb is the last-resort fallback: its prebuilt macOS binary segfaults on
    macOS 14, which is why whisper-visemes exists and is the default here.)"""
    if not state.whisper_visemes_available:
        raise RuntimeError(f"whisper-visemes venv unavailable: {state.whisper_visemes_python}")
    clip = temp_dir / "whisper-input.wav"          # the script writes cues next to its input
    shutil.copyfile(pcm, clip)
    cues_path = temp_dir / "whisper-input.cues.json"
    result = subprocess.run(
        [str(state.whisper_visemes_python), str(state.whisper_visemes_script), str(clip)],
        check=False, capture_output=True, text=True, timeout=15 * 60,
    )
    if result.returncode != 0 or not cues_path.is_file():
        detail = (result.stderr or result.stdout or "no output").strip()[:500]
        raise RuntimeError(f"whisper-visemes failed: {detail}")
    raw = json.loads(cues_path.read_text("utf-8"))
    cues = raw.get("mouthCues") or []
    if not cues:
        raise RuntimeError("whisper-visemes produced no cues")
    duration = float(raw.get("metadata", {}).get("duration", cues[-1].get("end", 0)))
    return {
        "metadata": {"duration": round(duration, 3), "source": "faster-whisper+cmudict"},
        "mouthCues": cues,
    }


def update_voice_manifest(state: AuthoringState, char_id: str, entry: dict):
    path = state.character_root / char_id / "voice" / "manifest.json"
    with state.lock:
        manifest = {"schemaVersion": 1, "lines": []}
        if path.exists():
            manifest = json.loads(path.read_text("utf-8"))
        lines = [line for line in manifest.get("lines", []) if line.get("id") != entry["id"]]
        lines.append(entry)
        lines.sort(key=lambda line: str(line.get("label", line.get("id", ""))).lower())
        manifest["schemaVersion"] = 1
        manifest["lines"] = lines
        atomic_write(path, json_bytes(manifest) + b"\n")


def voice_entries(state: AuthoringState, char_id: str) -> list[dict]:
    voice_dir = state.character_root / char_id / "voice"
    manifest_path = voice_dir / "manifest.json"
    if manifest_path.exists():
        return json.loads(manifest_path.read_text("utf-8")).get("lines", [])
    entries = []
    if voice_dir.exists():
        for cues in sorted(voice_dir.glob("*.cues.json")):
            key = cues.name.removesuffix(".cues.json")
            audio = next((voice_dir / f"{key}{ext}" for ext in (".m4a", ".mp3", ".wav")
                          if (voice_dir / f"{key}{ext}").exists()), None)
            if audio:
                entries.append({
                    "id": key, "label": key.replace("-", " ").title(),
                    "audio": audio.name, "cues": cues.name, "cueMap": "identity",
                })
    return entries


def studio_character_ids(state: AuthoringState) -> list[str]:
    """Character ids for the completeness census: registry objects ∪ shared/characters dirs.

    The registry (studio_registry_objects) is the primary source — today it only
    lists the 8 rigged puppets, since anim-only characters (portrait + voice, no
    rig) aren't wired into qlobe-studio-projects yet. Unioning in every directory
    under shared/characters keeps those anim-only characters visible in the
    census instead of disappearing until someone remembers to register them.
    """
    ids = set()
    try:
        for obj in studio_registry_objects(state):
            if obj.get("type") == "character" and isinstance(obj.get("id"), str) and ID_RE.fullmatch(obj["id"]):
                ids.add(obj["id"])
    except ValueError:
        pass
    if state.character_root.exists():
        ids.update(p.name for p in state.character_root.iterdir() if p.is_dir() and ID_RE.fullmatch(p.name))
    return sorted(ids)


def studio_character_completeness(state: AuthoringState, char_id: str) -> dict:
    """One character's build-out census for GET /api/studio/completeness."""
    char = state.character_root / char_id
    rig_path = char / "rig.json"
    rig = rig_path.is_file()
    tier = "anim-only"
    if rig:
        try:
            rig_doc = json.loads(rig_path.read_text("utf-8"))
            if isinstance(rig_doc, dict) and isinstance(rig_doc.get("bones"), list) and rig_doc["bones"]:
                tier = "rigged"
        except (ValueError, OSError):
            pass
    parts_have = sum((char / "parts" / f"{bone}.png").is_file() for bone in BONES)
    viseme_have = sum((char / "anim" / f"head-{viseme}.png").is_file() for viseme in VISEMES)
    rest_head = (char / "parts" / "head.png").is_file() or (char / "anim" / "head-rest.png").is_file()
    voice_lines = len(voice_entries(state, char_id))
    voice_dir = char / "voice"
    voice_cues = len(list(voice_dir.glob("*.cues.json"))) if voice_dir.is_dir() else 0
    portrait = (char / "portrait.png").is_file()
    if tier == "rigged":
        complete = rig and parts_have == len(BONES) and viseme_have == len(VISEMES) and voice_lines > 0
    else:
        complete = portrait
    return {
        "id": char_id,
        "tier": tier,
        "rig": rig,
        "parts": {"have": parts_have, "need": len(BONES)},
        "visemeHeads": {"have": viseme_have, "need": len(VISEMES)},
        "restHead": rest_head,
        "voiceLines": voice_lines,
        "voiceCues": voice_cues,
        "portrait": portrait,
        "complete": complete,
    }


def run_voice_job(state: AuthoringState, job_id: str, char_id: str, key: str,
                  label: str, transcript: str, requested_aligner: str, lead_ms: int,
                  temp_dir: Path, source: Path):
    try:
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise RuntimeError("ffmpeg is required but was not found on PATH")

        pcm = temp_dir / "analysis.wav"
        encoded = temp_dir / f"{key}.m4a"
        state.update_job(job_id, status="running", message="Converting voice sample", progress=1)
        subprocess.run([
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
            "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(pcm),
        ], check=True, capture_output=True, text=True, timeout=180)

        state.update_job(job_id, message=f"Aligning speech with {requested_aligner}", progress=2)
        # Aligner chain (spec §10): whisper-visemes is the DEFAULT; MFA is an
        # optional upgrade when installed; Rhubarb is the last-resort fallback.
        # Each step records the actual aligner used and any fallback reason.
        fallback_reason = None
        if requested_aligner == "whisper":
            try:
                cues = run_whisper_visemes_alignment(state, pcm, temp_dir)
                actual_aligner = "faster-whisper+cmudict"
            except Exception as exc:
                fallback_reason = f"whisper-visemes: {exc}"
                state.update_job(job_id, message="whisper-visemes unavailable; trying MFA", fallback=fallback_reason)
                try:
                    cues = run_mfa_alignment(state, pcm, transcript, temp_dir)
                    actual_aligner = "mfa"
                except Exception as mfa_exc:
                    fallback_reason = f"{fallback_reason}; mfa: {mfa_exc}"
                    state.update_job(job_id, message="MFA unavailable; using Rhubarb fallback", fallback=fallback_reason)
                    cues = run_rhubarb_alignment(state, pcm, transcript, temp_dir)
                    actual_aligner = "rhubarb"
        elif requested_aligner == "mfa":
            try:
                cues = run_mfa_alignment(state, pcm, transcript, temp_dir)
                actual_aligner = "mfa"
            except Exception as exc:
                fallback_reason = str(exc)
                actual_aligner = "rhubarb"
                state.update_job(job_id, message="MFA unavailable or failed; using Rhubarb fallback", fallback=fallback_reason)
                cues = run_rhubarb_alignment(state, pcm, transcript, temp_dir)
        else:
            cues = run_rhubarb_alignment(state, pcm, transcript, temp_dir)
            actual_aligner = "rhubarb"

        duration = wav_duration(pcm)
        silences = detect_silences(ffmpeg, pcm)
        # MFA explicitly aligns quiet phones (F/S/K etc.) and silence; amplitude
        # gating would incorrectly erase those. Rhubarb benefits from the extra
        # silence override because its broad B shape can otherwise span pauses.
        applied_silences = silences if actual_aligner == "rhubarb" else []
        cues["mouthCues"] = apply_silence_rest(cues["mouthCues"], duration, applied_silences)
        cues["metadata"].update({
            "duration": round(duration, 3), "transcriptProvided": bool(transcript),
            "silenceDetection": {
                "thresholdDb": -40, "minimumMs": 100, "spans": len(silences),
                "applied": actual_aligner == "rhubarb",
            },
            "suggestedOffsetMs": lead_ms,
            **({"fallbackFrom": requested_aligner, "fallbackReason": fallback_reason} if fallback_reason else {}),
        })

        state.update_job(job_id, message="Encoding browser audio", progress=3)
        subprocess.run([
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
            "-vn", "-c:a", "aac", "-b:a", "96000", "-movflags", "+faststart", str(encoded),
        ], check=True, capture_output=True, text=True, timeout=180)

        voice_dir = state.character_root / char_id / "voice"
        audio_out = voice_dir / f"{key}.m4a"
        cues_out = voice_dir / f"{key}.cues.json"
        atomic_write(audio_out, encoded.read_bytes())
        atomic_write(cues_out, json_bytes(cues) + b"\n")
        update_voice_manifest(state, char_id, {
            "id": key, "label": label, "audio": f"{key}.m4a",
            "cues": f"{key}.cues.json", "cueMap": "identity",
            "aligner": actual_aligner, "offsetMs": lead_ms,
            **({"text": transcript} if transcript else {}),
        })
        state.update_job(
            job_id, status="completed", progress=4,
            message=f"Saved {key}.m4a + {key}.cues.json",
            result={
                "audio": str(audio_out), "cues": str(cues_out),
                "cueCount": len(cues["mouthCues"]), "aligner": actual_aligner,
                "requestedAligner": requested_aligner, "fallback": fallback_reason,
            },
        )
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or str(exc)).strip()
        state.update_job(job_id, status="failed", error=detail, message="Voice cue generation failed")
    except Exception as exc:
        state.update_job(job_id, status="failed", error=str(exc), message="Voice cue generation failed")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def run_transcription_job(state: AuthoringState, job_id: str, temp_dir: Path, source: Path):
    try:
        if not state.whisper_url:
            raise RuntimeError("Whisper URL is not configured; restart with --whisper-url or --qwen-url")
        state.update_job(job_id, status="running", message="Transcribing...", progress=0)
        result = multipart_request(
            state.whisper_url, source,
            {"model_size": "base", "language": "en"},
            timeout=15 * 60, file_field="audio",
        )
        transcript = str(result.get("text", "")).strip()
        if not transcript:
            raise RuntimeError(f"Whisper returned no transcript: {result}")
        state.update_job(
            job_id, status="completed", message="Transcript ready", progress=1,
            result={"transcript": transcript},
        )
    except Exception as exc:
        state.update_job(job_id, status="failed", error=str(exc), message="Transcription failed")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def validated_cues(payload: dict) -> dict:
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    raw_cues = payload.get("mouthCues")
    if not isinstance(raw_cues, list) or len(raw_cues) > 5000:
        raise ValueError("mouthCues must be an array with at most 5000 entries")
    cues = []
    previous_end = 0.0
    for index, raw in enumerate(raw_cues):
        if not isinstance(raw, dict):
            raise ValueError(f"cue {index + 1} must be an object")
        start, end = float(raw.get("start", -1)), float(raw.get("end", -1))
        value = str(raw.get("value", ""))
        if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start:
            raise ValueError(f"cue {index + 1} has invalid times")
        if start + 0.001 < previous_end:
            raise ValueError(f"cue {index + 1} overlaps the preceding cue")
        if value not in ALL_VISEMES:
            raise ValueError(f"cue {index + 1} has unsupported viseme {value!r}")
        item = {"start": round(start, 3), "end": round(end, 3), "value": value}
        for key in ("phone", "sourceValue"):
            if raw.get(key) is not None:
                item[key] = str(raw[key])[:40]
        cues.append(item)
        previous_end = end
    duration = float(metadata.get("duration", previous_end))
    if not math.isfinite(duration) or duration < previous_end - 0.001:
        duration = previous_end
    return {
        "metadata": {
            **metadata, "duration": round(duration, 3),
            "editedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
        "mouthCues": cues,
    }


class PuppetStudioHandler(SimpleHTTPRequestHandler):
    server_version = "QLOBEStudio/1.0"

    @property
    def state(self) -> AuthoringState:
        return self.server.state  # type: ignore[attr-defined]

    def send_json(self, value, status=200):
        data = json_bytes(value)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def send_error_json(self, status: int, message: str):
        self.send_json({"ok": False, "error": message}, status)

    def read_body(self) -> bytes:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("invalid content length")
        if length < 1 or length > MAX_UPLOAD:
            raise ValueError("request body must be between 1 byte and 32 MB")
        return self.rfile.read(length)

    def read_json(self):
        return json.loads(self.read_body())

    # ---- shared speech handlers (served under both /api/studio/* and the frozen
    #      /api/puppet/* compat shim — one implementation, two routes) -----------
    def handle_voices(self, query):
        char_id = safe_id(query.get("id", [""])[0])
        return self.send_json({"ok": True, "voices": voice_entries(self.state, char_id)})

    def handle_voice_upload(self, query):
        char_id = safe_id(query.get("id", [""])[0])
        key = safe_id(query.get("key", [""])[0])
        label = query.get("label", [key.replace("-", " ").title()])[0].strip()[:100]
        transcript = query.get("transcript", [""])[0].strip()[:4000]
        aligner = query.get("aligner", ["whisper"])[0].lower()
        if aligner not in ("whisper", "mfa", "rhubarb"):
            raise ValueError("aligner must be whisper, mfa, or rhubarb")
        lead_ms = max(-200, min(400, int(query.get("leadMs", ["-40"])[0])))
        audio_format = query.get("format", [""])[0].lower().lstrip(".")
        overwrite = query.get("overwrite", ["false"])[0].lower() == "true"
        interactive = query.get("interactive", ["false"])[0].lower() == "true"
        if audio_format not in ("wav", "mp3"):
            raise ValueError("voice sample must be a .wav or .mp3 file")
        voice_dir = self.state.character_root / char_id / "voice"
        outputs = [voice_dir / f"{key}.m4a", voice_dir / f"{key}.cues.json"]
        existing = [path.name for path in outputs if path.exists()]
        if existing and not overwrite:
            return self.send_error_json(
                409, f"voice output already exists ({', '.join(existing)}); enable overwrite to replace it",
            )
        body = self.read_body()
        temp_dir = Path(tempfile.mkdtemp(prefix="qlobe-puppet-voice-"))
        source = temp_dir / f"upload.{audio_format}"
        source.write_bytes(body)
        job_id = self.state.enqueue(
            "voice",
            {"character": char_id, "key": key, "label": label or key, "transcript": transcript,
             "aligner": aligner, "leadMs": lead_ms, "tempDir": str(temp_dir), "source": str(source)},
            {"target": "voice", "character": char_id, "voice": key,
             "message": "Voice queued", "progress": 0, "total": 4},
            interactive=interactive,
        )
        return self.send_json({"ok": True, "jobId": job_id}, 202)

    def handle_cues_save(self, query):
        char_id = safe_id(query.get("id", [""])[0])
        key = safe_id(query.get("key", [""])[0])
        path = self.state.character_root / char_id / "voice" / f"{key}.cues.json"
        if not path.exists():
            return self.send_error_json(404, f"voice cues do not exist: {key}.cues.json")
        payload = validated_cues(self.read_json())
        atomic_write(path, json_bytes(payload) + b"\n")
        return self.send_json({"ok": True, "path": str(path), "cueCount": len(payload["mouthCues"])})

    def handle_transcribe(self, query):
        audio_format = query.get("format", [""])[0].lower().lstrip(".")
        if audio_format not in ("wav", "mp3"):
            raise ValueError("voice sample must be a .wav or .mp3 file")
        interactive = query.get("interactive", ["false"])[0].lower() == "true"
        body = self.read_body()
        temp_dir = Path(tempfile.mkdtemp(prefix="qlobe-puppet-transcribe-"))
        source = temp_dir / f"upload.{audio_format}"
        source.write_bytes(body)
        job_id = self.state.enqueue(
            "transcription",
            {"tempDir": str(temp_dir), "source": str(source)},
            {"target": "transcription", "message": "Transcription queued", "progress": 0, "total": 1},
            interactive=interactive,
        )
        return self.send_json({"ok": True, "jobId": job_id}, 202)

    def do_GET(self):
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/studio/status":
                return self.send_json({
                    "ok": True, "authoringServer": True,
                    "studio": "QLOBE Studio", "formatVersion": 1,
                    "root": str(self.state.root),
                })
            if parsed.path == "/api/studio/document":
                query = parse_qs(parsed.query)
                path = studio_document_path(self.state, query.get("path", [""])[0])
                if not path.is_file():
                    return self.send_error_json(404, f"Studio document does not exist: {path.relative_to(self.state.root)}")
                if path.stat().st_size > MAX_STUDIO_DOCUMENT:
                    raise ValueError("Studio document exceeds the 4 MB limit")
                return self.send_json({
                    "ok": True,
                    "path": str(path.relative_to(self.state.root)),
                    "document": json.loads(path.read_text("utf-8")),
                })
            if parsed.path == "/api/studio/objects":
                return self.send_json({
                    "ok": True, "formatVersion": 2,
                    "objects": studio_registry_objects(self.state),
                })
            if parsed.path == "/api/studio/usage-index":
                query = parse_qs(parsed.query)
                index_path = self.state.root / "shared" / "data" / "usage-index.json"
                if query.get("refresh", ["0"])[0] == "1":
                    node = shutil.which("node") or "node"
                    try:
                        result = subprocess.run(
                            [node, "tools/build-usage-index.mjs"],
                            cwd=self.state.root, capture_output=True, text=True, timeout=60,
                        )
                    except (OSError, subprocess.SubprocessError) as exc:
                        return self.send_error_json(500, str(exc))
                    if result.returncode != 0:
                        detail = (result.stderr or result.stdout or "usage index generator failed").strip()
                        return self.send_error_json(500, detail)
                if not index_path.is_file():
                    return self.send_error_json(404, "usage index not generated; POST ?refresh=1")
                return self.send_json({"ok": True, "index": json.loads(index_path.read_text("utf-8"))})
            if parsed.path == "/api/studio/completeness":
                query = parse_qs(parsed.query)
                census_type = query.get("type", [""])[0]
                if census_type != "character":
                    return self.send_error_json(400, "unsupported completeness type")
                characters = [
                    studio_character_completeness(self.state, char_id)
                    for char_id in studio_character_ids(self.state)
                ]
                return self.send_json({"ok": True, "type": "character", "characters": characters})
            if parsed.path == "/api/studio/jobs":
                query = parse_qs(parsed.query)
                status = query.get("status", [None])[0]
                if status and status not in JOB_STATUSES:
                    raise ValueError(f"unknown status filter: {status}")
                kind = query.get("type", [None])[0]
                jobs = [public_job(job) for job in self.state.store.list(status=status, kind=kind)]
                return self.send_json({"ok": True, "jobs": jobs})
            if parsed.path == "/api/studio/voices":
                return self.handle_voices(parse_qs(parsed.query))
            if parsed.path.startswith("/api/studio/jobs/"):
                job = self.state.store.get(parsed.path.rsplit("/", 1)[-1])
                return self.send_json({"ok": True, "job": public_job(job)}) if job else self.send_error_json(404, "job not found")
            # --- /api/puppet/* is a FROZEN COMPAT SHIM (Studio v2, updated Phase 3) ---
            # Bug fixes only; no new capabilities. The NATIVE studio workspaces now
            # call the /api/studio/* equivalents (voices/voice/cues/transcribe/jobs).
            # These /api/puppet/* handlers are RETAINED as a compat shim for the one
            # remaining embedded legacy builder — the Assemble canonical-puppet
            # profile loads shared/js/stage/puppet-studio.html?mode=build, whose
            # puppet-builder.js still calls /api/puppet/file + /api/puppet/qwen/extract
            # (+ the ?legacy=1 escape hatches use /api/puppet/voices etc.). Removal is
            # now gated on porting that Assemble profile off the iframe (deferred to
            # Phase 4 / a dedicated follow-up), NOT on the iframe retirement that
            # already happened. See docs/qlobe-studio-v2.md Appendix B (spec-staleness
            # item: Appendix B still schedules Phase 3 removal; reality is a retained
            # shim — the orchestrator amends the spec).
            if parsed.path == "/api/puppet/status":
                qwen = {"configured": bool(self.state.qwen_url), "reachable": False}
                if self.state.qwen_url:
                    try:
                        health = http_json(f"{self.state.qwen_url}/health", timeout=2)
                        qwen.update(reachable=True, health=health)
                    except Exception as exc:
                        qwen["error"] = str(exc)
                return self.send_json({
                    "ok": True, "authoringServer": True, "qwen": qwen,
                    "whisper": {"configured": bool(self.state.whisper_url)},
                    "aligners": {
                        "default": "whisper",
                        "whisperVisemes": {
                            "available": self.state.whisper_visemes_available,
                            "python": str(self.state.whisper_visemes_python),
                            "script": str(self.state.whisper_visemes_script),
                        },
                        "mfa": {
                            "available": self.state.mfa_available,
                            "binary": self.state.mfa_bin,
                            "dictionary": self.state.mfa_dictionary,
                            "acousticModel": self.state.mfa_acoustic_model,
                            "root": self.state.mfa_root,
                        },
                        "rhubarb": {
                            "available": self.state.rhubarb_available,
                            "binary": str(self.state.rhubarb_bin),
                        },
                    },
                    "referenceRoot": str(self.state.reference_root),
                    "characterRoot": str(self.state.character_root),
                })
            if parsed.path == "/api/puppet/projects":
                projects = []
                ids = set()
                if self.state.reference_root.exists():
                    ids.update(p.name for p in self.state.reference_root.iterdir() if p.is_dir())
                if self.state.character_root.exists():
                    ids.update(p.name for p in self.state.character_root.iterdir() if p.is_dir())
                for char_id in sorted(x for x in ids if ID_RE.fullmatch(x)):
                    ref = self.state.reference_root / char_id
                    char = self.state.character_root / char_id
                    projects.append({
                        "id": char_id,
                        "rawBase": (ref / "raw-base.png").exists(),
                        "visemeSheet": (ref / "head-visemes.png").exists(),
                        "sprites": (ref / f"sprites-{char_id}.png").exists(),
                        "tiles": sum((ref / "viseme-tiles" / f"viseme-{v}.png").exists() for v in VISEMES),
                        "cutouts": sum((ref / "viseme-cutouts" / f"head-{v}.png").exists() for v in VISEMES),
                        "parts": sum((char / "parts" / f"{b}.png").exists() for b in BONES),
                        "anim": sum((char / "anim" / f"head-{v}.png").exists() for v in ALL_VISEMES),
                        "voices": len(voice_entries(self.state, char_id)),
                        "rig": (char / "rig.json").exists(),
                    })
                return self.send_json({"ok": True, "projects": projects})
            if parsed.path == "/api/puppet/voices":
                return self.handle_voices(parse_qs(parsed.query))
            if parsed.path.startswith("/api/puppet/jobs/"):
                job = self.state.store.get(parsed.path.rsplit("/", 1)[-1])
                return self.send_json({"ok": True, "job": public_job(job)}) if job else self.send_error_json(404, "job not found")
            if parsed.path.startswith("/__puppet_files__/"):
                return self.serve_authoring_file(parsed.path)
        except (ValueError, OSError) as exc:
            return self.send_error_json(400, str(exc))
        return super().do_GET()

    def serve_authoring_file(self, request_path: str):
        parts = safe_relative(request_path[len("/__puppet_files__/"):]).parts
        if len(parts) < 3 or parts[0] not in ("source", "character"):
            return self.send_error_json(404, "file not found")
        char_id = safe_id(parts[1])
        base = self.state.reference_root if parts[0] == "source" else self.state.character_root
        path = base / char_id / Path(*parts[2:])
        resolved = path.resolve()
        if not resolved.is_relative_to((base / char_id).resolve()) or not resolved.is_file():
            return self.send_error_json(404, "file not found")
        data = resolved.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(resolved.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            # Cancel a queued job (no request body — matched before any body read).
            if parsed.path.startswith("/api/studio/jobs/") and parsed.path.endswith("/cancel"):
                job_id = parsed.path[len("/api/studio/jobs/"):-len("/cancel")]
                job = self.state.store.get(job_id)
                if not job:
                    return self.send_error_json(404, "job not found")
                if job.get("status") != "queued":
                    return self.send_error_json(409, f"job is {job.get('status')}; only queued jobs can be cancelled")
                updated = self.state.store.update(job_id, status="cancelled", message="Cancelled by request")
                self.state.scheduler.wake()
                return self.send_json({"ok": True, "job": public_job(updated)})
            # Native speech endpoints (/api/studio/*) — same handlers as the frozen
            # /api/puppet/* compat shim below.
            if parsed.path == "/api/studio/voice":
                return self.handle_voice_upload(parse_qs(parsed.query))
            if parsed.path == "/api/studio/cues":
                return self.handle_cues_save(parse_qs(parsed.query))
            if parsed.path == "/api/studio/transcribe":
                return self.handle_transcribe(parse_qs(parsed.query))
            if parsed.path == "/api/studio/document":
                query = parse_qs(parsed.query)
                path = studio_document_path(self.state, query.get("path", [""])[0])
                body = self.read_body()
                if len(body) > MAX_STUDIO_DOCUMENT:
                    raise ValueError("Studio document exceeds the 4 MB limit")
                document = json.loads(body)
                if not isinstance(document, (dict, list)):
                    raise ValueError("Studio document root must be an object or array")
                formatted = json.dumps(document, indent=2, ensure_ascii=False).encode("utf-8") + b"\n"
                atomic_write(path, formatted)
                return self.send_json({
                    "ok": True,
                    "path": str(path.relative_to(self.state.root)),
                    "bytes": len(formatted),
                })
            if parsed.path == "/api/studio/validate":
                payload = self.read_json()
                target = str(payload.get("target") or "").strip()
                if target and not VALIDATE_TARGET_RE.fullmatch(target):
                    raise ValueError("validate target must be lowercase kebab-case (max 65 characters)")
                node = shutil.which("node") or "node"
                args = [node, "tools/validate/run.mjs"] + ([target] if target else []) + ["--json"]
                try:
                    result = subprocess.run(
                        args, cwd=self.state.root, capture_output=True, text=True, timeout=120,
                    )
                except (OSError, subprocess.SubprocessError) as exc:
                    return self.send_error_json(500, str(exc))
                try:
                    report = json.loads(result.stdout)
                except json.JSONDecodeError:
                    excerpt = (result.stderr or result.stdout or "validator produced no output").strip()[:2000]
                    return self.send_error_json(500, excerpt)
                return self.send_json({"ok": True, "report": report})
            if parsed.path == "/api/studio/asset":
                query = parse_qs(parsed.query)
                path = studio_asset_path(self.state, query.get("path", [""])[0])
                body = self.read_body()
                suffix = path.suffix.lower()
                valid = ((suffix == ".png" and body.startswith(b"\x89PNG\r\n\x1a\n"))
                         or (suffix in (".jpg", ".jpeg") and body.startswith(b"\xff\xd8"))
                         or (suffix == ".webp" and body.startswith(b"RIFF") and body[8:12] == b"WEBP"))
                if not valid:
                    raise ValueError(f"uploaded bytes do not match the {suffix} file type")
                atomic_write(path, body)
                return self.send_json({"ok": True, "path": str(path.relative_to(self.state.root)), "bytes": len(body)})
            if parsed.path == "/api/studio/story-scene":
                payload = self.read_json()
                story_id = safe_story_id(str(payload.get("storyId", "")))
                prompt = str(payload.get("prompt", "")).strip()
                if len(prompt) < 80 or len(prompt) > 8000:
                    raise ValueError("story scene prompt must be between 80 and 8,000 characters")
                seed = max(0, min(2**32 - 1, int(payload.get("seed", 0))))
                overwrite = bool(payload.get("overwrite", False))
                destination = studio_asset_path(
                    self.state, f"games/story-stones/assets/backdrops/stories/{story_id}.webp"
                )
                if destination.exists() and not overwrite:
                    return self.send_error_json(409, f"{destination.name} already exists; enable overwrite to replace it")
                job_id = self.state.enqueue(
                    "story-scene",
                    {"storyId": story_id, "prompt": prompt, "seed": seed,
                     "destination": str(destination.relative_to(self.state.root))},
                    {"target": "story-scene", "storyId": story_id, "seed": seed,
                     "message": "Krea scene queued", "progress": 0, "total": 3},
                    interactive=bool(payload.get("interactive", False)),
                )
                return self.send_json({"ok": True, "jobId": job_id}, 202)
            if parsed.path == "/api/puppet/file":
                query = parse_qs(parsed.query)
                char_id = safe_id(query.get("id", [""])[0])
                kind = query.get("kind", [""])[0]
                overwrite = query.get("overwrite", ["false"])[0].lower() == "true"
                destination = destination_for(self.state, char_id, kind)
                if destination.exists() and not overwrite:
                    return self.send_error_json(409, f"{destination.name} already exists; enable overwrite to replace it")
                body = self.read_body()
                if kind == "rig":
                    json.loads(body)
                elif kind not in ("character-sheet",) and not body.startswith(b"\x89PNG\r\n\x1a\n"):
                    raise ValueError("image upload is not a PNG")
                atomic_write(destination, body)
                return self.send_json({"ok": True, "path": str(destination)})
            if parsed.path == "/api/puppet/qwen/extract":
                payload = self.read_json()
                char_id = safe_id(str(payload.get("id", "")))
                target = str(payload.get("target", ""))
                if target not in ("base", "visemes"):
                    raise ValueError("target must be base or visemes")
                prompt = str(payload.get("prompt", "")).strip()
                if not prompt:
                    raise ValueError("an explicit extraction prompt is required")
                seed = int(payload.get("seed", 42))
                overwrite = bool(payload.get("overwrite", False))
                ref = self.state.reference_root / char_id
                outputs = ([ref / f"sprites-{char_id}.png"] if target == "base" else [
                    ref / "viseme-cutouts" / f"head-{key}.png" for key in VISEMES
                ])
                existing = [path.name for path in outputs if path.exists()]
                if existing and not overwrite:
                    return self.send_error_json(
                        409,
                        f"extraction output already exists ({', '.join(existing[:3])}); enable overwrite to replace it",
                    )
                job_id = self.state.enqueue(
                    "extract",
                    {"character": char_id, "target": target, "prompt": prompt, "seed": seed},
                    {"target": target, "character": char_id, "seed": seed, "message": "Queued"},
                    interactive=bool(payload.get("interactive", False)),
                )
                return self.send_json({"ok": True, "jobId": job_id}, 202)
            if parsed.path == "/api/puppet/voice":       # frozen compat shim
                return self.handle_voice_upload(parse_qs(parsed.query))
            if parsed.path == "/api/puppet/cues":        # frozen compat shim
                return self.handle_cues_save(parse_qs(parsed.query))
            if parsed.path == "/api/puppet/transcribe":  # frozen compat shim
                return self.handle_transcribe(parse_qs(parsed.query))
        except json.JSONDecodeError:
            return self.send_error_json(400, "invalid JSON")
        except (ValueError, OSError, HTTPError, URLError) as exc:
            return self.send_error_json(400, str(exc))
        return self.send_error_json(404, "unknown authoring endpoint")

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")


def main():
    parser = argparse.ArgumentParser(description="Serve QLOBE Kids with QLOBE Studio authoring APIs")
    parser.add_argument("--host", default="127.0.0.1", help="bind host (localhost by default)")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--qwen-url", default=os.environ.get("QLOBE_QWEN_URL"),
                        help="local workflow API base URL (or QLOBE_QWEN_URL)")
    parser.add_argument("--whisper-url", default=os.environ.get("QLOBE_WHISPER_URL"),
                        help="Whisper workflow URL (defaults to <qwen-url>/workflows/whisper-stt?sync=true)")
    parser.add_argument("--mfa-bin", default=os.environ.get("QLOBE_MFA_BIN"),
                        help="MFA executable path (or QLOBE_MFA_BIN; otherwise searched on PATH)")
    parser.add_argument("--mfa-dictionary", default=os.environ.get("QLOBE_MFA_DICTIONARY", "english_us_arpa"),
                        help="MFA dictionary model name/path")
    parser.add_argument("--mfa-acoustic-model", default=os.environ.get("QLOBE_MFA_ACOUSTIC_MODEL", "english_us_arpa"),
                        help="MFA acoustic model name/path")
    parser.add_argument("--mfa-root", default=os.environ.get("QLOBE_MFA_ROOT"),
                        help="MFA model/cache directory (defaults to ~/.qlobe-mfa/data)")
    parser.add_argument("--whisper-visemes-python", default=os.environ.get("QLOBE_WHISPER_VISEMES_PYTHON"),
                        help="python for the whisper-visemes aligner venv (default tools/lipsync/venv/bin/python)")
    parser.add_argument("--whisper-visemes-script", default=os.environ.get("QLOBE_WHISPER_VISEMES_SCRIPT"),
                        help="whisper-visemes.py path (default tools/lipsync/whisper-visemes.py)")
    args = parser.parse_args()
    root = args.root.resolve()
    whisper_url = args.whisper_url or (
        f"{args.qwen_url.rstrip('/')}/workflows/whisper-stt?sync=true" if args.qwen_url else None
    )
    os.chdir(root)
    server = ThreadingHTTPServer((args.host, args.port), PuppetStudioHandler)
    state = AuthoringState(
        root, args.qwen_url, whisper_url,
        args.mfa_bin, args.mfa_dictionary, args.mfa_acoustic_model, args.mfa_root,
        args.whisper_visemes_python, args.whisper_visemes_script,
    )
    server.state = state  # type: ignore[attr-defined]
    state.recover_jobs()     # mark interrupted / re-queue resumable jobs from the store
    state.scheduler.start()  # single worker draining the workflow-batched queue
    default_aligner = "whisper-visemes" if state.whisper_visemes_available else (
        "mfa" if state.mfa_available else "rhubarb")
    print(f"QLOBE Studio authoring server: http://{args.host}:{args.port}/shared/js/studio/")
    print(f"Legacy Puppet Studio: http://{args.host}:{args.port}/shared/js/stage/puppet-studio.html")
    print(f"Repo root: {root}")
    print(f"Qwen API: {args.qwen_url or '(not configured)'}")
    print(f"Whisper API: {whisper_url or '(not configured)'}")
    print(f"Job store: {state.store.path} ({len(state.store.jobs)} job(s) loaded)")
    print(f"Aligner default: whisper-visemes {'(available)' if state.whisper_visemes_available else '(venv missing; will fall through to '+default_aligner+')'}")
    print(f"MFA: {state.mfa_bin or '(not found; Rhubarb fallback)'}")
    print(f"MFA models: {args.mfa_dictionary} / {args.mfa_acoustic_model}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping.")


if __name__ == "__main__":
    main()
