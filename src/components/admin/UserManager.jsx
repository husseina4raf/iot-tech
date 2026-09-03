import { useState } from 'react'
import { UserPlus, Trash2, X, Check, User, Lock, AtSign, ChevronDown, RefreshCw } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../ui/Toast'
import { ROLE_LABELS } from '../../data/authData'

// ── Shared styles ─────────────────────────────────────────────────────────────
const card    = { background: '#fff', borderRadius: 14, border: '1px solid #e4eaf3', boxShadow: '0 1px 4px rgba(15,23,42,0.06)' }
const iStyle  = { width: '100%', padding: '9px 12px', fontSize: 13, border: '1.5px solid #e4eaf3', borderRadius: 8, background: '#f8fafc', color: '#0f172a', outline: 'none', fontFamily: 'Cairo,sans-serif', boxSizing: 'border-box' }
const focSty  = { borderColor: '#2563eb', background: '#fff', boxShadow: '0 0 0 3px rgba(37,99,235,0.1)' }

// ── Role badge/selector config ────────────────────────────────────────────────
const ROLE_BADGE = {
  sales:       { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', label: 'مسئول مبيعات' },
  team_leader: { bg: '#ecfeff', color: '#0e7490', border: '#a5f3fc', label: 'قائد فريق'    },
  admin:       { bg: '#f0fdf4', color: '#15803d', border: '#86efac', label: 'مدير'          },
  super_admin: { bg: '#fff7ed', color: '#c2410c', border: '#fed7aa', label: 'مدير عام'      },
}

// ── Permission helper ─────────────────────────────────────────────────────────
// Returns the list of roles that `currentUser` is allowed to assign to `targetUser`.
// Returns [] if the target cannot be changed by this user.
function getAllowedNewRoles(currentUser, targetUser) {
  if (!currentUser || !targetUser) return []
  if (currentUser.id === targetUser.id) return []   // cannot change own role

  if (currentUser.role === 'admin') {
    // Admin: only sales ↔ team_leader
    if (!['sales', 'team_leader'].includes(targetUser.role)) return []
    return ['sales', 'team_leader']
  }

  if (currentUser.role === 'super_admin') {
    // Super Admin: can assign any role to any user except themselves
    return ['sales', 'team_leader', 'admin', 'super_admin']
  }

  return []
}

// ── Small input with icon ─────────────────────────────────────────────────────
function FInput({ label, required, icon: Icon, ...props }) {
  const [f, setF] = useState(false)
  return (
    <div>
      {label && (
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 5 }}>
          {label}{required && <span style={{ color: '#e11d48' }}> *</span>}
        </label>
      )}
      <div style={{ position: 'relative' }}>
        {Icon && <Icon size={14} color="#94a3b8" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />}
        <input {...props}
          style={{ ...iStyle, ...(f ? focSty : {}), paddingRight: Icon ? 32 : 12 }}
          onFocus={() => setF(true)} onBlur={() => setF(false)}
        />
      </div>
    </div>
  )
}

// ── Inline role selector for a single user row ────────────────────────────────
function RoleSelector({ targetUser, currentUser, onSaved }) {
  const { changeUserRole } = useAuth()
  const toast = useToast()
  const allowedRoles = getAllowedNewRoles(currentUser, targetUser)
  const [selected, setSelected]   = useState(targetUser.role)
  const [saving,   setSaving]     = useState(false)

  // keep local selection in sync if targetUser.role changes (after a save)
  const isDirty = selected !== targetUser.role

  if (allowedRoles.length === 0) {
    // Not editable — show static badge
    const b = ROLE_BADGE[targetUser.role]
    return (
      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: b.bg, color: b.color, border: `1px solid ${b.border}`, fontWeight: 700 }}>
        {b.label}
      </span>
    )
  }

  const handleSave = async () => {
    if (!isDirty) return
    const prevLabel = ROLE_BADGE[targetUser.role]?.label || targetUser.role
    const newLabel  = ROLE_BADGE[selected]?.label || selected
    const extra     = selected === 'super_admin' || targetUser.role === 'super_admin'
      ? '\n\nتغيير دور المدير العام قد يؤثر على صلاحيات النظام.'
      : ''
    if (!window.confirm(
      `هل تريد تغيير صلاحية "${targetUser.name}" من "${prevLabel}" إلى "${newLabel}"؟${extra}`
    )) return

    setSaving(true)
    try {
      await changeUserRole(targetUser.id, selected)
      toast(`تم تغيير صلاحية "${targetUser.name}" إلى ${newLabel} ✓`, 'success')
      onSaved?.()
    } catch (err) {
      toast(err.message || 'فشل تغيير الصلاحية', 'error')
      setSelected(targetUser.role)   // roll back local selection
    } finally {
      setSaving(false)
    }
  }

  const b = ROLE_BADGE[selected] || ROLE_BADGE.sales
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ position: 'relative' }}>
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          disabled={saving}
          dir="rtl"
          style={{
            padding: '5px 28px 5px 10px', fontSize: 12, fontWeight: 700,
            border: `1.5px solid ${isDirty ? '#f59e0b' : b.border}`,
            borderRadius: 8, background: b.bg, color: b.color,
            outline: 'none', cursor: saving ? 'wait' : 'pointer',
            fontFamily: 'Cairo,sans-serif', appearance: 'none', WebkitAppearance: 'none',
          }}
        >
          {allowedRoles.map(r => (
            <option key={r} value={r}>{ROLE_BADGE[r].label}</option>
          ))}
        </select>
        <ChevronDown size={12} color={b.color} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
      </div>

      {isDirty && (
        <>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, border: 'none', background: saving ? '#94a3b8' : '#059669', color: '#fff', fontSize: 11, cursor: saving ? 'wait' : 'pointer', fontFamily: 'Cairo,sans-serif', fontWeight: 700 }}
          >
            {saving
              ? <RefreshCw size={11} style={{ animation: 'spin 0.7s linear infinite' }} />
              : <Check size={11} />}
            {saving ? 'جارٍ الحفظ...' : 'حفظ'}
          </button>
          <button
            onClick={() => setSelected(targetUser.role)}
            disabled={saving}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 8px', borderRadius: 7, border: '1.5px solid #e4eaf3', background: '#f8fafc', color: '#64748b', fontSize: 11, cursor: 'pointer', fontFamily: 'Cairo,sans-serif', fontWeight: 600 }}
          >
            <X size={11} />إلغاء
          </button>
        </>
      )}
    </div>
  )
}

// ── Add-user form (unchanged logic, refreshed styles) ─────────────────────────
const emptyForm = () => ({ name: '', nameEn: '', repName: '', username: '', password: '', role: 'sales' })

const isValidName = (v) => {
  if (/https?:\/\/|www\./i.test(v)) return false
  if (/\d{4,}/.test(v)) return false
  if (/[<>{}\[\]\\|@#$%^&*+=]/.test(v)) return false
  return v.trim().length > 0
}

// ── Main component ────────────────────────────────────────────────────────────
export default function UserManager() {
  const { users, addUser, deleteUser, user: currentUser } = useAuth()
  const toast = useToast()
  const [showForm,  setShowForm]  = useState(false)
  const [form,      setForm]      = useState(emptyForm())
  const [errors,    setErrors]    = useState({})
  const [roleKey,   setRoleKey]   = useState(0)   // bumped after a role save to re-mount selectors

  const upd = (f, v) => { setForm(p => ({ ...p, [f]: v })); setErrors(p => ({ ...p, [f]: '' })) }

  // ── Validation ───────────────────────────────────────────────
  const validate = () => {
    const e = {}
    if (!form.name.trim()) e.name = 'الاسم بالعربي مطلوب'
    else if (!isValidName(form.name)) e.name = 'الاسم غير صحيح — لا يقبل أرقام أو روابط'
    if (!form.repName.trim()) e.repName = 'اسم العرض مطلوب'
    else if (!isValidName(form.repName)) e.repName = 'اسم العرض غير صحيح'
    if (form.nameEn.trim() && !/^[a-zA-Z\s'-]+$/.test(form.nameEn.trim()))
      e.nameEn = 'الاسم الإنجليزي: أحرف إنجليزية فقط'
    if (!form.username.trim()) e.username = 'اسم المستخدم مطلوب'
    else if (!/^[a-zA-Z0-9_]+$/.test(form.username.trim()))
      e.username = 'أحرف إنجليزية وأرقام وـ فقط'
    else if (users.some(u => u.username?.toLowerCase() === form.username.toLowerCase().trim()))
      e.username = 'اسم المستخدم مستخدم بالفعل'
    if (!form.password) e.password = 'كلمة المرور مطلوبة'
    else if (form.password.length < 6) e.password = 'كلمة المرور 6 أحرف على الأقل'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      await addUser({
        name:     form.name.trim(),
        nameEn:   form.nameEn.trim() || form.name.trim(),
        repName:  form.repName.trim(),
        username: form.username.trim().toLowerCase(),
        password: form.password,
        role:     form.role || 'sales',
      })
      const label = ROLE_BADGE[form.role]?.label || form.role
      toast(`تم إضافة ${label} بنجاح ✓`, 'success')
      setShowForm(false)
      setForm(emptyForm())
      setErrors({})
    } catch (err) {
      toast(err.message || 'فشل إضافة المستخدم — حاول مرة أخرى', 'error')
    } finally {
      setSaving(false)
    }
  }

  const [deleting, setDeleting] = useState(null)   // userId currently being deleted

  const handleDelete = async (u) => {
    if (u.id === currentUser?.id) return toast('لا يمكنك حذف حسابك الحالي', 'error')
    if (!window.confirm(`هل أنت متأكد من حذف "${u.name}"؟`)) return
    setDeleting(u.id)
    try {
      await deleteUser(u.id)
      toast(`تم حذف "${u.name}" بنجاح ✓`, 'success')
    } catch (err) {
      toast(err.message || 'فشل حذف المستخدم — حاول مرة أخرى', 'error')
    } finally {
      setDeleting(null)
    }
  }

  // ── User grouping ────────────────────────────────────────────
  const salesUsers = users.filter(u => u.role === 'sales' || u.role === 'team_leader')

  // ── Role options for the add-user form ───────────────────────
  const addFormRoles = [
    { val: 'sales',       ...ROLE_BADGE.sales       },
    { val: 'team_leader', ...ROLE_BADGE.team_leader  },
    ...(currentUser?.role === 'super_admin' ? [
      { val: 'admin',       ...ROLE_BADGE.admin       },
      { val: 'super_admin', ...ROLE_BADGE.super_admin },
    ] : []),
  ]

  const selectedAddRole = addFormRoles.find(o => o.val === form.role) || addFormRoles[0]

  return (
    <div>
      {/* ── Header ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#64748b' }}>
          <span style={{ fontWeight: 700, color: '#0f172a' }}>{users.filter(u => u.role === 'sales').length}</span> مندوب
          <span style={{ margin: '0 6px', color: '#cbd5e1' }}>·</span>
          <span style={{ fontWeight: 700, color: '#0f172a' }}>{users.filter(u => u.role === 'team_leader').length}</span> قائد فريق
          <span style={{ margin: '0 6px', color: '#cbd5e1' }}>·</span>
          <span style={{ fontWeight: 700, color: '#0f172a' }}>{users.filter(u => u.role === 'admin').length}</span> مدير
        </div>
        <button onClick={() => { setShowForm(true); setForm(emptyForm()); setErrors({}) }}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'Cairo,sans-serif', boxShadow: '0 3px 10px rgba(37,99,235,0.3)' }}>
          <UserPlus size={14} />إضافة مستخدم
        </button>
      </div>

      {/* ── Add-user form ─────────────────────────────────────────── */}
      {showForm && (
        <div style={{ ...card, padding: 20, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <UserPlus size={15} color="#2563eb" />إضافة مستخدم جديد
            </h3>
            <button onClick={() => { setShowForm(false); setErrors({}) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
              <X size={18} />
            </button>
          </div>

          {/* Role selector */}
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
              الصلاحية <span style={{ color: '#e11d48' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <select value={form.role} onChange={e => upd('role', e.target.value)} dir="rtl"
                style={{ width: '100%', padding: '10px 14px', fontSize: 13, fontWeight: 700, border: `2px solid ${selectedAddRole.border}`, borderRadius: 10, background: selectedAddRole.bg, color: selectedAddRole.color, outline: 'none', cursor: 'pointer', fontFamily: 'Cairo,sans-serif', appearance: 'none', WebkitAppearance: 'none' }}>
                {addFormRoles.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
              </select>
              <ChevronDown size={14} color={selectedAddRole.color} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>
          </div>

          <div className="m-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <FInput label="الاسم الكامل (عربي)" required icon={User}
                value={form.name} onChange={e => upd('name', e.target.value)} placeholder="مثال: أحمد محمد علي" />
              {errors.name && <span style={{ fontSize: 11, color: '#e11d48' }}>{errors.name}</span>}
            </div>
            <div>
              <FInput label="الاسم (إنجليزي)" icon={User}
                value={form.nameEn} onChange={e => upd('nameEn', e.target.value)} placeholder="Ahmed Mohamed" dir="ltr" />
              {errors.nameEn && <span style={{ fontSize: 11, color: '#e11d48' }}>{errors.nameEn}</span>}
            </div>
            <div>
              <FInput label="اسم العرض في التقارير" required icon={User}
                value={form.repName} onChange={e => upd('repName', e.target.value)} placeholder="مثال: أحمد" />
              {errors.repName && <span style={{ fontSize: 11, color: '#e11d48' }}>{errors.repName}</span>}
            </div>
            <div>
              <FInput label="اسم المستخدم (للدخول)" required icon={AtSign}
                value={form.username} onChange={e => upd('username', e.target.value)} placeholder="ahmed123" dir="ltr" autoCapitalize="none" />
              {errors.username && <span style={{ fontSize: 11, color: '#e11d48' }}>{errors.username}</span>}
            </div>
            <div>
              <FInput label="كلمة المرور" required icon={Lock}
                value={form.password} onChange={e => upd('password', e.target.value)} placeholder="6 أحرف على الأقل" dir="ltr" type="password" />
              {errors.password && <span style={{ fontSize: 11, color: '#e11d48' }}>{errors.password}</span>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => { setShowForm(false); setErrors({}) }}
              style={{ padding: '8px 16px', borderRadius: 8, border: '1.5px solid #e4eaf3', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Cairo,sans-serif' }}>
              إلغاء
            </button>
            <button onClick={handleSave} disabled={saving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, border: 'none', background: saving ? '#94a3b8' : 'linear-gradient(135deg,#1d4ed8,#2563eb)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', fontFamily: 'Cairo,sans-serif' }}>
              {saving ? <RefreshCw size={14} style={{ animation: 'spin 0.7s linear infinite' }} /> : <Check size={14} />}
              {saving ? 'جارٍ الإضافة...' : 'إضافة المستخدم'}
            </button>
          </div>
        </div>
      )}

      {/* ── Table 1: Sales & Team Leaders ────────────────────────── */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f4fa', display: 'flex', alignItems: 'center', gap: 8 }}>
          <User size={15} color="#2563eb" />
          <h3 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>مسؤولو المبيعات وقادة الفريق</h3>
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontWeight: 700 }}>{salesUsers.length}</span>
        </div>
        {salesUsers.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>لا يوجد مستخدمون في هذه المجموعة</div>
        ) : (
          <div className="m-table-scroll">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 580 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['المستخدم', 'اسم العرض', 'اسم الدخول', 'الصلاحية', 'إجراءات'].map((h, i) => (
                    <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#64748b', textAlign: i === 0 ? 'right' : 'center', borderBottom: '1px solid #f0f4fa' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {salesUsers.map(u => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f8fafc' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                          {u.name?.[0]}
                        </div>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{u.name}</div>
                      </div>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{u.repName || '—'}</span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <span style={{ fontSize: 12, fontFamily: 'monospace', padding: '2px 8px', borderRadius: 6, background: '#f0f4fa', color: '#475569', border: '1px solid #e4eaf3' }} dir="ltr">{u.username || '—'}</span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <RoleSelector key={`${u.id}-${roleKey}`} targetUser={u} currentUser={currentUser} onSaved={() => setRoleKey(k => k + 1)} />
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <button onClick={() => handleDelete(u)}
                        disabled={deleting === u.id}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 7, border: '1.5px solid #fecdd3', background: deleting === u.id ? '#f1f5f9' : '#fff1f2', color: deleting === u.id ? '#94a3b8' : '#e11d48', fontSize: 11, cursor: deleting === u.id ? 'wait' : 'pointer', fontFamily: 'Cairo,sans-serif', fontWeight: 600 }}
                        onMouseEnter={e => { if (deleting !== u.id) e.currentTarget.style.background = '#ffe4e6' }}
                        onMouseLeave={e => { if (deleting !== u.id) e.currentTarget.style.background = '#fff1f2' }}>
                        {deleting === u.id
                          ? <RefreshCw size={11} style={{ animation: 'spin 0.7s linear infinite' }} />
                          : <Trash2 size={11} />}
                        {deleting === u.id ? 'جارٍ الحذف...' : 'حذف'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  )
}
