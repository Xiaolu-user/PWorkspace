"""Refresh artwork for the curated 64-exercise catalog without restoring retired entries."""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
folder=root/'src/renderer/src/fitness'
catalog=json.loads((folder/'catalog.json').read_text(encoding='utf8'))
art=json.loads((root/'resources/fitness/cartoon/PROMPTS.json').read_text(encoding='utf8'))
approved={item['id']:item['slug'] for item in art}
for exercise in catalog:
    slug=approved.get(exercise['id'])
    exercise['image']='fitness/cartoon/'+slug+'.webp' if slug and (root/'src/renderer/public/fitness/cartoon'/f'{slug}.webp').is_file() else 'fitness/cartoon/default-exercise.webp'
    exercise['images']=[exercise['image']]
    exercise['artworkStatus']='ready'
(folder/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print(f"{len(catalog)} curated exercises; missing artwork uses the default illustration")
