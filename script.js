/* ══════════════════════════════════════════
   NM-SCHEDULER PRO — script.js v3.0
   DSA: Hash Map · Priority Queue · Binary Search
        Graph Coloring · Greedy DP
══════════════════════════════════════════ */
'use strict';

/* ── CONSTANTS ── */
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const PALETTE = [
  { bg:'var(--slot-a-bg)', fg:'var(--slot-a-fg)' },
  { bg:'var(--slot-b-bg)', fg:'var(--slot-b-fg)' },
  { bg:'var(--slot-c-bg)', fg:'var(--slot-c-fg)' },
  { bg:'var(--slot-d-bg)', fg:'var(--slot-d-fg)' },
  { bg:'var(--slot-e-bg)', fg:'var(--slot-e-fg)' },
  { bg:'var(--slot-f-bg)', fg:'var(--slot-f-fg)' },
  { bg:'var(--slot-g-bg)', fg:'var(--slot-g-fg)' },
  { bg:'var(--slot-h-bg)', fg:'var(--slot-h-fg)' },
  { bg:'var(--slot-i-bg)', fg:'var(--slot-i-fg)' },
  { bg:'var(--slot-j-bg)', fg:'var(--slot-j-fg)' },
];

/* ── APP STATE ── */
const appState = {
  teachers:      [],
  classes:       [],
  assignments:   [],
  timetables:    {},
  conflicts:     [],
  lockedSlots:   {},
  history:       [],
  redoStack:     [],
  periodsPerDay:  6,
  workingDays:    6,
  maxHoursPerDay: 4,
  lunchPeriod:    3,
  editMode:       false,
  lockMode:       false,
};

let subjectColorMap    = {};
let _editTarget        = null;
let _teacherEditIndex  = null;
let _teacherBusyDraft  = {};
let _teacherLeaveDraft = [];

/* ── HELPERS ── */
const deepClone = o => JSON.parse(JSON.stringify(o));
const slotKey   = (cls, day, p) => `${cls}|${day}|${p}`;

function hoursToPeriodsPerWeek(hrs, workingDays) {
  const weeks = workingDays === 6 ? 22 : 18;
  return Math.max(1, Math.round(hrs / weeks));
}

function assignColors() {
  const unique = [...new Set(appState.assignments.map(a => a.subject))];
  subjectColorMap = {};
  unique.forEach((s, i) => {
    subjectColorMap[s] = PALETTE[i % PALETTE.length];
  });
}

function getInitials(name) {
  return name.replace(/^(Prof\.|Dr\.|Mr\.|Ms\.)\s*/i, '')
    .split(' ').filter(Boolean).slice(0, 2)
    .map(w => w[0].toUpperCase()).join('');
}

/* ── TOAST ── */
function showToast(msg, type = 'info', duration = 2800) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className   = `toast ${type} show`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), duration);
}

/* ── LOADING ── */
function showLoading(title = 'Processing…', sub = 'Please wait') {
  document.getElementById('loadingTitle').textContent = title;
  document.getElementById('loadingMsg').textContent   = sub;
  document.getElementById('loadingBar').style.width   = '0%';
  document.getElementById('loadingOverlay').style.display = 'flex';
}
function setLoadingProgress(pct) {
  document.getElementById('loadingBar').style.width = pct + '%';
}
function hideLoading() {
  document.getElementById('loadingOverlay').style.display = 'none';
}

/* ── LIVE CLOCK ── */
function startClock() {
  const el = document.getElementById('liveClock');
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString('en-IN', { hour12: true });
  };
  tick();
  setInterval(tick, 1000);
}

/* ── DARK MODE ── */
document.getElementById('darkModeBtn').addEventListener('click', () => {
  const html = document.documentElement;
  const dark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', dark ? 'light' : 'dark');
  document.querySelector('.theme-icon').textContent = dark ? '🌙' : '☀️';
});

/* ══════════════════════════════════════
   FILE UPLOAD
══════════════════════════════════════ */
function setupDropZone(zoneId, inputId, statusId) {
  const zone  = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  if (!zone || !input) return;

  input.addEventListener('change', () => {
    if (input.files && input.files[0]) {
      markZoneReady(zoneId, input.files[0].name, statusId);
    }
  });

  zone.addEventListener('dragover', e => {
    e.preventDefault(); e.stopPropagation();
    zone.classList.add('dragover');
  });
  zone.addEventListener('dragleave', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
  });
  zone.addEventListener('drop', e => {
    e.preventDefault(); e.stopPropagation();
    zone.classList.remove('dragover');
    const files = e.dataTransfer?.files;
    if (files && files[0]) {
      try {
        const dt = new DataTransfer();
        dt.items.add(files[0]);
        input.files = dt.files;
      } catch (_) {
        input._droppedFile = files[0];
      }
      markZoneReady(zoneId, files[0].name, statusId);
    }
  });
}

function markZoneReady(zoneId, filename, statusId) {
  const zone   = document.getElementById(zoneId);
  const status = document.getElementById(statusId);
  if (zone)   zone.classList.add('has-file');
  if (status) status.innerHTML =
    `<span class="status-dot ok"></span>${filename}`;
}

function getFileFromInput(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return null;
  if (input.files && input.files[0]) return input.files[0];
  if (input._droppedFile)            return input._droppedFile;
  return null;
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) { reject(new Error('No file')); return; }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const wb    = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(sheet, { defval: '' }));
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('FileReader error'));
    reader.readAsArrayBuffer(file);
  });
}

/* ── IMPORT BUTTON ── */
document.getElementById('importNowBtn').addEventListener('click', async () => {
  const subFile = getFileFromInput('subjectCSVFile');
  const tchFile = getFileFromInput('teacherCSVFile');

  if (!subFile && !tchFile) {
    showToast('Please select at least the Subject CSV first.', 'warn');
    return;
  }

  showLoading('Importing files…', 'Reading CSV data');
  setLoadingProgress(10);

  try {
    if (subFile) {
      showLoading('Importing…', `Reading: ${subFile.name}`);
      setLoadingProgress(25);
      const rows = await readFile(subFile);

      if (!rows.length) {
        hideLoading();
        showToast('Subject CSV appears empty. Check format.', 'warn');
        return;
      }

      const firstRow = rows[0];
      const keys = Object.keys(firstRow).map(k => k.toLowerCase().trim());
      if (!keys.includes('class') || !keys.includes('subject') || !keys.includes('teacher')) {
        hideLoading();
        showToast('Subject CSV missing columns. Need: Class, Subject, Teacher, HoursPerSemester, Type', 'error', 5000);
        return;
      }

      importSubjectRows(rows);
      setLoadingProgress(55);
    }

    if (tchFile) {
      showLoading('Importing…', `Reading: ${tchFile.name}`);
      setLoadingProgress(65);
      const rows = await readFile(tchFile);
      importTeacherBusyRows(rows);
      setLoadingProgress(85);
    }

    setLoadingProgress(100);
    await new Promise(r => setTimeout(r, 300));
    hideLoading();

    assignColors();
    refreshDataPanels();
    updateGenerateBtn();

    showToast(
      `✅ Imported! ${appState.classes.length} classes · ` +
      `${appState.teachers.length} teachers · ` +
      `${appState.assignments.length} assignments`,
      'success', 5000
    );
  } catch (err) {
    hideLoading();
    console.error('Import error:', err);
    showToast(`Import failed: ${err.message}`, 'error', 5000);
  }
});

/* ── PARSE SUBJECT ROWS ── */
function importSubjectRows(rows) {
  rows.forEach((row, idx) => {
    const r = {};
    Object.keys(row).forEach(k => { r[k.trim().toLowerCase()] = row[k]; });

    const cls     = String(r['class']   || '').trim();
    const subject = String(r['subject'] || '').trim();
    const teacher = String(r['teacher'] || '').trim();
    const hrs     = parseInt(r['hourspersemester'] || r['hoursperweek'] || r['hours'] || 30);
    const type    = String(r['type'] || 'theory').trim().toLowerCase();

    if (!cls || !subject || !teacher) return;

    if (!appState.classes.includes(cls)) appState.classes.push(cls);

    if (!appState.teachers.find(t => t.name === teacher)) {
      appState.teachers.push({
        name: teacher, desig: 'Faculty',
        email: '', busySlots: {}, leaveDays: []
      });
    }

    let asgn = appState.assignments.find(
      a => a.subject === subject && a.teacher === teacher
    );
    if (!asgn) {
      asgn = {
        subject, teacher,
        hoursPerSemester: isNaN(hrs) ? 30 : hrs,
        type: ['theory','lab','tutorial'].includes(type) ? type : 'theory',
        classes: []
      };
      appState.assignments.push(asgn);
    }
    if (!asgn.classes.includes(cls)) asgn.classes.push(cls);
  });
}

/* ── PARSE TEACHER BUSY ROWS ── */
function importTeacherBusyRows(rows) {
  rows.forEach(row => {
    const r = {};
    Object.keys(row).forEach(k => { r[k.trim().toLowerCase()] = row[k]; });

    const teacher = String(r['teacher'] || '').trim();
    const day     = String(r['day']     || '').trim();
    const period  = String(r['period']  || '').trim();
    if (!teacher || !day || !period) return;

    const matchedDay = DAYS.find(d => d.toLowerCase() === day.toLowerCase());
    if (!matchedDay) return;

    let t = appState.teachers.find(
      x => x.name.toLowerCase() === teacher.toLowerCase()
    );
    if (!t) {
      t = { name: teacher, desig: 'Faculty', email: '', busySlots: {}, leaveDays: [] };
      appState.teachers.push(t);
    }
    if (!t.busySlots[matchedDay]) t.busySlots[matchedDay] = [];
    if (!t.busySlots[matchedDay].includes(period)) {
      t.busySlots[matchedDay].push(period);
    }
  });
}

/* ── TEMPLATE DOWNLOADS ── */
document.getElementById('dlSubjectTemplate').addEventListener('click', e => {
  e.preventDefault();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Class','Subject','Teacher','HoursPerSemester','Type'],
    ['3rd Year CSDS-A','ADSA','Prof. Wasiha',45,'theory'],
    ['3rd Year CSDS-B','ADSA','Prof. Wasiha',45,'theory'],
    ['2nd Year CSDS-A','DBMS','Prof. Wasiha',45,'theory'],
    ['1st Year CE-A','Maths','Prof. Wani',60,'theory'],
    ['2nd Year CSDS-A','DSA Lab','Mr. Arjun',30,'lab'],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Subjects');
  XLSX.writeFile(wb, 'subject_requirements_template.xlsx');
});

document.getElementById('dlTeacherTemplate').addEventListener('click', e => {
  e.preventDefault();
  const ws = XLSX.utils.aoa_to_sheet([
    ['Teacher','Day','Period'],
    ['Prof. Wasiha','Saturday',4],
    ['Prof. Wasiha','Saturday',5],
    ['Prof. Nikita','Saturday',1],
    ['Mr. Arjun','Friday',1],
    ['Mr. Arjun','Friday',2],
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Busy Slots');
  XLSX.writeFile(wb, 'teacher_availability_template.xlsx');
});

/* ══════════════════════════════════════
   DATA PANELS
══════════════════════════════════════ */
function refreshDataPanels() {
  renderClassGrid();
  renderTeacherGrid();
  renderSubjectGrid();
  updateCounts();
  refreshSubjectFilters();
}

function updateCounts() {
  document.getElementById('classCount').textContent   = appState.classes.length;
  document.getElementById('teacherCount').textContent = appState.teachers.length;
  document.getElementById('subjectCount').textContent = appState.assignments.length;
}

function updateGenerateBtn() {
  const btn = document.getElementById('generateBtn');
  const ok  = appState.classes.length > 0 && appState.assignments.length > 0;
  btn.disabled = !ok;
  btn.querySelector('.gen-sub').textContent = ok
    ? `${appState.classes.length} class(es) · ${appState.assignments.length} assignment(s) ready`
    : 'Upload CSVs or add data first';
}

/* ── CLASS GRID ── */
function renderClassGrid() {
  const el = document.getElementById('classGrid');
  if (!appState.classes.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🎓</div>
      <div class="empty-title">No classes yet</div>
      <div class="empty-sub">Upload a subject CSV or add manually</div>
    </div>`;
    return;
  }
  el.innerHTML = '';
  appState.classes.forEach((cls, i) => {
    const card = document.createElement('div');
    card.className = 'class-card';
    card.innerHTML = `<span>${cls}</span>
      <button class="class-card-del" data-i="${i}">✕</button>`;
    el.appendChild(card);
  });
  el.querySelectorAll('.class-card-del').forEach(btn => {
    btn.addEventListener('click', () => {
      appState.classes.splice(+btn.dataset.i, 1);
      refreshDataPanels(); updateGenerateBtn();
    });
  });
}

/* ── TEACHER GRID ── */
function renderTeacherGrid(filter = '') {
  const el   = document.getElementById('teacherGrid');
  const list = appState.teachers.filter(t =>
    t.name.toLowerCase().includes(filter.toLowerCase())
  );
  if (!list.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">👨‍🏫</div>
      <div class="empty-title">No teachers found</div>
      <div class="empty-sub">Upload a CSV or add manually</div>
    </div>`;
    return;
  }
  el.innerHTML = '';
  list.forEach(t => {
    const realIdx   = appState.teachers.indexOf(t);
    const totalBusy = Object.values(t.busySlots || {})
      .reduce((s, ps) => s + ps.length, 0);
    const subjects  = appState.assignments.filter(a => a.teacher === t.name);
    const tile = document.createElement('div');
    tile.className = 'teacher-tile';
    tile.innerHTML = `
      <div class="teacher-avatar">${getInitials(t.name)}</div>
      <div class="teacher-body">
        <div class="teacher-name">${t.name}</div>
        <div class="teacher-desig">${t.desig || 'Faculty'}</div>
        <div class="teacher-chips">
          ${subjects.map(a => `<span class="teacher-chip">${a.subject}</span>`).join('')}
          ${totalBusy ? `<span class="teacher-chip warn">🚫 ${totalBusy} busy</span>` : ''}
          ${(t.leaveDays||[]).length ? `<span class="teacher-chip warn">📅 ${t.leaveDays.length} leave</span>` : ''}
        </div>
      </div>
      <div class="teacher-actions">
        <button class="btn-tile" data-edit="${realIdx}">✏ Edit</button>
        <button class="btn-tile danger" data-del="${realIdx}">✕</button>
      </div>`;
    el.appendChild(tile);
  });
  el.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => openTeacherModal(+btn.dataset.edit));
  });
  el.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      appState.teachers.splice(+btn.dataset.del, 1);
      refreshDataPanels();
    });
  });
}

document.getElementById('teacherSearchInput').addEventListener('input', e => {
  renderTeacherGrid(e.target.value);
});

/* ── SUBJECT GRID ── */
function renderSubjectGrid() {
  const el        = document.getElementById('subjectGrid');
  const clsFilter = document.getElementById('subjectFilterClass').value;
  const tchFilter = document.getElementById('subjectFilterTeacher').value;
  let list = appState.assignments;
  if (clsFilter) list = list.filter(a => a.classes.includes(clsFilter));
  if (tchFilter) list = list.filter(a => a.teacher === tchFilter);

  if (!list.length) {
    el.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📚</div>
      <div class="empty-title">No assignments found</div>
      <div class="empty-sub">Upload a subject CSV or add manually</div>
    </div>`;
    return;
  }
  el.innerHTML = '';
  list.forEach(a => {
    const realIdx = appState.assignments.indexOf(a);
    const color   = subjectColorMap[a.subject] || PALETTE[0];
    const ppw     = hoursToPeriodsPerWeek(a.hoursPerSemester, appState.workingDays);
    const typeStyle = {
      theory:   'background:var(--clr-info-bg);color:var(--clr-info)',
      lab:      'background:var(--clr-success-bg);color:var(--clr-success)',
      tutorial: 'background:var(--clr-warn-bg);color:var(--clr-warn)',
    }[a.type] || 'background:var(--clr-info-bg);color:var(--clr-info)';

    const row = document.createElement('div');
    row.className = 'subject-row';
    row.innerHTML = `
      <div class="subject-color-bar" style="background:${color.fg};"></div>
      <div class="subject-row-body">
        <div class="subject-row-name">
          ${a.subject}
          <span class="subject-type-badge" style="${typeStyle}">${a.type||'theory'}</span>
        </div>
        <div class="subject-row-meta">
          <span>👨‍🏫 ${a.teacher}</span>
          <span>⏱ ${a.hoursPerSemester} hrs/sem → ${ppw}/week</span>
        </div>
        <div class="subject-row-classes">
          ${a.classes.map(c => `<span class="sub-class-chip">${c}</span>`).join('')}
        </div>
      </div>
      <div class="teacher-actions">
        <button class="btn-tile danger" data-del="${realIdx}">✕</button>
      </div>`;
    el.appendChild(row);
  });
  el.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      appState.assignments.splice(+btn.dataset.del, 1);
      assignColors(); refreshDataPanels(); updateGenerateBtn();
    });
  });
}

function refreshSubjectFilters() {
  const clsSel = document.getElementById('subjectFilterClass');
  const tchSel = document.getElementById('subjectFilterTeacher');
  const cv = clsSel.value, tv = tchSel.value;
  clsSel.innerHTML = '<option value="">All classes</option>';
  appState.classes.forEach(c => {
    clsSel.innerHTML += `<option value="${c}"${c===cv?' selected':''}>${c}</option>`;
  });
  tchSel.innerHTML = '<option value="">All teachers</option>';
  appState.teachers.forEach(t => {
    tchSel.innerHTML += `<option value="${t.name}"${t.name===tv?' selected':''}>${t.name}</option>`;
  });
}

document.getElementById('subjectFilterClass').addEventListener('change', renderSubjectGrid);
document.getElementById('subjectFilterTeacher').addEventListener('change', renderSubjectGrid);

/* ── DATA TABS ── */
document.querySelectorAll('.data-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.data-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.data-panel').forEach(p => p.style.display = 'none');
    btn.classList.add('active');
    document.getElementById(`dtab-${btn.dataset.dtab}`).style.display = 'block';
  });
});

/* ══════════════════════════════════════
   ADD CLASS MODAL
══════════════════════════════════════ */
function updateClassPreview() {
  const year   = document.getElementById('mc_year').value;
  const branch = document.getElementById('mc_branch').value;
  const div    = document.getElementById('mc_div').value.trim().toUpperCase();
  document.getElementById('mc_preview').textContent =
    div ? `${year} ${branch}-${div}` : `${year} ${branch}`;
}
['mc_year','mc_branch','mc_div'].forEach(id =>
  document.getElementById(id).addEventListener('input', updateClassPreview)
);
document.getElementById('openAddClass').addEventListener('click', () => {
  updateClassPreview();
  document.getElementById('addClassModal').style.display = 'flex';
});
document.getElementById('closeClassModal').addEventListener('click', () => {
  document.getElementById('addClassModal').style.display = 'none';
});
document.getElementById('saveClassModal').addEventListener('click', () => {
  const year   = document.getElementById('mc_year').value;
  const branch = document.getElementById('mc_branch').value;
  const div    = document.getElementById('mc_div').value.trim().toUpperCase();
  const cls    = div ? `${year} ${branch}-${div}` : `${year} ${branch}`;
  if (appState.classes.includes(cls)) { showToast('Class already exists.','warn'); return; }
  appState.classes.push(cls);
  document.getElementById('mc_div').value = '';
  refreshDataPanels(); updateGenerateBtn();
  document.getElementById('addClassModal').style.display = 'none';
  showToast(`Class "${cls}" added.`, 'success');
});

/* ══════════════════════════════════════
   ADD / EDIT TEACHER MODAL
══════════════════════════════════════ */
function openTeacherModal(editIdx = null) {
  _teacherEditIndex  = editIdx;
  _teacherBusyDraft  = {};
  _teacherLeaveDraft = [];

  const modal = document.getElementById('addTeacherModal');
  modal.querySelector('.modal-title').textContent =
    editIdx !== null ? '✏ Edit Teacher' : '➕ Add Teacher';

  if (editIdx !== null) {
    const t = appState.teachers[editIdx];
    document.getElementById('mt_name').value  = t.name;
    document.getElementById('mt_desig').value = t.desig || 'Faculty';
    document.getElementById('mt_email').value = t.email || '';
    Object.entries(t.busySlots || {}).forEach(([d, ps]) => {
      _teacherBusyDraft[d] = [...ps];
    });
    _teacherLeaveDraft = [...(t.leaveDays || [])];
  } else {
    document.getElementById('mt_name').value  = '';
    document.getElementById('mt_desig').value = 'Assistant Professor';
    document.getElementById('mt_email').value = '';
  }

  buildModalBusyGrid();
  renderLeaveChips();
  modal.style.display = 'flex';
}

function buildModalBusyGrid() {
  const days   = DAYS.slice(0, appState.workingDays);
  const perDay = appState.periodsPerDay;
  const grid   = document.getElementById('modalBusyGrid');
  grid.style.gridTemplateColumns = `28px repeat(${days.length}, 1fr)`;
  grid.innerHTML = '';

  const corner = document.createElement('div');
  corner.className = 'busy-grid-cell lbl-period';
  grid.appendChild(corner);

  days.forEach(d => {
    const lbl = document.createElement('div');
    lbl.className   = 'busy-grid-cell lbl-day';
    lbl.textContent = d.slice(0, 3);
    grid.appendChild(lbl);
  });

  for (let p = 1; p <= perDay; p++) {
    const plbl = document.createElement('div');
    plbl.className   = 'busy-grid-cell lbl-period';
    plbl.textContent = `P${p}`;
    grid.appendChild(plbl);

    days.forEach(day => {
      const isLunch = (p === appState.lunchPeriod && appState.lunchPeriod > 0);
      const isLeave = _teacherLeaveDraft.includes(day);
      const isBusy  = (_teacherBusyDraft[day] || []).includes(String(p));

      const cell = document.createElement('div');
      cell.className = 'busy-grid-cell' +
        (isLunch ? ' lunch-cell' : isLeave ? ' leave-col' : isBusy ? ' busy' : '');
      cell.textContent = isLunch ? '🍱' : isLeave ? '—' : isBusy ? '✕' : '';

      if (!isLunch && !isLeave) {
        cell.addEventListener('click', () => {
          if (!_teacherBusyDraft[day]) _teacherBusyDraft[day] = [];
          const idx = _teacherBusyDraft[day].indexOf(String(p));
          if (idx === -1) _teacherBusyDraft[day].push(String(p));
          else            _teacherBusyDraft[day].splice(idx, 1);
          buildModalBusyGrid();
        });
      }
      grid.appendChild(cell);
    });
  }
}

function renderLeaveChips() {
  const el = document.getElementById('mt_leaveChips');
  el.innerHTML = '';
  _teacherLeaveDraft.forEach(day => {
    const chip = document.createElement('span');
    chip.className = 'leave-chip';
    chip.innerHTML = `${day} <button data-d="${day}">✕</button>`;
    chip.querySelector('button').addEventListener('click', () => {
      _teacherLeaveDraft = _teacherLeaveDraft.filter(d => d !== day);
      buildModalBusyGrid(); renderLeaveChips();
    });
    el.appendChild(chip);
  });
}

document.getElementById('mt_addLeave').addEventListener('click', () => {
  const day = document.getElementById('mt_leaveDay').value;
  if (!day) return;
  if (!_teacherLeaveDraft.includes(day)) _teacherLeaveDraft.push(day);
  document.getElementById('mt_leaveDay').value = '';
  buildModalBusyGrid(); renderLeaveChips();
});

document.getElementById('openAddTeacher').addEventListener('click', () => openTeacherModal(null));
document.getElementById('closeTeacherModal').addEventListener('click', () => {
  document.getElementById('addTeacherModal').style.display = 'none';
});

document.getElementById('saveTeacherModal').addEventListener('click', () => {
  const name  = document.getElementById('mt_name').value.trim();
  const desig = document.getElementById('mt_desig').value;
  const email = document.getElementById('mt_email').value.trim();
  if (!name) { showToast('Please enter teacher name.', 'warn'); return; }

  const cleanBusy = {};
  Object.entries(_teacherBusyDraft).forEach(([d, ps]) => {
    if (ps.length) cleanBusy[d] = ps;
  });

  if (_teacherEditIndex !== null) {
    const t     = appState.teachers[_teacherEditIndex];
    const oldName = t.name;
    t.name      = name; t.desig = desig;
    t.email     = email; t.busySlots = cleanBusy;
    t.leaveDays = [..._teacherLeaveDraft];
    appState.assignments.forEach(a => { if (a.teacher === oldName) a.teacher = name; });
  } else {
    if (appState.teachers.find(t => t.name === name)) {
      showToast('Teacher already exists.', 'warn'); return;
    }
    appState.teachers.push({ name, desig, email, busySlots: cleanBusy, leaveDays: [..._teacherLeaveDraft] });
  }
  refreshDataPanels();
  document.getElementById('addTeacherModal').style.display = 'none';
  showToast(`Teacher "${name}" saved.`, 'success');
});

/* ══════════════════════════════════════
   ADD SUBJECT MODAL
══════════════════════════════════════ */
function openSubjectModal() {
  const sel = document.getElementById('ms_teacher');
  sel.innerHTML = '<option value="">— Select Teacher —</option>';
  appState.teachers.forEach(t => {
    sel.innerHTML += `<option value="${t.name}">${t.name}</option>`;
  });

  const grid = document.getElementById('ms_classCheckboxes');
  grid.innerHTML = '';
  appState.classes.forEach(cls => {
    const label = document.createElement('label');
    label.className = 'class-checkbox-opt';
    label.innerHTML = `<input type="checkbox" value="${cls}" />${cls}`;
    grid.appendChild(label);
  });

  document.getElementById('ms_name').value  = '';
  document.getElementById('ms_hours').value = '';
  document.getElementById('ms_hoursCalc').classList.remove('visible');
  document.querySelectorAll('.hours-preset').forEach(b => b.classList.remove('active'));
  document.querySelector('input[name="ms_type"][value="theory"]').checked = true;
  document.getElementById('addSubjectModal').style.display = 'flex';
}

document.getElementById('openAddSubject').addEventListener('click', openSubjectModal);
document.getElementById('closeSubjectModal').addEventListener('click', () => {
  document.getElementById('addSubjectModal').style.display = 'none';
});

document.querySelectorAll('.hours-preset').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.hours-preset').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('ms_hours').value = btn.dataset.h;
    updateHoursCalc();
  });
});

document.getElementById('ms_hours').addEventListener('input', () => {
  document.querySelectorAll('.hours-preset').forEach(b => b.classList.remove('active'));
  updateHoursCalc();
});

function updateHoursCalc() {
  const hrs   = parseInt(document.getElementById('ms_hours').value);
  const el    = document.getElementById('ms_hoursCalc');
  if (!hrs || isNaN(hrs)) { el.classList.remove('visible'); return; }
  const weeks = appState.workingDays === 6 ? 22 : 18;
  const ppw   = hoursToPeriodsPerWeek(hrs, appState.workingDays);
  el.textContent = `≈ ${ppw} period(s)/week  (${hrs} hrs ÷ ${weeks}-week semester)`;
  el.classList.add('visible');
}

document.getElementById('saveSubjectModal').addEventListener('click', () => {
  const name    = document.getElementById('ms_name').value.trim();
  const teacher = document.getElementById('ms_teacher').value;
  const hrs     = parseInt(document.getElementById('ms_hours').value);
  const type    = document.querySelector('input[name="ms_type"]:checked')?.value || 'theory';
  const classes = [...document.querySelectorAll('#ms_classCheckboxes input:checked')]
    .map(cb => cb.value);

  if (!name)              { showToast('Enter subject name.', 'warn');         return; }
  if (!teacher)           { showToast('Select a teacher.', 'warn');           return; }
  if (!hrs || isNaN(hrs)) { showToast('Enter valid hours.', 'warn');          return; }
  if (!classes.length)    { showToast('Select at least one class.', 'warn');  return; }

  let asgn = appState.assignments.find(
    a => a.subject === name && a.teacher === teacher
  );
  if (asgn) {
    classes.forEach(c => { if (!asgn.classes.includes(c)) asgn.classes.push(c); });
    showToast(`"${name}" updated.`, 'success');
  } else {
    appState.assignments.push({ subject: name, teacher, hoursPerSemester: hrs, type, classes });
    showToast(`Subject "${name}" added.`, 'success');
  }
  assignColors(); refreshDataPanels(); updateGenerateBtn();
  document.getElementById('addSubjectModal').style.display = 'none';
});

/* ══════════════════════════════════════
   DSA ENGINE
══════════════════════════════════════ */

/* DSA #1 — Hash Map */
function buildBusyMap() {
  const map = {};
  appState.teachers.forEach(t => {
    map[t.name] = {};
    Object.entries(t.busySlots || {}).forEach(([day, periods]) => {
      map[t.name][day] = new Set(periods.map(String));
    });
    (t.leaveDays || []).forEach(day => {
      map[t.name][day] = new Set(
        Array.from({ length: appState.periodsPerDay }, (_, i) => String(i + 1))
      );
    });
  });
  return map;
}

/* DSA #2 — Priority Queue */
function prioritize(flatList) {
  return [...flatList].sort((a, b) =>
    (b.hoursPerWeek * b.classes.length) - (a.hoursPerWeek * a.classes.length)
  );
}

/* DSA #3 — Binary Search */
function binaryFreeSlot(freeArr, startFrom) {
  let lo = 0, hi = freeArr.length - 1, res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (freeArr[mid] >= startFrom) { res = freeArr[mid]; hi = mid - 1; }
    else lo = mid + 1;
  }
  return res;
}

/* DSA #4 — Graph Coloring: conflict detection */
function detectConflicts(timetables, days, periodsPerDay) {
  const conflicts = [];
  days.forEach(day => {
    for (let p = 0; p < periodsPerDay; p++) {
      const seen = {};
      Object.keys(timetables).forEach(cls => {
        const slot = timetables[cls][day][p];
        if (slot && !slot.isLunch && slot.teacher) {
          if (seen[slot.teacher]) {
            conflicts.push({
              teacher: slot.teacher, day,
              period: p + 1,
              class1: seen[slot.teacher],
              class2: cls
            });
          } else { seen[slot.teacher] = cls; }
        }
      });
    }
  });
  return conflicts;
}

/* DSA #5 — DP Distribution */
function dpDistribute(hoursPerWeek, workingDays) {
  const dp    = Array(workingDays).fill(0);
  const base  = Math.floor(hoursPerWeek / workingDays);
  const extra = hoursPerWeek % workingDays;
  for (let d = 0; d < workingDays; d++) dp[d] = base + (d < extra ? 1 : 0);
  return dp;
}

/* DSA #6 — Greedy Scheduler */
function runScheduler() {
  const days          = DAYS.slice(0, appState.workingDays);
  const periodsPerDay = appState.periodsPerDay;
  const lunchPeriod   = appState.lunchPeriod;
  const maxHPD        = appState.maxHoursPerDay;
  const busyMap       = buildBusyMap();

  const timetables = {};
  appState.classes.forEach(cls => {
    timetables[cls] = {};
    days.forEach(day => {
      timetables[cls][day] = Array(periodsPerDay).fill(null);
    });
  });

  if (lunchPeriod > 0) {
    appState.classes.forEach(cls => {
      days.forEach(day => {
        timetables[cls][day][lunchPeriod - 1] = {
          subject: '🍱 Lunch', teacher: '', isLunch: true
        };
      });
    });
  }

  const flatList = [];
  appState.assignments.forEach(asgn => {
    asgn.classes.forEach(cls => {
      flatList.push({
        subject:      asgn.subject,
        teacher:      asgn.teacher,
        type:         asgn.type || 'theory',
        hoursPerWeek: hoursToPeriodsPerWeek(asgn.hoursPerSemester, appState.workingDays),
        classes:      [cls],
        cls
      });
    });
  });

  const teacherDaily = {};
  appState.teachers.forEach(t => {
    teacherDaily[t.name] = {};
    days.forEach(day => { teacherDaily[t.name][day] = 0; });
  });

  const prioritized = prioritize(flatList);

  prioritized.forEach(item => {
    const { subject, teacher, type, cls } = item;
    let totalLeft  = item.hoursPerWeek;
    const dpTargets = dpDistribute(item.hoursPerWeek, appState.workingDays);
    if (!busyMap[teacher]) busyMap[teacher] = {};

    for (let d = 0; d < days.length && totalLeft > 0; d++) {
      const day    = days[d];
      let   target = dpTargets[d];
      let   assigned = 0;

      const busySet   = busyMap[teacher][day] || new Set();
      const freeSlots = [];
      for (let p = 1; p <= periodsPerDay; p++) {
        if (p ===        lunchPeriod && lunchPeriod > 0) continue;
        if (!busySet.has(String(p))) freeSlots.push(p);
      }

      let searchFrom = 1;
      while (assigned < target && totalLeft > 0) {
        const period = binaryFreeSlot(freeSlots, searchFrom);
        if (period === -1) break;

        const pIdx = period - 1;
        if (timetables[cls][day][pIdx] !== null) {
          searchFrom = period + 1; continue;
        }
        if ((teacherDaily[teacher]?.[day] || 0) >= maxHPD) break;

        timetables[cls][day][pIdx] = { subject, teacher, type, isLunch: false };

        if (!busyMap[teacher][day]) busyMap[teacher][day] = new Set();
        busyMap[teacher][day].add(String(period));

        if (!teacherDaily[teacher])      teacherDaily[teacher] = {};
        if (!teacherDaily[teacher][day]) teacherDaily[teacher][day] = 0;
        teacherDaily[teacher][day]++;

        assigned++;
        totalLeft--;
        searchFrom = period + 1;
      }
    }
  });

  return timetables;
}

/* ══════════════════════════════════════
   GENERATE BUTTON
══════════════════════════════════════ */
document.getElementById('generateBtn').addEventListener('click', async () => {
  if (!appState.classes.length || !appState.assignments.length) {
    showToast('Add classes and subjects first.', 'warn'); return;
  }

  appState.periodsPerDay  = parseInt(document.getElementById('periodsPerDay').value)  || 6;
  appState.workingDays    = parseInt(document.getElementById('workingDays').value)     || 6;
  appState.maxHoursPerDay = parseInt(document.getElementById('maxHoursPerDay').value)  || 4;
  appState.lunchPeriod    = parseInt(document.getElementById('lunchPeriod').value)     || 0;

  showLoading('Generating timetable…', 'Running DSA scheduler');
  setLoadingProgress(30);

  await new Promise(r => setTimeout(r, 80));

  try {
    assignColors();
    setLoadingProgress(60);

    const result = runScheduler();
    setLoadingProgress(80);

    pushHistory();
    appState.timetables = result;
    appState.conflicts  = detectConflicts(
      result,
      DAYS.slice(0, appState.workingDays),
      appState.periodsPerDay
    );
    appState.lockedSlots = {};
    appState.redoStack   = [];

    setLoadingProgress(100);
    await new Promise(r => setTimeout(r, 200));
    hideLoading();

    document.getElementById('outputSection').style.display = 'block';
    renderAllViews();

    const confMsg = appState.conflicts.length
      ? ` · ⚠ ${appState.conflicts.length} conflict(s)`
      : ' · No conflicts ✓';
    showToast('Timetable generated!' + confMsg, 'success', 4000);

    document.getElementById('outputSection')
      .scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    hideLoading();
    console.error(err);
    showToast('Generation failed. Check console.', 'error');
  }
});

/* ── SETTINGS SYNC ── */
['periodsPerDay','workingDays','maxHoursPerDay','lunchPeriod'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    appState.periodsPerDay  = parseInt(document.getElementById('periodsPerDay').value)  || 6;
    appState.workingDays    = parseInt(document.getElementById('workingDays').value)     || 6;
    appState.maxHoursPerDay = parseInt(document.getElementById('maxHoursPerDay').value)  || 4;
    appState.lunchPeriod    = parseInt(document.getElementById('lunchPeriod').value)     || 0;
    updateHoursCalc();
  });
});

/* ══════════════════════════════════════
   UNDO / REDO
══════════════════════════════════════ */
function pushHistory() {
  appState.history.push({
    timetables:  deepClone(appState.timetables),
    conflicts:   deepClone(appState.conflicts),
    lockedSlots: deepClone(appState.lockedSlots),
  });
  if (appState.history.length > 30) appState.history.shift();
}

function updateUndoRedo() {
  document.getElementById('undoBtn').disabled = appState.history.length === 0;
  document.getElementById('redoBtn').disabled = appState.redoStack.length === 0;
}

document.getElementById('undoBtn').addEventListener('click', () => {
  if (!appState.history.length) return;
  appState.redoStack.push({
    timetables:  deepClone(appState.timetables),
    conflicts:   deepClone(appState.conflicts),
    lockedSlots: deepClone(appState.lockedSlots),
  });
  const s = appState.history.pop();
  appState.timetables  = s.timetables;
  appState.conflicts   = s.conflicts;
  appState.lockedSlots = s.lockedSlots;
  updateUndoRedo();
  renderAllViews();
  showToast('Undo applied.', 'info');
});

document.getElementById('redoBtn').addEventListener('click', () => {
  if (!appState.redoStack.length) return;
  appState.history.push({
    timetables:  deepClone(appState.timetables),
    conflicts:   deepClone(appState.conflicts),
    lockedSlots: deepClone(appState.lockedSlots),
  });
  const s = appState.redoStack.pop();
  appState.timetables  = s.timetables;
  appState.conflicts   = s.conflicts;
  appState.lockedSlots = s.lockedSlots;
  updateUndoRedo();
  renderAllViews();
  showToast('Redo applied.', 'success');
});

document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    document.getElementById('undoBtn').click();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
    e.preventDefault();
    document.getElementById('redoBtn').click();
  }
});

/* ══════════════════════════════════════
   RENDER ENGINE
══════════════════════════════════════ */
function renderAllViews() {
  const days = DAYS.slice(0, appState.workingDays);
  renderConflicts();
  renderFreePeriodAlerts();
  renderLegend();
  renderWorkloadChart(days);
  renderClassView(days);
  renderTeacherView(days);
  renderAdminGrid(days);
  renderAnalytics(days);
  updateUndoRedo();
}

/* ── Conflict banner ── */
function renderConflicts() {
  const el = document.getElementById('conflictContainer');
  el.innerHTML = '';
  if (!appState.conflicts.length) return;

  const banner = document.createElement('div');
  banner.className = 'conflict-banner';
  banner.innerHTML =
    `<strong>⚠ ${appState.conflicts.length} Conflict(s) Detected</strong>`;

  appState.conflicts.forEach(c => {
    const item = document.createElement('div');
    item.className = 'conflict-item';
    item.innerHTML = `
      <span class="conflict-dot"></span>
      <span><strong>${c.teacher}</strong> double-booked —
        <strong>${c.day}</strong> Period <strong>${c.period}</strong>:
        ${c.class1} &amp; ${c.class2}</span>`;
    banner.appendChild(item);
  });
  el.appendChild(banner);
}

/* ── Free period alerts ── */
function renderFreePeriodAlerts() {
  const el        = document.getElementById('freePeriodAlerts');
  const threshold = 2;
  el.innerHTML    = '';
  const days      = DAYS.slice(0, appState.workingDays);
  const alerts    = [];

  Object.keys(appState.timetables).forEach(cls => {
    days.forEach(day => {
      const row = appState.timetables[cls][day];
      let streak = 0, max = 0;
      row.forEach(slot => {
        if (!slot) { streak++; max = Math.max(max, streak); }
        else streak = 0;
      });
      if (max >= threshold) alerts.push({ cls, day, streak: max });
    });
  });

  if (!alerts.length) return;
  const banner = document.createElement('div');
  banner.className = 'free-alert-banner';
  banner.innerHTML = `<strong>ℹ Free Period Alerts (${alerts.length})</strong>`;
  alerts.forEach(a => {
    const d = document.createElement('div');
    d.style.fontSize = '11.5px';
    d.textContent = `${a.cls} — ${a.day}: ${a.streak} consecutive free period(s)`;
    banner.appendChild(d);
  });
  el.appendChild(banner);
}

/* ── Legend ── */
function renderLegend() {
  const el = document.getElementById('subjectLegend');
  el.innerHTML = '';
  [...new Set(appState.assignments.map(a => a.subject))].forEach(sub => {
    const color = subjectColorMap[sub] || PALETTE[0];
    const chip  = document.createElement('span');
    chip.className = 'legend-chip';
    chip.style.cssText = `background:${color.bg};color:${color.fg};`;
    chip.textContent = sub;
    el.appendChild(chip);
  });
}

/* ── Workload chart ── */
function renderWorkloadChart(days) {
  const el = document.getElementById('workloadChart');
  el.innerHTML = '';

  const hours = {};
  Object.keys(appState.timetables).forEach(cls => {
    days.forEach(day => {
      appState.timetables[cls][day].forEach(slot => {
        if (slot && !slot.isLunch && slot.teacher) {
          hours[slot.teacher] = (hours[slot.teacher] || 0) + 1;
        }
      });
    });
  });
  if (!Object.keys(hours).length) return;

  const maxH       = Math.max(...Object.values(hours));
  const maxAllowed = days.length * appState.maxHoursPerDay;

  const card = document.createElement('div');
  card.className = 'workload-card';
  card.innerHTML =
    `<div class="section-title">📊 Teacher Workload — Periods This Week</div>`;

  const list = document.createElement('div');
  list.className = 'bar-list';

  Object.entries(hours).sort((a, b) => b[1] - a[1]).forEach(([teacher, h]) => {
    const pct    = Math.round((h / maxH) * 100);
    const capPct = Math.round((h / maxAllowed) * 100);
    const cls    = capPct >= 90 ? '' : capPct >= 55 ? 'fill-mid' : 'fill-low';
    const mySubjects = appState.assignments
      .filter(a => a.teacher === teacher)
      .map(a => a.subject).join(' · ');

    list.innerHTML += `
      <div class="bar-row">
        <div class="bar-label" title="${teacher}">${teacher}</div>
        <div class="bar-track">
          <div class="bar-fill ${cls}" style="width:${pct}%">${h} hrs</div>
        </div>
        <div class="bar-value">${h}/${maxAllowed}</div>
      </div>
      <div style="font-size:9.5px;color:var(--clr-gray-500);
        padding:0 0 8px 140px;margin-top:-3px;">
        ${mySubjects}
      </div>`;
  });

  card.appendChild(list);
  el.appendChild(card);
}

/* ── Slot chip builder ── */
function buildSlotChip(slot, cls, day, pIndex, enableDrag) {
  if (!slot) return `<span class="slot-empty">—</span>`;
  if (slot.isLunch) return `<span class="slot-lunch">🍱 Lunch</span>`;

  const color  = subjectColorMap[slot.subject] || PALETTE[0];
  const key    = slotKey(cls, day, pIndex);
  const locked = appState.lockedSlots[key];
  const isConf = appState.conflicts.some(
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

  const typeIcon = slot.type === 'lab'      ? ' 🔬'
                 : slot.type === 'tutorial' ? ' 📝' : '';

  return `
    <span class="slot-chip slot-animate ${locked ? 'locked' : ''}"
      style="background:${color.bg};color:${color.fg};"
      draggable="${enableDrag && !locked}"
      data-subject="${slot.subject}"
      data-teacher="${slot.teacher}"
      data-class="${cls}"
      data-day="${day}"
      data-period="${pIndex}">
      ${slot.subject}${typeIcon}
      <small>${slot.teacher}</small>
    </span>`;
}

/* ── Build timetable card ── */
function buildTTTable(className, days, enableDrag) {
  const periodsPerDay = appState.periodsPerDay;
  const tbl = appState.timetables[className];

  const card = document.createElement('div');
  card.className = 'tt-card';

  const countMap = {};
  days.forEach(day => {
    tbl[day].forEach(slot => {
      if (slot && !slot.isLunch) {
        countMap[slot.subject] = (countMap[slot.subject] || 0) + 1;
      }
    });
  });

  const summaryHTML = Object.entries(countMap)
    .map(([s, n]) => `<span class="tt-summary-chip">${s} × ${n}</span>`)
    .join('');

  card.innerHTML = `
    <div class="tt-card-header">
      <div class="tt-card-title">📋 ${className}</div>
      <div class="tt-summary">${summaryHTML}</div>
    </div>
    <div class="tt-table-wrap">
      <table class="tt-table">
        <thead>
          <tr>
            <th>Day</th>
            ${Array.from({ length: periodsPerDay }, (_, i) =>
              `<th>P${i + 1}</th>`
            ).join('')}
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>`;

  const tbody = card.querySelector('tbody');

  days.forEach(day => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="day-cell">${day}</td>`;

    for (let p = 0; p < periodsPerDay; p++) {
      const slot = tbl[day][p];
      const td   = document.createElement('td');
      td.innerHTML = buildSlotChip(slot, className, day, p, enableDrag);

      /* Edit mode click */
      if (appState.editMode && slot && !slot.isLunch) {
        const chip = td.querySelector('.slot-chip, .slot-conflict');
        if (chip) chip.addEventListener('click', () => openEditModal(className, day, p));
      }

      /* Lock mode click */
      if (appState.lockMode && slot && !slot.isLunch) {
        const chip = td.querySelector('.slot-chip');
        if (chip) {
          chip.addEventListener('click', e => {
            e.stopPropagation();
            const k = slotKey(className, day, p);
            if (appState.lockedSlots[k]) delete appState.lockedSlots[k];
            else appState.lockedSlots[k] = true;
            renderAllViews();
          });
        }
      }

      /* Drag source */
      if (enableDrag) {
        const chip = td.querySelector('[draggable="true"]');
        if (chip) {
          chip.addEventListener('dragstart', e => {
            e.dataTransfer.setData('text/plain',
              JSON.stringify({ cls: className, day, p })
            );
            chip.classList.add('dragging');
          });
          chip.addEventListener('dragend', () =>
            chip.classList.remove('dragging')
          );
        }

        td.addEventListener('dragover', e => {
          e.preventDefault();
          td.classList.add('drag-over');
        });
        td.addEventListener('dragleave', () =>
          td.classList.remove('drag-over')
        );
        td.addEventListener('drop', e => {
          e.preventDefault();
          td.classList.remove('drag-over');
          try {
            const from = JSON.parse(e.dataTransfer.getData('text/plain'));
            handleDrop(from, { cls: className, day, p });
          } catch (_) {}
        });
      }

      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  });

  return card;
}

/* ── Drag & drop handler ── */
function handleDrop(from, to) {
  if (appState.lockedSlots[slotKey(to.cls, to.day, to.p)]) {
    showToast('Target slot is locked.', 'warn'); return;
  }
  if (appState.lockedSlots[slotKey(from.cls, from.day, from.p)]) {
    showToast('Source slot is locked.', 'warn'); return;
  }

  const fromSlot = appState.timetables[from.cls][from.day][from.p];
  const toSlot   = appState.timetables[to.cls][to.day][to.p];

  if (fromSlot?.isLunch || toSlot?.isLunch) {
    showToast('Cannot move lunch slot.', 'warn'); return;
  }

  pushHistory();
  appState.timetables[from.cls][from.day][from.p] = toSlot;
  appState.timetables[to.cls][to.day][to.p]       = fromSlot;
  appState.conflicts = detectConflicts(
    appState.timetables,
    DAYS.slice(0, appState.workingDays),
    appState.periodsPerDay
  );
  appState.redoStack = [];
  renderAllViews();
  showToast('Slot swapped.', 'success');
}

/* ── Class View ── */
function renderClassView(days) {
  const container = document.getElementById('timetableContainer');
  container.innerHTML = '';
  appState.classes.forEach(cls => {
    if (!appState.timetables[cls]) return;
    container.appendChild(buildTTTable(cls, days, true));
  });
}

/* ── Teacher View ── */
function renderTeacherView(days) {
  const container     = document.getElementById('teacherViewContainer');
  const periodsPerDay = appState.periodsPerDay;
  container.innerHTML = '';

  appState.teachers.forEach(t => {
    const card = document.createElement('div');
    card.className = 'tt-card';
    card.innerHTML = `
      <div class="tt-card-header">
        <div class="tt-card-title">👨‍🏫 ${t.name}
          <span style="font-size:10px;font-weight:500;
            color:var(--clr-gray-500);margin-left:6px;">
            ${t.desig || 'Faculty'}
          </span>
        </div>
      </div>
      <div class="tt-table-wrap">
        <table class="tt-table">
          <thead>
            <tr>
              <th>Day</th>
              ${Array.from({ length: periodsPerDay }, (_, i) =>
                `<th>P${i + 1}</th>`
              ).join('')}
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>`;

    const tbody = card.querySelector('tbody');

    days.forEach(day => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="day-cell">${day}</td>`;

      for (let p = 0; p < periodsPerDay; p++) {
        const td = document.createElement('td');
        let found = null;

        Object.keys(appState.timetables).forEach(cls => {
          const slot = appState.timetables[cls][day][p];
          if (slot && !slot.isLunch && slot.teacher === t.name) {
            found = { ...slot, className: cls };
          }
        });

        if (found) {
          const color = subjectColorMap[found.subject] || PALETTE[0];
          td.innerHTML = `
            <span class="slot-chip slot-animate"
              style="background:${color.bg};color:${color.fg};">
              ${found.subject}
              <small>${found.className}</small>
            </span>`;
        } else {
          const tObj    = appState.teachers.find(x => x.name === t.name);
          const busySet = tObj?.busySlots?.[day] || [];
          const onLeave = tObj?.leaveDays?.includes(day);
          if (onLeave) {
            td.innerHTML = `<span class="slot-lunch" style="font-size:9.5px;">📅 Leave</span>`;
          } else if (busySet.includes(String(p + 1))) {
            td.innerHTML = `<span class="slot-lunch" style="font-size:9.5px;">🚫 Busy</span>`;
          } else {
            td.innerHTML = `<span class="slot-empty">—</span>`;
          }
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });

    container.appendChild(card);
  });
}

/* ── Admin Master Grid ── */
function renderAdminGrid(days) {
  const container     = document.getElementById('adminGridContainer');
  const periodsPerDay = appState.periodsPerDay;
  const classes       = appState.classes.filter(c => appState.timetables[c]);
  container.innerHTML = '';

  const heading = document.createElement('div');
  heading.style.cssText =
    'font-size:13px;font-weight:700;color:var(--clr-maroon);margin-bottom:14px;';
  heading.textContent =
    `🗂 Master Grid — ${classes.length} Classes · ${days.length} Days`;
  container.appendChild(heading);

  days.forEach(day => {
    const dayLabel = document.createElement('div');
    dayLabel.style.cssText = `
      font-weight:700;color:var(--clr-maroon);font-size:12px;
      margin:14px 0 6px;padding:6px 12px;
      background:var(--clr-maroon-xpale);
      border-radius:var(--radius-md);
      border-left:3px solid var(--clr-maroon);`;
    dayLabel.textContent = day;
    container.appendChild(dayLabel);

    const card = document.createElement('div');
    card.className = 'tt-card';
    card.innerHTML = `
      <div class="tt-table-wrap">
        <table class="tt-table">
          <thead>
            <tr>
              <th>Class</th>
              ${Array.from({ length: periodsPerDay }, (_, i) =>
                `<th>P${i + 1}</th>`
              ).join('')}
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>`;

    const tbody = card.querySelector('tbody');

    classes.forEach(cls => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="day-cell">${cls}</td>`;

      for (let p = 0; p < periodsPerDay; p++) {
        const td   = document.createElement('td');
        const slot = appState.timetables[cls][day][p];

        if (slot && slot.isLunch) {
          td.innerHTML = `<span class="slot-lunch" style="font-size:9px;">🍱</span>`;
        } else if (slot) {
          const color = subjectColorMap[slot.subject] || PALETTE[0];
          td.innerHTML = `
            <span class="slot-chip"
              style="background:${color.bg};color:${color.fg};
                font-size:9.5px;padding:3px 4px;">
              ${slot.subject}
              <small style="font-size:8.5px;">${slot.teacher}</small>
            </span>`;
        } else {
          td.innerHTML = `<span class="slot-empty">—</span>`;
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });

    container.appendChild(card);
  });
}

/* ── Analytics ── */
function renderAnalytics(days) {
  const container     = document.getElementById('analyticsContainer');
  const periodsPerDay = appState.periodsPerDay;
  const classes       = appState.classes.filter(c => appState.timetables[c]);
  container.innerHTML = '';

  let totalSlots = 0, totalFilled = 0, totalFree = 0;
  const dayLoad  = {};
  days.forEach(d => { dayLoad[d] = 0; });

  classes.forEach(cls => {
    days.forEach(day => {
      for (let p = 0; p < periodsPerDay; p++) {
        const slot = appState.timetables[cls][day][p];
        if (slot?.isLunch) continue;
        totalSlots++;
        if (slot) { totalFilled++; dayLoad[day]++; }
        else totalFree++;
      }
    });
  });

  const coveragePct = totalSlots
    ? Math.round((totalFilled / totalSlots) * 100) : 0;
  const busiestDay  = Object.entries(dayLoad)
    .sort((a, b) => b[1] - a[1])[0] || ['—', 0];

  /* Stat cards */
  const grid = document.createElement('div');
  grid.className = 'analytics-grid';
  [
    { num: totalFree,              label: 'Free periods',       sub: 'across all classes this week' },
    { num: `${coveragePct}%`,      label: 'Schedule coverage',  sub: 'of available slots filled' },
    { num: busiestDay[0],          label: 'Busiest day',        sub: `${busiestDay[1]} period(s) scheduled` },
    { num: appState.conflicts.length, label: 'Conflicts',       sub: appState.conflicts.length ? '⚠ needs attention' : 'All clear ✓' },
  ].forEach(({ num, label, sub }) => {
    grid.innerHTML += `
      <div class="stat-card">
        <div class="stat-number">${num}</div>
        <div class="stat-label">${label}</div>
        <div class="stat-sub">${sub}</div>
      </div>`;
  });
  container.appendChild(grid);

  /* Subject coverage */
  const covTitle = document.createElement('div');
  covTitle.className = 'analytics-section-title';
  covTitle.textContent = '📚 Subject Coverage (actual vs planned periods/week)';
  container.appendChild(covTitle);

  const planned = {}, actual = {};
  appState.assignments.forEach(a => {
    a.classes.forEach(cls => {
      const key = `${a.subject} — ${cls}`;
      planned[key] = hoursToPeriodsPerWeek(a.hoursPerSemester, appState.workingDays);
      actual[key]  = 0;
    });
  });

  classes.forEach(cls => {
    days.forEach(day => {
      for (let p = 0; p < periodsPerDay; p++) {
        const slot = appState.timetables[cls][day][p];
        if (slot && !slot.isLunch) {
          const key = `${slot.subject} — ${cls}`;
          if (actual[key] !== undefined) actual[key]++;
        }
      }
    });
  });

  const covWrap = document.createElement('div');
  Object.entries(planned).forEach(([key, plan]) => {
    const act  = actual[key] || 0;
    const pct  = Math.min(Math.round((act / plan) * 100), 100);
    const fill = pct >= 80 ? 'fill-good' : pct >= 50 ? 'fill-mid' : 'fill-low';
    covWrap.innerHTML += `
      <div class="coverage-row">
        <div class="coverage-label" title="${key}">${key}</div>
        <div class="coverage-track">
          <div class="coverage-fill ${fill}" style="width:${pct}%">
            ${act}/${plan}
          </div>
        </div>
      </div>`;
  });
  container.appendChild(covWrap);

  /* Day load chart */
  const dayTitle = document.createElement('div');
  dayTitle.className = 'analytics-section-title';
  dayTitle.textContent = '📅 Periods Scheduled Per Day';
  container.appendChild(dayTitle);

  const maxLoad = Math.max(...Object.values(dayLoad), 1);
  const dayCard = document.createElement('div');
  dayCard.className = 'workload-card';
  const dayWrap = document.createElement('div');
  dayWrap.className = 'bar-list';

  Object.entries(dayLoad).forEach(([day, load]) => {
    const pct  = Math.round((load / maxLoad) * 100);
    const fill = pct >= 85 ? '' : pct >= 50 ? 'fill-mid' : 'fill-low';
    dayWrap.innerHTML += `
      <div class="bar-row">
        <div class="bar-label">${day}</div>
        <div class="bar-track">
          <div class="bar-fill ${fill}" style="width:${pct}%">${load}</div>
        </div>
        <div class="bar-value">${load}</div>
      </div>`;
  });

  dayCard.appendChild(dayWrap);
  container.appendChild(dayCard);
}

/* ══════════════════════════════════════
   EDIT SLOT MODAL
══════════════════════════════════════ */
function openEditModal(cls, day, pIndex) {
  _editTarget = { cls, day, pIndex };
  const slot  = appState.timetables[cls][day][pIndex];

  document.getElementById('editSlotInfo').innerHTML = `
    <strong>${cls}</strong> · ${day} · Period ${pIndex + 1}
    ${slot
      ? `<br><span style="color:var(--clr-gray-500);">
          Current: ${slot.subject} — ${slot.teacher}
        </span>`
      : '<br><span style="color:var(--clr-gray-500);">Currently empty</span>'}`;

  const subSel = document.getElementById('editSubjectSelect');
  subSel.innerHTML = '<option value="">— Empty slot —</option>';
  [...new Set(appState.assignments.map(a => a.subject))].forEach(s => {
    subSel.innerHTML +=
      `<option value="${s}"${slot?.subject===s?' selected':''}>${s}</option>`;
  });

  populateEditTeachers(slot?.subject || '', slot?.teacher || '');

  /* Remove old listeners by cloning */
  const newSubSel = subSel.cloneNode(true);
  subSel.parentNode.replaceChild(newSubSel, subSel);
  newSubSel.addEventListener('change', () => {
    populateEditTeachers(newSubSel.value, '');
    showSubstituteSuggestions(cls, day, pIndex, newSubSel.value);
  });

  showSubstituteSuggestions(cls, day, pIndex, slot?.subject || '');
  document.getElementById('editModal').style.display = 'flex';
}

function populateEditTeachers(subject, currentTeacher) {
  const sel = document.getElementById('editTeacherSelect');
  sel.innerHTML = '<option value="">— Select Teacher —</option>';
  const relevant = [...new Set(
    appState.assignments
      .filter(a => !subject || a.subject === subject)
      .map(a => a.teacher)
  )];
  const list = relevant.length ? relevant : appState.teachers.map(t => t.name);
  list.forEach(name => {
    sel.innerHTML +=
      `<option value="${name}"${name===currentTeacher?' selected':''}>${name}</option>`;
  });
}

function showSubstituteSuggestions(cls, day, pIndex, subject) {
  const box    = document.getElementById('subSuggestion');
  const listEl = document.getElementById('subSuggestionList');
  listEl.innerHTML = '';
  if (!subject) { box.style.display = 'none'; return; }

  const busyMap    = buildBusyMap();
  const candidates = [...new Set(
    appState.assignments.filter(a => a.subject === subject).map(a => a.teacher)
  )];

  const available = candidates.filter(teacher => {
    const busy = busyMap[teacher]?.[day] || new Set();
    if (busy.has(String(pIndex + 1))) return false;
    let clash = false;
    Object.keys(appState.timetables).forEach(c => {
      if (c === cls) return;
      const slot = appState.timetables[c][day][pIndex];
      if (slot && !slot.isLunch && slot.teacher === teacher) clash = true;
    });
    return !clash;
  });

  if (!available.length) { box.style.display = 'none'; return; }

  box.style.display = 'block';
  available.forEach(name => {
    const chip = document.createElement('span');
    chip.className = 'sub-chip';
    chip.textContent = name;
    chip.addEventListener('click', () => {
      document.getElementById('editTeacherSelect').value = name;
    });
    listEl.appendChild(chip);
  });
}

document.getElementById('closeEditModal').addEventListener('click', () => {
  document.getElementById('editModal').style.display = 'none';
  _editTarget = null;
});

document.getElementById('editClearSlot').addEventListener('click', () => {
  if (!_editTarget) return;
  const { cls, day, pIndex } = _editTarget;
  pushHistory();
  appState.timetables[cls][day][pIndex] = null;
  appState.conflicts = detectConflicts(
    appState.timetables,
    DAYS.slice(0, appState.workingDays),
    appState.periodsPerDay
  );
  appState.redoStack = [];
  renderAllViews();
  document.getElementById('editModal').style.display = 'none';
  _editTarget = null;
  showToast('Slot cleared.', 'info');
});

document.getElementById('editSaveSlot').addEventListener('click', () => {
  if (!_editTarget) return;
  const { cls, day, pIndex } = _editTarget;
  const subject = document.getElementById('editSubjectSelect').value;
  const teacher = document.getElementById('editTeacherSelect').value;

  if (subject && !teacher) {
    showToast('Select a teacher.', 'warn'); return;
  }

  pushHistory();
  if (!subject) {
    appState.timetables[cls][day][pIndex] = null;
  } else {
    const asgn = appState.assignments.find(
      a => a.subject === subject && a.teacher === teacher
    );
    appState.timetables[cls][day][pIndex] = {
      subject, teacher,
      type:    asgn?.type || 'theory',
      isLunch: false,
    };
  }

  appState.conflicts = detectConflicts(
    appState.timetables,
    DAYS.slice(0, appState.workingDays),
    appState.periodsPerDay
  );
  appState.redoStack = [];
  renderAllViews();
  document.getElementById('editModal').style.display = 'none';
  _editTarget = null;
  showToast('Slot updated.', 'success');
});

/* ══════════════════════════════════════
   SEARCH & HIGHLIGHT
══════════════════════════════════════ */
document.getElementById('searchInput').addEventListener('input',  applySearch);
document.getElementById('searchType').addEventListener('change', applySearch);
document.getElementById('clearSearch').addEventListener('click',  () => {
  document.getElementById('searchInput').value = '';
  applySearch();
});

function applySearch() {
  const query = document.getElementById('searchInput').value.toLowerCase().trim();
  const type  = document.getElementById('searchType').value;

  document.querySelectorAll('.slot-chip, .slot-conflict').forEach(span => {
    const subject = (span.dataset.subject || '').toLowerCase();
    const teacher = (span.dataset.teacher || '').toLowerCase();
    let match = false;
    if (!query)            match = true;
    else if (type==='all') match = subject.includes(query) || teacher.includes(query);
    else if (type==='teacher') match = teacher.includes(query);
    else if (type==='subject') match = subject.includes(query);
    span.classList.toggle('slot-highlight', match && !!query);
    span.classList.toggle('slot-dimmed',    !match && !!query);
  });
}

/* ══════════════════════════════════════
   OUTPUT TABS
══════════════════════════════════════ */
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).style.display = 'block';
  });
});

/* ══════════════════════════════════════
   EDIT / LOCK TOGGLES
══════════════════════════════════════ */
document.getElementById('editModeToggle').addEventListener('change', e => {
  appState.editMode = e.target.checked;
  if (appState.editMode) {
    appState.lockMode = false;
    document.getElementById('lockToggle').checked = false;
    showToast('Edit mode ON — click any slot to edit.', 'info');
  }
  renderAllViews();
});

document.getElementById('lockToggle').addEventListener('change', e => {
  appState.lockMode = e.target.checked;
  if (appState.lockMode) {
    appState.editMode = false;
    document.getElementById('editModeToggle').checked = false;
    showToast('Lock mode ON — click slots to lock/unlock.', 'info');
  }
  renderAllViews();
});

/* ══════════════════════════════════════
   PRINT
══════════════════════════════════════ */
document.getElementById('printBtn').addEventListener('click', () => window.print());

/* ══════════════════════════════════════
   PDF EXPORT
══════════════════════════════════════ */
document.getElementById('downloadPDF').addEventListener('click', () => {
  if (!Object.keys(appState.timetables).length) {
    showToast('Generate a timetable first.', 'warn'); return;
  }

  const { jsPDF }     = window.jspdf;
  const doc           = new jsPDF('landscape', 'mm', 'a4');
  const days          = DAYS.slice(0, appState.workingDays);
  const periodsPerDay = appState.periodsPerDay;
  let   isFirst       = true;

  appState.classes.forEach(className => {
    if (!appState.timetables[className]) return;
    if (!isFirst) doc.addPage();
    isFirst = false;

    doc.setFontSize(16);
    doc.setTextColor(107, 15, 26);
    doc.text(`NM-Scheduler Pro — ${className}`, 14, 16);

    doc.setFontSize(8);
    doc.setTextColor(120, 80, 80);
    doc.text(
      `SVKM's NMIMS University · ${new Date().toLocaleDateString()} · Anoushka Sarkar`,
      14, 22
    );

    const clsConflicts = appState.conflicts.filter(
      c => c.class1 === className || c.class2 === className
    );
    if (clsConflicts.length) {
      doc.setFontSize(7);
      doc.setTextColor(180, 0, 0);
      doc.text(`⚠ ${clsConflicts.length} conflict(s)`, 14, 27);
    }

    const headers = ['Day',
      ...Array.from({ length: periodsPerDay }, (_, i) => `Period ${i + 1}`)
    ];
    const body = days.map(day => [
      day,
      ...Array.from({ length: periodsPerDay }, (_, p) => {
        const slot = appState.timetables[className][day][p];
        if (!slot)        return '—';
        if (slot.isLunch) return '🍱 Lunch';
        return `${slot.subject}\n${slot.teacher}`;
      })
    ]);

    doc.autoTable({
      head: [headers], body,
      startY: clsConflicts.length ? 31 : 28,
      theme: 'grid',
      styles: { fontSize:8, cellPadding:3, valign:'middle', halign:'center' },
      headStyles: { fillColor:[107,15,26], textColor:255, fontStyle:'bold' },
      columnStyles: { 0: { fillColor:[253,244,245], textColor:[28,24,22], fontStyle:'bold', halign:'left' } },
      alternateRowStyles: { fillColor:[247,246,245] },
      didParseCell: data => {
        if (data.section === 'body' && data.column.index > 0) {
          const val = data.cell.raw;
          if (val === '🍱 Lunch') {
            data.cell.styles.fillColor = [254,243,205];
            data.cell.styles.textColor = [122,79,0];
          } else if (val && val !== '—') {
            data.cell.styles.fillColor = [219,234,254];
            data.cell.styles.textColor = [29,63,138];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });
  });

  /* Teacher summary page */
  doc.addPage();
  doc.setFontSize(14);
  doc.setTextColor(107, 15, 26);
  doc.text('Teacher Workload Summary', 14, 16);

  const hours = {};
  appState.classes.forEach(cls => {
    if (!appState.timetables[cls]) return;
    days.forEach(day => {
      appState.timetables[cls][day].forEach(slot => {
        if (slot && !slot.isLunch && slot.teacher) {
          hours[slot.teacher] = (hours[slot.teacher] || 0) + 1;
        }
      });
    });
  });

  doc.autoTable({
    head: [['Teacher','Subjects','Assigned','Capacity']],
    body: Object.entries(hours).sort((a,b)=>b[1]-a[1]).map(([name, h]) => [
      name,
      appState.assignments.filter(a=>a.teacher===name).map(a=>a.subject).join(', '),
      `${h} periods`,
      `${days.length * appState.maxHoursPerDay} max`
    ]),
    startY: 22, theme: 'striped',
    styles: { fontSize:9, cellPadding:4 },
    headStyles: { fillColor:[107,15,26], textColor:255, fontStyle:'bold' },
  });

  /* Conflict page */
  if (appState.conflicts.length) {
    doc.addPage();
    doc.setFontSize(14);
    doc.setTextColor(180, 0, 0);
    doc.text('Conflict Report', 14, 16);
    doc.autoTable({
      head: [['Teacher','Day','Period','Class A','Class B']],
      body: appState.conflicts.map(c => [c.teacher, c.day, `P${c.period}`, c.class1, c.class2]),
      startY: 22, theme: 'grid',
      styles: { fontSize:9 },
      headStyles: { fillColor:[180,0,0], textColor:255 },
    });
  }

  doc.save('NM-Scheduler-Pro-Timetable.pdf');
  showToast('PDF exported successfully.', 'success');
});

/* ══════════════════════════════════════
   MODAL BACKDROP CLOSE
══════════════════════════════════════ */
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.style.display = 'none';
  });
});

/* ══════════════════════════════════════
   INIT
══════════════════════════════════════ */
function init() {
  startClock();
  setupDropZone('dropSubjectCSV', 'subjectCSVFile', 'subjectCSVStatus');
  setupDropZone('dropTeacherCSV', 'teacherCSVFile', 'teacherCSVStatus');
  updateGenerateBtn();
  updateClassPreview();

  appState.periodsPerDay  = parseInt(document.getElementById('periodsPerDay').value)  || 6;
  appState.workingDays    = parseInt(document.getElementById('workingDays').value)     || 6;
  appState.maxHoursPerDay = parseInt(document.getElementById('maxHoursPerDay').value)  || 4;
  appState.lunchPeriod    = parseInt(document.getElementById('lunchPeriod').value)     || 0;

  console.log('NM-Scheduler Pro v3.0 — Ready ✓');
}

document.addEventListener('DOMContentLoaded', init);