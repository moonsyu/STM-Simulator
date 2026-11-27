// FSP 6.6 ra/fsp/src/r_usb_pcdc/r_usb_pcdc_descriptor.c.template (BSD-3-Clause, Renesas), as it is: the USB PCDC
// descriptors (g_usb_descriptor) a project with the USB stack gets as its user source src/r_usb_pcdc_descriptor.c
// (feature 41). RASC writes the same file from this template. The text and the check are on the Rust side
// (rust/stm-core/src/ptools.rs and data/usb_descriptor.json; feature 62).
import {rustTable,rustExact} from './rust-core.js';

const T=rustTable('usb_descriptor_tables');
export const RA_USB_DESCRIPTOR_FILE=T.RA_USB_DESCRIPTOR_FILE;
/** Adds src/r_usb_pcdc_descriptor.c to an FSP project's sources (the USB stack was added) unless a file of that name is
 *  there; true when it was added. Removing the stack leaves the file. */
export function addUsbDescriptor(project){
 const files=project.firmware?.files||[];
 if(!rustExact('usb_descriptor_missing',files.map(f=>f.name)))return false;
 project.firmware={...project.firmware,files:[...files,{name:RA_USB_DESCRIPTOR_FILE,text:RA_USB_DESCRIPTOR_C}]};
 return true;
}
export const RA_USB_DESCRIPTOR_C=T.RA_USB_DESCRIPTOR_C;
