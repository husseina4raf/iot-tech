import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack)
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
