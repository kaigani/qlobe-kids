# Puppet Retell

## Product promise

Puppet Retell turns the shared rigged-character system into a child-directed
puppet theater. A child chooses two stars, a stage, and small costume props;
then moves the puppets, triggers expressive actions, and tells a story in her
own voice. The complete show can be replayed from a private on-device shelf.

## Audience and learning goals

Designed for ages 4–7, with no reading required for the core interaction.

1. Tell a story with a beginning, middle, and ending.
2. Build confidence speaking and improvising aloud.
3. Coordinate character movement, gesture, and dialogue.
4. Revisit a performance and notice story sequence.

## Modes

### Story Starters

The child chooses one of three original prompts or three public-domain classic
tales. A large illustrated beat card guides the beginning, middle, and ending.
The child advances the beats at her own pace while the performance recorder
captures puppet actions and, when permission is granted, microphone audio.

### Free Show

The same stage tools are available without story-beat prompts. The child makes
up any story and ends the recording when ready.

### My Shows

Up to 24 performances are stored in IndexedDB on the current device. Each item
has a stage thumbnail, title, date, duration, replay control, and an explicit
delete confirmation. A grown-up can save or share a locally rendered MP4;
nothing is uploaded.

## Interaction

- Tap two character portraits to cast the show.
- Tap one of six stage paintings.
- Tap either cast member, then give that puppet one optional costume prop.
- On stage, drag near a puppet to move it freely in two dimensions. Its
  segmented arms and legs trail with dramatic bounded soft-ragdoll physics;
  releasing it triggers a gravity drop, upward limb flare, and small landing
  bounce back to the stage floor.
- Tap Wave, Jump, Talk, Think, Hug, or Cheer to animate the selected puppet.
- Microphone permission is requested only after the child taps Record.
- If permission is denied or unavailable, the action timeline still saves and
  replays as a silent movement-only show.

## Content

Original starters: Forest Rescue, Moon Surprise, Royal Picnic.

Public-domain classics: The Three Little Pigs, Goldilocks and the Three Bears,
and Little Red Riding Hood. Prompts deliberately encourage the child to retell
rather than reproduce any modern adaptation.

## Systems made more robust

- Shared Pixi stage + rigged-puppet theater used as a child-directed sandbox.
- Additive soft-ragdoll limb springs coexist with authored poses and preserve
  their motion during saved-show replay and MP4 export.
- Reusable `shared/js/performance-recorder.js` serializes an initial tableau,
  timestamped semantic events, and an optional audio Blob.
- Reusable local show storage with format versioning and a bounded shelf.
- Graceful microphone-denied and recorded-voice-missing fallbacks.
- `QLOBE_DEBUG` v1 coverage for setup, performance, save, shelf, and replay.

## Privacy and safety

The recorder has no upload path. Audio and action data are written only to the
browser's IndexedDB for this game; an MP4 is rendered locally only when the
grown-up chooses Save or Share. The UI repeats “stays on this device” beside
Record and after saving. A recording is limited to 90 seconds.

## Release gate

The game stays `beta` until it has been played successfully on the target iPad
by the child it was made for. Automated validation and production browser QC
are necessary but do not substitute for that final playtest.
