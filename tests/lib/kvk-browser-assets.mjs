import fs from 'node:fs';
// Legacy browser fixtures otherwise return their app HTML for every new asset.
export function serveKvkAsset(req,res){
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(!['/assets/kvk-company-lookup.js','/assets/kvk-company-lookup.css','/assets/mobile-polish-round-2.js','/assets/mobile-polish-round-2.css','/assets/document-intelligence.js'].includes(pathname))return false;
  const file=new URL('../../public'+pathname,import.meta.url);
  res.writeHead(200,{'content-type':pathname.endsWith('.js')?'text/javascript; charset=utf-8':'text/css; charset=utf-8','cache-control':'no-store'});
  res.end(fs.readFileSync(file));return true;
}
