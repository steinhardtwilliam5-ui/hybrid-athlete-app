(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const copy = value => JSON.parse(JSON.stringify(value));
  const number = value => value === '' || value == null ? null : Number(value);
  const round25 = n => Math.round(Number(n || 0) / 2.5) * 2.5;
  const kg = n => `${round25(n).toFixed(1)} kg`;
  const fmt = (n, digits = 1) => Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });
  const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const dateLabel = (date, options = { day: 'numeric', month: 'short' }) => date
    ? new Date(`${date}T12:00:00`).toLocaleDateString(undefined, options) : 'Date unavailable';
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const PHASES = ['Rebuild', 'Build', 'Build', 'Intensify', 'Peak', 'Max test'];
  const CYCLE_FIELDS = ['settings', 'cycle', 'cycles', 'program', 'templates', 'exercises', 'schedule', 'workouts', 'exerciseLogs', 'enduranceLogs', 'reports', 'legacyExerciseDates', 'legacyRunDates'];
  const OLD_KEY = 'hybrid-athlete-v3';
  const MIGRATION_KEY = 'hybrid-athlete-v2-local-import-complete';
  const CACHE_KEY = 'hybrid-athlete-v2-cache';
  const STORE = 'hybrid-athlete-v3.0';
  const active = {
    view: 'today', returnView: 'today', week: null, day: null, workout: null,
    loading: true, data: null, user: null, queue: {}, error: '', saveError: '',
    open: new Set(), drafts: new Map(), analytics: 'strength', range: 42, block: 'all',
    lift: '', timerEnd: 0, toast: 0
  };
  let loadTask, drainTask, debounce;
  const client = window.supabase?.createClient(
    'https://esowgrsjzsqloavclikf.supabase.co',
    'sb_publishable_YJUUarFMm2lKVJsInI5kXQ_nCXbMJpb',
    { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
  );

  const ICONS = {
    today: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/>',
    plan: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M4 10h16m-11 5h2m3 0h2"/>',
    progress: '<path d="M4 19V5m0 14h16M7 15l4-4 3 2 5-6m-4 0h4v4"/>',
    coach: '<path d="m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7L12 2Z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="m9 3-.6 2.3-2 1.2L4 6l-2 3.5 1.7 1.6v2L2 14.5 4 18l2.4-.5 2 1.2L9 21h4l.6-2.3 2-1.2 2.4.5 2-3.5-1.7-1.4v-2L20 9.5 18 6l-2.4.5-2-1.2L13 3Z"/>',
    strength: '<path d="m4 7 3 3m7 7 3 3M7 4l3 3m7 7 3 3M5 11l6-6m2 14 6-6m-9-3 4 4M3 9l6-6m6 18 6-6"/>',
    run: '<circle cx="16" cy="5" r="2"/><path d="m4 12 4-4 4 1 3 4h5m-8-4-3 6 4 2 1 4m-5-6-3 4H2"/>',
    recovery: '<path d="M4 15c7 1 12-3 15-10 2 7-1 13-8 13-3 0-5-1-7-3Zm2 5 7-7"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
    back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
    check: '<path d="m5 12 4 4 10-10"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    refresh: '<path d="M19 10a7 7 0 1 0 0 4m0-8v4h-4"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    edit: '<path d="m13 5 6 6M4 20l4-1 12-12-4-4L4 15l-1 5Z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    swap: '<path d="M4 8h15m-4-4 4 4-4 4M20 16H5m4-4-4 4 4 4"/>'
  };
  function icon(name, size = 19) {
    return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.strength}</svg>`;
  }
  const btn = (label, action, cls = '', symbol = '') => `<button type="button" class="btn ${cls}" data-action="${action}">${symbol ? icon(symbol, 16) : ''}${esc(label)}</button>`;
  const actionIcon = (label, action, symbol) => `<button type="button" class="iconBtn" data-action="${action}" aria-label="${esc(label)}" title="${esc(label)}">${icon(symbol, 16)}</button>`;
  const rowIcon = type => `<span class="rowIcon ${esc(type)}">${icon(type, 17)}</span>`;
  const page = (label, title, detail = '', action = '') => `<div class="pageHead"><div><div class="eyebrow"><span class="line"></span>${esc(label)}</div><h1>${esc(title)}</h1>${detail ? `<p>${esc(detail)}</p>` : ''}</div>${action}</div>`;
  const empty = text => `<div class="empty">${esc(text)}</div>`;
  const notice = (text, type = '') => `<div class="notice ${type}">${esc(text)}</div>`;
  const meter = (done, total, label) => `<div class="meter" role="progressbar" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="${Math.max(total, 1)}" aria-valuenow="${Math.min(done, total)}"><i style="width:${total ? Math.min(100, done / total * 100) : 0}%"></i></div>`;
  const storageKey = part => `${STORE}:${part}:${active.user?.id}`;
  function readJSON(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; }
    catch { return fallback; }
  }

  function setTheme(theme) {
    const selected = theme === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = selected;
    $('meta[name="theme-color"]').content = selected === 'light' ? '#f1f3ed' : '#101310';
    try { localStorage.setItem(`${STORE}:theme`, selected); } catch {}
  }

  function toast(text) {
    const el = $('#toast');
    el.textContent = text;
    el.hidden = false;
    clearTimeout(active.toast);
    active.toast = setTimeout(() => { el.hidden = true; }, 4400);
  }

  function sync() {
    const el = $('#syncBadge');
    const count = Object.keys(active.queue).length;
    let label = 'Up to date';
    let tone = 'synced';
    if (!active.user) { label = active.loading ? 'Connecting' : 'Signed out'; tone = ''; }
    else if (!navigator.onLine) { label = count ? `Offline · ${count} pending` : 'Offline'; tone = 'warning'; }
    else if (active.saveError) { label = 'Sync needs attention'; tone = 'warning'; }
    else if (drainTask) { label = 'Syncing'; tone = ''; }
    else if (count) { label = `${count} pending`; tone = ''; }
    else if (active.loading) { label = 'Refreshing'; tone = ''; }
    else if (active.error) { label = 'Cloud unavailable'; tone = 'warning'; }
    el.textContent = label;
    el.className = `sync ${tone}`;
    el.title = active.saveError || active.error;
  }

  function switchUser(user) {
    if (active.user?.id !== user?.id) {
      clearTimeout(debounce);
      active.user = user;
      active.data = user ? readJSON(storageKey('cache')) : null;
      const previous = user && readJSON(CACHE_KEY);
      if (!active.data && previous?.settings?.user_id === user?.id && user) {
        active.data = Object.fromEntries(CYCLE_FIELDS.map(key => [key, previous[key] ?? []]));
        active.data.cycles = active.data.cycle ? [active.data.cycle] : [];
      }
      active.queue = user ? readJSON(storageKey('queue'), {}) : {};
      active.week = null;
      active.day = null;
      active.workout = null;
      active.open.clear();
      active.drafts.clear();
      active.saveError = '';
      active.block = 'all';
      active.lift = '';
      active.coachWeek = null;
      for (const section of $$('.view')) section.replaceChildren();
      const dialog = $('#editor');
      if (dialog.open) dialog.close();
      dialog.replaceChildren();
      if (active.view === 'workout') show('today', false);
    } else {
      active.user = user;
    }
  }

  function cache() {
    if (!active.user || !active.data) return;
    try { localStorage.setItem(storageKey('cache'), JSON.stringify(active.data)); } catch {}
  }

  function checked(result) {
    if (result.error) throw result.error;
    return result.data;
  }

  async function allRows(table, user, options = {}) {
    const batchSize = 500;
    const rows = [];
    for (let offset = 0; ; offset += batchSize) {
      let query = client.from(table).select(options.columns || '*').eq('user_id', user);
      if (options.where) for (const [key, value] of Object.entries(options.where)) query = query.eq(key, value);
      if (options.order) query = query.order(options.order, { ascending: options.ascending !== false });
      query = query.order('id').range(offset, offset + batchSize - 1);
      const pageRows = checked(await query);
      rows.push(...pageRows);
      if (pageRows.length < batchSize) return rows;
    }
  }

  function load() {
    if (loadTask) return loadTask;
    loadTask = loadTraining().finally(() => {
      loadTask = null;
      active.loading = false;
      sync();
      render();
      void drain();
    });
    return loadTask;
  }

  async function loadTraining() {
    active.error = '';
    if (!client) {
      active.error = 'The connection library could not load. Reconnect and refresh this page.';
      return;
    }
    if (!active.data) { active.loading = true; render(); }
    try {
      if (drainTask) await drainTask;
      const { session } = checked(await client.auth.getSession());
      switchUser(session?.user || null);
      if (!active.user) return;
      if (!navigator.onLine) {
        if (!active.data) active.error = 'Go online once to download your training plan on this device.';
        return;
      }
      const id = active.user.id;
      const settings = checked(await client.from('coach_settings').select('*').eq('user_id', id).maybeSingle());
      if (!settings?.current_cycle_id) throw new Error('This account has no active training cycle.');
      const cycleId = settings.current_cycle_id;
      const [cycles, program] = await Promise.all([
        allRows('training_cycles', id, { order: 'start_date', ascending: false }),
        client.from('programs_v2').select('*').eq('user_id', id).eq('cycle_id', cycleId).eq('is_active', true).maybeSingle().then(checked)
      ]);
      const cycle = cycles.find(item => item.id === cycleId);
      if (!cycle || !program) throw new Error('No training program is available for the current block.');
      const [templates, exercises, schedule, workouts, exerciseLogs, enduranceLogs, reports, legacyExerciseDates, legacyRunDates] = await Promise.all([
        allRows('session_templates_v2', id, { where: { program_id: program.id, active: true }, order: 'sort_order' }),
        allRows('session_exercises_v2', id, { where: { active: true }, order: 'position' }),
        allRows('week_schedule_v2', id, { where: { cycle_id: cycleId }, order: 'scheduled_date' }),
        allRows('workout_sessions_v2', id, { order: 'workout_date', ascending: false }),
        allRows('exercise_logs_v2', id, { order: 'updated_at', ascending: false }),
        allRows('endurance_logs_v2', id, { order: 'updated_at', ascending: false }),
        allRows('weekly_reports', id, { order: 'generated_at', ascending: false }),
        allRows('exercise_logs', id, { columns: 'id,workout_date' }).catch(() => []),
        allRows('run_logs', id, { columns: 'id,workout_date' }).catch(() => [])
      ]);
      if (active.user?.id !== id) return;
      active.data = { settings, cycle, cycles, program, templates, exercises, schedule, workouts, exerciseLogs, enduranceLogs, reports, legacyExerciseDates, legacyRunDates };
      active.drafts.clear();
      cache();
    } catch (error) {
      active.error = error.message || String(error);
    }
  }

  const weekNow = () => Number(active.data?.settings.current_week || 1);
  const weeks = () => Number(active.data?.program.block_weeks || 6);
  const templateById = id => active.data.templates.find(template => template.id === id);
  const workoutsInBlock = () => active.data.workouts.filter(w => w.cycle_id === active.data.cycle.id);
  const workoutFor = (week, template) => workoutsInBlock().find(w => Number(w.week_number) === week && w.session_key === template.session_key);
  const logsForWorkout = id => active.data.exerciseLogs.filter(log => log.workout_session_id === id);
  const enduranceFor = id => active.data.enduranceLogs.find(log => log.workout_session_id === id);
  const rowFor = (template, week) => active.data.schedule.find(s => s.session_template_id === template.id && Number(s.week_number) === week);
  const scheduleForWeek = week => active.data.schedule.filter(s => Number(s.week_number) === week)
    .sort((a, b) => a.scheduled_day - b.scheduled_day || a.position - b.position);
  const workoutDate = w => w.workout_date || null;

  function dateShift(date, days) {
    if (!date) return null;
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  function weekDate(week, day) {
    return dateShift(active.data.cycle.start_date, (week - 1) * 7 + day - 1);
  }
  const scheduleDate = row => row.scheduled_date || weekDate(Number(row.week_number), Number(row.scheduled_day));
  const activityInSet = set => [set.weight, set.reps, set.rpe].some(value => value != null && String(value).trim() !== '');
  const recordedSet = set => set.completed === true || (set.completed == null && activityInSet(set));
  const loggedSets = log => (log.sets || []).filter(recordedSet);
  const realExercise = log => log.completed || !!log.notes || loggedSets(log).length > 0;
  const realRun = log => !!(log && (log.completed || log.actual_duration_min || log.distance_km || log.rpe || log.avg_hr || log.notes));
  const hasActivity = workout => !!(workout && (workout.workout_date || workout.status === 'completed' ||
    workout.status === 'in_progress' || logsForWorkout(workout.id).some(realExercise) || realRun(enduranceFor(workout.id))));
  const metricless = exercise => ['skill', 'recovery', 'mobility'].includes(exercise.exercise_type);
  const isOmitted = log => log?.prescription?.hybrid_v3?.omitted === true;
  const draftKey = (week, template, suffix = '') => `${active.data.cycle.id}:${week}:${template.id}${suffix ? ':' + suffix : ''}`;

  function workoutState(template, week) {
    const w = workoutFor(week, template);
    const pending = active.queue[draftKey(week, template, 'finish')];
    if (w?.status === 'completed' || pending) return 'completed';
    if (hasActivity(w) || active.queue[draftKey(week, template, 'start')]) return 'in_progress';
    return 'planned';
  }
  function scheduleState(row, template) {
    const state = workoutState(template, Number(row.week_number));
    if (state !== 'planned') return state;
    if (scheduleDate(row) < todayISO()) return 'missed';
    return row.scheduled_day !== template.default_day ? 'moved' : 'planned';
  }
  function statusTag(status) {
    const labels = { completed: ['Completed', 'done'], in_progress: ['In progress', 'active'], planned: ['Planned', ''], missed: ['Missed', 'missed'], moved: ['Rescheduled', 'moved'] };
    const [label, tone] = labels[status] || labels.planned;
    return `<span class="tag ${tone}">${label}</span>`;
  }
  function displayRx(ex, week=weekNow()) {
    const p=ex?.prescription||{};
    if(ex.snapshot && ex.prescription_text) return ex.prescription_text;
    if(p.kind==='static') return p.text||'—';
    if(p.kind==='paused_squat') {
      if(Number(week)===6)return 'Skip during test week';
      const load=round25(Number(active.data.settings?.squat_e1rm||0)*Number(active.data.settings?.training_max_pct||.95)*Number(p.tm_pct||.65));
      return `${p.sets||'2 × 5'} @ ${kg(load)}`;
    }
    if(p.kind==='bench_volume') {
      const r=p.weeks?.[String(week)]; if(!r)return '—'; if(Number(week)===6)return r[0]||'No normal bench volume';
      const load=round25(Number(active.data.settings?.bench_e1rm||0)*Number(active.data.settings?.training_max_pct||.95)*Number(r[1]||0));
      return `${r[0]} @ ${kg(load)}`;
    }
    if(p.kind==='main_lift') {
      const r=p.weeks?.[String(week)]; if(!r)return '—'; if(r.test)return 'Max test — build attempts from readiness';
      const e1rm=Number(active.data.settings?.[`${p.lift}_e1rm`]||0), tm=e1rm*Number(active.data.settings?.training_max_pct||.95);
      return `${r.top[0]} @ ${kg(tm*Number(r.top[1]))}  •  ${r.back[0]} @ ${kg(tm*Number(r.back[1]))}`;
    }
    return ex?.prescription_text||'—';
  }

  function parseSetRx(s='') {
    const m=String(s).match(/(\d+)\s*[×x]\s*(\d+)/i); return m?{sets:Number(m[1]),reps:Number(m[2])}:null;
  }

  function defaultSets(ex, week=weekNow()) {
    const p=ex.prescription||{};
    if(['skill','recovery','mobility'].includes(ex.exercise_type))return [];
    if(p.kind==='main_lift') {
      const r=p.weeks?.[String(week)]; if(!r||r.test)return [{weight:'',reps:'',rpe:''}];
      const e1rm=Number(active.data.settings?.[`${p.lift}_e1rm`]||0), tm=e1rm*Number(active.data.settings?.training_max_pct||.95);
      const top=parseSetRx(r.top[0]), back=parseSetRx(r.back[0]), out=[];
      for(let i=0;i<(top?.sets||1);i++)out.push({weight:String(round25(tm*Number(r.top[1]))),reps:String(top?.reps||''),rpe:''});
      for(let i=0;i<(back?.sets||1);i++)out.push({weight:String(round25(tm*Number(r.back[1]))),reps:String(back?.reps||''),rpe:''});
      return out;
    }
    if(p.kind==='bench_volume') {
      const r=p.weeks?.[String(week)]; if(!r||Number(week)===6)return [];
      const sr=parseSetRx(r[0]), load=round25(Number(active.data.settings?.bench_e1rm||0)*Number(active.data.settings?.training_max_pct||.95)*Number(r[1]||0));
      return Array.from({length:sr?.sets||1},()=>({weight:String(load),reps:String(sr?.reps||''),rpe:''}));
    }
    if(p.kind==='paused_squat') {
      if(Number(week)===6)return [];
      const sr=parseSetRx(p.sets||'2 × 5'), load=round25(Number(active.data.settings?.squat_e1rm||0)*Number(active.data.settings?.training_max_pct||.95)*Number(p.tm_pct||.65));
      return Array.from({length:sr?.sets||2},()=>({weight:String(load),reps:String(sr?.reps||5),rpe:''}));
    }
    const sr = parseSetRx(p.text || '');
    const weight = p.text?.match(/@\s*(\d+(?:[.,]\d+)?)\s*kg/i)?.[1]?.replace(',', '.') || '';
    return Array.from({ length: Math.min(sr?.sets || 3, 30) }, () => ({ weight, reps: String(sr?.reps || ''), rpe: '' }));
  }

  function exerciseVersion(exercise, week, workout) {
    const versions = exercise.prescription?.hybrid_v3_versions || [];
    const applicable = versions.filter(item => item.from <= week && !item.exclude?.includes(workout?.id));
    if (!applicable.length) return exercise.prescription?.hybrid_v3_future ? null : exercise;
    const version = Object.assign({}, ...applicable);
    if (version.hidden) return null;
    return {
      ...exercise, exercise_name: version.name ?? exercise.exercise_name, position: version.position ?? exercise.position,
      prescription: version.text == null ? exercise.prescription : { kind: 'static', text: version.text }
    };
  }
  function logAsExercise(log, base) {
    return {
      id: base?.id || log.id, session_template_id: base?.session_template_id,
      exercise_key: log.exercise_key, exercise_name: log.exercise_name,
      exercise_type: base?.exercise_type || 'strength', position: log.exercise_position ?? base?.position ?? 999,
      prescription_text: log.prescription_text, prescription: log.prescription || base?.prescription || {},
      notes: base?.notes, snapshot: true, log
    };
  }
  function sessionExercises(template, week) {
    const w = workoutFor(week, template);
    const rows = w ? logsForWorkout(w.id).slice() : [];
    const queued = Object.values(active.queue).filter(op => op.week === week && op.templateId === template.id && op.kind === 'exercise');
    for (const op of queued) {
      const idx = rows.findIndex(row => (op.row.id && row.id === op.row.id) || (op.row.exercise_template_id && row.exercise_template_id === op.row.exercise_template_id));
      if (idx >= 0) rows[idx] = op.row;
      else rows.push(op.row);
    }
    const seen = new Set();
    const list = active.data.exercises.filter(ex => ex.session_template_id === template.id).flatMap(base => {
      const effective = exerciseVersion(base, week, w);
      const log = rows.find(row => row.exercise_template_id === base.id || row.exercise_key === base.exercise_key);
      if (log) seen.add(log.id);
      if (isOmitted(log)) return [];
      if (log) return [logAsExercise(log, base)];
      if (w?.status === 'completed') return [];
      return effective ? [effective] : [];
    });
    for (const log of rows) if (!seen.has(log.id) && !isOmitted(log)) list.push(logAsExercise(log));
    return list.sort((a, b) => a.position - b.position);
  }

  function previousLog(exercise, week, template) {
    const byId = new Map(active.data.workouts.map(w => [w.id, w]));
    const date = workoutFor(week, template)?.workout_date || todayISO();
    return active.data.exerciseLogs
      .filter(log => slug(log.exercise_name) === slug(exercise.exercise_name) && loggedSets(log).length)
      .map(log => ({ log, date: byId.get(log.workout_session_id)?.workout_date }))
      .filter(item => item.date && item.date < date)
      .sort((a, b) => b.date.localeCompare(a.date) || String(b.log.created_at).localeCompare(String(a.log.created_at)))[0];
  }

  function getDraft(ex, week, template) {
    const key = draftKey(week, template, ex.id);
    if (active.drafts.has(key)) return active.drafts.get(key);
    const last = previousLog(ex, week, template);
    const prior = last ? loggedSets(last.log) : [];
    let sets;
    if (ex.log && ((ex.log.sets || []).length || ex.log.completed || ex.log.prescription?.hybrid_v3)) {
      sets = (ex.log.sets || []).map(set => ({ ...set, completed: recordedSet(set) }));
    } else {
      sets = defaultSets(ex, week).map((set, i) => ({
        ...set, weight: set.weight || prior[i]?.weight || '',
        reps: set.reps || prior[i]?.reps || '', completed: false
      }));
    }
    const result = { sets, completed: !!ex.log?.completed, notes: ex.log?.notes || '' };
    active.drafts.set(key, result);
    return result;
  }
  function getRun(template, week) {
    const key = draftKey(week, template, 'run');
    if (active.drafts.has(key)) return active.drafts.get(key);
    const w = workoutFor(week, template);
    const row = active.queue[key]?.row || (w && enduranceFor(w.id));
    const run = {
      completed: !!row?.completed, actual_duration_min: row?.actual_duration_min ?? '',
      distance_km: row?.distance_km ?? '', avg_hr: row?.avg_hr ?? '',
      max_hr: row?.max_hr ?? '', calories: row?.calories ?? '',
      rpe: row?.rpe ?? '', notes: row?.notes ?? '', avg_pace: row?.avg_pace ?? '',
      source: row?.source || 'manual', garmin_activity_id: row?.garmin_activity_id ?? null
    };
    active.drafts.set(key, run);
    return run;
  }

  async function stableId(input) {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))).slice(0, 16);
    bytes[6] = (bytes[6] & 15) | 80;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function enqueue(key, operation) {
    return enqueueMany([[key, operation]]);
  }

  function enqueueMany(operations) {
    if (!active.user) return false;
    const next = { ...readJSON(storageKey('queue'), active.queue) };
    for (const [key, operation] of operations) next[key] = { ...operation, token: crypto.randomUUID() };
    try {
      localStorage.setItem(storageKey('queue'), JSON.stringify(next));
      active.queue = next;
      active.saveError = '';
      clearTimeout(debounce);
      debounce = setTimeout(drain, 480);
      sync();
      return true;
    } catch {
      active.saveError = 'Device storage is full or unavailable. Keep this screen open and retry.';
      sync();
      toast(active.saveError);
      return false;
    }
  }

  function operation(template, week, kind, extra = {}) {
    const existing = workoutFor(week, template);
    const start = active.queue[draftKey(week, template, 'start')];
    const row = rowFor(template, week);
    const recorded = hasActivity(existing);
    return {
      kind, week, templateId: template.id, cycle: active.data.cycle.id, sessionKey: template.session_key,
      name: template.name, type: template.session_type, day: row?.scheduled_day ?? template.default_day,
      scheduledDate: row ? scheduleDate(row) : null, date: existing?.workout_date || start?.date || (recorded ? null : todayISO()),
      ...extra
    };
  }

  function upsertLocal(collection, row) {
    if (!active.data) return;
    const rows = active.data[collection];
    const idx = rows.findIndex(item => item.id === row.id);
    if (idx < 0) rows.push(row);
    else rows[idx] = row;
  }
  async function ensureWorkout(op, user) {
    const table = () => client.from('workout_sessions_v2');
    const locate = () => table().select('*').eq('user_id', user).eq('cycle_id', op.cycle)
      .eq('week_number', op.week).eq('session_key', op.sessionKey).maybeSingle();
    let w = checked(await locate());
    if (!w) {
      const id = await stableId(`${user}:${op.cycle}:${op.week}:${op.sessionKey}`);
      const inserted = await table().upsert({
        id, user_id: user, cycle_id: op.cycle, week_number: op.week,
        session_template_id: op.templateId, session_key: op.sessionKey, session_name: op.name,
        session_type: op.type, scheduled_day: op.day, scheduled_date: op.scheduledDate,
        workout_date: op.date, status: 'in_progress', source: 'app'
      }, { onConflict: 'user_id,cycle_id,week_number,session_key', ignoreDuplicates: true }).select().maybeSingle();
      w = checked(inserted) || checked(await locate());
    }
    if (!w) throw new Error('The session could not be opened.');
    if (w.status === 'planned') {
      const start = { status: 'in_progress', updated_at: new Date().toISOString() };
      if (!w.workout_date && op.date) {
        start.workout_date = op.date;
        start.scheduled_day = op.day;
        start.scheduled_date = op.scheduledDate;
      }
      w = checked(await table().update(start).eq('id', w.id).eq('status', 'planned').select().maybeSingle()) || checked(await locate());
    }
    if (active.user?.id === user) upsertLocal('workouts', w);
    return w;
  }

  async function applyOperation(op, user) {
    const w = await ensureWorkout(op, user);
    if (op.kind === 'start' || (op.kind === 'finish' && w.status === 'completed')) return;
    if (w.status === 'completed') throw new Error('This session was completed on another device. The pending edit is still saved here.');
    if (op.kind === 'exercise') {
      const table = () => client.from('exercise_logs_v2');
      const existing = active.user?.id === user ? logsForWorkout(w.id).find(row => op.row.exercise_template_id ? row.exercise_template_id === op.row.exercise_template_id : row.exercise_key === op.row.exercise_key) : null;
      const id = op.row.id || existing?.id || await stableId(`${w.id}:${op.row.exercise_template_id || op.row.exercise_key}`);
      const saved = checked(await table().upsert({
        ...op.row, id, user_id: user, workout_session_id: w.id
      }, { onConflict: 'id' }).select().single());
      if (active.user?.id === user) upsertLocal('exerciseLogs', saved);
    }
    if (op.kind === 'run') {
      const saved = checked(await client.from('endurance_logs_v2').upsert({
        ...op.row, user_id: user, workout_session_id: w.id
      }, { onConflict: 'workout_session_id' }).select().single());
      if (active.user?.id === user) upsertLocal('enduranceLogs', saved);
    }
    if (op.kind === 'finish') {
      const saved = checked(await client.from('workout_sessions_v2').update({
        status: 'completed', updated_at: new Date().toISOString()
      }).eq('id', w.id).eq('user_id', user).select().single());
      if (active.user?.id === user) upsertLocal('workouts', saved);
    }
  }

  function drain() {
    if (drainTask || loadTask || !client || !active.data || !active.user || !navigator.onLine || !Object.keys(active.queue).length) return drainTask;
    const user = active.user.id;
    const flush = async () => {
      if (active.user?.id !== user) return;
      active.saveError = '';
      active.queue = readJSON(storageKey('queue'), active.queue);
      try {
        while (active.user?.id === user && navigator.onLine && Object.keys(active.queue).length) {
          const [key, op] = Object.entries(active.queue).sort((a, b) => (a[1].kind === 'finish') - (b[1].kind === 'finish'))[0];
          await applyOperation(op, user);
          if (active.user?.id !== user) break;
          cache();
          const next = { ...readJSON(storageKey('queue'), active.queue) };
          if (next[key]?.token === op.token) delete next[key];
          localStorage.setItem(storageKey('queue'), JSON.stringify(next));
          active.queue = next;
        }
      } catch (error) {
        if (active.user?.id === user) {
          active.saveError = error.message || 'Pending changes could not sync.';
          toast('Training changes are saved on this device. Use Refresh to retry syncing.');
        }
      }
    };
    const task = navigator.locks
      ? navigator.locks.request(`${STORE}:sync:${user}`, flush)
      : flush();
    drainTask = task.finally(() => { drainTask = null; sync(); });
    sync();
    return drainTask;
  }

  function exerciseOp(ex, template, week, draft, changes = {}) {
    const source = ex.log || {};
    const { hybrid_v3_versions, hybrid_v3_future, ...prescription } = ex.prescription || {};
    return operation(template, week, 'exercise', {
      row: {
        id: source.id || (ex.custom ? ex.id : null),
        exercise_template_id: source.exercise_template_id ?? (ex.custom || (ex.log && !source.exercise_template_id) ? null : ex.id),
        exercise_key: ex.exercise_key, exercise_name: ex.exercise_name, exercise_position: ex.position,
        prescription_text: displayRx(ex, week), prescription,
        completed: draft.completed, sets: copy(draft.sets), notes: draft.notes,
        updated_at: new Date().toISOString(), ...changes
      }
    });
  }
  function queueExercise(ex, template, week, draft) {
    return enqueue(draftKey(week, template, ex.id), exerciseOp(ex, template, week, draft));
  }
  function pace(duration, distance) {
    const seconds = Math.round(Number(duration) * 60 / Number(distance));
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}/km`;
  }
  function queueRun(template, week, run) {
    const plan = template.plan?.weeks?.[week] || {};
    const existing = workoutFor(week, template);
    const snapshot = existing && enduranceFor(existing.id);
    const row = { ...run, planned_duration_min: snapshot?.planned_duration_min ?? number(plan.target),
      plan_notes: snapshot?.plan_notes ?? plan.notes ?? '', avg_pace: run.avg_pace || null,
      updated_at: new Date().toISOString() };
    for (const key of ['actual_duration_min', 'distance_km', 'avg_hr', 'max_hr', 'calories', 'rpe']) row[key] = number(row[key]);
    return enqueue(draftKey(week, template, 'run'), operation(template, week, 'run', { row }));
  }

  function terrain() {
    const lines = Array.from({ length: 13 }, (_, i) => {
      const shift = i * 14;
      return `<path d="M${78 + shift} -28C${46 + shift} 29 ${111 + shift} 41 ${134 + shift} 63S${149 + shift} 106 ${103 + shift} 140 ${114 + shift} 216 ${200 + shift} 222 225 292 400 275"/>`;
    }).join('');
    return `<svg class="terrain" aria-hidden="true" viewBox="0 0 380 250" preserveAspectRatio="xMidYMid slice" fill="none" stroke="currentColor" stroke-width=".8">${lines}</svg>`;
  }
  const workoutAction = (template, week) => `workout:${week}:${template.id}`;
  const sessionButton = (template, week, status, primary = false) => {
    const label = status === 'completed' ? 'View workout' : status === 'in_progress' ? 'Resume workout'
      : template.session_type === 'run' ? 'Start run' : template.session_type === 'recovery' ? 'Start recovery' : 'Start workout';
    return btn(label, workoutAction(template, week), primary ? 'primary' : 'ghost', status === 'completed' ? 'check' : 'arrow');
  };
  function recentWorkouts(list = active.data.workouts) {
    return list.filter(hasActivity).sort((a, b) => String(workoutDate(b) || '').localeCompare(workoutDate(a) || '') ||
      String(b.created_at || '').localeCompare(a.created_at || ''));
  }
  function todayRows() {
    const date = todayISO();
    const list = active.data.schedule.filter(row => scheduleDate(row) === date).map(row => {
      const template = templateById(row.session_template_id);
      const week = Number(row.week_number);
      const actual = template && workoutFor(week, template)?.workout_date;
      return template && (!actual || actual === date) && { template, week };
    }).filter(Boolean);
    for (const w of workoutsInBlock().filter(w => workoutDate(w) === date)) {
      const template = templateById(w.session_template_id);
      if (template && !list.some(item => item.template.id === template.id && item.week === w.week_number)) {
        list.push({ template, week: Number(w.week_number) });
      }
    }
    return list.sort((a, b) => {
      const rank = { in_progress: 0, planned: 1, completed: 2 };
      return rank[workoutState(a.template, a.week)] - rank[workoutState(b.template, b.week)];
    });
  }
  function todayView() {
    const { program, cycle } = active.data;
    const week = weekNow();
    const queue = todayRows();
    const selected = queue[0];
    const all = scheduleForWeek(week).filter(row => templateById(row.session_template_id));
    const done = all.filter(row => workoutState(templateById(row.session_template_id), week) === 'completed').length;
    const date = todayISO();
    const next = active.data.schedule.filter(row => scheduleDate(row) > date && templateById(row.session_template_id))
      .filter(row => !['in_progress', 'completed'].includes(workoutState(templateById(row.session_template_id), Number(row.week_number))))
      .sort((a, b) => scheduleDate(a).localeCompare(scheduleDate(b)) || a.position - b.position).slice(0, 3);
    const recent = recentWorkouts().filter(workoutDate).slice(0, 3);
    const weekPhase = active.data.program.metadata?.phases?.[String(week)];
    return `${page('ATHLETE DASHBOARD', 'Today', dateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' }))}
      <div class="heroGrid">
        ${selected ? todaySession(selected) : `<article class="sessionHero">${terrain()}<span class="heroTag">${icon('recovery', 14)} Recovery day</span><h2>Make room to recover.</h2><p>Your calendar is clear today. See what’s coming up in your block.</p><div class="heroAction">${btn('Open training plan', 'view:plan', 'primary', 'arrow')}</div></article>`}
        <article class="panel blockPanel">
          <div class="micro"><span>Training block</span><span>${esc(typeof weekPhase === 'string' ? weekPhase : PHASES[week - 1] || '')}</span></div>
          <div><h2>${esc(program.name || cycle.name)}</h2><span class="blockWeek">Week ${week} of ${weeks()}</span></div>
          <div class="blockNumbers"><b>${done} / ${all.length}</b><span>sessions this week</span></div>
          ${meter(done, all.length, 'Weekly sessions completed')}
          <div class="weekTicks" aria-hidden="true">${Array.from({ length: weeks() }, (_, i) => `<i class="${i + 1 === week ? 'current' : i + 1 < week ? 'earlier' : ''}"></i>`).join('')}</div>
          <button class="textBtn" data-action="view:plan">View block ${icon('arrow', 15)}</button>
        </article>
      </div>
      ${queue.length > 1 ? `<section class="section"><div class="sectionTitle"><h2>Also today</h2></div><div class="panel rows">${queue.slice(1).map(({ template, week }) => `
        <div class="row">${rowIcon(template.session_type)}<div><h3>${esc(template.name)}</h3><small>Week ${week}</small></div>${sessionButton(template, week, workoutState(template, week))}</div>`).join('')}</div></section>` : ''}
      <div class="dashboardGrid">
        <section><div class="sectionTitle"><h2>Coming up</h2><button class="textBtn" data-action="view:plan">Plan ${icon('arrow', 15)}</button></div>
          ${next.length ? `<div class="panel rows">${next.map(row => {
            const template = templateById(row.session_template_id);
            return `<div class="row">${rowIcon(template.session_type)}<div><h3>${esc(template.name)}</h3><small>${esc(dateLabel(scheduleDate(row), { weekday: 'long', day: 'numeric', month: 'short' }))}</small></div>${statusTag(scheduleState(row, template))}</div>`;
          }).join('')}</div>` : empty('There are no upcoming sessions on this block’s calendar.')}
        </section>
        <section><div class="sectionTitle"><h2>Recent training</h2><button class="textBtn" data-action="view:progress">Progress ${icon('arrow', 15)}</button></div>
          ${recent.length ? `<div class="panel rows">${recent.map(w => historyRow(w, false)).join('')}</div>` : empty('Your recorded sessions will appear here.')}
        </section>
      </div>`;
  }
  function todaySession({ template, week }) {
    const status = workoutState(template, week);
    const exercises = template.session_type === 'run' ? [] : sessionExercises(template, week);
    const w = workoutFor(week, template);
    const run = w && enduranceFor(w.id);
    const plan = template.plan?.weeks?.[week];
    let detail = exercises.length ? `${exercises.length} exercise${exercises.length === 1 ? '' : 's'} · Week ${week}` : `Week ${week}`;
    if (template.session_type === 'run') {
      detail = status === 'completed' && run ? runMeta(run) : [plan?.duration, plan?.notes || template.notes].filter(Boolean).join(' · ') || 'Aerobic training';
    }
    return `<article class="sessionHero">${terrain()}<span class="heroTag">${icon(template.session_type, 14)} ${status === 'completed' ? 'Session complete' : status === 'in_progress' ? 'In progress' : esc(template.session_type + ' session')}</span><h2>${esc(template.name)}</h2><p>${esc(detail)}</p><div class="heroAction">${sessionButton(template, week, status, true)}</div></article>`;
  }

  function planView() {
    const week = active.week || weekNow();
    const dates = Array.from({ length: 7 }, (_, i) => weekDate(week, i + 1));
    const today = todayISO();
    const selected = active.day || (dates.includes(today) ? today : dates[0]);
    const rows = scheduleForWeek(week).filter(row => templateById(row.session_template_id));
    const blockHistory = workoutsInBlock().filter(w => Number(w.week_number) === week && hasActivity(w));
    const rowDate = row => {
      const w = workoutFor(week, templateById(row.session_template_id));
      return w?.workout_date || scheduleDate(row);
    };
    const datesWithRows = [...new Set([...dates, ...rows.map(rowDate), ...blockHistory.map(workoutDate)].filter(Boolean))].sort();
    return `${page('PROGRAM / TRAINING BLOCK', 'Plan', active.data.program.name, `<div class="actions">${btn('Swap days', 'swap', 'ghost', 'swap')}${btn('Reset week', 'reset', 'ghost')}</div>`)}
      <div class="weekSelector" aria-label="Training week">${Array.from({ length: weeks() }, (_, i) => `<button class="weekBtn" type="button" data-action="week:${i + 1}" aria-pressed="${week === i + 1}">Week ${i + 1}</button>`).join('')}</div>
      <div class="weekDays" aria-label="Week at a glance">${dates.map((date, i) => `<button class="dayTile" data-action="day:${date}" aria-pressed="${selected === date}" aria-label="${esc(dateLabel(date, { weekday: 'long', day: 'numeric', month: 'long' }))}"><span>${DAYS[i].slice(0, 3)}</span><strong>${Number(date?.slice(8)) || '—'}</strong><i class="${rows.some(row => rowDate(row) === date) ? 'hasSession' : ''}"></i></button>`).join('')}</div>
      <section class="section"><div class="sectionTitle"><h2>Week ${week} schedule</h2><span>${esc(dateLabel(dates[0]))} – ${esc(dateLabel(dates[6]))}</span></div>
        ${datesWithRows.map(date => {
          const items = rows.filter(row => rowDate(row) === date);
          const extras = blockHistory.filter(w => w.workout_date === date && !items.some(row => templateById(row.session_template_id).session_key === w.session_key));
          return `<details class="panel planDay" data-date="${esc(date)}" ${selected === date ? 'open' : ''}><summary><strong>${esc(dateLabel(date, { weekday: 'long', day: 'numeric', month: 'short' }))}</strong><span class="tag">${date === today ? 'Today' : (items.length + extras.length ? `${items.length + extras.length} sessions` : 'Off')}</span>${icon('chevron', 16)}</summary>
          ${items.map(row => planItem(row, week)).join('')}${extras.map(w => historyRow(w, true)).join('')}
          ${items.length || extras.length ? '' : '<p class="notice">No sessions scheduled.</p>'}</details>`;
        }).join('')}
      </section>`;
  }
  function planItem(row, week) {
    const t = templateById(row.session_template_id);
    const status = scheduleState(row, t);
    const movable = !['completed', 'in_progress'].includes(status);
    return `<div class="planItem">${rowIcon(t.session_type)}<div><h3>${esc(t.name)}</h3>${statusTag(status)}</div><div class="actions">${sessionButton(t, week, status)}${movable ? actionIcon('Move session', `move:${row.id}`, 'plan') : ''}</div></div>`;
  }
  async function updateSchedule(changes) {
    if (!navigator.onLine) throw new Error('Connect to the internet to change the schedule.');
    if (!changes.length) throw new Error('There are no eligible sessions to move.');
    const user = active.user.id;
    const cycle = active.data.cycle.id;
    const week = Number(changes[0].row.week_number);
    const server = checked(await client.from('workout_sessions_v2')
      .select('id,session_template_id,status,workout_date,exercise_logs_v2(completed,notes,sets),endurance_logs_v2(completed,actual_duration_min,distance_km,rpe,avg_hr,notes)')
      .eq('user_id', user).eq('cycle_id', cycle).eq('week_number', week));
    const protectedIds = new Set(server.filter(w => w.workout_date || w.status === 'completed' || w.status === 'in_progress' ||
      w.exercise_logs_v2?.some(realExercise) || [w.endurance_logs_v2].flat().some(realRun)).map(w => w.session_template_id));
    for (const { row } of changes) {
      const template = templateById(row.session_template_id);
      if (protectedIds.has(template.id) || workoutState(template, week) !== 'planned') {
        throw new Error('A session already has activity. Refresh the plan before trying again.');
      }
    }
    const rows = changes.map(({ row, day }) => ({
      id: row.id, user_id: user, cycle_id: cycle, week_number: week, session_template_id: row.session_template_id,
      scheduled_day: day, scheduled_date: weekDate(week, day), position: row.position, updated_at: new Date().toISOString()
    }));
    const saved = checked(await client.from('week_schedule_v2').upsert(rows, { onConflict: 'id' }).select());
    if (saved.length !== rows.length) throw new Error('The schedule could not be verified. Refresh the plan.');
    saved.forEach(row => upsertLocal('schedule', row));
    cache();
    render();
    toast('Training plan updated.');
  }
  const dateOptions = week => DAYS.map((day, i) => `<option value="${i + 1}">${esc(day + ' · ' + dateLabel(weekDate(week, i + 1)))}</option>`).join('');
  function planEditor(type, id) {
    const week = active.week || weekNow();
    const rows = scheduleForWeek(week).filter(row => {
      const t = templateById(row.session_template_id);
      return t && workoutState(t, week) === 'planned';
    });
    if (type === 'move') {
      const row = rows.find(item => item.id === id);
      if (!row) return toast('This session already has recorded activity.');
      const template = templateById(row.session_template_id);
      openEditor('Move session', template.name, `<label class="formLabel">New date<select class="field" name="day">${dateOptions(week)}</select></label>`, 'Move session', async form => {
        const day = Number(form.get('day'));
        if (day !== row.scheduled_day) await updateSchedule([{ row, day }]);
      });
      $('#editor select').value = row.scheduled_day;
    } else if (type === 'swap') {
      openEditor('Swap training days', 'Upcoming and missed sessions can move. Sessions with recorded activity stay on their actual dates.', `<div class="grid2"><label class="formLabel">First date<select class="field" name="first">${dateOptions(week)}</select></label><label class="formLabel">Second date<select class="field" name="second">${dateOptions(week)}</select></label></div>`, 'Swap days', async form => {
        const a = Number(form.get('first'));
        const b = Number(form.get('second'));
        if (a === b) throw new Error('Choose two different dates.');
        await updateSchedule(rows.filter(row => [a, b].includes(row.scheduled_day))
          .map(row => ({ row, day: row.scheduled_day === a ? b : a })));
      });
      $('#editor [name="second"]').selectedIndex = 1;
    } else {
      openEditor('Reset week', 'Return sessions without recorded activity to their program’s default dates.', '', 'Reset dates', async () => {
        await updateSchedule(rows.map(row => ({ row, day: templateById(row.session_template_id).default_day }))
          .filter(item => item.day !== item.row.scheduled_day || weekDate(week, item.day) !== scheduleDate(item.row)));
      });
    }
  }

  function openWorkout(week, id) {
    const template = templateById(id);
    if (!template) return;
    active.returnView = active.view;
    active.workout = { week, template };
    active.open.clear();
    active.timerEnd = 0;
    const status = workoutState(template, week);
    if (status === 'planned' && !enqueue(draftKey(week, template, 'start'), operation(template, week, 'start'))) return;
    if (template.session_type !== 'run') {
      const first = sessionExercises(template, week).find(ex => !getDraft(ex, week, template).completed);
      if (first && status !== 'completed') active.open.add(first.id);
    }
    show('workout');
  }
  function workoutView() {
    if (!active.workout) return empty('Select a session from Today or Plan.');
    const { week, template } = active.workout;
    const status = workoutState(template, week);
    const locked = status === 'completed';
    const run = template.session_type === 'run';
    const exercises = run ? [] : sessionExercises(template, week);
    const completed = exercises.filter(ex => getDraft(ex, week, template).completed).length;
    const summary = run ? 'Distance, time and effort' : `<span id="exerciseCount">${completed} / ${exercises.length}</span> exercises complete`;
    const w = workoutFor(week, template);
    const workoutName = w?.session_name || template.name;
    return `<div class="workoutView">
      ${btn('Back', 'back', 'ghost', 'back')}
      ${page(`WEEK ${week} / ${template.session_type}`, workoutName, w?.workout_date ? dateLabel(w.workout_date, { day: 'numeric', month: 'long', year: 'numeric' }) : '')}
      <div class="workoutSummary"><span>${summary}</span>${statusTag(status)}</div>
      ${run ? '' : `<div id="workoutMeter">${meter(completed, exercises.length, 'Exercise completion')}</div>`}
      ${run ? renderRun(template, week, locked) : exercises.map((ex, index) => exerciseCard(ex, index, template, week, locked)).join('') || empty('No exercises in this session.')}
      ${!locked && !run ? `<div class="actions">${btn('Add exercise', 'addExercise', 'ghost', 'plus')}${btn('Reorder', 'reorder', 'ghost', 'swap')}</div>` : ''}
      ${!locked ? `<div class="workoutDock">${run ? '<span class="label">Run log</span>' : `<button class="btn timerBtn" type="button" data-action="timer">${icon('clock', 17)}<span id="timerLabel">Rest 1:30</span></button>`}${btn(run ? 'Finish run' : 'Finish workout', 'finish', 'primary', 'check')}</div>` : ''}
    </div>`;
  }
  function updateWorkoutProgress() {
    if (active.view !== 'workout' || !active.workout) return;
    const { template, week } = active.workout;
    const exercises = sessionExercises(template, week);
    const done = exercises.filter(ex => getDraft(ex, week, template).completed).length;
    if ($('#exerciseCount')) $('#exerciseCount').textContent = `${done} / ${exercises.length}`;
    if ($('#workoutMeter')) $('#workoutMeter').innerHTML = meter(done, exercises.length, 'Exercise completion');
  }
  function exerciseCard(ex, index, template, week, locked) {
    const draft = getDraft(ex, week, template);
    const previous = locked ? null : previousLog(ex, week, template);
    const last = previous ? loggedSets(previous.log).map(setText).join(' · ') : '';
    const open = active.open.has(ex.id);
    return `<details class="panel exercise ${draft.completed ? 'done' : ''}" data-exercise="${esc(ex.id)}" ${open ? 'open' : ''}>
      <summary><span class="exerciseNo">${draft.completed ? icon('check', 16) : String(index + 1).padStart(2, '0')}</span><div><h3>${esc(ex.exercise_name)}</h3><small>${esc(displayRx(ex, week))}</small></div>${icon('chevron', 16)}</summary>
      <div class="exerciseBody">
        ${last ? `<div class="lastTime">Previous · ${esc(dateLabel(previous.date))} · ${esc(last)}</div>` : ''}
        ${ex.notes ? `<div class="lastTime">${esc(ex.notes)}</div>` : ''}
        ${metricless(ex) ? '' : `<div class="setHead micro"><span>Set</span><span>kg</span><span>Reps</span><span>RPE</span><span>Done</span></div>
          <div class="setRows">${draft.sets.map((set, i) => setRow(set, i, locked)).join('')}</div>`}
        ${locked ? (draft.notes ? `<p>${esc(draft.notes)}</p>` : '') : `<div class="exerciseTools">
          <div class="actions">${metricless(ex) ? btn(draft.completed ? 'Undo completion' : 'Mark complete', 'markExercise', draft.completed ? 'ghost' : 'primary', 'check')
            : `${btn('Add set', 'addSet', 'ghost', 'plus')}${draft.sets.some(set => !set.completed) ? actionIcon('Remove last unchecked set', 'removeSet', 'close') : ''}`}</div>
          ${btn('Edit exercise', 'editExercise', 'ghost', 'edit')}
        </div><details class="notePanel"><summary>${draft.notes ? 'View notes' : 'Add notes'}</summary><label class="formLabel">Exercise notes<textarea class="field" data-ex-note>${esc(draft.notes)}</textarea></label></details>`}
      </div>
    </details>`;
  }
  function setRow(set, index, locked) {
    return `<div class="setRow ${set.completed ? 'done' : ''}" data-set="${index}"><span class="setNo">${index + 1}</span>
      ${[['weight', 'Kilograms', 'decimal'], ['reps', 'Reps', 'numeric'], ['rpe', 'RPE', 'decimal']].map(([key, label, mode]) => `<input class="field" type="text" inputmode="${mode}" data-set-field="${key}" aria-label="Set ${index + 1} ${label}" value="${esc(set[key])}" placeholder="—" ${locked ? 'readonly' : ''}>`).join('')}
      <button type="button" class="setCheck" data-action="checkSet" aria-label="${set.completed ? 'Undo' : 'Complete'} set ${index + 1}" aria-pressed="${!!set.completed}" ${locked ? 'disabled' : ''}>${icon('check', 18)}</button></div>`;
  }
  function setText(set) {
    const weight = set.weight !== '' && set.weight != null ? `${set.weight} kg` : '';
    const reps = set.reps !== '' && set.reps != null ? `${set.reps} reps` : '';
    return [weight, reps, set.rpe ? `@ ${set.rpe}` : ''].filter(Boolean).join(' ');
  }
  function renderRun(template, week, locked) {
    const run = getRun(template, week);
    const plan = template.plan?.weeks?.[week] || {};
    const w = workoutFor(week, template);
    const saved = w && enduranceFor(w.id);
    const rx = saved?.plan_notes || plan.notes || template.notes || '';
    return `<div class="stats metrics">
      ${stat('Planned', saved?.planned_duration_min ? `${saved.planned_duration_min} min` : plan.duration || '—')}
      ${stat('Distance', run.distance_km ? `${run.distance_km} km` : '—', 'runDistance')}
      ${stat('Pace', run.avg_pace || '—', 'runPace')}
    </div><section class="panel stack">
      <h2>Run details</h2>${rx ? `<p>${esc(rx)}</p>` : ''}
      <div class="grid3 runFields">${[
        ['actual_duration_min', 'Duration (min)', '0.01'], ['distance_km', 'Distance (km)', '0.01'], ['rpe', 'Effort (RPE 1–10)', '0.5']
      ].map(field => runField(field, run, locked)).join('')}</div>
      <details class="notePanel"><summary>Heart rate, calories and notes</summary><div class="grid3 runFields">${[
        ['avg_hr', 'Average HR', '1'], ['max_hr', 'Max HR', '1'], ['calories', 'Calories', '1']
      ].map(field => runField(field, run, locked)).join('')}</div>
      <label class="formLabel notePanel">Run notes<textarea class="field" data-run-field="notes" ${locked ? 'readonly' : ''}>${esc(run.notes)}</textarea></label></details>
    </section>`;
  }
  function runField([key, label, step], run, locked) {
    return `<label class="formLabel">${label}<input class="field" type="number" data-run-field="${key}" inputmode="${step === '1' ? 'numeric' : 'decimal'}" min="${key === 'rpe' ? 1 : 0}" ${key === 'rpe' ? 'max="10"' : ''} step="${step}" value="${esc(run[key])}" ${locked ? 'readonly' : ''}></label>`;
  }
  const runMeta = run => [run.distance_km != null ? `${fmt(run.distance_km, 2)} km` : '', run.actual_duration_min != null ? `${fmt(run.actual_duration_min)} min` : '', run.avg_pace || '', run.rpe ? `RPE ${run.rpe}` : ''].filter(Boolean).join(' · ');
  function updateTimer() {
    const label = $('#timerLabel');
    if (!label) return;
    const remaining = Math.max(0, Math.ceil((active.timerEnd - Date.now()) / 1000));
    label.textContent = remaining ? `Rest ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
      : active.timerEnd ? 'Rest done' : 'Rest 1:30';
    label.closest('button').classList.toggle('timing', remaining > 0);
  }
  function setTimer() { active.timerEnd = Date.now() + 90000; updateTimer(); }

  function finishWorkout() {
    const { template, week } = active.workout;
    const run = template.session_type === 'run' ? getRun(template, week) : null;
    const exs = run ? [] : sessionExercises(template, week);
    if (run && (!Number(run.actual_duration_min) || !$$('[data-run-field]').every(field => field.checkValidity()))) {
      toast('Enter a duration above zero and check the run fields.');
      return;
    }
    const performed = exs.filter(ex => {
      const draft = getDraft(ex, week, template);
      return draft.completed || draft.sets.some(set => set.completed);
    });
    if (!run && !performed.length) return toast('Complete a set or exercise before finishing.');
    const finish = () => {
      const operations = [];
      if (run) {
        const plan = template.plan?.weeks?.[week] || {};
        const w = workoutFor(week, template);
        const snapshot = w && enduranceFor(w.id);
        const row = { ...run, completed: true, avg_pace: run.avg_pace || null,
          planned_duration_min: snapshot?.planned_duration_min ?? number(plan.target),
          plan_notes: snapshot?.plan_notes ?? plan.notes ?? '', updated_at: new Date().toISOString() };
        for (const key of ['actual_duration_min', 'distance_km', 'avg_hr', 'max_hr', 'calories', 'rpe']) row[key] = number(row[key]);
        operations.push([draftKey(week, template, 'run'), operation(template, week, 'run', { row })]);
      }
      operations.push([draftKey(week, template, 'finish'), operation(template, week, 'finish')]);
      if (!enqueueMany(operations)) throw new Error('The workout could not be saved to this device.');
      if (run) run.completed = true;
      active.timerEnd = 0;
      toast(navigator.onLine ? 'Workout complete · syncing' : 'Workout complete · saved on this device');
      render();
    };
    const incomplete = exs.filter(ex => !getDraft(ex, week, template).completed).length;
    if (!run && incomplete) {
      openEditor('Finish workout?', `${incomplete} exercise${incomplete === 1 ? ' is' : 's are'} still open. Your checked sets will be saved as performed.`, '', 'Finish workout', finish);
    } else {
      try { finish(); } catch (error) { toast(error.message); }
    }
  }

  function openEditor(title, description, fields, submit, onSave) {
    const dialog = $('#editor');
    dialog.innerHTML = `<form class="modal"><h2 id="editorTitle">${esc(title)}</h2><p>${esc(description)}</p>
      <div class="stack">${fields}</div><div class="actions"><button class="btn ghost" type="button" data-close>Cancel</button><button type="submit" class="btn primary">${esc(submit)}</button></div><div class="error" role="alert" data-editor-error></div></form>`;
    const form = $('form', dialog);
    const submitButton = $('button[type=submit]', dialog);
    $('[data-close]', dialog).onclick = () => dialog.close();
    form.onsubmit = async event => {
      event.preventDefault();
      submitButton.disabled = true;
      $('[data-editor-error]', dialog).textContent = '';
      try {
        await onSave(new FormData(form));
        if (dialog.contains(form)) dialog.close();
      } catch (error) {
        $('[data-editor-error]', dialog).textContent = error.message || 'The change could not be saved.';
      } finally {
        submitButton.disabled = false;
      }
    };
    if (!dialog.open) dialog.showModal();
  }

  const scopeSelect = week => `<label class="formLabel">Apply to<select name="scope" class="field"><option value="session">This workout only</option>${week < weeks() ? `<option value="future">Future sessions · Week ${week + 1} onward</option>` : ''}</select></label>`;
  function defaultEditSets(prescription, previous = []) {
    const rx = parseSetRx(prescription);
    const weight = prescription.match(/@\s*(\d+(?:[.,]\d+)?)\s*kg/i)?.[1] || '';
    const setCount = rx?.sets || previous.length || 3;
    if (setCount > 30) throw new Error('Enter a prescription of 30 sets or fewer.');
    const keepThrough = previous.reduce((n, set, i) => set.completed ? i + 1 : n, 0);
    return Array.from({ length: Math.max(setCount, keepThrough) }, (_, i) => previous[i]?.completed
      ? previous[i] : { weight: weight || previous[i]?.weight || '', reps: rx?.reps ? String(rx.reps) : previous[i]?.reps || '', rpe: previous[i]?.rpe || '', completed: false });
  }
  async function saveFuture(template, week, edits) {
    if (week >= weeks()) throw new Error('There are no later weeks in this block.');
    if (!navigator.onLine) throw new Error('Connect to save a future prescription.');
    const user = active.user.id;
    const server = checked(await client.from('workout_sessions_v2')
      .select('id,status,workout_date,exercise_logs_v2(completed,notes,sets),endurance_logs_v2(completed,actual_duration_min,distance_km,rpe,avg_hr,notes)')
      .eq('user_id', user).eq('cycle_id', active.data.cycle.id).eq('session_template_id', template.id));
    const exclude = server.filter(w => w.workout_date || w.status === 'completed' || w.status === 'in_progress' ||
      w.exercise_logs_v2?.some(realExercise) || [w.endurance_logs_v2].flat().some(realRun)).map(w => w.id);
    const rows = edits.map(({ id, patch, newExercise }) => {
      const base = active.data.exercises.find(ex => ex.id === id);
      if (!base && !newExercise) throw new Error('A workout-only exercise has no program template to update.');
      const prescription = copy(base?.prescription || { kind: 'static', text: patch.text, hybrid_v3_future: true });
      const versions = prescription.hybrid_v3_versions || [];
      const from = week + 1;
      const version = versions.find(item => item.from === from);
      prescription.hybrid_v3_versions = [...versions.filter(item => item.from !== from), { ...version, from, exclude, ...patch }]
        .sort((a, b) => a.from - b.from);
      return {
        id: base?.id || id, user_id: user, session_template_id: template.id,
        exercise_key: base?.exercise_key || `custom_${id.replaceAll('-', '')}`, exercise_name: base?.exercise_name || patch.name,
        exercise_type: base?.exercise_type || 'strength', position: base?.position ?? patch.position,
        active: true, notes: base ? base.notes ?? null : '', prescription, updated_at: new Date().toISOString()
      };
    });
    const result = checked(await client.from('session_exercises_v2').upsert(rows, { onConflict: 'id' }).select());
    if (result.length !== rows.length) throw new Error('The updated prescription could not be verified.');
    result.forEach(row => upsertLocal('exercises', row));
    cache();
    toast(`Future sessions updated from Week ${week + 1}.`);
    render();
  }

  function reviewFuture(template, week, title, description, edits) {
    openEditor(title, description, `<div class="notice">Applies to ${esc(template.name)} from Week ${week + 1}. Workouts with recorded activity keep their existing exercises.</div>`,
      'Approve future change', () => saveFuture(template, week, edits));
  }

  function exerciseEditor(exercise) {
    const { template, week } = active.workout;
    const draft = exercise && getDraft(exercise, week, template);
    const performed = !!(draft?.completed || draft?.notes || draft?.sets.some(set => set.completed));
    const initialRx = exercise ? displayRx(exercise, week) : '3 × 10';
    const canUseFuture = !exercise || !!active.data.exercises.find(ex => ex.id === exercise.id);
    const description = exercise ? 'Change the prescription, replace an unchecked exercise, or remove it from the session.' : 'Add an exercise and enter its set, rep and load targets.';
    openEditor(exercise ? 'Edit exercise' : 'Add exercise', description, `
      <label class="formLabel">Exercise name<input class="field" name="name" required maxlength="100" value="${esc(exercise?.exercise_name)}" ${performed && !canUseFuture ? 'readonly' : ''}></label>
      <label class="formLabel">Prescription<input class="field" name="rx" required maxlength="220" value="${esc(initialRx)}"></label>
      ${exercise ? '<label class="formLabel">Action<select name="intent" class="field"><option value="edit">Save prescription or replacement</option><option value="remove">Remove exercise</option></select></label>' : ''}
      ${canUseFuture ? scopeSelect(week) : '<p>Applies to this workout.</p>'}
    `, 'Continue', async form => {
      const name = String(form.get('name')).trim();
      const prescription = String(form.get('rx')).trim();
      if (!name || !prescription) throw new Error('Enter an exercise name and a prescription.');
      const remove = form.get('intent') === 'remove';
      const replace = exercise && exercise.exercise_name !== name;
      const id = exercise?.id || crypto.randomUUID();
      const position = exercise?.position ?? (sessionExercises(template, week).reduce((n, ex) => Math.max(n, ex.position), 0) + 1);
      if (form.get('scope') === 'future') {
        const patch = remove ? { hidden: true } : { name, text: prescription, hidden: false, ...(!exercise ? { position } : {}) };
        reviewFuture(template, week, 'Review prescription change', remove ? `Remove ${exercise.exercise_name}.`
          : `${exercise ? exercise.exercise_name + ' → ' : ''}${name} · ${prescription}`, [{ id, patch, newExercise: !exercise }]);
        return;
      }
      if (performed && (remove || replace)) throw new Error('This exercise has recorded work. Add a separate exercise to log a substitution.');
      const custom = !exercise;
      const ex = exercise || { id, exercise_key: `custom_${id.replaceAll('-', '')}`, exercise_name: name,
        exercise_type: 'strength', position, custom };
      const next = {
        sets: remove || metricless(ex) ? [] : defaultEditSets(prescription, replace ? [] : draft?.sets),
        completed: !!draft?.completed, notes: draft?.notes || ''
      };
      const metadata = { ...ex.prescription?.hybrid_v3, original_text: ex.prescription?.hybrid_v3?.original_text || initialRx, omitted: remove };
      const op = exerciseOp(ex, template, week, next, {
        exercise_name: name, prescription_text: prescription,
        prescription: { kind: 'static', text: prescription, hybrid_v3: metadata }
      });
      if (!enqueue(draftKey(week, template, id), op)) throw new Error('The edit could not be saved.');
      active.drafts.set(draftKey(week, template, id), next);
      if (!remove) active.open.add(id);
      render();
      toast(remove ? 'Exercise removed from this workout.' : 'Exercise updated.');
    });
  }

  function reorderEditor() {
    const { template, week } = active.workout;
    const items = sessionExercises(template, week);
    if (items.length < 2) return toast('Add two exercises to change their order.');
    const options = items.map(ex => `<option value="${esc(ex.id)}">${esc(ex.exercise_name)}</option>`).join('');
    const positions = items.map((_, i) => `<option value="${i}">${i + 1}</option>`).join('');
    const canUseFuture = items.every(item => active.data.exercises.some(ex => ex.id === item.id));
    openEditor('Reorder exercises', 'Choose an exercise and its new position.', `<div class="grid2">
      <label class="formLabel">Exercise<select class="field" name="exercise">${options}</select></label>
      <label class="formLabel">Move to<select class="field" name="position">${positions}</select></label></div>${canUseFuture ? scopeSelect(week) : ''}`,
    'Continue', async form => {
      const original = items.findIndex(ex => ex.id === form.get('exercise'));
      const target = Number(form.get('position'));
      if (original === target) return;
      const ordered = [...items];
      const [moving] = ordered.splice(original, 1);
      ordered.splice(target, 0, moving);
      if (form.get('scope') === 'future') {
        reviewFuture(template, week, 'Review exercise order', `Move ${moving.exercise_name} to position ${target + 1}.`,
          ordered.map((ex, i) => ({ id: ex.id, patch: { position: i + 1 } })));
        return;
      }
      const operations = ordered.map((ex, i) => [draftKey(week, template, ex.id),
        exerciseOp(ex, template, week, getDraft(ex, week, template), { exercise_position: i + 1 })]);
      if (!enqueueMany(operations)) throw new Error('Could not save the exercise order.');
      render();
      toast('Exercise order updated.');
    });
  }

  function validSet(set) {
    const rpe = number(String(set.rpe ?? '').replace(',', '.'));
    const reps = number(set.reps);
    const weight = number(String(set.weight ?? '').replace(',', '.'));
    return (reps > 0 || weight > 0) && (rpe == null || (rpe >= 1 && rpe <= 10)) &&
      (reps == null || Number.isInteger(reps) && reps >= 0) && (weight == null || Number.isFinite(weight) && weight >= 0);
  }
  function workoutEdit(action, control) {
    const { template, week } = active.workout;
    if (workoutState(template, week) === 'completed') return;
    if (action === 'timer') {
      if (active.timerEnd > Date.now()) { active.timerEnd = 0; updateTimer(); }
      else setTimer();
      return;
    }
    if (action === 'finish') return finishWorkout();
    if (action === 'addExercise') return exerciseEditor();
    if (action === 'reorder') return reorderEditor();
    const card = control.closest('[data-exercise]');
    const ex = card && sessionExercises(template, week).find(item => item.id === card.dataset.exercise);
    if (!ex) return;
    const draft = getDraft(ex, week, template);
    if (action === 'editExercise') return exerciseEditor(ex);
    if (action === 'checkSet') {
      const row = control.closest('[data-set]');
      const index = Number(row.dataset.set);
      const set = draft.sets[index];
      if (!set.completed && !validSet(set)) return toast('Enter reps or load and an RPE from 1 to 10 if used.');
      set.completed = !set.completed;
      draft.completed = draft.sets.every(item => item.completed);
      queueExercise(ex, template, week, draft);
      row.classList.toggle('done', set.completed);
      control.setAttribute('aria-pressed', set.completed);
      control.setAttribute('aria-label', `${set.completed ? 'Undo' : 'Complete'} set ${index + 1}`);
      card.classList.toggle('done', draft.completed);
      $('.exerciseNo', card).innerHTML = draft.completed ? icon('check', 16) : String($$('.exercise').indexOf(card) + 1).padStart(2, '0');
      updateWorkoutProgress();
      if (set.completed) setTimer();
      return;
    }
    if (action === 'addSet') {
      const previous = draft.sets.at(-1);
      draft.sets.push({ weight: previous?.weight || '', reps: previous?.reps || '', rpe: '', completed: false });
      draft.completed = false;
    }
    if (action === 'removeSet') {
      const last = draft.sets.findLastIndex(set => !set.completed);
      if (last >= 0) draft.sets.splice(last, 1);
      draft.completed = draft.sets.length > 0 && draft.sets.every(set => set.completed);
    }
    if (action === 'markExercise') draft.completed = !draft.completed;
    queueExercise(ex, template, week, draft);
    render();
  }

  function workoutInput(control) {
    if (!active.workout) return;
    const { template, week } = active.workout;
    if (workoutState(template, week) === 'completed') return;
    if (control.dataset.runField) {
      const run = getRun(template, week);
      const field = control.dataset.runField;
      run[field] = control.value;
      if (['actual_duration_min', 'distance_km'].includes(field)) run.avg_pace = pace(run.actual_duration_min, run.distance_km);
      $('#runDistance').textContent = run.distance_km ? `${run.distance_km} km` : '—';
      $('#runPace').textContent = run.avg_pace || '—';
      if ($$('[data-run-field]').every(input => input.checkValidity())) queueRun(template, week, run);
      return;
    }
    const card = control.closest('[data-exercise]');
    if (!card) return;
    const ex = sessionExercises(template, week).find(item => item.id === card.dataset.exercise);
    if (!ex) return;
    const draft = getDraft(ex, week, template);
    if (control.dataset.setField) {
      const row = control.closest('[data-set]');
      const set = draft.sets[Number(row.dataset.set)];
      const proposed = { ...set, [control.dataset.setField]: control.value.replace(',', '.') };
      if (set.completed && !validSet(proposed)) {
        control.setCustomValidity('Enter a valid value or uncheck the set before clearing it.');
        return;
      }
      control.setCustomValidity('');
      Object.assign(set, proposed);
    } else if (control.hasAttribute('data-ex-note')) draft.notes = control.value;
    else return;
    queueExercise(ex, template, week, draft);
  }

  function stat(label, value, id = '') {
    return `<div class="stat"><small>${esc(label)}</small><b ${id ? `id="${id}"` : ''}>${esc(value)}</b></div>`;
  }
  function originalDateNotice(log, workout, isRun = false) {
    const id = isRun ? log.legacy_run_log_id : log.legacy_exercise_log_id;
    if (!id) return '';
    const dates = isRun ? active.data.legacyRunDates : active.data.legacyExerciseDates;
    const original = dates?.find(row => row.id === id)?.workout_date;
    return original && original !== workout.workout_date
      ? `<br><small>Legacy log date · ${esc(dateLabel(original, { day: 'numeric', month: 'short', year: 'numeric' }))}</small>` : '';
  }
  function historyRow(w, expandable) {
    const logs = logsForWorkout(w.id).filter(realExercise).sort((a, b) => a.exercise_position - b.exercise_position);
    const run = enduranceFor(w.id);
    const meta = [dateLabel(workoutDate(w)), run ? runMeta(run) : `${logs.length} exercise${logs.length === 1 ? '' : 's'} logged`].filter(Boolean).join(' · ');
    const core = `${rowIcon(w.session_type)}<div><h3>${esc(w.session_name)}</h3><small>${esc(meta)}</small></div>${statusTag(w.status === 'completed' ? 'completed' : 'in_progress')}`;
    if (!expandable) return `<div class="row">${core}</div>`;
    return `<details class="historyDetails"><summary>${core}${icon('chevron', 14)}</summary><div class="historyBody">
      <p>${esc(active.data.cycles.find(c => c.id === w.cycle_id)?.name || 'Training block')} · Week ${w.week_number}</p>
      ${run ? `<p>${esc(run.notes || 'Run details recorded.')}${originalDateNotice(run, w, true)}</p>` : logs.length ? `<ul>${logs.map(log => `<li><strong>${esc(log.exercise_name)}</strong>
        ${log.prescription_text ? `<br><small>Planned · ${esc(log.prescription_text)}</small>` : ''}
        ${loggedSets(log).length ? `<br>${esc(loggedSets(log).map(setText).join(' · '))}` : log.completed ? '<br>Marked complete' : ''}
        ${log.notes ? `<br><small>${esc(log.notes)}</small>` : ''}${originalDateNotice(log, w)}</li>`).join('')}</ul>` : '<p>No exercise details recorded.</p>'}
      ${w.notes ? `<p>${esc(w.notes)}</p>` : ''}
    </div></details>`;
  }

  function chart(title, points, units, mode = 'line') {
    if (!points.length) return `<section class="panel chart stack"><h2>${esc(title)}</h2><p>No recorded values for this filter.</p></section>`;
    const width = 640, height = 210, left = 44, right = 26, top = 20, bottom = 174;
    const max = Math.max(...points.map(point => point.value));
    const min = mode === 'bar' ? 0 : Math.min(...points.map(point => point.value));
    const yMax = max === min ? max + Math.max(1, max * .05) : max;
    const yMin = max === min && mode !== 'bar' ? Math.max(0, min - Math.max(1, min * .05)) : min;
    const earliest = Date.parse(points[0].date);
    const span = Date.parse(points.at(-1).date) - earliest;
    const x = point => span ? left + (Date.parse(point.date) - earliest) / span * (width - left - right) : (left + width - right) / 2;
    const y = value => bottom - (value - yMin) / (yMax - yMin) * (bottom - top);
    const timeLabel = [...new Set([points[0], points.length > 4 ? points[Math.floor(points.length / 2)] : points[0], points.at(-1)])];
    return `<section class="panel chart"><h2>${esc(title)}</h2>
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title + ' in ' + units)}">
      ${[0, 1, 2, 3].map(i => {
        const value = yMin + (yMax - yMin) * i / 3;
        return `<line class="gridline" x1="${left}" x2="${width - right}" y1="${y(value)}" y2="${y(value)}"/><text class="axis" x="${left - 7}" y="${y(value) + 4}" text-anchor="end">${esc(fmt(value))}</text>`;
      }).join('')}
      ${mode === 'line' ? `<polyline class="plotLine" points="${points.map(point => `${x(point)},${y(point.value)}`).join(' ')}"/>` : ''}
      ${points.map(point => {
        const title = `<title>${esc(dateLabel(point.date) + ' · ' + fmt(point.value, 2) + ' ' + units)}</title>`;
        const barWidth = Math.min(22, (width - left - right) / Math.max(points.length, 1) * .75);
        return mode === 'bar' ? `<rect class="barPoint" x="${x(point) - barWidth / 2}" y="${y(point.value)}" width="${barWidth}" height="${Math.max(0, bottom - y(point.value))}" rx="2">${title}</rect>`
          : `<circle class="dot" cx="${x(point)}" cy="${y(point.value)}" r="4.5">${title}</circle>`;
      }).join('')}
      ${timeLabel.map(point => `<text class="axis" x="${x(point)}" y="196" text-anchor="middle">${esc(dateLabel(point.date))}</text>`).join('')}
      </svg>
      <details class="chartData"><summary>View chart values · ${esc(units)}</summary><ul>${points.map(point => `<li>${esc(dateLabel(point.date, { day: 'numeric', month: 'short', year: 'numeric' }))} · ${esc(fmt(point.value, 2))} ${esc(units)}</li>`).join('')}</ul></details>
    </section>`;
  }
  const byDate = map => [...map].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value }));
  const loadKg = set => {
    const match = String(set.weight ?? '').trim().match(/^(\d+(?:[.,]\d+)?)\s*(?:kg)?$/i);
    return match ? Number(match[1].replace(',', '.')) : 0;
  };
  const positiveReps = set => /^\d+$/.test(String(set.reps ?? '').trim()) ? Number(set.reps) : 0;
  function progressView() {
    const start = active.range ? dateShift(todayISO(), -active.range + 1) : null;
    const scoped = active.data.workouts.filter(w => (active.block === 'all' || w.cycle_id === active.block)
      && (!start || (w.workout_date && w.workout_date >= start && w.workout_date <= todayISO())));
    const history = recentWorkouts(scoped);
    const indexed = new Map(scoped.map(w => [w.id, w]));
    const exerciseLogs = active.data.exerciseLogs.filter(log => indexed.has(log.workout_session_id) && loggedSets(log).length);
    const runs = active.data.enduranceLogs.filter(log => indexed.has(log.workout_session_id) && realRun(log));
    const liftList = new Map();
    for (const log of exerciseLogs) if (loggedSets(log).some(set => loadKg(set) > 0)) liftList.set(slug(log.exercise_name), log.exercise_name);
    const sortedLifts = [...liftList].sort((a, b) => a[1].localeCompare(b[1]));
    const lift = liftList.has(active.lift) ? active.lift : sortedLifts.find(([key]) => key === 'bench_press')?.[0] || sortedLifts[0]?.[0];
    const selected = active.analytics;
    const chartMap = new Map();
    let stats, graphic;
    if (selected === 'strength') {
      const filtered = exerciseLogs.filter(log => slug(log.exercise_name) === lift);
      const best = Math.max(0, ...filtered.flatMap(log => loggedSets(log).map(loadKg)));
      for (const log of filtered) {
        const date = indexed.get(log.workout_session_id).workout_date;
        const max = Math.max(0, ...loggedSets(log).map(loadKg));
        if (date && max) chartMap.set(date, Math.max(max, chartMap.get(date) || 0));
      }
      stats = stat('Heaviest recorded', best ? `${fmt(best, 2)} kg` : '—') + stat('Sessions with sets', new Set(filtered.map(log => log.workout_session_id)).size)
        + stat('Recorded sets', filtered.reduce((sum, log) => sum + loggedSets(log).length, 0));
      graphic = chart('Top recorded weight', byDate(chartMap), 'kg');
    } else if (selected === 'running') {
      const paceMap = new Map();
      const total = runs.reduce((sum, run) => sum + Number(run.distance_km || 0), 0);
      for (const run of runs) {
        const date = indexed.get(run.workout_session_id).workout_date;
        if (!date || !Number(run.distance_km)) continue;
        chartMap.set(date, (chartMap.get(date) || 0) + Number(run.distance_km));
        if (Number(run.actual_duration_min) > 0) {
          const [duration, distance] = paceMap.get(date) || [0, 0];
          paceMap.set(date, [duration + Number(run.actual_duration_min), distance + Number(run.distance_km)]);
        }
      }
      const [minutes, km] = [...paceMap.values()].reduce(([minutes, km], [duration, distance]) => [minutes + duration, km + distance], [0, 0]);
      stats = stat('Distance', `${fmt(total, 2)} km`) + stat('Logged runs', runs.length) + stat('Distance-weighted pace', pace(minutes, km) || '—');
      graphic = chart('Recorded run distance by day', byDate(chartMap), 'km', 'bar');
      if (paceMap.size) graphic += `<div class="section">${chart('Run pace by day', byDate(new Map([...paceMap].map(([date, [duration, distance]]) => [date, duration / distance]))), 'min/km')}</div>`;
    } else {
      let total = 0;
      const consistency = new Map();
      for (const log of exerciseLogs) {
        const date = indexed.get(log.workout_session_id).workout_date;
        const volume = loggedSets(log).reduce((sum, set) => sum + loadKg(set) * positiveReps(set), 0);
        total += volume;
        if (date && volume) chartMap.set(date, (chartMap.get(date) || 0) + volume);
      }
      for (const workout of history.filter(w => w.status === 'completed' && w.workout_date)) {
        const d = new Date(`${workout.workout_date}T12:00:00Z`);
        const monday = dateShift(workout.workout_date, -((d.getUTCDay() + 6) % 7));
        consistency.set(monday, (consistency.get(monday) || 0) + 1);
      }
      stats = stat('Recorded load × reps', `${fmt(total)} kg`) + stat('Completed sessions', history.filter(w => w.status === 'completed').length)
        + stat('Active training days', new Set(history.map(workoutDate).filter(Boolean)).size);
      graphic = chart('Strength volume by day', byDate(chartMap), 'kg × reps', 'bar');
      if (consistency.size) graphic += `<div class="section">${chart('Completed sessions by week', byDate(consistency), 'sessions', 'bar')}</div>`;
    }
    return `${page('PERFORMANCE / TRAINING HISTORY', 'Progress', 'Explore the work you’ve recorded across your blocks.')}
      <div class="filterBar" aria-label="Progress views">${[['strength', 'Strength'], ['running', 'Running'], ['workload', 'Workload']].map(([key, label]) =>
        `<button class="segment" data-action="analytics:${key}" aria-pressed="${selected === key}">${label}</button>`).join('')}</div>
      <div class="grid3 section metrics">
        <label class="formLabel">Date range<select class="field" data-filter="range">${[[42, 'Last 6 weeks'], [90, 'Last 90 days'], [0, 'All time']].map(([value, label]) => `<option value="${value}" ${value === active.range ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label class="formLabel">Block<select class="field" data-filter="block"><option value="all">All blocks</option>${active.data.cycles.map(c => `<option value="${esc(c.id)}" ${c.id === active.block ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        ${selected === 'strength' && sortedLifts.length ? `<label class="formLabel">Exercise<select class="field" data-filter="lift">${sortedLifts.map(([key, name]) => `<option value="${esc(key)}" ${key === lift ? 'selected' : ''}>${esc(name)}</option>`).join('')}</select></label>` : ''}
      </div><div class="stats metrics">${stats}</div>${graphic}
      <section class="section"><div class="sectionTitle"><h2>Session history</h2><span>${history.length} sessions</span></div>${history.length
        ? `<div class="panel rows">${history.map(w => historyRow(w, true)).join('')}</div>` : empty('No recorded sessions match these filters.')}</section>`;
  }

  function renderReport(markdown) {
    return String(markdown || '').split(/\n{2,}/).map(block => {
      const lines = block.split('\n').filter(Boolean);
      if (lines.every(line => /^\s*[-*]\s+/.test(line))) return `<ul>${lines.map(line => `<li>${esc(line.replace(/^\s*[-*]\s+/, ''))}</li>`).join('')}</ul>`;
      return lines.map(line => /^#+\s/.test(line)
        ? `<h3>${esc(line.replace(/^#+\s+/, ''))}</h3>` : `<p>${esc(line.replace(/\*\*([^*]+)\*\*/g, '$1'))}</p>`).join('');
    }).join('');
  }
  function coachSummary(week) {
    const rows = scheduleForWeek(week);
    const workouts = workoutsInBlock().filter(w => Number(w.week_number) === week && hasActivity(w));
    const plannedTemplates = new Set(rows.map(row => row.session_template_id));
    const completed = workouts.filter(w => w.status === 'completed' && plannedTemplates.has(w.session_template_id));
    const logs = workouts.flatMap(w => logsForWorkout(w.id).map(log => ({ log, w }))).filter(({ log }) => realExercise(log));
    const comparable = logs.flatMap(({ log }) => {
      const text = log.prescription?.hybrid_v3?.original_text || log.prescription_text || '';
      const rx = text.includes('•') || text.includes('/') ? null : parseSetRx(text);
      if (!rx || !loggedSets(log).length) return [];
      const targetLoad = text.match(/@\s*(\d+(?:\.\d+)?)\s*kg/i)?.[1];
      return [{ log, rx, targetLoad, actual: loggedSets(log) }];
    });
    const runs = workouts.map(w => enduranceFor(w.id)).filter(realRun);
    const comparableRuns = runs.filter(run => Number(run.planned_duration_min) > 0 && Number(run.actual_duration_min) > 0);
    const effort = logs.flatMap(({ log, w }) => {
      const values = loggedSets(log).map(set => number(String(set.rpe ?? '').replace(',', '.'))).filter(value => value >= 1 && value <= 10);
      return values.length ? [{ name: log.exercise_name, id: log.exercise_template_id, template: w.session_template_id, peak: Math.max(...values) }] : [];
    }).sort((a, b) => b.peak - a.peak);
    return { rows, workouts, completed, logs, comparable, runs, comparableRuns, effort };
  }
  function coachView() {
    const week = active.coachWeek || weekNow();
    const { rows, workouts, completed, logs, comparable, runs, comparableRuns, effort } = coachSummary(week);
    const report = active.data.reports.filter(r => r.cycle_id === active.data.cycle.id && Number(r.week_number) === week);
    const previous = active.data.reports.filter(r => !report.some(current => current.id === r.id));
    const high = effort.find(item => item.peak >= 9);
    const proposal = high && high.id && week < weeks() && templateById(high.template) && active.data.exercises.find(ex => ex.id === high.id);
    const totalKm = runs.reduce((sum, run) => sum + Number(run.distance_km || 0), 0);
    const compareList = comparable.map(({ log, rx, targetLoad, actual }) => {
      const met = actual.filter(set => positiveReps(set) >= rx.reps && (!targetLoad || loadKg(set) >= Number(targetLoad))).length;
      return `<li><strong>${esc(log.exercise_name)}</strong> · ${actual.length}/${rx.sets} sets recorded · ${met} met the per-set target of ${rx.reps} reps${targetLoad ? ' at ' + esc(targetLoad) + ' kg' : ''}.</li>`;
    });
    compareList.push(...comparableRuns.map(run => `<li><strong>Run duration</strong> · ${esc(run.actual_duration_min)} of ${esc(run.planned_duration_min)} planned minutes.</li>`));
    return `${page('COACH / WEEKLY REVIEW', 'Coach', 'Review planned work against what you recorded.')}
      <div class="filterBar metrics"><label class="formLabel">Review week<select class="field" data-filter="coachWeek">${Array.from({ length: weeks() }, (_, i) => `<option value="${i + 1}" ${week === i + 1 ? 'selected' : ''}>Week ${i + 1}</option>`).join('')}</select></label></div>
      <div class="stats metrics">${stat('Planned sessions completed', `${completed.length} / ${rows.length}`)}${stat('Recorded sets', logs.reduce((sum, item) => sum + loggedSets(item.log).length, 0))}${stat('Run distance', `${fmt(totalKm, 2)} km`)}</div>
      <section class="panel stack"><div><div class="eyebrow">Recorded training</div><h2>Week ${week} review</h2></div>
        <p>${workouts.length ? `${workouts.length} session${workouts.length === 1 ? ' has' : 's have'} recorded activity. ${workouts.filter(w => w.status === 'in_progress').length} are still marked in progress.` : 'Record a session to start this review.'}</p>
        ${compareList.length ? `<details class="report"><summary>Prescription comparison · ${compareList.length} entries</summary><ul>${compareList.join('')}</ul></details>` : '<p>No comparable prescriptions with recorded sets or run duration yet.</p>'}
        ${high ? `<div class="notice"><strong>${esc(high.name)} reached RPE ${esc(high.peak)}.</strong> Review that prescription before increasing the next exposure.</div>` : ''}
        ${proposal ? `<div class="actions">${btn('Review future prescription', `proposal:${week}:${high.id}`, 'primary', 'edit')}</div>` : ''}
      </section>
      <section class="section"><div class="sectionTitle"><h2>Saved coaching reports</h2></div>
        ${report.length || previous.length ? `<div class="panel rows">${[...report, ...previous].map((item, i) => `
          <details class="historyDetails" ${i === 0 && report.length ? 'open' : ''}><summary>${rowIcon('coach')}<div><strong>Week ${item.week_number} review</strong><br><small>${esc(dateLabel(String(item.generated_at).slice(0, 10)))}</small></div><span class="tag">Saved</span>${icon('chevron', 14)}</summary><div class="report historyBody">${renderReport(item.report_markdown)}</div></details>`).join('')}</div>` : empty('There are no saved coaching reports yet.')}
      </section>`;
  }
  function coachProposal(week, id) {
    const ex = active.data.exercises.find(ex => ex.id === id);
    const template = ex && templateById(ex.session_template_id);
    if (!template || week >= weeks()) return;
    const next = exerciseVersion(ex, week + 1, null) || ex;
    const planned = displayRx(next, week + 1);
    openEditor('Review future prescription', `${ex.exercise_name} · Next planned target is ${planned}. Enter a revised target after reviewing the recorded effort.`,
      `<label class="formLabel">Revised prescription<input class="field" name="rx" value="${esc(planned)}" required maxlength="220"></label>`, 'Preview change', form => {
        const text = String(form.get('rx')).trim();
        if (!text || text === planned) throw new Error('Enter a revised prescription to review.');
        reviewFuture(template, week, 'Approve coaching change?', `${ex.exercise_name} · ${planned} → ${text}`,
          [{ id, patch: { text } }]);
      });
  }

  function authView() {
    return `${page('HYBRID ATHLETE', 'Train with purpose.', 'Your strength, running and recovery plan in one place.')}
      <section class="panel auth"><form id="signIn" class="stack">
        <h2>Sign in</h2>
        <label class="formLabel">Email<input class="field" type="email" name="email" autocomplete="email" required></label>
        <label class="formLabel">Password<input class="field" type="password" name="password" autocomplete="current-password" required></label>
        <div class="actions"><button class="btn primary" type="submit" ${client ? '' : 'disabled'}>Sign in ${icon('arrow', 17)}</button></div>
        <p id="authMessage" role="status"></p>
      </form></section>`;
  }
  function settingsView() {
    const settings = active.data?.settings;
    return `${page('ACCOUNT / PREFERENCES', 'Settings', active.user.email || 'Signed in')}
      <div class="stack">
      <section class="panel stack"><h2>Appearance</h2><div class="actions">${['dark', 'light'].map(theme => `<button class="segment" data-action="theme:${theme}" aria-pressed="${document.documentElement.dataset.theme === theme}">${theme === 'dark' ? 'Dark' : 'Light'}</button>`).join('')}</div></section>
      ${settings ? `<section class="panel"><form class="stack" id="trainingSettings"><h2>Training targets</h2>
        <div class="grid2"><label class="formLabel">Active program week<select class="field" name="current_week">${Array.from({ length: weeks() }, (_, i) => `<option value="${i + 1}" ${weekNow() === i + 1 ? 'selected' : ''}>Week ${i + 1}</option>`).join('')}</select></label>
        ${[['training_max_pct', 'Training max (%)', Number(settings.training_max_pct || .95) * 100, 'any', 1, 100], ['bench_e1rm', 'Bench e1RM (kg)', settings.bench_e1rm, 'any', 0, 1000], ['deadlift_e1rm', 'Deadlift e1RM (kg)', settings.deadlift_e1rm, 'any', 0, 1000], ['squat_e1rm', 'Squat e1RM (kg)', settings.squat_e1rm, 'any', 0, 1000]]
          .map(([key, label, value, step, min, max]) => `<label class="formLabel">${label}<input type="number" inputmode="decimal" class="field" name="${key}" step="${step}" min="${min}" max="${max}" value="${esc(value)}" required></label>`).join('')}</div>
        <p>Training max and e1RM are inputs for future prescriptions.</p><div class="actions"><button class="btn primary" type="submit">Save training targets</button></div>
      </form></section>` : ''}
      <section class="panel stack"><h2>Sync and account</h2><p>${Object.keys(active.queue).length} changes pending on this device. Workout logging can continue offline after the plan has been downloaded.</p>
      <div class="actions">${btn('Retry sync', 'refresh', 'ghost', 'refresh')}${btn('Sign out', 'signout', 'ghost')}</div></section>
      ${settings ? `<section class="panel stack"><h2>Training data</h2><p>${active.data.exerciseLogs.filter(x => x.legacy_exercise_log_id).length} linked legacy exercise logs · ${active.data.enduranceLogs.filter(x => x.legacy_run_log_id).length} linked legacy runs</p>
        ${readJSON(OLD_KEY) && !readJSON(MIGRATION_KEY)  ? `<div class="actions">${btn('Review legacy device data', 'importLegacy', 'ghost')}</div>` : ''}</section>` : ''}
      </div>`;
  }

  function reviewLegacy() {
    const old = readJSON(OLD_KEY);
    if (!old) return toast('There is no legacy training file on this device.');
    openEditor('Legacy device records', 'Download a copy of this device’s legacy records for review. The file can include unsynced sets, runs and schedule changes.',
      '', 'Download legacy records', () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(old, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = 'hybrid-athlete-legacy-training.json';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      });
  }

  function render() {
    const view = $('#' + active.view);
    if (active.loading && !active.data) {
      view.innerHTML = '<div class="loading" role="status"><div class="spinner"></div>Loading your training…</div>';
    } else if (!active.user) {
      view.innerHTML = (active.error ? notice(active.error, 'error') : '') + authView();
    } else {
      const output = { today: todayView, plan: planView, workout: workoutView,
        progress: progressView, coach: coachView, settings: settingsView };
      view.innerHTML = (active.error ? notice(active.error, 'warning') : '') +
        (active.data || active.view === 'settings' ? output[active.view]() : empty('Training could not load. Refresh to try again.'));
    }
    updateTimer();
    sync();
  }

  function show(view, focus = true) {
    if (!['today', 'plan', 'progress', 'coach', 'settings', 'workout'].includes(view)) return;
    active.view = view;
    for (const section of $$('.view')) section.hidden = section.id !== view;
    for (const button of $$('.nav button')) {
      if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    $('#viewLabel').textContent = view.toUpperCase();
    render();
    if (focus) {
      const heading = $('#' + view + ' h1');
      heading?.setAttribute('tabindex', '-1');
      heading?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }
  async function saveSettings(form) {
    if (!navigator.onLine) throw new Error('Connect to update training settings.');
    const data = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, Number(value)]));
    data.training_max_pct /= 100;
    const saved = checked(await client.from('coach_settings').update({
      ...data, updated_at: new Date().toISOString()
    }).eq('user_id', active.user.id).select().single());
    active.data.settings = saved;
    active.week = null;
    active.day = null;
    active.drafts.clear();
    cache();
    render();
    toast('Training targets saved.');
  }
  async function signIn(form) {
    const fields = new FormData(form);
    const msg = $('#authMessage', form);
    msg.textContent = 'Signing in…';
    const { data, error } = await client.auth.signInWithPassword({ email: fields.get('email').trim(), password: fields.get('password') });
    if (error) throw error;
    switchUser(data.user);
    await load();
  }
  function signOut() {
    const pending = Object.keys(active.queue).length;
    openEditor('Sign out?', pending ? 'Pending changes are kept on this device for this account. Sign back in to sync them.'
      : 'You can sign in again with your existing account.', '', 'Sign out', async () => {
      checked(await client.auth.signOut());
      switchUser(null);
      show('today');
    });
  }
  async function refresh() {
    if (!navigator.onLine) return toast('Connect to the internet to refresh training.');
    await drain();
    await load();
    if (!active.error && !active.saveError) toast('Training refreshed.');
  }

  for (const control of $$('.nav button')) control.insertAdjacentHTML('afterbegin', icon(control.dataset.view));
  $('#refreshBtn').innerHTML = icon('refresh', 17);
  $('#refreshBtn').onclick = () => void refresh();
  $('.wordmark').onclick = event => { event.preventDefault(); show('today'); };
  try { setTheme(localStorage.getItem(`${STORE}:theme`)); } catch {}
  document.addEventListener('click', event => {
    const control = event.target.closest('button');
    if (!control) return;
    if (control.dataset.view) return show(control.dataset.view);
    const [action, first, second] = (control.dataset.action || '').split(':');
    if (action === 'view') return show(first);
    if (action === 'refresh') return void refresh();
    if (action === 'theme') { setTheme(first); return render(); }
    if (action === 'signout' && active.user) return signOut();
    if (!active.data || !active.user) return;
    if (action === 'importLegacy') return reviewLegacy();
    if (action === 'workout') return openWorkout(Number(first), second);
    if (action === 'back') return show(active.returnView);
    if (action === 'week') { active.week = Number(first); active.day = null; return render(); }
    if (action === 'day') {
      active.day = first;
      $$('.dayTile').forEach(button => button.setAttribute('aria-pressed', button === control));
      const section = $('.planDay[data-date="' + first + '"]');
      if (section) { section.open = true; section.scrollIntoView({ block: 'nearest' }); }
      return;
    }
    if (['move', 'swap', 'reset'].includes(action)) return planEditor(action, first);
    if (action === 'analytics') { active.analytics = first; return render(); }
    if (action === 'proposal') return coachProposal(Number(first), second);
    if (active.view === 'workout' && active.workout && action) workoutEdit(action, control);
  });
  document.addEventListener('toggle', event => {
    const id = event.target.dataset?.exercise;
    if (!id || !event.target.isConnected) return;
    if (event.target.open) active.open.add(id);
    else active.open.delete(id);
  }, true);
  document.addEventListener('input', event => {
    if (active.view === 'workout') workoutInput(event.target);
  });
  document.addEventListener('change', event => {
    const filter = event.target.dataset?.filter;
    if (!filter) return;
    active[filter] = ['range', 'coachWeek'].includes(filter) ? Number(event.target.value) : event.target.value;
    render();
    $('[data-filter="' + filter + '"]')?.focus({ preventScroll: true });
  });
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!['signIn', 'trainingSettings'].includes(form.id)) return;
    event.preventDefault();
    const button = $('button[type="submit"]', form);
    button.disabled = true;
    try {
      if (form.id === 'signIn') await signIn(form);
      else await saveSettings(form);
    } catch (error) {
      const status = $('#authMessage', form);
      if (status) status.textContent = error.message;
      else toast(error.message);
    } finally {
      button.disabled = false;
    }
  });
  window.addEventListener('storage', event => {
    if (!active.user || event.key !== storageKey('queue')) return;
    active.queue = readJSON(event.key, {});
    sync();
  });
  window.addEventListener('offline', sync);
  window.addEventListener('online', () => { sync(); void refresh(); });
  setInterval(updateTimer, 300);
  if (client) {
    client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        switchUser(null);
        active.loading = false;
        render();
      } else if (event === 'SIGNED_IN' && session?.user?.id !== active.user?.id) {
        setTimeout(() => { switchUser(session?.user || null); void load(); }, 0);
      }
    });
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  void load();
})();
