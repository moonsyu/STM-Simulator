// CMSIS register operations. GPIO/peripheral setup and delays are also direct register code.
export function baremetalCards(config,type,sample){
 const servo=type==='servo'||type?.startsWith('ref_servo_'),cards=[],pins=Object.entries(config.pins),input=pins.find(([,v])=>v.function.startsWith('GPIO'))||pins[0];
 if(input){const [pin]=input;cards.push({id:'gpio-read',name:'GPIOx → IDR',description:pin+'의 입력 레벨을 직접 읽습니다. 출력 핀도 실제 핀 상태를 읽을 수 있습니다.',code:`uint32_t value = (GPIO${pin[1]}->IDR >> ${Number(pin.slice(2))}) & 1U;\nprintf("${pin} IDR=%lu\\n", value);`});}
 const output=pins.find(([,v])=>v.function==='GPIO_Output');if(output){const [pin]=output,n=Number(pin.slice(2));cards.push({id:'gpio-write',name:'GPIOx → BSRR',description:pin+'을 SET/RESET합니다. 다른 핀은 유지하는 원자적 비트 기록입니다.',code:`GPIO${pin[1]}->BSRR = 1UL << ${n};\nBM_delay(100);\nGPIO${pin[1]}->BSRR = 1UL << ${n+16};`});}
 const adc=pins.find(([,v])=>v.function.startsWith('ADC1_'));if(adc){const ch=Number(adc[1].function.slice(7));cards.push({id:'adc-read',name:'ADC1 → SQR3 / CR2 / SR / DR',description:adc[0]+' 채널을 단일 변환하고 12비트 값을 읽습니다. 타임아웃이면 오류를 출력합니다.',code:`ADC1->SQR3 = (ADC1->SQR3 & ~31UL) | ${ch}U;\nADC1->SR &= ~ADC_SR_EOC;\nADC1->CR2 |= ADC_CR2_ADON;\nBM_delay(1);\nADC1->CR2 |= ADC_CR2_SWSTART;\nuint32_t timeout = 1000000U;\nwhile (!(ADC1->SR & ADC_SR_EOC) && timeout > 0U) timeout--;\nif (timeout > 0U) printf("ADC=%lu\\n", ADC1->DR & 4095U);\nelse printf("ADC conversion timeout\\n");`});}
 for(const [id,setting]of Object.entries(config.peripherals)){if(!setting.enabled)continue;
  if(/^TIM/.test(id)){cards.push({id:'timer-counter',name:id+' → CNT',description:'현재 카운터를 읽습니다. 클록·PSC·ARR는 이 장치의 초기화 값을 사용합니다.',code:`printf("${id} CNT=%lu\\n", ${id}->CNT);`});const fn=pins.find(([,v])=>v.function.startsWith(id+'_CH'));if(fn){const channel=fn[1].function.split('_CH')[1];cards.push({id:'timer-compare',name:id+' → CCR'+channel,description:servo?'서보 채널의 펄스 폭을 1.5 ms(중앙 위치)로 설정합니다.':'해당 PWM 채널을 예제 주기의 50% 듀티로 설정합니다.',code:`${id}->CCR${channel} = ${servo?Math.round(config.timerClockHz/(setting.prescaler+1)*0.0015)+'U':'('+id+'->ARR + 1U) / 2U'};\nprintf("${id} CCR${channel}=%lu\\n", ${id}->CCR${channel});`});}}
  if(/^USART|^UART/.test(id))cards.push({id:'uart-byte',name:id+' → SR / DR',description:'TXE를 확인한 뒤 문자 A 한 바이트를 전송합니다. 예제와 같은 보드레이트/배선을 사용합니다.',code:`uint32_t timeout = 1000000U;\nwhile (!(${id}->SR & USART_SR_TXE) && timeout > 0U) timeout--;\nif (timeout > 0U) ${id}->DR = 65U;\nelse printf("UART TX timeout\\n");`});
  if(id==='SPI1'){
   const cs=pins.find(([,v])=>v.function==='GPIO_Output')?.[0],n=Number(cs?.slice(2));
   cards.push({id:'spi-transfer',name:'SPI1 → DR 송수신',description:'CS를 선택하고 실제 8비트 전송을 수행합니다. TXE/RXNE와 BSY를 확인하고, 수신값 또는 타임아웃을 출력합니다. 0xFF는 버스 점검용이며 장치별 명령은 HAL 예제를 참고하세요.',code:`${cs?'GPIO'+cs[1]+'->BSRR=1UL<<'+(n+16)+';':''}\nint received=BM_spi(0xFF);\nuint32_t timeout=1000000U;while((SPI1->SR&SPI_SR_BSY)&&--timeout){}\n${cs?'GPIO'+cs[1]+'->BSRR=1UL<<'+n+';':''}\nprintf("SPI RX=%d timeout=%lu\\n",received,timeout==0);`});
  }
  if(id==='I2C1'){
   const address=sample?.components.find(p=>p.address)?.address??({'ref_lcd_i2c_4':0x3e,'ref_ads1115_10':0x48,'ref_mcp4725_6':0x62,'ref_ds3231_8':0x68,'ref_urm09_i2c_4':0x11,'ref_motor_driver_hat':0x40,'ref_ov2640_camera':0x30})[type]??0x50;
   cards.push({id:'i2c-transfer',name:'I2C1 → START / ADDR / DR / STOP',description:'주소 단계 ACK를 확인하고 1바이트를 수신합니다. STM32F4의 1바이트 수신 순서에 맞춰 ACK를 끄고 ADDR 해제 직후 STOP을 설정합니다. 슬레이브의 현재 포인터에서 읽으며 다바이트 센서 측정은 HAL 예제를 사용하세요.',code:`uint32_t acknowledged=BM_i2cWrite(0x${address.toString(16)},0,0);\nint received=acknowledged?BM_i2cReadByte(0x${address.toString(16)}):-1;\nprintf("I2C ACK=%lu byte=%d\\n",acknowledged,received);`});
  }
 }
 return cards;
}
