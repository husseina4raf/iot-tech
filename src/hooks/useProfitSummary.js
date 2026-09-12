import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ── Canonical Profit aggregation ──────────────────────────────────────────
// Thin wrapper around the `get_profit_summary` RPC (see
// src/lib/profit_aggregation.sql). This queries the COMPLETE `orders`
// table server-side — it is intentionally independent of whatever pages
// OrdersList has paginated into the frontend `orders` array, and
// independent of the current live `inventory` cost (the RPC uses each
// order's own stored item.costPrice snapshot).
//
// Returns one row per matching sales rep: { rep_name, order_count,
// total_subtotal, total_cost, total_profit }. Pass repName to scope to a
// single rep (e.g. a Sales user's own report), or leave it null to get a
// row per rep (e.g. a Leaderboard ranking all reps).
export function useProfitSummary({ repName = null, year = null, month = null, day = null } = {}) {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    let cancelled = false
    // Reset via a resolved-promise callback rather than directly in the
    // effect body — same tick, same behavior, just not a top-level setState
    // call the effect itself makes (same pattern used for the Issue #1 fix
    // in useOrders.jsx).
    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading(true)
      setError(null)
    })
    supabase.rpc('get_profit_summary', {
      p_rep_name: repName || null,
      p_year:     year    || null,
      p_month:    month   || null,
      p_day:      day     || null,
    }).then(({ data, error: rpcError }) => {
      if (cancelled) return
      if (rpcError) {
        console.error('get_profit_summary:', rpcError)
        setError(rpcError.message)
        setRows([])
      } else {
        setRows(data || [])
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [repName, year, month, day])

  return { rows, loading, error }
}
