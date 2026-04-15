# NM-Scheduler Pro 📅

> **Intelligent B.Tech Timetable Generation System**
> SVKM's NMIMS University — School of Technology

![Version](https://img.shields.io/badge/version-3.0-maroon)
![Status](https://img.shields.io/badge/status-active-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Built With](https://img.shields.io/badge/built%20with-Vanilla%20JS%20%7C%20HTML%20%7C%20CSS-orange)

---

## 📌 Overview

**NM-Scheduler Pro** is a fully client-side, browser-based academic
timetable generator built specifically for B.Tech departments at
NMIMS University. It uses classical **Data Structures & Algorithms**
to generate conflict-free, optimally distributed timetables for
multiple classes, teachers, and subjects — all without a backend or
database.

---

## ✨ Features

### Core Scheduling
| Feature | Description |
|---|---|
| Multi-class support | Generate timetables for all B.Tech divisions simultaneously |
| Multi-subject per teacher | One teacher can teach 2–3 subjects across different years |
| Multi-class per subject | Same subject taught to multiple divisions (CSDS-A, CSDS-B) |
| Semester hour system | Input total semester hours (15 / 30 / 45 / 60) — system computes weekly distribution |
| Lunch break | Configurable lunch period blocked across all classes |
| Period timings | Custom or auto-filled start/end times for each period |

### Algorithm Engine (DSA)
| Algorithm | Usage |
|---|---|
| **Hash Map** | O(1) teacher availability lookup per day/period |
| **Priority Queue** | High-demand subjects scheduled first |
| **Binary Search** | O(log n) free slot detection per teacher per day |
| **Graph Coloring** | Teacher double-booking conflict detection across classes |
| **Greedy Algorithm** | Slot assignment with constraint satisfaction |
| **Dynamic Programming** | Even distribution of subject hours across working days |

### Views & Navigation
- **5-step wizard UI** — Setup → Teachers → Subjects → Generate → Review
- **Class View** — Full weekly timetable per class division
- **Teacher View** — Per-teacher schedule with subject + class breakdown
- **Master Grid** — All classes side-by-side per day
- **Analytics** — Coverage %, workload bars, conflict summary, day-load

### Edit & Management
- **Manual Edit Mode** — Click any slot to reassign subject/teacher
- **Substitute Teacher Suggestions** — Auto-suggests available teachers
- **Drag & Drop Swap** — Drag any slot to another period/day
- **Undo / Redo** — Full history stack (Ctrl+Z / Ctrl+Y)
- **Slot Locking** — Lock filled slots to prevent accidental changes
- **Free Period Alerts** — Flags classes with N+ consecutive gaps
- **Teacher Leave** — Mark full-day absences before generation

### Import & Export
- **CSV / XLSX Import** — Upload subject requirements + teacher availability
- **Template Download** — Pre-formatted CSV templates included
- **PDF Export** — Multi-page PDF with per-class timetables,
  subject legend, conflict notes, teacher summary page
- **Print View** — Clean print stylesheet

---

## 🗂 Project Structure

```
nm-scheduler/
├── index.html          # Main app shell — 5-step wizard layout
├── style.css           # Complete flat-design stylesheet (dark/light)
├── script.js           # All logic — DSA engine + UI rendering
├── nmims-logo.png      # University logo (replace with actual)
├── sample-data/
│   ├── subject_requirements_template.csv
│   └── teacher_availability_template.csv
└── README.md
```

---

## 📋 CSV Format

### `subject_requirements.csv`
```csv
Class,Subject,Teacher,HoursPerSemester,Type
3rd Year CSDS-A,ADSA,Prof. Wasiha,45,theory
3rd Year CSDS-A,RM,Prof. Wani,30,theory
3rd Year CSDS-B,ADSA,Prof. Wasiha,45,theory
2nd Year CSDS-A,DBMS,Prof. Wasiha,45,theory
1st Year CE-A,Web Dev,Prof. Wasiha,30,theory
```

**Columns:**
| Column | Description | Example |
|---|---|---|
| `Class` | Division name | `3rd Year CSDS-A` |
| `Subject` | Subject code/name | `ADSA`, `DBMS` |
| `Teacher` | Exact teacher name | `Prof. Wasiha` |
| `HoursPerSemester` | Total contact hours | `15`, `30`, `45`, `60` |
| `Type` | `theory`, `lab`, `tutorial` | `theory` |

### `teacher_availability.csv`
```csv
Teacher,Day,Period
Prof. Nikita,Saturday,1
Prof. Wasiha,Saturday,4
Dr. Rahul,Wednesday,1
```

**Columns:**
| Column | Description | Example |
|---|---|---|
| `Teacher` | Must match subject CSV | `Prof. Wasiha` |
| `Day` | Full day name | `Monday`–`Saturday` |
| `Period` | Period number (1-based) | `1`–`6` |

> Rows represent **busy/unavailable** slots — the scheduler skips these.

---

## 🚀 Getting Started

### Option 1 — Direct Browser
```bash
# Clone the repository
git clone https://github.com/your-username/nm-scheduler.git
cd nm-scheduler

# Open in browser (no server needed)
open index.html
# or just double-click index.html
```

### Option 2 — Local Server
```bash
# Python
python -m http.server 8080

# Node.js
npx serve .

# Then open
http://localhost:8080
```

### Option 3 — Demo Mode
```
http://localhost:8080/index.html?demo
```
Loads pre-filled sample data for CSDS 1st/2nd/3rd year + CE 1st year.

---

## 🧑‍💻 How to Use

### Step 1 — Department Setup
- Enter department name, academic year, semester
- Set periods per day, working days, max teacher hours, lunch break
- Configure period timings (or auto-fill from 9:00 AM)
- Add all class divisions (e.g., `3rd Year CSDS-A`, `3rd Year CSDS-B`)

### Step 2 — Add Teachers
- Add each faculty member with designation
- Click cells in the **busy-slot grid** to mark unavailable periods
- Mark full-day leave / absence days

### Step 3 — Subject Assignments
- Enter subject name, type (theory/lab/tutorial)
- Select the assigned teacher
- Enter total semester hours (15/30/45/60)
- Select one or more classes (e.g., both CSDS-A and CSDS-B)
- **OR** import from CSV using the upload zones

### Step 4 — Generate
- Click **Generate Timetable ⚡**
- Watch the loading bar as DSA algorithms run
- Review conflicts (if any) in the red banner

### Step 5 — Review & Export
- Switch between **Class / Teacher / Master Grid /
