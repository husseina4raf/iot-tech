import StatsCards from '../components/dashboard/StatsCards'
import SalesChart from '../components/dashboard/SalesChart'
import TopSalesPerson from '../components/dashboard/TopSalesPerson'
import RecentOrders from '../components/dashboard/RecentOrders'
import InventorySection from '../components/dashboard/InventorySection'

export default function DashboardPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <StatsCards />

      <div className="grid grid-cols-3 gap-5">
        <div className="col-span-2">
          <SalesChart />
        </div>
        <div>
          <TopSalesPerson />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        <RecentOrders />
        <InventorySection />
      </div>
    </div>
  )
}
