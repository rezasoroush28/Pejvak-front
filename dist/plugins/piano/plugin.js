import {PianoAudio} from './audio-engine.js';
import {PianoTransport} from './transport.js';
import {LittleScore} from './score.js';
import {IdleResume} from './idle-resume.js';
import {LOW,HIGH,INPUT_KEYS,PITCHES,COLORS,noteName,visibleKey} from './keyboard-map.js';

const svg=(path)=>`<svg aria-hidden="true" viewBox="0 0 24 24">${path}</svg>`;
const icons={play:svg('<path d="m9 5 11 7-11 7Z"/>'),pause:svg('<path d="M8 5v14M16 5v14"/>'),restart:svg('<path d="M4 9a8 8 0 1 1 0 6M4 3v6h6"/>')};
const format=s=>`${Math.floor(Math.max(0,s)/60)}:${String(Math.floor(Math.max(0,s)%60)).padStart(2,'0')}`;

export function mount(container,{emit,options={}}){
  const root=document.createElement('div');root.className='mp';root.dataset.state='intro';
  root.innerHTML=`
    <div class="mp-heading"><div><span class="mp-tune-mark" aria-hidden="true">♫</span><div><h2>Your little piano</h2><p>Victor’s Piano Solo <span>from Corpse Bride</span></p></div></div><span class="mp-status"><i></i><span data-ui="mode">Opening the piano</span></span></div>
    <div class="mp-workspace">
      <div class="mp-instrument">
        <div class="mp-case"><div class="mp-case-top"><span>pejvak</span><span class="mp-case-light" aria-hidden="true"></span></div><div class="mp-keys" data-ui="keys" role="group" aria-label="Mini piano, C4 to C5"></div><div class="mp-case-bottom"><span>one octave, all yours</span><span aria-hidden="true">✧</span></div></div>
        <div class="mp-controls"><button class="mp-play" data-ui="play" aria-label="Play song" disabled>${icons.play}<span data-ui="play-label">Getting ready</span></button><button class="mp-restart" data-ui="restart" aria-label="Restart song" title="Restart song">${icons.restart}</button><span class="mp-shortcut-hint">Try <kbd>A</kbd> to <kbd>K</kbd></span></div>
      </div>
      <div class="mp-sheet"><div class="mp-sheet-heading"><h3 data-ui="score-title">Follow the melody</h3><span class="mp-live"><i></i>Live notes</span></div><svg class="mp-score" data-ui="sheet" viewBox="0 0 530 194" role="img" aria-label="Musical notation for the song or the notes you play"></svg><div class="mp-note-trail" data-ui="trail" aria-label="Your recent notes"><span class="mp-trail-placeholder">Every note starts something.</span></div><p class="mp-sheet-caption" data-ui="caption">The lavender notes are the ones you hear.</p></div>
    </div>
    <div class="mp-bottom"><div class="mp-timeline"><input data-ui="seek" aria-label="Song position" type="range" min="0" max="100" step="0.01" value="0" disabled><span class="mp-time"><span data-ui="time">0:00</span><span aria-hidden="true"> / </span><span data-ui="duration">1:25</span></span></div><div class="mp-invitation"><span data-ui="hint">A melody is on its way. You can try a key anytime.</span><span class="mp-resume" data-ui="countdown"></span></div></div>
    <p class="sr-only" data-ui="announcement" role="status" aria-live="polite"></p>`;
  container.append(root);
  const $=name=>root.querySelector(`[data-ui="${name}"]`);
  const audio=new PianoAudio(),transport=new PianoTransport(audio),score=new LittleScore($('sheet'));
  const audioSupported=Boolean(window.AudioContext||window.webkitAudioContext);
  const keys=new Map(),held=new Map(),history=[],disposers=[],reasons=new Set();
  const shortcuts=Object.fromEntries(Object.entries(INPUT_KEYS).map(([code,m])=>[m,code.slice(-1)]));
  let destroyed=false,ready=false,introComplete=false,ownTurn=false,explicitPause=false,muted=false;
  let blocked=false,busy=false,token=0,raf=null,countdownTimer=null,resumeAfterSuspend=false,lastState='',errorMessage='',lastUi=0;
  const idle=new IdleResume(()=>{if(introComplete&&ownTurn&&!explicitPause&&!reasons.size)void startSong();},{delay:options.idleResumeMs??15000});
  idle.suspend(true);
  audio.prime();

  function on(target,event,fn,opts){target.addEventListener(event,fn,opts);disposers.push(()=>target.removeEventListener(event,fn,opts));}
  function notify(){
    const state={playing:transport.playing,ownTurn,blocked,muted,ready,introComplete,audioSupported,soundEnabled:audio.context?.state==='running',position:transport.time};
    emit('piano:state',state);
  }
  function update(){
    if(destroyed)return;
    const playing=transport.playing;
    let mode=ownTurn?'Your turn':playing?'Playing for you':!introComplete?'Opening the piano':blocked?'Ready to listen':explicitPause?'Taking a little break':ready?'Ready when you are':'Getting ready';
    if(errorMessage)mode='The piano is still yours';
    root.dataset.state=ownTurn?'manual':playing?'playing':blocked?'blocked':!introComplete?'intro':'paused';
    $('mode').textContent=mode;
    $('play').disabled=!ready||busy||!audioSupported;
    const label=!audioSupported?'Sound unavailable':busy?'One moment':playing?'Pause':blocked?'Enable sound':transport.position>0&&transport.position<transport.duration-.01?'Resume':'Play';
    $('play-label').textContent=label;
    $('play').setAttribute('aria-label',playing?'Pause song':blocked?'Enable piano sound':label==='Resume'?'Resume song':'Play song');
    $('play').querySelector('svg').outerHTML=playing?icons.pause:icons.play;
    $('score-title').textContent=ownTurn?'Your notes, your melody':'Follow the melody';
    $('caption').textContent=ownTurn?'A little melody that only you could make.':'The lavender notes are the ones you hear.';
    $('hint').textContent=errorMessage|| (ownTurn?'Keep exploring. There’s no wrong note.':playing?'Want a turn? Just tap a key.':blocked?'Tap Enable sound, or play your first note.':explicitPause?'Press Play whenever you’re ready.':!introComplete?'A melody is on its way. Try a key anytime.':'Pick a key. See where it takes you.');
    const stateSignature=`${mode}|${blocked}|${muted}`;
    if(lastState!==stateSignature){lastState=stateSignature;$('announcement').textContent=ownTurn?'Your turn. The song will resume 15 seconds after you finish playing.':mode;notify();}
    countdown();frame(true);
  }
  function countdown(){
    const remaining=idle.remaining;
    $('countdown').textContent=ownTurn&&introComplete&&!explicitPause&&!reasons.size?(held.size?'Take your time':remaining===null?'':`Melody returns in ${Math.ceil(remaining/1000)}s`):'';
    if(ownTurn&&introComplete&&!explicitPause&&!reasons.size&&countdownTimer===null)countdownTimer=setInterval(countdown,250);
    if((!ownTurn||explicitPause||reasons.size)&&countdownTimer!==null){clearInterval(countdownTimer);countdownTimer=null;}
  }
  function frame(force=false){
    if(destroyed)return;
    const now=performance.now();
    if(!force&&now-lastUi<30)return;
    lastUi=now;
    const time=Math.max(0,transport.time),sounding=new Set([...held.values()].map(h=>h.midi));
    if(transport.playing)for(const n of transport.notes)if(n.time<=time+.008&&n.time+n.duration>time)sounding.add(n.midi);
    const visible=new Set([...sounding].map(visibleKey));
    for(const [m,key]of keys){const active=visible.has(m);if(key.classList.contains('is-active')!==active){key.classList.toggle('is-active',active);key.setAttribute('aria-pressed',String(active));}}
    if(ownTurn)score.manual(history,sounding);else score.song(time,transport.playing);
    $('seek').value=time;$('seek').style.setProperty('--progress',`${transport.duration?time/transport.duration*100:0}%`);
    $('seek').setAttribute('aria-valuetext',`${format(time)} of ${format(transport.duration)}`);$('time').textContent=format(time);
  }
  function tick(){raf=null;if(destroyed)return;frame();if(transport.playing)raf=requestAnimationFrame(tick);}
  function startFrames(){if(raf===null&&transport.playing)raf=requestAnimationFrame(tick);}
  function stopFrames(){if(raf!==null)cancelAnimationFrame(raf);raf=null;}
  on(transport,'change',()=>{if(transport.playing)startFrames();else stopFrames();update();});

  function trail(){
    $('trail').replaceChildren();
    for(const note of history.slice(-8)){const span=document.createElement('span');span.className='mp-trail-note';span.textContent=PITCHES[note.midi%12];span.style.setProperty('--note-color',COLORS[note.midi%12]);span.setAttribute('aria-label',noteName(note.midi));$('trail').append(span);}
  }
  async function down(id,midi){
    if(destroyed||held.has(id)||reasons.size)return;
    token++;busy=false;ownTurn=true;explicitPause=false;blocked=false;
    const note={midi,voice:null};held.set(id,note);idle.touch(id,true);transport.pause();
    history.push({midi,id:`${performance.now()}-${id}`,duration:.5});if(history.length>80)history.shift();trail();update();
    emit('piano:note',{midi,source:'manual'});
    try{await audio.unlock();if(!destroyed&&held.get(id)===note){note.voice=audio.note(midi,{velocity:.8});notify();}}
    catch{errorMessage='Sound isn’t available here. You can still explore the notes.';update();}
  }
  function up(id){const note=held.get(id);if(!note)return;note.voice?.release(.25);held.delete(id);idle.touch(id,false);frame(true);countdown();}
  function releaseAll(){for(const id of [...held.keys()])up(id);}
  const whites=[60,62,64,65,67,69,71,72];
  for(let midi=LOW;midi<=HIGH;midi++){
    const black=!whites.includes(midi),key=document.createElement('button');key.type='button';key.className=`mp-key ${black?'mp-black':'mp-white'}`;key.dataset.midi=midi;
    key.setAttribute('aria-label',`Play ${noteName(midi)}${shortcuts[midi]?`, keyboard ${shortcuts[midi]}`:''}`);key.setAttribute('aria-pressed','false');key.style.setProperty('--note-color',COLORS[midi%12]);
    if(black)key.style.left=`${whites.filter(n=>n<midi).length/8*100-3.9}%`;
    else{const label=document.createElement('span');label.className='mp-key-letter';label.textContent=PITCHES[midi%12];key.append(label);}
    const shortcut=document.createElement('span');shortcut.className='mp-key-shortcut';shortcut.textContent=shortcuts[midi]||'';key.append(shortcut);
    on(key,'pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;e.preventDefault();key.setPointerCapture(e.pointerId);void down(`p${e.pointerId}`,midi);});
    for(const event of ['pointerup','pointercancel','lostpointercapture'])on(key,event,e=>up(`p${e.pointerId}`));
    on(key,'keydown',e=>{if(['Enter','Space'].includes(e.code)){e.preventDefault();if(!e.repeat)void down(`b${midi}`,midi);}});
    on(key,'keyup',e=>{if(['Enter','Space'].includes(e.code)){e.preventDefault();up(`b${midi}`);}});
    on(key,'blur',()=>up(`b${midi}`));keys.set(midi,key);$('keys').append(key);
  }
  on(document,'keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey||document.querySelector('dialog[open]')||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable)return;
    if(INPUT_KEYS[e.code]!==undefined){e.preventDefault();if(!e.repeat)void down(`k${e.code}`,INPUT_KEYS[e.code]);}
  });
  on(document,'keyup',e=>{if(INPUT_KEYS[e.code]!==undefined)up(`k${e.code}`);});
  on(window,'blur',()=>releaseAll());

  async function startSong({gesture=false,restart=false}={}){
    if(destroyed||!ready||reasons.size)return false;
    if(!audioSupported){errorMessage='Sound isn’t available here. You can still explore the notes.';update();return false;}
    if(!introComplete){if(gesture){void audio.unlock().catch(()=>{});notify();}return false;}
    const thisToken=++token;busy=true;blocked=false;
    if(gesture){releaseAll();ownTurn=false;explicitPause=false;idle.stop();}
    update();
    try{
      const attempt=audio.unlock();
      // A suspended context's resume() can remain pending until a later gesture.
      const running=await Promise.race([attempt.then(()=>true),new Promise(resolve=>setTimeout(()=>resolve(false),180))]);
      if(thisToken!==token||destroyed)return false;
      if(!running&&audio.context?.state!=='running'){blocked=true;return false;}
      await audio.ready;
      if(thisToken!==token||destroyed||reasons.size)return false;
      releaseAll();ownTurn=false;explicitPause=false;idle.stop();
      if(restart)transport.seek(0);
      transport.start();emit('piano:play',{position:transport.time});return true;
    }catch{errorMessage='The melody couldn’t start. Try a key, or press Play again.';return false;}
    finally{if(thisToken===token&&!destroyed){busy=false;update();notify();}}
  }
  function pause(){token++;busy=false;ownTurn=false;explicitPause=true;idle.stop();releaseAll();idle.stop();transport.pause();update();}
  on($('play'),'click',()=>{if(transport.playing)pause();else void startSong({gesture:true});});
  on($('restart'),'click',()=>{if(ready)void startSong({gesture:true,restart:true});});
  on($('seek'),'input',e=>{token++;busy=false;ownTurn=false;idle.stop();releaseAll();idle.stop();transport.seek(+e.target.value);update();});

  function suspend(reason,value){
    const wasSuspended=reasons.size>0;
    if(value)reasons.add(reason);else reasons.delete(reason);
    if(!wasSuspended&&reasons.size){resumeAfterSuspend=transport.playing;token++;busy=false;idle.suspend(true);releaseAll();transport.pause();audio.stopAll();}
    if(wasSuspended&&!reasons.size){idle.suspend(!introComplete);if(resumeAfterSuspend&&!explicitPause&&!ownTurn)void startSong();resumeAfterSuspend=false;}
    update();
  }
  on(document,'visibilitychange',()=>suspend('hidden',document.hidden));
  if(document.hidden)reasons.add('hidden');

  const readyPromise=(async()=>{
    try{
      await import('../../assets/midi.js');
      const response=await fetch(new URL('../../assets/victors-piano-solo.mid',import.meta.url));
      if(!response.ok)throw new Error('Song unavailable');
      const midi=new window.Midi(await response.arrayBuffer());
      const notes=midi.tracks.flatMap(t=>t.notes.map(n=>({midi:n.midi,time:n.time,duration:n.duration,velocity:.72}))).sort((a,b)=>a.time-b.time||a.midi-b.midi);
      const starts=[...new Set(notes.map(n=>n.time))];
      const arranged=notes.map((n,i)=>{const gap=(starts[starts.indexOf(n.time)+1]??n.time+.5)-n.time;return{...n,id:i,duration:Math.min(1.7,Math.max(.12,gap*.88)),notationDuration:gap};});
      if(destroyed)return;
      transport.load(arranged);score.load(arranged);ready=true;$('seek').disabled=false;$('seek').max=transport.duration;$('duration').textContent=format(transport.duration);update();
    }catch{if(!destroyed){errorMessage='The tune couldn’t load. Make a little music of your own.';update();}}
  })();
  update();
  return{
    async start(){
      introComplete=true;idle.suspend(reasons.size>0);await readyPromise;if(destroyed)return;
      if(ownTurn){update();return;}
      if(!explicitPause)await startSong();else update();
    },
    async enableSound(){
      // Called directly by the site's button in the user-activation task.
      const attempt=audio.unlock();
      muted=false;audio.setVolume(.65);
      try{await attempt;if(!destroyed){blocked=false;notify();if(introComplete&&!ownTurn&&!explicitPause)await startSong({gesture:true});else update();}}catch{errorMessage='Sound isn’t available in this browser.';update();}
    },
    toggleSound(){muted=!muted;audio.setVolume(muted?0:.65);notify();return muted;},
    suspend,
    pause,
    destroy(){
      if(destroyed)return;destroyed=true;token++;idle.destroy();stopFrames();clearInterval(countdownTimer);
      for(const dispose of disposers)dispose();transport.pause();audio.stopAll();void audio.context?.close();root.remove();
    },
  };
}
