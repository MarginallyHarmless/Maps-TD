import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {findRoute,cellPoint,pointCell,routeLength} from '../src/navigation.js';
const level=JSON.parse(readFileSync(new URL('../public/data/alba-iulia.json',import.meta.url)));
test('coordinates round-trip at the actual map boundaries',()=>{
  for(const id of [0,199,39800,39999,20100])assert.equal(pointCell(level.grid,...cellPoint(level.grid,id)),id);
  assert.equal(pointCell(level.grid,300,0),-1);
});
test('diagonal movement cannot pass between two blocked corners',()=>{
  assert.equal(findRoute({size:2,cell:1,origin:[0,0],cost:[1,0,0,1]},0,[3]),null);
});
test('route prefers roads over shorter open-ground approaches',()=>{
  const grid={size:5,cell:1,origin:[0,0],cost:[1,1,1,1,1,1,5,5,5,1,1,5,5,5,1,1,5,5,5,1,1,1,1,1,1]};
  const path=findRoute(grid,10,[14]);assert.ok(path);assert.ok(path.every(i=>grid.cost[i]===1));
});
test('a tower cannot block the only route',()=>{
  const grid={size:3,cost:[0,0,0,1,1,1,0,0,0]};
  assert.deepEqual(findRoute(grid,3,[5]),[3,4,5]);assert.equal(findRoute(grid,3,[5],new Set([4])),null);
});
const catalog=JSON.parse(readFileSync(new URL('../public/data/maps.json',import.meta.url)));
for(const map of catalog)test(`${map.id}: all four entries reach the configured stronghold`,()=>{
  const level=JSON.parse(readFileSync(new URL(`../public/data/${map.id}.json`,import.meta.url)));
  assert.equal(level.id,map.id);
  const b=level.buildings.find(b=>map.defaultBuildingSourceId?b.sourceId===map.defaultBuildingSourceId:b.name===map.defaultBuildingName);assert.ok(b);
  if(map.id==='charles-de-gaulle'){assert.equal(b.address,'Piața Charles de Gaulle 15');assert.equal(b.height,70);assert.equal(b.heightSource,'height tag');}
  const n=level.grid.size;
  const routes=[];
  for(const spawn of level.spawns){
    const path=findRoute(level.grid,spawn.cell,b.entrances);assert.ok(path,spawn.side);assert.ok(path.length>10);
    assert.ok(path.every(i=>level.grid.cost[i]>0));assert.ok(b.entrances.includes(path.at(-1)));
    for(let i=1;i<path.length;i++){const a=path[i-1],v=path[i],dx=v%n-a%n,dy=Math.floor(v/n)-Math.floor(a/n);assert.ok(Math.abs(dx)<=1&&Math.abs(dy)<=1);if(dx&&dy){assert.ok(level.grid.cost[Math.floor(a/n)*n+v%n]);assert.ok(level.grid.cost[Math.floor(v/n)*n+a%n]);}}
    routes.push({side:spawn.side,length:routeLength(level.grid,path),points:path.map(i=>cellPoint(level.grid,i))});
  }
  writeFileSync(`/tmp/td-routes-${map.id}.json`,JSON.stringify(routes));
});
