// 从 node_modules/@primer/octicons 提取常用 16px 图标，生成 src/icons.js
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const svgDir = resolve(__dirname, 'node_modules/@primer/octicons/build/svg');

// 白名单：图标名 = octicon 文件名（-16 后缀由脚本补）
const NAMES = [
  'check', 'x', 'alert', 'info', 'triangle-down', 'chevron-down', 'chevron-right',
  'chevron-left', 'chevron-up', 'search', 'star', 'star-fill', 'repo', 'git-branch',
  'git-commit', 'git-pull-request', 'issue-opened', 'issue-closed', 'person', 'people',
  'organization', 'mark-github', 'three-bars', 'link', 'copy', 'pencil', 'trash',
  'plus', 'tag', 'mail', 'bell', 'download', 'upload', 'sync', 'play', 'code',
  'eye', 'eye-closed', 'heart', 'light-bulb', 'rocket', 'shield', 'gear', 'home', 'file',
  'file-directory', 'book', 'calendar', 'clock', 'location', 'comment',
  'comment-discussion', 'dot-fill', 'lock', 'unlock', 'archive', 'package',
  'terminal', 'zap', 'flame', 'gift', 'history', 'inbox', 'kebab-horizontal',
  'note', 'pin', 'project', 'quote', 'shield-check', 'sign-in', 'sign-out',
  'list-unordered', 'table', 'sliders', 'git-merge', 'apps',
  'skip', 'stop', 'sun', 'moon', 'video', 'webhook', 'workflow', 'dashboard',
  'dependabot', 'smiley', 'globe', 'arrow-switch',
  'paper-airplane', 'check-circle', 'sparkle', 'cpu',
  'desktop-download', 'file-zip', 'question',
  'milestone', 'stack', 'mention', 'sidebar-expand', 'sidebar-collapse', 'project-roadmap',
  // gh-editor 工具条/提示用
  'bold', 'italic', 'heading', 'list-ordered', 'tasklist', 'image',
  'cross-reference', 'undo', 'redo', 'markdown',
];

const entries = [];
const missing = [];

for (const name of NAMES) {
  const file = resolve(svgDir, `${name}-16.svg`);
  if (!existsSync(file)) { missing.push(name); continue; }
  const svg = readFileSync(file, 'utf8');
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();
  const vb = svg.match(/viewBox="([^"]+)"/)?.[1] || '0 0 16 16';
  entries.push(`  ${JSON.stringify(name)}: { vb: ${JSON.stringify(vb)}, body: ${JSON.stringify(inner)} },`);
}

const out = `// 由 build-icons.mjs 自动生成，来源 @primer/octicons v19（勿手改）
export const ICONS = {
${entries.join('\n')}
};

export function registerIcon(name, svg) {
  const m = String(svg).match(/^[\s\S]*?<svg([^>]*)>([\s\S]*?)<\/svg>\s*$/i);
  const vb = m && /viewBox="([^"]+)"/.exec(m[1]);
  ICONS[name] = { vb: vb ? vb[1] : '0 0 16 16', body: m ? m[2].trim() : String(svg).trim() };
}

export function iconSvg(name, size = 16) {
  const icon = ICONS[name];
  if (!icon) return '';
  const [ , , w, h ] = icon.vb.split(' ').map(Number);
  return \`<svg viewBox="\${icon.vb}" width="\${size}" height="\${Math.round(size * h / w)}" fill="currentColor" aria-hidden="true">\${icon.body}</svg>\`;
}
`;

writeFileSync(resolve(__dirname, 'src/icons.js'), out);
console.log(`generated ${entries.length} icons`);
if (missing.length) console.log('missing (skipped):', missing.join(', '));
