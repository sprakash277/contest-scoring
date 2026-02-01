# Sanskriti RKT 2026 - Contest Scoring System

A simple, self-contained web app for managing contest scores and results for **Sanskriti RKT 2026** event.

## Contests

- **IQ Quiz Contest** — `/iq`
- **Sanskriti Contest** — `/sanskriti`
- **Maths Quiz Contest** — `/maths`
- **Sudoku Contest** — `/sudoku`

## How to run

Open `index.html` in a browser (double-click or use a local server). Data is stored in the browser's `localStorage`.

To serve over HTTP (optional):

```bash
# Python 3
python3 -m http.server 8000

# Then open http://localhost:8000/contest-scoring/
```

## Features

- **Contest names**  
  Contests are shown in **ascending order by name** (e.g. IQ Quiz Contest, Maths Quiz Contest, Sanskriti Contest, Sudoku Contest).

- **Contest screens**  
  Each contest has its own URL. Use **Add Names** to add a contestant; the form opens with the contest name prefilled. Contestants are displayed **grouped by Age Group** (Group 1, Group 2, Group 3, Group 4). Within each group, a table shows: Contestant name, Score, Total Time Taken. Each row can be **edited once** via the Edit button (then Save or Cancel).  
  - **Search by contestant name**: A search input filters contestants by name in real-time.

- **Add contestant**  
  Fields: Contest Name (read-only, prefilled), Contestant name, **Age Group** (dropdown: Group 1, Group 2, Group 3, Group 4), Score, Total Time Taken. Score is capped at 20. Submit returns you to that contest's screen.

- **Admin login** (`/login`)  
  Only logged-in admins can open the **Results** page. Use **Admin Login** in the header; default credentials: **admin** / **admin**. After login, the header shows **Home**, **Results**, **Reset All**, **Restore**, and **Logout**.

- **Admin: Reset All Data and Restore**  
  - **Reset All** button (header, admin only): Clears all contestant data and saves a backup (keeps last 2 backups).
  - **Restore** button (header, admin only): Shows a dialog with available backups (up to 2, each with timestamp); click to restore that snapshot.

- **Results** (`/results`, admin only)  
  - **Contest dropdown**: Choose one contest; results are shown for that contest. All contests are always listed.  
  - **Search by contestant name**: Filter the displayed results by contestant name within the selected contest; if blank, all contestants are shown.  
  - **Export**: Export the selected contest's results as **CSV**, **PDF**, **XLS**, or **GSheet**. **Exports all rows** for the selected contest regardless of any search filter.  
  - Score is capped at 20; results are **grouped by Age Group**; within each group, ranking is by **score** (higher first).  
  - **Time > 21 minutes** is treated as over time: those contestants are ranked **last** within that group (among themselves by score).  
  - Maximum allowed time is 20 minutes.

## Files

- `index.html` — Single page shell
- `styles.css` — Layout and theme
- `app.js` — Routing, storage, forms, ranking logic

No build step or server required; all logic runs in the browser.
