const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Score = require('../js/score.js');

let PGlite = null;
try {
  ({ PGlite } = require('@electric-sql/pglite'));
} catch (err) {
  PGlite = null;
}

const root = path.join(__dirname, '..');

function near(actual, expected, epsilon) {
  assert.ok(Number.isFinite(actual), 'expected a number, got ' + actual);
  assert.ok(Math.abs(actual - expected) <= (epsilon || 1e-6), actual + ' !~ ' + expected);
}

async function boot() {
  const db = new PGlite();
  await db.exec(`
    create schema if not exists auth;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text unique,
      raw_user_meta_data jsonb,
      encrypted_password text
    );
    create or replace function auth.uid() returns uuid
    language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin nosuperuser nobypassrls;
      end if;
      if not exists (select 1 from pg_roles where rolname = 'anon') then
        create role anon nologin nosuperuser nobypassrls;
      end if;
    end $$;
  `);
  await db.exec(fs.readFileSync(path.join(root, 'supabase/schema.sql'), 'utf8'));
  return db;
}

async function user(db, email, role, name) {
  const inserted = await db.query(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2::jsonb) returning id`,
    [email, JSON.stringify({ full_name: name })]
  );
  const id = inserted.rows[0].id;
  if (role !== 'viewer') {
    await db.query(`update public.profiles set role = $2 where id = $1`, [id, role]);
  }
  return id;
}

async function asUser(db, id, fn) {
  await db.exec(`select set_config('request.jwt.claim.sub', '${id}', false)`);
  await db.exec('set role authenticated');
  try {
    return await fn();
  } finally {
    try { await db.exec('reset role'); } catch (err) { await db.exec('rollback'); await db.exec('reset role'); }
  }
}

function expectThrow(promise, pattern) {
  return promise.then(
    () => { throw new Error('expected a database error matching ' + pattern); },
    (err) => {
      assert.match(String(err.message || err), pattern);
    }
  );
}

test('Postgres formula matches the JavaScript formula and RLS enforces roles', { skip: !PGlite && 'install @electric-sql/pglite to run the schema' }, async () => {
  const db = await boot();
  const admin = await user(db, 'admin@example.com', 'admin', 'Admin');
  const onboarder = await user(db, 'onboarder@example.com', 'onboarder', 'Onboarder');
  const qa = await user(db, 'qa@example.com', 'qa', 'QA');
  const viewer = await user(db, 'viewer@example.com', 'viewer', 'Viewer');

  const batch = await asUser(db, onboarder, async () => {
    const row = await db.query(`insert into public.batches (name) values ('October intake') returning id, name`);
    return row.rows[0];
  });

  await expectThrow(
    asUser(db, viewer, () => db.query(`insert into public.batches (name) values ('Nope')`)),
    /row-level security|permission denied/i
  );
  await expectThrow(
    asUser(db, qa, () => db.query(
      `insert into public.va_profiles (full_name, onboarding_start, status, batch_id) values ('No', '2026-10-12', 'Onboarding', $1)`,
      [batch.id]
    )),
    /row-level security|permission denied/i
  );

  const va = await asUser(db, onboarder, async () => {
    const row = await db.query(
      `insert into public.va_profiles
        (full_name, onboarding_start, onboarder_name, client_name, business_name, sop_or_portfolio, status, schedule, batch_id)
       values ('Ada Cruz', '2026-10-12', 'Sam', 'Northwind', 'Northwind Studio', 'https://example.com/sop', 'Onboarding', 'Mon–Fri 9–6', $1)
       returning id, status`,
      [batch.id]
    );
    return row.rows[0];
  });
  assert.equal(va.status, 'Onboarding');

  const history = await db.query(`select new_status, note from public.status_history where va_id = $1`, [va.id]);
  assert.equal(history.rows[0].new_status, 'Onboarding');
  assert.match(history.rows[0].note, /Added to the monitoring sheet/);

  async function openWeek(week) {
    const row = await asUser(db, onboarder, () => db.query(
      `insert into public.weekly_evaluations (va_id, week_start) values ($1, $2) returning id`,
      [va.id, week]
    ));
    return row.rows[0].id;
  }

  const week1 = await openWeek('2026-10-12');

  async function snap(evaluationId) {
    const row = await db.query(`select public.compute_kpi_snapshot($1) as snap`, [evaluationId]);
    return row.rows[0].snap;
  }

  function expectScore(actual, scores) {
    const expected = Score.scoreEvaluation({ scores, weights: Score.DEFAULT_WEIGHTS, passMark: 80 });
    if (expected.overall == null) assert.equal(actual.overall, null);
    else near(Number(actual.overall), expected.overall);
    assert.equal(actual.passed, expected.passed);
    assert.equal(actual.rescaled, expected.rescaled);
    assert.equal(actual.passMark, 80);
    expected.breakdown.forEach((row, index) => {
      const got = actual.breakdown[index];
      assert.equal(got.key, row.key);
      assert.equal(got.included, row.included);
      near(Number(got.effectiveWeight), row.effectiveWeight);
      if (row.score == null) assert.equal(got.score, null);
      else near(Number(got.score), row.score);
    });
  }

  await asUser(db, onboarder, () => db.query(
    `insert into public.attendance_days (va_id, work_date, absent, late_minutes, downtime_minutes)
     values ($1, '2026-10-12', false, 0, 0)`,
    [va.id]
  ));
  expectScore(await snap(week1), { attendance: 100 });

  await asUser(db, onboarder, () => db.query(
    `update public.attendance_days set late_minutes = 48, downtime_minutes = 0 where va_id = $1 and work_date = '2026-10-12'`,
    [va.id]
  ));
  expectScore(await snap(week1), { attendance: 90 });

  await asUser(db, onboarder, () => db.query(
    `update public.attendance_days set absent = true, late_minutes = 30, downtime_minutes = 30 where va_id = $1 and work_date = '2026-10-12'`,
    [va.id]
  ));
  expectScore(await snap(week1), { attendance: 0 });

  await asUser(db, onboarder, () => db.query(
    `insert into public.attendance_days (va_id, work_date, absent, late_minutes, downtime_minutes)
     values ($1, '2026-10-13', false, 240, 0)`,
    [va.id]
  ));
  expectScore(await snap(week1), { attendance: 25 });

  await asUser(db, onboarder, () => db.query(
    `insert into public.weekly_wbr (evaluation_id, total_leads, converted_leads) values ($1, 10, 4)`,
    [week1]
  ));
  expectScore(await snap(week1), { attendance: 25, conversion: 40 });

  await asUser(db, onboarder, () => db.query(
    `update public.weekly_wbr set total_leads = 0, converted_leads = 3 where evaluation_id = $1`,
    [week1]
  ));
  expectScore(await snap(week1), { attendance: 25 });

  await asUser(db, onboarder, () => db.query(
    `update public.weekly_wbr set total_leads = 8, converted_leads = 12 where evaluation_id = $1`,
    [week1]
  ));
  expectScore(await snap(week1), { attendance: 25, conversion: 100 });

  await expectThrow(
    asUser(db, onboarder, () => db.query(
      `insert into public.weekly_qa (evaluation_id, score, form_url) values ($1, 90, 'https://example.com/form')`,
      [week1]
    )),
    /row-level security|permission denied/i
  );

  await asUser(db, qa, () => db.query(
    `insert into public.weekly_qa (evaluation_id, score, form_url, recording_url)
     values ($1, 79.99, 'https://example.com/form', '')`,
    [week1]
  ));
  expectScore(await snap(week1), { attendance: 25, conversion: 100, qa: 79.99 });

  await asUser(db, onboarder, () => db.query(
    `insert into public.weekly_competencies
      (evaluation_id, tool_navigation, tool_navigation_comment, communication, communication_comment,
       critical_thinking, critical_thinking_comment, core_values, core_values_comment)
     values ($1, 100, 'Clicks are sure.', 80, 'Clear with the client.', 70, 'Asks why.', null, 'Still watching this.')`,
    [week1]
  ));
  expectScore(await snap(week1), {
    attendance: 25,
    conversion: 100,
    qa: 79.99,
    tool_navigation: 100,
    communication: 80,
    critical_thinking: 70
  });

  await asUser(db, onboarder, () => db.query(
    `update public.weekly_wbr set total_leads = null, converted_leads = null where evaluation_id = $1`,
    [week1]
  ));
  const low = await snap(week1);
  expectScore(low, {
    attendance: 25,
    qa: 79.99,
    tool_navigation: 100,
    communication: 80,
    critical_thinking: 70
  });
  assert.equal(low.passed, false);
  assert.ok(Number(low.overall) < 80);

  await expectThrow(
    asUser(db, onboarder, () => db.query(
      `select public.close_weekly_evaluation($1, '  ', '')`,
      [week1]
    )),
    /Gaps and coaching actions are required/
  );
  const stillOpen = await db.query(`select status from public.weekly_evaluations where id = $1`, [week1]);
  assert.equal(stillOpen.rows[0].status, 'open');
  const statusAfterFail = await db.query(`select status from public.va_profiles where id = $1`, [va.id]);
  assert.equal(statusAfterFail.rows[0].status, 'Onboarding');

  const closed = await asUser(db, onboarder, () => db.query(
    `select public.close_weekly_evaluation($1, 'Late two days and a thin QA score.', 'Shadow the dialer on Wednesday.') as result`,
    [week1]
  ));
  assert.equal(closed.rows[0].result.vaStatus, 'Continue onboarding');
  assert.equal(closed.rows[0].result.passed, false);
  const afterClose = await db.query(
    `select status, outcome, score_snapshot->>'passed' as passed from public.weekly_evaluations where id = $1`,
    [week1]
  );
  assert.equal(afterClose.rows[0].status, 'closed');
  assert.equal(afterClose.rows[0].outcome, 'continue_onboarding');
  const vaAfter = await db.query(`select status from public.va_profiles where id = $1`, [va.id]);
  assert.equal(vaAfter.rows[0].status, 'Continue onboarding');

  await expectThrow(
    asUser(db, onboarder, () => db.query(
      `update public.attendance_days set late_minutes = 0 where va_id = $1 and work_date = '2026-10-12'`,
      [va.id]
    )),
    /That day is in a closed week/
  );
  await expectThrow(
    asUser(db, qa, () => db.query(
      `update public.weekly_qa set score = 100 where evaluation_id = $1`,
      [week1]
    )),
    /This week is closed/
  );

  await expectThrow(
    asUser(db, qa, () => db.query(`select public.endorse_va($1)`, [va.id])),
    /Your role cannot do that/
  );

  const week2 = await asUser(db, onboarder, async () => {
    const opened = await db.query(
      `insert into public.weekly_evaluations (va_id, week_start) values ($1, '2026-10-19') returning id`,
      [va.id]
    );
    return opened.rows[0].id;
  });
  await expectThrow(
    asUser(db, onboarder, () => db.query(
      `insert into public.weekly_qa (evaluation_id, score, form_url) values ($1, 80, 'https://example.com/form-2')`,
      [week2]
    )),
    /row-level security|permission denied/i
  );
  await asUser(db, qa, () => db.query(
    `insert into public.weekly_qa (evaluation_id, score, form_url, recording_url)
     values ($1, 80, 'https://example.com/form-2', 'https://example.com/call')`,
    [week2]
  ));
  expectScore(await snap(week2), { qa: 80 });

  const ready = await asUser(db, onboarder, () => db.query(
    `select public.close_weekly_evaluation($1, '', '') as result`,
    [week2]
  ));
  assert.equal(ready.rows[0].result.vaStatus, 'Ready for endorsement');
  assert.equal(ready.rows[0].result.passed, true);
  const readyStatus = await db.query(`select status from public.va_profiles where id = $1`, [va.id]);
  assert.equal(readyStatus.rows[0].status, 'Ready for endorsement');

  await expectThrow(
    asUser(db, onboarder, () => db.query(`select public.endorse_va($1)`, [va.id])),
    /Your role cannot do that/
  );
  await asUser(db, admin, () => db.query(`select public.endorse_va($1)`, [va.id]));
  const endorsed = await db.query(
    `select status, endorsed_by from public.va_profiles where id = $1`,
    [va.id]
  );
  assert.equal(endorsed.rows[0].status, 'Endorsed');
  assert.equal(endorsed.rows[0].endorsed_by, admin);
  const endorseNote = await db.query(
    `select note, changed_by, new_status from public.status_history where va_id = $1 order by changed_at desc limit 1`,
    [va.id]
  );
  assert.equal(endorseNote.rows[0].new_status, 'Endorsed');
  assert.equal(endorseNote.rows[0].note, 'Endorsed');
  assert.equal(endorseNote.rows[0].changed_by, admin);

  await expectThrow(
    db.query(`update public.app_settings set value = '{"passMark":80,"weights":{"attendance":90}}'::jsonb where key = 'kpi'`),
    /Weights must sum to 100/
  );
  const second = await user(db, 'admin2@example.com', 'admin', 'Second');
  await db.query(`update public.profiles set role = 'viewer' where id = $1`, [second]);
  await expectThrow(
    db.query(`update public.profiles set role = 'viewer' where id = $1`, [admin]),
    /The last admin cannot be demoted/
  );

  await expectThrow(
    asUser(db, admin, () => db.query(
      `update public.weekly_evaluations set status = 'open' where id = $1`,
      [week2]
    )),
    /permission denied|row-level security/i
  );

  await expectThrow(
    db.exec(fs.readFileSync(path.join(root, 'supabase/reset_old_schema.sql'), 'utf8')),
    /Backup first/
  );
  await db.exec('rollback');
  await expectThrow(
    db.exec(fs.readFileSync(path.join(root, 'supabase/grant_first_admin.sql'), 'utf8')),
    /Edit the email/
  );
  const stillThere = await db.query(`select to_regclass('public.va_profiles') as name`);
  assert.equal(stillThere.rows[0].name, 'va_profiles');
  const accounts = await db.query(`select count(*)::int as n from auth.users`);
  assert.equal(accounts.rows[0].n, 5);
});
