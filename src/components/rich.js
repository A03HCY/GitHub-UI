// rich.js — 富内容组件：gh-md（Markdown 渲染）/ gh-time（相对时间）
// 渲染规则移植自 TeamFlow static/assets/js/markdown.js 与 util.js(timeAgo)
import { define, once, attr, t } from '../core.js';

const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC_MAP[c]);

/* 极简 Markdown：默认全量转义（防 XSS），支持代码块、行内代码、加粗、链接、列表、标题 */
export function md(text) {
  if (!text || !String(text).trim()) return `<p class="gh-dim">${t('noDescription')}</p>`;
  let s = esc(text);
  // 围栏代码块：```lang 里的语言标记不进入正文，只写成 <code class="language-lang">
  s = s.replace(/```([a-zA-Z0-9+#-]*)[ \t]*\n?([\s\S]*?)```/g, (m, lang, code) =>
    `<pre><code${lang ? ` class="language-${lang.toLowerCase()}"` : ''}>${code.replace(/^\n+|\n+$/g, '')}</code></pre>`);
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  return s.split(/\n{2,}/).map((block) => {
    if (/^\s*<pre>/.test(block)) return block;
    const lines = block.split('\n');
    if (lines.length === 1 && /^#{1,6}\s+/.test(lines[0])) {
      const level = lines[0].match(/^#+/)[0].length;
      return `<h${level}>${lines[0].replace(/^#{1,6}\s+/, '')}</h${level}>`;
    }
    // 引用块：源码是 "> " 开头，但这一步已经过 esc()，" > " 变成了 "&gt; "
    if (lines.every((l) => /^\s*&gt;/.test(l))) {
      // 多行用 <br> 连起来（与 GitHub 的软换行表现一致）
      const body = lines.map((l) => l.replace(/^\s*&gt;\s?/, '')).join('<br>');
      return '<blockquote>' + body + '</blockquote>';
    }
    if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
      const item = (l) => {
        const body = l.replace(/^\s*[-*]\s+/, '');
        // GFM 任务列表：- [x] / - [ ]
        const task = body.match(/^\[([ xX])\]\s+([\s\S]*)$/);
        if (!task) return '<li>' + body + '</li>';
        const on = task[1].toLowerCase() === 'x';
        return '<li class="gh-md-task"><input type="checkbox" disabled' + (on ? ' checked' : '') + '> ' + task[2] + '</li>';
      };
      return '<ul>' + lines.map(item).join('') + '</ul>';
    }
    if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) {
      return '<ol>' + lines.map((l) => '<li>' + l.replace(/^\s*\d+[.)]\s+/, '') + '</li>').join('') + '</ol>';
    }
    return '<p>' + lines.join('<br>') + '</p>';
  }).join('');
}

/* ---------- gh-md ----------
   <gh-md>**加粗** 与 `代码`</gh-md> —— 内容按 Markdown 渲染，原始文本已转义 */
export class GHMd extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-md');
      // 去掉标签内首尾的换行与缩进（否则 Markdown 会把起头的换行当成 <br>，正文顶上多一行）
      const source = el.textContent.replace(/^[ \t]*\r?\n/, '').replace(/\r?\n[ \t]*$/, '');
      el.innerHTML = md(source);
    });
  }
  static render(text) { return md(text); }
}

/* 相对时间：刚刚 / x 分钟前 / x 小时前 / x 天前 / 具体日期 */
export function timeAgo(iso) {
  if (!iso) return '';
  const ts = new Date(iso).getTime();   // 注意不能叫 t，会遮蔽文案函数 t()
  if (isNaN(ts)) return '';
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return t('justNow');
  if (diff < 3600) return t('minutesAgo', { count: Math.floor(diff / 60) });
  if (diff < 86400) return t('hoursAgo', { count: Math.floor(diff / 3600) });
  if (diff < 86400 * 30) return t('daysAgo', { count: Math.floor(diff / 86400) });
  const d = new Date(iso);
  return t('dateFull', { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
}

/* ---------- gh-time ----------
   <gh-time datetime="2026-11-04T08:00:00Z"> —— 自动显示相对时间，每分钟自刷新 */
export class GHTime extends HTMLElement {
  static get observedAttributes() { return ['datetime']; }
  connectedCallback() {
    this._render();
    GHTime._bind();
  }
  attributeChangedCallback(_n, o, v) { if (o !== v) this._render(); }
  _render() {
    const dt = attr(this, 'datetime');
    if (!dt) { this.textContent = ''; return; }
    this.classList.add('gh-time');
    this.textContent = timeAgo(dt);
    this.title = new Date(dt).toLocaleString();
  }
  // 全局只挂一个定时器，刷新页面上所有 gh-time
  static _bind() {
    if (GHTime._timer) return;
    GHTime._timer = setInterval(() => {
      document.querySelectorAll('gh-time').forEach((el) => el._render());
    }, 60_000);
  }
}

define('gh-md', GHMd);
define('gh-time', GHTime);
