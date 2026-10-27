import pathlib, json, zipfile, hashlib, argparse

root = pathlib.Path(__file__).resolve().parents[1]
project = root
ext = project / 'extension'
version = json.loads((ext / 'manifest.json').read_text())['version']
for brand in ('chrome', 'yandex'):
    report = json.loads((project / f'docs/test-evidence/opera-package-{brand}-results.json').read_text())
    assert report['passed'] and report['extensionVersion'] == version, brand

members = sorted(p for p in ext.rglob('*') if p.is_file())
assert not any(p.name == 'earss.svg' or '_metadata' in p.parts for p in members)
parser=argparse.ArgumentParser();parser.add_argument('--out',type=pathlib.Path,default=root.parent);args=parser.parse_args()
args.out.mkdir(parents=True,exist_ok=True)
out = args.out / f'Ears-Revival-{version}-opera.zip'
with zipfile.ZipFile(out, 'w') as z:
    for p in members:
        info = zipfile.ZipInfo(p.relative_to(ext).as_posix(), (2026, 10, 27, 0, 0, 0))
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        z.writestr(info, p.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
with zipfile.ZipFile(out) as z:
    assert z.testzip() is None and 'manifest.json' in z.namelist()
digest = hashlib.sha256(out.read_bytes()).hexdigest()
(out.parent / 'SHA256SUMS-opera.txt').write_text(digest + '  ' + out.name + '\n')
print(json.dumps({'path': str(out), 'sha256': digest, 'files':len(members), 'size':out.stat().st_size}, indent=2))
