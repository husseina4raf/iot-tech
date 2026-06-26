import { useState } from 'react'
import { X, HelpCircle, CheckCircle, ChevronDown, ChevronUp, AlertTriangle, Star } from 'lucide-react'

const GUIDES = {
  sales: {
    role: 'مندوب المبيعات',
    color: '#3b82f6',
    bg: '#eff6ff',
    border: '#bfdbfe',
    intro: 'مهمتك الأساسية هي تسجيل طلبات العملاء وإرسالها للمراجعة.',
    steps: [
      { title: 'اضغط "طلب جديد"', desc: 'من التاب الأول في أعلى الصفحة' },
      { title: 'اكتب بيانات العميل كلها', desc: 'الاسم، الموبايل، الواتساب، العنوان (المحافظة + المدينة + الشارع)، ورابط الموقع على الخريطة' },
      { title: 'أضف الأصناف', desc: 'ابحث عن المنتج من القائمة وأدخل الكمية والسعر — الكمية والسعر مطلوبين' },
      { title: 'اختار بيانات الفاتورة', desc: 'نوع الفاتورة، الفاتورة باسم مين، طريقة الدفع، تاريخ ووقت التركيب' },
      { title: 'اضغط "إرسال الطلب"', desc: 'الطلب بيروح لقائد الفريق للمراجعة والموافقة' },
    ],
    statuses: [
      { label: 'بانتظار الموافقة', color: '#f97316', desc: 'الطلب عند القائد للمراجعة' },
      { label: 'موافق عليه', color: '#059669', desc: 'القائد وافق — الأدمن هيكمّل' },
      { label: 'تم الصرف', color: '#d97706', desc: 'المنتجات اتصرفت للعميل' },
      { label: 'مكتمل', color: '#7c3aed', desc: 'التركيب اتعمل' },
      { label: 'تم التحصيل', color: '#10b981', desc: 'تم تحصيل المبلغ ✓' },
      { label: 'مرفوض', color: '#e11d48', desc: 'القائد رفض — عدّل وابعت تاني' },
    ],
    warnings: [
      'لازم تحط رابط الموقع على الخريطة مع كل طلب',
      'وقت التركيب مطلوب — بيظهر في الكالندر',
      'المحافظة والمدينة والشارع كلهم مطلوبين',
      'لو اترفض الطلب، روح "فواتيري" واضغط "تعديل" وصلّح البيانات',
      'تقرير الأرباح بيظهر بس الطلبات اللي "تم التحصيل"',
    ],
  },

  team_leader: {
    role: 'قائد الفريق',
    color: '#0891b2',
    bg: '#ecfeff',
    border: '#a5f3fc',
    intro: 'مهمتك مراجعة طلبات المندوبين والموافقة عليها أو رفضها قبل ما تعدي للأدمن.',
    steps: [
      { title: 'راجع "بانتظار الموافقة"', desc: 'هتلاقي كل الطلبات الجديدة هنا — الرقم الأحمر يوضح العدد' },
      { title: 'افتح تفاصيل الطلب', desc: 'اضغط "التفاصيل" وراجع البيانات — العميل، الأصناف، العنوان، الموقع' },
      { title: 'وافق أو ارفض', desc: 'موافقة: الطلب بيروح للأدمن / رفض: المندوب بيشوفه ويقدر يعدل ويبعت تاني' },
      { title: 'تقدر تعدّل الطلب', desc: 'لو في بيانات غلط تقدر تعدّلها قبل ما توافق' },
      { title: 'جدولة التركيب', desc: 'بعد الموافقة، اضغط "جدولة التركيب" لإضافة الموعد في Google Calendar' },
    ],
    statuses: [
      { label: 'بانتظار الموافقة', color: '#f97316', desc: 'ينتظر قرارك' },
      { label: 'موافق عليه', color: '#059669', desc: 'وافقت — عند الأدمن دلوقتي' },
      { label: 'مرفوض', color: '#e11d48', desc: 'رفضت — المندوب يقدر يعدّل ويبعت تاني' },
    ],
    warnings: [
      'الطلبات المرفوضة بترجع للمندوب ويقدر يعدّل ويبعتها تاني',
      'لما المندوب يعدّل المرفوض، بيرجع تاني لـ "بانتظار الموافقة"',
      'تقارير الأرباح بتظهر بس الطلبات "تم التحصيل"',
      'المخزون للعرض فقط — مش تقدر تعدل فيه',
    ],
  },

  admin: {
    role: 'المدير',
    color: '#10b981',
    bg: '#ecfdf5',
    border: '#a7f3d0',
    intro: 'أنت مسؤول عن إدارة العمليات كلها — تحريك حالات الطلبات وإدارة المخزون والمستخدمين.',
    steps: [
      { title: 'راجع الطلبات الموافق عليها', desc: 'في تاب "الطلبات" — فلتر على "موافق عليه" وابدأ تحريك الطلبات' },
      { title: 'حرّك حالة الطلب', desc: 'موافق عليه ← تم الصرف ← مكتمل ← تم التحصيل' },
      { title: 'اطبع إذن الصرف والفاتورة', desc: 'من كل طلب تقدر تطبع PDF — إذن الصرف للمخزن، الفاتورة للعميل' },
      { title: 'إدارة المخزون', desc: 'أضف منتجات، عدّل الكميات، سجّل دفعات جديدة بأسعار مختلفة' },
      { title: 'إدارة المستخدمين', desc: 'أضف مندوبين وقادة فريق وعدّل بياناتهم' },
    ],
    statuses: [
      { label: 'موافق عليه', color: '#059669', desc: 'القائد وافق — تحرّكه لـ "تم الصرف"' },
      { label: 'تم الصرف', color: '#d97706', desc: 'اتصرف من المخزن — تحرّكه لـ "مكتمل"' },
      { label: 'مكتمل', color: '#7c3aed', desc: 'التركيب اتعمل — تحرّكه لـ "تم التحصيل"' },
      { label: 'تم التحصيل', color: '#10b981', desc: 'العملية كلها خلصت ✓' },
    ],
    warnings: [
      'إذن الصرف بيخصم الكميات من المخزون تلقائي',
      'تقارير المبيعات بتحسب بس الطلبات "مكتمل" للأدمن',
      'الفاتورة الضريبية محتاج رقم ضريبي — تأكد المندوب حطّه',
      'الفواتير الضريبية محتاجة اعتماد منك قبل ما تتسجل رسمياً',
    ],
  },

  super_admin: {
    role: 'المدير العام',
    color: '#8b5cf6',
    bg: '#f5f3ff',
    border: '#ddd6fe',
    intro: 'عندك كل صلاحيات المدير + إمكانية حذف أي طلب وإضافة مديرين جدد.',
    steps: [
      { title: 'كل صلاحيات المدير', desc: 'تحريك الطلبات، المخزون، المستخدمين، التقارير، الفواتير الضريبية' },
      { title: 'حذف أي طلب', desc: 'في كل طلب زرار "حذف الطلب" أحمر — حتى الطلبات الموافق عليها' },
      { title: 'إضافة مديرين', desc: 'في المستخدمين تقدر تضيف مدير أو مدير عام جديد' },
      { title: 'الإعدادات', desc: 'من تاب "الإعدادات" تقدر تتحكم في إعدادات التطبيق كلها' },
      { title: 'لوحة التحكم', desc: 'شاشة Dashboard بتعطيك نظرة شاملة على الأداء' },
    ],
    statuses: [
      { label: 'كل الحالات', color: '#8b5cf6', desc: 'تقدر تشوف وتتحكم في كل حالات الطلبات' },
    ],
    warnings: [
      'حذف الطلب نهائي ولا يمكن التراجع — تأكد قبل الحذف',
      'الإعدادات بتأثر على كل المستخدمين — تعامل بحذر',
      'إضافة مدير عام بيديه نفس صلاحياتك الكاملة',
    ],
  },
}

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: 12, borderRadius: 10, border: '1px solid #e4eaf3', overflow: 'hidden' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: '#f8fafc', border: 'none', cursor: 'pointer', fontFamily: 'Cairo,sans-serif' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{title}</span>
        {open ? <ChevronUp size={14} color="#94a3b8" /> : <ChevronDown size={14} color="#94a3b8" />}
      </button>
      {open && <div style={{ padding: '12px 14px' }}>{children}</div>}
    </div>
  )
}

export default function HelpGuide({ onClose }) {
  const guide = GUIDES[useRole()]
  if (!guide) return null

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#fff', borderRadius: 16, width: 'min(560px,95vw)', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #f0f4fa', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: guide.bg, border: `1.5px solid ${guide.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <HelpCircle size={18} color={guide.color} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>دليل الاستخدام</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{guide.role}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto' }}>

          {/* Intro */}
          <div style={{ padding: '12px 16px', borderRadius: 10, background: guide.bg, border: `1px solid ${guide.border}`, fontSize: 13, color: guide.color, fontWeight: 600, marginBottom: 14 }}>
            <Star size={13} style={{ display: 'inline', marginLeft: 6 }} />
            {guide.intro}
          </div>

          {/* Steps */}
          <Section title="📋 خطوات العمل اليومية">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {guide.steps.map((step, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: guide.color, color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{step.title}</div>
                    <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Statuses */}
          <Section title="🔄 حالات الطلبات" defaultOpen={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {guide.statuses.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: s.color + '18', color: s.color, border: `1px solid ${s.color}44`, flexShrink: 0 }}>{s.label}</span>
                  <span style={{ fontSize: 12, color: '#64748b' }}>{s.desc}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* Warnings */}
          <Section title="⚠️ تنبيهات مهمة" defaultOpen={false}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {guide.warnings.map((w, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '8px 10px', borderRadius: 8, background: '#fffbeb', border: '1px solid #fde68a' }}>
                  <AlertTriangle size={13} color="#d97706" style={{ flexShrink: 0, marginTop: 1 }} />
                  <span style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6 }}>{w}</span>
                </div>
              ))}
            </div>
          </Section>

          {/* Done */}
          <div style={{ padding: '10px 14px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #a7f3d0', display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <CheckCircle size={15} color="#059669" />
            <span style={{ fontSize: 12, color: '#065f46', fontWeight: 600 }}>لو عندك أي سؤال، تواصل مع المدير</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Hook to get current user role
import { useAuth } from '../../hooks/useAuth'
function useRole() {
  const { user } = useAuth()
  return user?.role
}
