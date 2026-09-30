// L298N module terminals, not the bare Multiwatt IC pin numbers.
export const L298_DEFS={
 l298n:{name:'L298N 모터 드라이버',prefix:'L298N',icon:'⇆',hint:'구동 · 듀얼 H 브리지 / ENA·ENB',defaults:{},body:{width:164,height:112},labels:['VM','GND','5V','ENA','IN1','IN2','IN3','IN4','ENB','OUT1','OUT2','OUT3','OUT4'],terminals:[[-56,-70],[0,-70],[56,-70],[-70,70],[-42,70],[-14,70],[14,70],[42,70],[70,70],[-96,-21],[-96,21],[96,-21],[96,21]],help:'L298N 모듈 학습 모델입니다. VM에 외부 DC 6~24 V, 5V에 보드 5 V, GND에 전원 음극과 보드 GND를 공통 연결하세요. ENA/ENB 점퍼와 5V-EN 점퍼를 제거한 구성이며 5V는 입력입니다. ENA·ENB에 PWM, IN1~4에 방향 신호, OUT1/2·OUT3/4에 별도 2핀 DC 모터를 연결합니다. EN LOW는 자유 정지, EN HIGH에서 두 IN이 같으면 제동입니다. PWM 파형을 켜세요. 고정 2 V 전압 강하와 출력 저항을 근사하며 발열·보호·역기전력·환류 과도현상은 계산하지 않습니다.'},
 dc_motor:{name:'DC 모터 · 2핀',prefix:'DCM',icon:'⟳',hint:'구동 · 외부 드라이버 연결 / 12 V',defaults:{},help:'L298N OUT1/2 또는 OUT3/4에 연결하는 별도 DC 모터입니다. A→B 양의 전압은 정회전, 반대는 역회전입니다. 24 Ω 부하, 12 V에서 3000 rpm인 학습 모델이며 속도 시정수 150 ms를 사용합니다. L298N 자유 정지와 제동의 감속을 구분합니다. 실제 모터의 정격·기동 전류·역기전력·기계 부하는 재현하지 않습니다.'},
 dc_supply:{name:'외부 DC 전원',prefix:'PSU',icon:'⊕',hint:'전원 · 6~24 V / 기본 12 V',defaults:{voltage:12},help:'모터용 외부 DC 전원 모델입니다. +는 L298N VM, −는 드라이버·보드 공통 GND에 연결하세요. 6~24 V, 내부 저항 0.1 Ω이며 공급·단락 전류를 계산합니다. 전류 제한 기능은 없습니다. 모터 전원을 MCU GPIO에 연결하지 마세요.'}
};
export const L298_CHANNELS=[{name:'A',en:4,inputs:[5,6],outputs:[10,11]},{name:'B',en:9,inputs:[7,8],outputs:[12,13]}];
export function l298State(p,voltage,grounded=true){
 const v=n=>voltage(`part:${p.id}:p${n}`),g=v(2),vm=v(1),logic=v(3);
 const powered=grounded&&g!=null&&vm!=null&&logic!=null&&Math.abs(g)<.1&&vm-g>=6&&vm-g<=24&&logic-g>=4.5&&logic-g<=5.5;
 const level=n=>{const x=v(n);return x==null?null:x-g>=2.3&&x-g<=logic-g+.01?1:x-g>=-.3&&x-g<=1.5?0:null;};
 const channels=Object.fromEntries(L298_CHANNELS.map(c=>{
  const en=level(c.en),inputs=c.inputs.map(level),valid=en!==null&&(en===0||inputs.every(x=>x!==null));
  const enabled=powered&&en===1&&valid,mode=!powered?'unpowered':!valid?'invalid':!enabled?'coast':inputs[0]===inputs[1]?'brake':inputs[0]?'forward':'reverse';
  return [c.name,{enabled,inputs,mode}];
 }));
 return {powered,channels};
}
export function l298Branches(p,uf,branch){
 const pin=n=>`part:${p.id}:p${n}`;
 branch(pin(1),pin(2),10000);branch(pin(3),pin(2),1000,{id:p.id});
 for(const n of [4,5,6,7,8,9])branch(pin(n),pin(2),1000000);
 for(const c of L298_CHANNELS)for(const [i,n]of c.outputs.entries())for(const high of [false,true]){
  branch(pin(n),pin(high?1:2),.5,{emf:high?-1:1,l298:{p,channel:c.name,input:i,high},driver:p.id});
 }
}
export function l298BranchOn(b,volt,uf){
 if(!b.l298)return true;
 const {p,channel,input,high}=b.l298;
 const state=l298State(p,id=>volt.get(uf.find(id)),uf.find(`part:${p.id}:p2`)===uf.find('signal:GND'));
 return state.channels[channel].enabled&&state.channels[channel].inputs[input]===Number(high);
}
export const L298_MODES={unpowered:'전원 없음',invalid:'논리 레벨 확인',coast:'자유 정지',brake:'제동',forward:'정회전',reverse:'역회전'};
