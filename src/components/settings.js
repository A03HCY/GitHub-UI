// settings.js — 设置列表：gh-feature（设置行）/ gh-callout（提示卡）
import { define, once, has, attr } from '../core.js';
import { iconSvg } from '../icons.js';

/* ---------- gh-feature ----------
   设置行：左侧标题 + 说明，右侧控件，下方可展开内容。多行放进 .gh-features 容器里，
   容器负责圆角边框，行与行之间自动画 1px 分隔线。

   属性：title / description / checkbox / checked / collapse / name / value / disabled
   插槽：slot="control" 放到右侧（gh-switch、gh-select-menu、gh-btn 都行）
   其余子节点是展开区；带 collapse 时未勾选会隐藏展开区。

   <div class="gh-features">
     <gh-feature title="Review effort level" description="…">
       <gh-select-menu slot="control" value="balanced">…</gh-select-menu>
     </gh-feature>
     <gh-feature checkbox checked title="Issues" description="…" collapse>
       <gh-field label="Issue permissions">…</gh-field>
     </gh-feature>
   </div>

   勾选变化时派发 gh:feature-change，detail = { checked, name, value }。 */
class GHFeature extends HTMLElement {
  static get observedAttributes() {
    return ['title', 'description', 'checked', 'disabled'];
  }

  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-feature');
      const isCheck = el.hasAttribute('checkbox');
      if (isCheck) el.classList.add('gh-feature--check');
      if (has(el, 'disabled')) el.classList.add('is-disabled');
      el.setAttribute('role', 'group');
      if (attr(el, 'title')) el.setAttribute('aria-label', attr(el, 'title'));

      const row = document.createElement('div');
      row.className = 'gh-feature__row';

      // 复选框模式下 main 是 label，点标题即勾选
      const main = document.createElement(isCheck ? 'label' : 'div');
      main.className = 'gh-feature__main';

      if (isCheck) {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'gh-feature__input';
        input.checked = has(el, 'checked');
        if (attr(el, 'name')) input.name = attr(el, 'name');
        if (attr(el, 'value')) input.value = attr(el, 'value');
        if (has(el, 'disabled')) input.disabled = true;

        const box = document.createElement('span');
        box.className = 'gh-feature__box';
        box.innerHTML = iconSvg('check', 12);
        main.append(input, box);

        el._input = input;
        input.addEventListener('change', () => {
          if (input.checked) el.setAttribute('checked', '');
          else el.removeAttribute('checked');
          el._syncBody();
          el.dispatchEvent(
            new CustomEvent('gh:feature-change', {
              bubbles: true,
              detail: { checked: input.checked, name: input.name, value: input.value },
            })
          );
        });
      }

      const text = document.createElement('span');
      text.className = 'gh-feature__text';
      const title = document.createElement('span');
      title.className = 'gh-feature__title';
      title.textContent = attr(el, 'title', '');
      text.append(title);
      const desc = document.createElement('span');
      desc.className = 'gh-feature__desc';
      desc.textContent = attr(el, 'description', '');
      if (desc.textContent) text.append(desc);
      main.append(text);
      row.append(main);

      // 右侧控件
      const controls = [...el.children].filter((c) => c.getAttribute('slot') === 'control');
      if (controls.length) {
        const control = document.createElement('div');
        control.className = 'gh-feature__control';
        controls.forEach((c) => {
          c.removeAttribute('slot');
          control.append(c);
        });
        row.append(control);
      }

      // 剩余子节点 = 展开区。纯空白文本节点不算内容：否则空的 .gh-feature__body
      // 还带着 16px 上边距，会把行撑高、右侧控件看起来偏上。
      const body = document.createElement('div');
      body.className = 'gh-feature__body';
      while (el.firstChild) body.append(el.firstChild);
      const hasBody = body.children.length > 0 || body.textContent.trim() !== '';
      if (!hasBody) body.textContent = '';

      el.append(row);
      if (hasBody) el.append(body);

      el._title = title;
      el._desc = desc;
      el._body = body;
      el._syncBody();
    });
  }

  _syncBody() {
    const body = this._body;
    if (!body) return;
    const collapsed = this.hasAttribute('checkbox') && this.hasAttribute('collapse');
    body.hidden = collapsed && this._input ? !this._input.checked : false;
  }

  attributeChangedCallback(name, oldValue, value) {
    if (oldValue === value) return;
    if (name === 'checked' && this._input) {
      this._input.checked = value !== null;
      this._syncBody();
    } else if (name === 'disabled' && this._input) {
      this._input.disabled = value !== null;
      this.classList.toggle('is-disabled', value !== null);
    } else if (name === 'title' && this._title) {
      this._title.textContent = value || '';
    } else if (name === 'description' && this._desc) {
      this._desc.textContent = value || '';
      this._desc.hidden = !value;
    }
  }
}

/* ---------- gh-callout ----------
   提示卡：图标 + 标题 + 说明（+ 右侧按钮）。

   <gh-callout icon="book" title="Get organized with issue templates" description="…">
     <gh-btn slot="action" variant="success">Set up templates</gh-btn>
   </gh-callout>

   形态：
     variant="info|success|warning|danger|neutral"  语义色（默认 info，浅底填充）
     bordered   白底 + 1px 描边（GitHub 通告条那种），说明文字转 muted
     badge      图标放进 32px 圆形底里（配 bordered 就是截图里的通告卡）
     dense      更紧凑的内边距
   DIY：
     slot="icon"         换成任意自定义图标/节点
     slot="description"  富文本说明（可含 <a> 链接），优先于 description 属性
     slot="action"       右侧操作区
     CSS 变量            --gh-callout-bg / --gh-callout-border / --gh-callout-icon-bg /
                         --gh-callout-icon-fg / --gh-callout-radius / --gh-callout-pad */
class GHCallout extends HTMLElement {
  static get observedAttributes() {
    return ['title', 'description', 'variant', 'badge', 'bordered', 'dense'];
  }

  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-callout');

      const main = document.createElement('div');
      main.className = 'gh-callout__main';

      // 图标：slot="icon" 优先（任意自定义节点），否则用 icon 属性
      const iconSlot = [...el.children].find((c) => c.getAttribute('slot') === 'icon');
      const iconName = attr(el, 'icon');
      if (iconSlot || iconName) {
        const wrap = document.createElement('span');
        wrap.className = 'gh-callout__icon';
        if (iconSlot) {
          iconSlot.removeAttribute('slot');
          wrap.append(iconSlot);
        } else {
          const i = document.createElement('gh-icon');
          i.setAttribute('name', iconName);
          i.setAttribute('size', '24');
          wrap.append(i);
        }
        main.append(wrap);
      }

      const text = document.createElement('div');
      text.className = 'gh-callout__text';
      const title = document.createElement('div');
      title.className = 'gh-callout__title';
      title.textContent = attr(el, 'title', '');
      text.append(title);

      // 说明：富文本插槽优先，其次是 description 属性（纯文本）
      const descSlot = [...el.children].find((c) => c.getAttribute('slot') === 'description');
      let desc;
      if (descSlot) {
        descSlot.removeAttribute('slot');
        descSlot.classList.add('gh-callout__desc');
        desc = descSlot;
      } else {
        desc = document.createElement('p');
        desc.className = 'gh-callout__desc';
        desc.textContent = attr(el, 'description', '');
      }
      if (desc.textContent.trim()) text.append(desc);
      main.append(text);
      el.prepend(main);

      const actionNodes = [...el.children].filter((c) => c.getAttribute('slot') === 'action');
      if (actionNodes.length) {
        const actions = document.createElement('div');
        actions.className = 'gh-callout__action';
        actionNodes.forEach((node) => {
          node.removeAttribute('slot');
          actions.append(node);
        });
        el.append(actions);
      }

      el._title = title;
      el._desc = desc;
      el._richDesc = !!descSlot;
      el._sync();
    });
  }

  attributeChangedCallback(name, oldValue, value) {
    if (oldValue === value) return;
    if (name === 'title' && this._title) this._title.textContent = value || '';
    if (name === 'description' && this._desc && !this._richDesc) {
      this._desc.textContent = value || '';
      this._desc.hidden = !value;
    }
    if (this._ghDone) this._sync();
  }

  _sync() {
    this.classList.toggle('gh-callout--badge', has(this, 'badge'));
    this.classList.toggle('gh-callout--bordered', has(this, 'bordered'));
    this.classList.toggle('gh-callout--dense', has(this, 'dense'));
  }
}

define('gh-feature', GHFeature);
define('gh-callout', GHCallout);

export { GHFeature, GHCallout };
