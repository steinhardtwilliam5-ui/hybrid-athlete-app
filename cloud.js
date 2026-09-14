(() => {
  'use strict';

  const SUPABASE_URL = 'https://esowgrsjzsqloavclikf.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_YJUUarFMm2lKVJsInI5kXQ_nCXbMJpb';
  const BLOCK_START = '2026-09-14';

  const cloud = {
    client: null,
    session: null,
    user: null,
    cycleId: null,
    cycleStart: BLOCK_START,
    reports: [],
    syncing: false,
    lastSync: null,
    message: '',
  };

  let syncTimer = null;

  function esc(v = '') {
    return String(v).replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));
  }

  function injectUi() {
    const badges = document.querySelector('.badges');
    if (badges && !document.querySelector('#cloudBadge')) {
      badges.insertAdjacentHTML('beforeend', '<span class="badge cloud-local" id="cloudBadge">Local</span>');
    }

    const main = document.querySelector('main');
    if (main && !document.querySelector('#analysis')) {
      main.insertAdjacentHTML('beforeend', '<section id="analysis" class="view"></section>');
    }

    const nav = document.querySelector('.navin');
    if (nav && !nav.querySelector('[data-view="analysis"]')) {
      nav.insertAdjacentHTML('beforeend', '<button data-view="analysis"><span>✦</span>Analysis</button>');
      nav.classList.add('five-tabs');
    }

    document.querySelectorAll('.nav button').forEach(btn => {
      if (btn.dataset.cloudWired) return;
      btn.dataset.cloudWired = '1';
      btn.addEventListener('click', () => {
        document.querySelectorAll('.nav button').forEach(x => x.classList.toggle('active', x === btn));
        document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === btn.dataset.view));
        if (btn.dataset.view === 'analysis') renderAnalysis();
        window.scrollTo({top:0,behavior:'smooth'});
      });
    });
  }

  function renderCloudBadge() {
    const badge = document.querySelector('#cloudBadge');
    if (!badge) return;
    badge.textContent = cloud.user ? 'Cloud' : 'Local';
    badge.classList.toggle('cloud-online', !!cloud.user);
    badge.classList.toggle('cloud-local', !cloud.user);
  }

  function renderAnalysis() {
    injectUi();
    const el = document.querySelector('#analysis');
    if (!el) return;

    if (!cloud.user) {
      el.innerHTML = `
        <div class="hero cloud-hero">
          <div class="eyebrow">Cloud coaching</div>
          <h1>Connect your training log</h1>
          <p>Sign in once. After that, your sets, reps, loads, RPE and notes sync automatically. Your Sunday ChatGPT review reads the same data and the finished report appears here.</p>
        </div>
        <div class="section">
          <div class="card">
            <div class="name">Hybrid Athlete account</div>
            <div class="note">Use an email and password you control. This is only for syncing your training data between the app and your AI review.</div>
            <div class="cloud-auth-stack">
              <input id="cloudEmail" class="field" type="email" autocomplete="email" placeholder="Email">
              <input id="cloudPassword" class="field" type="password" autocomplete="current-password" placeholder="Password (6+ characters)">
            </div>
            <div class="cloud-actions">
              <button id="cloudSignIn" class="btn primary" type="button">Sign in</button>
              <button id="cloudCreate" class="btn" type="button">Create account</button>
            </div>
            <div class="cloud-message">${esc(cloud.message)}</div>
          </div>
        </div>`;
      document.querySelector('#cloudSignIn')?.addEventListener('click', () => authWithPassword('signin'));
      document.querySelector('#cloudCreate')?.addEventListener('click', () => authWithPassword('signup'));
      return;
    }

    const current = cloud.reports.find(r => Number(r.week_number) === Number(state.week));
    const reportHtml = current ? `
      <div class="card cloud-report-card">
        <div class="name">Week ${current.week_number} coaching report</div>
        <div class="cloud-report-meta">Generated ${new Date(current.generated_at).toLocaleString()}</div>
        <div class="cloud-report">${esc(current.report_markdown)}</div>
      </div>` : `
      <div class="card">
        <div class="name">Week ${state.week} report</div>
        <div class="note">No AI report yet. Your scheduled Sunday review will analyse the synced week, post it in ChatGPT, and save the same report here.</div>
      </div>`;

    const history = cloud.reports
      .filter(r => !current || r.id !== current.id)
      .slice(0, 5)
      .map(r => `<button class="cloud-history" type="button" data-report-id="${r.id}"><b>Week ${r.week_number}</b><small>${new Date(r.generated_at).toLocaleDateString()}</small></button>`)
      .join('');

    el.innerHTML = `
      <div class="hero cloud-hero">
        <div class="eyebrow">AI coach • Week ${state.week}</div>
        <h1>Your training analysis</h1>
        <p>Training data syncs automatically. ChatGPT reviews it each Sunday and writes the report back here.</p>
      </div>
      <div class="section">
        <div class="card">
          <div class="name cloud-connected">Cloud Sync connected</div>
          <div class="cloud-status"><span>${esc(cloud.user.email || 'Signed in')}</span><span>${cloud.lastSync ? `Synced ${new Date(cloud.lastSync).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` : 'Ready'}</span></div>
          <div class="cloud-actions">
            <button id="syncNow" class="btn primary" type="button">Sync now</button>
            <button id="refreshReports" class="btn" type="button">Refresh report</button>
            <button id="cloudLogout" class="btn" type="button">Sign out</button>
          </div>
          <div class="cloud-message">${esc(cloud.message)}</div>
        </div>
        ${reportHtml}
        ${history ? `<div class="sectionTitle"><h2>Previous reports</h2><span>History</span></div>${history}` : ''}
      </div>`;

    document.querySelector('#syncNow')?.addEventListener('click', () => syncAllLocal(true));
    document.querySelector('#refreshReports')?.addEventListener('click', () => fetchReports(true));
    document.querySelector('#cloudLogout')?.addEventListener('click', async () => {
      await cloud.client.auth.signOut();
      cloud.session = null;
      cloud.user = null;
      cloud.cycleId = null;
      cloud.reports = [];
      cloud.message = 'Signed out. Local training data is unchanged.';
      renderCloudBadge();
      renderAnalysis();
    });
    document.querySelectorAll('[data-report-id]').forEach(btn => btn.addEventListener('click', () => {
      const report = cloud.reports.find(r => r.id === btn.dataset.reportId);
      if (report) window.alert(report.report_markdown);
    }));
  }

  function parseKey(key) {
    const match = key.match(/^w(\d+)-(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)-(\d+)$/);
    return match ? {week:Number(match[1]), day:match[2], index:Number(match[3])} : null;
  }

  function programForWeek(week) { return week === 6 ? maxWeek : standard; }

  function prescriptionFor(exercise, week) {
    const previousWeek = state.week;
    state.week = week;
    try { return exerciseRx(exercise[0], exercise[1]); }
    finally { state.week = previousWeek; }
  }

  function workoutDate(week, day) {
    const offsets = {Monday:0,Tuesday:1,Wednesday:2,Thursday:3,Friday:4,Saturday:5,Sunday:6};
    const d = new Date(`${cloud.cycleStart || BLOCK_START}T12:00:00`);
    d.setDate(d.getDate() + ((week - 1) * 7) + offsets[day]);
    return d.toISOString().slice(0, 10);
  }

  function scheduleSync() {
    if (!cloud.user || !cloud.cycleId) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncAllLocal(false), 900);
  }

  async function ensureCloudProfile() {
    const userId = cloud.user.id;
    const {data: settingsRow, error} = await cloud.client.from('coach_settings').select('*').eq('user_id', userId).maybeSingle();
    if (error) throw error;

    if (settingsRow) {
      cloud.cycleId = settingsRow.current_cycle_id;
      state.week = Number(settingsRow.current_week) || state.week;
      state.bench = Number(settingsRow.bench_e1rm) || state.bench;
      state.deadlift = Number(settingsRow.deadlift_e1rm) || state.deadlift;
      state.squat = Number(settingsRow.squat_e1rm) || state.squat;
      state.tmPct = Number(settingsRow.training_max_pct) || state.tmPct;
      if (cloud.cycleId) {
        const {data: cycle, error: cycleError} = await cloud.client.from('training_cycles').select('start_date').eq('id', cloud.cycleId).maybeSingle();
        if (cycleError) throw cycleError;
        cloud.cycleStart = cycle?.start_date || BLOCK_START;
      }
      save();
      return;
    }

    const {data: cycle, error: cycleError} = await cloud.client.from('training_cycles').insert({
      user_id:userId,
      name:'Hybrid Athlete Block 1',
      start_date:BLOCK_START,
      status:'active'
    }).select().single();
    if (cycleError) throw cycleError;

    cloud.cycleId = cycle.id;
    cloud.cycleStart = cycle.start_date;

    const {error: insertError} = await cloud.client.from('coach_settings').insert({
      user_id:userId,
      current_cycle_id:cycle.id,
      current_week:state.week,
      bench_e1rm:state.bench,
      deadlift_e1rm:state.deadlift,
      squat_e1rm:state.squat,
      training_max_pct:state.tmPct,
      goals:{bench:140,deadlift:220,squat:200,bodyweight:90}
    });
    if (insertError) throw insertError;
  }

  async function pullCloudLogs() {
    if (!cloud.user || !cloud.cycleId) return;
    const {data, error} = await cloud.client.from('exercise_logs').select('*').eq('user_id', cloud.user.id).eq('cycle_id', cloud.cycleId);
    if (error) throw error;

    for (const row of data || []) {
      const key = `w${row.week_number}-${row.day_name}-${row.exercise_index}`;
      const cloudTime = Date.parse(row.updated_at) || 0;
      const localTime = state.setLogs[key]?.updated || 0;
      if (cloudTime >= localTime) {
        state.setLogs[key] = {
          name:row.exercise_name,
          sets:Array.isArray(row.sets) ? row.sets : [],
          notes:row.notes || '',
          updated:cloudTime
        };
        state.completed[key] = !!row.completed;
      }
    }
    save();
  }

  async function syncAllLocal(manual = false) {
    if (!cloud.client || !cloud.user || !cloud.cycleId || cloud.syncing) return;
    cloud.syncing = true;
    cloud.message = 'Syncing…';
    if (manual) renderAnalysis();

    try {
      const {error: settingsError} = await cloud.client.from('coach_settings').upsert({
        user_id:cloud.user.id,
        current_cycle_id:cloud.cycleId,
        current_week:state.week,
        bench_e1rm:state.bench,
        deadlift_e1rm:state.deadlift,
        squat_e1rm:state.squat,
        training_max_pct:state.tmPct,
        goals:{bench:140,deadlift:220,squat:200,bodyweight:90}
      }, {onConflict:'user_id'});
      if (settingsError) throw settingsError;

      const keys = new Set([...Object.keys(state.setLogs || {}), ...Object.keys(state.completed || {})]);
      const rows = [];
      for (const key of keys) {
        const parsed = parseKey(key);
        if (!parsed) continue;
        const exercise = programForWeek(parsed.week)[parsed.day]?.[parsed.index];
        if (!exercise) continue;
        const log = state.setLogs[key] || {sets:[],notes:'',updated:0};
        const hasSetData = !!(log.notes || log.sets?.some(s => s.weight || s.reps || s.rpe));
        if (!hasSetData && !state.completed[key]) continue;

        rows.push({
          user_id:cloud.user.id,
          cycle_id:cloud.cycleId,
          week_number:parsed.week,
          day_name:parsed.day,
          exercise_index:parsed.index,
          exercise_name:exercise[0],
          prescription:prescriptionFor(exercise, parsed.week),
          workout_date:workoutDate(parsed.week, parsed.day),
          completed:!!state.completed[key],
          sets:log.sets || [],
          notes:log.notes || ''
        });
      }

      if (rows.length) {
        const {error: logsError} = await cloud.client.from('exercise_logs').upsert(rows, {
          onConflict:'user_id,cycle_id,week_number,day_name,exercise_index'
        });
        if (logsError) throw logsError;
      }

      cloud.lastSync = Date.now();
      cloud.message = manual ? 'Everything is synced.' : 'Synced';
      await fetchReports(false);
    } catch (error) {
      console.error('[Hybrid Athlete cloud sync]', error);
      cloud.message = `Sync failed: ${error.message || error}`;
    } finally {
      cloud.syncing = false;
      renderCloudBadge();
      renderAnalysis();
    }
  }

  async function fetchReports(redraw = true) {
    if (!cloud.user || !cloud.cycleId) return;
    const {data, error} = await cloud.client.from('weekly_reports')
      .select('*')
      .eq('user_id', cloud.user.id)
      .eq('cycle_id', cloud.cycleId)
      .order('generated_at', {ascending:false})
      .limit(12);

    if (error) {
      cloud.message = `Report refresh failed: ${error.message}`;
      if (redraw) renderAnalysis();
      return;
    }

    cloud.reports = data || [];
    if (redraw) renderAnalysis();
  }

  async function bootstrapCloud(session) {
    if (!session?.user) return;
    if (cloud.user?.id === session.user.id && cloud.cycleId) return;

    cloud.session = session;
    cloud.user = session.user;
    cloud.message = 'Connecting cloud…';
    renderCloudBadge();
    renderAnalysis();

    try {
      await ensureCloudProfile();
      await pullCloudLogs();
      await syncAllLocal(false);
      await fetchReports(false);
      cloud.lastSync = Date.now();
      cloud.message = 'Cloud Sync ready.';
    } catch (error) {
      console.error('[Hybrid Athlete cloud setup]', error);
      cloud.message = `Cloud setup failed: ${error.message || error}`;
    }

    renderCloudBadge();
    renderAnalysis();
    if (typeof renderAll === 'function') renderAll();
  }

  async function authWithPassword(mode) {
    const email = (document.querySelector('#cloudEmail')?.value || '').trim();
    const password = document.querySelector('#cloudPassword')?.value || '';

    if (!email || password.length < 6) {
      cloud.message = 'Enter a valid email and a password of at least 6 characters.';
      renderAnalysis();
      return;
    }

    cloud.message = mode === 'signup' ? 'Creating account…' : 'Signing in…';
    renderAnalysis();

    try {
      if (mode === 'signup') {
        const {data, error} = await cloud.client.auth.signUp({email, password});
        if (error) throw error;
        if (data.session) {
          await bootstrapCloud(data.session);
          return;
        }
        cloud.message = 'Account created. Check your email to confirm it, then come back here and sign in.';
        renderAnalysis();
        return;
      }

      const {data, error} = await cloud.client.auth.signInWithPassword({email, password});
      if (error) throw error;
      if (!data.session) throw new Error('No session returned');
      await bootstrapCloud(data.session);
    } catch (error) {
      console.error('[Hybrid Athlete auth]', error);
      cloud.message = error.message || String(error);
      renderAnalysis();
    }
  }

  function patchCoreApp() {
    if (typeof save === 'function' && !window.__hybridCloudSavePatched) {
      const localSave = save;
      save = function patchedSave() { localSave(); scheduleSync(); };
      window.__hybridCloudSavePatched = true;
    }

    if (typeof renderAll === 'function' && !window.__hybridCloudRenderPatched) {
      const localRenderAll = renderAll;
      renderAll = function patchedRenderAll() {
        localRenderAll();
        injectUi();
        renderCloudBadge();
        renderAnalysis();
      };
      window.__hybridCloudRenderPatched = true;
    }
  }

  async function init() {
    injectUi();
    patchCoreApp();
    renderCloudBadge();
    renderAnalysis();

    try {
      if (!window.supabase?.createClient) throw new Error('Supabase library did not load');
      cloud.client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
      });

      const {data} = await cloud.client.auth.getSession();
      if (data.session) await bootstrapCloud(data.session);

      cloud.client.auth.onAuthStateChange((_event, session) => {
        if (session) bootstrapCloud(session);
        else {
          cloud.session = null;
          cloud.user = null;
          cloud.cycleId = null;
          cloud.reports = [];
          renderCloudBadge();
          renderAnalysis();
        }
      });
    } catch (error) {
      cloud.message = `Cloud unavailable: ${error.message || error}`;
      renderAnalysis();
    }
  }

  init();
})();
