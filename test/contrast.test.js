const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const channel = (value) => {
    const v = value / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const r = channel((n >> 16) & 255);
  const g = channel((n >> 8) & 255);
  const b = channel(n & 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const left = luminance(a);
  const right = luminance(b);
  const [hi, lo] = left > right ? [left, right] : [right, left];
  return (hi + 0.05) / (lo + 0.05);
}

function block(css, selector) {
  const pattern = new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}');
  const found = css.match(pattern);
  assert.ok(found, 'missing ' + selector);
  const vars = {};
  for (const match of found[1].matchAll(/(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) vars[match[1]] = match[2];
  return vars;
}

test('the light pink palette meets WCAG AA and dark mode is gone', () => {
  const root = path.join(__dirname, '..');
  const css = fs.readFileSync(path.join(root, 'app.css'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
  assert.equal(css.includes('[data-theme="dark"]'), false);
  assert.equal(css.includes('prefers-color-scheme'), false);
  assert.equal(html.includes('prefers-color-scheme'), false);
  assert.equal(html.includes('cnr_theme'), false);
  assert.equal(app.includes('theme-btn'), false);
  assert.equal(app.includes('Switch to dark mode'), false);
  const theme = block(css, ':root');
  const textPairs = [
    ['--tx', '--bg'],
    ['--tx', '--card'],
    ['--tx', '--hv'],
    ['--tx', '--pri-soft'],
    ['--tx', '--panel'],
    ['--mu', '--bg'],
    ['--mu', '--card'],
    ['--mu', '--hv'],
    ['--mu', '--pri-soft'],
    ['--mu', '--panel'],
    ['--pri-tx', '--pri'],
    ['--pri-tx', '--ac'],
    ['--pri-tx', '--bad'],
    ['--ok', '--okb'],
    ['--wn', '--wnb'],
    ['--bad', '--badb'],
    ['--side-tx', '--side'],
    ['--side-mu', '--side']
  ];
  for (const [fg, bg] of textPairs) {
    const ratio = contrast(theme[fg], theme[bg]);
    assert.ok(ratio >= 4.5, theme[fg] + ' on ' + theme[bg] + ' is ' + ratio.toFixed(2));
  }
  assert.equal(theme['--bg'].toLowerCase(), '#fde7ef');
  assert.equal(theme['--card'].toLowerCase(), '#ffffff');
});
