// sidebar.js — 侧栏组件 gh-sidebar（可折叠成 icon rail）
import { define, once, has, attr } from '../core.js';
import { iconSvg } from '../icons.js';

/* ---------- gh-sidebar ----------
<gh-sidebar collapsible>
  <gh-menu plain>
    <gh-menu-item icon="issue-opened" href="#">Issues</gh-menu-item>
    <gh-menu-item icon="person" href="#">Assigned to me</gh-menu-item>
  </gh-menu>

  <gh-menu plain>
    <div class="gh-menu__item gh-sidebar__heading"><gh-icon name="stack"></gh-icon>Views</div>
    <gh-menu-item icon="project" href="#" active>Projects</gh-menu-item>
    <gh-menu-item icon="milestone" href="#">Milestones</gh-menu-item>
  </gh-menu>

  <gh-menu plain slot="footer">
    <gh-menu-item icon="comment-discussion">Feedback <span class="gh-sidebar__pill">Preview</span></gh-menu-item>
  </gh-menu>
</gh-sidebar>

每个直接子节点就是一「组」，组与组之间自动画分隔线（第一组没有）；slot="footer" 的子节点钉在底部。
collapsible  底部多一个折叠按钮（slot="footer" 里已有 [data-sidebar-toggle] 时复用那一个）
collapsed    icon rail：只剩图标，文案收进原生 tooltip
label-collapse / label-expand  折叠按钮文案，默认 Collapse sidebar / Expand sidebar
width        侧栏宽度（px），也可直接用 CSS 变量 --gh-sidebar-width / --gh-sidebar-rail

方法：collapse() / expand() / toggle()，只读属性 collapsed；
切换时派发 gh:sidebar-toggle，detail = { collapsed } */
class GHSidebar extends HTMLElement {
  // label-expand / label-collapse 在 _sync 里读，必须监听才能运行时改文案
  static get observedAttributes() { return ['collapsed', 'collapsible', 'label-expand', 'label-collapse']; }

  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-sidebar');
      if (!el.hasAttribute('role')) el.setAttribute('role', 'navigation');
      const width = attr(el, 'width');
      if (width) el.style.setProperty('--gh-sidebar-width', /^\d+$/.test(width) ? width + 'px' : width);

      // 直接子节点分两类：slot="footer" 进底部，其余各成一组
      const body = document.createElement('div');
      body.className = 'gh-sidebar__body';
      const footer = document.createElement('div');
      footer.className = 'gh-sidebar__footer';

      [...el.children].forEach((child) => {
        if (child.getAttribute('slot') === 'footer') {
          child.removeAttribute('slot');
          footer.append(child);
        } else {
          child.classList.add('gh-sidebar__group');
          body.append(child);
        }
      });

      el.append(body);
      el._body = body;
      el._footer = footer;
      el._footerNeeded = footer.childElementCount > 0 || has(el, 'collapsible');
      if (el._footerNeeded) el.append(footer);

      el._sync();
      // gh-menu-item 也在 DOMContentLoaded 里渲染，晚一拍再包 label
      setTimeout(() => { if (el.isConnected) el._sync(); }, 0);
    });
  }

  attributeChangedCallback() { if (this._ghDone) this._sync(); }

  get collapsed() { return has(this, 'collapsed'); }

  collapse() { this._set(true); }
  expand() { this._set(false); }
  toggle() { this._set(!this.collapsed); }

  _set(collapsed) {
    if (collapsed === this.collapsed) return;
    this.toggleAttribute('collapsed', collapsed);
    this.dispatchEvent(new CustomEvent('gh:sidebar-toggle', {
      bubbles: true,
      detail: { collapsed },
    }));
  }

  /* 给每个菜单项补两层包装：图标（折叠时居中用）与文案（折叠时隐藏），
     并把文案记下来当 tooltip；对重复调用幂等 */
  _prepare() {
    this.querySelectorAll('.gh-menu__item').forEach((item) => {
      if (item.dataset.ghSide === '1') return;
      item.dataset.ghSide = '1';

      const icon = item.querySelector(':scope > gh-icon, :scope > svg');
      let iconWrap = item.querySelector(':scope > .gh-sidebar__icon');
      if (icon && !iconWrap) {
        iconWrap = document.createElement('span');
        iconWrap.className = 'gh-sidebar__icon';
        item.insertBefore(iconWrap, icon);
        iconWrap.append(icon);
      }

      let label = item.querySelector(':scope > .gh-sidebar__label');
      if (!label) {
        label = document.createElement('span');
        label.className = 'gh-sidebar__label';
        [...item.childNodes].forEach((n) => {
          if (n === iconWrap) return;
          if (n.nodeType === 1 && (n.classList.contains('gh-menu__chevron') || n.classList.contains('gh-menu__hint') || n.classList.contains('gh-sidebar__pill'))) return;
          label.append(n);
        });
        item.insertBefore(label, iconWrap ? iconWrap.nextSibling : item.firstChild);
      }
      item._ghSideLabel = label.textContent.replace(/\s+/g, ' ').trim();
    });
  }

  _ensureToggle() {
    const el = this;
    if (!has(el, 'collapsible') || !el._footer) return null;
    let btn = el._footer.querySelector('.gh-sidebar__toggle');
    if (btn) return btn;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gh-menu__item gh-sidebar__toggle';
    btn.innerHTML = '<span class="gh-sidebar__icon"></span><span class="gh-sidebar__label"></span>';
    btn.addEventListener('click', () => el.toggle());
    el._footer.append(btn);
    return btn;
  }

  _sync() {
    const el = this;
    const collapsed = has(el, 'collapsed');
    el.classList.toggle('is-collapsed', collapsed);

    const toggle = el._ensureToggle();
    if (toggle) {
      const labelText = collapsed ? attr(el, 'label-expand', 'Expand sidebar') : attr(el, 'label-collapse', 'Collapse sidebar');
      const label = toggle.querySelector('.gh-sidebar__label');
      if (label) label.textContent = labelText;
      const iconWrap = toggle.querySelector('.gh-sidebar__icon');
      if (iconWrap) iconWrap.innerHTML = iconSvg(collapsed ? 'sidebar-expand' : 'sidebar-collapse', 16);
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.setAttribute('title', labelText);
      toggle._ghSideLabel = labelText;
    }

    el._prepare();
    el.querySelectorAll('.gh-menu__item').forEach((item) => {
      const text = item._ghSideLabel;
      if (collapsed && text) item.setAttribute('title', text);
      else item.removeAttribute('title');
    });
  }
}

define('gh-sidebar', GHSidebar);
