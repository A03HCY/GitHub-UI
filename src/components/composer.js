// composer.js — 聊天/提问输入框：gh-composer
// 自适应高度的 textarea + 左侧/右侧工具槽 + 内置发送按钮
import { define, once, has, attr, t } from '../core.js';
import { iconSvg } from '../icons.js';

/* ---------- gh-composer ----------
   <gh-composer placeholder="Ask anything…">
     <gh-btn slot="start">Ask</gh-btn>
     <gh-btn slot="end" size="icon">…</gh-btn>
   </gh-composer>
   事件：gh:send detail { value }、gh:input detail { value } */
export class GHComposer extends HTMLElement {
  static get observedAttributes() { return ['placeholder', 'value', 'disabled']; }

  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-composer');

      const input = document.createElement('textarea');
      input.className = 'gh-composer__input';
      input.rows = 1;
      input.placeholder = attr(el, 'placeholder', '');
      input.value = attr(el, 'value', '');
      el._input = input;
      input.addEventListener('input', () => {
        el._autosize();
        el._syncSend();
        el.dispatchEvent(new CustomEvent('gh:input', { bubbles: true, detail: { value: input.value } }));
      });
      input.addEventListener('keydown', (e) => {
        // Enter 发送，Shift+Enter 换行；输入法组合中的 Enter 不能当发送
        if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
          e.preventDefault();
          el.send();
        }
      });

      const bar = document.createElement('div');
      bar.className = 'gh-composer__bar';
      const start = document.createElement('div');
      start.className = 'gh-composer__start';
      const end = document.createElement('div');
      end.className = 'gh-composer__end';
      el._bar = bar;

      // 工具槽：slot="start" / slot="end"
      [...el.childNodes].forEach((node) => {
        const slot = node.nodeType === 1 ? node.getAttribute('slot') : null;
        if (slot === 'start') {
          node.removeAttribute('slot');
          start.append(node);
        } else if (slot === 'end') {
          node.removeAttribute('slot');
          end.append(node);
        }
      });

      if (!has(el, 'no-send')) {
        const send = document.createElement('button');
        send.type = 'button';
        send.className = 'gh-composer__send';
        const label = attr(el, 'send-label', t('send'));
        send.setAttribute('aria-label', label);
        send.title = label;
        send.innerHTML = iconSvg('paper-airplane', 16);
        send.addEventListener('click', () => el.send());
        end.append(send);
        el._send = send;
      }

      bar.append(start, end);
      el.append(input, bar);
      if (!start.childElementCount && !end.childElementCount) bar.hidden = true;

      el.addEventListener('click', (e) => {
        // 点空白处聚焦输入框，但不要抢工具按钮的焦点
        if (e.target.closest('button, a, input, textarea, gh-btn, gh-popover, gh-dropdown')) return;
        input.focus();
      });

      el._autosize();
      el._syncSend();
      el._syncDisabled();
    });
  }

  attributeChangedCallback(name, oldV, newV) {
    if (oldV === newV || !this._input) return;
    if (name === 'placeholder') this._input.placeholder = newV || '';
    if (name === 'value') {
      this._input.value = newV || '';
      this._autosize();
      this._syncSend();
    }
    if (name === 'disabled') this._syncDisabled();
  }

  get value() { return this._input ? this._input.value : attr(this, 'value', ''); }
  set value(v) {
    if (this._input) {
      this._input.value = v;
      this._autosize();
      this._syncSend();
    } else {
      this.setAttribute('value', v);
    }
  }

  get disabled() { return has(this, 'disabled'); }
  set disabled(v) { v ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }

  focus() { this._input && this._input.focus(); }

  clear() {
    this.value = '';
    this.focus();
    return this;
  }

  send() {
    if (has(this, 'disabled')) return;
    const value = this.value.trim();
    if (!value) return;
    this.dispatchEvent(new CustomEvent('gh:send', { bubbles: true, detail: { value } }));
  }

  _autosize() {
    const input = this._input;
    if (!input) return;
    const max = parseInt(attr(this, 'max-height', '200'), 10) || 200;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, max) + 'px';
    input.style.overflowY = input.scrollHeight > max ? 'auto' : 'hidden';
  }

  _syncSend() {
    if (!this._input) return;
    const empty = !this._input.value.trim();
    const off = has(this, 'disabled') || empty;
    if (this._send) this._send.disabled = off;
    this.classList.toggle('is-empty', empty);
  }

  _syncDisabled() {
    if (!this._input) return;
    this._input.disabled = has(this, 'disabled');
    this.classList.toggle('is-disabled', has(this, 'disabled'));
    this._syncSend();
  }
}

define('gh-composer', GHComposer);
