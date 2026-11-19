/* ==========================================================================
   顺势 · 教师端
   本机教师控制台：学生名册、任务码、汇报码、学情总览与认知画像。
   ========================================================================== */
(function () {
  'use strict';

  const S = window.Shunshi;
  const IC = window.ShunshiInsightCore;
  const G = window.ShunshiGrammar;
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
  let pendingReportLink = '';
  let reportLinkStarted = false;
  let editingInsightId = null;
  let glossaryPromise = null;
  let wordMaterials = [];
  let wordDraft = [];
  let wordSourceMode = 'paste';
  let wordAssignStudentId = null;
  let wordDetailId = null;
  let bookWords = [];
  let bookSlots = [];
  let bookPreviewStudentId = '';
  let bookStudentsCache = null;
  let planPapers = [];
  let planPaperIds = new Set();
  let planStudentIds = null;
  let planRequestStudentId = null;
  let trialRequestPayload = null;
  let grammarStudentIds = null;

  /* ------------------------------- 存储 ------------------------------- */

  function loadData() {
    const raw = S.getJSON(STORAGE_KEY, null);
    if (!raw || !raw.pinHash) return null;
    raw.v = 1;
    raw.teacherName = raw.teacherName || '阮老师';
    raw.students = Array.isArray(raw.students) ? raw.students.map(normalizeStudent).filter((s) => s.id) : [];
    raw.assignments = Array.isArray(raw.assignments) ? raw.assignments.filter((a) => a && a.id) : [];
    raw.plans = Array.isArray(raw.plans) ? raw.plans.filter((plan) => plan && plan.id && plan.studentId) : [];
    raw.insights = Array.isArray(raw.insights) ? normalizeInsights(raw.insights) : defaultInsights();
    return raw;
  }

  function normalizeInsights(list) {
    return IC ? IC.normalizePosts(list) : [];
  }

  function defaultInsights() {
    return IC ? IC.publishedPosts() : [];
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
      aiAnalysis: String(raw.aiAnalysis || ''),
      accountType: raw.accountType === 'trial' ? 'trial' : 'regular',
      trialDays: Math.max(1, Math.min(30, Number(raw.trialDays) || 3)),
      planLevel: Math.max(1, Math.min(10, Number(raw.planLevel) || 5)),
      wordLevel: Math.max(1, Math.min(10, Number(raw.wordLevel) || Number(raw.planLevel) || 5)),
      wordLevelHistory: Array.isArray(raw.wordLevelHistory) ? raw.wordLevelHistory.slice(0, 24) : [],
      levelHistory: Array.isArray(raw.levelHistory) ? raw.levelHistory.slice(0, 30) : [],
      trialRequestAt: String(raw.trialRequestAt || ''),
      dayLog: raw.dayLog && typeof raw.dayLog === 'object' ? raw.dayLog : {}
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
      assignments: [],
      plans: [],
      insights: defaultInsights()
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
    setTimeout(maybeImportReportLink, 500);
  }

  function takeReportLink() {
    const code = S.readCodeFromLocation();
    if (!code) return;
    pendingReportLink = code;
    try { history.replaceState(null, '', location.pathname + location.search); } catch (error) { /* ignore */ }
  }

  function maybeImportReportLink() {
    if (reportLinkStarted || !pendingReportLink || !data || !sessionPin) return;
    reportLinkStarted = true;
    const code = pendingReportLink;
    pendingReportLink = '';
    switchTab('reports');
    const box = $('#import-report-code');
    if (!box) return;
    box.value = code;
    setTimeout(() => { importReportCode(); }, 320);
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

  /* ------------------------------- 单词库与资料库 ------------------------------- */

  function loadGlossary() {
    if (!glossaryPromise) {
      glossaryPromise = fetch('vendor/glossary.json', { cache: 'force-cache' })
        .then((response) => (response.ok ? response.json() : {}))
        .catch((error) => {
          console.warn('释义库读取失败', error);
          return {};
        });
    }
    return glossaryPromise;
  }

  let glossaryRankMap = null;

  /* 释义库本身按常用度排序，用词条序号当“高频 / 中频 / 低频”的近似依据。
     这不是考试大纲词频，但足以把一本词书从常用词到难词排开。 */
  function ensureGlossaryRanks(glossary) {
    if (glossaryRankMap) return glossaryRankMap;
    glossaryRankMap = new Map();
    Object.keys(glossary || {}).forEach((word, index) => glossaryRankMap.set(word, index));
    return glossaryRankMap;
  }

  function wordFrequencyBand(rank) {
    if (rank < 2200) return 'high';
    if (rank < 9000) return 'mid';
    return 'low';
  }

  async function loadWordMaterials() {
    try {
      const db = await openLibrary();
      const list = await new Promise((resolve, reject) => {
        const transaction = db.transaction('materials', 'readonly');
        const request = transaction.objectStore('materials').getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error || new Error('读取资料库失败。'));
      });
      wordMaterials = list
        .filter((material) => material && (material.text || material.body))
        .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
    } catch (error) {
      console.warn(error);
      wordMaterials = [];
    }
    renderWordMaterials();
    return wordMaterials;
  }

  const WORD_STOP = new Set(('a an the and or but if because so that this these those i you he she it we they me him her us them my your his its our their ' +
    'is are was were be been being am do does did have has had will would can could shall should may might must not no yes of to in on at by for with from as than then there here ' +
    'what which who whom whose when where why how all any both each few more most other some such only own same too very just about into over after before between during through ' +
    'up down out off again once also however therefore while although though until unless since whether either neither nor per via etc').split(/\s+/));

  /* 原创语境例句小库：不依赖网络或 AI，常见词也能直接出“语境推词”题。
     只收录可以放心给中学生看的句子；没有收录的词可以在预览里手动补，或点“AI 补例句”。 */
  const WORD_EXAMPLES = {
    benefit: { ex: 'One benefit of reading every day is a larger vocabulary.', exZh: '每天阅读的一个好处是词汇量更大。' },
    confident: { ex: 'She felt confident before the speech because she had practiced.', exZh: '因为练习过，她在演讲前感到很自信。' },
    environment: { ex: 'We should protect the environment by using less plastic.', exZh: '我们应该少用塑料来保护环境。' },
    opportunity: { ex: 'The exchange program is a good opportunity to practice English.', exZh: '这个交换项目是练习英语的好机会。' },
    experience: { ex: 'Traveling alone was a new experience for him.', exZh: '独自旅行对他来说是一次新经历。' },
    suggest: { ex: 'I suggest that we start the meeting at eight.', exZh: '我建议我们八点开始开会。' },
    decide: { ex: 'They decided to walk home instead of taking the bus.', exZh: '他们决定不坐公交，走回家。' },
    develop: { ex: 'Children develop language skills through daily conversation.', exZh: '孩子通过日常对话发展语言能力。' },
    provide: { ex: 'The school provides free lunch for every student.', exZh: '学校为每位学生提供免费午餐。' },
    reduce: { ex: 'Turning off the lights can reduce energy use.', exZh: '关灯可以减少能源消耗。' },
    improve: { ex: 'Reading aloud every day will improve your pronunciation.', exZh: '每天大声朗读会改善你的发音。' },
    protect: { ex: 'A helmet can protect your head when you ride a bike.', exZh: '骑车时头盔能保护你的头。' },
    express: { ex: 'She used a picture to express her feelings.', exZh: '她用一幅画表达自己的感受。' },
    support: { ex: 'My parents support my decision to study art.', exZh: '父母支持我学艺术的决定。' },
    avoid: { ex: 'Try to avoid checking your phone during dinner.', exZh: '吃饭时尽量避免看手机。' },
    admit: { ex: 'He admitted that he had forgotten the homework.', exZh: '他承认自己忘了作业。' },
    achieve: { ex: 'She worked hard to achieve her goal.', exZh: '她努力实现自己的目标。' },
    challenge: { ex: 'Learning to swim was a big challenge for him.', exZh: '学游泳对他来说是个大挑战。' },
    communicate: { ex: 'Good listeners communicate more clearly.', exZh: '善于倾听的人表达得更清楚。' },
    consider: { ex: 'Please consider other people before you speak.', exZh: '开口前请考虑别人的感受。' },
    continue: { ex: 'The rain continued all through the night.', exZh: '雨下了一整夜。' },
    contribute: { ex: 'Everyone can contribute an idea to the project.', exZh: '每个人都能为这个项目贡献一个想法。' },
    create: { ex: 'The students created a poster about saving water.', exZh: '学生们制作了一张节约用水的海报。' },
    discover: { ex: 'Scientists discovered a new kind of fish in the river.', exZh: '科学家在河里发现了一种新鱼。' },
    encourage: { ex: 'Her teacher encouraged her to try again.', exZh: '老师鼓励她再试一次。' },
    explain: { ex: 'Can you explain why the sky is blue?', exZh: '你能解释天空为什么是蓝色的吗？' },
    explore: { ex: 'We explored the old streets on foot.', exZh: '我们步行探索了老街。' },
    imagine: { ex: 'Imagine a city with no cars or noise.', exZh: '想象一座没有汽车和噪音的城市。' },
    introduce: { ex: 'Let me introduce my new classmate to you.', exZh: '让我把我的新同学介绍给你。' },
    manage: { ex: 'She manages her time well between study and sport.', exZh: '她在学习和运动之间安排时间很得当。' },
    organize: { ex: 'The class organized a book sale for charity.', exZh: '班级为慈善组织了一次旧书义卖。' },
    participate: { ex: 'All students are welcome to participate in the debate.', exZh: '欢迎所有学生参加辩论。' },
    prefer: { ex: 'I prefer tea to coffee in the morning.', exZh: '早上我更喜欢茶而不是咖啡。' },
    prepare: { ex: 'We prepared a short play for the school festival.', exZh: '我们为校庆准备了一个短剧。' },
    prevent: { ex: 'Washing your hands can prevent many illnesses.', exZh: '洗手能预防许多疾病。' },
    realize: { ex: 'I realized that I had left my keys at home.', exZh: '我意识到把钥匙忘在家里了。' },
    recognize: { ex: 'I did not recognize him after so many years.', exZh: '这么多年后我没认出他。' },
    recommend: { ex: 'Can you recommend a good book for beginners?', exZh: '你能推荐一本适合初学者的好书吗？' },
    respect: { ex: 'We should respect different opinions in a discussion.', exZh: '讨论中我们应该尊重不同意见。' },
    succeed: { ex: 'You will succeed if you keep practicing.', exZh: '只要坚持练习，你就会成功。' },
    survive: { ex: 'These plants can survive with very little water.', exZh: '这些植物在极少的水下也能存活。' },
    understand: { ex: 'I understand the rule now after your example.', exZh: '听了你的例子，我现在明白这条规则了。' },
    volunteer: { ex: 'She volunteers at the animal shelter on Sundays.', exZh: '她周日在动物收容所做志愿者。' },
    affect: { ex: 'Lack of sleep can affect your memory.', exZh: '睡眠不足会影响记忆力。' },
    ancient: { ex: 'The museum shows tools from ancient China.', exZh: '博物馆展出了中国古代的工具。' },
    anxious: { ex: 'He felt anxious before the exam results came out.', exZh: '考试成绩出来前他感到焦虑。' },
    appropriate: { ex: 'Wear appropriate clothes for the job interview.', exZh: '参加工作面试要穿合适的衣服。' },
    available: { ex: 'The library is available to every student after school.', exZh: '放学后图书馆对每位学生开放。' },
    aware: { ex: 'Are you aware of the rules for the science lab?', exZh: '你知道科学实验室的规则吗？' },
    balance: { ex: 'It is important to balance study and rest.', exZh: '平衡学习和休息很重要。' },
    behavior: { ex: 'His behavior in class surprised everyone.', exZh: '他在课堂上的表现让所有人吃惊。' },
    capable: { ex: 'She is capable of finishing the task alone.', exZh: '她有能力独自完成这项任务。' },
    careful: { ex: 'Be careful when you cross the busy road.', exZh: '过繁忙的马路时要小心。' },
    common: { ex: 'This is a common mistake among new learners.', exZh: '这是新学习者常犯的错误。' },
    compare: { ex: 'Compare the two pictures and find three differences.', exZh: '比较两幅图，找出三处不同。' },
    complete: { ex: 'Please complete the form before Friday.', exZh: '请在周五前填完表格。' },
    concentrate: { ex: 'It is hard to concentrate in a noisy room.', exZh: '在吵闹的房间里很难集中注意力。' },
    concern: { ex: 'Air pollution is a serious concern in many cities.', exZh: '空气污染在许多城市是严重的问题。' },
    connect: { ex: 'This road connects the village to the town.', exZh: '这条路把村庄和城镇连接起来。' },
    contain: { ex: 'This box contains old letters and photos.', exZh: '这个盒子装着旧信件和照片。' },
    culture: { ex: 'Food is an important part of every culture.', exZh: '食物是每种文化的重要部分。' },
    curious: { ex: 'The curious child asked question after question.', exZh: '好奇的孩子问了一个又一个问题。' },
    damage: { ex: 'The storm caused damage to several houses.', exZh: '暴风雨损坏了几座房子。' },
    dangerous: { ex: 'It is dangerous to swim in this river alone.', exZh: '独自在这条河里游泳很危险。' },
    describe: { ex: 'Can you describe the man you saw?', exZh: '你能描述你看到的那个人吗？' },
    difference: { ex: 'There is a big difference between the two plans.', exZh: '这两个计划之间有很大差别。' },
    difficult: { ex: 'The last question was too difficult for most students.', exZh: '最后一题对大多数学生来说太难了。' },
    direct: { ex: 'The teacher gave us direct instructions for the experiment.', exZh: '老师给了我们明确的实验指示。' },
    discuss: { ex: 'We discussed the story in small groups.', exZh: '我们分小组讨论了这篇故事。' },
    educate: { ex: 'The museum educates visitors about local history.', exZh: '博物馆向游客介绍当地历史。' },
    effect: { ex: 'The medicine had a quick effect on his cough.', exZh: '这种药对他的咳嗽很快见效。' },
    efficient: { ex: 'A clear plan makes the work more efficient.', exZh: '清晰的计划让工作更高效。' },
    effort: { ex: 'She made a great effort to speak clearly.', exZh: '她非常努力地把话说清楚。' },
    energy: { ex: 'Solar panels turn sunlight into energy.', exZh: '太阳能板把阳光转化为能量。' },
    entire: { ex: 'The entire class joined the clean-up activity.', exZh: '全班都参加了清扫活动。' },
    equal: { ex: 'Everyone should have an equal chance to speak.', exZh: '每个人都应该有平等的发言机会。' },
    escape: { ex: 'The bird escaped from its cage this morning.', exZh: '鸟今天早上从笼子里逃走了。' },
    especially: { ex: 'I like fruit, especially oranges and grapes.', exZh: '我喜欢水果，尤其是橙子和葡萄。' },
    essential: { ex: 'Clean water is essential for good health.', exZh: '干净的水对健康至关重要。' },
    event: { ex: 'The school sports event starts at nine.', exZh: '学校运动会九点开始。' },
    examine: { ex: 'The doctor examined his throat carefully.', exZh: '医生仔细检查了他的喉咙。' },
    excellent: { ex: 'She did an excellent job on the group project.', exZh: '她在小组项目中做得非常出色。' },
    exchange: { ex: 'The two classes exchange letters every month.', exZh: '两个班每月交换信件。' },
    expect: { ex: 'We expect the train to arrive at six.', exZh: '我们预计火车六点到。' },
    familiar: { ex: 'The song sounds familiar, but I forget its name.', exZh: '这首歌听起来很熟悉，但我忘了名字。' },
    famous: { ex: 'The town is famous for its old bridge.', exZh: '这个镇以古桥闻名。' },
    fear: { ex: 'She has a fear of speaking in front of large groups.', exZh: '她害怕在很多人面前讲话。' },
    feature: { ex: 'The best feature of this phone is its camera.', exZh: '这部手机最好的特点是它的相机。' },
    focus: { ex: 'Please focus on the main idea of the passage.', exZh: '请把注意力集中在文章的主旨上。' },
    foreign: { ex: 'Learning a foreign language takes patience.', exZh: '学习一门外语需要耐心。' },
    forgive: { ex: 'He apologized, and she chose to forgive him.', exZh: '他道了歉，她选择原谅他。' },
    fortunate: { ex: 'We were fortunate to have such kind neighbors.', exZh: '我们很幸运有这样善良的邻居。' },
    gather: { ex: 'The family gathered around the table for dinner.', exZh: '一家人围坐在桌边吃晚饭。' },
    general: { ex: 'In general, the students did well on the test.', exZh: '总的来说，学生们考得不错。' },
    generous: { ex: 'It was generous of her to share her notes.', exZh: '她愿意分享笔记，真是慷慨。' },
    gentle: { ex: 'The nurse spoke in a gentle voice to the child.', exZh: '护士用温柔的声音对孩子说话。' },
    goal: { ex: 'My goal is to read one English story each week.', exZh: '我的目标是每周读一篇英语故事。' },
    government: { ex: 'The government is building a new public library.', exZh: '政府正在建一座新的公共图书馆。' },
    grateful: { ex: 'I am grateful for your help with my homework.', exZh: '我很感激你帮我做作业。' },
    habit: { ex: 'Making a plan is a good study habit.', exZh: '做计划是一个好的学习习惯。' },
    handle: { ex: 'She knows how to handle difficult questions calmly.', exZh: '她知道如何冷静处理难题。' },
    harm: { ex: 'Too much screen time can harm your eyes.', exZh: '看屏幕太久会伤害眼睛。' },
    health: { ex: 'Regular exercise is good for your health.', exZh: '规律运动有益健康。' },
    helpful: { ex: 'Your advice was very helpful to me.', exZh: '你的建议对我很有帮助。' },
    honest: { ex: 'An honest answer is better than a perfect excuse.', exZh: '诚实的回答胜过完美的借口。' },
    hope: { ex: 'I hope we can visit the science museum together.', exZh: '我希望我们能一起去科学博物馆。' },
    ignore: { ex: 'Do not ignore the warning signs on the road.', exZh: '不要忽视路上的警告标志。' },
    immediate: { ex: 'The broken window needs immediate repair.', exZh: '破窗户需要立即修理。' },
    include: { ex: 'The price includes breakfast and a city map.', exZh: '价格包括早餐和一张城市地图。' },
    increase: { ex: 'The number of readers increased last year.', exZh: '去年读者数量增加了。' },
    independent: { ex: 'Living alone taught him to be independent.', exZh: '独自生活教会他独立。' },
    influence: { ex: 'Friends can have a strong influence on our choices.', exZh: '朋友会对我们的选择产生很大影响。' },
    insist: { ex: 'She insisted on paying for the meal.', exZh: '她坚持要付这顿饭钱。' },
    inspire: { ex: 'His story inspired many young runners.', exZh: '他的故事激励了许多年轻跑者。' },
    intelligent: { ex: 'Dolphins are intelligent animals that learn quickly.', exZh: '海豚是学得很快的聪明动物。' },
    interest: { ex: 'She has a strong interest in space science.', exZh: '她对太空科学有浓厚的兴趣。' },
    invent: { ex: 'Who invented the first telephone?', exZh: '谁发明了第一部电话？' },
    invite: { ex: 'I invited my classmates to my birthday party.', exZh: '我邀请了同学参加我的生日聚会。' },
    involve: { ex: 'The project involves collecting and sorting old books.', exZh: '这个项目包括收集和整理旧书。' },
    journey: { ex: 'The journey to the mountain village took five hours.', exZh: '去山村的旅程花了五个小时。' },
    judge: { ex: 'Do not judge a person by their clothes.', exZh: '不要以衣着评判一个人。' },
    knowledge: { ex: 'Reading is one of the best ways to gain knowledge.', exZh: '阅读是获取知识的最好方式之一。' },
    language: { ex: 'Music is a language that everyone can enjoy.', exZh: '音乐是一种人人都能欣赏的语言。' },
    likely: { ex: 'It is likely to rain this afternoon.', exZh: '今天下午可能会下雨。' },
    limit: { ex: 'The teacher limited the speech to three minutes.', exZh: '老师把发言限制在三分钟。' },
    lonely: { ex: 'He felt lonely during his first week in the new city.', exZh: '刚到新城市的第一周他感到孤独。' },
    maintain: { ex: 'It is important to maintain a clean classroom.', exZh: '保持教室整洁很重要。' },
    major: { ex: 'Climate change is a major problem for the world.', exZh: '气候变化是世界面临的重大问题。' },
    matter: { ex: 'It does not matter if you make a mistake; try again.', exZh: '犯错没关系，再试一次。' },
    measure: { ex: 'The nurse measured the child’s height.', exZh: '护士量了孩子的身高。' },
    memory: { ex: 'That summer trip is a happy memory for me.', exZh: '那次夏日旅行对我来说是快乐的回忆。' },
    mention: { ex: 'She mentioned a good book during the meeting.', exZh: '她在会上提到了一本好书。' },
    method: { ex: 'This method helps students remember new words.', exZh: '这个方法帮助学生记住新单词。' },
    mistake: { ex: 'Everyone makes a mistake when learning something new.', exZh: '每个人学新东西时都会犯错。' },
    modern: { ex: 'The modern library has computers and quiet study rooms.', exZh: '这座现代图书馆有电脑和安静的自习室。' },
    necessary: { ex: 'It is necessary to bring your student card.', exZh: '有必要带上学生证。' },
    nervous: { ex: 'She was nervous before her first piano performance.', exZh: '第一次钢琴表演前她很紧张。' },
    notice: { ex: 'I noticed a small change in his handwriting.', exZh: '我注意到他的字迹有点变化。' },
    offer: { ex: 'He offered to carry the heavy box upstairs.', exZh: '他主动提出把重箱子搬上楼。' },
    ordinary: { ex: 'It looked like an ordinary day until the rain stopped.', exZh: '直到雨停，那看起来都是普通的一天。' },
    patient: { ex: 'The doctor was patient with every question.', exZh: '医生耐心回答每个问题。' },
    perform: { ex: 'The students will perform a play on Friday.', exZh: '学生们周五将表演一个短剧。' },
    personal: { ex: 'This notebook is for your personal notes.', exZh: '这个本子用来记你的个人笔记。' },
    persuade: { ex: 'She persuaded her brother to join the reading club.', exZh: '她说服弟弟加入了读书会。' },
    pleasant: { ex: 'We had a pleasant walk along the river.', exZh: '我们沿着河边愉快地散步。' },
    polite: { ex: 'It is polite to say thank you when someone helps you.', exZh: '别人帮你时说谢谢是有礼貌的。' },
    popular: { ex: 'This song is popular among middle school students.', exZh: '这首歌在中学生中很流行。' },
    possible: { ex: 'It is possible to finish the work before lunch.', exZh: '午饭前完成工作是有可能的。' },
    practice: { ex: 'Daily practice is the key to speaking English well.', exZh: '每天练习是说好英语的关键。' },
    pressure: { ex: 'Many students feel pressure before important exams.', exZh: '许多学生在重要考试前感到压力。' },
    private: { ex: 'Please keep this letter private.', exZh: '请对这封信保密。' },
    probably: { ex: 'She will probably arrive before noon.', exZh: '她可能会在中午前到。' },
    problem: { ex: 'The first step is to understand the problem clearly.', exZh: '第一步是清楚地理解问题。' },
    produce: { ex: 'This factory produces paper from recycled materials.', exZh: '这家工厂用回收材料生产纸张。' },
    progress: { ex: 'You have made great progress in writing.', exZh: '你在写作上取得了很大进步。' },
    promise: { ex: 'He promised to return the book on Monday.', exZh: '他答应周一还书。' },
    proud: { ex: 'Her parents were proud of her hard work.', exZh: '父母为她的努力感到骄傲。' },
    public: { ex: 'The public park is open from six in the morning.', exZh: '公园早上六点向公众开放。' },
    purpose: { ex: 'The purpose of the survey is to learn student needs.', exZh: '这项调查的目的是了解学生需求。' },
    quality: { ex: 'The quality of the sound was much better than before.', exZh: '音质比以前好多了。' },
    raise: { ex: 'Please raise your hand if you have a question.', exZh: '有问题请举手。' },
    reach: { ex: 'We reached the top of the hill before sunset.', exZh: '我们在日落前到达山顶。' },
    receive: { ex: 'I received a letter from my old friend.', exZh: '我收到了老朋友的一封信。' },
    recent: { ex: 'A recent study shows that sleep helps memory.', exZh: '最近一项研究表明睡眠有助于记忆。' },
    refuse: { ex: 'He refused to give up after the first failure.', exZh: '第一次失败后他拒绝放弃。' },
    regular: { ex: 'Regular exercise keeps both body and mind healthy.', exZh: '规律运动让身心都健康。' },
    relax: { ex: 'Listening to music helps me relax after school.', exZh: '放学后听音乐帮我放松。' },
    remain: { ex: 'Please remain quiet while the test is going on.', exZh: '考试期间请保持安静。' },
    remember: { ex: 'I remember meeting her at the school gate.', exZh: '我记得在校门口见过她。' },
    remind: { ex: 'This note will remind me to call my grandmother.', exZh: '这张便条会提醒我给奶奶打电话。' },
    remove: { ex: 'Please remove your shoes before entering the room.', exZh: '进房间前请脱鞋。' },
    repair: { ex: 'They repaired the broken chair in the classroom.', exZh: '他们修好了教室里坏掉的椅子。' },
    repeat: { ex: 'Could you repeat the last sentence more slowly?', exZh: '你能把最后一句再慢一点说一遍吗？' },
    replace: { ex: 'We need to replace the old light bulbs.', exZh: '我们需要更换旧灯泡。' },
    reply: { ex: 'She replied to my message within a minute.', exZh: '她一分钟内回复了我的消息。' },
    report: { ex: 'The group will report its results next week.', exZh: '小组将在下周汇报结果。' },
    require: { ex: 'This job requires patience and careful work.', exZh: '这份工作需要耐心和细致。' },
    rescue: { ex: 'Firefighters rescued the cat from the tall tree.', exZh: '消防员从高树上救下了猫。' },
    responsible: { ex: 'Each student is responsible for cleaning one desk.', exZh: '每位学生负责清洁一张桌子。' },
    result: { ex: 'The result of the experiment surprised the class.', exZh: '实验结果让全班惊讶。' },
    return: { ex: 'Please return the library books by Friday.', exZh: '请在周五前归还图书馆的书。' },
    review: { ex: 'A quick review before bed helps you remember.', exZh: '睡前快速复习有助于记忆。' },
    reward: { ex: 'The best reward for hard work is progress.', exZh: '努力最好的回报是进步。' },
    risk: { ex: 'There is a risk of slipping on the wet floor.', exZh: '湿地板有滑倒的风险。' },
    safe: { ex: 'Keep your password safe and do not share it.', exZh: '保管好你的密码，不要分享。' },
    satisfy: { ex: 'The answer did not satisfy the curious student.', exZh: '这个答案没有满足好奇的学生。' },
    search: { ex: 'They searched the room for the missing key.', exZh: '他们在房间里找丢失的钥匙。' },
    secret: { ex: 'She kept the secret for almost a year.', exZh: '她保守这个秘密将近一年。' },
    select: { ex: 'Please select three books for the reading list.', exZh: '请为阅读清单挑选三本书。' },
    sense: { ex: 'He has a good sense of direction in new places.', exZh: '他在新地方方向感很好。' },
    separate: { ex: 'Keep the wet clothes separate from the dry ones.', exZh: '把湿衣服和干衣服分开放。' },
    serious: { ex: 'The teacher looked serious when she read the report.', exZh: '老师看报告时表情严肃。' },
    share: { ex: 'We shared our lunch with the new student.', exZh: '我们和新同学分享午餐。' },
    similar: { ex: 'The two paintings look similar at first glance.', exZh: '这两幅画乍看很相似。' },
    simple: { ex: 'The instructions are simple enough for beginners.', exZh: '这些说明对初学者来说足够简单。' },
    skill: { ex: 'Note-taking is a skill that improves with practice.', exZh: '记笔记是一项通过练习提高的技能。' },
    solve: { ex: 'She solved the math problem in two minutes.', exZh: '她两分钟解出了这道数学题。' },
    special: { ex: 'Today is a special day for our class.', exZh: '今天对我们班来说是特别的一天。' },
    spread: { ex: 'The news spread quickly through the school.', exZh: '消息很快传遍全校。' },
    strange: { ex: 'He heard a strange sound outside the window.', exZh: '他听到窗外有奇怪的声音。' },
    strict: { ex: 'Our coach is strict about being on time.', exZh: '教练对守时要求很严格。' },
    strong: { ex: 'Strong winds blew the leaves across the road.', exZh: '大风吹着树叶穿过马路。' },
    suffer: { ex: 'Many farmers suffered from the long drought.', exZh: '许多农民因长期干旱而受苦。' },
    suppose: { ex: 'I suppose the meeting will end around four.', exZh: '我想会议大约四点结束。' },
    surprise: { ex: 'The party was a wonderful surprise for her.', exZh: '这个聚会对她来说是个美妙的惊喜。' },
    suspect: { ex: 'The detective suspected that the window was opened at night.', exZh: '侦探怀疑窗户是夜里被打开的。' },
    terrible: { ex: 'The traffic was terrible this morning.', exZh: '今天早上交通糟透了。' },
    threat: { ex: 'Plastic waste is a threat to sea animals.', exZh: '塑料垃圾对海洋动物是一种威胁。' },
    tolerate: { ex: 'The teacher will not tolerate cheating in the exam.', exZh: '老师不会容忍考试作弊。' },
    tough: { ex: 'It was a tough decision, but she chose to try.', exZh: '这是个艰难的决定，但她选择尝试。' },
    travel: { ex: 'They travel by train whenever they visit their grandparents.', exZh: '他们去看祖父母时总是坐火车。' },
    treat: { ex: 'The doctor treated the wound with clean water.', exZh: '医生用干净的水处理伤口。' },
    trouble: { ex: 'He had trouble finding the right classroom.', exZh: '他找不到正确的教室。' },
    trust: { ex: 'Good friends trust each other with their secrets.', exZh: '好朋友互相分享秘密并彼此信任。' },
    truth: { ex: 'The truth is sometimes harder to say than a lie.', exZh: '有时真相比谎言更难说出口。' },
    useful: { ex: 'This dictionary is useful for checking pronunciation.', exZh: '这本词典对查发音很有用。' },
    usual: { ex: 'She took her usual seat near the window.', exZh: '她坐在靠窗的惯常位置。' },
    valuable: { ex: 'Time is more valuable than money.', exZh: '时间比金钱更宝贵。' },
    various: { ex: 'The shop sells various kinds of tea.', exZh: '这家店卖各种茶。' },
    victory: { ex: 'The team celebrated their victory after the match.', exZh: '比赛后队伍庆祝胜利。' },
    visit: { ex: 'We visit our grandparents every summer.', exZh: '我们每年夏天去看望祖父母。' },
    voice: { ex: 'Her voice was clear even at the back of the hall.', exZh: '即使在大厅后排，她的声音也很清楚。' },
    warn: { ex: 'The sign warns drivers to slow down.', exZh: '标志警告司机减速。' },
    waste: { ex: 'Do not waste water while washing your hands.', exZh: '洗手时不要浪费水。' },
    weak: { ex: 'He felt weak after the long illness.', exZh: '久病之后他感到虚弱。' },
    wealth: { ex: 'The library is a wealth of information for students.', exZh: '图书馆是学生的信息宝库。' },
    welcome: { ex: 'The whole class welcomed the new student warmly.', exZh: '全班热情欢迎新同学。' },
    whole: { ex: 'She read the whole story in one evening.', exZh: '她一个晚上读完了整个故事。' },
    wide: { ex: 'The river is too wide to swim across here.', exZh: '这条河太宽，这里游不过去。' },
    wonder: { ex: 'I wonder why the sky turns red at sunset.', exZh: '我想知道为什么日落时天空会变红。' },
    worry: { ex: 'Do not worry too much about one bad grade.', exZh: '不要太担心一次糟糕的成绩。' },
    worth: { ex: 'The museum is worth a second visit.', exZh: '这座博物馆值得再参观一次。' },
    wrong: { ex: 'It is better to ask than to guess wrong.', exZh: '问一下比猜错更好。' }
  };

  function extractWordsFromText(text, glossary) {
    const counts = new Map();
    String(text || '')
      .toLowerCase()
      .replace(/[’]/g, "'")
      .split(/[^a-z'-]+/)
      .forEach((raw) => {
        const word = raw.replace(/^[-']+|[-']+$/g, '');
        if (word.length < 3 || word.length > 24) return;
        if (!/^[a-z][a-z'-]*$/.test(word)) return;
        if (WORD_STOP.has(word)) return;
        counts.set(word, (counts.get(word) || 0) + 1);
      });
    const candidates = [];
    counts.forEach((count, word) => {
      const entry = glossary[word];
      if (!entry || !entry.zh) return;
      candidates.push({ w: word, count, zh: S.meaningFor(word, entry.zh), kk: entry.kk || '', pos: entry.pos || '' });
    });
    candidates.sort((a, b) => b.count - a.count || b.w.length - a.w.length || a.w.localeCompare(b.w));
    const picked = [];
    const seenBase = new Set();
    candidates.forEach((item) => {
      const base = item.w.replace(/(?:s|es|ed|ing)$/i, '');
      if (base.length >= 3 && seenBase.has(base) && base !== item.w) return;
      seenBase.add(item.w);
      if (picked.length < 40) picked.push(item);
    });
    return picked;
  }

  function parseWordLines(text) {
    const list = [];
    const seen = new Set();
    String(text || '').split(/\r?\n+/).forEach((line) => {
      let raw = line.trim().replace(/^[0-9]+[.、)\s]+/, '');
      if (!raw) return;
      let example = '';
      let exampleZh = '';
      /* 支持“word 中文 | English example. | 中文翻译”，老师可以自己带语境。 */
      if (raw.includes('|')) {
        const parts = raw.split('|').map((part) => part.trim());
        raw = parts[0] || '';
        example = parts[1] || '';
        exampleZh = parts[2] || '';
      }
      let word = '';
      let meaning = '';
      /* 只用等号或制表符分隔“词 / 释义”。中文释义里常见的“；、，”不能当分隔符，
         否则 “abandon 放弃；抛弃” 会被拆坏，整行被丢掉。 */
      const separated = raw.split(/\s*[=\t]\s*/);
      if (separated.length >= 2) {
        word = separated[0].trim();
        meaning = separated.slice(1).join(' ').trim();
      } else {
        const tokens = raw.split(/\s+/);
        word = tokens[0] || '';
        const rest = tokens.slice(1);
        if (rest.length && /^[A-Za-z][A-Za-z'’.-]*$/.test(rest[0])
          && !/^(v|n|adj|adv|prep|pron|conj|num|art|aux|vt|vi|phr|abbr)\.?$/i.test(rest[0])
          && /[\u4e00-\u9fff\/]/.test(rest.slice(1).join(' ') || rest.join(' '))) {
          word += ' ' + rest.shift();
        }
        meaning = rest.join(' ').trim();
      }
      word = word.replace(/^[-'"“”]+|[-'"“”]+$/g, '').trim();
      if (!word) return;
      if (!/^[A-Za-z][A-Za-z'’ .-]*$/.test(word)) return;
      const key = word.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const meaningCount = String(meaning || '').split(/[;；,，、/|]+/).filter((part) => part.trim()).length;
      list.push({
        w: word,
        zh: meaning ? (meaningCount >= 4 ? S.meaningFor(word.toLowerCase(), meaning) : S.simplifyMeaning(meaning)) : '',
        kk: '', pos: '', ex: example, exZh: exampleZh
      });
      if (list.length >= 2000) return;
    });
    return list;
  }

  function wordPoolFor(words) {
    const extra = ['环境', '机会', '影响', '经历', '建议', '决定', '发展', '提供', '减少', '提高', '保护', '表达', '支持', '避免', '承认', '依靠', '属于', '安静的', '勇敢的', '复杂的'];
    return Array.from(new Set(words.map((word) => word.zh).concat(extra).filter(Boolean))).slice(0, 30);
  }

  function wordDifficultyScore(word) {
    const text = String(word.w || '').toLowerCase();
    const abstractEnding = /(?:tion|sion|ment|ness|ity|ance|ence|able|ible|ive|ous|ify|ize|ise)$/.test(text) ? 2.6 : 0;
    const prefix = /^(?:un|re|pre|dis|mis|inter|trans|over|under)/.test(text) ? 1.4 : 0;
    const letters = text.replace(/[^a-z]/g, '').length;
    const vowels = (text.match(/[aeiouy]+/g) || []).length;
    const concrete = /(?:house|door|key|book|bag|cat|dog|rain|road|box|hand|water|food|light|night|train|phone|letter|window|street)/.test(text) ? -1.8 : 0;
    return letters * 0.62 + vowels * 0.7 + abstractEnding + prefix + concrete;
  }

  function studentWordLevel(student) {
    return clamp(Number(student.wordLevel) || Number(student.planLevel) || 5, 1, 10);
  }

  function adaptiveWordsFor(assignment, student) {
    const words = Array.isArray(assignment.words) ? assignment.words : [];
    if (!assignment.adaptive || words.length < 8) return words;
    const level = studentWordLevel(student);
    const count = clamp(8 + level, 9, 18);
    const sorted = words.slice().sort((a, b) => (
      wordDifficultyScore(a) - wordDifficultyScore(b) || String(a.w).localeCompare(String(b.w))
    ));
    const maxStart = Math.max(0, sorted.length - count);
    const start = Math.round(((level - 1) / 9) * maxStart);
    return sorted.slice(start, start + count);
  }

  function updateWordLevelFromTasks(student, tasks) {
    const wordTasks = (tasks || []).filter((task) => task.mode === 'words' && Array.isArray(task.wordStats) && task.wordStats.length);
    if (!wordTasks.length) return null;
    const stats = [];
    wordTasks.forEach((task) => task.wordStats.forEach((word) => stats.push(word)));
    if (!stats.length) return null;
    const accuracy = stats.filter((word) => word.ok).length / stats.length;
    const before = studentWordLevel(student);
    let after = before;
    if (accuracy >= 0.9 && before < 10) after = before + 1;
    else if (accuracy < 0.62 && before > 1) after = before - 1;
    student.wordLevel = after;
    student.wordLevelHistory = student.wordLevelHistory || [];
    student.wordLevelHistory.unshift({
      at: S.nowIso(),
      before,
      after,
      accuracy: Math.round(accuracy * 100),
      words: stats.length
    });
    student.wordLevelHistory = student.wordLevelHistory.slice(0, 24);
    return { before, after, accuracy: Math.round(accuracy * 100) };
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
    const auth = S.authCode(await S.sha256Hex(`${student.id}|${student.pin}|${assignment.id}`));
    const base = {
      v: 1,
      kind: 'task',
      id: assignment.id,
      studentId: student.id,
      title: assignment.title,
      grade: assignment.paperGrade || student.grade || '',
      due: assignment.due || '',
      xp: assignment.xp,
      createdAt: assignment.createdAt,
      auth
    };
    if (assignment.kind === 'words') {
      const studentWords = adaptiveWordsFor(assignment, student);
      const glossary = await loadGlossary();
      return S.packCode({
        ...base,
        mode: 'words',
        wordTotal: studentWords.length,
        words: S.packWordList(studentWords, glossary)
      });
    }
    return S.packCode({
      ...base,
      avgDifficulty: assignment.avgDifficulty || null,
      blocks: assignment.blocks
    });
  }

  function wordTaskPayload(assignment, student, glossary) {
    const studentWords = adaptiveWordsFor(assignment, student);
    return {
      v: 1,
      kind: 'task',
      id: assignment.id,
      studentId: student.id,
      title: assignment.title,
      grade: assignment.paperGrade || student.grade || '',
      due: assignment.due || '',
      xp: assignment.xp,
      createdAt: assignment.createdAt,
      mode: 'words',
      wordTotal: studentWords.length,
      words: S.packWordList(studentWords, glossary)
    };
  }

  async function bundleCodeFor(assignment, student, grammarPlan) {
    const glossary = await loadGlossary();
    const wordTask = wordTaskPayload(assignment, student, glossary);
    wordTask.auth = S.authCode(await S.sha256Hex(`${student.id}|${student.pin}|${assignment.id}`));
    const tasks = [wordTask];
    if (grammarPlan) {
      for (const day of grammarPlan.days || []) {
        const task = planTaskPayload(grammarPlan, day, student, data.teacherName || '阮老师', glossary);
        task.auth = S.authCode(await S.sha256Hex(`${student.id}|${student.pin}|${day.taskId}`));
        tasks.push(task);
      }
    }
    const bundleId = `${assignment.id}-B`;
    const auth = S.authCode(await S.sha256Hex(`${student.id}|${student.pin}|${bundleId}`));
    return S.packCode({
      v: 1,
      kind: 'plan',
      id: bundleId,
      studentId: student.id,
      createdAt: S.nowIso(),
      auth,
      tasks
    });
  }

  function codeCardButtons(item, index) {
    return `<div class="code-card-actions">` +
      `<button class="p-btn small" type="button" data-copy-message-index="${index}">复制微信消息</button>` +
      `<button class="p-btn small ghost" type="button" data-copy-index="${index}">复制纯码</button>` +
    `</div>`;
  }

  /* 纯码默认折叠：老师平时发“微信消息”里的链接即可，学生点开自动导入。 */
  function codeTextareaHtml(code) {
    return `<details class="code-raw"><summary>纯码备用（一般不用复制）</summary>` +
      `<textarea class="code-text" readonly>${S.escapeHtml(code)}</textarea>` +
    `</details>`;
  }

  function codeMessageFor(item) {
    const link = S.codeLink('student.html', item.code);
    return `${item.student.name}，点开这个链接会自动导入本周任务：\n${link}`;
  }

  async function showBundleCodes(items, grammarUsed) {
    lastCodes = items;
    const title = $('#codes-title');
    const sub = $('#codes-sub');
    if (title) title.textContent = '本周合码（单词 + 语法）';
    if (sub) {
      sub.textContent = grammarUsed
        ? '一位学生一码：导入一次，本周单词和 7 天语法都在里面。学生每天完成当天语法，第二天自动解锁；完成后只发一个汇报码。'
        : '一位学生一码：本周单词任务。完成后发汇报码即可。';
    }
    $('#codes-list').innerHTML = items.map((item, index) => {
      if (!item.code) {
        return `<div class="code-card"><div class="code-card-head"><strong>${S.escapeHtml(item.student.name)} · ${S.escapeHtml(item.student.id)}</strong></div>` +
          `<p class="hint warn">${S.escapeHtml(item.error)}</p></div>`;
      }
      const note = item.grammarDays
        ? `单词 ${item.wordCount} 个 · 语法 ${item.grammarDays} 天`
        : `单词 ${item.wordCount} 个 · 语法已学完，只含单词`;
      return `<div class="code-card">` +
        `<div class="code-card-head">` +
          `<div><strong>${S.escapeHtml(item.student.name)}</strong> <span>${S.escapeHtml(item.student.id)} · ${note}</span></div>` +
          codeCardButtons(item, index) +
        `</div>` +
        codeTextareaHtml(item.code) +
      `</div>`;
    }).join('');
    S.openDialog($('#codes-dialog'));
  }

  async function buildResetCode(student) {
    const createdAt = S.nowIso();
    const auth = S.authCode(await S.sha256Hex(`reset|${student.id}|${student.pin}|${createdAt}`));
    return S.packCode({
      v: 1,
      kind: 'reset',
      studentId: student.id,
      studentName: student.name,
      pin: student.pin,
      teacherName: data.teacherName || '阮老师',
      createdAt,
      auth
    });
  }

  async function buildEnrollCode(student) {
    const auth = S.authCode(await S.sha256Hex(`enroll|${student.id}|${student.pin}`));
    return S.packCode({
      v: 1,
      kind: 'enroll',
      studentId: student.id,
      name: student.name,
      grade: student.grade,
      avatar: student.avatar,
      pin: student.pin,
      teacherName: data.teacherName || '阮老师',
      accountType: student.accountType || 'regular',
      trialDays: student.trialDays || 3,
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
    renderPlanList();
    renderGrammarList();
    renderWords();
    if ($('#trial-students')) renderTrialTab();
    renderReportList();
    renderInsights();
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
            (student.accountType === 'trial' ? `<span class="account-badge">体验</span>` : '') +
          `</div>` +
          `<span class="sid">${S.escapeHtml(student.id)}</span>` +
        `</div>` +
        `<div class="student-card-tools">` +
          `<button class="student-remove student-reset" type="button" data-student-reset="${S.escapeHtml(student.id)}" title="生成 ${S.escapeHtml(student.name)} 的重置码">重置密码</button>` +
          `<button class="student-remove" type="button" data-student-delete="${S.escapeHtml(student.id)}" title="删除 ${S.escapeHtml(student.name)}" aria-label="删除 ${S.escapeHtml(student.name)}">删除</button>` +
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
      const suspicious = (student.tasks || []).filter((task) => task.integrityScore != null && Number(task.integrityScore) < 55);
      if (suspicious.length) {
        todos.push({
          tone: 'var(--red)',
          studentId: student.id,
          text: `<strong>${S.escapeHtml(student.name)}</strong> 有 ${suspicious.length} 次任务出现疑似乱选信号，建议打开档案核对答题过程。`
        });
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
    const list = (data.assignments || []).filter((assignment) => assignment.kind !== 'words').slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
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
    renderDailyBoard();
    const list = allReports();
    $('#report-list').innerHTML = list.length
      ? list.map(reportFeedItem).join('')
      : emptyState('汇报库还是空的', '学生完成学习后生成汇报码，老师粘贴导入即可。');
  }

  /* ------------------------------ 每日汇报看板 ------------------------------ */

  let dailyBoardOffset = 0;

  function mondayOf(iso) {
    const date = new Date(`${iso}T00:00:00`);
    if (Number.isNaN(date.getTime())) return iso;
    const shift = (date.getDay() + 6) % 7;
    return S.addDays(iso, -shift);
  }

  function tasksOnDay(student, day) {
    return (student.tasks || []).filter((task) => task.status === 'done' && String(task.submittedAt || '').slice(0, 10) === day);
  }

  function renderDailyBoard() {
    const box = $('#daily-board');
    if (!box || !data) return;
    const today = S.todayIso();
    const start = S.addDays(mondayOf(today), dailyBoardOffset * 7);
    const days = Array.from({ length: 7 }, (_, index) => S.addDays(start, index));
    const students = (data.students || []).slice().sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh'));
    const weekEnd = days[6];
    const label = $('#daily-board-range');
    if (label) {
      label.textContent = `${S.fmtDate(days[0])} — ${S.fmtDate(weekEnd)}`;
    }
    if (!students.length) {
      box.innerHTML = emptyState('还没有学生', '先到“学生名册”添加学生。');
      return;
    }
    let reportCount = 0;
    let taskOnlyCount = 0;
    const rows = students.map((student) => {
      const dayLog = student.dayLog || {};
      const cells = days.map((day) => {
        const tasks = tasksOnDay(student, day);
        const log = dayLog[day];
        const checked = ((student.profile && student.profile.checkins) || []).includes(day);
        let cls = '';
        let tip = `${student.name} · ${S.fmtDate(day)}：`;
        if (log) {
          cls = 'is-report';
          reportCount += 1;
          tip += `已交今日汇报（${log.taskCount || 0} 个任务${log.avgScore != null ? `，均分 ${log.avgScore}` : ''}）`;
        } else if (tasks.length) {
          cls = 'is-task';
          taskOnlyCount += 1;
          tip += `完成了 ${tasks.length} 个任务，但还没有交今日汇报`;
        } else if (checked) {
          cls = 'is-checkin';
          tip += '已打卡，没有交今日汇报';
        } else {
          tip += '没有记录';
        }
        if (day === today) cls += ' is-today';
        return `<span class="daily-cell ${cls}" title="${S.escapeHtml(tip)}">${day === today ? '今' : Number(day.slice(8, 10))}</span>`;
      }).join('');
      const weekReports = days.filter((day) => dayLog[day]).length;
      return `<div class="daily-row" data-student-id="${S.escapeHtml(student.id)}" tabindex="0" role="button" title="打开 ${S.escapeHtml(student.name)} 的详情">` +
        `<span class="daily-name">${S.escapeHtml(student.avatar || '')} ${S.escapeHtml(student.name)}${weekReports ? `<b>${weekReports}</b>` : ''}</span>` +
        `<span class="daily-cells">${cells}</span>` +
      `</div>`;
    }).join('');
    const heads = days.map((day) => `<span class="daily-head${day === today ? ' is-today' : ''}">周${'一二三四五六日'[(new Date(`${day}T00:00:00`).getDay() + 6) % 7]}</span>`).join('');
    box.innerHTML =
      `<div class="daily-board">` +
        `<div class="daily-row daily-row-head"><span class="daily-name">学生</span><span class="daily-cells">${heads}</span></div>` +
        rows +
      `</div>` +
      `<div class="daily-board-foot">` +
        `<span class="daily-legend"><i class="lg-report"></i>已交今日汇报 ${reportCount}</span>` +
        `<span class="daily-legend"><i class="lg-task"></i>做了任务没交汇报 ${taskOnlyCount}</span>` +
        `<span class="daily-legend"><i class="lg-none"></i>没有记录</span>` +
        `<span class="daily-board-tip">点任意一行，查看这个学生的详情和画像。</span>` +
      `</div>`;
    box.querySelectorAll('.daily-row[data-student-id]').forEach((row) => {
      const open = () => openDetail(row.dataset.studentId);
      row.addEventListener('click', open);
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
      });
    });
  }

  function renderSettings() {
    const nameInput = $('#setting-teacher-name');
    if (nameInput && document.activeElement !== nameInput) nameInput.value = data.teacherName || '阮老师';
    updateAiSettingsUI();
  }

  /* ------------------------------- 学习心得 ------------------------------- */

  function insightSyncState() {
    const draft = IC ? IC.normalizePosts(data && data.insights) : [];
    const published = IC ? IC.publishedPosts() : [];
    return {
      draft,
      published,
      same: IC ? IC.samePosts(draft, published) : true
    };
  }

  function insightAdminItem(post, index, total) {
    const tags = (post.tags || []).map((tag) => `<span>${S.escapeHtml(tag)}</span>`).join('');
    const summary = IC.excerptOf(post, 82);
    return `<article class="insight-admin-item" data-insight-id="${S.escapeHtml(post.id)}">` +
      `<div class="insight-admin-date"><b>${S.escapeHtml(IC.formatDateShort(post.date))}</b><span>${S.escapeHtml(post.date.slice(0, 4))}</span></div>` +
      `<div class="insight-admin-main">` +
        `<h3>${S.escapeHtml(post.title)}</h3>` +
        `<p>${S.escapeHtml(summary)}</p>` +
        (tags ? `<div class="insight-admin-tags">${tags}</div>` : '') +
      `</div>` +
      `<div class="insight-admin-actions">` +
        `<button class="insight-mini" type="button" data-insight-action="up" title="上移" aria-label="上移这篇心得" ${index === 0 ? 'disabled' : ''}>↑</button>` +
        `<button class="insight-mini" type="button" data-insight-action="down" title="下移" aria-label="下移这篇心得" ${index === total - 1 ? 'disabled' : ''}>↓</button>` +
        `<button class="insight-mini wide" type="button" data-insight-action="edit">编辑</button>` +
        `<button class="insight-mini remove" type="button" data-insight-action="delete" aria-label="删除${S.escapeHtml(post.title)}">删除</button>` +
      `</div>` +
    `</article>`;
  }

  function renderInsights() {
    const listEl = $('#insight-admin-list');
    if (!listEl || !data) return;
    if (IC) data.insights = IC.normalizePosts(data.insights);
    const list = data.insights || [];
    const state = insightSyncState();

    listEl.innerHTML = list.length
      ? list.map((post, index) => insightAdminItem(post, index, list.length)).join('')
      : emptyState('还没有手记', '点右上角“新建心得”，把最近的一条学习观察写下来。');

    const countEl = $('#insight-admin-count');
    if (countEl) countEl.textContent = `${list.length} 篇`;

    const chip = $('#insight-status');
    if (chip) {
      chip.classList.remove('is-synced', 'is-dirty', 'is-empty');
      if (!list.length) {
        chip.textContent = '暂无手记';
        chip.classList.add('is-empty');
      } else if (state.same) {
        chip.textContent = `已同步 · ${list.length} 篇`;
        chip.classList.add('is-synced');
      } else {
        chip.textContent = `待发布 · 草稿 ${list.length} 篇`;
        chip.classList.add('is-dirty');
      }
    }

    const sync = $('#insight-sync');
    if (sync) {
      if (!list.length) {
        sync.textContent = '当前没有手记。导出空列表后，主页心得栏会显示“还没有手记”。';
      } else if (state.same) {
        sync.textContent = `主页正在展示这 ${list.length} 篇手记，草稿与主页一致。`;
      } else {
        sync.textContent = `主页现有 ${state.published.length} 篇；本机草稿 ${list.length} 篇，有修改尚未发布。`;
      }
    }
  }

  function updateInsightCount() {
    const body = $('#insight-body-input');
    const count = $('#insight-body-count');
    if (!body || !count) return;
    const text = String(body.value || '').replace(/\s/g, '');
    count.textContent = `${text.length} 字`;
  }

  function openInsightDialog(id) {
    if (!data || !IC) return;
    const post = id ? (data.insights || []).find((item) => item.id === id) : null;
    editingInsightId = post ? post.id : null;
    $('#insight-editor-title').textContent = post ? '编辑这篇心得' : '写一篇学习心得';
    $('#insight-title-input').value = post ? post.title : '';
    $('#insight-date-input').value = post ? post.date : IC.todayIso();
    $('#insight-tags-input').value = post ? post.tags.join('，') : '';
    $('#insight-excerpt-input').value = post ? post.excerpt : '';
    $('#insight-body-input').value = post ? post.body : '';
    $('#insight-delete').hidden = !post;
    updateInsightCount();
    S.openDialog($('#insight-editor-dialog'));
    const dialogBody = $('#insight-editor-dialog .p-dialog-body');
    if (dialogBody) dialogBody.scrollTop = 0;
    setTimeout(() => {
      const focusTarget = post ? $('#insight-body-input') : $('#insight-title-input');
      if (focusTarget) focusTarget.focus();
    }, 80);
  }

  function saveInsight() {
    if (!data || !IC) return;
    const title = String($('#insight-title-input').value || '').trim();
    const body = String($('#insight-body-input').value || '').trim();
    if (!title) { S.toast('先给这篇心得起个标题。', 'error'); $('#insight-title-input').focus(); return; }
    if (!body) { S.toast('正文还是空的，写几句再保存。', 'error'); $('#insight-body-input').focus(); return; }
    const post = IC.normalizePost({
      id: editingInsightId || `LOG-${Date.now().toString(36).toUpperCase()}`,
      title,
      date: $('#insight-date-input').value || IC.todayIso(),
      tags: $('#insight-tags-input').value,
      excerpt: $('#insight-excerpt-input').value,
      body
    });
    if (!post) { S.toast('标题或正文格式不对，请检查后再试。', 'error'); return; }
    const index = editingInsightId
      ? (data.insights || []).findIndex((item) => item.id === editingInsightId)
      : -1;
    if (index >= 0) data.insights[index] = post;
    else data.insights.unshift(post);
    data.insights = IC.normalizePosts(data.insights);
    save();
    editingInsightId = null;
    S.closeDialog($('#insight-editor-dialog'));
    renderInsights();
    S.toast('草稿已保存。导出并发布后，主页才会更新。', 'ok', 4600);
  }

  function deleteInsight(id, closeEditor) {
    if (!data || !IC || !id) return;
    const post = (data.insights || []).find((item) => item.id === id);
    if (!post) return;
    if (!window.confirm(`删除《${post.title}》？\n\n只会删除本机草稿；主页要等下一次发布才会变化。`)) return;
    data.insights = data.insights.filter((item) => item.id !== id);
    save();
    if (closeEditor) {
      editingInsightId = null;
      S.closeDialog($('#insight-editor-dialog'));
    }
    renderInsights();
    S.toast('已从本机草稿删除。发布后主页才会同步。', 'ok', 4200);
  }

  function moveInsight(id, offset) {
    if (!data) return;
    const list = data.insights || [];
    const index = list.findIndex((item) => item.id === id);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= list.length) return;
    const temp = list[index];
    list[index] = list[target];
    list[target] = temp;
    save();
    renderInsights();
  }

  function exportInsights() {
    if (!data || !IC) return;
    const list = IC.normalizePosts(data.insights);
    if (!list.length && !window.confirm('当前没有手记。导出的空列表会让主页心得栏显示“还没有手记”。继续吗？')) return;
    const file = IC.buildFile(list, new Date().toISOString());
    S.downloadText('insights.js', file, 'application/javascript;charset=utf-8');
    const sync = $('#insight-sync');
    if (sync) sync.textContent = 'insights.js 已下载。还差最后一步：复制发布说明，交给 Claude 发布。';
    S.toast('insights.js 已下载到“下载”文件夹。下一步：复制发布说明。', 'ok', 5200);
  }

  function previewInsights() {
    window.open(`index.html?insights=preview&cb=${Date.now()}`, '_blank', 'noopener');
  }

  async function copyPublishPrompt() {
    const lines = [
      '我在「顺势教师端」更新了学习心得。',
      '',
      '请完成下面几件事：',
      '1. 在“下载”文件夹找到我刚导出的最新 insights.js。如果找不到，先提醒我回教师端点“导出 insights.js”。',
      '2. 用它覆盖 C:\\Users\\阮蔡顺\\personal-homepage\\insights.js。',
      '3. 同步网站源码到 D:\\顺势工作台\\网站源码\\，并按原有 API 流程发布到 GitHub Pages。',
      '4. 上线后打开主页，确认“学习心得”专栏显示最新内容，并检查“查看更多”能展开全部手记。',
      '5. 最后用简单中文告诉我：发布是否成功、主页网址是什么。',
      '',
      '注意：心得是公开内容；学生档案、成绩和资料库仍只留在本机，不要上传。'
    ];
    try {
      await S.copyText(lines.join('\n'));
      S.toast('发布说明已复制。打开 Claude Code 粘贴即可。', 'ok', 4600);
    } catch (error) {
      S.toast('复制失败，请手动复制发布说明。', 'error');
    }
  }

  /* ------------------------------- 标签切换 ------------------------------- */

  let publishSub = 'daily';

  function setPublishSub(name) {
    publishSub = name === 'papers' ? 'papers' : 'daily';
    $$('#publish-subnav button').forEach((button) => {
      const on = button.dataset.publishSub === publishSub;
      button.classList.toggle('active', on);
      button.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    $$('[data-publish-pane]').forEach((pane) => {
      pane.classList.toggle('active', pane.dataset.publishPane === publishSub);
    });
    if (publishSub === 'papers') {
      renderAssignments();
      renderPlanTab();
      if (!planPapers.length) loadPlanPapers().then(() => renderPlanTab());
    } else {
      renderWords();
      renderGrammarTab();
    }
  }

  function switchTab(name) {
    /* 旧入口（任务 / 周计划 / 语法 / 单词）都收进“发布任务”，保留跳转兼容。 */
    const publishAlias = { assignments: 'papers', plan: 'papers', grammar: 'daily', words: 'daily' };
    if (publishAlias[name]) {
      switchTab('publish');
      setPublishSub(publishAlias[name]);
      return;
    }
    $$('#teacher-tabs button').forEach((button) => button.classList.toggle('active', button.dataset.tab === name));
    $$('.teacher-pane').forEach((pane) => pane.classList.toggle('active', pane.dataset.pane === name));
    if (name === 'publish') setPublishSub(publishSub);
    if (name === 'insights') renderInsights();
    if (name === 'weekly') renderWeeklyTab();
    if (name === 'guide') {
      const frame = $('#guide-frame');
      if (frame && !frame.getAttribute('src')) frame.setAttribute('src', frame.dataset.src || 'guide.html?embed=1');
    }
    if (name === 'trial') renderTrialTab();
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
    $('#student-pin-input').type = 'password';
    const pinToggle = $('#student-pin-toggle');
    if (pinToggle) { pinToggle.textContent = '显示'; pinToggle.setAttribute('aria-label', '显示学生密码'); }
    $('#student-delete').hidden = !student;
    $('#student-pin-note').textContent = student
      ? '修改密码后，旧任务码会失效；保存后会自动生成“密码重置码”，发给学生本人即可同步新密码。'
      : '学生端和学生端之间靠“学号 + 密码”绑定。密码要给到学生本人，不要发在公开群里。';
    $$('#student-avatar-picker input').forEach((input) => {
      input.checked = input.value === (student ? student.avatar : '🦊');
    });
    const accountType = student ? student.accountType : 'regular';
    $$('#student-account-type input').forEach((input) => {
      input.checked = input.value === accountType;
    });
    const trialDays = student ? student.trialDays : 3;
    if ($('#student-trial-days')) $('#student-trial-days').value = String(trialDays);
    if ($('#student-trial-days-field')) $('#student-trial-days-field').hidden = accountType !== 'trial';
    S.openDialog($('#student-dialog'));
  }

  function saveStudent() {
    const name = $('#student-name-input').value.trim();
    const id = $('#student-id-input').value.trim().toUpperCase().replace(/\s+/g, '');
    const grade = $('#student-grade-input').value;
    const pin = $('#student-pin-input').value.trim();
    const avatar = selectedAvatar('student-avatar');
    const accountTypeInput = $('#student-account-type input:checked');
    const accountType = accountTypeInput && accountTypeInput.value === 'trial' ? 'trial' : 'regular';
    const trialDays = clamp(Number(($('#student-trial-days') || {}).value) || 3, 1, 30);
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
      const pinChanged = student.pin !== pin;
      if (pinChanged && !window.confirm('改密码后，之前发出去的任务码会失效。确定修改吗？')) return;
      if (student.id !== id && !window.confirm('改学号后，旧学号的任务码和旧汇报码会失效。确定修改吗？')) return;
      student.id = id;
      student.name = name;
      student.grade = grade;
      student.pin = pin;
      student.avatar = avatar;
      student.accountType = accountType;
      student.trialDays = trialDays;
      save();
      S.closeDialog($('#student-dialog'));
      renderAll();
      if (detailStudentId) {
        detailStudentId = id;
        renderDetail();
      }
      if (pinChanged) {
        S.toast('密码已更新。正在生成学生密码重置码，请发给学生本人。', 'ok', 6500);
        openResetCode(student);
      } else {
        S.toast('学生信息已更新。', 'ok');
      }
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
      aiAnalysis: '',
      accountType,
      trialDays,
      planLevel: 5,
      wordLevel: 5,
      wordLevelHistory: [],
      levelHistory: []
    };
    data.students.push(student);
    save();
    S.closeDialog($('#student-dialog'));
    renderAll();
    S.toast('学生已添加。开通码已生成，发给学生即可。', 'ok');
    openEnroll(student.id);
  }

  function deleteStudent(studentId) {
    const id = typeof studentId === 'string' ? studentId : editingStudentId;
    if (!id) return;
    const student = getStudent(id);
    if (!student) return;
    if (!window.confirm(`删除学生 ${student.name}（${student.id}）？`)) return;
    if (!window.confirm('该学生的汇报、任务历史、语法计划和画像会一起删除，且无法恢复。学生自己设备上的档案不会自动消失。最后确认一次。')) return;
    data.students = data.students.filter((item) => item.id !== student.id);
    (data.assignments || []).forEach((assignment) => {
      assignment.studentIds = (assignment.studentIds || []).filter((studentIdItem) => studentIdItem !== student.id);
    });
    data.assignments = (data.assignments || []).filter((assignment) => (assignment.studentIds || []).length);
    data.plans = (data.plans || []).filter((plan) => plan.studentId !== student.id);
    if (editingStudentId === student.id) editingStudentId = null;
    if (detailStudentId === student.id) detailStudentId = null;
    save();
    S.closeDialog($('#student-dialog'));
    closeDetail();
    renderAll();
    S.toast(`${student.name} 已从教师端删除。`);
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

  async function openResetCode(student) {
    if (!student || !student.pin) { S.toast('这个学生还没有密码。', 'error'); return; }
    try {
      const code = await buildResetCode(student);
      const summary = $('#reset-code-summary');
      if (summary) {
        summary.innerHTML = `<span class="student-avatar">${S.escapeHtml(student.avatar || '🦊')}</span>` +
          `<div><strong>${S.escapeHtml(student.name)}</strong>` +
          `<b>${S.escapeHtml(student.id)} · 新密码 ${S.escapeHtml(student.pin)}</b>` +
          `<span>学生粘贴重置码后会自动改用这个密码</span></div>`;
      }
      $('#reset-code-output').value = code;
      S.openDialog($('#reset-code-dialog'));
    } catch (error) {
      S.toast(error.message || '重置码生成失败。', 'error');
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
    const title = $('#codes-title');
    const sub = $('#codes-sub');
    if (title) title.textContent = '任务码';
    if (sub) sub.textContent = '一位学生一码。复制后单独发给对应学生，不要发错。';
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
          codeCardButtons(item, index) +
        `</div>` +
        codeTextareaHtml(item.code) +
      `</div>`;
    }).join('');
    S.openDialog($('#codes-dialog'));
  }

  async function openCodesForAssignment(assignmentId) {
    const assignment = (data.assignments || []).find((item) => item.id === assignmentId);
    if (!assignment) return;
    await showCodes(assignment);
  }

  /* ------------------------------- 周计划 ------------------------------- */

  function planWindow(level) {
    const lv = clamp(Number(level) || 5, 1, 10);
    if (lv <= 2) return { min: 1, max: 3 };
    if (lv <= 4) return { min: 2, max: 4 };
    if (lv <= 6) return { min: 3, max: 6 };
    if (lv <= 8) return { min: 5, max: 8 };
    return { min: 6, max: 10 };
  }

  function planLevelLabel(level) {
    const lv = clamp(Number(level) || 5, 1, 10);
    if (lv <= 2) return '打基础';
    if (lv <= 4) return '稳步推进';
    if (lv <= 6) return '同步提升';
    if (lv <= 8) return '拔高训练';
    return '冲刺挑战';
  }

  function cloneBlocksForPlan(paper) {
    return blocksFromPaper(paper).map((block) => JSON.parse(JSON.stringify(block)));
  }

  function blockAvgLevel(block) {
    const levels = (block.questions || []).map((question) => Number(question.difficulty)).filter((n) => n >= 1 && n <= 10);
    return levels.length ? mean(levels) : 5;
  }

  function planPracticeBlocks(papersForPlan, level, practiceDayCount) {
    const window = planWindow(level);
    const collected = [];
    papersForPlan.forEach((paper) => {
      cloneBlocksForPlan(paper).forEach((block) => {
        if (!(block.questions || []).length) return;
        const kept = block.questions.filter((question) => {
          const value = Number(question.difficulty);
          return !value || (value >= window.min && value <= window.max);
        });
        const use = kept.length >= Math.min(2, block.questions.length) ? kept : block.questions;
        collected.push({ ...block, questions: use, sourceTitle: paper.title || '' });
      });
    });
    // 难度窗口筛得太狠时逐步放宽，保证一周有题可做。
    if (countQuestions(collected) < practiceDayCount * 3) {
      collected.length = 0;
      papersForPlan.forEach((paper) => {
        cloneBlocksForPlan(paper).forEach((block) => {
          if ((block.questions || []).length) collected.push({ ...block, sourceTitle: paper.title || '' });
        });
      });
    }
    collected.sort((a, b) => {
      const da = Math.abs(blockAvgLevel(a) - (window.min + window.max) / 2);
      const db = Math.abs(blockAvgLevel(b) - (window.min + window.max) / 2);
      return da - db;
    });
    return collected;
  }

  function splitPlanBlock(block, capacity) {
    if (!block.questions || block.questions.length <= capacity * 1.6) return [block];
    const chunks = [];
    for (let i = 0; i < block.questions.length; i += capacity) {
      chunks.push({
        ...block,
        id: `${block.id}-w${chunks.length + 1}`,
        label: `${block.label || '练习'}（${chunks.length + 1}）`,
        questions: block.questions.slice(i, i + capacity)
      });
    }
    return chunks;
  }

  function distributePracticeBlocks(blocks, dayCount, level) {
    const buckets = Array.from({ length: dayCount }, (_, index) => ({ dayIndex: index, blocks: [], questions: 0, difficulty: 5 }));
    const totalQuestions = countQuestions(blocks);
    const levelCapacity = clamp(7 + Math.round(Number(level) || 5), 8, 18);
    // 题量不足时按“总题数 ÷ 天数”缩小每块容量，尽量让每天都有任务，
    // 而不是把 28 道题堆成 3 天、另外 4 天没有内容。
    const evenCapacity = dayCount && totalQuestions >= dayCount ? Math.ceil(totalQuestions / dayCount) : levelCapacity;
    const capacity = Math.max(2, Math.min(levelCapacity, evenCapacity));
    blocks.forEach((block) => {
      splitPlanBlock(block, capacity).forEach((piece) => {
        const pieceCount = countQuestions([piece]);
        buckets.sort((a, b) => (a.questions - b.questions) || (a.dayIndex - b.dayIndex));
        const target = buckets[0];
        target.blocks.push(piece);
        target.questions += pieceCount;
      });
    });
    // 材料块少于天数时，把题目最多的一摞拆一份给空白天，保证每天都有任务。
    buckets.forEach((bucket) => {
      if (bucket.blocks.length) return;
      const donor = buckets.filter((item) => item !== bucket).sort((a, b) => b.blocks.length - a.blocks.length)[0];
      if (!donor || donor.blocks.length <= 1) return;
      const block = donor.blocks.pop();
      donor.questions -= countQuestions([block]);
      bucket.blocks.push(block);
      bucket.questions += countQuestions([block]);
    });
    buckets.forEach((bucket) => {
      bucket.difficulty = avgDifficultyOf(bucket.blocks) || 5;
    });
    return buckets;
  }

  function buildStudentPlan(student, weekStart, selectedPapers, wordAssignment, level) {
    const lv = clamp(Number(level) || 5, 1, 10);
    const planId = S.uid('P');
    const hasWords = Boolean(wordAssignment && (wordAssignment.words || []).length >= 8);
    const practiceDays = hasWords ? [1, 3, 5, 7] : [1, 2, 3, 4, 5, 6, 7];
    const wordDays = hasWords ? [2, 4, 6] : [];
    const practiceBlocks = planPracticeBlocks(selectedPapers, lv, practiceDays.length);
    if (!practiceBlocks.length) return null;
    const buckets = distributePracticeBlocks(practiceBlocks, practiceDays.length, lv);
    const title = `${S.fmtDate(weekStart)} 周计划 · ${student.name}`;
    const wordsPerDay = clamp(6 + lv, 7, 16);
    const days = [];
    practiceDays.forEach((dayNumber, index) => {
      const bucket = buckets[index];
      const blocks = bucket.blocks;
      if (!blocks.length) return;
      const questionTotal = countQuestions(blocks);
      const avgDifficulty = avgDifficultyOf(blocks);
      days.push({
        day: dayNumber,
        date: S.addDays(weekStart, dayNumber - 1),
        kind: 'paper',
        taskId: `${planId}-D${dayNumber}`,
        title: `第 ${dayNumber} 天 · 练习 ${questionTotal} 题`,
        paperTitle: `${title} · 练习日`,
        blocks,
        questionTotal,
        avgDifficulty,
        xp: clamp(Math.round(45 + questionTotal * 12 + lv * 4), 60, 420)
      });
    });
    if (hasWords) {
      const sourceWords = wordAssignment.words || [];
      wordDays.forEach((dayNumber, index) => {
        const start = (index * wordsPerDay) % sourceWords.length;
        const words = [];
        for (let i = 0; i < wordsPerDay && i < sourceWords.length; i += 1) {
          words.push(sourceWords[(start + i) % sourceWords.length]);
        }
        if (!words.length) return;
        days.push({
          day: dayNumber,
          date: S.addDays(weekStart, dayNumber - 1),
          kind: 'words',
          taskId: `${planId}-D${dayNumber}`,
          title: `第 ${dayNumber} 天 · 单词闯关 ${words.length} 词`,
          paperTitle: `${title} · 单词日`,
          words,
          pool: wordPoolFor(words),
          wordTotal: words.length,
          xp: clamp(Math.round(35 + words.length * 8), 50, 260)
        });
      });
    }
    days.sort((a, b) => a.day - b.day);
    return {
      id: planId,
      studentId: student.id,
      studentName: student.name,
      weekStart,
      title,
      level: lv,
      createdAt: S.nowIso(),
      wordSourceId: wordAssignment ? wordAssignment.id : '',
      days
    };
  }

  function planTaskPayload(plan, day, student, teacherName, glossary) {
    const task = {
      v: 1,
      kind: 'task',
      id: day.taskId,
      studentId: student.id,
      title: day.title,
      grade: student.grade || '',
      due: day.date,
      xp: day.xp,
      createdAt: plan.createdAt,
      planId: plan.id,
      planDay: day.day,
      planTotal: (plan.days || []).length || 7,
      assignmentId: day.assignmentId || plan.bookAssignmentId || '',
      wordSlot: day.wordSlot || '',
      mode: day.kind === 'grammar' ? 'grammar' : day.kind === 'words' ? 'words' : '',
      grammarDay: day.grammarDay || 0,
      wordTotal: day.wordTotal || 0,
      words: S.packWordList(day.words || [], glossary),
      avgDifficulty: day.avgDifficulty || null
    };
    /* 语法课由学生端按 grammarDay 用同一份 grammar-data.js 重建，
       不再把 5 个关卡整包塞进代码里；练习卷没有固定课程数据，仍需带题目。 */
    if (day.kind === 'grammar') {
      task.lesson = null;
      task.blocks = [];
      delete task.grade;
      delete task.createdAt;
      delete task.assignmentId;
      delete task.wordSlot;
      delete task.wordTotal;
      delete task.words;
      delete task.avgDifficulty;
    } else if (day.kind === 'words') {
      delete task.grade;
      delete task.createdAt;
      delete task.avgDifficulty;
      task.lesson = null;
      task.blocks = [];
    } else {
      task.lesson = day.lesson || null;
      task.blocks = day.blocks || [];
    }
    return task;
  }

  async function planCodeFor(plan, student) {
    const teacherName = data.teacherName || '阮老师';
    const glossary = await loadGlossary();
    const tasks = [];
    for (const day of plan.days) {
      const task = planTaskPayload(plan, day, student, teacherName, glossary);
      task.auth = S.authCode(await S.sha256Hex(`${student.id}|${student.pin}|${day.taskId}`));
      tasks.push(task);
    }
    const auth = S.authCode(await S.sha256Hex(`${student.id}|${student.pin}|${plan.id}`));
    return S.packCode({
      v: 1,
      kind: 'plan',
      id: plan.id,
      studentId: student.id,
      createdAt: plan.createdAt,
      auth,
      tasks
    });
  }

  function renderPlanPapers() {
    const box = $('#plan-papers');
    if (!box) return;
    if (!planPapers.length) {
      box.innerHTML = '<p class="hint">还没有练习卷。先去 <a href="library.html">组卷工作台</a> 生成并保存一份。</p>';
      return;
    }
    box.innerHTML = planPapers.map((paper) => (
      `<label class="plan-check">` +
        `<input type="checkbox" value="${S.escapeHtml(paper.id)}" ${planPaperIds.has(paper.id) ? 'checked' : ''}>` +
        `<span><strong>${S.escapeHtml(paper.title)}</strong>` +
        `<small>${S.escapeHtml(paper.grade || '未标注')} · ${paper.questionTotal || paper.total || 0} 题 · ${S.escapeHtml(S.fmtDate(paper.createdAt))}</small></span>` +
      `</label>`
    )).join('');
  }

  function renderPlanStudents() {
    const box = $('#plan-students');
    if (!box) return;
    const list = sortedStudents();
    if (!list.length) {
      box.innerHTML = '<p class="hint">还没有学生。</p>';
      return;
    }
    if (!planStudentIds) planStudentIds = new Set(list.map((student) => student.id));
    box.innerHTML = list.map((student) => {
      const level = clamp(Number(student.planLevel) || 5, 1, 10);
      const last = (student.levelHistory || [])[0];
      const history = last ? `<small class="plan-level-note">上次调整：${S.escapeHtml(last.reason || '')} → Lv.${level}</small>` : '';
      return `<div class="plan-student${student.accountType === 'trial' ? ' is-trial' : ''}" data-plan-student="${S.escapeHtml(student.id)}">` +
        `<label class="plan-student-check"><input type="checkbox" value="${S.escapeHtml(student.id)}" ${planStudentIds.has(student.id) ? 'checked' : ''}>` +
          `<span class="student-avatar">${S.escapeHtml(student.avatar || '🦊')}</span>` +
          `<span><strong>${S.escapeHtml(student.name)}</strong><small>${S.escapeHtml(student.id)} · ${S.escapeHtml(student.grade || '未标注')}${student.accountType === 'trial' ? ' · 体验' : ''}</small></span>` +
        `</label>` +
        `<div class="plan-level-control">` +
          `<button class="p-btn small ghost" type="button" data-plan-level="-1" aria-label="降低难度">−</button>` +
          `<span class="plan-level-value">Lv.${level}<small>${planLevelLabel(level)}</small></span>` +
          `<button class="p-btn small ghost" type="button" data-plan-level="1" aria-label="提高难度">＋</button>` +
        `</div>` +
        history +
      `</div>`;
    }).join('');
    updatePlanSelectedCount();
  }

  function updatePlanSelectedCount() {
    const count = $$('#plan-students input[type="checkbox"]:checked').length;
    const el = $('#plan-selected-count');
    if (el) el.textContent = `已选 ${count} 人`;
    const generate = $('#plan-generate');
    if (generate) generate.disabled = !count || !planPaperIds.size;
  }

  function renderPlanWordSource() {
    const select = $('#plan-word-source');
    if (!select) return;
    const list = wordAssignments().filter((assignment) => (assignment.words || []).length >= 8);
    const current = select.value;
    select.innerHTML = '<option value="">不加单词日，7 天都练题</option>' +
      list.slice(0, 20).map((assignment) => (
        `<option value="${S.escapeHtml(assignment.id)}">${S.escapeHtml(assignment.title)} · ${(assignment.words || []).length} 词</option>`
      )).join('');
    if (list.some((assignment) => assignment.id === current)) select.value = current;
  }

  function renderPlanList() {
    const box = $('#plan-list');
    if (!box) return;
    const list = (data.plans || []).filter((plan) => plan.kind !== 'grammar' && plan.kind !== 'book').slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    if (!list.length) {
      box.innerHTML = emptyState('还没有周计划', '选好材料和学生后，点“生成本周任务码”。');
      return;
    }
    box.innerHTML = list.slice(0, 20).map((plan) => {
      const student = getStudent(plan.studentId);
      const days = (plan.days || []).map((day) => (
        `<span class="plan-day-chip ${day.kind === 'words' ? 'is-words' : ''}">D${day.day}<b>${day.kind === 'words' ? `${day.wordTotal || (day.words || []).length} 词` : `${day.questionTotal} 题`}</b></span>`
      )).join('');
      return `<article class="plan-card" data-plan-id="${S.escapeHtml(plan.id)}">` +
        `<div class="plan-card-main">` +
          `<h4>${S.escapeHtml(plan.title)}</h4>` +
          `<p>${S.escapeHtml(student ? `${student.name} · ${student.id}` : plan.studentId)} · Lv.${plan.level || 5} · 从 ${S.escapeHtml(S.fmtDate(plan.weekStart))} 起</p>` +
          `<div class="plan-day-chips">${days}</div>` +
        `</div>` +
        `<div class="plan-card-actions">` +
          `<button class="p-btn small" type="button" data-plan-action="codes">周计划码</button>` +
          `<button class="p-btn small ghost" type="button" data-plan-action="delete">删除</button>` +
        `</div>` +
      `</article>`;
    }).join('');
  }

  function renderPlanTab() {
    renderPlanPapers();
    renderPlanStudents();
    renderPlanWordSource();
    renderPlanList();
    const start = $('#plan-week-start');
    if (start && !start.value) start.value = S.todayIso();
  }

  async function loadPlanPapers() {
    const box = $('#plan-papers');
    if (box) box.innerHTML = '<p class="hint">正在读取资料库…</p>';
    planPapers = await loadPapers();
    const valid = new Set(planPapers.map((paper) => paper.id));
    planPaperIds = new Set(Array.from(planPaperIds).filter((id) => valid.has(id)));
    if (!planPaperIds.size) planPapers.slice(0, 2).forEach((paper) => planPaperIds.add(paper.id));
    renderPlanPapers();
    updatePlanSelectedCount();
  }

  async function generateWeeklyPlan() {
    const weekStart = ($('#plan-week-start') || {}).value || S.todayIso();
    const selectedPapers = planPapers.filter((paper) => planPaperIds.has(paper.id));
    if (!selectedPapers.length) { S.toast('至少选一份练习卷。', 'error'); return; }
    const studentIds = $$('#plan-students input[type="checkbox"]:checked').map((input) => input.value);
    if (!studentIds.length) { S.toast('至少勾选一位学生。', 'error'); return; }
    const wordSourceId = ($('#plan-word-source') || {}).value || '';
    const wordAssignment = wordAssignments().find((assignment) => assignment.id === wordSourceId) || null;
    const students = studentIds.map(getStudent).filter(Boolean);
    const missingPin = students.find((student) => !student.pin);
    if (missingPin) { S.toast(`${missingPin.name} 还没有密码，无法生成任务码。`, 'error'); return; }
    const plans = [];
    for (const student of students) {
      const plan = buildStudentPlan(student, weekStart, selectedPapers, wordAssignment, student.planLevel || 5);
      if (!plan) { S.toast(`${student.name} 没有可用题目，已跳过。`, 'error', 5000); continue; }
      data.plans = (data.plans || []).filter((item) => !(item.studentId === student.id && item.weekStart === weekStart));
      data.plans.unshift(plan);
      plans.push(plan);
    }
    if (!plans.length) return;
    save();
    renderPlanList();
    S.toast(`已生成 ${plans.length} 份周计划，正在生成周计划码…`, 'ok');
    await showPlanCodes(plans);
  }

  async function showPlanCodes(plans) {
    const items = [];
    for (const plan of plans) {
      const student = getStudent(plan.studentId);
      if (!student) continue;
      try {
        const code = await planCodeFor(plan, student);
        items.push({ student, code, plan });
      } catch (error) {
        items.push({ student, code: '', plan, error: error.message || '生成失败' });
      }
    }
    lastCodes = items;
    const title = $('#codes-title');
    const sub = $('#codes-sub');
    const isGrammar = plans.some((plan) => plan.kind === 'grammar');
    const isBook = plans.some((plan) => plan.kind === 'book');
    if (title) title.textContent = isBook ? '词汇书周任务码' : isGrammar ? '语法打卡码' : '周计划码';
    if (sub) sub.textContent = isBook
      ? '一位学生一码：每个任务栏是一天，单词和语法可以混排。学生每天完成当天任务，第二天自动解锁；每天生成“今日汇报码”发给你。'
      : isGrammar
        ? '一位学生一码，一份码里含 7 天语法课。学生导入后每天完成当天，第二天自动解锁；也可以点“多学一天”。'
        : '一位学生一码，一份码里含 7 天任务。学生导入后每天自动解锁一天，也可以点“多学一天”提前学下一天。';
    $('#codes-list').innerHTML = items.map((item, index) => {
      if (!item.code) {
        return `<div class="code-card"><div class="code-card-head"><strong>${S.escapeHtml(item.student.name)} · ${S.escapeHtml(item.student.id)}</strong></div>` +
          `<p class="hint warn">${S.escapeHtml(item.error)}</p></div>`;
      }
      const dayCount = (item.plan.days || []).length;
      const kindLabel = item.plan.kind === 'grammar' ? '语法' : 'Lv.' + item.plan.level;
      return `<div class="code-card">` +
        `<div class="code-card-head">` +
          `<div><strong>${S.escapeHtml(item.student.name)}</strong> <span>${S.escapeHtml(item.student.id)} · ${dayCount} 天 · ${S.escapeHtml(kindLabel)}</span></div>` +
          codeCardButtons(item, index) +
        `</div>` +
        codeTextareaHtml(item.code) +
      `</div>`;
    }).join('');
    S.openDialog($('#codes-dialog'));
  }

  async function openPlanCodes(planId) {
    const plan = (data.plans || []).find((item) => item.id === planId);
    if (!plan) return;
    await showPlanCodes([plan]);
  }

  /* ------------------------------- 周计划：难度自动调整 ------------------------------- */

  function adjustLevelFromTasks(student, tasks) {
    const scored = (tasks || [])
      .filter((task) => hasScore(task))
      .sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')))
      .slice(0, 5);
    if (!scored.length) return null;
    const avg = mean(scored.map((task) => Number(task.score)));
    const lowIntegrity = scored.some((task) => task.integrityScore != null && Number(task.integrityScore) < 45);
    const before = clamp(Number(student.planLevel) || 5, 1, 10);
    let after = before;
    let reason = '';
    if (lowIntegrity) {
      reason = '有疑似乱选记录，先不提高难度';
    } else if (avg >= 90 && scored.every((task) => Number(task.score) >= 80) && before < 10) {
      after = before + 1;
      reason = `平均 ${Math.round(avg)} 分，稳定达标`;
    } else if (avg < 62 || scored.some((task) => Number(task.score) < 45)) {
      if (before > 1) {
        after = before - 1;
        reason = `平均 ${Math.round(avg)} 分，先降一档稳住`;
      } else {
        reason = `平均 ${Math.round(avg)} 分，已在最低档`;
      }
    } else {
      reason = `平均 ${Math.round(avg)} 分，保持当前档`;
    }
    if (after !== before) {
      student.planLevel = after;
    } else {
      student.planLevel = before;
    }
    student.levelHistory = student.levelHistory || [];
    student.levelHistory.unshift({
      at: S.nowIso(),
      before,
      after,
      avgScore: Math.round(avg),
      reason
    });
    student.levelHistory = student.levelHistory.slice(0, 30);
    return { before, after, avg: Math.round(avg), reason };
  }

  /* ------------------------------- 60 天语法小营 ------------------------------- */

  function grammarPlans() {
    return (data.plans || []).filter((plan) => plan.kind === 'grammar');
  }

  function grammarDoneDays(student) {
    const set = new Set();
    ((student && student.tasks) || []).forEach((task) => {
      if (task && task.mode === 'grammar' && task.status === 'done') {
        const day = Number(task.grammarDay);
        if (day >= 1 && day <= G.total) set.add(day);
      }
    });
    return set;
  }

  function nextGrammarDay(student) {
    const done = grammarDoneDays(student);
    let day = 1;
    while (day <= G.total && done.has(day)) day += 1;
    return day;
  }

  function grammarPlanDone(plan, student) {
    if (!student) return 0;
    const done = grammarDoneDays(student);
    return (plan.days || []).filter((day) => done.has(Number(day.grammarDay))).length;
  }

  function renderGrammarMap() {
    const box = $('#grammar-map');
    if (!box) return;
    box.innerHTML = G.units.map((unit) => {
      const lessons = G.lessons.filter((lesson) => lesson.day >= unit.range[0] && lesson.day <= unit.range[1]);
      return `<div class="grammar-unit" style="--unit:${unit.color}">` +
        `<div class="grammar-unit-head">` +
          `<span>${S.escapeHtml(unit.name)}</span>` +
          `<small>D${unit.range[0]}–D${unit.range[1]} · ${S.escapeHtml(unit.note)}</small>` +
        `</div>` +
        `<div class="grammar-day-grid">` +
          lessons.map((lesson) => (
            `<button class="grammar-day-card" type="button" data-grammar-preview="${lesson.day}" style="--unit:${unit.color}">` +
              `<b>D${lesson.day}</b>` +
              `<strong>${S.escapeHtml(lesson.title)}</strong>` +
              `<small>${S.escapeHtml(lesson.subtitle)}</small>` +
            `</button>`
          )).join('') +
        `</div>` +
      `</div>`;
    }).join('');
  }

  function openGrammarPreview(day) {
    const lesson = G.lessonByDay(day);
    if (!lesson) return;
    const title = $('#grammar-preview-title');
    const body = $('#grammar-preview-body');
    if (title) title.textContent = `D${lesson.day} · ${lesson.title}`;
    if (!body) return;
    const tokens = (lesson.tokens || []).map(([text, role]) => (
      `<span class="g-token role-${G.roleClass(role)}"><b>${S.escapeHtml(text)}</b><small>${S.escapeHtml(role)}</small></span>`
    )).join('');
    body.innerHTML = `<div class="grammar-preview">` +
      `<div class="grammar-preview-meta"><span class="grammar-unit-pill" style="--unit:${lesson.unitColor}">${S.escapeHtml(lesson.unit)}</span><span>第 ${lesson.day} / ${G.total} 天</span></div>` +
      `<p class="grammar-preview-scene">${S.escapeHtml(lesson.scene)}</p>` +
      `<div class="g-sentence static">${tokens}</div>` +
      `<p class="grammar-preview-translation">${S.escapeHtml(lesson.translation)}</p>` +
      `<div class="g-rule"><b>今日规则</b><p>${S.escapeHtml(lesson.rule)}</p><small>${S.escapeHtml(lesson.tip)}</small></div>` +
      `<h4>学生会做的 5 关</h4>` +
      `<ol class="grammar-preview-steps">` +
        `<li>找骨架：${S.escapeHtml(lesson.questions[0].stem)}</li>` +
        `<li>懂意思：${S.escapeHtml(lesson.questions[1].stem)}</li>` +
        `<li>用规则：${S.escapeHtml(lesson.questions[2].stem)}</li>` +
        `<li>隔日复习：自动抽前面学过的一天</li>` +
        `<li>写一句：${S.escapeHtml(lesson.output.prompt)}</li>` +
      `</ol>` +
      `<p class="hint">参考写法：${S.escapeHtml(lesson.output.sample)}</p>` +
    `</div>`;
    S.openDialog($('#grammar-preview-dialog'));
  }

  function renderGrammarStudents() {
    const box = $('#grammar-students');
    if (!box) return;
    const list = sortedStudents();
    if (!list.length) {
      box.innerHTML = '<p class="hint">还没有学生。先到“学生”页添加。</p>';
      return;
    }
    if (!grammarStudentIds) grammarStudentIds = new Set(list.map((student) => student.id));
    box.innerHTML = list.map((student) => {
      const done = grammarDoneDays(student).size;
      const next = nextGrammarDay(student);
      const finished = done >= G.total;
      const status = finished ? '60 天已完成' : `已学 ${done} 天 · 下一课 D${next}`;
      return `<label class="grammar-student${finished ? ' is-finished' : ''}">` +
        `<input type="checkbox" value="${S.escapeHtml(student.id)}" ${grammarStudentIds.has(student.id) && !finished ? 'checked' : ''} ${finished ? 'disabled' : ''}>` +
        `<span class="student-avatar">${S.escapeHtml(student.avatar || '🦊')}</span>` +
        `<span class="grammar-student-copy"><strong>${S.escapeHtml(student.name)}</strong>` +
          `<small>${S.escapeHtml(student.id)} · ${S.escapeHtml(student.grade || '未标注')} · ${status}</small>` +
          `<span class="grammar-mini-track"><i style="width:${Math.round((done / G.total) * 100)}%"></i></span>` +
        `</span>` +
      `</label>`;
    }).join('');
    updateGrammarSelectedCount();
  }

  function updateGrammarSelectedCount() {
    const count = $$('#grammar-students input[type="checkbox"]:checked').length;
    const el = $('#grammar-selected-count');
    if (el) el.textContent = `已选 ${count} 人`;
    const button = $('#grammar-generate');
    if (button) button.disabled = !count;
  }

  function buildGrammarPlan(student, startDay, weekStart) {
    const planId = S.uid('GP');
    const days = [];
    for (let index = 0; index < 7; index += 1) {
      const dayNumber = Number(startDay) + index;
      if (dayNumber > G.total) break;
      const lesson = G.lessonByDay(dayNumber);
      if (!lesson) break;
      const reviewLesson = G.lessonByDay(G.reviewDayFor(dayNumber));
      days.push({
        day: index + 1,
        date: S.addDays(weekStart, index),
        kind: 'grammar',
        taskId: `${planId}-D${index + 1}`,
        title: `第 ${lesson.day} 天 · ${lesson.title}`,
        grammarDay: lesson.day,
        lesson: G.summary(lesson),
        blocks: G.buildBlocks(lesson, reviewLesson),
        questionTotal: 5,
        xp: clamp(55 + lesson.day * 2, 60, 150)
      });
    }
    return {
      id: planId,
      kind: 'grammar',
      studentId: student.id,
      studentName: student.name,
      weekStart,
      title: `60 天语法小营 · ${student.name}`,
      level: 0,
      createdAt: S.nowIso(),
      days
    };
  }

  async function generateGrammarPacks() {
    if (!G) { S.toast('语法课程没有加载成功，请刷新页面。', 'error'); return; }
    const studentIds = $$('#grammar-students input[type="checkbox"]:checked').map((input) => input.value);
    if (!studentIds.length) { S.toast('至少勾选一位学生。', 'error'); return; }
    const students = studentIds.map(getStudent).filter(Boolean);
    const missingPin = students.find((student) => !student.pin);
    if (missingPin) { S.toast(`${missingPin.name} 还没有密码，无法生成打卡码。`, 'error'); return; }
    const mode = ($('#grammar-start-mode') || {}).value || 'auto';
    const fixedStart = Number(mode);
    const weekStart = ($('#grammar-week-start') || {}).value || S.todayIso();
    const plans = [];
    students.forEach((student) => {
      const start = mode === 'auto' ? nextGrammarDay(student) : clamp(fixedStart, 1, G.total);
      if (start > G.total) { S.toast(`${student.name} 已经学完 60 天，已跳过。`, 'ok'); return; }
      const plan = buildGrammarPlan(student, start, weekStart);
      if (!plan.days.length) { S.toast(`${student.name} 没有可发的语法课，已跳过。`, 'error'); return; }
      data.plans.unshift(plan);
      plans.push(plan);
    });
    if (!plans.length) return;
    save();
    renderGrammarList();
    renderGrammarStudents();
    S.toast(`已生成 ${plans.length} 份语法小营，正在生成打卡码…`, 'ok');
    await showPlanCodes(plans);
  }

  function renderGrammarList() {
    const box = $('#grammar-list');
    if (!box || !G) return;
    const list = grammarPlans().slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    if (!list.length) {
      box.innerHTML = emptyState('还没有语法小营', '在右边勾选学生，点“生成 7 天打卡码”。一份码含 7 天，学生每天自动解锁一天。');
      return;
    }
    box.innerHTML = list.slice(0, 24).map((plan) => {
      const student = getStudent(plan.studentId);
      const done = grammarPlanDone(plan, student);
      const total = (plan.days || []).length;
      const firstDay = plan.days && plan.days.length ? plan.days[0].grammarDay : 1;
      const lastDay = plan.days && plan.days.length ? plan.days[plan.days.length - 1].grammarDay : 1;
      const state = done >= total ? '已完成' : `已完成 ${done}/${total} 天`;
      return `<article class="grammar-pack" data-grammar-plan="${S.escapeHtml(plan.id)}">` +
        `<div class="grammar-pack-main">` +
          `<h4>${S.escapeHtml(student ? student.name : plan.studentName)} · D${firstDay}–D${lastDay}</h4>` +
          `<p>${S.escapeHtml(student ? student.id : plan.studentId)} · ${S.escapeHtml(S.fmtDate(plan.weekStart))} 起 · ${state}</p>` +
          `<div class="grammar-pack-track"><i style="width:${total ? Math.round((done / total) * 100) : 0}%"></i></div>` +
        `</div>` +
        `<div class="grammar-pack-actions">` +
          `<button class="p-btn small" type="button" data-grammar-action="codes">打卡码</button>` +
          `<button class="p-btn small ghost" type="button" data-grammar-action="delete">删除</button>` +
        `</div>` +
      `</article>`;
    }).join('');
  }

  function renderGrammarTab() {
    renderGrammarMap();
    renderGrammarStudents();
    renderGrammarList();
    const start = $('#grammar-week-start');
    if (start && !start.value) start.value = S.todayIso();
  }

  async function openGrammarPlanCodes(planId) {
    const plan = (data.plans || []).find((item) => item.id === planId && item.kind === 'grammar');
    if (!plan) return;
    await showPlanCodes([plan]);
  }

  function deleteGrammarPlan(planId) {
    const plan = (data.plans || []).find((item) => item.id === planId && item.kind === 'grammar');
    if (!plan) return;
    if (!window.confirm(`删除 ${plan.title}？已经发出去的任务码仍然可用。`)) return;
    data.plans = data.plans.filter((item) => item.id !== planId);
    save();
    renderGrammarList();
  }

  /* ------------------------------- 体验卡 ------------------------------- */

  function trialStudentsList() {
    return sortedStudents().filter((student) => student.accountType === 'trial');
  }

  function renderTrialTab() {
    const box = $('#trial-students');
    if (!box) return;
    const list = trialStudentsList();
    const count = $('#trial-count');
    if (count) count.textContent = `${list.length} 人`;
    if (!list.length) {
      box.innerHTML = emptyState('还没有体验学生', '添加学生时把账户类型设为“体验学生”，开通码就会带上体验期。');
      return;
    }
    box.innerHTML = list.map((student) => {
      const profile = student.profile || {};
      const expires = profile.trialExpiresAt || '';
      const daysLeft = expires ? Math.round((new Date(`${expires}T23:59:59`).getTime() - Date.now()) / 86400000) : null;
      const status = !expires ? '待学生汇报' : daysLeft < 0 ? `已到期 ${Math.abs(daysLeft)} 天` : `还剩 ${daysLeft} 天`;
      const request = student.trialRequestAt ? `<small>最近申请：${S.escapeHtml(S.fmtDateTime(student.trialRequestAt))}</small>` : '';
      return `<div class="trial-student" data-trial-student="${S.escapeHtml(student.id)}">` +
        `<div class="trial-student-main">` +
          `<span class="student-avatar">${S.escapeHtml(student.avatar || '🦊')}</span>` +
          `<div><strong>${S.escapeHtml(student.name)}</strong>` +
          `<small>${S.escapeHtml(student.id)} · ${S.escapeHtml(student.grade || '未标注')} · 到期 ${S.escapeHtml(expires || '未知')}</small>${request}</div>` +
        `</div>` +
        `<span class="trial-state ${daysLeft != null && daysLeft < 0 ? 'expired' : ''}">${S.escapeHtml(status)}</span>` +
        `<div class="trial-student-actions">` +
          `<button class="p-btn small ghost" type="button" data-trial-action="extend" data-days="3">+3 天</button>` +
          `<button class="p-btn small ghost" type="button" data-trial-action="extend" data-days="7">+7 天</button>` +
          `<button class="p-btn small ghost" type="button" data-trial-action="extend" data-days="30">+30 天</button>` +
          `<button class="p-btn small" type="button" data-trial-action="upgrade">转正式</button>` +
        `</div>` +
      `</div>`;
    }).join('');
  }

  async function parseTrialRequest() {
    const raw = ($('#trial-request-input') || {}).value.trim();
    const result = $('#trial-request-result');
    const grantBtn = $('#trial-grant-btn');
    if (!raw) { S.toast('先粘贴学生发来的延长申请码。', 'error'); return; }
    let payload;
    try {
      payload = await S.unpackCode(raw);
    } catch (error) {
      S.toast(error.message || '申请码无法识别。', 'error', 5000);
      return;
    }
    if (!payload || payload.kind !== 'trial-request') { S.toast('这不是延长申请码。', 'error'); return; }
    const student = getStudent(payload.studentId);
    if (!student) { S.toast(`名册里没有学号 ${payload.studentId}。`, 'error'); return; }
    const auth = await S.sha256Hex(`${student.id}|${student.pin}|trial-request|${payload.expiresAt}`);
    if (!S.authMatches(payload.auth, auth)) { S.toast('申请码校验失败，可能不是这个学生发来的。', 'error', 7000); return; }
    trialRequestPayload = payload;
    planRequestStudentId = student.id;
    student.trialRequestAt = payload.requestedAt || S.nowIso();
    save();
    if (result) result.innerHTML = `<b>${S.escapeHtml(student.name)} · ${S.escapeHtml(student.id)}</b>` +
      `<span>当前到期：${S.escapeHtml(payload.expiresAt || '未知')} · 申请时间：${S.escapeHtml(S.fmtDateTime(payload.requestedAt))}</span>`;
    if (grantBtn) grantBtn.disabled = false;
    renderTrialTab();
    S.toast('申请码校验通过，可以生成延长码。', 'ok');
  }

  async function buildExtendCode(student, days) {
    const auth = S.authCode(await S.sha256Hex(`${student.id}|${student.pin}|extend|${days}`));
    return S.packCode({
      v: 1,
      kind: 'extend',
      studentId: student.id,
      studentName: student.name,
      days,
      teacherName: data.teacherName || '阮老师',
      createdAt: S.nowIso(),
      auth
    });
  }

  async function grantTrial(studentId, days) {
    const student = getStudent(studentId);
    if (!student) return;
    if (!student.pin) { S.toast('这个学生没有登记密码，无法生成延长码。', 'error'); return; }
    const code = await buildExtendCode(student, days);
    const output = $('#trial-grant-output');
    if (output) output.value = code;
    const copyBtn = $('#trial-copy-grant');
    if (copyBtn) copyBtn.disabled = false;
    try {
      await S.copyText(code);
      S.toast(`${student.name} 的 ${days} 天延长码已生成并复制。`, 'ok', 5000);
    } catch (error) {
      S.toast('延长码已生成，请手动复制。', 'ok');
    }
  }

  async function upgradeTrialStudent(studentId) {
    const student = getStudent(studentId);
    if (!student) return;
    if (!student.pin) { S.toast('这个学生没有登记密码，无法生成转正码。', 'error'); return; }
    if (!window.confirm(`把 ${student.name} 转为正式学生？会生成一个转正码，学生使用后不再受体验期限制。`)) return;
    const auth = S.authCode(await S.sha256Hex(`${student.id}|${student.pin}|upgrade`));
    const code = await S.packCode({
      v: 1,
      kind: 'upgrade',
      studentId: student.id,
      studentName: student.name,
      teacherName: data.teacherName || '阮老师',
      createdAt: S.nowIso(),
      auth
    });
    const output = $('#trial-grant-output');
    if (output) output.value = code;
    const copyBtn = $('#trial-copy-grant');
    if (copyBtn) copyBtn.disabled = false;
    try { await S.copyText(code); S.toast('转正码已生成并复制，发给学生使用。', 'ok', 5500); } catch (error) { S.toast('转正码已生成，请手动复制。', 'ok'); }
  }

  /* ------------------------------- 单词打卡：发布 ------------------------------- */

  function wordAssignments() {
    return (data.assignments || []).filter((assignment) => assignment.kind === 'words');
  }

  function wordAssignmentStats(assignment) {
    const rows = (assignment.studentIds || []).map((id) => {
      const student = getStudent(id);
      const tasks = student
        ? (student.tasks || []).filter((item) => item.status === 'done' && (item.id === assignment.id || item.assignmentId === assignment.id))
        : [];
      const words = [];
      tasks.forEach((task) => (task.wordStats || []).forEach((word) => words.push(word)));
      const scores = tasks.map((task) => Number(task.score)).filter((value) => Number.isFinite(value));
      const task = tasks.length
        ? {
            ...tasks[0],
            score: scores.length ? Math.round(mean(scores)) : null,
            correct: words.filter((word) => word.ok).length,
            total: words.length,
            wordStats: words
          }
        : null;
      return { student, task, tasks, words };
    });
    const done = rows.filter((row) => row.task);
    const scores = [];
    done.forEach((row) => row.tasks.forEach((task) => {
      const value = Number(task.score);
      if (Number.isFinite(value)) scores.push(value);
    }));
    const wrongMap = new Map();
    done.forEach((row) => {
      row.words.filter((word) => !word.ok).forEach((word) => {
        const key = String(word.w || '').toLowerCase();
        if (!key) return;
        const item = wrongMap.get(key) || { w: word.w, zh: word.zh || '', count: 0 };
        item.count += 1;
        wrongMap.set(key, item);
      });
    });
    const wrong = Array.from(wrongMap.values()).sort((a, b) => b.count - a.count).slice(0, 12);
    const totalTasks = assignment.bookMode
      ? (assignment.slotCount || (assignment.slots || []).length || 1) * rows.length
      : rows.length;
    const doneTasks = done.reduce((sum, row) => sum + (assignment.bookMode ? row.tasks.length : 1), 0);
    return {
      rows,
      total: rows.length,
      done: done.length,
      doneTasks,
      totalTasks,
      completion: totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0,
      avgScore: scores.length ? Math.round(mean(scores)) : null,
      wrong
    };
  }

  function completionStars(percent, accuracy) {
    let stars = 1;
    if (percent >= 95 && (accuracy == null || accuracy >= 90)) stars = 5;
    else if (percent >= 85 && (accuracy == null || accuracy >= 80)) stars = 4;
    else if (percent >= 65) stars = 3;
    else if (percent >= 35) stars = 2;
    return stars;
  }

  function renderWords() {
    const listEl = $('#word-list');
    if (!listEl) return;
    const list = wordAssignments().slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const allStats = list.map((assignment) => ({ assignment, stats: wordAssignmentStats(assignment) }));
    const totalWords = list.reduce((sum, assignment) => sum + (assignment.wordTotal || (assignment.words || []).length), 0);
    const participants = new Set();
    list.forEach((assignment) => (assignment.studentIds || []).forEach((id) => participants.add(id)));
    const doneCount = allStats.reduce((sum, item) => sum + item.stats.done, 0);
    const expected = allStats.reduce((sum, item) => sum + item.stats.total, 0);
    const scores = [];
    allStats.forEach((item) => item.stats.rows.forEach((row) => {
      if (row.task && Number.isFinite(Number(row.task.score))) scores.push(Number(row.task.score));
    }));

    const statsEl = $('#word-stats');
    if (statsEl) {
      statsEl.innerHTML =
        `<div class="word-dash-tile" style="--tile-color:var(--red)"><b>${list.length}</b><span>单词任务</span></div>` +
        `<div class="word-dash-tile" style="--tile-color:var(--gold)"><b>${participants.size}</b><span>参与学生</span></div>` +
        `<div class="word-dash-tile" style="--tile-color:var(--blue)"><b>${doneCount} / ${expected}</b><span>已交汇报</span></div>` +
        `<div class="word-dash-tile" style="--tile-color:var(--green)"><b>${scores.length ? Math.round(mean(scores)) + '%' : '—'}</b><span>一次答对率</span></div>`;
    }

    if (!list.length) {
      listEl.innerHTML = emptyState('还没有单词打卡', '点右上角“发布单词任务”：粘贴一本单词书，或从资料库的文章里提取生词，再发给学生。');
      return;
    }

    listEl.innerHTML = allStats.map(({ assignment, stats }) => {
      const total = (assignment.studentIds || []).length;
      const percent = assignment.bookMode ? stats.completion : (total ? Math.round((stats.done / total) * 100) : 0);
      const overdue = assignment.due && assignment.due < S.todayIso();
      const wrongHtml = stats.wrong.length
        ? `高频错词：${stats.wrong.slice(0, 8).map((word) => `<span class="word-wrong-chip">${S.escapeHtml(word.w)}${word.count > 1 ? ` ×${word.count}` : ''}</span>`).join('')}`
        : '还没有收到汇报，交回后这里会出现高频错词。';
      const stars = completionStars(percent, stats.avgScore);
      const starHtml = assignment.bookMode
        ? `<div class="word-stars" title="完成度与正确率综合星级"><span>${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</span><b>${percent}%</b></div>`
        : '';
      return `<article class="assignment-card word" data-word-id="${S.escapeHtml(assignment.id)}">` +
        `<div class="assignment-main">` +
          `<h3>${S.escapeHtml(assignment.title)}<span class="word-badge">${assignment.bookMode ? 'BOOK' : 'WORD'}</span>${starHtml}</h3>` +
          `<div class="assignment-meta">` +
            `<span>${assignment.wordTotal || (assignment.words || []).length} 词</span>` +
            (assignment.bookMode ? `<span>${assignment.slotCount || (assignment.slots || []).length} 个任务栏</span>` : '') +
            `<span>经验 <b>+${assignment.xp || 80}</b></span>` +
            `<span style="${overdue ? 'color:var(--red-bright);' : ''}">截止 ${assignment.due ? S.escapeHtml(S.fmtDate(assignment.due)) : '未设置'}${overdue ? '（已过）' : ''}</span>` +
            `<span>${stats.avgScore == null ? '平均正确率 —' : `平均正确率 ${stats.avgScore}%`}</span>` +
          `</div>` +
          `<div class="word-wrong-line">${wrongHtml}</div>` +
        `</div>` +
        `<div class="assignment-progress">` +
          `<div class="progress-label"><span>${assignment.bookMode ? `任务完成 ${stats.doneTasks} / ${stats.totalTasks}` : '已交汇报'}</span><b>${assignment.bookMode ? `${stats.done} / ${total} 人` : `${stats.done} / ${total}`}</b></div>` +
          `<div class="mini-track"><i style="width:${percent}%"></i></div>` +
        `</div>` +
        `<div class="assignment-actions">` +
          `<button class="p-btn small" type="button" data-word-action="codes">任务码</button>` +
          `<button class="p-btn small ghost" type="button" data-word-action="detail">学情</button>` +
          (assignment.bookMode ? `<button class="p-btn small ghost" type="button" data-word-action="continue">续编下周</button>` : '') +
          `<button class="p-btn small ghost" type="button" data-word-action="delete">删除</button>` +
        `</div>` +
      `</article>`;
    }).join('');
  }

  function renderWordStudents() {
    const list = sortedStudents();
    const box = $('#word-students');
    if (!box) return;
    if (!list.length) {
      box.innerHTML = '<p class="hint">还没有学生。先在“学生”里添加。</p>';
      return;
    }
    box.innerHTML = list.map((student) => (
      `<label class="check-chip">` +
        `<input type="checkbox" name="word-student" value="${S.escapeHtml(student.id)}" ${wordAssignStudentId ? (student.id === wordAssignStudentId ? 'checked' : '') : 'checked'}>` +
        `${S.escapeHtml(student.avatar)} ${S.escapeHtml(student.name)}` +
      `</label>`
    )).join('');
  }

  function setWordSource(mode) {
    wordSourceMode = mode;
    $$('.word-source-tab').forEach((button) => button.classList.toggle('active', button.dataset.wordSource === mode));
    $$('.word-source-pane').forEach((pane) => pane.classList.toggle('active', pane.dataset.wordPane === mode));
    if (mode === 'library' && !wordMaterials.length) loadWordMaterials();
  }

  function renderWordMaterials() {
    const select = $('#word-material');
    const status = $('#word-material-status');
    if (!select) return;
    if (!wordMaterials.length) {
      select.innerHTML = '<option value="">资料库还没有可提取的文章</option>';
      if (status) status.textContent = '先去组卷工作台保存一份阅读、完形或试卷，再回来提取。';
      return;
    }
    select.innerHTML = wordMaterials.map((material) => (
      `<option value="${S.escapeHtml(material.id)}">${S.escapeHtml(material.title || '未命名资料')} · ${S.escapeHtml(TYPE_LABELS[material.type] || material.type || '资料')}</option>`
    )).join('');
    if (status) status.textContent = `已读取 ${wordMaterials.length} 份资料。提取会跳过常见虚词，最多取 40 个词。`;
  }

  function openWordDialog(studentId) {
    wordAssignStudentId = studentId || null;
    wordDraft = [];
    wordSourceMode = 'paste';
    $('#word-title').value = '';
    $('#word-due').value = S.addDays(S.todayIso(), 7);
    $('#word-xp').value = '80';
    $('#word-input').value = '';
    $('#word-preview').innerHTML = '<p class="hint">粘贴单词后点“生成预览”，会从本机释义库补全音标和中文意思。</p>';
    $('#word-build-count').textContent = '0 个词';
    $('#word-glossary-status').textContent = '正在读取本机释义库…';
    $('#word-foot-hint').textContent = '至少 4 个词，才能生成选项。';
    $$('.word-source-tab').forEach((button) => button.classList.toggle('active', button.dataset.wordSource === 'paste'));
    $$('.word-source-pane').forEach((pane) => pane.classList.toggle('active', pane.dataset.wordPane === 'paste'));
    renderWordStudents();
    S.openDialog($('#word-dialog'));
    loadGlossary().then((glossary) => {
      const count = Object.keys(glossary).length;
      $('#word-glossary-status').textContent = count
        ? `本机释义库已就绪（${count.toLocaleString()} 个词条）。点“生成预览”即可自动补全。`
        : '释义库没有读到（可能是离线打开）。请在每行单词后面手动写中文意思。';
    });
  }

  async function extractWordsFromMaterial() {
    const select = $('#word-material');
    const id = select && select.value;
    if (!id) { S.toast('资料库里没有可提取的文章。', 'error'); return; }
    const material = wordMaterials.find((item) => item.id === id);
    if (!material) return;
    const status = $('#word-material-status');
    if (status) status.textContent = '正在提取生词…';
    const glossary = await loadGlossary();
    const textParts = [material.text || ''];
    if (Array.isArray(material.body)) textParts.push(material.body.join('\n'));
    else if (material.body) textParts.push(String(material.body));
    if (Array.isArray(material.items)) {
      material.items.forEach((item) => textParts.push(item.content || '', item.passage || ''));
    }
    const words = extractWordsFromText(textParts.join('\n'), glossary);
    if (words.length < 4) {
      S.toast('这篇文章里可提取的生词太少，换一篇或直接粘贴单词书。', 'error', 5000);
      if (status) status.textContent = '可提取的词不足 4 个。';
      return;
    }
    $('#word-input').value = words.map((word) => word.w).join('\n');
    if (status) status.textContent = `已提取 ${words.length} 个词，已填入“粘贴单词书”，可以继续删改。`;
    setWordSource('paste');
    await buildWordPreview();
    const titleInput = $('#word-title');
    if (titleInput && !titleInput.value.trim()) {
      titleInput.value = `${material.title || '资料'} · 生词打卡`;
    }
  }

  function renderWordPreview() {
    const box = $('#word-preview');
    if (!box) return;
    if (!wordDraft.length) {
      box.innerHTML = '<p class="hint">还没有预览。粘贴单词后点“生成预览”。</p>';
      updateWordDraftCount();
      return;
    }
    box.innerHTML = wordDraft.map((word, index) => {
      const missing = !String(word.zh || '').trim();
      const hasExample = Boolean(String(word.ex || '').trim());
      return `<div class="word-preview-row ${missing ? 'missing' : ''}" data-word-row="${index}">` +
        `<span class="word-index">${String(index + 1).padStart(2, '0')}</span>` +
        `<span class="word-en">${S.escapeHtml(word.w)}${hasExample ? ' <span class="word-context-badge">语境</span>' : ''}</span>` +
        `<span class="word-phon" title="${S.escapeHtml(word.kk || '')}">${S.escapeHtml(word.kk || '—')}</span>` +
        `<input type="text" value="${S.escapeHtml(word.zh || '')}" data-word-meaning="${index}" placeholder="补一个中文释义" aria-label="${S.escapeHtml(word.w)} 的中文释义">` +
        `<button class="word-remove" type="button" data-word-remove="${index}" aria-label="移除 ${S.escapeHtml(word.w)}">×</button>` +
        `<details class="word-example-box" ${hasExample ? 'open' : ''}>` +
          `<summary>${hasExample ? '语境例句（可修改）' : '＋ 添加语境例句（可选）'}</summary>` +
          `<div class="word-example-fields">` +
            `<input type="text" value="${S.escapeHtml(word.ex || '')}" data-word-ex="${index}" placeholder="含这个单词的英文句子" aria-label="${S.escapeHtml(word.w)} 的英文例句">` +
            `<input type="text" value="${S.escapeHtml(word.exZh || '')}" data-word-ex-zh="${index}" placeholder="例句中文翻译（可选）" aria-label="${S.escapeHtml(word.w)} 例句的中文翻译">` +
          `</div>` +
        `</details>` +
      `</div>`;
    }).join('');
    updateWordDraftCount();
  }

  function updateWordDraftCount() {
    const missing = wordDraft.filter((word) => !String(word.zh || '').trim()).length;
    const countEl = $('#word-build-count');
    if (countEl) countEl.textContent = `${wordDraft.length} 个词`;
    const foot = $('#word-foot-hint');
    if (foot) {
      foot.textContent = wordDraft.length < 4
        ? '至少 4 个词，才能生成选项。'
        : missing
          ? `还有 ${missing} 个词没有释义，填好才能发布。`
          : '核对无误后，生成一人一码的任务码。';
    }
  }

  async function buildWordPreview() {
    const text = $('#word-input').value;
    const parsed = parseWordLines(text);
    if (!parsed.length) { S.toast('先粘贴至少一行单词。', 'error'); return; }
    if (parsed.length > 80) S.toast('一次最多 80 个词，已截取前 80 个。', 'error', 5000);
    const source = parsed.slice(0, 80);
    const glossary = await loadGlossary();
    const ranks = ensureGlossaryRanks(glossary);
    let filled = 0;
    let exampleCount = 0;
    wordDraft = source.map((word) => {
      const key = word.w.toLowerCase();
      const entry = glossary[key] || {};
      const bank = WORD_EXAMPLES[key] || {};
      const zh = word.zh ? S.simplifyMeaning(word.zh) : S.meaningFor(key, entry.zh || '');
      if (!word.zh && zh) filled += 1;
      const ex = String(word.ex || bank.ex || '').trim();
      const exZh = String(word.exZh || bank.exZh || '').trim();
      if (ex) exampleCount += 1;
      return {
        w: word.w,
        zh,
        kk: word.kk || entry.kk || '',
        pos: word.pos || entry.pos || '',
        ex,
        exZh,
        rank: ranks.has(key) ? ranks.get(key) : 99999
      };
    });
    renderWordPreview();
    const missing = wordDraft.filter((word) => !word.zh).length;
    const status = $('#word-glossary-status');
    const contextNote = exampleCount
      ? `其中 ${exampleCount} 个词有语境例句，会穿插“语境推词”题。`
      : '还没有语境例句，可以点“AI 补例句”或在预览里手动补，否则只出英译中题。';
    if (status) {
      status.textContent = missing
        ? `已自动补全 ${filled} 个释义；还有 ${missing} 个需要手动填写（红色的行）。${contextNote}`
        : `释义齐全，共 ${wordDraft.length} 个词。${contextNote}`;
    }
    const contextStatus = $('#word-context-status');
    if (contextStatus) {
      const withContext = wordDraft.filter((word) => String(word.ex || '').trim()).length;
      contextStatus.textContent = `语境题覆盖：${withContext} / ${wordDraft.length} 个词。本机例句库已自动补常见词；没有例句的词可以展开手动填写，或点“AI 补例句”。`;
    }
  }

  function contextSentenceValid(sentence, word) {
    const text = String(sentence || '').trim();
    const target = String(word || '').trim();
    if (!text || !target) return false;
    const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
  }

  async function generateWordContexts() {
    if (!wordDraft.length) { S.toast('先点“生成预览”，有了单词以后再补例句。', 'error'); return; }
    const cfg = aiConfig();
    if (!cfg.key) { S.toast('还没有配置 API Key。到“设置 → AI 直连”粘贴保存，或手动展开预览里的例句框填写。', 'error', 7000); return; }
    const missing = wordDraft.filter((word) => !contextSentenceValid(word.ex, word.w)).slice(0, 60);
    if (!missing.length) { S.toast('所有词都已经有语境例句了。', 'ok'); return; }
    const promptWords = missing.map((word) => `${word.w}（${word.zh || '无释义'}）`).join('\n');
    const prompt = `你是中小学英语词汇教学助手。请为下面每个单词写一句原创、自然、适合中学生的英文例句，长度 8–16 个词。\n` +
      `要求：\n1. 例句中必须原样出现该单词（可以有正常的大小写变化，但不要换成别的词形）。\n2. 句子要提供足够的语境，让学生能猜出这个词的意思。\n3. 给每句配准确、通顺的中文翻译。\n4. 不涉及政治、暴力、成人内容，不使用教材或出版社的原句。\n` +
      `只输出 JSON 数组，不要 Markdown，不要解释。格式：[{"w":"单词","ex":"English sentence.","exZh":"中文翻译。"}]\n\n单词：\n${promptWords}`;
    const estimate = S.ai.estimate(prompt.length + 200, Math.min(4000, 120 + missing.length * 70));
    if (!window.confirm(`这次会把 ${missing.length} 个单词（只发单词和释义，不含学生信息）发给 DeepSeek，生成语境例句。\n预计最多约 ${estimate.maxOutputTokens} 输出 tokens，约 ${S.ai.costText(estimate.cost + 0.002)}。\n只在你点确认后调用。继续吗？`)) return;
    const button = $('#word-context-ai');
    const status = $('#word-context-status');
    if (button) { button.disabled = true; button.textContent = '生成例句中…'; }
    if (status) status.textContent = '正在请 DeepSeek 写例句，通常几秒到十几秒…';
    try {
      const result = await callDeepSeek([
        { role: 'system', content: '你是严谨的英语词汇教学助手。只输出合法 JSON 数组，不添加 Markdown 或解释。' },
        { role: 'user', content: prompt }
      ], Math.min(4000, 180 + missing.length * 70), '单词语境例句');
      const text = String(result.text || '').replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');
      let list = [];
      if (start >= 0 && end > start) {
        try { list = JSON.parse(text.slice(start, end + 1)); } catch (error) { list = []; }
      }
      if (!Array.isArray(list) || !list.length) throw new Error('AI 返回的例句格式无法识别，请再试一次。');
      const map = new Map();
      list.forEach((item) => {
        if (!item || !item.w || !item.ex) return;
        const key = String(item.w).trim().toLowerCase();
        if (!key) return;
        map.set(key, {
          ex: String(item.ex).trim(),
          exZh: String(item.exZh || '').trim()
        });
      });
      let added = 0;
      wordDraft.forEach((word) => {
        const hit = map.get(word.w.toLowerCase());
        if (!hit) return;
        if (!contextSentenceValid(hit.ex, word.w)) return;
        word.ex = hit.ex;
        word.exZh = hit.exZh;
        added += 1;
      });
      renderWordPreview();
      const used = Number(result.usage.total_tokens) || 0;
      if (status) status.textContent = `已补 ${added} 个词的语境例句。本次 ${used} tokens · 约 ${S.ai.costText(result.cost)}。没补上的词可以手动展开填写。`;
      S.toast(`语境例句已补 ${added} 个，本次约 ${S.ai.costText(result.cost)}。`, 'ok', 6000);
    } catch (error) {
      if (status) status.textContent = '这次没有成功补例句，可以重试或在预览里手动填写。';
      S.toast(error.message || 'AI 补例句失败。', 'error', 8000);
    } finally {
      if (button) { button.disabled = false; button.textContent = 'AI 补例句（可选）'; }
    }
  }

  async function generateWordAssignment() {
    const students = $$('#word-students input[name="word-student"]:checked').map((input) => input.value);
    if (!students.length) { S.toast('至少勾选一位学生。', 'error'); return; }
    if (wordDraft.length < 4) { S.toast('至少需要 4 个词，才能生成四选一选项。', 'error'); return; }
    const missing = wordDraft.filter((word) => !String(word.zh || '').trim());
    if (missing.length) {
      S.toast(`还有 ${missing.length} 个词没有中文释义，请在预览里补好。`, 'error', 5000);
      const row = $(`[data-word-row="${wordDraft.indexOf(missing[0])}"]`);
      if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }
    const title = $('#word-title').value.trim() || `单词打卡 · ${wordDraft.length} 词`;
    const due = $('#word-due').value || S.addDays(S.todayIso(), 3);
    const xp = clamp(Number($('#word-xp').value) || 80, 20, 600);
    const words = wordDraft.map((word) => ({
      w: word.w,
      zh: S.simplifyMeaning(word.zh),
      kk: word.kk || '',
      pos: word.pos || '',
      ex: String(word.ex || '').trim(),
      exZh: String(word.exZh || '').trim(),
      rank: Number.isFinite(Number(word.rank)) ? Number(word.rank) : 99999
    }));
    const assignment = {
      id: S.uid('W'),
      kind: 'words',
      mode: 'words',
      title,
      paperTitle: '单词打卡',
      paperGrade: '',
      due,
      xp,
      createdAt: S.nowIso(),
      studentIds: students,
      wordTotal: words.length,
      words,
      pool: wordPoolFor(words)
    };
    const withGrammar = Boolean(($('#word-with-grammar') || {}).checked);
    assignment.adaptive = Boolean(($('#word-adaptive') || {}).checked);
    data.assignments.unshift(assignment);
    save();
    renderAll();
    S.closeDialog($('#word-dialog'));
    wordDraft = [];
    wordAssignStudentId = null;

    if (!withGrammar) {
      S.toast(`单词任务已创建，共 ${words.length} 个词。正在生成一人一码…`, 'ok');
      await showCodes(assignment);
      return;
    }

    if (!G) {
      S.toast('语法课程没有加载成功，这次先只发单词任务码。', 'error', 6000);
      await showCodes(assignment);
      return;
    }

    const studentObjects = students.map(getStudent).filter(Boolean);
    const missingPin = studentObjects.find((student) => !student.pin);
    if (missingPin) {
      S.toast(`${missingPin.name} 还没有密码，无法生成合码。`, 'error', 6000);
      await showCodes(assignment);
      return;
    }
    const weekStart = S.todayIso();
    const items = [];
    assignment.grammarPlans = {};
    for (const student of studentObjects) {
      try {
        const start = nextGrammarDay(student);
        let grammarPlan = null;
        if (start <= G.total) {
          grammarPlan = buildGrammarPlan(student, start, weekStart);
          if (grammarPlan.days.length) {
            data.plans.unshift(grammarPlan);
            assignment.grammarPlans[student.id] = grammarPlan.id;
          } else {
            grammarPlan = null;
          }
        }
        const code = await bundleCodeFor(assignment, student, grammarPlan);
        items.push({
          student,
          code,
          wordCount: adaptiveWordsFor(assignment, student).length,
          grammarDays: grammarPlan ? grammarPlan.days.length : 0
        });
      } catch (error) {
        items.push({ student, code: '', error: error.message || '生成失败' });
      }
    }
    save();
    renderGrammarList();
    renderGrammarStudents();
    const grammarUsed = items.some((item) => item.grammarDays);
    S.toast(`本周合码已生成：${words.length} 个单词 + ${grammarUsed ? '7 天语法' : '语法已学完'}，正在打开…`, 'ok', 6000);
    await showBundleCodes(items, grammarUsed);
  }

  /* ------------------------------ 词汇书周编排 ------------------------------ */

  const BOOK_DIFFICULTIES = {
    auto: { key: 'auto', label: '按学情自适应', factor: 1, levelShift: 0 },
    gentle: { key: 'gentle', label: '基础巩固', factor: 0.85, levelShift: -1 },
    standard: { key: 'standard', label: '标准进度', factor: 1, levelShift: 0 },
    challenge: { key: 'challenge', label: '加难提升', factor: 1.15, levelShift: 1 },
    sprint: { key: 'sprint', label: '冲刺强化', factor: 1.3, levelShift: 2 }
  };

  function bookDifficulty() {
    const key = String(($('#book-difficulty') || {}).value || 'auto');
    return BOOK_DIFFICULTIES[key] || BOOK_DIFFICULTIES.auto;
  }

  function defaultBookSlots() {
    return [
      { id: S.uid('SL'), type: 'words', count: 12, focus: 'adaptive' },
      { id: S.uid('SL'), type: 'words', count: 12, focus: 'adaptive' },
      { id: S.uid('SL'), type: 'words', count: 12, focus: 'adaptive' },
      { id: S.uid('SL'), type: 'words', count: 10, focus: 'review' },
      { id: S.uid('SL'), type: 'words', count: 10, focus: 'adaptive' },
      { id: S.uid('SL'), type: 'grammar', count: 0, focus: 'adaptive' },
      { id: S.uid('SL'), type: 'grammar', count: 0, focus: 'adaptive' }
    ];
  }

  function openBookDialog(sourceId) {
    const source = sourceId ? (data.assignments || []).find((item) => item.id === sourceId && item.bookMode) : null;
    bookWords = source ? (source.words || []).slice() : [];
    bookSlots = source && Array.isArray(source.slots) && source.slots.length
      ? source.slots.map((slot) => ({ ...slot, id: S.uid('SL') }))
      : defaultBookSlots();
    bookPreviewStudentId = '';
    bookStudentsCache = null;
    bookSourceAssignmentId = source ? source.id : '';
    const title = $('#book-title');
    if (title) title.value = source ? `${String(source.title || '词汇书').replace(/·\s*续编.*$/, '').trim()} · 续编` : '';
    const weekStart = $('#book-week-start');
    if (weekStart) weekStart.value = S.todayIso();
    const xp = $('#book-xp');
    if (xp) xp.value = String(source ? source.xp || 80 : 80);
    const difficulty = $('#book-difficulty');
    if (difficulty) difficulty.value = BOOK_DIFFICULTIES[source && source.difficulty] ? source.difficulty : 'auto';
    const input = $('#book-input');
    if (input) {
      input.value = source
        ? (source.words || []).map((word) => `${word.w} ${word.zh || ''}${word.ex ? ` | ${word.ex} | ${word.exZh || ''}` : ''}`).join('\n')
        : '';
    }
    const status = $('#book-status');
    if (status) status.textContent = source
      ? `已载入《${source.title}》的 ${bookWords.length} 个词。继续生成时，系统会自动跳过学生已经做过的词。`
      : '本机释义库会自动补全中文释义和例句；导入后先点“解析词汇书”。';
    renderBookStudents();
    renderBookSlots();
    renderBookPreview();
    updateBookFoot();
    S.openDialog($('#book-dialog'));
    const previewStatus = $('#book-count');
    if (previewStatus) previewStatus.textContent = `${bookWords.length} 个词`;
  }

  let bookSourceAssignmentId = '';

  function renderBookStudents() {
    const box = $('#book-students');
    if (!box) return;
    const list = sortedStudents();
    if (!list.length) {
      box.innerHTML = '<p class="hint">还没有学生。先在“学生名册”里添加。</p>';
      return;
    }
    const selected = bookStudentsCache || new Set(list.map((student) => student.id));
    box.innerHTML = list.map((student) => (
      `<label class="check-chip"><input type="checkbox" name="book-student" value="${S.escapeHtml(student.id)}" ${selected.has(student.id) ? 'checked' : ''}>${S.escapeHtml(student.avatar || '🦊')} ${S.escapeHtml(student.name)}</label>`
    )).join('');
  }

  function bookSelectedStudents() {
    return $$('#book-students input[name="book-student"]:checked').map((input) => input.value).map(getStudent).filter(Boolean);
  }

  function updateBookFoot() {
    const foot = $('#book-foot-hint');
    if (!foot) return;
    if (bookWords.length < 4) { foot.textContent = '至少导入 4 个词。'; return; }
    if (!bookSlots.length) { foot.textContent = '至少插入 1 个任务栏。'; return; }
    const wordSlots = bookSlots.filter((slot) => slot.type === 'words');
    if (!wordSlots.length) { foot.textContent = '至少插入 1 个“单词”任务栏，否则没有词汇任务。'; return; }
    const planned = wordSlots.reduce((sum, slot) => sum + Math.max(0, Number(slot.count) || 0), 0);
    foot.textContent = `${bookSlots.length} 个任务栏 · 预计发出 ${planned} 个词位/人（系统会按学情上下浮动）。`;
  }

  function renderBookSlots() {
    const box = $('#book-slots');
    if (!box) return;
    const weekStart = ($('#book-week-start') || {}).value || S.todayIso();
    if (!bookSlots.length) {
      box.innerHTML = '<p class="hint">还没有任务栏，点“＋ 插入任务栏”。</p>';
      updateBookFoot();
      return;
    }
    box.innerHTML = bookSlots.map((slot, index) => {
      const isGrammar = slot.type === 'grammar';
      return `<div class="book-slot" data-book-slot="${index}">` +
        `<div class="book-slot-title"><b>任务 ${index + 1}</b><span>第 ${index + 1} 天 · ${S.escapeHtml(S.fmtDate(S.addDays(weekStart, index)))}</span></div>` +
        `<div class="book-slot-fields">` +
          `<select class="select" data-book-slot-type="${index}" aria-label="任务 ${index + 1} 类型">` +
            `<option value="words" ${isGrammar ? '' : 'selected'}>单词</option>` +
            `<option value="grammar" ${isGrammar ? 'selected' : ''}>语法</option>` +
          `</select>` +
          `<label class="book-slot-num ${isGrammar ? 'is-hidden' : ''}">词数 <input class="input" type="number" min="1" max="80" value="${Number(slot.count) || 10}" data-book-slot-count="${index}" aria-label="任务 ${index + 1} 词数"></label>` +
          `<select class="select book-slot-focus ${isGrammar ? 'is-hidden' : ''}" data-book-slot-focus="${index}" aria-label="任务 ${index + 1} 选词策略">` +
            `<option value="adaptive" ${slot.focus === 'adaptive' ? 'selected' : ''}>按水平自适应</option>` +
            `<option value="high" ${slot.focus === 'high' ? 'selected' : ''}>高频词优先</option>` +
            `<option value="mid" ${slot.focus === 'mid' ? 'selected' : ''}>中频词优先</option>` +
            `<option value="low" ${slot.focus === 'low' ? 'selected' : ''}>低频词优先</option>` +
            `<option value="review" ${slot.focus === 'review' ? 'selected' : ''}>错词回炉</option>` +
          `</select>` +
          (isGrammar ? '<span class="book-slot-fixed">5 关 · 接学生下一课</span>' : '') +
        `</div>` +
        `<button class="word-remove book-slot-remove" type="button" data-book-slot-remove="${index}" aria-label="删除任务 ${index + 1}">×</button>` +
      `</div>`;
    }).join('');
    updateBookFoot();
    if (bookWords.length) renderBookPreview();
  }

  function addBookSlot() {
    const last = bookSlots[bookSlots.length - 1];
    bookSlots.push({ id: S.uid('SL'), type: 'words', count: last && last.type === 'words' ? Number(last.count) || 10 : 10, focus: 'adaptive' });
    renderBookSlots();
  }

  async function parseBookWords() {
    const raw = $('#book-input').value;
    const parsed = parseWordLines(raw);
    if (!parsed.length) { S.toast('先粘贴词汇书，每行一个词。', 'error'); return; }
    const glossary = await loadGlossary();
    const ranks = ensureGlossaryRanks(glossary);
    let skipped = 0;
    const words = [];
    parsed.slice(0, 1500).forEach((word) => {
      const key = String(word.w || '').toLowerCase();
      if (!key) return;
      const entry = glossary[key] || {};
      const bank = WORD_EXAMPLES[key] || {};
      const zh = word.zh ? S.simplifyMeaning(word.zh) : S.meaningFor(key, entry.zh || '');
      if (!zh) { skipped += 1; return; }
      words.push({
        w: word.w,
        zh,
        kk: word.kk || entry.kk || '',
        pos: word.pos || entry.pos || '',
        ex: String(word.ex || bank.ex || '').trim(),
        exZh: String(word.exZh || bank.exZh || '').trim(),
        rank: ranks.has(key) ? ranks.get(key) : 99999
      });
    });
    bookWords = words;
    const bands = { high: 0, mid: 0, low: 0 };
    words.forEach((word) => { bands[bookBandOf(word)] += 1; });
    const withExample = words.filter((word) => word.ex).length;
    const count = $('#book-count');
    if (count) count.textContent = `${words.length} 个词`;
    const status = $('#book-status');
    if (status) {
      status.textContent = `已解析 ${words.length} 个词：高频 ${bands.high} · 中频 ${bands.mid} · 低频 ${bands.low}；${withExample} 个带语境例句。` +
        (skipped ? ` 有 ${skipped} 个词没有中文释义，已跳过。` : '');
    }
    if (parsed.length > 1500) S.toast('词汇书超过 1500 行，只取前 1500 个词。', 'error', 5000);
    renderBookPreview();
    updateBookFoot();
    S.toast(`词汇书解析完成，共 ${words.length} 个可用词。`, 'ok', 4000);
  }

  function bookWordKey(word) {
    return String(word && word.w || '').trim().toLowerCase();
  }

  function bookBandOf(word) {
    const rank = Number(word && word.rank);
    if (!Number.isFinite(rank) || rank >= 99999) return 'mid';
    return wordFrequencyBand(rank);
  }

  function previousBookWordKeys(student, assignment) {
    const keys = new Set();
    const sourceId = assignment ? (assignment.sourceId || assignment.id) : bookSourceAssignmentId;
    if (!sourceId) return keys;
    (data.plans || []).forEach((plan) => {
      if (plan.studentId !== student.id || plan.bookAssignmentId !== sourceId) return;
      (plan.days || []).forEach((day) => (day.words || []).forEach((word) => keys.add(bookWordKey(word))));
    });
    (student.tasks || []).forEach((task) => {
      if (task.assignmentId !== sourceId) return;
      (task.wordStats || []).forEach((word) => keys.add(bookWordKey(word)));
    });
    return keys;
  }

  function bookStudentProfile(student) {
    const diff = bookDifficulty();
    const today = S.todayIso();
    const cutoff = S.addDays(today, -7);
    const done = (student.tasks || []).filter((task) => task.status === 'done');
    const recent = done.filter((task) => String(task.submittedAt || '').slice(0, 10) >= cutoff);
    const recentWordStats = [];
    recent.filter((task) => task.mode === 'words').forEach((task) => (task.wordStats || []).forEach((word) => recentWordStats.push(word)));
    const accuracy = recentWordStats.length
      ? Math.round((recentWordStats.filter((word) => word.ok).length / recentWordStats.length) * 100)
      : null;
    const doneDays = new Set(recent.map((task) => String(task.submittedAt || '').slice(0, 10)).filter(Boolean)).size;
    const weakMap = new Map();
    done.forEach((task) => (task.wordStats || []).forEach((word) => {
      if (word.ok || !word.w) return;
      const key = bookWordKey(word);
      const item = weakMap.get(key) || { w: word.w, zh: word.zh || '', count: 0 };
      item.count += 1;
      weakMap.set(key, item);
    }));
    const weak = Array.from(weakMap.values()).sort((a, b) => b.count - a.count);
    const weakSet = new Set(weak.map((word) => bookWordKey(word)));
    const level = studentWordLevel(student);
    let weakAttr = '';
    let weakAttrValue = null;
    const attrs = S.normalizeAttrs(student.profile && student.profile.attrs);
    S.ATTRS.map((attr) => {
      const stat = attrs[attr.key] || { c: 0, t: 0 };
      const display = S.attrDisplay(stat);
      return { name: attr.name, value: display.value, empty: display.empty };
    }).filter((item) => !item.empty).sort((a, b) => a.value - b.value).forEach((item, index) => {
      if (index === 0) { weakAttr = item.name; weakAttrValue = item.value; }
    });
    let factor = 1;
    if (accuracy != null) {
      if (accuracy < 60) factor = 0.82;
      else if (accuracy < 75) factor = 0.92;
      else if (accuracy >= 90) factor = 1.12;
    }
    if (doneDays <= 2) factor = Math.min(factor, 0.88);
    else if (doneDays >= 6) factor = Math.max(factor, 1.06);
    if (weakAttrValue != null && weakAttrValue < 50) factor = Math.min(factor, 0.95);
    factor = clamp(factor, 0.8, 1.15) * diff.factor;
    factor = clamp(factor, 0.65, 1.45);
    const effectiveLevel = clamp(level + diff.levelShift, 1, 9);
    const attrNote = weakAttr ? `认知画像里「${weakAttr}」${weakAttrValue != null ? `（${weakAttrValue}）` : ''}偏弱` : '';
    const note = done.length
      ? `上周完成 ${doneDays} 天${accuracy != null ? `，单词一次答对 ${accuracy}%` : '，暂无单词数据'}；当前 Lv.${level}${weak.length ? `；错词 ${weak.length} 个` : ''}${attrNote ? `；${attrNote}，本周先稳住词量` : ''}。`
      : `还没有历史打卡，先按 Lv.${level} 的基础量起步${attrNote ? `；${attrNote}` : ''}。`;
    return { accuracy, doneDays, level, effectiveLevel, weak, weakSet, factor, note, weakAttr, difficulty: diff };
  }

  function bookOrderFor(words, focus, level, weakSet) {
    const all = words.slice();
    const rank = (word) => (Number.isFinite(Number(word.rank)) ? Number(word.rank) : 15000);
    const byRank = (a, b) => rank(a) - rank(b);
    if (focus === 'high') {
      const list = all.filter((word) => bookBandOf(word) === 'high').sort(byRank);
      return list.length ? list.concat(all.filter((word) => bookBandOf(word) !== 'high').sort(byRank)) : all.sort(byRank);
    }
    if (focus === 'mid') {
      const list = all.filter((word) => bookBandOf(word) === 'mid').sort(byRank);
      return list.length ? list.concat(all.filter((word) => bookBandOf(word) !== 'mid').sort(byRank)) : all.sort(byRank);
    }
    if (focus === 'low') {
      const list = all.filter((word) => bookBandOf(word) === 'low').sort((a, b) => rank(b) - rank(a));
      return list.length ? list.concat(all.filter((word) => bookBandOf(word) !== 'low').sort((a, b) => rank(b) - rank(a))) : all.sort((a, b) => rank(b) - rank(a));
    }
    if (focus === 'review') {
      return all.sort((a, b) => (
        Number(weakSet && weakSet.has(bookWordKey(b))) - Number(weakSet && weakSet.has(bookWordKey(a))) || byRank(a, b)
      ));
    }
    if (focus === 'mix') {
      const high = all.filter((word) => bookBandOf(word) === 'high').sort(byRank);
      const mid = all.filter((word) => bookBandOf(word) === 'mid').sort(byRank);
      const low = all.filter((word) => bookBandOf(word) === 'low').sort((a, b) => rank(b) - rank(a));
      const ratio = level <= 3 ? [0.6, 0.3, 0.1] : level <= 6 ? [0.3, 0.5, 0.2] : [0.15, 0.4, 0.45];
      const target = [Math.round(all.length * ratio[0]), Math.round(all.length * ratio[1]), Math.round(all.length * ratio[2])];
      const picked = [];
      const used = new Set();
      const take = (list, limit) => {
        let count = 0;
        for (const word of list) {
          if (count >= limit) break;
          const key = bookWordKey(word);
          if (used.has(key)) continue;
          used.add(key); picked.push(word); count += 1;
        }
      };
      take(high, target[0]); take(mid, target[1]); take(low, target[2]);
      all.forEach((word) => { if (!used.has(bookWordKey(word))) picked.push(word); });
      return picked;
    }
    const targetRank = level <= 3 ? 900 : level <= 6 ? 4300 : 11000;
    return all.sort((a, b) => Math.abs(rank(a) - targetRank) - Math.abs(rank(b) - targetRank) || byRank(a, b));
  }

  function allocateBookWords(student, slots, words, assignment) {
    const profile = bookStudentProfile(student);
    const used = previousBookWordKeys(student, assignment);
    const taken = new Set();
    const byIndex = {};
    let recycled = false;
    const orders = new Map();
    const orderFor = (focus) => {
      if (!orders.has(focus)) orders.set(focus, bookOrderFor(words, focus, profile.effectiveLevel, profile.weakSet));
      return orders.get(focus);
    };
    const pick = (list, count, picked) => {
      for (const word of list) {
        if (picked.length >= count) break;
        const key = bookWordKey(word);
        if (!key || taken.has(key) || used.has(key)) continue;
        taken.add(key); picked.push(word);
      }
    };
    slots.forEach((slot, index) => {
      if (slot.type !== 'words') return;
      const count = Math.max(1, Math.round((Number(slot.count) || 10) * profile.factor));
      const picked = [];
      pick(orderFor(slot.focus || 'adaptive'), count, picked);
      if (picked.length < count) pick(orderFor('adaptive'), count, picked);
      if (picked.length < count) {
        recycled = true;
        pick(words.slice().sort((a, b) => Number(a.rank) - Number(b.rank)), count, picked);
      }
      if (picked.length < count) {
        recycled = true;
        pick(words, count, picked);
      }
      /* 单词闯关至少要有 4 个词才能生成四选一。 */
      if (picked.length < Math.min(4, words.length)) {
        recycled = true;
        for (const word of words) {
          if (picked.length >= Math.min(4, words.length)) break;
          const key = bookWordKey(word);
          if (picked.some((item) => bookWordKey(item) === key)) continue;
          picked.push(word);
        }
      }
      byIndex[index] = picked;
    });
    return { byIndex, profile, recycled };
  }

  function bookGrammarDay(student, grammarDay) {
    if (!G) return null;
    const lesson = G.lessonByDay(grammarDay);
    if (!lesson) return null;
    const reviewLesson = G.lessonByDay(G.reviewDayFor(grammarDay));
    return {
      grammarDay: lesson.day,
      lesson: G.summary(lesson),
      blocks: G.buildBlocks(lesson, reviewLesson)
    };
  }

  function buildBookPlan(student, assignment, weekStart) {
    const planId = S.uid('BP');
    const alloc = allocateBookWords(student, assignment.slots || [], assignment.words || [], assignment);
    let grammarCursor = G ? nextGrammarDay(student) : 0;
    const days = [];
    (assignment.slots || []).forEach((slot, index) => {
      const dayNumber = index + 1;
      const date = S.addDays(weekStart, index);
      const base = {
        day: dayNumber,
        date,
        taskId: `${planId}-D${dayNumber}`,
        slotLabel: `任务 ${dayNumber}`,
        assignmentId: assignment.id,
        wordSlot: slot.id || `S${dayNumber}`
      };
      if (slot.type === 'grammar') {
        const lesson = bookGrammarDay(student, grammarCursor);
        if (!lesson) return;
        grammarCursor += 1;
        days.push({
          ...base,
          kind: 'grammar',
          title: `D${dayNumber} · 语法 ${lesson.grammarDay} · ${lesson.lesson.title}`,
          paperTitle: `${assignment.title} · 语法`,
          grammarDay: lesson.grammarDay,
          lesson: lesson.lesson,
          blocks: lesson.blocks,
          questionTotal: 5,
          xp: clamp(55 + lesson.grammarDay * 2, 60, 160)
        });
        return;
      }
      const words = alloc.byIndex[index] || [];
      if (!words.length) return;
      days.push({
        ...base,
        kind: 'words',
        title: `D${dayNumber} · 任务 ${dayNumber} · ${words.length} 词`,
        paperTitle: `${assignment.title} · 单词`,
        words,
        pool: wordPoolFor(words),
        wordTotal: words.length,
        xp: assignment.xp || 80
      });
    });
    return {
      id: planId,
      kind: 'book',
      studentId: student.id,
      studentName: student.name,
      weekStart,
      title: `${assignment.title} · ${student.name}`,
      level: alloc.profile.level,
      difficulty: alloc.profile.difficulty.key,
      difficultyLabel: alloc.profile.difficulty.label,
      createdAt: S.nowIso(),
      bookAssignmentId: assignment.id,
      studentNote: alloc.profile.note,
      recycled: alloc.recycled,
      days
    };
  }

  function bookPreviewHtml(student) {
    if (!bookWords.length) {
      return `<p class="hint">先导入并解析词汇书，这里会显示每位学生的分配依据。</p>`;
    }
    const alloc = allocateBookWords(student, bookSlots, bookWords, null);
    const cells = bookSlots.map((slot, index) => {
      if (slot.type === 'grammar') {
        return `<span class="book-preview-cell is-grammar">D${index + 1} · 语法</span>`;
      }
      const count = (alloc.byIndex[index] || []).length;
      return `<span class="book-preview-cell is-words">D${index + 1} · ${count} 词</span>`;
    }).join('');
    const total = Object.values(alloc.byIndex).reduce((sum, words) => sum + words.length, 0);
    return `<div class="book-preview-row" data-book-preview="${S.escapeHtml(student.id)}">` +
      `<div class="book-preview-student"><b>${S.escapeHtml(student.avatar || '🦊')} ${S.escapeHtml(student.name)}</b><small>Lv.${alloc.profile.level} · ${S.escapeHtml(alloc.profile.difficulty.label)} · 本周 ${total} 词${alloc.recycled ? ' · 词汇书已循环补词' : ''}</small></div>` +
      `<p class="book-preview-note">${S.escapeHtml(alloc.profile.note)}</p>` +
      `<div class="book-preview-cells">${cells}</div>` +
    `</div>`;
  }

  function renderBookPreview() {
    const box = $('#book-student-preview');
    if (!box) return;
    const students = bookSelectedStudents();
    if (!bookWords.length) {
      box.innerHTML = '<p class="hint">先导入并解析词汇书，这里会显示每位学生的分配依据。</p>';
      return;
    }
    if (!students.length) {
      box.innerHTML = '<p class="hint">先在下方勾选至少一位学生。</p>';
      return;
    }
    box.innerHTML = students.map(bookPreviewHtml).join('');
  }

  async function generateBookAssignment() {
    if (!bookWords.length) { S.toast('先点“解析词汇书”。', 'error'); return; }
    if (bookWords.length < 4) { S.toast('至少需要 4 个带释义的词。', 'error'); return; }
    if (!bookSlots.length) { S.toast('至少插入 1 个任务栏。', 'error'); return; }
    const students = bookSelectedStudents();
    if (!students.length) { S.toast('至少勾选一位学生。', 'error'); return; }
    const missingPin = students.find((student) => !student.pin);
    if (missingPin) { S.toast(`${missingPin.name} 还没有密码，无法生成任务码。`, 'error', 6000); return; }
    const weekStart = ($('#book-week-start') || {}).value || S.todayIso();
    const title = ($('#book-title') || {}).value.trim() || `词汇书周编排 · ${S.fmtDate(weekStart)}`;
    const xp = clamp(Number(($('#book-xp') || {}).value) || 80, 20, 400);
    const assignment = {
      id: S.uid('B'),
      kind: 'words',
      mode: 'words',
      bookMode: true,
      title,
      paperTitle: '词汇书周任务',
      paperGrade: '',
      due: S.addDays(weekStart, bookSlots.length - 1),
      xp,
      createdAt: S.nowIso(),
      studentIds: students.map((student) => student.id),
      wordTotal: bookWords.length,
      words: bookWords.map((word) => ({ ...word })),
      slots: bookSlots.map((slot) => ({ ...slot })),
      slotCount: bookSlots.length,
      difficulty: bookDifficulty().key,
      difficultyLabel: bookDifficulty().label,
      sourceId: bookSourceAssignmentId || '',
      pool: wordPoolFor(bookWords)
    };
    data.assignments.unshift(assignment);
    const plans = [];
    students.forEach((student) => {
      const plan = buildBookPlan(student, assignment, weekStart);
      if (!plan.days.length) {
        S.toast(`${student.name} 没有可分派的任务（可能是语法已学完或词汇不足）。`, 'error', 5000);
        return;
      }
      data.plans = (data.plans || []).filter((item) => !(item.studentId === student.id && item.bookAssignmentId === assignment.id));
      data.plans.unshift(plan);
      plans.push(plan);
    });
    if (!plans.length) {
      data.assignments = data.assignments.filter((item) => item.id !== assignment.id);
      S.toast('没有生成任何计划，请检查任务栏设置。', 'error');
      return;
    }
    save();
    renderAll();
    S.closeDialog($('#book-dialog'));
    S.toast(`词汇书周任务已生成：${plans.length} 位学生，${bookSlots.length} 个任务栏。正在打开一人一码…`, 'ok', 7000);
    await showPlanCodes(plans);
  }

  function openWordDetail(assignmentId) {
    const assignment = (data.assignments || []).find((item) => item.id === assignmentId && item.kind === 'words');
    if (!assignment) return;
    wordDetailId = assignmentId;
    const stats = wordAssignmentStats(assignment);
    const sub = $('#word-detail-sub');
    if (sub) sub.textContent = `${assignment.title} · ${assignment.wordTotal || (assignment.words || []).length} 词 · 截止 ${assignment.due ? S.fmtDate(assignment.due) : '未设置'}`;
    const isBook = Boolean(assignment.bookMode);
    const slotCount = assignment.slotCount || (assignment.slots || []).length || 1;
    const rows = stats.rows.map((row) => {
      if (!row.student) return '';
      const task = row.task;
      const score = task && Number.isFinite(Number(task.score)) ? Number(task.score) : null;
      const scoreClass = score == null ? '' : score >= 85 ? 'score-good' : score >= 60 ? 'score-mid' : 'score-low';
      const wrong = row.words.filter((word) => !word.ok);
      const wrongHtml = wrong.length
        ? wrong.slice(0, 8).map((word) => `<span class="word-wrong-chip">${S.escapeHtml(word.w)}</span>`).join('')
        : (task ? '无' : '—');
      return `<tr>` +
        `<td><strong>${S.escapeHtml(row.student.name)}</strong><br><span class="hint">${S.escapeHtml(row.student.id)}</span></td>` +
        `<td>${task ? '已交汇报' : '未交'}</td>` +
        (isBook ? `<td>${row.tasks.length} / ${slotCount}</td>` : '') +
        `<td>${task ? `${task.correct || 0} / ${task.total || row.words.length}` : '—'}</td>` +
        `<td class="${scoreClass}">${score == null ? '—' : score + '%'}</td>` +
        `<td>${wrongHtml}</td>` +
      `</tr>`;
    }).join('');
    const common = stats.wrong.length
      ? `<div class="word-common"><h3>全班高频错词</h3><p>${stats.wrong.map((word) => `<span class="word-wrong-chip">${S.escapeHtml(word.w)} · ${S.escapeHtml(word.zh || '')} ×${word.count}</span>`).join(' ')}</p><p class="hint">可以下一轮只挑这些词，做一次“错词回炉”。</p></div>`
      : '';
    const stars = completionStars(stats.completion, stats.avgScore);
    const starBlock = isBook
      ? `<span>完成任务 <b>${stats.doneTasks} / ${stats.totalTasks}</b></span>` +
        `<span>完成度 <b>${stats.completion}%</b></span>` +
        `<span class="word-star-big">${'★'.repeat(stars)}${'☆'.repeat(5 - stars)}</span>`
      : '';
    $('#word-detail-body').innerHTML =
      `<div class="word-detail-summary">` +
        `<span>参与 <b>${stats.total}</b> 人</span>` +
        `<span>已交 <b>${stats.done}</b> 人</span>` +
        starBlock +
        `<span>平均一次答对率 <b>${stats.avgScore == null ? '—' : stats.avgScore + '%'}</b></span>` +
      `</div>` +
      (stats.done
        ? `<table class="word-detail-table"><thead><tr><th>学生</th><th>状态</th>${isBook ? '<th>任务栏</th>' : ''}<th>一次答对</th><th>正确率</th><th>错词</th></tr></thead><tbody>${rows}</tbody></table>`
        : `<div class="word-detail-empty">还没有收到这个任务的汇报。学生在学生端完成后生成汇报码，老师导入后这里才会更新；学生答题时的进度条是实时的，但跨设备不会自动同步。</div>`) +
      common;
    S.openDialog($('#word-detail-dialog'));
  }

  function deleteWordAssignment(assignmentId) {
    const assignment = (data.assignments || []).find((item) => item.id === assignmentId);
    if (!assignment) return;
    if (!window.confirm(`删除单词任务《${assignment.title}》？已经发出的任务码仍然可用。`)) return;
    data.assignments = data.assignments.filter((item) => item.id !== assignmentId);
    /* 词汇书任务对应的周计划也一起清掉，避免“单词卡删了、周计划里还挂着”的孤儿记录。 */
    data.plans = (data.plans || []).filter((plan) => !(plan.kind === 'book' && plan.bookAssignmentId === assignmentId));
    save();
    renderAll();
    S.toast('单词任务已删除。');
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
    if (!S.authMatches(payload.auth, auth)) {
      S.toast('校验失败：汇报码与这个学生登记的密码不一致，可能是旧密码或拿错了码。', 'error', 7000);
      return;
    }

    const profile = payload.profile || {};
    const previous = student.profile || {};
    const dailyReport = payload.scope === 'daily';
    const reportedAccountType = profile.accountType === 'trial' ? 'trial' : 'regular';
    const mergedCheckins = dailyReport
      ? Array.from(new Set([...(previous.checkins || []), ...(Array.isArray(profile.checkins) ? profile.checkins : [])]))
      : (Array.isArray(profile.checkins) ? profile.checkins : []);
    const mergedBadges = dailyReport
      ? Array.from(new Set([...(previous.badges || []), ...(Array.isArray(profile.badges) ? profile.badges : [])]))
      : (Array.isArray(profile.badges) ? profile.badges : []);
    student.accountType = reportedAccountType;
    student.profile = {
      ...(dailyReport ? previous : {}),
      ...profile,
      id: student.id,
      name: profile.name || student.name,
      grade: profile.grade || student.grade,
      avatar: profile.avatar || student.avatar,
      attrs: S.normalizeAttrs(profile.attrs),
      checkins: mergedCheckins,
      badges: mergedBadges,
      xp: Number(profile.xp) || 0,
      accountType: reportedAccountType,
      trialDays: Math.max(1, Number(profile.trialDays) || student.trialDays || 3),
      trialExpiresAt: String(profile.trialExpiresAt || ''),
      trialStartedAt: String(profile.trialStartedAt || ''),
      pets: profile.pets || previous.pets || null,
      petPool: profile.petPool || previous.petPool || null,
      unlockedPets: profile.unlockedPets || previous.unlockedPets || null,
      activePet: String(profile.activePet || previous.activePet || ''),
      fusion: profile.fusion || previous.fusion || null,
      wheel: profile.wheel || previous.wheel || null
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

    let levelChange = null;
    let wordLevelChange = null;
    if (student.lastLevelReportId !== payload.reportId) {
      levelChange = adjustLevelFromTasks(student, tasks);
      wordLevelChange = updateWordLevelFromTasks(student, tasks);
      student.lastLevelReportId = payload.reportId;
    }

    const scores = tasks.filter(hasScore).map((task) => Number(task.score));
    const isDaily = payload.scope === 'daily' && Boolean(payload.reportDay);
    const daily = payload.daily || {};
    const summary = {
      reportId: payload.reportId,
      generatedAt: payload.generatedAt || S.nowIso(),
      scope: isDaily ? 'daily' : 'full',
      reportDay: isDaily ? String(payload.reportDay).slice(0, 10) : '',
      taskCount: tasks.length,
      avgScore: scores.length ? Math.round(mean(scores)) : null,
      xp: Number(profile.xp) || xpOfStudent(student),
      level: S.levelInfo(Number(profile.xp) || xpOfStudent(student)).level,
      checkinStreak: S.streakFromCheckins(profile.checkins || []),
      checkin: isDaily ? Boolean(daily.checkin) : null
    };
    const reportIndex = (student.reports || []).findIndex((report) => report.reportId === summary.reportId);
    if (reportIndex >= 0) student.reports[reportIndex] = summary;
    else student.reports.push(summary);
    student.reports.sort((a, b) => String(b.generatedAt || '').localeCompare(String(a.generatedAt || '')));
    if (isDaily) {
      student.dayLog = student.dayLog || {};
      student.dayLog[summary.reportDay] = {
        day: summary.reportDay,
        reportId: summary.reportId,
        at: summary.generatedAt,
        taskCount: summary.taskCount,
        avgScore: summary.avgScore,
        checkin: Boolean(daily.checkin),
        streak: Number(daily.checkinStreak) || 0
      };
    }
    student.lastReportAt = summary.generatedAt;
    student.updatedAt = S.nowIso();

    save();
    S.closeDialog($('#import-report-dialog'));
    $('#import-report-code').value = '';
    renderAll();
    const levelNote = levelChange && levelChange.after !== levelChange.before
      ? ` 难度档自动 ${levelChange.before} → ${levelChange.after}（${levelChange.reason}）。`
      : levelChange && levelChange.reason ? ` ${levelChange.reason}。` : '';
    const wordNote = wordLevelChange && wordLevelChange.after !== wordLevelChange.before
      ? ` 单词难度自动 ${wordLevelChange.before} → ${wordLevelChange.after}（一次答对 ${wordLevelChange.accuracy}%）。`
      : '';
    const scopeNote = isDaily
      ? ` 今日汇报 · ${S.fmtDate(summary.reportDay)}，${summary.taskCount} 个任务${summary.avgScore != null ? `，均分 ${summary.avgScore}` : ''}。`
      : ' 完整档案（包含全部历史任务）。';
    S.toast(`已导入 ${student.name} 的汇报。${scopeNote}${levelNote}${wordNote}`, 'ok', 9000);
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
    const wordStats = [];
    tasks.forEach((task) => {
      (task.blockStats || []).forEach((block) => {
        if (!block || !block.total) return;
        const key = block.type || 'other';
        if (!blockAgg[key]) blockAgg[key] = { total: 0, correct: 0, label: block.label || S.blockLabel(key) };
        blockAgg[key].total += Number(block.total) || 0;
        blockAgg[key].correct += Number(block.correct) || 0;
      });
      (task.wordStats || []).forEach((word) => {
        if (!word || !word.w) return;
        wordStats.push({ ...word, taskTitle: task.title || '单词打卡', submittedAt: task.submittedAt || '' });
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
    const strengths = sortedAttrs.length
      ? sortedAttrs.filter((item) => item.value >= sortedAttrs[0].value - 5).slice(0, 2)
      : [];
    const weaknessCutoff = sortedAttrs.length ? sortedAttrs[0].value - 10 : 0;
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
    if (wordStats.length) {
      const wordWrong = wordStats.filter((word) => !word.ok);
      const topWrong = wordWrong.slice(-8).reverse().map((word) => S.escapeHtml(word.w)).join('、');
      html += `<p>单词打卡累计 <strong>${wordStats.length}</strong> 词，一次答对 ${wordStats.length - wordWrong.length} 词，错词 ${wordWrong.length} 个${wordWrong.length ? `；最近错词：${topWrong}` : ''}。错词已在学生端重练，但得分只按第一次作答计算，避免“练完就算会”。</p>`;
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
      wordStats.length ? `单词打卡：${wordStats.length} 词，一次答对 ${wordStats.filter((word) => word.ok).length} 词，错词 ${wordStats.filter((word) => !word.ok).map((word) => word.w).slice(-10).join('、') || '无'}。` : '',
      zpd ? `最近发展区：${zpd.attr.attr.name}，目标 ${zpd.targetLow}–${zpd.targetHigh}，优先 ${zpd.types.join('、')}。` : '最近发展区：样本不足。',
      risks.length ? `风险：${risks.join(' ')}` : '风险：暂无明显风险。'
    ].join('\n');

    return {
      attrs, values, assessed, gradedCount, tasks, avgScore, streak, active30, submitRate, reportDays,
      blockRows, reviewRows, wrongReviews, totalReviews, wrongCount, blankCount, wordStats,
      strengths, weaknesses, styleTitle, bloomLabel, bloomHighRatio, trend, risks, zpd, html, plain
    };
  }

  function aiPromptFor(student, profile) {
    const taskLines = (profile.tasks || []).slice(-6).map((task) => ({
      title: task.title || '',
      score: task.score,
      correct: task.correct,
      total: task.total,
      timeSpent: task.timeSpent,
      submittedAt: task.submittedAt,
      avgDifficulty: task.avgDifficulty || null,
      blockStats: (task.blockStats || []).map((block) => ({ type: block.type, label: block.label, total: block.total, correct: block.correct })),
      wordStats: (task.wordStats || []).slice(-20).map((word) => ({ w: word.w, zh: word.zh, ok: word.ok }))
    }));
    const wrongSamples = (profile.wrongReviews || []).slice(-8).map((review) => ({
      number: review.n,
      type: review.type,
      userAnswer: review.userAnswer,
      correctAnswer: review.correctAnswer,
      explanation: String(review.explanation || '').slice(0, 120)
    }));
    const safeName = String(student.name || '').trim();
    const safeNote = safeName
      ? String(student.note || '').split(safeName).join('学生')
      : String(student.note || '');
    const payload = {
      student: {
        name: '学生（姓名已隐去）',
        grade: student.grade,
        level: S.levelInfo(xpOfStudent(student)).level,
        xp: xpOfStudent(student),
        streak: profile.streak,
        active30: profile.active30,
        avgScore: profile.avgScore,
        submitRate: profile.submitRate,
        reportDays: profile.reportDays,
        teacherNote: safeNote
      },
      attributes: profile.assessed.map((item) => ({ name: item.attr.name, score: item.value, attempts: Math.round(item.stat.t) })),
      style: profile.styleTitle,
      bloom: { label: profile.bloomLabel, highOrderRatio: profile.bloomHighRatio },
      errorPatterns: profile.reviewRows,
      tasks: taskLines,
      wrongSamples
    };
    return [
      '你是英语学习诊断助手，服务初高中一对一英语老师。基于数据做一份简短、可执行、不贴标签的画像；证据不足处要明说。',
      '',
      '【输出要求】中文，总字数控制在 550 字以内，只写四部分：',
      '1. 画像摘要（2–3 句，先结论后证据）',
      '2. 强项、短板与错误模式（按题型归纳，不逐题复述）',
      '3. 未来两周教学处方（任务类型、难度、题量、频次，3–5 条）',
      '4. 给家长的话（不超过 80 字，客观、不制造焦虑）',
      '不要写开场白，不要重复学生数据，不要建议上传学生隐私的平台。',
      '',
      '【学生数据】姓名已隐去，称呼用“孩子”。',
      JSON.stringify(payload),
      '',
      '数据来自学生本机记录，可能不完整；请标注推断边界。'
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

  function integrityBadge(task) {
    const score = task.integrityScore != null ? Number(task.integrityScore) : null;
    if (score == null) return '<span class="integrity-chip none">未采集</span>';
    const tone = score >= 80 ? 'good' : score >= 55 ? 'warn' : 'bad';
    const flags = Array.isArray(task.integrityFlags) ? task.integrityFlags : [];
    return `<span class="integrity-chip ${tone}" title="${S.escapeHtml(flags.join('；') || '未发现异常')}">${score}</span>` +
      (flags.length ? `<small class="integrity-flag">${S.escapeHtml(flags[0])}</small>` : '');
  }

  function renderDetailTasks(student, profile) {
    const tasks = (student.tasks || []).slice().sort((a, b) => String(b.submittedAt || '').localeCompare(String(a.submittedAt || '')));
    if (!tasks.length) {
      $('#detail-task-table').innerHTML = emptyState('还没有任务记录', '导入汇报后，任务历史会出现在这里。');
      return;
    }
    const suspicious = tasks.filter((task) => task.integrityScore != null && Number(task.integrityScore) < 55);
    const integrityNote = suspicious.length
      ? `<div class="integrity-alert"><b>有 ${suspicious.length} 次任务出现疑似乱选信号</b>` +
        `<span>${S.escapeHtml(suspicious.slice(0, 3).map((task) => `${task.title || '任务'}（${task.integrityScore} 分：${(task.integrityFlags || []).join('、') || '异常'}）`).join('；'))}</span>` +
        `<small>这是按答题速度、改答次数、离开页面和选项分布做的本机估算，只能当提醒，不能当处分依据。</small></div>`
      : '';
    const rows = tasks.map((task) => {
      const score = hasScore(task) ? `${task.score}%` : '待批';
      const minutes = task.timeSpent ? Math.max(1, Math.round(task.timeSpent / 60)) : null;
      const wordMark = task.mode === 'words' ? ' <span class="word-badge">WORD</span>' : '';
      return `<tr data-task-id="${S.escapeHtml(task.id)}">` +
        `<td><strong>${S.escapeHtml(task.title || '任务')}</strong>${wordMark}` +
          `<button class="task-answer-link" type="button" data-task-answer="${S.escapeHtml(task.id)}">看作答</button></td>` +
        `<td>${S.escapeHtml(task.submittedAt ? S.fmtDate(task.submittedAt) : '—')}</td>` +
        `<td><b>${score}</b></td>` +
        `<td>${task.correct == null ? '—' : `${task.correct}/${task.total || 0}`}</td>` +
        `<td>${minutes == null ? '—' : minutes + '′'}</td>` +
        `<td>${integrityBadge(task)}</td>` +
      `</tr>`;
    }).join('');
    let html = integrityNote + `<table class="history-table"><thead><tr><th>任务</th><th>提交</th><th>得分</th><th>答对</th><th>用时</th><th>答题可信度</th></tr></thead><tbody>${rows}</tbody></table>`;

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
    const wordTasks = tasks.filter((task) => Array.isArray(task.wordStats) && task.wordStats.length);
    if (wordTasks.length) {
      const wordRows = [];
      wordTasks.forEach((task) => {
        task.wordStats.filter((word) => !word.ok).forEach((word) => {
          wordRows.push({ ...word, taskTitle: task.title || '单词打卡', submittedAt: task.submittedAt || '' });
        });
      });
      html += `<h3 class="dialog-subtitle" style="margin-top:20px;">单词打卡记录</h3>` +
        `<p class="hint" style="margin-bottom:8px;">共 ${wordTasks.length} 次单词任务，累计错词 ${wordRows.length} 个。一次答对率按第一次作答计算，错词重练不计入得分。</p>`;
      if (wordRows.length) {
        html += `<table class="history-table"><thead><tr><th>单词</th><th>释义</th><th>任务</th><th>提交</th></tr></thead><tbody>` +
          wordRows.slice(0, 24).map((word) => (
            `<tr><td><strong>${S.escapeHtml(word.w || '')}</strong></td>` +
            `<td>${S.escapeHtml(word.zh || '—')}</td>` +
            `<td>${S.escapeHtml(word.taskTitle)}</td>` +
            `<td>${S.escapeHtml(word.submittedAt ? S.fmtDate(word.submittedAt) : '—')}</td></tr>`
          )).join('') +
          `</tbody></table>`;
      } else {
        html += `<p class="hint">单词任务全部一次答对，没有错词。</p>`;
      }
    }
    $('#detail-task-table').innerHTML = html;
  }

  function openTaskAnswer(taskId) {
    const student = getStudent(detailStudentId);
    if (!student) return;
    const task = (student.tasks || []).find((item) => item.id === taskId);
    if (!task) { S.toast('找不到这次任务记录。', 'error'); return; }
    const sub = $('#task-answer-sub');
    if (sub) {
      sub.textContent = `${student.name} · ${task.title || '任务'} · ${task.submittedAt ? S.fmtDateTime(task.submittedAt) : '未记录提交时间'}`;
    }
    const body = $('#task-answer-body');
    if (!body) return;
    let html = `<div class="task-answer-meta">` +
      `<span>得分 <b>${task.score == null ? '待批' : task.score + '%'}</b></span>` +
      `<span>答对 <b>${task.correct == null ? '—' : `${task.correct}/${task.total || 0}`}</b></span>` +
      `<span>用时 <b>${task.timeSpent ? Math.max(1, Math.round(task.timeSpent / 60)) + ' 分钟' : '—'}</b></span>` +
      `<span>可信度 <b>${task.integrityScore == null ? '未采集' : task.integrityScore}</b></span>` +
    `</div>`;

    if (task.mode === 'words' && Array.isArray(task.wordStats) && task.wordStats.length) {
      html += `<h3 class="dialog-subtitle">单词作答（第一次作答）</h3>` +
        `<table class="history-table task-answer-table"><thead><tr><th>#</th><th>单词</th><th>释义</th><th>第一次</th><th>错词重练</th></tr></thead><tbody>` +
        task.wordStats.map((word, index) => (
          `<tr><td>${index + 1}</td><td><strong>${S.escapeHtml(word.w || '')}</strong></td>` +
          `<td>${S.escapeHtml(word.zh || '—')}</td>` +
          `<td class="${word.ok ? 'answer-ok' : 'answer-wrong'}">${word.ok ? '答对' : '答错'}</td>` +
          `<td>${word.reviewOk == null ? '—' : word.reviewOk ? '已订正' : '仍错'}</td></tr>`
        )).join('') + `</tbody></table>`;
    }

    const review = Array.isArray(task.review) ? task.review : [];
    if (review.length) {
      html += `<h3 class="dialog-subtitle">题目与作答</h3>` +
        `<div class="task-answer-list">` +
        review.map((item, index) => (
          `<article class="task-answer-item ${item.ok ? 'is-ok' : 'is-wrong'}">` +
            `<div class="task-answer-head"><b>第 ${S.escapeHtml(item.n || index + 1)} 题</b>` +
              `<span>${item.ok ? '✓ 答对' : '✕ 答错'}</span>` +
              `<small>${S.escapeHtml(S.blockLabel(item.type))}</small></div>` +
            (item.stem ? `<p class="task-answer-stem">${S.escapeHtml(item.stem)}</p>` : '') +
            `<div class="task-answer-row"><span>学生答案</span><b class="${item.ok ? 'answer-ok' : 'answer-wrong'}">${S.escapeHtml(item.userAnswer || '未作答')}${item.userText ? ` · ${S.escapeHtml(item.userText)}` : ''}</b></div>` +
            `<div class="task-answer-row"><span>正确答案</span><b class="answer-ok">${S.escapeHtml(item.correctAnswer || '老师未附答案')}${item.correctText ? ` · ${S.escapeHtml(item.correctText)}` : ''}</b></div>` +
            (item.explanation ? `<p class="task-answer-explain">${S.escapeHtml(item.explanation)}</p>` : '') +
          `</article>`
        )).join('') + `</div>`;
    } else if (!task.mode || task.mode !== 'words') {
      html += `<p class="hint">这次任务的逐题原文没有记录。让学生更新学生端后重新生成一次汇报码，就会带回完整作答；已有的分数和错题记录仍然保留。</p>`;
    }

    if (String(task.writing || '').trim()) {
      html += `<h3 class="dialog-subtitle">书面表达</h3>` +
        `<div class="task-answer-writing">${S.escapeHtml(task.writing)}</div>`;
    }
    body.innerHTML = html;
    S.openDialog($('#task-answer-dialog'));
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

  /* ------------------------------- 周备课 ------------------------------- */

  let weeklyAdvice = null;
  let weeklyAiText = '';

  function weeklyStudents() {
    return sortedStudents();
  }

  function renderWeeklyStudents() {
    const box = $('#weekly-students');
    if (!box) return;
    const list = weeklyStudents();
    if (!list.length) {
      box.innerHTML = '<p class="hint">还没有学生，先到“学生”页添加。</p>';
      return;
    }
    box.innerHTML = list.map((student) => (
      `<label class="grammar-student weekly-student"><input type="checkbox" name="weekly-student" value="${S.escapeHtml(student.id)}" checked>` +
        `<span class="student-avatar">${S.escapeHtml(student.avatar || '🦊')}</span>` +
        `<span class="grammar-student-copy"><strong>${S.escapeHtml(student.name)}</strong>` +
        `<small>${S.escapeHtml(student.id)} · ${S.escapeHtml(student.grade || '未标注')}</small></span>` +
      `</label>`
    )).join('');
  }

  function renderWeeklyTab() {
    const start = $('#weekly-start');
    if (start && !start.value) start.value = S.todayIso();
    renderWeeklyStudents();
    if (weeklyAdvice) renderWeeklyAdvice(weeklyAdvice);
  }

  function inWeekRange(value, start, end) {
    const date = String(value || '').slice(0, 10);
    return Boolean(date && date >= start && date <= end);
  }

  function weeklyRows(start, ids) {
    const end = S.addDays(start, 6);
    const wanted = new Set(ids);
    return weeklyStudents().filter((student) => wanted.has(student.id)).map((student) => {
      const profile = student.profile || {};
      const checkins = Array.isArray(profile.checkins) ? profile.checkins : [];
      const checkinDays = new Set(checkins.filter((date) => inWeekRange(date, start, end)));
      const doneTasks = (student.tasks || []).filter((task) => task.status === 'done' && inWeekRange(task.submittedAt, start, end));
      const wordStats = [];
      const grammarDays = new Set();
      const wrongGrammar = [];
      const wrongWords = [];
      doneTasks.forEach((task) => {
        if (task.mode === 'words') {
          (task.wordStats || []).forEach((word) => {
            if (!word || !word.w) return;
            wordStats.push(word);
            if (!word.ok) wrongWords.push(word);
          });
        }
        if (task.mode === 'grammar') {
          const day = Number(task.grammarDay) || 0;
          if (day) grammarDays.add(day);
          (task.review || []).forEach((item) => {
            if (item && item.ok === false) wrongGrammar.push({ ...item, grammarDay: day });
          });
        }
      });
      const scores = doneTasks.filter(hasScore).map((task) => Number(task.score));
      return {
        student,
        checkinDays,
        doneTasks,
        wordStats,
        wrongWords,
        grammarDays,
        wrongGrammar,
        avgScore: scores.length ? Math.round(mean(scores)) : null,
        wordAccuracy: wordStats.length ? Math.round((wordStats.filter((word) => word.ok).length / wordStats.length) * 100) : null
      };
    });
  }

  const WEEKLY_FALLBACK_WORDS = [
    { w: 'clue', zh: '线索' }, { w: 'evidence', zh: '证据' }, { w: 'discover', zh: '发现' },
    { w: 'protect', zh: '保护' }, { w: 'confident', zh: '自信的' }, { w: 'carefully', zh: '小心地' },
    { w: 'suddenly', zh: '突然' }, { w: 'solution', zh: '解决办法' }
  ];

  function weeklyWordList(rows) {
    const counts = new Map();
    rows.forEach((row) => row.wrongWords.forEach((word) => {
      const key = String(word.w || '').toLowerCase();
      if (!key) return;
      const item = counts.get(key) || { w: word.w, zh: word.zh || '', count: 0 };
      item.count += 1;
      counts.set(key, item);
    }));
    const picked = Array.from(counts.values()).sort((a, b) => b.count - a.count).slice(0, 8);
    if (picked.length >= 4) return picked;
    rows.forEach((row) => row.doneTasks.forEach((task) => {
      if (task.mode !== 'words') return;
      (task.words || []).forEach((word) => {
        if (picked.length >= 8 || picked.some((item) => item.w === word.w)) return;
        picked.push({ w: word.w, zh: word.zh || '', count: 0 });
      });
    }));
    if (picked.length >= 4) return picked.slice(0, 8);
    return WEEKLY_FALLBACK_WORDS.slice();
  }

  function weeklyFocusLesson(rows) {
    const byDay = new Map();
    rows.forEach((row) => row.wrongGrammar.forEach((item) => {
      const day = Number(item.grammarDay) || 1;
      const entry = byDay.get(day) || { day, wrong: 0, total: 0 };
      entry.wrong += 1;
      byDay.set(day, entry);
    }));
    rows.forEach((row) => {
      row.doneTasks.forEach((task) => {
        if (task.mode !== 'grammar') return;
        const day = Number(task.grammarDay) || 1;
        const entry = byDay.get(day) || { day, wrong: 0, total: 0 };
        entry.total += Number(task.total) || 0;
        byDay.set(day, entry);
      });
    });
    const ranked = Array.from(byDay.values()).sort((a, b) => b.wrong - a.wrong || (b.wrong / Math.max(1, b.total)) - (a.wrong / Math.max(1, a.total)));
    const day = ranked.length ? ranked[0].day : 1;
    return G ? G.lessonByDay(day) : null;
  }

  function weeklySkillLabel(rows) {
    const counts = new Map();
    rows.forEach((row) => row.wrongGrammar.forEach((item) => {
      const key = item.type || 'grammar';
      counts.set(key, (counts.get(key) || 0) + 1);
    }));
    if (!counts.size) return '基础句型与词汇';
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0][0];
    return S.blockLabel(top) || '基础句型';
  }

  function weeklyQuestionHtml(question, index) {
    const options = (question.options || []).map((option) => (
      `<span>${S.escapeHtml(option.letter)}. ${S.escapeHtml(option.text)}</span>`
    )).join('');
    return `<li><p>${S.escapeHtml(question.stem || '')}</p>` +
      (options ? `<div class="weekly-options">${options}</div>` : '') +
      `<small class="weekly-answer">答案：${S.escapeHtml(question.answer || '—')}${question.explanation ? ` · ${S.escapeHtml(question.explanation)}` : ''}</small></li>`;
  }

  function buildWeeklyAdvice(start, ids) {
    const rows = weeklyRows(start, ids);
    if (!rows.length) return null;
    const activeRows = rows.filter((row) => row.checkinDays.size || row.doneTasks.length);
    const doneTasks = rows.reduce((sum, row) => sum + row.doneTasks.length, 0);
    const allWordStats = rows.reduce((list, row) => list.concat(row.wordStats), []);
    const wordAccuracy = allWordStats.length
      ? Math.round((allWordStats.filter((word) => word.ok).length / allWordStats.length) * 100)
      : null;
    const allScores = rows.reduce((list, row) => list.concat(row.doneTasks.filter(hasScore).map((task) => Number(task.score))), []);
    const avgScore = allScores.length ? Math.round(mean(allScores)) : null;
    const focusLesson = weeklyFocusLesson(rows);
    const lessonDay = focusLesson ? focusLesson.day : 1;
    const reviewLesson = G ? G.lessonByDay(G.reviewDayFor(lessonDay)) : null;
    const words = weeklyWordList(rows);
    const skill = weeklySkillLabel(rows);
    const grammarWrong = rows.reduce((sum, row) => sum + row.wrongGrammar.length, 0);
    const attendance = rows.length ? Math.round((activeRows.length / rows.length) * 100) : 0;
    const adviceRows = rows.map((row) => {
      const name = row.student.name;
      if (!row.student.profile) return { name, text: '还没有导入本周汇报；先收一次汇报码，再判断本周重点。' };
      if (!row.checkinDays.size && !row.doneTasks.length) return { name, text: '本周没有打卡记录。先私聊确认时间，下节课从最小任务（8 个词 + 1 道语法）重新起步。' };
      const bits = [`打卡 ${row.checkinDays.size} 天`, `完成 ${row.doneTasks.length} 个任务`];
      if (row.wordAccuracy != null) bits.push(`单词一次答对 ${row.wordAccuracy}%`);
      if (row.grammarDays.size) bits.push(`语法 D${Array.from(row.grammarDays).sort((a, b) => a - b).join('、D')}`);
      let next = '保持节奏，重点是把错题口头讲一遍。';
      if (row.wordAccuracy != null && row.wordAccuracy < 70) next = '下节课先做 8 个错词的“中英互译”，再进句型。';
      else if (row.wrongGrammar.length >= 2) next = '语法卡点较多，先回到规则，再做 3 道同类题。';
      else if (row.avgScore != null && row.avgScore >= 88) next = '正确率稳定，可以加一句仿写或更长阅读。';
      return { name, text: `${bits.join('，')}。${next}` };
    });

    const lesson = focusLesson || { day: 1, title: '句子骨架', sentence: 'Xiaochao arrived.', translation: '小潮到了。', rule: '先找主语和谓语，再看其他成分。', tip: '先圈谓语，再问谁做了这个动作。', questions: [], output: { prompt: '写一句今天发生的事。', sample: 'The bus stopped.' } };
    const questions = (lesson.questions || []).slice(0, 3);
    if (reviewLesson && reviewLesson.questions && reviewLesson.questions[0]) questions.push(reviewLesson.questions[0]);
    const questionHtml = questions.length
      ? `<ol class="weekly-questions">${questions.map(weeklyQuestionHtml).join('')}</ol>`
      : '<p class="hint">这份课程还没有配练习题；先用下面的仿写任务。</p>';

    const targetWordsHtml = words.map((word) => (
      `<tr><td><b>${S.escapeHtml(word.w)}</b></td><td>${S.escapeHtml(word.zh || '—')}</td><td>${word.count ? `错 ${word.count} 次` : '本周词表'}</td></tr>`
    )).join('');

    const teacherRowsHtml = adviceRows.map((row) => (
      `<tr><td><b>${S.escapeHtml(row.name)}</b></td><td>${S.escapeHtml(row.text)}</td></tr>`
    )).join('');

    const html = `<div class="weekly-sheet">` +
      `<div class="weekly-head">` +
        `<div><p class="weekly-kicker">WEEKLY COACH · ${S.escapeHtml(S.fmtDate(start))}–${S.escapeHtml(S.fmtDate(S.addDays(start, 6)))}</p>` +
        `<h2>本周上课建议</h2><p>先看数据，再上一节能落地的小课。所有内容只保存在这台电脑。</p></div>` +
        `<div class="weekly-kpis">` +
          `<span><b>${activeRows.length}/${rows.length}</b>本周有学习</span>` +
          `<span><b>${attendance}%</b>出勤率</span>` +
          `<span><b>${doneTasks}</b>完成任务</span>` +
          `<span><b>${avgScore == null ? '—' : avgScore + '%'}</b>平均分</span>` +
        `</div>` +
      `</div>` +
      `<section class="weekly-block"><h3>一、本周学情速览</h3>` +
        `<p>本周共 ${rows.length} 位学生，${activeRows.length} 位有打卡或完成任务；单词一次答对率 ${wordAccuracy == null ? '样本不足' : wordAccuracy + '%'}；语法错题 ${grammarWrong} 道。最需要补的是<strong>${S.escapeHtml(skill)}</strong>。</p>` +
        `<table class="weekly-table"><thead><tr><th>学生</th><th>本周观察与下节动作</th></tr></thead><tbody>${teacherRowsHtml}</tbody></table>` +
      `</section>` +
      `<section class="weekly-block"><h3>二、90 分钟课堂流程</h3>` +
        `<ol class="weekly-flow">` +
          `<li><b>0–10 分钟｜词汇唤醒</b><span>用下面的 8 个词做“看中文说英文 → 看英文说中文 → 选 3 个造句”。先求张口，不罚错。</span></li>` +
          `<li><b>10–30 分钟｜语法微课</b><span>只讲一个点：${S.escapeHtml(lesson.rule)} 板书今日句子，让学生先圈谓语，再标主语和修饰。</span></li>` +
          `<li><b>30–55 分钟｜句型操练</b><span>做下面的 4 道小题。每题先让学生说“为什么”，再对答案；错题现场改一句。</span></li>` +
          `<li><b>55–75 分钟｜读写输出</b><span>用今天的结构 + 至少 3 个目标词，写 5 句小短文。老师只抓 3 个问题：谓语、连接、词形。</span></li>` +
          `<li><b>75–90 分钟｜复盘与作业</b><span>学生用一句话说出今天的规则；布置“错词 8 个 + 仿写 3 句”，下次课先复现。</span></li>` +
        `</ol>` +
      `</section>` +
      `<section class="weekly-block"><h3>三、语法微课卡：D${lesson.day || 1} ${S.escapeHtml(lesson.title || '')}</h3>` +
        `<div class="weekly-focus"><p class="weekly-sentence">${S.escapeHtml(lesson.sentence || '')}</p>` +
        `<p>${S.escapeHtml(lesson.translation || '')}</p>` +
        `<div class="weekly-rule"><b>今天只讲这一条</b><span>${S.escapeHtml(lesson.rule || '')}</span><small>${S.escapeHtml(lesson.tip || '')}</small></div></div>` +
      `</section>` +
      `<section class="weekly-block"><h3>四、词汇与当堂练习</h3>` +
        `<table class="weekly-table weekly-words"><thead><tr><th>单词</th><th>中文</th><th>来源</th></tr></thead><tbody>${targetWordsHtml}</tbody></table>` +
        `<h4>当堂 4 题</h4>${questionHtml}` +
        `<div class="weekly-writing"><b>仿写任务</b><p>${S.escapeHtml((lesson.output && lesson.output.prompt) || '用今天的结构写一句。')}</p>` +
        `<small>参考：${S.escapeHtml((lesson.output && lesson.output.sample) || '')}</small></div>` +
      `</section>` +
      `<section class="weekly-block"><h3>五、作业与下周观察</h3>` +
        `<ul class="weekly-homework">` +
          `<li>错词 8 个：每个写 1 句，不要只抄单词。</li>` +
          `<li>语法仿写 3 句：必须出现今天的目标结构。</li>` +
          `<li>下周先看：本周错词是否在口头复述中还会卡；语法错题能否自己讲出理由。</li>` +
        `</ul>` +
        `<p class="weekly-note">说明：这是按本机打卡和汇报生成的规则版建议，不是标准化测评。AI 只做语言润色，不替代老师判断。</p>` +
      `</section>` +
    `</div>`;

    return {
      start, end: S.addDays(start, 6), rows, activeRows, doneTasks, wordAccuracy, avgScore,
      lesson, reviewLesson, words, skill, grammarWrong, attendance, adviceRows,
      questionHtml, targetWordsHtml, html
    };
  }

  function renderWeeklyAdvice(result) {
    const box = $('#weekly-advice-output');
    if (!box || !result) return;
    box.innerHTML = result.html +
      (weeklyAiText ? `<section class="weekly-block weekly-ai"><h3>AI 润色版（只作参考）</h3><div class="weekly-ai-text">${S.escapeHtml(weeklyAiText).replace(/\n/g, '<br>')}</div></section>` : '');
  }

  function generateWeeklyAdvice() {
    const start = ($('#weekly-start') || {}).value || S.todayIso();
    const ids = $$('#weekly-students input[type="checkbox"]:checked').map((input) => input.value);
    if (!ids.length) { S.toast('至少选一位学生。', 'error'); return; }
    weeklyAdvice = buildWeeklyAdvice(start, ids);
    weeklyAiText = '';
    if (!weeklyAdvice) { S.toast('没有可用的数据。', 'error'); return; }
    renderWeeklyAdvice(weeklyAdvice);
    const note = $('#weekly-ai-note');
    if (note) note.textContent = '已生成本地建议，未调用 AI。';
    S.toast('本周上课建议已生成。', 'ok', 4000);
  }

  function weeklyHandoutHtml(result) {
    const lesson = result.lesson || {};
    return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>本周英语讲义</title>` +
      `<style>body{font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;max-width:760px;margin:32px auto;padding:0 22px;color:#1d3438;line-height:1.75}h1{font-size:24px}h2{margin-top:26px;font-size:18px;border-bottom:1px solid #d8e4e2;padding-bottom:6px}table{width:100%;border-collapse:collapse;margin:10px 0}th,td{border:1px solid #d8e4e2;padding:7px 9px;text-align:left;font-size:14px}th{background:#f1f8f6}li{margin:6px 0}small{color:#607b80}.options span{display:inline-block;margin-right:16px}.key{margin-top:24px;padding:10px 14px;background:#f7faf8;border-left:4px solid #3f8f74}@media print{body{margin:0;padding:0 8mm}.no-print{display:none}}</style></head><body>` +
      `<h1>本周英语讲义</h1><p>本周重点：${S.escapeHtml(result.skill)} · 语法 D${lesson.day || 1} ${S.escapeHtml(lesson.title || '')}</p>` +
      `<h2>一、本周词汇</h2><table><thead><tr><th>单词</th><th>中文</th></tr></thead><tbody>${result.words.map((word) => `<tr><td><b>${S.escapeHtml(word.w)}</b></td><td>${S.escapeHtml(word.zh || '')}</td></tr>`).join('')}</tbody></table>` +
      `<h2>二、语法微课</h2><p><b>${S.escapeHtml(lesson.sentence || '')}</b><br>${S.escapeHtml(lesson.translation || '')}</p><p>${S.escapeHtml(lesson.rule || '')}</p><p><small>${S.escapeHtml(lesson.tip || '')}</small></p>` +
      `<h2>三、当堂练习</h2>${result.questionHtml.replace(/<small class="weekly-answer">[\s\S]*?<\/small>/g, '')}` +
      `<h2>四、写一句</h2><p>${S.escapeHtml((lesson.output && lesson.output.prompt) || '用今天的结构写一句。')}</p>` +
      `<div class="key"><b>参考答案</b><br>${result.questionHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1200)}</div>` +
      `<p class="no-print"><small>打印提示：浏览器菜单 → 打印 → 选择“另存为 PDF”。</small></p></body></html>`;
  }

  function openWeeklyPrint(html, title) {
    const win = window.open('', '_blank');
    if (!win) {
      S.downloadText(`${title}.html`, html);
      S.toast('浏览器拦住了打印窗口，已下载 HTML，打开后按 Ctrl+P 即可。', 'ok', 6500);
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { try { win.print(); } catch (error) {} }, 450);
  }

  function weeklyPrint() {
    if (!weeklyAdvice) { S.toast('先生成上课建议。', 'error'); return; }
    openWeeklyPrint(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>本周上课建议</title>` +
      `<style>body{font-family:"Noto Sans SC","Microsoft YaHei",sans-serif;max-width:900px;margin:24px auto;padding:0 24px;color:#1d3438;line-height:1.7;font-size:14px}h2{font-size:22px}h3{margin-top:24px;font-size:17px;border-bottom:1px solid #d8e4e2;padding-bottom:5px}h4{margin:16px 0 6px}.weekly-kicker{color:#607b80;font-size:12px;letter-spacing:.08em}.weekly-kpis{display:flex;gap:10px;flex-wrap:wrap}.weekly-kpis span{border:1px solid #d8e4e2;border-radius:8px;padding:7px 10px}.weekly-kpis b{display:block;font-size:18px}.weekly-table{width:100%;border-collapse:collapse;margin:8px 0}.weekly-table th,.weekly-table td{border:1px solid #d8e4e2;padding:7px 9px;text-align:left;vertical-align:top}.weekly-table th{background:#f1f8f6}.weekly-flow li{margin:9px 0}.weekly-flow span{display:block;color:#405b60}.weekly-focus{padding:12px 14px;background:#f7faf8;border-left:4px solid #3f8f74}.weekly-sentence{font-size:17px;font-weight:700}.weekly-rule{margin-top:8px}.weekly-rule b,.weekly-rule span,.weekly-rule small{display:block}.weekly-options span{display:inline-block;margin:2px 14px 2px 0}.weekly-answer{color:#607b80}.weekly-writing{margin-top:12px;padding:10px 12px;background:#fff8ea}.weekly-note{color:#607b80;font-size:12px}.weekly-ai{border:1px dashed #8b6bb0;padding:10px 12px}.weekly-ai-text{white-space:normal}@media print{body{margin:0;padding:0 8mm}}</style></head><body>${weeklyAdvice.html}${weeklyAiText ? `<section class="weekly-block weekly-ai"><h3>AI 润色版（只作参考）</h3><p>${S.escapeHtml(weeklyAiText).replace(/\n/g, '<br>')}</p></section>` : ''}</body></html>`, '本周上课建议');
  }

  function weeklyHandout() {
    if (!weeklyAdvice) { S.toast('先生成上课建议。', 'error'); return; }
    S.downloadText('本周英语讲义.html', weeklyHandoutHtml(weeklyAdvice));
    S.toast('学生讲义已下载。打开后可打印或另存 PDF。', 'ok', 5000);
  }

  async function runWeeklyAi() {
    if (!weeklyAdvice) { S.toast('先生成本地建议，再让 AI 润色。', 'error'); return; }
    const cfg = aiConfig();
    if (!cfg.key) { S.toast('还没有配置 API Key。到“设置 → AI 直连”粘贴保存。', 'error', 7000); return; }
    const rows = weeklyAdvice.rows.map((row) => ({
      activeDays: row.checkinDays.size,
      doneTasks: row.doneTasks.length,
      wordAccuracy: row.wordAccuracy,
      avgScore: row.avgScore,
      grammarDays: Array.from(row.grammarDays),
      grammarWrong: row.wrongGrammar.length
    }));
    const payload = {
      weekStart: weeklyAdvice.start,
      studentCount: weeklyAdvice.rows.length,
      activeCount: weeklyAdvice.activeRows.length,
      wordAccuracy: weeklyAdvice.wordAccuracy,
      avgScore: weeklyAdvice.avgScore,
      skill: weeklyAdvice.skill,
      lesson: { day: weeklyAdvice.lesson.day, title: weeklyAdvice.lesson.title, rule: weeklyAdvice.lesson.rule },
      words: weeklyAdvice.words.map((word) => word.w),
      studentPatterns: rows
    };
    const prompt = `你是一位严谨的中学英语教研员。下面是一个班级本周的匿名学习汇总。请给老师写一页 90 分钟复习课建议，要求：1）不要虚构学生姓名或成绩；2）用中文；3）分成“学情判断 / 90 分钟流程 / 3 个易错点 / 作业”四部分；4）最多 450 字；5）只基于数据，不贴标签。\n${JSON.stringify(payload)}`;
    if (!window.confirm('这次只发送匿名汇总（不含姓名、学号），预计消耗 300–500 tokens。继续吗？')) return;
    const button = $('#weekly-ai');
    const note = $('#weekly-ai-note');
    if (button) { button.disabled = true; button.textContent = 'AI 润色中…'; }
    if (note) note.textContent = '正在请求 DeepSeek…';
    try {
      const result = await callDeepSeek([
        { role: 'system', content: '你是英语教研员，回答克制、可执行，不虚构数据，不暴露隐私。' },
        { role: 'user', content: prompt }
      ], 520, '周备课建议');
      weeklyAiText = result.text;
      renderWeeklyAdvice(weeklyAdvice);
      const inputTokens = Number(result.usage.prompt_tokens) || 0;
      const outputTokens = Number(result.usage.completion_tokens) || 0;
      const used = Number(result.usage.total_tokens) || (inputTokens + outputTokens);
      if (note) note.textContent = `本次 ${used} tokens（输入 ${inputTokens} / 输出 ${outputTokens}）· 约 ${S.ai.costText(result.cost)}。只作参考，请老师核对。`;
      S.toast(`AI 润色完成，本次 ${used} tokens。`, 'ok', 6000);
    } catch (error) {
      if (note) note.textContent = '';
      S.toast(error.message || 'AI 调用失败。', 'error', 8500);
    } finally {
      if (button) { button.disabled = false; button.textContent = 'AI 润色这节课（消耗少量额度）'; }
    }
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

  /* --------------------------- AI 直连（可选，省额度） --------------------------- */

  const AI_STORAGE_KEY = 'shunshi.ai.v1';

  function aiConfig() {
    return S.ai.config();
  }

  function saveAiConfig(cfg) {
    S.ai.save(cfg);
  }

  function updateAiSettingsUI() {
    const cfg = aiConfig();
    const state = $('#ai-key-state');
    if (state) state.textContent = cfg.key ? '已配置' : '未配置';
    const input = $('#ai-key-input');
    if (input) {
      input.value = '';
      input.placeholder = cfg.key ? `已保存（尾号 ${cfg.key.slice(-4)}）` : 'sk-... 只存本机';
    }
    const usage = $('#ai-usage');
    if (usage) {
      usage.textContent = `累计 ${cfg.totalTokens} tokens（输入 ${cfg.inputTokens} / 输出 ${cfg.outputTokens}）· ${cfg.calls} 次 · 约 ${S.ai.costText(cfg.cost)}`;
    }
    const summary = $('#ai-source-summary');
    if (summary) {
      const usage = S.ai.summary();
      summary.innerHTML = usage.sources.length
        ? `<div class="ai-source-title"><b>按来源汇总</b><span>${usage.sources.length} 个来源 · 累计永久保留 · 明细最近 200 条</span></div>` +
          `<table class="ai-source-table"><thead><tr><th>来源</th><th>次数</th><th>Tokens</th><th>费用</th></tr></thead><tbody>` +
          usage.sources.map((row) => `<tr><td>${S.escapeHtml(row.source)}</td><td>${row.calls}</td><td>${row.tokens}</td><td>${S.ai.costText(row.cost)}</td></tr>`).join('') +
          `</tbody></table>`
        : '<p class="hint" style="text-align:left;margin:6px 0;">还没有 AI 消耗记录。</p>';
    }
    const logEl = $('#ai-cost-log');
    if (logEl) {
      logEl.innerHTML = cfg.log.length
        ? cfg.log.slice(0, 12).map((item) => (
          `<li><span>${S.escapeHtml(S.fmtDateTime(item.at))} · ${S.escapeHtml(item.source)}</span>` +
          `<b>${item.tokens} tokens · ${S.ai.costText(item.cost)}</b></li>`
        )).join('')
        : '<li><span>还没有调用记录。每次 AI 整理都会记在这里。</span></li>';
    }
  }

  function saveAiKey() {
    const input = $('#ai-key-input');
    const key = input ? input.value.trim() : '';
    if (!key) { S.toast('先粘贴 API Key。', 'error'); return; }
    if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(key)) { S.toast('Key 格式看起来不对，通常以 sk- 开头。', 'error'); return; }
    const cfg = aiConfig();
    cfg.key = key;
    saveAiConfig(cfg);
    updateAiSettingsUI();
    S.toast('Key 已保存在这台电脑的浏览器里，不进入备份码，也不会写进网页源码。', 'ok', 6500);
  }

  function clearAiKey() {
    if (!window.confirm('清除这台电脑上保存的 API Key？')) return;
    const cfg = aiConfig();
    cfg.key = '';
    saveAiConfig(cfg);
    updateAiSettingsUI();
    S.toast('已清除 Key。');
  }

  async function testAiKey() {
    const cfg = aiConfig();
    if (!cfg.key) { S.toast('先保存 Key，再测试。', 'error'); return; }
    const usage = $('#ai-usage');
    if (usage) usage.textContent = '正在连接…';
    try {
      const response = await fetch('https://api.deepseek.com/models', {
        headers: { Authorization: `Bearer ${cfg.key}` }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      const models = (json.data || []).map((item) => item.id).join('、') || 'deepseek-flash';
      updateAiSettingsUI();
      if (usage) usage.textContent = `连接成功 · 可用：${models} · 累计 ${cfg.totalTokens} tokens`;
      S.toast('连接成功。测试只查模型列表，不消耗额度。', 'ok', 5500);
    } catch (error) {
      updateAiSettingsUI();
      S.toast(`连接失败：${error.message}`, 'error', 7000);
    }
  }

  async function callDeepSeek(messages, maxTokens, source) {
    const result = await S.ai.call(messages, maxTokens, source || '学习画像分析');
    updateAiSettingsUI();
    return result;
  }

  async function runAiAnalysis() {
    const student = getStudent(detailStudentId);
    if (!student) return;
    const cfg = aiConfig();
    if (!cfg.key) {
      S.toast('还没有配置 API Key。到“设置 → AI 直连”粘贴保存即可。', 'error', 7000);
      return;
    }
    if (student.aiAnalysis && !window.confirm('这个学生已有一份 AI 分析。重新生成会覆盖它，并消耗额度。继续吗？')) return;
    const profile = buildProfile(student);
    const prompt = aiPromptFor(student, profile);
    if (!window.confirm(`这次会发送约 ${prompt.length} 字的匿名学习数据，预计消耗几百 tokens。只在你点确认后才会调用。继续吗？`)) return;
    const button = $('#run-ai-prompt');
    const note = $('#ai-call-note');
    if (button) { button.disabled = true; button.textContent = '分析中…'; }
    if (note) note.textContent = '正在请求 DeepSeek，通常几秒到十几秒。';
    try {
      const result = await callDeepSeek([
        { role: 'system', content: '你是严谨的英语学习诊断助手。只基于提供的数据说话，保护学生隐私，不给学生贴固定标签。用中文分点回答。' },
        { role: 'user', content: prompt }
      ], 700, `画像分析 · ${student.name}`);
      $('#ai-result').value = result.text;
      const inputTokens = Number(result.usage.prompt_tokens) || 0;
      const outputTokens = Number(result.usage.completion_tokens) || 0;
      const used = Number(result.usage.total_tokens) || (inputTokens + outputTokens);
      const truncated = result.finishReason === 'length' ? ' · 内容达到上限，可再点一次生成更短版本' : '';
      if (note) note.textContent = `本次 ${used} tokens（输入 ${inputTokens} / 输出 ${outputTokens}）· 约 ${S.ai.costText(result.cost)}${truncated}。确认内容无误后，点“保存 AI 分析”。`;
      S.toast(`分析完成，本次 ${used} tokens · 约 ${S.ai.costText(result.cost)}。`, 'ok', 6000);
    } catch (error) {
      if (note) note.textContent = '';
      S.toast(error.message || 'AI 调用失败。', 'error', 8500);
    } finally {
      if (button) { button.disabled = false; button.textContent = '一键分析（消耗少量额度）'; }
    }
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
      assignments: data.assignments,
      plans: data.plans || [],
      insights: IC ? IC.normalizePosts(data.insights) : []
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
      assignments: Array.isArray(payload.assignments) ? payload.assignments : [],
      plans: Array.isArray(payload.plans) ? payload.plans : [],
      insights: Array.isArray(payload.insights) ? normalizeInsights(payload.insights) : defaultInsights()
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
      const remove = event.target.closest('[data-student-delete]');
      if (remove) {
        event.preventDefault();
        event.stopPropagation();
        deleteStudent(remove.dataset.studentDelete);
        return;
      }
      const reset = event.target.closest('[data-student-reset]');
      if (reset) {
        event.preventDefault();
        event.stopPropagation();
        const student = getStudent(reset.dataset.studentReset);
        if (student) openResetCode(student);
        return;
      }
      const card = event.target.closest('[data-student-id]');
      if (card) openDetail(card.dataset.studentId);
    });
    container.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest('[data-student-delete]')) return;
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
    $('#hero-words').addEventListener('click', () => {
      switchTab('publish');
      setPublishSub('daily');
      const pane = $('.teacher-pane[data-pane="publish"]');
      if (pane) pane.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
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
    $('#word-add').addEventListener('click', () => openWordDialog(null));
    $('#word-build').addEventListener('click', buildWordPreview);
    const wordContextAi = $('#word-context-ai');
    if (wordContextAi) wordContextAi.addEventListener('click', generateWordContexts);
    $('#word-generate').addEventListener('click', generateWordAssignment);
    $('#word-extract').addEventListener('click', extractWordsFromMaterial);
    const bookAdd = $('#book-add');
    if (bookAdd) bookAdd.addEventListener('click', () => openBookDialog(''));
    const bookParse = $('#book-parse');
    if (bookParse) bookParse.addEventListener('click', parseBookWords);
    const bookAddSlot = $('#book-add-slot');
    if (bookAddSlot) bookAddSlot.addEventListener('click', addBookSlot);
    const bookAutoSlots = $('#book-auto-slots');
    if (bookAutoSlots) {
      bookAutoSlots.addEventListener('click', () => {
        bookSlots = defaultBookSlots();
        renderBookSlots();
        S.toast('已恢复成 5 天单词 + 2 天语法的推荐编排，可以继续手动改。', 'ok', 4000);
      });
    }
    const bookSlotsBox = $('#book-slots');
    if (bookSlotsBox) {
      bookSlotsBox.addEventListener('click', (event) => {
        const remove = event.target.closest('[data-book-slot-remove]');
        if (!remove) return;
        bookSlots.splice(Number(remove.dataset.bookSlotRemove), 1);
        renderBookSlots();
      });
      bookSlotsBox.addEventListener('change', (event) => {
        const type = event.target.closest('[data-book-slot-type]');
        if (type) {
          const slot = bookSlots[Number(type.dataset.bookSlotType)];
          if (!slot) return;
          slot.type = type.value === 'grammar' ? 'grammar' : 'words';
          if (slot.type === 'words' && !Number(slot.count)) slot.count = 10;
          renderBookSlots();
          return;
        }
        const count = event.target.closest('[data-book-slot-count]');
        if (count) {
          const slot = bookSlots[Number(count.dataset.bookSlotCount)];
          if (slot) slot.count = clamp(Number(count.value) || 10, 1, 80);
          updateBookFoot();
          renderBookPreview();
          return;
        }
        const focus = event.target.closest('[data-book-slot-focus]');
        if (focus) {
          const slot = bookSlots[Number(focus.dataset.bookSlotFocus)];
          if (slot) slot.focus = focus.value;
          renderBookPreview();
        }
      });
    }
    const bookWeek = $('#book-week-start');
    if (bookWeek) bookWeek.addEventListener('change', () => renderBookSlots());
    const bookDifficultySelect = $('#book-difficulty');
    if (bookDifficultySelect) bookDifficultySelect.addEventListener('change', () => renderBookPreview());
    const bookStudents = $('#book-students');
    if (bookStudents) {
      bookStudents.addEventListener('change', () => {
        bookStudentsCache = new Set(bookSelectedStudents().map((student) => student.id));
        renderBookPreview();
      });
    }
    const bookPreviewBtn = $('#book-preview-btn');
    if (bookPreviewBtn) bookPreviewBtn.addEventListener('click', renderBookPreview);
    const bookGenerate = $('#book-generate');
    if (bookGenerate) bookGenerate.addEventListener('click', generateBookAssignment);
    $$('.word-source-tab').forEach((button) => {
      button.addEventListener('click', () => setWordSource(button.dataset.wordSource));
    });
    $('#word-preview').addEventListener('input', (event) => {
      const meaning = event.target.closest('[data-word-meaning]');
      if (meaning) {
        const index = Number(meaning.dataset.wordMeaning);
        if (!wordDraft[index]) return;
        wordDraft[index].zh = meaning.value;
        meaning.closest('.word-preview-row').classList.toggle('missing', !meaning.value.trim());
        updateWordDraftCount();
        return;
      }
      const example = event.target.closest('[data-word-ex]');
      if (example) {
        const index = Number(example.dataset.wordEx);
        if (!wordDraft[index]) return;
        wordDraft[index].ex = example.value;
        const row = example.closest('.word-preview-row');
        const badge = row && row.querySelector('.word-context-badge');
        if (badge) badge.remove();
        if (example.value.trim() && row) {
          const name = row.querySelector('.word-en');
          if (name) name.insertAdjacentHTML('beforeend', ' <span class="word-context-badge">语境</span>');
        }
        return;
      }
      const translation = event.target.closest('[data-word-ex-zh]');
      if (translation) {
        const index = Number(translation.dataset.wordExZh);
        if (wordDraft[index]) wordDraft[index].exZh = translation.value;
      }
    });
    $('#word-preview').addEventListener('click', (event) => {
      const button = event.target.closest('[data-word-remove]');
      if (!button) return;
      wordDraft.splice(Number(button.dataset.wordRemove), 1);
      renderWordPreview();
    });
    $('#report-import').addEventListener('click', () => {
      $('#import-report-code').value = '';
      S.openDialog($('#import-report-dialog'));
    });
    const boardPrev = $('#daily-board-prev');
    const boardNext = $('#daily-board-next');
    const boardThis = $('#daily-board-this');
    if (boardPrev) boardPrev.addEventListener('click', () => { dailyBoardOffset -= 1; renderDailyBoard(); });
    if (boardNext) boardNext.addEventListener('click', () => { dailyBoardOffset += 1; renderDailyBoard(); });
    if (boardThis) boardThis.addEventListener('click', () => { dailyBoardOffset = 0; renderDailyBoard(); });

    $('#teacher-tabs').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-tab]');
      if (button) switchTab(button.dataset.tab);
    });
    const publishNav = $('#publish-subnav');
    if (publishNav) {
      publishNav.addEventListener('click', (event) => {
        const button = event.target.closest('[data-publish-sub]');
        if (button) setPublishSub(button.dataset.publishSub);
      });
    }
    const publishBook = $('#publish-book');
    if (publishBook) publishBook.addEventListener('click', () => openBookDialog(''));
    $$('[data-goto]').forEach((button) => {
      button.addEventListener('click', () => {
        switchTab(button.dataset.goto);
        const pane = $(`.teacher-pane[data-pane="${button.dataset.goto}"]`);
        if (pane) pane.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    $('#insight-new').addEventListener('click', () => openInsightDialog(null));
    $('#insight-save').addEventListener('click', saveInsight);
    $('#insight-delete').addEventListener('click', () => {
      if (editingInsightId) deleteInsight(editingInsightId, true);
    });
    $('#insight-body-input').addEventListener('input', updateInsightCount);
    $('#insight-admin-list').addEventListener('click', (event) => {
      const button = event.target.closest('[data-insight-action]');
      if (!button) return;
      const item = button.closest('[data-insight-id]');
      if (!item) return;
      const id = item.dataset.insightId;
      const action = button.dataset.insightAction;
      if (action === 'edit') openInsightDialog(id);
      else if (action === 'delete') deleteInsight(id, false);
      else if (action === 'up') moveInsight(id, -1);
      else if (action === 'down') moveInsight(id, 1);
    });
    $('#insight-preview').addEventListener('click', previewInsights);
    $('#insight-export').addEventListener('click', exportInsights);
    $('#insight-copy-prompt').addEventListener('click', copyPublishPrompt);

    $('#student-add').addEventListener('click', () => openStudentDialog(null));
    $('#student-search').addEventListener('input', renderStudentGrid);
    $('#student-save').addEventListener('click', saveStudent);
    $('#student-delete').addEventListener('click', deleteStudent);
    const pinToggle = $('#student-pin-toggle');
    if (pinToggle) {
      pinToggle.addEventListener('click', () => {
        const input = $('#student-pin-input');
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        pinToggle.textContent = show ? '隐藏' : '显示';
        pinToggle.setAttribute('aria-label', show ? '隐藏学生密码' : '显示学生密码');
      });
    }
    const resetCopy = $('#reset-code-copy');
    if (resetCopy) {
      resetCopy.addEventListener('click', async () => {
        try {
          await S.copyText($('#reset-code-output').value);
          S.toast('重置码已复制，单独发给学生本人。', 'ok');
        } catch (error) {
          S.toast('复制失败，请手动全选复制。', 'error');
        }
      });
    }
    $$('#student-account-type input').forEach((input) => {
      input.addEventListener('change', () => {
        const field = $('#student-trial-days-field');
        if (field) field.hidden = input.value !== 'trial' || !input.checked;
      });
    });

    $('#plan-refresh').addEventListener('click', loadPlanPapers);
    const planWeekStart = $('#plan-week-start');
    if (planWeekStart) planWeekStart.value = S.todayIso();
    const planGenerate = $('#plan-generate');
    if (planGenerate) planGenerate.addEventListener('click', generateWeeklyPlan);
    const planPapersBox = $('#plan-papers');
    if (planPapersBox) {
      planPapersBox.addEventListener('change', (event) => {
        const input = event.target.closest('input[type="checkbox"]');
        if (!input) return;
        if (input.checked) planPaperIds.add(input.value);
        else planPaperIds.delete(input.value);
        updatePlanSelectedCount();
      });
    }
    const planStudentsBox = $('#plan-students');
    if (planStudentsBox) {
      planStudentsBox.addEventListener('change', (event) => {
        const input = event.target.closest('input[type="checkbox"]');
        if (!input) return;
        if (!planStudentIds) planStudentIds = new Set();
        if (input.checked) planStudentIds.add(input.value);
        else planStudentIds.delete(input.value);
        updatePlanSelectedCount();
      });
      planStudentsBox.addEventListener('click', (event) => {
        const button = event.target.closest('[data-plan-level]');
        if (!button) return;
        const row = button.closest('[data-plan-student]');
        if (!row) return;
        const student = getStudent(row.dataset.planStudent);
        if (!student) return;
        const next = clamp((Number(student.planLevel) || 5) + Number(button.dataset.planLevel || 0), 1, 10);
        if (next === student.planLevel) return;
        student.planLevel = next;
        student.levelHistory = student.levelHistory || [];
        student.levelHistory.unshift({ at: S.nowIso(), before: next - Number(button.dataset.planLevel), after: next, avgScore: null, reason: '老师手动调整' });
        student.levelHistory = student.levelHistory.slice(0, 30);
        save();
        renderPlanStudents();
        S.toast(`${student.name} 的难度调到 Lv.${next}（${planLevelLabel(next)}）。`, 'ok', 2400);
      });
    }
    const planListBox = $('#plan-list');
    if (planListBox) {
      planListBox.addEventListener('click', (event) => {
        const button = event.target.closest('[data-plan-action]');
        if (!button) return;
        const card = button.closest('[data-plan-id]');
        if (!card) return;
        const planId = card.dataset.planId;
        if (button.dataset.planAction === 'codes') openPlanCodes(planId);
        else if (button.dataset.planAction === 'delete') {
          if (!window.confirm('删除这份周计划记录？已经发给学生的周计划码仍然可用。')) return;
          data.plans = (data.plans || []).filter((plan) => plan.id !== planId);
          save();
          renderPlanList();
          S.toast('周计划记录已删除。');
        }
      });
    }

    const grammarGenerate = $('#grammar-generate');
    if (grammarGenerate) grammarGenerate.addEventListener('click', generateGrammarPacks);
    const grammarStudentsBox = $('#grammar-students');
    if (grammarStudentsBox) {
      grammarStudentsBox.addEventListener('change', (event) => {
        const input = event.target.closest('input[type="checkbox"]');
        if (!input) return;
        if (!grammarStudentIds) grammarStudentIds = new Set();
        if (input.checked) grammarStudentIds.add(input.value);
        else grammarStudentIds.delete(input.value);
        updateGrammarSelectedCount();
      });
    }
    const grammarMap = $('#grammar-map');
    if (grammarMap) {
      grammarMap.addEventListener('click', (event) => {
        const card = event.target.closest('[data-grammar-preview]');
        if (card) openGrammarPreview(Number(card.dataset.grammarPreview));
      });
    }
    const grammarListBox = $('#grammar-list');
    if (grammarListBox) {
      grammarListBox.addEventListener('click', (event) => {
        const button = event.target.closest('[data-grammar-action]');
        const card = event.target.closest('[data-grammar-plan]');
        if (!button || !card) return;
        if (button.dataset.grammarAction === 'codes') openGrammarPlanCodes(card.dataset.grammarPlan);
        else if (button.dataset.grammarAction === 'delete') deleteGrammarPlan(card.dataset.grammarPlan);
      });
    }

    const weeklyGenerate = $('#weekly-generate');
    if (weeklyGenerate) weeklyGenerate.addEventListener('click', generateWeeklyAdvice);
    const weeklyAi = $('#weekly-ai');
    if (weeklyAi) weeklyAi.addEventListener('click', runWeeklyAi);
    const weeklyPrintBtn = $('#weekly-print');
    if (weeklyPrintBtn) weeklyPrintBtn.addEventListener('click', weeklyPrint);
    const weeklyHandoutBtn = $('#weekly-handout');
    if (weeklyHandoutBtn) weeklyHandoutBtn.addEventListener('click', weeklyHandout);

    const trialParse = $('#trial-parse-request');
    if (trialParse) trialParse.addEventListener('click', parseTrialRequest);
    const trialGrant = $('#trial-grant-btn');
    if (trialGrant) {
      trialGrant.addEventListener('click', () => {
        if (!trialRequestPayload) return;
        const days = Number(($('#trial-grant-days') || {}).value) || 7;
        grantTrial(trialRequestPayload.studentId, days);
      });
    }
    const trialCopyGrant = $('#trial-copy-grant');
    if (trialCopyGrant) {
      trialCopyGrant.addEventListener('click', async () => {
        const code = ($('#trial-grant-output') || {}).value.trim();
        if (!code) return;
        try { await S.copyText(code); S.toast('延长码已复制。', 'ok'); } catch (error) { S.toast('复制失败，请手动复制。', 'error'); }
      });
    }
    const trialStudentsBox = $('#trial-students');
    if (trialStudentsBox) {
      trialStudentsBox.addEventListener('click', (event) => {
        const button = event.target.closest('[data-trial-action]');
        if (!button) return;
        const row = button.closest('[data-trial-student]');
        if (!row) return;
        const studentId = row.dataset.trialStudent;
        if (button.dataset.trialAction === 'extend') grantTrial(studentId, Number(button.dataset.days) || 7);
        else if (button.dataset.trialAction === 'upgrade') upgradeTrialStudent(studentId);
      });
    }

    $('#assign-papers').addEventListener('change', (event) => {
      if (event.target.name === 'assign-paper') {
        assignPaperId = event.target.value;
        updateAssignDefaults();
      }
    });
    $('#assign-generate').addEventListener('click', generateAssignment);

    $('#codes-list').addEventListener('click', async (event) => {
      const messageButton = event.target.closest('[data-copy-message-index]');
      const button = event.target.closest('[data-copy-index]');
      if (!messageButton && !button) return;
      const index = Number(messageButton ? messageButton.dataset.copyMessageIndex : button.dataset.copyIndex);
      const item = lastCodes[index];
      if (!item || !item.code) return;
      try {
        await S.copyText(messageButton ? codeMessageFor(item) : item.code);
        S.toast(messageButton ? `已复制给 ${item.student.name} 的微信消息（含可点链接）。` : `${item.student.name} 的纯码已复制。`, 'ok', 4200);
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

    $('#word-list').addEventListener('click', (event) => {
      const button = event.target.closest('[data-word-action]');
      if (!button) return;
      const card = button.closest('[data-word-id]');
      if (!card) return;
      const assignmentId = card.dataset.wordId;
      const action = button.dataset.wordAction;
      if (action === 'codes') {
        const assignment = (data.assignments || []).find((item) => item.id === assignmentId);
        if (assignment && assignment.bookMode) {
          const plans = (data.plans || []).filter((plan) => plan.bookAssignmentId === assignmentId);
          if (plans.length) showPlanCodes(plans);
          else S.toast('这条词汇书任务还没有生成计划，请点“续编下周”重新生成。', 'error', 5000);
        } else {
          openCodesForAssignment(assignmentId);
        }
      } else if (action === 'detail') openWordDetail(assignmentId);
      else if (action === 'continue') {
        const assignment = (data.assignments || []).find((item) => item.id === assignmentId);
        if (assignment) openBookDialog(assignmentId);
      } else if (action === 'delete') deleteWordAssignment(assignmentId);
    });

    $('#detail-back').addEventListener('click', closeDetail);
    $('#detail-assign').addEventListener('click', () => openAssign(detailStudentId));
    $('#detail-enroll').addEventListener('click', () => openEnroll(detailStudentId));
    $('#detail-edit').addEventListener('click', () => openStudentDialog(detailStudentId));
    const detailReset = $('#detail-reset');
    if (detailReset) detailReset.addEventListener('click', () => {
      const student = getStudent(detailStudentId);
      if (student) openResetCode(student);
    });
    const detailDelete = $('#detail-delete');
    if (detailDelete) detailDelete.addEventListener('click', () => deleteStudent(detailStudentId));
    const taskAnswerBox = $('#detail-task-table');
    if (taskAnswerBox) {
      taskAnswerBox.addEventListener('click', (event) => {
        const button = event.target.closest('[data-task-answer]');
        if (!button) return;
        event.preventDefault();
        openTaskAnswer(button.dataset.taskAnswer);
      });
    }
    $('#detail-tabs').addEventListener('click', (event) => {
      const button = event.target.closest('button[data-detail-tab]');
      if (!button) return;
      $$('#detail-tabs button').forEach((item) => item.classList.toggle('active', item === button));
      $$('.detail-pane').forEach((pane) => pane.classList.toggle('active', pane.dataset.detailPane === button.dataset.detailTab));
    });
    $('#copy-ai-prompt').addEventListener('click', copyAiPrompt);
    $('#save-ai-result').addEventListener('click', saveAiResult);
    $('#save-notes').addEventListener('click', saveNotes);
    const runAiBtn = $('#run-ai-prompt');
    if (runAiBtn) runAiBtn.addEventListener('click', runAiAnalysis);
    const saveKeyBtn = $('#ai-key-save');
    if (saveKeyBtn) saveKeyBtn.addEventListener('click', saveAiKey);
    const testKeyBtn = $('#ai-key-test');
    if (testKeyBtn) testKeyBtn.addEventListener('click', testAiKey);
    const clearKeyBtn = $('#ai-key-clear');
    if (clearKeyBtn) clearKeyBtn.addEventListener('click', clearAiKey);
    window.addEventListener('storage', (event) => {
      if (event.key === S.ai.storageKey) updateAiSettingsUI();
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) updateAiSettingsUI();
    });

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
    takeReportLink();
    bindEvents();
    showAuth();
  }

  init();
})();
