#!/usr/bin/env python3
"""Generate review-only Krea hub art; never overwrite production."""
import argparse,datetime as dt,hashlib,ipaddress,json,os,time
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request,urlopen
GAME=Path(__file__).resolve().parents[1];ROOT=GAME.parents[1];OUT=GAME/'assets/source/local-api';RAW=OUT/'hub-tile-master.png';RECIPE=OUT/'hub-tile-recipe.json';WORKFLOW='krea2-turbo-t2i'
PROMPT=(
    'One adorable orange toy fox mid-hop across five chunky blank stepping '
    'stones on a miniature winding woodland trail, with a tiny orange-and-cream '
    'finish flag, mossy bushes and one small flower. One recognizable game '
    'moment staged as toy objects, centered with clean breathing room. Bright, '
    'soft 3D cartoon style with rounded, simplified forms and cheerful '
    'proportions. Saturated colors, smooth shading, soft highlights, toy-like '
    'glossy finish. Premium preschool learning app asset, no title, no text, '
    'no letters, no numbers, no words, no labels, no UI, no watermark.'
)
PRIVATE_NETWORKS=tuple(ipaddress.ip_network(block) for block in (
    '10.0.0.0/8','127.0.0.0/8','169.254.0.0/16','172.16.0.0/12',
    '192.168.0.0/16','::1/128','fc00::/7','fe80::/10',
))
def api(cli):
    if cli:return cli.rstrip('/')
    if os.getenv('QLOBE_QWEN_URL'):return os.environ['QLOBE_QWEN_URL'].rstrip('/')
    try:return str(json.loads((ROOT/'tools/state/local.json').read_text()).get('qwenUrl','')).rstrip('/')
    except (OSError,ValueError):return ''
def private_endpoint(value):
    parsed=urlsplit(value)
    if parsed.scheme not in {'http','https'} or not parsed.hostname:
        raise ValueError('API endpoint must be an HTTP(S) URL')
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('API endpoint must not contain credentials or a query')
    host=parsed.hostname.lower()
    if host!='localhost':
        try:address=ipaddress.ip_address(host)
        except ValueError as error:raise ValueError('API host must be localhost or a literal private IP') from error
        if not any(address in network for network in PRIVATE_NETWORKS):
            raise ValueError('API host must be on a private network')
    return value.rstrip('/')
def main():
    p=argparse.ArgumentParser();p.add_argument('--api-url');p.add_argument('--seed',type=int,default=42);p.add_argument('--force',action='store_true');p.add_argument('--check',action='store_true');a=p.parse_args()
    try:base=private_endpoint(api(a.api_url))
    except ValueError as error:raise SystemExit(str(error)) from None
    if a.check:print(json.dumps({'raw':str(RAW),'sourceExists':RAW.is_file(),'productionOverwrite':False,'workflow':WORKFLOW,'seed':a.seed,'size':[768,640]},indent=2));return
    if not base:raise SystemExit('Krea API configuration unavailable')
    if RAW.exists() and RECIPE.exists() and not a.force:return
    b='----qlobe-krea-trail';fields={'prompt':PROMPT,'seed':a.seed,'width':768,'height':640,'steps':8,'cfg':1};body=bytearray()
    for k,v in fields.items():body+=f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
    body+=f'--{b}--\r\n'.encode();req=Request(base+'/workflows/'+WORKFLOW,data=body,method='POST',headers={'Content-Type':f'multipart/form-data; boundary={b}'})
    with urlopen(req,timeout=60) as r:rj=json.load(r)
    job=rj.get('job_id') or rj.get('id'); deadline=time.time()+900
    while time.time()<deadline:
        with urlopen(base+'/jobs/'+str(job),timeout=60) as r:s=json.load(r)
        state=str(s.get('status','')).lower()
        if state in {'done','complete','completed','success','succeeded'}:
            with urlopen(base+'/jobs/'+str(job)+'/result',timeout=300) as r:data=r.read();break
        if state in {'failed','error','cancelled','canceled'}:
            raise SystemExit(f'Krea job ended as {state}')
        time.sleep(1)
    else:raise SystemExit('Krea polling timed out')
    if len(data)<5000 or not data.startswith((b'\x89PNG',b'RIFF',b'\xff\xd8')):
        raise SystemExit('Krea returned an empty or unsupported image payload')
    OUT.mkdir(parents=True,exist_ok=True);RAW.write_bytes(data);RECIPE.write_text(json.dumps({'prompt':PROMPT,'seed':a.seed,'workflow':WORKFLOW,'sourceSha256':hashlib.sha256(data).hexdigest(),'productionOverwrite':False,'createdAt':dt.datetime.now(dt.timezone.utc).isoformat()},indent=2)+'\n')
if __name__=='__main__':main()
