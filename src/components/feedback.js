// feedback.js — 反馈组件：gh-toast / gh-spinner / gh-badge / gh-stat / gh-empty（进度组件见 progress.js）
// 模式参考 TeamFlow static/assets：util.js(toast)、base.css(spinner)、ui.css(stat/progress/badge)、overlay.css(empty)
import { define, once, has, attr, readableText, t } from '../core.js';
import { iconSvg } from '../icons.js';

/* ---------- gh-toast ----------
   编程式：GHToast.show('已保存', 'ok')，kind: ok | err | ''（默认）
   声明式：<gh-toast kind="err">保存失败</gh-toast>（挂载即弹出并自毁） */
export class GHToast extends HTMLElement {
  connectedCallback() {
    if (this._shown) return;
    this._shown = true;
    const msg = this.textContent.trim();
    const kind = attr(this, 'kind', '');
    this.remove();
    GHToast.show(msg, kind);
  }
  static show(message, kind = '') {
    if (!message) return;
    let root = document.getElementById('gh-toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'gh-toast-root';
      root.setAttribute('role', 'status');
      root.setAttribute('aria-live', 'polite');
      document.body.append(root);
    }
    const el = document.createElement('div');
    el.className = 'gh-toast' + (kind ? ' gh-toast--' + kind : '');
    el.textContent = message;
    el.role = 'status';
    el.title = t('clickToDismiss');
    el.addEventListener('click', () => el.remove());
    root.append(el);
    setTimeout(() => {
      el.style.transition = 'opacity .2s';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 220);
    }, 2600);
  }
}

/* ---------- gh-spinner ----------
   <gh-spinner size="14"> */
class GHSpinner extends HTMLElement {
  static get observedAttributes() { return ['size']; }
  connectedCallback() { this._render(); }
  attributeChangedCallback(_n, o, v) { if (o !== v) this._render(); }
  _render() {
    const size = parseInt(attr(this, 'size', '14'), 10) || 14;
    this.innerHTML = `<span class="gh-spinner" style="width:${size}px;height:${size}px"></span>`;
  }
}

/* ---------- gh-badge ----------
   两种模式：
   1. 状态胶囊：<gh-badge state="open" dot>进行中</gh-badge>
   2. 角落徽标：<gh-badge>3</gh-badge> / <gh-badge dot> / <gh-badge color="#1f883d">new</gh-badge>
      放进 gh-avatar / gh-icon，或显式加 overlay，自动吸附到角落
      属性：dot 圆点、color 背景色、max 上限（99+）、position 四角、hide-zero 为 0 时隐藏
*/
function ensurePositioned(el) {
  const parent = el.parentElement;
  if (!parent) return;
  if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
}

class GHBadge extends HTMLElement {
  static get observedAttributes() {
    return ['state', 'dot', 'color', 'max', 'position', 'hide-zero', 'overlay'];
  }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-badge');
      const parentTag = el.parentElement ? el.parentElement.tagName : '';
      // 放进头像/图标，或显式 dot / overlay，都按角落徽标处理
      // dot 在状态胶囊里表示"前面的小圆点"，只有无 state 时才算角落圆点
      el._overlay = has(el, 'overlay') || parentTag === 'GH-AVATAR' || parentTag === 'GH-ICON'
        || (has(el, 'dot') && !has(el, 'state'));
      if (el._overlay) {
        el.classList.add('gh-badge--overlay');
        if (!el.hasAttribute('role')) el.setAttribute('role', 'status');
        ensurePositioned(el);
      } else {
        el._dot = document.createElement('span');
        el._dot.className = 'gh-badge__dot';
      }
      el._sync();
    });
  }
  attributeChangedCallback() { if (this._ghDone) this._sync(); }
  _sync() { this._overlay ? this._syncOverlay() : this._syncState(); }

  _syncState() {
    ['open', 'closed', 'danger', 'warn', 'accent'].forEach((s) => this.classList.remove('gh-badge--' + s));
    const st = attr(this, 'state');
    if (st) this.classList.add('gh-badge--' + st);
    // 自定义底色：状态胶囊同样适用
    const color = attr(this, 'color');
    if (color) {
      this.style.background = color;
      this.style.color = readableText(color);
      this.style.borderColor = 'transparent';
    } else {
      this.style.background = '';
      this.style.color = '';
      this.style.borderColor = '';
    }
    if (has(this, 'dot')) this.prepend(this._dot);
    else this._dot.remove();
  }

  _syncOverlay() {
    const map = { 'top-right': 'tr', 'top-left': 'tl', 'bottom-right': 'br', 'bottom-left': 'bl' };
    const pos = map[attr(this, 'position', 'top-right')] || 'tr';
    ['tr', 'tl', 'br', 'bl'].forEach((p) => this.classList.remove('gh-badge--' + p));
    this.classList.add('gh-badge--' + pos);

    const raw = (this.textContent || '').trim();
    const isDot = has(this, 'dot') || !raw;
    this.classList.toggle('gh-badge--dot', isDot);

    const color = attr(this, 'color');
    this.style.background = color || '';
    if (isDot) this.style.color = '';
    else this.style.color = color ? readableText(color) : '#ffffff';

    if (isDot) {
      if (raw) this.textContent = '';
      if (!this.hasAttribute('aria-label')) this.setAttribute('aria-label', t('unread'));
    } else {
      const max = parseInt(attr(this, 'max', '0'), 10);
      let text = raw;
      if (max > 0 && /^\d+$/.test(raw) && Number(raw) > max) text = max + '+';
      if (this.textContent.trim() !== text) this.textContent = text;
      if (!this.hasAttribute('aria-label')) this.setAttribute('aria-label', text);
    }

    const hideZero = has(this, 'hide-zero') && !isDot && Number(raw) === 0;
    this.classList.toggle('gh-badge--hidden', hideZero);
  }
}

/* ---------- gh-stat ----------
   <gh-stat label="进行中" value="12" unit="项" tone="accent" icon="issue-opened" foot="较上周 +3">
   tone: accent | ok | warn | purple */
class GHStat extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-stat');
      const tone = attr(el, 'tone');
      if (tone) el.classList.add('gh-stat--' + tone);
      const label = document.createElement('div');
      label.className = 'gh-stat__label';
      const icon = attr(el, 'icon');
      if (icon) label.innerHTML = iconSvg(icon, 14);
      label.append(document.createTextNode(attr(el, 'label', '')));
      const value = document.createElement('div');
      value.className = 'gh-stat__value';
      value.append(document.createTextNode(attr(el, 'value', '')));
      const unit = attr(el, 'unit');
      if (unit) {
        const sm = document.createElement('small');
        sm.textContent = unit;
        value.append(sm);
      }
      el.append(label, value);
      const foot = attr(el, 'foot');
      if (foot) {
        const f = document.createElement('div');
        f.className = 'gh-stat__foot';
        f.textContent = foot;
        el.append(f);
      }
    });
  }
}

/* ---------- gh-empty ----------
   <gh-empty icon="inbox" title="暂无事项">描述文字</gh-empty> */
class GHEmpty extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-empty');
      const desc = el.innerHTML;
      el.innerHTML = '';
      const icon = document.createElement('div');
      icon.className = 'gh-empty__icon';
      icon.innerHTML = iconSvg(attr(el, 'icon', 'inbox'), 32);
      const title = document.createElement('div');
      title.className = 'gh-empty__title';
      title.textContent = attr(el, 'title', t('emptyTitle'));
      el.removeAttribute('title');
      el.append(icon, title);
      if (desc.trim()) {
        const p = document.createElement('p');
        p.className = 'gh-empty__desc';
        p.innerHTML = desc;
        el.append(p);
      }
    });
  }
}

define('gh-toast', GHToast);
define('gh-spinner', GHSpinner);
define('gh-badge', GHBadge);
define('gh-stat', GHStat);
define('gh-empty', GHEmpty);
