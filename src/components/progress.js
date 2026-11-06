// progress.js — 进度组件：gh-progress（线性）/ gh-progress-circle（环形）/ gh-steps + gh-step（步骤条）
import { define, once, has, attr, t } from '../core.js';
import { iconSvg } from '../icons.js';

const TONES = ['success', 'danger', 'warning', 'done'];
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/* ---------- gh-progress ----------
   <gh-progress value="60" tone="success" label="上传进度" show-value></gh-progress>
   value/max 决定比例；tone: accent(默认) | success | danger | warning | done
   size: 默认 6px，thin 4px，lg 10px；indeterminate 不确定进度；striped 斜纹；color 自定义色 */
class GHProgress extends HTMLElement {
  static get observedAttributes() {
    return ['value', 'max', 'tone', 'size', 'thin', 'label', 'show-value',
      'indeterminate', 'striped', 'color'];
  }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-progress');
      const head = document.createElement('div');
      head.className = 'gh-progress__head';
      el._label = document.createElement('span');
      el._label.className = 'gh-progress__label';
      el._value = document.createElement('span');
      el._value.className = 'gh-progress__value';
      head.append(el._label, el._value);

      const track = document.createElement('div');
      track.className = 'gh-progress__track';
      track.setAttribute('role', 'progressbar');
      const fill = document.createElement('span');
      fill.className = 'gh-progress__fill';
      track.append(fill);

      el.append(head, track);
      el._head = head; el._track = track; el._fill = fill;
      el._sync();
    });
  }
  attributeChangedCallback() { if (this._ghDone) this._sync(); }

  _sync() {
    if (!this._fill) return;
    const max = parseFloat(attr(this, 'max', '100')) || 100;
    const value = clamp(parseFloat(attr(this, 'value', '0')) || 0, 0, max);
    const pct = max > 0 ? (value / max) * 100 : 0;

    TONES.forEach((tone) => this.classList.remove('gh-progress--' + tone));
    const tone = attr(this, 'tone');
    if (tone && tone !== 'accent') this.classList.add('gh-progress--' + tone);

    this.classList.toggle('gh-progress--thin', has(this, 'thin'));
    this.classList.toggle('gh-progress--lg', attr(this, 'size') === 'lg');
    const indet = has(this, 'indeterminate');
    this.classList.toggle('gh-progress--indeterminate', indet);
    this.classList.toggle('gh-progress--striped', has(this, 'striped'));

    this._fill.style.background = attr(this, 'color') || '';
    this._fill.style.width = indet ? '' : pct + '%';

    // 顶部文字：label 在左，百分比在右
    const label = attr(this, 'label', '');
    const showValue = has(this, 'show-value') && !indet;
    this._label.textContent = label;
    this._value.textContent = showValue ? Math.round(pct) + '%' : '';
    this.classList.toggle('has-head', !!(label || showValue));

    // 无障碍：不确定态不给 valuenow
    this._track.setAttribute('aria-valuemin', '0');
    this._track.setAttribute('aria-valuemax', String(max));
    if (indet) {
      this._track.removeAttribute('aria-valuenow');
      this._track.setAttribute('aria-valuetext', t('inProgress'));
      this._track.setAttribute('aria-busy', 'true');
    } else {
      this._track.setAttribute('aria-valuenow', String(value));
      this._track.setAttribute('aria-valuetext', Math.round(pct) + '%');
      this._track.removeAttribute('aria-busy');
    }
    if (label) this._track.setAttribute('aria-label', label);
    else this._track.removeAttribute('aria-label');
  }

  get value() { return parseFloat(attr(this, 'value', '0')) || 0; }
  set value(v) { this.setAttribute('value', String(v)); }
}

/* ---------- gh-progress-circle ----------
   <gh-progress-circle value="72" size="72" tone="success" label="完成度"></gh-progress-circle>
   圆心内容优先用子节点；没有子节点时显示百分比 + label */
class GHProgressCircle extends HTMLElement {
  static get observedAttributes() {
    return ['value', 'max', 'tone', 'size', 'stroke', 'label', 'color', 'indeterminate'];
  }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-progress-circle');
      const content = document.createElement('span');
      content.className = 'gh-progress-circle__content';
      while (el.firstChild) content.append(el.firstChild);
      el._content = content;

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 40 40');
      svg.setAttribute('class', 'gh-progress-circle__svg');
      svg.setAttribute('role', 'progressbar');
      svg.innerHTML =
        `<circle class="gh-progress-circle__track" cx="20" cy="20" r="17"></circle>
         <circle class="gh-progress-circle__fill" cx="20" cy="20" r="17"></circle>`;
      el._fill = svg.querySelector('.gh-progress-circle__fill');
      el._track = svg.querySelector('.gh-progress-circle__track');

      // 没有自定义内容时，自动生成「百分比 + 说明」，保留引用以便后续更新
      if (!content.childNodes.length) {
        el._pct = document.createElement('span');
        el._pct.className = 'gh-progress-circle__pct';
        el._caption = document.createElement('span');
        el._caption.className = 'gh-progress-circle__caption';
        content.append(el._pct, el._caption);
      }
      el.append(svg, content);
      el._sync();
    });
  }
  attributeChangedCallback() { if (this._ghDone) this._sync(); }

  _sync() {
    if (!this._fill) return;
    const max = parseFloat(attr(this, 'max', '100')) || 100;
    const value = clamp(parseFloat(attr(this, 'value', '0')) || 0, 0, max);
    const pct = max > 0 ? (value / max) * 100 : 0;
    const C = 2 * Math.PI * 17;

    const size = parseInt(attr(this, 'size', '64'), 10) || 64;
    this.style.width = size + 'px';
    this.style.height = size + 'px';
    this._content.style.fontSize = Math.round(size * 0.26) + 'px';
    const stroke = parseFloat(attr(this, 'stroke', '3.5')) || 3.5;
    this._fill.setAttribute('stroke-width', stroke);
    this._track.setAttribute('stroke-width', stroke);

    TONES.forEach((tone) => this.classList.remove('gh-progress-circle--' + tone));
    const tone = attr(this, 'tone');
    if (tone && tone !== 'accent') this.classList.add('gh-progress-circle--' + tone);
    this._fill.style.stroke = attr(this, 'color') || '';

    const indet = has(this, 'indeterminate');
    this.classList.toggle('gh-progress-circle--indeterminate', indet);
    if (indet) {
      this._fill.style.strokeDasharray = `${C * 0.28} ${C}`;
      this._fill.style.strokeDashoffset = '0';
    } else {
      this._fill.style.strokeDasharray = String(C);
      this._fill.style.strokeDashoffset = String(C * (1 - pct / 100));
    }

    // 圆心文字：自动生成时随时更新，用户自带内容则完全不碰
    if (this._pct) {
      this._pct.textContent = indet ? '' : Math.round(pct) + '%';
      this._pct.hidden = indet;
      const label = attr(this, 'label', '');
      this._caption.textContent = label;
      this._caption.hidden = !label;
    }

    const svgEl = this._fill.parentElement;
    const ariaLabel = attr(this, 'label', '');
    if (ariaLabel) svgEl.setAttribute('aria-label', ariaLabel);
    else svgEl.removeAttribute('aria-label');
    if (indet) {
      this._fill.parentElement.removeAttribute('aria-valuenow');
      this._fill.parentElement.setAttribute('aria-valuetext', t('inProgress'));
    } else {
      this._fill.parentElement.setAttribute('aria-valuenow', String(value));
      this._fill.parentElement.setAttribute('aria-valuemin', '0');
      this._fill.parentElement.setAttribute('aria-valuemax', String(max));
      this._fill.parentElement.setAttribute('aria-valuetext', Math.round(pct) + '%');
    }
  }
}

/* ---------- gh-step ----------
   <gh-step title="提交变更" meta="进行中"></gh-step>（必须放在 gh-steps 内）
   data-state 由 gh-steps 计算；用 state="error" 可强制标记失败 */
class GHStep extends HTMLElement {
  static get observedAttributes() { return ['title', 'meta', 'data-state', 'data-index', 'state']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-step');
      if (!el.hasAttribute('role')) el.setAttribute('role', 'listitem');
      const marker = document.createElement('span');
      marker.className = 'gh-step__marker';
      const body = document.createElement('div');
      body.className = 'gh-step__body';
      const title = document.createElement('div');
      title.className = 'gh-step__title';
      const meta = document.createElement('div');
      meta.className = 'gh-step__meta';
      const desc = document.createElement('div');
      desc.className = 'gh-step__desc';
      while (el.firstChild) desc.append(el.firstChild);

      // 没写 title 属性时把内容当标题：<gh-step meta="10 月 12 日">创建分支</gh-step>
      const autoTitle = !el.hasAttribute('title');
      el._titleText = autoTitle ? desc.textContent.trim() : attr(el, 'title', '');
      if (autoTitle) desc.textContent = '';

      body.append(title, meta);
      if (desc.textContent.trim()) body.append(desc);
      el.append(marker, body);
      el._marker = marker; el._title = title; el._meta = meta;
      // title 属性会触发浏览器原生 tooltip，读完即移除
      el.removeAttribute('title');
      el._paint();
    });
  }
  attributeChangedCallback(_n, _o, newV) {
    if (!this._ghDone) return;
    // newV === null 是上面主动移除属性导致的，不要当成「清空标题」
    if (_n === 'title' && newV !== null) this._titleText = newV;
    this._paint();
  }

  _paint() {
    if (!this._marker) return;
    const state = this.getAttribute('data-state') || 'pending';
    const index = this.getAttribute('data-index') || '';
    this._title.textContent = this._titleText || '';
    const metaText = attr(this, 'meta', '');
    this._meta.textContent = metaText;
    this._meta.hidden = !metaText;

    const icon = state === 'done' ? 'check' : state === 'error' ? 'x' : '';
    this._marker.innerHTML = icon ? iconSvg(icon, 14) : `<span>${index}</span>`;
    this.dataset.state = state;
  }
}

/* ---------- gh-steps ----------
   <gh-steps current="1"><gh-step …>…</gh-steps>
   current 从 0 开始；vertical 纵向；clickable 允许点击切换并派发 gh:step-change */
class GHSteps extends HTMLElement {
  static get observedAttributes() { return ['current', 'vertical', 'clickable']; }
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-steps');
      const list = document.createElement('ol');
      list.className = 'gh-steps__list';
      list.setAttribute('role', 'list');
      while (el.firstChild) list.append(el.firstChild);
      el.append(list);
      el._list = list;

      el.addEventListener('click', (e) => {
        const step = e.target.closest('gh-step');
        if (step && el.contains(step)) el._select(step);
      });
      // 可点击时支持键盘：Enter / 空格
      el.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const step = e.target.closest('gh-step');
        if (!step || !el.contains(step)) return;
        e.preventDefault();
        el._select(step);
      });
      el._sync();
    });
  }
  attributeChangedCallback() { if (this._ghDone) this._sync(); }

  _steps() { return [...this.querySelectorAll('gh-step')]; }

  _select(step) {
    if (!has(this, 'clickable')) return;
    const index = this._steps().indexOf(step);
    if (index < 0) return;
    this.setAttribute('current', String(index));
    step.dispatchEvent(new CustomEvent('gh:step-change', {
      bubbles: true, detail: { index, step },
    }));
  }

  _sync() {
    if (!this._list) return;
    this.classList.toggle('gh-steps--vertical', has(this, 'vertical'));
    this.classList.toggle('gh-steps--clickable', has(this, 'clickable'));
    const current = parseInt(attr(this, 'current', '0'), 10) || 0;
    this._steps().forEach((step, i) => {
      const state = i < current ? 'done' : i === current ? 'current' : 'pending';
      step.setAttribute('data-state', attr(step, 'state', state));
      step.setAttribute('data-index', String(i + 1));
      if (i === current) step.setAttribute('aria-current', 'step');
      else step.removeAttribute('aria-current');
      if (has(this, 'clickable')) step.setAttribute('tabindex', '0');
      else step.removeAttribute('tabindex');
    });
  }

  get current() { return parseInt(attr(this, 'current', '0'), 10) || 0; }
  set current(v) { this.setAttribute('current', String(v)); }
  refresh() { this._sync(); }
}

define('gh-progress', GHProgress);
define('gh-progress-circle', GHProgressCircle);
define('gh-step', GHStep);
define('gh-steps', GHSteps);
