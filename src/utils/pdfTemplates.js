import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'

// ─── Core renderer ────────────────────────────────────────────────────────────
// Injects HTML into a hidden off-screen div, captures with html2canvas,
// then embeds the image into a jsPDF A4 document and triggers download.
async function renderHtmlToPDF(htmlContent, filename) {
  const wrap = document.createElement('div')
  wrap.style.cssText = [
    'position:fixed',
    'top:0',
    'left:-9999px',
    'width:794px',          // A4 ≈ 794px @ 96 dpi
    'background:#fff',
    'font-family:Arial,sans-serif',
    'z-index:-1',
  ].join(';')
  wrap.innerHTML = htmlContent
  document.body.appendChild(wrap)

  // Give browser a tick to lay out fonts / images
  await new Promise(r => setTimeout(r, 150))

  const canvas = await html2canvas(wrap, {
    scale: 2,
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  })

  document.body.removeChild(wrap)

  const imgData = canvas.toDataURL('image/jpeg', 0.95)
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()   // 210 mm
  const pageH = pdf.internal.pageSize.getHeight()  // 297 mm
  const imgH  = (canvas.height * pageW) / canvas.width

  // Multi-page support
  if (imgH <= pageH) {
    pdf.addImage(imgData, 'JPEG', 0, 0, pageW, imgH)
  } else {
    let yOffset = 0
    let remaining = imgH
    let first = true
    while (remaining > 0) {
      if (!first) pdf.addPage()
      pdf.addImage(imgData, 'JPEG', 0, -yOffset, pageW, imgH)
      yOffset   += pageH
      remaining -= pageH
      first = false
    }
  }

  pdf.save(filename)
}

// ─── Shared styles ─────────────────────────────────────────────────────────────
const FONT = `font-family:'Cairo',Arial,'Noto Sans Arabic',sans-serif;`

const BASE_CSS = `
  <style>
    * { box-sizing:border-box; margin:0; padding:0; }
    body { ${FONT} color:#000; }
    .page { width:794px; background:#fff; padding:0; }
    /* Header — بيضاء مع حد سفلي */
    .header { background:#fff; border-bottom:2px solid #000; padding:20px 40px; text-align:center; }
    .header h1 { color:#000; font-size:24px; font-weight:800; letter-spacing:1px; margin-bottom:4px; }
    .header .sub { color:#333; font-size:12px; font-weight:600; margin-bottom:4px; }
    .header .contact { color:#555; font-size:10px; }
    /* Doc title */
    .doc-title { text-align:center; padding:16px 40px 0; }
    .doc-title h2 { font-size:18px; font-weight:800; color:#000; margin-bottom:4px; border-bottom:1px solid #000; display:inline-block; padding-bottom:4px; }
    .doc-title .sub2 { font-size:11px; color:#555; margin-top:4px; }
    /* Info grid */
    .info-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; padding:16px 40px; }
    .info-box { background:#fff; border:1px solid #000; border-radius:6px; padding:12px 16px; }
    .info-row { display:flex; justify-content:space-between; margin-bottom:6px; font-size:12px; }
    .info-row:last-child { margin-bottom:0; }
    .info-label { color:#555; }
    .info-val { font-weight:700; color:#000; direction:rtl; text-align:right; }
    /* Table */
    .tbl-wrap { padding:0 40px 16px; }
    table { width:100%; border-collapse:collapse; font-size:12px; border:1px solid #000; }
    thead tr { background:#fff; border-bottom:2px solid #000; }
    thead th { padding:9px 12px; color:#000; font-weight:800; text-align:center; border-left:1px solid #ccc; }
    thead th:first-child { text-align:right; border-left:none; }
    tbody tr { border-bottom:1px solid #ccc; }
    tbody td { padding:9px 12px; color:#000; text-align:center; border-left:1px solid #ccc; }
    tbody td:first-child { text-align:right; font-weight:600; direction:rtl; border-left:none; }
    tfoot tr { border-top:2px solid #000; }
    tfoot td { padding:10px 12px; font-weight:800; color:#000; font-size:13px; }
    /* Totals */
    .totals { display:flex; justify-content:flex-end; padding:0 40px 16px; }
    .totals-box { min-width:260px; border:1px solid #000; border-radius:6px; overflow:hidden; }
    .total-row { display:flex; justify-content:space-between; padding:8px 14px; font-size:12px; border-bottom:1px solid #ccc; }
    .total-row .tl { color:#555; }
    .total-row .tv { font-weight:700; color:#000; direction:ltr; }
    .total-grand { display:flex; justify-content:space-between; padding:10px 14px; border-top:2px solid #000; }
    .total-grand .tl { color:#000; font-weight:800; font-size:13px; }
    .total-grand .tv { color:#000; font-weight:800; font-size:15px; direction:ltr; }
    /* Warranty */
    .warranty { margin:0 40px 16px; border:1px solid #000; border-radius:6px; padding:12px 16px; }
    .warranty h4 { color:#000; font-size:11px; font-weight:800; margin-bottom:6px; }
    .warranty p  { color:#333; font-size:10px; margin-bottom:4px; direction:rtl; line-height:1.6; }
    /* Stamp */
    .stamps { display:grid; grid-template-columns:1fr 1fr; gap:20px; padding:0 40px 24px; }
    .stamp-box { border:1px solid #000; border-radius:6px; padding:40px 20px 14px; text-align:center; }
    .stamp-lbl { color:#555; font-size:11px; }
    /* Footer — بدون خلفية */
    .footer { border-top:1px solid #000; padding:8px 40px; text-align:center; color:#555; font-size:10px; }
    /* Notes */
    .notes { margin:0 40px 14px; border:1px solid #000; border-radius:6px; padding:10px 14px; }
    .notes h4 { color:#000; font-size:11px; font-weight:700; margin-bottom:4px; }
    .notes p  { color:#333; font-size:11px; direction:rtl; }
    /* Amount in words */
    .words { margin:0 40px 14px; padding:8px 14px; border-radius:6px; border:1px solid #000; font-size:11px; direction:rtl; color:#333; }
  </style>
`

// ─── Arabic number-to-words (simple) ──────────────────────────────────────────
function toArabicWords(n) {
  const ones  = ['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة','عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر']
  const tens  = ['','','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون']
  const hunds = ['','مائة','مئتان','ثلاثمائة','أربعمائة','خمسمائة','ستمائة','سبعمائة','ثمانمائة','تسعمائة']
  if (n === 0) return 'صفر'
  if (n < 20)  return ones[n]
  if (n < 100) { const t=Math.floor(n/10),o=n%10; return o?`${ones[o]} و${tens[t]}`:tens[t] }
  if (n < 1000){ const h=Math.floor(n/100),r=n%100; return r?`${hunds[h]} و${toArabicWords(r)}`:hunds[h] }
  if (n < 1000000) {
    const th=Math.floor(n/1000),r=n%1000
    const thW = th===1?'ألف':th===2?'ألفان':th<11?`${toArabicWords(th)} آلاف`:`${toArabicWords(th)} ألف`
    return r?`${thW} و${toArabicWords(r)}`:thW
  }
  return n.toLocaleString('ar-EG')
}

function amountInWords(amount) {
  const whole = Math.floor(amount)
  const cents = Math.round((amount - whole) * 100)
  let s = `${toArabicWords(whole)} جنيه مصري`
  if (cents > 0) s += ` و${toArabicWords(cents)} قرش`
  return s + ' فقط لا غير'
}

// ─── Payment method map ────────────────────────────────────────────────────────
const payMap = { 'كاش':'كاش (Cash)', 'انستاباي':'انستاباي (InstaPay)', 'تحويل':'تحويل بنكي (Bank Transfer)' }

// ─── DISPATCH PDF ──────────────────────────────────────────────────────────────
export async function generateDispatchPDF(order) {
  const itemsRows = order.items.map((item, i) => `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td>${item.name}</td>
      <td>${item.model || '—'}</td>
      <td>${item.quantity}</td>
      <td>${item.price.toLocaleString()} LE</td>
      <td>${item.total.toLocaleString()} LE</td>
    </tr>`).join('')

  const html = `
  <div class="page">
    ${BASE_CSS}

    <div class="header">
      <h1>IoT Tech</h1>
      <div class="sub">Smart Home &amp; Security Solutions</div>
      <div class="contact">Tel: 01000000000 &nbsp;|&nbsp; info@iottech.eg &nbsp;|&nbsp; www.iottech.eg</div>
    </div>

    <div class="doc-title">
      <h2>إذن صرف بضاعة</h2>
      <div class="sub2">Dispatch / Delivery Order</div>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <div class="info-row"><span class="info-label">رقم الإذن:</span> <span class="info-val">${order.serialNumber}</span></div>
        <div class="info-row"><span class="info-label">التاريخ:</span>   <span class="info-val">${order.date}</span></div>
        <div class="info-row"><span class="info-label">الوقت:</span>     <span class="info-val">${order.time}</span></div>
        <div class="info-row"><span class="info-label">الدفع:</span>     <span class="info-val">${payMap[order.paymentMethod] || order.paymentMethod}</span></div>
      </div>
      <div class="info-box">
        <div class="info-row"><span class="info-label">اسم الشركة / العميل:</span> <span class="info-val">${order.company}</span></div>
        <div class="info-row"><span class="info-label">اسم العميل:</span>           <span class="info-val">${order.clientName}</span></div>
        <div class="info-row"><span class="info-label">الموبايل:</span>             <span class="info-val" dir="ltr">${order.mobile}</span></div>
        <div class="info-row"><span class="info-label">المندوب:</span>              <span class="info-val">${order.salesRep}</span></div>
      </div>
    </div>

    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:36px">#</th>
            <th>البيان / Item</th>
            <th>الموديل / Model</th>
            <th>العدد / Qty</th>
            <th>السعر / Price</th>
            <th>الإجمالي / Total</th>
          </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
        <tfoot>
          <tr>
            <td colspan="5" style="text-align:right;direction:rtl;color:#000;font-weight:800">
              ${order.vatPercent > 0 ? `الإجمالي الكلي (شامل ${order.vatPercent}% ضريبة)` : 'الإجمالي الكلي (بدون القيمة المضافة)'}
            </td>
            <td style="color:#000;font-weight:800">${order.total.toLocaleString()} LE</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div class="totals">
      <div class="totals-box">
        <div class="total-row"><span class="tl">المجموع الجزئي</span><span class="tv">${order.subtotal.toLocaleString()} LE</span></div>
        ${order.vatPercent > 0 ? `<div class="total-row"><span class="tl">ضريبة القيمة المضافة (${order.vatPercent}%)</span><span class="tv">${order.vatAmount.toLocaleString()} LE</span></div>` : `<div class="total-row" style="color:#94a3b8;font-style:italic"><span class="tl">بدون القيمة المضافة</span><span class="tv">—</span></div>`}
        <div class="total-grand"><span class="tl">الإجمالي النهائي</span><span class="tv">${order.total.toLocaleString()} LE</span></div>
      </div>
    </div>

    <div class="words">
      <strong>المبلغ كتابةً:</strong> ${amountInWords(order.total)}
    </div>

    ${order.address ? `<div class="notes"><h4>عنوان التسليم</h4><p>${order.address}</p></div>` : ''}

    <div class="warranty">
      <h4>شروط الضمان / Warranty Terms</h4>
      <p>١. الضمان يغطي عيوب التصنيع فقط لمدة سنتين من تاريخ التركيب.</p>
      <p>٢. يسقط الضمان في حالة سوء الاستخدام أو التعرض للمياه أو التعديل غير المصرح به.</p>
      <p>٣. تحديثات البرنامج مجانية خلال فترة الضمان.</p>
    </div>

    <div class="stamps">
      <div class="stamp-box"><div class="stamp-lbl">توقيع العميل / Client Signature</div></div>
      <div class="stamp-box"><div class="stamp-lbl">ختم الشركة / Company Stamp</div></div>
    </div>

    <div class="footer">IoT Tech — Smart Home &amp; Security Solutions — Egypt</div>
  </div>`

  await renderHtmlToPDF(html, `dispatch-${order.serialNumber}.pdf`)
}

// ─── INVOICE PDF ───────────────────────────────────────────────────────────────
export async function generateInvoicePDF(order) {
  const isVat = order.invoiceType === 'فاتورة ضريبية'
  const billName = order.invoiceName || order.clientName

  const itemsRows = order.items.map((item, i) => `
    <tr>
      <td style="text-align:center">${i + 1}</td>
      <td>${item.name}</td>
      <td>${item.model || '—'}</td>
      <td>${item.quantity}</td>
      <td>${item.price.toLocaleString()} LE</td>
      <td>${item.total.toLocaleString()} LE</td>
    </tr>`).join('')

  const html = `
  <div class="page">
    ${BASE_CSS}

    <div class="header">
      <h1>IoT Tech</h1>
      <div class="sub">Smart Home &amp; Security Solutions</div>
      <div class="contact">Tel: 01000000000 &nbsp;|&nbsp; info@iottech.eg &nbsp;|&nbsp; www.iottech.eg</div>
    </div>

    <div class="doc-title">
      <h2>${isVat ? 'فاتورة ضريبية' : 'بيان أسعار'}</h2>
      <div class="sub2">${isVat ? 'Tax Invoice' : 'Price List'}</div>
    </div>

    <div class="info-grid">
      <div class="info-box">
        <div class="info-row"><span class="info-label">رقم الفاتورة:</span>  <span class="info-val">${order.serialNumber}</span></div>
        <div class="info-row"><span class="info-label">التاريخ:</span>        <span class="info-val">${order.date}</span></div>
        <div class="info-row"><span class="info-label">طريقة الدفع:</span>   <span class="info-val">${payMap[order.paymentMethod] || order.paymentMethod}</span></div>
        <div class="info-row"><span class="info-label">المندوب:</span>        <span class="info-val">${order.salesRep}</span></div>
      </div>
      <div class="info-box">
        <div class="info-row"><span class="info-label">فاتورة إلى:</span>    <span class="info-val">${billName}</span></div>
        <div class="info-row"><span class="info-label">العميل:</span>          <span class="info-val">${order.clientName}</span></div>
        <div class="info-row"><span class="info-label">الموبايل:</span>        <span class="info-val" dir="ltr">${order.mobile}</span></div>
        ${isVat && order.taxNumber ? `<div class="info-row"><span class="info-label">الرقم الضريبي:</span><span class="info-val" dir="ltr">${order.taxNumber}</span></div>` : ''}
      </div>
    </div>

    <div class="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:36px">#</th>
            <th>البيان / Item Description</th>
            <th>الموديل / Model</th>
            <th>الكمية / Qty</th>
            <th>السعر / Unit Price</th>
            <th>الإجمالي / Total</th>
          </tr>
        </thead>
        <tbody>${itemsRows}</tbody>
      </table>
    </div>

    <div class="totals">
      <div class="totals-box">
        <div class="total-row"><span class="tl">المجموع الجزئي / Subtotal</span><span class="tv">${order.subtotal.toLocaleString()} LE</span></div>
        ${order.vatPercent > 0 ? `<div class="total-row"><span class="tl">ضريبة ${order.vatPercent}% / VAT</span><span class="tv">${order.vatAmount.toLocaleString()} LE</span></div>` : `<div class="total-row" style="color:#94a3b8;font-style:italic"><span class="tl">بدون القيمة المضافة / No VAT</span><span class="tv">—</span></div>`}
        <div class="total-grand"><span class="tl">الإجمالي / TOTAL</span><span class="tv">${order.total.toLocaleString()} LE</span></div>
      </div>
    </div>

    ${order.notes ? `<div class="notes"><h4>ملاحظات / Notes</h4><p>${order.notes}</p></div>` : ''}

    <div class="words">
      <strong>المبلغ كتابةً:</strong> ${amountInWords(order.total)}
    </div>

    <div class="stamps">
      <div class="stamp-box"><div class="stamp-lbl">توقيع العميل / Client Signature</div></div>
      <div class="stamp-box"><div class="stamp-lbl">ختم الشركة / Company Stamp</div></div>
    </div>

    <div class="footer">IoT Tech — Smart Home &amp; Security Solutions — Egypt</div>
  </div>`

  await renderHtmlToPDF(html, `invoice-${order.serialNumber}.pdf`)
}
