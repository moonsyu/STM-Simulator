// Variable graph (src/variable-graph.js): sampling per interval, read errors, list changes, CSV, axis and chart;
// the project keeps the list in ide.plots.
import test from 'node:test';
import assert from 'node:assert/strict';
import {VariableRecorder,valueAxis,variableChart,MAX_PLOTS} from '../../src/variable-graph.js';
import {blankProject,validateProject} from '../../src/project.js';

test('VariableRecorder samples each variable once per interval of simulation time and keeps read errors per variable',()=>{
 const r=new VariableRecorder(['a','bad'],{intervalMs:10});let a=0;
 const read=name=>{if(name==='bad')throw new Error('정의되지 않은 이름: bad');return a++;};
 for(let us=0;us<=50000;us+=1000)r.record(us,read);
 assert.deepEqual(r.series[0].points.map(p=>p[0]),[0,10000,20000,30000,40000,50000],'every 10 ms, not every 1 ms step');
 assert.deepEqual(r.series[0].points.map(p=>p[1]),[0,1,2,3,4,5]);assert.equal(r.series[0].value,5);
 assert.deepEqual(r.series[1].points,[]);assert.match(r.series[1].error,/bad/);
 // A value that is not one number (array, struct, pointer) is an error, not a point.
 const s=new VariableRecorder(['arr']);s.record(0,()=>null);assert.match(s.series[0].error,/숫자 하나/);
 // Changing the list keeps the samples of variables still plotted; at most MAX_PLOTS.
 r.setVariables(['c','a']);assert.deepEqual(r.series.map(x=>x.name),['c','a']);assert.equal(r.series[1].points.length,6);
 r.setVariables(Array.from({length:12},(_,i)=>'v'+i));assert.equal(r.series.length,MAX_PLOTS);
 // Time going back (a reset of the run's clock) does not add out-of-order points.
 const t=new VariableRecorder(['x']);t.record(50000,()=>1);t.record(1000,()=>2);assert.equal(t.series[0].points.length,1);
});

test('VariableRecorder CSV has one column per variable on the union of sample times; clear empties it',()=>{
 const r=new VariableRecorder(['value','adc[0]'],{intervalMs:1});
 r.record(0,n=>n==='value'?240:1.5);r.record(1000,n=>{if(n==='adc[0]')throw new Error('x');return 241;});
 assert.equal(r.csv(),'time_ms,value,adc[0]\n0.000,240,1.5\n1.000,241,\n');
 assert.equal(r.count,3);r.clear();assert.equal(r.count,0);assert.equal(r.series[0].value,null);
 r.record(0,()=>7);assert.equal(r.count,2,'samples again from time 0 after clear');
});

test('valueAxis gives nice ticks around the values (and room around a flat line); the chart draws one line per variable',()=>{
 const a=valueAxis([240,250]);assert.ok(a.min<=240&&a.max>=250&&a.step>0);assert.equal(a.min%a.step,0);
 const f=valueAxis([5,5,5]);assert.ok(f.min<5&&f.max>5);
 assert.deepEqual(valueAxis([]),{min:0,max:1,step:.25});
 const r=new VariableRecorder(['value','other'],{intervalMs:100});for(let us=0;us<=2e6;us+=1000)r.record(us,n=>n==='value'?240+Math.floor(us/2e5):-3);
 const svg=variableChart(r,{windowUs:5e6,width:600,height:240});
 assert.equal((svg.match(/<polyline/g)||[]).length,2);assert.match(svg,/data-series="0"/);assert.match(svg,/aria-label="시간에 따른 변수 값 그래프"/);
 assert.equal((svg.match(/class="vg-mark"/g)||[]).length,42,'square markers on each of the 21+21 samples');
 assert.match(svg,/>250</,'value ticks');assert.match(svg,/>0</);assert.match(svg,/>2 s</,'time ticks');
 // A window shorter than the record shows only its end (plus the sample just before it).
 const recent=variableChart(r,{windowUs:1e6,width:600,height:240});assert.equal((recent.match(/class="vg-mark"/g)||[]).length,2*12);
});

test('the project keeps the plotted variables in ide.plots (at most 8, no duplicates)',()=>{
 const p=blankProject();p.ide={breakpoints:[],watches:[],plots:['value','adc[0]']};
 assert.deepEqual(validateProject(p).ide.plots,['value','adc[0]']);
 p.ide.plots=['a','a'];assert.throws(()=>validateProject(p),/변수 그래프/);
 p.ide.plots=Array.from({length:9},(_,i)=>'v'+i);assert.throws(()=>validateProject(p),/변수 그래프/);
 delete p.ide.plots;assert.equal(validateProject(p).ide.plots,undefined);
});
