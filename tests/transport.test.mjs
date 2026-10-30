import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PianoTransport} from '../dist/plugins/piano/transport.js';
test('resuming never moves the score backwards during audio scheduling headroom',()=>{
  const audio={now:10,note(){},stopSong(){}};const transport=new PianoTransport(audio);
  transport.load([{midi:60,time:0,duration:30,velocity:.7}]);transport.seek(8);transport.start();
  assert.equal(transport.time,8);audio.now=10.01;assert.equal(transport.time,8);audio.now=10.1;assert(Math.abs(transport.time-8.075)<.0001);transport.pause();
});
