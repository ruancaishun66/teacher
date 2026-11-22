/* ==========================================================================
   顺势 · 学生端
   本机档案 + 任务码 / 汇报码，不依赖服务器。
   ========================================================================== */
(function () {
  'use strict';

  const S = window.Shunshi;
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }
  const $ = S.$;
  const $$ = S.$$;
  const STORAGE_KEY = 'shunshi.student.v1';
  const REMEMBER_KEY = 'shunshi.student.remember.v1';
  const PET_MOTION_KEY = 'shunshi.pet.motion.v1';
  /* 间隔复习：第一次答对后隔 1 天，再 2、4、7、15、30 天。
     来自 Cepeda 等（2006）的间隔效应与 Rawson & Dunlosky（2011）
     “三次成功回忆后再拉开间隔”的做法；答错就回到 1 天后。 */
  const WORD_REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30];
  const REVIEW_STATION_LIMIT = 60;
  /* 新词和旧词共用每天的总量上限。老师端会把 policy 放进最新一次任务码；
     学生端收到后重新排一遍旧词，积压不会全堆在今天。 */
  const DEFAULT_REVIEW_POLICY = {
    version: 1,
    newPerDay: 50,
    dailyCap: 80,
    reviewCap: 30,
    weeklyReviewDay: 0,
    spreadDays: 3
  };

  let data = loadData();
  let sessionPin = '';
  let activeTaskId = null;
  let taskStartedAt = 0;
  let timerId = null;
  let saveTimer = null;
  let pendingEnroll = null;
  let pendingLinkCode = '';
  let linkImportStarted = false;
  let reportQrMount = null;

  function loadData() {
    const raw = S.getJSON(STORAGE_KEY, null);
    if (!raw || !raw.profile || !raw.profile.id) return null;
    raw.v = 1;
    raw.profile.attrs = S.normalizeAttrs(raw.profile.attrs);
    raw.profile.checkins = Array.isArray(raw.profile.checkins) ? raw.profile.checkins.map((x) => String(x).slice(0, 10)) : [];
    raw.profile.badges = Array.isArray(raw.profile.badges) ? raw.profile.badges : [];
    raw.profile.xp = Math.max(0, Number(raw.profile.xp) || 0);
    raw.profile.accountType = raw.profile.accountType === 'trial' ? 'trial' : 'regular';
    raw.profile.trialDays = Math.max(1, Number(raw.profile.trialDays) || 3);
    raw.profile.trialExpiresAt = String(raw.profile.trialExpiresAt || '');
    raw.tasks = Array.isArray(raw.tasks) ? raw.tasks.filter((task) => task && task.id) : [];
    raw.wordMemory = raw.wordMemory && typeof raw.wordMemory === 'object' ? raw.wordMemory : {};
    Object.keys(raw.wordMemory).forEach((key) => {
      const entry = raw.wordMemory[key];
      if (!entry || !entry.w) { delete raw.wordMemory[key]; return; }
      entry.box = Math.max(0, Math.min(WORD_REVIEW_INTERVALS.length - 1, Number(entry.box) || 0));
      entry.streak = Math.max(0, Number(entry.streak) || 0);
      entry.lapses = Math.max(0, Number(entry.lapses) || 0);
      entry.seen = Math.max(0, Number(entry.seen) || 0);
      entry.correct = Math.max(0, Number(entry.correct) || 0);
      entry.due = String(entry.due || '');
      entry.lastAt = String(entry.lastAt || '');
      entry.lastRatedOn = String(entry.lastRatedOn || '');
    });
    raw.reviewPolicy = normalizeReviewPolicy(raw.reviewPolicy);
    raw.reviewPolicyUpdatedAt = String(raw.reviewPolicyUpdatedAt || '');
    /* 旧任务里的释义可能又长又杂；打开页面时顺手清洗成 1–2 个常用义。 */
    raw.tasks.forEach((task) => {
      if (!Array.isArray(task.words) || !task.words.length) return;
      task.words = S.unpackWordList(task.words).map((word) => ({
        ...word,
        zh: word.zh ? S.meaningFor(word.w, word.zh) : ''
      }));
    });
    return raw;
  }

  function save() {
    if (!data) return;
    S.setJSON(STORAGE_KEY, data);
  }

  function profile() { return data && data.profile; }

  function trialExpiryIso(days) {
    return S.addDays(S.todayIso(), Math.max(1, Number(days) || 3));
  }

  function trialState(p) {
    const who = p || profile();
    if (!who || who.accountType !== 'trial') return { trial: false, expired: false, daysLeft: Infinity, expiresAt: '' };
    const expiresAt = who.trialExpiresAt || trialExpiryIso(who.trialDays);
    const left = Math.round((new Date(`${expiresAt}T23:59:59`).getTime() - Date.now()) / 86400000);
    return { trial: true, expired: left < 0, daysLeft: Math.max(0, left), expiresAt };
  }

  function trialLocked() {
    const state = trialState();
    return state.trial && state.expired;
  }

  function requireTrial(message) {
    if (!trialLocked()) return true;
    S.toast(message || '体验卡已到期。点右上角“体验卡”申请延长后，就能继续学习。', 'error', 6500);
    setTimeout(() => openTrialDialog(), 300);
    return false;
  }

  function findTask(id) { return data && data.tasks.find((task) => task.id === id) || null; }

  function wordMemoryKey(word) {
    return String((word && word.w) || word || '').trim().toLowerCase();
  }

  function wordMemoryEntry(word) {
    if (!data) return null;
    data.wordMemory = data.wordMemory && typeof data.wordMemory === 'object' ? data.wordMemory : {};
    const key = wordMemoryKey(word);
    if (!key) return null;
    let entry = data.wordMemory[key];
    if (!entry) {
      entry = {
        w: String(word.w || '').trim(),
        zh: String(word.zh || '').trim(),
        kk: String(word.kk || '').trim(),
        pos: String(word.pos || '').trim(),
        ex: String(word.ex || '').trim(),
        exZh: String(word.exZh || '').trim(),
        box: 0,
        streak: 0,
        lapses: 0,
        seen: 0,
        correct: 0,
        due: '',
        lastAt: '',
        lastRatedOn: '',
        lastTaskId: ''
      };
      data.wordMemory[key] = entry;
    } else {
      ['zh', 'kk', 'pos', 'ex', 'exZh'].forEach((field) => {
        if (!entry[field] && word[field]) entry[field] = String(word[field]);
      });
    }
    return entry;
  }

  function wordMasteryLabel(entry) {
    if (!entry || !entry.seen) return '新词';
    if ((Number(entry.box) || 0) >= 4 && (Number(entry.streak) || 0) >= 3) return '已稳固';
    if ((Number(entry.box) || 0) >= 2) return '记得住';
    return '巩固中';
  }

  function wordMemoryEntries() {
    return Object.entries((data && data.wordMemory) || {})
      .map(([key, entry]) => ({ key, entry }))
      .filter((item) => item.entry && item.entry.w);
  }

  function dueReviewEntries(limit) {
    const today = S.todayIso();
    return wordMemoryEntries()
      .filter((item) => item.entry.due && item.entry.due <= today)
      .sort((a, b) => (
        String(a.entry.due).localeCompare(String(b.entry.due))
        || (Number(b.entry.lapses) || 0) - (Number(a.entry.lapses) || 0)
        || String(a.entry.lastAt || '').localeCompare(String(b.entry.lastAt || ''))
      ))
      .slice(0, Math.max(1, Number(limit) || REVIEW_STATION_LIMIT));
  }

  function dueReviewWords(limit) {
    return dueReviewEntries(limit).map(({ entry }) => ({
      w: entry.w,
      zh: entry.zh || '',
      kk: entry.kk || '',
      pos: entry.pos || '',
      ex: entry.ex || '',
      exZh: entry.exZh || '',
      review: true
    }));
  }

  /* 同一批词如果都在同一天学，原本会在同一天一起到期。
     给 4 天以上的间隔加 0–2 天稳定“抖动”，把复习自然摊开；
     同一个词每次算出来的日期固定，不会每天乱跳。 */
  function spreadReviewDue(startDay, intervalDays, key) {
    const interval = Math.max(1, Math.round(Number(intervalDays) || 1));
    if (interval < 4) return S.addDays(startDay, interval);
    const fuzz = hashString(`${key}|${startDay}|${interval}`) % 3;
    return S.addDays(startDay, interval + fuzz);
  }

  /* 每次打卡只给同一个词记一次“当天成绩”。同一天老师连发两份含同一个词的任务，
     不能当成两次间隔复习，否则 box 会被一天内刷高。 */
  function applyWordMemoryResult(task, word, stat) {
    const entry = wordMemoryEntry(word);
    if (!entry) return;
    const today = S.todayIso();
    if (entry.lastRatedOn === today) return;
    const ok = Boolean(stat && stat.ok);
    /* 用“此前是否成功回忆过”判断第一次成功，而不是用 seen。
       一个词可能先错几次再答对；第一次答对仍然只隔 1 天，不能因为错得多就被拉长。 */
    const firstSuccess = (Number(entry.correct) || 0) === 0;
    entry.seen = (Number(entry.seen) || 0) + 1;
    entry.lastAt = S.nowIso();
    entry.lastRatedOn = today;
    entry.lastTaskId = task && task.id ? task.id : '';
    if (ok) {
      entry.correct = (Number(entry.correct) || 0) + 1;
      entry.streak = (Number(entry.streak) || 0) + 1;
      /* 第一次成功回忆后先隔 1 天；之后每成功一次，间隔升一档。 */
      if (firstSuccess) {
        entry.box = 0;
        entry.due = S.addDays(today, WORD_REVIEW_INTERVALS[0]);
      } else {
        entry.box = Math.min(WORD_REVIEW_INTERVALS.length - 1, (Number(entry.box) || 0) + 1);
        entry.due = spreadReviewDue(today, WORD_REVIEW_INTERVALS[entry.box], wordMemoryKey(word));
      }
    } else {
      entry.streak = 0;
      entry.lapses = (Number(entry.lapses) || 0) + 1;
      entry.box = 0;
      entry.due = S.addDays(today, WORD_REVIEW_INTERVALS[0]);
    }
  }

  function updateWordMemoryFromTask(task) {
    if (!task || !Array.isArray(task.wordStats) || !task.wordStats.length) return;
    const byWord = new Map();
    (task.words || []).forEach((word) => {
      const key = wordMemoryKey(word);
      if (key) byWord.set(key, word);
    });
    task.wordStats.forEach((stat) => {
      const key = wordMemoryKey(stat);
      const word = byWord.get(key) || stat;
      applyWordMemoryResult(task, word, stat);
    });
  }

  function normalizeReviewPolicy(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const asInt = (value, fallback, min, max) => {
      const n = Number(value);
      if (!Number.isFinite(n)) return fallback;
      return Math.max(min, Math.min(max, Math.round(n)));
    };
    return {
      version: 1,
      newPerDay: asInt(source.newPerDay, DEFAULT_REVIEW_POLICY.newPerDay, 4, 200),
      dailyCap: asInt(source.dailyCap, DEFAULT_REVIEW_POLICY.dailyCap, 20, 300),
      reviewCap: asInt(source.reviewCap, DEFAULT_REVIEW_POLICY.reviewCap, 5, 120),
      weeklyReviewDay: asInt(source.weeklyReviewDay, DEFAULT_REVIEW_POLICY.weeklyReviewDay, -1, 6),
      spreadDays: asInt(source.spreadDays, DEFAULT_REVIEW_POLICY.spreadDays, 1, 14)
    };
  }

  function reviewPolicy() {
    return normalizeReviewPolicy(data && data.reviewPolicy);
  }

  function weekdayOf(day) {
    return new Date(`${String(day || '').slice(0, 10)}T00:00:00`).getDay();
  }

  /* 当天还没做完的新词先占掉总词量；剩下的额度才排复习。
     这样学生不会“新词 50 + 旧词 200”一天被压垮。 */
  function pendingNewWordsOn(day) {
    let total = 0;
    (data.tasks || []).forEach((task) => {
      if (!task || task.status === 'done' || task.reviewSession || task.mode !== 'words') return;
      if (String(task.due || '').slice(0, 10) !== day) return;
      total += Math.max(0, Number(task.wordTotal) || (task.words || []).length || 0);
    });
    return total;
  }

  function reviewCapacityFor(day, policy) {
    const p = normalizeReviewPolicy(policy || (data && data.reviewPolicy));
    const newWords = pendingNewWordsOn(day);
    let cap = Math.max(5, Math.min(p.reviewCap, p.dailyCap - newWords));
    if (p.weeklyReviewDay >= 0 && weekdayOf(day) === p.weeklyReviewDay) {
      /* 回顾日可以多排一点，但仍然受每天总词量上限约束。 */
      const boosted = Math.max(5, Math.min(Math.round(p.reviewCap * 1.5), p.dailyCap - newWords));
      cap = Math.max(cap, boosted);
    }
    return Math.max(1, Math.min(REVIEW_STATION_LIMIT, Math.round(cap)));
  }

  function reviewPriority(a, b) {
    return (Number(b.entry.lapses) || 0) - (Number(a.entry.lapses) || 0)
      || (Number(a.entry.box) || 0) - (Number(b.entry.box) || 0)
      || String(a.entry.lastAt || '').localeCompare(String(b.entry.lastAt || ''))
      || String(a.key).localeCompare(String(b.key));
  }

  /* 把到期 / 积压的旧词按“每天复习额度”重新铺到未来两周：
     1. 先按最该复习的顺序，放进最早还有额度的那一天；
     2. 今天排不下的自然落到明天、后天，不会一次性全冒出来；
     3. 每周回顾日把未来 1–2 天到期的一小批弱词提前到今天，做一次周复习，也削平下周高峰。
     只改“下次复习日期”，不删词、不改答题记录。 */
  function rebalanceWordMemory(policy, options) {
    if (!data) return { moved: 0, pulled: 0, days: 0 };
    const p = normalizeReviewPolicy(policy || data.reviewPolicy);
    data.reviewPolicy = p;
    const entries = wordMemoryEntries();
    if (!entries.length) return { moved: 0, pulled: 0, days: 0 };
    const today = S.todayIso();
    const horizon = 14;
    const maxSearch = 60;
    const load = new Map();
    const capacity = new Map();
    const dayAt = (offset) => S.addDays(today, offset);
    for (let offset = 0; offset <= maxSearch; offset += 1) {
      const day = dayAt(offset);
      capacity.set(day, reviewCapacityFor(day, p));
      load.set(day, 0);
    }

    const candidates = [];
    entries.forEach(({ key, entry }) => {
      let due = String(entry.due || '').slice(0, 10);
      if (!due) due = today;
      if (due > dayAt(horizon)) return;
      const earliest = due < today ? today : due;
      /* 今天刚评过的词，最早明天再复习，不能在回顾日被提前拉回今天。 */
      const earliestSafe = entry.lastRatedOn === today && earliest <= today ? dayAt(1) : earliest;
      candidates.push({ key, entry, desired: earliestSafe, due, pulled: false });
    });

    /* 周回顾：只提前“快到期且还不稳”的词，最多占当天额度的 25%。 */
    if (p.weeklyReviewDay >= 0) {
      for (let offset = 0; offset <= horizon - 2; offset += 1) {
        const day = dayAt(offset);
        if (weekdayOf(day) !== p.weeklyReviewDay) continue;
        const cap = capacity.get(day) || 0;
        const pullLimit = Math.max(2, Math.min(10, Math.floor(cap * 0.25)));
        if (!pullLimit) continue;
        const soon = candidates
          .filter((item) => !item.pulled && item.entry.lastRatedOn !== day && (
            item.desired === dayAt(offset + 1) || item.desired === dayAt(offset + 2)
          ))
          .filter((item) => (Number(item.entry.box) || 0) <= 2 || (Number(item.entry.lapses) || 0) > 0)
          .sort(reviewPriority)
          .slice(0, pullLimit);
        soon.forEach((item) => {
          item.desired = day;
          item.pulled = true;
        });
      }
    }

    candidates.sort((a, b) => String(a.desired).localeCompare(String(b.desired)) || reviewPriority(a, b));
    let moved = 0;
    let pulled = 0;
    candidates.forEach((item) => {
      let target = item.desired;
      let offset = Math.max(0, Math.round((new Date(`${target}T00:00:00`) - new Date(`${today}T00:00:00`)) / 86400000));
      let guard = 0;
      while (guard < maxSearch) {
        const day = dayAt(offset);
        if ((load.get(day) || 0) < (capacity.get(day) || 1)) {
          target = day;
          break;
        }
        offset += 1;
        guard += 1;
      }
      if (guard >= maxSearch) target = item.desired;
      const day = dayAt(offset);
      load.set(day, (load.get(day) || 0) + 1);
      const before = String(item.entry.due || '').slice(0, 10);
      if (before !== target) {
        item.entry.due = target;
        /* 只把“排到今天以后”算作顺延；昨天到期、今天补上的不算。 */
        if (target > today && target > before) moved += 1;
      }
      if (item.pulled) pulled += 1;
    });

    const todayLoad = load.get(today) || 0;
    const todayCap = capacity.get(today) || 0;
    data.reviewSchedule = {
      updatedAt: S.nowIso(),
      policy: p,
      todayLoad,
      todayCap,
      moved,
      pulled,
      note: moved
        ? `今天排 ${todayLoad} 个旧词，其余 ${moved} 个已顺延到后面几天。`
        : `今天旧词 ${todayLoad} 个，没有积压。`
    };
    if (options && options.save) save();
    return { moved, pulled, todayLoad, todayCap, days: 0 };
  }

  /* 新任务码里带了复习排期：先存下来，再把旧词重新铺一遍。
     这样老师下一次发码，就顺带把之前堆着的复习量处理平了。 */
  function applyIncomingReviewPolicy(tasks) {
    const list = Array.isArray(tasks) ? tasks : [];
    const carrier = list.find((task) => task && task.mode === 'words' && task.reviewPolicy);
    if (!carrier) {
      /* 老任务码没带 policy，也按当前默认额度排一遍，避免旧机制继续堆。 */
      if (list.some((task) => task && task.mode === 'words')) rebalanceWordMemory(data.reviewPolicy);
      return null;
    }
    const p = normalizeReviewPolicy(carrier.reviewPolicy);
    data.reviewPolicy = p;
    data.reviewPolicyUpdatedAt = S.nowIso();
    /* 旧的今日复习站按新额度重建，避免它还是旧的 60 词大卡。 */
    const stationId = `RV-${S.todayIso()}`;
    const station = findTask(stationId);
    if (station && station.status !== 'done') {
      data.tasks = data.tasks.filter((task) => task.id !== stationId);
    }
    rebalanceWordMemory(p);
    return p;
  }

  /* 今日复习站：系统自动把到期的词拼成一张单词卡，学生不用等老师另外发码。
     到期的词按“最该复习”的顺序排；答对后按 1→2→4→7→15→30 天拉开。 */
  function ensureReviewStation() {
    if (!data || !profile()) return;
    const today = S.todayIso();
    const stationId = `RV-${today}`;
    const keepFrom = S.addDays(today, -7);
    let changed = false;
    const policy = reviewPolicy();
    /* 每天第一次打开学生端时重排一次旧词；排完记下日期，避免每次渲染都改。 */
    if (data.reviewRebalancedOn !== today) {
      rebalanceWordMemory(policy);
      data.reviewRebalancedOn = today;
      changed = true;
    }
    const nextTasks = [];
    data.tasks.forEach((task) => {
      if (!task || !task.reviewSession) { nextTasks.push(task); return; }
      const day = String(task.id || '').replace(/^RV-/, '').slice(0, 10);
      if (day === today) { nextTasks.push(task); return; }
      if (task.status !== 'done') { changed = true; return; }
      if (day < keepFrom) { changed = true; return; }
      nextTasks.push(task);
    });
    if (changed) {
      data.tasks = nextTasks;
      save();
    }

    const existing = findTask(stationId);
    if (existing && existing.status === 'done') return;
    const due = dueReviewWords(reviewCapacityFor(today, policy));
    const hasProgress = existing && existing.wordRun
      && ((Number(existing.wordRun.i) || 0) > 0 || Object.keys(existing.wordRun.results || {}).length > 0);
    if (!due.length) {
      if (existing && !hasProgress) {
        data.tasks = data.tasks.filter((task) => task.id !== stationId);
        save();
      }
      return;
    }
    const dueKeys = due.map(wordMemoryKey).sort().join('|');
    if (existing && existing.status !== 'done' && hasProgress) return;
    if (existing && existing.status !== 'done' && !hasProgress) {
      const oldKeys = (existing.words || []).map(wordMemoryKey).sort().join('|');
      if (oldKeys === dueKeys) return;
    }
    const task = {
      id: stationId,
      kind: 'memory',
      reviewSession: true,
      title: `今日复习站 · ${due.length} 词`,
      grade: profile().grade || '',
      due: today,
      xp: Math.max(30, Math.min(80, 16 + due.length * 2)),
      createdAt: S.nowIso(),
      mode: 'words',
      words: due,
      wordTotal: due.length,
      wordRun: null,
      answers: {},
      reviewPlanNote: data.reviewSchedule ? data.reviewSchedule.note : '',
      status: 'new',
      importedAt: S.nowIso()
    };
    data.tasks = data.tasks.filter((item) => item.id !== stationId);
    data.tasks.unshift(task);
    save();
  }

  function wordMemorySummaryHtml() {
    const entries = wordMemoryEntries();
    if (!entries.length) return '';
    const today = S.todayIso();
    const due = entries.filter((item) => item.entry.due && item.entry.due <= today).length;
    const solid = entries.filter((item) => (
      (Number(item.entry.box) || 0) >= 4 && (Number(item.entry.streak) || 0) >= 3
    )).length;
    const policy = reviewPolicy();
    const schedule = data.reviewSchedule || {};
    const loadNote = schedule.updatedAt
      ? `今天排 ${schedule.todayLoad || 0} 个旧词${schedule.moved ? `，另有 ${schedule.moved} 个顺延` : ''}。`
      : '';
    return `<div class="memory-strip">` +
      `<div><b>单词记忆</b><span>学过 ${entries.length} 词 · 今天到期 ${due} 词 · 已稳固 ${solid} 词</span></div>` +
      `<small>复习间隔 1 → 2 → 4 → 7 → 15 → 30 天；答错回到 1 天后，第二天再考。每天复习最多约 ${policy.reviewCap} 词，${loadNote}排不下的会顺延，不会一次堆几百个。</small>` +
    `</div>`;
  }

  function taskQuestionCount(task) {
    if (task.mode === 'words') return (task.words || []).length || Number(task.wordTotal) || 1;
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
    if (task.mode === 'words') {
      const run = task.wordRun;
      return run && Number.isFinite(Number(run.i)) ? Math.min(Number(run.i), taskQuestionCount(task)) : 0;
    }
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

  function rememberedLogin() {
    const saved = S.getJSON(REMEMBER_KEY, null);
    if (!saved || !saved.id || !saved.pin) return null;
    if (!profile() || String(saved.id) !== String(profile().id)) return null;
    return saved;
  }

  function rememberLogin(pin) {
    const box = $('#login-remember');
    const wanted = box ? box.checked : true;
    try {
      if (wanted && profile() && pin) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ id: profile().id, pin, savedAt: S.nowIso() }));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
    } catch (error) { /* 本机存储不可用时，只影响“记住密码”，不影响档案。 */ }
  }

  function clearRememberedLogin() {
    try { localStorage.removeItem(REMEMBER_KEY); } catch (error) { /* ignore */ }
  }

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
      const saved = rememberedLogin();
      $('#login-pin').value = saved ? saved.pin : '';
      const remember = $('#login-remember');
      // 没有保存过密码时保留页面默认的“记住密码”勾选，避免老学生第一次登录反而不被记住。
      if (remember && saved) remember.checked = true;
      const button = $('#login-btn');
      if (button) button.textContent = saved ? '进入学习终端（密码已记住）' : '进入学习终端';
      setTimeout(() => {
        if (saved) $('#login-btn').focus();
        else $('#login-pin').focus();
      }, 80);
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
    setTimeout(maybeAutoImportLink, 500);
  }

  function takeLinkCode() {
    const code = S.readCodeFromLocation();
    if (!code) return;
    pendingLinkCode = code;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (error) { /* ignore */ }
  }

  function maybeAutoImportLink() {
    if (linkImportStarted || !pendingLinkCode || !profile() || !sessionPin) return;
    linkImportStarted = true;
    const code = pendingLinkCode;
    pendingLinkCode = '';
    const box = $('#import-code');
    if (!box) return;
    box.value = code;
    S.openDialog($('#import-dialog'));
    setTimeout(() => { importTaskCode(); }, 320);
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
    const enrolled = pendingEnroll && pendingEnroll.studentId === id ? pendingEnroll : null;
    const trial = enrolled && enrolled.accountType === 'trial';
    const trialDays = trial ? Math.max(1, Math.min(30, Number(enrolled.trialDays) || 3)) : 0;
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
        badges: [],
        accountType: trial ? 'trial' : 'regular',
        trialDays,
        trialStartedAt: trial ? S.todayIso() : '',
        trialExpiresAt: trial ? trialExpiryIso(trialDays) : ''
      },
      tasks: []
    };
    sessionPin = pin;
    save();
    rememberLogin(pin);
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
    if (!S.authMatches(payload.auth, auth)) {
      S.toast('开通码校验失败，请让老师重新生成。', 'error', 5000);
      return;
    }
    pendingEnroll = payload;
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
    rememberLogin(pin);
    showApp();
    S.toast(`${profile().name}，欢迎回来。`, 'ok');
  }

  function logout() {
    sessionPin = '';
    activeTaskId = null;
    stopTimer();
    S.closeDialog($('#task-dialog'));
    showAuth();
    S.toast(rememberedLogin() ? '已退出。密码已记住，下次点“进入”即可。' : '已退出，档案还留在这台设备上。');
  }

  /* ------------------------------- 学习伙伴：小潮獭 ------------------------------- */

  const PET_ATTR_LABELS = {
    water: '水', fire: '火', wind: '风', earth: '土', moon: '月', dream: '梦',
    metal: '金', wood: '木', storm: '雷', sun: '日', gold: '金'
  };

  const PET_SPECIES = {
    otter: {
      name: '小潮獭',
      color: '#4fa8b3',
      motion: 'water',
      stages: [
        { stage: 1, name: '幼獭', min: 0, next: 300, body: '#8fc4bb', ear: '#6fa79f', belly: '#f7ecd6', accent: '#e8b56b', desc: '刚学会在水面打滚的小家伙。' },
        { stage: 2, name: '潮獭', min: 300, next: 900, body: '#7fbbb3', ear: '#5f9d95', belly: '#f9efd9', accent: '#e0946c', desc: '会跟着潮水一起呼吸，眼睛亮亮的。' },
        { stage: 3, name: '灵獭', min: 900, next: 2000, body: '#74c3b4', ear: '#58a596', belly: '#fbf2de', accent: '#e8b56b', desc: '身上浮着一层薄薄的潮光，能听懂更多单词。' },
        { stage: 4, name: '海灵獭', min: 2000, next: null, body: '#8ed9c9', ear: '#64b8a6', belly: '#fff7e5', accent: '#f0c987', desc: '把整片海的知识都收进贝壳里的伙伴。' }
      ]
    },
    fox: {
      name: '星尾狐',
      color: '#c58a5a',
      motion: 'moon',
      stages: [
        { stage: 1, name: '幼狐', min: 0, next: 300, body: '#e3b68c', ear: '#c58a5a', belly: '#fff0dc', accent: '#e8b56b', desc: '尾巴还短短的小狐狸，喜欢追着光点跑。' },
        { stage: 2, name: '星尾狐', min: 300, next: 900, body: '#dda878', ear: '#b97845', belly: '#fff1dd', accent: '#c9784e', desc: '尾巴尖会亮起一颗小星星的伙伴。' },
        { stage: 3, name: '月影狐', min: 900, next: 2000, body: '#c99a7a', ear: '#9d6547', belly: '#ffeedb', accent: '#8b79c9', desc: '能在月光下把错题悄悄叼回来。' },
        { stage: 4, name: '九尾星狐', min: 2000, next: null, body: '#e7bd8f', ear: '#b47a4e', belly: '#fff6e6', accent: '#f0c987', desc: '九条星尾一起点亮时，整片夜空都像在给它让路。' }
      ]
    },
    whale: {
      name: '云海鲸',
      color: '#5d86c9',
      motion: 'water',
      stages: [
        { stage: 1, name: '幼鲸', min: 0, next: 300, body: '#9dbbe3', ear: '#7fa2d4', belly: '#eaf2ff', accent: '#7fc7d9', desc: '会喷出小小水花的云朵鲸。' },
        { stage: 2, name: '云鲸', min: 300, next: 900, body: '#88aede', ear: '#6c93ca', belly: '#eef5ff', accent: '#71bfd0', desc: '游过的地方会留下软软的云。' },
        { stage: 3, name: '潮汐鲸', min: 900, next: 2000, body: '#729ecf', ear: '#5883b9', belly: '#e9f2ff', accent: '#8c7fd1', desc: '能听见远处潮汐里藏着的单词。' },
        { stage: 4, name: '苍穹鲸', min: 2000, next: null, body: '#8fb9e8', ear: '#6a94c9', belly: '#f2f8ff', accent: '#f0c987', desc: '背上驮着一小片星空，游过整片知识海。' }
      ]
    },
    bird: {
      name: '焰羽雀',
      color: '#d06a4e',
      motion: 'fire',
      stages: [
        { stage: 1, name: '雏雀', min: 0, next: 300, body: '#e8a07f', ear: '#c9684a', belly: '#fff0e2', accent: '#e8b56b', desc: '刚会扑腾翅膀的小雀，嗓门倒不小。' },
        { stage: 2, name: '焰羽雀', min: 300, next: 900, body: '#df8a62', ear: '#b9573c', belly: '#fff0e4', accent: '#e2a24e', desc: '尾羽像一小簇不灭的火苗。' },
        { stage: 3, name: '赤羽雀', min: 900, next: 2000, body: '#d4784f', ear: '#a84b35', belly: '#ffefe2', accent: '#d6a74b', desc: '飞过的地方会落下一两句背熟的课文。' },
        { stage: 4, name: '凤凰雏', min: 2000, next: null, body: '#e9a06d', ear: '#b85a3c', belly: '#fff5e8', accent: '#f0c987', desc: '每一次重新起飞，都比上一次更亮。' }
      ]
    },
    baize: {
      name: '白泽',
      color: '#c9b98f',
      motion: 'gold',
      unlock: { type: 'checkins', value: 7, label: '累计打卡 7 天解锁' },
      stages: [
        { stage: 1, name: '云泽兽', min: 0, next: 300, body: '#ece5d5', ear: '#c7baa0', belly: '#fffbf2', accent: '#d9b66f', desc: '从云里探出头的小瑞兽，额上有一只还没睁开的竖眼。' },
        { stage: 2, name: '白泽', min: 300, next: 900, body: '#f3eee2', ear: '#cec2a9', belly: '#fffdf8', accent: '#e2c37c', desc: '能叫出山里每一种精怪的名字，也能记住你背过的词。' },
        { stage: 3, name: '灵泽', min: 900, next: 2000, body: '#e6f1ee', ear: '#aacac4', belly: '#fcffff', accent: '#8fd3cf', desc: '走过的地方会留下淡淡的云纹，竖眼能看见错误藏在哪里。' },
        { stage: 4, name: '天泽', min: 2000, next: null, body: '#f7f2e2', ear: '#d6c39b', belly: '#fffdf5', accent: '#f0c987', desc: '通晓万物名字的上古瑞兽，额眼一开，整片云海都安静下来。' }
      ]
    },
    qilin: {
      name: '麒麟',
      color: '#6fae8d',
      motion: 'wood',
      unlock: { type: 'pool', value: 1200, label: '总经验池累计获得 1200 解锁' },
      stages: [
        { stage: 1, name: '幼麟', min: 0, next: 300, body: '#a9d4bb', ear: '#6da98b', belly: '#f3fbf4', accent: '#d9b66f', desc: '角还没长齐的小麒麟，走路会踩出一小片草芽。' },
        { stage: 2, name: '青麟', min: 300, next: 900, body: '#8fc9a8', ear: '#559477', belly: '#f1fbf3', accent: '#cfae66', desc: '鳞片开始泛起青光，蹄下生风，专挑难题踩。' },
        { stage: 3, name: '火麟', min: 900, next: 2000, body: '#d9a273', ear: '#a36a45', belly: '#fff3e3', accent: '#e08a52', desc: '鬃毛像火一样立起来，越难的单词它越兴奋。' },
        { stage: 4, name: '圣麟', min: 2000, next: null, body: '#efc98e', ear: '#bd8350', belly: '#fff8e9', accent: '#f6d99a', desc: '踏云而行的仁兽，据说它出现的地方，考试都会变简单一点。' }
      ]
    },
    zhulong: {
      name: '烛龙',
      color: '#c9563f',
      motion: 'sun',
      unlock: { type: 'checkins', value: 30, label: '累计打卡 30 天解锁' },
      stages: [
        { stage: 1, name: '烛崽', min: 0, next: 300, body: '#db7a5f', ear: '#a84731', belly: '#ffe8d4', accent: '#f0c987', desc: '衔着一小簇火苗的龙崽，睁眼就是白天，闭眼就是夜晚。' },
        { stage: 2, name: '烛龙', min: 300, next: 900, body: '#d2684e', ear: '#963b29', belly: '#ffe6d1', accent: '#e8b56b', desc: '身下的影子会自己游动，像一条还没醒的河。' },
        { stage: 3, name: '幽都烛龙', min: 900, next: 2000, body: '#b95643', ear: '#7f2f22', belly: '#ffdcc4', accent: '#f0a45c', desc: '从幽都衔来一束不灭的光，照亮你最怕的那一页。' },
        { stage: 4, name: '衔日烛龙', min: 2000, next: null, body: '#e88a5e', ear: '#a94830', belly: '#fff0dc', accent: '#f6d99a', desc: '口衔烈日、身绕长风的钟山之神，睁眼便是一整个白昼。' }
      ]
    },
    xuanwu: {
      name: '玄武',
      color: '#4f8f86',
      motion: 'water',
      unlock: { type: 'checkins', value: 14, label: '累计打卡 14 天解锁', unit: '天' },
      stages: [
        { stage: 1, name: '玄甲幼龟', min: 0, next: 300, body: '#6fa39b', ear: '#3f6f6a', belly: '#e7f2e6', accent: '#d9b66f', desc: '背着一块还没长硬的玄甲，走路慢吞吞却很稳。' },
        { stage: 2, name: '玄武', min: 300, next: 900, body: '#5d948d', ear: '#315d59', belly: '#eaf4e9', accent: '#e0c07c', desc: '龟甲上浮起水纹，身后跟着一条安静的小玄蛇。' },
        { stage: 3, name: '沧溟玄武', min: 900, next: 2000, body: '#4f8b86', ear: '#264c4b', belly: '#eef8f5', accent: '#8fd3cf', desc: '一步步踩出深海的回声，玄蛇已经能盘住整片浪。' },
        { stage: 4, name: '镇海玄武', min: 2000, next: null, body: '#77b3a8', ear: '#3a6d67', belly: '#f5fbf3', accent: '#f0c987', desc: '镇守北方的水神，甲上星图转动时，整片海都安静下来。' }
      ]
    },
    fuzhu: {
      name: '夫诸',
      color: '#8fb6c9',
      motion: 'water',
      unlock: { type: 'streak', value: 3, label: '连续学习 3 天解锁', unit: '天' },
      stages: [
        { stage: 1, name: '漉角幼鹿', min: 0, next: 300, body: '#cfe6f2', ear: '#8fb6c9', belly: '#f8fdff', accent: '#8fd3cf', desc: '角上挂着露水的小鹿，走到哪里都留下一小片湿痕。' },
        { stage: 2, name: '夫诸', min: 300, next: 900, body: '#b9dbea', ear: '#7aa5bc', belly: '#f6fcff', accent: '#7fc7d9', desc: '四只角像四道清泉，低头时水面会自己让开。' },
        { stage: 3, name: '澄澜夫诸', min: 900, next: 2000, body: '#a8d2e4', ear: '#6798b2', belly: '#f2fbff', accent: '#b7e3f2', desc: '踏浪而行，鹿角上会落下细细的雨，把错题洗得干干净净。' },
        { stage: 4, name: '四角灵夫诸', min: 2000, next: null, body: '#d3ecf5', ear: '#86b1c8', belly: '#ffffff', accent: '#f0c987', desc: '四角同时亮起，能听见远处河川报来的名字。' }
      ]
    },
    jinwu: {
      name: '金乌',
      color: '#e0a24e',
      motion: 'sun',
      unlock: { type: 'night', value: 3, label: '晚上 6 点后完成 3 次打卡解锁', unit: '次' },
      stages: [
        { stage: 1, name: '雏乌', min: 0, next: 300, body: '#6b5560', ear: '#342531', belly: '#f7d9a0', accent: '#f0a93c', desc: '一只羽毛还没黑透的小乌鸦，翅膀边缘已经带着金光。' },
        { stage: 2, name: '金乌', min: 300, next: 900, body: '#4d3b4a', ear: '#2a1d29', belly: '#f9dda6', accent: '#f2b445', desc: '背上驮着一小团太阳，飞到哪儿哪儿就亮一点。' },
        { stage: 3, name: '曜日金乌', min: 900, next: 2000, body: '#40303f', ear: '#201520', belly: '#ffe6ab', accent: '#f6c35a', desc: '三足踏火，鸣叫一声就能把整个清晨叫醒。' },
        { stage: 4, name: '三足金乌', min: 2000, next: null, body: '#573f4a', ear: '#2b1a25', belly: '#fff1c8', accent: '#f6d99a', desc: '从扶桑树上飞下的太阳神鸟，张开翅膀便是一轮日出。' }
      ]
    },
    yutu: {
      name: '玉兔',
      color: '#b9c6e4',
      motion: 'moon',
      unlock: { type: 'wordTasks', value: 5, label: '完成 5 次单词打卡解锁', unit: '次' },
      stages: [
        { stage: 1, name: '月绒兔', min: 0, next: 300, body: '#e9eef9', ear: '#b9c6e4', belly: '#ffffff', accent: '#e8c37c', desc: '从月晕里滚出来的小绒球，耳朵比身体还长。' },
        { stage: 2, name: '玉兔', min: 300, next: 900, body: '#dfe7f5', ear: '#a9b9da', belly: '#ffffff', accent: '#e8c37c', desc: '抱着一根小玉杵，专门把难题捣成容易记住的样子。' },
        { stage: 3, name: '捣药玉兔', min: 900, next: 2000, body: '#eef3fd', ear: '#bbc8e4', belly: '#ffffff', accent: '#c9b0e0', desc: '药臼里装的不是药，是你今天背下来的单词。' },
        { stage: 4, name: '望月玉兔', min: 2000, next: null, body: '#f5f8ff', ear: '#c8d1e8', belly: '#ffffff', accent: '#f0c987', desc: '坐在满月边上，把整本词表一页页摊开来看。' }
      ]
    },
    mengdie: {
      name: '梦蝶',
      color: '#a98bd4',
      motion: 'dream',
      unlock: { type: 'grammarTasks', value: 3, label: '完成 3 次语法打卡解锁', unit: '次' },
      stages: [
        { stage: 1, name: '梦茧', min: 0, next: 300, body: '#cbb7e6', ear: '#8f76b8', belly: '#f7edff', accent: '#e8c37c', desc: '一团会轻轻呼吸的梦茧，里面藏着还没醒的翅膀。' },
        { stage: 2, name: '梦蝶', min: 300, next: 900, body: '#b79ade', ear: '#7d63a8', belly: '#f8f0ff', accent: '#d9b66f', desc: '翅膀上全是会变的句子，眨一下眼就换个图案。' },
        { stage: 3, name: '迷梦蝶', min: 900, next: 2000, body: '#a889d8', ear: '#6c559c', belly: '#fbf5ff', accent: '#8fd3cf', desc: '飞过的地方时间会慢半拍，正好够你把语法想清楚。' },
        { stage: 4, name: '庄周梦蝶', min: 2000, next: null, body: '#c4a8ea', ear: '#8469b5', belly: '#fffaff', accent: '#f0c987', desc: '分不清是你在做梦，还是梦在背单词；醒来时已经全记住了。' }
      ]
    },
    qingniao: {
      name: '青鸟',
      color: '#4f9fd1',
      motion: 'wind',
      unlock: { type: 'reports', value: 7, label: '生成 7 次学习汇报解锁', unit: '次' },
      stages: [
        { stage: 1, name: '青雏', min: 0, next: 300, body: '#8cc4e4', ear: '#4f8fba', belly: '#eaf8ff', accent: '#e8c37c', desc: '尾羽还短短的传信鸟，喜欢叼着纸条到处飞。' },
        { stage: 2, name: '青鸟', min: 300, next: 900, body: '#6fb5dc', ear: '#3d7ba8', belly: '#e6f6ff', accent: '#7fc7d9', desc: '能把你的每日汇报稳稳送到老师窗前。' },
        { stage: 3, name: '云信青鸟', min: 900, next: 2000, body: '#5aa7d4', ear: '#2f6d9e', belly: '#e2f5ff', accent: '#b7e3f2', desc: '飞过云层时会在身后拖出一条会发光的信笺。' },
        { stage: 4, name: '九天青鸟', min: 2000, next: null, body: '#8ccbee', ear: '#4a8cbb', belly: '#f2fbff', accent: '#f0c987', desc: '西王母的信使，一振翅就把好消息带到九天之外。' }
      ]
    },
    suanni: {
      name: '狻猊',
      color: '#d09a5e',
      motion: 'fire',
      unlock: { type: 'perfect', value: 1, label: '单词打卡正确率 100% 解锁', unit: '次' },
      stages: [
        { stage: 1, name: '烟尾幼狮', min: 0, next: 300, body: '#e2b47c', ear: '#b06a35', belly: '#fff1dd', accent: '#e8b56b', desc: '尾尖冒着一缕小烟，打喷嚏时会喷出火星。' },
        { stage: 2, name: '狻猊', min: 300, next: 900, body: '#d9a466', ear: '#a25d2e', belly: '#fff3e2', accent: '#e0a24e', desc: '喜欢蹲在香炉边，把难记的词一条条叼出来。' },
        { stage: 3, name: '烟霞狻猊', min: 900, next: 2000, body: '#d69a58', ear: '#985329', belly: '#fff6e8', accent: '#f0a93c', desc: '鬃毛像被晚霞点着，走过的地方烟雾都自动分开。' },
        { stage: 4, name: '吞烟狻猊', min: 2000, next: null, body: '#e6b173', ear: '#a86432', belly: '#fffaf0', accent: '#f6d99a', desc: '龙生九子之一，张口能吞下整片烟雾，也能吞下最长的词表。' }
      ]
    },
    baihu: {
      name: '白虎',
      color: '#c3cfdb',
      motion: 'metal',
      unlock: { type: 'words', value: 300, label: '累计学会 300 个单词解锁', unit: '词' },
      stages: [
        { stage: 1, name: '霜纹幼虎', min: 0, next: 300, body: '#e8edf2', ear: '#9aa8b7', belly: '#ffffff', accent: '#c9d6e2', desc: '脚掌还软软的小白虎，身上的霜纹会随呼吸一闪一闪。' },
        { stage: 2, name: '白虎', min: 300, next: 900, body: '#e1e8ef', ear: '#8d9bab', belly: '#ffffff', accent: '#b7c6d4', desc: '西方的金之神兽，爪尖一碰，错题就被切成两半。' },
        { stage: 3, name: '霜纹白虎', min: 900, next: 2000, body: '#edf2f7', ear: '#a1afbd', belly: '#ffffff', accent: '#9fd0e0', desc: '奔过雪原时不会留下脚印，只留下背熟的词。' },
        { stage: 4, name: '庚金白虎', min: 2000, next: null, body: '#f4f8fb', ear: '#b4c1cd', belly: '#ffffff', accent: '#f0c987', desc: '张口是风，闭口是霜；它认可的单词，再也不会忘。' }
      ]
    },
    kun: {
      name: '鲲',
      color: '#4f7fb0',
      motion: 'water',
      unlock: { type: 'pool', value: 3000, label: '总经验池累计获得 3000 解锁', unit: '经验池 EXP' },
      stages: [
        { stage: 1, name: '北冥幼鲲', min: 0, next: 300, body: '#86a9d4', ear: '#4f7fb0', belly: '#dbeaff', accent: '#71d0d9', desc: '在经验池里游来游去的小鱼，尾巴一摆就长大一圈。' },
        { stage: 2, name: '鲲', min: 300, next: 900, body: '#6f97c8', ear: '#3d6a9c', belly: '#d6e7ff', accent: '#71bfd0', desc: '背鳍像一面小帆，游过的地方会留下细碎的星光。' },
        { stage: 3, name: '北冥鲲', min: 900, next: 2000, body: '#5e88bd', ear: '#2f5c8f', belly: '#e2efff', accent: '#8c7fd1', desc: '整片北冥都装得下它，可它最在意的还是你今天的任务。' },
        { stage: 4, name: '化鹏鲲', min: 2000, next: null, body: '#8fb4df', ear: '#5279ac', belly: '#f0f7ff', accent: '#f0c987', desc: '鲲化为鹏，双翼一展就是九万里；知识海再大也游得完。' }
      ]
    },
    xianhe: {
      name: '仙鹤',
      color: '#efe9dc',
      motion: 'wind',
      unlock: { type: 'streak', value: 7, label: '连续学习 7 天解锁', unit: '天' },
      stages: [
        { stage: 1, name: '雏鹤', min: 0, next: 300, body: '#f3f0e6', ear: '#cfc7b5', belly: '#ffffff', accent: '#d96a4a', desc: '腿还站不太稳的小鹤，头顶已经有一点朱红。' },
        { stage: 2, name: '仙鹤', min: 300, next: 900, body: '#f6f3eb', ear: '#d7cfbe', belly: '#ffffff', accent: '#d96a4a', desc: '在云边练习单脚站立，一站就是半页单词的时间。' },
        { stage: 3, name: '云中仙鹤', min: 900, next: 2000, body: '#fbf8f0', ear: '#dcd4c3', belly: '#ffffff', accent: '#c9784e', desc: '展开翅膀能托住一小片云，载着你飞过语法难关。' },
        { stage: 4, name: '九霄仙鹤', min: 2000, next: null, body: '#fffdf7', ear: '#e3dccb', belly: '#ffffff', accent: '#f0c987', desc: '一声清唳穿过九霄，所有背过的句子都排成队跟着它飞。' }
      ]
    },
    lingyuan: {
      name: '灵猿',
      color: '#a98257',
      motion: 'wood',
      unlock: { type: 'tasks', value: 30, label: '累计完成 30 个任务解锁', unit: '个' },
      stages: [
        { stage: 1, name: '青枝幼猿', min: 0, next: 300, body: '#c2a077', ear: '#7e5a38', belly: '#f4e4cd', accent: '#d9b66f', desc: '挂在树枝上的小猿，尾巴比手臂还会抓东西。' },
        { stage: 2, name: '灵猿', min: 300, next: 900, body: '#b08a5f', ear: '#6d4c2d', belly: '#f6e7d2', accent: '#c9a45e', desc: '会把你背错的词一个个摘下来，放进自己的树洞。' },
        { stage: 3, name: '通臂灵猿', min: 900, next: 2000, body: '#a67c50', ear: '#614126', belly: '#f8ebd8', accent: '#8fbf6f', desc: '手臂一伸就能碰到整片树林，难题再也无处可藏。' },
        { stage: 4, name: '参天灵猿', min: 2000, next: null, body: '#bf9668', ear: '#74512f', belly: '#fff3e0', accent: '#f0c987', desc: '坐在参天古木顶上，把学过的知识编成一张结实的网。' }
      ]
    },
    jinchan: {
      name: '金蟾',
      color: '#d9a63f',
      motion: 'gold',
      unlock: { type: 'poolSpent', value: 500, label: '累计分配 500 点经验解锁', unit: '经验' },
      stages: [
        { stage: 1, name: '铜钱幼蟾', min: 0, next: 300, body: '#e0bd6d', ear: '#a8781f', belly: '#ffe9a8', accent: '#f6d36b', desc: '趴在铜钱堆里的小蟾，嘴边总叼着一枚亮闪闪的币。' },
        { stage: 2, name: '金蟾', min: 300, next: 900, body: '#d9a63f', ear: '#9a6a18', belly: '#ffe9a8', accent: '#f2c44e', desc: '每分一次经验，它背上的金纹就多一道。' },
        { stage: 3, name: '招财金蟾', min: 900, next: 2000, body: '#e0ad45', ear: '#a2701c', belly: '#fff0bd', accent: '#f6d36b', desc: '蹲在经验池边，把攒下的成长值一枚枚数清楚。' },
        { stage: 4, name: '月宫金蟾', min: 2000, next: null, body: '#edc464', ear: '#b07a22', belly: '#fff8d9', accent: '#f6d99a', desc: '月宫里的金蟾，张口吐出的不是钱，是整整一池可以自由分配的经验。' }
      ]
    },
    yinglong: {
      name: '应龙',
      color: '#5fb3bd',
      motion: 'storm',
      unlock: { type: 'fusion', value: 1, label: '首次融合精灵后解锁', unit: '次' },
      stages: [
        { stage: 1, name: '翼龙崽', min: 0, next: 300, body: '#7fc7cf', ear: '#2f7f8c', belly: '#e8ffff', accent: '#e8c37c', desc: '背上的小翅膀还飞不高，却已经能招来一朵乌云。' },
        { stage: 2, name: '应龙', min: 300, next: 900, body: '#6bbcc5', ear: '#286e7b', belly: '#e8ffff', accent: '#b7e3f2', desc: '有翼的龙，飞过的地方会落下细细的雨。' },
        { stage: 3, name: '风雨应龙', min: 900, next: 2000, body: '#5ab0ba', ear: '#226370', belly: '#ecffff', accent: '#8fd3cf', desc: '一振翅就起风，一摆尾就下雨，语法难点被冲得干干净净。' },
        { stage: 4, name: '太虚应龙', min: 2000, next: null, body: '#87cfd5', ear: '#3d8793', belly: '#f5ffff', accent: '#f0c987', desc: '蓄水行雨的上古龙神，双翼展开时，雷声都替它让路。' }
      ]
    }
  };

  function mixHex(hex, target, ratio) {
    const parse = (value, fallback) => {
      const raw = String(value || '').replace('#', '');
      const full = raw.length === 3 ? raw.split('').map((char) => char + char).join('') : raw.padEnd(6, '0').slice(0, 6);
      const num = parseInt(full, 16);
      return Number.isNaN(num) ? fallback : [(num >> 16) & 255, (num >> 8) & 255, num & 255];
    };
    const a = parse(hex, [136, 136, 136]);
    const b = parse(target, [255, 255, 255]);
    const t = Math.max(0, Math.min(1, Number(ratio) || 0));
    const out = a.map((value, index) => Math.round(value + (b[index] - value) * t));
    return `#${((1 << 24) + (out[0] << 16) + (out[1] << 8) + out[2]).toString(16).slice(1)}`;
  }

  function petPoolOf(p) {
    const who = p || profile();
    if (!who) return { earned: 0, spent: 0, log: [] };
    if (!who.petPool || typeof who.petPool !== 'object') who.petPool = { earned: 0, spent: 0, log: [] };
    who.petPool.earned = Math.max(0, Math.round(Number(who.petPool.earned) || 0));
    who.petPool.spent = Math.max(0, Math.round(Number(who.petPool.spent) || 0));
    if (who.petPool.spent > who.petPool.earned) who.petPool.spent = who.petPool.earned;
    who.petPool.log = Array.isArray(who.petPool.log) ? who.petPool.log.filter((item) => item && item.at).slice(0, 30) : [];
    return who.petPool;
  }

  function poolAvailable(p) {
    const pool = petPoolOf(p);
    return Math.max(0, pool.earned - pool.spent);
  }

  function petUnlockStats(p) {
    const who = p || profile() || {};
    const tasks = (data && Array.isArray(data.tasks) ? data.tasks : [])
      .filter((task) => task && task.status === 'done');
    const wordTasks = tasks.filter((task) => task.mode === 'words');
    const grammarTasks = tasks.filter((task) => task.mode === 'grammar');
    const words = wordTasks.reduce((sum, task) => sum + ((task.wordStats || []).length), 0);
    const perfect = wordTasks.filter((task) => Number(task.score) === 100 && (task.wordStats || []).length >= 5).length;
    const night = tasks.filter((task) => {
      const at = new Date(task.submittedAt || task.doneAt || task.completedAt || '');
      return !Number.isNaN(at.getTime()) && at.getHours() >= 18;
    }).length;
    const pool = petPoolOf(who);
    return {
      checkins: ((who && who.checkins) || []).length,
      streak: activityStreak(who),
      pool: pool.earned,
      poolSpent: pool.spent,
      words,
      wordTasks: wordTasks.length,
      grammarTasks: grammarTasks.length,
      reports: Math.max(0, Number(who.reportCount) || 0),
      perfect,
      tasks: tasks.length,
      night,
      fusion: who ? fusionCount(who) : 0
    };
  }

  function petUnlockState(p, id) {
    const species = PET_SPECIES[id];
    if (!species || !species.unlock) return { unlocked: true, progress: 1, text: '已解锁', have: 1, need: 1, unit: '' };
    const need = Math.max(1, Number(species.unlock.value) || 1);
    const stats = petUnlockStats(p);
    const have = Math.max(0, Number(stats[species.unlock.type]) || 0);
    return {
      unlocked: have >= need,
      progress: Math.min(1, have / need),
      have,
      need,
      text: species.unlock.label,
      unit: species.unlock.unit || ''
    };
  }

  function petDisplaySpeciesName(p, id) {
    if (id === 'fusion') return (p && p.fusion && p.fusion.name) || '融合精灵';
    return petSpeciesInfo(id).name;
  }

  const FUSION_NAMES = {
    'fox|otter': '潮焰星狐',
    'otter|whale': '深海灵獭',
    'bird|otter': '潮羽圣獭',
    'fox|whale': '星云幻狐',
    'bird|fox': '星焰天狐',
    'bird|whale': '云焰鲲鹏'
  };

  /* 融合之后的路：每 500–1000 成长提升一阶共鸣，只给小鱼干和称号，不再滚经验。 */
  const FUSION_TIERS = [
    { min: 2500, name: '初醒', next: 3000, desc: '它还在适应这具新的身体，偶尔会同时看向两个方向。' },
    { min: 3000, name: '共鸣', next: 3500, snacks: 8, desc: '两股力量开始同频，呼吸时会有两种颜色的光交替亮起。' },
    { min: 3500, name: '星辉', next: 4000, snacks: 12, desc: '它走过的地方会短暂浮起星屑，像把两道因果缝在一起。' },
    { min: 4000, name: '月蚀', next: 5000, snacks: 15, title: '融相', desc: '它学会把光收进身体里，只在需要时露出一线。' },
    { min: 5000, name: '无相', next: null, snacks: 30, title: '无相', desc: '已经看不出它由谁融合而来，只剩一个安静的答案。' }
  ];

  const MOON_PHASES = [
    { name: '新月', icon: '🌑' },
    { name: '上弦', icon: '🌓' },
    { name: '满月', icon: '🌕' },
    { name: '下弦', icon: '🌗' }
  ];

  const MOON_CYCLE_TITLES = ['守月人', '月宫客', '广寒行者'];

  function fusionKey(a, b) {
    return [a, b].filter(Boolean).sort().join('|');
  }

  function fusionDisplayName(a, b) {
    return FUSION_NAMES[fusionKey(a, b)] || `${petSpeciesInfo(a).name}·${petSpeciesInfo(b).name}`;
  }

  function fusionTier(xp) {
    const value = Math.max(0, Number(xp) || 0);
    let index = 0;
    for (let i = 0; i < FUSION_TIERS.length; i += 1) {
      if (value >= FUSION_TIERS[i].min) index = i;
    }
    const tier = FUSION_TIERS[index];
    return { ...tier, index, next: tier.next };
  }

  function fusionsOf(p) {
    if (!p) return {};
    if (!p.fusions || typeof p.fusions !== 'object') p.fusions = {};
    if (p.fusion && Array.isArray(p.fusion.pair) && p.fusion.pair.length >= 2) {
      const key = fusionKey(p.fusion.pair[0], p.fusion.pair[1]);
      if (!p.fusions[key]) {
        p.fusion.key = p.fusion.key || key;
        p.fusions[key] = p.fusion;
      }
      if (!p.activeFusion) p.activeFusion = key;
    }
    if (p.activeFusion && p.fusions[p.activeFusion]) p.fusion = p.fusions[p.activeFusion];
    else if (!p.fusion) {
      const keys = Object.keys(p.fusions);
      if (keys.length) {
        p.activeFusion = keys[0];
        p.fusion = p.fusions[keys[0]];
      }
    }
    return p.fusions;
  }

  function fusionCount(p) {
    return Object.keys(fusionsOf(p)).length;
  }

  function titlesOf(p) {
    if (!p) return [];
    if (!Array.isArray(p.titles)) p.titles = [];
    return p.titles;
  }

  function grantTitle(p, title) {
    if (!p || !title) return false;
    const list = titlesOf(p);
    if (list.indexOf(title) >= 0) return false;
    list.push(title);
    return true;
  }

  function activePetId(p) {
    const who = p || profile();
    const id = String(who && who.activePet || 'otter');
    if (PET_SPECIES[id]) return id;
    if (id === 'fusion') {
      if (who && !who.fusion) fusionsOf(who);
      return who && who.fusion ? 'fusion' : 'otter';
    }
    return who && who.fusion ? 'fusion' : 'otter';
  }

  function petSpeciesInfo(id) {
    return PET_SPECIES[id] || PET_SPECIES.otter;
  }

  function petStageOf(xp, speciesId) {
    const species = petSpeciesInfo(speciesId || 'otter');
    const value = Math.max(0, Number(xp) || 0);
    let info = species.stages[0];
    species.stages.forEach((item) => { if (value >= item.min) info = item; });
    return { ...info, speciesId: speciesId || 'otter' };
  }

  function ensurePet(profileObj, speciesId) {
    const p = profileObj;
    const id = speciesId || activePetId(p);
    p.pets = p.pets && typeof p.pets === 'object' ? p.pets : {};
    if (id === 'fusion') {
      fusionsOf(p);
      if (!p.fusion) p.fusion = { id: 'fusion', name: '融合精灵', xp: 0, snacks: 0, fed: 0, lastFed: '', lastEvolvedStage: 4, pair: [] };
      const fused = p.fusion;
      fused.xp = Math.max(0, Math.round(Number(fused.xp) || 0));
      fused.snacks = Math.max(0, Math.round(Number(fused.snacks) || 0));
      fused.fed = Math.max(0, Math.round(Number(fused.fed) || 0));
      fused.lastFed = String(fused.lastFed || '');
      fused.lastEvolvedStage = 4;
      if (!Array.isArray(fused.tierSeen)) fused.tierSeen = [fusionTier(fused.xp).index];
      return fused;
    }
    if (!p.pets[id]) {
      let seed = 0;
      if (id === 'otter') {
        if (p.pet && typeof p.pet === 'object') {
          seed = Math.max(0, Math.round(Number(p.pet.xp) || 0));
        } else {
          const doneWords = (data && Array.isArray(data.tasks) ? data.tasks : [])
            .filter((task) => task.mode === 'words' && task.status === 'done');
          seed = Math.round(doneWords.reduce((sum, task) => sum + (Number(task.xpEarned) || 0), 0) * 0.6);
        }
      }
      p.pets[id] = { xp: seed, snacks: 0, fed: 0, lastFed: '', lastEvolvedStage: petStageOf(seed, id).stage };
    }
    const pet = p.pets[id];
    pet.xp = Math.max(0, Math.round(Number(pet.xp) || 0));
    pet.snacks = Math.max(0, Math.round(Number(pet.snacks) || 0));
    pet.fed = Math.max(0, Math.round(Number(pet.fed) || 0));
    pet.lastFed = String(pet.lastFed || '');
    pet.lastEvolvedStage = Math.max(1, Math.round(Number(pet.lastEvolvedStage) || 1));
    return pet;
  }

  function fusionPairFor(p) {
    const fusions = fusionsOf(p);
    const finals = Object.keys(PET_SPECIES).filter((id) => ensurePet(p, id).xp >= 2000);
    for (let i = 0; i < finals.length; i += 1) {
      for (let j = i + 1; j < finals.length; j += 1) {
        const key = fusionKey(finals[i], finals[j]);
        if (!fusions[key]) return { a: finals[i], b: finals[j], key, name: fusionDisplayName(finals[i], finals[j]) };
      }
    }
    return null;
  }

  /* 融合栏常驻：展示下一组最近的两只神兽、各自成长和还差多少。 */
  function nextFusionPair(p) {
    const fusions = fusionsOf(p);
    const made = new Set(Object.keys(fusions));
    const unlocked = Object.keys(PET_SPECIES).filter((id) => petUnlockState(p, id).unlocked);
    const pool = unlocked.length >= 2 ? unlocked : Object.keys(PET_SPECIES);
    let best = null;
    for (let i = 0; i < pool.length; i += 1) {
      for (let j = i + 1; j < pool.length; j += 1) {
        const key = fusionKey(pool[i], pool[j]);
        if (made.has(key)) continue;
        const ax = ensurePet(p, pool[i]).xp;
        const bx = ensurePet(p, pool[j]).xp;
        const ready = ax >= 2000 && bx >= 2000;
        const score = Math.min(ax, 2000) + Math.min(bx, 2000) + (ready ? 4000 : 0);
        if (!best || score > best.score) {
          best = { a: pool[i], b: pool[j], key, name: fusionDisplayName(pool[i], pool[j]), ax, bx, ready, score };
        }
      }
    }
    return best;
  }

  /* ------------------------- 连续学习 / 满月转盘 ------------------------- */

  function activityDates(p) {
    const who = p || profile();
    const set = new Set();
    ((who && who.checkins) || []).forEach((date) => set.add(String(date).slice(0, 10)));
    ((data && data.tasks) || []).forEach((task) => {
      if (task && task.status === 'done' && task.submittedAt) set.add(String(task.submittedAt).slice(0, 10));
    });
    return set;
  }

  function activityStreak(p) {
    const set = activityDates(p);
    if (!set.size) return 0;
    const today = S.todayIso();
    let cursor = set.has(today) ? today : S.addDays(today, -1);
    if (!set.has(cursor)) return 0;
    let days = 0;
    while (set.has(cursor)) {
      days += 1;
      cursor = S.addDays(cursor, -1);
    }
    return days;
  }

  const WHEEL_SEGMENTS = [
    { key: 'snack5', icon: '🐟', label: '小鱼干 ×5', note: '给精灵加餐', weight: 24, color: '#8fd3cf', kind: 'snacks', value: 5 },
    { key: 'pet120', icon: '✨', label: '成长 +120', note: '当前出战精灵', weight: 24, color: '#f0c987', kind: 'petxp', value: 120 },
    { key: 'pet260', icon: '🌟', label: '成长 +260', note: '当前出战精灵', weight: 18, color: '#e8a07f', kind: 'petxp', value: 260 },
    { key: 'snack12', icon: '🐟', label: '小鱼干 ×12', note: '够吃一阵子', weight: 12, color: '#9dbbe3', kind: 'snacks', value: 12 },
    { key: 'chest', icon: '🎁', label: '满月宝箱', note: '+50 EXP · 成长 +200', weight: 12, color: '#c9a7e8', kind: 'chest', value: 0 },
    { key: 'star', icon: '💫', label: '星辉大奖', note: '成长 +500', weight: 10, color: '#f6d99a', kind: 'petxp', value: 500 }
  ];

  function wheelInfo(p) {
    const who = p || profile();
    if (!who.wheel || typeof who.wheel !== 'object') who.wheel = { lastSpinAt: '', spins: [] };
    if (!Array.isArray(who.wheel.spins)) who.wheel.spins = [];
    if (!Number.isFinite(Number(who.wheel.totalSpins))) {
      who.wheel.totalSpins = Math.max(who.wheel.spins.length, who.wheel.lastSpinAt ? 1 : 0, (Number(who.wheel.cycles) || 0) * 4);
    }
    who.wheel.totalSpins = Math.max(0, Math.round(Number(who.wheel.totalSpins) || 0));
    if (!Number.isFinite(Number(who.wheel.cycles))) who.wheel.cycles = Math.floor(who.wheel.totalSpins / 4);
    who.wheel.cycles = Math.max(0, Math.round(Number(who.wheel.cycles) || 0));
    return who.wheel;
  }

  function wheelCounters(wheel) {
    const totalSpins = Math.max(0, Math.round(Number(wheel.totalSpins) || 0));
    const cycles = Math.max(0, Math.round(Number(wheel.cycles) || 0));
    const inCycle = totalSpins === 0 ? 0 : (totalSpins % 4 === 0 ? 4 : totalSpins % 4);
    return { totalSpins, cycles, inCycle, remaining: 4 - inCycle };
  }

  function wheelReady(p) {
    const streak = activityStreak(p);
    const wheel = wheelInfo(p);
    const daysSince = wheel.lastSpinAt ? S.daysBetween(wheel.lastSpinAt, S.todayIso()) : 999;
    const daysLeft = Math.max(0, 30 - daysSince);
    const streakLeft = Math.max(0, 30 - streak);
    const canSpin = streak >= 30 && daysLeft === 0;
    return { streak, wheel, canSpin, daysLeft, streakLeft, counters: wheelCounters(wheel) };
  }

  function wheelNextText(state) {
    if (state.canSpin) return '满月已经到了，可以转动转盘。';
    if (state.streak < 30) return `还差 ${30 - state.streak} 天连续学习；满 30 天后转盘才会亮起。`;
    if (state.daysLeft > 0) return `距上次领取还差 ${state.daysLeft} 天；这期间每天学一点，转盘才会再次亮起。`;
    return '下一次满月：再连续学习 30 天。';
  }

  function wheelCycleReward(cycle) {
    if (cycle <= 1) return '小鱼干 ×10 · 称号「守月人」';
    if (cycle === 2) return '成长 +300 · 称号「月宫客」';
    return '小鱼干 ×15 · 成长 +300 · 称号「广寒行者」';
  }

  function renderWheelJournal(state) {
    const box = $('#wheel-journal');
    if (!box) return;
    const counters = state.counters;
    const moons = MOON_PHASES.map((phase, index) =>
      `<span class="${index < counters.inCycle ? 'is-lit' : ''}"><i>${index < counters.inCycle ? phase.icon : '·'}</i><b>${phase.name}</b></span>`
    ).join('');
    const history = (state.wheel.spins || []).slice(0, 4).map((spin) =>
      `<li><span>${String(spin.at || '').slice(0, 10)}</span><b>${S.escapeHtml(spin.label || '')}</b><small>连续 ${Number(spin.streak) || 0} 天</small></li>`
    ).join('');
    box.innerHTML =
      `<div class="wheel-journal-head"><b>月光手账</b><span>已转 ${counters.totalSpins} 次 · 完成月轮 ${counters.cycles} 轮</span></div>` +
      `<div class="wheel-moons">${moons}</div>` +
      `<p class="wheel-cycle-note">${counters.inCycle >= 4
        ? '这一轮月相已经集满，下一次转盘点亮新一轮的新月。'
        : `再转 ${counters.remaining} 次集满本轮月相。`} 第 ${counters.cycles + 1} 轮奖励：${wheelCycleReward(counters.cycles + 1)}</p>` +
      (history ? `<ul class="wheel-history">${history}</ul>` : '<p class="wheel-history-empty">还没有记录，第一次满月会写在这里。</p>') +
      `<p class="wheel-next">${wheelNextText(state)}</p>`;
  }

  function pickWheelSegment() {
    const total = WHEEL_SEGMENTS.reduce((sum, segment) => sum + segment.weight, 0);
    let roll = Math.random() * total;
    for (let i = 0; i < WHEEL_SEGMENTS.length; i += 1) {
      roll -= WHEEL_SEGMENTS[i].weight;
      if (roll < 0) return i;
    }
    return WHEEL_SEGMENTS.length - 1;
  }

  function openWheelDialog() {
    if (!requireTrial()) return;
    const state = wheelReady();
    const dialog = $('#wheel-dialog');
    if (!dialog) return;
    const disc = $('#wheel-disc');
    const legend = $('#wheel-legend');
    const result = $('#wheel-result');
    const button = $('#wheel-spin-btn');
    if (result) { result.hidden = true; result.textContent = ''; }
    if (disc) {
      disc.style.transition = 'none';
      disc.style.transform = 'rotate(0deg)';
      const stops = WHEEL_SEGMENTS.map((segment, index) => {
        const start = index * (360 / WHEEL_SEGMENTS.length);
        const end = (index + 1) * (360 / WHEEL_SEGMENTS.length);
        return `${segment.color} ${start}deg ${end}deg`;
      }).join(', ');
      disc.style.background = `conic-gradient(from 0deg, ${stops})`;
      disc.innerHTML = WHEEL_SEGMENTS.map((segment, index) =>
        `<span class="wheel-label" style="--angle:${index * 60 + 30}deg"><i>${segment.icon}</i></span>`
      ).join('');
      void disc.offsetWidth;
      disc.style.transition = '';
    }
    if (legend) {
      legend.innerHTML = WHEEL_SEGMENTS.map((segment) =>
        `<span><i style="background:${segment.color}">${segment.icon}</i><b>${segment.label}</b><small>${segment.note}</small></span>`
      ).join('');
    }
    if (button) {
      button.disabled = !state.canSpin;
      button.textContent = state.canSpin ? '转动转盘' : (state.streak < 30 ? '未满 30 天' : state.daysLeft > 0 ? `还有 ${state.daysLeft} 天` : '还差一点');
    }
    renderWheelJournal(state);
    S.openDialog(dialog);
  }

  function spinWheel() {
    const state = wheelReady();
    if (!state.canSpin) { S.toast('连续学习满 30 天，并且距上次领奖满 30 天，才能再转一次。', 'error', 6000); return; }
    const disc = $('#wheel-disc');
    const button = $('#wheel-spin-btn');
    const result = $('#wheel-result');
    if (!disc || !button || button.disabled) return;
    button.disabled = true;
    button.textContent = '转盘转动中…';
    const index = pickWheelSegment();
    const segment = WHEEL_SEGMENTS[index];
    const center = index * 60 + 30;
    const rotation = 360 * 5 + (360 - center);
    disc.style.transform = `rotate(${rotation}deg)`;
    setTimeout(() => {
      const p = profile();
      const pet = ensurePet(p);
      let rewardText = '';
      if (segment.kind === 'snacks') {
        pet.snacks += segment.value;
        rewardText = `${segment.label}，已经放进精灵的小鱼干口袋。`;
      } else if (segment.kind === 'petxp') {
        addPetXp(segment.value);
        rewardText = `${segment.label}，直接加到当前出战的精灵身上。`;
      } else {
        addXp(50);
        pet.xp += 200;
        rewardText = `${segment.label}：账号 +50 EXP，精灵成长 +200。`;
      }
      const wheel = wheelInfo(p);
      wheel.lastSpinAt = S.todayIso();
      wheel.spins.unshift({
        at: S.nowIso(),
        label: segment.label,
        note: segment.note,
        streak: state.streak
      });
      wheel.spins = wheel.spins.slice(0, 24);
      wheel.totalSpins = (Number(wheel.totalSpins) || 0) + 1;
      let cycleNote = '';
      if (wheel.totalSpins % 4 === 0) {
        wheel.cycles = (Number(wheel.cycles) || 0) + 1;
        const cycle = wheel.cycles;
        const title = MOON_CYCLE_TITLES[Math.min(cycle - 1, MOON_CYCLE_TITLES.length - 1)];
        grantTitle(p, title);
        if (cycle === 1) {
          pet.snacks += 10;
          cycleNote = `月相集满一轮：获得称号「${title}」和小鱼干 ×10。`;
        } else if (cycle === 2) {
          addPetXp(300);
          cycleNote = `月相集满两轮：获得称号「${title}」和成长 +300。`;
        } else {
          pet.snacks += 15;
          addPetXp(300);
          cycleNote = `月相又集满一轮：获得称号「${title}」、小鱼干 ×15 和成长 +300。`;
        }
      }
      save();
      renderAll();
      if (result) {
        const counters = wheelCounters(wheel);
        result.hidden = false;
        result.innerHTML = `<b>${segment.icon} ${segment.label}</b><span>${rewardText}</span>` +
          (cycleNote ? `<span class="wheel-cycle-hit">${cycleNote}</span>` : '') +
          `<small>这是连续学习 ${state.streak} 天的满月奖励 · 月相 ${counters.inCycle}/4。下一次满月：${S.addDays(S.todayIso(), 30)}（保持连续学习）。</small>`;
      }
      renderWheelJournal(wheelReady(p));
      if (result) setTimeout(() => result.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 160);
      button.textContent = '本月奖励已领取';
      S.toast(cycleNote ? `转盘奖励：${segment.label}；${cycleNote}` : `转盘奖励：${segment.label}`, 'ok', 7000);
    }, 4300);
  }

  function switchPet(speciesId) {
    const p = profile();
    if (!p) return;
    if (speciesId === 'fusion' && !p.fusion) { S.toast('还没有融合精灵。两只精灵都到终极形态后可以融合。', 'error'); return; }
    if (speciesId !== 'fusion' && !PET_SPECIES[speciesId]) return;
    if (speciesId !== 'fusion') {
      const lock = petUnlockState(p, speciesId);
      if (!lock.unlocked) {
        S.toast(`${PET_SPECIES[speciesId].name}还没解锁：${lock.text}（当前 ${lock.have}/${lock.need} ${lock.unit}）。`, 'error', 5200);
        return;
      }
    }
    p.activePet = speciesId;
    save();
    renderPet();
    S.toast(`已切换为「${petDisplayInfo(p).name}」。`, 'ok');
  }

  let fusionSceneTimer = 0;

  function closeFusionScene() {
    if (fusionSceneTimer) { clearTimeout(fusionSceneTimer); fusionSceneTimer = 0; }
    const overlay = $('#fusion-overlay');
    if (overlay) overlay.remove();
    document.body.classList.remove('fusion-open');
  }

  function openFusionScene(preview, pairOverride) {
    const p = profile();
    const existingCount = fusionCount(p);
    const candidate = pairOverride || fusionPairFor(p);
    const pair = candidate || nextFusionPair(p);
    if (!pair) { S.toast('能融合的组合都已经完成了，去解锁更多神兽吧。', 'error', 6000); return; }
    const ready = ensurePet(p, pair.a).xp >= 2000 && ensurePet(p, pair.b).xp >= 2000;
    const realPair = ready ? pair : null;
    if (!realPair && !preview) { S.toast('需要两只精灵都成长到终极形态（2000）才能融合。', 'error', 6000); return; }
    const locked = !realPair;
    closeFusionScene();
    const a = petSpeciesInfo(pair.a);
    const b = petSpeciesInfo(pair.b);
    const ax = ensurePet(p, pair.a).xp;
    const bx = ensurePet(p, pair.b).xp;
    const gapA = Math.max(0, 2000 - ax);
    const gapB = Math.max(0, 2000 - bx);
    const overlay = document.createElement('div');
    overlay.className = 'fusion-overlay is-charging';
    overlay.id = 'fusion-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', locked ? '融合预告' : '精灵融合');
    overlay.innerHTML =
      `<div class="fusion-veil" data-fusion-cancel></div>` +
      `<div class="fusion-stage${locked ? ' is-preview' : ''}">` +
        `<p class="fusion-kicker">${locked ? '融合预览' : `融合 · 第 ${existingCount + 1} 次`}</p>` +
        `<div class="fusion-void" aria-hidden="true">` +
          `<div class="fusion-hole left"><i class="fusion-disc"></i><i class="fusion-ring r1"></i><i class="fusion-ring r2"></i><i class="fusion-core"></i><b>${S.escapeHtml(a.name)}</b></div>` +
          `<div class="fusion-hole right"><i class="fusion-disc"></i><i class="fusion-ring r1"></i><i class="fusion-ring r2"></i><i class="fusion-core"></i><b>${S.escapeHtml(b.name)}</b></div>` +
          `<div class="fusion-thread t1"></div><div class="fusion-thread t2"></div><div class="fusion-thread t3"></div>` +
          `<div class="fusion-motes">` +
            Array.from({ length: 14 }, (_, i) => `<i style="--i:${i}"></i>`).join('') +
          `</div>` +
          `<div class="fusion-question" aria-hidden="true">?</div>` +
          `<div class="fusion-reveal" aria-hidden="true">${petSVG(4, 'fusion', true)}</div>` +
        `</div>` +
        `<h2 class="fusion-title">${locked ? '融合条件还没满足' : '可以融合了'}</h2>` +
        `<p class="fusion-copy">${locked
          ? `${S.escapeHtml(a.name)}与${S.escapeHtml(b.name)}还没有同时到终极形态。<br>还差 ${gapA} 与 ${gapB} 点成长。`
          : `${S.escapeHtml(a.name)}与${S.escapeHtml(b.name)}都到终极形态了。<br>融合后两只都会保留，可随时切换。`}</p>` +
        `<div class="fusion-actions">` +
          `<button class="p-btn fusion-main" type="button" data-fusion-confirm>${locked ? '继续攒成长' : '开始融合'}</button>` +
          `<button class="p-btn ghost" type="button" data-fusion-cancel>${locked ? '关闭' : '再等等'}</button>` +
        `</div>` +
        `<p class="fusion-note">${locked ? '两只都到 2000 成长值后即可融合。' : existingCount ? `已经融合 ${existingCount} 只；这一只也会留在融合图鉴里。` : '两只精灵都会保留，融合后随时可以切回来。'}</p>` +
      `</div>`;
    document.body.appendChild(overlay);
    document.body.classList.add('fusion-open');
    fusionSceneTimer = setTimeout(() => {
      overlay.classList.remove('is-charging');
      overlay.classList.add('is-collapsing');
      const title = overlay.querySelector('.fusion-title');
      const copy = overlay.querySelector('.fusion-copy');
      if (title) title.textContent = locked ? '还差一点' : '融合中';
      if (copy) copy.innerHTML = locked
        ? '两只都到 2000 成长值后才能融合。'
        : '正在融合两只神兽…';
      fusionSceneTimer = setTimeout(() => {
        overlay.classList.remove('is-collapsing');
        overlay.classList.add('is-question');
        const main = overlay.querySelector('[data-fusion-confirm]');
        if (main) main.textContent = locked ? '继续攒成长' : '完成融合';
      }, 1500);
    }, 2100);
    overlay.onclick = (event) => {
      if (event.target.closest('[data-fusion-cancel]')) { closeFusionScene(); return; }
      const confirm = event.target.closest('[data-fusion-confirm]');
      if (!confirm) return;
      if (!overlay.classList.contains('is-question')) return;
      if (locked) {
        closeFusionScene();
        S.toast('两只神兽都到 2000 成长值后，再回来融合。', 'ok', 5200);
        return;
      }
      overlay.classList.add('is-revealed');
      const name = overlay.querySelector('.fusion-copy');
      if (name) name.innerHTML = `${existingCount ? `第 ${existingCount + 1} 只融合神兽是` : '新的融合神兽是'}「<b>${S.escapeHtml(pair.name)}</b>」。`;
      const title = overlay.querySelector('.fusion-title');
      if (title) title.textContent = '融合完成';
      overlay.querySelectorAll('.fusion-actions button').forEach((button) => { button.disabled = true; });
      fusionSceneTimer = setTimeout(() => {
        closeFusionScene();
        performFusion(pair);
      }, 1700);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') { document.removeEventListener('keydown', onKey); closeFusionScene(); }
    };
    document.addEventListener('keydown', onKey, { once: true });
  }

  function fusePets() {
    openFusionScene();
  }

  function activateFusion(key) {
    const p = profile();
    if (!p) return;
    const fusions = fusionsOf(p);
    if (!fusions[key]) return;
    p.activeFusion = key;
    p.fusion = fusions[key];
    p.activePet = 'fusion';
    save();
    renderPet();
    S.toast(`已切换为「${p.fusion.name || '融合精灵'}」。`, 'ok');
  }

  function performFusion(pair) {
    const p = profile();
    if (!p || !pair) return;
    const fusions = fusionsOf(p);
    const key = pair.key || fusionKey(pair.a, pair.b);
    if (fusions[key]) { activateFusion(key); return; }
    const a = ensurePet(p, pair.a);
    const b = ensurePet(p, pair.b);
    const xp = Math.max(a.xp, b.xp) + 500;
    const tier = fusionTier(xp);
    const fused = {
      id: 'fusion',
      key,
      name: pair.name || fusionDisplayName(pair.a, pair.b),
      xp,
      snacks: 0,
      fed: 0,
      lastFed: '',
      lastEvolvedStage: 4,
      pair: [pair.a, pair.b],
      createdAt: S.nowIso(),
      tierSeen: Array.from({ length: tier.index + 1 }, (_, index) => index)
    };
    fusions[key] = fused;
    p.activeFusion = key;
    p.fusion = fused;
    p.activePet = 'fusion';
    save();
    renderAll();
    S.toast(`第 ${Object.keys(fusions).length} 只融合神兽「${fused.name}」加入了融合图鉴。`, 'ok', 7000);
  }

  let petSvgSeq = 0;

  function petSVG(stage, speciesId, fused, options) {
    if (window.ShunshiPetArt) {
      const artSpecies = PET_SPECIES[speciesId] ? speciesId : 'otter';
      const artStages = petSpeciesInfo(artSpecies).stages;
      const artStage = Math.max(1, Math.min(artStages.length, Number(stage) || 1));
      const artColors = artStages[artStage - 1];
      return window.ShunshiPetArt.render({
        stage: artStage,
        species: artSpecies,
        colors: { body: artColors.body, ear: artColors.ear, belly: artColors.belly, accent: artColors.accent },
        fused: Boolean(fused),
        motion: fused ? 'storm' : (petSpeciesInfo(artSpecies).motion || 'earth'),
        thumb: Boolean(options && options.thumb),
        label: `${fused ? '融合精灵' : petSpeciesInfo(artSpecies).name} · ${artColors.name}`
      });
    }
    const speciesKey = PET_SPECIES[speciesId] ? speciesId : 'otter';
    const species = petSpeciesInfo(speciesKey);
    const s = Math.max(1, Math.min(species.stages.length, Number(stage) || 1));
    const p = { ...species.stages[s - 1] };
    if (fused) {
      p.body = '#9fdfd2';
      p.ear = '#4f8f8b';
      p.accent = '#f0c987';
      p.belly = '#fff8e9';
    }
    const uid = `petdefs${++petSvgSeq}`;
    const gid = (name) => `${uid}-${name}`;
    const bodyLight = mixHex(p.body, '#ffffff', 0.48);
    const bodyDark = mixHex(p.ear, '#142d33', 0.18);
    const earLight = mixHex(p.ear, '#ffffff', 0.28);
    const bellyLight = mixHex(p.belly, '#ffffff', 0.4);
    const bellyShade = mixHex(p.belly, p.ear, 0.22);
    const accentLight = mixHex(p.accent, '#ffffff', 0.42);
    const accentDark = mixHex(p.accent, '#7a4b16', 0.28);
    const defs = `<defs>` +
      `<radialGradient id="${gid('body')}" cx="32%" cy="22%" r="88%"><stop offset="0" stop-color="${bodyLight}"/><stop offset=".52" stop-color="${p.body}"/><stop offset="1" stop-color="${bodyDark}"/></radialGradient>` +
      `<radialGradient id="${gid('head')}" cx="34%" cy="24%" r="82%"><stop offset="0" stop-color="${mixHex(p.body, '#ffffff', 0.58)}"/><stop offset=".6" stop-color="${p.body}"/><stop offset="1" stop-color="${mixHex(p.body, p.ear, 0.64)}"/></radialGradient>` +
      `<linearGradient id="${gid('belly')}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bellyLight}"/><stop offset="1" stop-color="${bellyShade}"/></linearGradient>` +
      `<linearGradient id="${gid('accent')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${accentLight}"/><stop offset=".5" stop-color="${p.accent}"/><stop offset="1" stop-color="${accentDark}"/></linearGradient>` +
      `<radialGradient id="${gid('glow')}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${accentLight}" stop-opacity=".52"/><stop offset="1" stop-color="${accentLight}" stop-opacity="0"/></radialGradient>` +
      `<filter id="${gid('blur')}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>` +
      `<filter id="${gid('soft')}" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.2"/></filter>` +
    `</defs>`;
    const aura = s >= 4
      ? `<g class="pet-aura"><circle cx="130" cy="116" r="98" fill="url(#${gid('glow')})"/><circle cx="130" cy="116" r="92" fill="none" stroke="${p.accent}" stroke-opacity=".26" stroke-width="7"/><circle cx="130" cy="116" r="76" fill="none" stroke="${p.accent}" stroke-opacity=".18" stroke-width="1.6" stroke-dasharray="3 7"/></g>`
      : s >= 3
        ? `<g class="pet-aura is-soft"><circle cx="130" cy="116" r="84" fill="url(#${gid('glow')})" opacity=".6"/></g>`
        : '';
    const blush = s >= 2
      ? `<ellipse cx="104" cy="102" rx="5" ry="2.6" fill="#e98f78" opacity=".32"/><ellipse cx="156" cy="102" rx="5" ry="2.6" fill="#e98f78" opacity=".32"/>`
      : '';
    const leaf = s === 2
      ? `<g class="pet-leaf"><path d="M130 50c0-9 3-16 8-21" fill="none" stroke="#6fa77a" stroke-width="2.4" stroke-linecap="round"/><path d="M136 38c8-8 15-8 20-4-4 8-12 11-20 8Z" fill="#83b97f"/><path d="M133 44c-7-6-13-5-17-1 4 7 10 9 17 6Z" fill="#9ccb8f"/></g>`
      : '';
    const scarf = s >= 3
      ? `<g class="pet-scarf"><path d="M96 108c10 7 21 10 34 10s24-3 34-10" fill="none" stroke="#dd7a5e" stroke-width="9" stroke-linecap="round"/><path d="M158 112c9 6 13 15 11 26-7-7-14-9-21-8Z" fill="#dd7a5e"/><path d="M164 120l4 6" stroke="#f3c39c" stroke-width="1.6" stroke-linecap="round"/></g>`
      : '';
    const crown = s >= 4
      ? `<g class="pet-crown"><path d="M104 64c9-5 43-5 52 0" fill="none" stroke="#f0c987" stroke-width="3" stroke-linecap="round"/><path d="M130 54l4 7-4 7-4-7Z" fill="#f6d99a" stroke="#d5a75b" stroke-width="1"/><path d="M106 62l-2-6m50 6 2-6" stroke="#f0c987" stroke-width="2" stroke-linecap="round"/></g>`
      : '';
    const isFox = speciesKey === 'fox';
    const isWhale = speciesKey === 'whale';
    const isBird = speciesKey === 'bird';
    const isBaize = speciesKey === 'baize';
    const isQilin = speciesKey === 'qilin';
    const isZhulong = speciesKey === 'zhulong';
    const isMythic = isBaize || isQilin || isZhulong;
    const eye = (x, y, rx, ry) =>
      `<ellipse class="pet-eye" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#213f46"/>` +
      `<circle cx="${x + 1.3}" cy="${y - 1.9}" r="1.4" fill="#fff" opacity=".92"/>` +
      `<ellipse cx="${x}" cy="${y + ry * 0.55}" rx="${rx * 0.55}" ry="${ry * 0.35}" fill="${p.accent}" opacity=".22"/>`;
    const shadow = `<ellipse cx="130" cy="190" rx="62" ry="10" fill="#17343b" opacity=".16" filter="url(#${gid('blur')})"/>`;
    const bubbles = `<g class="pet-bubbles"><circle class="pet-bubble b1" cx="52" cy="98" r="3.4" fill="${p.accent}" opacity=".45"/><circle class="pet-bubble b2" cx="196" cy="74" r="4.4" fill="${p.accent}" opacity=".36"/><circle class="pet-bubble b3" cx="208" cy="124" r="2.6" fill="${p.accent}" opacity=".4"/></g>`;
    const water = `<g class="pet-water"><ellipse cx="130" cy="184" rx="94" ry="12" fill="${p.accent}" opacity=".1"/><path d="M36 184c15-6 30-6 45 0s30 6 45 0 30-6 45 0 30 6 45 0" fill="none" stroke="${p.accent}" stroke-opacity=".32" stroke-width="1.8" stroke-linecap="round"/></g>`;
    const fusionAura = fused
      ? `<g class="pet-fusion-aura"><circle cx="130" cy="112" r="104" fill="none" stroke="#f0c987" stroke-opacity=".38" stroke-width="3" stroke-dasharray="4 8"/><circle cx="130" cy="112" r="88" fill="none" stroke="#8ed9c9" stroke-opacity=".32" stroke-width="5"/></g>`
      : '';
    let art = '';

    if (isBaize) {
      const mane = Array.from({ length: 13 }, (_, i) => {
        const angle = Math.PI * 0.92 + (i / 12) * Math.PI * 1.16;
        const x = 130 + Math.cos(angle) * 44;
        const y = 86 + Math.sin(angle) * 41;
        const r = 13 + (i % 3) * 2;
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="url(#${gid('head')})" opacity=".96"/>`;
      }).join('');
      art = `<g class="pet-body-group">` +
        `<path class="pet-tail" d="M84 148c-26 8-44-2-48-24 15 7 27 10 40 5 7-3 11 2 10 8Z" fill="url(#${gid('body')})"/>` +
        `<circle cx="34" cy="124" r="11" fill="${earLight}"/><circle cx="44" cy="138" r="11" fill="${p.body}"/>` +
        mane +
        `<ellipse cx="130" cy="146" rx="54" ry="36" fill="url(#${gid('body')})"/>` +
        `<ellipse cx="130" cy="152" rx="37" ry="24" fill="url(#${gid('belly')})"/>` +
        `<path d="M101 168l-2 16m60-16 2 16" stroke="${p.ear}" stroke-width="9" stroke-linecap="round"/>` +
        `<ellipse cx="98" cy="185" rx="9" ry="4.4" fill="${p.accent}"/><ellipse cx="162" cy="185" rx="9" ry="4.4" fill="${p.accent}"/>` +
        `<circle cx="130" cy="86" r="38" fill="url(#${gid('head')})"/>` +
        `<path d="M99 66c-7-4-12-1-14 5 5 1 9 3 12 7Z" fill="${p.ear}"/><path d="M161 66c7-4 12-1 14 5-5 1-9 3-12 7Z" fill="${p.ear}"/>` +
        `<path d="M126 53c-4-17 2-28 14-35-5 14-2 23 4 30Z" fill="url(#${gid('accent')})" stroke="${accentDark}" stroke-width="1"/>` +
        `<ellipse cx="130" cy="66" rx="5.6" ry="8.2" fill="url(#${gid('accent')})"/><ellipse cx="130" cy="66" rx="1.8" ry="5" fill="#203f45"/>` +
        eye(114, 86, 4.8, 5.8) + eye(146, 86, 4.8, 5.8) +
        `<ellipse cx="130" cy="104" rx="19" ry="13" fill="url(#${gid('belly')})"/>` +
        `<path d="M125 100h10l-5 4Z" fill="${p.ear}"/><path d="M130 104v2m0 0c-2.4 2.2-5.5 2.2-7.5 0m7.5 0c2.4 2.2 5.5 2.2 7.5 0" fill="none" stroke="#4b6668" stroke-width="1.3" stroke-linecap="round"/>` +
        `<path d="M110 98 96 95m14 8-14 4m58-11 14-3m-14 8 14 4" stroke="#7d8b85" stroke-width="1" stroke-linecap="round" opacity=".6"/>` +
        `<path d="M104 139c8-5 16-6 24-2m24 2c-8-5-16-6-24-2" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".5"/>` +
        (s >= 3 ? `<circle cx="86" cy="104" r="2.3" fill="${p.accent}"/><circle cx="174" cy="104" r="2.3" fill="${p.accent}"/>` : '') +
        (isMythic ? '' : scarf) + leaf + crown +
      `</g>`;
    } else if (isQilin) {
      const scales = Array.from({ length: 3 }, (_, row) =>
        Array.from({ length: 4 }, (_, col) =>
          `<path d="M${101 + col * 15} ${139 + row * 9}c5 5 10 5 14 0" fill="none" stroke="${accentDark}" stroke-width="1" opacity=".33"/>`
        ).join('')
      ).join('');
      art = `<g class="pet-body-group">` +
        `<path class="pet-tail" d="M84 148C52 152 36 132 40 108c12 15 26 22 42 22 5 0 7 8 2 18Z" fill="url(#${gid('accent')})" opacity=".92"/>` +
        `<path d="M44 112c-4-12 2-20 10-25-1 10 2 17 7 23Z" fill="${accentLight}"/>` +
        `<ellipse cx="130" cy="146" rx="54" ry="35" fill="url(#${gid('body')})"/>` +
        `<ellipse cx="130" cy="152" rx="36" ry="23" fill="url(#${gid('belly')})"/>` +
        scales +
        `<path d="M104 166v18m52-18v18" stroke="${p.ear}" stroke-width="9" stroke-linecap="round"/>` +
        `<path d="M96 181h15m38 0h15" stroke="${p.accent}" stroke-width="5" stroke-linecap="round"/>` +
        `<path d="M96 108c-10-14-11-28-6-42 10 9 16 20 18 33Zm68 0c10-14 11-28 6-42-10 9-16 20-18 33Z" fill="url(#${gid('accent')})" opacity=".9"/>` +
        `<circle cx="130" cy="84" r="36" fill="url(#${gid('head')})"/>` +
        `<path d="M112 56c-5-15-2-27 6-36 2 12 6 20 12 25m20 11c5-15 2-27-6-36-2 12-6 20-12 25" fill="none" stroke="url(#${gid('accent')})" stroke-width="5" stroke-linecap="round"/>` +
        `<path d="M118 43l-8-10m9 2-6-9m37 17 8-10m-9 2 6-9" stroke="${accentLight}" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="M127 52c-2-10 1-17 7-22-1 9 1 15 5 19Z" fill="url(#${gid('accent')})"/>` +
        eye(115, 80, 4.6, 5.6) + eye(145, 80, 4.6, 5.6) +
        `<path d="M112 98c8 7 28 7 36 0 1 10-7 16-18 16s-19-6-18-16Z" fill="url(#${gid('belly')})"/>` +
        `<circle cx="121" cy="102" r="1.8" fill="${p.ear}"/><circle cx="139" cy="102" r="1.8" fill="${p.ear}"/>` +
        `<path d="M130 104v3m0 0c-2.5 2.4-5.8 2.4-8 0m8 0c2.5 2.4 5.8 2.4 8 0" fill="none" stroke="#4b6668" stroke-width="1.3" stroke-linecap="round"/>` +
        `<path d="M110 92c-10 4-19 4-27 1m27 5c-9 5-17 7-24 6m61-12c10 4 19 4 27 1m-27 5c9 5 17 7 24 6" stroke="#6f8b79" stroke-width="1" stroke-linecap="round" opacity=".55"/>` +
        (s >= 3 ? `<circle cx="130" cy="34" r="5" fill="none" stroke="${p.accent}" stroke-width="1.6" opacity=".7"/><circle cx="130" cy="34" r="1.8" fill="${p.accent}"/>` : '') +
        leaf + crown +
      `</g>`;
    } else if (isZhulong) {
      art = `<g class="pet-body-group">` +
        `<path class="pet-tail" d="M92 158C62 176 26 162 24 132c-2-22-12-32-18-28 20-3 34 9 34 30 0 14 16 20 38 8Z" fill="url(#${gid('body')})" stroke="${p.ear}" stroke-width="2"/>` +
        `<path d="M6 104c8-2 14 2 18 10-8 1-15-2-18-10Z" fill="url(#${gid('accent')})"/>` +
        `<path d="M58 136l-10-8 12-2m-6 24-10-6 10-6" fill="${p.accent}" opacity=".85"/>` +
        `<ellipse cx="130" cy="148" rx="52" ry="34" fill="url(#${gid('body')})"/>` +
        `<ellipse cx="130" cy="154" rx="35" ry="22" fill="url(#${gid('belly')})"/>` +
        `<path d="M104 168l-12 12m46-12 12 12" stroke="${p.ear}" stroke-width="8" stroke-linecap="round"/>` +
        `<ellipse cx="90" cy="183" rx="7" ry="4" fill="${p.accent}"/><ellipse cx="170" cy="183" rx="7" ry="4" fill="${p.accent}"/>` +
        `<circle cx="130" cy="84" r="37" fill="url(#${gid('head')})"/>` +
        `<path d="M116 54c-8-12-18-19-30-21 7 9 10 17 10 25m34-4c8-12 18-19 30-21-7 9-10 17-10 25" fill="none" stroke="url(#${gid('accent')})" stroke-width="4.6" stroke-linecap="round"/>` +
        `<path d="M108 94c10 10 34 10 44 0 0 12-9 20-22 20s-22-8-22-20Z" fill="url(#${gid('belly')})"/>` +
        `<circle cx="121" cy="99" r="1.9" fill="${p.ear}"/><circle cx="139" cy="99" r="1.9" fill="${p.ear}"/>` +
        eye(115, 80, 4.8, 5.9) + eye(145, 80, 4.8, 5.9) +
        `<path d="M106 92c-12 2-20 8-24 16m24-10c-11 3-18 9-21 16m76-22c12 2 20 8 24 16m-24-10c11 3 18 9 21 16" fill="none" stroke="${p.accent}" stroke-width="1.4" stroke-linecap="round" opacity=".75"/>` +
        `<path d="M108 70c-4-8-2-14 4-19 1 7 4 12 8 14m32 5c4-8 2-14-4-19-1 7-4 12-8 14" fill="${p.accent}" opacity=".55"/>` +
        (s >= 2
          ? `<g class="pet-orb"><circle cx="182" cy="52" r="17" fill="url(#${gid('glow')})"/><circle cx="182" cy="52" r="6.4" fill="url(#${gid('accent')})"/><circle cx="180" cy="50" r="2" fill="#fff" opacity=".8"/></g>`
          : '') +
        `<path d="M96 142c7-5 15-5 22 0m24 0c7-5 15-5 22 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".35"/>` +
        crown +
      `</g>`;
    } else {
      const ears = isWhale
        ? `<path d="M108 58c-2-12 2-20 9-25 3 10 5 18 5 25Z" fill="${p.ear}" opacity=".9"/><path d="M152 58c2-12-2-20-9-25-3 10-5 18-5 25Z" fill="${p.ear}" opacity=".9"/>`
        : isBird
          ? `<path d="M96 66c-7-10-9-18-6-25 9 4 15 10 18 19Z" fill="${p.ear}"/><path d="M164 66c7-10 9-18 6-25-9 4-15 10-18 19Z" fill="${p.ear}"/>`
          : isFox
            ? `<path d="M92 66 86 34l27 15Z" fill="url(#${gid('head')})"/><path d="M168 66l6-32-27 15Z" fill="url(#${gid('head')})"/>` +
              `<path d="M95 60 92 43l14 9Z" fill="#e8b39a" opacity=".7"/><path d="M165 60l3-17-14 9Z" fill="#e8b39a" opacity=".7"/>`
            : `<circle cx="100" cy="56" r="11" fill="${p.ear}"/><circle cx="160" cy="56" r="11" fill="${p.ear}"/>` +
              `<circle cx="100" cy="56" r="5" fill="#e8b39a" opacity=".8"/><circle cx="160" cy="56" r="5" fill="#e8b39a" opacity=".8"/>`;
      const tail = isFox
        ? `<path class="pet-tail" d="M80 150c-30 10-54-2-60-24 20 5 33 30 58 5 8-8 12-5 14 1Z" fill="${p.ear}"/><path d="M26 128c12 8 20 14 29 14" stroke="#fff4e4" stroke-width="4" stroke-linecap="round" opacity=".8"/>`
        : isWhale
          ? `<path class="pet-tail" d="M74 148c-18 2-32 12-38 26 14-2 26-8 36-18Z" fill="${p.ear}"/><path d="M188 148c18 2 32 12 38 26-14-2-26-8-36-18Z" fill="${p.ear}"/>`
          : isBird
            ? `<path class="pet-tail" d="M112 168c-12 12-17 22-16 30 10-2 18-8 24-18Zm36 0c12 12 17 22 16 30-10-2-18-8-24-18Z" fill="${p.ear}"/>`
            : `<path class="pet-tail" d="M78 150c-22 5-41-3-52-19 17 6 33 6 47 2Z" fill="${p.ear}"/>`;
      const face = isBird
        ? `<path d="M124 96h12l-6 10Z" fill="url(#${gid('accent')})"/>`
        : `<path d="M126 95h8l-4 4Z" fill="#3c5b5e"/>` +
          `<path d="M130 99v3m0 0c-2.5 2.5-6 2.5-8 0m8 0c2.5 2.5 6 2.5 8 0" fill="none" stroke="#3c5b5e" stroke-width="1.4" stroke-linecap="round"/>`;
      const whiskers = isWhale || isBird
        ? ''
        : `<path d="M108 96 94 94m14 7-14 4m58-9 14-2m-14 7 14 4" stroke="#5b7d7c" stroke-width="1" stroke-linecap="round" opacity=".65"/>`;
      const speciesExtras = isWhale
        ? `<g class="pet-spout"><path d="M130 48c-2-12 3-20 8-25m-8 25c-3-9-8-13-14-15" fill="none" stroke="${p.accent}" stroke-width="2.4" stroke-linecap="round" opacity=".8"/></g>` +
          `<ellipse cx="94" cy="145" rx="17" ry="8" fill="${p.ear}" transform="rotate(-24 94 145)"/><ellipse cx="166" cy="145" rx="17" ry="8" fill="${p.ear}" transform="rotate(24 166 145)"/>`
        : isBird
          ? `<path d="M92 136c-18-8-28-20-30-36 13 2 24 10 33 23Z" fill="${p.ear}"/><path d="M168 136c18-8 28-20 30-36-13 2-24 10-33 23Z" fill="${p.ear}"/>`
          : '';
      art = `<g class="pet-body-group">` +
        tail +
        `<ellipse cx="130" cy="140" rx="60" ry="38" fill="url(#${gid('body')})"/>` +
        `<ellipse cx="130" cy="146" rx="42" ry="27" fill="url(#${gid('belly')})"/>` +
        ears +
        `<circle cx="130" cy="88" r="40" fill="url(#${gid('head')})"/>` +
        `<ellipse cx="130" cy="101" rx="23" ry="17" fill="url(#${gid('belly')})"/>` +
        blush +
        eye(116, 85, 4.4, 5.4) + eye(144, 85, 4.4, 5.4) +
        face + whiskers +
        `<ellipse cx="106" cy="140" rx="10" ry="7.4" fill="${p.ear}" transform="rotate(-14 106 140)"/>` +
        `<ellipse cx="154" cy="140" rx="10" ry="7.4" fill="${p.ear}" transform="rotate(14 154 140)"/>` +
        `<path d="M130 124c-11 0-19 7-19 14 0 6 9 10 19 10s19-4 19-10c0-7-8-14-19-14Z" fill="url(#${gid('accent')})"/>` +
        `<path d="M130 126v20m0-20-8 7m8-7 8 7m-8-7-4 9m4-9 4 9" fill="none" stroke="#b98345" stroke-width="1" opacity=".65"/>` +
        `<ellipse cx="111" cy="72" rx="13" ry="7" fill="#fff" opacity=".18" transform="rotate(-28 111 72)"/>` +
        speciesExtras + leaf + scarf + crown +
      `</g>`;
    }

    return `<svg class="pet-svg pet-stage-${s}${fused ? ' is-fused' : ''}" viewBox="0 0 260 210" role="img" aria-label="${fused ? '融合精灵' : species.name} · ${p.name}">` +
      defs + fusionAura + aura + water + bubbles + shadow + art +
    `</svg>`;
  }

  function petDisplayInfo(p) {
    const id = activePetId(p);
    if (id === 'fusion') {
      const fused = ensurePet(p, 'fusion');
      const tier = fusionTier(fused.xp);
      return {
        id: 'fusion',
        name: (p.fusion && p.fusion.name) || '融合精灵',
        info: { stage: 4, name: `共鸣 · ${tier.name}`, min: tier.min, next: tier.next, desc: tier.desc },
        pet: fused,
        fused: true
      };
    }
    const species = petSpeciesInfo(id);
    const pet = ensurePet(p, id);
    return { id, name: species.name, info: petStageOf(pet.xp, id), pet, fused: false };
  }

  function addPetXp(amount, speciesId) {
    const p = profile();
    const id = speciesId || activePetId(p);
    const pet = ensurePet(p, id);
    if (id === 'fusion') {
      const beforeTier = fusionTier(pet.xp);
      pet.xp = Math.max(0, Math.round(pet.xp + Number(amount || 0)));
      const afterTier = fusionTier(pet.xp);
      const seen = Array.isArray(pet.tierSeen) ? pet.tierSeen.slice() : [];
      const fresh = [];
      for (let index = 0; index <= afterTier.index; index += 1) {
        if (seen.indexOf(index) < 0) { seen.push(index); fresh.push(FUSION_TIERS[index]); }
      }
      pet.tierSeen = seen;
      pet.lastEvolvedStage = 4;
      const parts = [];
      fresh.forEach((tier) => {
        if (tier.snacks) { pet.snacks += tier.snacks; parts.push(`小鱼干 ×${tier.snacks}`); }
        if (tier.title && grantTitle(p, tier.title)) parts.push(`称号「${tier.title}」`);
      });
      const evolved = afterTier.index > beforeTier.index;
      if (evolved) {
        const scene = $('#pet-scene');
        if (scene) {
          scene.classList.add('is-evolve');
          setTimeout(() => scene.classList.remove('is-evolve'), 1800);
        }
        S.toast(`「${pet.name || '融合精灵'}」共鸣提升：${afterTier.name}${parts.length ? ` · ${parts.join(' · ')}` : ''}`, 'ok', 6500);
      }
      save();
      return evolved;
    }
    const before = petStageOf(pet.xp, id).stage;
    pet.xp = Math.max(0, Math.round(pet.xp + Number(amount || 0)));
    const info = petStageOf(pet.xp, id);
    const evolved = info.stage > before;
    if (evolved) {
      pet.lastEvolvedStage = info.stage;
      const scene = $('#pet-scene');
      if (scene) {
        scene.classList.add('is-evolve');
        setTimeout(() => scene.classList.remove('is-evolve'), 1800);
      }
      S.toast(`${petSpeciesInfo(id).name}进化成「${info.name}」了！`, 'ok', 6000);
    }
    save();
    return evolved;
  }

  function ensurePetUnlocks(p) {
    if (!p) return [];
    p.unlockedPets = p.unlockedPets && typeof p.unlockedPets === 'object' ? p.unlockedPets : {};
    const fresh = [];
    Object.keys(PET_SPECIES).forEach((id) => {
      if (!PET_SPECIES[id].unlock) return;
      const state = petUnlockState(p, id);
      if (state.unlocked && !p.unlockedPets[id]) {
        p.unlockedPets[id] = S.nowIso();
        fresh.push(id);
      }
    });
    if (fresh.length) save();
    return fresh;
  }

  function targetLabel(p, id) {
    if (id === 'fusion') return (p.fusion && p.fusion.name) || '融合精灵';
    return petSpeciesInfo(id).name;
  }

  function renderPetPool(p) {
    const box = $('#pet-pool');
    if (!box) return;
    const pool = petPoolOf(p);
    const available = Math.max(0, pool.earned - pool.spent);
    const fill = $('#pet-pool-fill');
    if (fill) fill.style.width = `${pool.earned ? Math.round((available / pool.earned) * 100) : 0}%`;
    const text = $('#pet-pool-text');
    if (text) text.textContent = `可用 ${available} · 累计获得 ${pool.earned}`;
    const select = $('#pet-pool-target');
    if (select) {
      const previous = select.value;
      const options = Object.keys(PET_SPECIES)
        .filter((id) => petUnlockState(p, id).unlocked)
        .map((id) => `<option value="${id}">${S.escapeHtml(petSpeciesInfo(id).name)} · ${S.escapeHtml(petStageOf(ensurePet(p, id).xp, id).name)}</option>`);
      if (p.fusion) options.push(`<option value="fusion">${S.escapeHtml((p.fusion && p.fusion.name) || '融合精灵')} · 共鸣 ${fusionTier(p.fusion.xp).name}</option>`);
      select.innerHTML = options.join('');
      /* 切换神兽后，分配目标默认跟着当前出战神兽走；只有它不在可选列表时才保留旧选择。 */
      const wanted = [activePetId(p), previous].find((id) => id && Array.from(select.options).some((option) => option.value === id));
      if (wanted) select.value = wanted;
    }
    const amount = $('#pet-pool-amount');
    if (amount) {
      amount.max = String(available);
      if (document.activeElement !== amount) amount.value = String(Math.min(50, available) || 0);
      amount.disabled = available <= 0;
    }
    const button = $('#pet-pool-allocate');
    if (button) button.disabled = available <= 0;
    const hint = $('#pet-pool-hint');
    if (hint) {
      hint.textContent = available > 0
        ? `把经验分给指定神兽，1 点经验池 = 1 点成长值。`
        : `学习获得 EXP 的 60% 会进入经验池，继续做任务就能攒到。`;
    }
  }

  function allocatePetPool() {
    const p = profile();
    if (!p) return;
    const target = $('#pet-pool-target') ? $('#pet-pool-target').value : '';
    const raw = $('#pet-pool-amount') ? Number($('#pet-pool-amount').value) : 0;
    const amount = Math.floor(raw);
    if (target !== 'fusion' && !PET_SPECIES[target]) { S.toast('先选择一只神兽。', 'error'); return; }
    if (target !== 'fusion' && !petUnlockState(p, target).unlocked) { S.toast('这只神兽还没解锁。', 'error'); return; }
    if (!Number.isFinite(amount) || amount <= 0) { S.toast('输入要分配的经验数量。', 'error'); return; }
    const available = poolAvailable(p);
    if (amount > available) { S.toast(`经验池只有 ${available} 点可用。`, 'error'); return; }
    const pool = petPoolOf(p);
    pool.spent += amount;
    pool.log.unshift({ at: S.nowIso(), type: 'spend', amount, target, name: targetLabel(p, target) });
    pool.log = pool.log.slice(0, 30);
    addPetXp(amount, target);
    save();
    renderPet();
    S.toast(`已把 ${amount} 点经验分给「${targetLabel(p, target)}」，成长 +${amount}。`, 'ok', 5000);
  }

  function petMotionOn() {
    try {
      return localStorage.getItem(PET_MOTION_KEY) !== 'off';
    } catch (error) {
      return true;
    }
  }

  function setPetMotion(on) {
    try {
      localStorage.setItem(PET_MOTION_KEY, on ? 'on' : 'off');
    } catch (error) { /* ignore */ }
    const scene = $('#pet-scene');
    if (scene) scene.classList.toggle('is-motion', on);
    const button = $('#pet-motion-btn');
    if (button) {
      button.textContent = on ? '动感：开' : '动感：关';
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    S.toast(on ? '精灵开始活动了，点它还会回应你。' : '已切到安静模式，动画暂停。', 'ok', 2600);
  }

  function petReact(event) {
    const scene = $('#pet-scene');
    if (!scene) return;
    scene.classList.remove('is-happy');
    void scene.offsetWidth;
    scene.classList.add('is-happy');
    setTimeout(() => scene.classList.remove('is-happy'), 900);
    const phrases = ['我在听！', '今天也一起加油。', '再戳一下试试？', '小鱼干在哪里？', '这个线索有意思！'];
    const mood = $('#pet-mood');
    if (mood) mood.textContent = phrases[Math.floor(Math.random() * phrases.length)];
    const rect = scene.getBoundingClientRect();
    const x = event && Number.isFinite(event.clientX) ? event.clientX - rect.left : rect.width / 2;
    const y = event && Number.isFinite(event.clientY) ? event.clientY - rect.top : rect.height / 2;
    for (let index = 0; index < 3; index += 1) {
      const heart = document.createElement('span');
      heart.className = 'pet-heart';
      heart.textContent = index === 1 ? '✦' : '♥';
      heart.style.left = `${Math.max(12, Math.min(rect.width - 12, x + (index - 1) * 20))}px`;
      heart.style.top = `${Math.max(20, y - 8)}px`;
      heart.style.animationDelay = `${index * 0.08}s`;
      scene.appendChild(heart);
      setTimeout(() => heart.remove(), 1400);
    }
  }

  function renderPet() {
    const p = profile();
    const scene = $('#pet-scene');
    if (!p || !scene) return;
    const unlockedNow = ensurePetUnlocks(p);
    if (unlockedNow.length) {
      S.toast(`新神兽解锁：${unlockedNow.map((id) => petSpeciesInfo(id).name).join('、')}！去图鉴里切换看看吧。`, 'ok', 7000);
    }
    const activeId = activePetId(p);
    if (activeId !== 'fusion' && !petUnlockState(p, activeId).unlocked) p.activePet = 'otter';
    scene.classList.toggle('is-motion', petMotionOn());
    const motionButton = $('#pet-motion-btn');
    if (motionButton) {
      motionButton.textContent = petMotionOn() ? '动感：开' : '动感：关';
      motionButton.setAttribute('aria-pressed', petMotionOn() ? 'true' : 'false');
    }
    const display = petDisplayInfo(p);
    const { pet, info } = display;
    scene.innerHTML = petSVG(info.stage, display.id, display.fused);
    $('#pet-name').textContent = display.name;
    $('#pet-stage-name').textContent = info.name;
    const titleEl = $('#pet-titles');
    const titles = titlesOf(p);
    if (titleEl) {
      titleEl.hidden = !titles.length;
      titleEl.innerHTML = titles.slice(-4).map((title) => `<span>${S.escapeHtml(title)}</span>`).join('');
      titleEl.title = titles.length ? `称号：${titles.join('、')}` : '';
    }
    const attrEl = $('#pet-attr');
    if (attrEl) {
      const motion = display.fused ? 'storm' : (petSpeciesInfo(display.id).motion || 'earth');
      attrEl.textContent = PET_ATTR_LABELS[motion] || '灵';
      attrEl.className = `pet-attr pet-attr-${motion}`;
      attrEl.title = `属性：${PET_ATTR_LABELS[motion] || '灵'}`;
    }
    $('#pet-desc').textContent = display.fused ? `两股力量合为一体。${info.desc}` : info.desc;
    const span = info.next ? info.next - info.min : 0;
    const ratio = info.next ? Math.min(1, Math.max(0, (pet.xp - info.min) / span)) : 1;
    $('#pet-growth-fill').style.width = `${Math.round(ratio * 100)}%`;
    $('#pet-growth').setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    $('#pet-growth-text').textContent = info.next
      ? `${display.fused ? '共鸣值' : '成长值'} ${pet.xp} / ${info.next}`
      : `${display.fused ? '共鸣值' : '成长值'} ${pet.xp} · ${display.fused ? '已到最高共鸣' : '已到最高形态'}`;
    $('#pet-snack-count').textContent = `×${pet.snacks}`;
    $('#pet-feed-btn').disabled = pet.snacks <= 0;

    const today = S.todayIso();
    let mood = '去单词打卡里赚点小鱼干吧。';
    if (pet.lastFed === today) mood = '今天吃得饱饱的，满足地打着滚。';
    else if (pet.snacks > 0) mood = `有 ${pet.snacks} 条小鱼干，喂我一条吧。`;
    else if (p.checkins.includes(today)) mood = '今天一起学习过，我很开心。';
    $('#pet-mood').textContent = mood;

    const wordTasks = data.tasks.filter((task) => task.mode === 'words' && task.status === 'done');
    const words = wordTasks.reduce((sum, task) => sum + (task.wordStats || []).length, 0);
    $('#pet-stats').innerHTML =
      `<span><b>${pet.xp}</b>${display.fused ? '融合成长' : '累计成长'}</span>` +
      `<span><b>${words}</b>学过的词</span>` +
      `<span><b>${p.checkins.length}</b>打卡天数</span>` +
      `<span><b>${pet.fed}</b>喂食次数</span>`;

    renderPetPool(p);
    renderPetRoster(p);
    renderFusionBar(p);
    renderWheelEntry(p);

    if (!display.fused && info.stage > (pet.lastEvolvedStage || 1)) {
      pet.lastEvolvedStage = info.stage;
      save();
      scene.classList.add('is-evolve');
      setTimeout(() => scene.classList.remove('is-evolve'), 1800);
      S.toast(`${display.name}进化成「${info.name}」了！`, 'ok', 6000);
    }
  }

  let petRosterOpen = false;

  function renderPetRoster(p) {
    const box = $('#pet-roster');
    if (!box) return;
    const active = activePetId(p);
    const ids = Object.keys(PET_SPECIES);
    const states = {};
    ids.forEach((id) => { states[id] = petUnlockState(p, id); });
    const unlockedCount = ids.filter((id) => states[id].unlocked).length;
    const ordered = ids.slice().sort((a, b) => {
      const ua = states[a].unlocked ? 0 : 1;
      const ub = states[b].unlocked ? 0 : 1;
      if (ua !== ub) return ua - ub;
      if (ua === 1) return states[b].progress - states[a].progress;
      return ids.indexOf(a) - ids.indexOf(b);
    });
    const cards = ordered.map((id) => {
      const species = PET_SPECIES[id];
      const lock = states[id];
      const pet = ensurePet(p, id);
      const info = petStageOf(pet.xp, id);
      if (!lock.unlocked) {
        return `<button class="pet-chip is-locked" type="button" data-pet-switch="${id}" title="${S.escapeHtml(lock.text)}">` +
          `<span class="pet-chip-art">${petSVG(1, id, false, { thumb: true })}</span>` +
          `<span><b>🔒 ${species.name}</b><small>${S.escapeHtml(lock.text)} · ${lock.have}/${lock.need} ${lock.unit}</small></span>` +
          `<span class="pet-lock-progress"><i style="width:${Math.round(lock.progress * 100)}%"></i></span>` +
        `</button>`;
      }
      return `<button class="pet-chip ${active === id ? 'is-active' : ''}" type="button" data-pet-switch="${id}" title="切换为 ${species.name}">` +
        `<span class="pet-chip-art">${petSVG(info.stage, id, false, { thumb: true })}</span>` +
        `<span><b>${species.name}</b><small>${info.name} · ${pet.xp}</small></span>` +
      `</button>`;
    }).join('');
    const fusions = fusionsOf(p);
    const fusionCards = Object.keys(fusions).map((key) => {
      const fused = fusions[key];
      const tier = fusionTier(fused.xp);
      const isActive = active === 'fusion' && p.activeFusion === key;
      return `<button class="pet-chip fusion ${isActive ? 'is-active' : ''}" type="button" data-pet-switch="fusion" data-fusion-key="${S.escapeHtml(key)}" title="切换为 ${S.escapeHtml(fused.name || '融合精灵')}">` +
        `<span class="pet-chip-art fusion-chip-art">${petSVG(4, 'fusion', true, { thumb: true })}<i class="pet-chip-mark">?</i></span>` +
        `<span><b>${S.escapeHtml(fused.name || '融合精灵')}</b><small>共鸣 ${tier.name} · ${fused.xp}</small></span></button>`;
    }).join('');
    box.innerHTML = `<div class="pet-roster-head"><b>精灵图鉴</b><span>每一只单独成长，喂食和打卡都会加到当前出战精灵。</span></div>` +
      `<button class="pet-roster-toggle" type="button" data-pet-roster-toggle aria-expanded="${petRosterOpen ? 'true' : 'false'}">` +
        `<span><b>神兽收藏 · 已解锁 ${unlockedCount} / ${ids.length}</b><small>${petRosterOpen ? '收起图鉴' : '展开图鉴'}</small></span>` +
        `<i aria-hidden="true">${petRosterOpen ? '▴' : '▾'}</i>` +
      `</button>` +
      `<div class="pet-chips${petRosterOpen ? ' is-open' : ''}"${petRosterOpen ? '' : ' hidden'}>${cards}${fusionCards}</div>`;
    const toggle = box.querySelector('[data-pet-roster-toggle]');
    if (toggle) {
      toggle.onclick = () => {
        petRosterOpen = !petRosterOpen;
        renderPetRoster(p);
      };
    }
  }

  function renderFusionBar(p) {
    const box = $('#pet-fusion-bar');
    if (!box) return;
    const fusions = fusionsOf(p);
    const count = Object.keys(fusions).length;
    if (count && p.fusion) {
      const fused = p.fusion;
      const tier = fusionTier(fused.xp);
      const next = nextFusionPair(p);
      const span = tier.next ? tier.next - tier.min : 0;
      const ratio = tier.next ? Math.min(1, Math.max(0, (fused.xp - tier.min) / span)) : 1;
      const nextLine = next
        ? `<span class="pet-fusion-next">下一组：${S.escapeHtml(petSpeciesInfo(next.a).name)} ${next.ax} / 2000 · ${S.escapeHtml(petSpeciesInfo(next.b).name)} ${next.bx} / 2000</span>`
        : '<span class="pet-fusion-next">能融合的组合都已经完成了，去解锁更多神兽吧。</span>';
      box.className = 'pet-fusion-bar is-done';
      box.innerHTML =
        `<div class="pet-fusion-orbs is-done" aria-hidden="true"><i class="hole left"></i><span class="ask">?</span><i class="hole right"></i></div>` +
        `<div class="pet-fusion-copy">` +
          `<b>融合栏 · 已融合 ${count} 只</b>` +
          `<span>「${S.escapeHtml(fused.name || '融合精灵')}」· 共鸣 ${tier.name} · ${fused.xp}${tier.next ? ` / ${tier.next}` : ''}</span>` +
          `<div class="pet-fusion-meters"><span><i style="width:${Math.round(ratio * 100)}%"></i><em>${tier.name} ${fused.xp}${tier.next ? ` / ${tier.next}` : ''}</em></span></div>` +
          nextLine +
        `</div>` +
        `<div class="pet-fusion-actions">` +
          `<button class="p-btn small ghost" type="button" data-fusion-view="1">看融合神兽</button>` +
          (next ? `<button class="p-btn small" type="button" data-fusion-open="${next.ready ? '1' : 'preview'}">${next.ready ? '再融合一组' : '下一组'}</button>` : '') +
        `</div>`;
      const view = box.querySelector('[data-fusion-view]');
      if (view) view.onclick = () => switchPet('fusion');
      const open = box.querySelector('[data-fusion-open]');
      if (open) open.onclick = () => openFusionScene(!next.ready, next);
      return;
    }
    const nearest = nextFusionPair(p);
    if (!nearest) {
      box.className = 'pet-fusion-bar is-done';
      box.innerHTML = '融合栏 · 所有能融合的组合都完成了。';
      return;
    }
    const a = petSpeciesInfo(nearest.a);
    const b = petSpeciesInfo(nearest.b);
    const ax = nearest.ax;
    const bx = nearest.bx;
    const ready = nearest.ready;
    const pct = (xp) => Math.max(2, Math.min(100, Math.round((xp / 2000) * 100)));
    box.className = `pet-fusion-bar${ready ? ' is-ready' : ''}`;
    box.innerHTML =
      `<div class="pet-fusion-orbs" aria-hidden="true"><i class="hole left"></i><span class="ask">?</span><i class="hole right"></i></div>` +
      `<div class="pet-fusion-copy">` +
        `<b>融合栏</b>` +
        `<span>${ready ? '两只神兽都到终极形态了，可以融合。' : '两只神兽都到终极形态（2000）后即可融合。'}</span>` +
        `<div class="pet-fusion-meters">` +
          `<span><i style="width:${pct(ax)}%"></i><em>${S.escapeHtml(a.name)} ${ax} / 2000</em></span>` +
          `<span><i style="width:${pct(bx)}%"></i><em>${S.escapeHtml(b.name)} ${bx} / 2000</em></span>` +
        `</div>` +
      `</div>` +
      `<button class="p-btn small ${ready ? '' : 'ghost'}" type="button" data-fusion-open="${ready ? '1' : 'preview'}">${ready ? '打开融合' : '看看还差多少'}</button>`;
    const open = box.querySelector('[data-fusion-open]');
    if (open) open.onclick = () => openFusionScene(!ready, nearest);
  }

  function renderWheelEntry(p) {
    const box = $('#pet-wheel-entry');
    if (!box) return;
    const state = wheelReady(p);
    const { streak, canSpin, counters } = state;
    const moons = MOON_PHASES.map((phase, index) =>
      `<i class="${index < counters.inCycle ? 'is-lit' : ''}" title="${phase.name}">${index < counters.inCycle ? phase.icon : '·'}</i>`
    ).join('');
    const detail = canSpin
      ? '连续学习满 30 天，转盘已经亮起'
      : streak < 30
        ? `连续学习 ${streak} 天，再坚持 ${30 - streak} 天就能转一次`
        : state.daysLeft > 0
          ? `连续学习 ${streak} 天，距下次满月还有 ${state.daysLeft} 天`
          : '转盘正在等你';
    box.innerHTML = `<div class="wheel-entry-copy"><b>满月转盘 <small>月相 ${counters.inCycle}/4 · 月轮 ${counters.cycles}</small></b><span>${detail}</span><span class="wheel-entry-moons" aria-hidden="true">${moons}</span></div>` +
      `<button class="p-btn small ${canSpin ? '' : 'ghost'}" type="button" id="pet-wheel-btn" ${canSpin ? '' : 'disabled'}>${canSpin ? '转动转盘' : streak >= 30 ? '本月已领取' : '未满 30 天'}</button>`;
  }

  function feedPet() {
    const p = profile();
    const pet = ensurePet(p);
    if (pet.snacks <= 0) {
      S.toast('还没有小鱼干。完成一次单词打卡就能获得。', 'error');
      return;
    }
    pet.snacks -= 1;
    pet.fed += 1;
    pet.lastFed = S.todayIso();
    addPetXp(8);
    save();
    renderPet();
    const scene = $('#pet-scene');
    if (scene) {
      scene.classList.add('is-happy');
      setTimeout(() => scene.classList.remove('is-happy'), 900);
    }
    S.toast('当前精灵吃得很开心，成长 +8。', 'ok');
  }

  /* ------------------------------- 60 天语法小营 ------------------------------- */

  function grammarTasks() {
    return (data.tasks || [])
      .filter((task) => task.mode === 'grammar' && Number(task.grammarDay) > 0)
      .slice()
      .sort((a, b) => Number(a.grammarDay) - Number(b.grammarDay));
  }

  function grammarDoneSet() {
    const set = new Set();
    grammarTasks().forEach((task) => {
      if (task.status === 'done') set.add(Number(task.grammarDay));
    });
    return set;
  }

  function nextGrammarTask() {
    const list = grammarTasks();
    if (!list.length) return null;
    return list.find((task) => task.status !== 'done') || null;
  }

  const grammarExtraState = { open: false, filter: 'all', topics: new Set(), drills: new Map() };

  function grammarExtraHTML() {
    const extra = window.ShunshiGrammarExtra;
    const topics = extra && Array.isArray(extra.topics) ? extra.topics : [];
    if (!topics.length) return '';
    const countOf = (level) => topics.filter((topic) => topic.level === level).length;
    const filters = [
      ['all', `全部 ${topics.length}`],
      ['基础', `基础 ${countOf('基础')}`],
      ['进阶', `进阶 ${countOf('进阶')}`],
      ['冲刺', `冲刺 ${countOf('冲刺')}`]
    ];
    const filterHTML = filters.map(([value, label]) =>
      `<button type="button" class="${grammarExtraState.filter === value ? 'is-on' : ''}" data-grammar-filter="${value}">${label}</button>`
    ).join('');
    const cards = topics.map((topic) => {
      const levelClass = topic.level === '基础' ? 'is-basic' : topic.level === '冲刺' ? 'is-sprint' : 'is-mid';
      const open = grammarExtraState.topics.has(topic.id);
      const hidden = grammarExtraState.filter !== 'all' && grammarExtraState.filter !== topic.level;
      const points = (topic.points || []).map((point, index) =>
        `<section class="grammar-point">` +
          `<h4><span>${index + 1}</span>${S.escapeHtml(point.h)}</h4>` +
          `<p>${S.escapeHtml(point.body)}</p>` +
          `<div class="grammar-egs">${(point.eg || []).map((pair) =>
            `<p class="grammar-eg"><span class="grammar-eg-en">${S.escapeHtml(pair[0])}</span><span class="grammar-eg-zh">${S.escapeHtml(pair[1])}</span></p>`
          ).join('')}</div>` +
        `</section>`
      ).join('');
      const drills = (topic.drills || []).map((drill, index) => {
        const key = `${topic.id}:${index}`;
        const answered = grammarExtraState.drills.get(key);
        const answer = Number(drill.answer) || 0;
        const options = (drill.options || []).map((option, optionIndex) => {
          const right = answered && optionIndex === answer;
          const wrong = answered && optionIndex === answered.choice && answered.choice !== answer;
          return `<button type="button" class="${right ? 'is-correct' : wrong ? 'is-wrong' : ''}" data-grammar-choose="${optionIndex}">` +
            `<i>${String.fromCharCode(65 + optionIndex)}</i><span>${S.escapeHtml(option)}</span></button>`;
        }).join('');
        return `<details class="grammar-drill" data-drill-key="${S.escapeHtml(key)}" data-answer="${answer}"${answered ? ' data-answered="1"' : ''}>` +
          `<summary><b>自测 ${index + 1}</b><span>${answered ? (answered.correct ? '已答对' : '已作答') : '点开做题'}</span><i aria-hidden="true">▾</i></summary>` +
          `<p class="grammar-q">${S.escapeHtml(drill.q)}</p>` +
          `<div class="grammar-options">${options}</div>` +
          `<div class="grammar-answer"${answered ? '' : ' hidden'}>` +
            `<p><b>答案：${String.fromCharCode(65 + answer)}</b>${S.escapeHtml(drill.explain)}</p>` +
            `<button type="button" class="grammar-retry" data-grammar-retry>再练一次</button>` +
          `</div>` +
        `</details>`;
      }).join('');
      return `<details class="grammar-topic" data-level="${S.escapeHtml(topic.level)}" data-topic="${S.escapeHtml(topic.id)}"${open ? ' open' : ''}${hidden ? ' hidden' : ''}>` +
        `<summary class="grammar-topic-head">` +
          `<span class="grammar-topic-level ${levelClass}">${S.escapeHtml(topic.level)}</span>` +
          `<span class="grammar-topic-title"><b>${S.escapeHtml(topic.title)}</b><small>${S.escapeHtml(topic.tag)} · 约 ${Number(topic.minutes) || 5} 分钟 · ${(topic.drills || []).length} 道自测</small></span>` +
          `<i class="grammar-topic-arrow" aria-hidden="true">▾</i>` +
        `</summary>` +
        `<div class="grammar-topic-body">` +
          `<p class="grammar-topic-intro">${S.escapeHtml(topic.intro)}</p>` +
          `<div class="grammar-points">${points}</div>` +
          `<p class="grammar-pitfall"><b>易错提醒</b><span>${S.escapeHtml(topic.pitfall)}</span></p>` +
          `<div class="grammar-drills">${drills}</div>` +
        `</div>` +
      `</details>`;
    }).join('');
    return `<details class="grammar-extra"${grammarExtraState.open ? ' open' : ''}>` +
      `<summary class="grammar-extra-head">` +
        `<span class="grammar-extra-icon" aria-hidden="true">📚</span>` +
        `<span class="grammar-extra-title"><b>语法专题库</b><small>${topics.length} 个高频考点 · 点开专题看规则，再做 2 道自测</small></span>` +
        `<i class="grammar-extra-arrow" aria-hidden="true">▾</i>` +
      `</summary>` +
      `<div class="grammar-extra-body">` +
        `<p class="grammar-extra-note">这些是 60 天主线之外的加练，不影响每日打卡。建议每周挑 1 个专题，看懂规则、做完自测，再回主线。</p>` +
        `<div class="grammar-extra-filters" role="group" aria-label="按难度筛选专题">${filterHTML}</div>` +
        `<div class="grammar-extra-list">${cards}</div>` +
      `</div>` +
    `</details>`;
  }

  function renderGrammarCamp() {
    const camp = $('#grammar-camp');
    if (!camp) return;
    const G = window.ShunshiGrammar;
    const tasks = grammarTasks();
    if (!tasks.length) {
      camp.hidden = true;
      camp.innerHTML = '';
      return;
    }
    camp.hidden = false;
    const total = G ? G.total : 60;
    const done = grammarDoneSet();
    const next = nextGrammarTask();
    const lesson = (next && next.lesson) || null;
    const pct = Math.round((done.size / total) * 100);
    const lessonTitle = lesson ? lesson.title : '60 天已经学完';
    const lessonSub = lesson ? `第 ${lesson.day} 天 · ${lesson.unit}${lesson.subtitle ? ' · ' + lesson.subtitle : ''}` : '可以把喜欢的句子再读一遍，或等老师发新的练习。';
    const dots = [];
    for (let day = 1; day <= total; day += 1) {
      const info = G ? G.lessonByDay(day) : null;
      const state = done.has(day)
        ? 'done'
        : next && Number(next.grammarDay) === day
          ? 'next'
          : tasks.some((task) => Number(task.grammarDay) === day)
            ? 'assigned'
            : 'future';
      dots.push(`<span class="grammar-dot ${state}" title="D${day}${info ? ' · ' + S.escapeHtml(info.title) : ''}"></span>`);
    }
    const locked = next ? taskLocked(next) : false;
    const action = !next
      ? `<span class="grammar-camp-done">🏅 60 天全部完成</span>`
      : locked
        ? `<button class="p-btn small" type="button" data-grammar-open="${S.escapeHtml(next.id)}" data-grammar-locked="1">提前解锁今天</button>`
        : `<button class="p-btn small" type="button" data-grammar-open="${S.escapeHtml(next.id)}">开始今天的语法课</button>`;
    camp.innerHTML = `<div class="grammar-camp-inner" style="--unit:${lesson ? lesson.unitColor : '#d96e51'}">` +
      `<div class="grammar-camp-copy">` +
        `<p class="grammar-camp-kicker">60 天语法小营 · GRAMMAR CAMP</p>` +
        `<h2>${S.escapeHtml(lessonTitle)}</h2>` +
        `<p class="grammar-camp-sub">${S.escapeHtml(lessonSub)}</p>` +
        `<p class="grammar-camp-note">每天约 5 分钟：一句故事、一条规则、3 道小题、1 道复习、1 句仿写。</p>` +
        `<div class="grammar-camp-bar"><i style="width:${pct}%"></i></div>` +
        `<p class="grammar-camp-count">已学 <b>${done.size}</b> / ${total} 天 · 连起来就是一套句子骨架</p>` +
      `</div>` +
      `<div class="grammar-camp-side">` +
        action +
        `<button class="p-btn small ghost" type="button" data-grammar-scroll="1">看全部任务</button>` +
      `</div>` +
      `<div class="grammar-camp-map" aria-label="60 天进度">${dots.join('')}</div>` +
      grammarExtraHTML() +
    `</div>`;
  }

  /* ------------------------------- 首页渲染 ------------------------------- */

  function renderAll() {
    if (!data) return;
    renderHeader();
    renderTrial();
    renderLevel();
    renderCheckin();
    renderPet();
    renderGrammarCamp();
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

  function renderTrial() {
    const banner = $('#trial-banner');
    if (!banner) return;
    const state = trialState();
    banner.hidden = !state.trial;
    document.body.classList.toggle('trial-expired', state.expired);
    if (!state.trial) return;
    const title = $('#trial-banner-title');
    const text = $('#trial-banner-text');
    const button = $('#trial-apply-btn');
    if (title) title.textContent = state.expired ? '体验卡已到期' : `体验卡 · 还剩 ${state.daysLeft} 天`;
    if (text) {
      text.textContent = state.expired
        ? `学习记录都还在。到期日 ${state.expiresAt}，点右侧申请延长，老师发回延长码后立刻恢复。`
        : `到期日 ${state.expiresAt}。到期后记录不丢，可以申请延长。`;
    }
    if (button) button.textContent = state.expired ? '申请延长' : '体验卡详情';
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
    const locked = trialLocked();
    btn.disabled = checked || locked;
    btn.innerHTML = locked
      ? '体验卡到期 · 申请延长 <span>🎟️</span>'
      : checked
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

  function planSiblings(task) {
    if (!task.planId) return [];
    return data.tasks.filter((item) => item.planId === task.planId).sort((a, b) => Number(a.planDay) - Number(b.planDay));
  }

  function taskLocked(task) {
    if (!task.planId || task.status === 'done' || task.extraUnlocked) return false;
    const day = Number(task.planDay) || 1;
    if (day <= 1) return false;
    const previous = planSiblings(task).filter((item) => Number(item.planDay) < day);
    if (!previous.length) return false;
    /* 同一天可能有单词和语法两栏，前一天的所有任务都完成才解锁下一天。 */
    return previous.some((item) => item.status !== 'done');
  }

  function unlockPlanDay(task) {
    if (!task.planId) return;
    const locked = planSiblings(task).filter((item) => item.status !== 'done' && taskLocked(item));
    const target = locked[0];
    if (!target) { S.toast('这一天已经解锁了。'); return; }
    target.extraUnlocked = true;
    save();
    renderAll();
    S.toast(`已解锁第 ${target.planDay} 天。完成后再回来接着学。`, 'ok', 4000);
  }

  function planChips(task) {
    if (!task.planId) return '';
    const siblings = planSiblings(task);
    const byDay = new Map();
    siblings.forEach((item) => {
      const day = Number(item.planDay) || 1;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(item);
    });
    return `<div class="plan-mini">${Array.from(byDay.entries()).map(([day, items]) => {
      const current = items.some((item) => item.id === task.id);
      const done = items.every((item) => item.status === 'done');
      const locked = !done && items.some((item) => taskLocked(item));
      const titles = items.map((item) => item.title || '').filter(Boolean).join(' / ');
      return `<span class="plan-mini-day ${done ? 'done' : locked ? 'locked' : 'open'}${current ? ' current' : ''}" title="${S.escapeHtml(titles)}">D${day}${items.length > 1 ? ` ·${items.length}` : ''}</span>`;
    }).join('')}</div>`;
  }

  function bookPlanSummary(task) {
    if (!task || !task.planId) return '';
    const siblings = planSiblings(task);
    if (!siblings.some((item) => item.assignmentId)) return '';
    const done = siblings.filter((item) => item.status === 'done').length;
    const total = siblings.length;
    const percent = total ? Math.round((done / total) * 100) : 0;
    const scores = siblings.filter((item) => item.status === 'done' && Number.isFinite(Number(item.score))).map((item) => Number(item.score));
    const avg = scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null;
    let stars = 1;
    if (percent >= 95 && (avg == null || avg >= 90)) stars = 5;
    else if (percent >= 85 && (avg == null || avg >= 80)) stars = 4;
    else if (percent >= 65) stars = 3;
    else if (percent >= 35) stars = 2;
    return `<div class="book-plan-summary">` +
      `<span class="book-plan-stars">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</span>` +
      `<span>本周任务完成 <b>${done} / ${total}</b></span>` +
      `<span>完成度 <b>${percent}%</b></span>` +
      (avg == null ? '' : `<span>平均正确率 <b>${avg}%</b></span>`) +
    `</div>`;
  }

  function renderTasks() {
    renderReportStatus();
    ensureReviewStation();
    const memoryStrip = wordMemorySummaryHtml();
    if (!data.tasks.length) {
      $('#task-list').innerHTML = memoryStrip + `<div class="empty-state"><strong>还没有任务</strong>把老师发来的任务码粘贴进来，就能开始第一次试炼。</div>`;
      return;
    }
    const tasks = data.tasks.slice().sort((a, b) => {
      if (a.planId && a.planId === b.planId) {
        const dayDiff = Number(a.planDay) - Number(b.planDay);
        if (dayDiff) return dayDiff;
        if (a.mode === 'words' && b.mode !== 'words') return -1;
        if (b.mode === 'words' && a.mode !== 'words') return 1;
      }
      if (a.mode === 'words' && b.mode !== 'words' && !a.planId && !b.planId) return -1;
      if (b.mode === 'words' && a.mode !== 'words' && !a.planId && !b.planId) return 1;
      if (a.status === b.status) {
        return String(b.submittedAt || b.createdAt || '').localeCompare(String(a.submittedAt || a.createdAt || ''));
      }
      return a.status === 'done' ? 1 : -1;
    });
    const today = S.todayIso();
    const firstLocked = tasks.find((task) => taskLocked(task));
    const bookSeen = new Set();
    const bookSummaries = tasks.filter((task) => {
      if (!task.assignmentId || !task.planId || bookSeen.has(task.planId)) return false;
      bookSeen.add(task.planId);
      return true;
    }).map(bookPlanSummary).join('');
    $('#task-list').innerHTML = memoryStrip + bookSummaries + tasks.map((task) => {
      const done = task.status === 'done';
      const locked = taskLocked(task);
      const overdue = !done && !locked && task.due && task.due < today;
      const status = done ? 'done' : locked ? 'locked' : overdue ? 'overdue' : 'new';
      const statusText = done ? '已完成' : locked ? `未解锁` : overdue ? '已过期' : '待完成';
      const scoreText = done && task.score != null ? `得分 <b>${task.score}</b>` : `经验 <b>+${task.xp || 100}</b>`;
      return `<article class="task-card ${done ? 'done' : ''} ${locked ? 'locked' : ''}" data-task-id="${S.escapeHtml(task.id)}" tabindex="0" role="button">` +
        `<div>` +
          `<h3 class="task-title">${S.escapeHtml(task.title || '未命名任务')}</h3>` +
          `<div class="task-meta">` +
            (task.planId ? `<span class="plan-tag">周计划 · D${task.planDay}/${task.planTotal || 7}</span>` : '') +
            `<span>${S.escapeHtml(task.grade || (profile() && profile().grade) || '未标注')}</span>` +
            `<span>${task.reviewSession ? `<span class="memory-tag">记忆复习</span> · ${taskQuestionCount(task)} 词` : task.mode === 'words' ? `单词闯关 · ${taskQuestionCount(task)} 词` : task.mode === 'grammar' ? (Number(task.grammarDay) > 0 ? `语法小营 · D${task.grammarDay} · 5 关` : '语法专题 · 打卡') : `${taskQuestionCount(task)} 题`}</span>` +
            `<span>${scoreText}</span>` +
            (task.due ? `<span>截止 ${S.escapeHtml(S.fmtDate(task.due))}</span>` : '') +
          `</div>` +
          planChips(task) +
        `</div>` +
        `<div class="task-card-side">` +
          `<span class="status-chip ${status}">${statusText}</span>` +
          (locked && firstLocked && task.id === firstLocked.id ? `<button class="p-btn small ghost task-unlock" type="button" data-unlock-task="${S.escapeHtml(task.id)}">多学一天</button>` : '') +
        `</div>` +
      `</article>`;
    }).join('');
    $$('#task-list .task-card').forEach((card) => {
      const open = () => openTask(card.dataset.taskId);
      card.addEventListener('click', (event) => {
        if (event.target.closest('[data-unlock-task]')) {
          event.stopPropagation();
          const task = findTask(event.target.closest('[data-unlock-task]').dataset.unlockTask);
          if (task) unlockPlanDay(task);
          return;
        }
        if (taskLocked(findTask(card.dataset.taskId) || {})) {
          S.toast('先完成前一天的任务，或点“多学一天”提前解锁。', 'error', 4500);
          return;
        }
        open();
      });
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
    { id: 'wordsmith', icon: '📚', name: '词海行者', earned: (p, tasks) => tasks.filter((t) => t.status === 'done' && t.mode === 'words').length >= 3 },
    { id: 'grammar1', icon: '🕵️', name: '语法小侦探', earned: (p, tasks) => countGrammarDays(tasks) >= 1 },
    { id: 'grammar7', icon: '🧩', name: '七日成句', earned: (p, tasks) => countGrammarDays(tasks) >= 7 },
    { id: 'grammar30', icon: '🏛️', name: '骨架大师', earned: (p, tasks) => countGrammarDays(tasks) >= 30 },
    { id: 'level5', icon: '👑', name: '五星学者', earned: (p) => S.levelInfo(p.xp).level >= 5 }
  ];

  function countDoneBlocks(tasks, types) {
    return tasks.filter((task) => task.status === 'done').reduce((sum, task) => (
      sum + (task.blockStats || []).filter((block) => types.includes(block.type)).length
    ), 0);
  }

  function countGrammarDays(tasks) {
    const days = new Set();
    (tasks || []).forEach((task) => {
      if (task.status === 'done' && task.mode === 'grammar') days.add(Number(task.grammarDay));
    });
    return days.size;
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
    if (!requireTrial('体验卡已到期，打卡先暂停。申请延长后，连击天数会接着算。')) return;
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
    const gain = Math.max(0, Number(amount) || 0);
    const before = S.levelInfo(p.xp);
    p.xp = Math.max(0, Number(p.xp) + gain);
    if (gain > 0) {
      const pool = petPoolOf(p);
      const poolGain = Math.max(1, Math.round(gain * 0.6));
      pool.earned += poolGain;
      pool.log.unshift({ at: S.nowIso(), type: 'earn', amount: poolGain, note: `学习获得 ${gain} EXP` });
      pool.log = pool.log.slice(0, 30);
    }
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

  /* ------------------------------- 答题行为与乱选检测 ------------------------------- */

  function ensureBehavior(task) {
    if (!task.behavior || typeof task.behavior !== 'object') {
      task.behavior = {
        firstOpenedAt: Date.now(),
        activeSeconds: 0,
        sessionStart: 0,
        changes: {},
        values: {},
        focusLost: 0,
        wordTimes: []
      };
    }
    const b = task.behavior;
    b.changes = b.changes && typeof b.changes === 'object' ? b.changes : {};
    b.values = b.values && typeof b.values === 'object' ? b.values : {};
    b.wordTimes = Array.isArray(b.wordTimes) ? b.wordTimes : [];
    b.focusLost = Math.max(0, Number(b.focusLost) || 0);
    b.activeSeconds = Math.max(0, Number(b.activeSeconds) || 0);
    return b;
  }

  function startBehaviorSession(task) {
    if (!task || task.status === 'done') return;
    const b = ensureBehavior(task);
    if (!b.sessionStart) b.sessionStart = Date.now();
  }

  function pauseBehaviorSession(task) {
    if (!task) return;
    const b = ensureBehavior(task);
    if (b.sessionStart) {
      b.activeSeconds += Math.max(0, (Date.now() - b.sessionStart) / 1000);
      b.sessionStart = 0;
    }
  }

  function behaviorElapsed(task) {
    const b = ensureBehavior(task);
    return b.activeSeconds + (b.sessionStart ? Math.max(0, (Date.now() - b.sessionStart) / 1000) : 0);
  }

  function noteBehaviorAnswer(task, qid, value) {
    if (!task || task.status === 'done') return;
    const b = ensureBehavior(task);
    if (Object.prototype.hasOwnProperty.call(b.values, qid) && b.values[qid] !== value) {
      b.changes[qid] = (Number(b.changes[qid]) || 0) + 1;
    }
    b.values[qid] = String(value == null ? '' : value);
  }

  function longestSameRun(list) {
    let best = 0;
    let run = 1;
    for (let index = 1; index < list.length; index += 1) {
      if (list[index] === list[index - 1]) run += 1;
      else run = 1;
      if (run > best) best = run;
    }
    return list.length ? Math.max(1, best) : 0;
  }

  function cyclicPeriod(list) {
    const values = Array.isArray(list) ? list : [];
    if (values.length < 8) return 0;
    for (let period = 2; period <= 4; period += 1) {
      if (values.length < period * 3 + 1) continue;
      let hit = 0;
      let total = 0;
      for (let index = period; index < values.length; index += 1) {
        total += 1;
        if (values[index] === values[index - period]) hit += 1;
      }
      if (total && hit / total >= 0.92) return period;
    }
    return 0;
  }

  function meanOf(list) {
    return list.length ? list.reduce((sum, n) => sum + n, 0) / list.length : 0;
  }

  function coefficientOfVariation(list) {
    if (list.length < 3) return 1;
    const mean = meanOf(list);
    if (!mean) return 1;
    const variance = meanOf(list.map((n) => (n - mean) * (n - mean)));
    return Math.sqrt(variance) / mean;
  }

  function prestudyIntegrityFlag(task, recommended) {
    const p = task.prestudy;
    if (!p || !p.completedAt) return '';
    const seconds = Number(p.seconds) || 0;
    const target = Number(recommended || p.recommendedSeconds) || 0;
    if (target && seconds < Math.max(5, target * 0.2)) return `课前浏览只有 ${seconds} 秒，明显不足`;
    return '';
  }

  function computeIntegrity(task) {
    const b = ensureBehavior(task);
    const total = Math.max(1, taskQuestionCount(task));
    const elapsed = Math.max(1, behaviorElapsed(task));
    const per = elapsed / total;
    const flags = [];
    let score = 100;
    if (task.mode === 'words') {
      const run = task.wordRun || {};
      const resultKeys = Object.keys(run.results || {}).sort((a, b) => Number(a) - Number(b));
      const ordered = resultKeys.map((key) => run.results[key]).filter(Boolean);
      const times = (ordered.length ? ordered.map((item) => Number(item.seconds)) : b.wordTimes)
        .filter((n) => Number.isFinite(n) && n > 0);
      const avgWord = times.length ? meanOf(times) : per;
      const firstOk = (task.wordStats || []).filter((word) => word.ok).length;
      const accuracy = total ? firstOk / total : 0;
      const positions = ordered.map((item) => Number(item.optionIndex)).filter((n) => Number.isFinite(n));
      const samePositionRun = longestSameRun(positions);
      const positionMode = positions.length ? Math.max(...Object.values(positions.reduce((acc, value) => {
        acc[value] = (acc[value] || 0) + 1;
        return acc;
      }, {}))) : 0;
      const samePositionRatio = positions.length ? positionMode / positions.length : 0;
      const cycle = cyclicPeriod(positions);
      const cv = coefficientOfVariation(times);
      if (avgWord < 1.2) { score -= 32; flags.push('单词点击速度异常快'); }
      else if (avgWord < 2.2) { score -= 14; flags.push('单词作答偏快'); }
      if (accuracy <= 0.4 && avgWord < 2.5) { score -= 18; flags.push('速度偏快且正确率接近随机'); }
      if (positions.length >= 8 && samePositionRun >= Math.max(6, Math.ceil(positions.length * 0.7))) {
        score -= 22;
        flags.push(`连续 ${samePositionRun} 题选同一位置`);
      } else if (positions.length >= 10 && samePositionRatio >= 0.75) {
        score -= 14;
        flags.push('选项位置高度集中在同一处');
      }
      if (cycle) { score -= 18; flags.push(`选项呈规律循环（每 ${cycle} 题一轮）`); }
      if (times.length >= 10 && cv < 0.2) { score -= 10; flags.push('答题节奏过于机械'); }
      const preFlag = prestudyIntegrityFlag(task);
      if (preFlag) { score -= 12; flags.push(preFlag); }
      if (b.focusLost >= 3) { score -= 8; flags.push(`答题中离开页面 ${b.focusLost} 次`); }
      return {
        score: Math.max(0, Math.min(100, score)),
        flags,
        secondsPerItem: Math.round((avgWord || per) * 10) / 10,
        changedRatio: 0,
        focusLost: b.focusLost,
        sameOptionRatio: Math.round(samePositionRatio * 100) / 100,
        longestSameOption: samePositionRun,
        pattern: cycle ? `每${cycle}题循环` : '',
        consistency: Math.round(cv * 100) / 100,
        elapsed: Math.round(elapsed)
      };
    }
    const values = Object.values(b.values).map((value) => String(value || '').trim()).filter(Boolean);
    const letters = values.filter((value) => /^[A-Ga-g]$/.test(value)).map((value) => value.toUpperCase());
    const sameCount = letters.length ? Math.max(...Object.values(letters.reduce((acc, letter) => {
      acc[letter] = (acc[letter] || 0) + 1;
      return acc;
    }, {}))) : 0;
    const sameRatio = letters.length ? sameCount / letters.length : 0;
    const longestLetter = longestSameRun(letters);
    const letterCycle = cyclicPeriod(letters);
    const changed = Object.values(b.changes).reduce((sum, n) => sum + Number(n || 0), 0);
    const changedRatio = total ? changed / total : 0;
    if (per < 3) { score -= 34; flags.push('整体答题速度异常快'); }
    else if (per < 6) { score -= 15; flags.push('答题速度偏快'); }
    if (changedRatio > 0.8) { score -= 12; flags.push('大量题目反复改答案'); }
    if (letters.length >= 5 && sameRatio >= 0.85) { score -= 24; flags.push('绝大多数题选同一个选项'); }
    if (longestLetter >= 6) { score -= 16; flags.push(`连续 ${longestLetter} 题选同一选项`); }
    if (letterCycle) { score -= 16; flags.push(`选项呈规律循环（每 ${letterCycle} 题一轮）`); }
    if (task.score != null && task.score <= 30 && total >= 8) { score -= 12; flags.push('正确率接近随机猜测'); }
    const preFlag = prestudyIntegrityFlag(task);
    if (preFlag) { score -= 10; flags.push(preFlag); }
    if (b.focusLost >= 3) { score -= 10; flags.push(`答题中离开页面 ${b.focusLost} 次`); }
    return {
      score: Math.max(0, Math.min(100, score)),
      flags,
      secondsPerItem: Math.round(per * 10) / 10,
      changedRatio: Math.round(changedRatio * 100) / 100,
      focusLost: b.focusLost,
      sameOptionRatio: Math.round(sameRatio * 100) / 100,
      longestSameOption: longestLetter,
      pattern: letterCycle ? `每${letterCycle}题循环` : '',
      elapsed: Math.round(elapsed)
    };
  }

  /* ------------------------------- 任务答题 ------------------------------- */

  function openTask(id) {
    const task = findTask(id);
    if (!task) return;
    if (task.status !== 'done' && !requireTrial()) return;
    activeTaskId = id;
    lastAutoSpeakKey = '';
    taskStartedAt = Date.now();
    /* 浏览阶段不算答题时间：学生点“开始打卡”后才开始计答题用时。 */
    if (!prestudyPlanFor(task)) startBehaviorSession(task);
    S.openDialog($('#task-dialog'));
    renderRunner(task);
    if (task.status !== 'done' && !prestudyPlanFor(task)) startTimer();
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

  /* 阅读联动 · 长难句拆解：先让学生自己拆，再展开看“主干 / 一级 / 二级 / 三级”。 */
  function renderBreakdown(block) {
    const data = block.breakdown || {};
    const sentence = String(data.sentence || block.passage || '').trim();
    const chunks = Array.isArray(data.chunks) ? data.chunks.filter((chunk) => chunk && chunk.text) : [];
    const G = window.ShunshiGrammar;
    const levels = [
      { level: 0, label: '主干' },
      { level: 1, label: '一级修饰' },
      { level: 2, label: '从句 · 二级' },
      { level: 3, label: '从句里的从句 · 三级' }
    ];
    const levelHtml = levels.map((item) => {
      const list = chunks.filter((chunk) => clampLevel(chunk.level) === item.level);
      if (!list.length) return '';
      return `<div class="breakdown-level"><b>${item.label}</b><div class="breakdown-chips">` +
        list.map((chunk) => {
          const role = String(chunk.role || '成分');
          const cls = G && G.roleClass ? G.roleClass(role) : 'other';
          return `<span class="breakdown-chip role-${S.escapeHtml(cls)}"><b>${S.escapeHtml(chunk.text)}</b><small>${S.escapeHtml(role)}</small></span>`;
        }).join('') +
      `</div></div>`;
    }).join('');
    return `<div class="breakdown-card">` +
      (sentence ? `<p class="breakdown-sentence">${S.escapeHtml(sentence)}</p>` : '') +
      `<details class="breakdown-reveal"><summary>先自己拆，再点开看拆法</summary>` +
        (levelHtml ? `<div class="breakdown-levels">${levelHtml}</div>` : '') +
        (data.translation ? `<p class="breakdown-translation">参考译文：${S.escapeHtml(data.translation)}</p>` : '') +
      `</details>` +
    `</div>`;
  }

  function clampLevel(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.min(3, Math.round(number)));
  }

  function renderGrammarHero(task) {
    const lesson = task.lesson;
    if (!lesson) return '';
    const G = window.ShunshiGrammar;
    const hasTokens = Array.isArray(lesson.tokens) && lesson.tokens.length;
    const tokens = (lesson.tokens || []).map((pair) => {
      const text = pair[0];
      const role = pair[1];
      const cls = G ? G.roleClass(role) : 'other';
      return `<span class="g-token role-${cls}"><b>${S.escapeHtml(text)}</b><small>${S.escapeHtml(role)}</small></span>`;
    }).join('');
    const dayNumber = Number(lesson.day) || Number(task.grammarDay) || 0;
    const dayText = dayNumber > 0
      ? `D${dayNumber} / ${G ? G.total : 60} · 约 ${lesson.minutes || 5} 分钟`
      : `约 ${lesson.minutes || 8} 分钟`;
    return `<div class="grammar-hero" style="--unit:${lesson.unitColor || '#d96e51'}">` +
      `<div class="grammar-hero-top">` +
        `<span class="grammar-unit-pill">${S.escapeHtml(lesson.unit || '语法小营')}</span>` +
        `<span>${S.escapeHtml(dayText)}</span>` +
      `</div>` +
      `<p class="grammar-scene">${S.escapeHtml(lesson.scene || '')}</p>` +
      `<div class="g-sentence" data-grammar-tokens>${hasTokens ? tokens : S.escapeHtml(lesson.sentence || '')}</div>` +
      (hasTokens
        ? `<div class="grammar-hero-tools">` +
            `<button class="p-btn small ghost" type="button" data-grammar-reveal>遮住标签，自己先猜</button>` +
            `<span>先看句子，再对照每块的成分。</span>` +
          `</div>`
        : '') +
      `<p class="grammar-translation">${S.escapeHtml(lesson.translation || '')}</p>` +
      `<div class="g-rule"><b>今日规则</b><p>${S.escapeHtml(lesson.rule || '').replace(/\n/g, '<br>')}</p>` +
        (lesson.tip ? `<small>${S.escapeHtml(lesson.tip)}</small>` : '') +
      `</div>` +
    `</div>`;
  }

  function grammarSteps(task) {
    const steps = [];
    (task.blocks || []).forEach((block) => {
      if (block.type === 'writing' || block.prompt) {
        steps.push({ type: 'writing', block });
      } else {
        (block.questions || []).forEach((question) => {
          steps.push({ type: 'question', block, question });
        });
      }
    });
    return steps;
  }

  function grammarStepQuestion(step) {
    const question = step.question || {};
    return {
      qid: question.id || `${step.block.id}-q${question.n}`,
      answer: question.answer || '',
      question
    };
  }

  function renderGrammarResult(task) {
    let html = resultHero(task);
    const review = Array.isArray(task.review) ? task.review : [];
    if (review.length) {
      html += `<div class="grammar-result-list">` + review.map((item) => (
        `<div class="grammar-result-row ${item.ok ? 'ok' : 'no'}">` +
          `<b>${item.ok ? '✓' : '✕'} ${S.escapeHtml(item.n || '')}</b>` +
          `<span>${S.escapeHtml(item.stem || '')}</span>` +
          `<small>你选 ${S.escapeHtml(item.userAnswer || '未作答')} · 正确 ${S.escapeHtml(item.correctAnswer || '—')}</small>` +
        `</div>`
      )).join('') + `</div>`;
    }
    if (String(task.writing || '').trim()) {
      html += `<div class="grammar-result-writing"><b>你的仿写</b><p>${S.escapeHtml(task.writing)}</p></div>`;
    }
    html += `<div class="grammar-result-actions"><button class="p-btn small" type="button" data-grammar-open-report>生成汇报码交给老师</button></div>`;
    return html;
  }

  function renderGrammarRunner(task) {
    const done = task.status === 'done';
    $('#runner-title').textContent = task.title || '语法小营';
    const steps = grammarSteps(task);
    if (done) {
      $('#runner-sub').textContent = `${task.title || '语法小营'} · 已完成`;
      $('#runner-count').textContent = '已完成';
      $('#runner-fill').style.width = '100%';
      $('#submit-task').hidden = true;
      $('#runner-report').hidden = false;
      $('#runner-body').innerHTML = renderGrammarResult(task);
      const reportButton = $('[data-grammar-open-report]');
      if (reportButton) reportButton.onclick = openReport;
      return;
    }
    const index = Math.max(0, Math.min(steps.length - 1, Number(task.runnerStep) || 0));
    task.runnerStep = index;
    const step = steps[index];
    if (!step) {
      $('#runner-body').innerHTML = '<p class="empty-state">今天的语法关卡还没有准备好。</p>';
      return;
    }
    const currentStep = index + 1;
    $('#runner-sub').textContent = `${task.title || '语法小营'} · 第 ${currentStep} / ${steps.length} 关`;
    $('#runner-count').textContent = `${currentStep} / ${steps.length}`;
    $('#runner-fill').style.width = `${Math.round((index / steps.length) * 100)}%`;
    $('#runner-report').hidden = true;
    $('#submit-task').hidden = step.type !== 'writing';
    $('#submit-task').textContent = '提交今日语法';

    let html = `<div class="grammar-run">` + renderGrammarHero(task);

    if (step.type === 'question') {
      const { qid, question } = grammarStepQuestion(step);
      const userAnswer = String((task.answers || {})[qid] || '');
      const answered = Boolean(userAnswer);
      const correct = answered ? S.isCorrectAnswer(question, userAnswer) : null;
      const label = step.block.label || '语法关';
      html += `<article class="grammar-step-card ${answered ? correct ? 'is-ok' : 'is-no' : ''}" data-g-qid="${S.escapeHtml(qid)}">` +
        `<div class="grammar-step-kicker">${S.escapeHtml(label)}</div>` +
        `<p class="grammar-step-stem">${S.escapeHtml(question.stem || '')}</p>` +
        `<div class="grammar-step-options">` +
          (question.options || []).map((option) => {
            const letter = String(option.letter || '').toUpperCase();
            const isPicked = userAnswer.toUpperCase() === letter;
            const isRight = answered && String(question.answer || '').toUpperCase() === letter;
            const cls = answered ? (isRight ? 'is-right' : isPicked ? 'is-picked-wrong' : 'is-dim') : '';
            return `<button class="grammar-step-option ${cls}" type="button" data-g-option="${S.escapeHtml(letter)}" ${answered ? 'disabled' : ''}>` +
              `<span>${S.escapeHtml(letter)}</span>${S.escapeHtml(option.text || '')}</button>`;
          }).join('') +
        `</div>`;
      if (answered) {
        html += `<div class="grammar-step-feedback ${correct ? 'ok' : 'no'}">` +
          `<b>${correct ? '✓ 答对了' : '✕ 再看一眼'}</b>` +
          `<span>正确答案：${S.escapeHtml(question.answer || '—')}${question.explanation ? ` · ${S.escapeHtml(question.explanation)}` : ''}</span>` +
        `</div>` +
        `<div class="grammar-step-actions"><button class="p-btn" type="button" data-g-next="${index + 1}">${index + 1 >= steps.length ? '完成' : '下一关'}</button></div>`;
      } else {
        html += `<p class="grammar-step-hint">选一个答案，马上就能看到原因。</p>`;
      }
      html += `</article>`;
    } else {
      const block = step.block;
      const key = `writing:${block.id}`;
      const value = String((task.answers || {})[key] || '');
      html += `<article class="grammar-step-card writing">` +
        `<div class="grammar-step-kicker">第五关 · 写一句</div>` +
        `<p class="grammar-step-stem">${S.escapeHtml(block.prompt || '用今天学的结构写一句。')}</p>` +
        `<div class="writing-toolbar"><span>自动保存在本机</span><span>写完点“提交今日语法”</span></div>` +
        `<textarea class="writing-input grammar-writing" data-g-writing="${S.escapeHtml(block.id)}" placeholder="写一句自己的话…">${S.escapeHtml(value)}</textarea>` +
        (block.sample ? `<details class="writing-sample"><summary>写完再看参考写法</summary><p>${S.escapeHtml(block.sample)}</p></details>` : '') +
        `<p class="grammar-step-hint">不要求一模一样，能用自己的话写对结构就好。</p>` +
      `</article>`;
    }
    html += `</div>`;
    const body = $('#runner-body');
    body.innerHTML = html;
    body.scrollTop = 0;
    body.onclick = (event) => {
      const option = event.target.closest('[data-g-option]');
      if (option) {
        const qid = option.closest('[data-g-qid]').dataset.gQid;
        task.answers = task.answers || {};
        task.answers[qid] = option.dataset.gOption;
        noteBehaviorAnswer(task, qid, option.dataset.gOption);
        save();
        renderGrammarRunner(task);
        return;
      }
      const next = event.target.closest('[data-g-next]');
      if (next) {
        const qid = next.closest('[data-g-qid]') ? next.closest('[data-g-qid]').dataset.gQid : '';
        if (qid && !String((task.answers || {})[qid] || '').trim()) {
          S.toast('先选一个答案，再进入下一关。', 'error');
          return;
        }
        task.runnerStep = Math.min(steps.length - 1, Number(next.dataset.gNext) || 0);
        save();
        renderGrammarRunner(task);
      }
    };
    body.onkeydown = null;
    body.oninput = (event) => {
      if (!event.target.matches('[data-g-writing]')) return;
      task.answers = task.answers || {};
      task.answers[`writing:${event.target.dataset.gWriting}`] = event.target.value;
      noteBehaviorAnswer(task, `writing:${event.target.dataset.gWriting}`, event.target.value);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 300);
      $('#runner-count').textContent = `${currentStep} / ${steps.length}`;
    };
    body.onchange = null;
  }

  function renderRunner(task) {
    if (prestudyPlanFor(task)) {
      renderPrestudy(task);
      return;
    }
    stopPrestudyTimer();
    if (task.mode === 'words') {
      renderWordRunner(task);
      return;
    }
    if (task.mode === 'grammar') {
      renderGrammarRunner(task);
      return;
    }
    $('#submit-task').textContent = '提交任务';
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
    if (task.mode === 'grammar') html += renderGrammarHero(task);
    (task.blocks || []).forEach((block, index) => {
      const label = block.label || `${cnNumber(index)}、${S.blockLabel(block.type)}`;
      html += `<h3 class="block-heading">${S.escapeHtml(label)}</h3>`;
      if (block.passage) html += renderPassage(block.passage);
      if (block.type === 'breakdown' && block.breakdown) html += renderBreakdown(block);
      if (block.type === 'writing' || block.prompt) {
        const prompt = block.prompt || block.passage || '';
        html += `<div class="writing-box"><span class="writing-box-kicker">写作 / 拆句</span><p class="writing-box-text">${S.escapeHtml(prompt)}</p></div>`;
        const key = `writing:${block.id}`;
        const value = (task.answers || {})[key] || '';
        if (done) {
          html += value
            ? `<div class="writing-review"><b>你写的</b><p>${S.escapeHtml(value)}</p></div>`
            : `<p class="hint" style="margin-top:10px;">这道书面表达没有留下文字稿。</p>`;
          if (block.sample) {
            html += `<div class="g-sample"><b>参考写法</b><p>${S.escapeHtml(block.sample)}</p><small>不要求一模一样，能用自己的话写对结构就好。</small></div>`;
          }
        } else {
          html += `<div class="writing-toolbar"><span>自动保存在本机</span><span>不必一次写完</span></div>` +
            `<textarea class="writing-input" data-writing-block="${S.escapeHtml(block.id)}" placeholder="按上面的步骤，一条一条写下来…">${S.escapeHtml(value)}</textarea>`;
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
          html += `<label class="text-answer-field">` +
            `<span class="text-answer-label">简答</span>` +
            `<textarea class="text-answer" data-qid="${S.escapeHtml(qid)}" rows="2" placeholder="用一句话写清楚即可…" ${done ? 'disabled' : ''}>${S.escapeHtml(userAnswer)}</textarea>` +
          `</label>`;
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
        noteBehaviorAnswer(task, qid, target.value);
      } else if (target.matches('.text-answer')) {
        task.answers = task.answers || {};
        task.answers[target.dataset.qid] = target.value;
        noteBehaviorAnswer(task, `text:${target.dataset.qid}`, target.value);
      } else if (target.matches('[data-writing-block]')) {
        task.answers = task.answers || {};
        task.answers[`writing:${target.dataset.writingBlock}`] = target.value;
        noteBehaviorAnswer(task, `writing:${target.dataset.writingBlock}`, target.value);
      } else {
        return;
      }
      $('#runner-count').textContent = `${answeredCount(task)} / ${taskQuestionCount(task)}`;
      $('#runner-fill').style.width = `${Math.round((answeredCount(task) / taskQuestionCount(task)) * 100)}%`;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 300);
    }
  }

  /* ------------------------------- 单词闯关 ------------------------------- */

  const WORD_FALLBACK_ZH = ['环境', '机会', '影响', '经历', '建议', '决定', '发展', '提供', '减少', '提高', '保护', '表达', '支持', '避免', '承认', '安静的', '勇敢的', '复杂的'];
  const WORD_FALLBACK_EN = ['apple', 'brave', 'climate', 'gather', 'honest', 'island', 'journey', 'kindness', 'memory', 'nature', 'opinion', 'polite', 'quiet', 'reason', 'simple', 'travel', 'useful', 'village', 'wonder', 'youth'];

  function hashString(text) {
    let hash = 2166136261;
    for (let i = 0; i < String(text).length; i += 1) {
      hash ^= String(text).charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededShuffle(list, seed) {
    const array = list.slice();
    let state = seed >>> 0;
    for (let i = array.length - 1; i > 0; i -= 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const j = state % (i + 1);
      const temp = array[i];
      array[i] = array[j];
      array[j] = temp;
    }
    return array;
  }

  function ensureWordRun(task) {
    if (!task.wordRun || typeof task.wordRun !== 'object') {
      task.wordRun = {
        i: 0,
        phase: 'main',
        results: {},
        combo: 0,
        maxCombo: 0,
        reviewQueue: [],
        reviewI: 0,
        reviewResults: {},
        startedAt: Date.now()
      };
    }
    const run = task.wordRun;
    if (!run.results || typeof run.results !== 'object') run.results = {};
    if (!Array.isArray(run.reviewQueue)) run.reviewQueue = [];
    if (!run.reviewResults || typeof run.reviewResults !== 'object') run.reviewResults = {};
    if (!Number.isFinite(Number(run.i))) run.i = 0;
    if (!Number.isFinite(Number(run.combo))) run.combo = 0;
    if (!Number.isFinite(Number(run.maxCombo))) run.maxCombo = 0;
    if (!Number.isFinite(Number(run.reviewI))) run.reviewI = 0;
    if (!['main', 'review', 'done'].includes(run.phase)) run.phase = 'main';
    /* 作答后的短暂反馈锁只在内存里有效；刷新页面后必须解锁，否则选项点不动。 */
    run.locked = false;
    return run;
  }

  function wordAccuracy(task, run) {
    const words = task.words || [];
    if (!words.length) return 0;
    const correct = words.filter((word, index) => run.results[index] && run.results[index].firstOk).length;
    return correct / words.length;
  }

  function wordXp(task, run) {
    const base = Number(task.xp) || 80;
    const accuracy = wordAccuracy(task, run);
    return Math.round(base * (0.4 + 0.6 * accuracy)) + Math.min(30, Number(run.maxCombo) * 2);
  }

  function wordOptionsFor(task, word, index) {
    const answer = S.meaningLabel(word.w, word.zh, word.pos);
    const others = (task.words || [])
      .map((item) => S.meaningLabel(item.w, item.zh, item.pos))
      .filter((zh) => zh && zh !== answer);
    const pool = Array.from(new Set(others.concat(WORD_FALLBACK_ZH)))
      .filter((zh) => zh && zh !== answer);
    const distractors = seededShuffle(pool, hashString(`${word.w}|${index}|zh`)).slice(0, 3);
    return seededShuffle([answer].concat(distractors), hashString(`${word.w}|${index}|options`));
  }

  function reviewOptionsFor(task, word) {
    const others = (task.words || []).map((item) => item.w).filter((w) => w && w !== word.w);
    const pool = Array.from(new Set(others.concat(WORD_FALLBACK_EN))).filter((w) => w !== word.w);
    const distractors = seededShuffle(pool, hashString(`${word.w}|review`)).slice(0, 3);
    return seededShuffle([word.w].concat(distractors), hashString(`${word.w}|review-options`));
  }

  function contextOptionsFor(task, word, index) {
    const others = (task.words || []).map((item) => item.w).filter((w) => w && w !== word.w);
    const pool = Array.from(new Set(others.concat(WORD_FALLBACK_EN))).filter((w) => w !== word.w);
    const distractors = seededShuffle(pool, hashString(`${word.w}|${index}|context`)).slice(0, 3);
    return seededShuffle([word.w].concat(distractors), hashString(`${word.w}|${index}|context-options`));
  }

  function contextSentenceFor(word) {
    const sentence = String(word && word.ex || '').trim();
    const target = String(word && word.w || '').trim();
    if (!sentence || !target) return '';
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b${escaped}\\b`, 'i');
    if (!pattern.test(sentence)) return '';
    return sentence.replace(pattern, '______');
  }

  function wordQuestionKind(task, word, index) {
    if (!contextSentenceFor(word)) return 'meaning';
    /* 语境推词占四成左右；但按单词逐个抽签时，4 个词的小任务可能一个都抽不到。
       这里先按任务整体算出“至少 1 个、约 40%”的语境题名额，再用稳定哈希挑题，
       保证学生每次都能遇到语境题，同时顺序不会每次都变。 */
    const words = task.words || [];
    const eligible = words
      .map((item, i) => ({ item, i }))
      .filter((entry) => contextSentenceFor(entry.item));
    if (!eligible.length) return 'meaning';
    const quota = Math.max(1, Math.round(words.length * 0.4));
    const chosen = eligible
      .slice()
      .sort((a, b) => (
        hashString(`${task.id || ''}|${a.i}|${a.item.w}|context-pick`) -
        hashString(`${task.id || ''}|${b.i}|${b.item.w}|context-pick`)
      ))
      .slice(0, quota)
      .map((entry) => entry.i);
    return chosen.includes(index) ? 'context' : 'meaning';
  }

  const AUTO_SPEAK_KEY = 'shunshi.word.autospeak.v1';
  let lastAutoSpeakKey = '';

  function autoSpeakEnabled() {
    try {
      return localStorage.getItem(AUTO_SPEAK_KEY) !== 'off';
    } catch (error) {
      return true;
    }
  }

  function setAutoSpeak(on) {
    try {
      localStorage.setItem(AUTO_SPEAK_KEY, on ? 'on' : 'off');
    } catch (error) { /* ignore */ }
    S.toast(on ? '每出现一个新词，会先自动读一遍。' : '已关闭自动读音，需要时点“听读音”。', 'ok', 2600);
  }

  function autoSpeakQuestion(task, run, context, text) {
    if (!autoSpeakEnabled() || !text) return;
    const key = `${task.id}|${run.phase}|${context.isReview ? 'r' : 'm'}|${context.index}|${context.kind}`;
    if (key === lastAutoSpeakKey) return;
    lastAutoSpeakKey = key;
    const label = context.kind === 'context'
      ? $('#runner-body .word-context-sentence')
      : $('#runner-body .word-big');
    setTimeout(() => {
      if (activeTaskId !== task.id) return;
      speakWord(text, label, { quiet: true });
    }, 360);
  }

  let englishVoiceCache = null;
  let speechAudio = null;
  let speechTimer = 0;

  function loadEnglishVoices() {
    try {
      if (!('speechSynthesis' in window) || !window.speechSynthesis || typeof window.speechSynthesis.getVoices !== 'function') return englishVoiceCache || [];
      const all = window.speechSynthesis.getVoices() || [];
      if (!all.length) return englishVoiceCache || [];
    const english = all.filter((voice) => /^en([-_]|$)/i.test(voice.lang || ''));
    const score = (voice) => {
      let value = 0;
      if (/en-US/i.test(voice.lang || '')) value += 4;
      if (/en-GB/i.test(voice.lang || '')) value += 2;
      if (voice.localService) value += 3;
      if (/samantha|google us english|microsoft (aria|jenny|zira|david)|natural/i.test(voice.name || '')) value += 2;
      return value;
    };
    english.sort((a, b) => score(b) - score(a));
    englishVoiceCache = english;
    return english;
    } catch (error) {
      return englishVoiceCache || [];
    }
  }

  if ('speechSynthesis' in window) {
    loadEnglishVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadEnglishVoices);
  }

  function speechFallback(text, label, reason, quiet) {
    const clean = String(text || '').trim();
    if (!clean) return;
    if (label) label.classList.remove('speaking');
    try {
      if (speechAudio) { speechAudio.pause(); speechAudio = null; }
      speechAudio = new Audio(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(clean)}&type=2`);
      speechAudio.preload = 'auto';
      speechAudio.onplaying = () => {
        if (label) label.classList.add('speaking');
        if (!quiet) S.toast(`正在播放 ${clean} 的读音。`, 'ok', 1800);
      };
      speechAudio.onended = () => { if (label) label.classList.remove('speaking'); };
      speechAudio.onerror = () => {
        if (label) label.classList.remove('speaking');
        if (!quiet) S.toast(reason || '这台设备没有英语朗读声音，可以先看音标，或换 Chrome / Edge 再试。', 'error', 6500);
      };
      const played = speechAudio.play();
      if (played && played.catch) {
        played.catch(() => {
          if (label) label.classList.remove('speaking');
          if (!quiet) S.toast(reason || '浏览器拦住了发音，请再点一次“听读音”。', 'error', 6000);
        });
      }
    } catch (error) {
      if (label) label.classList.remove('speaking');
      if (!quiet) S.toast(reason || '这台设备暂时不能发音，可以先看音标。', 'error', 6000);
    }
  }

  function speakWord(text, label, options) {
    const clean = String(text || '').trim();
    const quiet = Boolean(options && options.quiet);
    if (!clean) return;
    if (!('speechSynthesis' in window)) {
      speechFallback(clean, label, '这台设备不支持系统朗读，已尝试用在线发音。', quiet);
      return;
    }
    loadEnglishVoices();
    const synth = window.speechSynthesis;
    if (!synth || typeof synth.speak !== 'function') {
      speechFallback(clean, label, '这台设备没有可用的系统朗读，已尝试用在线发音。', quiet);
      return;
    }
    if (label) label.classList.add('speaking');
    clearTimeout(speechTimer);

    const start = () => {
      try {
        const utterance = new SpeechSynthesisUtterance(clean);
        const voices = englishVoiceCache || loadEnglishVoices();
        if (voices.length) utterance.voice = voices[0];
        utterance.lang = (voices[0] && voices[0].lang) || 'en-US';
        utterance.rate = 0.86;
        utterance.pitch = 1;
        utterance.volume = 1;
        let started = false;
        utterance.onstart = () => {
          started = true;
          clearTimeout(speechTimer);
          if (label) label.classList.add('speaking');
        };
        utterance.onend = () => {
          clearTimeout(speechTimer);
          if (label) label.classList.remove('speaking');
        };
        utterance.onerror = (event) => {
          clearTimeout(speechTimer);
          if (label) label.classList.remove('speaking');
          if (event && /interrupted|canceled/i.test(event.error || '')) return;
          speechFallback(clean, label, '系统朗读没有声音，已尝试在线发音。', quiet);
        };
        synth.resume();
        synth.speak(utterance);
        speechTimer = setTimeout(() => {
          if (!started && !synth.speaking) {
            speechFallback(clean, label, '系统朗读没有启动，已尝试在线发音。', quiet);
          }
        }, 1500);
      } catch (error) {
        speechFallback(clean, label, '系统朗读启动失败，已尝试在线发音。', quiet);
      }
    };

    try {
      if (synth.speaking || synth.pending) {
        synth.cancel();
        setTimeout(start, 90);
      } else {
        start();
      }
    } catch (error) {
      speechFallback(clean, label, '系统朗读启动失败，已尝试在线发音。', quiet);
    }
  }

  /* ------------------------------- 打卡前浏览 ------------------------------- */

  let prestudyTimerId = null;

  function stopPrestudyTimer() {
    if (prestudyTimerId) clearInterval(prestudyTimerId);
    prestudyTimerId = null;
  }

  function prestudyPlanFor(task) {
    if (!task || task.status === 'done' || task.reviewSession) return null;
    const run = task.mode === 'words' ? task.wordRun : null;
    const alreadyStarted = (run && (Number(run.i) > 0 || Number(run.reviewI) > 0 || Object.keys(run.results || {}).length > 0))
      || Object.keys((task.behavior && task.behavior.values) || {}).length > 0;
    if (alreadyStarted) return null;
    if (task.prestudy && task.prestudy.completedAt) return null;
    if (task.mode === 'words') {
      const count = (task.words || []).length || Number(task.wordTotal) || 0;
      if (!count) return null;
      return {
        kind: 'words',
        count,
        recommendedSeconds: clamp(Math.round(count * 3 + 10), 30, 480),
        minSeconds: clamp(Math.round((count * 3 + 10) * 0.2), 8, 40)
      };
    }
    if (task.mode === 'grammar' && task.lesson) {
      const points = [task.lesson.sentence, task.lesson.rule, task.lesson.tip].filter(Boolean).length;
      return {
        kind: 'grammar',
        count: points,
        recommendedSeconds: clamp(20 + points * 15, 45, 300),
        minSeconds: 12
      };
    }
    const total = taskQuestionCount(task);
    return {
      kind: 'general',
      count: total,
      recommendedSeconds: clamp(15 + total * 2, 20, 150),
      minSeconds: 6
    };
  }

  function ensurePrestudy(task, plan) {
    if (!task.prestudy || typeof task.prestudy !== 'object') {
      task.prestudy = {
        recommendedSeconds: plan.recommendedSeconds,
        minSeconds: plan.minSeconds,
        startedAt: S.nowIso(),
        seconds: 0,
        completedAt: '',
        early: false,
        kind: plan.kind
      };
      save();
    }
    return task.prestudy;
  }

  function prestudyWordsHtml(task) {
    return `<div class="prestudy-list">` +
      (task.words || []).map((word) => (
        `<div class="prestudy-word">` +
          `<b>${S.escapeHtml(word.w)}</b>${word.kk ? `<em>${S.escapeHtml(word.kk)}</em>` : ''}` +
          `<span>${S.escapeHtml(S.meaningLabel(word.w, word.zh, word.pos))}</span>` +
          (word.ex ? `<small>${S.escapeHtml(word.ex)}${word.exZh ? `<br>${S.escapeHtml(word.exZh)}` : ''}</small>` : '') +
        `</div>`
      )).join('') +
    `</div>`;
  }

  function prestudyLessonHtml(task) {
    const lesson = task.lesson || {};
    const points = [];
    if (lesson.sentence) points.push(`<li><b>例句</b>：${S.escapeHtml(lesson.sentence)}${lesson.translation ? `<br><span class="hint">${S.escapeHtml(lesson.translation)}</span>` : ''}</li>`);
    if (lesson.rule) points.push(`<li><b>规则</b>：${S.escapeHtml(lesson.rule)}</li>`);
    if (lesson.tip) points.push(`<li><b>易错点</b>：${S.escapeHtml(lesson.tip)}</li>`);
    if (lesson.outputPrompt) points.push(`<li><b>本课要会写</b>：${S.escapeHtml(lesson.outputPrompt)}</li>`);
    return `<div class="prestudy-overview">` +
      `<b>${S.escapeHtml(lesson.title || task.title || '今日语法')}</b>` +
      (lesson.subtitle ? `<div class="hint">${S.escapeHtml(lesson.subtitle)}</div>` : '') +
      (points.length ? `<ul class="prestudy-points">${points.join('')}</ul>` : '<p class="hint">先看一遍本课标题和题目要求。</p>') +
    `</div>`;
  }

  function prestudyGeneralHtml(task) {
    const blocks = (task.blocks || []).map((block) => {
      const count = block.type === 'writing' || block.prompt ? 1 : (block.questions || []).length;
      return `<li>${S.escapeHtml(S.blockLabel(block.type) || '练习')}：${count} 题</li>`;
    }).join('');
    const passage = (task.blocks || []).map((block) => String(block.passage || '').trim()).filter(Boolean)[0] || '';
    return `<div class="prestudy-overview">` +
      `<b>${S.escapeHtml(task.title || '今日任务')}</b>` +
      `<p class="hint" style="margin:6px 0;">共 ${taskQuestionCount(task)} 题。先看清题型和文章大意，再开始作答。</p>` +
      (blocks ? `<ul class="prestudy-points">${blocks}</ul>` : '') +
      (passage ? `<p style="margin:10px 0 0;color:var(--muted);font-size:0.76rem;line-height:1.7;">${S.escapeHtml(passage.slice(0, 420))}${passage.length > 420 ? '…' : ''}</p>` : '') +
    `</div>`;
  }

  function renderPrestudy(task) {
    const plan = prestudyPlanFor(task);
    if (!plan) { renderRunner(task); return; }
    const state = ensurePrestudy(task, plan);
    const started = new Date(state.startedAt).getTime();
    const bodyHtml = plan.kind === 'words'
      ? prestudyWordsHtml(task)
      : plan.kind === 'grammar'
        ? prestudyLessonHtml(task)
        : prestudyGeneralHtml(task);
    const intro = plan.kind === 'words'
      ? `今天要打卡 ${plan.count} 个词。先从头到尾看一遍，混个眼熟；看完点右下角开始。`
      : plan.kind === 'grammar'
        ? '先看一遍今天的语法点和例句，再开始做题。'
        : '先看一眼今天的题型和文章大意，再开始作答。';
    $('#runner-title').textContent = task.title || '打卡前浏览';
    $('#runner-sub').textContent = '打卡前浏览 · 看完就可以开始';
    $('#runner-report').hidden = true;
    $('#submit-task').hidden = true;
    $('#runner-count').textContent = '浏览中';
    $('#runner-fill').style.width = '0%';
    $('#runner-body').innerHTML =
      `<div class="prestudy">` +
        `<div class="prestudy-head">` +
          `<div><h2>先看一遍，再开始</h2><p>${S.escapeHtml(intro)}</p></div>` +
          `<div class="prestudy-timer"><b id="prestudy-time">--:--</b><span>建议浏览时间</span></div>` +
        `</div>` +
        `<div class="prestudy-track"><i id="prestudy-fill"></i></div>` +
        bodyHtml +
        `<div class="prestudy-foot">` +
          `<small>建议时间由系统按今天的词量 / 知识点自动算。提前看完可以直接开始；不点开始就继续看，不会自动跳走。</small>` +
          `<button class="p-btn prestudy-start" type="button" id="prestudy-start" disabled>先看一会儿…</button>` +
        `</div>` +
      `</div>`;
    stopPrestudyTimer();
    const startBtn = $('#prestudy-start');
    const timeEl = $('#prestudy-time');
    const fillEl = $('#prestudy-fill');
    const tick = () => {
      const elapsed = Math.max(0, (Date.now() - started) / 1000);
      const remain = Math.max(0, plan.recommendedSeconds - elapsed);
      const mm = Math.floor(remain / 60);
      const ss = Math.floor(remain % 60);
      if (timeEl) timeEl.textContent = `${mm}:${String(ss).padStart(2, '0')}`;
      if (fillEl) fillEl.style.width = `${Math.min(100, (elapsed / plan.recommendedSeconds) * 100)}%`;
      if (startBtn) {
        const ready = elapsed >= plan.minSeconds;
        if (ready && startBtn.disabled) {
          startBtn.disabled = false;
          startBtn.textContent = remain > 0 ? '我已浏览完，开始打卡' : '浏览时间到，开始打卡';
          startBtn.classList.add('is-ready');
        }
        if (ready && remain <= 0 && startBtn.textContent !== '浏览时间到，开始打卡') {
          startBtn.textContent = '浏览时间到，开始打卡';
        }
      }
    };
    tick();
    prestudyTimerId = setInterval(tick, 500);
    startBtn.onclick = () => {
      const seconds = Math.max(0, Math.round((Date.now() - started) / 1000));
      task.prestudy = {
        ...state,
        seconds,
        completedAt: S.nowIso(),
        early: seconds < plan.recommendedSeconds
      };
      stopPrestudyTimer();
      taskStartedAt = Date.now();
      startBehaviorSession(task);
      startTimer();
      save();
      renderRunner(task);
    };
  }

  function wordResultTable(task, run) {
    const words = task.words || [];
    return `<table class="word-result-table"><thead><tr><th>单词</th><th>释义</th><th>第一次</th><th>错词重练</th><th>下次复习</th></tr></thead><tbody>` +
      words.map((word, index) => {
        const result = run.results[index] || {};
        const review = run.reviewResults[index] || {};
        const memory = (data.wordMemory || {})[wordMemoryKey(word)];
        const nextText = memory && memory.due
          ? `${S.fmtDate(memory.due)}<br><span class="hint">${wordMasteryLabel(memory)}</span>`
          : '—';
        return `<tr>` +
          `<td><strong>${S.escapeHtml(word.w)}</strong>${result.kind === 'context' ? ' <span class="word-type-tag">语境</span>' : ''}${word.kk ? `<br><span class="hint">${S.escapeHtml(word.kk)}</span>` : ''}</td>` +
          `<td>${S.escapeHtml(word.zh || '—')}</td>` +
          `<td class="${result.firstOk ? 'ok' : 'no'}">${result.firstOk ? '答对' : '答错'}</td>` +
          `<td>${review.ok === true ? '<span class="ok">已订正</span>' : review.ok === false ? '<span class="no">仍错</span>' : '—'}</td>` +
          `<td>${nextText}</td>` +
        `</tr>`;
      }).join('') +
      `</tbody></table>`;
  }

  function renderWordRunner(task) {
    const run = ensureWordRun(task);
    const words = task.words || [];
    const total = words.length;
    const done = task.status === 'done';
    const petDisplay = petDisplayInfo(profile());
    const petInfo = petDisplay.info;
    $('#runner-title').textContent = task.title || '单词打卡';
    $('#runner-sub').textContent = done
      ? `${task.title || '单词打卡'} · 已完成`
      : `${task.title || '单词打卡'} · 已用时 0:00`;
    $('#runner-report').hidden = !done;

    if (done) {
      lastAutoSpeakKey = '';
      $('#submit-task').hidden = true;
      $('#runner-count').textContent = '已完成';
      $('#runner-fill').style.width = '100%';
      const petDone = task.petGain
        ? `<div class="word-summary-pet"><div class="word-summary-pet-art">${petSVG(petInfo.stage, petDisplay.id, petDisplay.fused, { thumb: true })}</div><div><b>这一轮${petDisplay.name}也吃饱了</b><span>成长 +${task.petGain} · 小鱼干 +${task.petSnacks || 0}</span></div></div>`
        : '';
      $('#runner-body').innerHTML = resultHero(task) + `<div class="word-run">${petDone}${wordResultTable(task, run)}${integrityStudentWarning(task)}</div>`;
      $('#runner-body').onclick = null;
      $('#runner-body').onchange = null;
      $('#runner-body').oninput = null;
      return;
    }

    if (run.phase === 'done') {
      const accuracy = wordAccuracy(task, run);
      const score = Math.round(accuracy * 100);
      const firstCorrect = words.filter((word, index) => run.results[index] && run.results[index].firstOk).length;
      const wrong = words.filter((word, index) => !(run.results[index] && run.results[index].firstOk));
      const reviewRight = Object.values(run.reviewResults || {}).filter((item) => item.ok).length;
      const xp = wordXp(task, run);
      $('#submit-task').hidden = false;
      $('#submit-task').textContent = '完成打卡';
      $('#runner-count').textContent = `${firstCorrect} / ${total} 一次答对`;
      $('#runner-fill').style.width = '100%';
      $('#runner-body').innerHTML =
        `<div class="word-run"><div class="word-summary">` +
          `<div class="word-summary-ring" style="--score:${score}%"><div><b>${score}</b><small>ACCURACY</small></div></div>` +
          `<h2>这一轮打卡完成</h2>` +
          `<p>${score >= 90 ? '词感很稳，保持这个节奏。' : score >= 70 ? '大部分已经拿下，错词再看一遍就稳了。' : '错词已经重练过，睡前再回看一次会更牢。'}</p>` +
          `<div class="word-summary-stats">` +
            `<div><b>${firstCorrect} / ${total}</b><span>一次答对</span></div>` +
            `<div><b>x${run.maxCombo || 0}</b><span>最高连击</span></div>` +
            `<div><b>+${xp}</b><span>预计 EXP</span></div>` +
          `</div>` +
          `<div class="word-summary-pet">` +
            `<div class="word-summary-pet-art">${petSVG(petInfo.stage, petDisplay.id, petDisplay.fused, { thumb: true })}</div>` +
            `<div><b>${petDisplay.name}陪你完成了这一轮</b><span>成长 +${task.petGain || 0} · 小鱼干 +${task.petSnacks || 0}</span></div>` +
          `</div>` +
          (wrong.length
            ? `<p class="word-summary-wrong">错词 ${wrong.length} 个，重练答对 ${reviewRight} 个：${wrong.map((word) => `<span class="word-wrong-chip">${S.escapeHtml(word.w)}</span>`).join('')}</p>`
            : `<p class="word-summary-wrong">全部一次答对，没有错词。</p>`) +
          `<div class="word-summary-actions"><button class="p-btn" type="button" data-word-finish>完成打卡，交给老师</button></div>` +
          `<p class="word-review-note">点击后成绩会写进本机档案。回主界面生成“汇报码”，老师导入后才能看到这次记录。</p>` +
        `</div></div>`;
      bindWordClicks(task, run);
      return;
    }

    /* 最后一题答完后刷新页面：主轮已结束，按错词队列决定进入重练还是收尾。 */
    if (run.phase === 'main' && Number(run.i) >= total) {
      if (run.reviewQueue.length) {
        run.phase = 'review';
        run.reviewI = 0;
      } else {
        run.phase = 'done';
      }
      save();
      renderWordRunner(task);
      return;
    }

    const reviewMode = run.phase === 'review';
    const index = reviewMode ? Number(run.reviewQueue[run.reviewI]) : Number(run.i);
    const word = words[index];
    if (!word) {
      run.phase = 'done';
      save();
      renderWordRunner(task);
      return;
    }
    const isReview = reviewMode;
    const kind = isReview ? 'review' : wordQuestionKind(task, word, index);
    const contextText = kind === 'context' ? contextSentenceFor(word) : '';
    const options = kind === 'review'
      ? reviewOptionsFor(task, word)
      : kind === 'context'
        ? contextOptionsFor(task, word, index)
        : wordOptionsFor(task, word, index);
    const correctText = kind === 'meaning' ? S.meaningLabel(word.w, word.zh, word.pos) : word.w;
    const progress = isReview
      ? (run.reviewQueue.length ? run.reviewI / run.reviewQueue.length : 1)
      : (total ? index / total : 0);
    const combo = Number(run.combo) || 0;
    const speechText = kind === 'context'
      ? contextText.replace(/______/g, 'blank')
      : word.w;

    $('#submit-task').hidden = true;
    $('#submit-task').textContent = '完成打卡';
    $('#runner-fill').style.width = `${Math.round(progress * 100)}%`;
    $('#runner-count').textContent = isReview
      ? `错词重练 ${Math.min(run.reviewI + 1, run.reviewQueue.length)} / ${run.reviewQueue.length}`
      : `${Math.min(index + 1, total)} / ${total}`;

    const autoLabel = autoSpeakEnabled() ? '🔊 自动读音：开' : '🔇 自动读音：关';
    const autoButton = `<button class="word-auto-speak" type="button" data-word-autospeak="${autoSpeakEnabled() ? 'on' : 'off'}" title="新词出现时自动读一遍">${autoLabel}</button>`;
    const stage = kind === 'review'
      ? `<div class="word-stage review">` +
          `<div class="word-stage-label"><span>错词回炉 · ${word.w}</span><span class="word-phase">中 → 英</span></div>` +
          `<div class="word-main"><p class="word-big cn">${S.escapeHtml(S.meaningLabel(word.w, word.zh, word.pos))}</p>` +
          `<p class="word-phon">选回对应的英文单词</p></div>` +
        `</div>`
      : kind === 'context'
        ? `<div class="word-stage context">` +
            `<div class="word-stage-label"><span>语境推词 · 第 ${index + 1} 题</span><span class="word-phase">读句选词</span></div>` +
            `<p class="word-context-kicker">读句子，选出最符合语境的一个词</p>` +
            `<p class="word-context-sentence" data-word-speak="${S.escapeHtml(speechText)}" role="button" tabindex="0" title="点句子听读音">${S.escapeHtml(contextText).replace(/______/g, '<span class="word-blank">______</span>')}</p>` +
            `<button class="word-speak" type="button" data-word-speak="${S.escapeHtml(speechText)}">🔊 读句子</button>` +
          `</div>`
        : `<div class="word-stage">` +
            `<div class="word-stage-label"><span>${task.title || '单词打卡'}</span><span class="word-phase">英 → 中</span></div>` +
            `<div class="word-main"><p class="word-big" data-word-speak="${S.escapeHtml(word.w)}" role="button" tabindex="0" title="点单词听读音">${S.escapeHtml(word.w)}</p>` +
            `<p class="word-phon">${S.escapeHtml(word.kk || '')}${word.pos ? `<span class="word-pos">${S.escapeHtml(word.pos)}</span>` : ''}</p>` +
            `<button class="word-speak" type="button" data-word-speak="${S.escapeHtml(word.w)}">🔊 听读音</button></div>` +
          `</div>`;

    const questionText = kind === 'review'
      ? '选出正确英文'
      : kind === 'context'
        ? '选出最符合句意的英文单词'
        : '选出正确的中文意思';

    $('#runner-body').innerHTML = `<div class="word-run">` +
      `<div class="word-run-top">` +
        `<span class="word-run-kicker">${task.reviewSession ? 'MEMORY REVIEW · 记忆复习' : isReview ? 'REVIEW' : kind === 'context' ? 'CONTEXT QUEST' : 'WORD QUEST'} · ${run.phase === 'review' ? '错词重练' : kind === 'context' ? '语境推词' : task.reviewSession ? '到期复习' : '第一轮'}</span>` +
        `<span class="word-run-tools">${autoButton}<span class="word-combo ${combo >= 3 ? 'hot' : ''}" id="word-combo">${combo >= 3 ? '🔥' : '⚡'} 连击 x${combo}</span></span>` +
      `</div>` +
      `<div class="word-progress-game"><i id="word-progress-fill" style="width:${Math.round(progress * 100)}%"></i></div>` +
      stage +
      `<p class="word-question">${questionText}</p>` +
      `<div class="word-options" id="word-options">` +
        options.map((option) => `<button class="word-option" type="button" data-word-option="${S.escapeHtml(option)}">${S.escapeHtml(option)}</button>`).join('') +
      `</div>` +
      `<div class="word-pet-row" id="word-pet-row">` +
        `<div class="word-pet" id="word-pet">${petSVG(petInfo.stage, petDisplay.id, petDisplay.fused, { thumb: true })}</div>` +
        `<div class="word-pet-copy"><b>${petDisplay.name} · ${petInfo.name}</b><span id="word-pet-say">答对一题，就喂我 2 点成长。</span></div>` +
        `<span class="word-pet-gain" id="word-pet-gain" aria-live="polite"></span>` +
      `</div>` +
      `<div class="word-feedback" id="word-feedback" hidden></div>` +
      `<p class="word-review-note">${task.reviewSession ? '这是今日复习站：都是按记忆排期今天该回想的词。答对后间隔会变成 2、4、7、15、30 天；答错明天再来。' : isReview ? '这次答对会记为“已订正”，但得分仍按第一次作答计算。' : kind === 'context' ? '先理解整句意思，再选词；选错会自动进入最后的错词回炉。' : '选错会自动进入最后的错词回炉，不影响你继续闯关。'}</p>` +
    `</div>`;

    run.questionShownAt = Date.now();
    const context = { index, word, correctText, isReview, kind, contextText, speechText };
    bindWordClicks(task, run, context);
    if (!done) startTimer();
    if (!isReview) autoSpeakQuestion(task, run, context, speechText);
  }

  function bindWordClicks(task, run, context) {
    const body = $('#runner-body');
    body.onchange = null;
    body.oninput = null;
    body.onkeydown = (event) => {
      const word = event.target.closest('.word-big[data-word-speak]');
      if (word && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        speakWord(word.dataset.wordSpeak, word);
      }
    };
    body.onclick = (event) => {
      const autoBtn = event.target.closest('[data-word-autospeak]');
      if (autoBtn) {
        const on = autoBtn.dataset.wordAutospeak !== 'on';
        setAutoSpeak(on);
        autoBtn.dataset.wordAutospeak = on ? 'on' : 'off';
        autoBtn.textContent = on ? '🔊 自动读音：开' : '🔇 自动读音：关';
        if (on && context) speakWord(context.speechText, $('.word-big') || $('.word-context-sentence'), { quiet: true });
        return;
      }
      const speakBtn = event.target.closest('[data-word-speak]');
      if (speakBtn) {
        speakWord(speakBtn.dataset.wordSpeak, speakBtn);
        return;
      }
      const finishBtn = event.target.closest('[data-word-finish]');
      if (finishBtn) {
        submitWordTask();
        return;
      }
      const option = event.target.closest('[data-word-option]');
      if (!option || !context || run.locked) return;
      answerWordOption(task, run, context, option);
    };
  }

  function answerWordOption(task, run, context, option) {
    const picked = option.dataset.wordOption;
    const ok = picked === context.correctText;
    const behavior = ensureBehavior(task);
    let answerSeconds = 0;
    if (run.questionShownAt) {
      const seconds = Math.max(0, (Date.now() - run.questionShownAt) / 1000);
      answerSeconds = Math.round(seconds * 100) / 100;
      if (!context.isReview) behavior.wordTimes.push(answerSeconds);
      run.questionShownAt = 0;
    }
    run.locked = true;
    const optionButtons = $$('#word-options .word-option');
    const optionIndex = optionButtons.indexOf(option);
    const optionCount = optionButtons.length;
    optionButtons.forEach((button) => {
      button.disabled = true;
      if (button.dataset.wordOption === context.correctText) button.classList.add('correct');
      else if (button !== option) button.classList.add('dim');
    });
    if (!ok) option.classList.add('wrong');

    /* 每答对一个词，当场喂小潮獭 2 点成长 */
    if (ok) addPetXp(2);
    const petEl = $('#word-pet');
    if (petEl) petEl.classList.add(ok ? 'is-happy' : 'is-sad');
    const petSay = $('#word-pet-say');
    if (petSay) petSay.textContent = ok ? '好吃！再答对一个。' : '没关系，我陪你再看一遍。';
    const petGainEl = $('#word-pet-gain');
    if (petGainEl) {
      petGainEl.textContent = ok ? '+2 成长' : '';
      petGainEl.classList.toggle('show', ok);
    }

    if (context.isReview) {
      run.reviewResults[context.index] = { ok, answer: picked, seconds: answerSeconds, optionIndex, optionCount };
      run.reviewI = Number(run.reviewI) + 1;
    } else {
      run.results[context.index] = {
        firstOk: ok,
        answer: picked,
        kind: context.kind,
        seconds: answerSeconds,
        optionIndex,
        optionCount
      };
      if (ok) {
        run.combo = Number(run.combo) + 1;
        run.maxCombo = Math.max(Number(run.maxCombo) || 0, run.combo);
      } else {
        run.combo = 0;
        if (!run.reviewQueue.includes(context.index)) run.reviewQueue.push(context.index);
      }
      run.i = Number(run.i) + 1;
    }

    const feedback = $('#word-feedback');
    if (feedback) {
      feedback.hidden = false;
      feedback.className = `word-feedback ${ok ? 'ok' : 'no'}`;
      const contextAnswer = context.kind === 'context' && context.contextText
        ? `<div class="word-answer-context">${S.escapeHtml(context.contextText).replace(/______/g, `<b>${S.escapeHtml(context.word.w)}</b>`)}` +
          `${context.word.exZh ? `<small>${S.escapeHtml(context.word.exZh)}</small>` : ''}</div>`
        : '';
      feedback.innerHTML = ok
        ? `<b>${context.isReview ? '订正成功' : '答对了'} · 连击 x${run.combo}</b>` +
          `<div class="word-answer-line">${S.escapeHtml(context.word.w)} · ${S.escapeHtml(S.meaningLabel(context.word.w, context.word.zh, context.word.pos))}${context.isReview ? '' : '　已记入本轮成绩'}</div>` +
          contextAnswer
        : `<b>${context.isReview ? '这次还没记住' : '先记一下'}</b>` +
          `<div class="word-answer-line"><strong>${S.escapeHtml(context.word.w)}</strong> · ${S.escapeHtml(S.meaningLabel(context.word.w, context.word.zh, context.word.pos))}${context.word.kk ? ` · ${S.escapeHtml(context.word.kk)}` : ''}</div>` +
          contextAnswer +
          `<div class="word-answer-line">${context.isReview ? '下一轮再遇到它，试着先回想发音。' : '这个词会在最后再考一次。'}</div>`;
    }
    const comboEl = $('#word-combo');
    if (comboEl) {
      comboEl.classList.toggle('hot', Number(run.combo) >= 3);
      comboEl.textContent = `${Number(run.combo) >= 3 ? '🔥' : '⚡'} 连击 x${run.combo}`;
    }
    save();

    const delay = ok ? 850 : 1600;
    setTimeout(() => {
      run.locked = false;
      if (activeTaskId !== task.id) return;
      if (!context.isReview && Number(run.i) >= (task.words || []).length) {
        if (run.reviewQueue.length) {
          run.phase = 'review';
          run.reviewI = 0;
        } else {
          run.phase = 'done';
        }
      } else if (context.isReview && Number(run.reviewI) >= run.reviewQueue.length) {
        run.phase = 'done';
      }
      save();
      renderWordRunner(task);
    }, delay);
  }

  function submitWordTask() {
    const task = activeTaskId ? findTask(activeTaskId) : null;
    if (!task || task.status === 'done' || task.mode !== 'words') return;
    const run = ensureWordRun(task);
    if (run.phase !== 'done') { S.toast('先把这一轮词答完。', 'error'); return; }
    const words = task.words || [];
    const total = words.length;
    const firstCorrect = words.filter((word, index) => run.results[index] && run.results[index].firstOk).length;
    const accuracy = total ? firstCorrect / total : 0;
    const score = Math.round(accuracy * 100);
    const xpEarned = wordXp(task, run);
    const petGain = Math.max(8, Math.round(xpEarned * 0.6));
    const petSnacks = Math.max(1, Math.round(total / 5)) + (accuracy >= 0.9 ? 1 : 0);
    const wordStats = words.map((word, index) => ({
      w: word.w,
      zh: word.zh || '',
      kk: word.kk || '',
      ok: !!(run.results[index] && run.results[index].firstOk),
      reviewOk: run.reviewResults[index] ? !!run.reviewResults[index].ok : null,
      kind: (run.results[index] && run.results[index].kind) || 'meaning',
      attempts: 1 + (run.results[index] && run.results[index].firstOk ? 0 : 1)
    }));
    const review = wordStats.map((word, index) => ({
      n: index + 1,
      stem: word.kind === 'context' && words[index] && words[index].ex ? words[index].ex : word.w,
      userAnswer: word.ok ? word.zh : '选错',
      correctAnswer: word.zh,
      ok: word.ok,
      type: 'vocab',
      explanation: word.kind === 'context' ? '语境推词题' : ''
    })).filter((item) => !item.ok);
    task.status = 'done';
    task.submittedAt = S.nowIso();
    task.timeSpent = Math.max(1, Math.round((Date.now() - taskStartedAt) / 1000));
    task.score = score;
    task.accuracy = accuracy;
    task.correct = firstCorrect;
    task.total = total;
    task.ungraded = 0;
    task.xpEarned = xpEarned;
    task.petGain = petGain;
    task.petSnacks = petSnacks;
    task.wordStats = wordStats;
    /* 更新每个词的记忆排期：新词明天复习，答对后间隔逐档拉长，答错回到明天。 */
    updateWordMemoryFromTask(task);
    task.integrity = computeIntegrity(task);
    task.blockStats = [{ type: 'vocab', label: '单词打卡', total, correct: firstCorrect }];
    task.review = review;
    task.writing = '';
    task.result = { correct: firstCorrect, total, ungraded: 0, accuracy, blockStats: task.blockStats, word: true };
    profile().attrs = profile().attrs || S.emptyAttrs();
    S.applyAttrResult(profile().attrs, 'vocab', firstCorrect, total);
    addXp(xpEarned);
    const pet = ensurePet(profile());
    pet.snacks += petSnacks;
    addPetXp(petGain);
    save();
    renderAll();
    renderRunner(task);
    stopTimer();
    S.toast(`打卡完成，一次答对 ${firstCorrect}/${total}，+${xpEarned} EXP。回主界面生成汇报码发给老师。`, 'ok', 6000);
  }

  function resultHero(task) {
    const result = task.result || {};
    const score = task.score == null ? '—' : task.score;
    const scoreValue = task.score == null ? 0 : task.score;
    const total = result.total || 0;
    const correct = result.correct || 0;
    const accuracy = task.accuracy == null ? '—' : `${Math.round(task.accuracy * 100)}%`;
    const minutes = Math.max(1, Math.round((task.timeSpent || 0) / 60));
    const grammar = task.mode === 'grammar';
    const title = grammar ? '今日语法完成' : task.score == null ? '已提交，等待批改' : '任务完成';
    const sub = grammar
      ? `选择题答对 ${correct} / ${total} 道${task.writing ? '，仿写已完成' : '，仿写这次空着'}，获得 ${task.xpEarned || 0} EXP。`
      : task.score == null
        ? '这份任务没有可自动判分的答案，老师会在汇报里看到你的作答。'
        : `答对 ${correct} / ${total} ${task.mode === 'words' ? '词' : '题'}，获得 ${task.xpEarned || 0} EXP。`;
    return `<div class="result-hero${grammar ? ' grammar-result' : ''}">` +
      `<div class="result-ring" style="--score:${scoreValue}%"><span>${score}</span><small>SCORE</small></div>` +
      `<h2 class="result-title">${title}</h2>` +
      `<p class="result-sub">${sub}</p>` +
      `<div class="result-stats">` +
        `<div class="result-stat"><b>${accuracy}</b><span>正确率</span></div>` +
        `<div class="result-stat"><b>${minutes}′</b><span>用时</span></div>` +
        `<div class="result-stat"><b>+${task.xpEarned || 0}</b><span>EXP</span></div>` +
      `</div>` +
      (result.ungraded ? `<p class="hint">有 ${result.ungraded} 道题老师没有附答案，已记录你的作答，不计入正确率。</p>` : '') +
      integrityStudentWarning(task) +
    `</div>`;
  }

  function integrityStudentWarning(task) {
    const integrity = task && task.integrity;
    if (!integrity || Number(integrity.score) >= 55) return '';
    const flags = Array.isArray(integrity.flags) ? integrity.flags : [];
    return `<div class="integrity-student-warn"><b>这次答题节奏有些异常</b>` +
      `<div>${S.escapeHtml(flags.slice(0, 3).join('、') || '系统检测到作答过快或选项过于规律')}。老师会在汇报里看到提示，请按真实水平作答。</div>` +
    `</div>`;
  }

  function submitTask() {
    const task = activeTaskId ? findTask(activeTaskId) : null;
    if (!task || task.status === 'done') return;
    if (task.mode === 'words') { submitWordTask(); return; }
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
        const optionText = (letter) => {
          const hit = (question.options || []).find((option) => String(option.letter) === String(letter));
          return hit ? String(hit.text || '') : '';
        };
        review.push({
          n: question.n,
          itemId: String(block.itemId || ''),
          stem: String(question.stem || '').slice(0, 160),
          userAnswer: String(answer || ''),
          userText: optionText(answer).slice(0, 120),
          correctAnswer: String(question.answer || ''),
          correctText: optionText(question.answer).slice(0, 120),
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
    task.integrity = computeIntegrity(task);
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

  /* 新代码为了短，只带英文单词；学生端用本机同一份 glossary.json 补回释义、音标和词性。 */
  let studentGlossaryPromise = null;
  function loadStudentGlossary() {
    if (!studentGlossaryPromise) {
      studentGlossaryPromise = fetch('vendor/glossary.json', { cache: 'force-cache' })
        .then((response) => (response.ok ? response.json() : {}))
        .catch(() => ({}));
    }
    return studentGlossaryPromise;
  }

  /* 新代码为了短，只带 grammarDay 和压缩后的单词；导入时在这里还原成完整任务。 */
  async function hydrateTaskPayload(task) {
    if (!task || typeof task !== 'object') return task;
    if (Array.isArray(task.words) && task.words.length) {
      const hasSlimWords = task.words.some((item) => typeof item === 'string');
      const glossary = hasSlimWords ? await loadStudentGlossary() : null;
      const exampleBank = window.ShunshiWordExamples || {};
      task.words = S.unpackWordList(task.words).map((word) => {
        const key = String(word.w || '').toLowerCase();
        const entry = glossary && glossary[key];
        const bank = exampleBank[key] || {};
        const rawZh = word.zh || (entry && entry.zh) || '';
        return {
          ...word,
          zh: rawZh ? S.meaningFor(word.w, rawZh) : '',
          kk: word.kk || (entry && entry.kk) || '',
          pos: word.pos || (entry && entry.pos) || '',
          ex: word.ex || bank.ex || '',
          exZh: word.exZh || bank.exZh || ''
        };
      });
      if (!task.wordTotal) task.wordTotal = task.words.length;
    }
    if (task.mode === 'grammar' && Number(task.grammarDay) > 0) {
      const G = window.ShunshiGrammar;
      const lesson = G ? G.lessonByDay(Number(task.grammarDay)) : null;
      if (lesson && (!task.lesson || !Array.isArray(task.blocks) || task.blocks.length < 4)) {
        task.lesson = G.summary(lesson);
        task.blocks = G.buildBlocks(lesson, G.lessonByDay(G.reviewDayFor(lesson.day)));
      }
    }
    return task;
  }

  async function importPlanPayload(payload) {
    const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
    if (!tasks.length) { S.toast('这份周计划里没有任务，请让老师重新生成。', 'error'); return; }
    if (tasks.length > 80) { S.toast('这份计划任务过多，已拒绝导入。', 'error'); return; }
    for (const task of tasks) {
      if (!task || task.kind !== 'task' || !task.id) { S.toast('周计划里有损坏的任务，请让老师重新生成。', 'error'); return; }
      await hydrateTaskPayload(task);
      const taskAuth = await S.sha256Hex(`${profile().id}|${sessionPin}|${task.id}`);
      if (!S.authMatches(task.auth, taskAuth)) { S.toast('周计划校验失败，可能不是发给你的。', 'error', 7000); return; }
      if (task.mode === 'words') {
        if (!Array.isArray(task.words) || task.words.length < 4) { S.toast('周计划里的单词任务不完整。', 'error'); return; }
      } else if (task.mode === 'grammar') {
        if (!task.lesson || !Array.isArray(task.blocks) || task.blocks.length < 4) {
          S.toast('周计划里的语法课不完整，请让老师重新生成。', 'error'); return;
        }
      } else if (!Array.isArray(task.blocks) || !task.blocks.length) {
        S.toast('周计划里的练习任务没有题目。', 'error'); return;
      }
    }
    let added = 0;
    let kept = 0;
    tasks.forEach((payloadTask) => {
      const existing = findTask(payloadTask.id);
      if (existing && existing.status === 'done') { kept += 1; return; }
      const task = {
        ...payloadTask,
        answers: existing ? existing.answers || {} : {},
        wordRun: existing ? existing.wordRun || null : null,
        status: 'new',
        importedAt: existing ? existing.importedAt : S.nowIso(),
        extraUnlocked: existing ? existing.extraUnlocked || false : false
      };
      data.tasks = data.tasks.filter((item) => item.id !== task.id);
      data.tasks.push(task);
      added += 1;
    });
    const policy = applyIncomingReviewPolicy(tasks);
    save();
    renderAll();
    S.closeDialog($('#import-dialog'));
    $('#import-code').value = '';
    const dayCount = new Set(tasks.map((task) => Number(task.planDay)).filter(Boolean)).size;
    S.toast(`计划已导入：${added} 个任务${dayCount ? ` · ${dayCount} 天` : ''}${kept ? `，${kept} 个已完成` : ''}。${policy ? '旧词复习已按新排期摊开。' : ''}完成当天全部任务后，下一天自动解锁。`, 'ok', 7000);
  }

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
    if (!payload || (payload.kind !== 'task' && payload.kind !== 'plan')) { S.toast('这不是任务码，别把汇报码贴进来。', 'error'); return; }
    if (payload.studentId !== profile().id) {
      S.toast(`这个任务是发给 ${payload.studentId} 的，不是当前学号 ${profile().id}。`, 'error', 6000);
      return;
    }
    if (!requireTrial('体验卡已到期，先申请延长，再导入新的周计划。')) return;
    const auth = await S.sha256Hex(`${payload.studentId}|${sessionPin}|${payload.id}`);
    if (!S.authMatches(payload.auth, auth)) {
      S.toast('任务码和当前密码不匹配，可能不是发给你的。', 'error', 6000);
      return;
    }
    if (payload.kind === 'plan') {
      await importPlanPayload(payload);
      return;
    }
    await hydrateTaskPayload(payload);
    const wordMode = payload.mode === 'words';
    if (wordMode) {
      if (!Array.isArray(payload.words) || payload.words.length < 4) {
        S.toast('单词任务里的词不够 4 个，请让老师重新生成。', 'error');
        return;
      }
    } else if (!Array.isArray(payload.blocks) || !payload.blocks.length) {
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
      wordRun: existing ? existing.wordRun || null : null,
      status: 'new',
      importedAt: S.nowIso()
    };
    data.tasks = data.tasks.filter((item) => item.id !== task.id);
    data.tasks.unshift(task);
    const policy = task.mode === 'words' ? applyIncomingReviewPolicy([task]) : null;
    save();
    renderAll();
    S.closeDialog($('#import-dialog'));
    $('#import-code').value = '';
    S.toast(`任务已导入，开始吧。${policy ? '旧词复习已按新排期摊开。' : ''}`, 'ok');
  }

  function taskDay(task) {
    return String(task && (task.submittedAt || task.due) || '').slice(0, 10);
  }

  function reportDayChoices() {
    const days = new Set([S.todayIso()]);
    (data.tasks || []).forEach((task) => {
      if (task.status === 'done' && task.submittedAt) days.add(taskDay(task));
    });
    ((profile() && profile().checkins) || []).forEach((day) => {
      if (String(day) >= S.addDays(S.todayIso(), -30)) days.add(String(day).slice(0, 10));
    });
    return Array.from(days).filter(Boolean).sort((a, b) => b.localeCompare(a)).slice(0, 30);
  }

  function renderReportDays(selected) {
    const select = $('#report-day');
    if (!select) return;
    const days = reportDayChoices();
    const choice = days.includes(selected) ? selected : days[0];
    select.innerHTML = days.map((day) => {
      const tasks = (data.tasks || []).filter((task) => task.status === 'done' && taskDay(task) === day);
      const checkin = ((profile() && profile().checkins) || []).includes(day);
      const bits = [];
      if (tasks.length) bits.push(`${tasks.length} 个任务`);
      if (checkin) bits.push('已打卡');
      return `<option value="${S.escapeHtml(day)}" ${day === choice ? 'selected' : ''}>${S.escapeHtml(S.fmtDate(day))}${bits.length ? ` · ${bits.join(' · ')}` : ' · 还没有记录'}</option>`;
    }).join('');
  }

  function aggregateIntegrity(tasks) {
    const checked = (tasks || []).filter((task) => task && task.integrity && task.integrity.score != null);
    if (!checked.length) return null;
    let weight = 0;
    let weighted = 0;
    let min = 100;
    const flagCount = new Map();
    checked.forEach((task) => {
      const score = Number(task.integrity.score) || 0;
      const total = Math.max(1, Number(task.total) || taskQuestionCount(task) || 1);
      weight += total;
      weighted += score * total;
      min = Math.min(min, score);
      (task.integrity.flags || []).forEach((flag) => {
        const text = String(flag || '').trim();
        if (text) flagCount.set(text, (flagCount.get(text) || 0) + 1);
      });
    });
    const avg = weight ? Math.round(weighted / weight) : 0;
    const flags = Array.from(flagCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([text, count]) => count > 1 ? `${text}（${count} 次）` : text)
      .slice(0, 6);
    const suspicious = checked.filter((task) => Number(task.integrity.score) < 55).length;
    const level = min < 55 || avg < 60 ? 'bad' : avg < 80 || flags.length ? 'warn' : 'good';
    return {
      score: avg,
      min,
      level,
      suspicious,
      checked: checked.length,
      flags,
      summary: level === 'bad'
        ? `有 ${suspicious || 1} 次任务出现明显异常信号，建议核对答题过程。`
        : level === 'warn'
          ? '有轻度异常信号，可能只是赶时间，建议看一眼。'
          : '答题节奏和选项分布正常。'
    };
  }

  async function buildReport(scope, day) {
    if (!profile() || !sessionPin) throw new Error('档案还没有解锁。');
    const reportId = S.uid('R');
    const auth = S.authCode(await S.sha256Hex(`${profile().id}|${sessionPin}|${reportId}`));
    const p = profile();
    const daily = scope === 'daily';
    const reportDay = daily ? String(day || S.todayIso()).slice(0, 10) : '';
    const doneTasks = data.tasks.filter((task) => task.status === 'done');
    const tasks = daily ? doneTasks.filter((task) => taskDay(task) === reportDay) : doneTasks;
    const scores = tasks.filter((task) => task.score != null && Number.isFinite(Number(task.score))).map((task) => Number(task.score));
    const dayPlanDays = Array.from(new Set(tasks.filter((task) => task.planId && Number(task.planDay)).map((task) => Number(task.planDay))));
    const dailySummary = daily
      ? {
          day: reportDay,
          taskCount: tasks.length,
          avgScore: scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null,
          checkin: Array.isArray(p.checkins) && p.checkins.includes(reportDay),
          checkinStreak: S.streakFromCheckins(p.checkins || []),
          planDays: dayPlanDays,
          wordAccuracy: (() => {
            const stats = [];
            tasks.forEach((task) => (task.wordStats || []).forEach((word) => stats.push(word)));
            return stats.length ? Math.round((stats.filter((word) => word.ok).length / stats.length) * 100) : null;
          })(),
          integrity: aggregateIntegrity(tasks)
        }
      : null;
    return {
      v: 1,
      kind: 'report',
      reportId,
      studentId: p.id,
      studentName: p.name,
      auth,
      scope: daily ? 'daily' : 'full',
      reportDay,
      archive: !daily,
      daily: dailySummary,
      generatedAt: S.nowIso(),
      profile: daily ? {
        /* 今日汇报只带老师当天要看的部分；神兽、仓库等大块数据留在学生本机，
           老师端保留上一次的完整档案。这样汇报码能短一大截。 */
        id: p.id,
        name: p.name,
        grade: p.grade,
        avatar: p.avatar,
        createdAt: p.createdAt,
        xp: p.xp,
        attrs: p.attrs,
        checkins: (p.checkins || []).filter((day) => String(day) >= S.addDays(reportDay, -60)),
        badges: p.badges,
        accountType: p.accountType || 'regular',
        trialDays: p.trialDays || 0,
        trialExpiresAt: p.trialExpiresAt || '',
        trialStartedAt: p.trialStartedAt || ''
      } : {
        id: p.id,
        name: p.name,
        grade: p.grade,
        avatar: p.avatar,
        createdAt: p.createdAt,
        xp: p.xp,
        attrs: p.attrs,
        checkins: p.checkins,
        badges: p.badges,
        accountType: p.accountType || 'regular',
        trialDays: p.trialDays || 0,
        trialExpiresAt: p.trialExpiresAt || '',
        trialStartedAt: p.trialStartedAt || '',
        pets: p.pets || null,
        petPool: p.petPool || null,
        unlockedPets: p.unlockedPets || null,
        activePet: p.activePet || '',
        fusion: p.fusion || null,
        fusions: p.fusions || null,
        activeFusion: p.activeFusion || '',
        titles: p.titles || null,
        wheel: p.wheel || null,
        lastDailyReport: p.lastDailyReport || null
      },
      tasks: tasks.map((task) => ({
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
        mode: task.mode || '',
        wordTotal: task.wordTotal || (task.words || []).length || 0,
        wordStats: task.wordStats || [],
        maxCombo: task.wordRun ? Number(task.wordRun.maxCombo) || 0 : 0,
        blockStats: task.blockStats || [],
        review: task.review || [],
        writing: task.writing || '',
        assignedAt: task.createdAt || task.importedAt || '',
        planId: task.planId || '',
        planDay: task.planDay || 0,
        assignmentId: task.assignmentId || '',
        wordSlot: task.wordSlot || '',
        integrityScore: task.integrity ? task.integrity.score : null,
        integrityFlags: task.integrity ? task.integrity.flags : [],
        integrityDetail: task.integrity ? {
          secondsPerItem: task.integrity.secondsPerItem,
          sameOptionRatio: task.integrity.sameOptionRatio,
          longestSameOption: task.integrity.longestSameOption,
          pattern: task.integrity.pattern,
          focusLost: task.integrity.focusLost
        } : null,
        prestudy: task.prestudy ? {
          seconds: task.prestudy.seconds,
          recommendedSeconds: task.prestudy.recommendedSeconds,
          early: Boolean(task.prestudy.early),
          kind: task.prestudy.kind
        } : null
      }))
    };
  }

  async function generateReportCode(scope, day) {
    const report = await buildReport(scope, day);
    const code = await S.packCode(report);
    $('#report-code').value = code;
    const qrHolder = $('#report-qr');
    if (qrHolder && window.ShunshiQR) {
      if (reportQrMount && reportQrMount.stop) reportQrMount.stop();
      reportQrMount = window.ShunshiQR.mount(qrHolder, code, { size: 190 });
    }
    const p = profile();
    p.reportCount = Math.max(0, Number(p.reportCount) || 0) + 1;
    if (scope === 'daily') {
      p.lastDailyReport = { day: report.reportDay, at: report.generatedAt, reportId: report.reportId, taskCount: report.tasks.length };
      save();
      renderReportStatus();
    } else {
      save();
    }
    return report;
  }

  async function openReport() {
    try {
      const dailyRadio = $('input[name="report-scope"][value="daily"]');
      if (dailyRadio) dailyRadio.checked = true;
      renderReportDays(S.todayIso());
      const code = await generateReportCode('daily', S.todayIso());
      const note = $('#report-scope-note');
      if (note) note.textContent = code ? '今日汇报已生成。复制发给老师，老师导入后就能看到今天的完成情况。' : '';
      S.openDialog($('#report-dialog'));
    } catch (error) {
      S.toast(error.message || '汇报码生成失败。', 'error');
    }
  }

  async function refreshReportCode() {
    const dialog = $('#report-dialog');
    if (!dialog || !dialog.open) return;
    const scopeInput = $('input[name="report-scope"]:checked');
    const scope = scopeInput ? scopeInput.value : 'daily';
    const day = $('#report-day') ? $('#report-day').value : S.todayIso();
    const dayField = $('#report-day-field');
    if (dayField) dayField.hidden = scope !== 'daily';
    const note = $('#report-scope-note');
    if (note) {
      note.textContent = scope === 'daily'
        ? '今日汇报只带当天完成的任务和当天打卡状态，老师看起来最清楚。'
        : '完整档案包含全部历史任务，适合换手机时恢复；日常监督请用“今日汇报”。';
    }
    try {
      await generateReportCode(scope, day);
    } catch (error) {
      S.toast(error.message || '汇报码生成失败。', 'error');
    }
  }

  function renderReportStatus() {
    const el = $('#report-status');
    if (!el) return;
    const p = profile();
    if (!p) return;
    const today = S.todayIso();
    const tasksToday = (data.tasks || []).filter((task) => task.status === 'done' && taskDay(task) === today);
    const checkin = (p.checkins || []).includes(today);
    const last = p.lastDailyReport && p.lastDailyReport.day === today ? p.lastDailyReport : null;
    if (last && tasksToday.length > (Number(last.taskCount) || 0)) {
      el.innerHTML = `<b>今天又完成了新任务</b>（${tasksToday.length} 个），建议重新生成一次“今日汇报码”，老师才能看到最新进度。`;
    } else if (last) {
      el.innerHTML = `<b class="ok">今日汇报已生成</b> · 今天完成 ${tasksToday.length} 个任务${checkin ? '，已打卡' : ''}。再完成新任务后，重新生成一次即可。`;
    } else if (tasksToday.length || checkin) {
      el.innerHTML = `今天已完成 ${tasksToday.length} 个任务${checkin ? '并打卡' : ''}，记得生成“今日汇报码”发给老师。`;
    } else {
      el.textContent = '每天完成任务后生成一次“今日汇报”，老师导入后才能看到当天情况。';
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
    if (!S.authMatches(payload.auth, auth)) {
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
    rememberLogin(pin);
    S.closeDialog($('#restore-dialog'));
    showApp();
    S.toast('档案已恢复。历史任务的题目原文不包含在档案码里，成绩和错题仍然保留。', 'ok', 6000);
  }

  async function applyPasswordReset() {
    if (!profile()) { S.toast('这台设备上还没有档案，请先用开通码建档。', 'error'); return; }
    const code = $('#forgot-code').value.trim();
    const status = $('#forgot-status');
    if (!code) { S.toast('先粘贴老师发来的重置码。', 'error'); return; }
    let payload;
    try {
      payload = await S.unpackCode(code);
    } catch (error) {
      S.toast(error.message || '重置码无法识别，请让老师重新生成。', 'error', 6000);
      return;
    }
    if (!payload || payload.kind !== 'reset' || !payload.studentId || !payload.pin) {
      S.toast('这不是学生密码重置码，别把任务码或汇报码贴进来。', 'error', 6000);
      return;
    }
    if (String(payload.studentId) !== String(profile().id)) {
      S.toast(`这段重置码是给 ${payload.studentId} 的，不是当前学号 ${profile().id}。`, 'error', 6500);
      return;
    }
    if (!/^[A-Za-z0-9]{4,12}$/.test(String(payload.pin))) {
      S.toast('重置码里的新密码格式不对，请让老师重新生成。', 'error');
      return;
    }
    const auth = await S.sha256Hex(`reset|${payload.studentId}|${payload.pin}|${payload.createdAt || ''}`);
    if (!S.authMatches(payload.auth, auth)) {
      S.toast('重置码校验失败，可能被改动过，请让老师重新生成。', 'error', 6500);
      return;
    }
    profile().pinHash = await S.sha256Hex(`${profile().id}|${payload.pin}`);
    sessionPin = payload.pin;
    save();
    rememberLogin(payload.pin);
    S.closeDialog($('#forgot-dialog'));
    $('#forgot-code').value = '';
    if (status) status.hidden = true;
    showApp();
    S.toast('密码已重设，并已记住。现在可以直接进入学习了。', 'ok', 6500);
  }

  function confirmReset() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (error) { /* ignore */ }
    clearRememberedLogin();
    data = null;
    sessionPin = '';
    S.closeDialog($('#reset-dialog'));
    showAuth();
    S.toast('已清空本机档案。');
  }

  /* ------------------------------- 体验卡 ------------------------------- */

  function openTrialDialog() {
    if (!profile()) return;
    const state = trialState();
    const status = $('#trial-status');
    if (status) {
      status.className = `trial-status${state.expired ? ' expired' : ''}`;
      status.innerHTML = state.trial
        ? `<b>${state.expired ? '体验已到期' : `体验中 · 还剩 ${state.daysLeft} 天`}</b>` +
          `<span>到期日：${S.escapeHtml(state.expiresAt)} · 学习记录不会删除</span>`
        : `<b>正式学生账户</b><span>不受体验期限制。</span>`;
    }
    const request = $('#trial-request-code');
    if (request) request.value = '';
    const extend = $('#trial-extend-code');
    if (extend) extend.value = '';
    S.openDialog($('#trial-dialog'));
  }

  async function buildTrialRequestCode() {
    const p = profile();
    if (!p || !sessionPin) { S.toast('先解锁档案。', 'error'); return; }
    if (p.accountType !== 'trial') { S.toast('正式学生账户不需要申请延长。', 'ok'); return; }
    const state = trialState(p);
    const auth = S.authCode(await S.sha256Hex(`${p.id}|${sessionPin}|trial-request|${state.expiresAt}`));
    const code = await S.packCode({
      v: 1,
      kind: 'trial-request',
      studentId: p.id,
      studentName: p.name,
      grade: p.grade || '',
      expiresAt: state.expiresAt,
      requestedAt: S.nowIso(),
      auth
    });
    $('#trial-request-code').value = code;
    S.toast('申请码已生成，复制发给老师。', 'ok');
  }

  async function applyTrialExtendCode() {
    const p = profile();
    if (!p || !sessionPin) { S.toast('先解锁档案。', 'error'); return; }
    const raw = $('#trial-extend-code').value.trim();
    if (!raw) { S.toast('先粘贴老师发回的延长码。', 'error'); return; }
    let payload;
    try {
      payload = await S.unpackCode(raw);
    } catch (error) {
      S.toast(error.message || '延长码无法识别。', 'error', 5000);
      return;
    }
    if (!payload || !['extend', 'upgrade'].includes(payload.kind) || payload.studentId !== p.id) {
      S.toast('这不是发给当前学号的延长码或转正码。', 'error', 6000);
      return;
    }
    if (payload.kind === 'upgrade') {
      const upgradeAuth = await S.sha256Hex(`${p.id}|${sessionPin}|upgrade`);
      if (!S.authMatches(payload.auth, upgradeAuth)) {
        S.toast('转正码和当前密码不匹配，请让老师重新生成。', 'error', 6000);
        return;
      }
      p.accountType = 'regular';
      p.trialExpiresAt = '';
      p.upgradedAt = S.nowIso();
      save();
      $('#trial-extend-code').value = '';
      renderAll();
      S.closeDialog($('#trial-dialog'));
      S.toast('转正成功！从现在起不再受体验期限制，学习记录全部保留。', 'ok', 6500);
      return;
    }
    const days = Math.max(1, Math.min(60, Number(payload.days) || 3));
    const auth = await S.sha256Hex(`${p.id}|${sessionPin}|extend|${days}`);
    if (!S.authMatches(payload.auth, auth)) {
      S.toast('延长码和当前密码不匹配，请让老师重新生成。', 'error', 6000);
      return;
    }
    const today = S.todayIso();
    const base = p.trialExpiresAt && p.trialExpiresAt > today ? p.trialExpiresAt : today;
    p.accountType = 'trial';
    p.trialDays = Math.max(Number(p.trialDays) || 0, days);
    p.trialExpiresAt = S.addDays(base, days);
    p.trialExtendedAt = S.nowIso();
    save();
    $('#trial-extend-code').value = '';
    renderAll();
    S.closeDialog($('#trial-dialog'));
    S.toast(`延长成功，体验期到 ${p.trialExpiresAt}。记录和连击都保留着。`, 'ok', 6000);
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
    const trialBtn = $('#trial-apply-btn');
    if (trialBtn) trialBtn.addEventListener('click', openTrialDialog);
    const trialBuild = $('#trial-build-request');
    if (trialBuild) trialBuild.addEventListener('click', buildTrialRequestCode);
    const trialCopy = $('#trial-copy-request');
    if (trialCopy) trialCopy.addEventListener('click', async () => {
      const code = $('#trial-request-code').value.trim();
      if (!code) { S.toast('先生成申请码。', 'error'); return; }
      try { await S.copyText(code); S.toast('申请码已复制。', 'ok'); } catch (error) { S.toast('复制失败，请手动复制。', 'error'); }
    });
    const trialApply = $('#trial-apply-code');
    if (trialApply) trialApply.addEventListener('click', applyTrialExtendCode);
    $('#pet-feed-btn').addEventListener('click', feedPet);
    const poolAllocate = $('#pet-pool-allocate');
    if (poolAllocate) poolAllocate.addEventListener('click', allocatePetPool);
    const poolAmount = $('#pet-pool-amount');
    if (poolAmount) {
      poolAmount.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') { event.preventDefault(); allocatePetPool(); }
      });
    }
    const petCard = $('#pet-card');
    if (petCard) {
      petCard.addEventListener('click', (event) => {
        const switchBtn = event.target.closest('[data-pet-switch]');
        if (switchBtn) {
          if (switchBtn.dataset.fusionKey) activateFusion(switchBtn.dataset.fusionKey);
          else switchPet(switchBtn.dataset.petSwitch);
          return;
        }
        const fuseBtn = event.target.closest('[data-fuse]');
        if (fuseBtn) { fusePets(); return; }
        if (event.target.closest('#pet-wheel-btn')) { openWheelDialog(); return; }
        if (event.target.closest('#pet-motion-btn')) { setPetMotion(!petMotionOn()); return; }
        if (event.target.closest('#pet-scene')) petReact(event);
      });
      petCard.addEventListener('keydown', (event) => {
        if (!event.target.closest('#pet-scene')) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          petReact(event);
        }
      });
    }
    const wheelSpin = $('#wheel-spin-btn');
    if (wheelSpin) wheelSpin.addEventListener('click', spinWheel);
    $('#import-task-btn').addEventListener('click', () => {
      $('#import-code').value = '';
      S.openDialog($('#import-dialog'));
      setTimeout(() => $('#import-code').focus(), 100);
    });
    $('#import-btn').addEventListener('click', importTaskCode);
    const importScan = $('#import-scan');
    if (importScan) {
      importScan.addEventListener('click', () => {
        if (!window.ShunshiQR) { S.toast('扫码组件没有加载成功，请直接粘贴任务码。', 'error'); return; }
        window.ShunshiQR.scan({
          onCode: (code) => {
            $('#import-code').value = code;
            S.toast('二维码已识别，正在导入…', 'ok');
            setTimeout(importTaskCode, 220);
          }
        });
      });
    }
    $('#runner-close').addEventListener('click', () => {
      const task = activeTaskId ? findTask(activeTaskId) : null;
      if (task) pauseBehaviorSession(task);
      stopTimer();
      activeTaskId = null;
      S.closeDialog($('#task-dialog'));
    });
    $('#submit-task').addEventListener('click', submitTask);
    const grammarCamp = $('#grammar-camp');
    if (grammarCamp) {
      grammarCamp.addEventListener('click', (event) => {
        const filterBtn = event.target.closest('[data-grammar-filter]');
        if (filterBtn) {
          grammarExtraState.filter = filterBtn.dataset.grammarFilter;
          grammarCamp.querySelectorAll('[data-grammar-filter]').forEach((btn) => {
            btn.classList.toggle('is-on', btn === filterBtn);
          });
          grammarCamp.querySelectorAll('.grammar-topic').forEach((topic) => {
            topic.hidden = grammarExtraState.filter !== 'all' && topic.dataset.level !== grammarExtraState.filter;
          });
          return;
        }
        const choose = event.target.closest('[data-grammar-choose]');
        if (choose) {
          const drill = choose.closest('.grammar-drill');
          if (!drill || drill.dataset.answered === '1') return;
          const answer = Number(drill.dataset.answer) || 0;
          const choice = Number(choose.dataset.grammarChoose) || 0;
          grammarExtraState.drills.set(drill.dataset.drillKey, { choice, correct: choice === answer });
          drill.dataset.answered = '1';
          drill.querySelectorAll('[data-grammar-choose]').forEach((btn) => {
            const index = Number(btn.dataset.grammarChoose) || 0;
            btn.classList.toggle('is-correct', index === answer);
            btn.classList.toggle('is-wrong', index === choice && choice !== answer);
          });
          const answerBox = drill.querySelector('.grammar-answer');
          if (answerBox) answerBox.hidden = false;
          const status = drill.querySelector('summary span');
          if (status) status.textContent = choice === answer ? '已答对' : '已作答';
          return;
        }
        const retry = event.target.closest('[data-grammar-retry]');
        if (retry) {
          const drill = retry.closest('.grammar-drill');
          if (!drill) return;
          grammarExtraState.drills.delete(drill.dataset.drillKey);
          delete drill.dataset.answered;
          drill.querySelectorAll('[data-grammar-choose]').forEach((btn) => {
            btn.classList.remove('is-correct', 'is-wrong');
          });
          const answerBox = drill.querySelector('.grammar-answer');
          if (answerBox) answerBox.hidden = true;
          const status = drill.querySelector('summary span');
          if (status) status.textContent = '点开做题';
          return;
        }
        if (event.target.closest('[data-grammar-scroll]')) {
          const tasksCard = $('#tasks');
          if (tasksCard) tasksCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
        const button = event.target.closest('[data-grammar-open]');
        if (!button) return;
        const task = findTask(button.dataset.grammarOpen);
        if (!task) return;
        if (button.dataset.grammarLocked === '1' || taskLocked(task)) unlockPlanDay(task);
        openTask(task.id);
      });
      grammarCamp.addEventListener('toggle', (event) => {
        const target = event.target;
        if (!target || !target.classList) return;
        if (target.classList.contains('grammar-extra')) {
          grammarExtraState.open = target.open;
        } else if (target.classList.contains('grammar-topic')) {
          if (target.open) grammarExtraState.topics.add(target.dataset.topic);
          else grammarExtraState.topics.delete(target.dataset.topic);
        }
      }, true);
    }
    const runnerBody = $('#runner-body');
    if (runnerBody) {
      runnerBody.addEventListener('click', (event) => {
        const button = event.target.closest('[data-grammar-reveal]');
        if (!button) return;
        const sentence = runnerBody.querySelector('[data-grammar-tokens]');
        if (!sentence) return;
        const hidden = sentence.classList.toggle('hide-roles');
        button.textContent = hidden ? '显示成分标签' : '遮住标签，自己先猜';
      });
    }
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
    $('#copy-report-link').addEventListener('click', async () => {
      const code = $('#report-code').value.trim();
      if (!code) { S.toast('汇报码还没有生成。', 'error'); return; }
      try {
        const link = S.codeLink('teacher.html', code);
        await S.copyText(`老师，这是我今天的学习汇报，点开就能导入：\n${link}`);
        S.toast('汇报链接已复制，发给老师即可。', 'ok', 4200);
      } catch (error) {
        S.toast('复制失败，请手动全选复制。', 'error');
      }
    });
    $('#download-report').addEventListener('click', () => {
      S.downloadText(`${profile().name || '学生'}-学习汇报.txt`, $('#report-code').value);
    });
    $('#report-dialog').addEventListener('close', () => { $('#report-code').value = ''; });
    const scopeWrap = $('#report-scope');
    if (scopeWrap) {
      scopeWrap.addEventListener('change', () => { refreshReportCode(); });
    }
    const daySelect = $('#report-day');
    if (daySelect) daySelect.addEventListener('change', () => { refreshReportCode(); });
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
    $('#forgot-link').addEventListener('click', () => {
      $('#forgot-code').value = '';
      S.openDialog($('#forgot-dialog'));
      setTimeout(() => $('#forgot-code').focus(), 120);
    });
    const forgotConfirm = $('#forgot-confirm');
    if (forgotConfirm) forgotConfirm.addEventListener('click', applyPasswordReset);
    $('#reset-link').addEventListener('click', () => S.openDialog($('#reset-dialog')));
    $('#reset-confirm').addEventListener('click', confirmReset);
    window.addEventListener('blur', () => {
      const dialog = $('#task-dialog');
      const task = activeTaskId ? findTask(activeTaskId) : null;
      if (!dialog || !dialog.open || !task || task.status === 'done') return;
      const behavior = ensureBehavior(task);
      behavior.focusLost += 1;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 500);
    });
    $('#task-dialog').addEventListener('close', () => {
      const task = activeTaskId ? findTask(activeTaskId) : null;
      if (task) { pauseBehaviorSession(task); save(); }
      stopTimer();
      stopPrestudyTimer();
      activeTaskId = null;
    });
    const reportDialog = $('#report-dialog');
    if (reportDialog) {
      reportDialog.addEventListener('close', () => {
        if (reportQrMount && reportQrMount.stop) reportQrMount.stop();
        reportQrMount = null;
      });
    }
    S.bindDialogClose(document);
  }

  function init() {
    takeLinkCode();
    bindEvents();
    showAuth();
  }

  init();
})();
