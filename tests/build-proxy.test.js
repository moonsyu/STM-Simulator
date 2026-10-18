import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
test('patched global-agent retains the Electron downloader bootstrap API and proxy routing',()=>{
 const code=`const http=require('node:http'),assert=require('node:assert/strict');
 const proxy=http.createServer((request,response)=>{assert.equal(request.url,'http://download.invalid/electron.zip');response.end('proxy-ok');});
 proxy.listen(0,'127.0.0.1',()=>{process.env.GLOBAL_AGENT_HTTP_PROXY='http://127.0.0.1:'+proxy.address().port;process.env.GLOBAL_AGENT_NO_PROXY='';require('global-agent').bootstrap();http.get('http://download.invalid/electron.zip',response=>{let data='';response.on('data',part=>data+=part);response.on('end',()=>{assert.equal(data,'proxy-ok');proxy.close();});}).on('error',error=>{throw error;});});`;
 const child=spawnSync(process.execPath,['-e',code],{encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(child.status,0,child.stderr||child.error?.message);
});
