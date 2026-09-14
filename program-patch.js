(() => {
  // Program additions + week-specific scheduling without changing stable exercise log IDs.
  const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  state.weekSchedules = state.weekSchedules || {};

  const additions = {
    Monday: ['Lat Pulldown Machine', '3 × 8–12', 'Do after Barbell Row • full stretch • drive elbows down • 1–2 RIR'],
    Thursday: ['Single-Arm Cable Lat Pulldown', '3 × 10–12 / side', 'Do after Chest-Supported Row • reach into stretch • elbow toward hip • 0–2 RIR']
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
      .scheduleTools{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .scheduleSummary{margin-top:9px;color:#9badc5;font-size:12px;line-height:1.55}
      .scheduleDayHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
      .scheduleDayHead .dayCopy{min-width:0}
      .scheduleDayHead .dayCopy p{margin:3px 0 0}
      .sessionTag{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border-radius:999px;background:#162842;color:#bfd4ee;font-size:11px;font-weight:750;margin:7px 6px 0 0}
      .sessionTag.moved{background:#2c2546;color:#d7c7ff}
      .emptyDay{padding:14px;border:1px dashed #2c415f;border-radius:14px;color:#7f94ad;margin:8px 0 13px}
      .scheduleDialog{padding:18px;min-width:min(92vw,440px)}
      .scheduleDialog h2{margin:0 0 5px}.scheduleDialog p{margin:0 0 14px;color:#9badc5}
      .scheduleField{display:block;font-size:12px;color:#9eb0c8;margin-top:10px}
      .scheduleField select{margin-top:5px}
      .sessionDivider{margin:14px 0 7px;padding-top:10px;border-top:1px solid #23344d;color:#9cb5d2;font-size:12px;font-weight:800}
      @media(max-width:520px){.scheduleTools .btn{flex:1 1 calc(50% - 4px)}.scheduleTools .btn:last-child{flex-basis:100%}}
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
      help.textContent = 'Move one complete session to another day. The original day can become empty, and the destination can hold more than one session.';
      const sessionOptions = DAYS.map(sessionDay => {
        const slot = DAYS.find(day => schedule[day].includes(sessionDay)) || sessionDay;
        return `<option value="${sessionDay}">${sessionLabel(sessionDay)} • currently ${slot}</option>`;
      }).join('');
      const dayOptions = DAYS.map(day => `<option value="${day}">${day}${schedule[day].length ? ` • ${schedule[day].map(dayTitle).join(' + ')}` : ' • empty'}</option>`).join('');
      fields.innerHTML = `
        <label class="scheduleField">Workout<select id="scheduleSource" class="field">${sessionOptions}</select></label>
        <label class="scheduleField">Move to<select id="scheduleTarget" class="field">${dayOptions}</select></label>`;
      apply.onclick = () => {
        moveSession(document.querySelector('#scheduleSource').value, document.querySelector('#scheduleTarget').value);
        dialog.close();
      };
    } else {
      title.textContent = `Swap entire days • Week ${state.week}`;
      help.textContent = 'Swap everything currently scheduled on two days, including stacked sessions.';
      const dayOptions = DAYS.map(day => `<option value="${day}">${day}${schedule[day].length ? ` • ${schedule[day].map(dayTitle).join(' + ')}` : ' • empty'}</option>`).join('');
      fields.innerHTML = `
        <label class="scheduleField">First day<select id="scheduleSource" class="field">${dayOptions}</select></label>
        <label class="scheduleField">Second day<select id="scheduleTarget" class="field">${dayOptions}</select></label>`;
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

  function scheduleSummary(schedule) {
    return DAYS.map(day => {
      const sessions = schedule[day];
      return `<b>${day.slice(0,3)}</b> ${sessions.length ? sessions.map(dayTitle).join(' + ') : 'Off'}`;
    }).join(' · ');
  }

  function sessionCards(sessionDay, slotDay) {
    const items = currentProgram()[sessionDay] || [];
    const ordered = orderedItems(sessionDay, items);
    const moved = sessionDay !== slotDay;
    const tag = `<div class="sessionTag ${moved ? 'moved' : ''}">${moved ? `Moved from ${sessionDay}` : dayTitle(sessionDay)}</div>`;
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
    const title = sessions.length === 0 ? 'No session scheduled' : sessions.length === 1 ? dayTitle(sessions[0]) : `${sessions.length} sessions`;
    const subtitle = sessions.length === 0
      ? 'This day is free in your Week ' + state.week + ' schedule.'
      : sessions.length === 1 && sessions[0] === slotDay
        ? daySubtitle(sessions[0])
        : `Rescheduled: ${sessions.map(sessionLabel).join(' + ')}`;

    document.querySelector('#today').innerHTML = `<div class="hero"><div class="eyebrow">${slotDay} • Week ${state.week}</div><h1>${title}</h1><p>${subtitle}</p><div class="progress"><div class="progresshead"><span>Workout progress</span><span>${done}/${total}</span></div><div class="bar"><i style="width:${total ? done / total * 100 : 0}%"></i></div></div></div><div class="section"><div class="sectionTitle"><h2>Today’s work</h2><span>${phases[state.week]}</span></div>${sessions.length ? sessions.map(sessionDay => sessionCards(sessionDay, slotDay)).join('') : '<div class="emptyDay">Nothing compulsory today. Move or swap sessions from the Program tab if you want to train.</div>'}</div>`;
    wireCards('#today');
  };

  renderProgram = function renderProgramWithSchedule() {
    const schedule = scheduleForWeek();
    let html = `<div class="sectionTitle"><h2>Week ${state.week} program</h2><span>${phases[state.week]}</span></div>
      <div class="card">
        <div class="name">Weekly schedule</div>
        <div class="note">Rearrange this week without changing the underlying program or your existing exercise history.</div>
        <div class="scheduleTools">
          <button class="btn primary" id="moveWorkoutBtn" type="button">Move workout</button>
          <button class="btn" id="swapDaysBtn" type="button">Swap days</button>
          <button class="btn" id="resetScheduleBtn" type="button">Reset week</button>
        </div>
        <div class="scheduleSummary">${scheduleSummary(schedule)}</div>
      </div>`;

    DAYS.forEach(slotDay => {
      const sessions = schedule[slotDay] || [];
      const titles = sessions.length ? sessions.map(dayTitle).join(' + ') : 'No session scheduled';
      html += `<div class="dayBlock ${colours[slotDay]}"><div class="scheduleDayHead"><div class="dayCopy"><h3>${slotDay}</h3><p>${titles}</p></div>${scheduleChanged(schedule) ? '<span class="badge">Adjusted</span>' : ''}</div></div>`;
      if (!sessions.length) {
        html += '<div class="emptyDay">Free day. Use Move workout to place a session here.</div>';
      } else {
        sessions.forEach(sessionDay => {
          if (sessions.length > 1 || sessionDay !== slotDay) html += `<div class="sessionDivider">${sessionLabel(sessionDay)}</div>`;
          html += sessionCards(sessionDay, slotDay);
        });
      }
    });

    document.querySelector('#program').innerHTML = html;
    wireCards('#program');
    document.querySelector('#moveWorkoutBtn')?.addEventListener('click', () => showScheduleDialog('move'));
    document.querySelector('#swapDaysBtn')?.addEventListener('click', () => showScheduleDialog('swap'));
    document.querySelector('#resetScheduleBtn')?.addEventListener('click', () => {
      if (!scheduleChanged(schedule) || window.confirm(`Reset Week ${state.week} to the default schedule?`)) resetWeekSchedule();
    });
  };

  injectScheduleStyles();
  ensureScheduleDialog();
  if (typeof renderAll === 'function') renderAll();
})();
