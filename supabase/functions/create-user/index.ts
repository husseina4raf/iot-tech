// supabase/functions/create-user/index.ts
//
// Creates a new application user (auth.users + profiles) on behalf of an
// authenticated Admin/Super Admin caller, entirely server-side — this is
// what replaces the previous browser-side `supabase.auth.signUp()` call,
// which silently replaced the calling Admin's own session with the newly
// created user's session (the root cause of "Admin gets logged out after
// creating a user").
//
// THIS FUNCTION HAS NOT BEEN DEPLOYED. Deploy manually with:
//   supabase functions deploy create-user
//
// Required secrets (set via `supabase secrets set ...` or the dashboard —
// NEVER committed to the repo, never placed in a VITE_* variable):
//   SUPABASE_URL              — usually auto-provided by the platform
//   SUPABASE_ANON_KEY         — used only to verify the caller's own JWT
//   SUPABASE_SERVICE_ROLE_KEY — service_role; used ONLY inside this
//                               function's server-side runtime, never
//                               returned to any caller
//   APP_ORIGIN (optional)     — overrides the CORS allow-origin below
//
// This function never touches the calling Admin's Supabase Auth session —
// it only reads the caller's JWT to identify them, and uses a completely
// separate, server-side "admin client" (service_role) to perform the
// privileged operations. Nothing here can log the Admin out or swap their
// session, because it never calls signUp/signIn/signOut on their behalf.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Restrict CORS to this app's actual deployed origin rather than "*" —
// this endpoint performs a privileged, authenticated mutation (creating a
// user account), not a public read, so a wildcard origin is inappropriate
// here even though other parts of this project may not need CORS at all
// (this project has no existing Edge Functions/CORS convention to follow).
const ALLOWED_ORIGIN = Deno.env.get('APP_ORIGIN') ?? 'https://iot-tech-iota.vercel.app'

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Mirrors profiles.role's existing CHECK constraint (schema.sql) — the
// role being ASSIGNED to the new user must be one of these.
const ALLOWED_ROLES = ['sales', 'team_leader', 'admin', 'super_admin']

// Mirrors the application's existing rule for who may reach User
// Management at all: only 'admin' and 'super_admin' have '/admin' in
// their ROLE_ROUTES (src/data/authData.js). This function must not grant
// the ability to create users to anyone the frontend itself wouldn't
// already let onto that screen.
const ALLOWED_CREATOR_ROLES = ['admin', 'super_admin']

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL      = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY          = Deno.env.get('SUPABASE_ANON_KEY')!

  // ── Identify the caller from their own JWT — never trust a client-sent role ──
  const authHeader = req.headers.get('Authorization') ?? ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return json({ error: 'غير مصرح — يجب تسجيل الدخول أولاً' }, 401)

  // Scoped to the anon key + the caller's own JWT — this can only ever see
  // what that caller's own RLS already permits (their own profile row),
  // exactly like any authenticated client-side query would.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  })

  const { data: { user: callerUser }, error: callerErr } = await callerClient.auth.getUser()
  if (callerErr || !callerUser) {
    return json({ error: 'غير مصرح — الجلسة غير صالحة' }, 401)
  }

  const { data: callerProfile, error: callerProfileErr } = await callerClient
    .from('profiles')
    .select('role')
    .eq('id', callerUser.id)
    .single()

  if (callerProfileErr || !callerProfile) {
    return json({ error: 'تعذر التحقق من صلاحيتك' }, 403)
  }
  if (!ALLOWED_CREATOR_ROLES.includes(callerProfile.role)) {
    return json({ error: 'ليس لديك صلاحية إضافة مستخدمين' }, 403)
  }

  // ── Validate the payload for the user being created ──────────────────
  let payload: { name?: string; username?: string; password?: string; role?: string; repName?: string | null }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'بيانات غير صالحة' }, 400)
  }

  const name     = (payload.name ?? '').trim()
  const username = (payload.username ?? '').trim().toLowerCase()
  const password = payload.password ?? ''
  const role     = payload.role ?? ''
  const repName  = payload.repName || null

  if (!name)                              return json({ error: 'الاسم مطلوب' }, 400)
  if (!username)                          return json({ error: 'اسم المستخدم مطلوب' }, 400)
  if (!/^[a-zA-Z0-9_]+$/.test(username))  return json({ error: 'اسم المستخدم غير صالح' }, 400)
  if (!password || password.length < 6)   return json({ error: 'كلمة المرور 6 أحرف على الأقل' }, 400)
  if (!ALLOWED_ROLES.includes(role))      return json({ error: 'دور غير صالح' }, 400)

  // ── Privileged operations — service_role, used ONLY here, server-side ──
  // This key never leaves this function's runtime and is never included
  // in any response.
  const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const email = `${username}@iottech.app`

  // email_confirm: true preserves this project's existing behavior of a
  // newly created account being immediately usable with no confirmation
  // step (previously relied on the project's global auto-confirm setting
  // via the browser-side signUp() call this replaces).
  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })

  if (createErr || !created?.user) {
    const msg = (createErr?.message || '').toLowerCase()
    if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
      return json({ error: 'اسم المستخدم مستخدم بالفعل' }, 409)
    }
    console.error('create-user: auth.admin.createUser failed:', createErr?.message)
    return json({ error: 'فشل إنشاء حساب المستخدم' }, 500)
  }

  const newUserId = created.user.id

  const { error: profileInsertErr } = await adminClient.from('profiles').insert({
    id: newUserId,
    name,
    username,
    role,
    rep_name: repName,
    active: true,
  })

  if (profileInsertErr) {
    // Compensating cleanup — do not leave an orphaned auth.users row with
    // no corresponding profile if the second step failed.
    const { error: cleanupErr } = await adminClient.auth.admin.deleteUser(newUserId)
    if (cleanupErr) {
      // Only safe, non-sensitive diagnostic info is logged — no tokens,
      // no service_role key, nothing beyond ids/messages that are already
      // visible to anyone with dashboard access to this project's logs.
      console.error('create-user: cleanup failed after profile insert error', {
        newUserId, profileError: profileInsertErr.message, cleanupError: cleanupErr.message,
      })
      return json({ error: 'فشل إنشاء المستخدم ولم يتم التراجع بالكامل — يرجى مراجعة الدعم الفني' }, 500)
    }
    console.error('create-user: profile insert failed, auth user rolled back:', profileInsertErr.message)
    const dupe = (profileInsertErr.message || '').toLowerCase().includes('duplicate')
    return json({ error: dupe ? 'اسم المستخدم مستخدم بالفعل' : 'فشل إنشاء ملف المستخدم' }, 500)
  }

  return json({
    user: { id: newUserId, name, username, role, repName, active: true },
  }, 200)
})
