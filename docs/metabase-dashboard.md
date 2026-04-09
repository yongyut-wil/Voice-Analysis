# Metabase Dashboard Setup

Dashboard ID: **317** (collection: yongyutw)  
ต้อง run `supabase/migrations/001_initial.sql` ก่อน แล้วเพิ่ม cards ด้านล่าง

## SQL Queries สำหรับแต่ละ Card

### Card 1: จำนวน Upload รายวัน (Bar Chart)

```sql
SELECT
  DATE(created_at AT TIME ZONE 'Asia/Bangkok') AS วันที่,
  COUNT(*) AS จำนวนไฟล์
FROM audio_files
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1;
```

### Card 2: สัดส่วนอารมณ์ (Pie Chart)

```sql
SELECT
  CASE emotion
    WHEN 'positive' THEN '🟢 ดี'
    WHEN 'neutral'  THEN '🟡 ธรรมชาติ'
    WHEN 'negative' THEN '🔴 ไม่ดี'
    ELSE 'ไม่ทราบ'
  END AS อารมณ์,
  COUNT(*) AS จำนวน
FROM analysis_results
GROUP BY emotion
ORDER BY COUNT(*) DESC;
```

### Card 3: อัตราตรวจพบเนื้อหาผิดกฎหมาย (Number)

```sql
SELECT
  ROUND(
    100.0 * SUM(CASE WHEN illegal_detected THEN 1 ELSE 0 END) / COUNT(*),
    1
  ) AS "อัตราพบ (%)",
  SUM(CASE WHEN illegal_detected THEN 1 ELSE 0 END) AS "พบ (ครั้ง)",
  COUNT(*) AS "ทั้งหมด"
FROM analysis_results;
```

### Card 4: ค่าเฉลี่ยความพึงพอใจ (Number / Gauge)

```sql
SELECT
  ROUND(AVG(satisfaction_score), 1) AS "คะแนนเฉลี่ย",
  MIN(satisfaction_score) AS "ต่ำสุด",
  MAX(satisfaction_score) AS "สูงสุด"
FROM analysis_results
WHERE satisfaction_score IS NOT NULL;
```

## วิธีเพิ่ม Card ผ่าน MCP

เมื่อ database พร้อมแล้ว ให้ระบุ `database_id` ที่ถูกต้องใน Metabase และรันผ่าน Claude Code MCP:

```
สร้าง Metabase card สำหรับ Voice Analysis dashboard โดยใช้ SQL ด้านบน
แล้วเพิ่มลง dashboard ID 317
```
