(() => {
  'use strict';

  const SUPABASE_URL = 'https://esowgrsjzsqloavclikf.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_YJUUarFMm2lKVJsInI5kXQ_nCXbMJpb';
  const OLD_KEY = 'hybrid-athlete-v3';
  const MIGRATION_KEY = 'hybrid-athlete-v2-local-import-complete';
  const CACHE_KEY = 'hybrid-athlete-v2-cache';
  const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const DAY_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const PHASES = {1:'Rebuild',2:'Build',3:'Build',4:'Intensify',5:'Peak',6:'Max Test'};
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });

  const state = {
    session:null,user:null,settings:null,cycle:null,program:null,templates:[],exercises:[],schedule:[],workouts:[],exerciseLogs:[],enduranceLogs:[],reports:[],
    selectedWeek:null,loading:true,error:'',online:navigator.onLine,drafts:{},runDrafts:{},openLogs:new Set(),localMigration:{status:'pending',detail:''}
  };
  const saveTimers = new Map();

  const esc = (v='') => String(v).replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]));
  const slug = (v='') => String(v).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
  const round25 = n => Math.round(Number(n || 0) / 2.5) * 2.5;
  const kg = n => `${round25(n).toFixed(1)} kg`;
  const dayNum = () => { const d=new Date().getDay(); return d===0?7:d; };
  const todayISO = () => new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
  const fmtDate = d => d ? new Date(`${d}T12:00:00`).toLocaleDateString(undefined,{day:'numeric',month:'short'}) : '—';
  const clone = v => JSON.parse(JSON.stringify(v));
  const num = v => v === '' || v == null ? null : Number(v);

  function setSync(text, cls='orange') {
    const el=document.querySelector('#syncBadge'); if(!el)return;
    el.textContent=text; el.className=`badge ${cls}`;
  }

  function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active',v.id===id));
    document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('active',b.dataset.view===id));
    renderView(id);
    window.scrollTo({top:0,behavior:'smooth'});
  }

  function wireShell() {
    document.querySelectorAll('.nav button').forEach(btn => btn.addEventListener('click',()=>showView(btn.dataset.view)));
    document.querySelector('#refreshBtn')?.addEventListener('click',()=>loadAll(true));
    window.addEventListener('online',()=>{state.online=true;setSync('Cloud','green');loadAll(false)});
    window.addEventListener('offline',()=>{state.online=false;setSync('Offline','orange')});
    const dlg=document.querySelector('#swapDialog');
    document.querySelector('#swapCancel')?.addEventListener('click',()=>dlg?.close());
    document.querySelector('#swapApply')?.addEventListener('click',swapDaysFromDialog);
  }

  function renderLoading(scope='today', label='Loading training…') {
    const el=document.querySelector(`#${scope}`); if(el) el.innerHTML=`<div class="loading"><div class="spinner"></div>${esc(label)}</div>`;
  }

  function phase() { return PHASES[Number(state.settings?.current_week || state.selectedWeek || 1)] || 'Block'; }
  function currentWeek() { return Number(state.settings?.current_week || 1); }

  function updateHeader() {
    const week=currentWeek();
    document.querySelector('#weekBadge').textContent=`Week ${week}`;
    document.querySelector('#phaseBadge').textContent=`${phase()} • v2`;
    if(state.user && navigator.onLine) setSync('Cloud','green'); else if(state.user) setSync('Offline','orange'); else setSync('Local','orange');
  }

  async function loadAll(force=false) {
    if(state.loading && !force) return;
    state.loading=true; state.error='';
    renderLoading('today');
    try {
      const {data:{session}}=await client.auth.getSession();
      state.session=session; state.user=session?.user || null;
      if(!state.user) {
        loadCache(); state.loading=false; updateHeader(); renderAll(); return;
      }

      const {data:settings,error:settingsError}=await client.from('coach_settings').select('*').eq('user_id',state.user.id).maybeSingle();
      if(settingsError) throw settingsError;
      state.settings=settings;
      if(!settings?.current_cycle_id) throw new Error('No active training cycle is connected to this account.');
      if(!state.selectedWeek) state.selectedWeek=Number(settings.current_week)||1;

      const [{data:cycle,error:cycleErr},{data:program,error:programErr}] = await Promise.all([
        client.from('training_cycles').select('*').eq('id',settings.current_cycle_id).maybeSingle(),
        client.from('programs_v2').select('*').eq('user_id',state.user.id).eq('cycle_id',settings.current_cycle_id).eq('is_active',true).maybeSingle()
      ]);
      if(cycleErr) throw cycleErr; if(programErr) throw programErr;
      state.cycle=cycle; state.program=program;
      if(!program) throw new Error('Hybrid Athlete v2 program has not been created for this cycle.');

      const results=await Promise.all([
        client.from('session_templates_v2').select('*').eq('user_id',state.user.id).eq('program_id',program.id).eq('active',true).order('sort_order'),
        client.from('session_exercises_v2').select('*').eq('user_id',state.user.id).eq('active',true).order('position'),
        client.from('week_schedule_v2').select('*').eq('user_id',state.user.id).eq('cycle_id',settings.current_cycle_id).order('week_number').order('position'),
        client.from('workout_sessions_v2').select('*').eq('user_id',state.user.id).eq('cycle_id',settings.current_cycle_id).order('week_number').order('scheduled_day'),
        client.from('exercise_logs_v2').select('*').eq('user_id',state.user.id).order('updated_at',{ascending:false}),
        client.from('endurance_logs_v2').select('*').eq('user_id',state.user.id).order('updated_at',{ascending:false}),
        client.from('weekly_reports').select('*').eq('user_id',state.user.id).eq('cycle_id',settings.current_cycle_id).order('generated_at',{ascending:false})
      ]);
      const bad=results.find(x=>x.error); if(bad) throw bad.error;
      [state.templates,state.exercises,state.schedule,state.workouts,state.exerciseLogs,state.enduranceLogs,state.reports]=results.map(x=>x.data||[]);

      await importLegacyLocalOnce();
      saveCache();
      state.loading=false; updateHeader(); renderAll();
    } catch(err) {
      console.error('[Hybrid Athlete v2 load]',err);
      state.error=err.message || String(err); state.loading=false;
      if(loadCache()) state.error=`Offline/cached view: ${state.error}`;
      updateHeader(); renderAll();
    }
  }

  function saveCache() {
    try {
      localStorage.setItem(CACHE_KEY,JSON.stringify({
        settings:state.settings,cycle:state.cycle,program:state.program,templates:state.templates,exercises:state.exercises,
        schedule:state.schedule,workouts:state.workouts,exerciseLogs:state.exerciseLogs,enduranceLogs:state.enduranceLogs,reports:state.reports,storedAt:Date.now()
      }));
    } catch(_) {}
  }

  function loadCache() {
    try {
      const c=JSON.parse(localStorage.getItem(CACHE_KEY)||'null'); if(!c)return false;
      Object.assign(state,c); if(!state.selectedWeek)state.selectedWeek=Number(state.settings?.current_week||1); return true;
    } catch(_){return false}
  }

  function templateByKey(key){return state.templates.find(t=>t.session_key===key)}
  function templateExercises(templateId){return state.exercises.filter(e=>e.session_template_id===templateId).sort((a,b)=>a.position-b.position)}
  function scheduleForWeek(week){return state.schedule.filter(s=>Number(s.week_number)===Number(week)).sort((a,b)=>a.scheduled_day-b.scheduled_day||a.position-b.position)}
  function sessionsForDay(week,day){return scheduleForWeek(week).filter(s=>Number(s.scheduled_day)===Number(day)).map(s=>({schedule:s,template:state.templates.find(t=>t.id===s.session_template_id)})).filter(x=>x.template)}
  function workoutFor(week,sessionKey){return state.workouts.find(w=>Number(w.week_number)===Number(week)&&w.session_key===sessionKey)}
  function logsForWorkout(id){return state.exerciseLogs.filter(l=>l.workout_session_id===id)}
  function enduranceForWorkout(id){return state.enduranceLogs.find(l=>l.workout_session_id===id)}

  function displayRx(ex, week=currentWeek()) {
    const p=ex?.prescription||{};
    if(p.kind==='static') return p.text||'—';
    if(p.kind==='paused_squat') {
      if(Number(week)===6)return 'Skip during test week';
      const load=round25(Number(state.settings?.squat_e1rm||0)*Number(state.settings?.training_max_pct||.95)*Number(p.tm_pct||.65));
      return `${p.sets||'2 × 5'} @ ${kg(load)}`;
    }
    if(p.kind==='bench_volume') {
      const r=p.weeks?.[String(week)]; if(!r)return '—'; if(Number(week)===6)return r[0]||'No normal bench volume';
      const load=round25(Number(state.settings?.bench_e1rm||0)*Number(state.settings?.training_max_pct||.95)*Number(r[1]||0));
      return `${r[0]} @ ${kg(load)}`;
    }
    if(p.kind==='main_lift') {
      const r=p.weeks?.[String(week)]; if(!r)return '—'; if(r.test)return 'Max test — build attempts from readiness';
      const e1rm=Number(state.settings?.[`${p.lift}_e1rm`]||0), tm=e1rm*Number(state.settings?.training_max_pct||.95);
      return `${r.top[0]} @ ${kg(tm*Number(r.top[1]))}  •  ${r.back[0]} @ ${kg(tm*Number(r.back[1]))}`;
    }
    return ex?.prescription_text||'—';
  }

  function parseSetRx(s='') {
    const m=String(s).match(/(\d+)\s*[×x]\s*(\d+)/i); return m?{sets:Number(m[1]),reps:Number(m[2])}:null;
  }

  function defaultSets(ex, week=currentWeek()) {
    const p=ex.prescription||{};
    if(['skill','recovery','mobility'].includes(ex.exercise_type))return [];
    if(p.kind==='main_lift') {
      const r=p.weeks?.[String(week)]; if(!r||r.test)return [{weight:'',reps:'',rpe:''}];
      const e1rm=Number(state.settings?.[`${p.lift}_e1rm`]||0), tm=e1rm*Number(state.settings?.training_max_pct||.95);
      const top=parseSetRx(r.top[0]), back=parseSetRx(r.back[0]), out=[];
      for(let i=0;i<(top?.sets||1);i++)out.push({weight:String(round25(tm*Number(r.top[1]))),reps:String(top?.reps||''),rpe:''});
      for(let i=0;i<(back?.sets||1);i++)out.push({weight:String(round25(tm*Number(r.back[1]))),reps:String(back?.reps||''),rpe:''});
      return out;
    }
    if(p.kind==='bench_volume') {
      const r=p.weeks?.[String(week)]; if(!r||Number(week)===6)return [];
      const sr=parseSetRx(r[0]), load=round25(Number(state.settings?.bench_e1rm||0)*Number(state.settings?.training_max_pct||.95)*Number(r[1]||0));
      return Array.from({length:sr?.sets||1},()=>({weight:String(load),reps:String(sr?.reps||''),rpe:''}));
    }
    if(p.kind==='paused_squat') {
      if(Number(week)===6)return [];
      const sr=parseSetRx(p.sets||'2 × 5'), load=round25(Number(state.settings?.squat_e1rm||0)*Number(state.settings?.training_max_pct||.95)*Number(p.tm_pct||.65));
      return Array.from({length:sr?.sets||2},()=>({weight:String(load),reps:String(sr?.reps||5),rpe:''}));
    }
    const sr=parseSetRx(p.text||'');
    return Array.from({length:sr?.sets||3},()=>({weight:'',reps:String(sr?.reps||''),rpe:''}));
  }

  function draftKey(week,exerciseId){return `${week}:${exerciseId}`}
  function getExerciseDraft(ex,workout,week) {
    const key=draftKey(week,ex.id); if(state.drafts[key])return state.drafts[key];
    const existing=workout ? state.exerciseLogs.find(l=>l.workout_session_id===workout.id&&(l.exercise_template_id===ex.id||l.exercise_key===ex.exercise_key)) : null;
    state.drafts[key]={id:existing?.id||null,completed:!!existing?.completed,sets:clone(existing?.sets?.length?existing.sets:defaultSets(ex,week)),notes:existing?.notes||''};
    return state.drafts[key];
  }

  function previousSummary(ex,week) {
    const rows=state.exerciseLogs.filter(l=>slug(l.exercise_name)===slug(ex.exercise_name));
    const withSession=rows.map(l=>({l,w:state.workouts.find(w=>w.id===l.workout_session_id)})).filter(x=>x.w&&Number(x.w.week_number)<Number(week)).sort((a,b)=>Number(b.w.week_number)-Number(a.w.week_number)||Date.parse(b.l.updated_at)-Date.parse(a.l.updated_at));
    const prev=withSession[0]?.l; if(!prev)return '';
    const sets=(prev.sets||[]).filter(s=>s.weight||s.reps||s.rpe).map(s=>`${s.weight||'—'}×${s.reps||'—'}${s.rpe?` @${s.rpe}`:''}`).join(' · ');
    return sets?`Last: ${sets}`:'';
  }

  function renderExercise(ex,workout,week) {
    const d=getExerciseDraft(ex,workout,week), key=draftKey(week,ex.id), open=state.openLogs.has(key), metricless=['skill','recovery','mobility'].includes(ex.exercise_type);
    const prev=previousSummary(ex,week);
    return `<div class="exercise ${d.completed?'done':''}" data-exercise-id="${ex.id}" data-template-id="${ex.session_template_id}" data-week="${week}">
      <div class="exerciseHead"><input class="check exCheck" type="checkbox" ${d.completed?'checked':''}><div><div class="name">${esc(ex.exercise_name)}</div><div class="rx">${esc(displayRx(ex,week))}</div>${ex.notes?`<div class="note">${esc(ex.notes)}</div>`:''}</div><button class="logToggle" type="button">${open?'Hide':'Log'}</button></div>
      ${open?`<div class="logPanel">${prev?`<div class="lastTime">${esc(prev)}</div>`:''}${metricless?'':`<div class="setHead"><span>Set</span><span>kg</span><span>Reps</span><span>RPE</span><span></span></div><div class="setRows">${d.sets.map((s,i)=>`<div class="setRow" data-set="${i}"><span class="setNo">${i+1}</span><input class="field mini setWeight" inputmode="decimal" value="${esc(s.weight||'')}"><input class="field mini setReps" inputmode="numeric" value="${esc(s.reps||'')}"><input class="field mini setRpe" inputmode="decimal" value="${esc(s.rpe||'')}"><button class="setRemove" type="button">×</button></div>`).join('')}</div><div class="logActions"><button class="btn small addSet" type="button">+ Set</button><span class="note saveState">Autosaves</span></div>`}<textarea class="field exNotes" placeholder="Notes">${esc(d.notes)}</textarea></div>`:''}
    </div>`;
  }

  function renderRunSession(template,workout,week) {
    const plan=template.plan?.weeks?.[String(week)]||{};
    const existing=workout?enduranceForWorkout(workout.id):null;
    const key=`${week}:${template.id}`;
    if(!state.runDrafts[key]) state.runDrafts[key]={id:existing?.id||null,completed:!!existing?.completed,duration:existing?.actual_duration_min??'',distance:existing?.distance_km??'',pace:existing?.avg_pace??'',avgHr:existing?.avg_hr??'',maxHr:existing?.max_hr??'',calories:existing?.calories??'',rpe:existing?.rpe??'',notes:existing?.notes||''};
    const d=state.runDrafts[key];
    const pace=d.pace||paceFrom(d.duration,d.distance);
    return `<div class="card sessionCard" data-run-template="${template.id}" data-week="${week}"><div class="sessionHead"><div><div class="sessionType">Run</div><div class="sessionTitle">${esc(template.name)}</div><div class="sessionMeta">${esc(plan.duration||'Easy aerobic')} • ${esc(plan.notes||template.notes||'')}</div></div><input class="check runCheck" type="checkbox" ${d.completed?'checked':''}></div>
      <div class="runMetrics"><div class="metric"><small>Duration</small><b>${esc(d.duration?`${d.duration} min`:plan.duration||'—')}</b></div><div class="metric"><small>Distance</small><b>${esc(d.distance?`${d.distance} km`:'—')}</b></div><div class="metric"><small>Pace</small><b>${esc(pace||'—')}</b></div></div>
      <div class="grid3" style="margin-top:9px"><label class="formLabel">Minutes<input class="field runDuration" type="number" inputmode="decimal" value="${esc(d.duration)}"></label><label class="formLabel">Distance km<input class="field runDistance" type="number" inputmode="decimal" step="0.01" value="${esc(d.distance)}"></label><label class="formLabel">RPE<input class="field runRpe" type="number" inputmode="decimal" step="0.5" min="1" max="10" value="${esc(d.rpe)}"></label><label class="formLabel">Avg HR<input class="field runAvgHr" type="number" inputmode="numeric" value="${esc(d.avgHr)}"></label><label class="formLabel">Max HR<input class="field runMaxHr" type="number" inputmode="numeric" value="${esc(d.maxHr)}"></label><label class="formLabel">Calories<input class="field runCalories" type="number" inputmode="numeric" value="${esc(d.calories)}"></label></div><textarea class="field runNotes" style="margin-top:8px" placeholder="How did it feel? Legs, breathing, niggles…">${esc(d.notes)}</textarea><div class="note">Pace calculates automatically from time + distance. Garmin-ready.</div></div>`;
  }

  function paceFrom(duration,distance){
    const m=Number(duration),km=Number(distance);if(!m||!km)return '';
    const p=m/km;let whole=Math.floor(p),sec=Math.round((p-whole)*60);if(sec===60){whole+=1;sec=0}
    return `${whole}:${String(sec).padStart(2,'0')}/km`;
  }

  function renderSession(template,week,scheduledDay) {
    const workout=workoutFor(week,template.session_key);
    if(template.session_type==='run')return renderRunSession(template,workout,week);
    const exs=templateExercises(template.id);
    const done=exs.filter(ex=>getExerciseDraft(ex,workout,week).completed).length;
    return `<div class="card sessionCard"><div class="sessionHead"><div><div class="sessionType">${esc(template.session_type)}</div><div class="sessionTitle">${esc(template.name)}</div><div class="sessionMeta">${done}/${exs.length} complete${template.notes?` • ${esc(template.notes)}`:''}</div></div>${scheduledDay&&Number(scheduledDay)!==Number(template.default_day)?'<span class="badge">Moved</span>':''}</div><div class="exerciseList">${exs.map(ex=>renderExercise(ex,workout,week)).join('')}</div></div>`;
  }

  function renderToday() {
    const el=document.querySelector('#today'); if(state.loading){renderLoading('today');return}
    if(!state.user && !state.program){el.innerHTML=`<div class="hero"><div class="eyebrow">Hybrid Athlete v2</div><h1>Your training, rebuilt properly.</h1><p>Sign in from Settings to load your program and migrated history.</p></div>${state.error?`<div class="section"><div class="notice warning">${esc(state.error)}</div></div>`:''}`;return}
    const week=currentWeek(), day=dayNum(), sessions=sessionsForDay(week,day);
    const total=sessions.reduce((n,x)=>n+(x.template.session_type==='run'?1:templateExercises(x.template.id).length),0);
    let done=0; sessions.forEach(x=>{const w=workoutFor(week,x.template.session_key);if(x.template.session_type==='run'){if(w&&enduranceForWorkout(w.id)?.completed)done++}else templateExercises(x.template.id).forEach(ex=>{if(getExerciseDraft(ex,w,week).completed)done++})});
    el.innerHTML=`<div class="hero"><div class="eyebrow">${DAYS[day-1]} • Week ${week}</div><h1>${sessions.length?sessions.map(x=>x.template.name).join(' + '):'Recovery day'}</h1><p>${sessions.length?'Your schedule is data-driven now — moving a session won’t change its history.':'Nothing compulsory is scheduled today.'}</p>${total?`<div class="progress"><div class="progressHead"><span>Today</span><span>${done}/${total}</span></div><div class="bar"><i style="width:${Math.round(done/total*100)}%"></i></div></div>`:''}</div>${state.error?`<div class="section"><div class="notice warning">${esc(state.error)}</div></div>`:''}<div class="section"><div class="sectionTitle"><h2>${sessions.length?'Sessions':'Off / recovery'}</h2><span>${phase()}</span></div>${sessions.length?sessions.map(x=>renderSession(x.template,week,x.schedule.scheduled_day)).join(''):'<div class="empty">Walk, recover, or move a session here from Plan.</div>'}</div>`;
    wireExerciseCards('#today'); wireRunCards('#today');
  }

  function renderPlan() {
    const el=document.querySelector('#plan'); if(state.loading){renderLoading('plan');return}
    if(!state.program){el.innerHTML='<div class="empty">Sign in to view your plan.</div>';return}
    const week=Number(state.selectedWeek||currentWeek()), sched=scheduleForWeek(week), curDay=week===currentWeek()?dayNum():null;
    const labels=DAYS.map((_,i)=>sessionsForDay(week,i+1).map(x=>shortSession(x.template)).join('+')||'Off');
    el.innerHTML=`<div class="hero"><div class="eyebrow">Program architecture v2</div><h1>Week ${week} plan</h1><p>Sessions are independent from weekdays. Move them freely without changing exercise IDs or history.</p><div class="heroActions"><button class="btn primary" id="swapDaysBtn">Swap days</button><button class="btn" id="resetWeekBtn">Reset week</button></div></div><div class="section"><div class="weekSelector">${Array.from({length:state.program.block_weeks||6},(_,i)=>`<button class="weekBtn ${week===i+1?'active':''}" data-week="${i+1}">W${i+1}</button>`).join('')}</div><div class="weekDays">${DAYS.map((d,i)=>`<div class="dayMini ${curDay===i+1?'current':''}"><b>${DAY_SHORT[i]}</b><span>${esc(labels[i])}</span></div>`).join('')}</div></div><div class="section"><div class="sectionTitle"><h2>Schedule</h2><span>${sched.length} sessions</span></div>${DAYS.map((day,i)=>renderPlanDay(week,i+1)).join('')}</div>`;
    el.querySelectorAll('.weekBtn').forEach(b=>b.addEventListener('click',()=>{state.selectedWeek=Number(b.dataset.week);renderPlan()}));
    el.querySelector('#swapDaysBtn')?.addEventListener('click',openSwapDialog);
    el.querySelector('#resetWeekBtn')?.addEventListener('click',()=>resetWeek(week));
    el.querySelectorAll('.moveSelect').forEach(sel=>sel.addEventListener('change',()=>moveScheduleRow(sel.dataset.scheduleId,Number(sel.value))));
  }

  function shortSession(t){const map={heavy_upper:'Upper',deadlift_lower:'Deadlift',easy_run:'Run',mobility:'Mobility',upper_power:'Power',squat_lower_power:'Squat',aerobic_run:'Aerobic'};return map[t.session_key]||t.name.split(' ')[0]}
  function renderPlanDay(week,day) {
    const sessions=sessionsForDay(week,day);
    return `<details class="planDay" ${week===currentWeek()&&day===dayNum()?'open':''}><summary><div class="dayBadge">${DAY_SHORT[day-1]}</div><div><div class="planDayTitle">${sessions.length?sessions.map(x=>x.template.name).join(' + '):'Recovery / off'}</div><div class="planDayMeta">${sessions.length?`${sessions.length} session${sessions.length===1?'':'s'}`:'No scheduled session'}</div></div><div>⌄</div></summary><div class="planBody">${sessions.length?sessions.map(x=>`<div class="planSession"><div><div class="planSessionName">${esc(x.template.name)}</div><div class="planSessionType">${esc(x.template.session_type)}</div></div><select class="field moveSelect" data-schedule-id="${x.schedule.id}">${DAYS.map((d,i)=>`<option value="${i+1}" ${day===i+1?'selected':''}>${DAY_SHORT[i]}</option>`).join('')}</select></div>`).join(''):'<div class="empty">No session here.</div>'}</div></details>`;
  }

  function renderProgress() {
    const el=document.querySelector('#progress'); if(state.loading){renderLoading('progress');return}
    if(!state.program){el.innerHTML='<div class="empty">Sign in to view progress.</div>';return}
    const completed=state.workouts.filter(w=>w.status==='completed').length;
    const loggedSets=state.exerciseLogs.reduce((n,l)=>n+(l.sets||[]).filter(s=>s.weight||s.reps||s.rpe).length,0);
    const runKm=state.enduranceLogs.reduce((n,r)=>n+Number(r.distance_km||0),0);
    const recent=[...state.workouts].sort((a,b)=>String(b.workout_date||b.scheduled_date||'').localeCompare(String(a.workout_date||a.scheduled_date||''))||Date.parse(b.updated_at)-Date.parse(a.updated_at)).slice(0,18);
    el.innerHTML=`<div class="hero"><div class="eyebrow">Training history</div><h1>Progress</h1><p>Your old logs and new v2 sessions live together here. Editing the program no longer rewrites history.</p></div><div class="section"><div class="statGrid"><div class="stat"><small>Bench e1RM</small><b>${esc(state.settings?.bench_e1rm||'—')} kg</b></div><div class="stat"><small>Deadlift e1RM</small><b>${esc(state.settings?.deadlift_e1rm||'—')} kg</b></div><div class="stat"><small>Squat e1RM</small><b>${esc(state.settings?.squat_e1rm||'—')} kg</b></div></div></div><div class="section"><div class="statGrid"><div class="stat"><small>Completed sessions</small><b>${completed}</b></div><div class="stat"><small>Logged sets</small><b>${loggedSets}</b></div><div class="stat"><small>Running logged</small><b>${runKm?runKm.toFixed(1):'0'} km</b></div></div></div><div class="section"><div class="sectionTitle"><h2>Session history</h2><span>${state.exerciseLogs.length} exercise logs • ${state.enduranceLogs.length} runs</span></div>${recent.map(renderHistoryRow).join('')||'<div class="empty">No session history yet.</div>'}</div>`;
  }

  function renderHistoryRow(w) {
    const ex=logsForWorkout(w.id), run=enduranceForWorkout(w.id), done=run?run.completed:ex.some(x=>x.completed);
    const meta=run?[run.distance_km?`${run.distance_km} km`:'',run.actual_duration_min?`${run.actual_duration_min} min`:'',run.rpe?`RPE ${run.rpe}`:''].filter(Boolean).join(' • '):`${ex.filter(x=>x.completed).length}/${ex.length} exercises`;
    return `<div class="card compact historyRow"><div class="historyDate">${esc(fmtDate(w.workout_date||w.scheduled_date))}<br>W${w.week_number}</div><div><div class="historyName">${esc(w.session_name)}</div><div class="historyMeta">${esc(meta||w.session_type)}</div></div><span class="pill ${done?'done':''}">${done?'Done':'Logged'}</span></div>`;
  }

  function renderCoach() {
    const el=document.querySelector('#coach'); if(state.loading){renderLoading('coach');return}
    if(!state.program){el.innerHTML='<div class="empty">Sign in to view coaching reports.</div>';return}
    const current=state.reports.find(r=>Number(r.week_number)===currentWeek()), older=state.reports.filter(r=>!current||r.id!==current.id).slice(0,6);
    el.innerHTML=`<div class="hero"><div class="eyebrow">AI coaching • Week ${currentWeek()}</div><h1>Coach</h1><p>The weekly review now reads v2 workout sessions, exercise logs and endurance data together.</p></div><div class="section">${current?`<div class="card"><div class="name">Week ${current.week_number} review</div><div class="reportMeta">Generated ${esc(new Date(current.generated_at).toLocaleString())}</div><div class="report">${esc(current.report_markdown)}</div></div>`:'<div class="notice">No report for the current week yet. Your Sunday review will appear here.</div>'}${older.length?`<div class="sectionTitle" style="margin-top:16px"><h2>Previous</h2><span>History</span></div>${older.map(r=>`<details class="card compact"><summary class="name">Week ${r.week_number}</summary><div class="reportMeta">${esc(new Date(r.generated_at).toLocaleString())}</div><div class="report">${esc(r.report_markdown)}</div></details>`).join('')}`:''}</div>`;
  }

  function renderSettings() {
    const el=document.querySelector('#settings'); if(state.loading){renderLoading('settings');return}
    if(!state.user) {
      el.innerHTML=`<div class="hero"><div class="eyebrow">Account</div><h1>Connect your training</h1><p>Your existing Supabase account still owns all migrated data.</p></div><div class="section"><div class="card"><div class="name">Sign in</div><div class="authStack"><input id="authEmail" class="field" type="email" autocomplete="email" placeholder="Email"><input id="authPassword" class="field" type="password" autocomplete="current-password" placeholder="Password"></div><div class="inlineActions" style="margin-top:9px"><button class="btn primary" id="signInBtn">Sign in</button></div><div class="note" id="authMessage"></div></div></div>`;
      el.querySelector('#signInBtn')?.addEventListener('click',signIn); return;
    }
    const legacyExercise=state.exerciseLogs.filter(x=>x.legacy_exercise_log_id).length, legacyRuns=state.enduranceLogs.filter(x=>x.legacy_run_log_id).length;
    const oldExists=!!localStorage.getItem(OLD_KEY), migrated=localStorage.getItem(MIGRATION_KEY);
    el.innerHTML=`<div class="hero"><div class="eyebrow">Hybrid Athlete v2</div><h1>Settings</h1><p>Strength estimates and week control live here. Program changes now happen in database templates, not hard-coded app files.</p></div><div class="section settingsSection"><h3>Training</h3><div class="card"><div class="grid2"><label class="formLabel">Current week<select id="setWeek" class="field">${Array.from({length:state.program?.block_weeks||6},(_,i)=>`<option value="${i+1}" ${currentWeek()===i+1?'selected':''}>Week ${i+1}</option>`).join('')}</select></label><label class="formLabel">Training max %<input id="setTm" class="field" type="number" step="1" value="${Number(state.settings.training_max_pct||.95)*100}"></label><label class="formLabel">Bench e1RM<input id="setBench" class="field" type="number" step="2.5" value="${esc(state.settings.bench_e1rm)}"></label><label class="formLabel">Deadlift e1RM<input id="setDeadlift" class="field" type="number" step="2.5" value="${esc(state.settings.deadlift_e1rm)}"></label><label class="formLabel">Squat e1RM<input id="setSquat" class="field" type="number" step="2.5" value="${esc(state.settings.squat_e1rm)}"></label></div><div class="inlineActions" style="margin-top:10px"><button class="btn primary" id="saveSettingsBtn">Save</button></div></div></div><div class="section settingsSection"><h3>Data safety</h3><div class="card dataSafety"><div class="safetyRow"><span>Legacy cloud exercise rows migrated</span><b>${legacyExercise} / 153</b></div><div class="safetyRow"><span>Legacy running rows migrated</span><b>${legacyRuns} / 6</b></div><div class="safetyRow"><span>Old on-device database retained</span><b>${oldExists?'Yes':'Not on this device'}</b></div><div class="safetyRow"><span>One-time local import</span><b>${migrated?'Complete':'Pending'}</b></div><div class="notice success">The old cloud tables and the old <code>${OLD_KEY}</code> localStorage key have not been deleted.</div></div></div><div class="section settingsSection"><h3>Account</h3><div class="card"><div class="name">${esc(state.user.email||'Signed in')}</div><div class="inlineActions" style="margin-top:10px"><button class="btn" id="signOutBtn">Sign out</button></div></div></div>`;
    el.querySelector('#saveSettingsBtn')?.addEventListener('click',saveSettings);
    el.querySelector('#signOutBtn')?.addEventListener('click',async()=>{await client.auth.signOut();state.user=null;state.session=null;renderAll()});
  }

  function renderView(id){({today:renderToday,plan:renderPlan,progress:renderProgress,coach:renderCoach,settings:renderSettings}[id]||(()=>{}))()}
  function renderAll(){updateHeader();document.querySelectorAll('.view').forEach(v=>{if(v.classList.contains('active'))renderView(v.id)})}

  function wireExerciseCards(scope) {
    document.querySelectorAll(`${scope} [data-exercise-id]`).forEach(card=>{
      const ex=state.exercises.find(e=>e.id===card.dataset.exerciseId), week=Number(card.dataset.week), key=draftKey(week,ex.id);
      card.querySelector('.logToggle')?.addEventListener('click',()=>{state.openLogs.has(key)?state.openLogs.delete(key):state.openLogs.add(key);renderAll()});
      card.querySelector('.exCheck')?.addEventListener('change',e=>{getExerciseDraft(ex,workoutFor(week,templateById(ex.session_template_id).session_key),week).completed=e.target.checked;scheduleExerciseSave(ex,week)});
      card.querySelectorAll('.setRow').forEach(row=>{
        const i=Number(row.dataset.set); ['Weight','Reps','Rpe'].forEach(k=>row.querySelector(`.set${k}`)?.addEventListener('input',e=>{const d=getExerciseDraft(ex,workoutFor(week,templateById(ex.session_template_id).session_key),week);d.sets[i][k.toLowerCase()]=e.target.value;scheduleExerciseSave(ex,week)}));
        row.querySelector('.setRemove')?.addEventListener('click',()=>{const d=getExerciseDraft(ex,workoutFor(week,templateById(ex.session_template_id).session_key),week);d.sets.splice(i,1);scheduleExerciseSave(ex,week,true)});
      });
      card.querySelector('.addSet')?.addEventListener('click',()=>{const d=getExerciseDraft(ex,workoutFor(week,templateById(ex.session_template_id).session_key),week);d.sets.push({weight:'',reps:'',rpe:''});scheduleExerciseSave(ex,week,true)});
      card.querySelector('.exNotes')?.addEventListener('input',e=>{getExerciseDraft(ex,workoutFor(week,templateById(ex.session_template_id).session_key),week).notes=e.target.value;scheduleExerciseSave(ex,week)});
    });
  }
  function templateById(id){return state.templates.find(t=>t.id===id)}

  function scheduleExerciseSave(ex,week,rerender=false) {
    const key=draftKey(week,ex.id); clearTimeout(saveTimers.get(key));
    saveTimers.set(key,setTimeout(async()=>{await saveExercise(ex,week);if(rerender)renderAll()},650));
  }

  async function ensureWorkout(template,week) {
    let w=workoutFor(week,template.session_key); if(w)return w;
    const s=state.schedule.find(x=>Number(x.week_number)===Number(week)&&x.session_template_id===template.id);
    const row={id:crypto.randomUUID(),user_id:state.user.id,cycle_id:state.settings.current_cycle_id,week_number:week,session_template_id:template.id,session_key:template.session_key,session_name:template.name,session_type:template.session_type,scheduled_day:s?.scheduled_day||template.default_day,scheduled_date:s?.scheduled_date||null,workout_date:todayISO(),status:'in_progress',source:'app'};
    const {data,error}=await client.from('workout_sessions_v2').insert(row).select().single(); if(error)throw error; state.workouts.push(data); return data;
  }

  async function saveExercise(ex,week) {
    if(!state.user||!navigator.onLine)return;
    try {
      setSync('Saving…','orange'); const template=templateById(ex.session_template_id), w=await ensureWorkout(template,week), d=getExerciseDraft(ex,w,week);
      const payload={user_id:state.user.id,workout_session_id:w.id,exercise_template_id:ex.id,exercise_key:ex.exercise_key,exercise_name:ex.exercise_name,exercise_position:ex.position,prescription_text:displayRx(ex,week),prescription:ex.prescription||{},completed:!!d.completed,sets:d.sets||[],notes:d.notes||'',updated_at:new Date().toISOString()};
      let result;
      if(d.id) result=await client.from('exercise_logs_v2').update(payload).eq('id',d.id).select().single();
      else result=await client.from('exercise_logs_v2').insert({...payload,id:crypto.randomUUID()}).select().single();
      if(result.error)throw result.error;
      d.id=result.data.id; const idx=state.exerciseLogs.findIndex(x=>x.id===d.id); if(idx>=0)state.exerciseLogs[idx]=result.data; else state.exerciseLogs.unshift(result.data);
      if(d.completed){w.status='in_progress'; await refreshSessionStatus(w,template,week)}
      saveCache(); setSync('Cloud','green');
    } catch(err){console.error('[save exercise]',err);setSync('Save failed','orange')}
  }

  async function refreshSessionStatus(w,template,week) {
    if(template.session_type==='run')return;
    const exs=templateExercises(template.id), rows=state.exerciseLogs.filter(x=>x.workout_session_id===w.id), all=exs.length>0&&exs.every(ex=>rows.some(r=>(r.exercise_template_id===ex.id||r.exercise_key===ex.exercise_key)&&r.completed));
    const status=all?'completed':'in_progress'; if(w.status!==status){w.status=status;await client.from('workout_sessions_v2').update({status,workout_date:w.workout_date||todayISO(),updated_at:new Date().toISOString()}).eq('id',w.id)}
  }

  function wireRunCards(scope) {
    document.querySelectorAll(`${scope} [data-run-template]`).forEach(card=>{
      const template=templateById(card.dataset.runTemplate), week=Number(card.dataset.week), key=`${week}:${template.id}`, d=state.runDrafts[key];
      card.querySelector('.runCheck')?.addEventListener('change',e=>{d.completed=e.target.checked;scheduleRunSave(template,week)});
      const map=[['.runDuration','duration'],['.runDistance','distance'],['.runRpe','rpe'],['.runAvgHr','avgHr'],['.runMaxHr','maxHr'],['.runCalories','calories'],['.runNotes','notes']];
      map.forEach(([sel,k])=>card.querySelector(sel)?.addEventListener('input',e=>{d[k]=e.target.value;scheduleRunSave(template,week)}));
    });
  }
  function scheduleRunSave(template,week){const key=`run:${week}:${template.id}`;clearTimeout(saveTimers.get(key));saveTimers.set(key,setTimeout(()=>saveRun(template,week),650))}
  async function saveRun(template,week) {
    if(!state.user||!navigator.onLine)return;
    try {
      setSync('Saving…','orange'); const w=await ensureWorkout(template,week), key=`${week}:${template.id}`, d=state.runDrafts[key], plan=template.plan?.weeks?.[String(week)]||{};
      const payload={user_id:state.user.id,workout_session_id:w.id,planned_duration_min:num(plan.target),plan_notes:plan.notes||'',completed:!!d.completed,actual_duration_min:num(d.duration),distance_km:num(d.distance),avg_pace:d.pace||paceFrom(d.duration,d.distance)||null,avg_hr:num(d.avgHr),max_hr:num(d.maxHr),calories:num(d.calories),rpe:num(d.rpe),notes:d.notes||'',source:'manual',updated_at:new Date().toISOString()};
      const {data,error}=await client.from('endurance_logs_v2').upsert(payload,{onConflict:'workout_session_id'}).select().single(); if(error)throw error;
      d.id=data.id; const idx=state.enduranceLogs.findIndex(x=>x.id===data.id);if(idx>=0)state.enduranceLogs[idx]=data;else state.enduranceLogs.unshift(data);
      const status=d.completed?'completed':'in_progress'; w.status=status; w.workout_date=w.workout_date||todayISO(); await client.from('workout_sessions_v2').update({status,workout_date:w.workout_date,updated_at:new Date().toISOString()}).eq('id',w.id);
      saveCache();setSync('Cloud','green');renderAll();
    }catch(err){console.error('[save run]',err);setSync('Save failed','orange')}
  }

  async function moveScheduleRow(id,newDay) {
    const row=state.schedule.find(x=>x.id===id);if(!row||Number(row.scheduled_day)===newDay)return;
    const newDate=dateForWeekDay(row.week_number,newDay);
    const {error}=await client.from('week_schedule_v2').update({scheduled_day:newDay,scheduled_date:newDate,updated_at:new Date().toISOString()}).eq('id',id);if(error){alert(error.message);return}row.scheduled_day=newDay;row.scheduled_date=newDate;saveCache();renderPlan();if(Number(row.week_number)===currentWeek())renderToday();
  }
  function dateForWeekDay(week,day){if(!state.cycle?.start_date)return null;const d=new Date(`${state.cycle.start_date}T12:00:00`);d.setDate(d.getDate()+(Number(week)-1)*7+(Number(day)-1));return d.toISOString().slice(0,10)}
  function openSwapDialog(){const dlg=document.querySelector('#swapDialog'),a=document.querySelector('#swapA'),b=document.querySelector('#swapB');const opts=DAYS.map((d,i)=>`<option value="${i+1}">${d}</option>`).join('');a.innerHTML=opts;b.innerHTML=opts;b.selectedIndex=1;dlg.showModal()}
  async function swapDaysFromDialog(){const week=Number(state.selectedWeek||currentWeek()),a=Number(document.querySelector('#swapA').value),b=Number(document.querySelector('#swapB').value);if(a===b)return;const rows=scheduleForWeek(week).filter(r=>Number(r.scheduled_day)===a||Number(r.scheduled_day)===b);for(const row of rows){const nd=Number(row.scheduled_day)===a?b:a;const ndDate=dateForWeekDay(week,nd);const {error}=await client.from('week_schedule_v2').update({scheduled_day:nd,scheduled_date:ndDate,updated_at:new Date().toISOString()}).eq('id',row.id);if(error){alert(error.message);return}row.scheduled_day=nd;row.scheduled_date=ndDate}document.querySelector('#swapDialog').close();saveCache();renderPlan();if(week===currentWeek())renderToday()}
  async function resetWeek(week){if(!confirm(`Reset Week ${week} to the default layout?`))return;for(const row of scheduleForWeek(week)){const t=state.templates.find(x=>x.id===row.session_template_id),day=t.default_day,resetDate=dateForWeekDay(week,day);const {error}=await client.from('week_schedule_v2').update({scheduled_day:day,scheduled_date:resetDate,updated_at:new Date().toISOString()}).eq('id',row.id);if(error){alert(error.message);return}row.scheduled_day=day;row.scheduled_date=resetDate}saveCache();renderPlan();if(week===currentWeek())renderToday()}

  async function saveSettings(){const payload={current_week:Number(document.querySelector('#setWeek').value),training_max_pct:Number(document.querySelector('#setTm').value)/100,bench_e1rm:Number(document.querySelector('#setBench').value),deadlift_e1rm:Number(document.querySelector('#setDeadlift').value),squat_e1rm:Number(document.querySelector('#setSquat').value),updated_at:new Date().toISOString()};const {data,error}=await client.from('coach_settings').update(payload).eq('user_id',state.user.id).select().single();if(error){alert(error.message);return}state.settings={...state.settings,...data};state.selectedWeek=payload.current_week;state.drafts={};saveCache();renderAll()}
  async function signIn(){const email=document.querySelector('#authEmail').value.trim(),password=document.querySelector('#authPassword').value,msg=document.querySelector('#authMessage');msg.textContent='Signing in…';const {data,error}=await client.auth.signInWithPassword({email,password});if(error){msg.textContent=error.message;return}state.session=data.session;state.user=data.user;state.loading=false;await loadAll(true)}

  const LEGACY_NAMES={
    Monday:['Bench Press','Standing Barbell Military Press','Weighted Pull-Ups','Incline Barbell Bench','Barbell Row','Renegade Row','EZ-Bar Curl','Weighted Dips','Dead Hang + Side Bend','Lat Pulldown Machine'],
    Tuesday:['Conventional Deadlift','Paused Back Squat','Romanian Deadlift','Bulgarian Split Squat','Cossack Squat','Half-Kneeling Row + Rotation','Side-to-Side KB Pick-Up','Calf Raise','Knee-Hover Crawl'],
    Wednesday:['Pilates + Mobility','Easy Run — Rebuild'],
    Thursday:['Push Press','Explosive Pull-Ups','Bench Press — Volume','Chest-Supported Row','Chest Fly','Reverse Pec Deck / Rear-Delt Fly','Lateral Raise','Hammer Curl','Incline DB / Cable Curl','Triceps Pressdown','OH Triceps Extension','Dead Hang','Single-Arm Cable Lat Pulldown'],
    Friday:['Box Jump','Back Squat','Kettlebell Swing','OH KB Split-Stance Lunge','Wood Chop','Directional Hop + Stick','Farmer Carry','Lateral Raise'],
    Saturday:['Rest / Easy Walk'],Sunday:['Zone 2 Run — Aerobic Base']
  };
  function legacySessionKey(day,name=''){if(day==='Monday')return'heavy_upper';if(day==='Tuesday')return'deadlift_lower';if(day==='Wednesday')return /run/i.test(name)?'easy_run':'mobility';if(day==='Thursday')return'upper_power';if(day==='Friday')return'squat_lower_power';if(day==='Sunday')return'aerobic_run';return slug(day)}

  async function importLegacyLocalOnce() {
    if(localStorage.getItem(MIGRATION_KEY)){state.localMigration={status:'complete',detail:'Previously imported'};return}
    const raw=localStorage.getItem(OLD_KEY); if(!raw){localStorage.setItem(MIGRATION_KEY,JSON.stringify({at:Date.now(),status:'no-local-data'}));state.localMigration={status:'complete',detail:'No legacy local database on this device'};return}
    try {
      const old=JSON.parse(raw), completed=old.completed||{}, logs=old.setLogs||{}, schedules=old.weekSchedules||{};
      for(const [weekStr,weekSchedule] of Object.entries(schedules)){
        const week=Number(weekStr); if(!weekSchedule||!week)continue;
        const targetBySource={}; Object.entries(weekSchedule).forEach(([slot,sources])=>(sources||[]).forEach(source=>targetBySource[source]=DAYS.indexOf(slot)+1));
        const bundles={Monday:['heavy_upper'],Tuesday:['deadlift_lower'],Wednesday:['easy_run','mobility'],Thursday:['upper_power'],Friday:['squat_lower_power'],Sunday:['aerobic_run']};
        for(const [source,keys] of Object.entries(bundles)){const target=targetBySource[source];if(!target)continue;for(const sk of keys){const t=templateByKey(sk);const row=state.schedule.find(s=>Number(s.week_number)===week&&s.session_template_id===t?.id);if(row&&Number(row.scheduled_day)!==target){const targetDate=dateForWeekDay(week,target);const {error}=await client.from('week_schedule_v2').update({scheduled_day:target,scheduled_date:targetDate,updated_at:new Date().toISOString()}).eq('id',row.id);if(error)throw error;row.scheduled_day=target;row.scheduled_date=targetDate}}}
      }

      const keys=new Set([...Object.keys(logs),...Object.keys(completed)]); let imported=0;
      for(const key of keys){const m=key.match(/^w(\d+)-(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)-(\d+)$/);if(!m)continue;const week=Number(m[1]),day=m[2],idx=Number(m[3]),l=logs[key]||{},name=l.name||LEGACY_NAMES[day]?.[idx];if(!name)continue;const hasData=!!(l.notes||(l.sets||[]).some(s=>s.weight||s.reps||s.rpe)||completed[key]);if(!hasData)continue;const sk=legacySessionKey(day,name),t=templateByKey(sk);if(!t)continue;const w=await ensureWorkout(t,week), existing=state.exerciseLogs.find(x=>x.workout_session_id===w.id&&slug(x.exercise_name)===slug(name)), localTime=Number(l.updated||0), cloudTime=existing?Date.parse(existing.updated_at||0):0;if(existing&&localTime<=cloudTime)continue;const ex=templateExercises(t.id).find(x=>slug(x.exercise_name)===slug(name));const payload={user_id:state.user.id,workout_session_id:w.id,exercise_template_id:ex?.id||null,exercise_key:ex?.exercise_key||slug(name),exercise_name:name,exercise_position:idx,prescription_text:existing?.prescription_text||'',prescription:ex?.prescription||{},completed:!!completed[key],sets:l.sets||[],notes:l.notes||'',updated_at:new Date(localTime||Date.now()).toISOString()};let res;if(existing)res=await client.from('exercise_logs_v2').update(payload).eq('id',existing.id).select().single();else res=await client.from('exercise_logs_v2').insert({...payload,id:crypto.randomUUID()}).select().single();if(res.error)throw res.error;if(existing)Object.assign(existing,res.data);else state.exerciseLogs.unshift(res.data);imported++}

      for(const [k,l] of Object.entries(old.runLogs||{})){const m=k.match(/^w(\d+)-(midweek|long)$/);if(!m)continue;const week=Number(m[1]),sk=m[2]==='midweek'?'easy_run':'aerobic_run',t=templateByKey(sk);if(!t)continue;const w=await ensureWorkout(t,week),existing=enduranceForWorkout(w.id),localTime=Number(l.updated||0),cloudTime=existing?Date.parse(existing.updated_at||0):0;if(existing&&localTime<=cloudTime)continue;const plan=t.plan?.weeks?.[String(week)]||{};const payload={user_id:state.user.id,workout_session_id:w.id,planned_duration_min:num(plan.target),plan_notes:plan.notes||'',completed:!!old.completed?.[`w${week}-${sk==='easy_run'?'Wednesday':'Sunday'}-${sk==='easy_run'?1:0}`],actual_duration_min:num(l.duration),distance_km:num(l.distance),avg_pace:l.pace||paceFrom(l.duration,l.distance)||null,avg_hr:num(l.avgHr),max_hr:num(l.maxHr),calories:num(l.calories),rpe:num(l.rpe),notes:l.notes||'',source:l.source||'manual',garmin_activity_id:l.garminActivityId||null,updated_at:new Date(localTime||Date.now()).toISOString()};const res=await client.from('endurance_logs_v2').upsert(payload,{onConflict:'workout_session_id'}).select().single();if(res.error)throw res.error;if(existing)Object.assign(existing,res.data);else state.enduranceLogs.unshift(res.data);imported++}
      localStorage.setItem(MIGRATION_KEY,JSON.stringify({at:Date.now(),status:'complete',imported}));state.localMigration={status:'complete',detail:`Imported ${imported} newer local records`};
    }catch(err){console.error('[legacy local import]',err);state.localMigration={status:'error',detail:err.message||String(err)};throw err}
  }

  wireShell();
  ['today','plan','progress','coach','settings'].forEach(v=>renderLoading(v));
  client.auth.onAuthStateChange((event,session)=>{state.session=session;state.user=session?.user||null;if(event==='SIGNED_IN')setTimeout(()=>loadAll(true),0);if(event==='SIGNED_OUT'){state.user=null;renderAll()}});
  loadAll(true);
})();