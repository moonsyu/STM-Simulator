// SHA-256 of the Rust sources the app's WebAssembly is built from (rust/**: *.rs, Cargo.toml, Cargo.lock,
// rust-toolchain.toml; line endings normalised). scripts/build-rust.mjs records it in src/rust/stm-core.wasm.js and
// tests/unit/rust-core.test.js compares the two, so a Rust change without a rebuild fails the tests.
import {createHash} from 'node:crypto';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const RUST_ROOT=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','rust');
const TRACKED=/\.rs$|^Cargo\.toml$|^Cargo\.lock$|^rust-toolchain\.toml$/;

function files(directory,found=[]){
 for(const name of readdirSync(directory).sort()){
  if(name==='target')continue;
  const full=path.join(directory,name);
  if(statSync(full).isDirectory())files(full,found);else if(TRACKED.test(name))found.push(full);
 }
 return found;
}

export function rustSourceHash(root=RUST_ROOT){
 const hash=createHash('sha256');
 for(const file of files(root)){
  hash.update(path.relative(root,file).split(path.sep).join('/')+'\n');
  hash.update(readFileSync(file,'utf8').replace(/\r\n/g,'\n')+'\n');
 }
 return hash.digest('hex');
}
