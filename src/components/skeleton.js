// skeleton.js — 加载占位：gh-skeleton
// 三种形态：text（默认，文本行）、circle（圆形头像/图标位）、rect（矩形块）
import { define, once, has, attr } from '../core.js';

class GHSkeleton extends HTMLElement {
  static get observedAttributes() { return ['lines', 'width', 'height', 'circle', 'size', 'variant']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-skeleton');
      el._render();
    });
  }
  attributeChangedCallback() { if (this._ghDone) this._render(); }

  _render() {
    if (!this._ghDone) return;
    const variant = attr(this, 'variant') || (has(this, 'circle') ? 'circle' : 'text');
    this.classList.toggle('gh-skeleton--circle', variant === 'circle');
    this.classList.toggle('gh-skeleton--rect', variant === 'rect');
    this.classList.toggle('gh-skeleton--text', variant !== 'circle' && variant !== 'rect');
    this.innerHTML = '';

    if (variant === 'circle') {
      const size = parseInt(attr(this, 'size', '40'), 10) || 40;
      const bar = document.createElement('span');
      bar.className = 'gh-skeleton__bar';
      bar.style.width = size + 'px';
      bar.style.height = size + 'px';
      this.append(bar);
      return;
    }
    if (variant === 'rect') {
      const bar = document.createElement('span');
      bar.className = 'gh-skeleton__bar';
      bar.style.width = attr(this, 'width', '100%');
      bar.style.height = attr(this, 'height', '80px');
      this.append(bar);
      return;
    }
    // 文本行
    const lines = parseInt(attr(this, 'lines', '1'), 10) || 1;
    const width = attr(this, 'width');
    const height = attr(this, 'height', '12px');
    for (let i = 0; i < lines; i++) {
      const bar = document.createElement('span');
      bar.className = 'gh-skeleton__bar';
      bar.style.height = height;
      // 未指定宽度时，最后一行短一点，更接近真实文本
      bar.style.width = width || (i === lines - 1 && lines > 1 ? '62%' : '100%');
      this.append(bar);
    }
  }
}

define('gh-skeleton', GHSkeleton);
