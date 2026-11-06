// overlay.js — 浮层组件：gh-tooltip / gh-popover / gh-drawer
// 定位、滚动锁、焦点陷阱、开合栈全部复用 core/overlay.js（即 core/popup.js）
import { define, once, has, attr, t, uid } from '../core.js';
import { setCurrent } from '../core/state.js';
import { positionPopup, parsePlacement, lockScroll, unlockScroll, trapFocus,
  nextOverlayZ, createPopup } from '../core/overlay.js';
import { iconSvg } from '../icons.js';

/* ---------- gh-tooltip ----------
   <gh-tooltip text="刷新" placement="top"><gh-btn size="icon">…</gh-btn></gh-tooltip> */
class GHTooltip extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      const text = attr(el, 'text', '');
      if (!text) return;
      el.classList.add('gh-tooltip-anchor');
      const tip = document.createElement('div');
      tip.className = 'gh-tooltip';
      tip.id = uid('gh-tip');
      tip.setAttribute('role', 'tooltip');
      tip.textContent = text;
      document.body.append(tip);
      el.setAttribute('aria-describedby', tip.id);

      const place = () => {
        const { side } = parsePlacement(attr(el, 'placement', 'top'), 'top');
        positionPopup(el, tip, { side, align: 'center', offset: 6 });
      };
      const show = () => { tip.classList.add('is-visible'); place(); };
      const hide = () => tip.classList.remove('is-visible');
      el.addEventListener('mouseenter', show);
      el.addEventListener('mouseleave', hide);
      el.addEventListener('focusin', show);
      el.addEventListener('focusout', hide);
      window.addEventListener('scroll', () => { if (tip.classList.contains('is-visible')) place(); }, true);
      window.addEventListener('resize', () => { if (tip.classList.contains('is-visible')) place(); });
      el._tip = tip;
    });
  }
  disconnectedCallback() {
    // 宿主可能只是被移到别处（例如设置行重排子节点），等下一轮任务再确认是否真的离开文档
    clearTimeout(this._destroyTimer);
    this._destroyTimer = setTimeout(() => {
      this._destroyTimer = 0;
      if (!this.isConnected && this._tip) this._tip.remove();
    }, 0);
  }
}

/* ---------- gh-popover-item ----------
   弹层里的一行可勾选项：标题 + 可选说明，整行都可点。
   <gh-popover-item title="开发重点" hint="优先开发项目" checked value="dev"></gh-popover-item>
   也可以把标题写在标签里：<gh-popover-item checked>🚀 My stack</gh-popover-item>
   选中时派发 gh:popover-item-change（detail: { checked, value }） */
class GHPopoverItem extends HTMLElement {
  static get observedAttributes() { return ['title', 'hint', 'value', 'checked', 'disabled', 'active']; }

  connectedCallback() {
    once(this, (el) => {
      const row = document.createElement('label');
      row.className = 'gh-popover__item';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'gh-check__input';

      const box = document.createElement('span');
      box.className = 'gh-check__box';
      const mark = document.createElement('span');
      mark.className = 'gh-check__mark';
      mark.innerHTML = iconSvg('check', 12);
      box.append(mark);

      const text = document.createElement('span');
      text.className = 'gh-popover__text';
      const title = document.createElement('span');
      title.className = 'gh-popover__item-title';
      const hint = document.createElement('span');
      hint.className = 'gh-popover__item-hint';
      text.append(title, hint);

      row.append(input, box, text);

      // 标签里的文字当标题兜底，搬完就清空宿主
      el._row = row;
      el._input = input;
      el._title = title;
      el._hint = hint;
      el._text = el.textContent.trim();
      el.textContent = '';
      el.append(row);

      input.addEventListener('change', () => {
        el.toggleAttribute('checked', input.checked);
        el.dispatchEvent(new CustomEvent('gh:popover-item-change', {
          bubbles: true,
          detail: { checked: input.checked, value: attr(el, 'value', title.textContent) },
        }));
      });

      el._sync();
    });
    this._sync();
  }

  attributeChangedCallback(_name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this._sync();
  }

  _sync() {
    const el = this;
    if (!el._input) return;
    const title = attr(el, 'title') || el._text || '';
    const hint = attr(el, 'hint');
    el._title.textContent = title;
    el._hint.textContent = hint;
    el._hint.hidden = !hint;
    el._input.checked = has(el, 'checked');
    el._input.disabled = has(el, 'disabled');
    el.classList.toggle('is-disabled', el._input.disabled);
    // 搜索框按这串文本过滤
    el._row.dataset.search = (title + ' ' + (hint || '')).trim().toLowerCase();
    // 当前项：同样只写 aria-current + 渲染类，外观交给 --gh-row-* 令牌
    setCurrent(el._row, has(el, 'active'), { exclusive: false });
  }

  get checked() { return this.hasAttribute('checked'); }
  set checked(value) { this.toggleAttribute('checked', !!value); }
  get value() { return attr(this, 'value', this._title ? this._title.textContent : ''); }
}

/* ---------- gh-popover ----------
   <gh-popover placement="bottom-end">
     <gh-btn slot="trigger">筛选</gh-btn>
     <div>任意内容</div>
   </gh-popover>

   带标题 / 搜索 / 勾选列表 / 底栏的形态（GitHub 的 Lists 弹层）：
   <gh-popover title="Lists" description="Add this repository to one or more lists"
               search search-placeholder="Filter lists" width="340px">
     <gh-btn slot="trigger">Add to list</gh-btn>
     <gh-popover-item title="开发重点" hint="优先开发项目" checked></gh-popover-item>
     <gh-popover-item>🚀 My stack</gh-popover-item>
     <gh-btn slot="footer" data-gh-close>Create list</gh-btn>
   </gh-popover> */
class GHPopover extends HTMLElement {
  // open 属性 = 声明式开合（和 gh-dialog / gh-drawer 一致）；面板自己开合时也会回写这个属性
  static get observedAttributes() { return ['title', 'description', 'search', 'search-placeholder', 'empty-text', 'open']; }

  connectedCallback() {
    // 被重新插入（例如设置行把控件节点搬到右侧）时，取消上一次离开文档的销毁
    clearTimeout(this._destroyTimer);
    this._destroyTimer = 0;
    once(this, (el) => {
      const trigger = el.querySelector('[slot="trigger"]');
      if (!trigger) return;
      trigger.removeAttribute('slot');
      const content = document.createElement('div');
      content.className = 'gh-popover';
      // flush：去掉内边距，交给内部内容自己排版（配合 gh-option-list 用）
      if (has(el, 'flush')) content.classList.add('gh-popover--flush');
      const w = attr(el, 'width');
      if (w) content.style.setProperty('--gh-popover-width', /^\d+$/.test(w) ? w + 'px' : w);

      // 面板固定四段：header → search → body（其余节点）→ footer（slot="footer"）
      const header = document.createElement('div');
      header.className = 'gh-popover__header';
      const titleEl = document.createElement('div');
      titleEl.className = 'gh-popover__title';
      const descEl = document.createElement('div');
      descEl.className = 'gh-popover__desc';
      header.append(titleEl, descEl);

      const search = document.createElement('div');
      search.className = 'gh-popover__search';
      const searchIcon = document.createElement('span');
      searchIcon.className = 'gh-popover__search-icon';
      searchIcon.innerHTML = iconSvg('search', 16);
      const searchInput = document.createElement('input');
      searchInput.type = 'text';
      searchInput.className = 'gh-popover__search-input';
      search.append(searchIcon, searchInput);

      const body = document.createElement('div');
      body.className = 'gh-popover__body';

      const empty = document.createElement('div');
      empty.className = 'gh-popover__empty';
      empty.hidden = true;

      const footer = document.createElement('div');
      footer.className = 'gh-popover__footer';

      [...el.childNodes].forEach((node) => {
        if (node === trigger) return;
        if (node.nodeType === 1 && node.getAttribute('slot') === 'footer') {
          node.removeAttribute('slot');
          footer.append(node);
          return;
        }
        body.append(node);
      });
      body.append(empty);
      content.append(header, search, body, footer);
      document.body.append(content);

      // 搜索：按行元素的 data-search 过滤，全部被过滤掉时显示空状态
      const filter = () => {
        const q = searchInput.value.trim().toLowerCase();
        const rows = [...content.querySelectorAll('.gh-popover__item')];
        let shown = 0;
        rows.forEach((row) => {
          const hit = !q || (row.dataset.search || row.textContent || '').toLowerCase().includes(q);
          row.hidden = !hit;
          if (hit) shown += 1;
        });
        empty.textContent = attr(el, 'empty-text', 'No results');
        empty.hidden = !(q && shown === 0);
      };
      searchInput.addEventListener('input', filter);

      // 标题 / 说明 / 搜索 / 底栏按属性与插槽决定是否出现
      const chrome = () => {
        const title = attr(el, 'title');
        const desc = attr(el, 'description');
        titleEl.textContent = title;
        titleEl.hidden = !title;
        descEl.textContent = desc;
        descEl.hidden = !desc;
        header.hidden = !title && !desc;
        search.hidden = !has(el, 'search');
        searchInput.placeholder = attr(el, 'search-placeholder', 'Filter…');
        searchInput.setAttribute('aria-label', attr(el, 'search-label', title || 'Filter'));
        footer.hidden = footer.childElementCount === 0;
        content.classList.toggle(
          'gh-popover--framed',
          !header.hidden || !search.hidden || !footer.hidden,
        );
        if (!search.hidden) filter();
      };
      el._chrome = chrome;
      el._filter = filter;
      chrome();

      // 开合 / 外部点击 / Esc 分层 / 滚动重定位全交给公共内核
      const popup = createPopup({
        panel: content,
        anchor: trigger,
        placement: attr(el, 'placement', 'bottom-start'),
        offset: 6,
        haspopup: 'true',
        onOpen: () => {
          chrome();
          el.setAttribute('open', '');
          el.dispatchEvent(new CustomEvent('gh:open', { bubbles: true }));
          // 带搜索框的弹层，打开就把焦点放进搜索框（GitHub 的行为）
          if (has(el, 'search')) requestAnimationFrame(() => searchInput.focus());
        },
        onClose: () => {
          el.removeAttribute('open');
          el.dispatchEvent(new CustomEvent('gh:close', { bubbles: true }));
        },
      });

      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-expanded', 'false');
      trigger.addEventListener('click', (e) => { e.stopPropagation(); popup.toggle(); });
      // 点击面板内部不冒泡到页面，避免外层把面板当成"外部点击"（部分宿主靠 click 关闭菜单）
      content.addEventListener('click', (e) => {
        e.stopPropagation();
        // 面板里的操作按钮带 data-popover-close 时顺手收掉弹层（例如底栏的「Create list」）
        const closer = e.target.closest && e.target.closest('[data-popover-close]');
        if (closer) popup.close('action');
      });
      // 纯菜单（listbox）里按 Tab：收起并把焦点还给触发器。
      // 否则焦点会落到 body 上的浮层里，外层对话框的焦点陷阱就管不到了
      content.addEventListener('keydown', (e) => {
        if (e.key !== 'Tab' || !content.querySelector('[role="listbox"]')) return;
        e.preventDefault();
        popup.close('tab');
        trigger.focus();
      });
      el._popup = popup;
      el._setOpen = (v) => (v ? popup.open() : popup.close());
      el._content = content;
      el._searchInput = searchInput;
    });
    this._syncChrome();
    // 初始就带 open 的弹层，升级完成后直接展开（声明式用法）
    if (this.hasAttribute('open')) this.open();
  }
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (name === 'open') {
      // 属性 → 面板；面板自己开合时由 onOpen/onClose 回写属性，两边最终一致
      const want = newValue !== null;
      const isOpen = !!(this._popup && this._popup.isOpen);
      if (want && !isOpen) this._setOpen && this._setOpen(true);
      else if (!want && isOpen) this._setOpen && this._setOpen(false);
      return;
    }
    this._syncChrome();
  }
  _syncChrome() { if (this._chrome) this._chrome(); }
  disconnectedCallback() {
    // 内部重排（例如把控件节点搬进容器）会触发一次断开再重连，先延迟销毁，重连时取消
    clearTimeout(this._destroyTimer);
    this._destroyTimer = setTimeout(() => {
      this._destroyTimer = 0;
      if (this.isConnected) return;
      if (this._popup) this._popup.destroy();
      else if (this._content) this._content.remove();
    }, 0);
  }
  // 开合统一走 open 属性：这里只改属性，真正的面板动作在 attributeChangedCallback 里
  open() { if (!this.hasAttribute('open')) this.setAttribute('open', ''); else this._setOpen && this._setOpen(true); }
  close() { if (this.hasAttribute('open')) this.removeAttribute('open'); else this._setOpen && this._setOpen(false); }
  toggle(force) {
    const want = force === undefined ? !this.isOpen : !!force;
    if (want) this.open(); else this.close();
    return want;
  }
  get isOpen() { return !!(this._popup && this._popup.isOpen); }
  // 手动重新过滤（例如 JS 改了行内容）
  filter() { if (this._filter) this._filter(); }

  // 弹层内容为了 fixed 定位被挂到了 <body>（避免被 overflow/transform 祖先裁切），
  // 所以宿主里 querySelector 找不到它。用 content 拿到真实面板元素：
  //   const panel = popover.content;   // → .gh-popover 元素
  //   panel.querySelector('gh-select') // → 面板里的控件
  get content() { return this._content || null; }
}
/* ---------- gh-drawer ----------
   <gh-drawer title="筛选" side="right" width="360px">
     内容
     <div slot="footer">…</div>
   </gh-drawer>

   导航抽屉：variant="nav" 去掉内容内边距、隐藏标题栏分隔线，body 直接放 gh-nav-item
   <gh-drawer variant="nav" side="left" width="320px" label="主导航">
     <gh-icon slot="head" name="mark-github" size="24"></gh-icon>
     <gh-nav-item icon="home" active>Home</gh-nav-item>
   </gh-drawer> */
export class GHDrawer extends HTMLElement {
  static get observedAttributes() { return ['open']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-drawer');
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      if (attr(el, 'side') === 'left') el.classList.add('gh-drawer--left');
      if (attr(el, 'variant') === 'nav') el.classList.add('gh-drawer--nav');
      el.style.setProperty('--gh-drawer-width', attr(el, 'width', '360px'));

      const panel = document.createElement('div');
      panel.className = 'gh-drawer__panel';
      const header = document.createElement('div');
      header.className = 'gh-drawer__header';

      // slot="head" 放 logo 之类的自定义头部内容，位置在标题左侧
      const head = document.createElement('div');
      head.className = 'gh-drawer__head';

      const title = document.createElement('div');
      title.className = 'gh-drawer__title';
      title.textContent = attr(el, 'title', '');
      if (title.textContent) {
        el.setAttribute('aria-label', title.textContent);
        el.removeAttribute('title');
      } else if (attr(el, 'label')) {
        el.setAttribute('aria-label', attr(el, 'label'));
      }

      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'gh-dialog__close';
      close.setAttribute('aria-label', t('close'));
      close.innerHTML = iconSvg('x', 16);
      close.addEventListener('click', () => el.close());
      header.append(head, title, close);

      const body = document.createElement('div');
      body.className = 'gh-drawer__body';
      const foot = document.createElement('div');
      foot.className = 'gh-drawer__foot';
      [...el.childNodes].forEach((node) => {
        const slot = node.nodeType === 1 ? node.getAttribute('slot') : null;
        if (slot === 'footer') {
          foot.append(node);
        } else if (slot === 'head') {
          node.removeAttribute('slot');
          head.append(node);
        } else {
          body.append(node);
        }
      });

      panel.append(header, body);
      if (foot.hasChildNodes()) panel.append(foot);
      el.append(panel);

      el.addEventListener('click', (e) => { if (e.target === el) el.close(); });
      el.addEventListener('keydown', trapFocus(el));
      if (!GHDrawer._escBound) {
        GHDrawer._escBound = true;
        document.addEventListener('keydown', (e) => {
          if (e.key !== 'Escape' || e._ghMenuHandled) return;
          // 抽屉里的菜单开着时，Esc 先关菜单
          if (document.querySelector('.gh-popover.is-open, .gh-select.is-open, .gh-combobox.is-open, gh-dropdown details[open]')) return;
          // 按实际层级关最上面那层（DOM 顺序不一定等于层叠顺序）
          const open = [...document.querySelectorAll('gh-drawer[open]')]
            .sort((a, b) => (+a.style.zIndex || 0) - (+b.style.zIndex || 0));
          if (open.length) open[open.length - 1].close();
        });
      }
    });
  }
  attributeChangedCallback(_n, oldV, newV) {
    if (oldV === newV) return;
    if (newV !== null) {
      // 后打开的抽屉压在上面：不然「抽屉里开对话框」会被抽屉挡住
      this.style.zIndex = nextOverlayZ();
      lockScroll();
      this.dispatchEvent(new CustomEvent('gh:open', { bubbles: true }));
      setTimeout(() => {
        const panel = this.querySelector('.gh-drawer__panel');
        if (panel) { panel.setAttribute('tabindex', '-1'); panel.focus(); }
      }, 30);
    } else {
      unlockScroll();
      // 浮层内容挂在 body 上，不主动收掉会在关闭后残留成孤儿菜单
      this.querySelectorAll('gh-select, gh-combobox, gh-select-menu, gh-popover').forEach((c) => c.close && c.close());
      this.querySelectorAll('details[open]').forEach((d) => { d.open = false; });
      this.dispatchEvent(new CustomEvent('gh:close', { bubbles: true }));
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
}

define('gh-tooltip', GHTooltip);
define('gh-popover', GHPopover);
define('gh-popover-item', GHPopoverItem);
define('gh-drawer', GHDrawer);
