// layer.js — 通用自定义浮层：<gh-layer>（声明式）+ GHUI.layer()（编程式）
//
// 内容完全自定义，既能贴元素弹出（下拉 / 选择 / 账户切换），也能按坐标弹出（右键菜单）。
//
// 声明式（点触发器开关）：
//   <gh-btn id="pick">选择仓库</gh-btn>
//   <gh-layer anchor="#pick" placement="bottom-start" width="260" menu close-on-item>
//     <div class="gh-menu">
//       <gh-menu-item icon="repo">gh-ui</gh-menu-item>
//     </div>
//   </gh-layer>
//
// 编程式（可传坐标 / 事件，例如右键）：
//   const layer = GHUI.layer({ anchor: event, menu: true, content: '<div class="gh-menu">…</div>' });
//   layer.close();
//   GHUI.layer({ anchor: el, placement: 'bottom-end', content: '…' }); // 贴元素
//
// 属性：anchor（CSS 选择器）| slot="trigger"（页内触发器）、placement、width、menu、flush、
//       manual（不自动绑点击，只允许 JS open）、contextmenu（触发器改为右键打开）、
//       close-on-item（点内部按钮/菜单项后自动关闭）
// 事件：gh:layer-open / gh:layer-close（在浮层元素上冒泡，detail.layer 为控制器）
// 方法：open(where?) / close() / toggle(where?)；where 可以是 MouseEvent 或 {x,y} 坐标
import { define, once, has, attr } from '../core.js';
import { createPopup, pointOf, elOf } from '../core/popup.js';

function buildPanel(opts) {
  const panel = document.createElement('div');
  panel.className = 'gh-layer';
  if (opts.menu) panel.classList.add('gh-layer--menu');
  if (opts.flush) panel.classList.add('gh-layer--flush');
  if (opts.className) panel.classList.add(...String(opts.className).split(/\s+/).filter(Boolean));
  if (opts.width) panel.style.width = /^\d+$/.test(String(opts.width)) ? `${opts.width}px` : opts.width;
  if (opts.role) panel.setAttribute('role', opts.role);
  const body = document.createElement('div');
  body.className = 'gh-layer__body';
  panel.append(body);
  document.body.append(panel);
  return { panel, body };
}

export function createLayer(options = {}) {
  const opts = {
    placement: 'bottom-start',
    offset: 6,
    closeOnOutside: true,
    closeOnEsc: true,
    closeOnItem: false,
    ...options,
  };
  const { panel, body } = buildPanel(opts);

  const content = opts.content;
  if (typeof content === 'string') body.innerHTML = content;
  else if (content) body.append(content);

  // 当前锚点（元素）或坐标（右键菜单）二选一
  let anchor = pointOf(opts.anchor) ? null : elOf(opts.anchor);
  const initialPoint = pointOf(opts.anchor);

  const notify = (type) => {
    panel.dispatchEvent(new CustomEvent(type, { bubbles: true, detail: { layer: ctl } }));
  };

  const popup = createPopup({
    panel,
    point: initialPoint,
    anchor: () => anchor,
    placement: opts.placement,
    offset: opts.offset,
    haspopup: opts.role === 'menu' ? 'menu' : 'true',
    closeOnOutside: opts.closeOnOutside,
    closeOnEsc: opts.closeOnEsc,
    animate: false,
    onOpen: () => {
      notify('gh:layer-open');
      opts.onOpen && opts.onOpen(ctl);
    },
    onClose: () => {
      notify('gh:layer-close');
      opts.onClose && opts.onClose(ctl);
    },
  });

  // 打开时可换成别的锚点元素或坐标（where 为 MouseEvent / {x,y} 时按坐标弹出）
  const open = (where) => {
    const pt = pointOf(where);
    const el = pt ? null : elOf(where);
    if (pt) {
      anchor = null;
      popup.open(pt);
    } else if (el) {
      anchor = el;
      popup.open();
    } else {
      popup.open(popup.point || undefined);
    }
    return ctl;
  };

  const close = () => { popup.close(); return ctl; };

  if (opts.closeOnItem) {
    panel.addEventListener('click', (e) => {
      if (e.target.closest('button, a, [role="menuitem"], gh-menu-item, [data-layer-close]')) popup.close('item');
    });
  }

  const ctl = {
    el: panel,
    body,
    open,
    close,
    destroy() { popup.destroy(); return ctl; },
    get isOpen() { return popup.isOpen; },
    setContent(html) {
      body.innerHTML = '';
      if (typeof html === 'string') body.innerHTML = html;
      else if (html) body.append(html);
      popup.reposition();
      return ctl;
    },
  };
  return ctl;
}

// 编程式打开：立即显示，返回控制器
export function openLayer(options = {}) {
  const ctl = createLayer(options);
  ctl.open(options.where);
  return ctl;
}

/* ---------- <gh-layer> 声明式 ----------
   内容搬到 body 下的浮层里，host 只保留触发器和属性；
   打开方式：触发器点击（anchor 选择器 / slot="trigger"），或 manual + el.open(event) */
class GHLayer extends HTMLElement {
  connectedCallback() {
    clearTimeout(this._destroyTimer);
    this._destroyTimer = 0;
    once(this, (el) => {
      el.classList.add('gh-layer-host');
      const ctl = createLayer({
        placement: attr(el, 'placement', 'bottom-start'),
        width: attr(el, 'width', ''),
        menu: has(el, 'menu'),
        flush: has(el, 'flush'),
        role: attr(el, 'role', ''),
        closeOnItem: has(el, 'close-on-item'),
        closeOnEsc: attr(el, 'close-on-esc', '') !== 'false',
        onOpen: () => el.setAttribute('open', ''),
        onClose: () => el.removeAttribute('open'),
      });
      // slot="trigger" 留在页面里，其余子节点全部搬进浮层
      const trigger = el.querySelector('[slot="trigger"]');
      [...el.childNodes].forEach((n) => {
        if (n !== trigger) ctl.body.append(n);
      });

      const anchor = trigger || elOf(attr(el, 'anchor', ''));
      el._layer = ctl;
      el._anchor = anchor;
      if (anchor && !has(el, 'manual')) {
        if (has(el, 'contextmenu')) {
          anchor.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            el.open(e);
          });
        } else {
          anchor.addEventListener('click', (e) => {
            e.preventDefault();
            el.toggle();
          });
        }
      }
    });
  }
  get layer() { return this._layer; }
  open(where) {
    if (this._layer) this._layer.open(where || this._anchor);
    return this;
  }
  close() {
    if (this._layer) this._layer.close();
    return this;
  }
  toggle(where) {
    if (!this._layer) return this;
    return this._layer.isOpen ? this.close() : this.open(where);
  }
  disconnectedCallback() {
    // 宿主被搬动（断开后立刻重连）时不销毁，等下一轮任务确认真的离开文档
    clearTimeout(this._destroyTimer);
    this._destroyTimer = setTimeout(() => {
      this._destroyTimer = 0;
      if (this.isConnected) return;
      if (this._layer) this._layer.destroy();
    }, 0);
  }
}

define('gh-layer', GHLayer);
