"""Apply Chinese names and approved cartoon artwork to the offline catalog.
Never downloads or restores photographic images.
"""
import json
from pathlib import Path
root=Path(__file__).resolve().parents[1]
folder=root/'src/renderer/src/fitness'
names=json.loads((folder/'names.zh-CN.json').read_text(encoding='utf8'))
catalog=json.loads((folder/'catalog.json').read_text(encoding='utf8'))
art=json.loads((root/'src/renderer/public/fitness/cartoon/PROMPTS.json').read_text(encoding='utf8'))
approved={item['id']:item['slug'] for item in art}
for exercise in catalog:
    exercise['name']=names[exercise['id']]
    slug=approved.get(exercise['id'])
    exercise['image']='fitness/cartoon/'+slug+'.png' if slug else ''
    exercise['images']=[exercise['image']] if slug else []
    exercise['artworkStatus']='ready' if slug else 'pending'
(folder/'catalog.json').write_text(json.dumps(catalog,ensure_ascii=False,separators=(',',':')),encoding='utf8')
print(f"{len(catalog)} Chinese names; {len(approved)} approved illustrations")
