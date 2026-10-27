"""Deterministic local packaging. No downloads, compilation, or publication."""
import argparse
import hashlib
import json
import pathlib
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
FIXED_TIME = (2026, 10, 27, 0, 0, 0)

def files_under(folder):
    excluded = {"node_modules", ".git", "__pycache__", "dist", "permissions-private"}
    return sorted(p for p in folder.rglob("*") if p.is_file() and not any(x in excluded for x in p.relative_to(folder).parts))

def write_zip(target, members):
    with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, source in sorted(members):
            info = zipfile.ZipInfo(name, FIXED_TIME)
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, source.read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    with zipfile.ZipFile(target) as archive:
        if archive.testzip() is not None:
            raise RuntimeError("ZIP CRC verification failed")

def public_gate():
    rights = json.loads((ROOT / "publication/rights-clearance.json").read_text(encoding="utf-8"))
    components = rights.get("components", [])
    if len(components) < 3 or any(c.get("status") != "cleared" or not c.get("evidence", "").strip() for c in components):
        raise ValueError("Public build blocked: rights clearance for original code/UI, artwork and branding is pending.")
    release = json.loads((ROOT / "publication/release.json").read_text(encoding="utf-8"))
    if not release.get("maintainerContact") or not release.get("privacyPolicyUrl", "").startswith("https://") or not release.get("rightsReviewed") or not release.get("manualBrowserChecksComplete"):
        raise ValueError("Public build blocked: maintainer/privacy URL and manual release review are incomplete.")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public", action="store_true")
    parser.add_argument("--out", type=pathlib.Path, default=ROOT.parent)
    args = parser.parse_args()
    if args.public:
        public_gate()
    extension = ROOT / "extension"
    manifest = json.loads((extension / "manifest.json").read_text(encoding="utf-8"))
    if manifest["manifest_version"] != 3:
        raise ValueError("Expected MV3")
    runtime = files_under(extension)
    if any("_metadata" in p.parts for p in runtime):
        raise ValueError("Store verification metadata must not be packaged")
    out = args.out.resolve()
    if out == ROOT or ROOT in out.parents:
        raise ValueError("Output directory must be outside the source project")
    out.mkdir(parents=True, exist_ok=True)
    version = manifest["version"]
    suffix = "public" if args.public else "local"
    install = out / f"Ears-Revival-{version}-{suffix}.zip"
    members = [(p.relative_to(extension).as_posix(), p) for p in runtime]
    members += [(name, ROOT / name) for name in ("README.md", "CHANGELOG.md", "LICENSE.md", "PRIVACY_POLICY.md")]
    write_zip(install, members)
    archives = [install]
    if not args.public:
        source = out / f"Ears-Revival-{version}-source.zip"
        write_zip(source, [("Ears-1.3.12-Revival/" + p.relative_to(ROOT).as_posix(), p) for p in files_under(ROOT)])
        archives.append(source)
    lines = [hashlib.sha256(p.read_bytes()).hexdigest() + "  " + p.name for p in archives]
    (out / ("SHA256SUMS-public.txt" if args.public else "SHA256SUMS.txt")).write_text("\n".join(lines) + "\n", encoding="utf-8")
    for line in lines:
        print(line)

if __name__ == "__main__":
    try:
        main()
    except (ValueError, RuntimeError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
