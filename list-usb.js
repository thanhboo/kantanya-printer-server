// list-usb.js
const usb = require('usb');
const core = usb.usb || usb; // một số build export { usb }
console.log('Has getDeviceList:', typeof core.getDeviceList);
console.log('Has on (event):', typeof core.on);
for (const d of (core.getDeviceList?.() || [])) {
  const idv = d.deviceDescriptor?.idVendor?.toString(16);
  const idp = d.deviceDescriptor?.idProduct?.toString(16);
  console.log(`VID=${idv} PID=${idp}`);
}
