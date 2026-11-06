// export-demo.mjs — 生成自包含页面：把 dist/gh-ui.js + gh-ui.css 内联进单个 HTML
// 用法：
//   node export-demo.mjs                                  → demo/index.html  → dist/gh-ui-demo.html
//   node export-demo.mjs demo/test-combo.html dist/x.html → 任意页面打包
// 产物不依赖任何外部文件，可直接分发/离线打开
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(root, p), 'utf8');

const input = process.argv[2] || 'demo/index.html';
const output = process.argv[3] || 'dist/gh-ui-demo.html';

let html = read(input);
const js = read('dist/gh-ui.js');
const css = read('dist/gh-ui.css');

// 防止内联脚本里出现 </script> 提前闭合标签
if (/<\/script/i.test(js)) throw new Error('bundle 中包含 </script>，不能直接内联');

// demo/ 目录里的本地 SVG（头像、图标）→ data URI，页面里没用到就跳过
const demoDir = resolve(root, 'demo');
if (existsSync(demoDir)) {
  for (const file of readdirSync(demoDir)) {
    if (!file.endsWith('.svg') || !html.includes(file)) continue;
    const uri = `data:image/svg+xml,${encodeURIComponent(readFileSync(resolve(demoDir, file), 'utf8')).replace(/'/g, '%27')}`;
    for (const attr of ['src', 'avatar']) {
      html = html.replaceAll(`${attr}="${file}"`, `${attr}="${uri}"`);
    }
    // 页内脚本里可能用单引号字面量引用（比如动态插入评论头像）
    html = html.replaceAll(`'${file}'`, `'${uri}'`);
  }
}

// 外链脚本 → 内联 <style> + <script>（允许带 ?v= 版本号）
const scriptTag = /<script defer src="\.\.\/dist\/gh-ui\.js(?:\?[^"]*)?"><\/script>/;
if (!scriptTag.test(html)) throw new Error(`${input} 中未找到 gh-ui.js 引用，请检查`);
// 样式留在 head；脚本挪到 </body> 之前，保证页面里的「抓源码」脚本先执行完
html = html.replace(scriptTag, `<style>\n${css}\n</style>`);
html = html.replace('</body>', `<script>\n${js}\n</script>\n</body>`);

writeFileSync(resolve(root, output), html);
console.log(`exported ${output},`, (html.length / 1024).toFixed(1) + 'KB');
