# GitHub UI

GitHub 风格的 Web Component 组件库：80+ 个自定义标签，原生 light DOM，零运行时依赖，深浅两套主题全部由设计令牌驱动。

```html
<script src="dist/gh-ui.js" defer></script>
<gh-btn variant="primary">主要按钮</gh-btn>
<gh-avatar src="avatar.svg"></gh-avatar>
<gh-label>bug</gh-label>
```

脚本会按自身路径注入 `dist/gh-ui.css`，只写标签、属性表达状态即可；弹层类（下拉、菜单、弹窗、浮层）的文案回填与开合由组件负责。

## 快速开始

```bash
npm install     # 安装 esbuild 与 @primer/octicons
npm run build   # 生成 dist/gh-ui.js（含图标）与 dist/gh-ui.css
npm run export  # 额外把 demo/index.html 打包成单文件 dist/gh-ui-demo.html
npm run export:trace  # 追溯工作台 demo/trace.html → dist/gh-ui-trace.html
node serve.mjs 8123
```

打开 <http://127.0.0.1:8123/demo/index.html> 看组件演示：

- 左侧组件目录：滚动高亮、关键词筛选、`/` 聚焦搜索、一键展开代码；
- 每个示例下方的「实现代码」由页面脚本从真实 DOM 反推，改示例即改代码；
- 右上角切换明暗主题，`?theme=light|dark` 可直接指定。

高级示例是完整拼出来的 GitHub Pull request 页面（tab、时间线、diff、CI 检查、侧栏卡片、弹层）：

- 在线版：`demo/advanced.html`（支持 `?theme`、`?tab=commits|checks|files`、`?open=search|labels|merge`）
- 单文件版：`dist/gh-ui-advanced.html`（内联全部 SVG 与脚本，可直接双击打开）

第二个整页示例是「团队项目智能追溯」工作台，用 `gh-trace` 串起需求 → 任务 → 代码 → 评审 → 发布：

- 在线版：`demo/trace.html`（支持 `?theme`、`?row=%23482` 直接打开某条需求的证据链）
- 单文件版：`dist/gh-ui-trace.html`（`npm run export:trace` 生成）

## 目录

```
src/
  components/     25 个模块，注册 86 个自定义标签
  styles/tokens.css      设计令牌（颜色 / 文字 / 圆角 / 阴影 / 动效 / 层级）
  styles/components.css  组件样式（全部引用令牌，不写裸色值）
  index.js        注册组件并挂暴露 window.GHUI
  icons.js        由 build-icons.mjs 生成的 Octicons 图标表（111 个）
demo/
  index.html      组件演示页（自动目录 / 锚点 / 代码展开）
  advanced.html   Pull request 高级示例
  trace.html      团队项目追溯工作台（gh-trace 整页示例）
dist/             构建产物与三个单文件 demo
```

## 主题

所有颜色都来自 `--gh-*` 令牌，暗色取值只有一份（`:root` 里的 `--gh-dark-*`），系统偏好与 `[data-gh-theme="dark"]` 两个作用域只做映射：

```html
<html data-gh-theme="dark">          <!-- 强制暗色 -->
<script>GHUI.setTheme('auto')</script> <!-- 跟随系统 -->
```

## 约定

- 行状态（当前项 / 选中 / 游标）统一用 `.gh-row` + `--gh-row-*` 令牌，`GHUI.current()` / `selected()` / `moveCursor()` 收编 aria 与类名。
- 浮层统一 `open()/close()/toggle()` 与 `open` 属性，`gh-dialog` / `gh-drawer` 保留 `show()` 别名。
- 输入类控件的聚焦态是同一句 1px 内描边，改令牌即可全局同步。
- 版本号在 `src/core.js` 的 `VERSION`，脚本注入 CSS 时会带上 `?v=` 便于缓存失效。
- 链路 / 流程类视图统一「胶囊 + 连接线」结构：`gh-trace` 的节点状态只用 `state`（ok / weak / missing / pending），
  连接线的颜色与线型由目标节点的 state 决定，断链与「推断」不再各造一套样式。

## 许可

见 [LICENSE](LICENSE)。
