// actions.js — 声明式开合：用属性代替内联 onclick
//   <gh-btn data-gh-open="demo-dialog">打开</gh-btn>
//   <gh-btn data-gh-open="#demo-drawer">打开</gh-btn>
//   <gh-btn data-gh-close>取消</gh-btn>             关闭最近的 gh-dialog / gh-drawer
//   <gh-btn data-gh-close="demo-dialog">关闭</gh-btn> 关闭指定弹层
const resolve = (ref) => {
  if (!ref) return null;
  return /^[#.[]/.test(ref) ? document.querySelector(ref) : document.getElementById(ref);
};

document.addEventListener('click', (e) => {
  const opener = e.target.closest('[data-gh-open]');
  if (opener) {
    const target = resolve(opener.getAttribute('data-gh-open'));
    if (target && typeof target.show === 'function') {
      e.preventDefault();
      target.show();
      return;
    }
  }

  const closer = e.target.closest('[data-gh-close]');
  if (closer) {
    const ref = closer.getAttribute('data-gh-close');
    const target = ref ? resolve(ref) : closer.closest('gh-dialog, gh-drawer');
    if (target && typeof target.close === 'function') {
      e.preventDefault();
      target.close();
    }
  }
});
