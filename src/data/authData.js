export const USERS = [
  {
    id: 'u1',
    username: 'israa',
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
    username: 'mohamed',
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
    username: 'admin',
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
    username: 'superadmin',
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
  sales: ' مسئول  مبيعات',
  team_leader: 'قائد فريق',
  admin: 'مدير',
  super_admin: 'مدير عام',
}

export const ROLE_COLORS = {
  sales: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
  team_leader: 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30',
  admin: 'bg-green-500/20 text-green-300 border border-green-500/30',
  super_admin: 'bg-orange-500/20 text-orange-300 border border-orange-500/30',
}

// Which routes each role can access
export const ROLE_ROUTES = {
  sales: ['/sales'],
  team_leader: ['/team-leader'],
  admin: ['/admin', '/team-leader'],
  super_admin: ['/dashboard', '/admin', '/team-leader'],
}

// Sales rep names — derived from actual user accounts (role === 'sales')
// This is the single source of truth for rep names across the app
export const SALES_REPS = USERS.filter(u => u.role === 'sales').map(u => u.repName)
