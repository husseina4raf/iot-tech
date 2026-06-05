export const USERS = [
  {
    id: 'u1',
    email: 'sales1@smarthome.com',
    password: 'sales123',
    role: 'sales',
    name: 'إسراء عبداللطيف',
    nameEn: 'Israa Abdullatif',
    repName: 'إسراء',
    avatar: 'إ',
  },
  {
    id: 'u2',
    email: 'sales2@smarthome.com',
    password: 'sales123',
    role: 'sales',
    name: 'محمد أحمد',
    nameEn: 'Mohamed Ahmed',
    repName: 'محمد',
    avatar: 'م',
  },
  {
    id: 'u3',
    email: 'admin@smarthome.com',
    password: 'admin123',
    role: 'admin',
    name: 'مدير العمليات',
    nameEn: 'Operations Manager',
    repName: null,
    avatar: 'م',
  },
  {
    id: 'u4',
    email: 'superadmin@smarthome.com',
    password: 'super123',
    role: 'super_admin',
    name: 'المدير العام',
    nameEn: 'General Manager',
    repName: null,
    avatar: 'م',
  },
]

export const ROLE_LABELS = {
  sales: 'مندوب مبيعات',
  admin: 'مدير',
  super_admin: 'مدير عام',
}

export const ROLE_COLORS = {
  sales: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  admin: 'bg-green-500/20 text-green-300 border border-green-500/30',
  super_admin: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
}

// Which routes each role can access
export const ROLE_ROUTES = {
  sales: ['/sales'],
  admin: ['/admin'],
  super_admin: ['/dashboard', '/admin'],
}

// Sales rep names — derived from actual user accounts (role === 'sales')
// This is the single source of truth for rep names across the app
export const SALES_REPS = USERS.filter(u => u.role === 'sales').map(u => u.repName)
