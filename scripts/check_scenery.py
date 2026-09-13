"""Check exported visual geometry against footprints and navigation corridors."""
import json
from pathlib import Path
from shapely.geometry import Polygon, Point, LineString
from shapely.ops import unary_union

root=Path(__file__).resolve().parents[1]
for config in json.loads((root/'public/data/maps.json').read_text()):
    level=json.loads((root/f"public/data/{config['id']}.json").read_text())
    footprints=[Polygon(b['rings'][0],b['rings'][1:]) for b in level['buildings']]
    for b,footprint in zip(level['buildings'],footprints):
        roof=b['roof']; vertices=roof.get('vertices',[])
        assert len(vertices)%3==0
        assert all(b['wallHeight']-.011 <= p[1] <= b['height']+.011 for p in vertices),b['id']
        if vertices:
            triangles=[Polygon([(p[0],p[2]) for p in vertices[i:i+3]]) for i in range(0,len(vertices),3)]
            covered=unary_union(triangles)
            assert covered.symmetric_difference(footprint).area < footprint.length*.012,b['id']
        if b.get('roofEquipment'):
            assert footprint.buffer(-2.4).contains(Point(b['roofEquipment'])),b['id']
    buildings=unary_union(footprints)
    roads=unary_union([LineString(r['points']).buffer(r['width']/2+4.9) for r in level['roads']])
    parks=unary_union([Polygon(a['rings'][0],a['rings'][1:]) for a in level['areas'] if a.get('landcover') in ['park','garden','wood','forest']])
    for t in level['decorativeTrees']:
        p=Point(t['point'])
        assert t['source']=='procedural'
        assert parks.contains(p)
        assert buildings.distance(p)>4.9
        assert not roads.contains(p)
    routes_path=Path(f"/tmp/td-routes-{config['id']}.json")
    if routes_path.exists():
        for route in json.loads(routes_path.read_text()):
            assert LineString(route['points']).intersection(buildings).length<.001
    print(f"{config['id']}: roof coverage, height bounds, rooftop equipment, planting clearances and available default routes passed")
