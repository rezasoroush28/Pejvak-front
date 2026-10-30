export const LOW=60,HIGH=72;
export const INPUT_KEYS={KeyA:60,KeyW:61,KeyS:62,KeyE:63,KeyD:64,KeyF:65,KeyT:66,KeyG:67,KeyY:68,KeyH:69,KeyU:70,KeyJ:71,KeyK:72};
export const PITCHES=['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
export const COLORS=['#ffbcb3','#e2c5ed','#f6d997','#c8d4f4','#cee6ad','#a9ded2','#c6c5f1','#afd1ff','#ddc0ee','#cfc0f4','#eed0e5','#f3c3de'];
export const noteName=m=>PITCHES[m%12]+(Math.floor(m/12)-1);
// Keep all 12 pitch classes visible without retuning the song or moving the keys.
export const visibleKey=m=>m%12===0&&m>LOW?HIGH:LOW+m%12;
