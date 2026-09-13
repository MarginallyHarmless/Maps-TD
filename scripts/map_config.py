"""Shared, explicit map catalog for the importer and browser."""
import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def selected_map():
    maps = json.loads((ROOT / 'public/data/maps.json').read_text())
    parser = argparse.ArgumentParser()
    parser.add_argument('--map', choices=[m['id'] for m in maps], default='alba-iulia')
    args = parser.parse_args()
    return next(m for m in maps if m['id'] == args.map)
