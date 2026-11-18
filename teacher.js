/* ==========================================================================
   顺势 · 教师端
   本机教师控制台：学生名册、任务码、汇报码、学情总览与认知画像。
   ========================================================================== */
(function () {
  'use strict';

  const S = window.Shunshi;
  const $ = S.$;
  const $$ = S.$$;
  const STORAGE_KEY = 'shunshi.teacher.v1';
  const DB_NAME = 'rcs-teacher-library';
  const DB_VERSION = 1;

  const TYPE_LABELS = {
    single: '单项选择',
    cloze: '完形填空',
    reading: '阅读理解',
    five: '五选五 / 七选五',
    grammar: '语法填空',
    dialogue: '情景交际',
    picture: '看图写话',
    writing: '书面表达',
    listening: '听力',
    other: '综合练习'
  };

  const ATTR_STYLE = {
    vocab: '词汇记忆与提取',
    grammar: '语法规则分析',
    reading: '语篇理解与推断',
    writing: '书面表达与输出',
    listening: '语境听辨与反应'
  };

  const ATTR_TASKS = {
    vocab: ['单项选择', '情景交际', '语法填空'],
    grammar: ['单项选择', '语法填空', '五选五 / 七选五'],
    reading: ['完形填空', '阅读理解', '五选五 / 七选五'],
    writing: ['看图写话', '书面表达'],
    listening: ['情景交际', '听力']
  };

  let data = loadData();
  let sessionPin = '';
  let dbPromise = null;
  let papers = [];
  let detailStudentId = null;
  let editingStudentId = null;
  let assigningStudentId = null;
  let assignPaperId = null;
  let lastCodes = [];
  let lastEnroll = null;

  /* ------------------------------- 存储 ------------------------------- */

  function loadData() {
    const raw = S.getJSON(STORAGE_KEY, null);
    if (!raw || !raw.pinHash) return null;
    raw.v = 1;
    raw.teacherName = raw.teacherName || '阮老师';
    raw.students = Array.isArray(raw.students) ? raw.students.map(normalizeStudent).filter((s) => s.id) : [];
    raw.assignments = Array.isArray(raw.assignments) ? raw.assignments.filter((a) => a && a.id) : [];
    return raw;
  }

  function normalizeStudent(raw) {
    return {
      id: String(raw.id || '').trim().toUpperCase(),
      name: String(raw.name || '未命名学生').trim(),
      grade: String(raw.grade || ''),
      avatar: raw.avatar || '🦊',
      pin: String(raw.pin || ''),
      note: String(raw.note || ''),
      createdAt: raw.createdAt || S.nowIso(),
      reports: Array.isArray(raw.reports) ? raw.reports : [],
      tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
      profile: raw.profile || null,
      lastReportAt: raw.lastReportAt || '',
      aiAnalysis: String(raw.aiAnalysis || '')
    };
  }

  function save() {
    if (data) S.setJSON(STORAGE_KEY, data);
  }

  function getStudent(id) {
    return data && data.students.find((student) => student.id === String(id || '').toUpperCase()) || null;
  }

  function newTeacherData(pinHash, name) {
    return {
      v: 1,
      teacherName: name || '阮老师',
      pinHash,
      createdAt: S.nowIso(),
      students: [],
      assignments: []
    };
  }

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

  function mean(list) {
    return list.length ? list.reduce((sum, value) => sum + value, 0) / list.length : 0;
  }

  function hasScore(task) {
    return Boolean(task) && task.score != null && task.score !== '' && Number.isFinite(Number(task.score));
  }

  /* ------------------------------- 登录与锁 ------------------------------- */

  function showAuth() {
    $('#teacher-auth').hidden = false;
    $('#teacher-app').hidden = true;
    $('#student-detail').hidden = true;
    $('#teacher-user').hidden = true;
    if (data) {
      $('#teacher-setup-card').hidden = true;
      $('#teacher-login-card').hidden = false;
      $('#teacher-pin').value = '';
      setTimeout(() => { if ($('#teacher-pin')) $('#teacher-pin').focus(); }, 80);
    } else {
      $('#teacher-setup-card').hidden = false;
      $('#teacher-login-card').hidden = true;
    }
  }

  function showApp() {
    $('#teacher-auth').hidden = true;
    $('#teacher-app').hidden = false;
    $('#student-detail').hidden = true;
    $('#teacher-user').hidden = false;
    renderAll();
  }

  async function setupTeacher() {
    const name = $('#teacher-name-setup').value.trim() || '阮老师';
    const pin = $('#teacher-pin-setup').value.trim();
    const confirmPin = $('#teacher-pin-confirm').value.trim();
    if (!/^[A-Za-z0-9]{6,16}$/.test(pin)) { S.toast('教师密码用 6–16 位字母或数字。', 'error'); return; }
    if (pin !== confirmPin) { S.toast('两次密码不一致。', 'error'); return; }
    const pinHash = await S.sha256Hex(`teacher|${pin}`);
    data = newTeacherData(pinHash, name);
    sessionPin = pin;
    save();
    showApp();
    S.toast('教师控制台已建立。先添加第一位学生吧。', 'ok');
  }

  async function loginTeacher() {
    if (!data) { showAuth(); return; }
    const pin = $('#teacher-pin').value.trim();
    if (!pin) { S.toast('请输入教师密码。', 'error'); return; }
    const hash = await S.sha256Hex(`teacher|${pin}`);
    if (hash !== data.pinHash) {
      S.toast('教师密码不对。', 'error');
      $('#teacher-pin').select();
      return;
    }
    sessionPin = pin;
    showApp();
    S.toast(`${data.teacherName || '老师'}，欢迎回来。`, 'ok');
  }

  function lockConsole() {
    if (!window.confirm('锁定教师控制台？需要教师密码才能再进入。')) return;
    sessionPin = '';
    detailStudentId = null;
    showAuth();
    S.toast('控制台已锁定。');
  }

  /* ------------------------------- IndexedDB ------------------------------- */

  function openLibrary() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('当前浏览器不支持本机资料库。'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('materials')) {
          const store = db.createObjectStore('materials', { keyPath: 'id' });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('grade', 'grade', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('items')) {
          const store = db.createObjectStore('items', { keyPath: 'id' });
          store.createIndex('materialId', 'materialId', { unique: false });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('grade', 'grade', { unique: false });
        }
        if (!db.objectStoreNames.contains('papers')) {
          const store = db.createObjectStore('papers', { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('无法打开本机资料库。'));
      request.onblocked = () => reject(new Error('资料库被工作台占用，请先关闭工作台页面再试。'));
    });
    return dbPromise;
  }

  async function loadPapers() {
    try {
      const db = await openLibrary();
      const list = await new Promise((resolve, reject) => {
        const transaction = db.transaction('papers', 'readonly');
        const request = transaction.objectStore('papers').getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error || new Error('读取练习卷失败。'));
      });
      return list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    } catch (error) {
      console.warn(error);
      return [];
    }
  }

  /* ------------------------------- 练习卷转任务 ------------------------------- */

  function cnNumber(index) {
    return ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'][index] || String(index + 1);
  }

  function sectionLabel(section) {
    const type = section.type === 'shortblank' ? 'grammar' : section.type;
    return TYPE_LABELS[type] || '综合练习';
  }

  function cleanTaskText(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
  }

  function blocksFromPaper(paper) {
    const blocks = [];
    (paper.sections || []).forEach((section, sectionIndex) => {
      const type = section.type === 'shortblank' ? 'grammar' : (section.type || 'other');
      const baseLabel = `${cnNumber(sectionIndex)}、${sectionLabel(section)}`;
      const items = section.items || [];
      items.forEach((item, itemIndex) => {
        const id = `B${sectionIndex + 1}-${itemIndex + 1}`;
        const itemTitle = String(item.title || '');
        const letterMatch = itemTitle.match(/([A-E])\s*篇/);
        const label = items.length > 1 && letterMatch
          ? `${baseLabel} · ${letterMatch[1]} 篇`
          : baseLabel;

        if (type === 'writing' || type === 'picture') {
          const question = (item.questions || [])[0];
          const number = (question && question.paperNumber) || item.writingNumber || '';
          let prompt = cleanTaskText(item.content || item.passage || '');
          if (number) prompt = `${number}. ${prompt.replace(/^\s*\d{1,3}\s*[.、．)）]\s*/, '')}`;
          blocks.push({ id, type, label, prompt, questions: [] });
          return;
        }

        const questions = [];
        const rawQuestions = (item.questions || []).filter((question) => (
          question.paperNumber || question.stem || (question.options || []).length
        ));
        rawQuestions.forEach((question, index) => {
          const number = question.paperNumber || question.number || '';
          const blank = item.blankAnswers && number ? item.blankAnswers[number] : null;
          questions.push({
            id: `${id}-Q${index + 1}`,
            n: number,
            stem: question.stem || (type === 'five' || type === 'grammar' ? `第 ${number} 空` : ''),
            options: (question.options || []).map((option) => ({ letter: option.letter, text: option.text })),
            answer: String(question.answer || (blank && blank.answer) || ''),
            explanation: String(question.explanation || (blank && blank.explanation) || ''),
            difficulty: Number(question.difficulty) || null
          });
        });

        if (!questions.length && item.blankAnswers) {
          Object.keys(item.blankAnswers)
            .sort((a, b) => Number(a) - Number(b))
            .forEach((number, index) => {
              const blank = item.blankAnswers[number] || {};
              questions.push({
                id: `${id}-Q${index + 1}`,
                n: number,
                stem: `第 ${number} 空`,
                options: [],
                answer: String(blank.answer || ''),
                explanation: String(blank.explanation || ''),
                difficulty: item.blankDifficulties ? Number(item.blankDifficulties[number]) || null : null
              });
            });
        }

        const passage = cleanTaskText(
          item.passage
          || (questions.length ? '' : item.content)
          || ''
        );

        if (questions.length) {
          blocks.push({ id, type, label, passage, questions });
          return;
        }

        const freeText = cleanTaskText(item.content || item.passage || '');
        if (freeText) {
          blocks.push({ id, type, label, passage: freeText, questions: [], freeResponse: true });
        }
      });
    });
    return blocks;
  }

  function countQuestions(blocks) {
    return blocks.reduce((sum, block) => sum + (block.questions || []).length + (block.freeResponse ? 1 : 0), 0);
  }

  function avgDifficultyOf(blocks) {
    const levels = [];
    blocks.forEach((block) => (block.questions || []).forEach((question) => {
      if (Number(question.difficulty)) levels.push(Number(question.difficulty));
    }));
    return levels.length ? Math.round(mean(levels) * 10) / 10 : null;
  }

  /* ------------------------------- 任务码 ------------------------------- */

  async function taskCodeFor(assignment, student) {
    const auth = await S.sha256Hex(`${student.id}|${student.pin}|${assignment.id}`);
    return S.packCode({
      v: 1,
      kind: 'task',
      id: assignment.id,
      studentId: student.id,
      studentName: student.name,
      teacherName: data.teacherName || '阮老师',
      title: assignment.title,
      grade: assignment.paperGrade || student.grade || '',
      due: assignment.due || '',
      xp: assignment.xp,
      createdAt: assignment.createdAt,
      paperId: assignment.paperId,
      paperTitle: assignment.paperTitle,
      avgDifficulty: assignment.avgDifficulty || null,
      blocks: assignment.blocks,
      auth
    });
  }

  async function buildEnrollCode(student) {
    const auth = await S.sha256Hex(`enroll|${student.id}|${student.pin}`);
    return S.packCode({
      v: 1,
      kind: 'enroll',
      studentId: student.id,
      name: student.name,
      grade: student.grade,
      avatar: student.avatar,
      pin: student.pin,
      teacherName: data.teacherName || '阮老师',
      createdAt: S.nowIso(),
      auth
    });
  }

  /* ------------------------------- 总览渲染 ------------------------------- */

  function allReports() {
    const list = [];
    (data.students || []).forEach((student) => {
      (student.reports || []).forEach((report) => {
        list.push({ ...report, studentId: student.id, studentName: student.name, avatar: student.avatar });
      });
    });
    return list.sort((a, b) => String(b.generatedAt || '').localeCompare(String(a.generatedAt || '')));
  }

  function scoreOfStudent(student) {
    const scores = (student.tasks || [])
      .filter((task) => task.status === 'done' && hasScore(task))
      .map((task) => Number(task.score));
    return scores.length ? Math.round(mean(scores)) : null;
  }

  function doneTaskCount(student) {
    return (student.tasks || []).filter((task) => task.status === 'done').length;
  }

  function streakOfStudent(student) {
    const checkins = student.profile && Array.isArray(student.profile.checkins) ? student.profile.checkins : [];
    return S.streakFromCheckins(checkins);
  }

  function xpOfStudent(student) {
    return Number(student.profile && student.profile.xp) || 0;
  }

  function reportDaysOf(student) {
    if (!student.lastReportAt) return null;
    return Math.max(0, S.daysBetween(student.lastReportAt, S.todayIso()));
  }

  function pendingForAssignment(assignment) {
    return (assignment.studentIds || []).filter((id) => {
      const student = getStudent(id);
      if (!student) return false;
      return !(student.tasks || []).some((task) => task.id === assignment.id && task.status === 'done');
    }).length;
  }

  function renderAll() {
    if (!data) return;
    $('#teacher-name-label').textContent = data.teacherName || '阮老师';
    renderStats();
    renderOverviewStudents();
    renderRecentReports();
    renderTodo();
    renderStudentGrid();
    renderAssignments();
    renderReportList();
    renderSettings();
  }

  function renderStats() {
    $('#stat-students').textContent = String((data.students || []).length);
    $('#stat-reports').textContent = String(allReports().length);
    const scores = [];
    (data.students || []).forEach((student) => {
      (student.tasks || []).forEach((task) => {
        if (task.status === 'done' && hasScore(task)) scores.push(Number(task.score));
      });
    });
    $('#stat-score').textContent = scores.length ? `${Math.round(mean(scores))}%` : '—';
    const pending = (data.assignments || []).reduce((sum, assignment) => sum + pendingForAssignment(assignment), 0);
    $('#stat-pending').textContent = String(pending);
  }

  function studentCardHtml(student) {
    const info = S.levelInfo(xpOfStudent(student));
    const score = scoreOfStudent(student);
    const days = reportDaysOf(student);
    let tone = 'var(--red)';
    let riskText = '未收汇报';
    if (days != null) {
      if (days <= 7) { tone = 'var(--green)'; riskText = days === 0 ? '今天有汇报' : `${days} 天前汇报`; }
      else if (days <= 14) { tone = 'var(--gold)'; riskText = `${days} 天前汇报`; }
      else { riskText = `${days} 天未汇报`; }
    }
    return `<article class="student-card" data-student-id="${S.escapeHtml(student.id)}" tabindex="0" role="button">` +
      `<div class="student-card-head">` +
        `<span class="student-avatar">${S.escapeHtml(student.avatar || '🦊')}</span>` +
        `<div class="student-card-name" style="min-width:0;flex:1;">` +
          `<div style="display:flex;align-items:center;gap:6px;min-width:0;">` +
            `<h3>${S.escapeHtml(student.name)}</h3>` +
            (student.grade ? `<span class="grade-tag">${S.escapeHtml(student.grade)}</span>` : '') +
          `</div>` +
          `<span class="sid">${S.escapeHtml(student.id)}</span>` +
        `</div>` +
      `</div>` +
      `<div class="student-card-stats">` +
        `<div><b>Lv.${info.level}</b><span>等级</span></div>` +
        `<div><b>${streakOfStudent(student)}</b><span>连击</span></div>` +
        `<div><b>${score == null ? '—' : score + '%'}</b><span>均分</span></div>` +
      `</div>` +
      `<div class="student-card-foot" style="--tone:${tone};">` +
        `<span class="risk-dot">${S.escapeHtml(riskText)}</span>` +
        `<span>${doneTaskCount(student)} 次任务 →</span>` +
      `</div>` +
    `</article>`;
  }

  function emptyState(title, text) {
    return `<div class="empty-state"><strong>${S.escapeHtml(title)}</strong>${S.escapeHtml(text || '')}</div>`;
  }

  function sortedStudents() {
    return (data.students || []).slice().sort((a, b) => {
      const da = a.lastReportAt || '';
      const db = b.lastReportAt || '';
      if (da !== db) return String(db).localeCompare(String(da));
      return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN');
    });
  }

  function renderOverviewStudents() {
    const list = sortedStudents().slice(0, 6);
    $('#overview-students').innerHTML = list.length
      ? list.map(studentCardHtml).join('')
      : emptyState('还没有学生', '先点“添加学生”，把学号和初始密码发给学生。');
  }

  function reportFeedItem(report) {
    return `<div class="report-feed-item" data-student-id="${S.escapeHtml(report.studentId)}" tabindex="0" role="button">` +
      `<span class="feed-avatar">${S.escapeHtml(report.avatar || '🦊')}</span>` +
      `<div class="feed-copy">` +
        `<strong>${S.escapeHtml(report.studentName)}</strong>` +
        `<small>${S.escapeHtml(S.fmtDateTime(report.generatedAt))} · ${report.taskCount || 0} 个任务</small>` +
      `</div>` +
      `<span class="feed-score">${report.avgScore == null ? '—' : report.avgScore + '%'}</span>` +
    `</div>`;
  }

  function renderRecentReports() {
    const list = allReports().slice(0, 5);
    $('#recent-reports').innerHTML = list.length
      ? list.map(reportFeedItem).join('')
      : emptyState('还没有汇报', '学生生成汇报码后，点“导入学生汇报”。');
  }

  function renderTodo() {
    const todos = [];
    sortedStudents().forEach((student) => {
      const days = reportDaysOf(student);
      if (days == null) {
        todos.push({ tone: 'var(--gold)', studentId: student.id, text: `给 <strong>${S.escapeHtml(student.name)}</strong> 开通账号，并收第一次汇报。` });
      } else if (days > 7) {
        todos.push({ tone: 'var(--gold)', studentId: student.id, text: `<strong>${S.escapeHtml(student.name)}</strong> 已 ${days} 天没有汇报，问一句最近的学习情况。` });
      }
    });
    (data.assignments || []).forEach((assignment) => {
      const pending = pendingForAssignment(assignment);
      if (!pending) return;
      const overdue = assignment.due && assignment.due < S.todayIso();
      todos.push({
        tone: overdue ? 'var(--red)' : 'var(--blue)',
        studentId: null,
        text: `任务《${S.escapeHtml(assignment.title)}》还有 <strong>${pending}</strong> 人未交${overdue ? '，已过截止日期。' : '。'}`
      });
    });
    sortedStudents().forEach((student) => {
      const score = scoreOfStudent(student);
      if (score != null && score < 60) {
        todos.push({ tone: 'var(--red)', studentId: student.id, text: `<strong>${S.escapeHtml(student.name)}</strong> 最近平均正确率 ${score}%，建议先回看错题再布置新任务。` });
      }
    });
    $('#todo-list').innerHTML = todos.length
      ? todos.slice(0, 6).map((todo) => (
        `<div class="todo-item" style="--tone:${todo.tone};" ${todo.studentId ? `data-student-id="${S.escapeHtml(todo.studentId)}"` : ''}>` +
          `<b>◆</b><p>${todo.text}</p>` +
        `</div>`
      )).join('')
      : emptyState('今天没有紧急待办', '可以整理下一阶段的组卷计划，或给久未汇报的学生发一句问候。');
  }

  function renderStudentGrid() {
    const keyword = String($('#student-search').value || '').trim().toLowerCase();
    const list = sortedStudents().filter((student) => (
      !keyword
      || student.name.toLowerCase().includes(keyword)
      || student.id.toLowerCase().includes(keyword)
    ));
    $('#student-grid').innerHTML = list.length
      ? list.map(studentCardHtml).join('')
      : emptyState(keyword ? '没有找到这个学生' : '还没有学生', keyword ? '换一个名字或学号试试。' : '点右上角“添加学生”，建立一人一号。');
  }

  function renderAssignments() {
    const list = (data.assignments || []).slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    if (!list.length) {
      $('#assignment-list').innerHTML = emptyState('还没有布置任务', '从教师工作台保存一份练习卷，再回来点“布置任务”。');
      return;
    }
    $('#assignment-list').innerHTML = list.map((assignment) => {
      const total = (assignment.studentIds || []).length;
      const pending = pendingForAssignment(assignment);
      const done = Math.max(0, total - pending);
      const percent = total ? Math.round((done / total) * 100) : 0;
      const overdue = assignment.due && assignment.due < S.todayIso();
      return `<article class="assignment-card" data-assignment-id="${S.escapeHtml(assignment.id)}">` +
        `<div class="assignment-main">` +
          `<h3>${S.escapeHtml(assignment.title)}</h3>` +
          `<div class="assignment-meta">` +
            `<span>练习卷：${S.escapeHtml(assignment.paperTitle || '—')}</span>` +
            `<span>${assignment.questionTotal || 0} 题</span>` +
            `<span>经验 <b>+${assignment.xp || 100}</b></span>` +
            `<span style="${overdue ? 'color:var(--red-bright);' : ''}">截止 ${assignment.due ? S.escapeHtml(S.fmtDate(assignment.due)) : '未设置'}${overdue ? '（已过）' : ''}</span>` +
          `</div>` +
        `</div>` +
        `<div class="assignment-progress">` +
          `<div class="progress-label"><span>提交进度</span><b>${done} / ${total}</b></div>` +
          `<div class="mini-track"><i style="width:${percent}%"></i></div>` +
        `</div>` +
        `<div class="assignment-actions">` +
          `<button class="p-btn small" type="button" data-action="codes">任务码</button>` +
          `<button class="p-btn small ghost" type="button" data-action="delete">删除</button>` +
        `</div>` +
      `</article>`;
    }).join('');
  }

  function renderReportList() {
    const list = allReports();
    $('#report-list').innerHTML = list.length
      ? list.map(reportFeedItem).join('')
      : emptyState('汇报库还是空的', '学生完成学习后生成汇报码，老师粘贴导入即可。');
  }

  function renderSettings() {
    const nameInput = $('#setting-teacher-name');
    if (nameInput && document.activeElement !== nameInput) nameInput.value = data.teacherName || '阮老师';
  }

  /* ------------------------------- 标签切换 ------------------------------- */

  function switchTab(name) {
    $$('#teacher-tabs button').forEach((button) => button.classList.toggle('active', button.dataset.tab === name));
    $$('.teacher-pane').forEach((pane) => pane.classList.toggle('active', pane.dataset.pane === name));
  }

  /* ------------------------------- 学生管理 ------------------------------- */

  function randomPin() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function selectedAvatar(name) {
    const input = $(`input[name="${name}"]:checked`);
    return input ? input.value : '🦊';
  }

  function openStudentDialog(id) {
    const student = id ? getStudent(id) : null;
    editingStudentId = student ? student.id : null;
    $('#student-dialog-title').textContent = student ? '编辑学生' : '添加学生';
    $('#student-name-input').value = student ? student.name : '';
    $('#student-id-input').value = student ? student.id : '';
    $('#student-grade-input').value = student ? student.grade : '';
    $('#student-pin-input').value = student ? student.pin : randomPin();
    $('#student-delete').hidden = !student;
    $('#student-pin-note').textContent = student
      ? '修改密码后，之前发给这个学生的任务码会失效，需要重新生成。'
      : '学生端和学生端之间靠“学号 + 密码”绑定。密码要给到学生本人，不要发在公开群里。';
    $$('#student-avatar-picker input').forEach((input) => {
      input.checked = input.value === (student ? student.avatar : '🦊');
    });
    S.openDialog($('#student-dialog'));
  }

  function saveStudent() {
    const name = $('#student-name-input').value.trim();
    const id = $('#student-id-input').value.trim().toUpperCase().replace(/\s+/g, '');
    const grade = $('#student-grade-input').value;
    const pin = $('#student-pin-input').value.trim();
    const avatar = selectedAvatar('student-avatar');
    if (!name) { S.toast('先填学生姓名。', 'error'); return; }
    if (!/^[A-Z0-9_-]{3,24}$/.test(id)) { S.toast('学号用 3–24 位字母、数字或横线。', 'error'); return; }
    if (!/^[A-Za-z0-9]{4,12}$/.test(pin)) { S.toast('学生密码用 4–12 位字母或数字。', 'error'); return; }
    const duplicate = getStudent(id);
    if (duplicate && duplicate.id !== editingStudentId) {
      S.toast(`学号 ${id} 已经存在。`, 'error');
      return;
    }

    if (editingStudentId) {
      const student = getStudent(editingStudentId);
      if (!student) return;
      if (student.pin !== pin && !window.confirm('改密码后，之前发出去的任务码会失效。确定修改吗？')) return;
      if (student.id !== id && !window.confirm('改学号后，旧学号的任务码和旧汇报码会失效。确定修改吗？')) return;
      student.id = id;
      student.name = name;
      student.grade = grade;
      student.pin = pin;
      student.avatar = avatar;
      save();
      S.closeDialog($('#student-dialog'));
      renderAll();
      if (detailStudentId) {
        detailStudentId = id;
        renderDetail();
      }
      S.toast('学生信息已更新。', 'ok');
      return;
    }

    const student = {
      id,
      name,
      grade,
      avatar,
      pin,
      note: '',
      createdAt: S.nowIso(),
      reports: [],
      tasks: [],
      profile: null,
      lastReportAt: '',
      aiAnalysis: ''
    };
    data.students.push(student);
    save();
    S.closeDialog($('#student-dialog'));
    renderAll();
    S.toast('学生已添加。开通码已生成，发给学生即可。', 'ok');
    openEnroll(student.id);
  }

  function deleteStudent() {
    if (!editingStudentId) return;
    const student = getStudent(editingStudentId);
    if (!student) return;
    if (!window.confirm(`删除学生 ${student.name}（${student.id}）？`)) return;
    if (!window.confirm('该学生的汇报、任务历史和画像会一起删除，且无法恢复。最后确认一次。')) return;
    data.students = data.students.filter((item) => item.id !== student.id);
    save();
    S.closeDialog($('#student-dialog'));
    detailStudentId = null;
    showApp();
    S.toast('学生已删除。');
  }

  /* ------------------------------- 开通码 ------------------------------- */

  async function openEnroll(id) {
    const student = getStudent(id);
    if (!student) return;
    if (!student.pin) { S.toast('这个学生还没有设置密码。', 'error'); return; }
    try {
      const code = await buildEnrollCode(student);
      lastEnroll = { student, code };
      $('#enroll-summary').innerHTML = `<span class="student-avatar">${S.escapeHtml(student.avatar)}</span>` +
        `<div><strong>${S.escapeHtml(student.name)}</strong><b>${S.escapeHtml(student.id)} · 密码 ${S.escapeHtml(student.pin)}</b><span>学生端第一次建档时使用</span></div>`;
      $('#enroll-code-output').value = code;
      S.openDialog($('#enroll-dialog'));
    } catch (error) {
      S.toast(error.message || '开通码生成失败。', 'error');
    }
  }

  /* ------------------------------- 布置任务 ------------------------------- */

  async function openAssign(studentId) {
    assigningStudentId = studentId || null;
    assignPaperId = null;
    $('#assign-due').value = S.addDays(S.todayIso(), 3);
    $('#assign-title').value = '';
    $('#assign-xp').value = '100';
    $('#assign-papers').innerHTML = '<p class="hint">正在读取教师工作台的练习卷…</p>';
    $('#assign-students').innerHTML = '';
    S.openDialog($('#assign-dialog'));
    papers = await loadPapers();
    if (!papers.length) {
      $('#assign-papers').innerHTML = `<p class="hint">还没有保存过练习卷。请先去教师工作台组卷，并点“保存到资料库”。</p>`;
    } else {
      assignPaperId = papers[0].id;
      renderAssignPapers();
    }
    renderAssignStudents();
    updateAssignDefaults();
  }

  function renderAssignPapers() {
    if (!papers.length) return;
    $('#assign-papers').innerHTML = papers.map((paper) => (
      `<label class="paper-item">` +
        `<input type="radio" name="assign-paper" value="${S.escapeHtml(paper.id)}" ${paper.id === assignPaperId ? 'checked' : ''}>` +
        `<span style="min-width:0;"><strong>${S.escapeHtml(paper.title)}</strong>` +
        `<span>${S.escapeHtml(paper.grade || '未标注')} · ${paper.questionTotal || paper.total || 0} 题 · ${S.escapeHtml(S.fmtDate(paper.createdAt))}</span></span>` +
      `</label>`
    )).join('');
  }

  function renderAssignStudents() {
    const list = sortedStudents();
    if (!list.length) {
      $('#assign-students').innerHTML = '<p class="hint">还没有学生。先添加学生，再布置任务。</p>';
      return;
    }
    $('#assign-students').innerHTML = list.map((student) => (
      `<label class="check-chip">` +
        `<input type="checkbox" name="assign-student" value="${S.escapeHtml(student.id)}" ${student.id === assigningStudentId ? 'checked' : ''}>` +
        `${S.escapeHtml(student.avatar)} ${S.escapeHtml(student.name)}` +
      `</label>`
    )).join('');
  }

  function updateAssignDefaults() {
    const paper = papers.find((item) => item.id === assignPaperId);
    if (!paper) return;
    if (!$('#assign-title').value.trim()) $('#assign-title').value = paper.title;
    const count = paper.questionTotal || paper.total || 0;
    const suggested = clamp(Math.round((40 + count * 15) / 10) * 10, 60, 600);
    $('#assign-xp').value = String(suggested);
  }

  async function generateAssignment() {
    const paper = papers.find((item) => item.id === assignPaperId);
    if (!paper) { S.toast('先选一份练习卷。', 'error'); return; }
    const studentIds = $$('#assign-students input[name="assign-student"]:checked').map((input) => input.value);
    if (!studentIds.length) { S.toast('至少勾选一位学生。', 'error'); return; }
    const blocks = blocksFromPaper(paper);
    if (!blocks.length) { S.toast('这份练习卷没有可下发的题目，请回工作台检查。', 'error', 5000); return; }
    const questionTotal = countQuestions(blocks);
    const title = $('#assign-title').value.trim() || paper.title;
    const due = $('#assign-due').value || S.addDays(S.todayIso(), 3);
    const xp = clamp(Number($('#assign-xp').value) || 100, 20, 600);
    const assignment = {
      id: S.uid('A'),
      title,
      paperId: paper.id,
      paperTitle: paper.title,
      paperGrade: paper.grade || '',
      due,
      xp,
      createdAt: S.nowIso(),
      studentIds,
      questionTotal,
      avgDifficulty: avgDifficultyOf(blocks),
      blocks
    };
    data.assignments.unshift(assignment);
    save();
    renderAll();
    S.closeDialog($('#assign-dialog'));
    S.toast(`任务已创建，共 ${questionTotal} 题。正在生成一人一码…`, 'ok');
    await showCodes(assignment);
  }

  async function showCodes(assignment) {
    const students = (assignment.studentIds || []).map(getStudent).filter(Boolean);
    if (!students.length) { S.toast('找不到任务对应的学生。', 'error'); return; }
    const items = [];
    for (const student of students) {
      if (!student.pin) {
        items.push({ student, code: '', error: '没有设置密码，无法生成任务码。' });
        continue;
      }
      try {
        const code = await taskCodeFor(assignment, student);
        items.push({ student, code });
      } catch (error) {
        items.push({ student, code: '', error: error.message || '生成失败' });
      }
    }
    lastCodes = items;
    $('#codes-list').innerHTML = items.map((item, index) => {
      if (!item.code) {
        return `<div class="code-card"><div class="code-card-head"><strong>${S.escapeHtml(item.student.name)} · ${S.escapeHtml(item.student.id)}</strong></div>` +
          `<p class="hint warn">${S.escapeHtml(item.error)}</p></div>`;
      }
      return `<div class="code-card">` +
        `<div class="code-card-head">` +
          `<div><strong>${S.escapeHtml(item.student.name)}</strong> <span>${S.escapeHtml(item.student.id)}</span></div>` +
          `<button class="p-btn small ghost" type="button" data-copy-index="${index}">复制</button>` +
        `</div>` +
        `<textarea class="code-text" readonly>${S.escapeHtml(item.code)}</textarea>` +
      `</div>`;
    }).join('');
    S.openDialog($('#codes-dialog'));
  }

  async function openCodesForAssignment(assignmentId) {
    const assignment = (data.assignments || []).find((item) => item.id === assignmentId);
    if (!assignment) return;
    await showCodes(assignment);
  }

  /* ------------------------------- 汇报导入 ------------------------------- */

  async function importReportCode() {
    const code = $('#import-report-code').value.trim();
    if (!code) { S.toast('先粘贴汇报码。', 'error'); return; }
    let payload;
    try {
      payload = await S.unpackCode(code);
    } catch (error) {
      S.toast(error.message || '汇报码无法识别。', 'error', 5000);
      return;
    }
    if (!payload || payload.kind !== 'report') {
      S.toast('这不是学生的汇报码。', 'error');
      return;
    }
    const student = getStudent(payload.studentId);
    if (!student) {
      S.toast(`名册里没有学号 ${payload.studentId}。请先添加这个学生，并设置与学生端一致的密码。`, 'error', 7000);
      return;
    }
    if (!student.pin) {
      S.toast('这个学生还没有登记密码，无法校验汇报码。请先编辑学生补上密码。', 'error', 6000);
      return;
    }
    const auth = await S.sha256Hex(`${student.id}|${student.pin}|${payload.reportId}`);
    if (auth !== payload.auth) {
      S.toast('校验失败：汇报码与这个学生登记的密码不一致，可能是旧密码或拿错了码。', 'error', 7000);
      return;
    }

    const profile = payload.profile || {};
    student.profile = {
      ...profile,
      id: student.id,
      name: profile.name || student.name,
      grade: profile.grade || student.grade,
      avatar: profile.avatar || student.avatar,
      attrs: S.normalizeAttrs(profile.attrs),
      checkins: Array.isArray(profile.checkins) ? profile.checkins : [],
      badges: Array.isArray(profile.badges) ? profile.badges : [],
      xp: Number(profile.xp) || 0
    };
    if (!student.name) student.name = profile.name || student.name;
    if (!student.grade && profile.grade) student.grade = profile.grade;

    const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    tasks.forEach((task) => {
      const copy = { ...task, reportId: payload.reportId };
      const index = (student.tasks || []).findIndex((item) => item.id === copy.id);
      if (index >= 0) student.tasks[index] = copy;
      else student.tasks.push(copy);
    });
    student.tasks.sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));

    const scores = tasks.filter(hasScore).map((task) => Number(task.score));
    const summary = {
      reportId: payload.reportId,
      generatedAt: payload.generatedAt || S.nowIso(),
      taskCount: tasks.length,
      avgScore: scores.length ? Math.round(mean(scores)) : null,
      xp: Number(profile.xp) || xpOfStudent(student),
      level: S.levelInfo(Number(profile.xp) || xpOfStudent(student)).level,
      checkinStreak: S.streakFromCheckins(profile.checkins || [])
    };
    const reportIndex = (student.reports || []).findIndex((report) => report.reportId === summary.reportId);
    if (reportIndex >= 0) student.reports[reportIndex] = summary;
    else student.reports.push(summary);
    student.reports.sort((a, b) => String(b.generatedAt || '').localeCompare(String(a.generatedAt || '')));
    student.lastReportAt = summary.generatedAt;
    student.updatedAt = S.nowIso();

    save();
    S.closeDialog($('#import-report-dialog'));
    $('#import-report-code').value = '';
    renderAll();
    S.toast(`已导入 ${student.name} 的汇报，共 ${summary.taskCount} 个任务。`, 'ok', 5000);
    openDetail(student.id);
  }

  /* ------------------------------- 认知画像 ------------------------------- */

  function attrValues(attrs) {
    return S.ATTRS.map((attr) => {
      const stat = (attrs && attrs[attr.key]) || { c: 0, t: 0 };
      const display = S.attrDisplay(stat);
      return { attr, stat, value: display.value, empty: display.empty, label: display.label };
    });
  }

  function renderRadar(svg, list, attrs) {
    const values = attrValues(attrs);
    const assessed = values.filter((item) => !item.empty).length;
    list.innerHTML = values.map((item) => (
      `<div class="attr-row">` +
        `<span class="attr-name">${item.attr.name}</span>` +
        `<span class="attr-bar"><i style="width:${item.empty ? 0 : item.value}%;--attr-color:${item.attr.color}"></i></span>` +
        `<span class="attr-val">${item.empty ? '—' : item.value}</span>` +
      `</div>`
    )).join('') + `<p class="hint" style="grid-column:1/-1;margin:0;">${assessed ? `${assessed} 项已评估` : '还没有可评估的答题记录'}</p>`;

    const cx = 100;
    const cy = 100;
    const radius = 72;
    const points = (ratio) => values.map((_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / values.length;
      return [cx + Math.cos(angle) * radius * ratio, cy + Math.sin(angle) * radius * ratio];
    });
    const polygon = (list2) => list2.map((point) => point.map((n) => n.toFixed(1)).join(',')).join(' ');
    const shape = points(1).map((point, index) => {
      const ratio = values[index].empty ? 0 : values[index].value / 100;
      return [cx + (point[0] - cx) * ratio, cy + (point[1] - cy) * ratio];
    });
    let html = '';
    [0.25, 0.5, 0.75, 1].forEach((ratio) => {
      html += `<polygon class="radar-grid" points="${polygon(points(ratio))}"></polygon>`;
    });
    points(1).forEach((point) => {
      html += `<line class="radar-axis" x1="${cx}" y1="${cy}" x2="${point[0].toFixed(1)}" y2="${point[1].toFixed(1)}"></line>`;
    });
    html += `<polygon class="radar-shape" points="${polygon(shape)}"></polygon>`;
    points(1).forEach((point, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / values.length;
      const lx = cx + Math.cos(angle) * (radius + 22);
      const ly = cy + Math.sin(angle) * (radius + 22) + 4;
      const anchor = Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end';
      html += `<text class="radar-label" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}">${S.escapeHtml(values[index].attr.name)}</text>`;
    });
    svg.innerHTML = html;
  }

  function buildProfile(student) {
    const attrs = S.normalizeAttrs(student.profile && student.profile.attrs);
    const values = attrValues(attrs);
    const assessed = values.filter((item) => !item.empty);
    const gradedCount = Math.round(values.reduce((sum, item) => sum + (item.stat.t || 0), 0));
    const tasks = (student.tasks || []).filter((task) => task.status === 'done');
    const scored = tasks.filter(hasScore);
    const avgScore = scored.length ? Math.round(mean(scored.map((task) => Number(task.score)))) : null;
    const checkins = student.profile && Array.isArray(student.profile.checkins) ? student.profile.checkins : [];
    const streak = S.streakFromCheckins(checkins);
    const cutoff = S.addDays(S.todayIso(), -29);
    const active30 = checkins.filter((date) => String(date).slice(0, 10) >= cutoff).length;
    const reportDays = reportDaysOf(student);

    const assigned = (data.assignments || []).filter((assignment) => (assignment.studentIds || []).includes(student.id));
    const assignedCount = assigned.length;
    const doneAssigned = assigned.filter((assignment) => tasks.some((task) => task.id === assignment.id)).length;
    const submitRate = assignedCount ? doneAssigned / assignedCount : (tasks.length ? 1 : null);

    const blockAgg = {};
    const reviewAgg = {};
    const allReviews = [];
    tasks.forEach((task) => {
      (task.blockStats || []).forEach((block) => {
        if (!block || !block.total) return;
        const key = block.type || 'other';
        if (!blockAgg[key]) blockAgg[key] = { total: 0, correct: 0, label: block.label || S.blockLabel(key) };
        blockAgg[key].total += Number(block.total) || 0;
        blockAgg[key].correct += Number(block.correct) || 0;
      });
      (task.review || []).forEach((review) => {
        const key = review.type || 'other';
        if (!reviewAgg[key]) reviewAgg[key] = { total: 0, wrong: 0, blank: 0, label: S.blockLabel(key) };
        reviewAgg[key].total += 1;
        if (!review.ok) {
          reviewAgg[key].wrong += 1;
          if (!String(review.userAnswer || '').trim()) reviewAgg[key].blank += 1;
        }
        allReviews.push(review);
      });
    });

    const blockRows = Object.entries(blockAgg).map(([type, data2]) => ({
      type,
      label: data2.label,
      total: data2.total,
      correct: data2.correct,
      accuracy: data2.total ? Math.round((data2.correct / data2.total) * 100) : null
    })).filter((row) => row.total > 0).sort((a, b) => a.accuracy - b.accuracy);

    const reviewRows = Object.entries(reviewAgg).map(([type, data2]) => ({
      type,
      label: data2.label,
      total: data2.total,
      wrong: data2.wrong,
      blank: data2.blank,
      accuracy: data2.total ? Math.round(((data2.total - data2.wrong) / data2.total) * 100) : null
    })).filter((row) => row.total > 0).sort((a, b) => a.accuracy - b.accuracy);

    const wrongReviews = allReviews.filter((review) => !review.ok).slice(-15).reverse();
    const totalReviews = allReviews.length;
    const wrongCount = allReviews.filter((review) => !review.ok).length;
    const blankCount = allReviews.filter((review) => !review.ok && !String(review.userAnswer || '').trim()).length;

    const sortedAttrs = assessed.slice().sort((a, b) => b.value - a.value);
    const strengths = sortedAttrs.filter((item) => item.value >= sortedAttrs[0].value - 5).slice(0, 2);
    const weaknessCutoff = sortedAttrs[0].value - 10;
    const weaknesses = sortedAttrs.filter((item) => item.value <= weaknessCutoff).slice(-2).reverse();
    const gap = assessed.length >= 2 ? sortedAttrs[0].value - sortedAttrs[sortedAttrs.length - 1].value : 0;
    const styleTitle = assessed.length < 2
      ? '样本尚少，暂不判定'
      : gap >= 12 ? `${ATTR_STYLE[sortedAttrs[0].attr.key] || sortedAttrs[0].attr.name}优势型` : '均衡发展型';

    const blockTotal = blockRows.reduce((sum, row) => sum + row.total, 0);
    const highTotal = blockRows
      .filter((row) => ['reading', 'five', 'writing', 'cloze'].includes(row.type))
      .reduce((sum, row) => sum + row.total, 0);
    const bloomHighRatio = blockTotal ? highTotal / blockTotal : null;
    const bloomLabel = bloomHighRatio == null
      ? '任务样本不足'
      : bloomHighRatio >= 0.6
        ? '以理解、分析、表达类任务为主'
        : bloomHighRatio >= 0.35
          ? '基础应用与分析类任务混合'
          : '以基础识记与应用类任务为主';

    const chronological = scored.slice().sort((a, b) => String(a.submittedAt || '').localeCompare(String(b.submittedAt || '')));
    let trend = null;
    if (chronological.length >= 4) {
      const recent = chronological.slice(-3).map((task) => Number(task.score));
      const previous = chronological.slice(-6, -3).map((task) => Number(task.score));
      if (previous.length) {
        const delta = Math.round(mean(recent) - mean(previous));
        trend = { delta, label: delta >= 5 ? '上升' : delta <= -5 ? '下滑' : '平稳' };
      }
    }

    const risks = [];
    if (reportDays == null) risks.push('尚未导入任何汇报，画像缺少最新数据。');
    else if (reportDays > 7) risks.push(`已有 ${reportDays} 天没有收到新汇报。`);
    if (avgScore != null && avgScore < 60) risks.push(`平均正确率 ${avgScore}%，基础知识或答题策略需要优先补位。`);
    if (trend && trend.delta <= -8) risks.push(`最近三次任务比之前低 ${Math.abs(trend.delta)} 个百分点，存在下滑。`);
    if (streak === 0 && active30 < 2) risks.push('近 30 天打卡少于 2 天，学习节奏尚未稳定。');
    if (!tasks.some((task) => String(task.writing || '').trim())) risks.push('尚无书面表达样本，写作维度只能按完成度估算。');

    const weakest = assessed.length ? assessed.slice().sort((a, b) => a.value - b.value)[0] : null;
    const targetLow = weakest ? Math.min(100, weakest.value + 10) : null;
    const targetHigh = weakest ? Math.min(100, weakest.value + 22) : null;
    const suggestedTypes = weakest ? (ATTR_TASKS[weakest.attr.key] || []) : [];
    const difficulties = tasks.map((task) => Number(task.avgDifficulty)).filter((value) => Number.isFinite(value) && value > 0);
    const baseDifficulty = difficulties.length ? Math.round(mean(difficulties)) : null;
    const diffMin = baseDifficulty == null ? null : clamp(baseDifficulty, 1, 8);
    const diffMax = diffMin == null ? null : clamp(diffMin + 2, diffMin, 10);

    const zpd = weakest ? {
      attr: weakest,
      targetLow,
      targetHigh,
      types: suggestedTypes,
      diffMin,
      diffMax
    } : null;

    const name = S.escapeHtml(student.name);
    const grade = student.grade ? S.escapeHtml(student.grade) : '未标注年级';
    const level = S.levelInfo(xpOfStudent(student));

    const reportText = reportDays == null
      ? '还没有导入过学习汇报。'
      : reportDays === 0 ? '今天刚收到学习汇报。' : `最近一次汇报在 ${reportDays} 天前。`;
    let html = `<h4>一、学习状态</h4><p>${name} 目前在 ${grade}，累计 ${level.level} 级（${xpOfStudent(student)} EXP，${level.rank}）。近 30 天打卡 ${active30} 天，当前连击 ${streak} 天；已完成 ${tasks.length} 次任务${avgScore == null ? '' : `，平均正确率 ${avgScore}%`}。${reportText}</p>`;

    html += `<h4>二、认知结构</h4>`;
    if (assessed.length >= 2) {
      html += `<p>五维评估累计约 ${gradedCount} 道可判分题目，整体呈<strong>${S.escapeHtml(styleTitle)}</strong>。${strengths.length ? `相对优势在${strengths.map((item) => S.escapeHtml(item.attr.name)).join('、')}；` : ''}${weaknesses.length ? `当前短板在${weaknesses.map((item) => S.escapeHtml(item.attr.name)).join('、')}。` : '暂无明显短板。'}</p>`;
      html += `<ul>${strengths.map((item) => `<li>${S.escapeHtml(item.attr.name)}：${item.value}/100（正确率 ${item.value}%）</li>`).join('')}`;
      if (weakest) html += `<li>最需要补位：${S.escapeHtml(weakest.attr.name)} ${weakest.value}/100</li>`;
      html += `</ul>`;
    } else if (assessed.length === 1) {
      html += `<p>目前只有<strong>${S.escapeHtml(assessed[0].attr.name)}</strong>一项有足够样本（${assessed[0].value}/100），暂不做强弱对比。再完成一份含单选、阅读和写作的任务，画像会更稳定。</p>`;
    } else {
      html += `<p>还没有足够的答题记录。先导入一次汇报，或让学生完成一份带答案的任务。</p>`;
    }

    html += `<h4>三、错误类型</h4>`;
    if (reviewRows.length && wrongCount === 0) {
      html += `<p>可判分题目 ${totalReviews} 道，本次没有错题。样本仍然偏少，建议继续观察不同题型，不要只凭一次满分判断已经掌握。</p>`;
      html += `<ul>${reviewRows.slice(0, 4).map((row) => `<li>${S.escapeHtml(row.label)}：${row.total}/${row.total} 正确</li>`).join('')}</ul>`;
    } else if (reviewRows.length) {
      const worst = reviewRows[0];
      html += `<p>可判分题目 ${totalReviews} 道，错 ${wrongCount} 道，其中 ${blankCount} 道未作答。错误最集中的是<strong>${S.escapeHtml(worst.label)}</strong>（正确率 ${worst.accuracy}%）。</p>`;
      html += `<ul>${reviewRows.slice(0, 4).map((row) => `<li>${S.escapeHtml(row.label)}：${row.total - row.wrong}/${row.total} 正确，错 ${row.wrong} 道，空白 ${row.blank} 道</li>`).join('')}</ul>`;
    } else {
      html += `<p>目前没有可自动判分的错题记录。可能是任务未附答案，或学生尚未提交。</p>`;
    }
    html += `<p>任务结构：${S.escapeHtml(bloomLabel)}${bloomHighRatio == null ? '' : `（理解/分析/表达类约占 ${Math.round(bloomHighRatio * 100)}%）`}。这只能说明练了什么，不等于 cognitive level 的正式测评。</p>`;

    html += `<h4>四、最近发展区</h4>`;
    if (zpd) {
      html += `<p>当前最值得投入的是<strong>${S.escapeHtml(zpd.attr.attr.name)}</strong>（${zpd.attr.value}/100）。建议把下一阶段目标设在 ${zpd.targetLow}–${zpd.targetHigh} 分，优先安排${zpd.types.map((type) => S.escapeHtml(type)).join('、') || '对应题型'}${zpd.diffMin == null ? '' : `，难度控制在 ${zpd.diffMin}–${zpd.diffMax} 级`}。单次 8–12 题，限时 20–25 分钟，做完立刻回看错题。</p>`;
    } else {
      html += `<p>样本不足，暂时无法定位最近发展区。建议先完成一份 10 题左右、附答案的任务。</p>`;
    }

    html += `<h4>五、教学建议</h4><ul>`;
    const weakKey = weakest ? weakest.attr.key : '';
    if (weakKey === 'vocab') {
      html += `<li>每日 10 个词 + 3 个固定搭配，次日用默写表复现；在单选和完形里做词义辨析，而不是孤立背单词。</li>`;
    } else if (weakKey === 'grammar') {
      html += `<li>用错题做“一句一改”：先标考点，再改形式，最后口头解释为什么；每周加一次语法填空。</li>`;
    } else if (weakKey === 'reading') {
      html += `<li>先读题干圈关键词，再回原文找证据句；每篇用一句话写主旨，训练整体理解。</li>`;
    } else if (weakKey === 'writing') {
      html += `<li>先背 2 个可迁移句式，再做 15 分钟限时写作（60–80 词）；面批时只抓 3 个问题，避免一次改太多。</li>`;
    } else if (weakKey === 'listening') {
      html += `<li>每日 5 分钟跟读或听写，先抓关键词和语气，再补细节；情景交际题先判断说话人关系。</li>`;
    } else {
      html += `<li>先补一份带答案的基础任务，建立可比较的样本，再决定主攻方向。</li>`;
    }
    html += `<li>错题二刷：隔 3 天重做一次，只看题干不看答案；能做对才算真正掌握。</li>`;
    html += `<li>保持打卡节奏。连击比单次题量更能预测长期进步。</li>`;
    html += `<li>每周固定收一次汇报码，让画像随数据更新，而不是凭一次考试下结论。</li>`;
    html += `</ul>`;

    if (risks.length) {
      html += `<h4>六、需要留意</h4><ul>${risks.slice(0, 4).map((risk) => `<li>${S.escapeHtml(risk)}</li>`).join('')}</ul>`;
    }

    html += `<p class="hint">画像依据：本机答题记录、打卡与任务完成情况；分析框架参考 Bloom 认知目标分类（1956；Anderson &amp; Krathwohl, 2001）、Zimmerman 自我调节学习（2002）、Vygotsky 最近发展区（1978）与 Black &amp; Wiliam 形成性评价（1998）。样本少于 10 题时只作方向性参考，不替代教师面谈、课堂观察与正式测评。</p>`;

    const plain = [
      `学生：${student.name}（${student.grade || '未标注年级'}），${level.level} 级 ${level.rank}，${xpOfStudent(student)} EXP。`,
      `近 30 天打卡 ${active30} 天，当前连击 ${streak} 天；完成任务 ${tasks.length} 次${avgScore == null ? '' : `，平均正确率 ${avgScore}%`}；最近汇报 ${reportDays == null ? '无' : reportDays + ' 天前'}。`,
      assessed.length ? `五维：${assessed.map((item) => `${item.attr.name} ${item.value}`).join('，')}；风格：${styleTitle}。` : '五维：样本不足。',
      reviewRows.length ? `错题：${reviewRows.map((row) => `${row.label} 正确率 ${row.accuracy}%`).join('；')}。` : '错题：暂无。',
      zpd ? `最近发展区：${zpd.attr.attr.name}，目标 ${zpd.targetLow}–${zpd.targetHigh}，优先 ${zpd.types.join('、')}。` : '最近发展区：样本不足。',
      risks.length ? `风险：${risks.join(' ')}` : '风险：暂无明显风险。'
    ].join('\n');

    return {
      attrs, values, assessed, gradedCount, tasks, avgScore, streak, active30, submitRate, reportDays,
      blockRows, reviewRows, wrongReviews, totalReviews, wrongCount, blankCount,
      strengths, weaknesses, styleTitle, bloomLabel, bloomHighRatio, trend, risks, zpd, html, plain
    };
  }

  function aiPromptFor(student, profile) {
    const taskLines = (profile.tasks || []).slice(-10).map((task) => ({
      title: task.title || '',
      score: task.score,
      correct: task.correct,
      total: task.total,
      timeSpent: task.timeSpent,
      submittedAt: task.submittedAt,
      avgDifficulty: task.avgDifficulty || null,
      blockStats: (task.blockStats || []).map((block) => ({ type: block.type, label: block.label, total: block.total, correct: block.correct }))
    }));
    const wrongSamples = (profile.wrongReviews || []).slice(-12).map((review) => ({
      number: review.n,
      type: review.type,
      userAnswer: review.userAnswer,
      correctAnswer: review.correctAnswer,
      explanation: String(review.explanation || '').slice(0, 160)
    }));
    const payload = {
      student: {
        name: student.name,
        grade: student.grade,
        level: S.levelInfo(xpOfStudent(student)).level,
        xp: xpOfStudent(student),
        streak: profile.streak,
        active30: profile.active30,
        avgScore: profile.avgScore,
        submitRate: profile.submitRate,
        reportDays: profile.reportDays,
        teacherNote: student.note || ''
      },
      attributes: profile.assessed.map((item) => ({ name: item.attr.name, score: item.value, attempts: Math.round(item.stat.t) })),
      style: profile.styleTitle,
      bloom: { label: profile.bloomLabel, highOrderRatio: profile.bloomHighRatio },
      errorPatterns: profile.reviewRows,
      tasks: taskLines,
      wrongSamples,
      localProfile: profile.plain
    };
    return [
      '你是一位英语学习认知诊断与学习画像分析专家，服务对象是初高中一对一英语老师。请基于下面的学习数据，做一份可执行、不过度贴标签的学生画像。',
      '',
      '【分析框架】',
      '1. 认知诊断：区分知识（词汇、语法）、技能（阅读、写作、听说）与答题策略；用证据说话。',
      '2. 布鲁姆认知层次：识别学生当前任务主要集中在识记、理解、应用、分析、评价、创造中的哪几层。',
      '3. 自我调节学习：观察打卡连续性、任务提交率、用时与错误修正，判断计划、监控与坚持程度。',
      '4. 最近发展区：指出“跳一跳够得着”的下一目标，给出难度与题量建议。',
      '5. 形成性评价：把画像当作下一步教学的假设，不当作固定标签。',
      '',
      '【输出要求】',
      '请用中文输出，分六部分：',
      '一、画像摘要（3–4 句，先结论后证据）',
      '二、认知结构（强项、短板、可能的知识缺口）',
      '三、错误模式（按题型归纳，不逐题复述）',
      '四、学习行为与自我调节（打卡、提交、用时、趋势）',
      '五、风险与误判提醒（哪些结论证据不足）',
      '六、未来两周教学处方（任务类型、难度、题量、频次、批改重点）',
      '最后附一段“给家长的话”，不超过 120 字，客观、不制造焦虑。',
      '',
      '【学生数据】',
      JSON.stringify(payload, null, 2),
      '',
      '注意：数据来自学生本机记录，可能不完整；请明确标注推断与证据的边界。不要建议任何需要上传学生隐私的平台。'
    ].join('\n');
  }

  /* ------------------------------- 学生详情 ------------------------------- */

  function openDetail(id) {
    const student = getStudent(id);
    if (!student) { S.toast('找不到这个学生。', 'error'); return; }
    detailStudentId = student.id;
    $('#teacher-app').hidden = true;
    $('#student-detail').hidden = false;
    renderDetail();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeDetail() {
    detailStudentId = null;
    $('#student-detail').hidden = true;
    $('#teacher-app').hidden = false;
    renderAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderDetail() {
    const student = getStudent(detailStudentId);
    if (!student) { closeDetail(); return; }
    $('#detail-avatar').textContent = student.avatar || '🦊';
    $('#detail-name').textContent = student.name;
    $('#detail-id').textContent = student.id;
    $('#detail-grade').textContent = student.grade || '未标注';
    $('#student-notes').value = student.note || '';
    $('#ai-result').value = student.aiAnalysis || '';

    const level = S.levelInfo(xpOfStudent(student));
    const avgScore = scoreOfStudent(student);
    const done = doneTaskCount(student);
    $('#detail-stats').innerHTML =
      `<div class="stat-tile" style="--tile-color:var(--red)"><b>Lv.${level.level}</b><span>${S.escapeHtml(level.rank)}</span></div>` +
      `<div class="stat-tile" style="--tile-color:var(--gold)"><b>${streakOfStudent(student)}</b><span>连续打卡天数</span></div>` +
      `<div class="stat-tile" style="--tile-color:var(--blue)"><b>${avgScore == null ? '—' : avgScore + '%'}</b><span>任务平均正确率</span></div>` +
      `<div class="stat-tile" style="--tile-color:var(--green)"><b>${done}</b><span>已完成任务</span></div>`;

    const profile = buildProfile(student);
    renderRadar($('#detail-radar'), $('#detail-attrs'), profile.attrs);
    $('#profile-text').innerHTML = profile.html;

    const confidence = $('#profile-confidence');
    const n = profile.gradedCount;
    confidence.textContent = n < 10 ? `样本 ${n} 题 · 偏低` : n < 30 ? `样本 ${n} 题 · 中等` : `样本 ${n} 题 · 较充分`;
    confidence.className = 'confidence-chip ' + (n < 10 ? 'low' : n < 30 ? 'mid' : 'ok');

    renderDetailTasks(student, profile);
    renderDetailReports(student);
  }

  function renderDetailTasks(student, profile) {
    const tasks = (student.tasks || []).slice().sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
    if (!tasks.length) {
      $('#detail-task-table').innerHTML = emptyState('还没有任务记录', '导入汇报后，任务历史会出现在这里。');
      return;
    }
    const rows = tasks.map((task) => {
      const score = hasScore(task) ? `${task.score}%` : '待批';
      const minutes = task.timeSpent ? Math.max(1, Math.round(task.timeSpent / 60)) : null;
      return `<tr>` +
        `<td><strong>${S.escapeHtml(task.title || '任务')}</strong></td>` +
        `<td>${S.escapeHtml(task.submittedAt ? S.fmtDate(task.submittedAt) : '—')}</td>` +
        `<td><b>${score}</b></td>` +
        `<td>${task.correct == null ? '—' : `${task.correct}/${task.total || 0}`}</td>` +
        `<td>${minutes == null ? '—' : minutes + '′'}</td>` +
      `</tr>`;
    }).join('');
    let html = `<table class="history-table"><thead><tr><th>任务</th><th>提交</th><th>得分</th><th>答对</th><th>用时</th></tr></thead><tbody>${rows}</tbody></table>`;

    if (profile.wrongReviews.length) {
      html += `<h3 class="dialog-subtitle" style="margin-top:20px;">最近错题</h3>` +
        `<table class="history-table"><thead><tr><th>题号</th><th>题型</th><th>学生答案</th><th>正确答案</th></tr></thead><tbody>` +
        profile.wrongReviews.slice(0, 10).map((review) => (
          `<tr><td>${S.escapeHtml(review.n || '—')}</td>` +
          `<td>${S.escapeHtml(S.blockLabel(review.type))}</td>` +
          `<td>${S.escapeHtml(review.userAnswer || '未作答')}</td>` +
          `<td><b>${S.escapeHtml(review.correctAnswer || '—')}</b></td></tr>`
        )).join('') +
        `</tbody></table>`;
    }
    $('#detail-task-table').innerHTML = html;
  }

  function renderDetailReports(student) {
    const reports = (student.reports || []).slice().sort((a, b) => String(b.generatedAt || '').localeCompare(String(a.generatedAt || '')));
    $('#detail-report-list').innerHTML = reports.length
      ? reports.map((report) => (
        `<div class="report-feed-item">` +
          `<span class="feed-avatar">${S.escapeHtml(student.avatar || '🦊')}</span>` +
          `<div class="feed-copy"><strong>${S.escapeHtml(S.fmtDateTime(report.generatedAt))}</strong>` +
          `<small>${report.taskCount || 0} 个任务 · 连击 ${report.checkinStreak || 0} 天</small></div>` +
          `<span class="feed-score">${report.avgScore == null ? '—' : report.avgScore + '%'}</span>` +
        `</div>`
      )).join('')
      : emptyState('还没有汇报记录', '学生生成汇报码后，老师导入即可。');
  }

  /* ------------------------------- AI 辅助 ------------------------------- */

  async function copyAiPrompt() {
    const student = getStudent(detailStudentId);
    if (!student) return;
    const profile = buildProfile(student);
    try {
      await S.copyText(aiPromptFor(student, profile));
      S.toast('提示词已复制。打开豆包 / DeepSeek，粘贴后发送即可。', 'ok', 5000);
    } catch (error) {
      S.toast('复制失败，请手动选择文本。', 'error');
    }
  }

  function saveAiResult() {
    const student = getStudent(detailStudentId);
    if (!student) return;
    student.aiAnalysis = $('#ai-result').value.trim();
    save();
    S.toast('AI 分析已保存到本机。', 'ok');
  }

  function saveNotes() {
    const student = getStudent(detailStudentId);
    if (!student) return;
    student.note = $('#student-notes').value;
    save();
    S.toast('教师备注已保存。', 'ok');
  }

  /* ------------------------------- 备份与恢复 ------------------------------- */

  async function buildBackupCode() {
    if (!data) return '';
    return S.packCode({
      v: 1,
      kind: 'teacher-backup',
      createdAt: S.nowIso(),
      teacherName: data.teacherName,
      pinHash: data.pinHash,
      students: data.students,
      assignments: data.assignments
    });
  }

  async function openBackup() {
    try {
      const code = await buildBackupCode();
      $('#backup-code-output').value = code;
      S.openDialog($('#backup-dialog'));
    } catch (error) {
      S.toast(error.message || '备份码生成失败。', 'error');
    }
  }

  async function restoreTeacher() {
    const code = $('#teacher-restore-code').value.trim();
    const pin = $('#teacher-restore-pin').value.trim();
    if (!code) { S.toast('先粘贴备份码。', 'error'); return; }
    if (!/^[A-Za-z0-9]{6,16}$/.test(pin)) { S.toast('输入备份时的教师密码（6–16 位）。', 'error'); return; }
    if (data && !window.confirm('恢复会覆盖这台电脑上现有的教师端数据，确定继续吗？')) return;
    let payload;
    try {
      payload = await S.unpackCode(code);
    } catch (error) {
      S.toast(error.message || '备份码无法识别。', 'error', 5000);
      return;
    }
    if (!payload || payload.kind !== 'teacher-backup') {
      S.toast('这不是教师端备份码。', 'error');
      return;
    }
    const hash = await S.sha256Hex(`teacher|${pin}`);
    if (hash !== payload.pinHash) {
      S.toast('教师密码与备份不匹配。', 'error', 5000);
      return;
    }
    data = {
      v: 1,
      teacherName: payload.teacherName || '阮老师',
      pinHash: payload.pinHash,
      createdAt: payload.createdAt || S.nowIso(),
      students: (payload.students || []).map(normalizeStudent).filter((student) => student.id),
      assignments: Array.isArray(payload.assignments) ? payload.assignments : []
    };
    sessionPin = pin;
    save();
    S.closeDialog($('#teacher-restore-dialog'));
    showApp();
    S.toast('教师端已恢复。', 'ok');
  }

  function clearTeacher() {
    if (!window.confirm('清空这台电脑上的教师端数据？学生端档案不会受影响。')) return;
    if (!window.confirm('最后确认：学生名册、汇报和任务记录都会删除，且无法撤销。')) return;
    try { localStorage.removeItem(STORAGE_KEY); } catch (error) { /* ignore */ }
    data = null;
    sessionPin = '';
    detailStudentId = null;
    showAuth();
    S.toast('教师端数据已清空。');
  }

  function saveSettings() {
    const name = $('#setting-teacher-name').value.trim() || '阮老师';
    const oldPin = $('#setting-old-pin').value.trim();
    const newPin = $('#setting-new-pin').value.trim();
    if (!oldPin) { S.toast('先输入当前教师密码。', 'error'); return; }
    S.sha256Hex(`teacher|${oldPin}`).then((hash) => {
      if (hash !== data.pinHash) { S.toast('当前密码不对。', 'error'); return; }
      if (newPin && !/^[A-Za-z0-9]{6,16}$/.test(newPin)) { S.toast('新密码用 6–16 位字母或数字。', 'error'); return; }
      data.teacherName = name;
      if (newPin) {
        return S.sha256Hex(`teacher|${newPin}`).then((newHash) => {
          data.pinHash = newHash;
          sessionPin = newPin;
          save();
          $('#setting-old-pin').value = '';
          $('#setting-new-pin').value = '';
          renderAll();
          S.toast('设置已保存，教师密码已更新。', 'ok');
        });
      }
      save();
      $('#setting-old-pin').value = '';
      renderAll();
      S.toast('设置已保存。', 'ok');
      return null;
    });
  }

  /* ------------------------------- 事件绑定 ------------------------------- */

  function bindStudentCardOpen(container) {
    container.addEventListener('click', (event) => {
      const card = event.target.closest('[data-student-id]');
      if (card) openDetail(card.dataset.studentId);
    });
    container.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const card = event.target.closest('[data-student-id]');
      if (!card) return;
      event.preventDefault();
      openDetail(card.dataset.studentId);
    });
  }

  function bindEvents() {
    $('#teacher-setup-btn').addEventListener('click', setupTeacher);
    $('#teacher-login-btn').addEventListener('click', loginTeacher);
    $('#teacher-pin').addEventListener('keydown', (event) => { if (event.key === 'Enter') loginTeacher(); });
    $('#teacher-logout').addEventListener('click', lockConsole);

    $('#teacher-restore-link').addEventListener('click', () => S.openDialog($('#teacher-restore-dialog')));
    $('#teacher-restore-link-2').addEventListener('click', () => S.openDialog($('#teacher-restore-dialog')));
    $('#teacher-restore-open').addEventListener('click', () => S.openDialog($('#teacher-restore-dialog')));
    $('#teacher-restore-btn').addEventListener('click', restoreTeacher);

    $('#nav-assign').addEventListener('click', () => openAssign(null));
    $('#nav-import').addEventListener('click', () => {
      $('#import-report-code').value = '';
      S.openDialog($('#import-report-dialog'));
    });
    $('#hero-assign').addEventListener('click', () => openAssign(null));
    $('#hero-import').addEventListener('click', () => {
      $('#import-report-code').value = '';
      S.openDialog($('#import-report-dialog'));
    });
    $('#hero-add').addEventListener('click', () => openStudentDialog(null));
    $('#assignment-add').addEventListener('click', () => openAssign(null));
    $('#report-import').addEventListener('click', () => {
      $('#import-report-code').value = '';
      S.openDialog($('#import-report-dialog'));
    });

    $('#teacher-tabs').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-tab]');
      if (button) switchTab(button.dataset.tab);
    });
    $$('[data-goto]').forEach((button) => {
      button.addEventListener('click', () => switchTab(button.dataset.goto));
    });

    $('#student-add').addEventListener('click', () => openStudentDialog(null));
    $('#student-search').addEventListener('input', renderStudentGrid);
    $('#student-save').addEventListener('click', saveStudent);
    $('#student-delete').addEventListener('click', deleteStudent);

    $('#assign-papers').addEventListener('change', (event) => {
      if (event.target.name === 'assign-paper') {
        assignPaperId = event.target.value;
        updateAssignDefaults();
      }
    });
    $('#assign-generate').addEventListener('click', generateAssignment);

    $('#codes-list').addEventListener('click', async (event) => {
      const button = event.target.closest('[data-copy-index]');
      if (!button) return;
      const item = lastCodes[Number(button.dataset.copyIndex)];
      if (!item || !item.code) return;
      try {
        await S.copyText(item.code);
        S.toast(`${item.student.name} 的任务码已复制。`, 'ok');
      } catch (error) {
        S.toast('复制失败，请手动全选复制。', 'error');
      }
    });
    $('#codes-download').addEventListener('click', () => {
      const text = lastCodes.filter((item) => item.code).map((item) => (
        `【${item.student.name} · ${item.student.id}】\n${item.code}`
      )).join('\n\n');
      S.downloadText(`顺势任务码-${S.todayIso()}.txt`, text);
    });

    $('#import-report-btn').addEventListener('click', importReportCode);

    $('#enroll-copy').addEventListener('click', async () => {
      if (!lastEnroll) return;
      try {
        await S.copyText(lastEnroll.code);
        S.toast('开通码已复制。把学号、密码和开通码一起发给学生。', 'ok');
      } catch (error) {
        S.toast('复制失败，请手动复制。', 'error');
      }
    });
    $('#enroll-download').addEventListener('click', () => {
      if (!lastEnroll) return;
      S.downloadText(`${lastEnroll.student.name}-${lastEnroll.student.id}-开通码.txt`, lastEnroll.code);
    });

    $('#assignment-list').addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const card = button.closest('[data-assignment-id]');
      if (!card) return;
      const assignmentId = card.dataset.assignmentId;
      if (button.dataset.action === 'codes') {
        openCodesForAssignment(assignmentId);
      } else if (button.dataset.action === 'delete') {
        const assignment = data.assignments.find((item) => item.id === assignmentId);
        if (!assignment) return;
        if (!window.confirm(`删除任务《${assignment.title}》？已经发给学生的任务码仍然可用。`)) return;
        data.assignments = data.assignments.filter((item) => item.id !== assignmentId);
        save();
        renderAll();
        S.toast('任务记录已删除。');
      }
    });

    $('#detail-back').addEventListener('click', closeDetail);
    $('#detail-assign').addEventListener('click', () => openAssign(detailStudentId));
    $('#detail-enroll').addEventListener('click', () => openEnroll(detailStudentId));
    $('#detail-edit').addEventListener('click', () => openStudentDialog(detailStudentId));
    $('#detail-tabs').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-detail-tab]');
      if (!button) return;
      $$('#detail-tabs button').forEach((item) => item.classList.toggle('active', item === button));
      $$('.detail-pane').forEach((pane) => pane.classList.toggle('active', pane.dataset.detailPane === button.dataset.detailTab));
    });
    $('#copy-ai-prompt').addEventListener('click', copyAiPrompt);
    $('#save-ai-result').addEventListener('click', saveAiResult);
    $('#save-notes').addEventListener('click', saveNotes);

    $('#teacher-backup').addEventListener('click', openBackup);
    $('#backup-copy').addEventListener('click', async () => {
      try {
        await S.copyText($('#backup-code-output').value);
        S.toast('备份码已复制，请妥善保管。', 'ok');
      } catch (error) {
        S.toast('复制失败，请手动复制。', 'error');
      }
    });
    $('#backup-download').addEventListener('click', () => {
      S.downloadText(`顺势教师端备份-${S.todayIso()}.txt`, $('#backup-code-output').value);
    });
    $('#settings-save').addEventListener('click', saveSettings);
    $('#teacher-clear').addEventListener('click', clearTeacher);

    bindStudentCardOpen($('#overview-students'));
    bindStudentCardOpen($('#student-grid'));
    bindStudentCardOpen($('#recent-reports'));
    bindStudentCardOpen($('#report-list'));
    bindStudentCardOpen($('#todo-list'));

    S.bindDialogClose(document);
  }

  function init() {
    bindEvents();
    showAuth();
  }

  init();
})();
