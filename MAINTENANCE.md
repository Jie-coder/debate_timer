# Maintenance

## 修改 UI

改 `style.css`。

首页专属规则使用：

```css
body[data-screen="cover"]
```

双计时专属规则使用：

```css
.stage-duel
```

## 修改功能

改 `app.js`。

常见入口：

- `renderCover()`：首页。
- `renderSingle()`：单计时。
- `renderDuel()`：双计时。
- `renderStagesList()`：设置里的环节列表。
- `saveState()` / `loadState()`：本地存储。

## 发布单文件

运行：

```powershell
npm run build
```

输出：

- `dist/debate-timer.single.html`
- `辩论计时器（bj）.html`

## 验证清单

每次完成后至少运行：

```powershell
npm run check
```

如果改了布局，手动打开：

```text
index.html
```

检查：

- 首页是否只显示 Debate Timer 标识和下一环节按钮。
- 单计时数字是否足够大。
- 双计时数字是否不被标题、重置、进度条遮挡。
- 设置抽屉是否还能打开。
- 保存预设是否还能使用。

## GitHub

首次推送前需要确认仓库可见性：public 或 private。
