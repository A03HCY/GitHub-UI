// state.js — 行状态（当前项 / 选中 / 键盘游标）的统一入口
//
// 这套组件里「某一项被选中」有三种语义，外观由 CSS 的 --gh-row-* 令牌统一，JS 侧只需要
// 保证 ARIA 与渲染类同步：
//   setCurrent(el)  → aria-current="page" + .is-current（互斥：同一容器里只有一项）
//   setSelected(el) → aria-selected="true" + .is-selected（多选/列表行，可多项）
//   setCursor(el)   → .is-cursor（浮层里 ↑↓ 移动的键盘游标，不写 ARIA）
//
// el 可以是组件宿主（<gh-menu-item> / <gh-nav-item> / <gh-popover-item> / <gh-list-item>），
// 也可以是用户自己拼的任意元素：宿主会改成属性（active / selected）由组件自己同步；
// 普通元素直接写 ARIA 与渲染类，并自动带上 .gh-row（行状态的样式钩子）。

const CURRENT_ATTR = 'aria-current';
const SELECTED_ATTR = 'aria-selected';

// 组件宿主 → 内部真正的行节点
const ROW_IN_TAG = {
  'gh-menu-item': '.gh-menu__item',
  'gh-popover-item': '.gh-popover__item',
  'gh-autocomplete-item': '.gh-autocomplete__item',
};

const HOST_SELECTOR = 'gh-menu-item, gh-nav-item, gh-popover-item, gh-list-item, gh-option';
const GROUP_SELECTOR = '.gh-menu, .gh-nav, [role="menu"], [role="list"], [role="listbox"], .gh-popover__body, .gh-dropdown__menu';

const emit = (el, type, detail) => {
  el.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
};

const rowClass = (el) => {
  if (el && el.classList) el.classList.add('gh-row');
};

/** el 对应的行节点（宿主取内部行，普通元素返回自身） */
export function rowOf(el) {
  if (!el || el.nodeType !== 1) return null;
  const sel = ROW_IN_TAG[el.localName];
  return sel ? el.querySelector(sel) || el : el;
}

/** 互斥范围：组件类容器，退回到父节点 */
function scopeOf(el) {
  return el.closest(GROUP_SELECTOR) || el.parentElement;
}

/** 容器里已标记为当前项的节点 */
export function currentIn(scope) {
  if (!scope) return [];
  return [...scope.querySelectorAll(`[${CURRENT_ATTR}="page"]`)];
}

/** 静默清掉一个当前项（内部用） */
function clearRow(node) {
  const host = node.closest(HOST_SELECTOR);
  if (host && host !== node && host.hasAttribute('active')) host.removeAttribute('active');
  node.removeAttribute(CURRENT_ATTR);
  node.classList.remove('is-current', 'is-active');
  emit(node, 'gh:current-change', { current: false, el: node });
}

/**
 * 标记当前项。默认在同一组里互斥（一个 .gh-menu / 列表里只留一个）。
 * @param {Element} el 组件宿主或任意行元素
 * @param {boolean} on
 * @param {{exclusive?: boolean, group?: Element}} [opts]
 */
export function setCurrent(el, on = true, opts = {}) {
  if (!el || el.nodeType !== 1) return null;
  const { exclusive = true, group } = opts;
  const row = rowOf(el);

  if (on && exclusive) {
    const scope = group || scopeOf(el);
    if (scope) {
      for (const other of currentIn(scope)) {
        if (other === row || row.contains(other) || other.contains(row)) continue;
        clearRow(other);
      }
    }
  }

  // 组件宿主：写 active 属性，让组件自己的 _sync 统一同步 ARIA / 渲染类 / 子菜单
  const host = el !== row && el.localName in ROW_IN_TAG ? el : null;
  if (host && host.hasAttribute('active') !== !!on) {
    host.toggleAttribute('active', !!on);
    return host;
  }

  rowClass(row);
  if (on) {
    row.setAttribute(CURRENT_ATTR, 'page');
    row.classList.add('is-current');
  } else {
    row.removeAttribute(CURRENT_ATTR);
    row.classList.remove('is-current', 'is-active');
  }
  emit(row, 'gh:current-change', { current: !!on, el: row });
  return row;
}

/** 标记选中行（可多选，只在元素自身上写状态） */
export function setSelected(el, on = true) {
  if (!el || el.nodeType !== 1) return null;
  // 组件宿主（gh-list-item）没有 attributeChangedCallback，属性与渲染类一起写
  if (el.localName === 'gh-list-item' && el.hasAttribute('selected') !== !!on) {
    el.toggleAttribute('selected', !!on);
  }
  const row = rowOf(el);
  rowClass(row);
  if (on) {
    row.setAttribute(SELECTED_ATTR, 'true');
    row.classList.add('is-selected');
  } else {
    row.removeAttribute(SELECTED_ATTR);
    row.classList.remove('is-selected');
  }
  emit(row, 'gh:selection-change', { selected: !!on, el: row });
  return row;
}

/** 键盘游标：只影响渲染类，不动 ARIA（ARIA 由 aria-activedescendant 负责） */
export function setCursor(el, on = true) {
  if (!el || el.nodeType !== 1) return null;
  const row = rowOf(el);
  rowClass(row);
  row.classList.toggle('is-cursor', !!on);
  return row;
}

/** 在一组行里移动游标（浮层键盘导航用），返回新游标节点 */
export function moveCursor(scope, step, selector = '.gh-row') {
  if (!scope) return null;
  const rows = [...scope.querySelectorAll(selector)].filter((n) => !n.hasAttribute('disabled') && !n.hidden);
  if (!rows.length) return null;
  const i = rows.findIndex((n) => n.classList.contains('is-cursor'));
  const next = i < 0 ? (step > 0 ? 0 : rows.length - 1) : (i + step + rows.length) % rows.length;
  rows.forEach((n, k) => setCursor(n, k === next));
  return rows[next];
}

/** 读取状态：current / selected / cursor 都是布尔 */
export function rowState(el) {
  const row = rowOf(el);
  if (!row) return { current: false, selected: false, cursor: false };
  return {
    current: row.getAttribute(CURRENT_ATTR) === 'page',
    selected: row.getAttribute(SELECTED_ATTR) === 'true',
    cursor: row.classList.contains('is-cursor'),
  };
}
