'use strict';
const assert = require('node:assert/strict');
const L = require('../labels.js');

const ids = ['2026-08', '2026-09', '2026-10'];

assert.equal(L.defaultBatchLabel('2026-08', ids), 'Batch 1 · Aug 2026');
assert.equal(L.defaultBatchLabel('2026-09', ids), 'Batch 2 · Sep 2026');
assert.equal(L.defaultBatchLabel('2026-10', ids), 'Batch 3 · Oct 2026');
assert.match(L.batchLabel('2026-09', {}, ids), /^Batch 2 · /);
assert.equal(L.batchLabel('', {}, ids), 'Unassigned');
assert.equal(L.batchLabel(null, {}, ids), 'Unassigned');

assert.equal(L.batchLabel('2026-09', { '2026-09': 'September intake' }, ids), 'September intake');
assert.equal(L.batchLabel('2026-08', { '2026-09': 'September intake' }, ids), 'Batch 1 · Aug 2026');

const trimmed = L.renameBatch({}, '2026-09', '  September   intake  ', ids);
assert.equal(trimmed.ok, true);
assert.equal(trimmed.names['2026-09'], 'September intake');
assert.deepEqual(Object.keys(trimmed.names), ['2026-09']);

const cleared = L.renameBatch(trimmed.names, '2026-09', '   ', ids);
assert.equal(cleared.ok, true);
assert.equal(cleared.names['2026-09'], undefined);
assert.equal(L.batchLabel('2026-09', cleared.names, ids), 'Batch 2 · Sep 2026');

const named = L.renameBatch({}, '2026-08', 'August intake', ids);
const dup = L.renameBatch(named.names, '2026-09', 'august intake', ids);
assert.equal(dup.ok, false);
assert.match(dup.error, /already called/i);
assert.equal(dup.names['2026-09'], undefined);
assert.equal(dup.names['2026-08'], 'August intake');

const tooLong = L.renameBatch({}, '2026-09', 'x'.repeat(81), ids);
assert.equal(tooLong.ok, false);
assert.equal(tooLong.names['2026-09'], undefined);

const parsed = L.normalizeBatchNames('{"2026-09":"  September intake  ","2026-08":"  "}');
assert.deepEqual(parsed, { '2026-09': 'September intake' });
assert.deepEqual(L.normalizeBatchNames(null), {});
assert.deepEqual(L.normalizeBatchNames(['nope']), {});
assert.equal(L.batchLabel('2026-09', '{"2026-09":"September intake"}', ids), 'September intake');

const kept = L.renameBatch({ '2026-09': 'September intake' }, '2026-09', 'September intake', ids);
assert.equal(kept.ok, true);
assert.equal(kept.names['2026-09'], 'September intake');

console.log('label tests passed');
