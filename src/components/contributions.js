// contributions.js — 贡献活动时间线（GitHub 个人主页 / 仓库 「Contribution activity」那种）
//
//   <gh-contribution>
//     <gh-contribution-group label="November 2026">
//       <gh-contribution-item title="Created 5 commits in 1 repository" bars="5,4,1">
//         <gh-contribution-repo repo="A03HCY/TeamFlow" count="5"></gh-contribution-repo>
//       </gh-contribution-item>
//       <gh-contribution-item type="repository" title="Created 1 repository">
//         <gh-contribution-repo repo="A03HCY/TeamFlow" language="Python" date="Nov 2"></gh-contribution-repo>
//       </gh-contribution-item>
//     </gh-contribution-group>
//   </gh-contribution>
//
// 条目属性：
//   title        标题
//   icon         左侧图标（默认有 bars 时 git-commit，否则 repo）
//   type         commits（默认）| repository，仅作样式钩子
//   bars         提交分布，逗号分隔的数字；每根条的宽度按该值占比，颜色逐级变浅
//   no-action    隐藏右侧的「查看贡献」按钮
//   action-icon  按钮图标（默认 sparkle）
//   action-label 按钮 aria-label
// 行属性（<gh-contribution-repo>）：
//   repo / href（默认 #）/ count（自动生成 "N commits"）/ count-text / language / language-color / date
import { define, once, has, attr } from '../core.js';
import { iconSvg } from '../icons.js';

const toNumbers = (value) => (value || '')
  .split(',')
  .map((part) => parseFloat(part))
  .filter((n) => Number.isFinite(n) && n > 0);

class GHContribution extends HTMLElement {
  connectedCallback() {
    once(this, (el) => { el.classList.add('gh-contribution'); });
  }
}

class GHContributionGroup extends HTMLElement {
  static get observedAttributes() { return ['label']; }

  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-contribution__group');
      const head = document.createElement('div');
      head.className = 'gh-contribution__month';
      const label = document.createElement('span');
      label.className = 'gh-contribution__month-label';
      head.append(label);
      el.prepend(head);
      el._label = label;
      el._sync();
    });
    this._sync();
  }

  attributeChangedCallback(_name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this._sync();
  }

  _sync() {
    const label = attr(this, 'label');
    if (this._label) this._label.textContent = label;
    if (label) this.setAttribute('aria-label', label);
    else this.removeAttribute('aria-label');
  }
}

class GHContributionItem extends HTMLElement {
  static get observedAttributes() {
    return ['title', 'icon', 'type', 'bars', 'no-action', 'action-icon', 'action-label'];
  }

  connectedCallback() {
    once(this, (el) => {
      const row = document.createElement('div');
      row.className = 'gh-contribution__item';

      const icon = document.createElement('span');
      icon.className = 'gh-contribution__icon';

      const main = document.createElement('div');
      main.className = 'gh-contribution__main';
      const title = document.createElement('div');
      title.className = 'gh-contribution__title';
      const body = document.createElement('div');
      body.className = 'gh-contribution__body';
      main.append(title, body);

      const aside = document.createElement('div');
      aside.className = 'gh-contribution__aside';
      const chart = document.createElement('div');
      chart.className = 'gh-contribution__chart';
      aside.append(chart);

      const action = document.createElement('button');
      action.type = 'button';
      action.className = 'gh-contribution__action';
      action.addEventListener('click', () => {
        el.dispatchEvent(new CustomEvent('gh:contribution-action', {
          bubbles: true,
          detail: { title: title.textContent },
        }));
      });

      [...el.childNodes].forEach((node) => body.append(node));
      el.textContent = '';
      row.append(icon, main, aside, action);
      el.append(row);

      el._row = row;
      el._icon = icon;
      el._title = title;
      el._body = body;
      el._aside = aside;
      el._chart = chart;
      el._action = action;
      el._sync();
    });
    this._sync();
  }

  attributeChangedCallback(_name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this._sync();
  }

  _sync() {
    const el = this;
    if (!el._row) return;
    el._row.dataset.type = attr(el, 'type', 'commits');
    // 右侧提交分布：宽度按最大值归一化，颜色随序号变浅
    const bars = toNumbers(attr(el, 'bars'));
    // 默认图标跟内容走：有分布=提交（圆形 git-commit），没有=仓库（repo）
    el._icon.innerHTML = iconSvg(attr(el, 'icon', bars.length ? 'git-commit' : 'repo'), 16);
    el._title.textContent = attr(el, 'title');

    el._chart.textContent = '';
    if (bars.length) {
      const max = Math.max(...bars);
      bars.slice(0, 8).forEach((value, index) => {
        const bar = document.createElement('span');
        bar.className = 'gh-contribution__bar';
        bar.style.width = Math.max(5, Math.round((value / max) * 100)) + '%';
        bar.style.setProperty('--gh-bar-level', String(index));
        // 悬停可以看到每根条对应的提交数
        bar.title = `${value} commit${value === 1 ? '' : 's'}`;
        el._chart.append(bar);
      });
      el._chart.setAttribute('role', 'img');
      el._chart.setAttribute('aria-label', bars.join(', ') + ' commits');
    }
    el._chart.hidden = bars.length === 0;
    el._aside.hidden = bars.length === 0;
    el._row.classList.toggle('has-chart', bars.length > 0);

    const actionIcon = attr(el, 'action-icon', 'sparkle');
    el._action.innerHTML = iconSvg(actionIcon, 16);
    el._action.setAttribute('aria-label', attr(el, 'action-label', 'View contribution'));
    el._action.hidden = has(el, 'no-action');
  }
}

class GHContributionRepo extends HTMLElement {
  static get observedAttributes() {
    return ['repo', 'href', 'count', 'count-text', 'language', 'language-color', 'date'];
  }

  connectedCallback() {
    once(this, (el) => {
      const row = document.createElement('div');
      row.className = 'gh-contribution__row';

      const link = document.createElement('a');
      link.className = 'gh-contribution__repo';

      const count = document.createElement('span');
      count.className = 'gh-contribution__count';

      const meta = document.createElement('span');
      meta.className = 'gh-contribution__meta';
      const lang = document.createElement('span');
      lang.className = 'gh-contribution__lang';
      const dot = document.createElement('i');
      const langName = document.createElement('span');
      lang.append(dot, langName);
      const date = document.createElement('span');
      date.className = 'gh-contribution__date';
      meta.append(lang, date);

      row.append(link, count, meta);
      el.textContent = '';
      el.append(row);

      el._row = row;
      el._link = link;
      el._count = count;
      el._meta = meta;
      el._lang = lang;
      el._langName = langName;
      el._date = date;
      el._sync();
    });
    this._sync();
  }

  attributeChangedCallback(_name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this._sync();
  }

  _sync() {
    const el = this;
    if (!el._row) return;
    const repo = attr(el, 'repo');
    el._link.textContent = repo;
    const href = attr(el, 'href', repo ? '#' : '');
    if (href) el._link.setAttribute('href', href);
    else el._link.removeAttribute('href');

    const count = parseInt(attr(el, 'count'), 10);
    if (Number.isFinite(count) && count > 0) {
      el._count.textContent = attr(el, 'count-text', count === 1 ? '1 commit' : count + ' commits');
      el._count.hidden = false;
    } else {
      el._count.textContent = '';
      el._count.hidden = true;
    }

    const language = attr(el, 'language');
    el._lang.hidden = !language;
    el._langName.textContent = language;
    const color = attr(el, 'language-color');
    if (color) el._lang.style.setProperty('--gh-contribution-lang', color);
    else el._lang.style.removeProperty('--gh-contribution-lang');
    if (language) el._lang.setAttribute('data-language', language);

    const date = attr(el, 'date');
    el._date.textContent = date;
    el._date.hidden = !date;
    el._meta.hidden = !language && !date;
    el._row.classList.toggle('has-meta', !!language || !!date);
  }
}

define('gh-contribution', GHContribution);
define('gh-contribution-group', GHContributionGroup);
define('gh-contribution-item', GHContributionItem);
define('gh-contribution-repo', GHContributionRepo);
