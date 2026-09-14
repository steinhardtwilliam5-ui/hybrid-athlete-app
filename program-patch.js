(() => {
  // Add new lat-building work without changing existing exercise indexes.
  // Stable indexes matter because local/cloud logs are keyed by day + exercise index.
  const additions = {
    Monday: ['Lat Pulldown Machine', '3 × 8–12', 'Do after Barbell Row • full stretch • drive elbows down • 1–2 RIR'],
    Thursday: ['Single-Arm Cable Lat Pulldown', '3 × 10–12 / side', 'Do after Chest-Supported Row • reach into stretch • elbow toward hip • 0–2 RIR']
  };

  Object.entries(additions).forEach(([day, exercise]) => {
    if (!standard[day].some(e => e[0] === exercise[0])) standard[day].push(exercise);
  });

  // Display the new work in the right place while keeping its stored index stable.
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

  renderToday = function renderTodayWithLatWork() {
    const day = dayName(), p = currentProgram(), items = p[day] || [];
    const total = items.length, done = items.filter((_, i) => state.completed[keyFor(day, i)]).length;
    const ordered = orderedItems(day, items);
    document.querySelector('#today').innerHTML = `<div class="hero"><div class="eyebrow">${day} • Week ${state.week}</div><h1>${dayTitle(day)}</h1><p>${daySubtitle(day)}</p><div class="progress"><div class="progresshead"><span>Workout progress</span><span>${done}/${total}</span></div><div class="bar"><i style="width:${total ? done / total * 100 : 0}%"></i></div></div></div><div class="section"><div class="sectionTitle"><h2>Today’s work</h2><span>${phases[state.week]}</span></div>${ordered.map(({e, i}) => exerciseCard(day, e, i)).join('')}</div>`;
    wireCards('#today');
  };

  renderProgram = function renderProgramWithLatWork() {
    const p = currentProgram();
    let html = `<div class="sectionTitle"><h2>Week ${state.week} program</h2><span>${phases[state.week]}</span></div>`;
    Object.entries(p).forEach(([day, items]) => {
      const ordered = orderedItems(day, items);
      html += `<div class="dayBlock ${colours[day]}"><h3>${day} — ${dayTitle(day)}</h3><p>${daySubtitle(day)}</p></div>${ordered.map(({e, i}) => exerciseCard(day, e, i)).join('')}`;
    });
    document.querySelector('#program').innerHTML = html;
    wireCards('#program');
  };

  if (typeof renderAll === 'function') renderAll();
})();
