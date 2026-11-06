// editor.js — Markdown 评论编辑器：gh-editor
// 顶部是 Write / Preview 两个 tab（复用 gh-tabs）+ 右侧格式工具条，
// 中间是内嵌边框的 textarea（Preview 用 gh-md 渲染），底部是 Markdown 提示与提交按钮。
import { define, once, has, attr } from '../core.js';
import { iconSvg } from '../icons.js';
import { md } from './rich.js';

/* ---------- 工具条 ----------
   每个按钮只描述「对 textarea 选区做什么」：
   - wrap   选区包一层（没选区时插入占位文字并选中它）
   - prefix 给选中的每一行加行首前缀
   - action undo / redo 交给组件方法处理 */
const TOOLBAR = [
  { icon: 'heading', label: 'Heading', prefix: '## ' },
  { icon: 'bold', label: 'Bold', wrap: ['**', '**'], text: 'bold text' },
  { icon: 'italic', label: 'Italic', wrap: ['_', '_'], text: 'italic text' },
  { icon: 'quote', label: 'Quote', prefix: '> ' },
  { icon: 'code', label: 'Code', wrap: ['`', '`'], text: 'code' },
  { icon: 'link', label: 'Link', wrap: ['[', '](url)'], text: 'link text' },
  { sep: true },
  { icon: 'list-ordered', label: 'Numbered list', prefix: '1. ' },
  { icon: 'list-unordered', label: 'Bulleted list', prefix: '- ' },
  { icon: 'tasklist', label: 'Task list', prefix: '- [ ] ' },
  { sep: true },
  { icon: 'mention', label: 'Mention', wrap: ['@', ''], text: 'user' },
  { icon: 'cross-reference', label: 'Reference', wrap: ['#', ''], text: '1' },
  { sep: true },
  { icon: 'undo', label: 'Undo', action: 'undo' },
  { icon: 'redo', label: 'Redo', action: 'redo' },
];

/* ---------- gh-editor ----------
   <gh-editor placeholder="Add your comment here…" submit-label="Comment"></gh-editor>
   属性：placeholder / value / submit-label / no-submit / disabled / min-height / name
   事件：gh:submit { value, name }、gh:input { value } */
export class GHEditor extends HTMLElement {
  static get observedAttributes() { return ['placeholder', 'value', 'disabled', 'submit-label', 'min-height']; }

  connectedCallback() { once(this, (el) => el._build()); }

  attributeChangedCallback(name, oldV, newV) {
    if (oldV === newV || !this._input) return;
    if (name === 'placeholder') this._input.placeholder = newV || '';
    if (name === 'value' && this._input.value !== (newV || '')) {
      this._input.value = newV || '';
      if (!this._preview.hidden) this._showPreview(true);
      this._syncSubmit();
    }
    if (name === 'disabled') this._syncDisabled();
    if (name === 'submit-label' && this._submit) this._submit.textContent = newV || 'Comment';
    if (name === 'min-height') this._syncMinHeight();
  }

  get value() { return this._input ? this._input.value : attr(this, 'value', ''); }
  set value(v) {
    if (this._input) {
      this._input.value = v == null ? '' : String(v);
      if (!this._preview.hidden) this._showPreview(true);
      this._syncSubmit();
    } else {
      this.setAttribute('value', v == null ? '' : String(v));
    }
  }

  get disabled() { return has(this, 'disabled'); }
  set disabled(v) { v ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }

  focus() { this._input && this._input.focus(); }

  clear() {
    this.value = '';
    if (this._tabs) this._tabs.select(0);
    this.focus();
    return this;
  }

  submit() {
    if (has(this, 'disabled') || !this._input) return;
    const value = this.value.trim();
    if (!value) return;
    this.dispatchEvent(new CustomEvent('gh:submit', {
      bubbles: true,
      detail: { value, name: attr(this, 'name', '') },
    }));
  }

  /* ---------- 构建 ---------- */
  _build() {
    const el = this;
    el.classList.add('gh-editor');
    el._syncMinHeight();

    /* 头部：Write / Preview（gh-tabs）+ 工具条 */
    const head = document.createElement('div');
    head.className = 'gh-editor__head';

    const tabs = document.createElement('gh-tabs');
    tabs.className = 'gh-editor__tabs';
    const writeTab = document.createElement('gh-tab');
    writeTab.textContent = attr(el, 'write-label', 'Write');
    writeTab.setAttribute('selected', '');
    const previewTab = document.createElement('gh-tab');
    previewTab.textContent = attr(el, 'preview-label', 'Preview');
    tabs.append(writeTab, previewTab);
    tabs.addEventListener('gh:tab-change', (e) => el._showPreview(e.detail.tab === previewTab));
    this._tabs = tabs;

    const toolbar = document.createElement('div');
    toolbar.className = 'gh-editor__toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Text formatting');
    this._tools = [];
    TOOLBAR.forEach((tool) => {
      if (tool.sep) {
        const sep = document.createElement('span');
        sep.className = 'gh-editor__sep';
        sep.setAttribute('aria-hidden', 'true');
        toolbar.append(sep);
        return;
      }
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gh-editor__tool';
      btn.title = tool.label;
      btn.setAttribute('aria-label', tool.label);
      btn.innerHTML = iconSvg(tool.icon, 16);
      // 按下时不抢 textarea 的选区，否则「包一层」拿不到用户选中的文字
      btn.addEventListener('mousedown', (e) => e.preventDefault());
      btn.addEventListener('click', () => el._runTool(tool));
      toolbar.append(btn);
      this._tools.push(btn);
    });
    head.append(tabs, toolbar);

    /* 中间：编辑区 / 预览区共用同一块量好的盒子 */
    const main = document.createElement('div');
    main.className = 'gh-editor__main';

    const input = document.createElement('textarea');
    input.className = 'gh-editor__input';
    input.rows = 5;
    input.placeholder = attr(el, 'placeholder', '');
    input.value = attr(el, 'value', '');
    input.spellcheck = false;
    input.setAttribute('aria-label', attr(el, 'placeholder', 'Write a comment'));
    input.addEventListener('input', () => el._onInput());
    input.addEventListener('keydown', (e) => {
      // Ctrl/⌘ + Enter 提交；Esc 释放焦点
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        el.submit();
      } else if (e.key === 'Escape') {
        input.blur();
      }
    });
    this._input = input;

    const preview = document.createElement('div');
    // 复用 gh-md 的排版规则：预览区就是一块渲染好的 Markdown
    preview.className = 'gh-editor__preview gh-md';
    preview.hidden = true;
    preview.setAttribute('data-empty', 'Nothing to preview');
    this._preview = preview;

    main.append(input, preview);

    /* 底部：Markdown 提示 / 提交 */
    const foot = document.createElement('div');
    foot.className = 'gh-editor__foot';

    const hintMd = document.createElement('span');
    hintMd.className = 'gh-editor__hint';
    hintMd.innerHTML = iconSvg('markdown', 16) + '<span>Markdown is supported</span>';

    const grow = document.createElement('span');
    grow.className = 'gh-editor__grow';

    const submit = document.createElement('button');
    submit.type = 'button';
    submit.className = 'gh-editor__submit gh-btn gh-btn--primary gh-btn--sm';
    submit.textContent = attr(el, 'submit-label', 'Comment');
    submit.addEventListener('click', () => el.submit());
    this._submit = submit;
    if (has(el, 'no-submit')) submit.hidden = true;

    foot.append(hintMd, grow, submit);
    el.append(head, main, foot);

    this._syncSubmit();
    this._syncDisabled();
  }

  /* ---------- 状态 ---------- */
  _syncMinHeight() {
    const px = parseInt(attr(this, 'min-height', ''), 10);
    if (px > 0) this.style.setProperty('--gh-editor-min', px + 'px');
    else this.style.removeProperty('--gh-editor-min');
  }

  _syncSubmit() {
    if (!this._submit) return;
    const empty = !this.value.trim();
    this._submit.disabled = has(this, 'disabled') || empty;
    this.classList.toggle('is-empty', empty);
  }

  _syncDisabled() {
    const off = has(this, 'disabled');
    this.classList.toggle('is-disabled', off);
    if (this._input) this._input.disabled = off;
    if (this._tools) this._tools.forEach((b) => { b.disabled = off; });
    if (this._submit) this._submit.disabled = off || !this.value.trim();
  }

  _onInput() {
    this._syncSubmit();
    if (this._preview && !this._preview.hidden) this._showPreview(true);
    this.dispatchEvent(new CustomEvent('gh:input', { bubbles: true, detail: { value: this.value } }));
  }

  _showPreview(on) {
    if (!this._preview || !this._input) return;
    if (on) {
      const value = this.value.trim();
      this._preview.innerHTML = value ? md(value) : '';
    }
    this._preview.hidden = !on;
    this._input.hidden = on;
    this.classList.toggle('is-previewing', on);
  }

  /* ---------- 工具条动作 ---------- */
  _runTool(tool) {
    if (has(this, 'disabled')) return;
    if (tool.action === 'undo' || tool.action === 'redo') {
      this._input && this._input.focus();
      try { document.execCommand(tool.action); } catch (e) { /* 老浏览器忽略 */ }
      this._onInput();
      return;
    }
    if (tool.wrap) this._wrap(tool.wrap[0], tool.wrap[1], tool.text || '');
    if (tool.prefix) this._prefix(tool.prefix);
  }

  // 给选中的文字包一层；没有选区就插入占位文字并选中，方便直接改写
  _wrap(before, after, placeholder) {
    const ta = this._input;
    if (!ta) return;
    ta.focus();
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.slice(start, end);
    const text = selected || placeholder;
    ta.setRangeText(before + text + after, start, end, 'end');
    if (!selected) ta.setSelectionRange(start + before.length, start + before.length + text.length);
    this._onInput();
  }

  // 给选区覆盖的每一行加行首前缀（列表、标题、引用）
  _prefix(prefix) {
    const ta = this._input;
    if (!ta) return;
    ta.focus();
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const lineStart = ta.value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    let lineEnd = ta.value.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = ta.value.length;
    const block = ta.value.slice(lineStart, lineEnd);
    const next = block.split('\n').map((line) => prefix + line).join('\n');
    ta.setRangeText(next, lineStart, lineEnd, 'select');
    this._onInput();
  }
}

define('gh-editor', GHEditor);
