import {PART_DEFS} from './components.js';

const BASE_PARTS={
 resistor:{name:'저항',icon:'▰',iconClass:'resistor-icon',hint:'330 Ω · 값 변경 가능'},
 led:{name:'LED',icon:'●',iconClass:'led-icon',hint:'전류에 따른 점등'},
 button:{name:'푸시 버튼',icon:'▣',iconClass:'button-icon',hint:'4핀 · 모형을 끌어 설치'},
 lcd:{name:'LCD 1602',icon:'▤',iconClass:'lcd-icon',hint:'16핀 · 문자 출력 / 배선'},
 breadboard:{name:'빵판',icon:'▦',iconClass:'breadboard-icon',hint:'400홀 · 추가 배선 공간'}
};
const ALIASES={
 breadboard:'bread board 브레드보드 브레드 보드 빵판',resistor:'resistance',led:'light diode 발광 다이오드',button:'push switch 스위치',lcd:'display liquid crystal 디스플레이 액정',
 uart:'serial terminal 시리얼 직렬 통신',i2c:'memory 메모리 통신',spi:'memory 메모리 통신',
 potentiometer:'variable resistor 가변 저항',slide:'switch 스위치',rgb:'color 색상',capacitor:'capacitance 콘덴서 축전기',
 diode:'rectifier 정류',buzzer:'sound speaker 소리 스피커',sevenseg:'7 segment seven segment display 디스플레이',
 ldr:'light photoresistor sensor 조도 광저항 빛',ntc:'thermistor sensor 온도 서미스터',sht31:'humidity temperature sensor 온습도',mpu6050:'accelerometer gyroscope sensor 가속도 자이로 자세',pir:'motion sensor 인체 움직임',oled:'display screen 디스플레이 화면',tft:'display screen color 디스플레이 화면 컬러',matrix:'display screen led matrix 디스플레이 화면 도트',servo:'actuator motor 서보 구동',motor:'actuator dc motor h bridge 구동 모터',stepper:'actuator step motor 스텝 구동',relay:'actuator switch 릴레이 구동',joystick:'input game stick 입력',encoder:'rotary input quadrature 입력 회전',
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
