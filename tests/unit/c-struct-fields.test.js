// Error-case pass, feature 7 (completion while typing): after "." or "->" the editor offers the fields of the struct.
// structFields reads them from a header or a source, declaredType finds what a variable is, accessChain what is being
// accessed.
import test from 'node:test';
import assert from 'node:assert/strict';
import {structFields,declaredType,accessChain} from '../../src/c-struct-fields.js';

const HAL=`
/** @brief GPIO Init structure definition */
typedef struct
{
  uint32_t Pin;       /*!< Specifies the GPIO pins to be configured. */
  uint32_t Mode;      // the mode; of the pin
  uint32_t Pull, Speed;
#if defined(STM32F4)
  uint32_t Alternate;
#endif
} GPIO_InitTypeDef;

typedef struct __ADC_HandleTypeDef
{
  ADC_TypeDef                   *Instance;
  ADC_InitTypeDef               Init;
  __IO uint32_t                 NbrOfCurrentConversionRank;
  DMA_HandleTypeDef             *DMA_Handle;
  HAL_LockTypeDef               Lock;
  __IO uint32_t                 State;
  void (* ConvCpltCallback)(struct __ADC_HandleTypeDef *hadc);
  uint8_t                       buffer[16];
  uint32_t                      flag : 1;
  union { uint32_t word; uint8_t bytes[4]; } raw;
  struct Inner { int a; int b; } inner, *next;
} ADC_HandleTypeDef;

struct Point { int x; int y; };
`;

test('fields of a typedef struct, a tagged struct and nested members; comments and #if lines are skipped',()=>{
 assert.deepEqual(structFields(HAL,'GPIO_InitTypeDef'),[{name:'Pin',type:'uint32_t'},{name:'Mode',type:'uint32_t'},{name:'Pull',type:'uint32_t'},{name:'Speed',type:'uint32_t'},{name:'Alternate',type:'uint32_t'}]);
 const adc=structFields(HAL,'ADC_HandleTypeDef');
 assert.deepEqual(adc.map(f=>f.name),['Instance','Init','NbrOfCurrentConversionRank','DMA_Handle','Lock','State','ConvCpltCallback','buffer','flag','raw','inner','next']);
 assert.equal(adc.find(f=>f.name==='Instance').type,'ADC_TypeDef','a pointer field keeps its type name');
 assert.equal(adc.find(f=>f.name==='Init').type,'ADC_InitTypeDef');assert.equal(adc.find(f=>f.name==='State').type,'uint32_t','__IO is dropped');
 assert.equal(adc.find(f=>f.name==='inner').type,'Inner');assert.equal(adc.find(f=>f.name==='buffer').type,'uint8_t');
 assert.deepEqual(structFields(HAL,'Point'),[{name:'x',type:'int'},{name:'y',type:'int'}]);
 assert.deepEqual(structFields(HAL,'Inner'),[{name:'a',type:'int'},{name:'b',type:'int'}]);
 assert.deepEqual(structFields(HAL,'Missing'),[]);assert.deepEqual(structFields(HAL,'not a name'),[]);assert.deepEqual(structFields('',''),[]);
 // A name only mentioned in a comment or a string is not a definition.
 assert.deepEqual(structFields('/* } Ghost; */ const char *s = "} Ghost;";','Ghost'),[]);
});

test('the declared type of a variable, a pointer parameter and an array; not fooled by statements',()=>{
 const code='ADC_HandleTypeDef hadc1;\nstatic GPIO_InitTypeDef GPIO_InitStruct = {0};\nvoid f(UART_HandleTypeDef *huart, const Point *p) { return hadc1; }\nPoint path[4];\n// Fake ghost;\n';
 assert.equal(declaredType(code,'hadc1'),'ADC_HandleTypeDef');assert.equal(declaredType(code,'GPIO_InitStruct'),'GPIO_InitTypeDef');
 assert.equal(declaredType(code,'huart'),'UART_HandleTypeDef');assert.equal(declaredType(code,'p'),'Point');assert.equal(declaredType(code,'path'),'Point');
 assert.equal(declaredType(code,'ghost'),'','a comment declares nothing');assert.equal(declaredType(code,'nothing'),'');
});

test('the access before the cursor',()=>{
 assert.deepEqual(accessChain('  hadc1.'),['hadc1']);assert.deepEqual(accessChain('  x = hadc1.Init.'),['hadc1','Init']);
 assert.deepEqual(accessChain('  huart->'),['huart']);assert.deepEqual(accessChain('  path[2].'),['path']);assert.deepEqual(accessChain('  a->b . c ->'),['a','b','c']);
 assert.equal(accessChain('  HAL_ADC_St'),null);assert.equal(accessChain('  x = 1.'),null,'a number is not an access');assert.equal(accessChain(''),null);
});
