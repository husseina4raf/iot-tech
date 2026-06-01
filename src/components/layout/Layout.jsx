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
      </div>
    </div>
  )
}
