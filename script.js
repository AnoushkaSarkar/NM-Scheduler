// ═══════════════════════════════════════════════════
// NM-SCHEDULER v2 — Academic Edition
// script.js
// DSA: Hash Map · Priority Queue · Binary Search
//      Graph Coloring · Greedy · DP
// ═══════════════════════════════════════════════════

'use strict';

/* ── STATE ── */
let teacherBusySlots    = {};
let subjectList         = [];
let generatedTimetables = {};
let conflictLog         = [];
let subjectColorMap     = {};
let currentPeriods      = 6;
let currentDays         = 5;

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

/* ── SLOT COLOR PALETTE (flat, WCAG-AA) ── */
const PALETTE = [
  { bg: 'var(--slot-a-bg)', fg: 'var(--slot-a-fg)' },
  { bg: 'var(--slot-b-bg)', fg: 'var(--slot-b-fg)' },
  { bg: 'var(--slot-c-bg)', fg: 'var(--slot-c-fg)' },
  { bg: 'var(--slot-d-bg)', fg: 'var(--slot-d-fg)' },
  { bg: 'var(--slot-e-bg)', fg: 'var(--slot-e-fg)' },
  { bg: 'var(--slot-f-bg)', fg: 'var(--slot-f-fg)' },
  { bg: 'var(--slot-g-bg)', fg: 'var(--slot-g-fg)' },
  { bg: 'var(--slot-h-bg)', fg: 'var(--slot-h-fg)' },
];

/* ── UTILITIES ── */
function assignSubjectColors(subjects) {
  const unique = [...new Set(subjects.map(s => s.subject))];
  subjectColorMap = {};
  unique.forEach((sub, i) => {
    subjectColorMap[sub] = PALETTE[i % PALETTE.length];
  });
}

function showToast(message, type = '', duration = 3200) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

function setStepActive(n) {
  for (let i = 1; i <= 4; i++) {
    const pill = document.getElementById(`step${i}pill`);
    if (!pill) continue;
    pill.classList.remove('active', 'done');
    if (i < n) pill.classList.add('done');
    else if (i === n) pill.classList.add('active');
  }
}

function makeSafeId(str) {
  return str.replace(/[^a-zA-Z0-9]/g, '_');
}

/* ── LIVE CLOCK ── */
function updateClock() {
  const el = document.getElementById('liveClock');
  if (!el) return;
  const now  = new Date();
  const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const date = now.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  el.textContent = `${date}  |  ${time}`;
}
setInterval(updateClock, 1000);
updateClock();

/* ── DARK MODE ── */
document.getElementById('darkModeBtn').addEventListener('click', () => {
  const html   = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  document.querySelector('.theme-icon').textContent = isDark ? '🌙' : '☀️';
});

/* ── DRAG-AND-DROP UPLOAD ZONES ── */
function initUploadZone(zoneId, inputId, statusId) {
  const zone   = document.getElementById(zoneId);
  const input  = document.getElementById(inputId);
  const status = document.getElementById(statusId);

  ['dragenter','dragover'].forEach(ev => {
    zone.addEventListener(ev, e => {
      e.preventDefault();
      zone.classList.add('dragover');
    });
  });

  ['dragleave','drop'].forEach(ev => {
    zone.addEventListener(ev, e => {
      e.preventDefault();
      zone.classList.remove('dragover');
    });
  });

  zone.addEventListener('drop', e => {
    const file = e.dataTransfer.files[0];
    if (file) {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      markFileSelected(zone, status, file.name);
    }
  });

  input.addEventListener('change', () => {
    if (input.files[0]) {
      markFileSelected(zone, status, input.files[0].name);
    }
  });
}

function markFileSelected(zone, status, name) {
  zone.classList.add('has-file');
  status.textContent = `✓ ${name}`;
}

initUploadZone('dropTeacher', 'teacherFile', 'statusTeacher');
initUploadZone('dropSubject', 'subjectFile', 'statusSubject');

/* ── CSV / XLSX READER ── */
function readCSV(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data     = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet    = workbook.Sheets[workbook.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(sheet, { defval: '' }));
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/* ─────────────────────────────────────────────
   DSA #1 — HASH MAP
   O(n) teacher availability lookup
───────────────────────────────────────────── */
function parseTeacherData(rows) {
  const busyMap = {};
  rows.forEach(row => {
    const teacher = String(row['Teacher'] || '').trim();
    const day     = String(row['Day']     || '').trim();
    const period  = String(row['Period']  || '').trim();
    if (!teacher || !day || !period) return;
    if (!busyMap[teacher])           busyMap[teacher] = {};
    if (!busyMap[teacher][day])      busyMap[teacher][day] = new Set();
    busyMap[teacher][day].add(period);
  });
  return busyMap;
}

function parseSubjectData(rows) {
  return rows.map(row => ({
    className:    String(row['Class']         || '').trim(),
    subject:      String(row['Subject']       || '').trim(),
    teacher:      String(row['Teacher']       || '').trim(),
    hoursPerWeek: parseInt(row['HoursPerWeek']  || 1, 10)
  })).filter(r => r.className && r.subject && r.teacher);
}

/* ─────────────────────────────────────────────
   DSA #2 — PRIORITY QUEUE (max-heap simulation)
   Schedule high-demand subjects first
───────────────────────────────────────────── */
function prioritizeSubjects(subjects) {
  return [...subjects].sort((a, b) => b.hoursPerWeek - a.hoursPerWeek);
}

/* ─────────────────────────────────────────────
   DSA #3 — BINARY SEARCH
   O(log n) free-slot detection per day
───────────────────────────────────────────── */
function binarySearchFreeSlot(sortedFree, startFrom) {
  let lo = 0, hi = sortedFree.length - 1, result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedFree[mid] >= startFrom) { result = sortedFree[mid]; hi = mid - 1; }
    else lo = mid + 1;
  }
  return result;
}

function getFreeSlots(teacher, day, periodsPerDay, lunchPeriod) {
  const busy = teacherBusySlots[teacher]?.[day] || new Set();
  const free = [];
  for (let p = 1; p <= periodsPerDay; p++) {
    if (p === lunchPeriod)        continue;
    if (!busy.has(String(p)))     free.push(p);
  }
  return free;  // already sorted ascending
}

/* ─────────────────────────────────────────────
   DSA #4 — GRAPH COLORING
   Detect teacher double-bookings across classes
───────────────────────────────────────────── */
function buildConflictGraph(subjects) {
  const classByTeacher = {};
  subjects.forEach(s => {
    if (!classByTeacher[s.teacher]) classByTeacher[s.teacher] = new Set();
    classByTeacher[s.teacher].add(s.className);
  });
  const teachers = Object.keys(classByTeacher);
  const graph    = {};
  teachers.forEach(t => { graph[t] = new Set(); });
  for (let i = 0; i < teachers.length; i++) {
    for (let j = i + 1; j < teachers.length; j++) {
      const t1 = teachers[i], t2 = teachers[j];
      const shared = [...classByTeacher[t1]].some(c => classByTeacher[t2].has(c));
      if (shared) { graph[t1].add(t2); graph[t2].add(t1); }
    }
  }
  return graph;
}

function detectConflicts(timetables, days, periodsPerDay) {
  const conflicts = [];
  days.forEach(day => {
    for (let p = 0; p < periodsPerDay; p++) {
      const seen = {};
      Object.keys(timetables).forEach(cls => {
        const slot = timetables[cls][day][p];
        if (!slot || slot.isLunch || !slot.teacher) return;
        if (seen[slot.teacher]) {
          conflicts.push({ teacher: slot.teacher, day, period: p + 1,
                           class1: seen[slot.teacher], class2: cls });
        } else {
          seen[slot.teacher] = cls;
        }
      });
    }
  });
  return conflicts;
}

/* ─────────────────────────────────────────────
   DSA #5 — DYNAMIC PROGRAMMING
   Even distribution of hours across working days
───────────────────────────────────────────── */
function dpDistribute(hoursPerWeek, workingDays) {
  const dp    = Array(workingDays).fill(0);
  const base  = Math.floor(hoursPerWeek / workingDays);
  const extra = hoursPerWeek % workingDays;
  for (let d = 0; d < workingDays; d++) dp[d] = base + (d < extra ? 1 : 0);
  return dp;
}

/* ─────────────────────────────────────────────
   DSA #6 — GREEDY ALGORITHM
   Assign best available slots iteratively
───────────────────────────────────────────── */
function generateTimetable(subjects, periodsPerDay, workingDays, maxHoursPerDay, lunchPeriod) {
  const days       = DAYS.slice(0, workingDays);
  const timetables = {};
  const teacherDaily = {};
  conflictLog = [];

  /* Initialise timetable matrix */
  const classes = [...new Set(subjects.map(s => s.className))];
  classes.forEach(cls => {
    timetables[cls] = {};
    days.forEach(day => { timetables[cls][day] = Array(periodsPerDay).fill(null); });
  });

  /* Mark lunch slots */
  if (lunchPeriod > 0) {
    classes.forEach(cls => {
      days.forEach(day => {
        timetables[cls][day][lunchPeriod - 1] = { subject: 'Lunch', teacher: '', isLunch: true };
      });
    });
  }

  /* Initialise per-teacher counters */
  subjects.forEach(s => {
    if (!teacherDaily[s.teacher]) {
      teacherDaily[s.teacher] = {};
      days.forEach(d => { teacherDaily[s.teacher][d] = 0; });
    }
  });

  buildConflictGraph(subjects);
  const ordered = prioritizeSubjects(subjects);

  ordered.forEach(sub => {
    const targets  = dpDistribute(sub.hoursPerWeek, workingDays);
    let   totalLeft = sub.hoursPerWeek;

    for (let d = 0; d < days.length && totalLeft > 0; d++) {
      const day       = days[d];
      const dayTarget = targets[d];
      const freeSlots = getFreeSlots(sub.teacher, day, periodsPerDay, lunchPeriod);
      let   assigned  = 0;
      let   searchFrom = 1;

      while (assigned < dayTarget && totalLeft > 0) {
        const period = binarySearchFreeSlot(freeSlots, searchFrom);
        if (period === -1) break;

        const idx = period - 1;
        if (timetables[sub.className][day][idx] !== null) { searchFrom = period + 1; continue; }
        if (teacherDaily[sub.teacher][day] >= maxHoursPerDay) break;

        /* Assign slot */
        timetables[sub.className][day][idx] = {
          subject: sub.subject,
          teacher: sub.teacher,
          isLunch: false
        };

        /* Mark teacher busy */
        if (!teacherBusySlots[sub.teacher])      teacherBusySlots[sub.teacher] = {};
        if (!teacherBusySlots[sub.teacher][day]) teacherBusySlots[sub.teacher][day] = new Set();
        teacherBusySlots[sub.teacher][day].add(String(period));

        teacherDaily[sub.teacher][day]++;
        assigned++;
        totalLeft--;
        searchFrom = period + 1;
      }
    }
  });

  conflictLog = detectConflicts(timetables, days, periodsPerDay);
  return timetables;
}

/* ── CONFLICT DISPLAY ── */
function renderConflicts(conflicts) {
  const el = document.getElementById('conflictContainer');
  el.innerHTML = '';
  if (!conflicts.length) return;

  const banner = document.createElement('div');
  banner.className = 'conflict-banner';

  const strong = document.createElement('strong');
  strong.innerHTML = `⚠ ${conflicts.length} Scheduling Conflict${conflicts.length > 1 ? 's' : ''} Detected`;
  banner.appendChild(strong);

  conflicts.forEach(c => {
    const item = document.createElement('div');
    item.className = 'conflict-item';
    item.innerHTML = `
      <span class="conflict-dot"></span>
      <span><strong>${c.teacher}</strong> is double-booked on
        <strong>${c.day}</strong>, Period <strong>${c.period}</strong>
        — ${c.class1} &amp; ${c.class2}</span>`;
    banner.appendChild(item);
  });

  el.appendChild(banner);
}

/* ── WORKLOAD CHART ── */
function renderWorkloadChart(timetables, days) {
  const el = document.getElementById('workloadChart');
  el.innerHTML = '';

  const hours = {};
  Object.keys(timetables).forEach(cls => {
    days.forEach(day => {
      timetables[cls][day].forEach(slot => {
        if (slot && !slot.isLunch && slot.teacher) {
          hours[slot.teacher] = (hours[slot.teacher] || 0) + 1;
        }
      });
    });
  });

  if (!Object.keys(hours).length) return;

  const card = document.createElement('div');
  card.className = 'workload-card';

  const title = document.createElement('div');
  title.className = 'section-title';
  title.innerHTML = `<span class="section-title-icon">📊</span> Teacher Workload (hours/week)`;
  card.appendChild(title);

  const maxH  = Math.max(...Object.values(hours));
  const list  = document.createElement('div');
  list.className = 'bar-list';

  Object.entries(hours)
    .sort((a, b) => b[1] - a[1])
    .forEach(([teacher, h]) => {
      const pct   = Math.round((h / maxH) * 100);
      const cls   = pct >= 80 ? '' : pct >= 50 ? 'fill-mid' : 'fill-low';
      const ideal = Math.round((days.length * parseInt(document.getElementById('maxHoursPerDay').value)));

      list.innerHTML += `
        <div class="bar-row">
          <div class="bar-label" title="${teacher}">${teacher}</div>
          <div class="bar-track">
            <div class="bar-fill ${cls}" style="width:${pct}%">${h} hrs</div>
          </div>
          <div class="bar-value">${h}/${ideal}</div>
        </div>`;
    });

  card.appendChild(list);
  el.appendChild(card);
}

/* ── SLOT CHIP BUILDER ── */
function buildSlotChip(slot, className, day, pIndex, enableDrag) {
  if (slot.isLunch) {
    return `<span class="slot-lunch">🍱 Lunch</span>`;
  }

  const color  = subjectColorMap[slot.subject] || PALETTE[0];
  const isConf = conflictLog.some(
    c => c.day === day && c.period === pIndex + 1 && c.teacher === slot.teacher
  );

  if (isConf) {
    return `
      <span class="slot-conflict"
        data-subject="${slot.subject}"
        data-teacher="${slot.teacher}">
        ${slot.subject}
        <small>${slot.teacher} · ⚠ clash</small>
      </span>`;
  }

  return `
    <span class="slot-chip slot-animate"
      style="background:${color.bg};color:${color.fg};border-color:${color.bg};"
      draggable="${enableDrag}"
      data-subject="${slot.subject}"
      data-teacher="${slot.teacher}"
      data-class="${className}"
      data-day="${day}"
      data-period="${pIndex}">
      ${slot.subject}
      <small>${slot.teacher}</small>
    </span>`;
}

/* ── TABLE BUILDER ── */
function buildTimetableCard(classTimetable, days, periods, className, enableDrag) {
  const card = document.createElement('div');
  card.className = 'tt-card';

  /* Card header */
  const totalFilled = days.reduce((acc, day) =>
    acc + classTimetable[day].filter(s => s && !s.isLunch).length, 0);

  card.innerHTML = `
    <div class="tt-card-header">
      <div class="tt-card-title">
        📋 <span>Class: ${className}</span>
      </div>
      <span class="tt-card-badge">${totalFilled} periods scheduled</span>
    </div>`;

  /* Table */
  const wrap  = document.createElement('div');
  wrap.className = 'tt-table-wrap';

  const table = document.createElement('table');
  table.className = 'tt-table';

  /* thead */
  const thead = document.createElement('thead');
  const hRow  = document.createElement('tr');
  hRow.innerHTML = `<th>Day / Period</th>` +
    Array.from({ length: periods }, (_, i) => `<th>P${i + 1}</th>`).join('');
  thead.appendChild(hRow);
  table.appendChild(thead);

  /* tbody */
  const tbody = document.createElement('tbody');

  days.forEach(day => {
    const row = document.createElement('tr');
    const dc  = document.createElement('td');
    dc.textContent = day;
    row.appendChild(dc);

    for (let p = 0; p < periods; p++) {
      const td   = document.createElement('td');
      const slot = classTimetable[day][p];

      if (slot) {
        td.innerHTML = buildSlotChip(slot, className, day, p, enableDrag);

        if (enableDrag && !slot.isLunch) {
          const chip = td.querySelector('.slot-chip');
          if (chip) {
            chip.addEventListener('dragstart', () => {
              window._drag = { className, day, period: p };
              chip.classList.add('dragging');
            });
            chip.addEventListener('dragend', () => chip.classList.remove('dragging'));
          }
        }
      } else {
        td.innerHTML = `<span class="slot-empty">·</span>`;
      }

      if (enableDrag) {
        td.addEventListener('dragover',  e => { e.preventDefault(); td.classList.add('drag-over'); });
        td.addEventListener('dragleave', ()  => td.classList.remove('drag-over'));
        td.addEventListener('drop', e => {
          e.preventDefault();
          td.classList.remove('drag-over');
          const from = window._drag;
          if (!from) return;

          const fromSlot = generatedTimetables[from.className][from.day][from.period];
          const toSlot   = generatedTimetables[className][day][p];
          if (fromSlot?.isLunch || toSlot?.isLunch) {
            showToast('Cannot move a lunch break.', 'warn');
            return;
          }

          generatedTimetables[from.className][from.day][from.period] = toSlot || null;
          generatedTimetables[className][day][p] = fromSlot;

          conflictLog = detectConflicts(
            generatedTimetables, DAYS.slice(0, currentDays), currentPeriods
          );
          renderAllViews();
          showToast('Slot moved successfully.', 'success');
        });
      }

      row.appendChild(td);
    }
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  wrap.appendChild(table);
  card.appendChild(wrap);

  /* Summary row */
  const summary = buildSummaryRow(classTimetable, days, periods);
  card.appendChild(summary);

  return card;
}

function buildSummaryRow(classTimetable, days, periods) {
  const counts = {};
  days.forEach(day => {
    for (let p = 0; p < periods; p++) {
      const slot = classTimetable[day][p];
      if (slot && !slot.isLunch) {
        const key = `${slot.subject} (${slot.teacher})`;
        counts[key] = (counts[key] || 0) + 1;
      }
    }
  });

  const row = document.createElement('div');
  row.className = 'tt-summary';

  Object.entries(counts).forEach(([label, n]) => {
    const chip = document.createElement('span');
    chip.className = 'summary-chip';
    chip.textContent = `${label} · ${n}h`;
    row.appendChild(chip);
  });

  return row;
}

/* ── CLASS VIEW ── */
function renderClassView() {
  const days = DAYS.slice(0, currentDays);
  const el   = document.getElementById('timetableContainer');
  el.innerHTML = '';
  Object.keys(generatedTimetables).forEach(cls => {
    el.appendChild(buildTimetableCard(generatedTimetables[cls], days, currentPeriods, cls, true));
  });
}

/* ── TEACHER VIEW ── */
function renderTeacherView() {
  const days = DAYS.slice(0, currentDays);
  const el   = document.getElementById('teacherViewContainer');
  el.innerHTML = '';

  const teachers = [...new Set(subjectList.map(s => s.teacher))];

  teachers.forEach(teacher => {
    const card  = document.createElement('div');
    card.className = 'tt-card';

    /* Count classes taught */
    let totalPeriods = 0;
    Object.keys(generatedTimetables).forEach(cls => {
      days.forEach(day => {
        generatedTimetables[cls][day].forEach(slot => {
          if (slot && !slot.isLunch && slot.teacher === teacher) totalPeriods++;
        });
      });
    });

    card.innerHTML = `
      <div class="tt-card-header">
        <div class="tt-card-title">👨‍🏫 <span>${teacher}</span></div>
        <span class="tt-card-badge">${totalPeriods} periods/week</span>
      </div>`;

    const wrap  = document.createElement('div');
    wrap.className = 'tt-table-wrap';

    const table = document.createElement('table');
    table.className = 'tt-table';

    const thead = document.createElement('thead');
    const hRow  = document.createElement('tr');
    hRow.innerHTML = `<th>Day / Period</th>` +
      Array.from({ length: currentPeriods }, (_, i) => `<th>P${i + 1}</th>`).join('');
    thead.appendChild(hRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    days.forEach(day => {
      const row = document.createElement('tr');
      const dc  = document.createElement('td');
      dc.textContent = day;
      row.appendChild(dc);

      for (let p = 0; p < currentPeriods; p++) {
        const td = document.createElement('td');
        let found = null;

        Object.keys(generatedTimetables).forEach(cls => {
          const slot = generatedTimetables[cls][day][p];
          if (slot && !slot.isLunch && slot.teacher === teacher) {
            found = { ...slot, className: cls };
          }
        });

        if (found) {
          const color = subjectColorMap[found.subject] || PALETTE[0];
          td.innerHTML = `
            <span class="slot-chip slot-animate"
              style="background:${color.bg};color:${color.fg};"
              data-subject="${found.subject}"
              data-teacher="${teacher}">
              ${found.subject}
              <small>Class ${found.className}</small>
            </span>`;
        } else {
          td.innerHTML = `<span class="slot-empty">·</span>`;
        }
        row.appendChild(td);
      }
      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    card.appendChild(wrap);
    el.appendChild(card);
  });
}

/* ── STUDENT VIEW ── */
function renderStudentView() {
  const select = document.getElementById('studentClassSelect');
  select.innerHTML = '';
  Object.keys(generatedTimetables).forEach(cls => {
    const opt = document.createElement('option');
    opt.value = cls;
    opt.textContent = `Class ${cls}`;
    select.appendChild(opt);
  });

  function renderFor(cls) {
    const days = DAYS.slice(0, currentDays);
    const el   = document.getElementById('studentViewContainer');
    el.innerHTML = '';
    if (generatedTimetables[cls]) {
      el.appendChild(buildTimetableCard(generatedTimetables[cls], days, currentPeriods, cls, false));
    }
  }

  select.onchange = () => renderFor(select.value);
  renderFor(select.value);
}

/* ── ADMIN MASTER GRID ── */
function renderAdminGrid() {
  const days    = DAYS.slice(0, currentDays);
  const classes = Object.keys(generatedTimetables);
  const el      = document.getElementById('adminGridContainer');
  el.innerHTML  = '';

  const heading = document.createElement('div');
  heading.className = 'section-title';
  heading.innerHTML = `<span class="section-title-icon">🗂</span> Master Grid — ${classes.length} Classes × ${days.length} Days`;
  el.appendChild(heading);

  days.forEach(day => {
    const dh = document.createElement('div');
    dh.className = 'admin-day-header';
    dh.innerHTML = `📅 ${day}`;
    el.appendChild(dh);

    const wrap  = document.createElement('div');
    wrap.className = 'tt-table-wrap';

    const table = document.createElement('table');
    table.className = 'tt-table';

    const thead = document.createElement('thead');
    const hRow  = document.createElement('tr');
    hRow.innerHTML = `<th>Class</th>` +
      Array.from({ length: currentPeriods }, (_, i) => `<th>P${i + 1}</th>`).join('');
    thead.appendChild(hRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    classes.forEach(cls => {
      const row = document.createElement('tr');
      const cc  = document.createElement('td');
      cc.textContent = cls;
      cc.style.fontWeight = '700';
      row.appendChild(cc);

      for (let p = 0; p < currentPeriods; p++) {
        const td   = document.createElement('td');
        const slot = generatedTimetables[cls][day][p];

        if (!slot) {
          td.innerHTML = `<span class="slot-empty">·</span>`;
        } else if (slot.isLunch) {
          td.innerHTML = `<span class="slot-lunch" style="font-size:10px;">🍱</span>`;
        } else {
          const color = subjectColorMap[slot.subject] || PALETTE[0];
          td.innerHTML = `
            <span class="slot-chip"
              style="background:${color.bg};color:${color.fg};font-size:10px;padding:3px 5px;">
              ${slot.subject}
            </span>`;
        }
        row.appendChild(td);
      }
      tbody.appendChild(row);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    el.appendChild(wrap);
  });
}

/* ── ANALYTICS ── */
function renderAnalytics() {
  const days    = DAYS.slice(0, currentDays);
  const classes = Object.keys(generatedTimetables);
  const el      = document.getElementById('analyticsContainer');
  el.innerHTML  = '';

  /* Aggregate stats */
  let totalSlots = 0, filled = 0, free = 0;
  const dayLoad  = {};
  days.forEach(d => { dayLoad[d] = 0; });

  classes.forEach(cls => {
    days.forEach(day => {
      generatedTimetables[cls][day].forEach(slot => {
        if (slot?.isLunch) return;
        totalSlots++;
        if (slot) { filled++; dayLoad[day]++; }
        else free++;
      });
    });
  });

  const coverage     = totalSlots ? Math.round((filled / totalSlots) * 100) : 0;
  const busiestEntry = Object.entries(dayLoad).sort((a, b) => b[1] - a[1])[0];

  /* Stat cards */
  const grid = document.createElement('div');
  grid.className = 'stat-grid';

  const cards = [
    { value: `${coverage}%`, label: 'Schedule Coverage',
      sub: `${filled} of ${totalSlots} slots filled`, cls: 'card-success' },
    { value: free, label: 'Free Periods',
      sub: 'across all classes this week', cls: 'card-info' },
    { value: busiestEntry[0], label: 'Busiest Day',
      sub: `${busiestEntry[1]} periods scheduled`, cls: 'card-warn' },
    { value: conflictLog.length, label: 'Conflicts',
      sub: conflictLog.length ? 'requires attention' : 'Schedule is clean ✓',
      cls: conflictLog.length ? 'card-danger' : 'card-success' },
  ];

  cards.forEach(c => {
    const card = document.createElement('div');
    card.className = `stat-card ${c.cls}`;
    card.innerHTML = `
      <div class="stat-value">${c.value}</div>
      <div class="stat-label">${c.label}</div>
      <div class="stat-sub">${c.sub}</div>`;
    grid.appendChild(card);
  });
  el.appendChild(grid);

  /* Subject coverage */
  const secCov = document.createElement('div');
  secCov.className = 'analytics-section';

  secCov.innerHTML = `
    <div class="section-title">
      <span class="section-title-icon">📚</span>
      Subject Coverage — Planned vs Scheduled Hours
    </div>`;

  const subjectPlanned = {};
  const subjectActual  = {};

  subjectList.forEach(s => {
    const key = `${s.subject} — ${s.className}`;
    subjectPlanned[key] = s.hoursPerWeek;
    subjectActual[key]  = 0;
  });

  classes.forEach(cls => {
    days.forEach(day => {
      generatedTimetables[cls][day].forEach(slot => {
        if (slot && !slot.isLunch) {
          const key = `${slot.subject} — ${cls}`;
          if (subjectActual[key] !== undefined) subjectActual[key]++;
        }
      });
    });
  });

  const covWrap = document.createElement('div');

  Object.entries(subjectPlanned).forEach(([key, planned]) => {
    const actual = subjectActual[key] || 0;
    const pct    = Math.min(Math.round((actual / planned) * 100), 100);
    const fillCls = pct >= 80 ? 'fill-good' : pct >= 50 ? 'fill-mid' : 'fill-low';

    const row = document.createElement('div');
    row.className = 'coverage-row';
    row.innerHTML = `
      <div class="coverage-label" title="${key}">${key}</div>
      <div class="coverage-track">
        <div class="coverage-fill ${fillCls}" style="width:${pct}%">
          ${actual}/${planned} hrs
        </div>
      </div>
      <div class="coverage-pct">${pct}%</div>`;
    covWrap.appendChild(row);
  });

  secCov.appendChild(covWrap);
  el.appendChild(secCov);

  /* Day load breakdown */
  const secDay = document.createElement('div');
  secDay.className = 'analytics-section';

  secDay.innerHTML = `
    <div class="section-title">
      <span class="section-title-icon">📅</span>
      Periods Scheduled Per Day
    </div>`;

  const maxLoad  = Math.max(...Object.values(dayLoad), 1);
  const dayList  = document.createElement('div');
  dayList.className = 'bar-list';

  Object.entries(dayLoad).forEach(([day, load]) => {
    const pct      = Math.round((load / maxLoad) * 100);
    const badgeCls = pct >= 80 ? 'heavy' : pct >= 50 ? 'medium' : 'light';
    const fillCls  = pct >= 80 ? '' : pct >= 50 ? 'fill-mid' : 'fill-low';
    const label    = pct >= 80 ? 'Heavy' : pct >= 50 ? 'Moderate' : 'Light';

    dayList.innerHTML += `
      <div class="bar-row">
        <div class="bar-label">${day}</div>
        <div class="bar-track">
          <div class="bar-fill ${fillCls}" style="width:${pct}%">${load} periods</div>
        </div>
        <span class="day-badge ${badgeCls}">${label}</span>
      </div>`;
  });

  secDay.appendChild(dayList);
  el.appendChild(secDay);

  /* Teacher load summary */
  const secTeacher = document.createElement('div');
  secTeacher.className = 'analytics-section';

  secTeacher.innerHTML = `
    <div class="section-title">
      <span class="section-title-icon">👨‍🏫</span>
      Teacher Load Distribution
    </div>`;

  const teacherHours = {};
  classes.forEach(cls => {
    days.forEach(day => {
      generatedTimetables[cls][day].forEach(slot => {
        if (slot && !slot.isLunch && slot.teacher) {
          teacherHours[slot.teacher] = (teacherHours[slot.teacher] || 0) + 1;
        }
      });
    });
  });

  const maxTeacherH = Math.max(...Object.values(teacherHours), 1);
  const maxAllowed  = currentDays * parseInt(document.getElementById('maxHoursPerDay').value, 10);

  const teacherList = document.createElement('div');
  teacherList.className = 'bar-list';

  Object.entries(teacherHours)
    .sort((a, b) => b[1] - a[1])
    .forEach(([teacher, h]) => {
      const pct      = Math.round((h / maxTeacherH) * 100);
      const capPct   = Math.min(Math.round((h / maxAllowed) * 100), 100);
      const badgeCls = capPct >= 90 ? 'heavy' : capPct >= 60 ? 'medium' : 'light';
      const label    = capPct >= 90 ? 'Overloaded' : capPct >= 60 ? 'Moderate' : 'Available';
      const fillCls  = capPct >= 90 ? '' : capPct >= 60 ? 'fill-mid' : 'fill-low';

      teacherList.innerHTML += `
        <div class="bar-row">
          <div class="bar-label" title="${teacher}">${teacher}</div>
          <div class="bar-track">
            <div class="bar-fill ${fillCls}" style="width:${pct}%">${h} hrs</div>
          </div>
          <span class="day-badge ${badgeCls}">${label}</span>
        </div>`;
    });

  secTeacher.appendChild(teacherList);
  el.appendChild(secTeacher);
}

/* ── SEARCH ── */
function applySearch() {
  const query = document.getElementById('searchInput').value.toLowerCase().trim();
  const type  = document.getElementById('searchType').value;

  document.querySelectorAll('.slot-chip, .slot-conflict').forEach(chip => {
    const subject = (chip.dataset.subject || '').toLowerCase();
    const teacher = (chip.dataset.teacher || '').toLowerCase();

    let match = false;
    if (!query) {
      match = true;
    } else if (type === 'all') {
      match = subject.includes(query) || teacher.includes(query);
    } else if (type === 'teacher') {
      match = teacher.includes(query);
    } else if (type === 'subject') {
      match = subject.includes(query);
    }

    chip.classList.toggle('slot-highlight', match && !!query);
    chip.classList.toggle('slot-dimmed',    !match && !!query);
  });
}

document.getElementById('searchInput').addEventListener('input',  applySearch);
document.getElementById('searchType').addEventListener('change',  applySearch);
document.getElementById('clearSearch').addEventListener('click', () => {
  document.getElementById('searchInput').value = '';
  applySearch();
});

/* ── TAB SWITCHING ── */
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    /* Update tab buttons */
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');

    /* Show correct panel */
    const target = btn.dataset.tab;
    ['class','teacher','student','admin','analytics'].forEach(t => {
      const panel = document.getElementById(`tab-${t}`);
      if (panel) panel.style.display = t === target ? 'block' : 'none';
    });
  });
});

/* ── RENDER ALL VIEWS ── */
function renderAllViews() {
  const days = DAYS.slice(0, currentDays);

  renderConflicts(conflictLog);
  renderWorkloadChart(generatedTimetables, days);
  renderClassView();
  renderTeacherView();
  renderStudentView();
  renderAdminGrid();
  renderAnalytics();

  /* Show output area, hide placeholder */
  document.getElementById('placeholderState').style.display = 'none';
  document.getElementById('outputArea').style.display       = 'block';

  /* Scroll to output */
  document.getElementById('outputArea').scrollIntoView({ behavior: 'smooth', block: 'start' });

  /* Reapply any active search */
  applySearch();
}

/* ── GENERATE BUTTON ── */
document.getElementById('generateBtn').addEventListener('click', async () => {
  const teacherFile = document.getElementById('teacherFile').files[0];
  const subjectFile = document.getElementById('subjectFile').files[0];

  if (!teacherFile || !subjectFile) {
    showToast('Please upload both CSV files before generating.', 'error');
    return;
  }

  currentPeriods = parseInt(document.getElementById('periodsPerDay').value, 10);
  currentDays    = parseInt(document.getElementById('workingDays').value,   10);
  const maxHours    = parseInt(document.getElementById('maxHoursPerDay').value, 10);
  const lunchPeriod = parseInt(document.getElementById('lunchPeriod').value,    10);

  const btn = document.getElementById('generateBtn');
  const txt = btn.querySelector('.btn-text');
  const sub = btn.querySelector('.btn-sub');
  txt.textContent = 'Generating…';
  sub.textContent = 'Running algorithms';
  btn.disabled    = true;

  setStepActive(3);

  try {
    const teacherRows = await readCSV(teacherFile);
    const subjectRows = await readCSV(subjectFile);

    teacherBusySlots = parseTeacherData(teacherRows);
    subjectList      = parseSubjectData(subjectRows);

    if (!subjectList.length) {
      showToast('No valid subject data found. Check your CSV format.', 'error');
      btn.disabled = false;
      txt.textContent = 'Generate Timetable';
      sub.textContent = 'Using DSA algorithms';
      return;
    }

    assignSubjectColors(subjectList);

    /* Small delay so UI updates are visible before heavy work */
    await new Promise(r => setTimeout(r, 120));

    generatedTimetables = generateTimetable(
      subjectList, currentPeriods, currentDays, maxHours, lunchPeriod
    );

    renderAllViews();

    setStepActive(4);

    const msg = conflictLog.length
      ? `Timetable generated with ${conflictLog.length} conflict(s). Please review.`
      : `Timetable generated successfully — no conflicts detected.`;

    showToast(msg, conflictLog.length ? 'warn' : 'success');

  } catch (err) {
    console.error(err);
    showToast('Error reading files. Please check the file format.', 'error');
  } finally {
    btn.disabled    = false;
    txt.textContent = 'Regenerate Timetable';
    sub.textContent = 'Using DSA algorithms';
  }
});

/* ── PRINT ── */
document.getElementById('printBtn').addEventListener('click', () => {
  if (!Object.keys(generatedTimetables).length) {
    showToast('Generate a timetable first.', 'warn');
    return;
  }
  window.print();
});

/* ── PDF EXPORT ── */
document.getElementById('downloadPDF').addEventListener('click', () => {
  if (!Object.keys(generatedTimetables).length) {
    showToast('Generate a timetable first.', 'warn');
    return;
  }

  const { jsPDF }   = window.jspdf;
  const doc         = new jsPDF('landscape', 'mm', 'a4');
  const days        = DAYS.slice(0, currentDays);
  const dateStr     = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });

  let isFirst = true;

  Object.keys(generatedTimetables).forEach(className => {
    if (!isFirst) doc.addPage();
    isFirst = false;

    /* Page header */
    doc.setFillColor(107, 15, 26);
    doc.rect(0, 0, 297, 22, 'F');

    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text(`NM-Scheduler — Class: ${className}`, 14, 14);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(240, 220, 222);
    doc.text(
      `SVKM's NMIMS University  ·  Generated: ${dateStr}  ·  Designed and Developed by Anoushka Sarkar`,
      14, 19
    );

    /* Table data */
    const headers = [
      'Day',
      ...Array.from({ length: currentPeriods }, (_, i) => `Period ${i + 1}`)
    ];

    const rows = days.map(day => [
      day,
      ...Array.from({ length: currentPeriods }, (_, p) => {
        const slot = generatedTimetables[className][day][p];
        if (!slot)          return '—';
        if (slot.isLunch)   return '🍱 Lunch';
        return `${slot.subject}\n${slot.teacher}`;
      })
    ]);

    doc.autoTable({
      head:    [headers],
      body:    rows,
      startY:  26,
      theme:   'grid',
      styles: {
        fontSize:    8.5,
        cellPadding: 4,
        valign:      'middle',
        halign:      'center',
        font:        'helvetica',
        lineColor:   [220, 210, 212],
        lineWidth:   0.3,
      },
      headStyles: {
        fillColor:  [107, 15, 26],
        textColor:  [255, 255, 255],
        fontStyle:  'bold',
        fontSize:   9,
      },
      columnStyles: {
        0: {
          fillColor:  [253, 244, 245],
          textColor:  [59, 10, 10],
          fontStyle:  'bold',
          halign:     'left',
          cellWidth:  28,
        }
      },
      alternateRowStyles: {
        fillColor: [253, 248, 249]
      },
      didParseCell: (data) => {
        if (data.section !== 'body' || data.column.index === 0) return;
        const raw = data.cell.raw;
        if (raw === '🍱 Lunch' || raw === 'Lunch') {
          data.cell.styles.fillColor  = [254, 243, 205];
          data.cell.styles.textColor  = [122, 79, 0];
          data.cell.styles.fontStyle  = 'bold';
        } else if (raw !== '—') {
          data.cell.styles.fillColor  = [220, 252, 231];
          data.cell.styles.textColor  = [20, 83, 45];
          data.cell.styles.fontStyle  = 'bold';
        }
      },
      /* Page footer */
      didDrawPage: (data) => {
        const pageCount = doc.internal.getNumberOfPages();
        doc.setFontSize(7.5);
        doc.setTextColor(160, 140, 142);
        doc.text(
          `Page ${data.pageNumber} of ${pageCount}  ·  NM-Scheduler © 2026`,
          data.settings.margin.left,
          doc.internal.pageSize.height - 6
        );
      }
    });

    /* Conflict warning on page if applicable */
    const classConflicts = conflictLog.filter(
      c => c.class1 === className || c.class2 === className
    );

    if (classConflicts.length) {
      const finalY = doc.lastAutoTable.finalY + 4;
      doc.setFillColor(253, 232, 232);
      doc.setDrawColor(197, 48, 48);
      doc.setLineWidth(0.4);
      doc.roundedRect(14, finalY, 269, classConflicts.length * 6 + 8, 2, 2, 'FD');

      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(139, 0, 0);
      doc.text(`⚠  ${classConflicts.length} conflict(s) on this timetable:`, 18, finalY + 6);

      doc.setFont('helvetica', 'normal');
      classConflicts.forEach((c, i) => {
        doc.text(
          `• ${c.teacher} — ${c.day} Period ${c.period} (${c.class1} & ${c.class2})`,
          18,
          finalY + 12 + i * 6
        );
      });
    }
  });

  doc.save(`NM-Scheduler_Timetable_${dateStr.replace(/ /g, '_')}.pdf`);
  showToast('PDF exported successfully.', 'success');
});

/* ── INITIAL STEP STATE ── */
setStepActive(1);