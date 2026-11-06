// code.js — 代码展示：gh-copy-button（复制到剪贴板）/ gh-code-block（代码块 + 行号 + 高亮）
import { define, once, has, attr, t } from '../core.js';
import { iconSvg } from '../icons.js';

/* ---------- 剪贴板 ---------- */
export async function writeClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      // 权限被拒时 promise 可能既不 resolve 也不 reject，加超时兜底，避免按钮卡在等待中
      const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), 800));
      const result = await Promise.race([navigator.clipboard.writeText(text), timeout]);
      if (result !== 'timeout') return true;
    }
  } catch (e) { /* 权限或上下文不允许，走兜底 */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;left:0;opacity:0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}

/* ---------- gh-copy-button ----------
   <gh-copy-button text="npm i gh-ui"></gh-copy-button>   纯图标
   <gh-copy-button>npm i gh-ui</gh-copy-button>            带文字
   复制成功后图标短暂变为对勾；派发 gh:copy（detail: { text, ok }） */
class GHCopyButton extends HTMLElement {
  static get observedAttributes() { return ['text', 'label']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-copy');
      // 先记下原始文本，再插入按钮，否则会把按钮内容算进去
      const own = attr(el, 'text');
      const inner = (el.textContent || '').trim();
      el._text = own !== null ? own : inner;
      el.textContent = '';   // 原文交给自绘按钮渲染，避免重复

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gh-copy__btn';
      btn.setAttribute('aria-label', attr(el, 'label', t('copy')));
      // text 属性 = 复制的内容；内部文字 = 显示的标签，两者可同时存在
      if (inner) {
        const label = document.createElement('span');
        label.className = 'gh-copy__label';
        label.textContent = inner;
        btn.append(label);
      }
      btn.insertAdjacentHTML('beforeend', iconSvg('copy', 14));
      el.append(btn);
      el._btn = btn;
      btn.addEventListener('click', () => el._copy());
    });
  }
  attributeChangedCallback() { if (this._ghDone) this._sync(); }

  _sync() {
    if (attr(this, 'text') !== null) this._text = attr(this, 'text');
    if (this._btn) this._btn.setAttribute('aria-label', attr(this, 'label', t('copy')));
  }

  async _copy() {
    const text = this._text || '';
    if (!text) return;
    const ok = await writeClipboard(text);
    this.classList.toggle('is-copied', ok);
    this.classList.toggle('is-failed', !ok);
    this._btn.innerHTML = iconSvg(ok ? 'check' : 'x', 14);
    this._btn.setAttribute('aria-label', ok ? t('copied') : t('copyFailed'));
    this.dispatchEvent(new CustomEvent('gh:copy', {
      bubbles: true, detail: { text, ok },
    }));
    clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this.classList.remove('is-copied', 'is-failed');
      this._btn.innerHTML = iconSvg('copy', 14);
      this._btn.setAttribute('aria-label', attr(this, 'label', t('copy')));
    }, 1600);
  }

  get text() { return this._text || ''; }
}

/* ---------- 代码高亮 ---------- */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const KW = {
  js: `const let var function return if else for while do switch case break continue
    class extends new this super import export from default async await try catch finally
    throw typeof instanceof in of delete void null undefined true false static get set yield`,
  json: `true false null`,
  bash: `if then else elif fi for while do done in function return local export echo cd set
    sudo npm npx node git curl mkdir rm cp mv chmod kill`,
  css: `important media supports keyframes from to inherit initial unset`,
  html: `doctype html head body div span a p ul li script style`,
};
const kwSet = (lang) => new Set((KW[lang] || KW.js).split(/\s+/).filter(Boolean));

const isWordStart = (c) => /[A-Za-z_$]/.test(c);
const isWord = (c) => /[A-Za-z0-9_$]/.test(c);

// 逐字符扫描，输出 token 序列（不做正则替换，避免把字符串里的 // 当注释）
function tokenize(code, lang) {
  const kw = kwSet(lang);
  const hash = lang === 'bash' || lang === 'python' || lang === 'yaml';
  const tokens = [];
  let i = 0;
  const n = code.length;
  const push = (cls, text) => { if (text) tokens.push({ cls, text }); };

  while (i < n) {
    const c = code[i];
    // 行注释
    if ((c === '/' && code[i + 1] === '/') || (c === '#' && hash)) {
      let j = code.indexOf('\n', i);
      if (j < 0) j = n;
      push('com', code.slice(i, j));
      i = j;
      continue;
    }
    // 块注释
    if (c === '/' && code[i + 1] === '*') {
      let j = code.indexOf('*/', i + 2);
      j = j < 0 ? n : j + 2;
      push('com', code.slice(i, j));
      i = j;
      continue;
    }
    // 字符串
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === c) { j++; break; }
        j++;
      }
      push('str', code.slice(i, j));
      i = j;
      continue;
    }
    // 数字
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < n && /[0-9a-fA-FxX._]/.test(code[j])) j++;
      push('num', code.slice(i, j));
      i = j;
      continue;
    }
    // 标识符 / 关键字
    if (isWordStart(c)) {
      let j = i;
      while (j < n && isWord(code[j])) j++;
      const w = code.slice(i, j);
      push(kw.has(w.toLowerCase()) ? 'kw' : '', w);
      i = j;
      continue;
    }
    push('', c);
    i++;
  }
  return tokens;
}

// 把 token 序列切成行，每行一个 span，行号用 CSS counter
function renderLines(code, lang) {
  const tokens = tokenize(code, lang);
  const lines = [[]];
  tokens.forEach((tok) => {
    const parts = tok.text.split('\n');
    parts.forEach((part, idx) => {
      if (idx > 0) lines.push([]);
      if (part) lines[lines.length - 1].push(tok.cls ? { cls: tok.cls, text: part } : { cls: '', text: part });
    });
  });
  return lines.map((toks) => {
    const inner = toks.map((tok) => (tok.cls
      ? `<span class="gh-code__t-${tok.cls}">${esc(tok.text)}</span>`
      : esc(tok.text))).join('');
    return `<span class="gh-code__line">${inner}</span>`;
  });
}

/* ---------- gh-code-block ----------
   <gh-code-block title="install.sh" lang="bash" line-numbers>
     npm i gh-ui
   </gh-code-block>
   属性：title 文件名、lang 语言、line-numbers 行号、no-copy 隐藏复制按钮 */
class GHCodeBlock extends HTMLElement {
  static get observedAttributes() { return ['title', 'lang', 'line-numbers', 'no-copy']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-code');
      const code = (el.textContent || '').replace(/^\n/, '').replace(/\s+$/, '');
      el._code = code;
      el.textContent = '';   // 原始代码文本由 __code 渲染，不能留在宿主里

      const head = document.createElement('div');
      head.className = 'gh-code__head';
      const title = document.createElement('span');
      title.className = 'gh-code__title';
      head.append(title);

      const body = document.createElement('div');
      body.className = 'gh-code__body';
      const pre = document.createElement('pre');
      pre.className = 'gh-code__pre';
      const inner = document.createElement('code');
      inner.className = 'gh-code__code';
      pre.append(inner);
      body.append(pre);

      el.append(head, body);
      el._head = head;
      el._title = title;
      el._codeEl = inner;

      const copy = document.createElement('gh-copy-button');
      copy.className = 'gh-code__copy';
      copy.setAttribute('text', code);
      head.append(copy);
      el._copy = copy;

      el._sync();
    });
  }
  attributeChangedCallback() { if (this._ghDone) this._sync(); }

  _sync() {
    const title = attr(this, 'title', '');
    this._title.textContent = title;
    this._head.hidden = !title && has(this, 'no-copy');
    this._copy.hidden = has(this, 'no-copy');
    this._copy.setAttribute('text', this._code || '');
    const lang = attr(this, 'lang', '');
    const numbered = has(this, 'line-numbers');
    this.classList.toggle('gh-code--numbered', numbered);
    const lines = renderLines(this._code || '', lang);
    this._codeEl.innerHTML = lines.join('');
    // 行号槽宽按最大行号位数计算，避免固定 40px 在短代码上留出大片空白
    const digits = String(Math.max(1, lines.length)).length;
    this.style.setProperty('--gh-code-gutter', Math.max(24, digits * 7.5 + 12) + 'px');
  }
}

define('gh-copy-button', GHCopyButton);
define('gh-code-block', GHCodeBlock);
