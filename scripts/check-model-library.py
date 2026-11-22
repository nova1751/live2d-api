"""Check each preferred model manifest against the materialized library on disk."""
import argparse
import json
from pathlib import Path
from urllib.parse import unquote


def references(config):
    modern = config.get('FileReferences')
    if modern is not None:
        yield modern['Moc']
        yield from modern['Textures']
        for key in ('Physics', 'Pose', 'UserData', 'DisplayInfo'):
            if modern.get(key):
                yield modern[key]
        for entry in modern.get('Expressions', []):
            yield entry['File']
        for group in modern.get('Motions', {}).values():
            for motion in group:
                yield motion['File']
                if motion.get('Sound'):
                    yield motion['Sound']
    else:
        yield config['model']
        yield from config['textures']
        for key in ('physics', 'pose'):
            if config.get(key):
                yield config[key]
        for expression in config.get('expressions', []):
            yield expression['file']
        for group in config.get('motions', {}).values():
            for motion in group:
                for key in ('file', 'sound'):
                    if motion.get(key):
                        yield motion[key]


def audit(destination):
    catalog = json.loads((destination / 'library.json').read_text(encoding='utf-8'))
    errors = []
    for key, variants in catalog['models'].items():
        chosen = next((v for v in variants if v.get('manifest')), None)
        if not chosen:
            errors.append((key, 'no manifest'))
            continue
        model = destination / 'sources' / chosen['source'] / chosen['manifest']
        try:
            settings = json.loads(model.read_text(encoding='utf-8-sig'))
            for group in settings.get('motions', {}).values():
                for motion in group:
                    if motion.get('sound') in chosen.get('soundAliases', {}):
                        motion['sound'] = chosen['soundAliases'][motion['sound']]
            for path in references(settings):
                asset = model.parent / unquote(path)
                if not asset.is_file() or not asset.stat().st_size:
                    errors.append((key, path))
            if chosen.get('dialogue'):
                sidecar = destination / 'sources' / chosen['source'] / chosen['dialogue']
                data = json.loads(sidecar.read_text(encoding='utf-8'))
                if not isinstance(data['motionData'], (dict, list)) or not isinstance(data['voiceData'], (dict, list)):
                    errors.append((key, 'invalid dialogue metadata'))
        except (OSError, ValueError, KeyError, TypeError) as err:
            errors.append((key, str(err)))
    for key, reason in errors:
        print(key, reason)
    print(f"{len(catalog['models'])} forms; {len(errors)} unresolved references")
    return errors


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    raise SystemExit(bool(audit(parser.parse_args().destination)))
