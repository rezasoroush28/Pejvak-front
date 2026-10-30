const NS='http://www.w3.org/2000/svg';
const make=(tag,attrs,text)=>{const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);if(text!==undefined)n.textContent=text;return n;};
const diatonic=m=>Math.floor(m/12)*7+[0,0,1,1,2,3,3,4,4,5,5,6][m%12];
const yFor=m=>130-(diatonic(m)-diatonic(64))*7;
export class LittleScore{
  constructor(svg){this.svg=svg;this.notes=[];this.groups=new Map();this.mode='';this.window=4;}
  load(notes){this.notes=notes;this.mode='';}
  base(){
    this.svg.replaceChildren();this.groups.clear();
    [74,88,102,116,130].forEach(y=>this.svg.append(make('line',{x1:24,x2:505,y1:y,y2:y,class:'staff-line'})));
    this.svg.append(make('text',{x:24,y:131,'font-size':85,'font-family':'Georgia',fill:'var(--score-muted)'},'𝄞'));
    [101,125].forEach(y=>this.svg.append(make('text',{x:81,y,'font-size':25,'font-family':'Georgia',fill:'var(--score-muted)'},'4')));
    this.cursor=make('line',{x1:112,x2:112,y1:28,y2:164,class:'note-cursor',visibility:'hidden'});this.svg.append(this.cursor);
  }
  note(n,x,manual=false){
    const y=yFor(n.midi),g=make('g',{class:`score-note${manual?' manual':''}`,'data-note-id':n.id});
    if(y>130)for(let line=144;line<=y+1;line+=14)g.append(make('line',{x1:x-10,x2:x+10,y1:line,y2:line,'stroke-width':1.2}));
    if(y<74)for(let line=60;line>=y-1;line-=14)g.append(make('line',{x1:x-10,x2:x+10,y1:line,y2:line,'stroke-width':1.2}));
    const beats=(n.notationDuration??n.duration)*2;
    g.append(make('ellipse',{cx:x,cy:y,rx:6.5,ry:4.6,transform:`rotate(-20 ${x} ${y})`,'stroke-width':1.4,...(beats>=1.8?{fill:'var(--paper)'}:{})}));
    const down=n.midi>=71,sx=x+(down?-5.5:5.5),sy=y+(down?35:-35);
    if(beats<3.8){g.append(make('line',{x1:sx,x2:sx,y1:y,y2:sy,'stroke-width':1.5}));const flags=beats<.4?2:beats<.8?1:0;for(let i=0;i<flags;i++){const fy=sy+(down?-i*6:i*6);g.append(make('path',{d:down?`M${sx} ${fy}q-13 -3 -8 -18q-1 10 8 12`:`M${sx} ${fy}q13 3 8 18q1 -10 -8 -12`,'stroke-width':.8}));}}
    if([1,3,6,8,10].includes(n.midi%12))g.append(make('text',{x:x-18,y:y+6,'font-size':20,'font-family':'Georgia',stroke:'none'},'♯'));
    this.svg.append(g);this.groups.set(n.id,g);
  }
  song(time,playing){
    const page=Math.floor(time/this.window),start=page*this.window,mode=`song-${page}`;
    if(this.mode!==mode){this.mode=mode;this.base();for(const x of[310,505])this.svg.append(make('line',{x1:x,x2:x,y1:74,y2:130,class:'bar-line'}));this.notes.filter(n=>n.time>=start&&n.time<start+this.window).forEach(n=>this.note(n,115+(n.time-start)/this.window*380));}
    for(const n of this.notes){const g=this.groups.get(n.id);if(g)g.classList.toggle('active',playing&&n.time<=time+.008&&n.time+n.duration>time);}
    this.cursor.setAttribute('visibility',playing?'visible':'hidden');const x=115+(time-start)/this.window*380;this.cursor.setAttribute('x1',x);this.cursor.setAttribute('x2',x);
    return page;
  }
  manual(history,held){
    const recent=history.slice(-8),mode=recent.map(n=>n.id).join(',');
    if(this.mode!==mode){this.mode=mode;this.base();recent.forEach((n,i)=>this.note({...n,duration:.5},117+i*51,true));}
    this.cursor.setAttribute('visibility','hidden');for(const n of recent){const g=this.groups.get(n.id);if(g)g.style.opacity=held.has(n.midi)?'1':'.75';}
  }
}
