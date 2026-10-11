@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo ยังไม่ได้ติดตั้ง Node.js - กำลังเปิดหน้าดาวน์โหลด
  start https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo กำลังติดตั้งส่วนที่จำเป็น กรุณารอ...
  call npm install
  if errorlevel 1 (
    echo ติดตั้งไม่สำเร็จ
    pause
    exit /b 1
  )
)
echo กำลังสร้างไฟล์ติดตั้ง .exe ใช้เวลาหลายนาที กรุณารอ...
call npm run dist
if errorlevel 1 (
  echo สร้างไฟล์ไม่สำเร็จ
  pause
  exit /b 1
)
echo เสร็จแล้ว กำลังเปิดโฟลเดอร์ dist
start "" "%~dp0dist"
pause
