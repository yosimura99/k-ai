/**
 * md.js — Hiển thị Markdown đơn giản cho câu trả lời của mô hình.
 * AN TOÀN: chỉ tạo phần tử bằng createElement + textContent, KHÔNG dùng innerHTML.
 * Hỗ trợ: đoạn văn, tiêu đề #, danh sách - / 1., trích dẫn >, khối mã ```, mã `nội dòng`,
 * **đậm**, *nghiêng*, [liên kết](https://...), đường kẻ ---, bảng đơn giản | a | b |.
 */
import { el } from './ui.js';

/** Vẽ markdown vào container (xoá nội dung cũ). */
export function renderMarkdown(container, text) {
  container.textContent = '';
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  let para = [];
  const flushPara = () => {
    if (!para.length) return;
    const p = el('p');
    inline(p, para.join('\n'));
    container.appendChild(p);
    para = [];
  };

  while (i < lines.length) {
    const line = lines[i];

    // Khối mã ``` (chưa đóng thì lấy tới cuối — để hiện đúng khi đang phát trực tiếp)
    const fence = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/.exec(line);
    if (fence) {
      flushPara();
      const code = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s*${fence[1]}\\s*$`).test(lines[i])) code.push(lines[i++]);
      i++;
      const pre = el('pre');
      if (fence[2]) pre.dataset.lang = fence[2];
      pre.appendChild(el('code', '', code.join('\n')));
      container.appendChild(pre);
      continue;
    }

    if (!line.trim()) { flushPara(); i++; continue; }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      const lvl = Math.min(h[1].length + 1, 6); // # → h2 (giữ cỡ chữ vừa phải)
      const e = el(`h${lvl}`);
      inline(e, h[2].replace(/\s+#+\s*$/, ''));
      container.appendChild(e);
      i++;
      continue;
    }

    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); container.appendChild(el('hr')); i++; continue; }

    if (/^\s*>/.test(line)) {
      flushPara();
      const q = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ''));
      const bq = el('blockquote');
      renderMarkdown(bq, q.join('\n'));
      container.appendChild(bq);
      continue;
    }

    // Bảng: dòng | a | b | tiếp theo là | --- | --- |
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      flushPara();
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const wrap = el('div', 'table-wrap');
      const table = el('table');
      const thead = el('thead');
      const tr = el('tr');
      cells(line).forEach((c) => { const th = el('th'); inline(th, c); tr.appendChild(th); });
      thead.appendChild(tr);
      table.appendChild(thead);
      const tbody = el('tbody');
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        const r = el('tr');
        cells(lines[i++]).forEach((c) => { const td = el('td'); inline(td, c); r.appendChild(td); });
        tbody.appendChild(r);
      }
      table.appendChild(tbody);
      wrap.appendChild(table);
      container.appendChild(wrap);
      continue;
    }

    const li = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      const ordered = /\d/.test(li[2]);
      const list = el(ordered ? 'ol' : 'ul');
      if (ordered) { const n = parseInt(li[2], 10); if (n > 1) list.start = n; }
      while (i < lines.length) {
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!m || /\d/.test(m[2]) !== ordered) break;
        const item = el('li');
        const body = [m[3]];
        i++;
        // dòng tiếp nối thụt lề thuộc cùng mục
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) body.push(lines[i++].trim());
        inline(item, body.join('\n'));
        list.appendChild(item);
      }
      container.appendChild(list);
      continue;
    }

    para.push(line);
    i++;
  }
  flushPara();
}

/** Định dạng trong dòng: `mã`, **đậm**, *nghiêng*, [chữ](url), xuống dòng. */
function inline(parent, text) {
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*|__[^_\n]+__)|(\*[^*\n]+\*)|(\[[^\]\n]+\]\((https?:\/\/[^)\s]+)\))|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|(\n)/g;
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
    if (m[1]) parent.appendChild(el('code', '', m[1].slice(1, -1)));
    else if (m[2]) { const b = el('strong'); inline(b, m[2].slice(2, -2)); parent.appendChild(b); }
    else if (m[3]) { const e = el('em'); inline(e, m[3].slice(1, -1)); parent.appendChild(e); }
    else if (m[4]) parent.appendChild(link(m[4].slice(1, m[4].indexOf('](')), m[5]));
    else if (m[6]) parent.appendChild(link(m[6], m[6]));
    else if (m[7]) parent.appendChild(el('br'));
    last = re.lastIndex;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}

function link(text, href) {
  const a = el('a', '', text);
  a.href = href; // chỉ http(s) — đã lọc bằng biểu thức chính quy
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}
