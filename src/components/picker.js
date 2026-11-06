// picker.js — 可选列表：gh-option-list / gh-option-group / gh-option
// 用于弹出层里的单选、多选、分组、可搜索列表（模型选择、仓库选择、偏好选择都是这个）
import { define, once, has, attr, t, uid } from '../core.js';
import { iconSvg } from '../icons.js';

/* 原生写法适配：<option> / <optgroup> 先转成 gh-option / gh-option-group。
   这样列表既能用熟悉的原生标签，也能用自定义标签（要 icon / desc 时）。
   转换发生在建立滚动容器之前，后续逻辑只认 gh-option。 */
function upgradeNative(node) {
  if (node.tagName === 'OPTGROUP') {
    const group = document.createElement('gh-option-group');
    [...node.attributes].forEach((a) => group.setAttribute(a.name, a.value));
    [...node.children].forEach((child) => group.append(upgradeNative(child)));
    return group;
  }
  const opt = document.createElement('gh-option');
  // icon / desc 同时支持 data- 前缀：<option data-icon="cpu" data-desc="…"> 是合法 HTML
  [['value', 'value'], ['icon', 'icon'], ['desc', 'desc'], ['data-icon', 'icon'], ['data-desc', 'desc']].forEach(([from, to]) => {
    if (node.hasAttribute(from)) opt.setAttribute(to, node.getAttribute(from));
  });
  if (node.hasAttribute('selected') || node.selected) opt.setAttribute('selected', '');
  if (node.hasAttribute('disabled') || node.disabled) opt.setAttribute('disabled', '');
  opt.textContent = (node.textContent || '').trim();
  return opt;
}

function normalizeOptions(el) {
  [...el.children].forEach((child) => {
    if (child.tagName === 'OPTION' || child.tagName === 'OPTGROUP') {
      child.replaceWith(upgradeNative(child));
    }
  });
}

/* ---------- gh-option ----------
   <gh-option value="auto" icon="sparkle" selected>Auto</gh-option>
   <gh-option value="balance" desc="Balances speed and intelligence" selected>Balance</gh-option>
   selected / disabled 属性即状态；点击由父级 gh-option-list 统一处理 */
export class GHOption extends HTMLElement {
  static get observedAttributes() { return ['selected', 'disabled', 'desc', 'icon']; }

  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-option');
      el.setAttribute('role', 'option');
      if (!el.id) el.id = uid('gh-opt');

      const tick = document.createElement('span');
      tick.className = 'gh-option__tick';
      tick.innerHTML = iconSvg('check', 16);

      const box = document.createElement('span');
      box.className = 'gh-option__box';
      box.innerHTML = iconSvg('check', 12);

      const media = document.createElement('span');
      media.className = 'gh-option__media';
      el._media = media;

      const text = document.createElement('span');
      text.className = 'gh-option__text';
      const label = document.createElement('span');
      label.className = 'gh-option__label';
      while (el.firstChild) label.append(el.firstChild);
      text.append(label);
      el._label = label;

      el.append(tick, box, media, text);
      el._renderMedia();
      el._sync();
      el._syncDesc();
    });
  }

  attributeChangedCallback(name) {
    if (!this._ghDone) return;
    this._sync();
    if (name === 'desc') this._syncDesc();
    if (name === 'icon') this._renderMedia();
  }

  get value() {
    const v = attr(this, 'value');
    if (v !== null) return v;
    return this._label ? this._label.textContent.trim() : '';
  }
  set value(v) { this.setAttribute('value', v); }

  get selected() { return has(this, 'selected'); }
  set selected(v) { v ? this.setAttribute('selected', '') : this.removeAttribute('selected'); }

  get disabled() { return has(this, 'disabled'); }

  // 选项文案（不含描述），方便触发按钮回填
  get label() { return this._label ? this._label.textContent.trim() : this.textContent.trim(); }

  _sync() {
    this.classList.toggle('is-selected', this.selected);
    this.setAttribute('aria-selected', String(this.selected));
    this.setAttribute('aria-disabled', String(this.disabled));
    // 搜索过滤会用到 hidden，这里只负责状态类
  }

  _syncDesc() {
    const desc = attr(this, 'desc');
    const text = this.querySelector('.gh-option__text');
    if (!text) return;
    let el = text.querySelector('.gh-option__desc');
    if (!desc) {
      if (el) el.remove();
      this.classList.remove('gh-option--desc');
      return;
    }
    if (!el) {
      el = document.createElement('span');
      el.className = 'gh-option__desc';
      text.append(el);
    }
    el.textContent = desc;
    this.classList.add('gh-option--desc');
  }

  _renderMedia() {
    const icon = attr(this, 'icon');
    const m = this._media;
    if (!m) return;
    m.textContent = '';
    if (!icon) {
      m.hidden = true;
      return;
    }
    m.hidden = false;
    m.innerHTML = iconSvg(icon, 16);
  }
}

/* ---------- gh-option-group ----------
   <gh-option-group label="Fast and cost-effective"> …gh-option… </gh-option-group> */
class GHOptionGroup extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-option-group');
      el.setAttribute('role', 'group');
      const label = attr(el, 'label');
      if (label) {
        el.setAttribute('aria-label', label);
        const head = document.createElement('div');
        head.className = 'gh-option-group__label';
        head.textContent = label;
        el.prepend(head);
      }
    });
  }
}

/* ---------- gh-option-list ----------
   <gh-option-list searchable multiple heading="Select a repository" max-height="240px">
     <option value="a">CodonProject/codon-model</option>
     <optgroup label="常用"><option value="b">A03HCY/Orbit</option></optgroup>
     <!-- 需要图标/描述时用自定义标签 -->
     <gh-option value="c" icon="repo" desc="只读">TeamFlow/docs</gh-option>
   </gh-option-list>
   事件：gh:change  detail: { value, values, option, label, group } */
export class GHOptionList extends HTMLElement {
  static get observedAttributes() { return ['multiple', 'searchable']; }

  connectedCallback() {
    once(this, (el) => {
      normalizeOptions(el);
      const multiple = has(el, 'multiple');
      el.classList.add('gh-option-list');
      if (multiple) el.classList.add('gh-option-list--multiple');
      if (has(el, 'divided')) el.classList.add('gh-option-list--divided');

      el.setAttribute('role', 'listbox');
      if (multiple) el.setAttribute('aria-multiselectable', 'true');
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');

      // 先把内容搬进滚动容器，再插标题/搜索框，否则它们会被一起搬走
      const scroll = document.createElement('div');
      scroll.className = 'gh-option-list__scroll';
      el._scroll = scroll;
      while (el.firstChild) scroll.append(el.firstChild);

      const heading = attr(el, 'heading');
      if (heading) {
        const h = document.createElement('div');
        h.className = 'gh-option-list__heading';
        h.textContent = heading;
        el.prepend(h);
        if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', heading);
      }

      const empty = document.createElement('div');
      empty.className = 'gh-option-list__empty';
      empty.textContent = attr(el, 'empty-text', t('noResults'));
      empty.hidden = true;
      el._empty = empty;

      // 搜索框固定在顶部，不随列表滚动
      let searchBox = null;
      if (has(el, 'searchable')) {
        const box = document.createElement('div');
        box.className = 'gh-option-list__search';
        const icon = document.createElement('span');
        icon.className = 'gh-option-list__search-icon';
        icon.innerHTML = iconSvg('search', 16);
        const input = document.createElement('input');
        input.type = 'search';
        input.className = 'gh-option-list__input';
        input.placeholder = attr(el, 'search-placeholder', t('search'));
        input.setAttribute('aria-label', input.placeholder);
        input.addEventListener('input', () => el._filter(input.value));
        input.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            el.focus();
            el._move(1);
          }
        });
        box.append(icon, input);
        searchBox = box;
        el._input = input;
      }

      // 顺序：标题 → 搜索框 → 滚动列表 → 空态（scroll 必须先进 DOM，否则插不进兄弟节点）
      if (searchBox) el.append(searchBox);
      el.append(scroll, empty);

      const max = attr(el, 'max-height');
      if (max) el.style.setProperty('--gh-option-list-max', /^\d+$/.test(max) ? max + 'px' : max);

      el._syncOptions();
      el.addEventListener('click', (e) => el._onClick(e));
      el.addEventListener('keydown', (e) => el._onKey(e));
      el.addEventListener('mouseover', (e) => {
        const opt = e.target.closest('gh-option');
        if (!opt) return;
        const active = el.options.find((o) => o.classList.contains('is-active'));
        if (active && active !== opt) el._setActive(null);
      });
    });
  }

  attributeChangedCallback(name, oldV, newV) {
    if (oldV === newV || !this._ghDone) return;
    if (name === 'multiple') {
      const multiple = has(this, 'multiple');
      this.classList.toggle('gh-option-list--multiple', multiple);
      if (multiple) this.setAttribute('aria-multiselectable', 'true');
      else this.removeAttribute('aria-multiselectable');
    }
  }

  /* ---------- 状态 ---------- */

  get options() {
    return [...this.querySelectorAll('gh-option')];
  }

  get values() {
    return this.options.filter((o) => o.selected).map((o) => o.value);
  }

  set values(list) {
    const set = new Set((list || []).map(String));
    this.options.forEach((o) => { o.selected = set.has(o.value); });
  }

  get value() { return this.values[0] || ''; }
  set value(v) { this.values = [v]; }

  select(value) {
    const opt = this.options.find((o) => o.value === value);
    if (opt) this._choose(opt);
    return this;
  }

  clear() { this.options.forEach((o) => { o.selected = false; }); return this; }

  /* ---------- 交互 ---------- */

  _onClick(e) {
    const opt = e.target.closest('gh-option');
    if (!opt || !this.contains(opt) || opt.disabled) return;
    this._choose(opt);
  }

  // 有任何一个分组声明了 multiple，就按「每组是一道独立的题」处理；
  // 否则分组只是视觉分节，选择范围仍是整张列表（模型菜单就是这种）
  get independent() {
    return [...this.querySelectorAll('gh-option-group')].some((g) => has(g, 'multiple'));
  }

  _independent() { return this.independent; }

  _scopeOf(opt) {
    if (!this._independent()) return this.options;
    const group = opt.closest('gh-option-group');
    return group
      ? [...group.querySelectorAll('gh-option')]
      : this.options.filter((o) => !o.closest('gh-option-group'));
  }

  _choose(opt) {
    const group = opt.closest('gh-option-group');
    const multiple = has(this, 'multiple') || (group && has(group, 'multiple'));
    if (multiple) {
      opt.selected = !opt.selected;
    } else {
      this._scopeOf(opt).forEach((o) => { if (o !== opt) o.selected = false; });
      opt.selected = true;
    }
    this.dispatchEvent(new CustomEvent('gh:change', {
      bubbles: true,
      detail: { value: this.value, values: this.values, option: opt, label: opt.label, group },
    }));
  }

  _visibleOptions() {
    return this.options.filter((o) => !o.hidden && !o.closest('.gh-option-group[hidden]'));
  }

  // 键盘移动时跳过 disabled 项
  _navOptions() {
    return this._visibleOptions().filter((o) => !o.disabled);
  }

  _setActive(opt) {
    this.options.forEach((o) => o.classList.toggle('is-active', o === opt));
    if (opt) {
      this.setAttribute('aria-activedescendant', opt.id);
      opt.scrollIntoView({ block: 'nearest' });
    } else {
      this.removeAttribute('aria-activedescendant');
    }
  }

  _move(step) {
    const list = this._navOptions();
    if (!list.length) return;
    const current = list.findIndex((o) => o.classList.contains('is-active'));
    let next;
    if (current >= 0) {
      next = current + step;
    } else {
      // 还没有键盘光标时，从当前选中项继续，而不是跳回列表顶部
      const selected = list.findIndex((o) => o.selected);
      next = selected >= 0 ? selected + step : (step > 0 ? 0 : list.length - 1);
    }
    this._setActive(list[Math.max(0, Math.min(list.length - 1, next))]);
  }

  _onKey(e) {
    const key = e.key;
    if (key === 'ArrowDown' || key === 'ArrowUp') {
      e.preventDefault();
      this._move(key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (key === 'Home' || key === 'End') {
      e.preventDefault();
      const list = this._navOptions();
      if (list.length) this._setActive(key === 'Home' ? list[0] : list[list.length - 1]);
      return;
    }
    if (key === 'Enter' || key === ' ') {
      const active = this._navOptions().find((o) => o.classList.contains('is-active'));
      if (active && !active.disabled) {
        e.preventDefault();
        this._choose(active);
      }
    }
  }

  /* ---------- 搜索 ---------- */

  _filter(q) {
    const kw = String(q || '').trim().toLowerCase();
    let visible = 0;
    this.options.forEach((o) => {
      const hit = !kw || o.textContent.toLowerCase().includes(kw);
      o.hidden = !hit;
      if (hit) visible++;
    });
    this.querySelectorAll('gh-option-group').forEach((g) => {
      g.hidden = !g.querySelector('gh-option:not([hidden])');
    });
    this._empty.hidden = visible > 0;
    this._setActive(null);
  }

  /* ---------- 初值 ---------- */

  _syncOptions() {
    const enforce = (list) => {
      let found = false;
      list.forEach((o) => {
        if (!o.selected) return;
        if (found) o.selected = false;
        else found = true;
      });
    };
    if (!has(this, 'multiple')) {
      if (this._independent()) {
        // 每组一道独立的题：单选组各自最多一个
        this.querySelectorAll('gh-option-group').forEach((g) => {
          if (!has(g, 'multiple')) enforce([...g.querySelectorAll('gh-option')]);
        });
        enforce(this.options.filter((o) => !o.closest('gh-option-group')));
      } else {
        enforce(this.options);
      }
    }
    this.options.forEach((o) => { o.setAttribute('tabindex', '-1'); });
  }
}

define('gh-option', GHOption);
define('gh-option-group', GHOptionGroup);
define('gh-option-list', GHOptionList);
