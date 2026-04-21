# 🎓 Workshop: GenAI Toolbox + MindsDB + PostgreSQL/Supabase

> เรียนรู้ตั้งแต่พื้นฐานจนถึงขั้นสูง ผ่านโปรเจ็ค Voice Analysis จริง
> รูปแบบ: Step-by-step Workshop — พาทำทีละขั้น พร้อมอธิบายทุกจุด

---

## 📋 สารบัญ

| ไฟล์                                         | เนื้อหา                          | ระดับ    |
| -------------------------------------------- | -------------------------------- | -------- |
| [00-docker-setup.md](./00-docker-setup.md)   | Docker Setup — เตรียมสภาพแวดล้อม | เริ่มต้น |
| [docker-commands.md](./docker-commands.md)   | คู่มือคำสั่ง Docker แบบละเอียด   | อ้างอิง  |
| [01-basics.md](./01-basics.md)               | พื้นฐาน + PostgreSQL/Supabase    | เริ่มต้น |
| [02-mindsdb.md](./02-mindsdb.md)             | MindsDB — นำ AI เข้าสู่ SQL      | กลาง     |
| [03-genai-toolbox.md](./03-genai-toolbox.md) | GenAI Toolbox — AI Agent Tools   | กลาง     |
| [04-integration.md](./04-integration.md)     | นำทั้งหมดมารวมใน Voice Analysis  | กลาง-สูง |
| [05-advanced.md](./05-advanced.md)           | Production Patterns              | ขั้นสูง  |

---

## 🗺️ แผนภาพการเรียนรู้

```text
เริ่มต้น → 00-docker-setup.md  ← เตรียมสภาพแวดล้อม (Docker, DB, MindsDB, Toolbox)
              │
              │  ทุก service พร้อมแล้ว?
              ▼
           01-basics.md
              │
              │  เข้าใจ SQL, Supabase, SDK แล้ว?
              ▼
           02-mindsdb.md
              │
              │  อยากให้ AI ตอบคำถามเกี่ยวกับข้อมูล?
              ▼
           03-genai-toolbox.md
              │
              │  อยากรวมทุกอย่างเข้ากับโปรเจ็ค?
              ▼
           04-integration.md
              │
              │  อยากเอาขึ้น production?
              ▼
           05-advanced.md
```

---

## ⏱️ เวลาที่ใช้โดยประมาณ

| ส่วน     | เวลา       | หมายเหตุ                                   |
| -------- | ---------- | ------------------------------------------ |
| Part 0.5 | 30-60 นาที | ติดตั้ง Docker + รัน services + สร้างตาราง |
| Part 1   | 2-3 ชม.    | ลองสร้าง Supabase project จริง             |
| Part 2   | 1-2 ชม.    | ติดตั้ง MindsDB + สร้าง model              |
| Part 3   | 1-2 ชม.    | ตั้งค่า Toolbox + ทดสอบ tools              |
| Part 4   | 2-3 ชม.    | เขียน code รวมเข้า Voice Analysis          |
| Part 5   | 1-2 ชม.    | อ่านและวางแผน production                   |

**รวม: 8-13 ชม.** (ขึ้นกับพื้นฐาน)

---

## 🛠️ สิ่งที่ต้องเตรียมก่อนเริ่ม

1. **Docker Desktop** ติดตั้งและรันอยู่ → ใช้รัน Supabase, MindsDB, Toolbox
2. **Internet** สำหรับสมัคร Supabase + ดาวน์โหลด images
3. **Code Editor** (VS Code แนะนำ)
4. **Node.js 20+** ติดตั้งแล้ว
5. **yarn** ติดตั้งแล้ว (`npm install -g yarn`)
6. **Git** ติดตั้งแล้ว

---

## 📚 อ้างอิงเพิ่มเติม

- [Voice Analysis — เอกสารโปรเจกต์](../project-overview.md)
- [Voice Analysis — กระบวนการทำงาน](../how-it-works.md)
- [Supabase Docs](https://supabase.com/docs)
- [MindsDB Docs](https://docs.mindsdb.com)
- [GenAI Toolbox GitHub](https://github.com/googleapis/genai-toolbox)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
