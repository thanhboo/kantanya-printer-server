const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFDocument = require('pdfkit');
const { print } = require('pdf-to-printer');

// ⚙️ Cấu hình
const PRINTER_NAME = 'XP-80C'; // Tên chính xác máy in trong Windows
const fonts = {
  regular: path.join(__dirname, 'fonts', 'Roboto-Regular.ttf'),
  semibold: path.join(__dirname, 'fonts', 'Roboto-SemiBold.ttf'),
  bold: path.join(__dirname, 'fonts', 'Roboto-Bold.ttf'),
};

async function createTestPdf(filePath) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: [80 * 2.83465, 200 * 2.83465], // 80mm x 200mm
      margin: 10,
    });

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // ====== TITLE: Roboto-Bold ======
    doc.font(fonts.bold)
       .fontSize(18)
       .text('KANTANYA COFFEE', { align: 'center' });
    doc.moveDown(0.5);

    // ====== ĐẦU MỤC: Roboto-SemiBold ======
    doc.font(fonts.semibold)
       .fontSize(12)
       .text('Hóa đơn thử nghiệm in tiếng Việt', { align: 'center' });
    doc.moveDown(0.5);

    doc.text('Danh sách món:', { underline: true });
    doc.moveDown(0.3);

    // ====== NỘI DUNG: Roboto-Regular ======
    doc.font(fonts.regular).fontSize(10);
    doc.text('Matcha Latte x1 - 35.000đ');
    doc.text('Matcha Nước Dừa x2 - 70.000đ');
    doc.text('Cà phê sữa đá x1 - 25.000đ');
    doc.moveDown(0.5);

    // ====== ĐẦU MỤC: Roboto-SemiBold ======
    doc.font(fonts.semibold).fontSize(11).text('Ghi chú: ít đá, thêm đường');
    doc.moveDown(0.5);

    // ====== Tổng cộng ======
    doc.font(fonts.semibold).fontSize(12).text('TỔNG:', { continued: true });
    doc.font(fonts.regular).fontSize(12).text(' 105.000đ', { align: 'right' });

    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

(async () => {
  try {
    const tmpPdf = path.join(os.tmpdir(), `kantanya_test_${Date.now()}.pdf`);
    await createTestPdf(tmpPdf);

    await print(tmpPdf, { printer: PRINTER_NAME });

    console.log(`✅ Đã gửi file test PDF đến máy in ${PRINTER_NAME}`);
    console.log(`📄 File PDF tạm: ${tmpPdf}`);
  } catch (err) {
    console.error('❌ Lỗi in thử:', err);
  }
})();
