// interactive.js — 交互组件：gh-tabs / gh-dialog / gh-dropdown / gh-timeline
import { define, once, has, attr, t } from '../core.js';
import { setCurrent } from '../core/state.js';
import { lockScroll, unlockScroll, trapFocus,
  nextOverlayZ, createPopup } from '../core/overlay.js';
import { iconSvg } from '../icons.js';

/* ---------- gh-tabs ----------
   <gh-tabs>
     <gh-tab panel="p1" selected>常规</gh-tab>
     <gh-tab panel="p2">成员</gh-tab>
   </gh-tabs>
   <div id="p1">…</div><div id="p2" hidden>…</div>

   也支持内联面板（放进弹层/抽屉里更自然，面板跟着 tab 走）：
   <gh-tabs>
     <gh-tab selected>Local</gh-tab>
     <gh-tab-panel>…Local 内容…</gh-tab-panel>
     <gh-tab>Codespaces</gh-tab>
     <gh-tab-panel hidden>…Codespaces 内容…</gh-tab-panel>
   </gh-tabs>
   事件: gh:tab-change  detail: { panel, tab } */
class GHTabs extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-tabs');
      if (has(el, 'flush')) el.classList.add('gh-tabs--flush');
      el.setAttribute('role', 'tablist');

      // 结构重组：tab 全部进一个横向 tablist 行，panel 放到下方。
      // 否则 gh-tabs 是 flex，tab 和 panel 会混排在同一行。
      const list = document.createElement('div');
      list.className = 'gh-tabs__list';
      list.setAttribute('role', 'tablist');
      const panels = document.createElement('div');
      panels.className = 'gh-tabs__panels';

      const tabs = [...el.querySelectorAll('gh-tab')];
      tabs.forEach((tab) => {
        // 内联面板：tab 后面紧跟的 gh-tab-panel 与之配对。
        // 注意先取 nextElementSibling 再移动 tab，否则移走后就取不到了。
        const next = tab.nextElementSibling;
        list.append(tab);
        if (next && next.tagName === 'GH-TAB-PANEL' && !tab.hasAttribute('panel')) {
          tab._inlinePanel = next;
          panels.append(next);
        }
      });
      // 其它散落的 panel（tab 有 panel="外部id" 时面板在外部，这里只收内联的）
      el.querySelectorAll(':scope > gh-tab-panel').forEach((p) => {
        if (!p.parentElement || p.parentElement !== panels) panels.append(p);
      });
      el.append(list, panels);
      el._list = list;

      // 滑动指示条：单独一个绝对定位元素挂在列表里，切换时用 transform 平滑移动
      // （原来画在每个 tab 的 ::after 上，只能瞬间跳变）。
      const indicator = document.createElement('span');
      indicator.className = 'gh-tabs__indicator';
      indicator.setAttribute('aria-hidden', 'true');
      list.append(indicator);
      el._indicator = indicator;
      // 尺寸变化（字体加载、容器变宽、文案变长）后重新对齐，否则指示条会停在旧位置
      const ro = new ResizeObserver(() => el._placeIndicator());
      ro.observe(list);
      el._ro = ro;
      el._onResize = () => el._placeIndicator();
      window.addEventListener('resize', el._onResize);

      tabs.forEach((tab, i) => {
        // 选中态文字加粗（600）会让 tab 变宽，切换时整行跟着轻微抖动。
        // 把纯文本包进 .gh-tab__label，并用 CSS 里隐藏的加粗副本把宽度预留成
        // 「加粗后」的宽度，这样加不加粗布局宽度都不变。
        const textNodes = [...tab.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
        if (textNodes.length) {
          const label = document.createElement('span');
          label.className = 'gh-tab__label';
          label.textContent = textNodes.map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
          label.dataset.text = label.textContent;
          tab.insertBefore(label, textNodes[0]);
          textNodes.forEach((n) => n.remove());
        }
        tab.classList.add('gh-tab');
        tab.setAttribute('role', 'tab');
        tab.setAttribute('tabindex', '-1');
        if (el._ro) el._ro.observe(tab);
        tab.addEventListener('click', () => this.activate(tab));
        // 方向键在标签间移动（GitHub 下划线导航的交互习惯）
        tab.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
            e.preventDefault();
            const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
            next.focus();
            this.activate(next);
          }
        });
      });
      this._tabs = tabs;
      const current = tabs.find((t) => has(t, 'selected')) || tabs[0];
      if (current) this.activate(current, true);
    });
  }
  activate(tab, silent = false) {
    for (const t of this._tabs) {
      const on = t === tab;
      t.classList.toggle('is-active', on);
      t.setAttribute('aria-selected', on);
      t.setAttribute('tabindex', on ? '0' : '-1');
      // 优先内联面板，其次外部 panel id
      if (t._inlinePanel) t._inlinePanel.hidden = !on;
      else {
        const panel = document.getElementById(attr(t, 'panel', ''));
        if (panel) panel.hidden = !on;
      }
    }
    if (!silent) {
      this.dispatchEvent(new CustomEvent('gh:tab-change', {
        bubbles: true,
        detail: { panel: attr(tab, 'panel'), tab },
      }));
    }
    this._placeIndicator();
  }

  // 把指示条移到当前 tab 正下方：位置/宽度都从 tab 的实际盒子取，
  // padding 不对称也不会偏；首帧不加过渡，之后的变化才做动画。
  _placeIndicator() {
    const ind = this._indicator;
    const list = this._list;
    if (!ind || !list) return;
    const active = (this._tabs || []).find((t) => t.classList.contains('is-active'));
    if (!active || !active.offsetWidth) { ind.style.display = 'none'; return; }
    ind.style.display = 'block';
    ind.style.setProperty('--gh-tabs-x', active.offsetLeft + 'px');
    ind.style.setProperty('--gh-tabs-w', active.offsetWidth + 'px');
    if (!list.classList.contains('is-ready')) {
      requestAnimationFrame(() => list.classList.add('is-ready'));
    }
  }

  disconnectedCallback() {
    if (this._ro) this._ro.disconnect();
    if (this._onResize) window.removeEventListener('resize', this._onResize);
  }

  // 按索引 / panel id / 元素激活（比直接传 gh-tab 元素方便）
  select(ref) {
    let tab = null;
    if (typeof ref === 'number') tab = this._tabs[ref];
    else if (typeof ref === 'string') {
      tab = this._tabs.find((t) => attr(t, 'panel', '') === ref) || this._tabs.find((t) => t.textContent.trim() === ref);
    } else if (ref && ref.tagName) {
      tab = this._tabs.find((t) => t === ref);
    }
    if (tab) this.activate(tab);
    return this;
  }
}

/* ---------- gh-tab-panel ----------
   内联 tab 面板：紧跟在 gh-tab 之后，切换时由 gh-tabs 控制 hidden。
   <gh-tab-panel>内容</gh-tab-panel>  /  <gh-tab-panel hidden>内容</gh-tab-panel> */
class GHTabPanel extends HTMLElement {
  static get observedAttributes() { return ['hidden']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-tab-panel');
      if (!el.hasAttribute('role')) el.setAttribute('role', 'tabpanel');
    });
  }
}

/* ---------- gh-dialog ----------
   <gh-dialog title="标题" width="wide">
     内容
     <div slot="footer">自定义底部按钮</div>
   </gh-dialog>
   JS: el.show() / el.close()；事件: gh:open / gh:close
   静态方法: GHDialog.confirm({ title, message, okText, danger }) → Promise<boolean>
   参考 TeamFlow modal.js：滚动锁（含滚动条宽度补偿）与关闭后焦点还原 */
export class GHDialog extends HTMLElement {
  static get observedAttributes() { return ['open']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-dialog');
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      if (attr(el, 'width') === 'wide') el.classList.add('gh-dialog--wide');
      const panel = document.createElement('div');
      panel.className = 'gh-dialog__panel';
      const header = document.createElement('div');
      header.className = 'gh-dialog__header';
      const title = document.createElement('div');
      title.className = 'gh-dialog__title';
      title.textContent = attr(el, 'title', '');
      if (title.textContent) {
        el.setAttribute('aria-label', title.textContent);
        el.removeAttribute('title');
      }
      const close = document.createElement('button');
      close.className = 'gh-dialog__close';
      close.type = 'button';
      close.setAttribute('aria-label', t('close'));
      close.innerHTML = iconSvg('x', 16);
      close.onclick = () => el.close();
      header.append(title, close);
      const body = document.createElement('div');
      body.className = 'gh-dialog__body';
      const foot = document.createElement('div');
      foot.className = 'gh-dialog__foot';
      // 约定：[slot=footer] 子元素进底部按钮区，其余节点（含纯文本）进内容区
      [...el.childNodes].forEach((node) => {
        const isFooter = node.nodeType === 1 && node.getAttribute('slot') === 'footer';
        (isFooter ? foot : body).append(node);
      });

      // ok-text / cancel-text 存在时启用"表单模式"：
      // 自动生成底部按钮，内容包进 <form>，回车即可提交且走原生校验
      const autoActions = attr(el, 'ok-text') !== null || attr(el, 'cancel-text') !== null;
      if (autoActions) {
        const cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.className = 'gh-btn';
        cancel.textContent = attr(el, 'cancel-text', t('cancel'));
        cancel.addEventListener('click', () => el.close());
        const ok = document.createElement('button');
        ok.type = 'submit';
        ok.className = 'gh-btn ' + (attr(el, 'ok-variant') === 'danger' ? 'gh-btn--danger' : 'gh-btn--primary');
        ok.textContent = attr(el, 'ok-text', t('confirm'));
        foot.append(cancel, ok);
        const form = document.createElement('form');
        form.className = 'gh-dialog__form';
        form.append(body, foot);
        // 不依赖浏览器的隐式提交：输入框内回车直接走 requestSubmit（含原生校验）
        form.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' || e.isComposing) return;
          // 组件已经处理过这次回车（如 gh-combobox 选中项），就不要再提交表单
          if (e.defaultPrevented) return;
          const t = e.target;
          if (!t.matches('input, select')) return;
          e.preventDefault();
          if (form.reportValidity()) form.requestSubmit();
        });
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          // 可被 preventDefault() 拦截，用于异步保存后再手动 close()
          const ev = new CustomEvent('gh:confirm', {
            bubbles: true,
            cancelable: true,
            detail: { values: el.values, dialog: el },
          });
          if (el.dispatchEvent(ev)) el.close();
        });
        panel.append(header, form);
      } else {
        panel.append(header, body);
        if (foot.hasChildNodes()) panel.append(foot);
      }
      el.append(panel);
      // 点击遮罩关闭：要求按下与松开都在遮罩上，避免从面板内拖拽误关
      let pressedOnBackdrop = false;
      el.addEventListener('mousedown', (e) => { pressedOnBackdrop = e.target === el; });
      el.addEventListener('click', (e) => {
        if (e.target === el && pressedOnBackdrop) el.close();
        pressedOnBackdrop = false;
      });
      // 焦点陷阱（公共实现）
      el.addEventListener('keydown', trapFocus(el));
      // Esc 关闭（全局只挂一次）
      if (!GHDialog._escBound) {
        GHDialog._escBound = true;
        document.addEventListener('keydown', (e) => {
          if (e.key !== 'Escape' || e._ghMenuHandled) return;
          // 对话框里的菜单开着时，Esc 只关菜单
          if (document.querySelector('.gh-popover.is-open, .gh-select.is-open, .gh-combobox.is-open, gh-dropdown details[open]')) return;
          // 按实际层级关最上面那层（DOM 顺序不一定等于层叠顺序）
          const open = [...document.querySelectorAll('gh-dialog[open]')]
            .sort((a, b) => (+a.style.zIndex || 0) - (+b.style.zIndex || 0));
          if (open.length) open[open.length - 1].close();
        });
      }
    });
  }
  attributeChangedCallback(_n, oldV, newV) {
    if (oldV === newV) return;
    if (newV !== null) {
      // 后打开的在上面：支持从抽屉/另一个对话框里再开一个
      this.style.zIndex = nextOverlayZ();
      lockScroll();
      this._lastFocus = document.activeElement;
      this.dispatchEvent(new CustomEvent('gh:open', { bubbles: true }));
      // 自动聚焦：优先输入框；否则聚焦面板本身（tabindex=-1，避免默认焦点环）
      setTimeout(() => {
        const input = this.querySelector('.gh-dialog__body input, .gh-dialog__body textarea, .gh-dialog__body select');
        if (input) { input.focus(); return; }
        const panel = this.querySelector('.gh-dialog__panel');
        if (panel) { panel.setAttribute('tabindex', '-1'); panel.focus(); }
      }, 30);
    } else {
      unlockScroll();
      // 收起仍在展开的菜单，避免浮层留在屏幕上
      this.querySelectorAll('gh-select, gh-combobox, gh-select-menu, gh-popover').forEach((c) => c.close && c.close());
      this.querySelectorAll('details[open]').forEach((d) => { d.open = false; });
      this.dispatchEvent(new CustomEvent('gh:close', { bubbles: true }));
      const back = this._lastFocus;
      this._lastFocus = null;
      if (back && document.contains(back) && typeof back.focus === 'function') {
        try { back.focus(); } catch (_) { /* ignore */ }
      }
    }
  }
  // 浮层统一 API：open / close / toggle（show 保留为 open 的别名，兼容旧代码）
  open() { this.setAttribute('open', ''); }
  close() { this.removeAttribute('open'); }
  toggle(force) {
    const want = force === undefined ? !this.hasAttribute('open') : !!force;
    if (want) this.open(); else this.close();
    return want;
  }
  show() { this.open(); }

  // 表单模式下的字段值（按 name 收集，与原生表单一致）
  get values() {
    const form = this.querySelector('.gh-dialog__form');
    if (!form) return {};
    const out = {};
    new FormData(form).forEach((v, k) => { out[k] = v; });
    return out;
  }
  // Promise 化确认框，替代 window.confirm
  static confirm({ title = t('confirmTitle'), message = '', okText = t('confirm'), cancelText = t('cancel'), danger = false } = {}) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
      const dlg = document.createElement('gh-dialog');
      dlg.setAttribute('title', title);
      dlg.setAttribute('ok-text', okText);
      dlg.setAttribute('cancel-text', cancelText);
      if (danger) dlg.setAttribute('ok-variant', 'danger');
      const body = document.createElement('div');
      body.innerHTML = message;
      dlg.append(body);
      dlg.addEventListener('gh:confirm', () => finish(true));
      dlg.addEventListener('gh:close', () => { finish(false); setTimeout(() => dlg.remove(), 0); });
      document.body.append(dlg);
      dlg.show();
    });
  }

  // 输入框弹窗：返回 Promise<string|null>，取消/Esc 为 null
  static prompt({
    title = t('promptTitle'), label = '', value = '', placeholder = '',
    okText = t('confirm'), cancelText = t('cancel'), type = 'text',
  } = {}) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (v) => { if (!settled) { settled = true; resolve(v); } };
      const dlg = document.createElement('gh-dialog');
      dlg.setAttribute('title', title);
      dlg.setAttribute('ok-text', okText);
      dlg.setAttribute('cancel-text', cancelText);

      const field = document.createElement('gh-field');
      if (label) field.setAttribute('label', label);
      const input = document.createElement('gh-input');
      input.setAttribute('name', 'value');
      input.setAttribute('required', '');
      if (placeholder) input.setAttribute('placeholder', placeholder);
      if (value) input.setAttribute('value', value);
      if (type && type !== 'text') input.setAttribute('type', type);
      field.append(input);
      dlg.append(field);

      dlg.addEventListener('gh:confirm', (e) => finish(e.detail.values.value ?? ''));
      dlg.addEventListener('gh:close', () => { finish(null); setTimeout(() => dlg.remove(), 0); });
      document.body.append(dlg);
      dlg.show();
    });
  }
}

/* ---------- gh-dropdown ----------
   <gh-dropdown align="right">
     <gh-btn>菜单 ▾</gh-btn>   ← 第一个子元素作为触发器
     <a href="#">选项 A</a> …  ← 其余子元素进入菜单
   </gh-dropdown>
   事件: gh:toggle  detail: { open } */
class GHDropdown extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-dropdown');
      if (attr(el, 'align') === 'right') el.classList.add('gh-dropdown--right');
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.className = 'gh-dropdown__trigger';
      const menu = document.createElement('div');
      menu.className = 'gh-dropdown__menu gh-menu';
      const children = [...el.children];
      // 约定：第一个子元素 = 触发器，其余 = 菜单内容
      if (children[0]) summary.append(children[0]);
      children.slice(1).forEach((c) => menu.append(c));
      details.append(summary, menu);
      el.append(details);
      el._details = details;
      el._summary = summary;
      el._menu = menu;

      // <details> 继续提供原生语义，开合状态统一由公共内核管理：
      // 外部点击 / Esc 分层 / 滚动重定位 / 与其它浮层互斥
      const ctl = createPopup({
        panel: menu,
        anchor: summary,
        placement: 'bottom-' + (attr(el, 'align') === 'right' ? 'end' : 'start'),
        offset: 4,
        aria: false, // <details>/<summary> 自带展开语义
        contains: (node) => details.contains(node),
        beforePlace: () => {
          menu.style.width = Math.round(Math.max(summary.getBoundingClientRect().width, 192)) + 'px';
        },
        onOpen: (api) => {
          // details 关闭时菜单是 display:none，先展开再重新测量一次
          if (!details.open) details.open = true;
          api.place();
        },
        onClose: (api, reason) => {
          if (details.open) details.open = false;
          if (reason === 'esc') summary.focus();
        },
      });
      el._ctl = ctl;

      // summary 的默认行为（切换 details）拦下来，统一走控制器，保证栈内状态一致
      summary.addEventListener('click', (e) => {
        e.preventDefault();
        ctl.toggle();
      });
      details.addEventListener('toggle', () => {
        if (details.open) { if (!ctl.isOpen) ctl.open(); }
        else if (ctl.isOpen) ctl.close('toggle');
        el.dispatchEvent(new CustomEvent('gh:toggle', { bubbles: true, detail: { open: details.open } }));
      });
      // 点击菜单项后自动收起
      menu.addEventListener('click', (e) => {
        if (e.target.closest('a, button:not(.gh-btn)')) ctl.close('item');
      });
      // 键盘：收起状态下 ↓ 展开并聚焦第一项（Esc / 外部点击由公共内核处理）
      el.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' && !details.open) {
          e.preventDefault();
          ctl.open();
          const first = menu.querySelector('a, button');
          if (first) first.focus();
        }
      });
    });
  }

  // 菜单内容在 details 里，但 details 仍在宿主内（不同于 popover 挂 body），
  // 所以可以直接 querySelector。open/close 提供正式开合入口。
  open() { this._ctl ? this._ctl.open() : this._details && (this._details.open = true); return this; }
  close() { this._ctl ? this._ctl.close('api') : this._details && (this._details.open = false); return this; }
  get isOpen() { return this._details ? this._details.open : false; }
  // 菜单面板元素（.gh-dropdown__menu）
  get menu() { return this._menu || null; }
}

/* ---------- gh-menu ----------
   <gh-menu>
     <gh-menu-item icon="home" active>Overview</gh-menu-item>
     <div class="gh-menu__divider"></div>
     <div class="gh-menu__heading">Findings</div>
     <gh-menu-item icon="dependabot" expandable open>Dependabot</gh-menu-item>
     <div class="gh-menu__sub">
       <gh-menu-item active>Malware</gh-menu-item>
       <gh-menu-item>Vulnerabilities</gh-menu-item>
     </div>
   </gh-menu>
   独立菜单面板（弹层里仍可直接写 div.gh-menu）；
   plain 去掉边框、阴影与内边距，嵌在侧栏/卡片里用。 */
class GHMenu extends HTMLElement {
  static get observedAttributes() { return ['plain']; }

  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-menu');
      if (!el.hasAttribute('role')) el.setAttribute('role', 'menu');
      el._sync();
    });
  }

  attributeChangedCallback() { if (this._ghDone) this._sync(); }

  _sync() { this.classList.toggle('gh-menu--plain', has(this, 'plain')); }
}

/* ---------- gh-menu-item ----------
   <gh-dropdown>
     <gh-btn>分支 <gh-icon name="triangle-down"></gh-icon></gh-btn>
     <gh-menu-item icon="git-branch" href="#">main</gh-menu-item>
     <gh-menu-item icon="copy" shortcut="Ctrl C" value="copy">复制链接</gh-menu-item>
     <hr>
     <gh-menu-item icon="trash" danger>删除仓库</gh-menu-item>
   </gh-dropdown>
   用属性代替「button/a + gh-icon + gh-menu__hint」三件套；
   内部渲染真实 <a>/<button> 保留语义，宿主用 display:contents 不参与布局。

   active      当前项：灰底胶囊 + 左侧 3px 强调条（aria-current="page"）
   expandable  可展开项：右侧 chevron，点击切换紧邻的 .gh-menu__sub
   open        子菜单展开态（配合 expandable），切换时派发 gh:menu-toggle */
/* 从某个菜单项往上找：每层 .gh-menu__sub 的可展开父项都收回 open */
function collapseMenuSubs(el) {
  let sub = el.parentElement && el.parentElement.closest('.gh-menu__sub');
  while (sub) {
    const owner = sub.previousElementSibling;
    if (owner && owner.matches('gh-menu-item[expandable]') && owner.hasAttribute('open')) {
      owner.removeAttribute('open'); // _sync 会把 aria-expanded 与 sub.hidden 一起更新
      owner.dispatchEvent(new CustomEvent('gh:menu-toggle', {
        bubbles: true,
        detail: { open: false },
      }));
    }
    sub = sub.parentElement && sub.parentElement.closest('.gh-menu__sub');
  }
}

class GHMenuItem extends HTMLElement {
  static get observedAttributes() {
    return ['icon', 'shortcut', 'href', 'danger', 'disabled', 'selected', 'active', 'expandable', 'open'];
  }

  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-menu-item');
      const href = attr(el, 'href');
      const node = document.createElement(href !== null ? 'a' : 'button');
      node.className = 'gh-menu__item';
      if (href !== null) node.setAttribute('href', href);
      else node.type = 'button';
      if (!node.hasAttribute('role')) node.setAttribute('role', 'menuitem');

      // 文案先记下来（后面会混入图标、快捷键文本）
      const text = el.textContent.trim();

      const icon = attr(el, 'icon');
      if (icon) {
        const i = document.createElement('gh-icon');
        i.setAttribute('name', icon);
        node.append(i);
      }
      while (el.firstChild) node.append(el.firstChild);
      const hint = attr(el, 'shortcut');
      if (hint) {
        const s = document.createElement('span');
        s.className = 'gh-menu__hint';
        s.textContent = hint;
        node.append(s);
      }

      // 可展开项：右侧 chevron，子菜单取紧邻的 .gh-menu__sub
      if (has(el, 'expandable')) {
        const next = el.nextElementSibling;
        el._sub = next && next.classList.contains('gh-menu__sub') ? next : null;
        node.classList.add('gh-menu__item--expandable');
        const chevron = document.createElement('span');
        chevron.className = 'gh-menu__chevron';
        chevron.innerHTML = iconSvg('chevron-down', 16);
        node.append(chevron);
      }

      el.append(node);
      el._node = node;
      el._text = text;
      el._sync();

      node.addEventListener('click', (e) => {
        if (has(el, 'disabled')) { e.preventDefault(); return; }
        if (has(el, 'expandable')) {
          // 展开/收起子菜单，不触发选择
          e.preventDefault();
          el.toggleAttribute('open');
          el.dispatchEvent(new CustomEvent('gh:menu-toggle', {
            bubbles: true,
            detail: { open: has(el, 'open') },
          }));
          return;
        }
        el.dispatchEvent(new CustomEvent('gh:select', {
          bubbles: true,
          detail: { value: attr(el, 'value', el._text) },
        }));
        // 选中子项后把各级可展开项一并收起（菜单里选完就收，避免菜单一直挂着）
        collapseMenuSubs(el);
      });
    });
  }

  attributeChangedCallback() { if (this._ghDone) this._sync(); }

  _sync() {
    const node = this._node;
    if (!node) return;
    node.classList.toggle('gh-menu__item--danger', has(this, 'danger'));
    if (has(this, 'disabled')) {
      node.setAttribute('disabled', '');
      node.setAttribute('aria-disabled', 'true');
    } else {
      node.removeAttribute('disabled');
      node.removeAttribute('aria-disabled');
    }
    if (has(this, 'selected')) node.setAttribute('aria-checked', 'true');
    else node.removeAttribute('aria-checked');

    // 当前项：aria-current + 渲染类由行状态helper 统一写（CSS 按 aria-current 出灰底 + 强调条）
    const active = has(this, 'active');
    setCurrent(node, active, { exclusive: false });
    node.classList.toggle('gh-menu__item--active', active);

    // 可展开项：aria-expanded 与子菜单显隐
    if (has(this, 'expandable')) {
      const open = has(this, 'open');
      node.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (this._sub) this._sub.hidden = !open;
    }
  }

  get value() { return attr(this, 'value', this._text || this.textContent.trim()); }
}

/* ---------- gh-timeline ----------
   <gh-timeline>                      普通时间线：28px 图标圆圈
     <gh-timeline-item icon="git-commit" variant="success">内容</gh-timeline-item>
   </gh-timeline>

   <gh-timeline compact>              紧凑时间线：10px 圆点，适合更新日志/动态列表
     <gh-timeline-item time="11 hours ago">标题</gh-timeline-item>
     <gh-timeline-item dot="none"><a href="#">View changelog</a></gh-timeline-item>
   </gh-timeline>

   富内容 / 评论卡片：
     <gh-timeline>
       <gh-timeline-item card avatar="avatar.svg" author="crodas">
         <span slot="header"><strong>crodas</strong> opened <time>1m ago</time></span>
         <gh-label slot="header-actions" color="#8250df">Collaborator</gh-label>
         <gh-md>正文支持 **Markdown**、`行内代码`、列表……</gh-md>
         <gh-box slot="footer" plain title="Add artifact">…</gh-box>
       </gh-timeline-item>
     </gh-timeline>

   插槽：
     slot="marker"          替换左侧图标（任意节点）
     slot="header"          标题行左侧（作者 / 动作 / 时间）
     slot="header-actions"  标题行右侧（徽章 / 菜单按钮）
     slot="footer"          卡片底部操作区（card 模式下位于卡片内）
   属性：icon / variant / time / dot="none" / avatar（头像 URL）/ author（无头像时的首字母）*/ 
class GHTimeline extends HTMLElement {
  static get observedAttributes() { return ['compact']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-timeline');
      if (!el.hasAttribute('role')) el.setAttribute('role', 'list');
      el._sync();
    });
  }
  attributeChangedCallback() { if (this._ghDone) this._sync(); }
  _sync() { this.classList.toggle('gh-timeline--compact', has(this, 'compact')); }
}

const TIMELINE_VARIANTS = ['success', 'danger', 'accent', 'muted'];

class GHTimelineItem extends HTMLElement {
  static get observedAttributes() { return ['time', 'dot', 'icon', 'variant', 'avatar', 'author', 'card', 'bare', 'header-box']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-timeline__item');
      if (!el.hasAttribute('role')) el.setAttribute('role', 'listitem');

      const marker = document.createElement('div');
      marker.className = 'gh-timeline__marker';
      const markerInner = document.createElement('span');
      markerInner.className = 'gh-timeline__marker-inner';
      marker.append(markerInner);
      el._marker = marker;
      el._markerInner = markerInner;

      const body = document.createElement('div');
      body.className = 'gh-timeline__body';
      const time = document.createElement('time');
      time.className = 'gh-timeline__time';

      const header = document.createElement('div');
      header.className = 'gh-timeline__header';
      const headerMain = document.createElement('div');
      headerMain.className = 'gh-timeline__header-main';
      const headerEnd = document.createElement('div');
      headerEnd.className = 'gh-timeline__header-end';
      header.append(headerMain, headerEnd);

      const footer = document.createElement('div');
      footer.className = 'gh-timeline__footer';

      // 具名插槽分类：marker / header / header-actions / footer，其余进正文
      const slots = { marker: [], header: [], 'header-actions': [], footer: [] };
      const rest = [];
      [...el.childNodes].forEach((node) => {
        const name = node.nodeType === 1 ? node.getAttribute('slot') : null;
        if (name && slots[name]) {
          node.removeAttribute('slot');
          slots[name].push(node);
        } else {
          rest.push(node);
        }
      });
      markerInner.append(...slots.marker);
      headerMain.append(...slots.header);
      headerEnd.append(...slots['header-actions']);
      footer.append(...slots.footer);
      const hasHeader = slots.header.length > 0 || slots['header-actions'].length > 0;
      const hasFooter = slots.footer.length > 0;
      header.hidden = !hasHeader;
      footer.hidden = !hasFooter;
      el._hasHeader = hasHeader;

      const content = document.createElement('div');
      content.className = 'gh-timeline__content';
      content.append(...rest);
      el._content = content;

      // 卡片外壳：非 card 模式下不画边框（见 CSS），这样才能同时容纳纯文本条目
      const card = document.createElement('div');
      card.className = 'gh-timeline__card';
      card.append(header, content, footer);
      el._card = card;

      body.append(time, card);
      el._time = time;
      el._header = header;
      el._footer = footer;
      el._customMarker = slots.marker.length > 0;

      el.textContent = '';
      el.append(marker, body);
      el._sync();
    });
  }
  attributeChangedCallback() { if (this._ghDone) this._sync(); }

  _sync() {
    // time 属性 → 顶部的时间行；没有就整行不占位
    const time = attr(this, 'time');
    if (this._time) {
      this._time.textContent = time || '';
      this._time.hidden = !time;
    }
    // dot="none"：保留标记列宽度但不画圆点（列表末尾的“查看全部”）
    const none = attr(this, 'dot') === 'none';
    this.classList.toggle('gh-timeline__item--nodot', none);
    this.classList.toggle('gh-timeline__item--card', has(this, 'card'));
    // bare：标记只留图标，不画圆圈（提交 / 审查这类轻量行）
    this.classList.toggle('gh-timeline__item--bare', has(this, 'bare'));
    // header-box：标题行套一层虚线框（提交摘要）
    this.classList.toggle('gh-timeline__item--boxed', has(this, 'header-box'));

    // 变体类：同步切换，避免旧变体残留
    TIMELINE_VARIANTS.forEach((name) => {
      this.classList.toggle('gh-timeline__item--' + name, attr(this, 'variant') === name);
    });

    // 左侧标记：自定义插槽 > 头像 > 图标
    if (this._customMarker) {
      this._marker.classList.add('gh-timeline__marker--custom');
      return;
    }
    const avatar = attr(this, 'avatar');
    if (avatar) {
      const img = document.createElement('img');
      img.className = 'gh-timeline__avatar';
      img.src = avatar;
      img.alt = attr(this, 'author', '');
      img.loading = 'lazy';
      img.decoding = 'async';
      this._markerInner.textContent = '';
      this._markerInner.append(img);
      this._marker.classList.add('gh-timeline__marker--avatar');
      this.classList.add('gh-timeline__item--avatar');
    } else {
      this._markerInner.innerHTML = iconSvg(attr(this, 'icon', 'dot-fill'), 14);
      this._marker.classList.remove('gh-timeline__marker--avatar');
      this.classList.remove('gh-timeline__item--avatar');
    }
  }
}

/* ---------- gh-reactions ----------
   表情反应条（评论卡片底部）：
     <gh-reactions>
       <gh-reaction emoji="👍" count="1"></gh-reaction>
       <gh-reaction emoji="🎉" count="2" active></gh-reaction>
     </gh-reactions>
   点一下自己加/取消反应，count 自动 ±1，派发 gh:reaction（detail: emoji / active / count）；
   末尾的「添加反应」按钮派发 gh:reaction-add；no-add 可隐藏该按钮。 */
class GHReaction extends HTMLElement {
  static get observedAttributes() { return ['emoji', 'count', 'active']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-reaction');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gh-reaction__btn';
      const emoji = document.createElement('span');
      emoji.className = 'gh-reaction__emoji';
      const count = document.createElement('span');
      count.className = 'gh-reaction__count';
      btn.append(emoji, count);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = !has(el, 'active');
        const now = el.count + (next ? 1 : -1);
        el.setAttribute('count', String(Math.max(0, now)));
        el.toggleAttribute('active', next);
        el.dispatchEvent(new CustomEvent('gh:reaction', {
          bubbles: true,
          detail: { emoji: attr(el, 'emoji', ''), active: next, count: Math.max(0, now) },
        }));
      });
      el.textContent = '';
      el.append(btn);
      el._btn = btn;
      el._emoji = emoji;
      el._count = count;
      el._sync();
    });
  }
  attributeChangedCallback() { if (this._ghDone) this._sync(); }
  _sync() {
    const emoji = attr(this, 'emoji', '');
    const count = this.count;
    const active = has(this, 'active');
    this._emoji.textContent = emoji;
    this._count.textContent = count > 0 ? String(count) : '';
    this._count.hidden = count <= 0;
    this.classList.toggle('is-active', active);
    this._btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    this._btn.setAttribute('aria-label', emoji + (count > 0 ? ' ' + count : ''));
  }
  get active() { return has(this, 'active'); }
  get count() { return parseInt(attr(this, 'count', '0'), 10) || 0; }
}

class GHReactions extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-reactions');
      if (!el.hasAttribute('role')) el.setAttribute('role', 'group');
      if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', t('reactions'));
      if (has(el, 'no-add')) return;
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'gh-reactions__add';
      add.setAttribute('aria-label', t('addReaction'));
      add.title = t('addReaction');
      add.innerHTML = iconSvg('smiley', 16);
      add.addEventListener('click', (e) => {
        e.stopPropagation();
        el.dispatchEvent(new CustomEvent('gh:reaction-add', { bubbles: true }));
      });
      el.append(add);
    });
  }
}

/* ---------- gh-file-list ----------
   折叠的文件行列表（审查 / 变更文件）：
     <gh-file-list>
       <gh-file-row path=".github/workflows/ci.yml" state="resolved"></gh-file-row>
       <gh-file-row path="src/index.js" state="modified" open>diff…</gh-file-row>
     </gh-file-list>
   行内子节点是展开后的内容；state 走内置文案（resolved / added / removed / modified / renamed），
   也可用 state-label 自定义；点击行头切换 open 并派发 gh:file-toggle（detail: open / path）。 */
const FILE_STATES = ['resolved', 'added', 'removed', 'modified', 'renamed'];

class GHFileRow extends HTMLElement {
  static get observedAttributes() { return ['path', 'state', 'state-label', 'open']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-file-row');
      if (!el.hasAttribute('role')) el.setAttribute('role', 'listitem');

      const header = document.createElement('button');
      header.type = 'button';
      header.className = 'gh-file-row__header';
      const chevron = document.createElement('span');
      chevron.className = 'gh-file-row__chevron';
      chevron.innerHTML = iconSvg('chevron-right', 16);
      const path = document.createElement('span');
      path.className = 'gh-file-row__path';
      const state = document.createElement('span');
      state.className = 'gh-file-row__state';
      header.append(chevron, path, state);
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        const next = !has(el, 'open');
        el.toggleAttribute('open', next);
        el.dispatchEvent(new CustomEvent('gh:file-toggle', {
          bubbles: true,
          detail: { open: next, path: attr(el, 'path', '') },
        }));
      });

      const body = document.createElement('div');
      body.className = 'gh-file-row__body';
      const rest = [...el.childNodes];
      body.append(...rest);

      el.textContent = '';
      el.append(header, body);
      el._header = header;
      el._path = path;
      el._state = state;
      el._body = body;
      el._sync();
    });
  }
  attributeChangedCallback() { if (this._ghDone) this._sync(); }
  _sync() {
    const open = has(this, 'open');
    const state = attr(this, 'state', '');
    const label = attr(this, 'state-label') || (state ? t(state) : '');
    this._path.textContent = attr(this, 'path', '');
    this._state.textContent = label;
    this._state.hidden = !label;
    this._body.hidden = !open;
    this._header.setAttribute('aria-expanded', open ? 'true' : 'false');
    this.classList.toggle('is-open', open);
    FILE_STATES.forEach((name) => this.classList.toggle('is-' + name, state === name));
  }
}

class GHFileList extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-file-list');
      if (!el.hasAttribute('role')) el.setAttribute('role', 'list');
    });
  }
}

define('gh-tabs', GHTabs);
define('gh-tab-panel', GHTabPanel);
define('gh-dialog', GHDialog);
define('gh-dropdown', GHDropdown);
define('gh-menu', GHMenu);
define('gh-menu-item', GHMenuItem);
define('gh-timeline', GHTimeline);
define('gh-timeline-item', GHTimelineItem);
define('gh-reactions', GHReactions);
define('gh-reaction', GHReaction);
define('gh-file-list', GHFileList);
define('gh-file-row', GHFileRow);