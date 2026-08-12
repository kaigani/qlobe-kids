#!/usr/bin/env python3
"""Create deterministic, child-friendly sound-cylinder sample WAVs."""
import argparse, hashlib, math, random, wave
from pathlib import Path

RATE = 44100
SPECS = {"seeds": (0.72, 220), "bell": (1.05, 880), "wood": (0.62, 150),
         "sand": (0.88, 0), "drum": (0.70, 105), "chime": (1.20, 660)}

def render(name, duration, base, seed):
    rng = random.Random(seed); n = int(duration * RATE); out = []
    for i in range(n):
        t = i / RATE; x = 0.0
        if name == "seeds":
            x = (rng.uniform(-1,1) * (1 - t/duration) ** .8) + .18*math.sin(2*math.pi*170*t)
        elif name == "sand":
            x = rng.uniform(-1,1) * (1 - t/duration) ** .55
        elif name == "drum":
            env = math.exp(-5.5*t); x = env*(math.sin(2*math.pi*base*t)+.35*math.sin(2*math.pi*base*1.8*t))
        elif name == "wood":
            env = math.exp(-7*t); x = env*(math.sin(2*math.pi*base*t)+.32*math.sin(2*math.pi*base*2.7*t))
        elif name == "bell":
            env = math.exp(-2.7*t); x = env*(math.sin(2*math.pi*base*t)+.45*math.sin(2*math.pi*base*2.01*t)+.22*math.sin(2*math.pi*base*3.9*t))
        else:
            env = math.exp(-2.2*t); x = env*(math.sin(2*math.pi*base*t)+.3*math.sin(2*math.pi*base*1.5*t))
        out.append(x)
    peak = max(abs(v) for v in out) or 1
    pcm = b''.join(int(max(-1,min(1,v/peak*.88))*32767).to_bytes(2,'little',signed=True) for v in out)
    return pcm

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--output', type=Path, default=Path(__file__).parents[1]/'assets/samples'); ap.add_argument('--check', action='store_true'); args=ap.parse_args(); args.output.mkdir(parents=True,exist_ok=True)
    for i,(name,(dur,freq)) in enumerate(SPECS.items()):
        p=args.output/(name+'.wav')
        if not args.check:
            with wave.open(str(p),'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE); w.writeframes(render(name,dur,freq,901+i))
    bad=[]; hashes=[]
    for name,(dur,_) in SPECS.items():
        p=args.output/(name+'.wav')
        try:
            with wave.open(str(p),'rb') as w:
                if (w.getnchannels(),w.getsampwidth(),w.getframerate()) != (1,2,RATE): raise ValueError('header')
                actual=w.getnframes()/RATE
                if not .55 <= actual <= 1.4: raise ValueError('duration')
                data=w.readframes(w.getnframes()); rms=math.sqrt(sum(int.from_bytes(data[j:j+2],'little',signed=True)**2 for j in range(0,len(data),2))/max(1,w.getnframes()))
                if rms < 100: raise ValueError('silent')
                hashes.append(hashlib.sha256(data).hexdigest())
        except Exception as e: bad.append(f'{name}: {e}')
    if bad or len(set(hashes)) != 6: raise SystemExit('sample check failed: ' + ', '.join(bad or ['duplicate hashes']))
    print('sample check passed')
if __name__=='__main__': main()
