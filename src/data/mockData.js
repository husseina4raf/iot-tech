// ─── System Constants ─────────────────────────────────────────────────────────
// SALES_REPS is derived from authData (USERS with role === 'sales')
// Import from authData wherever you need the rep list
export { SALES_REPS } from './authData'

export const ORDER_STATUSES  = ['بانتظار الموافقة', 'جديد', 'موافق عليه', 'تم الصرف', 'مكتمل', 'تم التحصيل', 'مرفوض']
export const PAYMENT_METHODS = ['كاش', 'انستاباي', 'تحويل']
export const INVOICE_TYPES   = ['بيان اسعار', 'فاتورة ضريبية']

export const INVENTORY_CATEGORIES = [
  'أقفال ذكية', 'انتركم', 'كاميرات', 'مفاتيح ذكية', 'حساسات', 'إكسسوارات', 'أنظمة تحكم',
]

export const INVENTORY_BRANDS = [
  'Lezn', 'Levana', 'Bosch', 'Dnake', 'Panda', 'SIB',
  'Hikvision', 'Tuya', 'Sonoff', 'Tapo', 'Ezviz',
  'Avatto', 'IP', 'TP-Link',
]

