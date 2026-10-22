// 现场投票功能的配置模板。
// 复制为 config.js（已加入 .gitignore，不会被提交），填入真实值。
// index.html 和 vote.html 都会尝试加载 config.js；文件不存在也不会报错，
// 只是投票面板会提示"投票未配置"。
window.DEBATE_VOTE_CONFIG = {
  SUPABASE_URL: '',
  SUPABASE_ANON_KEY: '',
  // 观众投票页地址，留空则用当前页面所在目录下的 vote.html。
  // 例如部署在 Vercel 后可以填 'https://your-app.vercel.app/vote'
  VOTE_BASE_URL: '',
};
