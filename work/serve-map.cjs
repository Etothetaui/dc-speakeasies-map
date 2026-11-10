const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const output=path.resolve(__dirname,'../outputs/dc-speakeasies-map.html');
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(pathname!=='/'&&pathname!=='/dc-speakeasies-map.html'){res.writeHead(404);res.end('Not found');return;}
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache'});
 fs.createReadStream(output).pipe(res);
});
server.listen(8766,'127.0.0.1',()=>console.log('Map ready: http://127.0.0.1:8766/dc-speakeasies-map.html'));
