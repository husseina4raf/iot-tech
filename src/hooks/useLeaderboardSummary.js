import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ── Leaderboard aggregation (separate from Profit) ────────────────────────
// Thin wrapper around the `get_leaderboard_summary` RPC (see
// src/lib/leaderboard_aggregation.sql). Unlike useProfitSummary/
// get_profit_summary — which deliberately restricts a 'sales' caller to
// their own rep, to protect private financial-report data — this RPC lets
// any authenticated sales/team_leader/admin/super_admin caller see every
// qualifying rep's aggregated total, because the Leaderboard is an
// intentionally shared ranking, not a private report. It still excludes
// team_leader reps from what a 'sales' caller receives, enforced
// server-side. Returns one row per rep: { rep_name, order_count,
// total_profit } — no revenue/cost breakdown, matching exactly what the
// Leaderboard displays.
export function useLeaderboardSummary({ year = null, month = null, day = null } = {}) {
  const [rows,    setRows]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    let cancelled = false
    // Reset via a resolved-promise callback rather than directly in the
    // effect body — same pattern used by useProfitSummary.js.
    Promise.resolve().then(() => {
      if (cancelled) return
      setLoading(true)
      setError(null)
    })
    supabase.rpc('get_leaderboard_summary', {
      p_year:  year  || null,
      p_month: month || null,
      p_day:   day   || null,
    }).then(({ data, error: rpcError }) => {
      if (cancelled) return
      if (rpcError) {
        console.error('get_leaderboard_summary:', rpcError)
        setError(rpcError.message)
        setRows([])
      } else {
        setRows(data || [])
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [year, month, day])

  return { rows, loading, error }
}
