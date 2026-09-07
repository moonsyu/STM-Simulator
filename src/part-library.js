import {PART_DEFS} from './components.js';

const BASE_PARTS={
 resistor:{name:'저항',icon:'▰',iconClass:'resistor-icon',hint:'330 Ω · 값 변경 가능'},
 led:{name:'LED',icon:'●',iconClass:'led-icon',hint:'전류에 따른 점등'},
 button:{name:'푸시 버튼',icon:'▣',iconClass:'button-icon',hint:'4핀 · 모형을 끌어 설치'},
 lcd:{name:'LCD 1602',icon:'▤',iconClass:'lcd-icon',hint:'16핀 · 문자 출력 / 배선'}
};
const ALIASES={
 resistor:'resistance',led:'light diode 발광 다이오드',button:'push switch 스위치',lcd:'display liquid crystal 디스플레이 액정',
 uart:'serial terminal 시리얼 직렬 통신',i2c:'memory 메모리 통신',spi:'memory 메모리 통신',
 potentiometer:'variable resistor 가변 저항',slide:'switch 스위치',rgb:'color 색상',capacitor:'capacitance 콘덴서 축전기',
 diode:'rectifier 정류',buzzer:'sound speaker 소리 스피커',sevenseg:'7 segment seven segment display 디스플레이',
 temperature:'sensor temperature 온도 센서',ultrasonic:'sensor distance 거리 센서 초음파'
};
const normalize=value=>String(value).normalize('NFKC').toLowerCase().replace(/[\s_-]+/g,'');
export const PART_LIBRARY=Object.entries({...BASE_PARTS,...PART_DEFS}).map(([type,def])=>({
 type,name:def.name,icon:def.icon,iconClass:def.iconClass||'extra-icon',hint:def.hint,
 searchText:normalize([type,def.name,def.hint,def.prefix||'',ALIASES[type]||''].join(' '))
}));
export function searchParts(query){
 const text=normalize(query);
 return PART_LIBRARY.filter(part=>part.searchText.includes(text));
}
