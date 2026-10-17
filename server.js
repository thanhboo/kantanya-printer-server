// server.js
// Print server (PDF → Windows queue) for 80mm receipt
// Endpoints: /health, /test, /print
// Run: npm i express pdfkit pdf-to-printer dayjs && node server.js

const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const dayjs = require('dayjs');
const PDFDocument = require('pdfkit');
const { print } = require('pdf-to-printer');

/* ===== Config ===== */
const PORT = Number(process.env.PRINT_PORT || 5123);
const PRINTER_NAME = process.env.PRINTER_NAME || 'XP-80C'; // đổi nếu tên Windows khác

// Thứ tự tìm font:
//   1) file trong ./fonts (Roboto - khuyến nghị)
//   2) font hệ thống Windows có hỗ trợ dấu tiếng Việt (Segoe UI / Arial / Tahoma)
//   3) font built-in của PDFKit (KHÔNG có dấu tiếng Việt - chỉ dùng khi bất khả kháng)
const SYSTEM_FONTS_DIR = process.platform === 'win32'
  ? path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts')
  : null;

function pickFont(relPath, fallback, systemFiles = []) {
  const candidates = [path.join(__dirname, relPath)];
  if (SYSTEM_FONTS_DIR) {
    for (const f of systemFiles) candidates.push(path.join(SYSTEM_FONTS_DIR, f));
  }
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  console.warn(`[fonts] Không thấy "${relPath}" — dùng fallback "${fallback}".`);
  return fallback;
}

const FONTS = {
  regular:  pickFont(path.join('fonts', 'Roboto-Regular.ttf'),  'Helvetica',
                     ['segoeui.ttf', 'arial.ttf', 'tahoma.ttf']),
  semibold: pickFont(path.join('fonts', 'Roboto-SemiBold.ttf'), 'Helvetica-Bold',
                     ['segoeuib.ttf', 'arialbd.ttf', 'tahomabd.ttf']),
  bold:     pickFont(path.join('fonts', 'Roboto-Bold.ttf'),     'Helvetica-Bold',
                     ['segoeuib.ttf', 'arialbd.ttf', 'tahomabd.ttf']),
};

// Thông tin quán
const STORE = {
  name: 'KANTANYA MATCHA & COFFEE',
  addr: 'Số 7/65 - Phạm Khắc Quảng, Giang Biên, Long Biên, Hà Nội',
  phone: '0916491518', // thêm nếu muốn hiển thị
};

/* ===== Page & Layout ===== */
const MM_TO_PT = 3.2;
const PAGE_WIDTH_MM = 80;                     // K80
const PAGE_WIDTH_PT = PAGE_WIDTH_MM * MM_TO_PT; // ≈ 226.8pt
const MARGIN = 5;                            // pt
const CONTENT_W = PAGE_WIDTH_PT - MARGIN * 2;

// Lưới cột bảng món
const COLS = {
  name: 118,
  qty: 20,
  price: 54,
  amount: 58,
};

/* ===== Utils ===== */
function vnd(n) {
  if (n == null || isNaN(Number(n))) return '';
  return Number(n).toLocaleString('vi-VN') + 'đ';
}

// Nhãn hiển thị cho meta_data (WooCommerce) của mỗi món
const META_LABEL = { size: 'Size', toppings: 'Topping', sugar: 'Đường', ice: 'Đá', notes: 'Ghi chú' };
// Thứ tự in các tuỳ chọn. Bỏ "size" vì size đã nằm trong tên món (vd "Americano (L)").
const META_ORDER = ['toppings', 'sugar', 'ice', 'notes'];

// Chuẩn hoá tuỳ chọn của 1 món thành mảng dòng để in dưới tên món.
// Chấp nhận cả 2 dạng:
//   - item.options:    ["+ Matcha Thêm", "Đường: Full"] (đã chuẩn hoá sẵn)
//   - item.meta_data:  [{ key, value, display_value }]  (dạng WooCommerce trả về)
function buildItemOptions(item) {
  const lines = [];

  if (Array.isArray(item.options)) {
    for (const o of item.options) {
      if (typeof o === 'string' && o.trim()) {
        lines.push(o.trim());
      } else if (o && typeof o === 'object' && (o.value ?? o.display_value) != null) {
        const label = o.label ?? o.display_key ?? o.key;
        const val = o.value ?? o.display_value;
        lines.push(label ? `${label}: ${val}` : String(val));
      }
    }
  }

  if (Array.isArray(item.meta_data)) {
    const map = {};
    for (const m of item.meta_data) {
      if (!m) continue;
      const key = m.key ?? m.display_key;
      const val = m.display_value ?? m.value;
      if (key != null) map[key] = val == null ? '' : String(val);
    }
    for (const key of META_ORDER) {
      const raw = String(map[key] ?? '').trim();
      if (!raw) continue;
      if (key === 'toppings') {
        // Topping cách nhau bởi dấu phẩy -> tách mỗi loại 1 dòng
        for (const t of raw.split(',')) {
          const v = t.trim();
          if (v) lines.push(`+ ${v}`);
        }
      } else if (key === 'notes') {
        lines.push(raw);
      } else {
        lines.push(`${META_LABEL[key] || key}: ${raw}`);
      }
    }
  }

  return lines;
}

// Vẽ đường kẻ vector (không dùng chuỗi gạch)
function line(doc, y = doc.y, thick = 1, gray = 0) {
  doc.save()
     .lineWidth(thick)
     .strokeColor(gray)
     .moveTo(MARGIN, y)
     .lineTo(MARGIN + CONTENT_W, y)
     .stroke()
     .restore();
  doc.y = y + 4;
}

/* ===== Sections ===== */
function drawHeader(doc) {
  // Title
  doc.font(FONTS.bold).fontSize(18)
     .text(STORE.name, { align: 'center', width: CONTENT_W });

  // Address (wrap xuống dòng)
  if (STORE.addr) {
    doc.moveDown(0.2);
    doc.font(FONTS.semibold).fontSize(11)
       .text(STORE.addr, { align: 'center', width: CONTENT_W });
  }
  if (STORE.phone) {
    doc.font(FONTS.semibold).fontSize(11)
       .text(STORE.phone, { align: 'center', width: CONTENT_W });
  }

  line(doc, doc.y + 4);
  doc.font(FONTS.bold).fontSize(14)
     .text('HÓA ĐƠN THANH TOÁN', { align: 'center', width: CONTENT_W });
  line(doc, doc.y + 4);
}

function drawMeta(doc, order) {
  const timeStr = order.createdAt
    ? dayjs(order.createdAt).format('DD/MM/YYYY HH:mm')
    : dayjs().format('DD/MM/YYYY HH:mm');

  doc.font(FONTS.semibold).fontSize(10);

  // Dòng 1: Số HĐ (trái) // Ngày in (phải)
  let y = doc.y;
  doc.text(`Số HĐ: ${order.code || order.id || '-'}`, MARGIN, y, {
    width: CONTENT_W / 2 - 4, align: 'left'
  });
  doc.text(`Ngày in: ${timeStr}`, MARGIN + CONTENT_W / 2 + 4, y, {
    width: CONTENT_W / 2 - 4, align: 'right'
  });

  // Dòng 2: Bàn (trái) // Thu ngân (phải)
  doc.moveDown(0.2);
  y = doc.y;
  doc.text(`Bàn: ${order.table || order.channel || 'Mang đi'}`, MARGIN, y, {
    width: CONTENT_W / 2 - 4, align: 'left'
  });
  doc.text(`Thu ngân: ${order.cashier || '—'}`, MARGIN + CONTENT_W / 2 + 4, y, {
    width: CONTENT_W / 2 - 4, align: 'right'
  });

  // Khách hàng (nếu có)
  if (order.customer) {
    doc.moveDown(0.2);
    doc.font(FONTS.regular).text(`Khách hàng: ${order.customer}`, MARGIN, doc.y, {
      width: CONTENT_W, align: 'left'
    });
  }
  line(doc, doc.y + 6);
}

function drawTableHeader(doc) {
  const x = MARGIN, y = doc.y;
  doc.font(FONTS.semibold).fontSize(12); // to hơn 1 cỡ

  doc.text('TÊN HÀNG', x, y, { width: COLS.name, align: 'left' });
  doc.text('SL',       x + COLS.name, y, { width: COLS.qty, align: 'right' });
  doc.text('Đ.Giá',    x + COLS.name + COLS.qty, y, { width: COLS.price, align: 'right' });
  doc.text('T.Tiền',   x + COLS.name + COLS.qty + COLS.price, y, { width: COLS.amount, align: 'right' });

  line(doc, y + doc.currentLineHeight() + 2);
}

function drawItemRow(doc, item, index) {
  const x = MARGIN;
  const yStart = doc.y;

  const nameText = `${index}) ${item.name || ''}`;
  const qty = Number(item.qty || 1);
  const price = Number(item.price || 0);
  const amount = qty * price;

  // Tăng cỡ chữ bảng
  doc.font(FONTS.regular).fontSize(13);

  // Tính chiều cao phần tên để cố định chiều cao hàng
  const nameHeight = doc.heightOfString(nameText, { width: COLS.name, align: 'left' });
  const rowHeight = Math.max(nameHeight, doc.currentLineHeight());

  // Render
  doc.text(nameText, x, yStart, { width: COLS.name, align: 'left' });
  doc.text(String(qty), x + COLS.name, yStart, { width: COLS.qty, align: 'right' });
  doc.text(vnd(price),  x + COLS.name + COLS.qty, yStart, { width: COLS.price, align: 'right' });
  doc.text(vnd(amount), x + COLS.name + COLS.qty + COLS.price, yStart, { width: COLS.amount, align: 'right' });

  // In các tuỳ chọn (topping, đường, đá, ghi chú...) thụt lề dưới tên món
  let y = yStart + rowHeight + 2;
  const options = buildItemOptions(item);
  if (options.length) {
    const optIndent = 14;
    const optWidth = CONTENT_W - optIndent;
    doc.font(FONTS.regular).fontSize(10);
    for (const opt of options) {
      doc.text(opt, x + optIndent, y, { width: optWidth, align: 'left' });
      y += doc.heightOfString(opt, { width: optWidth, align: 'left' }) + 1;
    }
  }

  // Kết thúc hàng
  doc.y = y + 1;
}

function drawTotals(doc, order) {
  const items = Array.isArray(order.items) ? order.items : [];
  const totalQty = items.reduce((s, it) => s + Number(it.qty || 1), 0);
  const subtotal = items.reduce((s, it) => s + Number(it.qty || 1) * Number(it.price || 0), 0);
  const discount = Number(order.discount || 0);
  const service  = Number(order.service || 0);
  const grand = (order.total != null) ? Number(order.total) : Math.max(0, subtotal - discount + service);

  line(doc, doc.y + 4);

  // T.Cộng: SL (trái) // Tiền (phải)
  let y = doc.y;
  doc.font(FONTS.semibold).fontSize(12)
     .text(`T.Cộng: ${totalQty}`, MARGIN, y, { width: CONTENT_W / 2 - 4, align: 'left' });
  doc.font(FONTS.regular).fontSize(12)
     .text(vnd(subtotal), MARGIN + CONTENT_W / 2 + 4, y, { width: CONTENT_W / 2 - 4, align: 'right' });

  // Phương thức + Tổng
  doc.moveDown(0.4);
  y = doc.y;
  const method = (order.method || 'TIỀN MẶT').toUpperCase();
  doc.font(FONTS.semibold).fontSize(12)
     .text(method + ':', MARGIN, y, { width: CONTENT_W / 2 - 4, align: 'left' });
  doc.font(FONTS.bold).fontSize(14)
     .text(vnd(grand), MARGIN + CONTENT_W / 2 + 4, y, { width: CONTENT_W / 2 - 4, align: 'right' });

  if (order.amountInWords) {
    doc.moveDown(0.2);
    doc.font(FONTS.regular).fontSize(9)
       .text(order.amountInWords, { width: CONTENT_W, align: 'left' });
  }
  line(doc, doc.y + 6);
}

function drawFooter(doc) {
  doc.font(FONTS.regular).fontSize(10)
     .text('Cảm ơn Quý Khách - Hẹn Gặp Lại!', { align: 'center', width: CONTENT_W });
}

/* ===== PDF Builder ===== */
async function createBillPdf(filePath, order) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [PAGE_WIDTH_PT, 420 * MM_TO_PT], // đủ dài cho bill; PDFKit sẽ ngắt nếu tràn
      margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN },
    });

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    drawHeader(doc);
    drawMeta(doc, order);
    drawTableHeader(doc);

    if (Array.isArray(order.items) && order.items.length) {
      order.items.forEach((it, idx) => drawItemRow(doc, it, idx + 1));
    } else {
      doc.font(FONTS.regular).fontSize(11).text('(Không có món)', { width: CONTENT_W });
    }
    line(doc, doc.y + 2);

    drawTotals(doc, order);
    drawFooter(doc);

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

/* ===== Express App ===== */
const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ ok: true, printer: PRINTER_NAME, port: PORT });
});

app.get('/test', async (req, res) => {
  try {
    const tmpPdf = path.join(os.tmpdir(), `test_${Date.now()}.pdf`);
    await createBillPdf(tmpPdf, {
      id: '0001',
      createdAt: new Date(),
      table: 'Bàn 01',
      cashier: 'Admin',
      customer: '',
      items: [
        {
          name: 'Americano (L)', qty: 1, price: 65000,
          meta_data: [
            { key: 'size', value: 'L' },
            { key: 'toppings', value: 'Matcha Thêm, Kem mặn Thêm' },
            { key: 'sugar', value: 'Full' },
            { key: 'ice', value: 'Full' },
            { key: 'notes', value: '' },
          ],
        },
        {
          name: 'Coldbrew (L)', qty: 1, price: 70000,
          meta_data: [
            { key: 'size', value: 'L' },
            { key: 'toppings', value: 'Matcha Thêm, Kem mặn Thêm' },
            { key: 'sugar', value: 'Full' },
            { key: 'ice', value: 'Full' },
            { key: 'notes', value: '' },
          ],
        },
        { name: 'Matcha Latte', qty: 2, price: 35000 },
        {
          name: 'Bạc xỉu', qty: 1, price: 30000,
          meta_data: [
            { key: 'sugar', value: 'Ít' },
            { key: 'ice', value: 'Không' },
            { key: 'notes', value: 'Không sữa' },
          ],
        },
      ],
      discount: 0,
      service: 0,
      method: 'Tiền mặt',
      // amountInWords: 'Một trăm bốn mươi lăm nghìn đồng chẵn.',
    });

    // ===== PREVIEW: comment lại phần này để không xuất PDF xem trước nữa =====
    // res.setHeader('Content-Type', 'application/pdf');
    // res.setHeader('Content-Disposition', 'inline; filename="bill-preview.pdf"');
    // return fs.createReadStream(tmpPdf).pipe(res);

    // In thật ra máy in
    await print(tmpPdf, { printer: PRINTER_NAME });
    res.json({ ok: true, file: tmpPdf, printer: PRINTER_NAME });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/print', async (req, res) => {
  const order = req.body?.order;
  if (!order) return res.status(400).json({ ok: false, error: 'Missing order' });
  try {
    const tmpPdf = path.join(os.tmpdir(), `order_${Date.now()}.pdf`);
    await createBillPdf(tmpPdf, order);

    // In thật ra máy in
    await print(tmpPdf, { printer: PRINTER_NAME });
    res.json({ ok: true, file: tmpPdf, printer: PRINTER_NAME });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`[Kantanya PDF Print Server] Listening on :${PORT}`);
  console.log(`Printer: ${PRINTER_NAME}`);
  console.log(`Try: http://localhost:${PORT}/test`);
});
