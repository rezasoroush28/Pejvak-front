import {mountPejvakLogoAnimation} from './PejvakLogoAnimation.js';
export function mount(container,{emit,options={}}){
  let destroyed=false,complete=false,instance=null,fallback=false,timer=null;
  const assets=new URL('./assets/v1/',import.meta.url).href;
  const finish=state=>{if(!complete&&!destroyed){complete=true;clearTimeout(timer);emit('logo:complete',{state});}};
  async function still(state){
    if(destroyed||complete||fallback)return;fallback=true;
    const img=new Image();img.className='logo-static';img.alt='Pejvak, a grand piano shaped like the letter P';img.width=img.height=640;
    img.src=`${assets}piano-end-${matchMedia('(max-width:767px)').matches?'mobile':'desktop'}.webp`;
    try{await img.decode();}catch{}
    if(destroyed||complete)return;
    instance?.destroy();container.replaceChildren(img);finish(state);
  }
  const onState=e=>{
    if(e.detail.state==='complete')finish('played');
    if(['error','blocked','static'].includes(e.detail.state))void still(e.detail.state);
  };
  function watchdog(){clearTimeout(timer);if(!document.hidden&&!complete&&!destroyed)timer=setTimeout(()=>void still('timeout'),options.maxWaitMs??8000);}
  container.addEventListener('pejvak:statechange',onState);
  document.addEventListener('visibilitychange',watchdog);
  instance=mountPejvakLogoAnimation(container,{assetBaseUrl:assets,playOncePerSession:false,...options});
  watchdog();
  // A synchronous preference event can arrive before the instance assignment.
  return{destroy(){destroyed=true;clearTimeout(timer);document.removeEventListener('visibilitychange',watchdog);container.removeEventListener('pejvak:statechange',onState);instance?.destroy();container.replaceChildren();}};
}
