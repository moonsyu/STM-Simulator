import {CATALOG_DEFS,catalogType} from './catalog-defs.js';
import {DEVBOARD_MODELS} from './devboards.js';
import {defaultMcu,generateHal,validateMcu} from './mcu-config.js';
import {endpointInfo,PINS} from './pins.js';
import {BOARD} from './geometry.js';
import {startProject} from './project.js';
import {newStm32Fields} from './stm32-boards.js';

// Examples of the wireless modules (wireless.js). The C is plain HAL on USART1 PA9 / PA10, so the same sources build for
// the real boards: a one-board example per module (its AT commands) and boards talking to each other over the air.
const COLORS={power:'#e53935',ground:'#263238',tx:'#2e9d4f',rx:'#1e88e5',control:'#fb8c00'};
const UART=`#include <string.h>

void uartSend(const char *text)
{
  HAL_UART_Transmit(&huart1, (uint8_t *)text, strlen(text), 1000);
}

// One received line without CR/LF: its length, or -1 when nothing complete came in time.
int uartLine(char *line, int size, uint32_t timeoutMs)
{
  int length = 0;
  uint8_t c = 0;
  uint32_t start = HAL_GetTick();
  while (HAL_GetTick() - start < timeoutMs) {
    if (HAL_UART_Receive(&huart1, &c, 1, 1) != HAL_OK) continue;
    if (c == '\\n') {
      line[length] = 0;
      return length;
    }
    if (c != '\\r' && length < size - 1) line[length++] = c;
  }
  line[length] = 0;
  return -1;
}
`;
// Replies without a line end (HC-06): everything that arrives until the line stays quiet.
const QUIET=`
int uartQuiet(char *text, int size, uint32_t quietMs)
{
  int length = 0;
  uint8_t c = 0;
  while (HAL_UART_Receive(&huart1, &c, 1, quietMs) == HAL_OK) {
    if (length < size - 1) text[length++] = c;
  }
  text[length] = 0;
  return length;
}
`;
const AT=`
// Sends an AT command and prints its reply until the expected line (or ERROR / a timeout): 1 when it came.
int atCommand(const char *command, const char *expect, uint32_t timeoutMs)
{
  char line[96];
  uartSend(command);
  uartSend("\\r\\n");
  uint32_t start = HAL_GetTick();
  while (HAL_GetTick() - start < timeoutMs) {
    if (uartLine(line, 96, 50) < 1) continue;
    printf("%s\\n", line);
    if (strcmp(line, expect) == 0) return 1;
    if (strcmp(line, "ERROR") == 0 || strcmp(line, "FAIL") == 0) return 0;
  }
  return 0;
}
`;
const WIFI_SEND=`
// Waits for the "> " prompt of AT+CIPSEND.
int waitPrompt(uint32_t timeoutMs)
{
  uint8_t c = 0;
  uint32_t start = HAL_GetTick();
  while (HAL_GetTick() - start < timeoutMs) {
    if (HAL_UART_Receive(&huart1, &c, 1, 1) == HAL_OK && c == '>') return 1;
  }
  return 0;
}

// The payload of "+IPD,<id,>length:payload": its first character's index, or -1 for any other line.
int ipdPayload(const char *line)
{
  if (strncmp(line, "+IPD,", 5) != 0) return -1;
  for (int i = 5; line[i] != 0; i++) {
    if (line[i] == ':') return i + 1;
  }
  return -1;
}
`;
// The generator's start-up message would go to the module (an AT command to it, or data to the other board).
const quiet=code=>code.replace(/^ *uint8_t message\[\] = "HAL ready\\r\\n";\r?\n/m,'').replace(/^ *HAL_UART_Transmit\(&huart1, message, sizeof\(message\)-1, 100\);\r?\n/m,'');
const pinConfig=fn=>({function:fn,pull:'NOPULL',initial:0,label:'',edge:'CHANGE'});
/** A board's HAL program: USART1 and its other pins from the generator, the example's lines in the user sections. */
function halProgram({family='STM32F103RB',baud,pins={},globals='',helpers='',init='',step=''}){
 const mcu=validateMcu({...defaultMcu(family),pins:{PA9:pinConfig('USART1_TX'),PA10:pinConfig('USART1_RX'),...pins},peripherals:{USART1:{enabled:true,baud}},nvic:{}});
 const code=quiet(generateHal(mcu)).replace('int main(void)',UART+helpers+globals+'\nint main(void)').replace('/* USER CODE BEGIN 2 */','/* USER CODE BEGIN 2 */\n'+init).replace(/(\/\* USER CODE BEGIN 3 \*\/)[\s\S]*?(\/\* USER CODE END 3 \*\/)/,(_,a,b)=>a+'\n'+step+'\n'+b);
 return {mcu,code};
}

// ---------------------------------------------------------------- one board: the module's AT commands
export const WIRELESS_CATALOG=new Set(['hc05-bluetooth-6','hc06-bluetooth-4','esp01-wifi-8']);
/** One-board example of a module (`b`: makeCatalogProject helpers; pin numbers are the module's datasheet order). */
export function wirelessCatalogExample(id,helpers){
 const p=wirelessCatalogProject(id,helpers);p.code=quiet(p.code);return p;
}
function wirelessCatalogProject(id,{p,pin,connect,finish}){
 const usart=(baud,tx,rx)=>{pin('PA9','USART1_TX');pin('PA10','USART1_RX');p.mcu.peripherals.USART1={enabled:true,baud};connect(rx,'PA9');connect(tx,'PA10');};
 if(id==='hc05-bluetooth-6'){
  // EN high at power on: AT mode at 38400 baud.
  connect(1,'3V3');connect(2,'5V');connect(3,'GND');usart(38400,4,5);
  return finish(`HAL_Delay(100);
 atCommand("AT", "OK", 300);
 atCommand("AT+VERSION?", "OK", 300);
 atCommand("AT+ROLE=1", "OK", 300);
 atCommand("AT+CMODE=1", "OK", 300);
 atCommand("AT+ROLE?", "OK", 300);
 atCommand("AT+PSWD?", "OK", 300);
 atCommand("AT+UART?", "OK", 300);
 atCommand("AT+ADDR?", "OK", 300);
 printf("AT setup done\\n");`,'HAL_Delay(1000);',UART+AT);
 }
 if(id==='hc06-bluetooth-4'){
  connect(1,'5V');connect(2,'GND');usart(9600,3,4);
  return finish(`HAL_Delay(100);
 printf("HC-06 is in AT mode until it is paired\\n");`,`// No CR/LF, one command per second: the module ends a command by the pause after it.
 uartSend(command == 0 ? "AT" : "AT+VERSION");
 if (uartQuiet(reply, 32, 900) > 0) printf("reply: %s\\n", reply);
 command = !command;`,UART+QUIET,'char reply[32];\nint command = 0;');
 }
 connect(1,'GND');connect(5,'3V3');connect(7,'3V3');usart(115200,8,4);
 return finish(`char line[96];
 // The module prints "ready" after it boots.
 uint32_t start = HAL_GetTick();
 while (HAL_GetTick() - start < 1000) {
  if (uartLine(line, 96, 50) >= 0 && strcmp(line, "ready") == 0) break;
 }
 atCommand("ATE0", "OK", 300);
 atCommand("AT", "OK", 300);
 atCommand("AT+CWMODE=2", "OK", 300);
 atCommand("AT+CWSAP=\\"STM-LAB\\",\\"stm32-lab\\",5,3", "OK", 300);
 atCommand("AT+CIFSR", "OK", 300);
 printf("AP STM-LAB ready\\n");`,'HAL_Delay(1000);',UART+AT);
}

// ---------------------------------------------------------------- boards talking over the air
// Each module stands to the right of its board, turned so its header faces the board's right-hand pins; every wire runs
// out along its pin's row to a lane of its own between the two, then across to the module.
function circuit(name){const p=startProject();p.name=name;p.surfaces={board:{hidden:false},breadboard:{hidden:true}};p.wires=[];p.components=[];return p;}
const at=(p,id)=>{const h=endpointInfo(id,p.components,p.surfaces);if(!h)throw new Error('예제 위치를 찾지 못했습니다: '+id);return h;};
function wire(p,from,to,color,points){p.wires.push({id:'w'+(p.wires.length+1),from,to,color,...(points?{points}:{})});}
// Out to column `x`, along it to the row of the target (or `y`, half a row beside a pin behind the first header row).
function lane(p,from,to,color,x,y){const a=at(p,from),b=at(p,to);wire(p,from,to,color,y==null?[{x,y:a.y},{x,y:b.y}]:[{x,y:a.y},{x,y},{x:b.x,y}]);}
// Under the board: for the supply pins on its left side (`bottom`: a row below the board, `column`: a lane on the right).
function under(p,from,to,color,dx,bottom,column,y){const a=at(p,from),b=at(p,to),side=dx+150+bottom-520,inner=a.y+(bottom===520?7:-7);wire(p,from,to,color,[{x:a.x+7,y:inner},{x:side,y:inner},{x:side,y:bottom},{x:column,y:bottom},{x:column,y:y??b.y},...(y==null?[]:[{x:b.x,y}])]);}
function module(p,id,variant,name,x,y,props={}){const type=catalogType(variant);p.components.push({id,type,name,x,y,rotation:90,...structuredClone(CATALOG_DEFS[type].defaults),...props});}
function setMain(p,{mcu,code}){p.mcu=mcu;p.code=code;p.firmware={mode:'hal',files:[]};}
const stm32Pin=id=>signal=>`devboard:${id}:${DEVBOARD_MODELS['nucleo-f103rb'].pins.find(q=>q.signal===signal&&q.key.startsWith('CN10')).key}`;
// The same pins on the main board (`board:CN10:n`).
const mainPin=signal=>PINS.find(q=>q.signal===signal&&q.id.startsWith('board:CN10:')).id;
const SECOND_DX=755;
function secondBoard(p,program){const fields=newStm32Fields(p,'nucleo-f103rb',430);p.components.push({id:'stm2',...fields,x:BOARD.x+BOARD.w/2+SECOND_DX,y:BOARD.y+BOARD.h/2,mcu:program.mcu,code:program.code,firmware:{mode:'hal',files:[]}});}
const HC05={EN:1,VCC:2,GND:3,TXD:4,RXD:5,STATE:6},HC06={VCC:1,GND:2,TXD:3,RXD:4},ESP01={GND:1,RXD:4,VCC:5,CH_PD:7,TXD:8};
const MODULE_X=585,MODULE_Y=265;
// A Bluetooth module's four wires on an STM32 board's CN10: U5V, GND, PA10, PA9.
function hookBluetooth(p,id,pins,pin,dx){
 const end=n=>`part:${id}:p${n}`;
 lane(p,pin('U5V'),end(pins.VCC),COLORS.power,dx+447);lane(p,pin('GND'),end(pins.GND),COLORS.ground,dx+462);
 lane(p,pin('PA10'),end(pins.TXD),COLORS.rx,dx+477);lane(p,pin('PA9'),end(pins.RXD),COLORS.tx,dx+492);
}
// HC-05 (master, found its slave by PIN 1234): sends a command each second and prints the answer. STATE tells it is paired.
const BT_MASTER=()=>halProgram({baud:9600,pins:{PB1:pinConfig('GPIO_Input')},globals:'char line[32];\nint ledOn = 0;',
 init:`printf("HC-05 searching\\n");
  while (HAL_GPIO_ReadPin(GPIOB, GPIO_PIN_1) == GPIO_PIN_RESET) HAL_Delay(10);
  printf("HC-05 paired\\n");`,
 step:`  ledOn = !ledOn;
  uartSend(ledOn ? "LED ON\\r\\n" : "LED OFF\\r\\n");
  printf("sent LED %s\\n", ledOn ? "ON" : "OFF");
  if (uartLine(line, 32, 500) >= 0) printf("answer: %s\\n", line);
  HAL_Delay(1000);`});
// The slave switches LD2 (PA5) and answers. Before pairing nothing reaches it from the other board.
const BT_SLAVE=()=>halProgram({baud:9600,pins:{PA5:pinConfig('GPIO_Output')},globals:'char line[32];',
 init:'printf("HC-06 waiting\\n");',
 step:`  if (uartLine(line, 32, 100) >= 0) {
    printf("got: %s\\n", line);
    if (strcmp(line, "LED ON") == 0) {
      HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_SET);
      uartSend("ACK ON\\r\\n");
    } else if (strcmp(line, "LED OFF") == 0) {
      HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, GPIO_PIN_RESET);
      uartSend("ACK OFF\\r\\n");
    }
  }`});
function masterModule(p){
 module(p,'hc05','hc05-bluetooth-6','HC-05',MODULE_X,MODULE_Y,{role:'master'});hookBluetooth(p,'hc05',HC05,mainPin,0);lane(p,mainPin('PB1'),`part:hc05:p${HC05.STATE}`,COLORS.control,507);
}
export function bluetoothStm32(){
 const p=circuit('STM32·STM32 블루투스 통신');setMain(p,BT_MASTER());masterModule(p);secondBoard(p,BT_SLAVE());
 module(p,'hc06','hc06-bluetooth-4','HC-06',MODULE_X+SECOND_DX,MODULE_Y);hookBluetooth(p,'hc06',HC06,stm32Pin('stm2'),SECOND_DX);
 return p;
}
const ESP32_MODEL='esp32-nodemcu-32s';
const ESP32_SKETCH=`// HC-06 (슬레이브)을 Serial2(GPIO16 RX, GPIO17 TX)에 연결합니다. 받은 명령으로 2번 핀(파란 LED)을 켜고 끕니다.
char line[32];
int length = 0;

void setup() {
  pinMode(2, OUTPUT);
  Serial2.begin(9600, SERIAL_8N1, 16, 17);
  Serial.printf("HC-06 waiting\\n");
}

void loop() {
  while (Serial2.available() > 0) {
    int c = Serial2.read();
    if (c == '\\n') {
      line[length] = 0;
      length = 0;
      Serial.printf("got: %s\\n", line);
      if (strcmp(line, "LED ON") == 0) {
        digitalWrite(2, HIGH);
        Serial2.print("ACK ON\\r\\n");
      } else if (strcmp(line, "LED OFF") == 0) {
        digitalWrite(2, LOW);
        Serial2.print("ACK OFF\\r\\n");
      }
    } else if (c != '\\r' && length < 31) {
      line[length] = c;
      length = length + 1;
    }
  }
  delay(1);
}
`;
export function bluetoothEsp32(){
 const p=circuit('STM32·ESP32 블루투스 통신');setMain(p,BT_MASTER());masterModule(p);
 const X=950,Y=275;p.components.push({id:'esp32',type:'devboard',model:ESP32_MODEL,name:'ESP32-1',x:X,y:Y,rotation:0,code:ESP32_SKETCH});
 module(p,'hc06','hc06-bluetooth-4','HC-06',X+190,Y-15);
 const pin=key=>'devboard:esp32:'+key,end=n=>`part:hc06:p${n}`,a=at(p,pin('L19')),b=at(p,end(HC06.VCC));
 // 5 V is on the board's left row: around the top of the board to the first lane.
 wire(p,pin('L19'),end(HC06.VCC),COLORS.power,[{x:a.x-16,y:a.y},{x:a.x-16,y:Y-170},{x:b.x-16,y:Y-170},{x:b.x-16,y:b.y}]);
 lane(p,pin('R7'),end(HC06.GND),COLORS.ground,X+80);lane(p,pin('R12'),end(HC06.TXD),COLORS.rx,X+95);lane(p,pin('R11'),end(HC06.RXD),COLORS.tx,X+110);
 return p;
}
const NET='\\"STM-LAB\\",\\"stm32-lab\\"';
// ESP-01 as an access point with a TCP server on port 333; each command switches LD2 and gets an answer on its link.
const WIFI_SERVER=()=>halProgram({baud:115200,pins:{PA5:pinConfig('GPIO_Output')},helpers:AT+WIFI_SEND,globals:'char line[96];',
 init:`HAL_Delay(500);
  atCommand("ATE0", "OK", 300);
  atCommand("AT+CWMODE=2", "OK", 300);
  atCommand("AT+CWSAP=${NET},5,3", "OK", 300);
  atCommand("AT+CIPMUX=1", "OK", 300);
  atCommand("AT+CIPSERVER=1,333", "OK", 300);
  printf("server ready\\n");`,
 step:`  if (uartLine(line, 96, 100) >= 0) {
    int at = ipdPayload(line);
    if (at >= 0) {
      printf("got: %s\\n", line + at);
      int on = strcmp(line + at, "LED ON") == 0;
      HAL_GPIO_WritePin(GPIOA, GPIO_PIN_5, on ? GPIO_PIN_SET : GPIO_PIN_RESET);
      uartSend("AT+CIPSEND=0,5\\r\\n");
      if (waitPrompt(300)) uartSend("ACK\\r\\n");
    }
  }`});
// ESP-01 as a station: joins the AP, opens TCP to 192.168.4.1:333, sends a command each second and prints the answer.
const WIFI_CLIENT=()=>halProgram({baud:115200,helpers:AT+WIFI_SEND,globals:'char line[96];\nint ledOn = 0;',
 init:`HAL_Delay(500);
  atCommand("ATE0", "OK", 300);
  atCommand("AT+CWMODE=1", "OK", 300);
  while (!atCommand("AT+CWJAP=${NET}", "OK", 5000)) HAL_Delay(500);
  while (!atCommand("AT+CIPSTART=\\"TCP\\",\\"192.168.4.1\\",333", "OK", 2000)) HAL_Delay(500);
  printf("connected\\n");`,
 step:`  ledOn = !ledOn;
  uartSend(ledOn ? "AT+CIPSEND=8\\r\\n" : "AT+CIPSEND=9\\r\\n");
  if (waitPrompt(300)) {
    uartSend(ledOn ? "LED ON\\r\\n" : "LED OFF\\r\\n");
    printf("sent LED %s\\n", ledOn ? "ON" : "OFF");
  }
  uint32_t start = HAL_GetTick();
  while (HAL_GetTick() - start < 1000) {
    if (uartLine(line, 96, 50) < 0) continue;
    int at = ipdPayload(line);
    if (at >= 0) printf("answer: %s\\n", line + at);
  }`});
export function wifiStm32(){
 const p=circuit('STM32·STM32 Wi-Fi 통신');setMain(p,WIFI_CLIENT());secondBoard(p,WIFI_SERVER());
 const hook=(id,name,dx,pin,supply)=>{
  module(p,id,'esp01-wifi-8',name,MODULE_X+dx,MODULE_Y);const end=n=>`part:${id}:p${n}`,row=y=>MODULE_Y+y;
  // The header's first row (GND, RXD) stands behind the second: those wires come in half a row beside it.
  lane(p,pin('GND'),end(ESP01.GND),COLORS.ground,dx+447,row(-26.5));lane(p,pin('PA10'),end(ESP01.TXD),COLORS.rx,dx+477);lane(p,pin('PA9'),end(ESP01.RXD),COLORS.tx,dx+492,row(26.5));
  // 3.3 V and CH_PD: the two 3V3 pins on the board's left side, each on a lane under the board.
  under(p,supply[0],end(ESP01.VCC),COLORS.power,dx,520,dx+507);under(p,supply[1],end(ESP01.CH_PD),COLORS.control,dx,530,dx+517);
 };
 hook('esp1','ESP-01 접속',0,mainPin,['board:CN6:4','board:CN7:16']);hook('esp2','ESP-01 AP',SECOND_DX,stm32Pin('stm2'),['devboard:stm2:CN6:4','devboard:stm2:CN7:16']);
 return p;
}
export const WIRELESS_EXAMPLES=Object.freeze([
 {id:'wireless-bt-stm32',code:'BT-01',kind:'통신',boards:['stm32'],title:'STM32·STM32 블루투스 통신',ref:'HC-05 마스터 · HC-06 슬레이브',how:'STM32-1이 1초마다 보낸 LED 명령을 STM32-2가 받아 LD2를 켜고 끄고 답합니다. 실물은 HC-05를 AT+ROLE=1로 먼저 설정해야 합니다.',build:bluetoothStm32},
 {id:'wireless-bt-esp32',code:'BT-02',kind:'통신',boards:['stm32','esp32'],title:'STM32·ESP32 블루투스 통신',ref:'HC-05 마스터 · ESP32 Serial2 · HC-06 슬레이브',how:'STM32가 1초마다 보낸 LED 명령을 ESP32가 받아 파란 LED를 켜고 끄고 답합니다. 실물은 HC-05를 AT+ROLE=1로 먼저 설정해야 합니다.',build:bluetoothEsp32},
 {id:'wireless-wifi-stm32',code:'WF-01',kind:'통신',boards:['stm32'],title:'STM32·STM32 Wi-Fi 통신',ref:'ESP-01 AP · TCP 서버 · AT 명령',how:'STM32-2의 ESP-01이 AP와 TCP 서버를 열고, STM32-1의 ESP-01이 접속해 1초마다 LED 명령을 보냅니다.',build:wifiStm32}
]);
