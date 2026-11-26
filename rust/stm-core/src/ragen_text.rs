//! The texts of the files `ra-generator.js` generated, taken from its template literals (feature 62). A hole is
//! written ⟦label⟧; `fill` puts the values in.

pub const T_HEADER: &str = r####"/* generated ⟦kind⟧ - do not edit */
"####;
pub const T_ADC_DECL_2: &str = r####"
#ifndef ⟦a.callback⟧
void ⟦a.callback⟧(adc_callback_args_t * p_args);
#endif"####;
pub const T_ADC_DECL: &str = r####"/** ADC on ADC Instance. */
extern const adc_instance_t g_adc0;
/** Access the ADC instance using these structures when calling API functions directly (::p_api is not used). */
extern adc_instance_ctrl_t g_adc0_ctrl;
extern const adc_cfg_t g_adc0_cfg;
extern const adc_channel_cfg_t g_adc0_channel_cfg;⟦#0⟧"####;
pub const T_ADC_INSTANCE_V: &str = r####"#if defined(VECTOR_NUMBER_ADC0_⟦k⟧)
    .⟦name⟧ = VECTOR_NUMBER_ADC0_⟦k⟧,
#else
    .⟦name⟧ = FSP_INVALID_VECTOR,
#endif"####;
pub const T_ADC_INSTANCE: &str = r####"adc_instance_ctrl_t g_adc0_ctrl;
const adc_extended_cfg_t g_adc0_cfg_extend =
{
    .add_average_count   = ADC_ADD_OFF,
    .clearing            = ADC_CLEAR_AFTER_READ_ON,
    .trigger             = ⟦#0⟧,
    .trigger_group_b     = ADC_START_SOURCE_DISABLED,
    .double_trigger_mode = ADC_DOUBLE_TRIGGER_DISABLED,
    .adc_vref_control    = ADC_VREF_CONTROL_VREFH,
    .enable_adbuf        = 0,
⟦#1⟧
    .window_a_ipl        = (BSP_IRQ_DISABLED),
⟦#2⟧
    .window_b_ipl        = (BSP_IRQ_DISABLED),
};
const adc_cfg_t g_adc0_cfg =
{
    .unit                = 0,
    .mode                = ⟦#3⟧,
    .resolution          = ADC_RESOLUTION_⟦a.resolution⟧_BIT,
    .alignment           = (adc_alignment_t) ADC_ALIGNMENT_RIGHT,
    .trigger             = (adc_trigger_t) 0xF, // Not used
    .p_callback          = ⟦#4⟧,
    .p_context           = NULL,
    .p_extend            = &g_adc0_cfg_extend,
⟦#5⟧
    .scan_end_ipl        = ⟦#6⟧,
    .scan_end_b_irq      = FSP_INVALID_VECTOR,
    .scan_end_b_ipl      = (BSP_IRQ_DISABLED),
    .scan_end_c_irq      = FSP_INVALID_VECTOR,
    .scan_end_c_ipl      = (BSP_IRQ_DISABLED),
};
const adc_channel_cfg_t g_adc0_channel_cfg =
{
    .scan_mask           = ⟦#7⟧ | 0,
    .scan_mask_group_b   = 0,
    .priority_group_a    = ADC_GROUP_A_PRIORITY_OFF,
    .add_mask            = 0,
    .sample_hold_mask    = 0,
    .sample_hold_states  = 24,
    .p_window_cfg        = NULL,
};
/* Instance structure to use this module. */
const adc_instance_t g_adc0 =
{
    .p_ctrl        = &g_adc0_ctrl,
    .p_cfg         = &g_adc0_cfg,
    .p_channel_cfg = &g_adc0_channel_cfg,
    .p_api         = &g_adc_on_adc
};"####;
pub const T_AGT_DECL_2: &str = r####"
#ifndef ⟦t.callback⟧
void ⟦t.callback⟧(timer_callback_args_t * p_args);
#endif"####;
pub const T_AGT_DECL: &str = r####"/** AGT Timer Instance */
extern const timer_instance_t ⟦t.name⟧;
/** Access the AGT instance using these structures when calling API functions directly (::p_api is not used). */
extern agt_instance_ctrl_t ⟦t.name⟧_ctrl;
extern const timer_cfg_t ⟦t.name⟧_cfg;⟦#0⟧"####;
pub const T_AGT_INSTANCE: &str = r####"agt_instance_ctrl_t ⟦t.name⟧_ctrl;
const agt_extended_cfg_t ⟦t.name⟧_extend =
{
    .count_source            = AGT_CLOCK_⟦t.counts.source⟧,
    .agto                    = AGT_PIN_CFG_DISABLED,
    .agtoab_settings_b.agtoa = AGT_PIN_CFG_DISABLED,
    .agtoab_settings_b.agtob = AGT_PIN_CFG_DISABLED,
    .measurement_mode        = AGT_MEASURE_DISABLED,
    .agtio_filter            = AGT_AGTIO_FILTER_NONE,
    .enable_pin              = AGT_ENABLE_PIN_NOT_USED,
    .trigger_edge            = AGT_TRIGGER_EDGE_RISING,
    .counter_bit_width       = AGT_COUNTER_BIT_WIDTH_16,
};
const timer_cfg_t ⟦t.name⟧_cfg =
{
    .mode                = TIMER_MODE_PERIODIC,
    /* Actual period: ⟦t.period⟧ ⟦#0⟧. Actual duty: 50%. */ .period_counts = (uint32_t) ⟦#1⟧, .duty_cycle_counts = ⟦#2⟧, .source_div = (timer_source_div_t) ⟦t.counts.div⟧,
    .channel             = ⟦t.channel⟧,
    .p_callback          = ⟦#3⟧,
    .p_context           = NULL,
    .p_extend            = &⟦t.name⟧_extend,
    .cycle_end_ipl       = ⟦#4⟧,
#if defined(VECTOR_NUMBER_AGT⟦t.channel⟧_INT)
    .cycle_end_irq       = VECTOR_NUMBER_AGT⟦t.channel⟧_INT,
#else
    .cycle_end_irq       = FSP_INVALID_VECTOR,
#endif
};
/* Instance structure to use this module. */
const timer_instance_t ⟦t.name⟧ =
{
    .p_ctrl        = &⟦t.name⟧_ctrl,
    .p_cfg         = &⟦t.name⟧_cfg,
    .p_api         = &g_timer_on_agt
};"####;
pub const T_IIC_DECL: &str = r####"/* I2C Master on IIC Instance. */
extern const i2c_master_instance_t ⟦t.name⟧;
/** Access the I2C Master instance using these structures when calling API functions directly (::p_api is not used). */
extern iic_master_instance_ctrl_t ⟦t.name⟧_ctrl;
extern const i2c_master_cfg_t ⟦t.name⟧_cfg;
#ifndef ⟦t.callback⟧
void ⟦t.callback⟧(i2c_master_callback_args_t * p_args);
#endif"####;
pub const T_IIC_INSTANCE_V: &str = r####"#if defined(VECTOR_NUMBER_IIC⟦t.channel⟧_⟦k⟧)
    .⟦#0⟧_irq             = VECTOR_NUMBER_IIC⟦t.channel⟧_⟦k⟧,
#else
    .⟦#1⟧_irq             = FSP_INVALID_VECTOR,
#endif"####;
pub const T_IIC_INSTANCE: &str = r####"iic_master_instance_ctrl_t ⟦t.name⟧_ctrl;
const iic_master_extended_cfg_t ⟦t.name⟧_extend =
{
    .timeout_mode             = IIC_MASTER_TIMEOUT_MODE_SHORT,
    .timeout_scl_low          = IIC_MASTER_TIMEOUT_SCL_LOW_ENABLED,
    .smbus_operation          = 0,
    /* Actual calculated bitrate: ⟦#0⟧. Actual calculated duty cycle: ⟦#1⟧%. */ .clock_settings.brl_value = ⟦c.brl⟧, .clock_settings.brh_value = ⟦c.brh⟧, .clock_settings.cks_value = ⟦c.cks⟧, .clock_settings.sddl_value = 0, .clock_settings.dlcs_value = 0,
};
const i2c_master_cfg_t ⟦t.name⟧_cfg =
{
    .channel             = ⟦t.channel⟧,
    .rate                = I2C_MASTER_RATE_⟦t.rate⟧,
    .slave               = 0x⟦#2⟧,
    .addr_mode           = I2C_MASTER_ADDR_MODE_7BIT,
    .p_transfer_tx       = NULL,
    .p_transfer_rx       = NULL,
    .p_callback          = ⟦t.callback⟧,
    .p_context           = NULL,
⟦#3⟧
    .ipl                 = (⟦t.priority⟧),
    .p_extend            = &⟦t.name⟧_extend,
};
/* Instance structure to use this module. */
const i2c_master_instance_t ⟦t.name⟧ =
{
    .p_ctrl        = &⟦t.name⟧_ctrl,
    .p_cfg         = &⟦t.name⟧_cfg,
    .p_api         = &g_i2c_master_on_iic
};"####;
pub const T_IIC_SLAVE_DECL: &str = r####"/* I2C Slave on IIC Instance. */
extern const i2c_slave_instance_t ⟦t.name⟧;
/** Access the I2C Slave instance using these structures when calling API functions directly (::p_api is not used). */
extern iic_slave_instance_ctrl_t ⟦t.name⟧_ctrl;
extern const i2c_slave_cfg_t ⟦t.name⟧_cfg;
#ifndef ⟦t.callback⟧
void ⟦t.callback⟧(i2c_slave_callback_args_t * p_args);
#endif"####;
pub const T_IIC_SLAVE_INSTANCE_V: &str = r####"#if defined(VECTOR_NUMBER_IIC⟦t.channel⟧_⟦k⟧)
    .⟦#0⟧_irq             = VECTOR_NUMBER_IIC⟦t.channel⟧_⟦k⟧,
#else
    .⟦#1⟧_irq             = FSP_INVALID_VECTOR,
#endif"####;
pub const T_IIC_SLAVE_INSTANCE: &str = r####"iic_slave_instance_ctrl_t ⟦t.name⟧_ctrl;
const iic_slave_extended_cfg_t ⟦t.name⟧_extend =
{
    .clock_settings.cks_value = ⟦c.cks⟧, .clock_settings.brl_value = ⟦c.brl⟧, .clock_settings.digital_filter_stages = ⟦c.filter⟧
};
const i2c_slave_cfg_t ⟦t.name⟧_cfg =
{
    .channel             = ⟦t.channel⟧,
    .rate                = I2C_SLAVE_RATE_⟦t.rate⟧,
    .slave               = 0x⟦#0⟧,
    .general_call_enable = false,
    .addr_mode           = I2C_SLAVE_ADDR_MODE_7BIT,
    .p_callback          = ⟦t.callback⟧,
    .p_context           = NULL,
⟦#1⟧
    .ipl                 = (⟦t.priority⟧),
    .eri_ipl             = (⟦t.priority⟧),
    .clock_stretching_enable = true,
    .p_transfer_tx       = NULL,
    .p_transfer_rx       = NULL,
    .p_extend            = &⟦t.name⟧_extend,
};
/* Instance structure to use this module. */
const i2c_slave_instance_t ⟦t.name⟧ =
{
    .p_ctrl        = &⟦t.name⟧_ctrl,
    .p_cfg         = &⟦t.name⟧_cfg,
    .p_api         = &g_i2c_slave_on_iic
};"####;
pub const T_WDT_DECL_2: &str = r####"
#ifndef ⟦w.callback⟧
void ⟦w.callback⟧(wdt_callback_args_t * p_args);
#endif"####;
pub const T_WDT_DECL: &str = r####"/** WDT on ⟦w.id⟧ Instance. */
extern const wdt_instance_t ⟦w.name⟧;
/** Access the ⟦w.id⟧ instance using these structures when calling API functions directly (::p_api is not used). */
extern ⟦w.ctrl⟧ ⟦w.name⟧_ctrl;
extern const wdt_cfg_t ⟦w.name⟧_cfg;⟦#0⟧"####;
pub const T_WDT_INSTANCE: &str = r####"⟦w.ctrl⟧ ⟦w.name⟧_ctrl;
const wdt_cfg_t ⟦w.name⟧_cfg =
{
    .timeout             = WDT_TIMEOUT_⟦w.timeout⟧,
    .clock_division      = WDT_CLOCK_DIVISION_⟦w.clockDiv⟧,
    .window_start        = WDT_WINDOW_START_⟦w.windowStart⟧,
    .window_end          = WDT_WINDOW_END_⟦w.windowEnd⟧,
    .reset_control       = WDT_RESET_CONTROL_⟦w.reset⟧,
    .stop_control        = WDT_STOP_CONTROL_⟦#0⟧,
    .p_callback          = ⟦#1⟧,
};
/* Instance structure to use this module. */
const wdt_instance_t ⟦w.name⟧ =
{
    .p_ctrl        = &⟦w.name⟧_ctrl,
    .p_cfg         = &⟦w.name⟧_cfg,
    .p_api         = &⟦w.api⟧
};"####;
pub const T_RTC_DECL_2: &str = r####"
#ifndef ⟦t.callback⟧
void ⟦t.callback⟧(rtc_callback_args_t * p_args);
#endif"####;
pub const T_RTC_DECL: &str = r####"/* RTC Instance. */
extern const rtc_instance_t ⟦t.name⟧;
/** Access the RTC instance using these structures when calling API functions directly (::p_api is not used). */
extern rtc_instance_ctrl_t ⟦t.name⟧_ctrl;
extern const rtc_cfg_t ⟦t.name⟧_cfg;⟦#0⟧"####;
pub const T_RTC_INSTANCE_V: &str = r####"#if defined(VECTOR_NUMBER_RTC_⟦k⟧)
    .⟦name⟧= VECTOR_NUMBER_RTC_⟦k⟧,
#else
    .⟦name⟧= FSP_INVALID_VECTOR,
#endif"####;
pub const T_RTC_INSTANCE: &str = r####"rtc_instance_ctrl_t ⟦t.name⟧_ctrl;
const rtc_error_adjustment_cfg_t ⟦t.name⟧_err_cfg =
{
    .adjustment_mode         = RTC_ERROR_ADJUSTMENT_MODE_AUTOMATIC,
    .adjustment_period       = RTC_ERROR_ADJUSTMENT_PERIOD_10_SECOND,
    .adjustment_type         = RTC_ERROR_ADJUSTMENT_NONE,
    .adjustment_value        = 0,
};
const rtc_extended_cfg_t ⟦t.name⟧_cfg_extend =
{
    .alarm1_ipl              = (BSP_IRQ_DISABLED),
    .alarm1_irq              = FSP_INVALID_VECTOR,
};
const rtc_cfg_t ⟦t.name⟧_cfg =
{
    .clock_source            = ⟦#0⟧,
    .freq_compare_value      = ⟦t.freqCompare⟧,
    .p_err_cfg               = &⟦t.name⟧_err_cfg,
    .p_callback              = ⟦#1⟧,
    .p_context               = NULL,
    .p_extend                = &⟦t.name⟧_cfg_extend,
    .alarm_ipl               = ⟦#2⟧,
    .periodic_ipl            = ⟦#3⟧,
    .carry_ipl               = ⟦#4⟧,
⟦#5⟧
⟦#6⟧
⟦#7⟧
};
/* Instance structure to use this module. */
const rtc_instance_t ⟦t.name⟧ =
{
    .p_ctrl        = &⟦t.name⟧_ctrl,
    .p_cfg         = &⟦t.name⟧_cfg,
    .p_api         = &g_rtc_on_rtc
};"####;
pub const T_FLASH_DECL_2: &str = r####"
#ifndef ⟦t.callback⟧
void ⟦t.callback⟧(flash_callback_args_t * p_args);
#endif"####;
pub const T_FLASH_DECL: &str = r####"/* Flash on Flash HP Instance */
extern const flash_instance_t ⟦t.name⟧;
/** Access the Flash HP instance using these structures when calling API functions directly (::p_api is not used). */
extern flash_hp_instance_ctrl_t ⟦t.name⟧_ctrl;
extern const flash_cfg_t ⟦t.name⟧_cfg;⟦#0⟧"####;
pub const T_FLASH_INSTANCE_V: &str = r####"#if defined(VECTOR_NUMBER_FCU_⟦k⟧)
    .⟦name⟧= VECTOR_NUMBER_FCU_⟦k⟧,
#else
    .⟦name⟧= FSP_INVALID_VECTOR,
#endif"####;
pub const T_FLASH_INSTANCE: &str = r####"flash_hp_instance_ctrl_t ⟦t.name⟧_ctrl;
const flash_cfg_t ⟦t.name⟧_cfg =
{
    .data_flash_bgo      = ⟦#0⟧,
    .p_callback          = ⟦#1⟧,
    .p_context           = NULL,
⟦#2⟧
⟦#3⟧
    .err_ipl             = ⟦#4⟧,
    .ipl                 = ⟦#5⟧,
};
/* Instance structure to use this module. */
const flash_instance_t ⟦t.name⟧ =
{
    .p_ctrl        = &⟦t.name⟧_ctrl,
    .p_cfg         = &⟦t.name⟧_cfg,
    .p_api         = &g_flash_on_flash_hp
};"####;
pub const T_LPM_DECL: &str = r####"/** lpm Instance */
extern const lpm_instance_t ⟦t.name⟧;
/** Access the LPM instance using these structures when calling API functions directly (::p_api is not used). */
extern lpm_instance_ctrl_t ⟦t.name⟧_ctrl;
extern const lpm_cfg_t ⟦t.name⟧_cfg;"####;
pub const T_LPM_INSTANCE: &str = r####"lpm_instance_ctrl_t ⟦t.name⟧_ctrl;
const lpm_cfg_t ⟦t.name⟧_cfg =
{
    .low_power_mode             = LPM_MODE_⟦t.mode⟧,
    .standby_wake_sources       = ⟦#0⟧,
#if BSP_FEATURE_LPM_HAS_SNOOZE
    .snooze_cancel_sources      = LPM_SNOOZE_CANCEL_SOURCE_NONE,
    .snooze_request_source      = LPM_SNOOZE_REQUEST_RXD0_FALLING,
    .snooze_end_sources         = (lpm_snooze_end_t) 0,
    .dtc_state_in_snooze        = LPM_SNOOZE_DTC_DISABLE,
#endif
#if BSP_FEATURE_LPM_HAS_SBYCR_OPE
    .output_port_enable         = LPM_OUTPUT_PORT_ENABLE_RETAIN,
#endif
#if BSP_FEATURE_LPM_HAS_DEEP_STANDBY
    .io_port_state              = ⟦#1⟧,
    .power_supply_state         = LPM_POWER_SUPPLY_⟦t.power⟧,
    .deep_standby_cancel_source = ⟦#2⟧,
    .deep_standby_cancel_edge   = ⟦#3⟧,
#endif
    .p_extend                   = NULL,
};
/* Instance structure to use this module. */
const lpm_instance_t ⟦t.name⟧ =
{
    .p_api         = &g_lpm_on_lpm,
    .p_ctrl        = &⟦t.name⟧_ctrl,
    .p_cfg         = &⟦t.name⟧_cfg
};"####;
pub const T_ELC_DECL: &str = r####"/** ELC Instance */
extern const elc_instance_t g_elc;
/** Access the ELC instance using these structures when calling API functions directly (::p_api is not used). */
extern elc_instance_ctrl_t g_elc_ctrl;
extern const elc_cfg_t g_elc_cfg;"####;
pub const T_ELC_INSTANCE: &str = r####"elc_instance_ctrl_t g_elc_ctrl;
extern const elc_cfg_t g_elc_cfg;
const elc_instance_t g_elc =
{
    .p_ctrl = &g_elc_ctrl,
    .p_api  = &g_elc_on_elc,
    .p_cfg  = &g_elc_cfg
};"####;
pub const T_ELC_DATA: &str = r####"#include "r_elc_api.h"
const elc_cfg_t g_elc_cfg = {
⟦#0⟧
};
"####;
pub const T_TRANSFER_INFO: &str = r####"transfer_info_t ⟦t.name⟧_info⟦#0⟧ =
{
    .transfer_settings_word_b.dest_addr_mode = TRANSFER_ADDR_MODE_⟦m.destMode⟧,
    .transfer_settings_word_b.repeat_area    = TRANSFER_REPEAT_AREA_⟦m.repeatArea⟧,
    .transfer_settings_word_b.irq            = TRANSFER_IRQ_⟦m.irq⟧,
    .transfer_settings_word_b.chain_mode     = TRANSFER_CHAIN_MODE_DISABLED,
    .transfer_settings_word_b.src_addr_mode  = TRANSFER_ADDR_MODE_⟦m.srcMode⟧,
    .transfer_settings_word_b.size           = ⟦#1⟧,
    .transfer_settings_word_b.mode           = TRANSFER_MODE_⟦m.mode⟧,
    .p_dest                                  = (void *) NULL,
    .p_src                                   = (void const *) NULL,
    .num_blocks                              = ⟦#2⟧,
    .length                                  = ⟦#3⟧,
};"####;
pub const T_TRANSFER_DECL_2: &str = r####"
#ifndef ⟦t.callback⟧
void ⟦t.callback⟧(dmac_callback_args_t * p_args);
#endif"####;
pub const T_TRANSFER_DECL: &str = r####"/* Transfer on ⟦t.driver⟧ Instance. */
extern const transfer_instance_t ⟦t.name⟧;
/** Access the ⟦t.driver⟧ instance using these structures when calling API functions directly (::p_api is not used). */
extern ⟦#0⟧_instance_ctrl_t ⟦t.name⟧_ctrl;
extern const transfer_cfg_t ⟦t.name⟧_cfg;⟦#1⟧"####;
pub const T_TRANSFER_INSTANCE_EXT: &str = r####"const dtc_extended_cfg_t ⟦t.name⟧_cfg_extend =
{
    .activation_source   = VECTOR_NUMBER_⟦t.activation⟧,
};"####;
pub const T_TRANSFER_INSTANCE_EXT_2: &str = r####"const dmac_extended_cfg_t ⟦t.name⟧_extend =
{
    .offset              = 1,
    .src_buffer_size     = 1,
#if defined(VECTOR_NUMBER_DMAC⟦t.channel⟧_INT)
    .irq                 = VECTOR_NUMBER_DMAC⟦t.channel⟧_INT,
#else
    .irq                 = FSP_INVALID_VECTOR,
#endif
    .ipl                 = ⟦#0⟧,
    .channel             = ⟦t.channel⟧,
    .p_callback          = ⟦#1⟧,
    .p_context           = NULL,
    .activation_source   = ⟦#2⟧,
};"####;
pub const T_TRANSFER_INSTANCE: &str = r####"⟦#0⟧_instance_ctrl_t ⟦t.name⟧_ctrl;
⟦#1⟧
⟦ext⟧
const transfer_cfg_t ⟦t.name⟧_cfg =
{
    .p_info              = &⟦t.name⟧_info,
    .p_extend            = &⟦t.name⟧_⟦#2⟧,
};
/* Instance structure to use this module. */
const transfer_instance_t ⟦t.name⟧ =
{
    .p_ctrl        = &⟦t.name⟧_ctrl,
    .p_cfg         = &⟦t.name⟧_cfg,
    .p_api         = &g_transfer_on_⟦#3⟧
};"####;
pub const T_USB_DECL_2: &str = r####"
#ifndef ⟦t.callback⟧
void ⟦t.callback⟧(usb_callback_args_t * p_args);
#endif"####;
pub const T_USB_DECL: &str = r####"/* Basic on USB Instance. */
extern const usb_instance_t ⟦t.name⟧;
/** Access the USB instance using these structures when calling API functions directly (::p_api is not used). */
extern usb_instance_ctrl_t ⟦t.name⟧_ctrl;
extern const usb_cfg_t ⟦t.name⟧_cfg;
extern const usb_descriptor_t g_usb_descriptor;⟦#0⟧"####;
pub const T_USB_INSTANCE_V: &str = r####"#if defined(VECTOR_NUMBER_USBFS_⟦k⟧)
    .⟦#0⟧ = VECTOR_NUMBER_USBFS_⟦k⟧,
#else
    .⟦#1⟧ = FSP_INVALID_VECTOR,
#endif"####;
pub const T_USB_INSTANCE: &str = r####"usb_instance_ctrl_t ⟦t.name⟧_ctrl;
const usb_cfg_t ⟦t.name⟧_cfg =
{
    .usb_mode            = USB_MODE_PERI,
    .usb_speed           = USB_SPEED_FS,
    .module_number       = 0,
    .type                = USB_CLASS_PCDC,
    .p_usb_reg           = (usb_descriptor_t *) &g_usb_descriptor,
    .usb_complience_cb   = NULL,
⟦#0⟧
⟦#1⟧
    .irq_d0              = FSP_INVALID_VECTOR,
    .irq_d1              = FSP_INVALID_VECTOR,
    .hsirq               = FSP_INVALID_VECTOR,
    .hsirq_d0            = FSP_INVALID_VECTOR,
    .hsirq_d1            = FSP_INVALID_VECTOR,
    .ipl                 = (⟦t.priority⟧),
    .ipl_r               = (⟦t.resumePriority⟧),
    .ipl_d0              = (BSP_IRQ_DISABLED),
    .ipl_d1              = (BSP_IRQ_DISABLED),
    .hsipl               = (BSP_IRQ_DISABLED),
    .hsipl_d0            = (BSP_IRQ_DISABLED),
    .hsipl_d1            = (BSP_IRQ_DISABLED),
    .p_usb_apl_callback  = ⟦#2⟧,
    .p_context           = NULL,
    .p_transfer_tx       = NULL,
    .p_transfer_rx       = NULL,
    .p_extend            = NULL,
};
/* Instance structure to use this module. */
const usb_instance_t ⟦t.name⟧ =
{
    .p_ctrl        = &⟦t.name⟧_ctrl,
    .p_cfg         = &⟦t.name⟧_cfg,
    .p_api         = &g_usb_on_usb
};"####;
pub const T_CAN_DECL: &str = r####"/** CAN on CAN Instance. */
extern const can_instance_t ⟦t.name⟧;
/** Access the CAN instance using these structures when calling API functions directly (::p_api is not used). */
extern can_instance_ctrl_t ⟦t.name⟧_ctrl;
extern const can_cfg_t ⟦t.name⟧_cfg;
extern const can_extended_cfg_t ⟦t.name⟧_extended_cfg;
#ifndef ⟦t.callback⟧
void ⟦t.callback⟧(can_callback_args_t * p_args);
#endif"####;
pub const T_CAN_INSTANCE_V: &str = r####"#if defined(VECTOR_NUMBER_CAN0_⟦k⟧)
    .⟦#0⟧ = VECTOR_NUMBER_CAN0_⟦k⟧,
#else
    .⟦#1⟧ = FSP_INVALID_VECTOR,
#endif"####;
pub const T_CAN_INSTANCE_MB: &str = r####"    { .mailbox_id = ⟦#0⟧, .id_mode = ⟦idMode⟧, .frame_type = CAN_FRAME_TYPE_DATA, .mailbox_type = ⟦#1⟧ }, /* MB⟦i⟧ */"####;
pub const T_CAN_INSTANCE: &str = r####"can_instance_ctrl_t ⟦t.name⟧_ctrl;
can_bit_timing_cfg_t ⟦t.name⟧_bit_timing_cfg =
{
    .baud_rate_prescaler        = ⟦t.timing.brp⟧,
    .time_segment_1             = ⟦t.timing.tseg1⟧,
    .time_segment_2             = ⟦t.timing.tseg2⟧,
    .synchronization_jump_width = ⟦t.timing.sjw⟧
};
uint32_t ⟦t.name⟧_mailbox_mask[8] =
{
    ⟦#0⟧, 0x1FFFFFFF, 0x1FFFFFFF, 0x1FFFFFFF, 0x1FFFFFFF, 0x1FFFFFFF, 0x1FFFFFFF, 0x1FFFFFFF
};
can_mailbox_t ⟦t.name⟧_mailbox[32] =
{
⟦#1⟧
};
const can_extended_cfg_t ⟦t.name⟧_extended_cfg =
{
    .clock_source   = CAN_CLOCK_SOURCE_PCLKB,
    .p_mailbox_mask = ⟦t.name⟧_mailbox_mask,
    .p_mailbox      = ⟦t.name⟧_mailbox,
    .global_id_mode = ⟦#2⟧,
    .mailbox_count  = 4,
    .message_mode   = CAN_MESSAGE_MODE_OVERWRITE,
    .p_fifo_int_cfg = NULL,
    .p_rx_fifo_cfg  = NULL,
};
const can_cfg_t ⟦t.name⟧_cfg =
{
    .channel      = 0,
    .p_bit_timing = &⟦t.name⟧_bit_timing_cfg,
    .p_callback   = ⟦t.callback⟧,
    .p_context    = NULL,
    .p_extend     = &⟦t.name⟧_extended_cfg,
    .ipl          = (⟦t.priority⟧),
⟦#3⟧
⟦#4⟧
⟦#5⟧
};
/* Instance structure to use this module. */
const can_instance_t ⟦t.name⟧ =
{
    .p_ctrl = &⟦t.name⟧_ctrl,
    .p_cfg  = &⟦t.name⟧_cfg,
    .p_api  = &g_can_on_can
};"####;
pub const T_OFS_CFG: &str = r####"#ifndef BSP_MCU_OFS_CFG_H_
#define BSP_MCU_OFS_CFG_H_
/* OFS0: IWDT ⟦#0⟧, WDT ⟦#1⟧; the other fields erased (1). */
#define BSP_CFG_OPTION_SETTING_OFS0 (⟦#2⟧UL)
#endif /* BSP_MCU_OFS_CFG_H_ */
"####;
pub const T_SPI_DECL: &str = r####"/** SPI on ⟦kind⟧ Instance. */
extern const spi_instance_t ⟦t.name⟧;
/** Access the SPI instance using these structures when calling API functions directly (::p_api is not used). */
extern ⟦ctrl⟧ ⟦t.name⟧_ctrl;
extern const spi_cfg_t ⟦t.name⟧_cfg;
/** Callback used by SPI Instance. */
#ifndef ⟦t.callback⟧
void ⟦t.callback⟧(spi_callback_args_t * p_args);
#endif"####;
pub const T_SPI_CFG_V: &str = r####"#if defined(VECTOR_NUMBER_⟦event⟧⟦t.channel⟧_⟦k⟧)
    .⟦#0⟧_irq             = VECTOR_NUMBER_⟦event⟧⟦t.channel⟧_⟦k⟧,
#else
    .⟦#1⟧_irq             = FSP_INVALID_VECTOR,
#endif"####;
pub const T_SPI_CFG: &str = r####"const spi_cfg_t ⟦t.name⟧_cfg =
{
    .channel             = ⟦t.channel⟧,
⟦#0⟧
    .rxi_ipl             = (⟦t.priority⟧),
    .txi_ipl             = (⟦t.priority⟧),
    .tei_ipl             = (⟦t.priority⟧),
    .eri_ipl             = (⟦t.priority⟧),
    .operating_mode      = SPI_MODE_MASTER,
    .clk_phase           = ⟦#1⟧,
    .clk_polarity        = ⟦#2⟧,
    .mode_fault          = SPI_MODE_FAULT_ERROR_DISABLE,
    .bit_order           = ⟦#3⟧,
    .p_transfer_tx       = NULL,
    .p_transfer_rx       = NULL,
    .p_callback          = ⟦t.callback⟧,
    .p_context           = NULL,
    .p_extend            = (void *) &⟦ext⟧,
};
/* Instance structure to use this module. */
const spi_instance_t ⟦t.name⟧ =
{
    .p_ctrl        = &⟦t.name⟧_ctrl,
    .p_cfg         = &⟦t.name⟧_cfg,
    .p_api         = &g_spi_on_⟦#4⟧
};"####;
pub const T_SPI_INSTANCE: &str = r####"spi_instance_ctrl_t ⟦t.name⟧_ctrl;
/** SPI extended configuration for SPI HAL driver */
const spi_extended_cfg_t ⟦t.name⟧_ext_cfg =
{
    .spi_clksyn          = ⟦#0⟧,
    .spi_comm            = SPI_COMMUNICATION_FULL_DUPLEX,
    .ssl_polarity        = SPI_SSLP_LOW,
    .ssl_select          = SPI_SSL_SELECT_SSL0,
    .mosi_idle           = SPI_MOSI_IDLE_VALUE_FIXING_DISABLE,
    .parity              = SPI_PARITY_MODE_DISABLE,
    .byte_swap           = SPI_BYTE_SWAP_DISABLE,
    .spck_div            = {
        /* Actual calculated bitrate: ⟦#1⟧. */ .spbr = ⟦t.div.spbr⟧, .brdv = ⟦t.div.brdv⟧
    },
    .spck_delay          = SPI_DELAY_COUNT_1,
    .ssl_negation_delay  = SPI_DELAY_COUNT_1,
    .next_access_delay   = SPI_DELAY_COUNT_1,
    .burst_interframe_delay = SPI_BURST_TRANSFER_WITH_DELAY,
};
/** SPI configuration for SPI HAL driver */
⟦#2⟧"####;
pub const T_SCI_SPI_INSTANCE: &str = r####"sci_spi_instance_ctrl_t ⟦t.name⟧_ctrl;
/** SPI extended configuration for SCI SPI HAL driver */
const sci_spi_extended_cfg_t ⟦t.name⟧_cfg_extend =
{
    .clk_div = {
        /* Actual calculated bitrate: ⟦#0⟧. */ .cks = ⟦t.div.cks⟧, .brr = ⟦t.div.brr⟧, .mddr = 0,
    },
};
/** SPI configuration for SCI SPI HAL driver */
⟦#1⟧"####;
pub const T_GPT_DECL_2: &str = r####"#ifndef ⟦t.callback⟧
void ⟦t.callback⟧(timer_callback_args_t * p_args);
#endif"####;
pub const T_GPT_DECL: &str = r####"/** Timer on GPT Instance. */
extern const timer_instance_t ⟦t.name⟧;
/** Access the GPT instance using these structures when calling API functions directly (::p_api is not used). */
extern gpt_instance_ctrl_t ⟦t.name⟧_ctrl;
extern const timer_cfg_t ⟦t.name⟧_cfg;
⟦#0⟧"####;
pub const T_GPT_INSTANCE_V: &str = r####"#if defined(VECTOR_NUMBER_GPT⟦t.channel⟧_⟦k⟧)
    .⟦name⟧ = VECTOR_NUMBER_GPT⟦t.channel⟧_⟦k⟧,
#else
    .⟦name⟧ = FSP_INVALID_VECTOR,
#endif"####;
pub const T_GPT_INSTANCE: &str = r####"gpt_instance_ctrl_t ⟦t.name⟧_ctrl;
const gpt_extended_cfg_t ⟦t.name⟧_extend =
{
    .gtioca = { .output_enabled = ⟦#0⟧, .stop_level = GPT_PIN_LEVEL_LOW },
    .gtiocb = { .output_enabled = ⟦#1⟧, .stop_level = GPT_PIN_LEVEL_LOW },
    .start_source        = (gpt_source_t) (GPT_SOURCE_NONE),
    .stop_source         = (gpt_source_t) (GPT_SOURCE_NONE),
    .clear_source        = (gpt_source_t) (GPT_SOURCE_NONE),
    .count_up_source     = (gpt_source_t) (GPT_SOURCE_NONE),
    .count_down_source   = (gpt_source_t) (GPT_SOURCE_NONE),
    .capture_a_source    = (gpt_source_t) (GPT_SOURCE_NONE),
    .capture_b_source    = (gpt_source_t) (GPT_SOURCE_NONE),
    .capture_a_ipl       = (BSP_IRQ_DISABLED),
    .capture_b_ipl       = (BSP_IRQ_DISABLED),
    .compare_match_c_ipl = (BSP_IRQ_DISABLED),
    .compare_match_d_ipl = (BSP_IRQ_DISABLED),
    .compare_match_e_ipl = (BSP_IRQ_DISABLED),
    .compare_match_f_ipl = (BSP_IRQ_DISABLED),
⟦#2⟧
    .compare_match_value = { (uint32_t) 0x0, /* CMP_A */ (uint32_t) 0x0, /* CMP_B */ (uint32_t) 0x0, /* CMP_C */ (uint32_t) 0x0, /* CMP_E */ (uint32_t) 0x0, /* CMP_D */ (uint32_t) 0x0 /* CMP_F */ },
    .compare_match_status = ((0U << 5U) | (0U << 4U) | (0U << 3U) | (0U << 2U) | (0U << 1U) | 0U),
    .capture_filter_gtioca = GPT_CAPTURE_FILTER_NONE,
    .capture_filter_gtiocb = GPT_CAPTURE_FILTER_NONE,
    .p_pwm_cfg           = NULL,
    .gtior_setting.gtior = (0x0U),
    .gtioca_polarity     = GPT_GTIOC_POLARITY_NORMAL,
    .gtiocb_polarity     = GPT_GTIOC_POLARITY_NORMAL,
};
const timer_cfg_t ⟦t.name⟧_cfg =
{
    .mode                = ⟦#3⟧,
    /* Actual period: ⟦t.period⟧ ⟦#4⟧. Actual duty: ⟦t.duty⟧%. */ .period_counts = (uint32_t) ⟦#5⟧, .duty_cycle_counts = ⟦#6⟧, .source_div = (timer_source_div_t) ⟦t.counts.div⟧,
    .channel             = ⟦t.channel⟧,
    .p_callback          = ⟦#7⟧,
    .p_context           = NULL,
    .p_extend            = &⟦t.name⟧_extend,
    .cycle_end_ipl       = ⟦#8⟧,
⟦#9⟧
};
/* Instance structure to use this module. */
const timer_instance_t ⟦t.name⟧ =
{
    .p_ctrl        = &⟦t.name⟧_ctrl,
    .p_cfg         = &⟦t.name⟧_cfg,
    .p_api         = &g_timer_on_gpt
};"####;
pub const T_CLOCK_CFG_2: &str = r####"#define BSP_CFG_PLL2_SOURCE (BSP_CLOCKS_SOURCE_CLOCK_HOCO) /* PLL2 Src: HOCO */
#define BSP_CFG_PLL2_DIV (⟦#0⟧) /* PLL2 Div /⟦usb.pllDiv⟧ */
#define BSP_CFG_PLL2_MUL BSP_CLOCKS_PLL_MUL(⟦usb.pllMul⟧,0) /* PLL2 Mul x⟦usb.pllMul⟧.0 */"####;
pub const T_CLOCK_CFG_3: &str = r####"#define BSP_CFG_PLL2_SOURCE (BSP_CLOCKS_CLOCK_DISABLED) /* PLL2 Disabled */
#define BSP_CFG_PLL2_DIV (BSP_CLOCKS_PLL_DIV_2) /* PLL2 Div /2 */
#define BSP_CFG_PLL2_MUL BSP_CLOCKS_PLL_MUL(20,0) /* PLL2 Mul x20.0 */"####;
pub const T_CLOCK_CFG_4: &str = r####"
#define BSP_CLOCK_CFG_SUBCLOCK_POPULATED (1) /* RTC on the sub-clock: X2 32.768 kHz (FPB-RA6E1: E25/E26 must be closed) */
#define BSP_CLOCK_CFG_SUBCLOCK_DRIVE (0) /* Standard/Normal mode */
#define BSP_CLOCK_CFG_SUBCLOCK_STABILIZATION_MS (1000)"####;
pub const T_CLOCK_CFG: &str = r####"#ifndef BSP_CLOCK_CFG_H_
#define BSP_CLOCK_CFG_H_
#define BSP_CFG_CLOCKS_SECURE (0)
#define BSP_CFG_CLOCKS_OVERRIDE (0)
#define BSP_CFG_XTAL_HZ (⟦c.xtalHz⟧) /* XTAL ⟦c.xtalHz⟧Hz */
#define BSP_CFG_HOCO_FREQUENCY (⟦#0⟧) /* HOCO ⟦c.hocoMHz⟧MHz */
#define BSP_CFG_PLL_SOURCE (BSP_CLOCKS_SOURCE_CLOCK_HOCO) /* PLL Src: HOCO */
#define BSP_CFG_PLL_DIV (BSP_CLOCKS_PLL_DIV_⟦c.pllDiv⟧) /* PLL Div /⟦c.pllDiv⟧ */
#define BSP_CFG_PLL_MUL BSP_CLOCKS_PLL_MUL(⟦c.pllMul⟧,0) /* PLL Mul x⟦c.pllMul⟧.0 */
⟦#1⟧
#define BSP_CFG_CLOCK_SOURCE (BSP_CLOCKS_SOURCE_CLOCK_PLL) /* Clock Src: PLL */
#define BSP_CFG_CLKOUT_SOURCE (BSP_CLOCKS_CLOCK_DISABLED) /* CLKOUT Disabled */
⟦#2⟧
#define BSP_CFG_OCTACLK_SOURCE (BSP_CLOCKS_CLOCK_DISABLED) /* OCTASPICLK Disabled */
#define BSP_CFG_CANFDCLK_SOURCE (BSP_CLOCKS_CLOCK_DISABLED) /* CANFDCLK Disabled */
#define BSP_CFG_ICLK_DIV (BSP_CLOCKS_SYS_CLOCK_DIV_⟦c.iclkDiv⟧) /* ICLK Div /⟦c.iclkDiv⟧ */
#define BSP_CFG_PCLKA_DIV (BSP_CLOCKS_SYS_CLOCK_DIV_⟦c.pclkaDiv⟧) /* PCLKA Div /⟦c.pclkaDiv⟧ */
#define BSP_CFG_PCLKB_DIV (BSP_CLOCKS_SYS_CLOCK_DIV_⟦c.pclkbDiv⟧) /* PCLKB Div /⟦c.pclkbDiv⟧ */
#define BSP_CFG_PCLKC_DIV (BSP_CLOCKS_SYS_CLOCK_DIV_⟦c.pclkcDiv⟧) /* PCLKC Div /⟦c.pclkcDiv⟧ */
#define BSP_CFG_PCLKD_DIV (BSP_CLOCKS_SYS_CLOCK_DIV_⟦c.pclkdDiv⟧) /* PCLKD Div /⟦c.pclkdDiv⟧ */
#define BSP_CFG_BCLK_DIV (BSP_CLOCKS_SYS_CLOCK_DIV_2) /* BCLK Div /2 */
#define BSP_CFG_BCLK_OUTPUT (0) /* EBCLK Disabled */
#define BSP_CFG_FCLK_DIV (BSP_CLOCKS_SYS_CLOCK_DIV_⟦c.fclkDiv⟧) /* FCLK Div /⟦c.fclkDiv⟧ */
#define BSP_CFG_CLKOUT_DIV (BSP_CLOCKS_SYS_CLOCK_DIV_1) /* CLKOUT Div /1 */
#define BSP_CFG_UCLK_DIV (BSP_CLOCKS_USB_CLOCK_DIV_⟦#3⟧) /* UCLK Div /⟦#4⟧ */
#define BSP_CFG_OCTACLK_DIV (BSP_CLOCKS_OCTA_CLOCK_DIV_1) /* OCTASPICLK Div /1 */
#define BSP_CFG_CANFDCLK_DIV (BSP_CLOCKS_CANFD_CLOCK_DIV_6) /* CANFDCLK Div /6 */⟦#5⟧
#endif /* BSP_CLOCK_CFG_H_ */
"####;
pub const T_FAMILY_CFG: &str = r####"#ifndef BSP_MCU_FAMILY_CFG_H_
#define BSP_MCU_FAMILY_CFG_H_
#ifdef __cplusplus
extern "C" {
#endif
#include "bsp_mcu_device_pn_cfg.h"
#include "bsp_mcu_device_cfg.h"
#include "bsp_mcu_info.h"
#include "bsp_clock_cfg.h"
#define BSP_MCU_GROUP_⟦fam.group⟧ (1)
#define BSP_LOCO_HZ                 (32768)
#define BSP_MOCO_HZ                 (8000000)
#define BSP_SUB_CLOCK_HZ            (32768)
#if   BSP_CFG_HOCO_FREQUENCY == 0
#define BSP_HOCO_HZ                 (16000000)
#elif BSP_CFG_HOCO_FREQUENCY == 1
#define BSP_HOCO_HZ                 (18000000)
#elif BSP_CFG_HOCO_FREQUENCY == 2
#define BSP_HOCO_HZ                 (20000000)
#else
#error "Invalid HOCO frequency chosen (BSP_CFG_HOCO_FREQUENCY) in bsp_clock_cfg.h"
#endif
#define BSP_CFG_FLL_ENABLE                 (0)
#define BSP_CORTEX_VECTOR_TABLE_ENTRIES    (16U)
#define BSP_VECTOR_TABLE_MAX_ENTRIES       (⟦#0⟧U)
#define BSP_CFG_INLINE_IRQ_FUNCTIONS       (1)
#if defined(_RA_TZ_SECURE)
#define BSP_TZ_SECURE_BUILD           (1)
#define BSP_TZ_NONSECURE_BUILD        (0)
#elif defined(_RA_TZ_NONSECURE)
#define BSP_TZ_SECURE_BUILD           (0)
#define BSP_TZ_NONSECURE_BUILD        (1)
#else
#define BSP_TZ_SECURE_BUILD           (0)
#define BSP_TZ_NONSECURE_BUILD        (0)
#endif
#define BSP_TZ_CFG_INIT_SECURE_ONLY       (BSP_CFG_CLOCKS_SECURE || (!BSP_CFG_CLOCKS_OVERRIDE))
#define BSP_TZ_CFG_SKIP_INIT              (BSP_TZ_NONSECURE_BUILD && BSP_TZ_CFG_INIT_SECURE_ONLY)
#define BSP_TZ_CFG_EXCEPTION_RESPONSE     (0)
#define SCB_CSR_AIRCR_INIT                (1)
#define SCB_AIRCR_BFHFNMINS_VAL           (0)
#define SCB_AIRCR_SYSRESETREQS_VAL        (1)
#define SCB_AIRCR_PRIS_VAL                (0)
#define TZ_FPU_NS_USAGE                   (1)
#ifndef SCB_NSACR_CP10_11_VAL
#define SCB_NSACR_CP10_11_VAL             (3U)
#endif
#ifndef FPU_FPCCR_TS_VAL
#define FPU_FPCCR_TS_VAL                  (1U)
#endif
#define FPU_FPCCR_CLRONRETS_VAL           (1)
#ifndef FPU_FPCCR_CLRONRET_VAL
#define FPU_FPCCR_CLRONRET_VAL            (1)
#endif
#ifndef BSP_CFG_C_CACHE_LINE_SIZE
#define BSP_CFG_C_CACHE_LINE_SIZE   (1U)
#endif
/* A flat (non-TrustZone) project: every peripheral, the CGC and the other security attribution registers stay
 * Non-secure accessible (reset values). */
#define BSP_TZ_CFG_PSARB (0xFFFFFFFFU)
#define BSP_TZ_CFG_PSARC (0xFFFFFFFFU)
#define BSP_TZ_CFG_PSARD (0xFFFFFFFFU)
#define BSP_TZ_CFG_PSARE (0xFFFFFFFFU)
#define BSP_TZ_CFG_MSSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_CSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_RSTSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_LVDSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_LPMSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_DPFSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_CGFSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_BBFSAR (0x00FFFFFF)
#define BSP_TZ_CFG_ICUSARA (0xFFFFFFFFU)
#define BSP_TZ_CFG_ICUSARB (0xFFFFFFFFU)
#define BSP_TZ_CFG_ICUSARC (0xFFFFFFFFU)
#define BSP_TZ_CFG_ICUSARD (0xFFFFFFFFU)
#define BSP_TZ_CFG_ICUSARE (0xFFFFFFFFU)
#define BSP_TZ_CFG_ICUSARF (0xFFFFFFFFU)
#define BSP_TZ_CFG_FSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_SRAMSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_STBRAMSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_DTCSTSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_DMACSAR (0xFFFFFFFFU)
#define BSP_TZ_CFG_ICUSARG (0xFFFFFFFFU)
#define BSP_TZ_CFG_ICUSARH (0xFFFFFFFFU)
#define BSP_TZ_CFG_ICUSARI (0xFFFFFFFFU)
#define BSP_TZ_CFG_ELCSARA (0xFFFFFFFFU)
#define BSP_TZ_CFG_SAU_ENABLE (0)
#define BSP_CFG_MPU_ENABLE (0)
#define BSP_CFG_ROM_REG_OFS0 (0xFFFFFFFF)
#define BSP_CFG_ROM_REG_DUALSEL (0xFFFFFFFF)
#define BSP_CFG_ROM_REG_OFS1 (0xFFFFFFFF)
#define BSP_CFG_ROM_REG_BPS0 (0xFFFFFFFF)
#define BSP_CFG_DCACHE_ENABLED (0)
#define BSP_CFG_SOFT_RESET_SUPPORTED (0)
#define BSP_CLOCK_CFG_MAIN_OSC_POPULATED_DEFAULT (0)
#ifdef __cplusplus
}
#endif
#endif /* BSP_MCU_FAMILY_CFG_H_ */
"####;
pub const T_BSP_CFG: &str = r####"#ifndef BSP_CFG_H_
#define BSP_CFG_H_
#ifdef __cplusplus
extern "C" {
#endif
#include "bsp_clock_cfg.h"
#include "bsp_mcu_family_cfg.h"
#include "bsp_mcu_ofs_cfg.h"
#include "board_cfg.h"
#include "vector_data.h"
#ifndef BSP_CFG_RTOS
#define BSP_CFG_RTOS (0)
#endif
#ifndef BSP_CFG_RTC_USED
#define BSP_CFG_RTC_USED (⟦#0⟧)
#endif
#define BSP_CFG_MCU_VCC_MV (3300)
#define BSP_CFG_STACK_MAIN_BYTES (0x⟦#1⟧)
#define BSP_CFG_HEAP_BYTES (0x⟦#2⟧)
#define BSP_CFG_PARAM_CHECKING_ENABLE (1)
#define BSP_CFG_ASSERT (0)
#define BSP_CFG_ERROR_LOG (0)
#define BSP_CFG_PFS_PROTECT ((1))
#define BSP_CFG_C_RUNTIME_INIT ((1))
#define BSP_CFG_EARLY_INIT     ((0))
#define BSP_CFG_STARTUP_CLOCK_REG_NOT_RESET ((0))
#ifndef BSP_CLOCK_CFG_MAIN_OSC_POPULATED
#define BSP_CLOCK_CFG_MAIN_OSC_POPULATED (0)
#endif
#ifndef BSP_CLOCK_CFG_MAIN_OSC_CLOCK_SOURCE
#define BSP_CLOCK_CFG_MAIN_OSC_CLOCK_SOURCE (0)
#endif
#ifndef BSP_CLOCK_CFG_SUBCLOCK_DRIVE
#define BSP_CLOCK_CFG_SUBCLOCK_DRIVE (0)
#endif
#ifndef BSP_CLOCK_CFG_SUBCLOCK_POPULATED
#define BSP_CLOCK_CFG_SUBCLOCK_POPULATED (0) /* FPB-RA6E1: the 32.768 kHz crystal X2 is fitted but E25/E26 are open (XCIN/XCOUT go to J3) */
#endif
#ifndef BSP_CLOCK_CFG_SUBCLOCK_STABILIZATION_MS
#define BSP_CLOCK_CFG_SUBCLOCK_STABILIZATION_MS 1000
#endif
#ifdef __cplusplus
}
#endif
#endif /* BSP_CFG_H_ */
"####;
pub const T_PIN_CFG_H: &str = r####"#ifndef BSP_PIN_CFG_H_
#define BSP_PIN_CFG_H_
#include "r_ioport.h"
FSP_HEADER
⟦#0⟧⟦#1⟧extern const ioport_cfg_t g_bsp_pin_cfg; /* R7FA6E10F2CFP.pincfg */
void BSP_PinConfigSecurityInit();
FSP_FOOTER
#endif /* BSP_PIN_CFG_H_ */
"####;
pub const T_PIN_DATA_2: &str = r####"    {
        .pin = ⟦#0⟧,
        .pin_cfg = ⟦#1⟧
    },"####;
pub const T_PIN_DATA: &str = r####"#include "bsp_api.h"
#include "r_ioport.h"
const ioport_pin_cfg_t g_bsp_pin_cfg_data[] = {
⟦#0⟧
};
const ioport_cfg_t g_bsp_pin_cfg = {
    .number_of_pins = sizeof(g_bsp_pin_cfg_data)/sizeof(ioport_pin_cfg_t),
    .p_pin_cfg_data = &g_bsp_pin_cfg_data[0],
};
#if BSP_TZ_SECURE_BUILD
void R_BSP_PinCfgSecurityInit(void);
void R_BSP_PinCfgSecurityInit(void)
{
}
#endif
"####;
pub const T_VECTOR_H_2: &str = r####"#define VECTOR_NUMBER_⟦v.vector⟧ ((IRQn_Type) ⟦v.index⟧) /* ⟦v.label⟧ */
#define ⟦v.vector⟧_IRQn          ((IRQn_Type) ⟦v.index⟧) /* ⟦v.label⟧ */"####;
pub const T_VECTOR_H: &str = r####"#ifndef VECTOR_DATA_H
#define VECTOR_DATA_H
#ifdef __cplusplus
extern "C" {
#endif
/* Number of interrupts allocated */
#ifndef VECTOR_DATA_IRQ_COUNT
#define VECTOR_DATA_IRQ_COUNT    (⟦vectors.length⟧)
#endif
/* Number of ICU vector table entries the application uses (FSP 6). At least 1: with no interrupt at all, FSP's own
 * default tables (bsp_irq.c) would be arrays of 0 elements with an initializer — a build warning. */
#define BSP_ICU_VECTOR_NUM_ENTRIES (⟦#0⟧)
/* ISR prototypes */
⟦#1⟧
/* Vector table allocations */
⟦#2⟧
#ifdef __cplusplus
}
#endif
#endif /* VECTOR_DATA_H */
"####;
pub const T_VECTOR_C: &str = r####"#include "bsp_api.h"
/* Do not build these data structures if no interrupts are currently allocated because IAR will have build errors. */
#if VECTOR_DATA_IRQ_COUNT > 0
BSP_DONT_REMOVE const fsp_vector_t g_vector_table[BSP_ICU_VECTOR_NUM_ENTRIES] BSP_PLACE_IN_SECTION(BSP_SECTION_APPLICATION_VECTORS) =
{
⟦#0⟧
};
#if BSP_FEATURE_ICU_HAS_IELSR
const bsp_interrupt_event_t g_interrupt_event_link_select[BSP_ICU_VECTOR_NUM_ENTRIES] =
{
⟦#1⟧
};
#endif
#endif
"####;
pub const T_HAL_DATA_H_INCLUDES: &str = r####"#include "r_⟦w.kind⟧.h"
"####;
pub const T_HAL_DATA_H_DECLS: &str = r####"/** External IRQ on ICU Instance. */
extern const external_irq_instance_t ⟦i.name⟧;
/** Access the ICU instance using these structures when calling API functions directly (::p_api is not used). */
extern icu_instance_ctrl_t ⟦i.name⟧_ctrl;
extern const external_irq_cfg_t ⟦i.name⟧_cfg;
#ifndef ⟦i.callback⟧
void ⟦i.callback⟧(external_irq_callback_args_t * p_args);
#endif"####;
pub const T_HAL_DATA_H_DECLS_2: &str = r####"/** UART on SCI Instance. */
extern const uart_instance_t ⟦u.name⟧;
/** Access the UART instance using these structures when calling API functions directly (::p_api is not used). */
extern sci_uart_instance_ctrl_t ⟦u.name⟧_ctrl;
extern const uart_cfg_t ⟦u.name⟧_cfg;
extern const sci_uart_extended_cfg_t ⟦u.name⟧_cfg_extend;
#ifndef ⟦u.callback⟧
void ⟦u.callback⟧(uart_callback_args_t * p_args);
#endif"####;
pub const T_HAL_DATA_H: &str = r####"#ifndef HAL_DATA_H_
#define HAL_DATA_H_
#include <stdint.h>
#include "bsp_api.h"
#include "common_data.h"
⟦includes⟧FSP_HEADER
⟦decls⟧⟦#0⟧void hal_entry(void);
void g_hal_init(void);
FSP_FOOTER
#endif /* HAL_DATA_H_ */
"####;
pub const T_HAL_DATA_C_BODY: &str = r####"icu_instance_ctrl_t ⟦i.name⟧_ctrl;
const icu_extended_cfg_t ⟦i.name⟧_ext_cfg =
{
    .filter_src = EXTERNAL_IRQ_DIGITAL_FILTER_PCLK_DIV,
};
const external_irq_cfg_t ⟦i.name⟧_cfg =
{
    .channel             = ⟦i.channel⟧,
    .trigger             = ⟦#0⟧,
    .filter_enable       = ⟦#1⟧,
    .clock_source_div    = EXTERNAL_IRQ_CLOCK_SOURCE_DIV_64,
    .p_callback          = ⟦i.callback⟧,
    .p_context           = NULL,
    .p_extend            = (void *)&⟦i.name⟧_ext_cfg,
    .ipl                 = (⟦i.priority⟧),
#if defined(VECTOR_NUMBER_ICU_IRQ⟦i.channel⟧)
    .irq                 = VECTOR_NUMBER_ICU_IRQ⟦i.channel⟧,
#else
    .irq                 = FSP_INVALID_VECTOR,
#endif
};
/* Instance structure to use this module. */
const external_irq_instance_t ⟦i.name⟧ =
{
    .p_ctrl        = &⟦i.name⟧_ctrl,
    .p_cfg         = &⟦i.name⟧_cfg,
    .p_api         = &g_external_irq_on_icu
};"####;
pub const T_HAL_DATA_C_BODY_IRQ: &str = r####"#if defined(VECTOR_NUMBER_SCI⟦u.channel⟧_⟦k⟧)
    .⟦#0⟧_irq             = VECTOR_NUMBER_SCI⟦u.channel⟧_⟦k⟧,
#else
    .⟦#1⟧_irq             = FSP_INVALID_VECTOR,
#endif"####;
pub const T_HAL_DATA_C_BODY_2: &str = r####"sci_uart_instance_ctrl_t ⟦u.name⟧_ctrl;
baud_setting_t ⟦u.name⟧_baud_setting =
{
    /* Baud rate calculated with ⟦#0⟧% error. */ .semr_baudrate_bits_b.abcse = 0, .semr_baudrate_bits_b.abcs = ⟦b.abcs⟧, .semr_baudrate_bits_b.bgdm = ⟦b.bgdm⟧, .cks = ⟦b.cks⟧, .brr = ⟦b.brr⟧, .mddr = (uint8_t) 256, .semr_baudrate_bits_b.brme = false
};
/** UART extended configuration for UARTonSCI HAL driver */
const sci_uart_extended_cfg_t ⟦u.name⟧_cfg_extend =
{
    .clock                = SCI_UART_CLOCK_INT,
    .rx_edge_start        = SCI_UART_START_BIT_FALLING_EDGE,
    .noise_cancel         = SCI_UART_NOISE_CANCELLATION_DISABLE,
    .rx_fifo_trigger      = SCI_UART_RX_FIFO_TRIGGER_MAX,
    .p_baud_setting       = &⟦u.name⟧_baud_setting,
    .flow_control         = SCI_UART_FLOW_CONTROL_RTS,
    .flow_control_pin     = (bsp_io_port_pin_t) UINT16_MAX,
    .rs485_setting = {
        .enable = SCI_UART_RS485_DISABLE,
        .polarity = SCI_UART_RS485_DE_POLARITY_HIGH,
        .de_control_pin = (bsp_io_port_pin_t) UINT16_MAX,
    },
    .irda_setting = {
        .ircr_bits_b.ire = 0,
        .ircr_bits_b.irrxinv = 0,
        .ircr_bits_b.irtxinv = 0,
    },
};
/** UART interface configuration */
const uart_cfg_t ⟦u.name⟧_cfg =
{
    .channel             = ⟦u.channel⟧,
    .data_bits           = UART_DATA_BITS_8,
    .parity              = UART_PARITY_OFF,
    .stop_bits           = UART_STOP_BITS_1,
    .p_callback          = ⟦u.callback⟧,
    .p_context           = NULL,
    .p_extend            = &⟦u.name⟧_cfg_extend,
    .p_transfer_tx       = ⟦#1⟧,
    .p_transfer_rx       = ⟦#2⟧,
    .rxi_ipl             = (⟦u.priority⟧),
    .txi_ipl             = (⟦u.priority⟧),
    .tei_ipl             = (⟦u.priority⟧),
    .eri_ipl             = (⟦u.priority⟧),
⟦#3⟧
};
/* Instance structure to use this module. */
const uart_instance_t ⟦u.name⟧ =
{
    .p_ctrl        = &⟦u.name⟧_ctrl,
    .p_cfg         = &⟦u.name⟧_cfg,
    .p_api         = &g_uart_on_sci
};"####;
pub const T_HAL_DATA_C: &str = r####"#include "hal_data.h"
⟦body⟧⟦#0⟧void g_hal_init(void) {
g_common_init();
}
"####;
pub const T_MEMORY_REGIONS: &str = r####"  /* generated memory regions file - do not edit */
  RAM_START = 0x20000000;
  RAM_LENGTH = ⟦#0⟧;
  FLASH_START = 0x00000000;
  FLASH_LENGTH = ⟦#1⟧;
  DATA_FLASH_START = 0x08000000;
  DATA_FLASH_LENGTH = ⟦#2⟧;
  OPTION_SETTING_START = 0x0100A100;
  OPTION_SETTING_LENGTH = 0x00000200;
"####;
pub const T_FSP_LD: &str = r####"/* Linker script for an RA flat project (generated - do not edit). */
INCLUDE memory_regions.ld
MEMORY
{
  FLASH (rx) : ORIGIN = FLASH_START, LENGTH = FLASH_LENGTH
  RAM (rwx) : ORIGIN = RAM_START, LENGTH = RAM_LENGTH
  DATA_FLASH (rx) : ORIGIN = DATA_FLASH_START, LENGTH = DATA_FLASH_LENGTH
  OPTION_SETTING (r) : ORIGIN = OPTION_SETTING_START, LENGTH = OPTION_SETTING_LENGTH
}
ENTRY(Reset_Handler)
GROUP(libgcc.a libc.a libm.a)
SECTIONS
{
  __flash_vectors$$ :
  {
    __ROM_Start = .;
    __flash_vectors$$Base = .;
    PROVIDE(__Vectors = .);
    KEEP(*(.fixed_vectors*))
    KEEP(*(.application_vectors*))
    __Vectors_End = .;
    __flash_vectors$$Limit = .;
  } > FLASH
  .text :
  {
    *(.text*)
    KEEP(*(.version))
    KEEP(*(.init))
    KEEP(*(.fini))
    *(.rodata*)
    *(.flash_noinit)
    __usb_dev_descriptor_start_fs = .;
    KEEP(*(.usb_device_desc_fs*))
    __usb_descriptor_end_fs = .;
    . = ALIGN(4);
  } > FLASH
  .ARM.extab : { *(.ARM.extab* .gnu.linkonce.armextab.*) } > FLASH
  .ARM.exidx : { __exidx_start = .; *(.ARM.exidx* .gnu.linkonce.armexidx.*) __exidx_end = .; } > FLASH
  .preinit_array : { PROVIDE_HIDDEN(__preinit_array_start = .); KEEP(*(.preinit_array)) PROVIDE_HIDDEN(__preinit_array_end = .); } > FLASH
  .init_array : { PROVIDE_HIDDEN(__init_array_start = .); KEEP(*(SORT(.init_array.*))) KEEP(*(.init_array)) PROVIDE_HIDDEN(__init_array_end = .); } > FLASH
  .fini_array : { PROVIDE_HIDDEN(__fini_array_start = .); KEEP(*(SORT(.fini_array.*))) KEEP(*(.fini_array)) PROVIDE_HIDDEN(__fini_array_end = .); } > FLASH
  __ROM_End = .;
  __ram_noinit$$ (NOLOAD) :
  {
    __ram_noinit$$Base = .;
    *(.ram_noinit*)
    __ram_noinit$$Limit = .;
  } > RAM
  __ram_from_flash$$ : ALIGN(4)
  {
    __ram_from_flash$$Base = .;
    __ram_from_flash$$Load = LOADADDR(__ram_from_flash$$);
    *(.ram_from_flash*)
    *(.ram_code_from_flash*)
    *(.data*)
    . = ALIGN(4);
    __ram_from_flash$$Limit = .;
  } > RAM AT > FLASH
  /* The main stack and the heap are not zeroed by the C runtime init (the stack is in use while it runs). */
  __ram_main_stack$$ (NOLOAD) : ALIGN(8)
  {
    __ram_main_stack$$Base = .;
    *(.bss.g_main_stack)
    __ram_main_stack$$Limit = .;
  } > RAM
  __ram_heap$$ (NOLOAD) : ALIGN(8)
  {
    __HeapBase = .;
    *(.bss.g_heap)
    __HeapLimit = .;
  } > RAM
  __ram_zero$$ (NOLOAD) : ALIGN(4)
  {
    __ram_zero$$Base = .;
    *(.bss*)
    *(COMMON)
    *(.ram*)
    . = ALIGN(4);
    __ram_zero$$Limit = .;
  } > RAM
  /* The DTC vector table (r_dtc_cfg.h DTC_CFG_VECTOR_TABLE_SECTION_NAME): 1 KB aligned, cleared by r_dtc. */
  __ram_dtc_vector$$ (NOLOAD) : ALIGN(1024)
  {
    *(.fsp_dtc_vector_table)
  } > RAM
  __StackLimit = __ram_main_stack$$Base;
  __StackTop = __ram_main_stack$$Limit;
  __data_flash$$ : { __data_flash$$Base = .; KEEP(*(.data_flash*)) __data_flash$$Limit = .; } > DATA_FLASH
  .option_setting : { KEEP(*(.option_setting*)) } > OPTION_SETTING
  end = __HeapBase;
  __end__ = end;
}
"####;
pub const T_LINKER_INFO: &str = r####"/* UNCRUSTIFY-OFF */
#ifndef BSP_LINKER_H
#define BSP_LINKER_H
typedef enum e_bsp_init_mem {
    INIT_MEM_ZERO,
    INIT_MEM_FLASH,
    INIT_MEM_DATA_FLASH,
    INIT_MEM_RAM,
    INIT_MEM_DTCM,
    INIT_MEM_ITCM,
    INIT_MEM_CTCM,
    INIT_MEM_STCM,
    INIT_MEM_OSPI0_CS0,
    INIT_MEM_OSPI0_CS1,
    INIT_MEM_OSPI1_CS0,
    INIT_MEM_OSPI1_CS1,
    INIT_MEM_QSPI_FLASH,
    INIT_MEM_SDRAM,
} bsp_init_mem_t;
typedef struct st_bsp_init_type {
    uint32_t copy_64 :8;
    uint32_t external :8;
    uint32_t source_type :8;
    uint32_t destination_type :8;
} bsp_init_type_t;
typedef struct st_bsp_init_zero_info {
    uint32_t *const p_base;
    uint32_t *const p_limit;
    bsp_init_type_t type;
} bsp_init_zero_info_t;
typedef struct st_bsp_init_copy_info {
    uint32_t *const p_base;
    uint32_t *const p_limit;
    uint32_t *const p_load;
    bsp_init_type_t type;
} bsp_init_copy_info_t;
typedef struct st_bsp_init_info {
    uint32_t zero_count;
    bsp_init_zero_info_t const *const p_zero_list;
    uint32_t copy_count;
    bsp_init_copy_info_t const *const p_copy_list;
} bsp_init_info_t;
extern bsp_init_info_t const g_init_info;
#endif /* BSP_LINKER_H */
#ifdef BSP_LINKER_C
extern uint32_t __ram_zero$$Base;
extern uint32_t __ram_zero$$Limit;
static const bsp_init_zero_info_t zero_list[] =
{
  {.p_base = &__ram_zero$$Base, .p_limit = &__ram_zero$$Limit, .type = {.copy_64 = 0, .external = 0, .source_type = INIT_MEM_ZERO, .destination_type = INIT_MEM_RAM}}
};
extern uint32_t __ram_from_flash$$Base;
extern uint32_t __ram_from_flash$$Limit;
extern uint32_t __ram_from_flash$$Load;
static const bsp_init_copy_info_t copy_list[] =
{
  {.p_base = &__ram_from_flash$$Base, .p_limit = &__ram_from_flash$$Limit, .p_load = &__ram_from_flash$$Load, .type = {.copy_64 = 0, .external = 0, .source_type = INIT_MEM_FLASH, .destination_type = INIT_MEM_RAM}}
};
const bsp_init_info_t g_init_info =
{
    .zero_count  = sizeof(zero_list) / sizeof(zero_list[0]),
    .p_zero_list = zero_list,
    .copy_count  = sizeof(copy_list) / sizeof(copy_list[0]),
    .p_copy_list = copy_list
};
#endif /* BSP_LINKER_C */
/* UNCRUSTIFY-ON */
"####;
pub const T_GENERATE_RA_FILES_MODULE_CFG: &str = r####"#ifndef ⟦guard⟧
#define ⟦guard⟧
#ifdef __cplusplus
extern "C" {
#endif
⟦#0⟧
#ifdef __cplusplus
}
#endif
#endif /* ⟦guard⟧ */
"####;
pub const T_GENERATE_RA_FILES: &str = r####"#ifndef BSP_MCU_DEVICE_CFG_H_
#define BSP_MCU_DEVICE_CFG_H_
#define BSP_CFG_MCU_PART_SERIES (⟦fam.series⟧)
#endif /* BSP_MCU_DEVICE_CFG_H_ */
"####;
pub const T_GENERATE_RA_FILES_2: &str = r####"#ifndef BSP_MCU_DEVICE_PN_CFG_H_
#define BSP_MCU_DEVICE_PN_CFG_H_
#define BSP_MCU_⟦fam.part⟧
#define BSP_MCU_FEATURE_SET ('⟦fam.featureSet⟧')
#define BSP_ROM_SIZE_BYTES (⟦#0⟧)
#define BSP_RAM_SIZE_BYTES (⟦#1⟧)
#define BSP_DATA_FLASH_SIZE_BYTES (⟦#2⟧)
#define BSP_PACKAGE_⟦fam.package⟧
#define BSP_PACKAGE_PINS (⟦fam.pins⟧)
#endif /* BSP_MCU_DEVICE_PN_CFG_H_ */
"####;
pub const T_GENERATE_RA_FILES_3: &str = r####"#ifndef BOARD_CFG_H_
#define BOARD_CFG_H_
#include "⟦#0⟧"
#endif /* BOARD_CFG_H_ */
"####;
pub const T_GENERATE_RA_FILES_4: &str = r####"#ifndef COMMON_DATA_H_
#define COMMON_DATA_H_
#include <stdint.h>
#include "bsp_api.h"
#include "r_ioport.h"
#include "bsp_pin_cfg.h"
FSP_HEADER
#define IOPORT_CFG_NAME g_bsp_pin_cfg
#define IOPORT_CFG_OPEN R_IOPORT_Open
#define IOPORT_CFG_CTRL g_ioport_ctrl
/* IOPORT Instance */
extern const ioport_instance_t g_ioport;
/* IOPORT control structure. */
extern ioport_instance_ctrl_t g_ioport_ctrl;
void g_common_init(void);
FSP_FOOTER
#endif /* COMMON_DATA_H_ */
"####;
pub const T_GENERATE_RA_FILES_5: &str = r####"#include "common_data.h"
ioport_instance_ctrl_t g_ioport_ctrl;
const ioport_instance_t g_ioport =
{
    .p_api = &g_ioport_on_ioport,
    .p_ctrl = &g_ioport_ctrl,
    .p_cfg = &g_bsp_pin_cfg,
};
void g_common_init(void) {
}
"####;
pub const T_RA_HAL_ENTRY_LOOP: &str = r####"    /* Blink LED1 (P408) and LED2 (P407) on the FPB-RA6E1. */
    while (1)
    {
        R_IOPORT_PinWrite(&g_ioport_ctrl, BSP_IO_PORT_04_PIN_08, BSP_IO_LEVEL_HIGH);
        R_IOPORT_PinWrite(&g_ioport_ctrl, BSP_IO_PORT_04_PIN_07, BSP_IO_LEVEL_HIGH);
        R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);
        R_IOPORT_PinWrite(&g_ioport_ctrl, BSP_IO_PORT_04_PIN_08, BSP_IO_LEVEL_LOW);
        R_IOPORT_PinWrite(&g_ioport_ctrl, BSP_IO_PORT_04_PIN_07, BSP_IO_LEVEL_LOW);
        R_BSP_SoftwareDelay(500, BSP_DELAY_UNITS_MILLISECONDS);
    }
"####;
pub const T_RA_HAL_ENTRY: &str = r####"#include "hal_data.h"

FSP_CPP_HEADER
void R_BSP_WarmStart(bsp_warm_start_event_t event);
FSP_CPP_FOOTER

/*******************************************************************************************************************//**
 * main() is generated by the RA Configuration editor and is used to generate threads if an RTOS is used.  This function
 * is called by main() when no RTOS is used.
 **********************************************************************************************************************/
void hal_entry(void)
{
    /* TODO: add your own code here */
⟦loop⟧#if BSP_TZ_SECURE_BUILD
    /* Enter non-secure code */
    R_BSP_NonSecureEnter();
#endif
}

/*******************************************************************************************************************//**
 * This function is called at various points during the startup process.  This implementation uses the event that is
 * called right before main() to set up the pins.
 *
 * @param[in]  event    Where at in the start up process the code is currently at
 **********************************************************************************************************************/
void R_BSP_WarmStart(bsp_warm_start_event_t event)
{
    if (BSP_WARM_START_RESET == event)
    {
#if BSP_FEATURE_FLASH_LP_VERSION != 0

        /* Enable reading from data flash. */
        R_FACI_LP->DFLCTL = 1U;

        /* Would normally have to wait tDSTOP(6us) for data flash recovery. Placing the enable here, before clock and
         * C runtime initialization, should negate the need for a delay since the initialization will typically take more than 6us. */
#endif
    }

    if (BSP_WARM_START_POST_C == event)
    {
        /* C runtime environment and system clocks are setup. */

        /* Configure pins. */
        R_IOPORT_Open (&IOPORT_CFG_CTRL, &IOPORT_CFG_NAME);
    }
}

#if BSP_TZ_SECURE_BUILD

BSP_CMSE_NONSECURE_ENTRY void template_nonsecure_callable ();

/* Trustzone Secure Projects require at least one nonsecure callable function in order to build (Remove this if it is not required to build). */
BSP_CMSE_NONSECURE_ENTRY void template_nonsecure_callable ()
{

}
#endif
"####;
