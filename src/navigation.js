// Weighted A* on the exported clearance grid. No diagonal corner cutting.
export function cellPoint(grid, id) {
  return [grid.origin[0] + (id % grid.size + .5) * grid.cell,
    grid.origin[1] + (Math.floor(id / grid.size) + .5) * grid.cell];
}
export function pointCell(grid, x, z) {
  const c = Math.floor((x-grid.origin[0])/grid.cell), r = Math.floor((z-grid.origin[1])/grid.cell);
  return c < 0 || r < 0 || c >= grid.size || r >= grid.size ? -1 : r * grid.size + c;
}
class Heap {
  items = [];
  push(node) {
    const a=this.items; a.push(node); let i=a.length-1;
    while(i>0){const p=(i-1)>>1;if(a[p][1]<=node[1])break;a[i]=a[p];i=p;} a[i]=node;
  }
  pop(){const a=this.items, first=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1][1]<a[c][1])c++;if(a[c][1]>=last[1])break;a[i]=a[c];i=c;}a[i]=last;}return first;}
}
export function findRoute(grid, start, goals, blocked = new Set()) {
  const n=grid.size, count=n*n;
  const goalSet=new Set(goals.filter(i=>i>=0&&i<count&&grid.cost[i]&&!blocked.has(i)));
  if(start<0||start>=count||!grid.cost[start]||blocked.has(start)||!goalSet.size)return null;
  const goalPoints=[...goalSet].map(i=>[i%n,Math.floor(i/n)]);
  const heuristic=(x,y)=>{let d=Infinity;for(const [gx,gy] of goalPoints)d=Math.min(d,Math.hypot(x-gx,y-gy));return d;};
  const dist=new Float64Array(count).fill(Infinity), prev=new Int32Array(count).fill(-1),closed=new Uint8Array(count),q=new Heap();
  dist[start]=0;q.push([start,0]);
  while(q.items.length){const [id]=q.pop();if(closed[id])continue;closed[id]=1;
    if(goalSet.has(id)){const path=[];for(let v=id;v!==-1;v=prev[v])path.push(v);return path.reverse();}
    const x=id%n,y=Math.floor(id/n);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=n||ny>=n)continue;
      const next=ny*n+nx;if(!grid.cost[next]||blocked.has(next)||closed[next])continue;
      if(dx&&dy&&(!grid.cost[y*n+nx]||!grid.cost[ny*n+x]||blocked.has(y*n+nx)||blocked.has(ny*n+x)))continue;
      const d=dist[id]+(dx&&dy?Math.SQRT2:1)*(grid.cost[id]+grid.cost[next])/2;
      if(d<dist[next]){dist[next]=d;prev[next]=id;q.push([next,d+heuristic(nx,ny)]);}
    }
  }return null;
}
export function routeLength(grid, route) {
  return route.slice(1).reduce((sum,id,i)=>{const a=cellPoint(grid,route[i]),b=cellPoint(grid,id);return sum+Math.hypot(a[0]-b[0],a[1]-b[1]);},0);
}
