// pagination.js — 分页：gh-pagination
// <gh-pagination total="12" page="3"></gh-pagination>
// 属性：total 总页数、page 当前页、siblings 当前页左右各显示几页、boundary 首尾各显示几页
// 事件：gh:change（detail: { page }）
import { define, once, has, attr, t } from '../core.js';
import { iconSvg } from '../icons.js';

class GHPagination extends HTMLElement {
  static get observedAttributes() { return ['total', 'page', 'siblings', 'boundary', 'size', 'disabled']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-pagination');
      el.setAttribute('role', 'navigation');
      if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', t('pagination'));
      el.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-page]');
        if (!btn || !el.contains(btn) || btn.disabled) return;
        el._go(Number(btn.dataset.page));
      });
      el._render();
    });
  }
  attributeChangedCallback() { if (this._ghDone) this._render(); }

  _pages() {
    const total = Math.max(1, parseInt(attr(this, 'total', '1'), 10) || 1);
    const page = Math.min(total, Math.max(1, parseInt(attr(this, 'page', '1'), 10) || 1));
    const siblings = Math.max(0, parseInt(attr(this, 'siblings', '1'), 10) || 0);
    const boundary = Math.max(1, parseInt(attr(this, 'boundary', '1'), 10) || 1);

    if (total <= 3 + siblings * 2 + boundary * 2) {
      const all = [];
      for (let i = 1; i <= total; i++) all.push(i);
      return { list: all, page, total };
    }
    const list = [];
    const left = Math.max(boundary + 1, page - siblings);
    const right = Math.min(total - boundary, page + siblings);
    for (let i = 1; i <= boundary; i++) list.push(i);
    if (left > boundary + 1) list.push('…');
    for (let i = left; i <= right; i++) list.push(i);
    if (right < total - boundary) list.push('…');
    for (let i = total - boundary + 1; i <= total; i++) list.push(i);
    return { list, page, total };
  }

  _render() {
    if (!this._ghDone) return;
    const { list, page, total } = this._pages();
    const size = attr(this, 'size', '');
    this.classList.toggle('gh-pagination--sm', size === 'sm');
    this.classList.toggle('is-disabled', has(this, 'disabled'));
    this.innerHTML = '';

    const mk = (label, aria, opts = {}) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gh-page' + (opts.className ? ' ' + opts.className : '');
      b.innerHTML = label;
      b.setAttribute('aria-label', aria);
      if (opts.page !== undefined) b.dataset.page = opts.page;
      if (opts.disabled) b.disabled = true;
      if (opts.current) {
        b.classList.add('is-current');
        b.setAttribute('aria-current', 'page');
      }
      return b;
    };

    this.append(mk(iconSvg('chevron-left', 16), t('prevPage'), {
      className: 'gh-page--arrow', page: page - 1, disabled: page <= 1 || has(this, 'disabled'),
    }));

    list.forEach((item) => {
      if (item === '…') {
        const gap = document.createElement('span');
        gap.className = 'gh-page__gap';
        gap.textContent = '…';
        gap.setAttribute('aria-hidden', 'true');
        this.append(gap);
        return;
      }
      this.append(mk(String(item), t('goToPage', { page: item }), {
        page: item,
        current: item === page,
        disabled: has(this, 'disabled'),
      }));
    });

    this.append(mk(iconSvg('chevron-right', 16), t('nextPage'), {
      className: 'gh-page--arrow', page: page + 1, disabled: page >= total || has(this, 'disabled'),
    }));
  }

  _go(page) {
    const total = Math.max(1, parseInt(attr(this, 'total', '1'), 10) || 1);
    const next = Math.min(total, Math.max(1, page));
    if (next === parseInt(attr(this, 'page', '1'), 10)) return;
    this.setAttribute('page', String(next));
    this.dispatchEvent(new CustomEvent('gh:change', {
      bubbles: true, detail: { page: next },
    }));
  }

  get page() { return parseInt(attr(this, 'page', '1'), 10) || 1; }
  set page(v) { this.setAttribute('page', String(v)); }
}

define('gh-pagination', GHPagination);
