void f(void){
        uint8_t bank[1]={1}, id[2]={0};if (HAL_I2C_Mem_Write(&hi2c1, 0x30<<1, 0xFF, I2C_MEMADD_SIZE_8BIT, bank, 1, 100)==HAL_OK) {HAL_I2C_Mem_Read(&hi2c1, 0x30<<1, 0x0A, I2C_MEMADD_SIZE_8BIT, id, 2, 100);printf("OV2640 sensor PID/VER=%02x %02x\n", id[0], id[1]);} else printf("OV2640 SCCB timeout: check XCLK/reset/power\n");HAL_Delay(1000);
if(a){b();}else if(c)d();else e();
}
