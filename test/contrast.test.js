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

test('light and dark color pairs meet WCAG AA', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'app.css'), 'utf8');
  const light = block(css, ':root');
  const dark = Object.assign({}, light, block(css, ':root[data-theme="dark"]'));
  const textPairs = [
    ['--tx', '--bg'],
    ['--tx', '--card'],
    ['--tx', '--hv'],
    ['--tx', '--pri-soft'],
    ['--mu', '--bg'],
    ['--mu', '--card'],
    ['--mu', '--hv'],
    ['--pri-tx', '--pri'],
    ['--ok', '--okb'],
    ['--wn', '--wnb'],
    ['--bad', '--badb'],
    ['--side-tx', '--side'],
    ['--side-mu', '--side']
  ];
  for (const theme of [light, dark]) {
    for (const [fg, bg] of textPairs) {
      const ratio = contrast(theme[fg], theme[bg]);
      assert.ok(ratio >= 4.5, theme[fg] + ' on ' + theme[bg] + ' is ' + ratio.toFixed(2));
    }
  }
  assert.ok(contrast('#ffffff', light['--ac']) >= 4.5, 'light accent button');
  assert.ok(contrast('#1c1917', dark['--ac']) >= 4.5, 'dark accent button');
});
