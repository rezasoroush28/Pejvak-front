import http from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'dist');
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.webm':'video/webm','.mp4':'video/mp4','.webp':'image/webp','.mp3':'audio/mpeg','.mid':'audio/midi','.ttf':'font/ttf','.txt':'text/plain'};
const server=http.createServer(async(req,res)=>{
  try{
    let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname.endsWith('/'))pathname+='index.html';
    const file=path.resolve(root,'.'+pathname);
    if(!file.startsWith(root+path.sep)||pathname.split(/[\\/]/).some(p=>p.startsWith('.'))){res.writeHead(403).end();return;}
    const info=await stat(file);if(!info.isFile())throw new Error('Not a file');
    const headers={'Content-Type':types[path.extname(file)]||'application/octet-stream','Accept-Ranges':'bytes','Content-Length':info.size,'Cache-Control':pathname.includes('/assets/v1/')?'public, max-age=31536000, immutable':'no-cache','X-Content-Type-Options':'nosniff'};
    const range=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    let start=0,end=info.size-1;
    if(range){start=Number(range[1]);if(range[2])end=Math.min(Number(range[2]),end);if(start>end||start>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;headers['Content-Length']=end-start+1;}
    res.writeHead(range?206:200,headers);
    if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
  }catch{res.writeHead(404).end('Not found');}
});
server.listen(Number(process.env.PORT)||5175,'127.0.0.1',()=>console.log(`Pejvak website: http://127.0.0.1:${server.address().port}/`));
