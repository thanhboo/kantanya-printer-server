const escpos = require('escpos');
escpos.USB = require('escpos-usb');

try {
  const device = new escpos.USB(0x0483, 0x5743); // nếu chỉ có 1 máy in
  console.log('Printer USB device found:', device);
} catch (err) {
  console.error('No printer found:', err);
}
