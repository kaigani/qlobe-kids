#!/usr/bin/env python3
"""whisper-visemes.py — generate viseme cue timelines from voice clips, locally.

A Rhubarb-free lip-sync cue generator. Rhubarb's prebuilt macOS binary segfaults
on macOS 14, and the local Whisper API returns only segment-level timing — so
this uses faster-whisper (word timestamps) + CMUdict (phonemes) and maps straight
to the puppet rig's viseme names (see docs/puppet-rig-spec.md §5b).

Setup (needs Python 3.11/3.12 — 3.14 has no faster-whisper/onnxruntime wheels):
    python3.11 -m venv venv && ./venv/bin/pip install faster-whisper pronouncing

Usage:
    ./venv/bin/python whisper-visemes.py clip1.wav clip2.wav ...
Writes <clip>.cues.json next to each input:
    { "metadata": { "duration": .., "source": ".." },
      "mouthCues": [ { "start", "end", "value" } ] }   # value = rig viseme name

Drive it with shared/js/stage/lipsync.js driveLipsync(..., { map: VISEME_IDENTITY }).
Timing is ~±150ms; tune per playback device with the sync-offset control.
"""
import sys, json, re, wave, contextlib
from faster_whisper import WhisperModel
import pronouncing

# ARPABET (stress-stripped) -> rig viseme name (the phoneme groups the heads were drawn for)
ARPA2VIS = {
 'AA':'a','AH':'a','AW':'a','AY':'a',
 'AE':'e','EH':'e','EY':'e','IH':'e','IY':'e','ER':'e',
 'AO':'o','OW':'o','OY':'o', 'UW':'uq','UH':'uq',
 'M':'mbp','B':'mbp','P':'mbp','F':'fv','V':'fv','W':'wr','R':'wr',
 'L':'ln','N':'ln','NG':'ln',
 'T':'ts','D':'ts','S':'ts','Z':'ts','TH':'ts','DH':'ts','K':'ts','G':'ts',
 'HH':'ts','Y':'ts','CH':'ts','JH':'ts','SH':'ts','ZH':'ts',
}
VOWELS = set('AA AH AW AY AE EH EY IH IY ER AO OW OY UW UH'.split())
LETTER2VIS = {'a':'a','e':'e','i':'e','o':'o','u':'uq','y':'e','b':'mbp','m':'mbp',
  'p':'mbp','f':'fv','v':'fv','w':'wr','r':'wr','l':'ln','n':'ln'}
LETTER_VOWELS = set('aeiouy')

def phones_for(word):
    w = re.sub(r"[^a-z']", '', word.lower())
    if not w: return []
    pl = pronouncing.phones_for_word(w)
    if pl: return [re.sub(r'\d','',p) for p in pl[0].split()]
    return [('V:'+c if c in LETTER_VOWELS else 'C:'+c) for c in w]  # OOV: from spelling

def viseme_of(ph):
    if ph.startswith('V:'): return ('a' if ph[2] in 'ao' else 'e'), 1.6
    if ph.startswith('C:'): return LETTER2VIS.get(ph[2],'ts'), 1.0
    return ARPA2VIS.get(ph,'ts'), (1.6 if ph in VOWELS else 1.0)  # vowels held longer

def wavdur(p):
    with contextlib.closing(wave.open(p)) as f: return f.getnframes()/f.getframerate()

def generate(model, wav, dur, gap=0.08):
    segs,_ = model.transcribe(wav, word_timestamps=True, language='en')
    words = [(w.word, w.start, w.end) for s in segs for w in (s.words or [])]
    cues=[]; prev=0.0
    for word, ws, we in words:
        if ws-prev > gap: cues.append({'start':prev,'end':ws,'value':'rest'})
        vs=[viseme_of(p) for p in phones_for(word)]
        if not vs: continue
        tot=sum(w for _,w in vs); t=ws
        for v,wt in vs:
            d=(we-ws)*wt/tot; cues.append({'start':t,'end':t+d,'value':v}); t+=d
        prev=we
    if prev < dur-gap: cues.append({'start':prev,'end':dur,'value':'rest'})
    merged=[]
    for c in cues:
        if merged and merged[-1]['value']==c['value']: merged[-1]['end']=c['end']
        else: merged.append(dict(c))
    for c in merged: c['start']=round(c['start'],3); c['end']=round(c['end'],3)
    return merged

def main(paths):
    model = WhisperModel('base', device='cpu', compute_type='int8')
    for wav in paths:
        dur = wavdur(wav); cues = generate(model, wav, dur)
        out = re.sub(r'\.wav$','',wav)+'.cues.json'
        json.dump({'metadata':{'duration':round(dur,3),'source':'faster-whisper+cmudict'},
                   'mouthCues':cues}, open(out,'w'), indent=1)
        print(f'{out}  ({len(cues)} cues, {dur:.2f}s)')

if __name__ == '__main__':
    if len(sys.argv) < 2: sys.exit('usage: whisper-visemes.py <clip.wav> ...')
    main(sys.argv[1:])
