// ─── System Constants ─────────────────────────────────────────────────────────
// SALES_REPS is derived from authData (USERS with role === 'sales')
// Import from authData wherever you need the rep list
export { SALES_REPS } from './authData'

export const ORDER_STATUSES  = ['جديد', 'موافق عليه', 'تم الصرف', 'مكتمل']
export const PAYMENT_METHODS = ['كاش', 'انستاباي', 'تحويل']
export const INVOICE_TYPES   = ['بيان اسعار', 'فاتورة ضريبية']

// ─── Inventory — from "IoT Inventory.xlsx" ───────────────────────────────────
// Stock, Price, CostPrice → to be filled by Operations Manager
export const INITIAL_INVENTORY = [

  // ── Smart Lock — Lezn ─────────────────────────────────────────────────────
  { id:'inv-2396', sku:'2396', name:'Lezn IHand 01 MG',  nameAr:'قفل ذكي Lezn IHand 01 MG',  brand:'Lezn', stock:8,  price:0, costPrice:4200, minStock:3, category:'أقفال ذكية', supplier:'Lezn', notes:'' },
  { id:'inv-2395', sku:'2395', name:'Lezn IHand 01 SS',  nameAr:'قفل ذكي Lezn IHand 01 SS',  brand:'Lezn', stock:5,  price:0, costPrice:4200, minStock:3, category:'أقفال ذكية', supplier:'Lezn', notes:'' },
  { id:'inv-2633', sku:'2633', name:'Lezn ISmart S6 B',  nameAr:'قفل ذكي Lezn ISmart S6 B',  brand:'Lezn', stock:4,  price:0, costPrice:3800, minStock:3, category:'أقفال ذكية', supplier:'Lezn', notes:'' },
  { id:'inv-2634', sku:'2634', name:'Lezn ISmart S6 G',  nameAr:'قفل ذكي Lezn ISmart S6 G',  brand:'Lezn', stock:4,  price:0, costPrice:3800, minStock:3, category:'أقفال ذكية', supplier:'Lezn', notes:'' },
  { id:'inv-2393', sku:'2393', name:'Lezn IHand 02 MB',  nameAr:'قفل ذكي Lezn IHand 02 MB',  brand:'Lezn', stock:6,  price:0, costPrice:5100, minStock:3, category:'أقفال ذكية', supplier:'Lezn', notes:'' },
  { id:'inv-2394', sku:'2394', name:'Lezn IHand 02 SB',  nameAr:'قفل ذكي Lezn IHand 02 SB',  brand:'Lezn', stock:6,  price:0, costPrice:5100, minStock:3, category:'أقفال ذكية', supplier:'Lezn', notes:'' },
  { id:'inv-2679', sku:'2679', name:'Lezn IHand 02 CH',  nameAr:'قفل ذكي Lezn IHand 02 CH',  brand:'Lezn', stock:3,  price:0, costPrice:5100, minStock:3, category:'أقفال ذكية', supplier:'Lezn', notes:'' },
  { id:'inv-2681', sku:'2681', name:'Lezn IHand 02 MG',  nameAr:'قفل ذكي Lezn IHand 02 MG',  brand:'Lezn', stock:3,  price:0, costPrice:5100, minStock:3, category:'أقفال ذكية', supplier:'Lezn', notes:'' },
  { id:'inv-2744', sku:'2744', name:'Lezn IHand 03 MB',  nameAr:'قفل ذكي Lezn IHand 03 MB',  brand:'Lezn', stock:2,  price:0, costPrice:6300, minStock:3, category:'أقفال ذكية', supplier:'Lezn', notes:'' },
  { id:'inv-2658', sku:'2658', name:'Lezn ISmart 9 MG',  nameAr:'قفل ذكي Lezn ISmart 9 MG',  brand:'Lezn', stock:5,  price:0, costPrice:4700, minStock:3, category:'أقفال ذكية', supplier:'Lezn', notes:'' },
  { id:'inv-2627', sku:'2627', name:'Lezn ISmart 12 MG', nameAr:'قفل ذكي Lezn ISmart 12 MG', brand:'Lezn', stock:4,  price:0, costPrice:5500, minStock:3, category:'أقفال ذكية', supplier:'Lezn', notes:'' },
  { id:'inv-2642', sku:'2642', name:'Lezn ISmart 15 MG', nameAr:'قفل ذكي Lezn ISmart 15 MG', brand:'Lezn', stock:3,  price:0, costPrice:6800, minStock:3, category:'أقفال ذكية', supplier:'Lezn', notes:'' },
  { id:'inv-2503', sku:'2503', name:'Lezn ISmart 7 MG',  nameAr:'قفل ذكي Lezn ISmart 7 MG',  brand:'Lezn', stock:7,  price:0, costPrice:4400, minStock:3, category:'أقفال ذكية', supplier:'Lezn', notes:'' },
  { id:'inv-2516', sku:'2516', name:'Lezn ISmart 11 MG', nameAr:'قفل ذكي Lezn ISmart 11 MG', brand:'Lezn', stock:5,  price:0, costPrice:5300, minStock:3, category:'أقفال ذكية', supplier:'Lezn', notes:'' },

  // ── Smart Lock — Other Brands ─────────────────────────────────────────────
  { id:'inv-lev',  sku:'', name:'Levana Smart Lock',  nameAr:'قفل ذكي Levana', brand:'Levana',    stock:4,  price:0, costPrice:3500, minStock:3, category:'أقفال ذكية', supplier:'Levana',    notes:'' },
  { id:'inv-bos',  sku:'', name:'Bosch Smart Lock',   nameAr:'قفل ذكي Bosch',  brand:'Bosch',     stock:3,  price:0, costPrice:7200, minStock:3, category:'أقفال ذكية', supplier:'Bosch',     notes:'' },
  { id:'inv-dnk',  sku:'', name:'Dnake Smart Lock',   nameAr:'قفل ذكي Dnake',  brand:'Dnake',     stock:5,  price:0, costPrice:4900, minStock:3, category:'أقفال ذكية', supplier:'Dnake',     notes:'' },
  { id:'inv-pan',  sku:'', name:'Panda Smart Lock',   nameAr:'قفل ذكي Panda',  brand:'Panda',     stock:6,  price:0, costPrice:3200, minStock:3, category:'أقفال ذكية', supplier:'Panda',     notes:'' },
  { id:'inv-sib1', sku:'', name:'SIB Smart Lock',     nameAr:'قفل ذكي SIB',    brand:'SIB',       stock:4,  price:0, costPrice:4100, minStock:3, category:'أقفال ذكية', supplier:'SIB',       notes:'' },

  // ── Intercom ──────────────────────────────────────────────────────────────
  { id:'inv-sib2', sku:'', name:'SIB Intercom',       nameAr:'انتركم SIB',        brand:'SIB',       stock:5,  price:0, costPrice:2800, minStock:2, category:'انتركم',     supplier:'SIB',       notes:'' },
  { id:'inv-hik1', sku:'', name:'Hikvision Intercom', nameAr:'انتركم Hikvision',  brand:'Hikvision', stock:4,  price:0, costPrice:3600, minStock:2, category:'انتركم',     supplier:'Hikvision', notes:'' },

  // ── CCTV ──────────────────────────────────────────────────────────────────
  { id:'inv-hik2', sku:'', name:'Hikvision Camera',   nameAr:'كاميرا Hikvision',  brand:'Hikvision', stock:10, price:0, costPrice:1800, minStock:3, category:'كاميرات',    supplier:'Hikvision', notes:'' },
  { id:'inv-tuy',  sku:'', name:'Tuya Camera',         nameAr:'كاميرا Tuya',       brand:'Tuya',      stock:8,  price:0, costPrice:950,  minStock:3, category:'كاميرات',    supplier:'Tuya',      notes:'' },
  { id:'inv-son1', sku:'', name:'Sonoff Camera',       nameAr:'كاميرا Sonoff',     brand:'Sonoff',    stock:7,  price:0, costPrice:1100, minStock:3, category:'كاميرات',    supplier:'Sonoff',    notes:'' },
  { id:'inv-tap',  sku:'', name:'Tapo Camera',         nameAr:'كاميرا Tapo',       brand:'Tapo',      stock:9,  price:0, costPrice:1200, minStock:3, category:'كاميرات',    supplier:'TP-Link',   notes:'' },
  { id:'inv-ezv',  sku:'', name:'Ezviz Camera',        nameAr:'كاميرا Ezviz',      brand:'Ezviz',     stock:6,  price:0, costPrice:1400, minStock:3, category:'كاميرات',    supplier:'Ezviz',     notes:'' },

  // ── Smart Switch ──────────────────────────────────────────────────────────
  { id:'inv-son2', sku:'', name:'Sonoff Smart Switch', nameAr:'سويتش ذكي Sonoff',  brand:'Sonoff',    stock:15, price:0, costPrice:380,  minStock:5, category:'مفاتيح ذكية', supplier:'Sonoff',   notes:'' },
  { id:'inv-ava',  sku:'', name:'Avatto Smart Switch', nameAr:'سويتش ذكي Avatto',  brand:'Avatto',    stock:12, price:0, costPrice:420,  minStock:5, category:'مفاتيح ذكية', supplier:'Avatto',   notes:'' },
  { id:'inv-ip',   sku:'', name:'IP Smart Switch',     nameAr:'سويتش ذكي IP',      brand:'IP',        stock:10, price:0, costPrice:350,  minStock:5, category:'مفاتيح ذكية', supplier:'IP',       notes:'' },

  // ── Sensors ───────────────────────────────────────────────────────────────
  { id:'inv-son3', sku:'', name:'Sonoff Motion Sensor', nameAr:'حساس حركة Sonoff', brand:'Sonoff',    stock:20, price:0, costPrice:280,  minStock:5, category:'حساسات',      supplier:'Sonoff',   notes:'' },
  { id:'inv-son4', sku:'', name:'Sonoff Water Sensor',  nameAr:'حساس مياه Sonoff', brand:'Sonoff',    stock:15, price:0, costPrice:310,  minStock:5, category:'حساسات',      supplier:'Sonoff',   notes:'' },
  { id:'inv-son5', sku:'', name:'Sonoff Gas Sensor',    nameAr:'حساس غاز Sonoff',  brand:'Sonoff',    stock:12, price:0, costPrice:340,  minStock:5, category:'حساسات',      supplier:'Sonoff',   notes:'' },
]

export const INVENTORY_CATEGORIES = [
  'أقفال ذكية', 'انتركم', 'كاميرات', 'مفاتيح ذكية', 'حساسات', 'إكسسوارات', 'أنظمة تحكم',
]

export const INVENTORY_BRANDS = [
  'Lezn', 'Levana', 'Bosch', 'Dnake', 'Panda', 'SIB',
  'Hikvision', 'Tuya', 'Sonoff', 'Tapo', 'Ezviz',
  'Avatto', 'IP', 'TP-Link',
]

// ─── Empty starting data (no mock records) ───────────────────────────────────
export const INITIAL_ORDERS      = []
export const INITIAL_AUDIT_LOG   = []
export const INITIAL_TAX_INVOICES = []
