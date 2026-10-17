// raw-copy-test.js
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

function printRawToShare(buffer, sharePath) {
  const tmp = `${os.tmpdir()}\\print_${Date.now()}.prn`;
  fs.writeFileSync(tmp, buffer);
  return new Promise((resolve, reject) => {
    // copy /b "<file>" "\\localhost\ShareName"
    execFile('cmd.exe', ['/d', '/s', '/c', `copy /b "${tmp}" "${sharePath}"`], (err, stdout) => {
      try { fs.unlinkSync(tmp); } catch {}
      if (err) return reject(err);
      resolve(stdout || 'OK');
    });
  });
}

const ESC = 0x1B, GS = 0x1D;
const init   = Buffer.from([ESC, 0x40]);        // ESC @
const center = Buffer.from([ESC, 0x61, 0x01]);  // ESC a 1
const normal = Buffer.from([GS,  0x21, 0x00]);  // GS ! 0
const dblWH  = Buffer.from([GS,  0x21, 0x22]);  // GS ! 0x22
const cut    = Buffer.from([GS,  0x56, 0x00]);  // GS V 0 (full cut)
const lf2    = Buffer.from('\n\n', 'ascii');

// *Lưu ý tiếng Việt có dấu có thể không hiển thị đúng nếu firmware không hỗ trợ code page phù hợp
const body = Buffer.from(
  'KANTANYA COFFEE\r\n' +
  'Test Print - XP-N160II (K80)\r\n' +
  'Nếu text lỗi dấu, nên bỏ dấu trên hoá đơn.\r\n', 'ascii'
);

// Gộp thành lệnh in
const raw = Buffer.concat([init, center, dblWH, Buffer.from('KANTANYA\r\n', 'ascii'),
                           normal, Buffer.from('Test RAW via Share\r\n', 'ascii'),
                           body, lf2, cut]);

// Đổi đúng share path bên dưới (\\<PC-NAME>\ShareName hoặc \\localhost\ShareName)
printRawToShare(raw, '\\localhost\\XP-80C')
  .then(console.log)
  .catch(console.error);
