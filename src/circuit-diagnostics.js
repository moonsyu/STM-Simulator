import {topology,solveCircuit} from './engine.js';
import {PINS,boardPin} from './pins.js';
import {terminalKeys,terminalLabel,PART_DEFS} from './components.js';
import {configProblems} from './mcu-config.js';

export function circuitDiagnostics(project,result=null,pressed={}){
  const measured=result||solveCircuit(project,{},pressed),uf=measured.uf||topology(project,pressed),issues=[],add=(id,message,target,severity='warning')=>issues.push({id,message,target,severity});
  const sources=[['GND',0],['3V3',3.3],['VDD',3.3],['AVDD',3.3],['IOREF',3.3],['5V',5],['U5V',5]],shorts=new Set();
  for(const [a,av]of sources)for(const [b,bv]of sources)if(av<bv&&uf.find('signal:'+a)===uf.find('signal:'+b)&&!shorts.has(uf.find('signal:'+a))){shorts.add(uf.find('signal:'+a));add('short:'+a,`${a}와 ${b} 전원이 직접 연결되어 있습니다. 강조된 배선에서 단락을 제거하세요.`,{type:'endpoint',id:boardPin(a)},'error');}
  const linked=new Set();for(const w of project.wires){linked.add(uf.find(w.from));linked.add(uf.find(w.to));}
  for(const p of project.components)for(const key of terminalKeys(p)){
    const id=`part:${p.id}:${key}`,label=terminalLabel(p,key),root=uf.find(id),other=project.components.some(q=>q.id!==p.id&&terminalKeys(q).some(k=>uf.find(`part:${q.id}:${k}`)===root))||PINS.some(pin=>pin.signal!=='NC'&&uf.find(pin.id)===root);
    if(['VCC','VM','VDD','VSS','GND'].includes(label)&&!measured.fault){const v=measured.voltage(id),ground=['VSS','GND'].includes(label);if(v==null||(!ground&&v<.5)||ground&&Math.abs(v)>.3)add('power:'+id,`${p.name}: ${label} ${v==null?'전원 기준이 없습니다':ground?'공통 GND가 올바르지 않습니다':'공급 전압이 부족합니다'}. 전원까지 이어지는 배선을 확인하세요.`,{type:'endpoint',id});}
    if(['SDA','SCL','SCK','MOSI','MISO','TX','RX','PWM','TRIG','ECHO'].includes(label)&&!other&&!linked.has(root))add('open:'+id,`${p.name}: ${label} 신호 핀이 연결되지 않았습니다.`,{type:'endpoint',id});
  }
  const i2c=project.components.filter(p=>PART_DEFS[p.type]?.labels?.includes('SDA')&&p.address!==undefined);
  for(let i=0;i<i2c.length;i++)for(let j=i+1;j<i2c.length;j++){const a=i2c[i],b=i2c[j];if(a.address===b.address&&uf.find(`part:${a.id}:p3`)===uf.find(`part:${b.id}:p3`)&&uf.find(`part:${a.id}:p4`)===uf.find(`part:${b.id}:p4`))add('address:'+a.id+':'+b.id,`${a.name} / ${b.name}: 같은 I²C 버스에서 주소 0x${a.address.toString(16)}가 중복됩니다. 부품 속성에서 주소를 변경하세요.`,{type:'part',id:b.id},'error');}
  if(project.mcu)for(const [i,message]of configProblems(project.mcu).entries()){const pin=/\bP[ABCDH]\d+\b/.exec(message)?.[0];add('config:'+i,message,pin?{type:'endpoint',id:boardPin(pin)}:null,'error');}
  for(const [i,detail]of (measured.diagnostics||[]).entries())add('runtime:'+i,detail.message,detail.target,'error');
  for(const [i,message]of (measured.warnings||[]).entries()){
    if(message.startsWith('전원 단락')&&shorts.size||(measured.diagnostics||[]).some(d=>d.message===message))continue;
    add('runtime-general:'+i,message,null,'error');
  }
  return issues;
}
