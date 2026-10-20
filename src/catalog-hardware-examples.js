export function hardwareProtocolExample(v,b){
 const {p,pin,connect,power,i2c,finish}=b,id=v.id;
 if(id==='can-transceiver-6'){
  power(1,2);pin('PB8','Reserved');pin('PB9','Reserved');connect(3,'PB9');connect(4,'PB8');
  return finish(`__HAL_RCC_CAN1_CLK_ENABLE();__HAL_RCC_GPIOB_CLK_ENABLE();GPIO_InitTypeDef pins={0};pins.Pin=GPIO_PIN_8|GPIO_PIN_9;pins.Mode=GPIO_MODE_AF_PP;pins.Pull=GPIO_NOPULL;pins.Speed=GPIO_SPEED_FREQ_VERY_HIGH;pins.Alternate=GPIO_AF9_CAN1;HAL_GPIO_Init(GPIOB,&pins);
 hcan.Instance=CAN1;hcan.Init.Prescaler=HAL_RCC_GetPCLK1Freq()/8000000U;hcan.Init.Mode=CAN_MODE_LOOPBACK; // Internal loopback: use CAN_MODE_NORMAL with a real second CAN node.
hcan.Init.SyncJumpWidth=CAN_SJW_1TQ;hcan.Init.TimeSeg1=CAN_BS1_13TQ;hcan.Init.TimeSeg2=CAN_BS2_2TQ;hcan.Init.AutoRetransmission=DISABLE;
 if(HAL_CAN_Init(&hcan)!=HAL_OK)Error_Handler();CAN_FilterTypeDef filter={0};filter.FilterBank=0;filter.FilterMode=CAN_FILTERMODE_IDMASK;filter.FilterScale=CAN_FILTERSCALE_32BIT;filter.FilterFIFOAssignment=CAN_RX_FIFO0;filter.FilterActivation=ENABLE;filter.SlaveStartFilterBank=14;HAL_CAN_ConfigFilter(&hcan,&filter);HAL_CAN_Start(&hcan);`,
 `CAN_TxHeaderTypeDef header={0};header.StdId=0x123;header.IDE=CAN_ID_STD;header.RTR=CAN_RTR_DATA;header.DLC=2;uint8_t tx[2]={0x53,0x54};uint32_t mailbox=0;
 if(HAL_CAN_GetTxMailboxesFreeLevel(&hcan)>0)HAL_CAN_AddTxMessage(&hcan,&header,tx,&mailbox);
 if(HAL_CAN_GetRxFifoFillLevel(&hcan,CAN_RX_FIFO0)>0){CAN_RxHeaderTypeDef received={0};uint8_t bytes[8]={0};HAL_CAN_GetRxMessage(&hcan,CAN_RX_FIFO0,&received,bytes);printf("CAN id=%lx length=%lu\\n",received.StdId,received.DLC);}
 printf("CAN errors=%lu (loopback=0; normal mode needs a peer ACK)\\n",HAL_CAN_GetError(&hcan));HAL_Delay(1000);`,'','CAN_HandleTypeDef hcan;');
 }
 if(id==='max98357a-9'){
  power(1,2,'5V');pin('PB12','Reserved');pin('PB13','Reserved');pin('PB15','Reserved');connect(3,'PB15');connect(4,'PB13');connect(5,'PB12');connect(7,'3V3');
  return finish(`__HAL_RCC_SPI2_CLK_ENABLE();__HAL_RCC_GPIOB_CLK_ENABLE();RCC_PeriphCLKInitTypeDef clock={0};clock.PeriphClockSelection=RCC_PERIPHCLK_I2S_APB1;clock.PLLI2S.PLLI2SM=16;clock.PLLI2S.PLLI2SN=192;clock.PLLI2S.PLLI2SP=2;clock.PLLI2S.PLLI2SR=2;clock.PLLI2S.PLLI2SQ=2;clock.PLLI2SDivQ=1;clock.I2sApb1ClockSelection=RCC_I2SAPB1CLKSOURCE_PLLI2S;HAL_RCCEx_PeriphCLKConfig(&clock);
 GPIO_InitTypeDef pins={0};pins.Pin=GPIO_PIN_12|GPIO_PIN_13|GPIO_PIN_15;pins.Mode=GPIO_MODE_AF_PP;pins.Pull=GPIO_NOPULL;pins.Speed=GPIO_SPEED_FREQ_HIGH;pins.Alternate=GPIO_AF5_SPI2;HAL_GPIO_Init(GPIOB,&pins);
 hi2s.Instance=SPI2;hi2s.Init.Mode=I2S_MODE_MASTER_TX;hi2s.Init.Standard=I2S_STANDARD_PHILIPS;hi2s.Init.DataFormat=I2S_DATAFORMAT_16B;hi2s.Init.MCLKOutput=I2S_MCLKOUTPUT_DISABLE;hi2s.Init.AudioFreq=I2S_AUDIOFREQ_16K;hi2s.Init.CPOL=I2S_CPOL_LOW;hi2s.Init.ClockSource=I2S_CLOCK_PLL;hi2s.Init.FullDuplexMode=I2S_FULLDUPLEXMODE_DISABLE;if(HAL_I2S_Init(&hi2s)!=HAL_OK)Error_Handler();`,
 `uint16_t samples[64]={0};for(uint32_t frame=0;frame<32;frame++){int16_t sample=(frame%16)<8?3000:-3000;samples[frame*2]=sample;samples[frame*2+1]=sample;}HAL_I2S_Transmit(&hi2s,samples,64,100);`,'','I2S_HandleTypeDef hi2s;');
 }
 if(id==='ov2640-camera'){
  power(1,2);i2c(4,3);pin('PC7');connect(17,'PC7');pin('PC6');connect(18,'PC6');pin('PA8','Reserved');connect(8,'PA8');
  return finish(`HAL_RCC_MCOConfig(RCC_MCO1,RCC_MCO1SOURCE_HSI,RCC_MCODIV_1);HAL_GPIO_WritePin(GPIOC,GPIO_PIN_6,GPIO_PIN_RESET);HAL_GPIO_WritePin(GPIOC,GPIO_PIN_7,GPIO_PIN_RESET);HAL_Delay(10);HAL_GPIO_WritePin(GPIOC,GPIO_PIN_7,GPIO_PIN_SET);HAL_Delay(20);`,
 `uint8_t bank[1]={1},id[2]={0};if(HAL_I2C_Mem_Write(&hi2c1,0x30<<1,0xFF,I2C_MEMADD_SIZE_8BIT,bank,1,100)==HAL_OK){HAL_I2C_Mem_Read(&hi2c1,0x30<<1,0x0A,I2C_MEMADD_SIZE_8BIT,id,2,100);printf("OV2640 sensor PID/VER=%02x %02x\\n",id[0],id[1]);}else printf("OV2640 SCCB timeout: check XCLK/reset/power\\n");HAL_Delay(1000);`);
 }
 if(id==='motor-driver-hat'){
  // The HAT's selected external connector is described in catalog-defs; the Pi header is a duplicate interface.
  power(2,3);i2c(4,5);p.components.push({id:'supply',type:'dc_supply',name:'9 V motor power',voltage:9,x:600,y:500,rotation:0,span:70},{id:'motorA',type:'dc_motor',name:'Motor A',x:1000,y:440,rotation:0,span:70});p.wires.push(...[['part:supply:a','part:demo:p6'],['part:supply:b','part:demo:p11'],['part:demo:p11','part:demo:p3'],['part:demo:p7','part:motorA:a'],['part:demo:p8','part:motorA:b']].map(([from,to],i)=>({id:'hat'+i,from,to,color:'#23a68a'})));
  return finish(`uint8_t sleep[1]={0x10},freq[1]={5},wake[1]={0x20};HAL_I2C_Mem_Write(&hi2c1,0x40<<1,0,I2C_MEMADD_SIZE_8BIT,sleep,1,100);HAL_I2C_Mem_Write(&hi2c1,0x40<<1,0xFE,I2C_MEMADD_SIZE_8BIT,freq,1,100);HAL_I2C_Mem_Write(&hi2c1,0x40<<1,0,I2C_MEMADD_SIZE_8BIT,wake,1,100);HAL_Delay(5);`,
  `uint8_t pwm[4]={0,0,0,8},high[4]={0,0x10,0,0},low[4]={0,0,0,0x10};HAL_I2C_Mem_Write(&hi2c1,0x40<<1,6,I2C_MEMADD_SIZE_8BIT,pwm,4,100);HAL_I2C_Mem_Write(&hi2c1,0x40<<1,10,I2C_MEMADD_SIZE_8BIT,high,4,100);HAL_I2C_Mem_Write(&hi2c1,0x40<<1,14,I2C_MEMADD_SIZE_8BIT,low,4,100);HAL_Delay(1000);`);
 }
 throw new Error('장치 예제 구현을 확인하세요: '+id);
}
