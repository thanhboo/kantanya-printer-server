// test-open.js
// const escpos = require('escpos');
// escpos.USB = require('escpos-usb');

// try {
//   const dev = new escpos.USB(0x0483, 0x5743);
//   dev.open(err => {
//     if (err) return console.error('Open error:', err);
//     console.log('Opened OK');
//     try { dev.close(); } catch {}
//   });
// } catch (e) {
//   console.error('Ctor error:', e);
// }

const escpos = require('escpos');
escpos.USB = require('escpos-usb');

// Patch: ép escpos-usb dùng đúng core (trường hợp usb export {usb})
const usbCore = require('usb');
const core = usbCore.usb || usbCore;
if (escpos.USB.setUsb) {
  // một số bản adapter có API này
  escpos.USB.setUsb(core);
} else {
  // fallback: gán thẳng để adapter dùng core đúng
  escpos.USB.usb = core;
}

try {
  const dev = new escpos.USB(483, 5743);
  dev.open(err => {
    if (err) return console.error('Open error:', err);
    console.log('Opened OK');
    try { dev.close(); } catch {}
  });
} catch (e) {
  console.error('Ctor error:', e);
}
