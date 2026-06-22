import { useState } from 'react'
import Sidebar from './Sidebar'
import TopBar from './TopBar'
import { useMobile } from '../../hooks/useMobile'

export default function Layout({ children }) {
  const isMobile = useMobile()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div style={{ display:'flex', height:'100vh', width:'100%', overflow:'hidden', background:'#f0f4fa' }}>
      <Sidebar isMobile={isMobile} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Mobile backdrop */}
      {isMobile && sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', zIndex:99, backdropFilter:'blur(2px)' }}
        />
      )}

      <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden', minWidth:0 }}>
        <TopBar isMobile={isMobile} onMenuOpen={() => setSidebarOpen(true)} />
        <main style={{ flex:1, overflowY:'auto', padding: isMobile ? 12 : 24 }}>
          {children}
        </main>
        <footer style={{
          textAlign:'center', padding:'10px 24px', fontSize:11, color:'#94a3b8',
          borderTop:'1px solid #e4eaf3', background:'#fff', flexShrink:0,
        }}>
          © 2026 <strong style={{ color:'#0f172a' }}>IoT Tech</strong> — All rights reserved &nbsp;|&nbsp; Developed by <strong style={{ color:'#2563eb' }}>Nexus</strong>
        </footer>
      </div>
    </div>
  )
}
