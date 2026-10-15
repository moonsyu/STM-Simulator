import {serialAf,serialFunction,isSerial} from './serial-config.js';
import {timerAf} from './timer-config.js';
export const REGISTER_HELPERS=`static uint32_t BM_pclk(uint32_t apb2) {
 uint32_t bits=(RCC->CFGR>>(apb2?13:10))&7U;
 return SystemCoreClock/(bits<4?1U:(1U<<(bits-3)));
}
static void BM_delay(uint32_t ms) {
 CoreDebug->DEMCR|=CoreDebug_DEMCR_TRCENA_Msk;DWT->CTRL|=DWT_CTRL_CYCCNTENA_Msk;
 while(ms--){uint32_t start=DWT->CYCCNT;while((uint32_t)(DWT->CYCCNT-start)<SystemCoreClock/1000U){}}
}
static uint32_t BM_wait(volatile uint32_t *reg,uint32_t mask) {
 uint32_t timeout=1000000;while(!(*reg&mask)&&--timeout){}return timeout!=0;
}
static int BM_spi(uint8_t value){
 if(!BM_wait(&SPI1->SR,SPI_SR_TXE))return -1;
 *(__IO uint8_t*)&SPI1->DR=value;
 if(!BM_wait(&SPI1->SR,SPI_SR_RXNE))return -1;
 return *(__IO uint8_t*)&SPI1->DR;
}
static int BM_i2cWait(uint32_t mask){
 uint32_t limit=1000000;while(!(I2C1->SR1&mask)&&--limit){if(I2C1->SR1&(I2C_SR1_AF|I2C_SR1_BERR|I2C_SR1_ARLO)){I2C1->SR1&=~(I2C_SR1_AF|I2C_SR1_BERR|I2C_SR1_ARLO);I2C1->CR1|=I2C_CR1_STOP;return 0;}}
 if(!limit)I2C1->CR1|=I2C_CR1_STOP;return limit!=0;
}
static int BM_i2cWrite(uint8_t address,const uint8_t *bytes,uint32_t count){
 uint32_t limit=1000000;while((I2C1->SR2&I2C_SR2_BUSY)&&--limit){}if(!limit)return 0;
 I2C1->CR1|=I2C_CR1_START;if(!BM_i2cWait(I2C_SR1_SB))return 0;
 I2C1->DR=address<<1;if(!BM_i2cWait(I2C_SR1_ADDR))return 0;(void)I2C1->SR2;
 for(uint32_t i=0;i<count;i++){if(!BM_i2cWait(I2C_SR1_TXE))return 0;I2C1->DR=bytes[i];}
 if(count&&!BM_i2cWait(I2C_SR1_BTF))return 0;I2C1->CR1|=I2C_CR1_STOP;return 1;
}
static int BM_i2cReadByte(uint8_t address){
 uint32_t limit=1000000;while((I2C1->SR2&I2C_SR2_BUSY)&&--limit){}if(!limit)return -1;
 I2C1->CR1&=~(I2C_CR1_ACK|I2C_CR1_POS);I2C1->CR1|=I2C_CR1_START;
 if(!BM_i2cWait(I2C_SR1_SB))return -1;I2C1->DR=(address<<1)|1;
 if(!BM_i2cWait(I2C_SR1_ADDR))return -1;
 uint32_t primask=__get_PRIMASK();__disable_irq();(void)I2C1->SR2;I2C1->CR1|=I2C_CR1_STOP;__set_PRIMASK(primask);
 if(!BM_i2cWait(I2C_SR1_RXNE))return -1;return I2C1->DR&255;
}`;
export function registerSetup(config){
 const lines=['SystemCoreClockUpdate();'];
 for(const [pin,c]of Object.entries(config.pins)){
  if(['Reset','Reserved'].includes(c.function))continue;
  const port='GPIO'+pin[1],n=Number(pin.slice(2)),f=c.function,mode=f.startsWith('ADC')||f==='Analog'?3:f==='GPIO_Output'?1:f.startsWith('GPIO')?0:2,serial=serialFunction(f),af=serial?serialAf(serial):f.startsWith('I2C')?4:f.startsWith('SPI')?5:f.startsWith('TIM')?timerAf(f.split('_')[0]):0;
  lines.push(`RCC->AHB1ENR|=RCC_AHB1ENR_${port}EN;(void)RCC->AHB1ENR;`,`${port}->MODER=(${port}->MODER&~(3UL<<${n*2}))|(${mode}UL<<${n*2});`,`${port}->PUPDR=(${port}->PUPDR&~(3UL<<${n*2}))|(${['NOPULL','PULLUP','PULLDOWN'].indexOf(c.pull)}UL<<${n*2});`,`${port}->OSPEEDR|=3UL<<${n*2};`);
  lines.push(f.startsWith('I2C')?`${port}->OTYPER|=1UL<<${n};`:`${port}->OTYPER&=~(1UL<<${n});`);
  if(mode===1)lines.push(`${port}->BSRR=1UL<<${n+(c.initial?0:16)};`);
  if(mode===2)lines.push(`${port}->AFR[${n>>3}]=(${port}->AFR[${n>>3}]&~(15UL<<${(n%8)*4}))|(${af}UL<<${(n%8)*4});`);
 }
 for(const [id,s]of Object.entries(config.peripherals)){
  if(!s.enabled)continue;
  if(id==='ADC1')lines.push('RCC->APB2ENR|=RCC_APB2ENR_ADC1EN;(void)RCC->APB2ENR;ADC->CCR=(ADC->CCR&~ADC_CCR_ADCPRE)|ADC_CCR_ADCPRE_0;ADC1->CR1=0;ADC1->CR2=ADC_CR2_ADON;ADC1->SQR1=0;');
  if(id==='I2C1')lines.push('RCC->APB1ENR|=RCC_APB1ENR_I2C1EN;(void)RCC->APB1ENR;I2C1->CR1=I2C_CR1_SWRST;I2C1->CR1=0;','I2C1->CR2=BM_pclk(0)/1000000U;I2C1->CCR=BM_pclk(0)/200000U;I2C1->TRISE=BM_pclk(0)/1000000U+1U;I2C1->CR1=I2C_CR1_PE;');
  if(id==='SPI1')lines.push('RCC->APB2ENR|=RCC_APB2ENR_SPI1EN;(void)RCC->APB2ENR;SPI1->CR1=0;SPI1->CR2=0;',`{uint32_t div=0,clock=BM_pclk(1)/2;while(clock>${s.clock||1000000}U&&div<7){clock/=2;div++;}SPI1->CR1=SPI_CR1_MSTR|SPI_CR1_SSM|SPI_CR1_SSI|(div<<3)|SPI_CR1_SPE;}`);
  if(isSerial(id)){const bus=['USART1','USART6'].includes(id)?2:1;lines.push(`RCC->APB${bus}ENR|=RCC_APB${bus}ENR_${id}EN;(void)RCC->APB${bus}ENR;${id}->CR1=0;${id}->CR2=0;${id}->CR3=0;${id}->BRR=(BM_pclk(${bus===2?1:0})+${Math.floor(s.baud/2)}U)/${s.baud}U;${id}->CR1=USART_CR1_UE|USART_CR1_TE|USART_CR1_RE;`);}
  if(/^TIM[2345]$/.test(id)){lines.push(`RCC->APB1ENR|=RCC_APB1ENR_${id}EN;(void)RCC->APB1ENR;${id}->CR1=0;${id}->PSC=${s.prescaler}U;${id}->ARR=${s.period}U;${id}->CNT=0;`);for(const [,p]of Object.entries(config.pins).filter(([,p])=>p.function.startsWith(id+'_CH'))){const n=Number(p.function.split('_CH')[1]);lines.push(`${id}->CCMR${n<=2?1:2}=(${id}->CCMR${n<=2?1:2}&~(255UL<<${(n-1)%2*8}))|(104UL<<${(n-1)%2*8});${id}->CCR${n}=${s.pulse||0}U;${id}->CCER|=1UL<<${(n-1)*4};`);}lines.push(`${id}->EGR=TIM_EGR_UG;${id}->CR1=TIM_CR1_CEN|TIM_CR1_ARPE;`);}
 }
 return lines.join('\n');
}
