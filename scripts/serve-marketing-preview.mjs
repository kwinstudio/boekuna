// Review-only static server. Production continues using its existing hosting.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist/marketing');
if(process.env.BOEKUNA_MARKETING_PREVIEW!=='1')throw new Error('Review server requires BOEKUNA_MARKETING_PREVIEW=1');
if(!fs.existsSync(path.join(root,'index.html')))throw new Error('Build marketing first');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.ico':'image/x-icon','.woff2':'font/woff2','.xml':'application/xml','.txt':'text/plain'};
const server=http.createServer((req,res)=>{
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Cache-Control','no-store');
  let pathname;
  try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}
  catch{res.writeHead(400);return res.end('Bad request');}
  if(pathname==='/robots.txt'){res.setHeader('Content-Type','text/plain');return res.end('User-agent: *\nDisallow: /\n');}
  const file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){
    res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});return fs.createReadStream(path.join(root,'404.html')).pipe(res);
  }
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
server.listen(Number(process.env.PORT||10000),'0.0.0.0',()=>console.log('BOEKUNA marketing review preview ready'));
