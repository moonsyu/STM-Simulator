// Shared helpers for Windows release verification (portable EXE, update helper).
import {spawnSync} from 'node:child_process';
import {mkdtemp,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const windows=process.platform==='win32';
export const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
// A tiny .NET console program used as a stand-in "new EXE" (compiled by PowerShell Add-Type).
export function compileFixture(output,{hold=false}={}){
 const source=hold
  ?'using System; using System.IO; using System.Reflection; using System.Threading; class Program { static void Main(string[] args) { if(args.Length>0) { Thread.Sleep(1600); return; } File.WriteAllText(Assembly.GetExecutingAssembly().Location+".started", "updated"); } }'
  :'using System.IO; using System.Reflection; class Program { static void Main() { File.WriteAllText(Assembly.GetExecutingAssembly().Location+".started", "updated"); } }';
 const script='$ErrorActionPreference="Stop"; $f=ConvertFrom-Json ([Console]::In.ReadToEnd()); Add-Type -TypeDefinition $f.source -OutputAssembly $f.output -OutputType ConsoleApplication';
 const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{input:JSON.stringify({source,output}).replace(/[^\x00-\x7f]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')),encoding:'utf8',windowsHide:true});
 if(result.status!==0)throw new Error(result.stderr||'fixture compile failed');
}
// Paths deliberately contain Korean, spaces, an apostrophe and a dollar sign.
export async function specialTemp(prefix){const out=path.join(root,'work','test-results');await mkdir(out,{recursive:true});const dir=await mkdtemp(path.join(out,`${prefix} 한글 '$ `));return {dir,async cleanup(){await rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200});}};}
