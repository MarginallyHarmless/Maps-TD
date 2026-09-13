"""Fetch one bounded raw OSM snapshot; preserve it for reproducible conversion."""
import json
from pathlib import Path
import requests
from map_config import ROOT, selected_map

config = selected_map()
out = ROOT / config['rawDirectory']
out.mkdir(parents=True, exist_ok=True)
west, south, east, north = config['bbox']
bbox = f'{south},{west},{north},{east}'
query = f'''[out:json][timeout:45];
(nwr[building]({bbox});nwr["building:part"]({bbox});
way[highway]({bbox});nwr[landuse]({bbox});nwr[leisure]({bbox});
nwr[natural]({bbox});nwr[water]({bbox});nwr[waterway]({bbox});
node[place=square]({bbox}););out body;>;out skel qt;'''
(out / 'query.overpass').write_text(query)
response = requests.post('https://overpass-api.de/api/interpreter', data={'data': query},
    headers={'User-Agent': 'TDMapsResearchPrototype/0.1 (single neighborhood study)'}, timeout=60)
response.raise_for_status()
data = response.json()
if data.get('remark'):
    raise RuntimeError(data['remark'])
(out / 'osm.json').write_text(json.dumps(data))
print(json.dumps({'elements':len(data['elements']), 'timestamp':data.get('osm3s'),
    'squares':[e for e in data['elements'] if e.get('tags',{}).get('place')=='square']}, indent=2))
