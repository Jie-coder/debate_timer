# Architecture

## 目标

本项目从单个巨大打包 HTML 拆成可维护源码。目标是让后续 agent 能直接修改源码，而不是在 JSON 字符串模板里做补丁。

## 运行方式

`index.html` 通过普通静态资源加载：

```text
index.html -> style.css
index.html -> app.js
```

没有构建依赖、没有框架、没有后端。

## 构建方式

`scripts/build-single.js` 会读取：

- `index.html`
- `style.css`
- `app.js`

然后把 CSS 和 JS 内联，输出：

- `dist/debate-timer.single.html`
- `辩论计时器（bj）.html`

`辩论计时器（bj）.html` 是为了兼容用户原来的打开路径。

CSS 内联到原 `<link>` 的位置，JS 必须内联到 `</body>` 之前 —— `defer` 对内联脚本
无效，放进 `<head>` 的话脚本会在 `<body>` 之前执行，初始化时每个
`getElementById()` 都拿到 null，整页空白。`check` 里有对应断言。

## JavaScript 结构

`app.js` 是一个 IIFE，避免向全局暴露状态。

主要区域：

- constants/state：默认环节、运行状态。
- storage：`saveState()`、`loadState()`、预设存储。
- audio：提示音和倒计时声音。
- render：`renderCover()`、`renderSingle()`、`renderDuel()`、`renderModeTabs()`。
- timer loop：`loop()`、`checkBeeps()`、`handleTimeUp()`。
- controls：开始、重置、上一环节、下一环节。
- drawer：设置抽屉和环节编辑。
- init：加载状态、渲染、绑定事件。

## 状态模型

核心状态对象是 `state`：

- `stages`：环节列表。
- `currentId`：当前环节 ID。
- `theme`：主题。
- `fontScale`：字体比例。
- `sound` / `tick` / `autoFlow`：声音和自动流程配置。
- `topic`：辩题。
- `matchStage`：比赛赛段。
- `proName` / `conName`：正反方学校名，只用于首页和设置。
- `remaining`：单计时剩余秒数。
- `duel`：双计时剩余秒数和当前方。

环节对象里还有一个可选字段 `duelFlow`：

```text
'relay' 交锋 —— 一方归零后自动接续对方
'solo'  独立 —— 一方归零后停下，对方剩余时间原地保留
```

只有用户在抽屉里点过「交锋 / 独立」徽章才会写进环节对象。没写的交给
`duelFlowOf()` 按环节名推断（`SOLO_NAME_HINTS` / `RELAY_NAME_HINTS`），
所以改名之后默认值会跟着改，手动设过的一直保留。判断顺序是先独立后交锋，
这样「攻辩小结」这种两边关键词都命中的名字会算独立。

首页是一个特殊环节：

```js
{ id: 'cover', name: '首页', type: 'cover', duration: 0 }
```

`ensureCoverStage()` 会保证旧流程也自动补上首页，并固定它在列表最前面。

## LocalStorage

主状态键：

```text
debate-timer-v2
```

预设键：

```text
debate-timer-v2-presets
```

兼容逻辑：

- 旧 `display` 字段会删除。
- 旧 `timerScale` 字段会删除。
- 旧流程如果没有 `cover` 环节，会自动插入。

## CSS 结构

`style.css` 分为三层：

- 基础变量和基础组件。
- vintage/festival 风格覆盖。
- 当前维护规则：cover 专属布局、双计时布局、响应式规则。

首页专属隐藏规则都以这个选择器开头：

```css
body[data-screen="cover"]
```

这样不会影响单计时或双计时页面。

## 验证

运行：

```powershell
npm run check
npm run build
```

`check` 会验证：

- `app.js` 语法。
- `index.html` 正确引用 CSS/JS。
- cover 和双计时关键规则存在。
- 环形/大小调节旧功能没有残留。
- 没有 `??` 乱码标记。

`check` 之后还会跑 `scripts/test-duel-flow.js`：把 `app.js` 装进一个手写的
假 DOM 里，用可控的 `requestAnimationFrame` 时间戳把 10 秒环节瞬间烧完，
验证交锋 / 独立两种结束行为、关键词推断、以及抽屉里的改动能真正落到
`state.stages`。没有任何第三方依赖。
