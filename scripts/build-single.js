const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const cssPath = path.join(root, 'style.css');
const jsPath = path.join(root, 'app.js');
const voteCorePath = path.join(root, 'vote-core.js');
const voteHostPath = path.join(root, 'vote-host.js');
const distDir = path.join(root, 'dist');

const rootSingleName = '辩论计时器（bj）.html';
const distSingleName = 'debate-timer.single.html';

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function asInlineScript(js) {
  return `<script>\n${js.replace(/<\/script>/giu, '<\\/script>')}\n</script>\n`;
}

function buildSingleHtml() {
  let html = read(indexPath);
  const css = read(cssPath);
  const js = read(jsPath);
  const voteCoreJs = read(voteCorePath);
  const voteHostJs = read(voteHostPath);

  // Replacements go through a function so `$&`, `$'` etc. inside the CSS/JS
  // are never interpreted as replacement patterns.
  html = html.replace(
    /<link rel="stylesheet" href="style\.css">\s*/u,
    () => `<style>\n${css}\n</style>\n`
  );
  // vote-core.js / vote-host.js get inlined the same way as app.js (see below);
  // config.js and the CDN libraries (supabase-js, qrcode-generator) stay as
  // external <script src> references — config.js holds deploy-specific
  // secrets/URLs and the CDN libs are too big to bake into the bundle.
  html = html.replace(/\s*<script src="vote-core\.js" defer><\/script>/u, '');
  html = html.replace(/\s*<script src="vote-host\.js" defer><\/script>/u, '');
  // `defer` is ignored on inline scripts, so the bundle must be emitted at the
  // end of <body>. Inlining it into <head> makes it run before the markup
  // exists and every getElementById() at init returns null.
  html = html.replace(/\s*<script src="app\.js" defer><\/script>/u, '');
  const inlineJs = asInlineScript(voteCoreJs) + asInlineScript(voteHostJs) + asInlineScript(js);
  html = html.replace(/<\/body>/u, () => inlineJs + '</body>');

  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, distSingleName), html, 'utf8');
  fs.writeFileSync(path.join(root, rootSingleName), html, 'utf8');

  return {
    dist: path.join(distDir, distSingleName),
    root: path.join(root, rootSingleName),
    bytes: Buffer.byteLength(html),
  };
}

const result = buildSingleHtml();
console.log(JSON.stringify(result, null, 2));
