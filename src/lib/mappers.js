const parseAddress = (address) => {
  if (!address) return { governorate:'', city:'', district:'', street:'', buildingNo:'' }
  const p = address.split(' — ')
  if (p.length >= 5) return { governorate:p[0], city:p[1], district:p[2], street:p[3], buildingNo:p[4] }
  if (p.length === 4) return { governorate:p[0], city:p[1], district:p[2], street:p[3], buildingNo:'' }
  if (p.length === 3) return { governorate:p[0], city:p[1], district:'',   street:p[2], buildingNo:'' }
  if (p.length === 2) return { governorate:p[0], city:'',   district:'',   street:p[1], buildingNo:'' }
  return { governorate:'', city:'', district:'', street:p[0], buildingNo:'' }
}

export const mapOrder = r => ({
  id: r.id, serialNumber: r.serial_number,
  clientName: r.client_name, company: r.company,
  mobile: r.mobile, whatsapp: r.whatsapp,
  address: r.address, locationLink: r.location_link,
  ...parseAddress(r.address),
  salesRep: r.sales_rep, items: r.items || [],
  subtotal: r.subtotal, vatPercent: r.vat_percent,
  vatAmount: r.vat_amount, total: r.total,
  invoiceType: r.invoice_type, invoiceName: r.invoice_name,
  taxNumber: r.tax_number, notes: r.notes,
  paymentMethod: r.payment_method, date: r.date, time: r.time,
  status: r.status, createdAt: r.created_at, updatedAt: r.updated_at,
  editHistory: r.edit_history || [],
})

export const mapItem = r => ({
  id: r.id, name: r.name, nameAr: r.name_ar, sku: r.sku, model: r.model,
  brand: r.brand, category: r.category,
  price: r.price, costPrice: r.cost_price,
  stock: r.stock, minStock: r.min_stock, lots: r.lots || [],
  description: r.description, warranty: r.warranty,
  supplier: r.supplier, notes: r.notes,
})

export const mapAudit = r => ({
  id: r.id, type: r.type, orderId: r.order_id,
  orderRef: r.order_ref, field: r.field,
  oldValue: r.old_value, newValue: r.new_value,
  changedBy: r.changed_by, note: r.note, changedAt: r.changed_at,
})

export const mapTax = r => ({
  id: r.id, orderId: r.order_id, clientName: r.client_name,
  filename: r.filename, amount: r.amount, invoiceDate: r.invoice_date,
  uploadedAt: r.uploaded_at, uploadedBy: r.uploaded_by, verified: r.verified,
})

export const mapTarget = r => ({
  id: r.id, repName: r.rep_name, month: r.month,
  target: r.target, setBy: r.set_by,
})
