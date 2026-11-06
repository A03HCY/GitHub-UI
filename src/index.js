// index.js — 入口：导入即注册所有组件，并自动注入样式
import './styles/tokens.css';
import './styles/components.css';
import './components/basics.js';
import './components/interactive.js';
import './components/layout.js';
import './components/feedback.js';
import './components/progress.js';
import './components/controls.js';
import './components/code.js';
import './components/skeleton.js';
import './components/pagination.js';
import './components/forms.js';
import './components/files.js';
import './components/picker.js';
import './components/composer.js';
import './components/editor.js';
import './components/rich.js';
import './components/data.js';
import './components/overlay.js';
import './components/layer.js';
import './components/select-menu.js';
import './components/actions.js';
import './components/settings.js';
import './components/sidebar.js';
import './components/autocomplete.js';
import './components/contributions.js';

import { GHToast } from './components/feedback.js';
import { GHDialog } from './components/interactive.js';
import { openLayer } from './components/layer.js';
import { GHMd, md, timeAgo } from './components/rich.js';
import { registerIcon } from './icons.js';
import { STRINGS, VERSION } from './core.js';
import { setCurrent, setSelected, setCursor, moveCursor, rowState, currentIn } from './core/state.js';

// 编程式 API：GHUI.toast(msg, kind) / GHUI.confirm(opts) / GHUI.md(text)
window.GHUI = {
  version: VERSION,
  toast: (msg, kind) => GHToast.show(msg, kind),
  confirm: (opts) => GHDialog.confirm(opts),
  prompt: (opts) => GHDialog.prompt(opts),
  // 自定义浮层：GHUI.layer({ anchor: el | event | {x,y}, content, placement, menu, ... })
  layer: (opts) => openLayer(opts),
  md,
  timeAgo,
  Md: GHMd,
  strings: STRINGS,

  // 行状态（当前项 / 选中 / 键盘游标）：和组件内部的 ARIA 约定完全一致，
  // 自己拼的行也能获得「灰底胶囊 + 左条」的外观。
  //   GHUI.current(el)        当前项，默认在同一父节点里互斥
  //   GHUI.current(el, false) 取消
  //   GHUI.selected(el, true) 选中行（多选/列表，可多项）
  //   GHUI.cursor(el, true)   键盘游标（不写 ARIA）
  current: (el, on = true, opts) => setCurrent(el, on, opts),
  selected: (el, on = true) => setSelected(el, on),
  cursor: (el, on = true) => setCursor(el, on),
  moveCursor: (scope, step, selector) => moveCursor(scope, step, selector),
  rowState,
  currentIn,

  // 主题：'light' | 'dark' | 'auto'（auto 跟随系统）
  setTheme(mode = 'auto') {
    const root = document.documentElement;
    if (mode === 'auto') root.removeAttribute('data-gh-theme');
    else root.setAttribute('data-gh-theme', mode);
    return mode;
  },
  theme() {
    const explicit = document.documentElement.dataset.ghTheme;
    if (explicit) return explicit;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  },

  // 运行时注册图标：GHUI.icon('logo', '<svg …>…</svg>')
  icon: registerIcon,

  // 表单取值（含 gh-input / gh-select / gh-checkbox / gh-radio / gh-switch）
  formValues(form) {
    const out = {};
    new FormData(form).forEach((value, key) => {
      if (key in out) out[key] = [].concat(out[key], value);
      else out[key] = value;
    });
    return out;
  },
};

// 记录脚本自身的 src，用于定位同目录下的 gh-ui.css
const script = document.currentScript;

(function injectCss() {
  if (document.querySelector('link[data-gh-ui]')) return;
  let base = script && script.src;
  if (!base) {
    const found = document.querySelector('script[src*="gh-ui"]');
    base = found && found.src;
  }
  if (!base) {
    console.warn('[gh-ui] 无法定位 gh-ui.css，请手动引入：<link rel="stylesheet" href="gh-ui.css">');
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  // 带版本号：文件名固定时浏览器会缓存旧样式，升级后样式不生效（本地开发时最容易踩）
  link.href = new URL(`gh-ui.css?v=${VERSION}`, base).href;
  link.dataset.ghUi = '';
  document.head.appendChild(link);
})();
