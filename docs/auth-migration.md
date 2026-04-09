# Auth Migration Guide

คู่มือสำหรับเพิ่ม Supabase Auth เข้าระบบในภายหลัง (ปัจจุบัน MVP ไม่มี Auth)

---

## 1. Database Migration

สร้าง `supabase/migrations/002_add_auth.sql`:

```sql
-- เพิ่ม user_id ใน audio_files
ALTER TABLE audio_files
  ADD COLUMN user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_audio_files_user_id ON audio_files(user_id);

-- Row Level Security
ALTER TABLE audio_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;

-- Policy: เจ้าของดูได้เฉพาะของตัวเอง
CREATE POLICY "owner_select" ON audio_files
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "owner_insert" ON audio_files
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "owner_delete" ON audio_files
  FOR DELETE USING (auth.uid() = user_id);

-- analysis_results เข้าถึงผ่าน audio_files
CREATE POLICY "owner_select_analysis" ON analysis_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM audio_files
      WHERE audio_files.id = analysis_results.audio_file_id
        AND audio_files.user_id = auth.uid()
    )
  );
```

---

## 2. Supabase Client — เพิ่ม Auth Methods

`app/lib/supabase.server.ts` — เพิ่มฟังก์ชัน:

```typescript
import { createServerClient } from "@supabase/ssr";

// ใช้ request/response cookies สำหรับ SSR session
export function createSupabaseServerClient(request: Request, headers: Headers) {
  return createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return parseCookies(request.headers.get("Cookie") ?? "");
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          headers.append("Set-Cookie", serializeCookie(name, value, options))
        );
      },
    },
  });
}
```

Dependencies เพิ่มเติม:

```bash
npm install @supabase/ssr
```

---

## 3. Auth Routes

สร้างไฟล์ใหม่:

```
app/routes/
├── auth.login.tsx      # GET: หน้า login form / POST: sign in
├── auth.register.tsx   # GET: หน้าสมัคร / POST: sign up
├── auth.logout.tsx     # POST: sign out + redirect
└── auth.callback.tsx   # GET: OAuth callback URL
```

### ตัวอย่าง `auth.login.tsx`

```typescript
import { redirect, data } from "react-router";
import { createSupabaseServerClient } from "~/lib/supabase.server";

export async function action({ request }: Route.ActionArgs) {
  const headers = new Headers();
  const supabase = createSupabaseServerClient(request, headers);
  const form = await request.formData();

  const { error } = await supabase.auth.signInWithPassword({
    email: form.get("email") as string,
    password: form.get("password") as string,
  });

  if (error) return data({ error: error.message }, { status: 400 });
  return redirect("/", { headers });
}
```

---

## 4. Protect Routes

ใช้ loader middleware pattern:

```typescript
// app/lib/auth.server.ts
export async function requireAuth(request: Request) {
  const headers = new Headers();
  const supabase = createSupabaseServerClient(request, headers);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw redirect("/auth/login");
  return { user, supabase, headers };
}

// ใน loader ของ protected route:
export async function loader({ request }: Route.LoaderArgs) {
  const { user } = await requireAuth(request);
  // ...
}
```

---

## 5. Social Login (Optional)

เพิ่ม Google/GitHub login ผ่าน Supabase Dashboard:

1. ไปที่ Supabase Dashboard → Authentication → Providers
2. เปิดใช้ Google หรือ GitHub
3. ใส่ Client ID / Secret จาก Google Cloud Console / GitHub OAuth App
4. Callback URL: `https://<your-domain>/auth/callback`

ฝั่ง frontend:

```typescript
await supabase.auth.signInWithOAuth({
  provider: "google",
  options: { redirectTo: `${origin}/auth/callback` },
});
```

---

## 6. Checklist Migration

- [ ] Run `002_add_auth.sql` migration
- [ ] Install `@supabase/ssr`
- [ ] สร้าง auth routes (login, register, logout, callback)
- [ ] เพิ่ม `requireAuth()` helper
- [ ] ป้องกัน `/analyses` และ `/analyses/:id` routes
- [ ] อัพเดต upload API ให้บันทึก `user_id`
- [ ] เพิ่ม Navbar พร้อมปุ่ม Login/Logout
- [ ] ทดสอบ RLS policies
