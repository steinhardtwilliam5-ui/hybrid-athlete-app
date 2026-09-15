(() => {
  'use strict';

  const SUPABASE_URL = 'https://esowgrsjzsqloavclikf.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_YJUUarFMm2lKVJsInI5kXQ_nCXbMJpb';
  const BLOCK_START = '2026-09-14';
  const DAY_OFFSETS = {Monday:0,Tuesday:1,Wednesday:2,Thursday:3,Friday:4,Saturday:5,Sunday:6};
  let client = null;
  let syncing = false;
  let timer = null;

  function numberOrNull(v) {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function integerOrNull(v) {
    const n = numberOrNull(v);
    return n === null ? null : Math.round(n);
  }

  function workoutDate(week, slotDay) {
    const d = new Date(`${BLOCK_START}T12:00:00`);
    d.setDate(d.getDate() + ((Number(week) - 1) * 7) + (DAY_OFFSETS[slotDay] || 0));
    return d.toISOString().slice(0,10);
  }

  async function context() {
    const {data:{session}} = await client.auth.getSession();
    if (!session?.user) return null;
    const {data:settings, error} = await client.from('coach_settings').select('current_cycle_id').eq('user_id', session.user.id).maybeSingle();
    if (error) throw error;
    if (!settings?.current_cycle_id) return null;
    return {session, cycleId:settings.current_cycle_id};
  }

  async function pullRuns() {
    if (!client || !window.hybridRunning) return;
    const ctx = await context();
    if (!ctx) return;
    const {data, error} = await client.from('run_logs').select('*').eq('user_id', ctx.session.user.id).eq('cycle_id', ctx.cycleId);
    if (error) throw error;

    state.runLogs = state.runLogs || {};
    for (const row of data || []) {
      const k = window.hybridRunning.runKey(row.week_number, row.session_key);
      const local = state.runLogs[k] || {};
      const cloudTime = Date.parse(row.updated_at) || 0;
      if (cloudTime >= (local.updated || 0)) {
        state.runLogs[k] = {
          duration: row.actual_duration_min ?? '',
          distance: row.distance_km ?? '',
          pace: row.avg_pace ?? '',
          avgHr: row.avg_hr ?? '',
          maxHr: row.max_hr ?? '',
          calories: row.calories ?? '',
          rpe: row.rpe ?? '',
          notes: row.notes || '',
          source: row.source || 'manual',
          garminActivityId: row.garmin_activity_id || '',
          updated: cloudTime
        };
        state.completed[window.hybridRunning.completionKey(row.week_number, row.session_key)] = !!row.completed;
      }
    }
    save();
    if (typeof renderAll === 'function') renderAll();
  }

  async function syncRuns() {
    if (syncing || !client || !window.hybridRunning) return;
    syncing = true;
    try {
      const ctx = await context();
      if (!ctx) return;
      const rows = [];
      for (const [k, log] of Object.entries(state.runLogs || {})) {
        const m = k.match(/^w(\d+)-(midweek|long)$/);
        if (!m) continue;
        const week = Number(m[1]);
        const sessionKey = m[2];
        const plan = window.hybridRunning.planFor(week, sessionKey);
        const plannedDay = window.hybridRunning.baseDayForSession(sessionKey);
        const slotDay = window.hybridSchedule?.slotForSession?.(week, plannedDay) || plannedDay;
        const completed = !!state.completed[window.hybridRunning.completionKey(week, sessionKey)];
        const hasData = !!(completed || log.duration || log.distance || log.pace || log.avgHr || log.maxHr || log.calories || log.rpe || log.notes);
        if (!hasData) continue;
        rows.push({
          user_id:ctx.session.user.id,
          cycle_id:ctx.cycleId,
          week_number:week,
          session_key:sessionKey,
          session_name:plan.name,
          planned_day:plannedDay,
          planned_duration_min:plan.target,
          plan_notes:plan.notes,
          workout_date:workoutDate(week, slotDay),
          completed,
          actual_duration_min:numberOrNull(log.duration),
          distance_km:numberOrNull(log.distance),
          avg_pace:log.pace || null,
          avg_hr:integerOrNull(log.avgHr),
          max_hr:integerOrNull(log.maxHr),
          calories:integerOrNull(log.calories),
          rpe:numberOrNull(log.rpe),
          notes:log.notes || '',
          source:log.source || 'manual',
          garmin_activity_id:log.garminActivityId || null
        });
      }
      if (rows.length) {
        const {error} = await client.from('run_logs').upsert(rows,{onConflict:'user_id,cycle_id,week_number,session_key'});
        if (error) throw error;
      }
    } catch (error) {
      console.error('[Hybrid Athlete running cloud]', error);
    } finally {
      syncing = false;
    }
  }

  function scheduleSync() {
    clearTimeout(timer);
    timer = setTimeout(syncRuns,700);
  }

  async function bootstrap() {
    if (!window.supabase?.createClient || !window.hybridRunning) return;
    if (!client) client = window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true}});
    const {data:{session}} = await client.auth.getSession();
    if (session?.user) {
      try { await pullRuns(); await syncRuns(); } catch (error) { console.error('[Hybrid Athlete running bootstrap]', error); }
    }
    client.auth.onAuthStateChange((_event, sessionNow) => {
      if (sessionNow?.user) setTimeout(async()=>{try{await pullRuns();await syncRuns();}catch(error){console.error(error)}},500);
    });
  }

  window.addEventListener('hybrid-run-changed', scheduleSync);
  document.addEventListener('click', e => { if (e.target?.id === 'syncNow') setTimeout(syncRuns,150); });
  window.hybridRunningCloud = { syncNow:syncRuns, pull:pullRuns };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',()=>setTimeout(bootstrap,50));
  else setTimeout(bootstrap,50);
})();
