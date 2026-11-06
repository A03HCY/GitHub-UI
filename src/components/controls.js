// controls.js — 组合控件：gh-segmented / gh-segment（分段）、gh-range（滑块）、
//               gh-split-button（分体按钮）、gh-tag-input（多选标签输入）
import { define, once, has, attr, t, takeSlot } from '../core.js';
import { iconSvg } from '../icons.js';
import { createPopup } from '../core/overlay.js';

/* ---------- gh-segment / gh-segmented ----------
   <gh-segmented value="list" label="视图">
     <gh-segment value="list" icon="list-unordered">列表</gh-segment>
     <gh-segment value="board" icon="project">看板</gh-segment>
   </gh-segmented>
   单选分段控件：方向键切换，派发 gh:change */
class GHSegment extends HTMLElement {
  static get observedAttributes() { return ['icon', 'disabled']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-segment');
      el.setAttribute('role', 'radio');
      const label = document.createElement('span');
      label.className = 'gh-segment__label';
      while (el.firstChild) label.append(el.firstChild);
      if (attr(el, 'icon')) el.insertAdjacentHTML('afterbegin', iconSvg(attr(el, 'icon'), 14));
      el.append(label);
      el._sync();
    });
  }
  attributeChangedCallback() { if (this._ghDone) this._sync(); }
  _sync() {
    if (has(this, 'disabled')) this.setAttribute('aria-disabled', 'true');
    else this.removeAttribute('aria-disabled');
  }
}

class GHSegmented extends HTMLElement {
  // name 参与表单提交（_sync 里写隐藏 input 的 name），必须一起监听，否则运行时改 name 不生效
  static get observedAttributes() { return ['value', 'disabled', 'name']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-segmented');
      if (has(el, 'expand')) el.classList.add('gh-segmented--expand');
      el.setAttribute('role', 'radiogroup');
      if (attr(el, 'label')) el.setAttribute('aria-label', attr(el, 'label'));
      el.addEventListener('click', (e) => {
        const seg = e.target.closest('gh-segment');
        if (seg && el.contains(seg)) el._select(seg);
      });
      el.addEventListener('keydown', (e) => el._onKey(e));
      // 滑动底板：一个绝对定位元素垫在分段下面，选中项切换时平滑滑动过去
      const thumb = document.createElement('span');
      thumb.className = 'gh-segmented__thumb';
      thumb.setAttribute('aria-hidden', 'true');
      el.prepend(thumb);
      el._thumb = thumb;
      const ro = new ResizeObserver(() => el._placeThumb());
      ro.observe(el);
      el._ro = ro;
      el._onResize = () => el._placeThumb();
      window.addEventListener('resize', el._onResize);
      el._sync();
    });
  }
  attributeChangedCallback() { if (this._ghDone) this._sync(); }

  _segments() { return [...this.querySelectorAll('gh-segment')]; }

  // 当前选中值（读写）：读走属性，写 setAttribute 触发 _sync
  get value() {
    const v = attr(this, 'value');
    if (v !== null) return v;
    const segs = this._segments();
    return segs.length ? attr(segs[0], 'value', '') : '';
  }
  set value(v) {
    if (v == null) this.removeAttribute('value');
    else this.setAttribute('value', String(v));
  }

  // 按值选中某个分段（不存在的值忽略）
  select(v) {
    const seg = this._segments().find((s) => attr(s, 'value', '') === String(v));
    if (seg) this._select(seg);
    return this;
  }

  _sync() {
    const segs = this._segments();
    const value = attr(this, 'value') !== null
      ? attr(this, 'value')
      : (segs.length ? attr(segs[0], 'value', '') : '');
    segs.forEach((seg) => {
      const active = attr(seg, 'value', '') === value;
      seg.classList.toggle('is-active', active);
      seg.setAttribute('aria-checked', active ? 'true' : 'false');
      // roving tabindex：只有选中项进 Tab 序列
      seg.setAttribute('tabindex', active ? '0' : '-1');
    });
    if (has(this, 'disabled')) this.setAttribute('aria-disabled', 'true');
    else this.removeAttribute('aria-disabled');
    this._placeThumb();

    // 表单集成：有 name 时提交当前值
    let hidden = this.querySelector(':scope > input[type="hidden"]');
    if (attr(this, 'name')) {
      if (!hidden) {
        hidden = document.createElement('input');
        hidden.type = 'hidden';
        this.append(hidden);
        hidden = this.querySelector(':scope > input[type="hidden"]');
      }
      hidden.name = attr(this, 'name');
      hidden.value = value;
    } else if (hidden) {
      hidden.remove();
    }
  }

  _select(seg) {
    if (has(this, 'disabled') || has(seg, 'disabled')) return;
    const value = attr(seg, 'value', '');
    if (value === attr(this, 'value')) return;
    this.setAttribute('value', value);
    seg.dispatchEvent(new CustomEvent('gh:change', {
      bubbles: true, detail: { value, index: this._segments().indexOf(seg) },
    }));
  }

  // 把底板挪到选中分段下面：位置/尺寸都从实际盒子取（减掉容器边框），
  // 切换时只做 transform/width/height 过渡；首帧不加过渡，避免从 0 长出来。
  _placeThumb() {
    const thumb = this._thumb;
    if (!thumb) return;
    const seg = this.querySelector('gh-segment.is-active');
    if (!seg || !seg.offsetWidth) { thumb.style.display = 'none'; return; }
    thumb.style.display = 'block';
    // 绝对定位的 left/top 以 padding box 为基准，offsetLeft/offsetTop 也是同一基准，直接取用即可
    thumb.style.transform = `translate(${seg.offsetLeft}px, ${seg.offsetTop}px)`;
    thumb.style.width = seg.offsetWidth + 'px';
    thumb.style.height = seg.offsetHeight + 'px';
    if (!this.classList.contains('is-ready')) {
      requestAnimationFrame(() => this.classList.add('is-ready'));
    }
  }

  disconnectedCallback() {
    if (this._ro) this._ro.disconnect();
    if (this._onResize) window.removeEventListener('resize', this._onResize);
  }

  _onKey(e) {
    const segs = this._segments().filter((s) => !has(s, 'disabled'));
    if (!segs.length) return;
    const focused = document.activeElement;
    let i = segs.indexOf(focused);
    if (i < 0) i = segs.findIndex((s) => s.classList.contains('is-active'));
    if (i < 0) i = 0;
    let next = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % segs.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + segs.length) % segs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = segs.length - 1;
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      this._select(focused && focused.closest('gh-segment') || segs[i]);
      return;
    } else return;
    e.preventDefault();
    this._select(segs[next]);
    segs[next].focus();
  }
}

/* ---------- gh-range ----------
   <gh-range name="volume" min="0" max="100" value="60" show-value>
   原生 range 换皮，进度用 --gh-range-pct 画；input / change 事件照常冒泡 */
class GHRange extends HTMLElement {
  static get observedAttributes() {
    return ['value', 'min', 'max', 'step', 'disabled', 'name', 'show-value', 'unit'];
  }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-range');
      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'gh-range__input';
      if (attr(el, 'name')) input.name = attr(el, 'name');
      const out = document.createElement('span');
      out.className = 'gh-range__value';
      el.append(input, out);
      el._input = input;
      el._out = out;

      input.addEventListener('input', () => el._paint());
      input.addEventListener('change', () => {
        el.setAttribute('value', input.value);
        el.dispatchEvent(new CustomEvent('gh:change', {
          bubbles: true, detail: { value: Number(input.value) },
        }));
      });
      el._sync();
    });
  }
  attributeChangedCallback() { if (this._ghDone) this._sync(); }

  _sync() {
    const input = this._input;
    if (!input) return;
    ['min', 'max', 'step'].forEach((k) => {
      const v = attr(this, k);
      if (v !== null) input.setAttribute(k, v);
    });
    const v = attr(this, 'value');
    if (v !== null && document.activeElement !== input) input.value = v;
    if (attr(this, 'name')) input.name = attr(this, 'name');
    input.disabled = has(this, 'disabled');
    this._out.hidden = !has(this, 'show-value');
    this.classList.toggle('is-disabled', has(this, 'disabled'));
    this._paint();
  }

  _paint() {
    const input = this._input;
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const val = Number(input.value);
    const pct = max > min ? ((val - min) / (max - min)) * 100 : 0;
    input.style.setProperty('--gh-range-pct', pct.toFixed(2) + '%');
    this._out.textContent = has(this, 'show-value') ? val + attr(this, 'unit', '') : '';
  }

  get value() { return this._input ? Number(this._input.value) : 0; }
  set value(v) {
    if (!this._input) return;
    this._input.value = v;
    this.setAttribute('value', String(v));
    // setter 也要重绘数字与进度条（原来只改值，UI 不更新）
    this._paint();
    this.dispatchEvent(new CustomEvent('gh:change', {
      bubbles: true, detail: { value: Number(this._input.value) },
    }));
  }
}

/* ---------- gh-split-button ----------
   <gh-split-button label="合并" variant="primary" align="right">
     <button type="button">Squash and merge</button>
     <button type="button">Rebase and merge</button>
   </gh-split-button>
   主按钮派发 gh:action；菜单项派发 gh:select（detail.index）
   插槽：slot="caret" 替换箭头图标（默认 triangle-down，展开时旋转 180°） */
class GHSplitButton extends HTMLElement {
  static get observedAttributes() { return ['label', 'variant', 'disabled', 'size']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-split');
      const caretSlot = takeSlot(el, 'caret');
      const items = [...el.children];
      items.forEach((c) => c.remove());

      const main = document.createElement('gh-btn');
      main.className = 'gh-split__main';
      main.textContent = attr(el, 'label', '');
      const caret = document.createElement('button');
      caret.type = 'button';
      caret.className = 'gh-split__caret gh-btn';
      caret.setAttribute('aria-haspopup', 'menu');
      caret.setAttribute('aria-expanded', 'false');
      caret.setAttribute('aria-label', t('more'));
      if (caretSlot) caret.append(caretSlot);
      else {
        caret.innerHTML = iconSvg('triangle-down', 16);
        caret.classList.add('is-triangle');
      }

      const menu = document.createElement('div');
      menu.className = 'gh-split__menu gh-menu';
      menu.setAttribute('role', 'menu');
      items.forEach((c, i) => {
        if (c.nodeType === 1) c.classList.add('gh-menu__item');
        c.addEventListener('click', () => {
          el._close();
          el.dispatchEvent(new CustomEvent('gh:select', {
            bubbles: true, detail: { index: i, item: c },
          }));
        });
        menu.append(c);
      });

      el.append(main, caret, menu);
      el._main = main; el._caret = caret; el._menu = menu;

      // 开合 / 外部点击 / Esc / 重定位交给公共内核
      this._popup = createPopup({
        panel: menu,
        anchor: caret,
        placement: 'bottom-' + (attr(el, 'align') === 'right' ? 'end' : 'start'),
        offset: 4,
        haspopup: 'menu',
        contains: (node) => el.contains(node),
        beforePlace: () => {
          // 菜单默认 display:none，测量前先挂 is-open
          el.classList.add('is-open');
          menu.style.width = Math.round(Math.max(el.getBoundingClientRect().width, 180)) + 'px';
        },
        onOpen: () => el.classList.add('is-open'),
        onClose: (api, reason) => {
          el.classList.remove('is-open');
          if (reason === 'esc') caret.focus();
        },
      });

      main.addEventListener('click', () => {
        if (has(el, 'disabled')) return;
        el.dispatchEvent(new CustomEvent('gh:action', { bubbles: true }));
      });
      caret.addEventListener('click', (e) => {
        e.stopPropagation();
        this._popup.toggle();
      });
      caret.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); this._open(); el._focusItem(0); }
      });
      el._sync();
    });
  }
  attributeChangedCallback() { if (this._ghDone) this._sync(); }

  _sync() {
    if (!this._main) return;
    const variant = attr(this, 'variant');
    const variants = ['primary', 'danger', 'invisible'];
    [this._main, this._caret].forEach((btn) => {
      variants.forEach((v) => btn.classList.remove('gh-btn--' + v));
      if (variant) btn.classList.add('gh-btn--' + variant);
      const off = has(this, 'disabled');
      btn.classList.toggle('gh-btn--disabled', off);
      btn.setAttribute('aria-disabled', off ? 'true' : 'false');
      if (btn === this._caret) btn.disabled = off;
      ['sm', 'lg', 'icon'].forEach((sz) => btn.classList.remove('gh-btn--' + sz));
      if (attr(this, 'size')) btn.classList.add('gh-btn--' + attr(this, 'size'));
    });
    this._main.textContent = attr(this, 'label', '');
  }

  _items() { return [...this._menu.children]; }
  _focusItem(i) {
    const items = this._items();
    if (items[i]) items[i].focus();
  }

  _open() {
    if (has(this, 'disabled')) return;
    this._popup.open();
  }
  _close(reason) {
    if (this._popup && this._popup.isOpen) this._popup.close(reason || 'close');
  }
}

/* ---------- gh-tag-input ----------
   <gh-tag-input name="labels" placeholder="添加标签…">
     <option value="bug">Bug</option>
     <option value="docs">文档</option>
   </gh-tag-input>
   多选：输入过滤、↑↓ 选择、回车加入、退格删除最后一个；每个值一个隐藏 input 参与表单提交 */
class GHTagInput extends HTMLElement {
  static get observedAttributes() { return ['value', 'placeholder', 'disabled', 'max']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-tag-input');
      const options = [...el.children]
        .filter((c) => c.tagName === 'OPTION')
        .map((o) => ({
          value: o.getAttribute('value') ?? (o.textContent || '').trim(),
          label: (o.textContent || '').trim(),
        }));
      [...el.children].forEach((c) => { if (c.tagName === 'OPTION') c.remove(); });

      const field = document.createElement('input');
      field.type = 'text';
      field.className = 'gh-tag-input__field';
      field.autocomplete = 'off';
      field.setAttribute('role', 'combobox');
      field.setAttribute('aria-expanded', 'false');
      const menu = document.createElement('div');
      menu.className = 'gh-tag-input__menu gh-menu';
      menu.setAttribute('role', 'listbox');
      el.append(field, menu);
      el._field = field; el._menu = menu; el._options = options;
      el._selected = (attr(el, 'value') || '').split(',').map((s) => s.trim()).filter(Boolean);

      this._popup = createPopup({
        panel: menu,
        anchor: el,
        placement: 'bottom-start',
        offset: 4,
        aria: false, // 组合框语义挂在 field 上，这里手动同步
        contains: (node) => el.contains(node),
        beforePlace: () => {
          el.classList.add('is-open');
          field.setAttribute('aria-expanded', 'true');
          // 菜单内容按当前输入重建，再做测量
          this._renderMenu();
          menu.style.width = Math.round(el.getBoundingClientRect().width) + 'px';
        },
        onOpen: () => {
          el.classList.add('is-open');
          field.setAttribute('aria-expanded', 'true');
          this._renderMenu();
        },
        onClose: () => {
          el.classList.remove('is-open');
          field.setAttribute('aria-expanded', 'false');
          this._active = -1;
        },
      });

      field.addEventListener('focus', () => el._open());
      field.addEventListener('input', () => el._open());
      field.addEventListener('keydown', (e) => el._onKey(e));
      el.addEventListener('click', (e) => {
        if (e.target.closest('.gh-chip__x')) return;
        field.focus();
      });

      el._render();
      el._sync();
    });
  }
  attributeChangedCallback() { if (this._ghDone) this._sync(); }

  _sync() {
    if (!this._field) return;
    const v = attr(this, 'value');
    if (v !== null) {
      const next = v.split(',').map((s) => s.trim()).filter(Boolean);
      if (next.join() !== this._selected.join()) {
        this._selected = next;
        this._render();
      }
    }
    this._field.placeholder = attr(this, 'placeholder', '');
    this._field.disabled = has(this, 'disabled');
    this.classList.toggle('is-disabled', has(this, 'disabled'));
  }

  get value() { return [...this._selected]; }
  set value(list) {
    this._selected = (Array.isArray(list) ? list : [list]).filter(Boolean);
    this.setAttribute('value', this._selected.join(','));
    if (this._field) this._render();
  }

  _label(value) {
    const o = this._options.find((x) => x.value === value);
    return o ? o.label : value;
  }

  _render() {
    [...this.querySelectorAll('.gh-chip')].forEach((c) => c.remove());
    this._selected.forEach((v) => {
      const chip = document.createElement('span');
      chip.className = 'gh-chip';
      chip.dataset.value = v;
      const text = document.createElement('span');
      text.className = 'gh-chip__label';
      text.textContent = this._label(v);
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'gh-chip__x';
      x.setAttribute('aria-label', t('remove'));
      x.innerHTML = iconSvg('x', 12);
      x.addEventListener('click', (e) => { e.stopPropagation(); this._remove(v); });
      chip.append(text, x);
      this.insertBefore(chip, this._field);
    });
    this._syncHidden();
    if (this.classList.contains('is-open')) this._renderMenu();
  }

  _syncHidden() {
    [...this.querySelectorAll('input[type="hidden"]')].forEach((n) => n.remove());
    const name = attr(this, 'name');
    if (!name) return;
    this._selected.forEach((v) => {
      const h = document.createElement('input');
      h.type = 'hidden';
      h.name = name;
      h.value = v;
      this.append(h);
    });
  }

  _renderMenu() {
    const q = (this._field.value || '').trim().toLowerCase();
    const list = this._options.filter((o) => !this._selected.includes(o.value)
      && (!q || o.label.toLowerCase().includes(q)));
    this._menu.innerHTML = '';
    this._items = list.map((o) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gh-menu__item';
      b.setAttribute('role', 'option');
      b.textContent = o.label;
      b.addEventListener('click', () => this._add(o.value));
      this._menu.append(b);
      return { el: b, opt: o };
    });
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'gh-menu__empty';
      empty.textContent = q ? t('noResults') : t('allSelected');
      this._menu.append(empty);
    }
    this._active = -1;
  }

  _place() {
    this._popup.reposition();
  }

  _open() {
    if (has(this, 'disabled')) return;
    if (this._popup.isOpen) {
      this._renderMenu();
      this._popup.reposition();
      return;
    }
    this._renderMenu();
    this._popup.open();
  }

  _close(reason) {
    if (this._popup && this._popup.isOpen) this._popup.close(reason || 'close');
  }

  _move(delta) {
    if (!this._items || !this._items.length) return;
    const n = this._items.length;
    this._active = (this._active + delta + n) % n;
    this._items.forEach((it, i) => it.el.classList.toggle('is-active', i === this._active));
    this._items[this._active].el.scrollIntoView({ block: 'nearest' });
  }

  _onKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); this._open(); this._move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this._open(); this._move(-1); }
    else if (e.key === 'Enter') {
      if (!this.classList.contains('is-open')) return;
      e.preventDefault();
      const item = this._items[this._active >= 0 ? this._active : 0];
      if (item) this._add(item.opt.value);
    } else if (e.key === 'Backspace' && !this._field.value) {
      if (!this._selected.length) return;
      e.preventDefault();
      this._remove(this._selected[this._selected.length - 1]);
    } else if (e.key === 'Escape') { this._close(); }
    else if (e.key === 'Tab') { this._close(); }
  }

  _add(value) {
    const max = parseInt(attr(this, 'max', '0'), 10) || 0;
    if (max > 0 && this._selected.length >= max) return;
    if (this._selected.includes(value)) return;
    this._selected.push(value);
    this._field.value = '';
    this.setAttribute('value', this._selected.join(','));
    this._render();
    this._open();
    this._emit();
  }

  _remove(value) {
    const i = this._selected.indexOf(value);
    if (i < 0) return;
    this._selected.splice(i, 1);
    this.setAttribute('value', this._selected.join(','));
    this._render();
    this._emit();
    if (this._field) this._field.focus();
  }

  _emit() {
    this.dispatchEvent(new CustomEvent('gh:change', {
      bubbles: true, detail: { values: [...this._selected] },
    }));
  }
}

define('gh-segment', GHSegment);
define('gh-segmented', GHSegmented);
define('gh-range', GHRange);
define('gh-split-button', GHSplitButton);
define('gh-tag-input', GHTagInput);

