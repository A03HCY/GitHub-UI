import { define, once, has, attr, uid, t } from '../core.js';
import { iconSvg } from '../icons.js';
import { createPopup } from '../core/overlay.js';

/* ---------- gh-autocomplete ----------
   <gh-autocomplete label="Filter" placeholder="Filter issues…">
     <gh-autocomplete-item value="has:runner-type" icon="package">Runner type</gh-autocomplete-item>
     <gh-autocomplete-item value="has" icon="plus-circle" prefix>Has</gh-autocomplete-item>
   </gh-autocomplete>

   输入时按「当前 token」补全：token 取光标前最后一个空白之后的文本，
   按冒号分段匹配（token 段数必须和候选 value 的段数一致），
   所以打 ha 只出 Has，选完自动补成 has: 再列出 has:xxx 的候选。
   选中后写回输入框（前缀类补冒号、值类补空格），派发 gh:autocomplete-select。 */

// 子元素只是声明式数据源，渲染时移除
class GHAutocompleteItem extends HTMLElement {
  connectedCallback() { this.style.display = 'none'; }
}

const normalize = (raw) => ({
  value: String(raw.value == null ? raw.label || '' : raw.value),
  label: String(raw.label == null ? raw.value || '' : raw.label),
  icon: raw.icon || '',
  prefix: !!raw.prefix,
});

class GHAutocomplete extends HTMLElement {
  static get observedAttributes() { return ['value', 'placeholder', 'label', 'disabled']; }

  connectedCallback() {
    clearTimeout(this._destroyTimer);
    this._destroyTimer = 0;
    once(this, (el) => this._build(el));
  }

  disconnectedCallback() {
    // 父组件搬动节点时会触发断开/重连，延迟一拍再销毁（重连就取消）
    this._destroyTimer = setTimeout(() => {
      if (this.isConnected) return;
      this._popup && this._popup.destroy();
      this._popup = null;
    }, 0);
  }

  _build(el) {
    el.classList.add('gh-autocomplete');

    // 声明式候选：全部收集后从 DOM 里摘掉
    const decl = [...el.children].filter((c) => c.tagName === 'GH-AUTOCOMPLETE-ITEM');
    const items = decl.map((c) => normalize({
      value: attr(c, 'value'),
      label: (c.textContent || '').trim(),
      icon: attr(c, 'icon'),
      prefix: has(c, 'prefix'),
    }));
    decl.forEach((c) => c.remove());
    this._all = items;

    const field = document.createElement('div');
    field.className = 'gh-autocomplete__field';
    const labelText = attr(el, 'label');
    if (labelText) {
      const lab = document.createElement('span');
      lab.className = 'gh-autocomplete__label';
      lab.textContent = labelText;
      field.append(lab);
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'gh-autocomplete__input gh-input__inner';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    const menuId = uid('gh-autocomplete');
    input.setAttribute('aria-controls', menuId);
    if (attr(el, 'placeholder')) input.placeholder = attr(el, 'placeholder');
    if (has(el, 'disabled')) input.disabled = true;
    field.append(input);

    const menu = document.createElement('div');
    menu.className = 'gh-autocomplete__menu gh-menu';
    menu.id = menuId;
    menu.setAttribute('role', 'listbox');
    document.body.append(menu);

    el.append(field);
    this._field = field;
    this._input = input;
    this._menu = menu;
    this._menuId = menuId;
    this._rows = [];
    this._active = -1;

    // 开合 / 外部点击 / Esc / 重定位走公共内核
    this._popup = createPopup({
      panel: menu,
      anchor: field,
      placement: 'bottom-start',
      offset: 4,
      haspopup: 'listbox',
      aria: false,
      beforePlace: () => {
        this._render();
        menu.style.minWidth = Math.round(field.getBoundingClientRect().width) + 'px';
      },
      onOpen: () => {
        el.classList.add('is-open');
        input.setAttribute('aria-expanded', 'true');
        this._render();
      },
      onClose: () => {
        el.classList.remove('is-open');
        input.setAttribute('aria-expanded', 'false');
        input.removeAttribute('aria-activedescendant');
      },
    });

    input.addEventListener('input', () => this._onInput());
    input.addEventListener('keydown', (e) => this._onKey(e));
    input.addEventListener('focus', () => this._open(true));
    input.addEventListener('click', () => this._open(false));

    if (attr(el, 'value') !== null) input.value = attr(el, 'value');
    el._sync && el._sync();
  }

  attributeChangedCallback() { if (this._ghDone) this._sync(); }

  _sync() {
    if (!this._input) return;
    const v = attr(this, 'value');
    if (v !== null && this._input.value !== v) this._input.value = v;
    if (attr(this, 'placeholder')) this._input.placeholder = attr(this, 'placeholder');
    this._input.disabled = has(this, 'disabled');
    this.classList.toggle('is-disabled', has(this, 'disabled'));
    const lab = this.querySelector('.gh-autocomplete__label');
    const labelText = attr(this, 'label');
    if (lab) lab.textContent = labelText || '';
    else if (labelText) {
      const span = document.createElement('span');
      span.className = 'gh-autocomplete__label';
      span.textContent = labelText;
      this._field.prepend(span);
    }
  }

  /* ---------- 数据 ---------- */

  get items() { return this._all ? this._all.slice() : []; }
  set items(list) {
    this._all = (list || []).map((it) => normalize(typeof it === 'string' ? { value: it, label: it } : it));
    if (this._popup && this._popup.isOpen) this._popup.reposition();
  }

  /* ---------- 补全 ---------- */

  // 光标前的最后一个 token
  _token() {
    const input = this._input;
    const raw = input.value;
    const pos = input.selectionStart == null ? raw.length : input.selectionStart;
    const before = raw.slice(0, pos);
    const m = /(\S*)$/.exec(before);
    const token = m ? m[1] : '';
    return { token, start: pos - token.length, end: pos };
  }

  _suggest(token) {
    const q = token.toLowerCase();
    const depth = token.split(':').length - 1;
    return this._all.filter((it) => {
      const value = it.value.toLowerCase();
      if (value.split(':').length - 1 !== depth) return false;
      if (!q) return true;
      return value.startsWith(q) || it.label.toLowerCase().startsWith(q);
    }).slice(0, 40);
  }

  _onInput() {
    if (!this._popup || this._silent) return;
    if (!this._suggest(this._token().token).length) { this._popup.close('input'); return; }
    this._popup.open();
  }

  // 聚焦/点击时展开（onlyIfMatches：没候选就不弹）
  _open(onlyIfMatches) {
    if (!this._popup || this._input.disabled) return;
    if (onlyIfMatches && !this._suggest(this._token().token).length) return;
    if (!onlyIfMatches && !this._all.length) return;
    this._popup.open();
  }

  _onKey(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!this._popup.isOpen) this._open(false);
      else this._move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (this._popup.isOpen) this._move(-1);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (!this._popup.isOpen || !this._rows.length) return;
      e.preventDefault();
      this._choose(this._rows[this._active >= 0 ? this._active : 0]);
    }
  }

  _move(delta) {
    if (!this._rows.length) return;
    const n = this._rows.length;
    this._active = (this._active + delta + n) % n;
    this._syncActive();
  }

  _syncActive() {
    if (!this._rows.length) { this._input.removeAttribute('aria-activedescendant'); return; }
    this._rows.forEach((it, i) => {
      it.el.classList.toggle('is-active', i === this._active);
      it.el.setAttribute('aria-selected', i === this._active ? 'true' : 'false');
    });
    const row = this._rows[this._active];
    if (row) {
      this._input.setAttribute('aria-activedescendant', row.el.id);
      row.el.scrollIntoView({ block: 'nearest' });
    }
  }

  _choose(item) {
    const input = this._input;
    const { start, end } = this._token();
    // 只到「前缀」这一层（Has / is / author）时补冒号，下一段继续补全
    const onlyPrefix = item.prefix && item.value.indexOf(':') === -1;
    const insert = onlyPrefix ? item.value + ':' : item.value + ' ';
    input.value = input.value.slice(0, start) + insert + input.value.slice(end);
    const caret = start + insert.length;
    input.setSelectionRange(caret, caret);
    this._popup.close('select');
    // 自己写回的值会派发 input，别让它又把菜单顶开；
    // 前缀类（补成 has:）相反，要立刻列出下一段候选
    this._silent = true;
    input.dispatchEvent(new CustomEvent('gh:autocomplete-select', {
      bubbles: true,
      detail: { value: item.value, label: item.label, text: input.value },
    }));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    this._silent = false;
    input.focus();
    if (onlyPrefix) this._popup.open();
  }

  _render() {
    const menu = this._menu;
    if (!menu) return;
    const { token } = this._token();
    const seg = token.split(':').pop().toLowerCase();
    const list = this._suggest(token);
    const frag = document.createDocumentFragment();
    this._rows = list.map((item, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gh-menu__item gh-autocomplete__item';
      btn.id = this._menuId + '-opt-' + i;
      btn.setAttribute('role', 'option');
      btn.dataset.value = item.value;
      if (item.icon) {
        const ic = document.createElement('span');
        ic.className = 'gh-autocomplete__icon';
        ic.innerHTML = iconSvg(item.icon, 16);
        btn.append(ic);
      }
      const label = document.createElement('span');
      label.className = 'gh-autocomplete__label';
      const idx = seg ? item.label.toLowerCase().indexOf(seg) : -1;
      if (idx === 0) {
        const b = document.createElement('strong');
        b.className = 'gh-autocomplete__match';
        b.textContent = item.label.slice(0, seg.length);
        label.append(b, item.label.slice(seg.length));
      } else label.textContent = item.label;
      btn.append(label);
      btn.addEventListener('mousedown', (e) => e.preventDefault()); // 别把焦点从输入框抢走
      btn.addEventListener('mouseenter', () => { this._active = i; this._syncActive(); });
      btn.addEventListener('click', () => this._choose(item));
      frag.append(btn);
      return { ...item, el: btn };
    });

    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'gh-autocomplete__empty';
      empty.textContent = t('noResults');
      frag.append(empty);
    }
    menu.textContent = '';
    menu.append(frag);
    this._active = list.length ? 0 : -1;
    this._syncActive();
  }

  /* ---------- 公开 API ---------- */

  open() { this._open(false); }
  close() { this._popup && this._popup.close('close'); }
  // 补全弹层是输入态驱动的（聚焦/输入才弹），没有 open 属性，但方法名与其它浮层保持一致
  toggle(force) {
    const want = force === undefined ? !this.isOpen : !!force;
    if (want) this.open(); else this.close();
    return want;
  }
  get isOpen() { return !!(this._popup && this._popup.isOpen); }
  focus() { this._input && this._input.focus(); }
  get input() { return this._input; }
  get value() { return this._input ? this._input.value : attr(this, 'value', ''); }
  set value(v) {
    if (this._input) {
      this._input.value = v == null ? '' : String(v);
      this.setAttribute('value', this._input.value);
    } else this.setAttribute('value', v == null ? '' : String(v));
  }
}

define('gh-autocomplete-item', GHAutocompleteItem);
define('gh-autocomplete', GHAutocomplete);
