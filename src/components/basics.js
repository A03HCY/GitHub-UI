// basics.js — 基础展示组件：gh-btn / gh-alert / gh-label / gh-avatar / gh-box / gh-icon
import { define, once, has, attr, readableText, t } from '../core.js';
import { iconSvg } from '../icons.js';

/* ---------- gh-btn ----------
   <gh-btn variant="primary|danger|invisible" size="sm|lg|icon" disabled>文字</gh-btn>
   size=icon 为方形图标按钮（配合 gh-icon 使用，记得加 aria-label） */
class GHBtn extends HTMLElement {
  static get observedAttributes() { return ['variant', 'size', 'disabled']; }
  connectedCallback() {
    once(this, () => {
      this.classList.add('gh-btn');
      if (!this.getAttribute('role')) this.setAttribute('role', 'button');
      // 自定义元素默认可聚焦性/键盘激活都没有，这里补齐原生按钮行为
      if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
      this.addEventListener('keydown', (e) => {
        if (this.classList.contains('gh-btn--disabled')) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.click();
        }
      });
      // 禁用时拦截点击（包括内联 onclick），同时保留 not-allowed 光标
      this.addEventListener('click', (e) => {
        if (this.classList.contains('gh-btn--disabled')) {
          e.preventDefault();
          e.stopImmediatePropagation();
        }
      }, true);
    });
    this._sync();
  }
  attributeChangedCallback() { this._sync(); }
  _sync() {
    this.classList.remove('gh-btn--primary', 'gh-btn--danger', 'gh-btn--invisible', 'gh-btn--disabled');
    ['sm', 'lg', 'icon'].forEach((s) => this.classList.remove('gh-btn--' + s));
    const v = attr(this, 'variant');
    if (v) this.classList.add('gh-btn--' + v);
    const s = attr(this, 'size');
    if (s) this.classList.add('gh-btn--' + s);
    const off = has(this, 'disabled');
    if (off) this.classList.add('gh-btn--disabled');
    if (off) {
      this.setAttribute('aria-disabled', 'true');
      this.setAttribute('tabindex', '-1');
    } else {
      this.removeAttribute('aria-disabled');
      if (this.getAttribute('tabindex') === '-1') this.setAttribute('tabindex', '0');
    }
  }
}

/* ---------- gh-alert ----------
   <gh-alert type="danger" dismissible>内容</gh-alert>
   type: note | success | warning | danger | tip；事件: gh:dismiss */
const ALERT_TYPES = { note: 'info', success: 'check', warning: 'alert', danger: 'alert', tip: 'light-bulb' };
class GHAlert extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      const type = attr(el, 'type', 'note');
      el.classList.add('gh-alert', 'gh-alert--' + type);
      const body = el.innerHTML;
      el.innerHTML = '';
      const icon = document.createElement('span');
      icon.className = 'gh-alert__icon';
      icon.innerHTML = iconSvg(ALERT_TYPES[type] || 'info', 16);
      const box = document.createElement('div');
      box.className = 'gh-alert__body';
      box.innerHTML = body;
      el.append(icon, box);
      if (has(el, 'dismissible')) {
        const btn = document.createElement('button');
        btn.className = 'gh-alert__dismiss';
        btn.type = 'button';
        btn.setAttribute('aria-label', t('dismiss'));
        btn.innerHTML = iconSvg('x', 14);
        btn.onclick = () => {
          el.dispatchEvent(new CustomEvent('gh:dismiss', { bubbles: true }));
          el.remove();
        };
        el.append(btn);
      }
    });
  }
}

/* ---------- gh-label ----------
   <gh-label color="#0969da">文字</gh-label>，无 color 时为默认灰色 */
class GHLabel extends HTMLElement {
  static get observedAttributes() { return ['color']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-label');
      el._sync = () => {
        const color = attr(el, 'color');
        if (!color) { el.style.background = ''; el.style.color = ''; return; }
        el.style.background = color;
        el.style.color = readableText(color);
      };
      el._sync();
    });
  }
  attributeChangedCallback() { this._ghDone && this._sync(); }
}

/* ---------- gh-avatar ----------
   <gh-avatar src="..." size="32" square>名字（无 src 时取首字母）</gh-avatar> */
class GHAvatar extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      const size = parseInt(attr(el, 'size', '20'), 10) || 20;
      const square = has(el, 'square');
      const src = attr(el, 'src');
      const px = (n) => n + 'px';
      el.classList.add('gh-avatar');
      el.style.width = px(size);
      el.style.height = px(size);
      el.style.borderRadius = square ? '6px' : '50%';
      if (src) {
        const img = document.createElement('img');
        img.src = src;
        img.alt = attr(el, 'alt', '');
        img.loading = 'lazy';
        img.decoding = 'async';
        img.width = size; img.height = size;
        img.style.cssText = 'width:100%;height:100%;border-radius:inherit;display:block;object-fit:cover';
        el.prepend(img);
      } else {
        // 只读取文本节点算首字母，保留 <gh-badge> 之类的子元素
        const textNodes = [...el.childNodes].filter((n) => n.nodeType === 3);
        const text = textNodes.map((n) => n.textContent).join('').trim() || '?';
        textNodes.forEach((n) => n.remove());
        const label = document.createElement('span');
        label.className = 'gh-avatar__text';
        label.textContent = text.charAt(0).toUpperCase();
        el.prepend(label);
        el.classList.add('gh-avatar--letter');
        // 小尺寸头像（如选项里的 16px）字号按比例缩，10px 会顶满圆
        el.style.fontSize = Math.max(8, Math.round(size * 0.45)) + 'px';
        if (!el.hasAttribute('title')) el.setAttribute('title', text);
      }
    });
  }
}

/* ---------- gh-box ----------
   <gh-box title="标题">内容</gh-box>
   自定义顶栏：子元素加 slot="bar"（左侧）/ slot="bar-end"（右侧），
   可放 tabs、下拉、按钮等任意内容；有 bar 槽时 title 属性不再生效：
   <gh-box>
     <gh-stack slot="bar">…</gh-stack>
     <gh-stack slot="bar-end">…</gh-stack>
     内容
   </gh-box>
   内嵌 tab：子元素加 slot="tabs"（通常是 <gh-tabs>）会挂成卡片顶部一整行，
   顶栏/标题之下、正文之上；同一行右侧要放按钮等操作时，子元素加 slot="tabs-end"；
   面板可用 gh-tab 的 panel="外部 id" 指向正文里的 gh-tab-panel：
   <gh-box>
     <gh-tabs slot="tabs"><gh-tab panel="general" selected>General</gh-tab>…</gh-tabs>
     <gh-btn slot="tabs-end" size="sm">New branch</gh-btn>
     <gh-tab-panel id="general">…</gh-tab-panel>
   </gh-box>
   sticky：卡片随页面下滑时，顶栏（以及内嵌的 tabs 行）吸附在视口顶部，
   顶栏吸附后加 .is-stuck（去掉上圆角，不加阴影）；可用 sticky-offset="56px" 或
   --gh-box-sticky-top 让出固定导航栏的高度：
   <gh-box sticky>…</gh-box> */
class GHBox extends HTMLElement {
  static get observedAttributes() { return ['sticky', 'sticky-offset']; }
  disconnectedCallback() { this._unwatchSticky(); }
  attributeChangedCallback(_n, o, v) { if (o !== v && this.isConnected) this._syncSticky(); }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-box');
      el.classList.toggle('gh-box--plain', has(el, 'plain'));
      const title = attr(el, 'title');

      // 先摘出顶栏 / tab 槽位，剩下的子节点才是卡片内容
      const barNodes = [...el.children].filter((c) => c.getAttribute('slot') === 'bar');
      const endNodes = [...el.children].filter((c) => c.getAttribute('slot') === 'bar-end');
      const tabNodes = [...el.children].filter((c) => c.getAttribute('slot') === 'tabs');
      const tabEndNodes = [...el.children].filter((c) => c.getAttribute('slot') === 'tabs-end');
      // 没有 tabs 时，tabs-end 退化成 bar-end，省得用户记两个槽位
      const barEndNodes = tabNodes.length ? endNodes : endNodes.concat(tabEndNodes);

      const body = document.createElement('div');
      body.className = 'gh-box__body';
      while (el.firstChild) body.append(el.firstChild);
      // 纯空白内容不生成 body，避免空卡片多出一块内边距
      if (body.children.length || body.textContent.trim()) el.append(body);

      if (barNodes.length || barEndNodes.length) {
        const bar = document.createElement('div');
        bar.className = 'gh-box__bar';
        if (barNodes.length) {
          const main = document.createElement('div');
          main.className = 'gh-box__bar-main';
          barNodes.forEach((n) => main.append(n));
          bar.append(main);
        }
        if (barEndNodes.length) {
          const end = document.createElement('div');
          end.className = 'gh-box__bar-end';
          barEndNodes.forEach((n) => end.append(n));
          bar.append(end);
        }
        el.prepend(bar);
        // title 属性会触发浏览器原生 tooltip，读完即移除
        el.removeAttribute('title');
      } else if (title) {
        const header = document.createElement('div');
        header.className = 'gh-box__header';
        header.textContent = title;
        el.prepend(header);
        el.removeAttribute('title');
      }

      // tab 槽位：通常是 <gh-tabs slot="tabs">，挂成卡片顶部一整行（顶栏/标题之下）；
      // slot="tabs-end" 的内容并到这一行右侧，分隔线由整行的 inset 阴影统一画出
      if (tabNodes.length) {
        const tabs = document.createElement('div');
        tabs.className = 'gh-box__tabs';
        tabNodes.forEach((n) => {
          n.removeAttribute('slot');
          tabs.append(n);
        });
        if (tabEndNodes.length) {
          const end = document.createElement('div');
          end.className = 'gh-box__tabs-end';
          tabEndNodes.forEach((n) => {
            n.removeAttribute('slot');
            end.append(n);
          });
          tabs.append(end);
        }
        const top = el.querySelector(':scope > .gh-box__bar, :scope > .gh-box__header');
        if (top) top.after(tabs);
        else el.prepend(tabs);
      }
      el._syncSticky();
    });
  }

  /* ---------- 顶栏下滑固定 ----------
     sticky 打开后：顶栏 position:sticky 吸顶，内嵌 tabs 行贴着顶栏下沿一起吸；
     滚动/尺寸变化时把「顶栏高度」写进 --gh-box-bar-h，并切 .is-stuck 给样式用 */
  _syncSticky() {
    if (has(this, 'sticky-offset')) {
      const raw = attr(this, 'sticky-offset', '');
      this.style.setProperty('--gh-box-sticky-top', /^[\d.]+$/.test(raw) ? `${raw}px` : raw);
    } else if (this.style.getPropertyValue('--gh-box-sticky-top')) {
      this.style.removeProperty('--gh-box-sticky-top');
    }

    const on = has(this, 'sticky');
    this.classList.toggle('gh-box--sticky', on);
    const bar = this.querySelector(':scope > .gh-box__bar, :scope > .gh-box__header');
    if (!on || !bar) { this._unwatchSticky(); return; }

    if (this._stickyBar === bar) { this._stickyTopPx = this._readStickyTop(); this._placeSticky(); return; }
    this._unwatchSticky();
    this._stickyBar = bar;

    this._stickyRO = new ResizeObserver(() => this._placeSticky());
    this._stickyRO.observe(bar);
    // 直接更新：只读一次 rect、一次 classList，比 rAF 节流更稳（无头/后台标签页 rAF 不跑）
    this._stickyOnScroll = () => this._placeSticky();
    window.addEventListener('scroll', this._stickyOnScroll, { passive: true });
    window.addEventListener('resize', this._stickyOnScroll);
    this._stickyTopPx = this._readStickyTop();
    this._placeSticky();
  }

  _readStickyTop() {
    return parseFloat(getComputedStyle(this).getPropertyValue('--gh-box-sticky-top')) || 0;
  }

  _placeSticky() {
    const bar = this._stickyBar;
    if (!bar) return;
    const h = `${bar.offsetHeight}px`;
    if (this._stickyBarH !== h) {
      this._stickyBarH = h;
      this.style.setProperty('--gh-box-bar-h', h);
    }
    // 卡片顶边滑过吸附线才算「贴住」，避免初始位置就误报
    const stuck = this.getBoundingClientRect().top < this._stickyTopPx - 0.5;
    if (stuck !== this.classList.contains('is-stuck')) this.classList.toggle('is-stuck', stuck);
  }

  _unwatchSticky() {
    if (this._stickyRO) this._stickyRO.disconnect();
    if (this._stickyOnScroll) {
      window.removeEventListener('scroll', this._stickyOnScroll);
      window.removeEventListener('resize', this._stickyOnScroll);
    }
    this._stickyRO = null;
    this._stickyOnScroll = null;
    this._stickyBar = null;
    this._stickyBarH = '';
    this.classList.remove('is-stuck');
  }
}

/* ---------- gh-icon ----------
   <gh-icon name="star" size="16">，跟随文字颜色 */
class GHIcon extends HTMLElement {
  static get observedAttributes() { return ['name', 'size']; }
  connectedCallback() { this._render(); }
  attributeChangedCallback(_n, o, v) { if (o !== v) this._render(); }
  _render() {
    // 只替换 svg，保留徽标等子元素
    const old = this.querySelector(':scope > svg');
    if (old) old.remove();
    this.insertAdjacentHTML('afterbegin', iconSvg(attr(this, 'name', ''), parseInt(attr(this, 'size', '16'), 10) || 16));
  }
}

define('gh-btn', GHBtn);
define('gh-alert', GHAlert);
define('gh-label', GHLabel);
define('gh-avatar', GHAvatar);
define('gh-box', GHBox);
define('gh-icon', GHIcon);
