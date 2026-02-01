(function () {
  'use strict';

  const STORAGE_KEY = 'contest-scoring-data';
  const MAX_SCORE = 20;
  const MAX_TIME_MINUTES = 20;
  const OVER_TIME_THRESHOLD = 23;  // time > 23 min ranked after time <= 23 min

  var useServer = false;
  var serverStore = null;

  const CONTESTS = [
    { id: 'iq', name: 'IQ Quiz Contest', path: '/iq' },
    { id: 'sanskriti', name: 'Sanskriti Contest', path: '/sanskriti' },
    { id: 'maths', name: 'Maths Quiz Contest', path: '/maths' },
    { id: 'sudoku', name: 'Sudoku Contest', path: '/sudoku' }
  ];

  const AUTH_STORAGE_KEY = 'contest-scoring-admin';
  const ADMIN_USER = 'admin';
  const ADMIN_PASS = 'admin';
  const BACKUP_KEY_PREFIX = 'contest-scoring-backup-';
  const MAX_BACKUPS = 2;

  const AGE_GROUPS = [
    { value: 'Group 1', label: 'Group 1: 5-7 Yrs' },
    { value: 'Group 2', label: 'Group 2: 8-10 Yrs' },
    { value: 'Group 3', label: 'Group 3: 11-14 Yrs' },
    { value: 'Group 4', label: 'Group 4: 15-18 Yrs' }
  ];
  function getAgeGroupLabel(value) {
    var g = AGE_GROUPS.find(function (x) { return x.value === value; });
    return g ? g.label : value;
  }

  function getContestsSortedByName() {
    return CONTESTS.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  function getContestById(id) {
    return CONTESTS.find(function (c) { return c.id === id; }) || null;
  }

  function getContestByPath(path) {
    var normalized = path.replace(/^\//, '').toLowerCase();
    return CONTESTS.find(function (c) { return c.path.slice(1) === normalized; }) || null;
  }

  function loadData() {
    if (useServer && serverStore && serverStore.data) {
      var data = {};
      CONTESTS.forEach(function (c) {
        data[c.id] = Array.isArray(serverStore.data[c.id]) ? serverStore.data[c.id].slice() : [];
      });
      return data;
    }
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      var data = raw ? JSON.parse(raw) : {};
      CONTESTS.forEach(function (c) {
        if (!Array.isArray(data[c.id])) data[c.id] = [];
      });
      return data;
    } catch (e) {
      return CONTESTS.reduce(function (acc, c) { acc[c.id] = []; return acc; }, {});
    }
  }

  function saveData(data) {
    if (useServer && serverStore) {
      serverStore.data = data;
      fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(serverStore) }).catch(function () {});
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function saveBackup() {
    var currentData = loadData();
    var timestamp = Date.now();
    var backup = { timestamp: timestamp, data: currentData };
    if (useServer && serverStore) {
      serverStore.backup2 = serverStore.backup1;
      serverStore.backup1 = backup;
      fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(serverStore) }).catch(function () {});
      return;
    }
    var backup1 = localStorage.getItem(BACKUP_KEY_PREFIX + '1');
    if (backup1) localStorage.setItem(BACKUP_KEY_PREFIX + '2', backup1);
    localStorage.setItem(BACKUP_KEY_PREFIX + '1', JSON.stringify(backup));
  }

  function getBackups() {
    if (useServer && serverStore) {
      var backups = [];
      [1, 2].forEach(function (i) {
        var b = serverStore['backup' + i];
        if (b) backups.push({ slot: i, timestamp: b.timestamp, data: b.data });
      });
      return backups;
    }
    var backups = [];
    for (var i = 1; i <= MAX_BACKUPS; i++) {
      var raw = localStorage.getItem(BACKUP_KEY_PREFIX + i);
      if (raw) {
        try {
          var backup = JSON.parse(raw);
          backups.push({ slot: i, timestamp: backup.timestamp, data: backup.data });
        } catch (e) {}
      }
    }
    return backups;
  }

  function restoreFromBackup(slot) {
    if (useServer && serverStore) {
      var b = serverStore['backup' + slot];
      if (!b || !b.data) return false;
      serverStore.data = b.data;
      fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(serverStore) }).catch(function () {});
      return true;
    }
    var raw = localStorage.getItem(BACKUP_KEY_PREFIX + slot);
    if (!raw) return false;
    try {
      var backup = JSON.parse(raw);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(backup.data));
      return true;
    } catch (e) {
      return false;
    }
  }

  function resetAllData() {
    saveBackup();
    var emptyData = CONTESTS.reduce(function (acc, c) { acc[c.id] = []; return acc; }, {});
    saveData(emptyData);
  }

  function addContestant(contestId, record) {
    var id = 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    var entry = {
      id: id,
      contestName: record.contestName,
      contestantName: String(record.contestantName).trim(),
      ageGroup: String(record.ageGroup).trim(),
      score: Math.min(MAX_SCORE, Math.max(0, Number(record.score) || 0)),
      totalTimeMinutes: Math.max(0, Number(record.totalTimeMinutes) || 0)
    };
    if (useServer && serverStore) {
      fetch('/api/contestant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contestId: contestId, entry: entry })
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (res && res.store) serverStore = res.store;
      }).catch(function () {});
      serverStore.data[contestId] = serverStore.data[contestId] || [];
      serverStore.data[contestId].push(entry);
      return entry;
    }
    var data = loadData();
    data[contestId].push(entry);
    saveData(data);
    return entry;
  }

  function updateContestant(contestId, id, updates) {
    var data = loadData();
    var list = data[contestId] || [];
    var idx = list.findIndex(function (r) { return r.id === id; });
    if (idx === -1) return null;
    var entry = list[idx];
    if (updates.contestantName !== undefined) entry.contestantName = String(updates.contestantName).trim();
    if (updates.ageGroup !== undefined) entry.ageGroup = String(updates.ageGroup).trim();
    if (updates.score !== undefined) entry.score = Math.min(MAX_SCORE, Math.max(0, Number(updates.score) || 0));
    if (updates.totalTimeMinutes !== undefined) entry.totalTimeMinutes = Math.max(0, Number(updates.totalTimeMinutes) || 0);
    list[idx] = entry;
    saveData(data);
    return entry;
  }

  function parseRoute() {
    var hash = window.location.hash.slice(1) || '/';
    var q = hash.indexOf('?');
    var path = q >= 0 ? hash.slice(0, q) : hash;
    var search = q >= 0 ? hash.slice(q + 1) : '';
    path = path || '/';
    var params = {};
    search.split('&').forEach(function (pair) {
      var eq = pair.indexOf('=');
      if (eq >= 0) params[decodeURIComponent(pair.slice(0, eq))] = decodeURIComponent(pair.slice(eq + 1));
    });
    return { path: path, params: params };
  }

  function isAdminLoggedIn() {
    return sessionStorage.getItem(AUTH_STORAGE_KEY) === '1';
  }

  function setAdminLoggedIn(value) {
    if (value) sessionStorage.setItem(AUTH_STORAGE_KEY, '1');
    else sessionStorage.removeItem(AUTH_STORAGE_KEY);
  }

  function updateHeaderNav() {
    var nav = document.getElementById('header-nav');
    if (!nav) return;
    if (isAdminLoggedIn()) {
      nav.innerHTML = '<a href="#/">Home</a> <a href="#/results">Results</a> ' +
        '<button type="button" class="header-btn reset-header-btn" id="reset-header-btn">Reset All</button> ' +
        '<button type="button" class="header-btn restore-header-btn" id="restore-header-btn">Restore</button> ' +
        '<a href="#/" id="logout-link">Logout</a>';
      var logoutLink = document.getElementById('logout-link');
      if (logoutLink) logoutLink.addEventListener('click', function (e) { e.preventDefault(); setAdminLoggedIn(false); window.location.hash = '/'; updateHeaderNav(); });
      var resetHeaderBtn = document.getElementById('reset-header-btn');
      var restoreHeaderBtn = document.getElementById('restore-header-btn');
      if (resetHeaderBtn) {
        resetHeaderBtn.addEventListener('click', function () {
          if (confirm('Reset all data? This will create a backup and clear all contestants.')) {
            resetAllData();
            alert('All data reset. A backup has been saved.');
            window.location.reload();
          }
        });
      }
      if (restoreHeaderBtn) {
        restoreHeaderBtn.addEventListener('click', function () {
          showRestoreDialog();
        });
      }
    } else {
      nav.innerHTML = '<a href="#/login">Admin Login</a>';
    }
  }

  function showRestoreDialog() {
    var backups = getBackups();
    if (backups.length === 0) {
      alert('No backups available.');
      return;
    }
    var backupList = backups.map(function (b) {
      var date = new Date(b.timestamp);
      var dateStr = date.toLocaleString();
      return '<li><button type="button" class="restore-item-btn" data-slot="' + b.slot + '">Backup ' + b.slot + ' — ' + dateStr + '</button></li>';
    }).join('');
    var overlay = document.createElement('div');
    overlay.className = 'restore-overlay';
    overlay.innerHTML = '<div class="restore-dialog">' +
      '<h2>Restore Data</h2>' +
      '<p>Select a backup to restore:</p>' +
      '<ul class="restore-list">' + backupList + '</ul>' +
      '<button type="button" class="restore-cancel-btn">Cancel</button>' +
      '</div>';
    document.body.appendChild(overlay);
    overlay.querySelectorAll('.restore-item-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var slot = this.getAttribute('data-slot');
        if (restoreFromBackup(slot)) {
          alert('Data restored from backup ' + slot + '.');
          document.body.removeChild(overlay);
          window.location.reload();
        } else {
          alert('Failed to restore backup.');
        }
      });
    });
    overlay.querySelector('.restore-cancel-btn').addEventListener('click', function () {
      document.body.removeChild(overlay);
    });
  }

  function renderHome(main) {
    var sorted = getContestsSortedByName();
    var resultsLink = isAdminLoggedIn()
      ? '<a class="results-link" href="#/results">View Results</a>'
      : '<a class="results-link" href="#/login">Admin Login</a>';
    main.innerHTML =
      '<div class="home">' +
      '<h1>Sanskriti RKT 2026</h1>' +
      '<p>Select a contest to view or add contestants.</p>' +
      '<div class="contest-grid" id="contest-grid">' +
      sorted.map(function (c) {
        return '<a class="contest-card" href="#' + c.path + '">' +
          '<strong>' + escapeHtml(c.name) + '</strong>' +
          '<span>View & add contestants</span>' +
          '</a>';
      }).join('') +
      '</div>' +
      resultsLink +
      '</div>';
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function renderContestScreen(main, contestId) {
    var contest = getContestById(contestId);
    if (!contest) {
      main.innerHTML = '<p>Contest not found.</p>';
      return;
    }
    var data = loadData();
    var list = data[contestId] || [];

    function buildGroupSections(filterQuery) {
      var filtered = list.filter(function (r) {
        if (!filterQuery) return true;
        return r.contestantName.toLowerCase().includes(filterQuery.toLowerCase());
      });
      if (filtered.length === 0) {
        return '<div class="empty-state">No contestants match your search.</div>';
      }
      var byGroup = {};
      filtered.forEach(function (r) {
        var g = (r.ageGroup || 'Other').trim() || 'Other';
        if (!byGroup[g]) byGroup[g] = [];
        byGroup[g].push(r);
      });
      var groupNames = Object.keys(byGroup).sort();
      return groupNames.map(function (groupName) {
        var groupList = byGroup[groupName];
        var tableRows = groupList.map(function (r) {
          return '<tr data-id="' + escapeHtml(r.id) + '" data-name="' + escapeHtml(r.contestantName.toLowerCase()) + '">' +
            '<td>' + escapeHtml(r.contestantName) + '</td>' +
            '<td>' + escapeHtml(String(r.score)) + '</td>' +
            '<td>' + escapeHtml(String(r.totalTimeMinutes)) + ' min</td>' +
            '<td>' +
            '<button type="button" class="edit-btn">Edit</button>' +
            '<button type="button" class="save-btn" style="display:none">Save</button>' +
            '<button type="button" class="cancel-btn" style="display:none">Cancel</button>' +
            '</td></tr>';
        }).join('');
        return '<div class="group-section-contest">' +
          '<h3>' + escapeHtml(groupName) + '</h3>' +
          '<div class="table-wrap">' +
          '<table><thead><tr>' +
          '<th>Contestant name</th><th>Score</th><th>Total Time Taken</th><th></th>' +
          '</tr></thead><tbody>' + tableRows + '</tbody></table>' +
          '</div></div>';
      }).join('');
    }

    if (list.length === 0) {
      main.innerHTML =
        '<div class="contest-screen">' +
        '<h1>' + escapeHtml(contest.name) + '</h1>' +
        '<button type="button" class="add-btn">Add Names</button>' +
        '<div class="empty-state">No contestants yet. Click "Add Names" to add.</div>' +
        '</div>';
      main.querySelector('.add-btn').addEventListener('click', function () {
        window.location.hash = '/add?contest=' + encodeURIComponent(contestId);
      });
      return;
    }

    var groupSections = buildGroupSections('');

    main.innerHTML =
      '<div class="contest-screen">' +
      '<h1>' + escapeHtml(contest.name) + '</h1>' +
      '<div class="contest-toolbar">' +
      '<button type="button" class="add-btn">Add Names</button>' +
      '<input type="text" id="contestant-search" class="search-input" placeholder="Search contestant name...">' +
      '</div>' +
      '<div id="contestants-container">' + groupSections + '</div>' +
      '</div>';

    main.querySelector('.add-btn').addEventListener('click', function () {
      window.location.hash = '/add?contest=' + encodeURIComponent(contestId);
    });

    var contestantSearchInput = document.getElementById('contestant-search');
    if (contestantSearchInput) {
      contestantSearchInput.addEventListener('input', function () {
        var query = this.value.trim();
        var container = document.getElementById('contestants-container');
        if (container) {
          container.innerHTML = buildGroupSections(query);
          attachEditHandlers();
        }
      });
    }

    function attachEditHandlers() {
      main.querySelectorAll('tbody tr[data-id]').forEach(function (tr) {
        var id = tr.getAttribute('data-id');
        var edited = false;
        var editBtn = tr.querySelector('.edit-btn');
        var cells = tr.querySelectorAll('td');
        var originalRecord = list.find(function (r) { return r.id === id; });
        if (!originalRecord) return;
        var original = {
          name: originalRecord.contestantName,
          group: originalRecord.ageGroup,
          score: String(originalRecord.score),
          time: String(originalRecord.totalTimeMinutes)
        };

        function startEdit() {
          if (edited) return;
          tr.classList.add('editing');
          var groupOptions = AGE_GROUPS.map(function (g) {
            var sel = original.group === g.value ? ' selected' : '';
            return '<option value="' + escapeHtml(g.value) + '"' + sel + '>' + escapeHtml(g.label) + '</option>';
          }).join('');
          cells[0].innerHTML = '<input type="text" name="name" value="' + escapeHtml(original.name) + '">';
          cells[1].innerHTML = '<input type="number" name="score" min="0" max="' + MAX_SCORE + '" value="' + escapeHtml(original.score) + '">';
          cells[2].innerHTML = '<input type="number" name="time" min="0" step="0.5" value="' + escapeHtml(original.time) + '">';
          cells[3].innerHTML = '<select name="ageGroup" style="margin-bottom:0.25rem">' + groupOptions + '</select><br>' +
            '<button type="button" class="save-btn">Save</button>' +
            '<button type="button" class="cancel-btn">Cancel</button>';
          var newSaveBtn = cells[3].querySelector('.save-btn');
          var newCancelBtn = cells[3].querySelector('.cancel-btn');
          newSaveBtn.addEventListener('click', saveEdit);
          newCancelBtn.addEventListener('click', cancelEdit);
        }

        function cancelEdit() {
          tr.classList.remove('editing');
          cells[0].textContent = original.name;
          cells[1].textContent = original.score;
          cells[2].textContent = original.time + ' min';
          cells[3].innerHTML = '<button type="button" class="edit-btn">Edit</button>' +
            '<button type="button" class="save-btn" style="display:none">Save</button>' +
            '<button type="button" class="cancel-btn" style="display:none">Cancel</button>';
          var newEditBtn = cells[3].querySelector('.edit-btn');
          newEditBtn.addEventListener('click', startEdit);
        }

        function saveEdit() {
          var nameInp = tr.querySelector('input[name="name"]');
          var scoreInp = tr.querySelector('input[name="score"]');
          var timeInp = tr.querySelector('input[name="time"]');
          var groupSel = tr.querySelector('select[name="ageGroup"]');
          if (!nameInp || !scoreInp || !timeInp || !groupSel) return;
          updateContestant(contestId, id, {
            contestantName: nameInp.value,
            ageGroup: groupSel.value,
            score: scoreInp.value,
            totalTimeMinutes: timeInp.value
          });
          edited = true;
          renderContestScreen(main, contestId);
        }

        if (editBtn) editBtn.addEventListener('click', startEdit);
      });
    }

    attachEditHandlers();
  }

  function renderAddForm(main, contestId) {
    var contest = getContestById(contestId) || CONTESTS[0];
    var prefilledId = contestId || contest.id;

    var ageGroupCheckboxesHtml = AGE_GROUPS.map(function (g) {
      return '<label class="checkbox-label">' +
        '<input type="checkbox" name="ageGroup" value="' + escapeHtml(g.value) + '" class="age-group-cb">' +
        '<span>' + escapeHtml(g.label) + '</span></label>';
    }).join('');

    main.innerHTML =
      '<div class="add-form-screen">' +
      '<a href="#' + (contest.path.startsWith('/') ? contest.path : '/' + contest.path) + '" class="back-link">← Back to ' + escapeHtml(contest.name) + '</a>' +
      '<h1>Add Contestant</h1>' +
      '<form id="add-form">' +
      '<div class="form-group">' +
      '<label>Contest Name <span class="required-star">*</span></label>' +
      '<input type="text" name="contestName" value="' + escapeHtml(contest.name) + '" readonly>' +
      '</div>' +
      '<div class="form-group">' +
      '<label>Name <span class="required-star">*</span></label>' +
      '<input type="text" name="contestantName" required placeholder="Full name">' +
      '</div>' +
      '<div class="form-group">' +
      '<label>Age Group <span class="required-star">*</span> <span class="label-hint">(pick one)</span></label>' +
      '<div class="age-group-checkboxes">' + ageGroupCheckboxesHtml + '</div>' +
      '</div>' +
      '<div class="form-group">' +
      '<label>Score (max ' + MAX_SCORE + ') <span class="required-star">*</span></label>' +
      '<input type="number" name="score" min="0" max="' + MAX_SCORE + '" value="" required placeholder="0">' +
      '</div>' +
      '<div class="form-group">' +
      '<label>Total Time Taken (minutes) <span class="required-star">*</span></label>' +
      '<input type="number" name="totalTimeMinutes" min="0" step="0.5" value="" required placeholder="e.g. 15">' +
      '</div>' +
      '<p class="error-msg" id="form-error" style="display:none"></p>' +
      '<button type="button" id="review-btn" class="submit-btn">Review</button>' +
      '</form></div>' +
      '<div id="review-step" class="review-step" style="display:none">' +
      '<h2>Review</h2>' +
      '<div id="review-content" class="review-content"></div>' +
      '<div class="review-actions" style="display:flex;flex-direction:column;gap:1rem;max-width:280px;">' +
      '<button type="button" id="edit-back-btn" style="padding:0.85rem 1.75rem;min-height:52px;font-size:1.05rem;background:#f85149;color:#fff;border:none;border-radius:10px;font-weight:600;cursor:pointer;">Edit</button>' +
      '<button type="button" id="submit-confirm-btn" style="padding:0.85rem 1.75rem;min-height:52px;font-size:1.05rem;background:#3fb950;color:#fff;border:none;border-radius:10px;font-weight:600;cursor:pointer;">Submit</button>' +
      '</div></div>';

    var form = document.getElementById('add-form');
    var reviewStep = document.getElementById('review-step');
    var reviewContent = document.getElementById('review-content');
    var errEl = document.getElementById('form-error');

    form.querySelectorAll('.age-group-cb').forEach(function (cb) {
      cb.addEventListener('change', function () {
        if (this.checked) {
          form.querySelectorAll('.age-group-cb').forEach(function (other) {
            if (other !== cb) other.checked = false;
          });
        }
      });
    });

    document.getElementById('review-btn').addEventListener('click', function () {
      var checked = form.querySelector('.age-group-cb:checked');
      errEl.style.display = 'none';
      if (!form.contestantName.value.trim()) {
        errEl.textContent = 'Name is required.';
        errEl.style.display = 'block';
        return;
      }
      if (!checked) {
        errEl.textContent = 'Age group is required. Please select one.';
        errEl.style.display = 'block';
        return;
      }
      var scoreStr = (form.score.value || '').trim();
      if (scoreStr === '') {
        errEl.textContent = 'Score is required.';
        errEl.style.display = 'block';
        return;
      }
      var scoreVal = Number(form.score.value);
      if (isNaN(scoreVal) || scoreVal < 0) {
        errEl.textContent = 'Please enter a valid score (0 or more).';
        errEl.style.display = 'block';
        return;
      }
      if (scoreVal > MAX_SCORE) {
        errEl.textContent = 'Score cannot be more than ' + MAX_SCORE + '.';
        errEl.style.display = 'block';
        return;
      }
      var timeStr = (form.totalTimeMinutes.value || '').trim();
      if (timeStr === '') {
        errEl.textContent = 'Total time taken is required.';
        errEl.style.display = 'block';
        return;
      }
      var timeVal = Number(form.totalTimeMinutes.value);
      if (isNaN(timeVal) || timeVal < 0) {
        errEl.textContent = 'Please enter a valid time (0 or more minutes).';
        errEl.style.display = 'block';
        return;
      }
      errEl.style.display = 'none';
      var ageGroupLabel = getAgeGroupLabel(checked.value);
      reviewContent.innerHTML =
        '<p><strong>Contest:</strong> ' + escapeHtml(form.contestName.value) + '</p>' +
        '<p><strong>Name:</strong> ' + escapeHtml(form.contestantName.value) + '</p>' +
        '<p><strong>Age Group:</strong> ' + escapeHtml(ageGroupLabel) + '</p>' +
        '<p><strong>Score:</strong> ' + escapeHtml(String(Math.min(MAX_SCORE, scoreVal))) + '</p>' +
        '<p><strong>Total Time Taken:</strong> ' + escapeHtml(form.totalTimeMinutes.value) + ' min</p>';
      form.style.display = 'none';
      reviewStep.style.display = 'block';
    });

    document.getElementById('edit-back-btn').addEventListener('click', function () {
      reviewStep.style.display = 'none';
      form.style.display = 'block';
    });

    document.getElementById('submit-confirm-btn').addEventListener('click', function () {
      var checked = form.querySelector('.age-group-cb:checked');
      var scoreVal = Number(form.score.value) || 0;
      addContestant(prefilledId, {
        contestName: form.contestName.value,
        contestantName: form.contestantName.value.trim(),
        ageGroup: checked ? checked.value : '',
        score: Math.min(MAX_SCORE, scoreVal),
        totalTimeMinutes: Math.max(0, Number(form.totalTimeMinutes.value) || 0)
      });
      window.location.hash = contest.path;
    });
  }

  function rankContestants(list) {
    var valid = list.filter(function (r) { return Number(r.totalTimeMinutes) <= 23; });
    var overTime = list.filter(function (r) { return Number(r.totalTimeMinutes) > 23; });
    function byScoreThenTime(a, b) {
      var sa = Math.min(MAX_SCORE, Number(a.score) || 0);
      var sb = Math.min(MAX_SCORE, Number(b.score) || 0);
      if (sb !== sa) return sb - sa;
      var ta = Number(a.totalTimeMinutes) || 0;
      var tb = Number(b.totalTimeMinutes) || 0;
      return ta - tb;
    }
    valid.sort(byScoreThenTime);
    overTime.sort(byScoreThenTime);
    var combined = valid.concat(overTime);
    return combined.map(function (r, i) { return { rank: i + 1, overTime: Number(r.totalTimeMinutes) > 23, record: r }; });
  }

  function buildResultsDataForContest(contestId) {
    var contest = getContestById(contestId);
    if (!contest) return { contestName: '', byGroup: {} };
    var data = loadData();
    var list = (data[contestId] || []);
    var byGroup = {};
    list.forEach(function (r) {
      var g = (r.ageGroup || 'Other').trim() || 'Other';
      if (!byGroup[g]) byGroup[g] = [];
      byGroup[g].push(r);
    });
    return { contestName: contest.name, byGroup: byGroup };
  }

  function buildFlatRowsForExport(contestId) {
    var built = buildResultsDataForContest(contestId);
    var contestName = built.contestName;
    var rows = [];
    var groupNames = Object.keys(built.byGroup).sort();
    groupNames.forEach(function (groupName) {
      var ranked = rankContestants(built.byGroup[groupName]);
      ranked.forEach(function (item) {
        var r = item.record;
        rows.push({
          contest: contestName,
          ageGroup: groupName,
          rank: item.rank,
          contestant: r.contestantName,
          score: Math.min(MAX_SCORE, Number(r.score) || 0),
          time: String(r.totalTimeMinutes),
          note: item.overTime ? 'Over 23 min' : ''
        });
      });
    });
    return rows;
  }

  function buildAllContestsGroupedForExport() {
    var sorted = getContestsSortedByName();
    return sorted.map(function (c) {
      return { contestId: c.id, contestName: c.name, rows: buildFlatRowsForExport(c.id) };
    });
  }

  function exportCSV(contestId) {
    var sections = buildAllContestsGroupedForExport();
    var headers = ['Contest', 'Age Group', 'Rank', 'Name', 'Score', 'Time (min)', 'Note'];
    var csv = [];
    sections.forEach(function (section, idx) {
      if (idx > 0) csv.push('');
      csv.push('Contest: ' + section.contestName);
      csv.push(headers.join(','));
      section.rows.forEach(function (row) {
        csv.push([row.contest, row.ageGroup, row.rank, '"' + String(row.contestant).replace(/"/g, '""') + '"', row.score, row.time, row.note].join(','));
      });
    });
    var blob = new Blob(['\uFEFF' + csv.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'results-all-contests.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportXLS(contestId) {
    var sections = buildAllContestsGroupedForExport();
    var headers = ['Contest', 'Age Group', 'Rank', 'Name', 'Score', 'Time (min)', 'Note'];
    var lines = [];
    sections.forEach(function (section, idx) {
      if (idx > 0) lines.push('');
      lines.push('Contest: ' + section.contestName);
      lines.push(headers.join('\t'));
      section.rows.forEach(function (row) {
        lines.push([row.contest, row.ageGroup, row.rank, row.contestant, row.score, row.time, row.note].join('\t'));
      });
    });
    var blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'application/vnd.ms-excel' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'results-all-contests.xls';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportGSheet(contestId, showMessage) {
    var sections = buildAllContestsGroupedForExport();
    var headers = ['Contest', 'Age Group', 'Rank', 'Name', 'Score', 'Time (min)', 'Note'];
    var lines = [];
    sections.forEach(function (section, idx) {
      if (idx > 0) lines.push('');
      lines.push('Contest: ' + section.contestName);
      lines.push(headers.join('\t'));
      section.rows.forEach(function (row) {
        lines.push([row.contest, row.ageGroup, row.rank, row.contestant, row.score, row.time, row.note].join('\t'));
      });
    });
    var text = lines.join('\r\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        if (showMessage) showMessage('Copied to clipboard — paste into Google Sheets');
      }).catch(function () {
        if (showMessage) showMessage('Copy failed. Use Export CSV and import into Google Sheets.');
      });
    } else {
      if (showMessage) showMessage('Copy not supported. Use Export CSV and import into Google Sheets.');
    }
  }

  function exportPDF(contestId) {
    if (typeof window.jspdf === 'undefined') { alert('PDF library not loaded.'); return; }
    var sections = buildAllContestsGroupedForExport();
    var jsPDF = window.jspdf.jsPDF;
    var headerTitle = 'Sanskriti RKT 2026';
    var logoSize = 18;
    var logoX = 14;
    var logoY = 10;
    var titleX = logoX + logoSize + 6;
    var titleY = logoY + logoSize / 2 + 2;

    function buildPdf(logoDataUrl) {
      var doc = new jsPDF();
      var firstPage = true;
      sections.forEach(function (section) {
        if (!firstPage) doc.addPage();
        var y = 20;
        if (firstPage && logoDataUrl) {
          try {
            doc.addImage(logoDataUrl, 'PNG', logoX, logoY, logoSize, logoSize);
          } catch (e) {}
          doc.setFontSize(16);
          doc.setFont(undefined, 'bold');
          doc.text(headerTitle, titleX, titleY);
          doc.setFont(undefined, 'normal');
          y = titleY + 14;
        }
        doc.setFontSize(12);
        var contestNameX = (210 - doc.getTextWidth(section.contestName)) / 2;
        doc.text(section.contestName, contestNameX, y);
        y += 8;
        doc.setFontSize(10);
        var tableData = section.rows.map(function (r) { return [String(r.rank), r.contestant, String(r.score), r.time, r.note]; });
        doc.autoTable({
          startY: y,
          head: [['Rank', 'Name', 'Score', 'Time (min)', 'Note']],
          body: tableData,
          theme: 'grid'
        });
        firstPage = false;
      });
      doc.save('results-all-contests.pdf');
    }

    var img = new Image();
    img.onload = function () {
      try {
        var canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        var dataUrl = canvas.toDataURL('image/png');
        buildPdf(dataUrl);
      } catch (e) {
        buildPdf(null);
      }
    };
    img.onerror = function () { buildPdf(null); };
    img.src = 'logo.png';
  }

  function renderResults(main) {
    var sorted = getContestsSortedByName();
    var firstId = sorted.length ? sorted[0].id : '';
    var optionsHtml = sorted.map(function (c) {
      return '<option value="' + escapeHtml(c.id) + '">' + escapeHtml(c.name) + '</option>';
    }).join('');

    function buildResultsGroups(contestId, contestantFilter) {
      var built = buildResultsDataForContest(contestId);
      var groupNames = Object.keys(built.byGroup).sort();
      var out = groupNames.map(function (groupName) {
        var groupList = built.byGroup[groupName];
        var filtered = !contestantFilter ? groupList : groupList.filter(function (r) {
          return r.contestantName.toLowerCase().includes(contestantFilter.toLowerCase());
        });
        if (filtered.length === 0) return '';
        var ranked = rankContestants(filtered);
        var rows = ranked.map(function (item) {
          var r = item.record;
          var timeClass = item.overTime ? ' over-time' : '';
          return '<tr class="' + timeClass + '">' +
            '<td class="rank">' + item.rank + '</td>' +
            '<td>' + escapeHtml(r.contestantName) + '</td>' +
            '<td>' + escapeHtml(String(Math.min(MAX_SCORE, Number(r.score) || 0))) + '</td>' +
            '<td>' + escapeHtml(String(r.totalTimeMinutes)) + ' min</td>' +
            (item.overTime ? '<td>Over 23 min</td>' : '<td></td>') +
            '</tr>';
        }).join('');
        return '<div class="group-section">' +
          '<h3>Age Group: ' + escapeHtml(groupName) + '</h3>' +
          '<table><thead><tr><th>Rank</th><th>Name</th><th>Score</th><th>Time</th><th>Note</th></tr></thead><tbody>' + rows + '</tbody></table>' +
          '</div>';
      });
      return out.filter(Boolean).join('');
    }

    var built = buildResultsDataForContest(firstId);
    var contestName = built.contestName;
    var content = buildResultsGroups(firstId, '') || '<p class="no-data">No contestants for this contest.</p>';

    main.innerHTML =
      '<div class="results-screen">' +
      '<h1>Results</h1>' +
      '<div class="results-toolbar">' +
      '<div class="contest-select-group">' +
      '<label for="contest-select">Contest:</label>' +
      '<select id="contest-select">' + optionsHtml + '</select>' +
      '</div>' +
      '<div class="contestant-search-group">' +
      '<label for="contestant-search">Search name:</label>' +
      '<input type="text" id="contestant-search" class="search-input search-input-large" placeholder="Filter by name...">' +
      '</div>' +
      '<div class="export-buttons">' +
      '<button type="button" class="export-btn" data-format="csv">Export CSV</button>' +
      '<button type="button" class="export-btn" data-format="pdf">Export PDF</button>' +
      '<button type="button" class="export-btn" data-format="xls">Export XLS</button>' +
      '<button type="button" class="export-btn" data-format="gsheet">Export GSheet</button>' +
      '</div></div>' +
      '<div id="export-toast" class="export-toast" aria-live="polite"></div>' +
      '<p class="results-desc">Ranked by score (tiebreak: lower time first) within each age group. Max score ' + MAX_SCORE + ', max time ' + MAX_TIME_MINUTES + ' min. Time &gt; 23 min ranked last.</p>' +
      '<div id="results-content">' +
      '<h2 class="results-contest-title">' + escapeHtml(contestName) + '</h2>' +
      content +
      '</div></div>';

    function refreshResultsContent(contestId, contestantFilter) {
      var built = buildResultsDataForContest(contestId);
      var groupBlocks = buildResultsGroups(contestId, contestantFilter || '');
      var container = document.getElementById('results-content');
      if (container) {
        var newContent = groupBlocks || '<p class="no-data">No contestants match your search.</p>';
        container.innerHTML = '<h2 class="results-contest-title">' + escapeHtml(built.contestName) + '</h2>' + newContent;
      }
    }

    main.querySelector('#contest-select').addEventListener('change', function () {
      var filter = document.getElementById('contestant-search');
      refreshResultsContent(this.value, filter ? filter.value.trim() : '');
    });

    var contestantSearchInput = document.getElementById('contestant-search');
    if (contestantSearchInput) {
      contestantSearchInput.addEventListener('input', function () {
        var contestId = main.querySelector('#contest-select').value;
        refreshResultsContent(contestId, this.value.trim());
      });
    }

    function showExportToast(msg) {
      var toast = document.getElementById('export-toast');
      if (toast) {
        toast.textContent = msg;
        toast.classList.add('visible');
        setTimeout(function () { toast.classList.remove('visible'); }, 3000);
      }
    }

    main.querySelectorAll('.export-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var contestId = main.querySelector('#contest-select').value;
        var format = this.getAttribute('data-format');
        if (format === 'csv') exportCSV(contestId);
        else if (format === 'pdf') exportPDF(contestId);
        else if (format === 'xls') exportXLS(contestId);
        else if (format === 'gsheet') exportGSheet(contestId, showExportToast);
      });
    });
  }

  function renderLogin(main) {
    main.innerHTML =
      '<div class="login-screen">' +
      '<h1>Admin Login</h1>' +
      '<p class="login-desc">Login to view all results.</p>' +
      '<form id="login-form">' +
      '<div class="form-group"><label>Username</label><input type="text" name="username" required autocomplete="username"></div>' +
      '<div class="form-group"><label>Password</label><input type="password" name="password" required autocomplete="current-password"></div>' +
      '<p class="error-msg" id="login-error" style="display:none"></p>' +
      '<button type="submit" class="submit-btn">Login</button>' +
      '</form></div>';
    main.querySelector('#login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var form = e.target;
      var username = (form.username.value || '').trim();
      var password = form.password.value || '';
      var errEl = document.getElementById('login-error');
      if (username === ADMIN_USER && password === ADMIN_PASS) {
        setAdminLoggedIn(true);
        updateHeaderNav();
        window.location.hash = '/results';
      } else {
        errEl.textContent = 'Invalid username or password.';
        errEl.style.display = 'block';
      }
    });
  }

  function render(main, route) {
    var path = route.path.toLowerCase().replace(/\/$/, '') || '/';
    updateHeaderNav();
    if (path === '/' || path === '/home') {
      renderHome(main);
      return;
    }
    if (path === '/login') {
      renderLogin(main);
      return;
    }
    if (path === '/results') {
      if (!isAdminLoggedIn()) {
        window.location.hash = '/login';
        return;
      }
      renderResults(main);
      return;
    }
    if (path === '/add') {
      var contestId = route.params.contest || '';
      renderAddForm(main, contestId);
      return;
    }
    var contest = getContestByPath(path);
    if (contest) {
      renderContestScreen(main, contest.id);
      return;
    }
    main.innerHTML = '<p>Page not found.</p>';
  }

  function init() {
    var main = document.getElementById('main');
    if (!main) return;

    function onRoute() {
      render(main, parseRoute());
    }

    window.addEventListener('hashchange', onRoute);
    updateHeaderNav();
    onRoute();
  }

  function fetchServerData() {
    return fetch('/api/data', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; });
  }

  function start() {
    fetchServerData()
      .then(function (store) {
        if (store && store.data) {
          useServer = true;
          serverStore = store;
        }
      })
      .catch(function () {})
      .then(function () { init(); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && useServer) {
      fetchServerData().then(function (store) {
        if (store && store.data) {
          serverStore = store;
          var main = document.getElementById('main');
          if (main) render(main, parseRoute());
        }
      });
    }
  });
})();
