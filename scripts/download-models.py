"""Materialize the pinned model collections and a catalog with local URLs."""
import argparse
import json
import subprocess
import shutil
from pathlib import Path
from tempfile import TemporaryDirectory


def git(folder, *args):
    return subprocess.check_output(['git', '-C', str(folder), *args], text=True).strip()


def download(root, name, spec):
    target = root / 'sources' / name
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if (not (target / '.git').is_dir() or git(target, 'rev-parse', 'HEAD') != spec['commit']
                or git(target, 'status', '--porcelain')):
            raise ValueError(f'{target} exists with different content')
        return
    with TemporaryDirectory(dir=target.parent) as temp:
        work = Path(temp) / 'repo'
        work.mkdir()
        git(work, 'init', '-q')
        git(work, 'remote', 'add', 'origin', 'https://github.com/' + spec['repository'] + '.git')
        if spec['scope']:
            git(work, 'sparse-checkout', 'set', '--cone', '--', *spec['scope'])
        git(work, 'fetch', '--filter=blob:none', '--depth=1', 'origin', spec['commit'])
        git(work, 'checkout', '--detach', 'FETCH_HEAD')
        if git(work, 'rev-parse', 'HEAD') != spec['commit']:
            raise ValueError('Source revision mismatch')
        work.rename(target)


def install_viewer(output, catalog, core):
    repo = Path(__file__).resolve().parents[1]
    viewer = output / 'viewer'
    if viewer.exists() and not (viewer / '.model-library-viewer').is_file():
        raise ValueError(f'{viewer} already exists; choose a dedicated library directory')
    viewer.mkdir(exist_ok=True)
    (viewer / '.model-library-viewer').touch()
    files = json.loads((repo / 'package.json').read_text(encoding='utf-8'))['files']
    for name in files:
        src, dest = repo / name, viewer / name
        if src.is_dir():
            shutil.copytree(src, dest, dirs_exist_ok=True)
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
    page = viewer / 'catalog'
    page.mkdir(exist_ok=True)
    shutil.copy2(repo / 'catalog/browser.mjs', page / 'browser.mjs')
    html = (repo / 'catalog/index.html').read_text(encoding='utf-8')
    if core:
        shutil.copy2(core, viewer / 'live2dcubismcore.min.js')
        html = html.replace('<html lang="zh-CN">', '<html lang="zh-CN" data-core-url="../live2dcubismcore.min.js">')
    (page / 'index.html').write_text(html, encoding='utf-8')
    local = dict(catalog, sources={k: dict(v, baseUrl='../../' + v['baseUrl']) for k, v in catalog['sources'].items()})
    (page / 'library.json').write_text(json.dumps(local, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    parser.add_argument('--source', action='append', help='only download the named source (repeatable)')
    parser.add_argument('--list', action='store_true', help='list sources without downloading files')
    parser.add_argument('--core', type=Path, help='optional locally supplied Cubism Core for fully disconnected use')
    args = parser.parse_args()
    path = Path(__file__).resolve().parents[1] / 'catalog/library.json'
    catalog = json.loads(path.read_text(encoding='utf-8'))
    selected = args.source or list(catalog['sources'])
    if not set(selected) <= catalog['sources'].keys():
        parser.error('Unknown source; use --list')
    if args.list:
        for name in selected:
            print(name, catalog['sources'][name]['repository'], catalog['sources'][name]['commit'])
        return
    output = args.destination.resolve()
    for name in selected:
        spec = catalog['sources'][name]
        download(output, name, spec)
        spec['baseUrl'] = 'sources/' + name + '/'
    catalog['sources'] = {k: catalog['sources'][k] for k in selected}
    catalog['models'] = {k: assets for k, items in catalog['models'].items()
                         if (assets := [item for item in items if item['source'] in selected])}
    catalog['audio'] = {k: v for k, v in catalog['audio'].items() if k in selected}
    # Only publish the local index once every selected checkout is available.
    target = output / 'library.json'
    if target.exists() and json.loads(target.read_text(encoding='utf-8')) != catalog:
        raise ValueError(f'{target} already exists with another selection. Use a separate directory.')
    with TemporaryDirectory(dir=output) as temp:
        staging = Path(temp) / 'library.json'
        staging.write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        staging.replace(target)
    install_viewer(output, catalog, args.core)
    print(target, output / 'viewer/catalog/index.html', sep='\n')


if __name__ == '__main__':
    main()
