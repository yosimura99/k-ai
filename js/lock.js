/**
 * lock.js — Màn hình khoá sinh trắc khi mở app (WebAuthn / passkey).
 *
 * LƯU Ý QUAN TRỌNG: đây là KHOÁ TIỆN LỢI CỤC BỘ, KHÔNG được máy chủ xác minh.
 * App là trang tĩnh, không có máy chủ để kiểm tra chữ ký WebAuthn; ta chỉ dựa vào
 * việc trình duyệt/hệ điều hành xác thực người dùng (Face ID / Touch ID / Windows Hello)
 * thành công. Nó ngăn người khác mở app khi cầm máy bạn, nhưng không bảo vệ được dữ liệu
 * trước người có quyền truy cập công cụ dành cho nhà phát triển hoặc bộ nhớ trình duyệt.
 *
 * Luồng:
 *  - Lần đầu: nút THIẾT LẬP KHOÁ SINH TRẮC → navigator.credentials.create (platform authenticator).
 *  - Các lần sau: navigator.credentials.get với allowCredentials = [id đã lưu].
 *  - Nếu thiết bị không hỗ trợ: hiện [CẢNH BÁO] và cho vào (không bao giờ khoá người dùng ở ngoài).
 *  - Khoá lại khi mở lại app hoặc quay lại sau > 5 phút chạy nền.
 */
import { el, sleep } from './ui.js';

const LS_LOCK = 'kai.lock.v1';
const RELOCK_MS = 5 * 60 * 1000;
const MIN_ANIM_MS = 3400; // thời gian tối thiểu của hoạt ảnh quét khi xác thực thành công

/* ---------- lưu trạng thái ---------- */
function readState() {
  try { return { enabled: true, credId: '', ...JSON.parse(localStorage.getItem(LS_LOCK) || '{}') }; }
  catch { return { enabled: true, credId: '' }; }
}
function writeState(patch) {
  const s = { ...readState(), ...patch };
  try { localStorage.setItem(LS_LOCK, JSON.stringify(s)); } catch { /* bỏ qua */ }
  return s;
}

/* ---------- base64url ---------- */
function toB64url(buf) {
  let s = '';
  new Uint8Array(buf).forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

/** Có trình xác thực nền tảng (Face ID / Touch ID / Windows Hello) không? */
async function platformAvailable() {
  try {
    if (!window.isSecureContext || !window.PublicKeyCredential || !navigator.credentials) return false;
    if (!PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Safari (iOS/macOS) chỉ cho gọi WebAuthn sau khi người dùng chạm → không tự gọi. */
function needsTap() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /safari/i.test(ua) && !/chrome|crios|android|fxios|edg/i.test(ua);
  return ios || safari;
}

/** Đổi lỗi WebAuthn thành câu tiếng Việt. */
function describe(e) {
  const map = {
    NotAllowedError: 'bị huỷ hoặc hết thời gian',
    InvalidStateError: 'khoá đã tồn tại trên thiết bị',
    SecurityError: 'tên miền không hợp lệ cho khoá',
    NotSupportedError: 'thiết bị không hỗ trợ',
    AbortError: 'đã huỷ',
  };
  return map[e?.name] || e?.message || String(e);
}

/**
 * Dòng trạng thái gọn cho màn hình khoá: chỉ giữ 3 dòng gần nhất, chữ mờ, không có nhãn kiểu terminal.
 * Cùng giao diện ok/info/warn/error/clear với createLogger.
 */
function miniLog(box) {
  const line = (level, text) => {
    const d = el('div', `lock-line lv-${level}`, String(text).replace(/\s*\/\/\s*/g, ' · ').replace(/\.\.\.$/, '…').replace(/^./, (c) => c.toUpperCase()));
    box.appendChild(d);
    while (box.children.length > 3) box.firstElementChild.remove();
    return d;
  };
  return {
    ok: (t) => line('ok', t),
    info: (t) => line('info', t),
    warn: (t) => line('warn', t),
    error: (t) => line('error', t),
    clear: () => { box.textContent = ''; },
  };
}

export function createLock() {
  const root = document.getElementById('lock');
  const scanner = document.getElementById('lock-scanner');
  const actions = document.getElementById('lock-actions');
  const log = miniLog(document.getElementById('lock-log'));

  let unlocked = false;
  let busy = false;
  let resolveGate = null;
  let hiddenAt = 0;

  const setPhase = (p) => { scanner.dataset.phase = p; };

  function setActions(buttons) {
    actions.textContent = '';
    buttons.forEach((b) => {
      const btn = el('button', 'btn ' + (b.danger ? 'btn-danger' : b.ghost ? 'btn-ghost' : 'btn-primary'), b.label);
      btn.type = 'button';
      btn.addEventListener('click', b.onClick);
      actions.appendChild(btn);
    });
  }

  function show() {
    unlocked = false;
    root.hidden = false;
    document.body.classList.add('locked');
  }

  async function open(message) {
    if (message) log.ok(message);
    setPhase('ok');
    setActions([]);
    await sleep(700);
    root.classList.add('fade');
    await sleep(350);
    root.hidden = true;
    root.classList.remove('fade');
    document.body.classList.remove('locked');
    unlocked = true;
    const r = resolveGate;
    resolveGate = null;
    r?.();
  }

  /** Chạy hoạt ảnh quét mặt → quét mống mắt song song với hộp thoại Face ID. */
  function animate() {
    let stop = false;
    (async () => {
      setPhase('face');
      log.info('đang quét khuôn mặt...');
      await sleep(1800);
      if (stop) return;
      setPhase('iris');
      log.info('đang quét mống mắt...');
    })();
    return () => { stop = true; };
  }

  /* ---------- thiết lập lần đầu ---------- */
  async function register() {
    if (busy) return false;
    busy = true;
    setActions([]);
    const stopAnim = animate();
    const minAnim = sleep(MIN_ANIM_MS); // cho hoạt ảnh quét mặt → mống mắt chạy trọn
    try {
      const cred = await navigator.credentials.create({
        publicKey: {
          challenge: randomBytes(32), // thử thách ngẫu nhiên (không có máy chủ kiểm tra)
          rp: { id: location.hostname, name: 'K.AI' },
          user: { id: randomBytes(16), name: 'khang', displayName: 'Khang' },
          pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'preferred',
          },
          timeout: 60000,
          attestation: 'none',
        },
      });
      await minAnim;
      stopAnim();
      writeState({ enabled: true, credId: toB64url(cred.rawId) });
      return true;
    } catch (e) {
      stopAnim();
      setPhase('fail');
      log.error(`thiết lập thất bại // ${describe(e)}`);
      return false;
    } finally {
      busy = false;
    }
  }

  /* ---------- xác thực ---------- */
  async function verify() {
    if (busy) return;
    busy = true;
    setActions([]);
    const stopAnim = animate();
    const minAnim = sleep(MIN_ANIM_MS);
    try {
      const { credId } = readState();
      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge: randomBytes(32),
          rpId: location.hostname,
          allowCredentials: [{ type: 'public-key', id: fromB64url(credId) }],
          userVerification: 'required',
          timeout: 60000,
        },
      });
      await minAnim;
      stopAnim();
      // Khoá cục bộ: chấp nhận khi hệ điều hành báo xác thực thành công
      // và đúng khoá đã đăng ký. (Không xác minh chữ ký phía máy chủ.)
      if (!assertion || toB64url(assertion.rawId) !== credId) throw new Error('khoá không khớp');
      busy = false;
      await open('xác thực thành công // chào Khang');
    } catch (e) {
      stopAnim();
      busy = false;
      setPhase('fail');
      log.error(`xác thực thất bại // ${describe(e)}`);
      setActions([{ label: 'Thử lại', onClick: verify }]);
    }
  }

  /** Màn hình thiết lập lần đầu. */
  function showSetup() {
    setPhase('idle');
    log.info('chưa có khoá sinh trắc trên thiết bị này');
    const doSetup = async () => {
      if (await register()) await open('đã thiết lập khoá // chào Khang');
      else setActions([{ label: 'Thử lại', onClick: doSetup }, { label: 'Bỏ qua', ghost: true, onClick: skip }]);
    };
    const skip = () => { writeState({ enabled: false }); log.warn('đã bỏ qua khoá sinh trắc // bật lại trong Cài đặt'); open(); };
    setActions([
      { label: 'Thiết lập Face ID', onClick: doSetup },
      { label: 'Bỏ qua', ghost: true, onClick: skip },
    ]);
  }

  /**
   * Cổng khoá: trả về Promise hoàn tất khi người dùng được vào app.
   */
  async function gate() {
    const st = readState();
    if (!st.enabled) { root.hidden = true; document.body.classList.remove('locked'); unlocked = true; return; }
    if (resolveGate) return new Promise((r) => { const prev = resolveGate; resolveGate = () => { prev(); r(); }; });
    show();
    log.clear();
    setActions([]);
    setPhase('idle');
    const done = new Promise((r) => { resolveGate = r; });
    log.info('khởi động mô-đun sinh trắc...');
    await sleep(500);
    if (!(await platformAvailable())) {
      setPhase('fail');
      log.warn('thiết bị / trình duyệt không hỗ trợ Face ID / Touch ID // vào không cần khoá');
      await sleep(2200);
      await open();
      return done;
    }
    if (!st.credId) { showSetup(); return done; }
    if (needsTap()) {
      log.info('chạm để quét Face ID');
      setActions([{ label: 'Mở khoá', onClick: verify }]);
    } else {
      verify();
    }
    return done;
  }

  /* ---------- khoá lại khi chạy nền lâu ---------- */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (unlocked && hiddenAt && Date.now() - hiddenAt > RELOCK_MS) gate();
  });
  // Trang được khôi phục từ bộ nhớ đệm (back/forward) = mở lại app
  window.addEventListener('pageshow', (e) => { if (e.persisted && unlocked) gate(); });

  return {
    gate,
    isEnabled: () => readState().enabled,
    hasCredential: () => !!readState().credId,
    /** Bật khoá từ CÀI ĐẶT (đăng ký ngay nếu chưa có khoá). */
    async enable() {
      if (!(await platformAvailable())) { writeState({ enabled: false }); return false; }
      if (readState().credId) { writeState({ enabled: true }); return true; }
      const ok = await register();
      if (!ok) writeState({ enabled: false });
      return ok;
    },
    disable() { writeState({ enabled: false }); },
    reset() { writeState({ enabled: true, credId: '' }); },
  };
}
