// select-menu.js — 一体化菜单：触发按钮 + 弹层 + 列表
// 把原来「gh-popover + gh-btn + gh-option-list + 一段回填文案的 JS」压成一个标签
import { define, once, has, attr, t, takeSlot } from '../core.js';

// 这些属性原样透传给内部的 gh-option-list
const LIST_ATTRS = [
  'multiple', 'searchable', 'divided',
  'heading', 'search-placeholder', 'max-height', 'empty-text',
];

/* ---------- gh-select-menu ----------
   <gh-select-menu icon="comment" label="Ask" value="ask">
     <option value="ask">Ask</option>
     <option value="agent">Agent</option>
   </gh-select-menu>

   <gh-select-menu multiple searchable label="All repositories"
                   summary="{count} repositories" width="460px">
     <gh-option icon="repo" value="orbit">A03HCY/Orbit</gh-option>
   </gh-select-menu>

   属性：label / label-prefix / summary / icon / value(s) / multiple / searchable
        width / placement / variant / size / disabled / no-caret / close-on-select
    插槽：slot="caret" 替换箭头图标（默认 triangle-down，展开时旋转 180°）
   事件：gh:change detail { value, values, option, label, group }
   方法：open() close() focus() */
export class GHSelectMenu extends HTMLElement {
  static get observedAttributes() {
    return ['label', 'label-prefix', 'summary', 'value', 'values', 'disabled', 'open'];
  }

  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-select-menu');

      /* 1. 触发按钮 */
      const btn = document.createElement('gh-btn');
      btn.setAttribute('slot', 'trigger');
      btn.className = 'gh-select-menu__btn';
      if (attr(el, 'variant')) btn.setAttribute('variant', attr(el, 'variant'));
      if (attr(el, 'size')) btn.setAttribute('size', attr(el, 'size'));

      const icon = attr(el, 'icon');
      if (icon) {
        const i = document.createElement('gh-icon');
        i.setAttribute('name', icon);
        i.className = 'gh-select-menu__icon';
        btn.append(i);
      }
      const label = document.createElement('span');
      label.className = 'gh-select-menu__label';
      btn.append(label);
      const caretSlot = takeSlot(el, 'caret');
      if (!has(el, 'no-caret')) {
        // 箭头默认 triangle-down，也可用 <gh-icon slot="caret" name="chevron-down"> 替换
        const caret = document.createElement('span');
        caret.className = 'gh-select-menu__caret';
        if (caretSlot) {
          caret.append(caretSlot);
        } else {
          const i = document.createElement('gh-icon');
          i.setAttribute('name', 'triangle-down');
          i.setAttribute('size', '16');
          caret.append(i);
          // 默认三角字形偏下，旋转轴要用字形中心，展开朝上时不会整体上浮（见 CSS .is-triangle）
          caret.classList.add('is-triangle');
        }
        btn.append(caret);
      }
      // 纯图标触发时（没有 label），把宿主上的 aria-label 交给按钮
      if (el.getAttribute('aria-label')) btn.setAttribute('aria-label', el.getAttribute('aria-label'));
      el._btn = btn;
      el._label = label;

      /* 2. 弹层里的列表：子节点（option / optgroup / gh-option）整体搬进去 */
      const list = document.createElement('gh-option-list');
      LIST_ATTRS.forEach((name) => {
        if (el.hasAttribute(name)) list.setAttribute(name, el.getAttribute(name));
      });
      while (el.firstChild) list.append(el.firstChild);
      el._list = list;

      list.addEventListener('gh:change', (e) => {
        el._syncLabel();
        // 列表被 popover 搬到 body，原生事件不会冒泡到本元素，这里重新派发一次
        el.dispatchEvent(new CustomEvent('gh:change', { bubbles: true, detail: e.detail }));
        // 默认：只有「散装单选」才收起；分组菜单是筛选面板，多选也是连续操作
        const keep = has(el, 'multiple') || (el.list && el.list.independent);
        if (has(el, 'close-on-select') || !keep) el.close();
      });

      /* 3. 复用 gh-popover：定位、外部点击、Esc 都由它负责 */
      const pop = document.createElement('gh-popover');
      pop.setAttribute('placement', attr(el, 'placement', 'bottom-start'));
      pop.setAttribute('flush', '');
      if (attr(el, 'width')) pop.setAttribute('width', attr(el, 'width'));
      pop.append(btn, list);
      el.append(pop);
      el._pop = pop;

      // 打开后把焦点交给列表（有搜索框就交给搜索框），键盘可以直接上下走
      pop.addEventListener('gh:open', () => {
        // 面板自己开合 → 同步宿主的 open 属性（声明式读写同一个状态）
        if (!el.hasAttribute('open')) el.setAttribute('open', '');
        setTimeout(() => {
          const search = list.querySelector('.gh-option-list__input');
          (search || list).focus();
        }, 0);
      });
      pop.addEventListener('gh:close', () => {
        if (el.hasAttribute('open')) el.removeAttribute('open');
      });

      // 初始值：value 优先于 option[selected]
      const preset = attr(el, 'value');
      if (preset !== null) list.values = [preset];
      const presets = attr(el, 'values');
      if (presets) list.values = presets.split(',');

      el._syncLabel();
      el._syncDisabled();
    });
  }

  attributeChangedCallback(name, oldV, newV) {
    if (oldV === newV) return;
    // open 属性 = 声明式开合，直接落到内部 popover 上
    if (name === 'open') {
      if (!this._pop) return;
      const want = newV !== null;
      if (want && !this._pop.isOpen) this._pop.open();
      else if (!want && this._pop.isOpen) this._pop.close();
      return;
    }
    if (!this._list) return;
    if (name === 'value') this._list.values = newV === null ? [] : [newV];
    if (name === 'values') this._list.values = newV ? newV.split(',') : [];
    if (name === 'disabled') this._syncDisabled();
    if (name === 'label' || name === 'label-prefix' || name === 'summary' || name === 'value' || name === 'values') {
      this._syncLabel();
    }
  }

  /* 弹层内容会被搬到 body（避免被 overflow 裁切），所以暴露引用给需要编程式操作的场景 */
  get list() { return this._list || null; }
  get popover() { return this._pop || null; }
  // 弹层面板元素（.gh-popover）的便捷入口，等价于 this.popover.content
  get content() { return this._pop ? this._pop.content : null; }

  /* ---------- 值 ---------- */
  get values() { return this._list ? this._list.values : []; }
  set values(v) {
    if (!this._list) return;
    this._list.values = v || [];
    this._syncLabel();
  }
  get value() { return this.values[0] || ''; }
  set value(v) { this.values = v ? [v] : []; }

  /* ---------- 开合（open 属性 ↔ 内部 popover，两者始终一致） ---------- */
  open() {
    if (!this.hasAttribute('open')) this.setAttribute('open', '');
    else this._pop && this._pop.open();
    return this;
  }
  close() {
    if (this.hasAttribute('open')) this.removeAttribute('open');
    else this._pop && this._pop.close();
    return this;
  }
  toggle(force) {
    const want = force === undefined ? !this.isOpen : !!force;
    if (want) this.open(); else this.close();
    return this;
  }
  get isOpen() { return !!(this._pop && this._pop.isOpen); }
  focus() { this._btn && this._btn.focus(); }

  /* ---------- 按钮文案 ----------
     单选：使用选中项文案（可加 label-prefix，如 "Optimized for: "）
     多选：0 项回退 label；1 项显示该项；多项用 summary 模板（默认 "{count} 项"） */
  _syncLabel() {
    if (!this._list || !this._label) return;
    // fixed-label：按钮文案恒定（筛选菜单这类面板用），不随选择变化
    if (has(this, 'fixed-label')) {
      this._label.textContent = attr(this, 'label', '');
      return;
    }
    const picked = this._list.options.filter((o) => o.selected);
    let text = attr(this, 'label', '');

    if (picked.length === 1) {
      text = (has(this, 'multiple') ? '' : attr(this, 'label-prefix', '')) + picked[0].label;
    } else if (picked.length > 1) {
      text = attr(this, 'summary', '{count} ' + t('items')).replace('{count}', String(picked.length));
    }

    this._label.textContent = text;
  }

  _syncDisabled() {
    const off = has(this, 'disabled');
    if (!this._btn) return;
    if (off) this._btn.setAttribute('disabled', '');
    else this._btn.removeAttribute('disabled');
    if (off) this.close();
  }
}

define('gh-select-menu', GHSelectMenu);

