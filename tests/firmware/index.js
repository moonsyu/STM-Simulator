// Entry point so that `node --test tests/firmware/` works on Node versions that
// resolve a directory argument as a module instead of expanding it.
import './peripherals.test.js';
import './firmware-gpio.test.js';
import './firmware-comm.test.js';
import './firmware-system.test.js';
