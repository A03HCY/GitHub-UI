// layout.js — 页面布局：gh-container / gh-grid / gh-stack / gh-header
//            应用骨架：gh-app / gh-side / gh-account / gh-nav-* / gh-topbar / gh-crumbs / gh-page-head
//            骨架部分参考 TeamFlow static/assets/css/layout.css
import { define, once, has, attr, t } from '../core.js';
import { setCurrent } from '../core/state.js';
import { iconSvg } from '../icons.js';

/* ---------- gh-container ----------
   页面内容容器，水平居中。<gh-container narrow> 收窄为 768px */
class GHContainer extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-container');
      if (has(el, 'narrow')) el.classList.add('gh-container--narrow');
      if (has(el, 'wide')) el.classList.add('gh-container--wide');
    });
  }
}

/* ---------- gh-grid ----------
   <gh-grid cols="3" gap="16">
     <div span="2">占两列</div><div>一列</div>
   </gh-grid>
   子元素用 span 属性指定跨列数 */
class GHGrid extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      const cols = parseInt(attr(el, 'cols', '3'), 10) || 3;
      const gap = parseInt(attr(el, 'gap', '16'), 10) || 16;
      // 用 CSS 变量而非内联 grid 属性，媒体查询才能在窄屏覆盖列数
      el.style.setProperty('--gh-cols', cols);
      el.style.setProperty('--gh-gap', gap + 'px');
      for (const child of el.children) {
        const span = parseInt(attr(child, 'span', '1'), 10) || 1;
        if (span > 1) child.style.setProperty('--gh-span', span);
      }
    });
  }
}

/* ---------- gh-stack ----------
   <gh-stack direction="row" gap="12" align="center" justify="between" wrap>
   direction: column(默认) | row；justify: start | center | end | between */
const JUSTIFY = { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between' };
class GHStack extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-stack');
      el.style.display = 'flex';
      el.style.flexDirection = attr(el, 'direction', 'column');
      const gap = attr(el, 'gap');
      if (gap) el.style.gap = parseInt(gap, 10) + 'px';
      const align = attr(el, 'align');
      if (align) el.style.alignItems = align;
      const justify = attr(el, 'justify');
      if (justify) el.style.justifyContent = JUSTIFY[justify] || justify;
      if (has(el, 'wrap')) el.style.flexWrap = 'wrap';
    });
  }
}

/* ---------- gh-header ----------
   页面顶部深色导航条，内部自由组合（建议内嵌 gh-container + gh-stack row）；
   子元素加 slot="tabs"（通常是 <gh-tabs>）会挂到导航条底部的整行 tab 区 */
class GHHeader extends HTMLElement {
  static get observedAttributes() { return ['variant']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-header');
      el.setAttribute('role', 'banner');
      this._mountTabs();
    });
    this._sync();
  }
  attributeChangedCallback() { this._sync(); }
  _mountTabs() {
    const tabs = [...this.children].filter((c) => c.getAttribute('slot') === 'tabs');
    if (!tabs.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'gh-header__tabs';
    tabs.forEach((t) => {
      t.removeAttribute('slot');
      wrap.append(t);
    });
    this.append(wrap);
    this.classList.add('gh-header--tabs');
  }
  _sync() {
    const variant = this.getAttribute('variant');
    // dark 是默认值，不需要额外类；light 强制浅色，auto 跟随主题
    this.classList.toggle('gh-header--light', variant === 'light');
    this.classList.toggle('gh-header--auto', variant === 'auto');
  }
}

/* ---------- 应用骨架（侧栏 + 主区） ---------- */

/* ---------- gh-app ----------
   <gh-app>
     <gh-side>…</gh-side>
     <div>主内容</div>   ← 非 gh-side 子元素自动包进主区
   </gh-app> */
class GHApp extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-app');
      const main = document.createElement('div');
      main.className = 'gh-app__main';
      [...el.children].forEach((c) => {
        if (c.tagName !== 'GH-SIDE') main.append(c);
      });
      el.append(main);
    });
  }
}

/* ---------- gh-side ----------
   侧栏。gh-account 放顶部账号区；slot="foot" 的子元素固定到底部；其余进导航区 */
class GHSide extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-side');
      const head = document.createElement('div');
      head.className = 'gh-side__head';
      const nav = document.createElement('nav');
      nav.className = 'gh-side__nav';
      const foot = document.createElement('div');
      foot.className = 'gh-side__foot';
      [...el.children].forEach((c) => {
        const slot = c.getAttribute && c.getAttribute('slot');
        if (slot === 'foot') foot.append(c);
        else if (c.tagName === 'GH-ACCOUNT') head.append(c);
        else nav.append(c);
      });
      el.append(head, nav, foot);
    });
  }
}

/* ---------- gh-account ----------
   <gh-account name="A03HCY" subtitle="Your personal account" src="avatar.svg"></gh-account>
   侧栏顶部账号条：头像 + 名称/说明 + 右侧切换按钮。
   action-icon 换按钮图标（默认 arrow-switch）、action-label 换按钮文案（默认「切换账号」）、
   no-action 隐藏右侧按钮（只当纯账号行用）。
   事件：gh:account（点整行）、gh:switch（点切换按钮） */
class GHAccount extends HTMLElement {
  static get observedAttributes() { return ['name', 'subtitle', 'src', 'action-icon', 'action-label', 'no-action']; }

  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-account');
      el.setAttribute('role', 'button');
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');

      const text = document.createElement('span');
      text.className = 'gh-account__text';
      const name = document.createElement('span');
      name.className = 'gh-account__name';
      const subtitle = document.createElement('span');
      subtitle.className = 'gh-account__subtitle';
      text.append(name, subtitle);

      const swap = document.createElement('button');
      swap.type = 'button';
      swap.className = 'gh-account__switch';
      swap.addEventListener('click', (e) => {
        e.stopPropagation();
        el.dispatchEvent(new CustomEvent('gh:switch', { bubbles: true }));
      });

      // 头像由 _sync 负责插入（必须先带 src 再挂载，gh-avatar 只在连接时读一次 src）
      el.append(text, swap);
      el._sync();

      el.addEventListener('click', () => {
        el.dispatchEvent(new CustomEvent('gh:account', { bubbles: true }));
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el.click();
        }
      });
    });
  }

  attributeChangedCallback() { if (this._ghDone) this._sync(); }

  // gh-avatar 没有 observedAttributes，改 src 不会重绘，所以整体换一个节点
  _makeAvatar() {
    const src = attr(this, 'src');
    const name = attr(this, 'name', '');
    const avatar = document.createElement('gh-avatar');
    avatar.className = 'gh-account__avatar';
    avatar.setAttribute('size', '40');
    if (src) avatar.setAttribute('src', src);
    else avatar.textContent = name.slice(0, 1).toUpperCase() || '?';
    return avatar;
  }

  _sync() {
    const el = this;
    const name = attr(el, 'name', '');
    const subtitle = attr(el, 'subtitle', '');
    const src = attr(el, 'src');

    const key = `${src || ''}|${name}`;
    if (el._avatarKey !== key) {
      el._avatarKey = key;
      const next = el._makeAvatar();
      const old = el.querySelector('.gh-account__avatar');
      if (old) old.replaceWith(next);
      else el.prepend(next);
    }

    const nameEl = el.querySelector('.gh-account__name');
    if (nameEl) nameEl.textContent = name;
    const subEl = el.querySelector('.gh-account__subtitle');
    if (subEl) {
      subEl.textContent = subtitle;
      subEl.hidden = !subtitle;
    }

    const swap = el.querySelector('.gh-account__switch');
    if (swap) {
      swap.hidden = has(el, 'no-action');
      const label = attr(el, 'action-label', t('switchAccount'));
      swap.setAttribute('aria-label', label);
      swap.title = label;
      swap.innerHTML = iconSvg(attr(el, 'action-icon', 'arrow-switch'), 16);
    }

    if (!el.hasAttribute('aria-label')) {
      el.setAttribute('aria-label', subtitle ? `${name}，${subtitle}` : name);
    }
  }
}

/* ---------- gh-nav-title ----------
   <gh-nav-title>Top repositories</gh-nav-title>
   <gh-nav-title action-icon="search" action-label="搜索">分组标题</gh-nav-title>
   带 action-icon 时右侧出现图标按钮，点击派发 gh:action */
class GHNavTitle extends HTMLElement {
  static get observedAttributes() { return ['action-icon', 'action-label']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-nav-title');
      const text = document.createElement('span');
      text.className = 'gh-nav-title__text';
      while (el.firstChild) text.append(el.firstChild);
      el.append(text);
      el.addEventListener('click', (e) => {
        if (!e.target.closest('.gh-nav-title__action')) return;
        el.dispatchEvent(new CustomEvent('gh:action', {
          bubbles: true,
          detail: { action: attr(el, 'action-icon') },
        }));
      });
      el._sync();
    });
  }
  attributeChangedCallback() { if (this._ghDone) this._sync(); }
  _sync() {
    const icon = attr(this, 'action-icon');
    let btn = this.querySelector('.gh-nav-title__action');
    if (!icon) {
      if (btn) btn.remove();
      return;
    }
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gh-nav-title__action';
      this.append(btn);
    }
    const label = attr(this, 'action-label', t('more'));
    btn.innerHTML = iconSvg(icon, 14);
    btn.setAttribute('aria-label', label);
    btn.title = label;
  }
}

/* ---------- gh-nav-item ----------
   <gh-nav-item icon="home" active count="12">总览</gh-nav-item>
   <gh-nav-item><gh-avatar slot="media" size="16" src="repo.svg"></gh-avatar>仓库</gh-nav-item>
   事件: gh:nav  detail: { key } */
class GHNavItem extends HTMLElement {
  static get observedAttributes() { return ['active', 'count', 'icon']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-nav-item');
      // 允许用 slot="media" 塞任意前导元素（头像、自定义图标），优先于 icon
      const slotted = el.querySelector(':scope > [slot="media"]');
      if (slotted) {
        slotted.removeAttribute('slot');
        const wrap = document.createElement('span');
        wrap.className = 'gh-nav-item__media';
        wrap.append(slotted);
        el.prepend(wrap);
        el._mediaKey = 'slot';
      }
      el._syncMedia();

      // 文案单独包一层：长名字才能省略号截断，也能和图标/计数分开
      const media = el.querySelector(':scope > .gh-nav-item__media');
      const label = document.createElement('span');
      label.className = 'gh-nav-item__label';
      [...el.childNodes].forEach((n) => { if (n !== media) label.append(n); });
      el.append(label);
      el._label = label;

      el.addEventListener('click', () => {
        el.dispatchEvent(new CustomEvent('gh:nav', {
          bubbles: true,
          detail: { key: attr(el, 'key') || label.textContent.trim() },
        }));
      });
      // 键盘可达：Tab 聚焦 + 回车/空格激活
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el.click();
        }
      });
      el._sync();
    });
  }
  attributeChangedCallback() { if (this._ghDone) { this._sync(); this._syncMedia(); } }

  // icon 变化时重建前导图标；用 slot="media" 时不再覆盖
  _syncMedia() {
    if (this._mediaKey === 'slot') return;
    const icon = attr(this, 'icon');
    if (this._mediaKey === (icon || '')) return;
    this._mediaKey = icon || '';
    const old = this.querySelector(':scope > .gh-nav-item__media');
    if (old) old.remove();
    if (!icon) return;
    const wrap = document.createElement('span');
    wrap.className = 'gh-nav-item__media';
    const i = document.createElement('gh-icon');
    i.setAttribute('name', icon);
    i.setAttribute('aria-hidden', 'true');
    wrap.append(i);
    this.prepend(wrap);
  }

  _sync() {
    const active = has(this, 'active');
    // 当前项：aria-current="page" + .is-current（外观由 CSS 的 --gh-row-* 统一提供）
    this.classList.add('gh-nav-item');
    setCurrent(this, active, { exclusive: false });
    let count = this.querySelector('.gh-nav-count');
    const num = attr(this, 'count');
    if (num !== null) {
      if (!count) {
        count = document.createElement('span');
        count.className = 'gh-nav-count';
        this.append(count);
      }
      count.textContent = num;
    } else if (count) {
      count.remove();
    }
  }
}

/* ---------- gh-topbar ---------- 主区顶部工具条（sticky） */
class GHTopbar extends HTMLElement {
  connectedCallback() {
    once(this, (el) => el.classList.add('gh-topbar'));
  }
}

/* ---------- gh-crumbs ---------- 面包屑，分隔符由 CSS 自动加 */
class GHCrumbs extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-crumbs');
      if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', t('breadcrumb'));
    });
  }
}

/* ---------- gh-page-head ----------
   <gh-page-head title="标题" desc="说明">…右侧操作按钮…</gh-page-head> */
class GHPageHead extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-page-head');
      const text = document.createElement('div');
      text.className = 'gh-page-head__text';
      const h = document.createElement('h1');
      h.className = 'gh-page-head__title';
      h.textContent = attr(el, 'title', '');
      if (h.textContent) el.removeAttribute('title');
      text.append(h);
      const desc = attr(el, 'desc');
      if (desc) {
        const p = document.createElement('p');
        p.className = 'gh-page-head__desc';
        p.textContent = desc;
        text.append(p);
      }
      const actions = document.createElement('div');
      actions.className = 'gh-page-head__actions';
      [...el.children].forEach((c) => actions.append(c));
      el.append(text, actions);
      if (!actions.childElementCount) actions.style.display = 'none';
    });
  }
}

define('gh-container', GHContainer);
define('gh-grid', GHGrid);
define('gh-stack', GHStack);
define('gh-header', GHHeader);
define('gh-app', GHApp);
define('gh-side', GHSide);
define('gh-account', GHAccount);
define('gh-nav-title', GHNavTitle);
define('gh-nav-item', GHNavItem);
define('gh-topbar', GHTopbar);
define('gh-crumbs', GHCrumbs);
define('gh-page-head', GHPageHead);
