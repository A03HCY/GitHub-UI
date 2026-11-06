// overlay.js — 浮层公共能力：滚动锁、焦点陷阱、层叠；定位与开合见 popup.js
//
// positionPopup / parsePlacement / closeOpenMenus 仍然从这里导出，
// 只是实现搬到了 popup.js（gh-popover、gh-dropdown、gh-select 等共用一个开合栈）。

let locks = 0;
let prevPadding = '';

export function lockScroll() {
  if (locks++ > 0) return;
  const sw = window.innerWidth - document.documentElement.clientWidth;
  prevPadding = document.body.style.paddingRight;
  if (sw > 0) document.body.style.paddingRight = sw + 'px';
  document.body.classList.add('gh-scroll-locked');
}

export function unlockScroll() {
  if (--locks > 0) return;
  locks = Math.max(locks, 0);
  document.body.classList.remove('gh-scroll-locked');
  document.body.style.paddingRight = prevPadding;
}

// 返回一个 keydown 处理器：Tab / Shift+Tab 在容器内循环
export function trapFocus(container) {
  return (e) => {
    if (e.key !== 'Tab') return;
    const list = [...container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((n) => !n.disabled && n.offsetParent !== null);
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
}

// 弹窗/抽屉的层叠：后打开的压在上面，但上限低于 popover(1150)，避免菜单被盖
let overlayZ = 1000;
export function nextOverlayZ() {
  overlayZ = Math.min(overlayZ + 10, 1090);
  return overlayZ;
}

export { positionPopup, parsePlacement, closeOpenMenus, closeOtherPopups, createPopup } from './popup.js';
