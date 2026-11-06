// forms.js — 表单组件：gh-field / gh-input / gh-select / gh-textarea
// 模式参考 TeamFlow overlay.css 的 field/hint 体系：label 控件 hint 三段式
import { define, once, has, attr, t, takeSlot } from '../core.js';
import { createPopup } from '../core/overlay.js';

// 从 <option avatar="…|字" icon="…"> 生成左侧媒体元素，select / combobox 共用
function optionMedia(item) {
  if (!item) return null;
  if (item.avatar) {
    const avatar = document.createElement('gh-avatar');
    avatar.setAttribute('size', '16');
    avatar.setAttribute('aria-hidden', 'true');
    // 含 . / : 视为图片路径或 URL，否则当作字母头像
    if (/[./:]/.test(item.avatar)) avatar.setAttribute('src', item.avatar);
    else avatar.textContent = item.avatar;
    return avatar;
  }
  if (item.icon) {
    const icon = document.createElement('gh-icon');
    icon.setAttribute('size', '16');
    icon.setAttribute('name', item.icon);
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }
  return null;
}
import { iconSvg } from '../icons.js';

// 把宿主上的属性同步到内部原生控件上
function forward(host, names) {
  names.forEach((n) => {
    const v = attr(host, n);
    if (v !== null) host._inner.setAttribute(n, v);
    else host._inner.removeAttribute(n);
  });
  if (has(host, 'disabled')) host._inner.setAttribute('disabled', '');
  else host._inner.removeAttribute('disabled');
}

// 表单控件公共基类：内部持有一个真实原生控件，value 属性直接代理
class GHFormControl extends HTMLElement {
  static get observedAttributes() { return ['value', 'name', 'placeholder', 'disabled']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-' + this.tag);
      const inner = document.createElement(this.tag);
      inner.className = 'gh-input__inner';
      el._inner = inner;
      el.append(inner);
      el._build && el._build();
      el._sync();
    });
  }
  attributeChangedCallback(_n, o, v) { if (o !== v && this._ghDone) this._sync(); }
  _sync() { if (this._inner) forward(this, this.forwardAttrs); }
  get value() { return this._inner ? this._inner.value : attr(this, 'value', ''); }
  set value(v) {
    if (this._inner) this._inner.value = v;
    else this.setAttribute('value', v);
  }
  get disabled() { return this._inner ? this._inner.disabled : has(this, 'disabled'); }
  set disabled(v) { v ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }
}

/* ---------- gh-input ----------
   <gh-input name="title" placeholder="输入…" icon="search">
   增强：clearable 清除按钮、reveal 密码可见切换、counter 字数计数 */
class GHInput extends GHFormControl {
  tag = 'input';
  forwardAttrs = ['value', 'name', 'placeholder', 'type', 'maxlength', 'min', 'max',
    'autocomplete', 'pattern', 'minlength', 'step', 'required', 'readonly'];
  _build() {
    const icon = attr(this, 'icon');
    if (icon) {
      this.classList.add('gh-input--has-icon');
      const i = document.createElement('span');
      i.className = 'gh-input__icon';
      i.innerHTML = iconSvg(icon, 15);
      this.prepend(i);
    }

    const actions = document.createElement('span');
    actions.className = 'gh-input__actions';
    this._actions = actions;

    if (attr(this, 'counter') !== null) {
      this._counter = document.createElement('span');
      this._counter.className = 'gh-input__counter';
      actions.append(this._counter);
    }
    if (has(this, 'reveal')) {
      this._revealBtn = document.createElement('button');
      this._revealBtn.type = 'button';
      this._revealBtn.className = 'gh-input__action';
      this._revealBtn.setAttribute('aria-label', t('showPassword'));
      this._revealBtn.addEventListener('click', () => {
        this._revealed = !this._revealed;
        this._applyReveal();
        this._inner.focus();
      });
      actions.append(this._revealBtn);
    }
    if (has(this, 'clearable')) {
      this._clearBtn = document.createElement('button');
      this._clearBtn.type = 'button';
      this._clearBtn.className = 'gh-input__action';
      this._clearBtn.setAttribute('aria-label', t('clear'));
      this._clearBtn.innerHTML = iconSvg('x', 14);
      this._clearBtn.addEventListener('click', () => {
        this._inner.value = '';
        this._inner.dispatchEvent(new Event('input', { bubbles: true }));
        this._inner.dispatchEvent(new Event('change', { bubbles: true }));
        this._inner.focus();
      });
      actions.append(this._clearBtn);
    }

    if (actions.childElementCount) {
      this.classList.add('gh-input--has-actions');
      this.append(actions);
    }
    this._inner.addEventListener('input', () => this._updateActions());
  }

  _sync() {
    super._sync();
    if (!this._inner) return;
    if (this._revealed && this._inner.type === 'password') this._inner.type = 'text';
    this._updateActions();
  }

  get revealed() { return !!this._revealed; }
  set revealed(v) { this._revealed = !!v; this._applyReveal(); }

  _applyReveal() {
    if (!this._revealBtn) return;
    const on = this._revealed && attr(this, 'type', 'text') === 'password';
    if (attr(this, 'type', 'text') === 'password') this._inner.type = on ? 'text' : 'password';
    this._revealBtn.innerHTML = iconSvg(on ? 'eye-closed' : 'eye', 15);
    this._revealBtn.setAttribute('aria-label', t(on ? 'hidePassword' : 'showPassword'));
  }

  _updateActions() {
    if (!this._actions || !this._inner) return;
    const value = this._inner.value || '';
    if (this._counter) {
      const max = attr(this, 'maxlength');
      this._counter.textContent = max ? `${value.length}/${max}` : String(value.length);
    }
    if (this._clearBtn) this._clearBtn.classList.toggle('is-hidden', !value);
    this._applyReveal();
    // 让文本不被右侧按钮压住（等布局完成再量宽度）
    requestAnimationFrame(() => {
      if (this._actions) {
        this._inner.style.paddingRight = (this._actions.offsetWidth + 16) + 'px';
      }
    });
  }
}

/* ---------- gh-checkbox / gh-radio ----------
   <gh-checkbox checked name="notify" value="email">接收邮件通知</gh-checkbox>
   <gh-radio name="plan" value="pro" checked>专业版</gh-radio>
   indeterminate 属性支持半选；状态会同步回 checked 属性 */
class GHCheck extends HTMLElement {
  static get observedAttributes() { return ['checked', 'disabled', 'indeterminate', 'name', 'value']; }
  connectedCallback() {
    once(this, (el) => {
      const radio = el.tagName === 'GH-RADIO';
      el._radio = radio;
      const label = document.createElement('label');
      label.className = 'gh-check' + (radio ? ' gh-check--radio' : '');
      const input = document.createElement('input');
      input.type = radio ? 'radio' : 'checkbox';
      input.className = 'gh-check__input';
      const box = document.createElement('span');
      box.className = 'gh-check__box';
      if (!radio) {
        const mark = document.createElement('span');
        mark.className = 'gh-check__mark';
        mark.innerHTML = iconSvg('check', 12);
        const dash = document.createElement('span');
        dash.className = 'gh-check__dash';
        box.append(mark, dash);
      }
      const text = document.createElement('span');
      text.className = 'gh-check__label';
      while (el.firstChild) text.append(el.firstChild);
      label.append(input, box, text);
      el.append(label);
      el._input = input;

      input.addEventListener('change', () => {
        input.checked ? el.setAttribute('checked', '') : el.removeAttribute('checked');
        if (radio && input.checked) {
          // 同名单选组：把其他实例的 checked 属性也清掉，保持属性与状态一致
          document.querySelectorAll(`gh-radio[name="${CSS.escape(input.name)}"]`).forEach((o) => {
            if (o !== el) o.removeAttribute('checked');
          });
        }
      });
      el._sync();
    });
  }
  attributeChangedCallback() { if (this._ghDone) this._sync(); }
  _sync() {
    const input = this._input;
    if (!input) return;
    input.checked = has(this, 'checked');
    input.disabled = has(this, 'disabled');
    input.indeterminate = has(this, 'indeterminate');
    if (attr(this, 'name')) input.name = attr(this, 'name');
    if (attr(this, 'value') !== null) input.value = attr(this, 'value');
    this.classList.toggle('is-disabled', has(this, 'disabled'));
  }
  get checked() { return this._input ? this._input.checked : has(this, 'checked'); }
  set checked(v) { v ? this.setAttribute('checked', '') : this.removeAttribute('checked'); }
  get value() { return this._input ? this._input.value : attr(this, 'value', ''); }
}

class GHCheckbox extends GHCheck {}
class GHRadio extends GHCheck {}

/* ---------- gh-textarea ----------
   <gh-textarea name="desc" rows="4" placeholder="描述…"> */
class GHTextarea extends GHFormControl {
  tag = 'textarea';
  forwardAttrs = ['value', 'name', 'placeholder', 'rows', 'maxlength', 'required', 'readonly', 'minlength'];
}

/* ---------- gh-select ----------
   <gh-select name="state" value="todo" placeholder="请选择">
     <option value="todo">待办</option>
     <option value="done">已完成</option>
   </gh-select>
   自绘弹层，菜单外观与 gh-dropdown 共用（.gh-menu）；
   内部保留一个视觉隐藏的原生 select，保证 name / 表单提交 / form.reset 正常工作。
   插槽：slot="caret" 替换箭头图标（默认 triangle-down，展开时旋转 180°）
   事件：原生 change（bubbles） */
class GHSelect extends HTMLElement {
  // name 写进隐藏的原生 select、placeholder 决定空值文案，两者都参与 _sync
  static get observedAttributes() { return ['value', 'disabled', 'name', 'placeholder']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-select');

      // 1. 先把选项信息读出来，再把 option 搬进隐藏的原生 select
      const options = [...el.children].filter((c) => c.tagName === 'OPTION');
      this._items = options.map((o) => ({
        value: o.value,
        label: (o.textContent || '').trim(),
        disabled: o.disabled,
        avatar: o.getAttribute('avatar'),
        icon: o.getAttribute('icon'),
      }));
      const native = document.createElement('select');
      native.className = 'gh-select__native';
      native.tabIndex = -1;
      native.setAttribute('aria-hidden', 'true');
      options.forEach((o) => native.append(o));
      if (attr(el, 'name')) native.setAttribute('name', attr(el, 'name'));
      this._native = native;

      // 2. 触发器（外观与 gh-input 一致）
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'gh-select__trigger';
      trigger.setAttribute('aria-haspopup', 'listbox');
      trigger.setAttribute('aria-expanded', 'false');
      const media = document.createElement('span');
      media.className = 'gh-select__media';
      const label = document.createElement('span');
      label.className = 'gh-select__value';
      const arrow = document.createElement('span');
      arrow.className = 'gh-select__arrow';
      const caretSlot = takeSlot(el, 'caret');
      if (caretSlot) arrow.append(caretSlot);
      else {
        arrow.innerHTML = iconSvg('triangle-down', 16);
        arrow.classList.add('is-triangle');
      }
      trigger.append(media, label, arrow);
      this._trigger = trigger;
      this._label = label;
      this._media = media;

      // 3. 菜单（与 gh-dropdown 同一套 .gh-menu 外观）
      const menu = document.createElement('div');
      menu.className = 'gh-select__menu gh-menu';
      menu.setAttribute('role', 'listbox');
      this._items.forEach((item, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'gh-menu__item';
        btn.setAttribute('role', 'option');
        btn.tabIndex = -1;
        btn.dataset.index = i;
        const media = optionMedia(item);
        const text = document.createElement('span');
        text.textContent = item.label;
        const check = document.createElement('span');
        check.className = 'gh-menu__check';
        check.innerHTML = iconSvg('check', 16);
        if (media) btn.append(media);
        btn.append(text, check);
        if (item.disabled) btn.disabled = true;
        btn.addEventListener('click', () => {
          if (item.disabled) return;
          this._commit(item.value);
          this.close();
        });
        item.el = btn;
        menu.append(btn);
      });
      this._menu = menu;

      el.append(trigger, menu, native);

      // 开合 / 外部点击 / Esc 分层 / 滚动重定位统一交给公共内核
      this._popup = createPopup({
        panel: menu,
        anchor: trigger,
        placement: 'bottom-start',
        offset: 4,
        haspopup: 'listbox',
        contains: (node) => el.contains(node),
        beforePlace: () => {
          // 菜单默认 display:none，必须在测量前先挂上 is-open
          el.classList.add('is-open');
          menu.style.width = Math.round(trigger.getBoundingClientRect().width) + 'px';
        },
        onOpen: () => {
          const start = this._index >= 0 ? this._index : 0;
          this._setActive(start);
          this._items[start] && this._items[start].el.focus();
        },
        onClose: () => {
          el.classList.remove('is-open', 'is-flip');
          this._setActive(-1);
        },
      });

      // 4. 初始值：value 属性 > selected option > 第一项
      const preset = attr(el, 'value');
      const selected = options.find((o) => o.selected);
      this._current = preset !== null ? preset : (selected ? selected.value : (this._items[0] && this._items[0].value));
      native.value = this._current;

      this._sync();

      trigger.addEventListener('click', () => this.toggle());
      trigger.addEventListener('keydown', (e) => {
        if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
          e.preventDefault();
          this.open();
        }
      });
      menu.addEventListener('keydown', (e) => this._onMenuKey(e));
      // 表单 reset 后把原生 select 的复位值同步回自绘 UI
      const form = el.closest('form');
      if (form) {
        form.addEventListener('reset', () => {
          setTimeout(() => {
            this._current = native.value;
            this._sync();
          }, 0);
        });
      }
    });
  }

  attributeChangedCallback(name, _oldV, newV) {
    if (!this._ghDone) return;
    // 外部直接改 value 属性时，把内部当前值与原生 select 一起拉过来
    if (name === 'value') {
      this._current = newV === null ? '' : newV;
      this._native.value = this._current;
    }
    this._sync();
  }

  _sync() {
    const off = has(this, 'disabled');
    this.classList.toggle('is-disabled', off);
    this._trigger.disabled = off;
    this._native.disabled = off;
    // name 允许运行时改（表单序列化用），所以放在 _sync 而不是初始化里
    this._native.name = attr(this, 'name', '');
    const idx = this._items.findIndex((i) => i.value === this._current);
    const item = this._items[idx];
    this._label.textContent = item ? item.label : (attr(this, 'placeholder') || '');
    this._label.classList.toggle('is-placeholder', !item);
    this._media.textContent = '';
    const media = item ? optionMedia(item) : null;
    if (media) this._media.append(media);
    this._items.forEach((it, i) => {
      it.el.setAttribute('aria-selected', i === idx ? 'true' : 'false');
    });
    this._index = idx;
  }

  _onMenuKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      // 标记给外层弹窗看：这一下 Esc 归菜单，别再关对话框
      e._ghMenuHandled = true;
      this.close();
      return;
    }
    if (e.key === 'Tab') { this.close(); this._trigger.focus(); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const item = this._items[this._active];
      if (item && !item.disabled) { this._commit(item.value); this.close(); }
      return;
    }
    const delta = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const total = this._items.length;
    let i = this._active;
    for (let n = 0; n < total; n += 1) {
      i = (i + delta + total) % total;
      if (!this._items[i].disabled) break;
    }
    this._setActive(i, true);
  }

  _setActive(i, focus = false) {
    this._active = i;
    this._items.forEach((it, n) => it.el.classList.toggle('is-active', n === i));
    if (focus && this._items[i]) this._items[i].el.focus();
  }

  _commit(value) {
    this._current = value;
    this._native.value = value;
    // 双向：程序化选中时把 value 属性也写上，外部读属性才是当前值
    if (attr(this, 'value', '') !== value) this.setAttribute('value', value);
    this._sync();
    // 与原生 select 行为一致：change 冒泡到 gh-select
    this._native.dispatchEvent(new Event('change', { bubbles: true }));
  }

  open() {
    if (has(this, 'disabled')) return;
    this._popup.open();
  }

  close(reason) { this._popup && this._popup.close(reason || 'close'); }

  get _open() { return !!(this._popup && this._popup.isOpen); }

  toggle() { this._open ? this.close() : this.open(); }

  focus() { this._trigger.focus(); }
  get value() { return this._current ?? ''; }
  set value(v) { if (v !== this._current) this._commit(v); }
}

/* ---------- gh-field ----------
   <gh-field label="标题" hint="不超过 50 字">…控件…</gh-field> */
class GHField extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-field');
      const label = attr(el, 'label');
      const hint = attr(el, 'hint');
      const error = attr(el, 'error');
      if (error) el.classList.add('is-invalid');
      const ctrl = document.createElement('div');
      ctrl.className = 'gh-field__control';
      while (el.firstChild) ctrl.append(el.firstChild);
      el.append(ctrl);
      if (label) {
        const l = document.createElement('label');
        l.className = 'gh-field__label';
        l.textContent = label;
        // label 与控件是兄弟节点，点标签时手动把焦点送进去
        l.addEventListener('click', () => {
          const c = el.querySelector(
            '.gh-field__control input, .gh-field__control textarea, .gh-field__control select, .gh-field__control .gh-select__trigger');
          if (c) c.focus();
        });
        el.prepend(l);
      }
      if (error) {
        const err = document.createElement('div');
        err.className = 'gh-field__error';
        err.textContent = error;
        el.append(err);
      } else if (hint) {
        const h = document.createElement('div');
        h.className = 'gh-field__hint';
        h.textContent = hint;
        el.append(h);
      }
    });
  }
}

/* ---------- gh-switch ----------
   <gh-switch checked name="notify" value="1">接收通知</gh-switch>

   形态变体（可叠加，不写则是最简单的圆点开关）：
   · status        —— 轨道左侧显示 On / Off 文案（status-on / status-off 可改文案）
   · inline        —— 把 On / Off 文案内嵌进轨道，随滑块左右切换（文案同样走 status-on/off）
   · shape="square"—— 方形滑块（默认圆形）
   · icon          —— 滑块里显示 ✓（开）/ ×（关）
   <gh-switch status checked name="notify">接收通知</gh-switch>
   <gh-switch inline checked name="draft">内嵌文案</gh-switch>
   <gh-switch shape="square" inline icon checked>方形滑块 + 文案 + 图标</gh-switch> */
class GHSwitch extends HTMLElement {
  static get observedAttributes() {
    return ['checked', 'disabled', 'name', 'value', 'status', 'status-on', 'status-off', 'inline', 'icon', 'shape', 'size'];
  }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-switch');
      const label = document.createElement('label');
      label.className = 'gh-switch__row';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('role', 'switch');
      input.className = 'gh-switch__input';
      const status = document.createElement('span');
      status.className = 'gh-switch__status';
      const track = document.createElement('span');
      track.className = 'gh-switch__track';
      const trackText = document.createElement('span');
      trackText.className = 'gh-switch__track-text';
      const knob = document.createElement('span');
      knob.className = 'gh-switch__knob';
      const knobIcon = document.createElement('span');
      knobIcon.className = 'gh-switch__knob-icon';
      knob.append(knobIcon);
      // 文案在下、滑块在上：滑块会盖住文字的一侧
      track.append(trackText, knob);
      const text = document.createElement('span');
      text.className = 'gh-switch__label';
      while (el.firstChild) text.append(el.firstChild);
      label.append(input, status, track, text);
      el.append(label);
      el._input = input;
      el._status = status;
      el._track = track;
      el._trackText = trackText;
      el._knob = knob;
      el._knobIcon = knobIcon;
      input.addEventListener('change', () => {
        input.checked ? el.setAttribute('checked', '') : el.removeAttribute('checked');
        el._sync();
      });
      el._sync();
    });
  }
  attributeChangedCallback() { if (this._ghDone) this._sync(); }
  _sync() {
    const input = this._input;
    if (!input) return;
    input.checked = has(this, 'checked');
    input.disabled = has(this, 'disabled');
    if (attr(this, 'name')) input.name = attr(this, 'name');
    if (attr(this, 'value') !== null) input.value = attr(this, 'value');
    this.classList.toggle('is-disabled', has(this, 'disabled'));
    this.classList.toggle('gh-switch--square', attr(this, 'shape', '') === 'square');
    this.classList.toggle('gh-switch--inline', has(this, 'inline'));
    this.classList.toggle('gh-switch--icon', has(this, 'icon'));
    const size = attr(this, 'size', '');
    this.classList.toggle('gh-switch--sm', size === 'sm');
    this.classList.toggle('gh-switch--lg', size === 'lg');
    this.dataset.size = size || 'md';
    input.setAttribute('aria-checked', input.checked ? 'true' : 'false');
    const onText = attr(this, 'status-on', 'On');
    const offText = attr(this, 'status-off', 'Off');
    if (this._status) {
      this._status.textContent = has(this, 'status') ? (input.checked ? onText : offText) : '';
    }
    if (this._trackText) {
      this._trackText.textContent = has(this, 'inline') ? (input.checked ? onText : offText) : '';
    }
    if (this._knobIcon) {
      this._knobIcon.innerHTML = has(this, 'icon') ? iconSvg(input.checked ? 'check' : 'x', 12) : '';
    }
  }
  get checked() { return this._input ? this._input.checked : has(this, 'checked'); }
  set checked(v) { v ? this.setAttribute('checked', '') : this.removeAttribute('checked'); }
  // 与 gh-checkbox 对齐：value 读内部 input（有 name 时用于表单提交）
  get value() { return this._input ? this._input.value : attr(this, 'value', ''); }
  set value(v) {
    if (v == null) this.removeAttribute('value');
    else this.setAttribute('value', String(v));
  }
}

/* ---------- gh-combobox ----------
   <gh-combobox name="assignee" placeholder="搜索成员…">
     <option value="u1">羽田舟</option>
   </gh-combobox>
   可输入过滤 + 键盘选择，值走隐藏 input 参与表单提交
   插槽：slot="caret" 替换箭头图标（展开时旋转 180°） */
class GHComboBox extends HTMLElement {
  // name 写进隐藏 input（表单提交用），必须监听，否则运行时改名不生效
  static get observedAttributes() { return ['value', 'disabled', 'placeholder', 'name']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-combobox');
      const caretSlot = takeSlot(el, 'caret');
      const options = [...el.children].filter((c) => c.tagName === 'OPTION').map((o) => ({
        value: o.value,
        label: (o.textContent || '').trim(),
        disabled: o.disabled,
        selected: o.selected,
        avatar: o.getAttribute('avatar'),
        icon: o.getAttribute('icon'),
      }));
      options.forEach((o) => o.el && o.el.remove());
      while (el.firstChild) el.removeChild(el.firstChild);

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'gh-input__inner gh-combobox__input';
      input.autocomplete = 'off';
      if (attr(el, 'placeholder')) input.placeholder = attr(el, 'placeholder');
      input.setAttribute('role', 'combobox');
      input.setAttribute('aria-expanded', 'false');

      const arrow = document.createElement('span');
      arrow.className = 'gh-combobox__arrow';
      if (caretSlot) arrow.append(caretSlot);
      else {
        arrow.innerHTML = iconSvg('triangle-down', 16);
        arrow.classList.add('is-triangle');
      }

      const menu = document.createElement('div');
      menu.className = 'gh-combobox__menu gh-menu';
      menu.setAttribute('role', 'listbox');

      this._items = options.map((item, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'gh-menu__item';
        btn.setAttribute('role', 'option');
        btn.dataset.index = i;
        const media = optionMedia(item);
        const text = document.createElement('span');
        text.textContent = item.label;
        const check = document.createElement('span');
        check.className = 'gh-menu__check';
        check.innerHTML = iconSvg('check', 16);
        if (media) btn.append(media);
        btn.append(text, check);
        if (item.disabled) btn.disabled = true;
        btn.addEventListener('click', () => {
          if (item.disabled) return;
          this._commit(item.value);
          this.close();
        });
        item.el = btn;
        menu.append(btn);
        return item;
      });

      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      if (attr(el, 'name')) hidden.name = attr(el, 'name');

      el.append(input, arrow, menu, hidden);
      this._input = input;
      this._menu = menu;
      this._hidden = hidden;

      // 开合 / 外部点击 / Esc / 重定位统一走公共内核（坐标 fixed，不受容器裁切）
      this._popup = createPopup({
        panel: menu,
        anchor: input,
        placement: 'bottom-start',
        offset: 4,
        haspopup: 'listbox',
        contains: (node) => el.contains(node),
        beforePlace: () => {
          // 先按当前输入过滤，菜单尺寸才算得准
          el.classList.add('is-open');
          this._filter();
          menu.style.width = Math.round(el.getBoundingClientRect().width) + 'px';
        },
        onOpen: () => {
          el.classList.add('is-open');
          this._filter();
        },
        onClose: () => {
          el.classList.remove('is-open');
          this._items.forEach((it) => it.el.classList.remove('is-active'));
          this._active = -1;
          const item = this._items.find((i) => i.value === this._current);
          if (item) this._input.value = item.label;
        },
      });
      this._current = attr(el, 'value') !== null ? attr(el, 'value')
        : ((options.find((o) => o.selected) || options[0] || {}).value ?? '');

      input.addEventListener('focus', () => {
        this.open();
        input.select();
      });
      input.addEventListener('input', () => { this._filter(); this.open(); });
      input.addEventListener('keydown', (e) => this._onInputKey(e));
      el._sync();
    });
  }
  attributeChangedCallback(name, _oldV, newV) {
    if (!this._ghDone) return;
    // value 属性 → 内部当前值（外部改属性时输入框与隐藏 input 一起更新）
    if (name === 'value') this._current = newV === null ? '' : newV;
    this._sync();
  }

  _sync() {
    if (!this._input) return;
    const item = this._items.find((i) => i.value === this._current);
    this._input.value = item ? item.label : '';
    this._hidden.value = this._current || '';
    // name 允许运行时改（新值不触发 attributeChanged 时也能跟表单对上）
    this._hidden.name = attr(this, 'name', '');
    this._input.disabled = has(this, 'disabled');
    if (attr(this, 'placeholder')) this._input.placeholder = attr(this, 'placeholder');
    this.classList.toggle('is-disabled', has(this, 'disabled'));
    this._items.forEach((it) => it.el.setAttribute('aria-selected', it === item ? 'true' : 'false'));
  }

  _filter() {
    const q = this._input.value.trim().toLowerCase();
    this._items.forEach((it) => {
      const hit = !q || it.label.toLowerCase().includes(q) || String(it.value).toLowerCase().includes(q);
      it.el.hidden = !hit;
    });
    this._visible = this._items.filter((it) => !it.el.hidden);
    this._active = -1;
  }

  _onInputKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); this.open(); this._move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.open(); this._move(-1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (this._active >= 0 && this._visible[this._active]) this._commit(this._visible[this._active].value);
      else if (this._visible.length === 1) this._commit(this._visible[0].value);
      this.close();
    } else if (e.key === 'Tab') { this.close(); }
  }

  _move(delta) {
    if (!this._visible || !this._visible.length) return;
    const n = this._visible.length;
    this._active = (this._active + delta + n) % n;
    this._visible.forEach((it, i) => it.el.classList.toggle('is-active', i === this._active));
    this._visible[this._active].el.scrollIntoView({ block: 'nearest' });
  }

  _commit(value) {
    this._current = value;
    this._hidden.value = value;
    // 双向：程序化选中时把 value 属性也写上，外部读属性才是当前值
    if (attr(this, 'value', '') !== value) this.setAttribute('value', value);
    this._items.forEach((it) => it.el.setAttribute('aria-selected', it.value === value ? 'true' : 'false'));
    this._sync();
    this._hidden.dispatchEvent(new Event('change', { bubbles: true }));
  }

  open() {
    if (has(this, 'disabled')) return;
    // 已经展开时只更新列表与位置，避免每次输入都重复绑定
    if (this._popup.isOpen) {
      this._filter();
      this._popup.reposition();
      return;
    }
    this._filter();
    this._popup.open();
  }
  close(reason) { if (this._popup && this._popup.isOpen) this._popup.close(reason || 'close'); }
  get value() { return this._current || ''; }
  set value(v) { if (v !== this._current) this._commit(v); }
}

define('gh-switch', GHSwitch);
define('gh-combobox', GHComboBox);
define('gh-checkbox', GHCheckbox);
define('gh-radio', GHRadio);
define('gh-input', GHInput);
define('gh-textarea', GHTextarea);
define('gh-select', GHSelect);
define('gh-field', GHField);

