import {CATALOG_BY_TYPE} from './catalog-defs.js';
import {PART_DEFS,terminalKeys} from './components.js';
import {PART_DATASHEETS} from './part-datasheets.js';
import {physicalTypeOf} from './model-geometry.js';

const BASE_PARTS={
 board:{name:'NUCLEO-64 보드',icon:'64',hint:'현재 선택한 보드(F446RE/F103RB) · 1개'},
 resistor:{name:'저항',icon:'▰',iconClass:'resistor-icon',hint:'330 Ω · 값 변경 가능'},
 led:{name:'LED',icon:'●',iconClass:'led-icon',hint:'전류에 따른 점등'},
 button:{name:'푸시 버튼',icon:'▣',iconClass:'button-icon',hint:'4핀 · 모형을 끌어 설치'},
 lcd:{name:'LCD 1602',icon:'▤',iconClass:'lcd-icon',hint:'16핀 · 문자 출력 / 배선'},
 breadboard:{name:'빵판',icon:'▦',iconClass:'breadboard-icon',hint:'400홀 · 하프 사이즈 추가 배선 공간'},
 breadboard_full:{name:'빵판 (풀사이즈)',icon:'▦',iconClass:'breadboard-icon',hint:'830홀 · 63열 풀사이즈 배선 공간'}
};
const ALIASES={
 board:'STM STM32 STM32F446RE STM32F103RB F446 F103 Nucleo MCU 마이크로컨트롤러 보드',
 l298n:'l298 dual h bridge driver motor 모터 드라이버 듀얼',dc_motor:'dc motor 모터 직류',dc_supply:'power battery supply 전원 배터리 외부 전원',
 breadboard:'bread board 브레드보드 브레드 보드 빵판 half 하프 400',breadboard_full:'bread board breadboard full size fullsize 830 브레드보드 브레드 보드 빵판 풀사이즈 풀 사이즈 큰빵판',resistor:'resistance',led:'light diode 발광 다이오드',button:'push switch 스위치',lcd:'display liquid crystal 디스플레이 액정',
 uart:'serial terminal 시리얼 직렬 통신',i2c:'memory 메모리 통신',spi:'memory 메모리 통신',
 potentiometer:'variable resistor 가변 저항',slide:'switch 스위치',rgb:'color 색상',capacitor:'capacitance 콘덴서 축전기',
 diode:'rectifier 정류',buzzer:'active sound speaker 소리 스피커',passive_buzzer:'passive piezo buzzer sound speaker pwm tone melody 수동 피에조 부저 소리 스피커 음계 멜로디',sevenseg:'7 segment seven segment display 디스플레이',
 ldr:'light photoresistor sensor 조도 광저항 빛',ntc:'thermistor sensor 온도 서미스터',sht31:'humidity temperature sensor 온습도',mpu6050:'accelerometer gyroscope sensor 가속도 자이로 자세',pir:'motion sensor 인체 움직임',oled:'display screen 디스플레이 화면',tft:'display screen color 디스플레이 화면 컬러',matrix:'display screen led matrix 디스플레이 화면 도트',servo:'actuator motor 서보 구동',motor:'actuator dc motor h bridge 구동 모터',stepper:'actuator step motor 스텝 구동',relay:'actuator switch 릴레이 구동',joystick:'input game stick 입력',encoder:'rotary input quadrature 입력 회전',
 temperature:'sensor temperature 온도 센서',ultrasonic:'sensor distance 거리 센서 초음파'
};
const normalize=value=>String(value).normalize('NFKC').toLowerCase().replace(/[\s_-]+/g,'');
// A basic part drawn as a catalog part with the same pins is that physical part: the list shows only the catalog part
// (the basic type still opens in saved circuits). Basic parts with fewer pins than the real part stay as simplified models.
export const MERGED_PARTS=Object.fromEntries(Object.keys({...BASE_PARTS,...PART_DEFS}).map(type=>[type,physicalTypeOf(type)])
 .filter(([type,ref])=>ref&&!CATALOG_BY_TYPE[type]&&CATALOG_BY_TYPE[ref].pins.length===terminalKeys({type}).length));
const twins=Object.entries(MERGED_PARTS).reduce((m,[type,ref])=>({...m,[ref]:[...(m[ref]||[]),type]}),{});
const words=(type,def)=>[type,def.name,def.hint,def.prefix||'',ALIASES[type]||''];
/** Every part type with its card (basic parts merged into catalog parts included, for saved circuits and docs). */
export const ALL_PARTS=Object.entries({...BASE_PARTS,...PART_DEFS}).map(([type,def])=>({
 type,name:def.name,icon:def.icon,iconClass:def.iconClass||'extra-icon',hint:def.hint,
 searchText:normalize([...words(type,def),...(twins[type]||[]).flatMap(t=>words(t,{...BASE_PARTS,...PART_DEFS}[t])),CATALOG_BY_TYPE[type]?.id||'',CATALOG_BY_TYPE[type]?.name||'',PART_DATASHEETS[CATALOG_BY_TYPE[type]?.id]?.model||'',CATALOG_BY_TYPE[type]?.pins.join(' ')||''].join(' '))
}));
/** The parts list: one card per real part. */
export const PART_LIBRARY=ALL_PARTS.filter(part=>!MERGED_PARTS[part.type]);
export function searchParts(query){
 const text=normalize(query);
 return PART_LIBRARY.filter(part=>part.searchText.includes(text));
}
