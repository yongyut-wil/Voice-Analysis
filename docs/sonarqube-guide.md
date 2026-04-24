# SonarQube Local Setup & Usage Guide

เอกสารนี้อธิบายวิธี setup SonarQube บน local machine และการใช้งานสำหรับ Voice Analysis project

---

## 1. สถานะปัจจุบัน

| Component           | Status      | URL                   |
| ------------------- | ----------- | --------------------- |
| SonarQube Server    | ✅ Running  | http://localhost:9000 |
| PostgreSQL Database | ✅ Running  | localhost:5432        |
| First Analysis      | ✅ Complete | Dashboard พร้อมดู     |

---

## 2. เริ่มต้นใช้งาน (First Time Setup)

### 2.1 Start SonarQube

```bash
docker-compose -f docker-compose.sonarqube.yml up -d
```

รอประมาณ 1-2 นาทีให้ services start สมบูรณ์

### 2.2 Initial Login

1. เปิด browser: http://localhost:9000
2. **Username**: `admin`
3. **Password**: `admin`
4. เปลี่ยน password ตามที่ระบบบังคับ

### 2.3 สร้าง Project

1. กด **"Create Project"** ที่หน้าแรก
2. เลือก **"Manual"**
3. **Project key**: `voice-analysis`
4. **Project name**: `Voice Analysis`
5. กด **"Next"**

### 2.4 สร้าง Analysis Token

1. เลือก **"Locally"** (analyze project ในเครื่อง)
2. ใส่ชื่อ token: `local-analysis`
3. กด **"Generate"**
4. **Copy token** เก็บไว้ (แสดงครั้งเดียวเท่านั้น)

**Token จะอยู่ในรูปแบบ**: `squ_xxxxxxxxxxxxxxxxxxxx`

---

## 3. วิธี Analyze Project

### 3.1 ใช้ Docker Scanner (แนะนำ)

```bash
docker run --rm \
  -e SONAR_HOST_URL="http://host.docker.internal:9000" \
  -e SONAR_TOKEN="YOUR_TOKEN_HERE" \
  -v "$(pwd):/usr/src" \
  sonarsource/sonar-scanner-cli
```

แทน `YOUR_TOKEN_HERE` ด้วย token ที่ copy มา

### 3.2 ใช้ Local Scanner (ต้อง install ก่อน)

```bash
# Install sonar-scanner
brew install sonar-scanner

# Run analysis
sonar-scanner \
  -Dsonar.token=YOUR_TOKEN_HERE
```

### 3.3 ผลลัพธ์ที่คาดหวัง

```
INFO: ANALYSIS SUCCESSFUL
INFO: You can find the results at: http://host.docker.internal:9000/dashboard?id=voice-analysis
```

---

## 4. ดูผล Analysis

### 4.1 Dashboard URL

http://localhost:9000/dashboard?id=voice-analysis

### 4.2 Metrics หลักที่ดู

| Metric              | คำอธิบาย               | ค่าปัจจุบัน         |
| ------------------- | ---------------------- | ------------------- |
| **Bugs**            | Potential bugs         | ตรวจสอบ             |
| **Vulnerabilities** | Security issues        | ตรวจสอบ             |
| **Code Smells**     | Maintainability issues | ตรวจสอบ             |
| **Coverage**        | Test coverage          | 0% (ยังไม่มี tests) |
| **Duplications**    | Duplicated code        | ตรวจสอบ             |

### 4.3 ดูรายละเอียด Issues

1. คลิกที่ตัวเลข Issues ในแต่ละ category
2. ดู file, line number, และคำอธิบาย
3. กด **"Why is this an issue?"** เพื่ออ่าน rule explanation

---

## 5. Commands ที่ใช้บ่อย

| คำสั่ง                                                             | ผลลัพธ์         |
| ------------------------------------------------------------------ | --------------- |
| `docker-compose -f docker-compose.sonarqube.yml up -d`             | Start SonarQube |
| `docker-compose -f docker-compose.sonarqube.yml down`              | Stop SonarQube  |
| `docker-compose -f docker-compose.sonarqube.yml logs -f sonarqube` | View logs       |
| `docker-compose -f docker-compose.sonarqube.yml ps`                | Check status    |

---

## 6. Configuration Files

### 6.1 sonar-project.properties

```properties
sonar.projectKey=voice-analysis
sonar.projectName=Voice Analysis
sonar.sources=app
sonar.exclusions=**/*.test.ts,**/*.test.tsx,**/node_modules/**,**/build/**
sonar.language=ts
sonar.sourceEncoding=UTF-8
```

**Exclusions**: ไฟล์ที่ไม่ต้องการ analyze

- Test files (`.test.ts`, `.test.tsx`)
- `node_modules/`
- `build/`
- `.react-router/`

### 6.2 docker-compose.sonarqube.yml

Services:

- **sonarqube**: Web UI + Analysis Engine (Port 9000)
- **sonardb**: PostgreSQL 15 สำหรับเก็บ data

Volumes (data persist หลัง restart):

- `sonarqube_data`
- `sonarqube_logs`
- `sonarqube_extensions`
- `postgres_data`

---

## 7. Quality Gate

### 7.1 ตั้งค่า Quality Gate

1. ไปที่: http://localhost:9000/admin/quality_gates
2. กด **"Create"** หรือแก้ไข Default
3. ตั้งค่า conditions:

**Recommended Gate for This Project**:

- Coverage ≥ 80% (รอ tests)
- Duplicated Lines < 3%
- Maintainability Rating A
- Reliability Rating A
- Security Rating A

### 7.2 ผูก Quality Gate กับ Project

1. Project Settings → Quality Gate
2. เลือก Quality Gate ที่สร้าง

---

## 8. Troubleshooting

### 8.1 SonarQube ไม่ start

```bash
# ตรวจสอบ memory (ต้องการ minimum 2GB)
docker system info | grep "Total Memory"

# ดู logs
docker-compose -f docker-compose.sonarqube.yml logs -f sonarqube
```

### 8.2 Scanner ไม่ connect

```bash
# ใช้ IP แทน host.docker.internal ถ้าไม่ work
ping host.docker.internal

# หรือใช้ Docker network
--network sonarnet \
-e SONAR_HOST_URL="http://sonarqube:9000" \
```

### 8.3 Analysis ล้มเหลว

```bash
# ตรวจสอบ project key ตรงกันไหม
cat sonar-project.properties | grep projectKey

# ตรวจสอบ token ถูกต้องไหม
# (สร้าง token ใหม่ถ้าจำเป็น)
```

---

## 9. Next Steps

### 9.1 Phase ถัดไป: Testing Framework

เพื่อให้ Coverage > 0% ต้อง implement:

- Vitest สำหรับ unit tests
- Playwright สำหรับ E2E tests

### 9.2 Coverage Integration

เพิ่มใน `sonar-project.properties`:

```properties
sonar.tests=app
sonar.test.inclusions=**/*.test.ts,**/*.test.tsx
sonar.javascript.lcov.reportPaths=coverage/lcov.info
```

### 9.3 CI/CD Integration

เพิ่ม GitHub Actions workflow สำหรับ:

- Run analysis ทุก PR
- Comment coverage บน PR
- Enforce Quality Gate

---

## 10. Resources

| Resource            | URL                                               |
| ------------------- | ------------------------------------------------- |
| SonarQube Dashboard | http://localhost:9000                             |
| Project Dashboard   | http://localhost:9000/dashboard?id=voice-analysis |
| Rules               | http://localhost:9000/rules                       |
| Quality Gates       | http://localhost:9000/admin/quality_gates         |
| SonarQube Docs      | https://docs.sonarsource.com/sonarqube/           |

---

## 11. Checklist

- [x] Start SonarQube server
- [x] Create project in SonarQube UI
- [x] Generate analysis token
- [x] Run first analysis (baseline)
- [ ] Review initial issues
- [ ] Fix critical issues
- [ ] Setup Vitest + Playwright
- [ ] Achieve 80% coverage
- [ ] Configure Quality Gate
- [ ] Setup CI/CD integration

---

_เอกสารสร้างเมื่อ: 2026-04-24_
