import { Component } from 'react'

// ── Chunk-loading failure detection ──────────────────────────────────────────
// After a new deployment, a browser tab that already loaded the *previous*
// bundle can still hold a `React.lazy()` reference to a hashed chunk filename
// that no longer exists (the new deployment produced different hashes). The
// resulting dynamic `import()` rejection surfaces as one of these well-known
// browser/bundler error signatures — never as any other kind of app error —
// so matching on them narrowly is safe against false positives.
const CHUNK_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /chunkloaderror/i,
  /loading chunk [\w.-]+ failed/i,
  /loading css chunk [\w.-]+ failed/i,
]

function isChunkLoadError(error) {
  if (!error) return false
  const text = `${error.name || ''} ${error.message || ''}`
  return CHUNK_ERROR_PATTERNS.some(pattern => pattern.test(text))
}

// sessionStorage (not localStorage): the recovery guard must be scoped to the
// current tab/session, not permanently disable recovery for the user across
// future visits.
const RELOAD_GUARD_KEY = 'chunk-reload-attempted'

function hasAttemptedReload() {
  try {
    return sessionStorage.getItem(RELOAD_GUARD_KEY) === '1'
  } catch {
    // sessionStorage unavailable (e.g. disabled) — fail safe: treat as
    // "already attempted" so we never risk a reload loop.
    return true
  }
}

function markReloadAttempted() {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, '1')
  } catch {
    // Ignore — if we can't persist the guard, hasAttemptedReload() above
    // already fails safe by reporting "attempted" on the next check.
  }
}

function clearReloadGuard() {
  try {
    sessionStorage.removeItem(RELOAD_GUARD_KEY)
  } catch {
    // Nothing to do — non-fatal.
  }
}

// How long the app must run without hitting the ErrorBoundary again before
// the reload guard is cleared. Long enough that an immediate repeat failure
// (the exact case the guard exists to catch) still finds the marker in place;
// short enough that a later, genuinely separate deployment transition in the
// same tab can still recover automatically instead of requiring a manual
// refresh for the rest of the session.
const RELOAD_GUARD_CLEAR_DELAY_MS = 10000

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidMount() {
    // Reached only on a genuine (re)mount of the whole app — i.e. after a
    // real page load/reload, before any render error has occurred. Clearing
    // here (after the delay) is what lets a *later* deployment transition in
    // this same tab session recover again, without weakening the guard
    // against the immediate repeat failure the reload was meant to fix.
    this._clearGuardTimer = setTimeout(clearReloadGuard, RELOAD_GUARD_CLEAR_DELAY_MS)
  }

  componentWillUnmount() {
    clearTimeout(this._clearGuardTimer)
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack)

    if (isChunkLoadError(error) && !hasAttemptedReload()) {
      // Set the guard BEFORE reloading — it must already be in place by the
      // time the reloaded page re-runs this same check, or a genuinely
      // broken deployment would reload forever instead of falling back to
      // the manual error screen below.
      markReloadAttempted()
      window.location.reload()
    }
    // If a chunk error recurs with the guard already set, or this is any
    // other kind of error, we fall through to render() below and show the
    // existing manual error screen — unchanged from before this change.
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f9fafb', fontFamily:'sans-serif', direction:'rtl' }}>
          <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:12, padding:40, maxWidth:480, textAlign:'center', boxShadow:'0 4px 16px #0001' }}>
            <div style={{ fontSize:48, marginBottom:16 }}>⚠️</div>
            <h2 style={{ color:'#111827', marginBottom:8 }}>حدث خطأ غير متوقع</h2>
            <p style={{ color:'#6b7280', marginBottom:24, lineHeight:1.6 }}>
              واجه التطبيق مشكلة. يرجى تحديث الصفحة، وإذا استمرت المشكلة تواصل مع الدعم الفني.
            </p>
            <details style={{ textAlign:'left', direction:'ltr', background:'#f3f4f6', borderRadius:8, padding:12, marginBottom:24, fontSize:12, color:'#374151' }}>
              <summary style={{ cursor:'pointer', fontWeight:600 }}>تفاصيل الخطأ</summary>
              <pre style={{ marginTop:8, whiteSpace:'pre-wrap', wordBreak:'break-all' }}>
                {this.state.error.message}
              </pre>
            </details>
            <button
              onClick={() => window.location.reload()}
              style={{ background:'#2563eb', color:'#fff', border:'none', borderRadius:8, padding:'10px 28px', fontSize:15, cursor:'pointer', fontWeight:600 }}
            >
              تحديث الصفحة
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
