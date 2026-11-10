// I2C and SPI instances beyond the first (CubeMX Connectivity › I2C1-3, SPI1-3). The F446RE has I2C1-3 and SPI1-3, the
// F103RB I2C1-2 and SPI1-2 (I2C2 / SPI2 have no AFIO remap). Pins and alternate functions follow ST's open pin data
// (STM32F446R(C-E)Tx, GPIO-STM32F446_gpio_v1_0_Modes.xml), limited to the pins the NUCLEO headers carry.
export const I2C_IDS=Object.freeze(['I2C1','I2C2','I2C3']),SPI_IDS=Object.freeze(['SPI1','SPI2','SPI3']);
export const isI2c=id=>/^I2C[123]$/.test(id),isSpi=id=>/^SPI[123]$/.test(id);
/** The I2C / SPI instance a pin function belongs to (I2C2_SDA → I2C2), or null. */
export const i2cOf=fn=>/^(I2C[123])_(SCL|SDA)$/.exec(fn)?.[1]??null;
export const spiOf=fn=>/^(SPI[123])_(SCK|MISO|MOSI)$/.exec(fn)?.[1]??null;
/** CubeMX handle names: hi2c2, hspi3. */
export const busHandle=id=>'h'+id.toLowerCase();
export const F4_BUS_ROUTES=Object.freeze({
 I2C2:{SCL:['PB10'],SDA:['PB3','PC12']},I2C3:{SCL:['PA8'],SDA:['PC9','PB4']},
 SPI2:{SCK:['PB13','PB10','PC7','PA9'],MISO:['PB14','PC2'],MOSI:['PB15','PC3','PC1']},
 SPI3:{SCK:['PC10','PB3'],MISO:['PC11','PB4'],MOSI:['PC12','PB5','PB0','PB2','PC1']}});
export const F1_BUS_ROUTES=Object.freeze({I2C2:{SCL:['PB10'],SDA:['PB11']},SPI2:{SCK:['PB13'],MISO:['PB14'],MOSI:['PB15']}});
// F446 alternate function numbers: I2C AF4; SPI1 AF5; SPI2 AF5 (PC1 AF7); SPI3 AF6 (PB0 / PB2 AF7, PC1 AF5).
const AF_EXCEPTIONS={SPI2_MOSI:{PC1:7},SPI3_MOSI:{PB0:7,PB2:7,PC1:5}};
/** F446 AF number of an I2C / SPI signal on a pin, or null for another function. */
export function busAf(fn,pin){
 if(i2cOf(fn))return 4;const spi=spiOf(fn);if(!spi)return null;
 return AF_EXCEPTIONS[fn]?.[pin]??(spi==='SPI3'?6:5);
}
/** IRQ names of the buses of a family beyond I2C1 / SPI1. */
export const busIrqs=routes=>Object.keys(routes).flatMap(id=>isI2c(id)?[id+'_EV_IRQn',id+'_ER_IRQn']:[id+'_IRQn']);
