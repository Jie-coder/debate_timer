# 辩论计时器

这是一个本地可运行的辩论计时器。当前仓库采用「方案 C」结构：源码拆成 `index.html`、`style.css`、`app.js`，再按需打包成单 HTML。

## 快速使用

直接打开：

- `index.html`

或使用本地服务器：

```powershell
python -m http.server 8017 --bind 127.0.0.1
```

然后访问：

```text
http://127.0.0.1:8017/index.html
```

## 常用命令

```powershell
npm run check
npm run build
```

`npm run build` 会生成：

- `dist/debate-timer.single.html`
- `辩论计时器（bj）.html`

## 当前功能

- 首页封面：可编辑比赛赛段、辩题、正方学校、反方学校。
- 单计时：固定大尺寸显示。
- 双计时：正反双方独立计时，界面只显示「正方 / 反方」，不显示学校名。
- 设置抽屉：主题、字体比例、环节流程、最多 3 个计时器预设、声音、快捷键。
- 本地存储：使用 `localStorage` 保存设置、流程、辩题、学校和预设。

## 已删除功能

以下功能已经从源码中移除，后续维护不要恢复旧分支：

- 环形显示模式。
- 计时器大小调节。
- 旧状态字段 `display`、`timerScale` 的实际使用。

旧 `localStorage` 如果带有这些字段，载入后会清理并重新保存。

## 文件说明

- `index.html`：页面结构，引用外部 CSS/JS。
- `style.css`：完整样式。
- `app.js`：应用状态、渲染、事件、计时逻辑。
- `scripts/build-single.js`：把源码打包成单 HTML。
- `scripts/check.js`：无依赖健康检查。
- `dist/`：构建产物。
- `legacy/bundled-legacy.html`：方案 C 重构前的原始打包文件，仅用于回滚参考。

## 开发原则

- 优先改源码文件，不直接改 `dist/` 或 `辩论计时器（bj）.html`。
- 改完后运行 `npm run check`。
- 需要交付单文件时运行 `npm run build`。
- 不引入框架，除非明确需要。
