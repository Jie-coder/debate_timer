// 给 Vercel 构建用：从环境变量生成 config.js。
// 构建命令设成: node scripts/gen-config.js
// 需要的环境变量：SUPABASE_URL, SUPABASE_ANON_KEY，可选 VOTE_BASE_URL。
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outPath = path.join(root, 'config.js');

function jsStr(v) {
  return JSON.stringify(v || '');
}

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const VOTE_BASE_URL = process.env.VOTE_BASE_URL || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('[gen-config] SUPABASE_URL / SUPABASE_ANON_KEY 未设置，生成的 config.js 里投票功能会保持未配置状态。');
}

const content = `// 由 scripts/gen-config.js 从环境变量自动生成，不要手动改，也不要提交到 git。
window.DEBATE_VOTE_CONFIG = {
  SUPABASE_URL: ${jsStr(SUPABASE_URL)},
  SUPABASE_ANON_KEY: ${jsStr(SUPABASE_ANON_KEY)},
  VOTE_BASE_URL: ${jsStr(VOTE_BASE_URL)},
};
`;

fs.writeFileSync(outPath, content, 'utf8');
console.log('[gen-config] wrote ' + outPath);
