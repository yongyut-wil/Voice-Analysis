# Auth Migration Guide

> อัพเดท: 2026-05-04
> เอกสารนี้ track progress การเพิ่ม Auth เข้าระบบ แบ่งเป็น 2 phases

---

## สถานะรวม

| Phase       | รายการ                               | สถานะ                                                    |
| ----------- | ------------------------------------ | -------------------------------------------------------- |
| **Phase 1** | Email/Password Login (Supabase Auth) | ✅ Code Done — รอ apply RLS migration                    |
| **Phase 2** | Authentik SSO Integration            | ✅ Done — ทดสอบบน dev-voice-analysis สำเร็จ (2026-05-06) |

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

## Phase 2: Authentik SSO — ✅ Done (2026-05-06)

> เอกสารเต็ม: **`docs/authentik-sso-integration.md`**
> คู่มือ self-hosted (พร้อมปัญหาที่เจอจริง): **`docs/authentik-selfhosted-guide.md`**

### สิ่งที่ implement จริง

Self-hosted Supabase ใช้ **keycloak provider + nginx oidc-proxy** แทน `GOTRUE_EXTERNAL_AUTHENTIK_*` เพราะ GoTrue v2 ไม่มี built-in "authentik" provider

| Component       | รายละเอียด                                                                        |
| --------------- | --------------------------------------------------------------------------------- |
| GoTrue provider | `keycloak` (built-in, รับ custom URL ได้)                                         |
| oidc-proxy      | nginx container แปลง Keycloak URL paths → Authentik paths                         |
| URL rewrite     | App server-side fetch GoTrue redirect → rewrite `oidc-proxy` → Authentik URL จริง |
| env var ใหม่    | `AUTHENTIK_AUTHORIZE_URL` ในไฟล์ `.env` ของ app                                   |

### Supabase Cloud (ยังทำได้ตามเดิม)

Dashboard → Auth → Providers → Add Custom OIDC (slug = `authentik`) — ไม่มีข้อจำกัดของ GoTrue

### สถานะ tasks

```
Phase 2
  [x] สร้าง nginx oidc-proxy container
  [x] Config GoTrue KEYCLOAK provider ชี้ไป oidc-proxy
  [x] App: server-side URL rewrite ใน auth.login.tsx
  [x] ทดสอบ SSO login flow E2E บน dev-voice-analysis ✓
  [ ] Apply 004_add_user_id.sql ใน Supabase (RLS)
  [ ] ทดสอบ upload → user_id บันทึกถูกต้อง
```

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
  [x] สร้าง nginx oidc-proxy container ใน Supabase docker-compose
  [x] Config GoTrue: KEYCLOAK provider → oidc-proxy → Authentik
  [x] App: server-side URL rewrite (AUTHENTIK_AUTHORIZE_URL env var)
  [x] SSO button ใน auth.login.tsx active แล้ว
  [x] ทดสอบ SSO login flow E2E บน dev-voice-analysis
  [ ] Apply 004_add_user_id.sql ใน Supabase (RLS migration)
  [ ] ทดสอบ upload → ตรวจสอบ user_id บันทึกถูกต้อง
```
