import StatsCards from '../components/dashboard/StatsCards'
import SalesChart from '../components/dashboard/SalesChart'
import TopSalesPerson from '../components/dashboard/TopSalesPerson'
import RecentOrders from '../components/dashboard/RecentOrders'
import InventorySection from '../components/dashboard/InventorySection'
import { useMobile } from '../hooks/useMobile'

export default function DashboardPage() {
  const isMobile = useMobile()

  return (
    <div style={{ maxWidth:1280, margin:'0 auto', display:'flex', flexDirection:'column', gap:20 }}>
      <StatsCards />

      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr', gap:20 }}>
        <SalesChart />
        <TopSalesPerson />
      </div>

      <div style={{ display:'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap:20 }}>
        <RecentOrders />
        <InventorySection />
      </div>
    </div>
  )
}
