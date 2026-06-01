import { createContext, useContext, useState, useEffect } from 'react'
import { INITIAL_ORDERS, INITIAL_INVENTORY } from '../data/mockData'

const OrdersContext = createContext(null)

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function OrdersProvider({ children }) {
  const [orders, setOrders] = useState(() => loadFromStorage('sl_orders', INITIAL_ORDERS))
  const [inventory, setInventory] = useState(() => loadFromStorage('sl_inventory', INITIAL_INVENTORY))

  useEffect(() => { localStorage.setItem('sl_orders', JSON.stringify(orders)) }, [orders])
  useEffect(() => { localStorage.setItem('sl_inventory', JSON.stringify(inventory)) }, [inventory])

  const getNextSerial = () => {
    const nums = orders.map(o => parseInt(o.serialNumber, 10)).filter(Boolean)
    const max = nums.length ? Math.max(...nums) : 20240000
    return String(max + 1)
  }

  const addOrder = (orderData) => {
    const serial = getNextSerial()
    const newOrder = {
      ...orderData,
      id: `ORD-${serial}`,
      serialNumber: serial,
      status: 'جديد',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      editHistory: [],
    }
    setOrders(prev => [newOrder, ...prev])
    return newOrder
  }

  const updateOrder = (id, orderData) => {
    setOrders(prev => prev.map(o => {
      if (o.id !== id) return o
      return {
        ...o,
        ...orderData,
        updatedAt: new Date().toISOString(),
        editHistory: [...(o.editHistory || []), { editedAt: new Date().toISOString(), note: 'تم التعديل' }],
      }
    }))
  }

  const updateOrderStatus = (id, status) => {
    setOrders(prev => prev.map(o => {
      if (o.id !== id) return o
      const updated = { ...o, status, updatedAt: new Date().toISOString() }
      if (status === 'تم الصرف') {
        // Deduct from inventory
        setInventory(inv => inv.map(item => {
          const orderItem = o.items.find(i =>
            i.name.toLowerCase().includes(item.name.toLowerCase()) ||
            item.name.toLowerCase().includes(i.name.toLowerCase())
          )
          if (orderItem) {
            return { ...item, stock: Math.max(0, item.stock - orderItem.quantity) }
          }
          return item
        }))
      }
      return updated
    }))
  }

  const getOrdersByRep = (rep) => orders.filter(o => o.salesRep === rep)

  return (
    <OrdersContext.Provider value={{ orders, inventory, addOrder, updateOrder, updateOrderStatus, getOrdersByRep }}>
      {children}
    </OrdersContext.Provider>
  )
}

export function useOrders() {
  const ctx = useContext(OrdersContext)
  if (!ctx) throw new Error('useOrders must be used within OrdersProvider')
  return ctx
}
