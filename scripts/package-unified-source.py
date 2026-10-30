"""Package the committed source and evidence, with deterministic hashes.
Usage: python scripts/package-unified-source.py ABSOLUTE_OUTPUT_ZIP
Never includes untracked settings, credentials, node_modules or the .git folder.
"""
import hashlib
import io
import json
import pathlib
import subprocess
import sys
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    target = pathlib.Path(sys.argv[1]).resolve()
    if target.exists():
        raise SystemExit('Output exists; choose a new directory to preserve it.')
    if target.suffix.lower() != '.zip':
        raise SystemExit('Expected a ZIP output path.')
    if git('status', '--porcelain').strip():
        raise SystemExit('Commit or preserve pending work before packaging.')
    commit = git('rev-parse', 'HEAD').decode().strip()
    source = zipfile.ZipFile(io.BytesIO(git('archive', '--format=zip', commit)))
    files = {i.filename: source.read(i) for i in source.infolist() if not i.is_dir()}
    if any(pathlib.PurePosixPath(p).is_absolute() or '..' in pathlib.PurePosixPath(p).parts for p in files):
        raise SystemExit('Unsafe source path.')
    files['PACKAGE_PROVENANCE.json'] = (json.dumps({
        'commit': commit,
        'commitDate': git('show', '-s', '--format=%cI', commit).decode().strip(),
        'sourceBranch': 'development/v19-unified-reconciliation',
        'repository': 'https://github.com/adjeiemmaaegh-web/tallybook',
        'localRefSnapshot': git('for-each-ref', '--format=%(refname) %(objectname)').decode().splitlines(),
        'assessment': 'Development checkpoint; not a production release. See docs/central/2026-10-30_DEVELOPMENT_HANDOVER.md.',
        'excluded': ['untracked files', '.git', 'installed dependencies', 'local secrets'],
    }, indent=2) + '\n').encode()
    # The manifest covers all other files; the ZIP's own digest is a sidecar.
    files['SHA256SUMS.txt'] = ''.join(
        f'{hashlib.sha256(data).hexdigest()}  {name}\n' for name, data in sorted(files.items())
    ).encode()
    target.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(target, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(files.items()):
            entry = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, data)
    with zipfile.ZipFile(target) as archive:
        if archive.testzip() is not None:
            raise SystemExit('Archive integrity verification failed.')
        for line in archive.read('SHA256SUMS.txt').decode().splitlines():
            digest, name = line.split('  ', 1)
            if hashlib.sha256(archive.read(name)).hexdigest() != digest:
                raise SystemExit(f'Hash verification failed: {name}')
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    target.with_suffix('.zip.sha256').write_text(f'{digest}  {target.name}\n', encoding='utf-8')
    print(json.dumps({'path': str(target), 'commit': commit, 'files': len(files), 'sha256': digest}))

if __name__ == '__main__':
    main()
