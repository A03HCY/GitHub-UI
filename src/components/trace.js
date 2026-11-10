// trace.js — 追溯链：gh-trace / gh-trace-node
//
// 把「需求 → 任务 → 代码 → 评审 → 发布」这类证据链画成一行可点的胶囊 + 连接线，
// 断链、AI 推断、进行中都是同一套结构的 state，不需要另建组件。
//
//   <gh-trace label="需求 #482 的追溯链" cols="4">
//     <gh-trace-node kind="task" ref="T-1130" title="超时重试与降级" meta="张宁" state="ok"></gh-trace-node>
//     <gh-trace-node kind="commit" ref="a3f9c21" title="fix: retry on 503/504" state="weak" flag="AI 推断"></gh-trace-node>
//     <gh-trace-node kind="pr" ref="#128" title="Retry settlement calls" state="ok"></gh-trace-node>
//     <gh-trace-node kind="release" title="未关联发布" state="missing"></gh-trace-node>
//   </gh-trace>
//
// gh-trace 属性：
//   label      读屏用标签
//   cols="4"   按 n 列网格排布（多行矩阵靠它对齐每一列；节点撑满列宽），默认按内容横向排
//   vertical   纵向链路（抽屉 / 详情的证据链）
//   compact    紧凑：更小的内边距、隐藏 meta，用于密集列表
//
// gh-trace-node 属性（纯属性驱动，不读子节点）：
//   kind    issue|task|commit|pr|review|test|build|release|deploy|doc|decision|incident
//   ref     编号 / 短 SHA / 版本号
//   title   标题（省略时只显示 kind + ref）
//   meta    次要信息（负责人 / 时间），显示在 kind 行右侧
//   state   ok（已追溯，默认）| weak（AI 推断）| missing（断链）| pending（进行中）
//   flag    自定义状态角标文字（默认取 state 文案，ok 不显示角标）
//
// 连接线的颜色与线型由「目标节点」的 state 决定：ok 实灰线 / weak 虚线警示色 /
// missing 虚线灰 / pending 虚线蓝。点击或回车派发 gh:trace-select（冒泡），
// detail = { kind, ref, title, state }。
import { define, once, has, attr } from '../core.js';
import { iconSvg } from '../icons.js';

// kind 只是视觉与语义钩子，不参与业务逻辑
const KINDS = {
  issue: { icon: 'issue-opened', name: '需求' },
  task: { icon: 'tasklist', name: '任务' },
  commit: { icon: 'git-commit', name: '提交' },
  pr: { icon: 'git-pull-request', name: '合并请求' },
  review: { icon: 'comment-discussion', name: '评审' },
  test: { icon: 'check-circle', name: '验证' },
  build: { icon: 'workflow', name: '构建' },
  release: { icon: 'tag', name: '发布' },
  deploy: { icon: 'rocket', name: '部署' },
  doc: { icon: 'book', name: '文档' },
  decision: { icon: 'light-bulb', name: '决策' },
  incident: { icon: 'flame', name: '线上问题' },
};

// ok 不显示角标，其余状态自带图标 + 文案，也可以用 flag 覆盖文案
const STATES = {
  ok: { label: '已追溯', icon: '' },
  weak: { label: 'AI 推断', icon: 'sparkle' },
  missing: { label: '断链', icon: 'alert' },
  pending: { label: '进行中', icon: 'clock' },
};

/* ---------- gh-trace ----------
   只负责布局开关：横向 flex / cols 网格 / 纵向，外加读屏标签 */
class GHTrace extends HTMLElement {
  static get observedAttributes() { return ['cols', 'vertical', 'compact', 'label']; }

  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-trace');
      el._ready = true;
      el._sync();
    });
    if (this._ready) this._sync();
  }

  attributeChangedCallback(_name, oldValue, newValue) {
    if (oldValue !== newValue && this._ready) this._sync();
  }

  _sync() {
    const el = this;
    el.classList.toggle('gh-trace--vertical', has(el, 'vertical'));
    el.classList.toggle('gh-trace--compact', has(el, 'compact'));
    // cols > 1 走 grid：多行追溯矩阵靠它对齐每一列
    const cols = parseInt(attr(el, 'cols', '0'), 10) || 0;
    el.classList.toggle('gh-trace--grid', cols > 1);
    if (cols > 1) el.style.setProperty('--gh-trace-cols', String(cols));
    else el.style.removeProperty('--gh-trace-cols');

    const label = attr(el, 'label');
    if (label) el.setAttribute('aria-label', label);
    else el.removeAttribute('aria-label');
  }
}

/* ---------- gh-trace-node ----------
   结构固定为「图标 + 两行文本 + 状态角标」。属性变化只更新节点内容、不整体重建，
   连接线（伪元素）不会因为重排闪一下。 */
class GHTraceNode extends HTMLElement {
  static get observedAttributes() { return ['kind', 'ref', 'title', 'meta', 'state', 'flag']; }

  connectedCallback() {
    once(this, (el) => {
      el.classList.add('gh-trace__node');
      if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
      el.addEventListener('click', () => el._select());
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          el._select();
        }
      });
      el._ready = true;
      el._render();
    });
  }

  attributeChangedCallback(_name, oldValue, newValue) {
    if (oldValue !== newValue && this._ready) this._render();
  }

  _select() {
    this.dispatchEvent(new CustomEvent('gh:trace-select', {
      bubbles: true,
      detail: {
        kind: attr(this, 'kind', 'task'),
        ref: attr(this, 'ref', ''),
        title: attr(this, 'title', ''),
        state: attr(this, 'state', 'ok'),
      },
    }));
  }

  _render() {
    const el = this;
    const kind = attr(el, 'kind', 'task');
    const state = attr(el, 'state', 'ok');
    const meta = KINDS[kind] || KINDS.task;
    const st = STATES[state] || STATES.ok;
    el.dataset.kind = kind;
    el.dataset.state = STATES[state] ? state : 'ok';

    let icon = el.querySelector(':scope > .gh-trace__icon');
    if (!icon) {
      icon = document.createElement('span');
      icon.className = 'gh-trace__icon';
      el.prepend(icon);
    }
    // 图标只在 kind 变化时重写 innerHTML，避免每次同步都重新解析 SVG
    if (icon.dataset.icon !== meta.icon) {
      icon.dataset.icon = meta.icon;
      icon.innerHTML = iconSvg(meta.icon, 16);
    }

    let text = el.querySelector(':scope > .gh-trace__text');
    if (!text) {
      text = document.createElement('span');
      text.className = 'gh-trace__text';
      icon.after(text);
    }

    let line = text.querySelector(':scope > .gh-trace__line');
    if (!line) {
      line = document.createElement('span');
      line.className = 'gh-trace__line';
      text.prepend(line);
    }

    let label = line.querySelector(':scope > .gh-trace__label');
    if (!label) {
      label = document.createElement('span');
      label.className = 'gh-trace__label';
      line.append(label);
    }
    label.textContent = meta.name;

    const ref = attr(el, 'ref');
    let refEl = line.querySelector(':scope > .gh-trace__ref');
    if (ref) {
      if (!refEl) {
        refEl = document.createElement('span');
        refEl.className = 'gh-trace__ref';
        label.after(refEl);
      }
      refEl.textContent = ref;
    } else if (refEl) {
      refEl.remove();
    }

    const note = attr(el, 'meta');
    let noteEl = line.querySelector(':scope > .gh-trace__meta');
    if (note) {
      if (!noteEl) {
        noteEl = document.createElement('span');
        noteEl.className = 'gh-trace__meta';
        line.append(noteEl);
      }
      noteEl.textContent = note;
    } else if (noteEl) {
      noteEl.remove();
    }

    const title = attr(el, 'title');
    let titleEl = text.querySelector(':scope > .gh-trace__title');
    if (title) {
      if (!titleEl) {
        titleEl = document.createElement('span');
        titleEl.className = 'gh-trace__title';
        text.append(titleEl);
      }
      titleEl.textContent = title;
    } else if (titleEl) {
      titleEl.remove();
    }

    const flagText = attr(el, 'flag', '') || (state === 'ok' ? '' : st.label);
    let flag = el.querySelector(':scope > .gh-trace__flag');
    if (flagText) {
      if (!flag) {
        flag = document.createElement('span');
        flag.className = 'gh-trace__flag';
        el.append(flag);
      }
      flag.textContent = flagText;
      if (st.icon) flag.insertAdjacentHTML('afterbegin', iconSvg(st.icon, 12));
      flag.title = st.label;
    } else if (flag) {
      flag.remove();
    }

    // 读屏：把状态念出来，否则只有颜色差异
    el.setAttribute('aria-label',
      [meta.name, ref, title, state === 'ok' ? '' : st.label].filter(Boolean).join(' '));
  }
}

define('gh-trace', GHTrace);
define('gh-trace-node', GHTraceNode);
