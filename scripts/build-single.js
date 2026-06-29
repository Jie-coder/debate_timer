const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const cssPath = path.join(root, 'style.css');
const jsPath = path.join(root, 'app.js');
const distDir = path.join(root, 'dist');

const rootSingleName = '辩论计时器（bj）.html';
const distSingleName = 'debate-timer.single.html';

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function buildSingleHtml() {
  let html = read(indexPath);
  const css = read(cssPath);
  const js = read(jsPath);

  html = html.replace(
    /<link rel="stylesheet" href="style\.css">\s*/u,
    `<style>\n${css}\n</style>\n`
  );
  html = html.replace(
    /\s*<script src="app\.js" defer><\/script>/u,
    `\n<script>\n${js.replace(/<\/script>/giu, '<\\/script>')}\n</script>`
  );

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
