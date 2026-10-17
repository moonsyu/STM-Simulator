import test from 'node:test';
import assert from 'node:assert/strict';
import {resetBoardConfiguration} from '../src/board-reset.js';
import {resetMainCode} from '../src/code-reset.js';
import {blankProject} from '../src/project.js';
import {halExample} from '../src/hal-examples.js';
import {SimulationSession} from '../src/session.js';

test('board reset clears hardware and Docs bindings without changing sources or IDE settings',()=>{
 const p=halExample('motor');
 p.firmware.files.push({name:'user.h',text:'#pragma once\n'});
 p.ide={breakpoints:[{file:'main.c',line:10}],watches:['count'],native:{target:'simulator',configuration:'Debug'}};
 p.deviceDocs={version:1,bindings:[]};
 const before=structuredClone(p),next=resetBoardConfiguration(p),empty=blankProject();
 assert.deepEqual(p,before);
 for(const key of ['code','firmware','ide','name','boardId','simulation'])assert.deepEqual(next[key],p[key]);
 for(const key of ['components','wires','mcu','surfaces'])assert.deepEqual(next[key],empty[key]);
 assert.equal(next.deviceDocs,undefined);
 assert.deepEqual(resetBoardConfiguration(next),next);
 // The independent code reset can then generate a runnable empty project.
 const runtime=new SimulationSession(resetMainCode(next));runtime.tick(50);assert.equal(runtime.result.fault,false);
});
