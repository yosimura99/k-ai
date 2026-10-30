/**
 * speech.js — Giọng nói trên trình duyệt:
 *  - Đọc chính tả (nói → chữ): Web Speech API SpeechRecognition / webkitSpeechRecognition (Safari iOS 14.5+, Chrome).
 *  - Đọc to câu trả lời: speechSynthesis.
 * Không hỗ trợ thì các nút tương ứng được ẩn.
 */
const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;

export const canDictate = !!Rec;
export const canSpeak = 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

let active = null; // phiên đọc chính tả đang chạy

/**
 * Đọc chính tả vào một ô nhập.
 * @param {HTMLTextAreaElement} input
 * @param {{onState?:(on:boolean)=>void, onError?:(msg:string)=>void, onText?:()=>void}} cb
 */
export function toggleDictation(input, cb = {}) {
  if (!Rec) return;
  if (active) { active.stop(); return; }
  const rec = new Rec();
  rec.lang = 'vi-VN';
  rec.interimResults = true;
  rec.continuous = false;
  const base = input.value ? input.value.replace(/\s*$/, ' ') : '';
  rec.onresult = (e) => {
    let txt = '';
    for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
    input.value = base + txt;
    cb.onText?.();
  };
  rec.onerror = (e) => {
    const map = { 'not-allowed': 'chưa cho phép dùng micro', 'no-speech': 'không nghe thấy giọng nói', 'audio-capture': 'không tìm thấy micro', network: 'lỗi mạng khi nhận dạng giọng nói' };
    if (e.error !== 'aborted') cb.onError?.(map[e.error] || `lỗi nhận dạng giọng nói (${e.error})`);
  };
  rec.onend = () => { active = null; cb.onState?.(false); };
  try {
    rec.start();
    active = rec;
    cb.onState?.(true);
  } catch (e) {
    active = null;
    cb.onError?.(e.message || 'không bật được micro');
  }
}

export function stopDictation() { active?.stop(); }

let speaking = null;
/** Đọc to (bấm lần nữa để dừng). Trả về true nếu bắt đầu đọc. */
export function toggleSpeak(text, onEnd) {
  if (!canSpeak) return false;
  const synth = window.speechSynthesis;
  if (speaking) {
    const was = speaking;
    synth.cancel();
    speaking = null;
    if (was.text === text) return false;
  }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'vi-VN';
  const vi = synth.getVoices().find((v) => /^vi/i.test(v.lang));
  if (vi) u.voice = vi;
  u.rate = 1.05;
  u.onend = u.onerror = () => { if (speaking === u) speaking = null; onEnd?.(); };
  speaking = u;
  synth.speak(u);
  return true;
}

/** Bỏ ký hiệu markdown để đọc tự nhiên hơn. */
export function plainForSpeech(md) {
  return String(md || '')
    .replace(/```[\s\S]*?(```|$)/g, ' (đoạn mã) ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
