(() => {
  // Program additions + week-specific scheduling without changing stable exercise log IDs.
  const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  state.weekSchedules = state.weekSchedules || {};

  const additions = {
    Monday: ['Lat Pulldown Machine', '3 × 8–12', 'Full stretch • drive elbows down • 1–2 RIR'],
    Thursday: ['Single-Arm Cable Lat Pulldown', '3 × 10–12 / side', 'Reach into stretch • elbow toward hip • 0–2 RIR']
  };

  Object.entries(additions).forEach(([day, exercise]) => {
    if (!standard[day].some(e => e[0] === exercise[0])) standard[day].push(exercise);
  });

  function orderedItems(day, items) {
    const pairs = items.map((e, i) => ({ e, i }));
    const placements = {
      Monday: ['Lat Pulldown Machine', 'Barbell Row'],
      Thursday: ['Single-Arm Cable Lat Pulldown', 'Chest-Supported Row']
    };
    const placement = placements[day];
    if (!placement) return pairs;
    const [moveName, afterName] = placement;
    const from = pairs.findIndex(x => x.e[0] === moveName);
    const after = pairs.findIndex(x => x.e[0] === afterName);
    if (from < 0 || after < 0) return pairs;
    const [moved] = pairs.splice(from, 1);
    const newAfter = pairs.findIndex(x => x.e[0] === afterName);
    pairs.splice(newAfter + 1, 0, moved);
    return pairs;
  }

  function defaultSchedule() {
    return Object.fromEntries(DAYS.map(day => [day, [day]]));
  }

  function scheduleForWeek(week = state.week) {
    const base = defaultSchedule();
    const saved = state.weekSchedules?.[String(week)] || {};
    DAYS.forEach(day => {
      if (Array.isArray(saved[day])) base[day] = saved[day].filter(x => DAYS.includes(x));
    });
    return base;
  }

  function storeSchedule(schedule, week = state.week) {
    state.weekSchedules[String(week)] = Object.fromEntries(DAYS.map(day => [day, [...(schedule[day] || [])]]));
    save();
    renderAll();
  }

  function slotForSession(week, sessionDay) {
    const schedule = scheduleForWeek(week);
    return DAYS.find(slot => schedule[slot].includes(sessionDay)) || sessionDay;
  }

  function moveSession(sessionDay, targetSlot) {
    if (!DAYS.includes(sessionDay) || !DAYS.includes(targetSlot)) return;
    const schedule = scheduleForWeek();
    DAYS.forEach(day => { schedule[day] = schedule[day].filter(s => s !== sessionDay); });
    if (!schedule[targetSlot].includes(sessionDay)) schedule[targetSlot].push(sessionDay);
    storeSchedule(schedule);
  }

  function swapDays(a, b) {
    if (!DAYS.includes(a) || !DAYS.includes(b) || a === b) return;
    const schedule = scheduleForWeek();
    [schedule[a], schedule[b]] = [schedule[b], schedule[a]];
    storeSchedule(schedule);
  }

  function resetWeekSchedule() {
    if (state.weekSchedules?.[String(state.week)]) delete state.weekSchedules[String(state.week)];
    save();
    renderAll();
  }

  window.hybridSchedule = { scheduleForWeek, slotForSession, moveSession, swapDays, resetWeekSchedule };

  function injectScheduleStyles() {
    if (document.querySelector('#schedulePatchStyles')) return;
    const style = document.createElement('style');
    style.id = 'schedulePatchStyles';
    style.textContent = `
      .programTop{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:10px}
      .programTop h2{font-size:20px;margin:0;letter-spacing:-.02em}.programTop span{font-size:12px;color:#8197b3}
      .schedulePanel{padding:13px!important;margin-bottom:12px!important;background:linear-gradient(145deg,#111f31,#0d1928)!important}
      .schedulePanelHead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
      .schedulePanelTitle{font-weight:800;font-size:14px}.schedulePanelSub{color:#7890aa;font-size:11px;margin-top:1px}
      .scheduleTools{display:grid;grid-template-columns:1fr 1fr auto;gap:7px;margin-top:10px}
      .scheduleTools .btn{min-height:38px;padding:0 11px;font-size:12px;border-radius:11px}
      .scheduleTools .resetSchedule{width:42px;padding:0;font-size:16px}
      .weekStrip{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}
      .scheduleSlot{min-width:0;padding:8px 3px;border:1px solid #243852;border-radius:11px;background:#0a1523;text-align:center}
      .scheduleSlot.today{border-color:#5486c5;background:#10233a}.scheduleSlot.adjusted{box-shadow:inset 0 -2px #9d83df}
      .scheduleSlotDay{display:block;color:#7189a6;font-size:9px;font-weight:850;letter-spacing:.05em;text-transform:uppercase}
      .scheduleSlotName{display:block;margin-top:3px;color:#c6d5e6;font-size:9px;font-weight:750;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .scheduleSlot.off .scheduleSlotName{color:#61758e}
      .programDay{border:1px solid #20324a;border-radius:16px;background:#0e1928;margin-bottom:9px;overflow:hidden}
      .programDay[open]{border-color:#2d4768;background:#101d2d}.programDay.todaySlot{border-color:#416b9f}
      .programDay summary{list-style:none;display:grid;grid-template-columns:42px minmax(0,1fr) 28px;gap:10px;align-items:center;padding:12px;cursor:pointer;user-select:none}
      .programDay summary::-webkit-details-marker{display:none}
      .dayBadge{width:42px;height:42px;border-radius:12px;background:#15263a;display:grid;place-items:center;color:#94afd0;font-size:11px;font-weight:900;text-transform:uppercase}
      .programDay.todaySlot .dayBadge{background:#183b62;color:#b8d7ff}
      .programDayCopy{min-width:0}.programDayTitle{font-size:14px;font-weight:850;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .programDayMeta{margin-top:2px;color:#758ba6;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .dayChevron{color:#7088a5;font-size:17px;transition:transform .18s ease}.programDay[open] .dayChevron{transform:rotate(180deg)}
      .programDayBody{border-top:1px solid #1d3048;padding:9px}
      .programDayBody .card.exercise{margin:0 0 7px;background:#0b1624;border-color:#1f334c;padding:11px}
      .programDayBody .card.exercise:last-child{margin-bottom:0}
      .sessionTag{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:#162842;color:#aebfd3;font-size:10px;font-weight:800;margin:1px 0 8px}
      .sessionTag.moved{background:#28213d;color:#cfbfff}
      .sessionDivider{margin:12px 1px 7px;padding-top:10px;border-top:1px solid #20334c;color:#8fa7c3;font-size:11px;font-weight:850}
      .emptyDay{padding:13px;border:1px dashed #2b405b;border-radius:13px;color:#7087a3;font-size:12px}
      .scheduleDialog{padding:18px;min-width:min(92vw,440px)}
      .scheduleDialog h2{margin:0 0 5px}.scheduleDialog p{margin:0 0 14px;color:#9badc5}
      .scheduleField{display:block;font-size:12px;color:#9eb0c8;margin-top:10px}.scheduleField select{margin-top:5px}
      @media(max-width:520px){.scheduleTools{grid-template-columns:1fr 1fr 42px}.weekStrip{gap:4px}.scheduleSlot{padding:7px 2px}.scheduleSlotName{font-size:8px}.programDay summary{padding:11px}}
    `;
    document.head.appendChild(style);
  }

  function ensureScheduleDialog() {
    if (document.querySelector('#scheduleEditor')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'scheduleEditor';
    dialog.innerHTML = `<form method="dialog" class="scheduleDialog">
      <h2 id="scheduleTitle">Move workout</h2>
      <p id="scheduleHelp"></p>
      <div id="scheduleFields"></div>
      <div class="actions">
        <button class="btn" value="cancel">Cancel</button>
        <button class="btn primary" id="scheduleApply" value="default" type="button">Apply</button>
      </div>
    </form>`;
    document.body.appendChild(dialog);
  }

  function sessionLabel(sessionDay) {
    return `${sessionDay} — ${dayTitle(sessionDay)}`;
  }

  function shortTitle(sessionDay) {
    const names = {
      Monday:'Upper', Tuesday:'Deadlift', Wednesday:'Pilates', Thursday:'Power',
      Friday:'Squat', Saturday:'Rest', Sunday:'Zone 2'
    };
    return names[sessionDay] || sessionDay.slice(0,3);
  }

  function showScheduleDialog(mode) {
    ensureScheduleDialog();
    const dialog = document.querySelector('#scheduleEditor');
    const title = document.querySelector('#scheduleTitle');
    const help = document.querySelector('#scheduleHelp');
    const fields = document.querySelector('#scheduleFields');
    const apply = document.querySelector('#scheduleApply');
    const schedule = scheduleForWeek();

    if (mode === 'move') {
      title.textContent = `Move workout • Week ${state.week}`;
      help.textContent = 'Move one complete session. You can leave its old day empty or stack sessions on one day.';
      const sessionOptions = DAYS.map(sessionDay => {
        const slot = DAYS.find(day => schedule[day].includes(sessionDay)) || sessionDay;
        return `<option value="${sessionDay}">${sessionLabel(sessionDay)} • currently ${slot}</option>`;
      }).join('');
      const dayOptions = DAYS.map(day => `<option value="${day}">${day}${schedule[day].length ? ` • ${schedule[day].map(shortTitle).join(' + ')}` : ' • empty'}</option>`).join('');
      fields.innerHTML = `<label class="scheduleField">Workout<select id="scheduleSource" class="field">${sessionOptions}</select></label><label class="scheduleField">Move to<select id="scheduleTarget" class="field">${dayOptions}</select></label>`;
      apply.onclick = () => {
        moveSession(document.querySelector('#scheduleSource').value, document.querySelector('#scheduleTarget').value);
        dialog.close();
      };
    } else {
      title.textContent = `Swap days • Week ${state.week}`;
      help.textContent = 'Exchange everything scheduled on two days, including stacked sessions.';
      const dayOptions = DAYS.map(day => `<option value="${day}">${day}${schedule[day].length ? ` • ${schedule[day].map(shortTitle).join(' + ')}` : ' • empty'}</option>`).join('');
      fields.innerHTML = `<label class="scheduleField">First day<select id="scheduleSource" class="field">${dayOptions}</select></label><label class="scheduleField">Second day<select id="scheduleTarget" class="field">${dayOptions}</select></label>`;
      const second = document.querySelector('#scheduleTarget');
      if (second.options.length > 1) second.selectedIndex = 1;
      apply.onclick = () => {
        swapDays(document.querySelector('#scheduleSource').value, document.querySelector('#scheduleTarget').value);
        dialog.close();
      };
    }
    dialog.showModal();
  }

  function scheduleChanged(schedule) {
    return DAYS.some(day => schedule[day].length !== 1 || schedule[day][0] !== day);
  }

  function weekStrip(schedule) {
    const today = dayName();
    return `<div class="weekStrip">${DAYS.map(day => {
      const sessions = schedule[day] || [];
      const adjusted = sessions.length !== 1 || sessions[0] !== day;
      const label = sessions.length ? sessions.map(shortTitle).join('+') : 'Off';
      return `<div class="scheduleSlot ${day === today ? 'today' : ''} ${adjusted ? 'adjusted' : ''} ${sessions.length ? '' : 'off'}"><span class="scheduleSlotDay">${day.slice(0,3)}</span><span class="scheduleSlotName">${label}</span></div>`;
    }).join('')}</div>`;
  }

  function sessionCards(sessionDay, slotDay) {
    const items = currentProgram()[sessionDay] || [];
    const ordered = orderedItems(sessionDay, items);
    const moved = sessionDay !== slotDay;
    const tag = moved ? `<div class="sessionTag moved">Moved from ${sessionDay}</div>` : '';
    return `${tag}${ordered.map(({e, i}) => exerciseCard(sessionDay, e, i)).join('')}`;
  }

  renderToday = function renderTodayWithSchedule() {
    const slotDay = dayName();
    const schedule = scheduleForWeek();
    const sessions = schedule[slotDay] || [];
    const p = currentProgram();
    const allExercises = sessions.flatMap(sessionDay => (p[sessionDay] || []).map((e, i) => ({sessionDay, e, i})));
    const total = allExercises.length;
    const done = allExercises.filter(x => state.completed[keyFor(x.sessionDay, x.i)]).length;
    const title = sessions.length === 0 ? 'Recovery day' : sessions.length === 1 ? dayTitle(sessions[0]) : `${sessions.length} sessions today`;
    const subtitle = sessions.length === 0 ? `Nothing scheduled for ${slotDay}.` : sessions.length === 1 && sessions[0] === slotDay ? daySubtitle(sessions[0]) : sessions.map(sessionLabel).join(' + ');

    document.querySelector('#today').innerHTML = `<div class="hero"><div class="eyebrow">${slotDay} • Week ${state.week}</div><h1>${title}</h1><p>${subtitle}</p>${total ? `<div class="progress"><div class="progresshead"><span>Progress</span><span>${done}/${total}</span></div><div class="bar"><i style="width:${done/total*100}%"></i></div></div>` : ''}</div><div class="section"><div class="sectionTitle"><h2>Today</h2><span>${phases[state.week]}</span></div>${sessions.length ? sessions.map(sessionDay => sessionCards(sessionDay, slotDay)).join('') : '<div class="emptyDay">Keep it easy, or move a workout here from the Program tab.</div>'}</div>`;
    wireCards('#today');
  };

  renderProgram = function renderProgramWithSchedule() {
    const schedule = scheduleForWeek();
    const adjusted = scheduleChanged(schedule);
    const today = dayName();
    let html = `<div class="programTop"><div><h2>Week ${state.week}</h2><span>${phases[state.week]} block</span></div>${adjusted ? '<span class="badge">Adjusted</span>' : ''}</div>
      <div class="card schedulePanel">
        <div class="schedulePanelHead"><div><div class="schedulePanelTitle">Week layout</div><div class="schedulePanelSub">Move sessions without changing the base program.</div></div></div>
        ${weekStrip(schedule)}
        <div class="scheduleTools">
          <button class="btn primary" id="moveWorkoutBtn" type="button">Move workout</button>
          <button class="btn" id="swapDaysBtn" type="button">Swap days</button>
          <button class="btn resetSchedule" id="resetScheduleBtn" type="button" aria-label="Reset week" title="Reset week">↺</button>
        </div>
      </div>`;

    DAYS.forEach(slotDay => {
      const sessions = schedule[slotDay] || [];
      const title = sessions.length ? sessions.map(dayTitle).join(' + ') : 'Recovery / off';
      const count = sessions.reduce((n, sessionDay) => n + (currentProgram()[sessionDay]?.length || 0), 0);
      const meta = sessions.length ? `${count} exercise${count === 1 ? '' : 's'}${sessions.some(s => s !== slotDay) ? ' • rescheduled' : ''}` : 'No compulsory training';
      const open = slotDay === today ? ' open' : '';
      html += `<details class="programDay ${slotDay === today ? 'todaySlot' : ''}"${open}><summary><div class="dayBadge">${slotDay.slice(0,3)}</div><div class="programDayCopy"><div class="programDayTitle">${title}</div><div class="programDayMeta">${meta}</div></div><div class="dayChevron">⌄</div></summary><div class="programDayBody">`;
      if (!sessions.length) {
        html += '<div class="emptyDay">Free day. Use Move workout if you want to place a session here.</div>';
      } else {
        sessions.forEach((sessionDay, idx) => {
          if (sessions.length > 1 && idx > 0) html += `<div class="sessionDivider">${sessionLabel(sessionDay)}</div>`;
          html += sessionCards(sessionDay, slotDay);
        });
      }
      html += '</div></details>';
    });

    document.querySelector('#program').innerHTML = html;
    wireCards('#program');
    document.querySelector('#moveWorkoutBtn')?.addEventListener('click', () => showScheduleDialog('move'));
    document.querySelector('#swapDaysBtn')?.addEventListener('click', () => showScheduleDialog('swap'));
    document.querySelector('#resetScheduleBtn')?.addEventListener('click', () => {
      if (!adjusted || window.confirm(`Reset Week ${state.week} to the default schedule?`)) resetWeekSchedule();
    });
  };

  injectScheduleStyles();
  ensureScheduleDialog();
  if (typeof renderAll === 'function') renderAll();
})();
