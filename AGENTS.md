# AGENTS.md

## 项目目标

这是一个本地静态辩论计时器。请优先维护源码文件：

- `index.html`
- `style.css`
- `app.js`

不要直接编辑构建产物，除非用户明确要求只改单 HTML。

## 必须遵守

- 回复用户时按用户语言。
- 改动保持最小范围。
- 不恢复环形显示功能。
- 不恢复计时器大小调节功能。
- 不把学校名显示回双计时器面板；双计时器只显示「正方 / 反方」。
- 双计时不要写死「一方归零自动接续对方」，必须走环节的 `duelFlow`（交锋 / 独立）。
- `ensureCoverStage()` 会换掉整个 `state.stages` 数组，之后必须重新 `renderStagesList()`，否则抽屉里的行会绑到已丢弃的环节对象上。
- 首页可以显示和编辑学校名。
- 修改后运行 `npm run check`。
- 如果需要更新单 HTML，运行 `npm run build`。

## 文件边界

- `dist/` 是构建产物。
- `legacy/bundled-legacy.html` 是旧版打包文件，只用于回滚参考。
- `辩论计时器（bj）.html` 是构建脚本生成的兼容入口。

## 开发流程

1. 修改 `index.html` / `style.css` / `app.js`。
2. 运行：

```powershell
npm run check
```

3. 如果需要单文件交付，运行：

```powershell
npm run build
```

4. 再检查 `dist/debate-timer.single.html` 和 `辩论计时器（bj）.html` 是否更新。

## 设计约束

- 首页是展示页，不是计时页。
- 首页隐藏导航、环节进度、开始按钮，但右上角保留设置、声音、全屏按钮（与其他页面一致），以及 Debate Timer 标识和「下一环节」。
- 单计时要保持大尺寸。
- 双计时要避免文字、重置按钮、进度条和数字重叠。
- 样式跟随主题变量，不写死无法切换的整页配色。

## Project guide: Jie's Debate Timer

### What it is
"Jie's Debate Timer": a static debate timer (single and dual timers, 7 themes) plus live audience voting (`vote.html`).

### Stack
- Plain HTML/CSS/JS, no framework: `index.html`, `style.css`, `app.js`; voting in `vote.html`, `vote-core.js`, `vote-host.js`
- Node scripts only for build/check (`scripts/`)
- Supabase for vote data (org "Debate Timer", project `debate-timer-vote`, ref jntofwvrdpsowrkigkxs, Singapore, free tier; on Kai's account, not Bing Jie's)

### Run locally
```
python -m http.server 8017 --bind 127.0.0.1   # open /index.html
npm run check    # static checks + duel-flow + vote-core tests; run before every push
npm run build    # writes dist/debate-timer.single.html and 辩论计时器（bj）.html; commit dist/
```

### Deploy
- Commit + push to `main` (no PRs).
- GitHub Pages updates automatically on push.
- Vercel project `debate-timer-vote` (linked via a local, untracked `.vercel/project.json`), auto-deploys on push; manual: `vercel deploy --prod --yes`. `vercel.json`: buildCommand `node scripts/gen-config.js` (writes `config.js` from env), outputDirectory `.`, cleanUrls.
- Vercel env var names: SUPABASE_URL, SUPABASE_ANON_KEY, optional VOTE_BASE_URL.

### Live URLs
- https://jie-coder.github.io/debate_timer/ (must not change)
- https://jie-debate-timer.vercel.app (primary Vercel URL)
- https://debate-timer-vote.vercel.app (old alias, keep)

### Gotchas
- `config.js` is committed (Pages needs it) and holds only the public anon key; `config.example.js` is the template. `.env.local` must never be committed.
- No `?v=` query strings on CSS/JS refs; `npm run check` fails. Ask the user to Ctrl+Shift+R instead.
- Check `git status` before committing: OpenCode once deleted `dist/`, and it tends to over-edit, so read the diff.
- No overlap at 720p, 1080p, 390px and all 7 themes; themed controls only.
- Settings live in localStorage.
- Reply to Bing Jie in Simplified Chinese with screenshots (`/workspace/debate-timer-shots/<date>/`).

### Owner
Peter · SWE (coding bot) for Bing Jie Tan (taken over from Kai, 2026-11-02).
