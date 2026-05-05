# Auth Migration Guide

> อัพเดท: 2026-05-04
> เอกสารนี้ track progress การเพิ่ม Auth เข้าระบบ แบ่งเป็น 2 phases

---

## สถานะรวม

| Phase       | รายการ                               | สถานะ                                          |
| ----------- | ------------------------------------ | ---------------------------------------------- |
| **Phase 1** | Email/Password Login (Supabase Auth) | ✅ Code Done — รอ apply RLS migration          |
| **Phase 2** | Authentik SSO Integration            | ⚙️ Code พร้อม — รอ Authentik + Supabase config |

---

## Phase 1: Email/Password — ✅ Code Done

### ไฟล์ที่สร้าง/แก้ไขแล้ว

| ไฟล์                                      | สถานะ | คำอธิบาย                                                       |
| ----------------------------------------- | ----- | -------------------------------------------------------------- |
| `package.json`                            | ✅    | เพิ่ม `@supabase/ssr@0.10.2`                                   |
| `app/lib/auth.server.ts`                  | ✅    | `createSupabaseServerClient`, `requireAuth`, `getOptionalUser` |
| `app/routes/auth.login.tsx`               | ✅    | Email/Password form + SSO button (active)                      |
| `app/routes/auth.callback.tsx`            | ✅    | แลก `?code=` เป็น session                                      |
| `app/routes/auth.logout.tsx`              | ✅    | POST sign out + clear cookie                                   |
| `app/routes.ts`                           | ✅    | เพิ่ม auth/login, auth/logout, auth/callback                   |
| `app/routes/home.tsx`                     | ✅    | ป้องกันด้วย `requireAuth()`                                    |
| `app/routes/analyses.tsx`                 | ✅    | ป้องกันด้วย `requireAuth()` + logout button                    |
| `app/routes/analyses.$id.tsx`             | ✅    | ป้องกันด้วย `requireAuth()`                                    |
| `app/routes/api/upload.tsx`               | ✅    | เก็บ `user_id` จาก session                                     |
| `supabase/migrations/004_add_user_id.sql` | ⏳    | รอ apply ใน Supabase                                           |

### สิ่งที่ยังต้องทำ (Phase 1 ให้ครบ)

#### 1. Apply RLS Migration

ไฟล์ canonical: `supabase/migrations/004_add_user_id.sql`

**Self-hosted Supabase:**

```bash
supabase db push
# หรือ paste ไฟล์ใน SQL Editor
```

**Supabase Cloud:**
เปิด Supabase Dashboard → SQL Editor → paste content ของ `supabase/migrations/004_add_user_id.sql`

**ตรวจสอบ:**

```sql
SELECT tablename, rowsecurity FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename IN ('audio_files', 'analysis_results');
-- ต้องเห็น rowsecurity = true ทั้งสองตาราง

SELECT polname FROM pg_policy
  WHERE polrelid IN (
    'public.audio_files'::regclass,
    'public.analysis_results'::regclass
  );
-- ต้องเห็น policies ที่สร้างขึ้น
```

> **RLS Policy ที่ตั้งค่า:** all-authenticated users เห็นทุก record (internal tool style)
> service_role (n8n callbacks) bypass RLS อัตโนมัติ — ไม่กระทบ callback endpoints

#### 2. สร้าง User ทดสอบ

Supabase Dashboard → Authentication → Users → Invite user:

- Email: `admin@example.com`
- หรือใช้ **Create user** แบบตั้ง password เอง

#### 3. ทดสอบ Login Flow

```bash
yarn dev
# เปิด http://localhost:3000/analyses
# → ควร redirect ไป /auth/login?next=%2Fanalyses
# ใส่ email/password → เข้าได้
# กด "ออกจากระบบ" → redirect กลับ /auth/login
```

#### 4. ยืนยัน n8n Callbacks

```bash
# เรียก callback ด้วย X-N8N-Secret header
curl -X POST http://localhost:3000/api/callback/status \
  -H "X-N8N-Secret: ${N8N_CALLBACK_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"id":"test","status":"done"}'
# ต้องได้ response ปกติ ไม่ใช่ 401/403
```

---

## Phase 2: Authentik SSO — ⚙️ Implementation Runbook

> เอกสารเต็ม: **`docs/authentik-sso-integration.md`**

### ขั้นตอนสรุป (6 steps)

1. **Deploy Authentik** (ถ้ายังไม่มี)

   ```bash
   cp .env.authentik.example .env.authentik
   # เติม PG_PASS, AUTHENTIK_SECRET_KEY, AUTHENTIK_BOOTSTRAP_PASSWORD
   docker compose -f docker-compose.authentik.yml --env-file .env.authentik up -d
   # เปิด http://localhost:9000/if/flow/initial-setup/
   ```

2. **สร้าง Authentik Application + OAuth2/OIDC Provider**
   - Client Type: Confidential
   - Redirect URI: `<supabase-url>/auth/v1/callback`
   - Scopes: openid, profile, email
   - จด Client ID, Client Secret, Issuer URL (มี trailing slash)

3. **Config Supabase GoTrue** (เลือกวิธีตาม deployment):
   - **Self-hosted**: เพิ่ม `GOTRUE_EXTERNAL_AUTHENTIK_*` env vars → restart supabase-auth
   - **Cloud**: Dashboard → Auth → Providers → Add Custom OIDC (slug = `authentik`)

4. **ตรวจสอบ Supabase ยอมรับ Authentik**

   ```bash
   curl <supabase-url>/auth/v1/settings | jq '.external.authentik'
   # { "enabled": true }
   ```

5. **App activation**: SSO button uncommented แล้ว — ไม่ต้องแก้โค้ดเพิ่ม

6. **ทดสอบ E2E**: login → analyses → upload → logout

---

## Rollback Procedure

### Rollback Phase 2 (ปิด Authentik SSO)

**App:**

- Comment-out SSO divider + button ใน `app/routes/auth.login.tsx` (บรรทัด 173-191)

**Supabase Self-hosted:**

```bash
# ลบ env vars
# GOTRUE_EXTERNAL_AUTHENTIK_ENABLED
# GOTRUE_EXTERNAL_AUTHENTIK_*
docker compose restart supabase-auth
```

**Supabase Cloud:**
Dashboard → Auth → Providers → Custom OIDC → Disable หรือ Delete

### Rollback Phase 1 (ปิด RLS)

> ⚠️ ปิด RLS จะทำให้ unauthenticated access ได้อีก — ใช้เฉพาะกรณีฉุกเฉิน

```sql
ALTER TABLE public.audio_files DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_results DISABLE ROW LEVEL SECURITY;
```

---

## Checklist

```
Phase 1
  [x] yarn add @supabase/ssr
  [x] สร้าง app/lib/auth.server.ts
  [x] สร้าง auth routes (login, callback, logout)
  [x] อัพเดต app/routes.ts
  [x] ป้องกัน /home, /analyses, /analyses/:id
  [x] เก็บ user_id ตอน upload (api/upload.tsx)
  [ ] Apply 004_add_user_id.sql ใน Supabase
  [ ] สร้าง user ทดสอบ
  [ ] ทดสอบ login/logout flow
  [ ] ยืนยัน n8n callbacks ยังทำงานได้

Phase 2
  [ ] รัน docker-compose.authentik.yml (ถ้า self-host)
  [ ] สร้าง Application + OIDC Provider ใน Authentik
  [ ] Config Supabase: GoTrue env (self-hosted) หรือ Dashboard (Cloud)
  [x] Uncomment SSO button ใน auth.login.tsx
  [ ] ทดสอบ SSO login flow E2E
```
