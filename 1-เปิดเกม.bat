@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo ยังไม่ได้ติดตั้ง Node.js - กำลังเปิดหน้าดาวน์โหลด
  echo ติดตั้งแบบ LTS แล้วปิดหน้าต่างนี้ จากนั้นดับเบิลคลิกไฟล์นี้อีกครั้ง
  start https://nodejs.org
  pause
  exit /b 1
)
if not exist node_modules (
  echo กำลังติดตั้งส่วนที่จำเป็น ครั้งแรกใช้เวลาสักพัก กรุณารอ...
  call npm install
  if errorlevel 1 (
    echo ติดตั้งไม่สำเร็จ ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่
    pause
    exit /b 1
  )
)
call npm start
