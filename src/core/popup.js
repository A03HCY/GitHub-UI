// popup.js — 浮层公共内核：定位 + 开合栈
//
// 所有"贴在元素旁边 / 按坐标弹出"的面板都基于它：
//   gh-popover、gh-dropdown、gh-select、gh-combobox、gh-split-button、gh-tag-input、gh-layer
//
// 统一负责：
//   - 定位：positionPopup（bottom-start 等 placement、空间不足翻转、视口夹取）
//   - 同一时刻只留一层：打开新的之前关掉其它的（父层内容里的新浮层除外）
//   - 外部点击关闭（pointerdown 捕获，点面板/锚点内部不关）
//   - Esc 分层关闭（只关最上层；置 e._ghMenuHandled，外层对话框不会再跟着关）
//   - 打开期间 scroll / resize 重新贴住锚点；按坐标弹出的菜单滚动后直接关掉
//   - aria-expanded / aria-haspopup 同步
//
// 用法：
//   const popup = createPopup({
//     panel,                       // 浮层面板元素
//     anchor: () => trigger,       // 锚点（函数，便于动态换锚点）
//     placement: 'bottom-start',
//     offset: 6,
//     onOpen(api) {},
//     onClose(api, reason) {},     // reason: 'outside' | 'esc' | 'toggle' | ...
//   });
//   popup.open(); popup.close(); popup.toggle();

let installed = false;
const stack = []; // 打开中的浮层，后开在末尾（Esc 只关栈顶）

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

// 可用视口 = 扣掉页面滚动条的初始包含块。
// 不能用 innerWidth/innerHeight：它们包含滚动条宽度，靠右的浮层按它夹取就会钻到滚动条下面，
// 滚动条绘制在更上层，右侧内容会被压掉一截。clientWidth/clientHeight 已经排除了滚动条。
const viewportSize = () => {
  const doc = document.documentElement;
  return {
    w: doc.clientWidth || window.innerWidth,
    h: doc.clientHeight || window.innerHeight,
  };
};


/* ---------- 定位 ---------- */

/**
 * 把浮层固定在锚点旁（fixed 定位，不依赖父级 overflow）。
 * side: top | bottom | left | right；align: start | center | end
 */
export function positionPopup(anchor, popup, { side = 'bottom', align = 'start', offset = 6 } = {}) {
  popup.style.position = 'fixed';
  popup.style.right = 'auto';
  popup.style.bottom = 'auto';
  const a = anchor.getBoundingClientRect();
  const p = popup.getBoundingClientRect();
  const vp = viewportSize();

  let top;
  let left;
  if (side === 'bottom' || side === 'top') {
    top = side === 'bottom' ? a.bottom + offset : a.top - offset - p.height;
    left = align === 'end' ? a.right - p.width
      : align === 'center' ? a.left + a.width / 2 - p.width / 2
        : a.left;
    // 空间不足时翻转
    if (side === 'bottom' && top + p.height > vp.h - 8 && a.top - offset - p.height > 8) {
      top = a.top - offset - p.height;
    } else if (side === 'top' && top < 8 && a.bottom + offset + p.height < vp.h - 8) {
      top = a.bottom + offset;
    }
  } else {
    left = side === 'right' ? a.right + offset : a.left - offset - p.width;
    top = a.top + a.height / 2 - p.height / 2;
    if (side === 'right' && left + p.width > vp.w - 8 && a.left - offset - p.width > 8) {
      left = a.left - offset - p.width;
    } else if (side === 'left' && left < 8 && a.right + offset + p.width < vp.w - 8) {
      left = a.right + offset;
    }
  }

  left = Math.min(Math.max(8, left), vp.w - 8 - p.width);
  popup.style.left = Math.round(left) + 'px';

  // 剩余空间放不下时按空间收口并让浮层自己滚动，
  // 而不是把浮层往上顶——顶上去就会盖住触发按钮
  const room = vp.h - top - 8;
  if (p.height > room) {
    popup.style.maxHeight = Math.max(160, room) + 'px';
    popup.style.overflowY = 'auto';
    // 出现纵向滚动条时，overflow-x 会跟着变成 auto；
    // 内容略宽就会多出一条横向滚动条，这里统一收掉
    popup.style.overflowX = 'hidden';
  } else {
    popup.style.maxHeight = '';
    popup.style.overflowY = '';
    popup.style.overflowX = '';
  }
  const height = Math.min(p.height, Math.max(160, room));
  top = Math.min(Math.max(8, top), vp.h - 8 - height);
  popup.style.top = Math.round(top) + 'px';
}

// 把 "bottom-start" 拆成 side / align
export function parsePlacement(value, fallback = 'bottom-start') {
  const [side, align] = String(value || fallback).split('-');
  return { side: side || 'bottom', align: align || 'start' };
}

// 按坐标定位（右键菜单）：右下偏移 2px，贴边时翻到左/上，再夹在视口内
export function placeAtPoint(panel, pt) {
  panel.style.position = 'fixed';
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  panel.style.left = '0px';
  panel.style.top = '0px';
  const box = panel.getBoundingClientRect();
  const vp = viewportSize();
  let left = pt.x + 2;
  let top = pt.y + 2;
  if (left + box.width > vp.w - 8) left = pt.x - box.width - 2;
  if (top + box.height > vp.h - 8) top = pt.y - box.height - 2;
  left = clamp(left, 8, Math.max(8, vp.w - 8 - box.width));
  top = clamp(top, 8, Math.max(8, vp.h - 8 - box.height));
  panel.style.left = Math.round(left) + 'px';
  panel.style.top = Math.round(top) + 'px';
}

/* ---------- 全局监听（模块内只装一次） ---------- */

function install() {
  if (installed) return;
  installed = true;
  document.addEventListener('pointerdown', onDocPointer, true);
  document.addEventListener('keydown', onDocKey, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onScroll, true);
}

function onDocPointer(e) {
  if (!stack.length) return;
  // 点在任意一层内部 → 保持；否则把还能被外部点击关掉的层全关掉
  for (let i = 0; i < stack.length; i += 1) {
    if (stack[i].contains(e.target)) return;
  }
  stack.slice().forEach((p) => { if (p._closeOnOutside) p.close('outside'); });
}

function onDocKey(e) {
  if (e.key !== 'Escape' || !stack.length || e._ghMenuHandled) return;
  const top = stack[stack.length - 1];
  if (!top._closeOnEsc) return;
  // 标记给外层弹窗看：这一下 Esc 归浮层，别再关对话框
  e._ghMenuHandled = true;
  e.preventDefault();
  e.stopPropagation();
  top.close('esc');
}

function onResize() {
  stack.slice().forEach((p) => p.reposition());
}

function onScroll(e) {
  stack.slice().forEach((p) => p.onScroll(e));
}

/* ---------- 互斥 ---------- */

// 关掉除 except 之外的浮层；新浮层嵌在某个已开浮层的内容里时，父层不关。
export function closeOtherPopups(exceptNode, reason = 'other') {
  stack.slice().forEach((p) => {
    if (!exceptNode) { p.close(reason); return; }
    if (p.panel.contains(exceptNode)) return;
    p.close(reason);
  });
}

// 兼容旧名
export const closeOpenMenus = (except, reason = 'other') => closeOtherPopups(except, reason);

/* ---------- 控制器 ---------- */

export function createPopup(options = {}) {
  install();
  const { panel } = options;
  if (!panel) throw new Error('createPopup: panel is required');

  let point = options.point ? { x: Number(options.point.x), y: Number(options.point.y) } : null;
  let open = false;

  const getAnchor = () => {
    const a = typeof options.anchor === 'function' ? options.anchor() : options.anchor;
    return a && a.isConnected ? a : null;
  };

  const api = {
    panel,
    _closeOnOutside: options.closeOnOutside !== false,
    _closeOnEsc: options.closeOnEsc !== false,
    get isOpen() { return open; },
    get anchor() { return getAnchor(); },
    get point() { return point; },

    place() {
      options.beforePlace && options.beforePlace(api);
      if (point) placeAtPoint(panel, point);
      else {
        const a = getAnchor();
        if (!a) return api;
        const { side, align } = parsePlacement(options.placement, 'bottom-start');
        positionPopup(a, panel, { side, align, offset: options.offset == null ? 6 : options.offset });
      }
      options.afterPlace && options.afterPlace(api);
      return api;
    },

    // where: 可选的 MouseEvent / {x,y} 坐标（按坐标弹出时用）；传 null 则按锚点定位
    open(where) {
      const pt = pointOf(where);
      if (pt) point = pt;
      else if (where === undefined || where === null) point = options.point || null;

      if (open) { api.place(); return api; }
      const except = getAnchor();
      closeOtherPopups(except);

      open = true;
      stack.push(api);
      panel.classList.add('is-open');

      // 先关入场动画再测量，否则 translateY 会让定位偏 4px
      if (options.animate === false) panel.style.animation = 'none';
      api.place();
      if (options.animate === false) requestAnimationFrame(() => { panel.style.animation = ''; });

      if (options.aria !== false) {
        const a = getAnchor();
        if (a) {
          a.setAttribute('aria-expanded', 'true');
          if (options.haspopup) a.setAttribute('aria-haspopup', options.haspopup);
        }
      }
      options.onOpen && options.onOpen(api);
      return api;
    },

    close(reason = 'close') {
      if (!open) return api;
      open = false;
      const i = stack.indexOf(api);
      if (i !== -1) stack.splice(i, 1);
      panel.classList.remove('is-open');
      panel.style.animation = '';
      if (options.aria !== false) {
        const a = getAnchor();
        if (a) a.setAttribute('aria-expanded', 'false');
      }
      options.onClose && options.onClose(api, reason);
      return api;
    },

    toggle(where) {
      if (open) api.close('toggle');
      else api.open(where);
      return api;
    },

    contains(node) {
      if (!node) return false;
      if (panel.contains(node)) return true;
      if (options.contains && options.contains(node)) return true;
      const a = getAnchor();
      return !!a && a.contains(node);
    },

    reposition() { if (open) api.place(); },

    onScroll(e) {
      if (!open) return;
      // 按坐标弹出的菜单（右键菜单）滚动后位置就没意义了，直接关掉；
      // 面板自己内部的滚动不算
      if (point) {
        if (!panel.contains(e.target)) api.close('scroll');
        return;
      }
      api.place();
    },

    destroy() {
      api.close('destroy');
      panel.remove();
      return api;
    },
  };

  return api;
}

// MouseEvent / {x,y} → 坐标点
export function pointOf(target) {
  if (!target || typeof target !== 'object') return null;
  if (typeof target.clientX === 'number' && typeof target.clientY === 'number') {
    return { x: target.clientX, y: target.clientY };
  }
  if (typeof target.x === 'number' && typeof target.y === 'number') {
    return { x: target.x, y: target.y };
  }
  return null;
}

export function elOf(target) {
  if (!target) return null;
  return typeof target === 'string' ? document.querySelector(target) : target;
}
