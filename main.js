// Client สำหรับเล่น "สุริยันต์ดับดารา" (https://play.edensoft.net/) บน Windows
const {
  app, BrowserWindow, WebContentsView, Tray, Menu,
  globalShortcut, ipcMain, nativeImage, screen, shell, dialog,
} = require('electron');
const path = require('path');

// ---------- ตั้งค่า (แก้ตรงนี้ได้) ----------
const GAME_URL = 'https://play.edensoft.net/';
const TITLE = 'สุริยันต์ดับดารา';
const BAR_H = 30;                         // ความสูงแถบควบคุมตอนปกติ
const PIP_BAR_H = 10;                     // แถบบางๆ ไว้ลากหน้าต่างตอน PiP
const PIP_SIZE = { width: 384, height: 226 };
const BASE_W = 1280, BASE_H = 720;        // ขนาดอ้างอิง: ตอน PiP เกมจะถูกย่อให้พอดีกับขนาดนี้
const MIN_NORMAL = { width: 640, height: 400 };
const MIN_PIP = { width: 64, height: 48 };
const HIDE_KEY = 'Control+Shift+H';       // คีย์ลัดระดับระบบ ซ่อน/เรียกกลับ
const ICON = path.join(__dirname, 'icon.png');

// ให้เกมทำงานเต็มสปีดแม้หน้าต่างถูกบังหรืออยู่พื้นหลัง
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win = null, bar = null, game = null, tray = null;
let pip = false, hidden = false, prevBounds = null;
let donateWin = null;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => setHidden(false));
  app.whenReady().then(init);
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.on('window-all-closed', () => app.quit());
}

function init() {
  createWindow();
  createTray();
  globalShortcut.register(HIDE_KEY, () => setHidden(!hidden));

  const actions = {
    minimize: () => win.minimize(),
    maximize: () => { if (!pip) (win.isMaximized() ? win.unmaximize() : win.maximize()); },
    close: () => app.quit(),
    pip: togglePip,
    fullscreen: toggleFullscreen,
    hide: () => setHidden(true),
    help: showHelp,
    donate: openDonate,
    reload: () => game.webContents.reload(),
  };
  ipcMain.on('bar-action', (e, name) => {
    if (win && e.sender === bar.webContents && actions[name]) actions[name]();
  });
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 750,
    minWidth: MIN_NORMAL.width, minHeight: MIN_NORMAL.height,
    frame: false,
    backgroundColor: '#0b1030',
    title: TITLE,
    icon: ICON,
  });

  game = new WebContentsView({
    webPreferences: { backgroundThrottling: false, contextIsolation: true, sandbox: true },
  });
  bar = new WebContentsView({
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  win.contentView.addChildView(game);
  win.contentView.addChildView(bar);

  bar.webContents.loadFile(path.join(__dirname, 'bar.html'));
  game.webContents.loadURL(GAME_URL);

  // ลิงก์ที่เปิดหน้าต่างใหม่ (เช่น หน้าชำระเงิน) ให้เปิดในเบราว์เซอร์ปกติ
  game.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // ถ้าโหลดไม่ขึ้น ลองใหม่ทุก 5 วินาที
  game.webContents.on('did-fail-load', (_e, code, _d, _u, isMainFrame) => {
    if (isMainFrame && code !== -3) setTimeout(() => game && game.webContents.loadURL(GAME_URL), 5000);
  });
  game.webContents.on('did-finish-load', layout);

  for (const wc of [game.webContents, bar.webContents]) wc.on('before-input-event', onInput);

  win.on('resize', layout);
  win.on('enter-full-screen', layout);
  win.on('leave-full-screen', layout);
  win.on('closed', () => { win = null; });
  layout();
}

function barHeight() {
  if (win.isFullScreen()) return 0;
  return pip ? PIP_BAR_H : BAR_H;
}

// จัดตำแหน่งแถบควบคุม + หน้าเกม และปรับสเกลหน้าเกมตามขนาดหน้าต่างตอน PiP
function layout() {
  if (!win) return;
  const [w, h] = win.getContentSize();
  const bh = barHeight();
  bar.setVisible(bh > 0);
  bar.setBounds({ x: 0, y: 0, width: w, height: bh });
  game.setBounds({ x: 0, y: bh, width: w, height: Math.max(h - bh, 1) });

  let zoom = 1;
  if (pip) zoom = Math.min(w / BASE_W, Math.max(h - bh, 1) / BASE_H, 1);
  game.webContents.setZoomFactor(Math.max(zoom, 0.25)); // Chromium ย่อได้ต่ำสุดราว 0.25
}

function togglePip() {
  if (!win) return;
  if (win.isFullScreen()) win.setFullScreen(false);
  if (!pip) {
    if (win.isMaximized()) win.unmaximize();
    prevBounds = win.getBounds();
    pip = true;
    const wa = screen.getDisplayMatching(prevBounds).workArea;
    win.setMinimumSize(MIN_PIP.width, MIN_PIP.height);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setBounds({
      x: wa.x + wa.width - PIP_SIZE.width - 20,
      y: wa.y + wa.height - PIP_SIZE.height - 20,
      ...PIP_SIZE,
    });
  } else {
    pip = false;
    win.setAlwaysOnTop(false);
    win.setMinimumSize(MIN_NORMAL.width, MIN_NORMAL.height);
    if (prevBounds) win.setBounds(prevBounds);
  }
  layout();
}

function toggleFullscreen() {
  if (!win) return;
  if (pip) togglePip();
  win.setFullScreen(!win.isFullScreen());
}

// ซ่อนเกมลงถาดระบบ + ปิดเสียง / เรียกกลับ + เปิดเสียง
function setHidden(h) {
  if (!win) return;
  hidden = h;
  game.webContents.setAudioMuted(h);
  if (h) {
    win.hide();
  } else {
    win.show();
    win.focus();
  }
  updateTray();
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip(TITLE);
  tray.on('click', () => setHidden(!hidden));
  updateTray();
}

function updateTray() {
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: hidden ? 'แสดงเกม' : 'ซ่อนเกม (ปิดเสียง)', click: () => setHidden(!hidden) },
    { label: 'สลับ PiP / จอปกติ', click: () => { setHidden(false); togglePip(); } },
    { type: 'separator' },
    { label: 'ออกจากโปรแกรม', click: () => app.quit() },
  ]));
}

// หน้าต่างโดเนท: แสดงรูป donate.png (เปลี่ยนรูปได้โดยแทนที่ไฟล์ donate.png ในโฟลเดอร์โปรแกรม)
function openDonate() {
  if (!win) return;
  if (donateWin) { donateWin.show(); donateWin.focus(); return; }
  donateWin = new BrowserWindow({
    parent: win,
    width: 460, height: 620,
    title: 'โดเนท',
    icon: ICON,
    autoHideMenuBar: true,
    backgroundColor: '#0b1030',
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  donateWin.setMenu(null);
  donateWin.loadFile(path.join(__dirname, 'donate.html'));
  donateWin.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  donateWin.webContents.on('will-navigate', (e) => e.preventDefault());
  donateWin.on('closed', () => { donateWin = null; });
}

function showHelp() {
  dialog.showMessageBox(win, {
    type: 'info',
    title: 'วิธีใช้',
    message: TITLE,
    detail: [
      'Ctrl+Shift+P — สลับ PiP / จอปกติ',
      'F11 หรือ Alt+Enter — สลับเต็มหน้าจอ',
      'Esc — ออกจากเต็มหน้าจอ / กลับจาก PiP',
      'F1 — แสดงวิธีใช้',
      'F5 — โหลดหน้าเกมใหม่',
      'F8 — ซ่อนเกมและปิดเสียง',
      'Ctrl+Shift+H — ซ่อนหรือเรียกกลับจากโปรแกรมอื่น',
    ].join('\n'),
  });
}

function onInput(event, input) {
  if (input.type !== 'keyDown' || !win) return;
  const k = input.key;
  let handled = true;
  if (input.control && input.shift && k.toLowerCase() === 'p') togglePip();
  else if (k === 'F11' || (input.alt && k === 'Enter')) toggleFullscreen();
  else if (k === 'Escape' && win.isFullScreen()) win.setFullScreen(false);
  else if (k === 'Escape' && pip) togglePip();
  else if (k === 'F1') showHelp();
  else if (k === 'F5') game.webContents.reload();
  else if (k === 'F8') setHidden(true);
  else handled = false;
  if (handled) event.preventDefault();
}
