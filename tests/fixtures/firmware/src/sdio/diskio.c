/* FatFs disk I/O on the SDIO card through HAL_SD (polling). */
#include "ff.h"
#include "diskio.h"
#include "main.h"

extern SD_HandleTypeDef hsd;
static int wait_ready(void) {
  uint32_t start = HAL_GetTick();
  while (HAL_SD_GetCardState(&hsd) != HAL_SD_CARD_TRANSFER) if (HAL_GetTick() - start > 500) return 0;
  return 1;
}
DSTATUS disk_status(BYTE pdrv) { return pdrv ? STA_NOINIT : 0; }
DSTATUS disk_initialize(BYTE pdrv) { return pdrv ? STA_NOINIT : 0; }
DRESULT disk_read(BYTE pdrv, BYTE *buff, LBA_t sector, UINT count) {
  if (pdrv) return RES_PARERR;
  if (HAL_SD_ReadBlocks(&hsd, buff, (uint32_t)sector, count, 1000) != HAL_OK) return RES_ERROR;
  return wait_ready() ? RES_OK : RES_ERROR;
}
DRESULT disk_write(BYTE pdrv, const BYTE *buff, LBA_t sector, UINT count) {
  if (pdrv) return RES_PARERR;
  if (HAL_SD_WriteBlocks(&hsd, (uint8_t *)buff, (uint32_t)sector, count, 1000) != HAL_OK) return RES_ERROR;
  return wait_ready() ? RES_OK : RES_ERROR;
}
DRESULT disk_ioctl(BYTE pdrv, BYTE cmd, void *buff) {
  HAL_SD_CardInfoTypeDef info;
  if (pdrv) return RES_PARERR;
  switch (cmd) {
    case CTRL_SYNC: return RES_OK;
    case GET_SECTOR_COUNT: HAL_SD_GetCardInfo(&hsd, &info); *(LBA_t *)buff = info.LogBlockNbr; return RES_OK;
    case GET_SECTOR_SIZE: *(WORD *)buff = 512; return RES_OK;
    case GET_BLOCK_SIZE: *(DWORD *)buff = 1; return RES_OK;
  }
  return RES_PARERR;
}
