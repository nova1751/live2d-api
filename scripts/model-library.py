"""Build the portable catalog from pinned Git trees, without copying model binaries."""
import argparse
import json
import re
import subprocess
import urllib.request
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / 'catalog/girls-frontline'
DUMP = '527aac9245c06444d5d0259be843740915b715fd'
LOCAL = '89053b85a3e850952b3b35fc873a2065a3fda8b9'
GAME = '少女前线 girls Frontline'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def tree(repo, commit, scope):
    root = Path(repo).resolve().as_posix()
    blob = subprocess.check_output(['git', '-c', 'safe.directory=' + root, '-C', root,
                                   'ls-tree', '-rz', '--name-only', commit, '--', *scope])
    return set(blob.decode().split('\0'))


def source(repo, commit, scope):
    return dict(repository=repo, commit=commit, scope=scope,
                baseUrl=f'https://raw.githubusercontent.com/{repo}/{commit}/')


def build(primary, secondary, dump_tree=None):
    index = read(CATALOG / 'index.json')
    sources = {
        'widget': source('nova1751/live2d-api', LOCAL, ['model']),
        'dump': source('GFL-Live2D/dump', DUMP, ['models', 'audio']),
    }
    trees = {}
    for key, repo, scope in [('eikanya', primary, [GAME]), ('jacksen168', secondary, [])]:
        item = index['sources'][key]
        sources[key] = source(item['repository'].removeprefix('https://github.com/'), item['commit'], scope)
        trees[key] = tree(repo, item['commit'], scope)
    models = {}
    for character in index['characters']:
        for version in read(CATALOG / character['path'])['versions']:
            for form in read(CATALOG / version['path'])['forms']:
                item = read(CATALOG / form['path'])
                key = '/'.join([item['category'], item['character'], item['version'], item['id']])
                variants = models[key] = []
                for widget in item['widget']:
                    variants.append(dict(source='widget', manifest=widget['index']))
                for record in item['sources']:
                    repo, binary = record['repository'], PurePosixPath(record['path'])
                    paths = trees[repo]
                    manifest = record.get('manifest')
                    if not manifest and record['format'] == 'moc':
                        candidates = [binary.with_suffix('.model.json'), binary.with_suffix('.json')]
                        if binary.name == 'model.moc':
                            candidates.append(binary.parent / 'model.json')
                        if str(binary).endswith('/old/AN-94/normal/model.moc'):
                            candidates.append(binary.parent / 'model #8.json')
                        manifest = next((str(p) for p in candidates if str(p) in paths), None)
                    choice = dict(source=repo, binary=str(binary))
                    if key == 'doll/m1928a1/archive/destroy' and repo == 'eikanya':
                        choice['soundAliases'] = {}
                        for line in ('BREAK', 'DIALOGUE1'):
                            real = 'voice/M1928A1_' + line + '_JP.mp3'
                            assert str(binary.parent / real) in paths
                            choice['soundAliases']['destory/' + real] = real
                    if manifest:
                        choice['manifest'] = manifest
                    variants.append(choice)
    if dump_tree:
        data = read(Path(dump_tree))
    else:
        url = f'https://api.github.com/repos/GFL-Live2D/dump/git/trees/{DUMP}?recursive=1'
        with urllib.request.urlopen(url, timeout=90) as response:
            data = json.load(response)
    if data.get('truncated') or data['sha'] != DUMP:
        raise ValueError('Expected the complete pinned dump tree')
    paths = {x['path'] for x in data['tree'] if x['type'] == 'blob'}
    audio = sorted(p for p in paths if p.startswith('audio/') and p.endswith('.ogg'))
    for manifest in sorted(p for p in paths if p.startswith('models/') and p.endswith('.model3.json')):
        _, folder, form, *_ = manifest.split('/')
        code = folder.lower().replace(' ', '-')
        skin = re.fullmatch(r'(.+)_(\d+)', code)
        who, version = skin.groups() if skin else (code[:-3], 'mod') if code.endswith('mod') else (code, 'base')
        category = 'adjutant' if who == 'gelina' else 'npc' if who == 'william' else 'doll'
        key = '/'.join([category, who, version, form])
        choice = dict(source='dump', manifest=manifest)
        dialogue = manifest.removesuffix('.model3.json') + '.data.json'
        if dialogue in paths:
            choice['dialogue'] = dialogue
        models.setdefault(key, []).append(choice)
    rank = {'widget': 0, 'dump': 1, 'jacksen168': 2, 'eikanya': 3}
    for choices in models.values():
        choices.sort(key=lambda c: ('manifest' not in c, rank[c['source']], c.get('manifest','').count('/')))
    sources['widget']['baseUrl'] = 'https://cdn.jsdelivr.net/gh/nova1751/live2d-api@cdn-b3ac5ae545e2/'
    by_widget = {a['manifest']: key for key, choices in models.items() for a in choices if a['source'] == 'widget'}
    legacy_ids = []
    for row in read(ROOT / 'model_list.json')['models']:
        ids = []
        for skin in [row] if isinstance(row, str) else row:
            manifest = 'model/' + skin + '/index.json'
            key = by_widget.get(manifest)
            if not key:
                key = 'other/' + skin.replace('/', '-') + '/base/default'
                models[key] = [dict(source='widget', manifest=manifest)]
            ids.append(key)
        legacy_ids.append(ids)
    result = dict(schemaVersion=1, legacyIds=legacy_ids, sources=sources, models=dict(sorted(models.items())),
                  audio={'dump': audio})
    out = ROOT / 'catalog/library.json'
    out.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
    playable = sum(any('manifest' in v for v in variants) for variants in models.values())
    print(f'{len(models)} forms, {playable} with manifests, {len(audio)} voice files')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('eikanya')
    parser.add_argument('jacksen168')
    parser.add_argument('--dump-tree', help='cached complete GitHub tree JSON')
    args = parser.parse_args()
    build(args.eikanya, args.jacksen168, args.dump_tree)
