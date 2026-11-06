// data.js — 数据展示：gh-table / gh-list / gh-list-item / gh-avatar-stack / gh-kbd
import { define, once, has, attr, t } from '../core.js';
import { setSelected } from '../core/state.js';

/* ---------- gh-table ----------
   <gh-table empty="暂无数据" dense>
     <thead><tr><th>名称</th><th>状态</th></tr></thead>
     <tbody><tr><td>…</td><td>…</td></tr></tbody>
   </gh-table>
   只负责样式与滚动容器，保留原生 table 语义（读屏/复制都正常） */
class GHTable extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-table');
      if (has(el, 'dense')) el.classList.add('gh-table--dense');

      const empty = attr(el, 'empty');
      const tbody = el.querySelector('tbody');
      if (empty && tbody && tbody.children.length === 0) {
        const cols = el.querySelectorAll('thead th').length || 1;
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.className = 'gh-table__empty';
        td.colSpan = cols;
        td.textContent = empty;
        tr.append(td);
        tbody.append(tr);
      }

      // 横向滚动容器，窄屏不撑破布局
      const wrap = document.createElement('div');
      wrap.className = 'gh-table__scroll';
      while (el.firstChild) wrap.append(el.firstChild);
      el.append(wrap);
    });
  }
}

/* ---------- gh-list / gh-list-item ----------
   <gh-list>
     <gh-list-item icon="issue-opened" title="登录失败" meta="2 小时前" selected>
       <gh-badge state="open" dot>Open</gh-badge>
     </gh-list-item>
   </gh-list>
   子元素进右侧 trailing 区 */
class GHList extends HTMLElement {
  connectedCallback() {
    once(this, (el) => el.classList.add('gh-list'));
  }
}

class GHListItem extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-list-item');
      // 选中行：aria-selected="true" + .is-selected，颜色由 --gh-row-bg-selected 提供
      if (has(el, 'selected')) setSelected(el, true);

      const trailing = document.createElement('div');
      trailing.className = 'gh-list-item__trailing';
      while (el.firstChild) trailing.append(el.firstChild);

      const icon = attr(el, 'icon');
      if (icon) {
        const i = document.createElement('gh-icon');
        i.setAttribute('name', icon);
        i.classList.add('gh-list-item__icon');
        el.append(i);
      }

      const body = document.createElement('div');
      body.className = 'gh-list-item__body';
      const title = document.createElement('div');
      title.className = 'gh-list-item__title';
      title.textContent = attr(el, 'title', '');
      body.append(title);
      const meta = attr(el, 'meta');
      if (meta) {
        const m = document.createElement('div');
        m.className = 'gh-list-item__meta';
        m.textContent = meta;
        body.append(m);
      }

      el.append(body, trailing);
      if (!trailing.childElementCount) trailing.remove();
    });
  }
}

/* ---------- gh-avatar-stack ----------
   <gh-avatar-stack max="3">
     <gh-avatar size="26">A</gh-avatar>…
   </gh-avatar-stack>
   超出 max 的隐藏，末尾显示 +N */
class GHAvatarStack extends HTMLElement {
  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-avatar-stack');
      const max = parseInt(attr(el, 'max', '0'), 10);
      if (!max) return;
      const avatars = [...el.querySelectorAll('gh-avatar')];
      if (avatars.length <= max) return;
      avatars.slice(max).forEach((a) => a.remove());
      const more = document.createElement('span');
      more.className = 'gh-avatar-stack__more';
      more.textContent = `+${avatars.length - max}`;
      more.setAttribute('aria-label', t('morePeople', { count: avatars.length - max }));
      el.append(more);
    });
  }
}

/* ---------- gh-kbd ----------
   <gh-kbd>Ctrl K</gh-kbd> */
class GHKbd extends HTMLElement {
  connectedCallback() {
    once(this, (el) => el.classList.add('gh-kbd'));
  }
}

define('gh-table', GHTable);
define('gh-list', GHList);
define('gh-list-item', GHListItem);
define('gh-avatar-stack', GHAvatarStack);
define('gh-kbd', GHKbd);
