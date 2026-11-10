// core.js：组件注册与增强的公共工具

// 注册自定义标签（带连字符是浏览器规范强制要求，如 gh-btn）
export function define(tag, ctor) {
  if (!customElements.get(tag)) customElements.define(tag, ctor);
}

// connectedCallback 可能在节点被移动时多次触发，用标记保证只增强一次。
// 若脚本同步执行于 <head>，元素会在子节点尚未解析完时就升级（如 <gh-select> 的 <option>），
// 此时推迟到 DOMContentLoaded 再增强，避免“搬不到子节点”。
export function once(el, fn) {
  if (el._ghDone || el._ghQueued) return;
  const run = () => {
    el._ghQueued = false;
    if (el._ghDone) return;
    el._ghDone = true;
    fn(el);
  };
  if (document.readyState === 'loading') {
    el._ghQueued = true;
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}

// 读取布尔属性（存在即为 true）
export const has = (el, name) => el.hasAttribute(name);
export const attr = (el, name, fallback = null) =>
  el.getAttribute(name) ?? fallback;

// 取出宿主上 slot="name" 的自定义插槽子元素（取走后从原位置移除，避免被当成普通内容）
export function takeSlot(el, name) {
  const node = [...el.children].find((c) => c.getAttribute('slot') === name);
  if (!node) return null;
  node.removeAttribute('slot');
  node.remove();
  return node;
}

// 根据背景色亮度返回可读的文字颜色（用于彩色 label / 徽标）
export function readableText(color) {
  const h = String(color || '').replace('#', '');
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(h)) return '#ffffff';
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? '#1f2328' : '#ffffff';
}

// 界面文案：可在引入后覆盖 GHUI.strings.close = 'Close' 等
// 库版本：用于 CSS 缓存击穿，也可在页面里读取
export const VERSION = '0.29.0';

export const STRINGS = {
  close: '关闭',
  dismiss: '关闭',
  clear: '清空',
  showPassword: '显示密码',
  hidePassword: '隐藏密码',
  unread: '有未读',
  breadcrumb: '面包屑',
  emptyTitle: '暂无内容',
  noData: '暂无数据',
  confirm: '确定',
  cancel: '取消',
  more: '更多',
  remove: '移除',
  copy: '复制',
  copied: '已复制',
  copyFailed: '复制失败',
  prevPage: '上一页',
  nextPage: '下一页',
  goToPage: '第 {page} 页',
  pagination: '分页导航',
  confirmTitle: '确认操作',
  promptTitle: '请输入',
  clickToDismiss: '点击关闭',
  inProgress: '进行中',
  morePeople: '还有 {count} 人',
  noDescription: '没有填写描述。',
  justNow: '刚刚',
  minutesAgo: '{count} 分钟前',
  hoursAgo: '{count} 小时前',
  daysAgo: '{count} 天前',
  dateFull: '{year} 年 {month} 月 {day} 日',
  noResults: '没有匹配项',
  allSelected: '已全部选择',
  dropFiles: '拖拽文件到此处，或',
  chooseFiles: '选择文件',
  accepts: '支持',
  upToSize: '单个不超过',
  upToFiles: '最多',
  singleFile: '一次只能选择一个文件',
  fileList: '已选文件',
  switchAccount: '切换账号',
  send: '发送',
  items: '项',
  fileUnit: '个文件',
  totalSize: '共',
  removeFile: '移除文件',
  retry: '重试',
  uploading: '上传中',
  uploaded: '已完成',
  uploadFailed: '上传失败',
  fileWrongType: '「{name}」格式不支持',
  fileTooLarge: '「{name}」超过 {size}',
  tooManyFiles: '最多选择 {count} 个文件',
  moreRejected: '另有 {count} 个文件未添加',
  reactions: '反应',
  addReaction: '添加反应',
  resolved: '已解决',
  added: '新增',
  removed: '已删除',
  modified: '已修改',
  renamed: '已重命名',
};

// 取界面文案；传入 vars 时替换 {name} 形式的占位符
export function t(key, vars) {
  const text = STRINGS[key] ?? key;
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
}

// 页面内自增 id
let uidSeq = 0;
export function uid(prefix = 'gh') {
  return `${prefix}-${++uidSeq}`;
}
