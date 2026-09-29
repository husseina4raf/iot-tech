import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { mapOrder } from '../lib/mappers'

// ── Server-side paginated, date-filtered order listing ──────────────────────
// Thin wrapper around the `list_report_orders` RPC (see
// src/lib/order_reports.sql). Fixes the historical-invoice visibility gap:
// the frontend's shared `orders` array (useOrders.jsx) only ever holds the
// 100 most-recently-created orders company-wide, extended only by the
// Admin-only OrdersList screen. This hook instead queries the database
// directly for exactly the requested rep / period / status / page, so
// selecting an older month genuinely retrieves that month's orders rather
// than filtering whatever happened to already be loaded.
//
// One authoritative fetch per {repName, year, month, day, status, search,
// page, pageSize} combination — never merged/appended with a previous
// page's rows, so navigating pages or changing filters cannot duplicate
// records (each change simply replaces `orders` with its own fresh result).
export function useReportOrders({
  repName  = null,
  year     = null,
  month    = null,
  day      = null,
  status   = null,
  search   = null,
  page     = 1,
  pageSize = 15,
} = {}) {
  const [orders,       setOrders]       = useState([])
  const [totalCount,   setTotalCount]   = useState(0)
  const [totalRevenue, setTotalRevenue] = useState(0)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)

  useEffect(() => {
    let cancelled = false
    // Reset via a resolved-promise callback rather than directly in the
    // effect body — same pattern used in useProfitSummary.js / useOrders.jsx.
    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading(true)
      setError(null)
    })
    supabase.rpc('list_report_orders', {
      p_rep_name: repName || null,
      p_year:     year    || null,
      p_month:    month   || null,
      p_day:      day     || null,
      p_status:   status  || null,
      p_search:   search  || null,
      p_limit:    pageSize,
      p_offset:   (Math.max(1, page) - 1) * pageSize,
    }).then(({ data, error: rpcError }) => {
      if (cancelled) return
      if (rpcError) {
        console.error('list_report_orders:', rpcError)
        setError(rpcError.message)
        setOrders([])
        setTotalCount(0)
        setTotalRevenue(0)
      } else {
        const rows = data || []
        setOrders(rows.map(r => mapOrder(r.order_row)))
        setTotalCount(rows.length > 0 ? Number(rows[0].total_count) || 0 : 0)
        setTotalRevenue(rows.length > 0 ? Number(rows[0].total_revenue) || 0 : 0)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [repName, year, month, day, status, search, page, pageSize])

  return { orders, totalCount, totalRevenue, loading, error }
}
