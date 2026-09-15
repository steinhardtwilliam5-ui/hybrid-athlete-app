(() => {
  'use strict';

  state.runLogs = state.runLogs || {};
  const openRunLogs = new Set();

  const RUN_PLAN = {
    1:{midweek:{name:'Easy Run — Rebuild',duration:'25 min',target:25,notes:'Conversational pace. Keep it genuinely easy.'},long:{name:'Zone 2 Run — Aerobic Base',duration:'35 min',target:35,notes:'Easy aerobic running. Finish feeling like you could keep going.'}},
    2:{midweek:{name:'Easy Run — Rebuild',duration:'30 min',target:30,notes:'Conversational pace. Smooth and relaxed.'},long:{name:'Zone 2 Run — Aerobic Base',duration:'40 min',target:40,notes:'Easy Zone 2. Keep the effort controlled.'}},
    3:{midweek:{name:'Easy Run + Strides',duration:'30 min + 4 × 20 sec strides',target:30,notes:'Easy running, then 4 relaxed 20 sec strides with full easy recovery.'},long:{name:'Zone 2 Run — Aerobic Base',duration:'45 min',target:45,notes:'Steady aerobic run. No pace chasing.'}},
    4:{midweek:{name:'Easy Run — Absorb',duration:'20–25 min',target:25,notes:'Down week. Very easy, no need to add strides.'},long:{name:'Zone 2 Run — Absorb',duration:'30–35 min',target:35,notes:'Shorter aerobic run to absorb the first three weeks.'}},
    5:{midweek:{name:'Easy Run + Strides',duration:'30–35 min + 4–6 × 20 sec strides',target:35,notes:'Easy aerobic work, then relaxed strides. Stay snappy, not all-out.'},long:{name:'Zone 2 Run — Aerobic Base',duration:'45–50 min',target:50,notes:'Longest aerobic run of the block. Keep it conversational.'}},
    6:{midweek:{name:'Easy Run — Max Week',duration:'20–25 min',target:25,notes:'Support max testing. Keep this very easy and finish fresh.'},long:{name:'Recovery Run',duration:'30–35 min',target:35,notes:'Easy only. Let the lifting max-test week remain the priority.'}}
  };

  function planFor(week = state.week, sessionKey) {
    const plan = RUN_PLAN[Number(week)] || RUN_PLAN[1];
    return plan[sessionKey];
  }

  function runKey(week, sessionKey) { return `w${week}-${sessionKey}`; }
  function sessionKeyForDay(day) { return day === 'Wednesday' ? 'midweek' : 'long'; }
  function baseDayForSession(sessionKey) { return sessionKey === 'midweek' ? 'Wednesday' : 'Sunday'; }

  function installRunExercises() {
    if (!standard.Wednesday.some(e => e[1] === 'RUN')) standard.Wednesday.push(['Easy Run — Rebuild','RUN','Post-hockey aerobic rebuild']);
    if (!maxWeek.Wednesday.some(e => e[1] === 'RUN')) maxWeek.Wednesday.push(['Easy Run — Max Week','RUN','Very easy during max-test week']);

    standard.Sunday[0] = ['Zone 2 Run — Aerobic Base','RUN','Post-hockey aerobic rebuild'];
    maxWeek.Sunday[0] = ['Recovery Run','RUN','Easy only after max-test week'];
  }

  installRunExercises();

  const oldDayTitle = dayTitle;
  dayTitle = function(day) {
    if (day === 'Wednesday') return 'Easy Run + Pilates / Mobility';
    if (day === 'Sunday') return state.week === 6 ? 'Recovery Run' : 'Aerobic Run';
    return oldDayTitle(day);
  };

  const oldDaySubtitle = daySubtitle;
  daySubtitle = function(day) {
    if (day === 'Wednesday') return `${planFor(state.week,'midweek').duration} easy running, then mobility / Pilates without adding fatigue.`;
    if (day === 'Sunday') return `${planFor(state.week,'long').duration} at conversational effort. Aerobic base, not a race.`;
    return oldDaySubtitle(day);
  };

  function runExerciseIndex(week, sessionKey) {
    const day = baseDayForSession(sessionKey);
    const program = Number(week) === 6 ? maxWeek : standard;
    return (program[day] || []).findIndex(e => e[1] === 'RUN');
  }

  function completionKey(week, sessionKey) {
    const day = baseDayForSession(sessionKey);
    return `w${week}-${day}-${runExerciseIndex(week, sessionKey)}`;
  }

  function ensureRunLog(week, sessionKey) {
    const k = runKey(week, sessionKey);
    if (!state.runLogs[k]) state.runLogs[k] = {
      duration:'', distance:'', pace:'', avgHr:'', maxHr:'', calories:'', rpe:'', notes:'', source:'manual', garminActivityId:'', updated:0
    };
    return state.runLogs[k];
  }

  function hasRunData(log) {
    return !!(log && (log.duration || log.distance || log.pace || log.avgHr || log.maxHr || log.calories || log.rpe || log.notes));
  }

  function paceFrom(duration, distance) {
    const mins = Number(duration), km = Number(distance);
    if (!mins || !km || mins <= 0 || km <= 0) return '';
    const perKm = mins / km;
    let whole = Math.floor(perKm);
    let secs = Math.round((perKm - whole) * 60);
    if (secs === 60) { whole += 1; secs = 0; }
    return `${whole}:${String(secs).padStart(2,'0')}/km`;
  }

  function runSummary(log) {
    if (!hasRunData(log)) return 'Not logged yet';
    const bits = [];
    if (log.distance) bits.push(`${log.distance} km`);
    if (log.duration) bits.push(`${log.duration} min`);
    if (log.pace) bits.push(log.pace);
    if (log.avgHr) bits.push(`${log.avgHr} avg HR`);
    if (log.rpe) bits.push(`RPE ${log.rpe}`);
    return bits.join(' • ');
  }

  function runCard(day, e, i) {
    const sessionKey = sessionKeyForDay(day);
    const plan = planFor(state.week, sessionKey);
    const log = ensureRunLog(state.week, sessionKey);
    const key = keyFor(day, i);
    const open = openRunLogs.has(runKey(state.week, sessionKey));
    const completed = !!state.completed[key];
    const sourceLabel = log.source === 'garmin' ? '<span class="runSource garmin">Garmin</span>' : '<span class="runSource">Manual</span>';

    return `<div class="card runCard ${completed ? 'done' : ''}" data-day="${day}" data-index="${i}" data-session-key="${sessionKey}" data-key="${key}">
      <div class="runHead">
        <input class="check runCheck" type="checkbox" ${completed ? 'checked' : ''} aria-label="Complete ${esc(plan.name)}">
        <div class="runHeadCopy"><div class="name">${esc(plan.name)}</div><div class="rx">${esc(plan.duration)} • easy / conversational</div><div class="note">${esc(plan.notes)}</div></div>
        ${sourceLabel}
      </div>
      <div class="runMetricsPreview">${esc(runSummary(log))}</div>
      <div class="runActions"><button type="button" class="logToggle runToggle">${open ? 'Hide run log' : hasRunData(log) ? 'Edit run' : 'Log run'}</button><span class="runGarminReady">Garmin-ready</span></div>
      ${open ? `<div class="runLogPanel">
        <div class="runGrid">
          <label>Duration<input class="field runDuration" type="number" inputmode="decimal" step="0.1" placeholder="min" value="${esc(log.duration)}"></label>
          <label>Distance<input class="field runDistance" type="number" inputmode="decimal" step="0.01" placeholder="km" value="${esc(log.distance)}"></label>
          <label>Pace<input class="field runPace" type="text" inputmode="text" placeholder="5:30/km" value="${esc(log.pace)}"></label>
          <label>RPE<input class="field runRpe" type="number" inputmode="decimal" step="0.5" min="1" max="10" placeholder="1–10" value="${esc(log.rpe)}"></label>
          <label>Avg HR<input class="field runAvgHr" type="number" inputmode="numeric" placeholder="bpm" value="${esc(log.avgHr)}"></label>
          <label>Max HR<input class="field runMaxHr" type="number" inputmode="numeric" placeholder="bpm" value="${esc(log.maxHr)}"></label>
          <label>Calories<input class="field runCalories" type="number" inputmode="numeric" placeholder="kcal" value="${esc(log.calories)}"></label>
        </div>
        <textarea class="field notes runNotes" placeholder="How did it feel? Legs, breathing, niggles, surface, shoes, etc.">${esc(log.notes)}</textarea>
        <div class="runLogHint">Pace auto-calculates from duration + distance if left blank. Garmin fields can populate automatically later.</div>
      </div>` : ''}
    </div>`;
  }

  const baseExerciseCard = exerciseCard;
  exerciseCard = function(day, e, i) {
    if (e[1] === 'RUN') return runCard(day, e, i);
    return baseExerciseCard(day, e, i);
  };

  function persistRunCard(card) {
    const sessionKey = card.dataset.sessionKey;
    const log = ensureRunLog(state.week, sessionKey);
    const get = cls => card.querySelector(cls)?.value?.trim() || '';
    log.duration = get('.runDuration');
    log.distance = get('.runDistance');
    log.pace = get('.runPace') || paceFrom(log.duration, log.distance);
    log.avgHr = get('.runAvgHr');
    log.maxHr = get('.runMaxHr');
    log.calories = get('.runCalories');
    log.rpe = get('.runRpe');
    log.notes = get('.runNotes');
    log.updated = Date.now();
    state.completed[card.dataset.key] = !!card.querySelector('.runCheck')?.checked;
    save();
    window.dispatchEvent(new CustomEvent('hybrid-run-changed'));
  }

  function wireRunCards(scope) {
    document.querySelectorAll(`${scope} .runCard`).forEach(card => {
      card.querySelector('.runCheck')?.addEventListener('change', () => {
        persistRunCard(card);
        renderAll();
      });
      card.querySelector('.runToggle')?.addEventListener('click', () => {
        const k = runKey(state.week, card.dataset.sessionKey);
        openRunLogs.has(k) ? openRunLogs.delete(k) : openRunLogs.add(k);
        renderAll();
      });
      card.querySelectorAll('.runDuration,.runDistance,.runPace,.runAvgHr,.runMaxHr,.runCalories,.runRpe,.runNotes').forEach(el => {
        el.addEventListener('change', () => {
          persistRunCard(card);
          renderAll();
        });
      });
    });
  }

  const baseWireCards = wireCards;
  wireCards = function(scope) {
    baseWireCards(scope);
    wireRunCards(scope);
  };

  function planStrip() {
    return `<div class="runPlanStrip">${[1,2,3,4,5,6].map(w => {
      const m = planFor(w,'midweek'), l = planFor(w,'long');
      return `<div class="runWeek ${w === state.week ? 'current' : ''}"><b>W${w}</b><span>${esc(m.duration)}</span><span>${esc(l.duration)}</span></div>`;
    }).join('')}</div>`;
  }

  function injectRunningOverview() {
    const program = document.querySelector('#program');
    if (!program || program.querySelector('.runningOverview')) return;
    const schedulePanel = program.querySelector('.schedulePanel');
    const m = planFor(state.week,'midweek'), l = planFor(state.week,'long');
    const html = `<div class="card runningOverview">
      <div class="runningOverviewHead"><div><div class="name">Running rebuild</div><div class="note">Post-hockey aerobic rebuild matched to the strength block.</div></div><span class="badge">2 runs / week</span></div>
      <div class="runningThisWeek"><div><small>Midweek</small><b>${esc(m.duration)}</b><span>${esc(m.name)}</span></div><div><small>Sunday</small><b>${esc(l.duration)}</b><span>${esc(l.name)}</span></div></div>
      <div class="runStripLabels"><span>Midweek</span><span>Long / aerobic</span></div>${planStrip()}
    </div>`;
    if (schedulePanel) schedulePanel.insertAdjacentHTML('afterend', html); else program.insertAdjacentHTML('afterbegin', html);
    program.querySelectorAll('.scheduleSlotName').forEach(el => {
      el.textContent = el.textContent.replaceAll('Pilates','Run+Mob').replaceAll('Zone 2','Run');
    });
  }

  const baseRenderProgram = renderProgram;
  renderProgram = function() {
    baseRenderProgram();
    injectRunningOverview();
  };

  const baseRenderTracker = renderTracker;
  renderTracker = function() {
    baseRenderTracker();
    const tracker = document.querySelector('#tracker');
    if (!tracker) return;
    const logs = ['midweek','long'].map(sessionKey => ({sessionKey, log:state.runLogs[runKey(state.week,sessionKey)], plan:planFor(state.week,sessionKey)})).filter(x => hasRunData(x.log));
    if (!logs.length) return;
    tracker.insertAdjacentHTML('beforeend', `<div class="trackerDay">Running</div>${logs.map(x => `<div class="card"><div class="name">${esc(x.plan.name)}</div><div class="rx">${esc(x.plan.duration)}</div><div class="trackerSets">${esc(runSummary(x.log))}</div>${x.log.notes ? `<div class="trackerNotes">${esc(x.log.notes)}</div>` : ''}</div>`).join('')}`);
  };

  window.hybridRunning = {
    planFor,
    runKey,
    baseDayForSession,
    completionKey,
    ensureRunLog,
    paceFrom
  };

  renderAll();
})();
