import { chromium } from 'playwright';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
const server=process.env.TD_BASE_URL?null:await createServer({server:{host:'127.0.0.1',port:5185,strictPort:false}});await server?.listen();
const base=(process.env.TD_BASE_URL||`http://127.0.0.1:${server.httpServer.address().port}`).replace(/\/$/,'');
const browser=await chromium.launch({...process.env.TD_BROWSER?{executablePath:process.env.TD_BROWSER}:{},headless:true,
  env:{...process.env,XDG_CONFIG_HOME:'/tmp/td-browser-config',XDG_CACHE_HOME:'/tmp/td-browser-cache'},
  args:['--no-sandbox','--no-zygote','--single-process','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
const page=await browser.newPage({viewport:{width:1500,height:1000}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error'&&/THREE|Shader|WebGL/.test(m.text()))errors.push(m.text());});
await page.goto(`${base}/?test`);await page.waitForFunction(()=>window.td,{timeout:30000});
// Render deterministic frames on demand so software WebGL does not starve browser input.
await page.evaluate(()=>td.pauseRenderingForTesting());
for(const map of ['alba-iulia','charles-de-gaulle']){
if(map==='charles-de-gaulle'){
  await page.setViewportSize({width:1500,height:1000});
  await page.selectOption('#map-select',map);
  await page.waitForFunction(()=>window.td?.data.id==='charles-de-gaulle');
  await page.evaluate(()=>td.pauseRenderingForTesting());
  assert.equal(await page.evaluate(()=>td.state.selected),'way/216673929/0');
  assert.match(await page.locator('#target-info').textContent(),/Charles de Gaulle 15/);
}
assert.equal(await page.locator('#download-map').evaluate(a=>a.href),`${base}/data/${map}.json`);
assert.equal(await page.locator('.brand').evaluate(a=>a.href),`${base}/`);
const license=await page.locator('.sidebar-footer a').last().evaluate(a=>a.href);
assert.equal(license,`${base}/data/NOTICE.txt`);
assert.equal((await page.request.get(license)).status(),200);
assert.equal(await page.evaluate(()=>td.state.health),20);
assert.equal(await page.evaluate(()=>td.state.towers),0);
assert.ok(await page.evaluate(()=>td.state.scenery.pitchedRoofs>0),'pitched roofs generated');
if(map==='charles-de-gaulle'){assert.ok(await page.evaluate(()=>td.state.scenery.glassPanels>100),'glass facade panels generated');assert.ok(await page.evaluate(()=>td.state.scenery.decorativeTrees>100),'park planting visible');}
await page.click('#style-16');
await page.waitForTimeout(400);
const frame16=await page.evaluate(()=>td.sampleFrameForTesting());
assert.ok(frame16.colorCount>24&&frame16.colorCount<=48,'16-bit output stays within its 48-color palette');
assert.equal(frame16.pixelScale,2);assert.equal(frame16.antialiasing,true);assert.equal(frame16.finalSmoothing,false);
assert.equal(frame16.sceneScale,2,'16-bit samples fine geometry before reducing to the pixel grid');
const scaling=await page.locator('#map canvas').evaluate(canvas=>({width:canvas.getBoundingClientRect().width/canvas.width,height:canvas.getBoundingClientRect().height/canvas.height}));
assert.deepEqual(scaling,{width:2,height:2},'display enlarges pixels by an exact integer');
assert.equal(await page.evaluate(()=>td.state.scenery.strongholdFlag),true,'stronghold has its own pennant');
assert.ok(await page.evaluate(()=>td.state.scenery.parkedCars>0),'decorative street life generated');
const beforeStyle=await page.evaluate(()=>({selected:td.state.selected,path:td.state.path,health:td.state.health,towers:td.state.towers}));
await page.click('#style-8');
const frame8=await page.evaluate(()=>td.sampleFrameForTesting());
assert.ok(frame8.colors.length>8&&frame8.colors.length<=24,'8-bit frame uses its smaller palette');
assert.equal(frame8.samples,0);assert.equal(frame8.pixelScale,3);assert.ok(frame8.width<frame16.width);
assert.deepEqual(await page.evaluate(()=>({selected:td.state.selected,path:td.state.path,health:td.state.health,towers:td.state.towers})),beforeStyle,'graphics switch preserves the game');
mkdirSync('artifacts',{recursive:true});
await page.evaluate(()=>td.sampleFrameForTesting());
await page.screenshot({path:`artifacts/${map}-8bit.png`,timeout:60000});
await page.click('#style-16');
await page.waitForTimeout(400);
mkdirSync('artifacts',{recursive:true});
console.log(`${map}: rendering screenshot`,await page.evaluate(()=>({triangles:td.state.triangles,drawCalls:td.state.drawCalls,scenery:td.state.scenery})));
await page.evaluate(()=>td.sampleFrameForTesting());
await page.screenshot({path:`artifacts/${map}-preview.png`,timeout:60000});
const initial=await page.evaluate(()=>td.state.selected);
await page.click('#focus-view');await page.evaluate(()=>td.sampleFrameForTesting());
assert.equal(await page.evaluate(()=>td.state.selected),initial,'focus preserves the stronghold');
await page.screenshot({path:`artifacts/${map}-stronghold.png`,timeout:60000});
const beforeMotion=await page.evaluate(()=>({selected:td.state.selected,path:td.state.path,towers:td.state.towers}));
for(const button of ['left','right']){
  await page.mouse.move(1000,550);await page.mouse.down({button});
  for(let step=1;step<=4;step++){
    await page.mouse.move(1000+step*12,550+step*3);
    const moving=await page.evaluate(()=>td.sampleFrameForTesting());
    assert.ok(moving.colorCount>24&&moving.colorCount<=48,'camera movement renders within the palette');
  }
  await page.mouse.up({button});
}
assert.deepEqual(await page.evaluate(()=>({selected:td.state.selected,path:td.state.path,towers:td.state.towers})),beforeMotion,'orbit and pan preserve the game');
await page.evaluate(()=>td.sampleFrameForTesting());
await page.screenshot({path:`artifacts/${map}-camera-motion.png`,timeout:60000});
await page.click('#top');await page.waitForTimeout(500);
const alternative=await page.evaluate(initial=>td.data.buildings.find(b=>b.id!==initial&&Math.hypot(...b.center)<170)?.id,initial);
const p=await page.evaluate(id=>td.projectBuilding(id),alternative), rect=await page.locator('canvas').boundingBox();
await page.mouse.click(rect.x+p.x,rect.y+p.y);assert.equal(await page.evaluate(()=>td.state.selected),alternative,'click selects a real building');
await page.evaluate(id=>td.selectBuilding(id),initial);
for(const value of ['1','2','3','0']){await page.selectOption('#spawn',value);assert.ok(await page.evaluate(()=>td.state.path.length>0),'entry has a route');}
const placements=await page.evaluate(()=>{
 const grid=td.data.grid,n=grid.size;
 const point=id=>[grid.origin[0]+(id%n+.5)*grid.cell,grid.origin[1]+(Math.floor(id/n)+.5)*grid.cell];
 const road=point(td.state.path[0]);const rejectedRoad=!td.placeTower(...road);
 let placed=0;
 const route=td.state.path.map(point);
 for(let i=0;i<grid.cost.length&&placed<3;i+=2){if(grid.cost[i]!==5)continue;const p=point(i);if(!route.some(r=>Math.hypot(r[0]-p[0],r[1]-p[1])<35))continue;if(td.placeTower(...p))placed++;}
 return {placed,rejectedRoad};
});assert.ok(placements.rejectedRoad);assert.equal(placements.placed,3);
await page.click('#start');assert.equal(await page.evaluate(()=>td.state.running),true);
await page.click('#style-8');assert.equal(await page.evaluate(()=>td.state.towers),3,'style switch preserves placed towers during combat');
assert.equal(await page.evaluate(()=>td.state.running),true);
const battle=await page.evaluate(()=>{td.advanceForTesting(65);return td.state;});
assert.equal(battle.spawned,12);assert.equal(battle.running,false);assert.equal(battle.defeated+battle.escaped,12);assert.ok(battle.defeated>0,'towers shoot enemies');
await page.click('#style-16');
await page.click('#reset');assert.equal(await page.evaluate(()=>td.state.towers),0);assert.equal(await page.evaluate(()=>td.state.health),20);
await page.setViewportSize({width:390,height:844});
await page.waitForFunction(()=>td.state.display.width===Math.ceil(document.getElementById('map').clientWidth/2));
await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth,{},{timeout:15000});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile has no horizontal overflow');
assert.ok((await page.evaluate(()=>td.sampleFrameForTesting())).colorCount>24,'mobile map renders scenery');
await page.screenshot({path:`artifacts/${map}-mobile.png`,fullPage:true});
console.log(JSON.stringify({map,browser:'headless shell / software WebGL',checks:['load','48-color pixel rendering','24-color rendering','style switching during combat','click building','four spawn entries','invalid road placement','three towers','complete 12-enemy wave','reset','mobile layout'],battle:{...battle,path:battle.path.length}},null,2));
}
await page.click('#start');
await page.click('#style-8');
await page.selectOption('#map-select','alba-iulia');
await page.waitForFunction(()=>window.td?.data.id==='alba-iulia');
assert.equal(await page.evaluate(()=>td.state.running),false,'map switch resets active wave');
assert.equal(await page.evaluate(()=>td.state.display.style),'8','graphics preference survives map reload');
assert.equal(await page.evaluate(()=>td.state.health),20);
assert.equal(await page.evaluate(()=>td.state.towers),0);
// Regression: fractional stretching and DPI-dependent smoothing caused the old
// 16-bit mode to look like a soft miniature. Reuse the page because this machine's
// single-process headless shell does not support a second isolated context.
await page.evaluate(()=>td.pauseRenderingForTesting());
await page.setViewportSize({width:1299,height:901});
const cdp=await page.context().newCDPSession(page);
await cdp.send('Emulation.setDeviceMetricsOverride',{width:1299,height:901,deviceScaleFactor:2,mobile:false});
await page.click('#style-16');
assert.equal(await page.evaluate(()=>devicePixelRatio),2);
const denseFrame=await page.evaluate(()=>td.sampleFrameForTesting());
assert.ok(denseFrame.colorCount<=48&&denseFrame.colorCount>24,'high DPI preserves the palette');
assert.deepEqual(await page.locator('#map canvas').evaluate(c=>({x:c.getBoundingClientRect().width/c.width,y:c.getBoundingClientRect().height/c.height})),{x:2,y:2},'odd viewport and high DPI preserve integer pixels');
if(errors.length)throw Error(errors.join('\n'));
console.log('All browser checks passed, including style persistence and map switching.');
}finally{await browser.close();await server?.close();}
