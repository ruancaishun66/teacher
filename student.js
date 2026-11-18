/* ==========================================================================
   顺势 · 学生端
   本机档案 + 任务码 / 汇报码，不依赖服务器。
   ========================================================================== */
(function () {
  'use strict';

  const S = window.Shunshi;
  const $ = S.$;
  const $$ = S.$$;
  const STORAGE_KEY = 'shunshi.student.v1';

  let data = loadData();
  let sessionPin = '';
  let activeTaskId = null;
  let taskStartedAt = 0;
  let timerId = null;
  let saveTimer = null;

  function loadData() {
    const raw = S.getJSON(STORAGE_KEY, null);
    if (!raw || !raw.profile || !raw.profile.id) return null;
    raw.v = 1;
    raw.profile.attrs = S.normalizeAttrs(raw.profile.attrs);
    raw.profile.checkins = Array.isArray(raw.profile.checkins) ? raw.profile.checkins.map((x) => String(x).slice(0, 10)) : [];
    raw.profile.badges = Array.isArray(raw.profile.badges) ? raw.profile.badges : [];
    raw.profile.xp = Math.max(0, Number(raw.profile.xp) || 0);
    raw.tasks = Array.isArray(raw.tasks) ? raw.tasks.filter((task) => task && task.id) : [];
    return raw;
  }

  function save() {
    if (!data) return;
    S.setJSON(STORAGE_KEY, data);
  }

  function profile() { return data && data.profile; }

  function findTask(id) { return data && data.tasks.find((task) => task.id === id) || null; }

  function taskQuestionCount(task) {
    let count = 0;
    (task.blocks || []).forEach((block) => {
      if (block.type === 'writing' || block.prompt) count += 1;
      else count += (block.questions || []).length;
    });
    return count || 1;
  }

  function taskAvgDifficulty(task) {
    const levels = [];
    (task.blocks || []).forEach((block) => {
      (block.questions || []).forEach((question) => {
        const value = Number(question.difficulty);
        if (value >= 1 && value <= 10) levels.push(value);
      });
    });
    return levels.length
      ? Math.round((levels.reduce((sum, value) => sum + value, 0) / levels.length) * 10) / 10
      : null;
  }

  function answeredCount(task) {
    let count = 0;
    (task.blocks || []).forEach((block) => {
      if (block.type === 'writing' || block.prompt) {
        if (String(task.answers && task.answers[`writing:${block.id}`] || '').trim()) count += 1;
      } else {
        (block.questions || []).forEach((question) => {
          const key = question.id || `${block.id}-q${question.n}`;
          if (String(task.answers && task.answers[key] || '').trim()) count += 1;
        });
      }
    });
    return count;
  }

  /* ------------------------------- 登录 ------------------------------- */

  function showAuth() {
    $('#auth-view').hidden = false;
    $('#app-view').hidden = true;
    $('#user-area').hidden = true;
    if (profile()) {
      $('#setup-card').hidden = true;
      $('#login-card').hidden = false;
      $('#login-avatar').textContent = profile().avatar || '🦊';
      $('#login-name').textContent = profile().name || '学习者';
      $('#login-id').textContent = profile().id || '';
      $('#login-pin').value = '';
      setTimeout(() => $('#login-pin').focus(), 80);
    } else {
      $('#setup-card').hidden = false;
      $('#login-card').hidden = true;
      resetSetupView();
    }
  }

  function setSetupExpanded(expanded) {
    $('#manual-fields').hidden = !expanded;
    $('#auth-extra').hidden = !expanded;
    $('#manual-toggle').setAttribute('aria-expanded', expanded ? 'true' : 'false');
    const enrolled = $('#setup-card').dataset.enrolled === '1';
    $('#manual-toggle-text').textContent = expanded ? (enrolled ? '收起资料' : '收起手动填写') : (enrolled ? '查看已带入的资料' : '手动填写资料');
  }

  function resetSetupView() {
    const card = $('#setup-card');
    card.dataset.enrolled = '0';
    $('#enroll-state').hidden = true;
    $('#enrolled-pin').textContent = '—';
    $('#auth-divider').hidden = false;
    $('#setup-id').readOnly = false;
    $('#setup-pin').readOnly = false;
    $('#setup-pin-hint').textContent = '密码用 4–12 位字母或数字，记牢，之后每次进入都要用。';
    $('#setup-btn').textContent = '创建档案，开始升级';
    setSetupExpanded(false);
  }

  function useEnrolledSetup() {
    $('#setup-card').dataset.enrolled = '1';
    $('#enroll-state').hidden = false;
    $('#enrolled-pin').textContent = $('#setup-pin').value || '—';
    $('#auth-divider').hidden = true;
    $('#setup-id').readOnly = true;
    $('#setup-pin').readOnly = true;
    $('#setup-pin-hint').textContent = '密码由老师的开通码带入，请不要修改；改了老师会对不上你的汇报。';
    $('#setup-btn').textContent = '确认信息，创建档案';
    setSetupExpanded(true);
  }

  function showApp() {
    $('#auth-view').hidden = true;
    $('#app-view').hidden = false;
    $('#user-area').hidden = false;
    renderAll();
  }

  async function handleSetup() {
    const name = $('#setup-name').value.trim();
    const id = $('#setup-id').value.trim().toUpperCase().replace(/\s+/g, '');
    const pin = $('#setup-pin').value.trim();
    const grade = $('#setup-grade').value;
    const avatar = ($('input[name="avatar"]:checked') || {}).value || '🦊';
    if (!name) { S.toast('先写一下你的名字。', 'error'); return; }
    if (!/^[A-Z0-9_-]{3,24}$/.test(id)) { S.toast('学号只能包含字母、数字、横线，3–24 位。', 'error'); return; }
    if (!/^[A-Za-z0-9]{4,12}$/.test(pin)) { S.toast('密码用 4–12 位字母或数字。', 'error'); return; }
    const pinHash = await S.sha256Hex(`${id}|${pin}`);
    data = {
      v: 1,
      profile: {
        id,
        name,
        grade,
        avatar,
        pinHash,
        createdAt: S.nowIso(),
        xp: 0,
        attrs: S.emptyAttrs(),
        checkins: [],
        badges: []
      },
      tasks: []
    };
    sessionPin = pin;
    save();
    S.toast('档案建好了，开始今天的第一次打卡吧。', 'ok');
    showApp();
  }

  async function applyEnrollCode() {
    const code = $('#enroll-code-input').value.trim();
    if (!code) { S.toast('先粘贴老师发来的开通码。', 'error'); return; }
    let payload;
    try {
      payload = await S.unpackCode(code);
    } catch (error) {
      S.toast(error.message || '开通码无法识别。', 'error', 5000);
      return;
    }
    if (!payload || payload.kind !== 'enroll' || !payload.studentId || !payload.pin) {
      S.toast('这不是学生开通码，请让老师重新发一份。', 'error');
      return;
    }
    const auth = await S.sha256Hex(`enroll|${payload.studentId}|${payload.pin}`);
    if (auth !== payload.auth) {
      S.toast('开通码校验失败，请让老师重新生成。', 'error', 5000);
      return;
    }
    $('#setup-name').value = payload.name || '';
    $('#setup-id').value = payload.studentId || '';
    $('#setup-pin').value = payload.pin || '';
    const gradeSelect = $('#setup-grade');
    const grade = payload.grade || '';
    if (grade && !Array.from(gradeSelect.options).some((option) => option.value === grade)) {
      const option = document.createElement('option');
      option.value = grade;
      option.textContent = grade;
      gradeSelect.appendChild(option);
    }
    gradeSelect.value = grade;
    const avatar = payload.avatar || '🦊';
    $$('#avatar-picker input').forEach((input) => { input.checked = input.value === avatar; });
    useEnrolledSetup();
    S.closeDialog($('#enroll-dialog'));
    S.toast('资料已带入，确认无误后点“确认信息，创建档案”。', 'ok', 5000);
    setTimeout(() => {
      const button = $('#setup-btn');
      if (button && !button.hidden) button.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 180);
  }

  async function handleLogin() {
    if (!profile()) { showAuth(); return; }
    const pin = $('#login-pin').value.trim();
    if (!pin) { S.toast('请输入密码。', 'error'); return; }
    const hash = await S.sha256Hex(`${profile().id}|${pin}`);
    if (hash !== profile().pinHash) {
      S.toast('密码不对，再试一次。', 'error');
      $('#login-pin').select();
      return;
    }
    sessionPin = pin;
    showApp();
    S.toast(`${profile().name}，欢迎回来。`, 'ok');
  }

  function logout() {
    sessionPin = '';
    activeTaskId = null;
    stopTimer();
    S.closeDialog($('#task-dialog'));
    showAuth();
    S.toast('已退出，档案还留在这台设备上。');
  }

  /* ------------------------------- 首页渲染 ------------------------------- */

  function renderAll() {
    if (!data) return;
    renderHeader();
    renderLevel();
    renderCheckin();
    renderAttrs();
    renderTasks();
    renderBadges();
  }

  function renderHeader() {
    const p = profile();
    $('#user-avatar').textContent = p.avatar || '🦊';
    $('#user-name').textContent = p.name || '学习者';
    $('#user-lv').textContent = `Lv.${S.levelInfo(p.xp).level}`;
  }

  function renderLevel() {
    const info = S.levelInfo(profile().xp);
    $('#level-num').textContent = `Lv.${info.level}`;
    $('#rank-name').textContent = info.rank;
    $('#xp-text').textContent = `${Math.round(info.current)} / ${Math.round(info.need)} EXP`;
    $('#level-ring').style.setProperty('--lv-progress', `${Math.round(info.progress * 100)}%`);
    $('#xp-fill').style.width = `${Math.round(info.progress * 100)}%`;
  }

  function renderCheckin() {
    const p = profile();
    const today = S.todayIso();
    const checked = p.checkins.includes(today);
    const streak = S.streakFromCheckins(p.checkins);
    const gain = 8 + Math.min(streak, 7) * 2;
    const btn = $('#checkin-btn');
    btn.disabled = checked;
    btn.innerHTML = checked
      ? '今日已打卡 <span>✓</span>'
      : `今日打卡 <span id="checkin-xp">+${gain} EXP</span>`;
    $('#streak-num').textContent = streak;
    $('#hero-greet').textContent = `${S.greeting()}，${p.name}`;
    const pending = data.tasks.filter((task) => task.status !== 'done').length;
    let tip = '打卡、完成任务、积累经验。你的每一次练习，都会变成属性面板上的一格。';
    if (pending) tip = `今天有 ${pending} 个任务待完成。先挑一个开始，别让经验条空着。`;
    else if (checked) tip = '今天已经打卡了。保持这个节奏，连击会越来越长。';
    else if (streak) tip = `连击 ${streak} 天，今天再打一次卡就能续上。`;
    $('#hero-tip').textContent = tip;
  }

  function renderAttrs() {
    const attrs = profile().attrs || S.emptyAttrs();
    const values = S.ATTRS.map((attr) => {
      const display = S.attrDisplay(attrs[attr.key]);
      return { attr, ...display };
    });
    const assessed = values.filter((item) => !item.empty).length;
    $('#attr-note').textContent = assessed ? `${assessed} 项已评估` : '完成一次任务后开始评估';
    $('#attr-list').innerHTML = values.map((item) => (
      `<div class="attr-row">` +
        `<span class="attr-name">${item.attr.name}</span>` +
        `<span class="attr-bar"><i style="width:${item.empty ? 0 : item.value}%;--attr-color:${item.attr.color}"></i></span>` +
        `<span class="attr-val">${item.empty ? '—' : item.value}</span>` +
      `</div>`
    )).join('');

    const cx = 100;
    const cy = 100;
    const radius = 72;
    const points = (ratio) => values.map((_, index) => {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / values.length;
      return [cx + Math.cos(angle) * radius * ratio, cy + Math.sin(angle) * radius * ratio];
    });
    const polygon = (list) => list.map((point) => point.map((n) => n.toFixed(1)).join(',')).join(' ');
    const shape = points(1).map((point, index) => {
      const ratio = values[index].empty ? 0 : values[index].value / 100;
      return [cx + (point[0] - cx) * ratio, cy + (point[1] - cy) * ratio];
    });
    let svg = '';
    [0.25, 0.5, 0.75, 1].forEach((ratio) => {
      svg += `<polygon class="radar-grid" points="${polygon(points(ratio))}"></polygon>`;
    });
    points(1).forEach((point) => {
      svg += `<line class="radar-axis" x1="${cx}" y1="${cy}" x2="${point[0].toFixed(1)}" y2="${point[1].toFixed(1)}"></line>`;
    });
    svg += `<polygon class="radar-shape" points="${polygon(shape)}"></polygon>`;
    points(1).forEach((point, index) => {
      const label = values[index].attr.name;
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / values.length;
      const lx = cx + Math.cos(angle) * (radius + 22);
      const ly = cy + Math.sin(angle) * (radius + 22) + 4;
      const anchor = Math.abs(lx - cx) < 8 ? 'middle' : lx > cx ? 'start' : 'end';
      svg += `<text class="radar-label" x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="${anchor}">${S.escapeHtml(label)}</text>`;
    });
    $('#radar').innerHTML = svg;
  }

  function renderTasks() {
    if (!data.tasks.length) {
      $('#task-list').innerHTML = `<div class="empty-state"><strong>还没有任务</strong>把老师发来的任务码粘贴进来，就能开始第一次试炼。</div>`;
      return;
    }
    const tasks = data.tasks.slice().sort((a, b) => {
      if (a.status === b.status) {
        return String(b.submittedAt || b.createdAt || '').localeCompare(String(a.submittedAt || a.createdAt || ''));
      }
      return a.status === 'done' ? 1 : -1;
    });
    const today = S.todayIso();
    $('#task-list').innerHTML = tasks.map((task) => {
      const done = task.status === 'done';
      const overdue = !done && task.due && task.due < today;
      const status = done ? 'done' : overdue ? 'overdue' : 'new';
      const statusText = done ? '已完成' : overdue ? '已过期' : '待完成';
      const scoreText = done && task.score != null ? `得分 <b>${task.score}</b>` : `经验 <b>+${task.xp || 100}</b>`;
      return `<article class="task-card ${done ? 'done' : ''}" data-task-id="${S.escapeHtml(task.id)}" tabindex="0" role="button">` +
        `<div>` +
          `<h3 class="task-title">${S.escapeHtml(task.title || '未命名任务')}</h3>` +
          `<div class="task-meta">` +
            `<span>${S.escapeHtml(task.grade || '未标注')}</span>` +
            `<span>${taskQuestionCount(task)} 题</span>` +
            `<span>${scoreText}</span>` +
            (task.due ? `<span>截止 ${S.escapeHtml(S.fmtDate(task.due))}</span>` : '') +
          `</div>` +
        `</div>` +
        `<span class="status-chip ${status}">${statusText}</span>` +
      `</article>`;
    }).join('');
    $$('#task-list .task-card').forEach((card) => {
      const open = () => openTask(card.dataset.taskId);
      card.addEventListener('click', open);
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
      });
    });
  }

  const BADGES = [
    { id: 'first_checkin', icon: '🔥', name: '初次点火', earned: (p) => p.checkins.length >= 1 },
    { id: 'streak3', icon: '⚡', name: '三连击', earned: (p) => S.streakFromCheckins(p.checkins) >= 3 },
    { id: 'streak7', icon: '🌪️', name: '七日不断', earned: (p) => S.streakFromCheckins(p.checkins) >= 7 },
    { id: 'first_task', icon: '🗡️', name: '初次试炼', earned: (p, tasks) => tasks.some((t) => t.status === 'done') },
    { id: 'perfect', icon: '💯', name: '满分一击', earned: (p, tasks) => tasks.some((t) => t.status === 'done' && t.score === 100 && (t.total || 0) >= 3) },
    { id: 'reader', icon: '📖', name: '阅读行者', earned: (p, tasks) => countDoneBlocks(tasks, ['reading', 'cloze', 'five']) >= 5 },
    { id: 'writer', icon: '✍️', name: '落笔生花', earned: (p, tasks) => countDoneBlocks(tasks, ['writing', 'picture']) >= 3 },
    { id: 'level5', icon: '👑', name: '五星学者', earned: (p) => S.levelInfo(p.xp).level >= 5 }
  ];

  function countDoneBlocks(tasks, types) {
    return tasks.filter((task) => task.status === 'done').reduce((sum, task) => (
      sum + (task.blockStats || []).filter((block) => types.includes(block.type)).length
    ), 0);
  }

  function renderBadges() {
    const p = profile();
    const earned = [];
    BADGES.forEach((badge) => {
      if (badge.earned(p, data.tasks)) earned.push(badge.id);
    });
    if (JSON.stringify(earned) !== JSON.stringify(p.badges || [])) {
      p.badges = earned;
      save();
    }
    $('#badge-count').textContent = `${earned.length} / ${BADGES.length}`;
    $('#badge-grid').innerHTML = BADGES.map((badge) => (
      `<div class="badge ${earned.includes(badge.id) ? 'owned' : ''}" title="${S.escapeHtml(badge.name)}">` +
        `<span class="badge-icon">${badge.icon}</span>` +
        `<span class="badge-name">${S.escapeHtml(badge.name)}</span>` +
      `</div>`
    )).join('');
  }

  /* ------------------------------- 打卡与经验 ------------------------------- */

  function doCheckin() {
    const p = profile();
    const today = S.todayIso();
    if (p.checkins.includes(today)) {
      S.toast('今天已经打过卡了。');
      return;
    }
    const streak = S.streakFromCheckins(p.checkins);
    const gain = 8 + Math.min(streak, 7) * 2;
    p.checkins.push(today);
    addXp(gain);
    save();
    renderAll();
    S.toast(`打卡成功，+${gain} EXP。连击 ${S.streakFromCheckins(p.checkins)} 天。`, 'ok');
  }

  function addXp(amount) {
    const p = profile();
    const before = S.levelInfo(p.xp);
    p.xp = Math.max(0, Number(p.xp) + Number(amount || 0));
    const after = S.levelInfo(p.xp);
    if (after.level > before.level) showLevelUp(after);
    return after;
  }

  function showLevelUp(info) {
    $('#levelup-level').textContent = `Lv.${info.level}`;
    $('#levelup-rank').textContent = info.rank;
    const overlay = $('#levelup');
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden', 'false');
    clearTimeout(showLevelUp.timer);
    showLevelUp.timer = setTimeout(() => {
      overlay.classList.remove('show');
      overlay.setAttribute('aria-hidden', 'true');
    }, 2400);
  }

  /* ------------------------------- 任务答题 ------------------------------- */

  function openTask(id) {
    const task = findTask(id);
    if (!task) return;
    activeTaskId = id;
    taskStartedAt = Date.now();
    S.openDialog($('#task-dialog'));
    renderRunner(task);
    if (task.status !== 'done') startTimer();
    else stopTimer();
  }

  function startTimer() {
    stopTimer();
    timerId = setInterval(() => {
      if (!activeTaskId) return;
      const task = findTask(activeTaskId);
      if (!task || task.status === 'done') return;
      const seconds = Math.floor((Date.now() - taskStartedAt) / 1000);
      $('#runner-sub').textContent = `${task.title || '任务'} · 已用时 ${formatSeconds(seconds)}`;
    }, 1000);
  }

  function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  function formatSeconds(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function renderPassage(text) {
    const blocks = String(text || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
    if (!blocks.length) return '';
    return `<div class="passage">${blocks.map((block) => `<p>${S.escapeHtml(block).replace(/\n/g, '<br>')}</p>`).join('')}</div>`;
  }

  function renderRunner(task) {
    const done = task.status === 'done';
    $('#runner-title').textContent = task.title || '任务';
    $('#runner-sub').textContent = done
      ? `${task.title || '任务'} · 已完成`
      : `${task.title || '任务'} · 已用时 0:00`;
    $('#runner-count').textContent = done ? '已完成' : `${answeredCount(task)} / ${taskQuestionCount(task)}`;
    $('#runner-fill').style.width = done ? '100%' : `${Math.round((answeredCount(task) / taskQuestionCount(task)) * 100)}%`;
    $('#submit-task').hidden = done;
    $('#runner-report').hidden = !done;

    let html = '';
    if (done) html += resultHero(task);
    (task.blocks || []).forEach((block, index) => {
      const label = block.label || `${cnNumber(index)}、${S.blockLabel(block.type)}`;
      html += `<h3 class="block-heading">${S.escapeHtml(label)}</h3>`;
      if (block.passage) html += renderPassage(block.passage);
      if (block.type === 'writing' || block.prompt) {
        const prompt = block.prompt || block.passage || '';
        html += `<div class="writing-box">${S.escapeHtml(prompt)}</div>`;
        const key = `writing:${block.id}`;
        const value = (task.answers || {})[key] || '';
        if (done) {
          html += value
            ? `<div class="review-note" style="margin-top:12px;white-space:pre-wrap;">${S.escapeHtml(value)}</div>`
            : `<p class="hint" style="margin-top:10px;">这道书面表达没有留下文字稿。</p>`;
        } else {
          html += `<textarea class="writing-input" data-writing-block="${S.escapeHtml(block.id)}" placeholder="在这里写作文，自动保存在本机…">${S.escapeHtml(value)}</textarea>`;
        }
        return;
      }
      (block.questions || []).forEach((question) => {
        const qid = question.id || `${block.id}-q${question.n}`;
        const userAnswer = (task.answers || {})[qid] || '';
        const correct = done ? S.isCorrectAnswer(question, userAnswer) : null;
        const cardClass = done && correct === true ? 'correct' : done && correct === false ? 'wrong' : '';
        html += `<article class="question-card ${cardClass}" data-qid="${S.escapeHtml(qid)}">`;
        html += `<p class="q-stem"><span class="q-number">${S.escapeHtml(question.n || '')}</span>${S.escapeHtml(question.stem || '')}</p>`;
        if (Array.isArray(question.options) && question.options.length) {
          html += `<div class="option-grid">`;
          question.options.forEach((option) => {
            const letter = String(option.letter || '').toUpperCase();
            const isCorrect = done && String(question.answer || '').toUpperCase() === letter;
            const isWrong = done && userAnswer.toUpperCase() === letter && !isCorrect;
            const extra = isCorrect ? ' correct' : isWrong ? ' wrong' : '';
            html += `<label class="option${extra}">` +
              `<input type="radio" name="q_${S.escapeHtml(qid)}" value="${S.escapeHtml(letter)}" ${userAnswer.toUpperCase() === letter ? 'checked' : ''} ${done ? 'disabled' : ''}>` +
              `<span class="letter">${S.escapeHtml(letter)}</span>` +
              `<span>${S.escapeHtml(option.text || '')}</span>` +
            `</label>`;
          });
          html += `</div>`;
        } else {
          html += `<input class="text-answer" data-qid="${S.escapeHtml(qid)}" value="${S.escapeHtml(userAnswer)}" placeholder="在这里填写答案" ${done ? 'disabled' : ''}>`;
        }
        if (done) {
          const answerText = String(question.answer || '').trim() || '老师暂未附答案';
          html += `<div class="review-note">` +
            `你的答案：<em>${S.escapeHtml(userAnswer || '未作答')}</em>　·　正确答案：<b>${S.escapeHtml(answerText)}</b>` +
            (question.explanation ? `<br>${S.escapeHtml(question.explanation)}` : '') +
          `</div>`;
        }
        html += `</article>`;
      });
    });
    $('#runner-body').innerHTML = html || `<p class="empty-state">这个任务还没有题目。</p>`;
    if (!done) {
      bindRunnerInputs(task);
    } else {
      const body = $('#runner-body');
      body.onchange = null;
      body.oninput = null;
    }
  }

  function cnNumber(index) {
    return ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'][index] || String(index + 1);
  }

  function bindRunnerInputs(task) {
    const body = $('#runner-body');
    // 用属性绑定而不是 addEventListener，避免每次重绘任务时叠加监听器。
    body.onchange = onAnswerChange;
    body.oninput = onAnswerChange;
    function onAnswerChange(event) {
      const target = event.target;
      if (!target) return;
      if (target.matches('input[type="radio"]')) {
        const qid = target.name.replace(/^q_/, '');
        task.answers = task.answers || {};
        task.answers[qid] = target.value;
      } else if (target.matches('.text-answer')) {
        task.answers = task.answers || {};
        task.answers[target.dataset.qid] = target.value;
      } else if (target.matches('[data-writing-block]')) {
        task.answers = task.answers || {};
        task.answers[`writing:${target.dataset.writingBlock}`] = target.value;
      } else {
        return;
      }
      $('#runner-count').textContent = `${answeredCount(task)} / ${taskQuestionCount(task)}`;
      $('#runner-fill').style.width = `${Math.round((answeredCount(task) / taskQuestionCount(task)) * 100)}%`;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 300);
    }
  }

  function resultHero(task) {
    const result = task.result || {};
    const score = task.score == null ? '—' : task.score;
    const scoreValue = task.score == null ? 0 : task.score;
    const total = result.total || 0;
    const correct = result.correct || 0;
    const accuracy = task.accuracy == null ? '—' : `${Math.round(task.accuracy * 100)}%`;
    const minutes = Math.max(1, Math.round((task.timeSpent || 0) / 60));
    return `<div class="result-hero">` +
      `<div class="result-ring" style="--score:${scoreValue}%"><span>${score}</span><small>SCORE</small></div>` +
      `<h2 class="result-title">${task.score == null ? '已提交，等待批改' : '任务完成'}</h2>` +
      `<p class="result-sub">${task.score == null ? '这份任务没有可自动判分的答案，老师会在汇报里看到你的作答。' : `答对 ${correct} / ${total} 题，获得 ${task.xpEarned || 0} EXP。`}</p>` +
      `<div class="result-stats">` +
        `<div class="result-stat"><b>${accuracy}</b><span>正确率</span></div>` +
        `<div class="result-stat"><b>${minutes}′</b><span>用时</span></div>` +
        `<div class="result-stat"><b>+${task.xpEarned || 0}</b><span>EXP</span></div>` +
      `</div>` +
      (result.ungraded ? `<p class="hint">有 ${result.ungraded} 道题老师没有附答案，已记录你的作答，不计入正确率。</p>` : '') +
    `</div>`;
  }

  function submitTask() {
    const task = activeTaskId ? findTask(activeTaskId) : null;
    if (!task || task.status === 'done') return;
    const totalQuestions = taskQuestionCount(task);
    const answered = answeredCount(task);
    if (answered < totalQuestions && !window.confirm(`还有 ${totalQuestions - answered} 题没写，确定提交吗？`)) return;

    const attrs = profile().attrs || S.emptyAttrs();
    const review = [];
    const blockStats = [];
    let correct = 0;
    let total = 0;
    let ungraded = 0;
    let writingText = '';

    (task.blocks || []).forEach((block) => {
      if (block.type === 'writing' || block.prompt) {
        writingText = String((task.answers || {})[`writing:${block.id}`] || '').trim();
        const doneCount = writingText ? 1 : 0;
        // 书面表达没有机器可判的标准答案，这里只按“是否完成 + 篇幅”做完成度估算，
        // 不能当成写作质量分；教师画像里会明确标注这一点。
        const words = (writingText.match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) || []).length
          + Math.round((writingText.match(/[一-鿿]/g) || []).length / 2);
        const completion = writingText ? Math.min(1, 0.4 + Math.min(words, 120) / 200) : 0;
        blockStats.push({
          type: block.type || 'writing',
          label: block.label || S.blockLabel(block.type),
          total: 1,
          correct: doneCount,
          writing: true,
          completion: Math.round(completion * 100)
        });
        S.applyAttrResult(attrs, 'writing', completion, 1);
        return;
      }
      let blockCorrect = 0;
      let blockTotal = 0;
      (block.questions || []).forEach((question) => {
        const qid = question.id || `${block.id}-q${question.n}`;
        const answer = (task.answers || {})[qid] || '';
        const ok = S.isCorrectAnswer(question, answer);
        if (ok === null) {
          ungraded += 1;
          return;
        }
        blockTotal += 1;
        total += 1;
        if (ok) { correct += 1; blockCorrect += 1; }
        review.push({
          n: question.n,
          stem: String(question.stem || '').slice(0, 160),
          userAnswer: String(answer || ''),
          correctAnswer: String(question.answer || ''),
          ok,
          type: block.type,
          explanation: String(question.explanation || '').slice(0, 300)
        });
      });
      blockStats.push({ type: block.type, label: block.label || S.blockLabel(block.type), total: blockTotal, correct: blockCorrect });
      S.applyAttrResult(attrs, block.type, blockCorrect, blockTotal);
    });

    const accuracy = total ? correct / total : null;
    const score = accuracy == null ? null : Math.round(accuracy * 100);
    const base = Number(task.xp) || 100;
    const xpEarned = Math.round(base * (0.4 + 0.6 * (accuracy == null ? 0.6 : accuracy)));
    task.status = 'done';
    task.submittedAt = S.nowIso();
    task.timeSpent = Math.max(1, Math.round((Date.now() - taskStartedAt) / 1000));
    task.score = score;
    task.accuracy = accuracy;
    task.correct = correct;
    task.total = total;
    task.ungraded = ungraded;
    task.xpEarned = xpEarned;
    task.blockStats = blockStats;
    task.review = review;
    task.writing = writingText;
    task.result = { correct, total, ungraded, accuracy, blockStats };
    profile().attrs = attrs;
    addXp(xpEarned);
    save();
    renderAll();
    renderRunner(task);
    stopTimer();
    S.toast(score == null ? '任务已提交，等老师批改。' : `任务完成，答对 ${correct}/${total}，+${xpEarned} EXP。`, 'ok', 5000);
  }

  /* ------------------------------- 任务码 / 汇报码 ------------------------------- */

  async function importTaskCode() {
    if (!profile() || !sessionPin) { S.toast('先解锁档案。', 'error'); return; }
    const raw = $('#import-code').value.trim();
    if (!raw) { S.toast('先粘贴任务码。', 'error'); return; }
    let payload;
    try {
      payload = await S.unpackCode(raw);
    } catch (error) {
      S.toast(error.message || '任务码无法识别。', 'error', 5000);
      return;
    }
    if (!payload || payload.kind !== 'task') { S.toast('这不是任务码，别把汇报码贴进来。', 'error'); return; }
    if (payload.studentId !== profile().id) {
      S.toast(`这个任务是发给 ${payload.studentId} 的，不是当前学号 ${profile().id}。`, 'error', 6000);
      return;
    }
    const auth = await S.sha256Hex(`${payload.studentId}|${sessionPin}|${payload.id}`);
    if (auth !== payload.auth) {
      S.toast('任务码和当前密码不匹配，可能不是发给你的。', 'error', 6000);
      return;
    }
    if (!Array.isArray(payload.blocks) || !payload.blocks.length) {
      S.toast('任务里没有题目，请让老师重新生成。', 'error');
      return;
    }
    const existing = findTask(payload.id);
    if (existing && existing.status === 'done') {
      S.toast('这个任务你已经完成过了。');
      return;
    }
    const task = {
      ...payload,
      answers: existing ? existing.answers || {} : {},
      status: 'new',
      importedAt: S.nowIso()
    };
    data.tasks = data.tasks.filter((item) => item.id !== task.id);
    data.tasks.unshift(task);
    save();
    renderAll();
    S.closeDialog($('#import-dialog'));
    $('#import-code').value = '';
    S.toast('任务已导入，开始吧。', 'ok');
  }

  async function buildReport() {
    if (!profile() || !sessionPin) throw new Error('档案还没有解锁。');
    const reportId = S.uid('R');
    const auth = await S.sha256Hex(`${profile().id}|${sessionPin}|${reportId}`);
    const p = profile();
    return {
      v: 1,
      kind: 'report',
      reportId,
      studentId: p.id,
      studentName: p.name,
      auth,
      generatedAt: S.nowIso(),
      profile: {
        id: p.id,
        name: p.name,
        grade: p.grade,
        avatar: p.avatar,
        createdAt: p.createdAt,
        xp: p.xp,
        attrs: p.attrs,
        checkins: p.checkins,
        badges: p.badges
      },
      tasks: data.tasks.filter((task) => task.status === 'done').map((task) => ({
        id: task.id,
        title: task.title,
        grade: task.grade,
        due: task.due,
        status: task.status,
        score: task.score,
        accuracy: task.accuracy,
        correct: task.correct,
        total: task.total,
        ungraded: task.ungraded,
        xpEarned: task.xpEarned,
        submittedAt: task.submittedAt,
        timeSpent: task.timeSpent,
        avgDifficulty: taskAvgDifficulty(task),
        blockStats: task.blockStats || [],
        review: task.review || [],
        writing: task.writing || '',
        assignedAt: task.createdAt || task.importedAt || ''
      }))
    };
  }

  async function openReport() {
    try {
      const report = await buildReport();
      const code = await S.packCode(report);
      $('#report-code').value = code;
      S.openDialog($('#report-dialog'));
    } catch (error) {
      S.toast(error.message || '汇报码生成失败。', 'error');
    }
  }

  async function restoreProfile() {
    const code = $('#restore-code').value.trim();
    const pin = $('#restore-pin').value.trim();
    if (!code) { S.toast('先粘贴档案码。', 'error'); return; }
    if (!/^[A-Za-z0-9]{4,12}$/.test(pin)) { S.toast('密码用 4–12 位字母或数字。', 'error'); return; }
    let payload;
    try {
      payload = await S.unpackCode(code);
    } catch (error) {
      S.toast(error.message || '档案码无法识别。', 'error', 5000);
      return;
    }
    if (!payload || payload.kind !== 'report' || !payload.profile || !payload.studentId) {
      S.toast('这不是学习档案码。', 'error');
      return;
    }
    const auth = await S.sha256Hex(`${payload.studentId}|${pin}|${payload.reportId}`);
    if (auth !== payload.auth) {
      S.toast('密码不对，无法恢复这份档案。', 'error', 5000);
      return;
    }
    const pinHash = await S.sha256Hex(`${payload.studentId}|${pin}`);
    data = {
      v: 1,
      profile: {
        ...payload.profile,
        pinHash,
        attrs: S.normalizeAttrs(payload.profile.attrs),
        checkins: Array.isArray(payload.profile.checkins) ? payload.profile.checkins : [],
        badges: Array.isArray(payload.profile.badges) ? payload.profile.badges : []
      },
      tasks: Array.isArray(payload.tasks) ? payload.tasks.map((task) => ({
        ...task,
        blocks: task.blocks || [],
        answers: task.answers || {},
        status: task.status || 'done'
      })) : []
    };
    sessionPin = pin;
    save();
    S.closeDialog($('#restore-dialog'));
    showApp();
    S.toast('档案已恢复。历史任务的题目原文不包含在档案码里，成绩和错题仍然保留。', 'ok', 6000);
  }

  function confirmReset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (error) { /* ignore */ }
    data = null;
    sessionPin = '';
    S.closeDialog($('#reset-dialog'));
    showAuth();
    S.toast('已清空本机档案。');
  }

  /* ------------------------------- 事件绑定 ------------------------------- */

  function bindEvents() {
    $('#setup-btn').addEventListener('click', handleSetup);
    $('#enroll-link').addEventListener('click', () => {
      $('#enroll-code-input').value = '';
      S.openDialog($('#enroll-dialog'));
      setTimeout(() => $('#enroll-code-input').focus(), 100);
    });
    $('#manual-toggle').addEventListener('click', () => {
      const expanded = $('#manual-toggle').getAttribute('aria-expanded') === 'true';
      setSetupExpanded(!expanded);
      if (!expanded) {
        setTimeout(() => {
          const enrolled = $('#setup-card').dataset.enrolled === '1';
          const target = enrolled ? $('#setup-btn') : $('#setup-name');
          if (target) {
            target.focus({ preventScroll: true });
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 120);
      }
    });
    $('#enroll-apply').addEventListener('click', applyEnrollCode);
    $('#help-btn').addEventListener('click', () => S.openDialog($('#help-dialog')));
    $('#login-btn').addEventListener('click', handleLogin);
    $('#login-pin').addEventListener('keydown', (event) => { if (event.key === 'Enter') handleLogin(); });
    $('#logout-btn').addEventListener('click', () => {
      if (window.confirm('退出后需要密码才能再进入，确定吗？')) logout();
    });
    $('#checkin-btn').addEventListener('click', doCheckin);
    $('#import-task-btn').addEventListener('click', () => {
      $('#import-code').value = '';
      S.openDialog($('#import-dialog'));
      setTimeout(() => $('#import-code').focus(), 100);
    });
    $('#import-btn').addEventListener('click', importTaskCode);
    $('#runner-close').addEventListener('click', () => {
      stopTimer();
      activeTaskId = null;
      S.closeDialog($('#task-dialog'));
    });
    $('#submit-task').addEventListener('click', submitTask);
    $('#runner-report').addEventListener('click', openReport);
    $('#report-btn').addEventListener('click', openReport);
    $('#copy-report').addEventListener('click', async () => {
      try {
        await S.copyText($('#report-code').value);
        S.toast('汇报码已复制，发给阮老师即可。', 'ok');
      } catch (error) {
        S.toast('复制失败，请手动全选复制。', 'error');
      }
    });
    $('#download-report').addEventListener('click', () => {
      S.downloadText(`${profile().name || '学生'}-学习汇报.txt`, $('#report-code').value);
    });
    $('#report-dialog').addEventListener('close', () => { $('#report-code').value = ''; });
    $('#restore-link').addEventListener('click', () => {
      $('#restore-code').value = '';
      $('#restore-pin').value = '';
      S.openDialog($('#restore-dialog'));
    });
    $('#restore-link-2').addEventListener('click', () => {
      $('#restore-code').value = '';
      $('#restore-pin').value = '';
      S.openDialog($('#restore-dialog'));
    });
    $('#restore-btn').addEventListener('click', restoreProfile);
    $('#reset-link').addEventListener('click', () => S.openDialog($('#reset-dialog')));
    $('#reset-confirm').addEventListener('click', confirmReset);
    $('#task-dialog').addEventListener('close', () => {
      stopTimer();
      activeTaskId = null;
    });
    S.bindDialogClose(document);
  }

  function init() {
    bindEvents();
    showAuth();
  }

  init();
})();
