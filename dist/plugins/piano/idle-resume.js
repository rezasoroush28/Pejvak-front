/** One finite idle deadline. A held key can never be interrupted by the song. */
export class IdleResume {
  constructor(onResume,{delay=15000,now=()=>performance.now(),schedule=(fn,ms)=>setTimeout(fn,ms),cancel=id=>clearTimeout(id)}={}){
    this.onResume=onResume;this.delay=delay;this.now=now;this.schedule=schedule;this.cancel=cancel;
    this.held=new Set();this.timer=null;this.deadline=null;this.armed=false;this.suspended=false;
  }
  touch(id,down){this.armed=true;if(down)this.held.add(id);else this.held.delete(id);this.queue();}
  queue(){
    this.clear();
    if(!this.armed||this.suspended||this.held.size)return;
    this.deadline=this.now()+this.delay;
    this.timer=this.schedule(()=>{this.timer=null;this.deadline=null;if(this.armed&&!this.suspended&&!this.held.size){this.armed=false;this.onResume();}},this.delay);
  }
  suspend(value){this.suspended=value;if(value)this.clear();else this.queue();}
  stop(){this.armed=false;this.clear();}
  clear(){if(this.timer!==null)this.cancel(this.timer);this.timer=null;this.deadline=null;}
  get remaining(){return this.deadline===null?null:Math.max(0,this.deadline-this.now());}
  destroy(){this.stop();this.held.clear();}
}
