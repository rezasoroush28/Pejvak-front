import {chromium,firefox,webkit} from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const origin=process.env.PREVIEW_URL||'http://127.0.0.1:5175';
const output=new URL('../output/playwright/',import.meta.url);await mkdir(output,{recursive:true});
const file=name=>new URL(name,output).pathname.replace(/^\/(\w:)/,'$1');
const continueRun=process.argv.includes('--continue');
const report=continueRun?JSON.parse(await readFile(file('verification.json'),'utf8')):{date:new Date().toISOString(),checks:[],browsers:{}};
const pass=name=>{if(!report.checks.includes(name))report.checks.push(name);console.log(`PASS ${name}`);};
async function instrumentation(page){
  await page.addInitScript(()=>{
    window.qa={contexts:[],analysers:[],states:[],shifts:0};
    const Native=window.AudioContext;
    if(Native)window.AudioContext=class extends Native{
      constructor(...args){super(...args);window.qa.contexts.push(this);let first=true;const create=this.createGain.bind(this);this.createGain=()=>{const node=create();if(first){first=false;const analyser=this.createAnalyser();node.connect(analyser);window.qa.analysers.push(analyser);}return node;};}
    };
    new PerformanceObserver(list=>{for(const entry of list.getEntries())if(!entry.hadRecentInput)window.qa.shifts+=entry.value;}).observe({type:'layout-shift',buffered:true});
    const observer=new MutationObserver(()=>{
      const piano=document.querySelector('.mp'),logo=document.querySelector('.pejvak-logo');
      const state=`${logo?.dataset.state||document.querySelector('.logo-static')&&'static'}:${piano?.dataset.state}`;
      if(window.qa.states.at(-1)?.state!==state)window.qa.states.push({state,time:performance.now()});
    });observer.observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['data-state']});
  });
}
const rms=page=>page.evaluate(()=>{const a=window.qa.analysers[0];if(!a)return 0;const samples=new Float32Array(a.fftSize);a.getFloatTimeDomainData(samples);return Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length);});
const state=(page,value)=>page.waitForFunction(value=>document.querySelector('.mp')?.dataset.state===value,value,{timeout:20000});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
  if(!continueRun){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await instrumentation(page);
  await page.goto(origin);await state(page,'playing');
  const timeline=await page.evaluate(()=>window.qa.states);
  assert(timeline.find(e=>e.state.endsWith(':playing'))?.state.startsWith('complete:'));
  assert.equal(await page.locator('.mp-key').count(),13);
  await page.waitForTimeout(300);
  assert(await rms(page)>.0001);
  assert(await page.locator('.score-note.active').count()>0);
  pass('Logo completes before the piano starts; sampled sound, moving keys and live score');
  await page.screenshot({path:file('desktop.png'),fullPage:true});
  await page.keyboard.down('a');await page.keyboard.down('d');await state(page,'manual');
  assert.equal(await page.locator('.mp-key.is-active').count(),2);assert.equal(await page.locator('.score-note.manual').count(),2);
  assert.equal(await page.locator('[data-ui="score-title"]').textContent(),'Your notes, your melody');
  await page.waitForTimeout(400);assert(await rms(page)>.0001);
  await page.keyboard.up('a');await page.keyboard.up('d');
  const frozen=await page.locator('[data-ui="seek"]').inputValue();
  await page.waitForTimeout(750);assert.equal(await page.locator('[data-ui="seek"]').inputValue(),frozen);assert(await rms(page)<.00005);
  assert.match(await page.locator('[data-ui="countdown"]').textContent(),/Melody returns in/);
  pass('Manual chords stop the song, show their notes, release sound, freeze song position');
  await page.screenshot({path:file('manual-notes.png'),fullPage:true});
  // Exercise the actual 15-second browser timer, including a deadline reset.
  await page.waitForTimeout(10000);
  await page.keyboard.press('s');const releaseTime=Date.now();
  await page.waitForTimeout(5000);await state(page,'manual');
  await page.waitForTimeout(9300);await state(page,'manual');
  await state(page,'playing');const idleElapsed=Date.now()-releaseTime;
  assert(idleElapsed>=14900&&idleElapsed<18000,`Idle resume ${idleElapsed}ms`);
  const resumed=+await page.locator('[data-ui="seek"]').inputValue();assert(resumed>=+frozen&&resumed<+frozen+1.5,`Saved ${frozen}, resumed ${resumed}`);
  assert.equal(await page.locator('.score-note.manual').count(),0);
  report.idleResumeMs=idleElapsed;
  pass(`Real 15-second idle resume (${idleElapsed}ms), reset by a later key, continuing saved position`);
  await page.getByRole('button',{name:'Mute piano sound'}).click();await page.waitForTimeout(400);assert(await rms(page)<.00005);
  await page.getByRole('button',{name:'Unmute piano sound'}).click();await page.waitForTimeout(400);assert(await rms(page)>.0001);
  await page.getByRole('button',{name:'Pause song',exact:true}).click();
  await page.keyboard.press('w');await state(page,'manual');
  // Explicit Resume followed by Pause must cancel the automatic resume.
  await page.locator('[data-ui="play"]').click();await state(page,'playing');await page.getByRole('button',{name:'Pause song',exact:true}).click();
  await page.waitForTimeout(300);await state(page,'paused');assert.equal(await page.locator('[data-ui="countdown"]').textContent(),'');
  pass('Mute/unmute output, sharp notes, explicit Pause cancels the idle countdown');
  await page.getByRole('button',{name:'How to play'}).click();await page.keyboard.press('a');assert.equal(await page.locator('.mp-key.is-active').count(),0);await page.keyboard.press('Escape');
  await page.locator('.mp-key[data-midi="61"]').focus();await page.keyboard.down('Enter');assert.equal(await page.locator('.mp-key[data-midi="61"]').getAttribute('aria-pressed'),'true');await page.keyboard.up('Enter');
  pass('Dialog shortcut suppression, Escape close and focused-key Enter activation');
  const axe=await new AxeBuilder({page}).analyze();assert.equal(axe.violations.length,0,JSON.stringify(axe.violations,null,2));report.desktopAxe=axe.passes.length;
  assert.deepEqual(errors,[]);report.normalConsoleErrors=errors;report.desktopCls=await page.evaluate(()=>window.qa.shifts);
  await context.close();
  }

  for(const width of [320,375,390,768]){
    const context=await browser.newContext({viewport:{width,height:900},hasTouch:true});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);await state(page,'playing');
    assert.equal(await page.locator('.mp-key').count(),13);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const background=await page.locator('.mp-sheet').evaluate(el=>getComputedStyle(el).backgroundColor);assert.equal(background,'rgb(27, 17, 43)');
    if(width===390){
      const cdp=await context.newCDPSession(page);const key=await page.locator('.mp-key[data-midi="60"]').boundingBox(),other=await page.locator('.mp-key[data-midi="64"]').boundingBox();
      const points=[key,other].map((r,i)=>({id:i+1,x:r.x+r.width/2,y:r.y+r.height*.85}));
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});await state(page,'manual');assert.equal(await page.locator('.mp-key.is-active').count(),2);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.equal(await page.locator('.mp-key.is-active').count(),0);
      await page.screenshot({path:file('mobile.png'),fullPage:true});
      const axe=await new AxeBuilder({page}).analyze();assert.equal(axe.violations.length,0,JSON.stringify(axe.violations,null,2));report.mobileAxe=axe.passes.length;
    }
    assert.deepEqual(errors,[]);pass(`${width}px responsive layout, dark sheet${width===390?', two-finger chord and axe accessibility':''}`);await context.close();
  }
  {
    const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const page=await context.newPage();const requests=[];page.on('request',r=>requests.push(r.url()));await page.goto(origin);await state(page,'playing');
    assert.equal(await page.locator('.logo-static').count(),1);assert.equal(requests.filter(x=>/\.(mp4|webm)$/.test(x)).length,0);pass('Reduced motion skips video and still hands off to the piano');await context.close();
  }
}finally{await browser.close();await writeFile(file('verification.json'),JSON.stringify(report,null,2));}

// Enforce first-visit audio policy independently of the autoplay-allowed suite.
const guarded=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=document-user-activation-required']});
try{
  const context=await guarded.newContext();const page=await context.newPage();await page.goto(origin);
  // Chromium treats some CDP Runtime.evaluate calls as user activation. Let
  // the native policy decide before any in-page polling can grant activation.
  await page.waitForTimeout(4500);
  assert.equal(await page.locator('.mp').getAttribute('data-state'),'blocked');
  await page.locator('#site-sound').click();await state(page,'playing');pass('Real browser audio restriction: Enable sound starts the melody');
}finally{await guarded.close();}
for(const [name,engine]of [['firefox',firefox],['webkit',webkit]]){
  let b;
  try{
    b=await engine.launch({headless:true});const page=await b.newPage({viewport:{width:390,height:900}});await page.goto(origin);
    if(name==='webkit'&&!await page.evaluate(()=>Boolean(window.AudioContext||window.webkitAudioContext))){
      await page.waitForSelector('.logo-static',{timeout:12000});await page.keyboard.press('a');await state(page,'manual');assert(await page.locator('.score-note.manual').count()>0);assert.match(await page.locator('[data-ui="hint"]').textContent(),/Sound isn’t available/);
      report.browsers[name]='Windows runner has no Web Audio; stalled-video static fallback and manual notation passed. Safari audio unverified.';
    }else{
      await page.waitForFunction(()=>['blocked','playing'].includes(document.querySelector('.mp')?.dataset.state),null,{timeout:20000});if(await page.locator('.mp').getAttribute('data-state')==='blocked')await page.locator('#site-sound').click();await state(page,'playing');await page.keyboard.press('a');await state(page,'manual');assert(await page.locator('.score-note.manual').count()>0);report.browsers[name]='Playback and manual takeover passed';
    }
  }
  catch(error){report.browsers[name]=error.message.split('\n')[0];process.exitCode=1;}
  finally{await b?.close();}console.log(`${name}: ${report.browsers[name]}`);
}
await writeFile(file('verification.json'),JSON.stringify(report,null,2));
