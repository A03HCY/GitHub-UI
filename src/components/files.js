// files.js — 高级表单组件：gh-file-picker
// 点击 / 拖拽 / 粘贴三种入口，客户端校验，图片缩略图，上传进度（uploader 可插拔）
import { define, once, has, attr, t } from '../core.js';
import { iconSvg } from '../icons.js';

/* ---------------- 工具 ---------------- */

// "2MB" / "512kb" / 1.5MB / 1024 → 字节数；非法返回 null
export function parseSize(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const m = String(v).trim().match(/^([\d.]+)\s*(b|kb|mb|gb)?$/i);
  if (!m) return null;
  const mul = { b: 1, kb: 1024, mb: 1024 ** 2, gb: 1024 ** 3 };
  return Math.round(parseFloat(m[1]) * mul[(m[2] || 'b').toLowerCase()]);
}

// 1048576 → "1 MB"；不足 1KB 直接用 B，避免 "0.3 KB"
export function formatSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  if (i === 0) return `${Math.round(n)} B`;
  return `${n >= 10 ? Math.round(n) : Math.round(n * 10) / 10} ${units[i]}`;
}

const ACCEPT_LABEL = { 'image/*': '图片', 'video/*': '视频', 'audio/*': '音频', '*/*': '任意文件' };

function acceptLabel(accept) {
  return accept
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => ACCEPT_LABEL[s] || (/^\./.test(s) ? s.slice(1).toUpperCase() : s.split('/').pop()))
    .join('、');
}

// accept 支持 .ext、image/*、application/pdf 三种写法；拖拽来的文件不会被浏览器预过滤，必须自己判
function matchAccept(file, accept) {
  const rules = accept.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!rules.length) return true;
  const name = (file.name || '').toLowerCase();
  const type = (file.type || '').toLowerCase();
  return rules.some((rule) => {
    if (rule.startsWith('.')) return name.endsWith(rule);
    if (rule.endsWith('/*')) return type.startsWith(rule.slice(0, -1));
    return type === rule;
  });
}

const EXT = (name) => {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
};

// 文件类型 → 图标颜色与中文名。颜色沿用语义 token，暗色下自动跟着变
const KINDS = [
  { exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif', 'bmp', 'ico'], label: '图片', color: 'var(--gh-accent)' },
  { exts: ['pdf'], label: 'PDF', color: 'var(--gh-danger)' },
  { exts: ['doc', 'docx', 'rtf', 'odt', 'pages', 'txt', 'md'], label: '文档', color: 'var(--gh-accent)' },
  { exts: ['xls', 'xlsx', 'csv', 'tsv', 'ods', 'numbers'], label: '表格', color: 'var(--gh-success)' },
  { exts: ['ppt', 'pptx', 'key', 'odp'], label: '演示', color: 'var(--gh-warning)' },
  { exts: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'], label: '压缩包', color: 'var(--gh-warning)' },
  { exts: ['js', 'ts', 'jsx', 'tsx', 'json', 'html', 'css', 'scss', 'py', 'go', 'rs', 'java', 'sh', 'yml', 'yaml', 'xml'], label: '代码', color: 'var(--gh-done)' },
  { exts: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'], label: '音频', color: 'var(--gh-done)' },
  { exts: ['mp4', 'mov', 'webm', 'mkv', 'avi'], label: '视频', color: 'var(--gh-done)' },
];

function kindOf(file) {
  const ext = EXT(file.name);
  const hit = KINDS.find((k) => k.exts.includes(ext));
  if (hit) return { label: hit.label, color: hit.color };
  return { label: ext ? ext.toUpperCase() : '文件', color: 'var(--gh-fg-muted)' };
}

let seq = 0;

/* ---------- gh-file-picker ----------
   <gh-file-picker multiple accept="image/*,.pdf" max-size="2MB" max-files="5" name="files"></gh-file-picker>
   变体：variant="button"（内联按钮式）
   事件：gh:change / gh:reject / gh:upload / gh:upload-error / gh:progress
   上传：picker.uploader = async (file, { onProgress, signal }) => { … } */
class GHFilePicker extends HTMLElement {
  static get observedAttributes() {
    return ['disabled', 'multiple', 'accept', 'max-size', 'max-files', 'name', 'variant', 'hint'];
  }

  connectedCallback() {
    once(this, (el) => el._build());
  }

  attributeChangedCallback(name, oldV, newV) {
    if (oldV === newV || !this._input) return;
    if (name === 'name') this._input.name = newV || '';
    if (name === 'accept') this._input.accept = newV || '';
    if (name === 'multiple') this._input.multiple = has(this, 'multiple');
    if (name === 'disabled') this._applyDisabled();
    if (name === 'variant') this._applyVariant();
    if (name === 'hint') this._hint.textContent = this._hintText();
    if (name === 'max-files' || name === 'multiple' || name === 'accept' || name === 'max-size') {
      this._renderFooter();
      if (name !== 'max-files') this._hint.textContent = this._hintText();
    }
  }

  /* ---------- 公开 API ---------- */

  get files() {
    return this._entries ? this._entries.map((e) => e.file) : [];
  }

  get disabled() { return has(this, 'disabled'); }
  set disabled(v) { v ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }

  // 编程式添加（File[] / FileList / 单个 File）
  add(list) {
    if (!this._entries) return this;
    this._add(list instanceof File ? [list] : list);
    return this;
  }

  remove(target) {
    if (!this._entries) return this;
    const entry = typeof target === 'number'
      ? this._entries[target]
      : this._entries.find((e) => e.file === target || e.file.name === target);
    if (entry) this._remove(entry);
    return this;
  }

  clear() {
    if (!this._entries) return this;
    this._clearFiles();
    this._emit([], null);
    return this;
  }

  open() {
    if (!this._input || has(this, 'disabled')) return;
    this._input.click();
  }

  /* ---------- 构建 ---------- */

  _build() {
    this.classList.add('gh-file-picker');
    this._entries = [];
    this._dragDepth = 0;

    const input = document.createElement('input');
    input.type = 'file';
    input.className = 'gh-file-picker__input';
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    if (has(this, 'multiple')) input.multiple = true;
    if (attr(this, 'accept')) input.accept = attr(this, 'accept');
    if (attr(this, 'name')) input.name = attr(this, 'name');
    input.addEventListener('change', () => {
      const picked = Array.from(input.files || []);
      input.value = ''; // 允许再次选择同一个文件
      this._add(picked);
    });
    this._input = input;

    // 拖拽区
    const zone = document.createElement('div');
    zone.className = 'gh-file-picker__zone';
    zone.setAttribute('role', 'button');
    zone.tabIndex = 0;

    const icon = document.createElement('span');
    icon.className = 'gh-file-picker__icon';
    icon.innerHTML = iconSvg('upload', 24);

    const text = document.createElement('span');
    text.className = 'gh-file-picker__text';
    const title = document.createElement('span');
    title.className = 'gh-file-picker__title';
    const drag = document.createElement('span');
    drag.className = 'gh-file-picker__drag';
    drag.textContent = t('dropFiles');
    const browse = document.createElement('span');
    browse.className = 'gh-file-picker__browse';
    browse.textContent = t('chooseFiles');
    title.append(drag, browse);
    const hint = document.createElement('span');
    hint.className = 'gh-file-picker__hint';
    text.append(title, hint);
    zone.append(icon, text);
    this._zone = zone;
    this._hint = hint;

    zone.addEventListener('click', () => this.open());
    zone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.open();
      }
    });

    // 拖拽：dragenter/dragleave 会在子元素间反复触发，用计数器抵消
    zone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      if (has(this, 'disabled')) return;
      this._dragDepth++;
      this.classList.add('is-dragging');
    });
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = has(this, 'disabled') ? 'none' : 'copy';
    });
    zone.addEventListener('dragleave', () => {
      this._dragDepth = Math.max(0, this._dragDepth - 1);
      if (!this._dragDepth) this.classList.remove('is-dragging');
    });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      this._dragDepth = 0;
      this.classList.remove('is-dragging');
      if (has(this, 'disabled')) return;
      this._add(e.dataTransfer ? e.dataTransfer.files : []);
    });

    // 粘贴：zone 获得焦点时可用（截图后 Ctrl+V 直接进来）
    zone.addEventListener('paste', (e) => {
      const files = e.clipboardData && e.clipboardData.files;
      if (!files || !files.length) return;
      e.preventDefault();
      this._add(files);
    });

    // 错误条
    const errors = document.createElement('div');
    errors.className = 'gh-file-picker__errors';
    errors.setAttribute('role', 'status');
    errors.setAttribute('aria-live', 'polite');
    this._errors = errors;

    // 文件列表
    const list = document.createElement('ul');
    list.className = 'gh-file-picker__list';
    list.setAttribute('aria-label', t('fileList'));
    this._list = list;

    // 页脚：数量与总大小
    const footer = document.createElement('div');
    footer.className = 'gh-file-picker__footer';
    const count = document.createElement('span');
    count.className = 'gh-file-picker__count';
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'gh-file-picker__clear';
    clearBtn.textContent = t('clear');
    clearBtn.addEventListener('click', () => this.clear());
    footer.append(count, clearBtn);
    footer.hidden = true;
    this._count = count;
    this._footer = footer;

    this.append(input, zone, errors, list, footer);
    hint.textContent = this._hintText();
    this._applyVariant();
    this._applyDisabled();
  }

  _hintText() {
    const custom = attr(this, 'hint');
    if (custom) return custom;
    const parts = [];
    const accept = attr(this, 'accept');
    if (accept) parts.push(`${t('accepts')} ${acceptLabel(accept)}`);
    const max = parseSize(attr(this, 'max-size'));
    if (max) parts.push(`${t('upToSize')} ${formatSize(max)}`);
    const n = parseInt(attr(this, 'max-files'), 10);
    if (n > 1) parts.push(`${t('upToFiles')} ${n}`);
    else if (!has(this, 'multiple')) parts.push(t('singleFile'));
    return parts.join(' · ');
  }

  _applyVariant() {
    const compact = attr(this, 'variant') === 'button' || has(this, 'compact');
    this.classList.toggle('gh-file-picker--button', compact);
  }

  _applyDisabled() {
    const off = has(this, 'disabled');
    this.classList.toggle('is-disabled', off);
    this._zone.tabIndex = off ? -1 : 0;
    this._zone.setAttribute('aria-disabled', off ? 'true' : 'false');
  }

  /* ---------- 校验与增删 ---------- */

  _add(list) {
    if (has(this, 'disabled')) return;
    const incoming = Array.from(list || []).filter((f) => f instanceof File);
    if (!incoming.length) return;

    const multiple = has(this, 'multiple');
    const accept = attr(this, 'accept');
    const maxSize = parseSize(attr(this, 'max-size'));
    const maxFiles = multiple ? parseInt(attr(this, 'max-files'), 10) || 0 : 1;

    const accepted = [];
    const rejected = [];
    const seen = new Set();
    const keyOf = (f) => `${f.name}|${f.size}|${f.lastModified}`;

    // 单选：先按“替换”计算容量，避免选错文件时把已选的清空
    const existing = multiple ? this._entries.length : 0;
    const capacity = maxFiles ? Math.max(0, maxFiles - existing) : Infinity;

    incoming.forEach((file) => {
      if (accept && !matchAccept(file, accept)) {
        rejected.push({ file, reason: 'type' });
        return;
      }
      if (maxSize && file.size > maxSize) {
        rejected.push({ file, reason: 'size', maxSize });
        return;
      }
      // 同名同大小同修改时间视为重复，静默忽略
      const key = keyOf(file);
      if (multiple && (seen.has(key) || this._entries.some((e) => keyOf(e.file) === key))) return;
      if (accepted.length >= capacity) {
        rejected.push({ file, reason: 'count', maxFiles });
        return;
      }
      seen.add(key);
      accepted.push(file);
    });

    const removed = [];
    if (!multiple && accepted.length) {
      removed.push(...this.files);
      this._clearFiles();
    }

    const created = accepted.map((file) => {
      const entry = this._createEntry(file);
      this._entries.push(entry);
      return entry;
    });

    if (created.length) {
      this._renderList();
      this._syncInput();
      this._uploadAll(created);
      this._emit(accepted, removed);
    }
    this._showErrors(rejected);
    if (rejected.length) {
      this.dispatchEvent(new CustomEvent('gh:reject', { bubbles: true, detail: { rejected } }));
    }
  }

  _createEntry(file) {
    const isImage = /^image\//.test(file.type) || /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(file.name);
    return {
      id: ++seq,
      file,
      state: 'ready',
      progress: 0,
      error: '',
      url: isImage ? URL.createObjectURL(file) : '',
      ctrl: null,
    };
  }

  _remove(entry) {
    const i = this._entries.indexOf(entry);
    if (i < 0) return;
    if (entry.ctrl) entry.ctrl.abort();
    if (entry.url) URL.revokeObjectURL(entry.url);
    this._entries.splice(i, 1);
    if (entry.el) entry.el.remove();
    this._syncInput();
    this._renderFooter();
    this._emit(null, [entry.file]);
  }

  _clearFiles() {
    this._entries.forEach((e) => {
      if (e.ctrl) e.ctrl.abort();
      if (e.url) URL.revokeObjectURL(e.url);
    });
    this._entries = [];
    if (this._list) this._list.textContent = '';
    this._syncInput();
    this._renderFooter();
  }

  /* ---------- 渲染 ---------- */

  _renderList() {
    this._list.textContent = '';
    this._entries.forEach((entry) => this._list.append(this._row(entry)));
    this._renderFooter();
  }

  _row(entry) {
    const li = document.createElement('li');
    li.className = 'gh-file-picker__item';

    const thumb = document.createElement('span');
    thumb.className = 'gh-file-picker__thumb';
    if (entry.url) {
      const img = new Image();
      img.src = entry.url;
      img.alt = '';
      thumb.append(img);
    } else {
      const kind = kindOf(entry.file);
      thumb.style.color = kind.color;
      thumb.innerHTML = iconSvg('file', 20);
    }

    const info = document.createElement('div');
    info.className = 'gh-file-picker__info';

    const name = document.createElement('span');
    name.className = 'gh-file-picker__name';
    name.textContent = entry.file.name;
    name.title = entry.file.name;

    const meta = document.createElement('span');
    meta.className = 'gh-file-picker__meta';
    const metaIcon = document.createElement('span');
    metaIcon.className = 'gh-file-picker__meta-icon';
    const metaText = document.createElement('span');
    metaText.className = 'gh-file-picker__meta-text';
    meta.append(metaIcon, metaText);

    const bar = document.createElement('div');
    bar.className = 'gh-file-picker__bar';
    const fill = document.createElement('span');
    bar.append(fill);

    info.append(name, meta, bar);

    const actions = document.createElement('div');
    actions.className = 'gh-file-picker__actions';

    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'gh-file-picker__retry';
    retry.textContent = t('retry');
    retry.hidden = true;
    retry.addEventListener('click', () => this._upload(entry));

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'gh-file-picker__action';
    del.setAttribute('aria-label', `${t('removeFile')} ${entry.file.name}`);
    del.title = t('remove');
    del.innerHTML = iconSvg('x', 14);
    del.addEventListener('click', () => this._remove(entry));

    actions.append(retry, del);
    li.append(thumb, info, actions);

    entry.el = li;
    entry.metaIcon = metaIcon;
    entry.metaText = metaText;
    entry.bar = fill;
    entry.retryEl = retry;
    this._paint(entry);
    return li;
  }

  _paint(entry) {
    if (!entry.el) return;
    entry.el.dataset.state = entry.state;
    entry.retryEl.hidden = entry.state !== 'error';
    entry.bar.style.width = `${entry.progress || 0}%`;

    if (entry.state === 'error') {
      entry.metaIcon.innerHTML = iconSvg('alert', 12);
      entry.metaText.textContent = entry.error || t('uploadFailed');
    } else if (entry.state === 'uploading') {
      entry.metaIcon.textContent = '';
      entry.metaText.textContent = `${t('uploading')} ${Math.round(entry.progress)}% · ${formatSize(entry.file.size)}`;
    } else if (entry.state === 'done') {
      entry.metaIcon.innerHTML = iconSvg('check', 12);
      entry.metaText.textContent = `${t('uploaded')} · ${formatSize(entry.file.size)}`;
    } else {
      const kind = kindOf(entry.file);
      entry.metaIcon.textContent = '';
      entry.metaText.textContent = `${kind.label} · ${formatSize(entry.file.size)}`;
    }
    entry.metaText.title = entry.metaText.textContent;
  }

  _renderFooter() {
    const n = this._entries.length;
    this._footer.hidden = n === 0;
    if (!n) return;
    const total = this._entries.reduce((s, e) => s + e.file.size, 0);
    const max = parseInt(attr(this, 'max-files'), 10);
    const count = max ? `${n} / ${max} ${t('fileUnit')}` : `${n} ${t('fileUnit')}`;
    this._count.textContent = `${count} · ${t('totalSize')} ${formatSize(total)}`;
  }

  /* ---------- 错误提示 ---------- */

  _showErrors(rejected) {
    this._errors.textContent = '';
    if (!rejected.length) return;
    rejected.slice(0, 3).forEach((r) => {
      const row = document.createElement('div');
      row.className = 'gh-file-picker__error';
      const icon = document.createElement('span');
      icon.className = 'gh-file-picker__error-icon';
      icon.innerHTML = iconSvg('alert', 13);
      const msg = document.createElement('span');
      if (r.reason === 'type') msg.textContent = t('fileWrongType', { name: r.file.name });
      else if (r.reason === 'size') msg.textContent = t('fileTooLarge', { name: r.file.name, size: formatSize(r.maxSize) });
      else msg.textContent = t('tooManyFiles', { count: r.maxFiles });
      row.append(icon, msg);
      this._errors.append(row);
    });
    if (rejected.length > 3) {
      const more = document.createElement('div');
      more.className = 'gh-file-picker__error';
      more.textContent = t('moreRejected', { count: rejected.length - 3 });
      this._errors.append(more);
    }
  }

  /* ---------- 表单与事件 ---------- */

  // 把内存中的文件写回原生 input，表单提交 / new FormData(form) 才能带上它们
  _syncInput() {
    try {
      const dt = new DataTransfer();
      this._entries.forEach((e) => dt.items.add(e.file));
      this._input.files = dt.files;
    } catch (_) {
      // 极老浏览器不支持给 input.files 赋值：退化为只能通过 picker.files 取值
    }
  }

  _emit(added, removed) {
    this.dispatchEvent(new CustomEvent('gh:change', {
      bubbles: true,
      detail: { files: this.files, added: added || [], removed: removed || [] },
    }));
  }

  /* ---------- 上传 ---------- */

  // picker.uploader = async (file, { onProgress, signal }) => {…}
  _uploadAll(entries) {
    if (typeof this.uploader !== 'function') return;
    entries.forEach((e) => this._upload(e));
  }

  _upload(entry) {
    if (typeof this.uploader !== 'function' || !this._entries.includes(entry)) return;
    if (entry.ctrl) entry.ctrl.abort();
    const ctrl = new AbortController();
    entry.ctrl = ctrl;
    entry.state = 'uploading';
    entry.progress = 0;
    entry.error = '';
    this._paint(entry);

    const onProgress = (pct) => {
      if (ctrl.signal.aborted) return;
      entry.progress = Math.max(0, Math.min(100, Number(pct) || 0));
      this._paint(entry);
      this.dispatchEvent(new CustomEvent('gh:progress', {
        bubbles: true,
        detail: { file: entry.file, percent: entry.progress },
      }));
    };

    Promise.resolve()
      .then(() => this.uploader(entry.file, { onProgress, signal: ctrl.signal, picker: this }))
      .then(() => {
        if (ctrl.signal.aborted) return;
        entry.state = 'done';
        entry.progress = 100;
        this._paint(entry);
        this.dispatchEvent(new CustomEvent('gh:upload', { bubbles: true, detail: { file: entry.file } }));
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        entry.state = 'error';
        entry.error = (err && err.message) || t('uploadFailed');
        this._paint(entry);
        this.dispatchEvent(new CustomEvent('gh:upload-error', {
          bubbles: true,
          detail: { file: entry.file, error: err },
        }));
      })
      .finally(() => {
        if (entry.ctrl === ctrl) entry.ctrl = null;
      });
  }
}

define('gh-file-picker', GHFilePicker);
