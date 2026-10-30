import {PluginHost} from './plugin-host.js';
import {plugins} from './site.config.js';
const host=new PluginHost();
const sound=document.querySelector('#site-sound');
let introComplete=!plugins.some(plugin=>plugin.id==='logo'),pianoStarted=false,lastPianoState=null,destroyed=false;
async function connect(){
  const piano=host.get('piano');
  if(introComplete&&piano&&!pianoStarted){pianoStarted=true;await piano.start();}
}
host.bus.addEventListener('logo:complete',()=>{introComplete=true;void connect();});
host.bus.addEventListener('piano:state',({detail})=>{
  lastPianoState=detail;
  if(!detail.audioSupported){sound.disabled=true;sound.setAttribute('aria-label','Piano sound is unavailable in this browser');sound.querySelector('span').textContent='Sound unavailable';return;}
  const active=detail.soundEnabled&&!detail.muted;
  sound.dataset.on=String(active);sound.setAttribute('aria-label',active?'Mute piano sound':detail.soundEnabled?'Unmute piano sound':'Enable piano sound');
  sound.querySelector('span').textContent=active?'Sound on':detail.soundEnabled?'Sound off':'Enable sound';
});
sound.addEventListener('click',()=>{
  const piano=host.get('piano');if(!piano)return;
  if(!lastPianoState?.soundEnabled)void piano.enableSound();else piano.toggleSound();
});
for(const name of ['help','credits']){
  const dialog=document.querySelector(`#${name}`);
  const close=()=>{dialog.close();host.get('piano')?.suspend('dialog',false);};
  document.querySelector(`#${name}-open`).addEventListener('click',()=>{host.get('piano')?.suspend('dialog',true);dialog.showModal();});
  dialog.querySelector('.dialog-close').addEventListener('click',close);
  dialog.querySelector('.dialog-done')?.addEventListener('click',close);
  dialog.addEventListener('cancel',e=>{e.preventDefault();close();});
  dialog.addEventListener('close',()=>host.get('piano')?.suspend('dialog',false));
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
}
for(const definition of plugins){
  if(destroyed)break;
  try{await host.mount(definition);void connect();}
  catch(error){console.error(`Could not mount ${definition.id}`,error);if(definition.id==='logo'){introComplete=true;void connect();}}
}
window.addEventListener('pagehide',e=>{if(!e.persisted){destroyed=true;host.destroy();}});
