import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Layout({ children }) {
  return (
    <div style={{ display:'flex', height:'100vh', width:'100%', overflow:'hidden', background:'#f0f4fa' }}>
      <Sidebar />
      <div style={{ display:'flex', flexDirection:'column', flex:1, overflow:'hidden', minWidth:0 }}>
        <TopBar />
        <main style={{ flex:1, overflowY:'auto', padding:24 }}>
          {children}
        </main>
        <footer style={{
          textAlign:'center', padding:'10px 24px', fontSize:11, color:'#94a3b8',
          borderTop:'1px solid #e4eaf3', background:'#fff', flexShrink:0,
        }}>
          @ 2026 IoT Tech All rights reserved. Developed by H.Tech
        </footer>
      </div>
    </div>
  )
}
