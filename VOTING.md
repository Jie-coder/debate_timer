# 现场投票（观众扫码投票）

这是辩论计时器的一个可选附加功能：观众扫二维码投正方/反方，主持人在计时器页面的
投票面板里看实时票数、锁定初始立场、结束投票看结果。

实现方式是 Supabase Realtime 的 **Broadcast**（不是 Postgres 表，不建数据库），
所有票都是浏览器之间的实时广播消息，Supabase 只负责转发，不落库、不持久化。

## 1. 建 Supabase 项目

1. 打开 https://supabase.com ，新建一个项目（免费版即可）。
2. 项目建好后，打开 **Project Settings → Data API**，确认 Realtime 相关功能是
   开着的（新项目默认就是开的，不需要额外建表或开 Replication）。
3. 在 **Project Settings → API** 里拿到：
   - `Project URL`（形如 `https://xxxx.supabase.co`）
   - `anon public` key（不是 `service_role`，service_role 绝对不要放进前端）

Broadcast 不需要任何数据库表，`anon` key 默认就能发送/接收同一个 Realtime
channel 的广播消息。

## 2. 配置

把 `config.example.js` 复制一份改名成 `config.js`（已经在 `.gitignore` 里，
不会被提交），填入：

```js
window.DEBATE_VOTE_CONFIG = {
  SUPABASE_URL: 'https://xxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJ...',
  VOTE_BASE_URL: '', // 留空就用当前目录下的 vote.html，部署到 Vercel 后可以填完整域名
};
```

`index.html` 和 `vote.html` 都会尝试加载 `config.js`；这个文件不存在也不会报错，
投票面板会提示"投票还没有配置"，计时器本身照常工作。

## 3. 部署到 Vercel

投票功能需要 HTTPS（浏览器摄像头扫码、Realtime WebSocket 都需要），本地用
`file://` 直接打开只能自己多开几个标签页测，没法用手机真的扫码。

1. 把这个仓库连到 Vercel（Import Project）。
2. **Build Command** 填：

   ```
   node scripts/gen-config.js
   ```

   这个脚本会读环境变量生成 `config.js`（不需要装依赖，纯 Node 内置模块）。
3. 在 Vercel 项目的 **Environment Variables** 里加：
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `VOTE_BASE_URL`（可选，填 `https://你的域名/vote`，留空则自动用
     `https://你的域名/vote.html`）
4. `vercel.json` 已经开了 `cleanUrls`，所以部署后 `/vote?room=XXXXXX` 和
   `/vote.html?room=XXXXXX` 都能打开投票页，二维码里用的是不带 `.html` 的短链接。

部署完用主持人那台设备打开首页，点右上角的投票图标，面板里应该能看到房间码和
二维码，不再提示"未配置"。

## 4. 本地测试（不用真的部署）

1. `config.js` 配好之后，直接用浏览器打开 `index.html`（或者起一个本地静态
   服务器，比如 `npx serve .`，这样二维码里的链接是 `http://` 而不是
   `file://`，方便直接点开）。
2. 打开首页，点右上角投票图标 → 点"开始投票"，拿到房间链接。
3. 开几个新标签页，把房间链接粘进去模拟观众：
   - 点正方/反方，主持人面板的票数应该跟着动。
   - 再点另一边切换，票数应该跟着改，不会重复计数。
4. 主持人点"锁定初始立场"：面板上的票数条开始显示 `(+N)` / `(−N)` 这种变化量。
5. 测试断线恢复：刷新主持人那个标签页。面板应该从 `localStorage` 恢复房间、
   阶段和票数；重新连上 Realtime 之后会自动广播一次"同步"消息，前面开着的
   观众标签页收到后会自动重发一次自己当前的票，票数条应该很快恢复成刷新前的
   样子（断线期间如果有观众恰好改票，那一次改票会丢，因为 Broadcast 不落库，
   见下面的限制说明）。
6. 点"结束投票"，看结果视图（初始 vs 最终 vs 变化量、总人数），试一下导出
   JSON / CSV，历史记录里应该能看到这一条。

## 5. Supabase 免费版 Realtime 限制

TODO_LIMITS
