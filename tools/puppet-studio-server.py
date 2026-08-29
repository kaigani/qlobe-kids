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
from datetime import date
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
    # Phase 5 media generation. generate-image / cutout-chain carry their own
    # generation workflow per job (params.workflow), so their batch-grouping
    # workflow is set at enqueue time, not here.
    "generate-image": None,
    "cutout-chain": None,
    "generate-voice": "qwen3-tts-voiceclone",
    # Phase 6.1: background removal over an already-generated media object. It is
    # only ever the layered workflow, so it batches with every other extraction.
    "extract-media": "qwen-image-layered",
    # Phase 6.3 (Feature N): pose-actor assembly is purely local image work (PIL
    # via tools/pipeline/pose_actor_assemble.py) — no ComfyUI, so no workflow to
    # batch by. It never contends with the model queue and can run alongside it.
    "assemble-pose-actor": None,
}
# Kinds whose inputs live on disk (reference PNGs, prompt/seed) and are therefore
# safely re-queueable after a crash. voice/transcription depend on an uploaded
# temp file that is lost on restart, so they are not resumable. The Phase 5 media
# kinds carry their whole recipe (prompt/seed/workflow) in the persisted job
# dispatch, and generate-voice reads its text + the configured teacher voice from
# disk — so all three survive a restart mid-chain and re-run reproducibly.
RESUMABLE_KINDS = {"story-scene", "extract", "generate-image", "cutout-chain", "generate-voice",
                   "extract-media", "assemble-pose-actor"}

# Phase 5 media constants (spec §5.1, §7.6). The unassigned-media staging shelf.
MEDIA_ROOT = ("shared", "media")
# Image-generation workflow allow-list (from the local-genai skill catalog).
GENERATE_IMAGE_WORKFLOWS = {
    "krea2-turbo-t2i", "flux2-t2i", "flux2-klein-edit",
    "ideogram4-t2i", "z-image-base-t2i", "qwen-image-edit",
}
# Workflows that consume an input reference image (an edit, not text-to-image).
EDIT_WORKFLOWS = {"flux2-klein-edit", "qwen-image-edit"}
LAYERED_WORKFLOW = "qwen-image-layered"
VOICE_CLONE_WORKFLOW = "qwen3-tts-voiceclone"
# Resize targets for the cutout finalize, per subject class (spec §5.1 / WP-5a).
CUTOUT_TARGET_SIZES = {"character": 420, "object": 400, "prop": 640}
# The flat dark ground the cutout standard generates onto (local-genai skill).
DARK_GROUND_SUFFIX = (" The background is a perfectly flat, solid, uniform dark charcoal "
                      "background, no gradient, no texture, no shadows on the background.")

# --- pose actors (spec §7.6 pose-actor recipes / §10, Feature N) -------------
# The six semantic poses of the storybook pose builder, in the order the pose set
# is generated and the contact strip is laid out. `neutral` is load-bearing: the
# runtime (shared/js/stage/pose-sprite.js) requires poses.neutral and falls back
# to it for any unknown pose name.
POSE_SET = ("neutral", "enter", "notice", "interact", "react", "celebrate")
# The normalized stage canvas the qlobe-pose-actor format describes. Kept in one
# place and passed to the PIL helper, which owns the actual pixel math.
POSE_CANVAS = 1024
POSE_MAX_ART = 900
POSE_BASELINE = 972
POSE_TRANSITIONS = ("paper-pop", "cut")
# The media-object suffix an assembled actor takes: <actorId>-pose-actor.
POSE_ACTOR_SUFFIX = "-pose-actor"
# Which accepted media a "Send to Assemble" can feed into the canonical-puppet
# build pipeline, and the /api/puppet/file `kind` (i.e. the on-disk source name)
# it lands as. Both are the two author-supplied sheets of docs/puppet-pipeline.md.
SEND_TO_ASSEMBLE_SLOTS = {
    "character-body-sheet": "raw-base",
    "character-viseme-grid": "head-visemes",
}


def load_local_config(root: Path) -> dict:
    """Machine-specific settings the server reads once at boot (git-ignored).

    tools/state/local.json holds everything that must NOT live in the public
    repo — above all the LAN GenAI host address — plus the teacher-voice
    reference path and named style refs. Flags/env still win over it. Absent or
    corrupt file => empty config (the server then relies on flags/env)."""
    path = root / "tools" / "state" / "local.json"
    try:
        data = json.loads(path.read_text("utf-8"))
        return data if isinstance(data, dict) else {}
    except (ValueError, OSError):
        return {}


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
        self.media_root = self.root / Path(*MEDIA_ROOT)
        # Machine-specifics (git-ignored). Flags/env override every field here.
        self.local = load_local_config(self.root)
        qwen_url = qwen_url or self.local.get("qwenUrl")
        self.qwen_url = qwen_url.rstrip("/") if qwen_url else None
        # The teacher-voice clone reference and the interpreter that runs the
        # PIL-backed cutout finalize helper — both resolved abstractly here; the
        # host/paths themselves come from the git-ignored local config, never code.
        teacher = self.local.get("teacherVoicePath")
        self.teacher_voice_path = Path(os.path.expanduser(teacher)) if teacher else None
        if self.teacher_voice_path is None:
            # Fall back to the committed anchor so a fresh checkout can run the
            # voice templates with no local config. The file is FLAC data under a
            # .wav name — deliberate: it is the exact byte stream the clone
            # workflow has always been fed, and nothing here parses it (it is
            # posted verbatim by run_generate_voice_job; the `wave` module is
            # only ever pointed at aligner PCM).
            committed = self.root / "shared" / "assets" / "refs" / "voice-teacher.wav"
            if committed.is_file():
                self.teacher_voice_path = committed
        self.cutout_python = os.path.expanduser(self.local.get("cutoutPython") or "python3")
        self.style_refs = self.local.get("styleRefs") if isinstance(self.local.get("styleRefs"), dict) else {}
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

    def enqueue(self, kind: str, dispatch: dict, extra: dict, interactive: bool = False,
                workflow: str | None = None) -> str:
        """Create a persistent job and hand it to the scheduler.

        Non-interactive jobs join the workflow-batched queue; interactive:true
        one-offs bypass batching and run immediately. `workflow` overrides the
        static WORKFLOW_FOR_KIND map for kinds (generate-image / cutout-chain)
        whose ComfyUI workflow is chosen per job."""
        job_id = uuid.uuid4().hex[:12]
        record = {
            "id": job_id, "kind": kind, "workflow": workflow or WORKFLOW_FOR_KIND.get(kind),
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
            elif kind == "generate-image":
                run_generate_image_job(self, job_id, d)
            elif kind == "cutout-chain":
                run_cutout_chain_job(self, job_id, d)
            elif kind == "extract-media":
                run_extract_media_job(self, job_id, d)
            elif kind == "assemble-pose-actor":
                run_assemble_pose_actor_job(self, job_id, d)
            elif kind == "generate-voice":
                run_generate_voice_job(self, job_id, d)
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
    elif len(parts) >= 3 and parts[:2] == MEDIA_ROOT:
        safe_id(parts[2]); allowed = True
    elif len(parts) >= 3 and parts[0] == "games":
        safe_id(parts[1]); allowed = True
    if not allowed or relative.suffix.lower() != ".json":
        raise ValueError("Studio documents must be JSON under shared/characters, shared/props, shared/media, or games/<id>")
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
    media = False
    if len(parts) >= 4 and parts[0] == "games" and parts[2] == "assets":
        safe_id(parts[1]); allowed = True
    elif len(parts) >= 4 and parts[:2] == ("shared", "characters"):
        safe_id(parts[2]); allowed = True
    elif len(parts) >= 3 and parts[:2] == ("shared", "props"):
        safe_id(parts[2]); allowed = True
    elif len(parts) >= 3 and parts[:2] == MEDIA_ROOT:
        safe_id(parts[2]); allowed = True; media = True
    # Media objects additionally carry audio (voice lines) alongside images.
    suffixes = (".png", ".jpg", ".jpeg", ".webp", ".m4a") if media else (".png", ".jpg", ".jpeg", ".webp")
    if not allowed or relative.suffix.lower() not in suffixes:
        raise ValueError("Studio assets must be PNG, JPEG, or WebP under a game/shared asset root (or .m4a under shared/media)")
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


GAME_STATUSES = ("live", "beta", "in-design", "proposed", "archived")


def set_game_status(state: AuthoringState, game_id: str, status: str) -> dict:
    """Flip a game's status in both registries (root games.json + game.json).

    games.json round-trips byte-identically through json.dumps(indent=2,
    ensure_ascii=False) with no trailing newline, so a full round-trip is
    safe; game.json gets a targeted status-line replacement so its
    formatting is never disturbed.

    A fresh transition into "live" also stamps liveDate (ISO date, today) in
    both files, so the hub can feature the most-recently-launched games.
    """
    game_id = safe_id(game_id)
    if status not in GAME_STATUSES:
        raise ValueError("status must be one of: " + ", ".join(GAME_STATUSES))
    registry_path = state.root / "games.json"
    registry = json.loads(registry_path.read_text("utf-8"))
    entry = next((g for g in registry.get("games", []) if g.get("id") == game_id), None)
    if entry is None:
        raise ValueError(f"{game_id} is not registered in games.json")
    previous = entry.get("status")
    entry["status"] = status
    newly_live = status == "live" and previous != "live"
    live_date = date.today().isoformat() if newly_live else None
    if live_date:
        entry["liveDate"] = live_date
    manifest_path = state.root / "games" / game_id / "game.json"
    manifest_text = None
    if manifest_path.is_file():
        original = manifest_path.read_text("utf-8")
        manifest_text, count = re.subn(
            r'("status"\s*:\s*")[a-z-]+(")', rf"\g<1>{status}\g<2>", original, count=1)
        if count != 1:
            raise ValueError(f"could not locate a status field in games/{game_id}/game.json")
        if live_date:
            if re.search(r'"liveDate"\s*:\s*"[^"]*"', manifest_text):
                manifest_text = re.sub(
                    r'("liveDate"\s*:\s*")[^"]*(")', rf"\g<1>{live_date}\g<2>", manifest_text, count=1)
            else:
                manifest_text = re.sub(
                    r'^(\s*)("status"\s*:\s*"[a-z-]+"\s*,?\s*)$',
                    rf'\g<1>\g<2>\n\g<1>"liveDate": "{live_date}",',
                    manifest_text, count=1, flags=re.MULTILINE)
    atomic_write(registry_path, json.dumps(registry, indent=2, ensure_ascii=False).encode("utf-8"))
    if manifest_text is not None:
        atomic_write(manifest_path, manifest_text.encode("utf-8"))
    return {"id": game_id, "status": status, "previous": previous, "liveDate": live_date}


def http_json(url: str, timeout=8):
    with urlopen(url, timeout=timeout) as response:
        return json.load(response)


def multipart_request(url: str, file_path: Path, fields: dict[str, str], timeout=60,
                      file_field="image", extra_files: dict[str, Path] | None = None):
    """Multipart POST of one (or more) files plus plain fields.

    `extra_files` is how a workflow's SECOND reference travels — qwen-image-edit
    accepts image2/image3 beside image, which is what a template's `identity`
    refSlot dispatches to (spec §7.7)."""
    boundary = f"----qlobe-{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            str(value).encode(), b"\r\n",
        ])
    for name, path in [(file_field, file_path), *sorted((extra_files or {}).items())]:
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"; filename="{path.name}"\r\n'.encode(),
            f"Content-Type: {mimetypes.guess_type(path.name)[0] or 'application/octet-stream'}\r\n\r\n".encode(),
            path.read_bytes(), b"\r\n",
        ])
    chunks.extend([
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


# =====================================================================
# Phase 5 — Media & Generation (spec §5.1 unassigned media, §7.6 qlobe-recipe)
# =====================================================================

def multipart_bytes_request(url: str, file_path: Path, fields: dict, timeout=900,
                            file_field="image") -> bytes:
    """Like multipart_request but returns the raw response body (a generated file),
    for ?sync=true workflows that stream bytes back instead of a job-id JSON."""
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
        return response.read(MAX_UPLOAD + 1)


def submit_and_poll_image(state: AuthoringState, workflow: str, fields: dict,
                          image: Path | None = None, output: str | None = None,
                          on_remote_job=None, image2: Path | None = None) -> bytes:
    """Generic async ComfyUI image workflow: POST (fields, optional ref image) ->
    poll /jobs/<id> -> GET the result bytes. Generalizes run_story_scene_job (t2i)
    and extract_one (layered) into one path so every Phase 5 image step shares it.

    `image2` is the optional second reference an edit workflow accepts (structure
    in one picture, identity in the other) — only ever sent when a template
    declares an `identity` refSlot and the run fills it."""
    if not state.qwen_url:
        raise RuntimeError("local workflow URL is not configured; set qwenUrl (local config) or --qwen-url")
    url = f"{state.qwen_url}/workflows/{workflow}"
    if image is not None:
        submitted = multipart_request(url, image, fields, timeout=120, file_field="image",
                                      extra_files={"image2": image2} if image2 is not None else None)
    else:
        submitted = multipart_fields_request(url, fields, timeout=120)
    remote_id = submitted.get("job_id") or submitted.get("id")
    if not remote_id:
        raise RuntimeError(f"{workflow} did not return a job id: {submitted}")
    if on_remote_job:
        on_remote_job(str(remote_id))
    deadline = time.time() + 30 * 60
    while time.time() < deadline:
        remote = http_json(f"{state.qwen_url}/jobs/{remote_id}", timeout=20)
        status = str(remote.get("status", "")).lower()
        if status in ("completed", "complete", "succeeded", "success"):
            break
        if status in ("failed", "error", "cancelled", "canceled"):
            raise RuntimeError(remote.get("error") or f"{workflow} job {status}")
        time.sleep(2)
    else:
        raise TimeoutError(f"{workflow} exceeded 30 minutes")
    result_url = f"{state.qwen_url}/jobs/{remote_id}/result" + (f"?output={output}" if output else "")
    with urlopen(result_url, timeout=180) as response:
        data = response.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise RuntimeError(f"{workflow} result exceeded 32 MB")
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError(f"{workflow} result was not a PNG")
    return data


def safe_media_id(value: str) -> str:
    if not ID_RE.fullmatch(value or ""):
        raise ValueError("media id must be lowercase kebab-case (max 40 characters)")
    return value


def media_dir(state: AuthoringState, media_id: str) -> Path:
    """The validated shared/media/<id>/ folder for one media object."""
    destination = (state.media_root / safe_media_id(media_id)).resolve()
    if not destination.is_relative_to(state.media_root.resolve()):
        raise ValueError("unsafe media path")
    return destination


def write_recipe(folder: Path, recipe: dict):
    atomic_write(folder / "recipe.json", json_bytes(recipe) + b"\n")


def resolve_style_ref(state: AuthoringState, ref: str) -> Path:
    """Resolve a SYMBOLIC style ref to a real file for the network call only —
    the symbolic form ("shared:objects/cat.webp" or a named local styleRefs key) is
    what the recipe stores; the machine path never is."""
    if not ref:
        raise ValueError("an edit workflow requires a style ref")
    if ref in state.style_refs:
        path = Path(os.path.expanduser(state.style_refs[ref]))
        if not path.is_file():
            raise ValueError(f"configured style ref {ref!r} not found on disk")
        return path
    if ref.startswith("shared:"):
        rel = safe_relative(ref[len("shared:"):])
        path = (state.root / "shared" / "assets" / rel).resolve()
        if not path.is_relative_to((state.root / "shared" / "assets").resolve()) or not path.is_file():
            raise ValueError(f"style ref {ref!r} does not resolve under shared/assets")
        return path
    if ref.startswith("media:"):
        # A staged shared/media/ object used as a per-run reference — what the
        # gallery chooser's "media" source offers, and the only way a concept
        # screen or a body sheet that has not been assigned yet can feed an edit
        # workflow. Symbolic like shared:, and resolved through the object's own
        # recipe: a cutout chain's final asset is not always <id>.png.
        folder = media_dir(state, ref[len("media:"):])
        asset = ""
        try:
            asset = str(json.loads((folder / "recipe.json").read_text("utf-8")).get("asset") or "")
        except (ValueError, OSError):
            asset = ""
        path = (folder / (asset or f"{folder.name}.png")).resolve()
        if not path.is_relative_to(state.media_root.resolve()) or not path.is_file():
            raise ValueError(f"media ref {ref!r} does not resolve to a staged asset")
        return path
    raise ValueError(f"unsupported style ref {ref!r} (use 'shared:<path>', 'media:<id>' or a configured styleRefs key)")


# --- generate templates (spec §7.7) -----------------------------------------
# The committed registry of generation recipes. The server is the ONLY place a
# template is expanded into a prompt (spec §10): the studio posts a template id +
# field values, never a prompt, so the client cannot drift from the registry.
GENERATE_TEMPLATES_REL = ("shared", "data", "generate-templates.json")
# {fieldName} plus the one reserved slot {style.suffix}; there is no escape
# syntax, so anything brace-wrapped that is neither is a client-visible error.
SLOT_RE = re.compile(r"\{([^{}]*)\}")
STYLE_SUFFIX_SLOT = "style.suffix"
# Only these template keys may be overridden by a variants.<styleId> block
# (shallow merge, no inheritance chain — spec §7.7).
VARIANT_KEYS = ("prompt", "workflow", "width", "height", "seed", "refs")
_templates_cache: dict = {"mtime": None, "size": None, "doc": None}
_templates_lock = threading.Lock()


def load_generate_templates(state: AuthoringState) -> dict:
    """Lazy, mtime-cached read of shared/data/generate-templates.json.

    Cached so the per-request GET and every enqueue share one parse, invalidated
    on mtime/size so editing the registry takes effect without a restart."""
    path = state.root / Path(*GENERATE_TEMPLATES_REL)
    try:
        stat = path.stat()
    except OSError:
        raise ValueError("generate template registry not found at shared/data/generate-templates.json")
    with _templates_lock:
        if _templates_cache["doc"] is not None and _templates_cache["mtime"] == stat.st_mtime_ns \
                and _templates_cache["size"] == stat.st_size:
            return _templates_cache["doc"]
        doc = json.loads(path.read_text("utf-8"))
        if not isinstance(doc, dict) or doc.get("format") != "qlobe-generate-templates":
            raise ValueError("shared/data/generate-templates.json is not a qlobe-generate-templates document")
        _templates_cache.update(mtime=stat.st_mtime_ns, size=stat.st_size, doc=doc)
        return doc


def substitute_slots(text: str, values: dict) -> str:
    """Fill {slot}s from values in ONE pass (field values are never re-scanned,
    so a prompt cannot be injected through a field). Unknown slot -> ValueError."""
    def replace(match):
        name = match.group(1).strip()
        if name not in values or values[name] is None:
            raise ValueError(f"unresolved slot {{{match.group(1)}}} — no such field"
                             if name != STYLE_SUFFIX_SLOT else
                             "prompt uses {style.suffix} but no style was resolved")
        return str(values[name])
    return SLOT_RE.sub(replace, text)


def values_block(values: dict) -> dict:
    """The field values a recipe records — the reserved style slot is not a field."""
    return {k: v for k, v in values.items() if k != STYLE_SUFFIX_SLOT}


def expand_template(state: AuthoringState, template_id: str, style_id: str | None,
                    fields: dict | None, overrides: dict | None = None) -> tuple[str, dict, dict]:
    """Expand a registry template into (kind, params, template_block).

    `params` is the SAME shape POST /api/studio/generate already accepts as a raw
    body, so an expanded template falls into the existing validation + enqueue
    branches unchanged; `template_block` is what the recipe records (spec §7.7).
    Pure apart from the registry read and ref resolution — unit-testable without
    HTTP. Every failure here is a client mistake and must surface as a 4xx."""
    registry = load_generate_templates(state)
    templates = registry.get("templates") if isinstance(registry.get("templates"), list) else []
    styles = registry.get("styles") if isinstance(registry.get("styles"), dict) else {}
    template = next((t for t in templates if isinstance(t, dict) and t.get("id") == template_id), None)
    if template is None:
        raise ValueError(f"unknown template {template_id!r}")

    # --- style ---------------------------------------------------------------
    declared = [s for s in (template.get("styles") or []) if isinstance(s, str)]
    style_id = (style_id or "").strip() or None
    if declared:
        style_id = style_id or template.get("defaultStyle") or declared[0]
        if style_id not in declared:
            raise ValueError(f"style {style_id!r} is not available for template {template_id!r} "
                             f"(choose one of {declared})")
    elif style_id:
        raise ValueError(f"template {template_id!r} declares no styles; omit styleId")
    style = styles.get(style_id) if style_id else None
    if style_id and not isinstance(style, dict):
        raise ValueError(f"style {style_id!r} is not declared in the registry")
    # Unproven styles are deliberately runnable (user decision): status is a
    # badge in the picker, not a gate.

    # --- variant shallow merge ----------------------------------------------
    merged = dict(template)
    variant = (template.get("variants") or {}).get(style_id) if style_id else None
    if isinstance(variant, dict):
        for key in VARIANT_KEYS:
            if key in variant:
                merged[key] = variant[key]

    # --- fields --------------------------------------------------------------
    supplied = dict(fields or {})
    declared_fields = [f for f in (template.get("fields") or []) if isinstance(f, dict)]
    known = {f.get("name") for f in declared_fields}
    unknown = sorted(k for k in supplied if k not in known)
    if unknown:
        raise ValueError(f"unknown field(s) for template {template_id!r}: {', '.join(unknown)}")
    values: dict = {}
    for field in declared_fields:
        name = field.get("name")
        raw = supplied.get(name, None)
        value = "" if raw is None else str(raw).strip()
        if not value:
            default = field.get("default")
            value = "" if default is None else str(default)
        if not value:
            if field.get("required"):
                raise ValueError(f"field {name!r} is required by template {template_id!r}")
            raise ValueError(f"field {name!r} has no value and no default")
        if field.get("type") == "select":
            options = [str(o.get("value")) for o in (field.get("options") or []) if isinstance(o, dict)]
            if options and value not in options:
                raise ValueError(f"field {name!r} must be one of {options}")
        values[name] = value
    if style:
        values[STYLE_SUFFIX_SLOT] = str(style.get("suffix") or "")

    prompt = substitute_slots(str(merged.get("prompt") or ""), values).strip()
    if len(prompt) < 3:
        raise ValueError(f"template {template_id!r} expanded to an empty prompt")

    kind = str(merged.get("kind") or "")
    workflow = str(merged.get("workflow") or "")
    overrides = overrides or {}

    # --- refs ----------------------------------------------------------------
    # A style's refs are its art anchor and belong to an EDIT workflow only —
    # handing bus.png to a text-to-image call would be meaningless. Template refs
    # (and a variant's) win over the style's; refSlots are the per-run references
    # the operator supplies, symbolic only, resolved through resolve_style_ref.
    slots = [s for s in (template.get("refSlots") or []) if isinstance(s, dict)]
    slot_names = {s.get("name") for s in slots}
    requested = overrides.get("refs") if isinstance(overrides.get("refs"), dict) else {}
    bad = sorted(k for k in requested if k not in slot_names)
    if bad:
        raise ValueError(f"template {template_id!r} declares no reference slot(s): {', '.join(bad)}")
    refs: dict = {}
    if isinstance(style, dict) and isinstance(style.get("refs"), dict):
        # A declared slot is operator-supplied per run; the style's art anchor
        # must never stand in for it (bus.png is not somebody's body sheet).
        refs.update({k: str(v) for k, v in style["refs"].items() if v and k not in slot_names})
    template_refs = {k: str(v) for k, v in (merged.get("refs") or {}).items() if v} \
        if isinstance(merged.get("refs"), dict) else {}
    refs.update(template_refs)
    for slot in slots:
        name = slot.get("name")
        # A slot's own `default` is a registry-declared fallback (spec §7.7) so a
        # curl POST need not repeat it; the caller's value still wins when given.
        value = str(requested.get(name, "")).strip() or str(slot.get("default") or "").strip()
        if value:
            refs[name] = value  # symbolic; resolved (and rejected if not) below
        elif slot.get("required") and not template_refs.get(name):
            raise ValueError(f"reference slot {name!r} is required by template {template_id!r} "
                             f"(pass params.refs.{name} as 'shared:<path>' or a configured styleRefs key)")
    for name, value in refs.items():
        resolve_style_ref(state, value)  # proves it is symbolic AND on disk, before enqueue

    if kind == "generate-voice":
        # The voice worker takes `text`, not `prompt`, and reads the teacher
        # reference from the server config — the template's voice ref is
        # documentation of which voice, not a dispatched file.
        params = {"id": overrides.get("id"), "text": prompt,
                  "seed": int(overrides.get("seed", merged.get("seed", 7)))}
    else:
        if kind not in ("generate-image", "cutout-chain"):
            raise ValueError(f"template {template_id!r} has unsupported kind {kind!r}")
        params = {
            "id": overrides.get("id"), "workflow": workflow, "prompt": prompt,
            "seed": int(overrides.get("seed", merged.get("seed", 42))),
            "width": int(merged.get("width", 1024)), "height": int(merged.get("height", 1024)),
            # Only an edit workflow consumes a reference image.
            "refs": refs if workflow in EDIT_WORKFLOWS else {},
        }
        if kind == "cutout-chain":
            # The dark charcoal ground is appended by run_cutout_chain_job for
            # every chain; a template must not write it into its prompt (§7.7).
            params.update({"target": str(merged.get("target", "object")),
                           "maxSize": merged.get("maxSize"),
                           "pad": int(merged.get("pad", 12))})
    template_block = {"id": template_id, **({"style": style_id} if style_id else {}),
                      "fields": values_block(values)}
    return kind, params, template_block


def media_summary(recipe: dict, folder: Path) -> dict:
    """The list-row summary for GET /api/studio/media: recipe digest + QA status."""
    qa = recipe.get("qa") if isinstance(recipe.get("qa"), dict) else {}
    alpha = qa.get("alpha") if isinstance(qa.get("alpha"), dict) else None
    transcript = qa.get("transcript") if isinstance(qa.get("transcript"), dict) else None
    # A pose-actor's shippable asset is its poses.json manifest, which is not an
    # image — `preview` names the flat file the Review card should thumbnail
    # (the contact strip), and `poses` gives the overlay its pose flip. Both are
    # absent for every other kind, so the card falls back to `asset` unchanged.
    poses = recipe.get("poses") if isinstance(recipe.get("poses"), dict) else None
    return {
        "id": recipe.get("id"),
        "kind": recipe.get("kind"),
        "asset": recipe.get("asset"),
        **({"preview": recipe["preview"]} if recipe.get("preview") else {}),
        **({"poses": [{"pose": name, "art": (entry or {}).get("art")}
                      for name, entry in poses.items()]} if poses else {}),
        "created": recipe.get("created"),
        "derivedFrom": recipe.get("derivedFrom"),
        "refs": recipe.get("refs") or {},
        "role": recipe.get("role"),
        "qa": {
            "status": qa.get("status"),
            "flags": qa.get("flags") or [],
            **({"partialPct": alpha.get("partialPct")} if alpha else {}),
            **({"transcriptMatch": transcript.get("match"), "transcriptRatio": transcript.get("ratio")} if transcript else {}),
        },
        "hasMagenta": (folder / "qa-magenta.png").is_file(),
        "hasTranscript": (folder / "qa-transcript.json").is_file(),
        "recipe": recipe,
    }


def list_media(state: AuthoringState) -> list[dict]:
    if not state.media_root.is_dir():
        return []
    out = []
    for child in sorted(state.media_root.iterdir()):
        if not child.is_dir() or not ID_RE.fullmatch(child.name):
            continue
        recipe_path = child / "recipe.json"
        if not recipe_path.is_file():
            continue
        try:
            recipe = json.loads(recipe_path.read_text("utf-8"))
        except (ValueError, OSError):
            continue
        out.append(media_summary(recipe, child))
    return out


# A candidate subdir under shared/assets/ is one kebab path segment — no slashes,
# no dots, no leading hyphen — so "shared:ui" is fine and "shared:../.." never
# parses far enough to touch is_relative_to.
REF_CANDIDATE_SUBDIR_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
REF_CANDIDATE_EXTS = (".png", ".jpg", ".jpeg", ".webp")


def ref_candidates(state: AuthoringState, source: str) -> list[dict]:
    """Candidate reference images for the studio's reference-gallery chooser.

    `source="shared:<subdir>"` lists shared/assets/<subdir>/*.{png,jpg,jpeg,webp}
    (top level only); `source="media"` lists staged shared/media/ images from
    list_media(). Every failure here is a client mistake and must surface as a
    4xx (mirrors expand_template)."""
    source = (source or "").strip()
    if not source:
        raise ValueError("source is required (use 'shared:<subdir>' or 'media')")
    if source == "media":
        items = [
            {
                "ref": f"media:{m['id']}",
                "url": f"/shared/media/{m['id']}/{m['asset']}",
                "name": m["id"],
                "status": (m.get("qa") or {}).get("status") or "",
                "resolvable": True,  # resolve_style_ref understands media:<id>
            }
            for m in list_media(state)
            if m.get("kind") == "image" and m.get("asset")
        ]
        return sorted(items, key=lambda item: item["name"])
    if source.startswith("shared:"):
        subdir = source[len("shared:"):]
        if not REF_CANDIDATE_SUBDIR_RE.fullmatch(subdir):
            raise ValueError(f"source {source!r} must be 'shared:<subdir>' (a single kebab-case path segment)")
        assets_root = (state.root / "shared" / "assets").resolve()
        directory = (assets_root / subdir).resolve()
        if not directory.is_relative_to(assets_root) or not directory.is_dir():
            raise ValueError(f"source {source!r} does not resolve under shared/assets")
        items = []
        for child in directory.iterdir():
            if child.name.startswith(".") or not child.is_file():
                continue
            if child.suffix.lower() not in REF_CANDIDATE_EXTS:
                continue
            items.append({
                "ref": f"shared:{subdir}/{child.name}",
                "url": f"/shared/assets/{subdir}/{child.name}",
                "name": child.stem,
                "resolvable": True,
            })
        return sorted(items, key=lambda item: item["name"])
    raise ValueError(f"unsupported source {source!r} (use 'shared:<subdir>' or 'media')")


# --- shared image-worker plumbing -------------------------------------------
# One place each for the three things every image job does the same way: resolve
# its reference image(s), work out its lineage, and remove a background.

def resolve_ref_images(state: AuthoringState, workflow: str, refs: dict) -> tuple[Path | None, Path | None]:
    """(image, image2) for one dispatch.

    `style` is the workflow's single input reference. `identity` is the optional
    SECOND one (qwen-image-edit's image2), which resolves the structure-vs-identity
    trade-off a one-image edit forces: pass the layout in `style` and the character
    in `identity`. Both are symbolic refs resolved through resolve_style_ref, so a
    template that declares no `identity` slot behaves exactly as before."""
    refs = refs or {}
    image = None
    if workflow in EDIT_WORKFLOWS or refs.get("style"):
        image = resolve_style_ref(state, refs.get("style", ""))
    image2 = resolve_style_ref(state, refs["identity"]) if refs.get("identity") else None
    return image, image2


def derived_from_refs(refs: dict) -> str | None:
    """The media object this run was conditioned on, if any (spec §7.6 derivedFrom).

    `media:<id>` is the only ref form that names another media object, so it is
    the only one that can be a parent — a pose derived from an accepted resting
    pose records the resting pose here, and the studio groups the set by it."""
    for key in ("style", "identity"):
        value = str((refs or {}).get(key) or "")
        if value.startswith("media:"):
            return value[len("media:"):] or None
    return None


def default_extract_prompt(base_prompt: str) -> str:
    """The layered-extraction prompt the cutout standard derives from a generation
    prompt: green ground underneath, the same subject untouched on top."""
    return (f"Solid flat green background layer. Top layer: the exact same {base_prompt} from the image. "
            "Keep it identical to the input image.")


def extract_and_finalize(state: AuthoringState, job_id: str, media_id: str, folder: Path,
                         source: Path, extract_prompt: str, seed: int, max_size: int, pad: int,
                         on_stage=None) -> tuple[dict, list[dict]]:
    """The shared tail of every background removal: qwen-image-layered layer_2 ->
    alpha histogram QA + magenta composite -> bbox-crop + pad -> resize -> PNG.

    run_cutout_chain_job calls it once per seed in its ladder; run_extract_media_job
    calls it once over an already-reviewed raw. Writes <id>.layer2.png, qa-magenta.png
    and (on QA pass only — the finalize helper withholds a failed cutout) <id>.png.
    Returns (qa_result, steps) where steps[] are the two recipe steps the caller
    appends, so a recipe written either way regenerates as one chain."""
    layer_path = folder / f"{media_id}.layer2.png"
    final_path = folder / f"{media_id}.png"
    magenta_path = folder / "qa-magenta.png"
    finalize_script = state.root / "tools" / "pipeline" / "cutout_finalize.py"

    if on_stage:
        on_stage("extract")
    layer_png = submit_and_poll_image(state, LAYERED_WORKFLOW,
                                      {"prompt": extract_prompt, "layers": "2", "seed": str(seed)},
                                      image=source, output="layer_2",
                                      on_remote_job=lambda rid: state.update_job(job_id, remoteJob=rid))
    atomic_write(layer_path, layer_png)

    if on_stage:
        on_stage("finalize")
    run = subprocess.run(
        [state.cutout_python, str(finalize_script), "--input", str(layer_path),
         "--output", str(final_path), "--magenta", str(magenta_path),
         "--max-size", str(max_size), "--pad", str(pad)],
        capture_output=True, text=True, timeout=300,
    )
    try:
        qa_result = json.loads(run.stdout.strip().splitlines()[-1]) if run.stdout.strip() else {}
    except (ValueError, IndexError):
        raise RuntimeError(f"cutout finalize produced no JSON: {(run.stderr or run.stdout)[:400]}")
    steps = [
        {"workflow": LAYERED_WORKFLOW, "prompt": extract_prompt, "output": "layer_2",
         "from": source.name, "seed": seed},
        {"op": "finalize", "crop": f"bbox+{pad}", "maxSize": max_size, "encode": "png",
         "from": f"{media_id}.layer2.png", "output": f"{media_id}.png"},
    ]
    return qa_result, steps


def run_generate_image_job(state: AuthoringState, job_id: str, d: dict):
    """Single t2i/edit step -> shared/media/<id>/<id>.png + recipe (status review)."""
    try:
        media_id = d["id"]
        workflow = d["workflow"]
        prompt = d["prompt"]
        seed = int(d["seed"])
        width, height = int(d.get("width", 1024)), int(d.get("height", 1024))
        refs = d.get("refs") or {}
        folder = media_dir(state, media_id)
        folder.mkdir(parents=True, exist_ok=True)
        state.update_job(job_id, status="running", message=f"Generating with {workflow}", progress=1, total=2)
        fields = {"prompt": prompt, "seed": str(seed), "width": str(width), "height": str(height)}
        image, image2 = resolve_ref_images(state, workflow, refs)
        png = submit_and_poll_image(state, workflow, fields, image=image, image2=image2,
                                    on_remote_job=lambda rid: state.update_job(job_id, remoteJob=rid))
        asset = f"{media_id}.png"
        atomic_write(folder / asset, png)
        recipe = {
            "format": "qlobe-recipe", "formatVersion": 1, "id": media_id, "kind": "image",
            "asset": asset,
            "steps": [{"workflow": workflow, "prompt": prompt, "seed": seed, "width": width, "height": height}],
            "refs": {k: v for k, v in refs.items() if v},
            # Which registry template produced this, when one did (spec §7.7).
            **({"template": d["template"]} if d.get("template") else {}),
            "derivedFrom": derived_from_refs(refs),
            "qa": {"status": "review"},
            "created": time.strftime("%Y-%m-%d"),
        }
        write_recipe(folder, recipe)
        state.update_job(job_id, status="completed", progress=2, message=f"Generated {asset}",
                         mediaId=media_id, outputs=[str((folder / asset).relative_to(state.root))])
    except Exception as exc:
        state.update_job(job_id, status="failed", error=str(exc), message="Image generation failed")


def run_cutout_chain_job(state: AuthoringState, job_id: str, d: dict):
    """The layered-extraction cutout standard, with seed-ladder retry on QA fail.

    generate on flat dark charcoal -> qwen-image-layered layer_2 -> alpha
    histogram QA + magenta composite -> bbox-crop+pad -> resize -> PNG. The raw
    generation is kept as <id>.raw.png (an earlier stage, never overwritten by the
    cutout); the recipe steps[] record the whole chain so Regenerate reproduces it."""
    try:
        media_id = d["id"]
        gen_workflow = d["workflow"]
        base_prompt = d["prompt"]
        target = d.get("target", "object")
        max_size = int(d.get("maxSize") or CUTOUT_TARGET_SIZES.get(target, 400))
        pad = int(d.get("pad", 12))
        width, height = int(d.get("width", 1024)), int(d.get("height", 1024))
        refs = d.get("refs") or {}
        extract_prompt = d.get("extractPrompt") or default_extract_prompt(base_prompt)
        requested_seed = int(d.get("seed", 42))
        ladder = []
        for s in [requested_seed, 42, 1337, 9001]:
            if s not in ladder:
                ladder.append(s)
        folder = media_dir(state, media_id)
        folder.mkdir(parents=True, exist_ok=True)
        # The chain owns the flat dark ground (a template must never write it into
        # its prompt — §7.7). `ground: null` in a replayed recipe means the ground
        # was already in the generation prompt (an extract-on-existing-media chain,
        # whose generation step was a plain generate-image), so it is not appended
        # twice; a legacy recipe with no key at all keeps the old behaviour.
        ground = d.get("ground", "dark-charcoal")
        gen_prompt = base_prompt + (DARK_GROUND_SUFFIX if ground else "")

        raw_path = folder / f"{media_id}.raw.png"
        final_path = folder / f"{media_id}.png"

        state.update_job(job_id, status="running", total=len(ladder) * 3)
        last_reason = None
        qa_result = None
        used_seed = None
        for attempt, seed in enumerate(ladder):
            step = attempt * 3
            state.update_job(job_id, current=f"seed {seed}", progress=step + 1,
                             message=f"Generating on dark ground (seed {seed})")
            fields = {"prompt": gen_prompt, "seed": str(seed), "width": str(width), "height": str(height)}
            image, image2 = resolve_ref_images(state, gen_workflow, refs)
            raw_png = submit_and_poll_image(state, gen_workflow, fields, image=image, image2=image2,
                                            on_remote_job=lambda rid: state.update_job(job_id, remoteJob=rid))
            atomic_write(raw_path, raw_png)

            def stage_message(stage, _step=step, _seed=seed):
                state.update_job(
                    job_id,
                    progress=_step + (2 if stage == "extract" else 3),
                    message=(f"Extracting layer_2 (seed {_seed})" if stage == "extract"
                             else f"Alpha QA + finalize (seed {_seed})"))

            qa_result, chain_steps = extract_and_finalize(
                state, job_id, media_id, folder, raw_path, extract_prompt, seed,
                max_size, pad, on_stage=stage_message)
            used_seed = seed
            if qa_result.get("pass"):
                break
            last_reason = qa_result.get("reason")
            state.update_job(job_id, message=f"QA failed on seed {seed}: {last_reason}")

        alpha = (qa_result or {}).get("alpha")
        flags = (qa_result or {}).get("flags") or []
        passed = bool((qa_result or {}).get("pass"))
        steps = [
            {"workflow": gen_workflow, "prompt": base_prompt, "ground": ground,
             "seed": used_seed, "width": width, "height": height, "output": f"{media_id}.raw.png"},
            *chain_steps,
        ]
        recipe = {
            "format": "qlobe-recipe", "formatVersion": 1, "id": media_id, "kind": "image",
            "asset": f"{media_id}.png" if passed else None,
            "steps": steps,
            "refs": {k: v for k, v in refs.items() if v},
            **({"template": d["template"]} if d.get("template") else {}),
            "derivedFrom": derived_from_refs(refs),
            "qa": {
                "status": "review" if passed else "failed-qa",
                "alpha": alpha, "flags": flags,
                "seedLadder": ladder, "usedSeed": used_seed,
                **({"reason": last_reason} if not passed else {}),
            },
            "created": time.strftime("%Y-%m-%d"),
        }
        write_recipe(folder, recipe)
        if passed:
            state.update_job(job_id, status="completed", message=f"Cutout ready ({media_id}.png, seed {used_seed})",
                             mediaId=media_id, outputs=[str(final_path.relative_to(state.root))])
        else:
            state.update_job(job_id, status="failed", message=f"Cutout QA failed after seed ladder: {last_reason}",
                             error=f"seed ladder {ladder} exhausted: {last_reason}", mediaId=media_id)
    except Exception as exc:
        state.update_job(job_id, status="failed", error=str(exc), message="Cutout chain failed")


def run_extract_media_job(state: AuthoringState, job_id: str, d: dict):
    """Remove the background from an ALREADY GENERATED media object (spec §10).

    The staged-image counterpart of the cutout chain, for the review-gated flows
    where the raw is looked at BEFORE any transparency exists (the pose set: a
    resting pose is accepted, five poses are derived from it, and only then does
    the whole set lose its background in one batch).

    The pre-extraction original is preserved as <id>.raw.png — copied from the
    reviewed asset the first time, never overwritten afterwards — then run through
    the same layered -> alpha QA -> finalize tail as the chain. The extraction and
    finalize steps are APPENDED to the recipe, so the object stays regenerable as
    one chain (generation + extraction), and qa is rewritten from the QA result."""
    try:
        media_id = d["id"]
        folder = media_dir(state, media_id)
        recipe_path = folder / "recipe.json"
        if not recipe_path.is_file():
            raise RuntimeError(f"media {media_id} has no recipe to extend")
        recipe = json.loads(recipe_path.read_text("utf-8"))
        if recipe.get("kind") != "image":
            raise RuntimeError(f"media {media_id} is not an image")
        steps = [s for s in (recipe.get("steps") or []) if isinstance(s, dict)]
        gen = next((s for s in steps if s.get("workflow") and s["workflow"] != LAYERED_WORKFLOW), {})
        # A re-extraction (force) replaces the previous extraction tail rather than
        # stacking a second one — the recipe stays a single coherent chain.
        steps = [s for s in steps if s.get("workflow") != LAYERED_WORKFLOW and s.get("op") != "finalize"]

        target = str(d.get("target") or "character")
        max_size = int(d.get("maxSize") or CUTOUT_TARGET_SIZES.get(target, CUTOUT_TARGET_SIZES["character"]))
        pad = max(0, min(64, int(d.get("pad", 12))))
        seed = int(d.get("seed") or gen.get("seed") or 42)
        extract_prompt = str(d.get("extractPrompt") or "").strip() \
            or default_extract_prompt(str(gen.get("prompt") or media_id))

        raw_path = folder / f"{media_id}.raw.png"
        state.update_job(job_id, status="running", total=2, progress=1,
                         message=f"Removing the background from {media_id}")
        if not raw_path.is_file():
            current = folder / str(recipe.get("asset") or f"{media_id}.png")
            if not current.is_file():
                raise RuntimeError(f"media {media_id} has no image on disk to extract from")
            atomic_write(raw_path, current.read_bytes())

        qa_result, chain_steps = extract_and_finalize(
            state, job_id, media_id, folder, raw_path, extract_prompt, seed, max_size, pad,
            on_stage=lambda stage: state.update_job(
                job_id, progress=1 if stage == "extract" else 2,
                message=(f"Extracting layer_2 (seed {seed})" if stage == "extract"
                         else f"Alpha QA + finalize (seed {seed})")))
        passed = bool(qa_result.get("pass"))

        # The generation step becomes the head of a chain: name its output and mark
        # that its ground is already in its own prompt, so a Regenerate replay does
        # not append the cutout standard's dark ground a second time.
        if gen:
            gen.setdefault("output", f"{media_id}.raw.png")
            gen.setdefault("ground", None)
        recipe["steps"] = steps + chain_steps
        if passed:
            recipe["asset"] = f"{media_id}.png"
        qa = recipe.get("qa") if isinstance(recipe.get("qa"), dict) else {}
        qa.update({
            # The asset changed under the reviewer's feet, so it goes back to review
            # even if it had been accepted opaque.
            "status": "review" if passed else "failed-qa",
            "alpha": qa_result.get("alpha"), "flags": qa_result.get("flags") or [],
            "extractSeed": seed,
        })
        if passed:
            qa.pop("reason", None)
        else:
            qa["reason"] = qa_result.get("reason")
        recipe["qa"] = qa
        write_recipe(folder, recipe)

        if passed:
            state.update_job(job_id, status="completed", progress=2, mediaId=media_id,
                             message=f"Background removed ({media_id}.png)",
                             outputs=[str((folder / f"{media_id}.png").relative_to(state.root))])
        else:
            state.update_job(job_id, status="failed", mediaId=media_id,
                             message=f"Extraction QA failed: {qa_result.get('reason')}",
                             error=str(qa_result.get("reason") or "extraction QA failed"))
    except Exception as exc:
        state.update_job(job_id, status="failed", error=str(exc), message="Background removal failed")


def pose_source_for(folder: Path, media_id: str, recipe: dict) -> Path:
    """The best available pixels for one extracted pose sprite.

    Preference order, highest fidelity first:
      1. <id>.layer2.png — the qwen-image-layered extraction at full 1024 source
         resolution. This is what the reviewer looked at; the finalize step only
         bbox-crops and downsizes it to the 420px character cutout target, which
         is far too small to fill a 900px stage canvas without softening.
      2. recipe.asset (<id>.png) — the finalized cutout, for a media object that
         somehow has no layer2 on disk.
    """
    layer2 = folder / f"{media_id}.layer2.png"
    if layer2.is_file():
        return layer2
    asset = folder / str(recipe.get("asset") or f"{media_id}.png")
    if asset.is_file():
        return asset
    raise RuntimeError(f"pose {media_id} has no extracted image on disk")


def run_assemble_pose_actor_job(state: AuthoringState, job_id: str, d: dict):
    """Six extracted pose sprites -> one qlobe-pose-actor pack in shared/media/.

    Local image work only (PIL through tools/pipeline/pose_actor_assemble.py, the
    same shell-out discipline as the cutout finalize) — no model call, so this
    never contends with the single ComfyUI queue. Writes
    shared/media/<actorId>-pose-actor/ with poses/<pose>.webp, poses.json
    (qlobe-pose-actor v1), contact.webp (the Review thumbnail) and a qlobe-recipe
    of kind pose-actor whose steps[] name every source media object.
    """
    temp_dir = Path(tempfile.mkdtemp(prefix="qlobe-pose-actor-"))
    try:
        set_id = d["set"]
        actor_id = d["actorId"]
        label = d.get("label") or actor_id.replace("-", " ").title()
        transition = d.get("transition") or "paper-pop"
        duration_ms = int(d.get("durationMs") or 220)
        media_id = d["id"]
        folder = media_dir(state, media_id)
        poses_dir = folder / "poses"
        poses_dir.mkdir(parents=True, exist_ok=True)

        state.update_job(job_id, status="running", total=2, progress=1,
                         message=f"Normalizing {len(POSE_SET)} poses for {actor_id}")

        entries = []
        sources = {}
        for pose in POSE_SET:
            source_id = f"{set_id}-{pose}"
            source_folder = media_dir(state, source_id)
            source_recipe_path = source_folder / "recipe.json"
            if not source_recipe_path.is_file():
                raise RuntimeError(f"pose media {source_id} is missing")
            source_recipe = json.loads(source_recipe_path.read_text("utf-8"))
            source = pose_source_for(source_folder, source_id, source_recipe)
            sources[pose] = source_id
            entries.append({"pose": pose, "source": str(source),
                            "output": str(poses_dir / f"{pose}.webp")})

        spec_path = temp_dir / "spec.json"
        spec_path.write_bytes(json_bytes({
            "canvas": POSE_CANVAS, "maxArt": POSE_MAX_ART, "baseline": POSE_BASELINE,
            "contact": str(folder / "contact.webp"), "poses": entries,
        }))
        helper = state.root / "tools" / "pipeline" / "pose_actor_assemble.py"
        run = subprocess.run([state.cutout_python, str(helper), "--spec", str(spec_path)],
                             capture_output=True, text=True, timeout=600)
        try:
            result = json.loads(run.stdout.strip().splitlines()[-1]) if run.stdout.strip() else {}
        except (ValueError, IndexError):
            raise RuntimeError(f"pose assembly produced no JSON: {(run.stderr or run.stdout)[:400]}")
        if not result.get("ok"):
            raise RuntimeError(str(result.get("reason") or "pose assembly failed"))

        state.update_job(job_id, progress=2, message=f"Writing the {actor_id} pose pack")
        manifest = {
            "format": "qlobe-pose-actor",
            "formatVersion": 1,
            "id": actor_id,
            "label": label,
            "canvas": result.get("canvas") or [POSE_CANVAS, POSE_CANVAS],
            "anchor": result.get("anchor") or [0.5, POSE_BASELINE / POSE_CANVAS],
            "transition": {"kind": transition, "durationMs": duration_ms},
            "poses": {pose: {"art": f"poses/{pose}.webp", "alt": f"{label} — {pose} pose"}
                      for pose in POSE_SET},
        }
        atomic_write(folder / "poses.json", json_bytes(manifest) + b"\n")

        metrics = result.get("poses") or {}
        recipe = {
            "format": "qlobe-recipe", "formatVersion": 1, "id": media_id, "kind": "pose-actor",
            # The pack manifest IS the shippable artifact; Assign moves it and the
            # poses/ folder beside it. `preview` is the Review card's thumbnail.
            "asset": "poses.json",
            "preview": "contact.webp",
            "actor": {"id": actor_id, "label": label, "set": set_id},
            "steps": [{
                "op": "assemble-pose-actor",
                "from": [sources[pose] for pose in POSE_SET],
                "canvas": [POSE_CANVAS, POSE_CANVAS],
                "maxArt": POSE_MAX_ART,
                "baseline": POSE_BASELINE,
                "scale": result.get("scale"),
                "scaleRule": "shared: maxArt / the largest subject dimension in the set",
                "encode": "webp q90 method6",
                "output": "poses/<pose>.webp + poses.json",
            }],
            "refs": {},
            # The lineage root stays a single media id so the provenance chain
            # walks; the whole six-object set is recorded alongside it.
            "derivedFrom": sources["neutral"],
            "derivedFromSet": [sources[pose] for pose in POSE_SET],
            "poses": {pose: {"art": f"poses/{pose}.webp",
                             "bytes": (metrics.get(pose) or {}).get("bytes"),
                             "artSize": (metrics.get(pose) or {}).get("artSize")}
                      for pose in POSE_SET},
            "qa": {"status": "review", "poses": len(POSE_SET),
                   "scale": result.get("scale"), "bytes": result.get("totalBytes")},
            "created": time.strftime("%Y-%m-%d"),
        }
        write_recipe(folder, recipe)
        state.update_job(job_id, status="completed", progress=2, mediaId=media_id,
                         message=f"Assembled {actor_id} ({len(POSE_SET)} poses)",
                         outputs=[str((folder / "poses.json").relative_to(state.root))])
    except Exception as exc:
        state.update_job(job_id, status="failed", error=str(exc), message="Pose-actor assembly failed")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def normalize_transcript(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]+", " ", str(text).lower())).strip()


def run_generate_voice_job(state: AuthoringState, job_id: str, d: dict):
    """Teacher-voice clone -> FLAC->m4a -> whisper-stt transcript-diff QA, recorded
    in the recipe. The teacher reference comes from the git-ignored local config."""
    temp_dir = Path(tempfile.mkdtemp(prefix="qlobe-media-voice-"))
    try:
        media_id = d["id"]
        text = d["text"]
        seed = int(d.get("seed", 7))
        if not state.qwen_url:
            raise RuntimeError("local workflow URL is not configured; set qwenUrl (local config) or --qwen-url")
        if not state.teacher_voice_path or not state.teacher_voice_path.is_file():
            raise RuntimeError("teacher voice reference not configured; set teacherVoicePath in tools/state/local.json")
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise RuntimeError("ffmpeg is required but was not found on PATH")
        folder = media_dir(state, media_id)
        folder.mkdir(parents=True, exist_ok=True)

        state.update_job(job_id, status="running", total=3, progress=1, message="Cloning teacher voice")
        clone = temp_dir / "clone.flac"
        audio_bytes = multipart_bytes_request(
            f"{state.qwen_url}/workflows/{VOICE_CLONE_WORKFLOW}?sync=true",
            state.teacher_voice_path, {"text": text, "seed": str(seed)},
            file_field="voice",
        )
        clone.write_bytes(audio_bytes)

        state.update_job(job_id, progress=2, message="Encoding m4a")
        asset = f"{media_id}.m4a"
        encoded = temp_dir / asset
        subprocess.run([
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(clone),
            "-vn", "-c:a", "aac", "-b:a", "96000", "-movflags", "+faststart", str(encoded),
        ], check=True, capture_output=True, text=True, timeout=180)
        atomic_write(folder / asset, encoded.read_bytes())

        # whisper-stt transcript diff QA (spec §7.6: voice recipes record the QA
        # transcript comparison). Uses the same Whisper endpoint the server already
        # derives from the qwen host.
        transcript_qa = {"intended": text}
        try:
            state.update_job(job_id, progress=3, message="Whisper transcript QA")
            result = multipart_request(
                state.whisper_url or f"{state.qwen_url}/workflows/whisper-stt?sync=true",
                encoded, {"model_size": "base", "language": "en"},
                timeout=15 * 60, file_field="audio",
            )
            heard = str(result.get("text", "")).strip()
            a, b = normalize_transcript(text), normalize_transcript(heard)
            import difflib
            ratio = round(difflib.SequenceMatcher(None, a, b).ratio(), 3)
            transcript_qa.update({"heard": heard, "ratio": ratio, "match": ratio >= 0.8})
            atomic_write(folder / "qa-transcript.json", json_bytes(transcript_qa) + b"\n")
        except Exception as exc:  # QA is recorded even when the whisper call fails
            transcript_qa.update({"heard": None, "ratio": None, "match": None, "error": str(exc)})
            atomic_write(folder / "qa-transcript.json", json_bytes(transcript_qa) + b"\n")

        recipe = {
            "format": "qlobe-recipe", "formatVersion": 1, "id": media_id, "kind": "voice",
            "asset": asset,
            "steps": [{"workflow": VOICE_CLONE_WORKFLOW, "text": text, "seed": seed}],
            "refs": {"voice": "teacher"},
            **({"template": d["template"]} if d.get("template") else {}),
            "derivedFrom": None,
            "qa": {"status": "review", "transcript": transcript_qa},
            "created": time.strftime("%Y-%m-%d"),
        }
        write_recipe(folder, recipe)
        state.update_job(job_id, status="completed", message=f"Voice line ready ({asset})",
                         mediaId=media_id, outputs=[str((folder / asset).relative_to(state.root))])
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or str(exc)).strip()
        state.update_job(job_id, status="failed", error=detail, message="Voice generation failed")
    except Exception as exc:
        state.update_job(job_id, status="failed", error=str(exc), message="Voice generation failed")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def regenerate_dispatch(recipe: dict, media_id: str, new_seed=None) -> tuple[str, dict]:
    """Rebuild a job (kind, dispatch) from a stored recipe so Regenerate re-runs it
    verbatim (spec §7.6: steps[] must suffice to re-enqueue unchanged; a new seed is
    the only permitted edit). The originating generator is inferred from the steps."""
    steps = recipe.get("steps") or []
    refs = recipe.get("refs") or {}
    # The template block travels with the rerun so the new recipe keeps its link
    # back to the registry — but the steps are replayed FROZEN, never re-expanded
    # (spec §7.7: a registry edit changes future runs only).
    template = recipe.get("template") if isinstance(recipe.get("template"), dict) else None
    carry = {"template": template} if template else {}
    if recipe.get("kind") == "voice":
        step = steps[0] if steps else {}
        return "generate-voice", {
            "id": media_id, "text": step.get("text", ""),
            "seed": int(new_seed if new_seed is not None else step.get("seed", 7)),
            **carry,
        }
    if any(s.get("workflow") == LAYERED_WORKFLOW for s in steps):
        gen = next((s for s in steps if s.get("workflow") and s["workflow"] != LAYERED_WORKFLOW), {})
        extract = next((s for s in steps if s.get("workflow") == LAYERED_WORKFLOW), {})
        finalize = next((s for s in steps if s.get("op") == "finalize"), {})
        return "cutout-chain", {
            "id": media_id, "workflow": gen.get("workflow"), "prompt": gen.get("prompt", ""),
            "seed": int(new_seed if new_seed is not None else gen.get("seed", 42)),
            "width": int(gen.get("width", 1024)), "height": int(gen.get("height", 1024)),
            # Whether the dark ground is the chain's to append or already sits in
            # the recorded prompt (an extract-on-existing-media chain, §10).
            "ground": gen.get("ground", "dark-charcoal"),
            "refs": refs, "maxSize": finalize.get("maxSize"),
            "pad": int(str(finalize.get("crop", "bbox+12")).split("+")[-1]) if "+" in str(finalize.get("crop", "")) else 12,
            "extractPrompt": extract.get("prompt"),
            **carry,
        }
    step = steps[0] if steps else {}
    return "generate-image", {
        "id": media_id, "workflow": step.get("workflow"), "prompt": step.get("prompt", ""),
        "seed": int(new_seed if new_seed is not None else step.get("seed", 42)),
        "width": int(step.get("width", 1024)), "height": int(step.get("height", 1024)),
        "refs": refs,
        **carry,
    }


ASSIGN_SUBDIR_RE = re.compile(r"^[a-z][a-z0-9-]{0,39}$")


def assign_destination_dir(state: AuthoringState, dest: str) -> tuple[Path, str]:
    """Validate an Assign destination and return (absolute dir, game-id-or-None).

    dest ∈ shared/assets/<subdir>/, games/<id>/assets/<subdir>/,
    games/<id>/assets/pose-actors/<actorId>/, shared/characters/<id>/<subdir>/.
    Reuses the same discipline as the write allow-list (kebab segments, no
    traversal, must resolve under the repo root)."""
    relative = safe_relative(dest)
    parts = tuple(p for p in relative.parts if p not in ("", "."))
    game_id = None
    ok = False
    if len(parts) == 3 and parts[:2] == ("shared", "assets") and ASSIGN_SUBDIR_RE.fullmatch(parts[2]):
        ok = True
    # A pose actor is a FOLDER, not a file: games/<id>/assets/pose-actors/<actorId>/
    # holds poses.json plus a poses/ directory. One extra allow-listed segment,
    # under the same kebab discipline as everything above.
    elif len(parts) == 5 and parts[0] == "games" and parts[2] == "assets" \
            and parts[3] == "pose-actors" and ID_RE.fullmatch(parts[1]) and ID_RE.fullmatch(parts[4]):
        ok = True; game_id = parts[1]
    elif len(parts) == 4 and parts[0] == "games" and parts[2] == "assets" \
            and ID_RE.fullmatch(parts[1]) and ASSIGN_SUBDIR_RE.fullmatch(parts[3]):
        ok = True; game_id = parts[1]
    elif len(parts) == 3 and parts[:2] == ("shared", "characters") \
            and ID_RE.fullmatch(parts[2]):
        ok = True  # shared/characters/<id>/<subdir> is 4 parts; handle below
    elif len(parts) == 4 and parts[:2] == ("shared", "characters") \
            and ID_RE.fullmatch(parts[2]) and ASSIGN_SUBDIR_RE.fullmatch(parts[3]):
        ok = True
    if not ok:
        raise ValueError("Assign destination must be shared/assets/<subdir>/, "
                         "games/<id>/assets/<subdir>/, or shared/characters/<id>/<subdir>/")
    destination = (state.root / Path(*parts)).resolve()
    if not destination.is_relative_to(state.root):
        raise ValueError("unsafe assign destination")
    return destination, game_id


def append_assets_md(game_dir: Path, asset_name: str, recipe: dict, recipe_name: str | None = None):
    """Append a provenance line to a game's ASSETS.md when assigning media in.

    `recipe_name` names the sidecar when it is not simply <asset_name>.recipe.json
    — a pose actor is listed as the folder it ships as, but its sidecar still sits
    beside the manifest inside it."""
    path = game_dir / "ASSETS.md"
    steps = recipe.get("steps") or []
    workflows = " -> ".join(s.get("workflow") or s.get("op") for s in steps if (s.get("workflow") or s.get("op")))
    kind = recipe.get("kind", "media")
    line = (f"- `{asset_name}` — generated via QLOBE Studio ({kind}; {workflows or 'recipe'}), "
            f"recipe `{recipe_name or f'{asset_name}.recipe.json'}`, CC BY 4.0.\n")
    header = "" if path.is_file() else "# Assets\n\nProvenance for assets in this game (source, processing, license).\n\n"
    with open(path, "a", encoding="utf-8") as handle:
        handle.write(header + line)


class PuppetStudioHandler(SimpleHTTPRequestHandler):
    server_version = "QLOBEStudio/1.0"

    def end_headers(self):
        # Authoring is local: never let the browser cache HTML/CSS/JS. Chrome's
        # heuristic cache has repeatedly served stale studio shells (index.html
        # has no ?v= of its own, and lib/ modules sit outside the workspace
        # buster) — "stale cache looks like broken layout" bit the user on
        # 2026-07-25. no-cache still allows conditional revalidation, so
        # assets stay fast; images keep default caching.
        path = getattr(self, "path", "") or ""
        clean = path.split("?", 1)[0].lower()
        if clean.endswith((".html", ".css", ".js", ".mjs", ".json")) or clean.endswith("/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

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
            if parsed.path == "/api/studio/templates":
                # The whole qlobe-generate-templates registry (spec §7.7). The
                # studio renders its forms from this; the static preview falls
                # back to fetching the same file directly.
                return self.send_json({"ok": True, "registry": load_generate_templates(self.state)})
            if parsed.path == "/api/studio/media":
                return self.send_json({"ok": True, "media": list_media(self.state)})
            if parsed.path.startswith("/api/studio/media/"):
                media_id = safe_media_id(parsed.path[len("/api/studio/media/"):].strip("/"))
                folder = media_dir(self.state, media_id)
                recipe_path = folder / "recipe.json"
                if not recipe_path.is_file():
                    return self.send_error_json(404, f"media not found: {media_id}")
                recipe = json.loads(recipe_path.read_text("utf-8"))
                return self.send_json({"ok": True, "media": media_summary(recipe, folder)})
            if parsed.path == "/api/studio/ref-candidates":
                query = parse_qs(parsed.query)
                source = query.get("source", [""])[0]
                return self.send_json({"ok": True, "source": source,
                                       "items": ref_candidates(self.state, source)})
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
            # --- Phase 5 media actions (no request body): accept / reject -------
            if parsed.path.startswith("/api/studio/media/") and parsed.path.endswith("/accept"):
                media_id = safe_media_id(parsed.path[len("/api/studio/media/"):-len("/accept")].strip("/"))
                folder = media_dir(self.state, media_id)
                recipe_path = folder / "recipe.json"
                if not recipe_path.is_file():
                    return self.send_error_json(404, f"media not found: {media_id}")
                recipe = json.loads(recipe_path.read_text("utf-8"))
                recipe.setdefault("qa", {})["status"] = "accepted"
                write_recipe(folder, recipe)
                return self.send_json({"ok": True, "media": media_summary(recipe, folder)})
            if parsed.path.startswith("/api/studio/media/") and parsed.path.endswith("/reject"):
                media_id = safe_media_id(parsed.path[len("/api/studio/media/"):-len("/reject")].strip("/"))
                folder = media_dir(self.state, media_id)
                recipe_path = folder / "recipe.json"
                if not recipe_path.is_file():
                    return self.send_error_json(404, f"media not found: {media_id}")
                recipe = json.loads(recipe_path.read_text("utf-8"))
                if (recipe.get("qa") or {}).get("status") == "accepted":
                    return self.send_error_json(409, "cannot reject an accepted media object")
                trash = self.state.root / "tools" / "state" / "trash"
                trash.mkdir(parents=True, exist_ok=True)
                shutil.move(str(folder), str(trash / f"{media_id}-{int(time.time())}"))
                return self.send_json({"ok": True, "rejected": media_id})
            # --- Phase 5 media actions (JSON body): regenerate / assign --------
            if parsed.path.startswith("/api/studio/media/") and parsed.path.endswith("/regenerate"):
                media_id = safe_media_id(parsed.path[len("/api/studio/media/"):-len("/regenerate")].strip("/"))
                folder = media_dir(self.state, media_id)
                recipe_path = folder / "recipe.json"
                if not recipe_path.is_file():
                    return self.send_error_json(404, f"media not found: {media_id}")
                recipe = json.loads(recipe_path.read_text("utf-8"))
                payload = self.read_json() if int(self.headers.get("Content-Length", "0") or 0) else {}
                new_seed = payload.get("seed")
                kind, dispatch = regenerate_dispatch(recipe, media_id, new_seed)
                interactive = bool(payload.get("interactive", False))
                workflow = dispatch.get("workflow") if kind in ("generate-image", "cutout-chain") else None
                job_id = self.state.enqueue(
                    kind, dispatch,
                    {"target": kind, "mediaId": media_id,
                     "message": f"Regenerating {media_id}", "progress": 0},
                    interactive=interactive, workflow=workflow,
                )
                return self.send_json({"ok": True, "jobId": job_id, "mediaId": media_id}, 202)
            # Background removal over an already-generated media object. The
            # review-gated counterpart of the cutout chain (spec §10): the raw is
            # reviewed opaque first, and only an accepted set loses its background.
            if parsed.path.startswith("/api/studio/media/") and parsed.path.endswith("/extract"):
                media_id = safe_media_id(parsed.path[len("/api/studio/media/"):-len("/extract")].strip("/"))
                folder = media_dir(self.state, media_id)
                recipe_path = folder / "recipe.json"
                if not recipe_path.is_file():
                    return self.send_error_json(404, f"media not found: {media_id}")
                recipe = json.loads(recipe_path.read_text("utf-8"))
                if recipe.get("kind") != "image":
                    return self.send_error_json(409, f"media {media_id} is not an image")
                payload = self.read_json() if int(self.headers.get("Content-Length", "0") or 0) else {}
                if (folder / f"{media_id}.layer2.png").is_file() and not bool(payload.get("force", False)):
                    return self.send_error_json(409, f"media {media_id} has already been extracted; "
                                                     "pass force to run it again")
                target = str(payload.get("target") or "")
                if target and target not in CUTOUT_TARGET_SIZES and not payload.get("maxSize"):
                    raise ValueError(f"target must be one of {sorted(CUTOUT_TARGET_SIZES)} or pass maxSize")
                # Sizing precedence: what the request asks for, else what the
                # registry template that made this object declares, else the
                # character target (the pose sprites this exists for).
                template = recipe.get("template") if isinstance(recipe.get("template"), dict) else {}
                declared = {}
                if template.get("id"):
                    try:
                        registry = load_generate_templates(self.state)
                        declared = next((t for t in (registry.get("templates") or [])
                                         if isinstance(t, dict) and t.get("id") == template["id"]), {}) or {}
                    except ValueError:
                        declared = {}
                dispatch = {
                    "id": media_id,
                    "target": target or str(declared.get("target") or "character"),
                    "maxSize": int(payload["maxSize"]) if payload.get("maxSize") else declared.get("maxSize"),
                    "pad": max(0, min(64, int(payload.get("pad", declared.get("pad", 12))))),
                    "seed": int(payload["seed"]) if payload.get("seed") is not None else None,
                    "extractPrompt": (str(payload.get("extractPrompt")).strip() or None)
                                     if payload.get("extractPrompt") else None,
                }
                job_id = self.state.enqueue(
                    "extract-media", dispatch,
                    {"target": "extract-media", "mediaId": media_id,
                     "message": f"Queued background removal for {media_id}", "progress": 0},
                    interactive=bool(payload.get("interactive", False)),
                )
                return self.send_json({"ok": True, "jobId": job_id, "mediaId": media_id}, 202)
            # Feed an ACCEPTED body sheet / viseme grid into the canonical-puppet
            # build pipeline (Feature M). The build steps read their sources from
            # the reference root docs/puppet-pipeline.md describes — the same two
            # files /api/puppet/file writes as kind=raw-base / kind=head-visemes —
            # so this COPIES the staged PNG there and leaves the media object
            # untouched in staging, with a provenance note on its recipe.
            if parsed.path.startswith("/api/studio/media/") and parsed.path.endswith("/send-to-assemble"):
                media_id = safe_media_id(parsed.path[len("/api/studio/media/"):-len("/send-to-assemble")].strip("/"))
                folder = media_dir(self.state, media_id)
                recipe_path = folder / "recipe.json"
                if not recipe_path.is_file():
                    return self.send_error_json(404, f"media not found: {media_id}")
                recipe = json.loads(recipe_path.read_text("utf-8"))
                payload = self.read_json()
                char_id = safe_id(str(payload.get("characterId") or ""))
                template_id = str((recipe.get("template") or {}).get("id") or "")
                slot = SEND_TO_ASSEMBLE_SLOTS.get(template_id)
                if not slot:
                    return self.send_error_json(
                        409, "only a body sheet or a viseme grid can be sent to Assemble "
                             f"(this ran {template_id or 'no registry template'})")
                if (recipe.get("qa") or {}).get("status") != "accepted":
                    return self.send_error_json(409, f"accept {media_id} before sending it to Assemble")
                asset = recipe.get("asset")
                source = folder / str(asset or "")
                if not asset or not source.is_file():
                    return self.send_error_json(409, "media has no image on disk to send")
                body = source.read_bytes()
                if not body.startswith(b"\x89PNG\r\n\x1a\n"):
                    return self.send_error_json(409, "the build pipeline's source sheets must be PNG")
                destination = destination_for(self.state, char_id, slot)
                if destination.exists() and not bool(payload.get("force", False)):
                    return self.send_error_json(
                        409, f"{char_id}/{destination.name} already exists; pass force to replace it")
                atomic_write(destination, body)
                # Provenance stays SYMBOLIC (character + slot), never the machine
                # path — the reference root lives outside the repo (§7.6 rules).
                sent = [entry for entry in (recipe.get("sentToAssemble") or [])
                        if isinstance(entry, dict) and not (entry.get("character") == char_id and entry.get("slot") == slot)]
                sent.append({"character": char_id, "slot": slot, "at": time.strftime("%Y-%m-%d")})
                recipe["sentToAssemble"] = sent
                write_recipe(folder, recipe)
                return self.send_json({
                    "ok": True, "mediaId": media_id, "character": char_id, "slot": slot,
                    "file": destination.name, "bytes": len(body),
                })
            # Assemble six extracted pose sprites into one qlobe-pose-actor pack
            # (Feature N). Local PIL work, so it is enqueued with no ComfyUI
            # workflow and never waits behind the model queue.
            if parsed.path == "/api/studio/pose-actor/assemble":
                payload = self.read_json()
                set_id = safe_media_id(str(payload.get("set") or ""))
                actor_id = safe_id(str(payload.get("actorId") or ""))
                label = str(payload.get("label") or "").strip()[:100] or actor_id.replace("-", " ").title()
                transition = str(payload.get("transition") or "paper-pop")
                if transition not in POSE_TRANSITIONS:
                    raise ValueError(f"transition must be one of {sorted(POSE_TRANSITIONS)}")
                duration_ms = max(0, min(2000, int(payload.get("durationMs", 220))))
                missing = []
                unextracted = []
                for pose in POSE_SET:
                    source_id = f"{set_id}-{pose}"
                    source_folder = media_dir(self.state, source_id)
                    if not (source_folder / "recipe.json").is_file():
                        missing.append(pose)
                    elif not (source_folder / f"{source_id}.layer2.png").is_file():
                        unextracted.append(pose)
                if missing:
                    return self.send_error_json(409, f"pose set {set_id} is incomplete; missing: {', '.join(missing)}")
                if unextracted:
                    return self.send_error_json(
                        409, f"remove the background from every pose first; still opaque: {', '.join(unextracted)}")
                media_id = safe_media_id(f"{actor_id}{POSE_ACTOR_SUFFIX}")
                folder = media_dir(self.state, media_id)
                if (folder / "recipe.json").exists() and not bool(payload.get("overwrite", False)):
                    return self.send_error_json(409, f"media {media_id} already exists; enable overwrite to replace it")
                job_id = self.state.enqueue(
                    "assemble-pose-actor",
                    {"id": media_id, "set": set_id, "actorId": actor_id, "label": label,
                     "transition": transition, "durationMs": duration_ms},
                    {"target": "assemble-pose-actor", "mediaId": media_id,
                     "message": f"Queued pose-actor assembly for {actor_id}", "progress": 0},
                    interactive=bool(payload.get("interactive", False)),
                )
                return self.send_json({"ok": True, "jobId": job_id, "mediaId": media_id, "actorId": actor_id}, 202)
            if parsed.path.startswith("/api/studio/media/") and parsed.path.endswith("/assign"):
                media_id = safe_media_id(parsed.path[len("/api/studio/media/"):-len("/assign")].strip("/"))
                folder = media_dir(self.state, media_id)
                recipe_path = folder / "recipe.json"
                if not recipe_path.is_file():
                    return self.send_error_json(404, f"media not found: {media_id}")
                recipe = json.loads(recipe_path.read_text("utf-8"))
                asset = recipe.get("asset")
                if not asset or not (folder / asset).is_file():
                    return self.send_error_json(409, "media has no shippable asset to assign (QA not passed?)")
                payload = self.read_json()
                dest_dir, game_id = assign_destination_dir(self.state, str(payload.get("dest", "")))
                dest_dir.mkdir(parents=True, exist_ok=True)
                target_asset = dest_dir / asset
                sidecar = dest_dir / f"{asset}.recipe.json"
                if target_asset.exists() or sidecar.exists():
                    return self.send_error_json(409, f"{asset} already exists at the destination")
                # A pose actor ships as a FOLDER — poses.json plus the poses/
                # directory it names — so the whole structure moves together or
                # the destination is left untouched.
                pose_pack = recipe.get("kind") == "pose-actor"
                source_poses = folder / "poses"
                if pose_pack:
                    if not source_poses.is_dir():
                        return self.send_error_json(409, "pose actor has no poses/ folder to assign")
                    if (dest_dir / "poses").exists():
                        return self.send_error_json(409, "poses/ already exists at the destination")
                shutil.move(str(folder / asset), str(target_asset))
                if pose_pack:
                    shutil.move(str(source_poses), str(dest_dir / "poses"))
                atomic_write(sidecar, json_bytes(recipe) + b"\n")
                magenta = folder / "qa-magenta.png"
                if magenta.is_file():
                    shutil.move(str(magenta), str(dest_dir / f"{asset}.qa-magenta.png"))
                assets_md = None
                if game_id:
                    label = (f"pose-actors/{(recipe.get('actor') or {}).get('id') or media_id}/"
                             if pose_pack else asset)
                    append_assets_md(self.state.root / "games" / game_id, label, recipe,
                                     f"{label}{asset}.recipe.json" if pose_pack else None)
                    assets_md = f"games/{game_id}/ASSETS.md"
                shutil.rmtree(folder, ignore_errors=True)  # leaves the unassigned bucket
                return self.send_json({
                    "ok": True, "assigned": media_id,
                    "dest": str(target_asset.relative_to(self.state.root)),
                    "recipe": str(sidecar.relative_to(self.state.root)),
                    "assetsMd": assets_md,
                })
            if parsed.path == "/api/studio/generate":
                payload = self.read_json()
                kind = str(payload.get("kind", ""))
                params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
                # Template branch (spec §7.7/§10): {template, styleId, fields,
                # params:{id, seed?, overwrite?, refs?}}. The server expands the
                # registry entry into exactly the params shape the raw body below
                # already validates, so both paths share one enqueue. The client
                # may not pass a prompt/workflow/dimension — that is the whole
                # point: prompts cannot drift from the registry.
                template_block = None
                if payload.get("template") is not None:
                    allowed = {"id", "seed", "overwrite", "refs"}
                    extra = sorted(k for k in params if k not in allowed)
                    if extra:
                        raise ValueError("a template run may only pass params "
                                         f"{sorted(allowed)}; remove: {', '.join(extra)}")
                    if "overwrite" in params:
                        payload["overwrite"] = params["overwrite"]
                    kind, params, template_block = expand_template(
                        self.state, str(payload.get("template") or ""),
                        payload.get("styleId") or payload.get("style"),
                        payload.get("fields") if isinstance(payload.get("fields"), dict) else {},
                        params,
                    )
                if kind not in ("generate-image", "cutout-chain", "generate-voice"):
                    raise ValueError("kind must be generate-image, cutout-chain, or generate-voice")
                media_id = safe_media_id(str(params.get("id", "")))
                interactive = bool(payload.get("interactive", False))
                folder = media_dir(self.state, media_id)
                if (folder / "recipe.json").exists() and not bool(payload.get("overwrite", False)):
                    return self.send_error_json(409, f"media {media_id} already exists; enable overwrite to replace it")
                if kind in ("generate-image", "cutout-chain"):
                    workflow = str(params.get("workflow", ""))
                    if workflow not in GENERATE_IMAGE_WORKFLOWS:
                        raise ValueError(f"workflow must be one of {sorted(GENERATE_IMAGE_WORKFLOWS)}")
                    prompt = str(params.get("prompt", "")).strip()
                    if len(prompt) < 3:
                        raise ValueError("a prompt is required")
                    dispatch = {
                        "id": media_id, "workflow": workflow, "prompt": prompt[:8000],
                        "seed": int(params.get("seed", 42)),
                        "width": max(64, min(2048, int(params.get("width", 1024)))),
                        "height": max(64, min(2048, int(params.get("height", 1024)))),
                        "refs": {k: str(v) for k, v in (params.get("refs") or {}).items() if v},
                    }
                    if kind == "cutout-chain":
                        target = str(params.get("target", "object"))
                        if target not in CUTOUT_TARGET_SIZES and not params.get("maxSize"):
                            raise ValueError(f"target must be one of {sorted(CUTOUT_TARGET_SIZES)} or pass maxSize")
                        dispatch.update({
                            "target": target,
                            "maxSize": int(params["maxSize"]) if params.get("maxSize") else None,
                            "pad": max(0, min(64, int(params.get("pad", 12)))),
                            "extractPrompt": (str(params.get("extractPrompt")).strip() or None) if params.get("extractPrompt") else None,
                        })
                    if template_block:
                        dispatch["template"] = template_block
                    job_id = self.state.enqueue(
                        kind, dispatch,
                        {"target": kind, "mediaId": media_id, "message": "Queued", "progress": 0},
                        interactive=interactive, workflow=workflow,
                    )
                else:  # generate-voice
                    text = str(params.get("text", "")).strip()
                    if not text:
                        raise ValueError("voice text is required")
                    dispatch = {"id": media_id, "text": text[:2000], "seed": int(params.get("seed", 7))}
                    if template_block:
                        dispatch["template"] = template_block
                    job_id = self.state.enqueue(
                        kind, dispatch,
                        {"target": kind, "mediaId": media_id, "message": "Queued", "progress": 0},
                        interactive=interactive,
                    )
                return self.send_json({"ok": True, "jobId": job_id, "mediaId": media_id}, 202)
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
            if parsed.path == "/api/studio/game-status":
                payload = self.read_json()
                game_id = safe_id(str(payload.get("id") or ""))
                status = str(payload.get("status") or "").strip()
                if status not in GAME_STATUSES:
                    raise ValueError("status must be one of: " + ", ".join(GAME_STATUSES))
                validation = None
                if status in ("live", "beta"):
                    # Promotion is validation-gated (spec §5.3): errors block, warns don't.
                    node = shutil.which("node") or "node"
                    args = [node, "tools/validate/run.mjs", game_id, "--json"]
                    try:
                        result = subprocess.run(
                            args, cwd=self.state.root, capture_output=True, text=True, timeout=120,
                        )
                        validation = json.loads(result.stdout)
                    except (OSError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
                        return self.send_error_json(500, f"validation run failed: {exc}")
                    errors = validation.get("counts", {}).get("error", 0)
                    if errors:
                        return self.send_error_json(
                            409, f"{game_id} has {errors} validation error(s); fix them before setting {status}")
                changed = set_game_status(self.state, game_id, status)
                return self.send_json({"ok": True, **changed, "validation": validation})
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
