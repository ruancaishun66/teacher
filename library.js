/* ==========================================================================
   顺势 · 教师工作台
   本地优先的资料库：IndexedDB + 浏览器内解析 + 组卷 + 备份。
   任何资料都不会上传到服务器。
   ========================================================================== */
(() => {
  'use strict';

  /* ------------------------------------------------------------------------
     常量
     ------------------------------------------------------------------------ */

  const DB_NAME = 'rcs-teacher-library';
  const DB_VERSION = 1;
  const STORES = ['materials', 'items', 'papers', 'settings'];
  // 品牌取“顺势”，取《史记》“善战者因其势而利导之”与《论语》“循循然善诱人”之意。
  const BRAND_NAME = '顺势';
  const BRAND_SEAL = '势';
  const BRAND_TAGLINE = '因势利导 · 循循善诱';
  const BRAND_SIGNATURE = '顺势 · 因势利导';
  const DEFAULT_WATERMARK = `${BRAND_SIGNATURE} · 仅供学习`;
  const LEGACY_WATERMARK = '阮蔡顺 · 初高中英语 · 仅供学习';
  const MAX_FILE_BYTES = 100 * 1024 * 1024;
  const MAX_PDF_PAGES = 80;
  const OCR_PDF_PAGE_LIMIT = 8;
  const VIEWS = new Set(['library', 'upload', 'practice', 'settings', 'guide']);
  const FONT_STACK = 'Arial, "SimHei", "Microsoft YaHei", "Heiti SC", sans-serif';
  const CN_FONT_STACK = '"SimHei", "Microsoft YaHei", "Heiti SC", sans-serif';

  const TYPES = {
    single: { label: '单项选择', short: '单选', unit: '道', order: 1 },
    cloze: { label: '完形填空', short: '完形', unit: '篇', order: 2 },
    reading: { label: '阅读理解', short: '阅读', unit: '篇', order: 3 },
    five: { label: '五选五 / 七选五', short: '五选五', unit: '篇', order: 4 },
    grammar: { label: '语法填空（含短文填空）', short: '语法', unit: '篇', order: 5 },
    dialogue: { label: '情景交际', short: '情景交际', unit: '道', order: 6 },
    picture: { label: '看图写话', short: '看图', unit: '道', order: 7 },
    // 旧版本把“短文填空”单列。各地叫法不同，本质仍是语篇语法填空；
    // 这里只保留兼容键，新资料一律归入 grammar，不再出现在题型下拉框里。
    shortblank: { label: '语法填空（短文填空）', short: '语法', unit: '篇', order: 5.5, legacy: true },
    writing: { label: '书面表达', short: '作文', unit: '篇', order: 9 },
    listening: { label: '听力理解', short: '听力', unit: '套', order: 10 },
    paper: { label: '综合练习卷', short: '综合卷', unit: '份', order: 11 },
    other: { label: '其他资料', short: '其他', unit: '份', order: 12 }
  };

  const TYPE_ORDER = Object.keys(TYPES)
    .filter((key) => !TYPES[key].legacy)
    .sort((a, b) => TYPES[a].order - TYPES[b].order);

  const TYPE_KEYWORDS = {
    single: {
      strong: ['单项选择', '单项填空', '单项选择题', '选择填空', 'multiple choice', 'single choice', 'choose the best answer'],
      weak: ['单选', '选择题']
    },
    cloze: {
      strong: ['完形填空', '完型填空', 'cloze test', 'cloze'],
      weak: ['完形', '完型']
    },
    reading: {
      strong: ['阅读理解', '阅读下列短文', '阅读短文', 'reading comprehension', 'read the passage'],
      weak: ['阅读']
    },
    five: {
      strong: ['五选五', '七选五', '阅读填句', '阅读七选五', '阅读还原', '补全短文', '从短文后所给的五个选项', '从短文后所给'],
      weak: ['选五', '阅读填空', '还原']
    },
    grammar: {
      strong: [
        '语法填空', '短文填空', '短文填词', '语篇填空', '首字母填空', '选词填空',
        '单词拼写', '词汇运用', '完成句子', 'grammatical fill',
        'fill in the blanks with the correct form', '括号内单词的正确形式', '所给单词的正确形式'
      ],
      weak: ['语法', '根据首字母', '根据语境']
    },
    dialogue: {
      strong: ['情景交际', '补全对话', '完成对话', '根据情景', 'dialogue completion', 'complete the dialogue'],
      weak: ['交际', '对话']
    },
    picture: {
      strong: ['看图写话', '看图作文', '根据图片', '根据所给图片', 'look at the pictures and write'],
      weak: ['看图', '图片']
    },
    writing: {
      strong: ['书面表达', '应用文写作', '写作题', '作文题', '读后续写', 'writing task', 'write a composition'],
      weak: ['作文', '写作']
    },
    listening: {
      strong: ['听力测试', '听力理解', '听音理解', '听下面五段', '听下面七段', '听第', 'listening comprehension'],
      weak: ['听力', '听音', 'listening']
    }
  };

  const SECTION_NOTES = {
    single: '从每题所给的 A、B、C、D 四个选项中，选出可以填入空白处的最佳选项。',
    cloze: '阅读下面短文，从每题所给的 A、B、C、D 四个选项中，选出可以填入空白处的最佳选项。',
    reading: '阅读下列短文，从每题所给的 A、B、C、D 四个选项中，选出最佳选项。',
    five: '阅读下面短文，从短文后所给的选项中选出能填入空白处的最佳选项，使短文通顺、连贯。',
    grammar: '阅读下面短文，在空白处填入 1 个适当的单词或括号内单词的正确形式；首字母填空、选词填空、短文填词按题目要求作答。',
    dialogue: '根据情景，用恰当的语句完成下列对话。',
    picture: '根据每题所提供的图画情景和提示词，写出一个与图画情景相符的句子。',
    writing: '根据提示，完成写作。',
    listening: '听录音，完成练习。'
  };

  const GRADE_OPTIONS = ['七年级', '八年级', '九年级', '高一', '高二', '高三', '中考', '高考', '初中', '高中'];

  const BAND_LABELS = { junior: '初中', senior: '高中' };
  const BAND_OPTIONS = [
    { value: '', label: '全部' },
    { value: 'junior', label: '初中' },
    { value: 'senior', label: '高中' }
  ];

  const GRADE_EQUIVALENTS = {
    '高考': ['高考', '高三'],
    '中考': ['中考', '九年级', '初三'],
    '高一': ['高一', '高中一年级'],
    '高二': ['高二', '高中二年级'],
    '高三': ['高三', '高中三年级']
  };

  const ALIASES = {
    single: ['单项选择题', '单项选择', '单项填空', '选择填空', '选择题', '单选'],
    cloze: ['完形填空', '完型填空', '完形', '完型', 'cloze'],
    reading: ['阅读理解', '阅读下列短文', '阅读', 'reading'],
    five: ['阅读七选五', '五选五', '七选五', '阅读填句', '阅读还原', '补全短文', '选五'],
    grammar: ['语法填空', '短文填空', '短文填词', '语篇填空', '首字母填空', '选词填空', '单词拼写', '词汇运用', '语法'],
    dialogue: ['情景交际', '补全对话', '完成对话', '交际'],
    picture: ['看图写话', '看图作文', '看图'],
    writing: ['应用文写作', '书面表达', '作文', '读后续写', '写作'],
    listening: ['听力理解', '听力', 'listening']
  };

  // 识别库的“推荐别名”。各地模拟卷的叫法差别很大，先把常见的收进来；
  // 老师还可以在设置里继续添加，导入时优先按识别库匹配。
  const RECOMMENDED_SECTION_ALIASES = [
    { alias: '单项选择', type: 'single' },
    { alias: '单项填空', type: 'single' },
    { alias: '选择填空', type: 'single' },
    { alias: '语法选择', type: 'single' },
    { alias: '完形填空', type: 'cloze' },
    { alias: '完型填空', type: 'cloze' },
    { alias: '阅读理解', type: 'reading' },
    { alias: '任务型阅读', type: 'reading' },
    { alias: '阅读表达', type: 'reading' },
    { alias: '回答问题', type: 'reading' },
    { alias: '五选五', type: 'five' },
    { alias: '七选五', type: 'five' },
    { alias: '阅读还原', type: 'five' },
    { alias: '阅读填句', type: 'five' },
    { alias: '补全短文', type: 'five' },
    { alias: '信息匹配', type: 'five' },
    { alias: '语法填空', type: 'grammar' },
    { alias: '短文填空', type: 'grammar' },
    { alias: '短文填词', type: 'grammar' },
    { alias: '语篇填空', type: 'grammar' },
    { alias: '首字母填空', type: 'grammar' },
    { alias: '选词填空', type: 'grammar' },
    { alias: '单词拼写', type: 'grammar' },
    { alias: '词汇运用', type: 'grammar' },
    { alias: '完成句子', type: 'grammar' },
    { alias: '情景交际', type: 'dialogue' },
    { alias: '补全对话', type: 'dialogue' },
    { alias: '完成对话', type: 'dialogue' },
    { alias: '看图写话', type: 'picture' },
    { alias: '看图作文', type: 'picture' },
    { alias: '书面表达', type: 'writing' },
    { alias: '应用文写作', type: 'writing' },
    { alias: '读后续写', type: 'writing' }
  ];

  const CN_NUMS = {
    '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
  };

  const SKILL_LABELS = {
    detail: '细节理解',
    inference: '推理判断',
    main: '主旨大意',
    title: '最佳标题',
    meaning: '词义猜测',
    reference: '指代判断',
    structure: '篇章结构',
    attitude: '观点态度',
    grammar: '语法知识',
    vocabulary: '词汇辨析',
    cohesion: '语篇衔接',
    writing: '写作表达',
    listening: '听力理解',
    general: '综合理解'
  };

  // 题组缓存的结构版本。答案解析规则升级后，首次打开会自动重建旧资料的题组。
  const PARSER_VERSION = 14;

  const DEFAULT_SETTINGS = {
    watermark: DEFAULT_WATERMARK,
    defaultGrade: '',
    examTitle: '英语每日练习',
    examOwner: BRAND_NAME,
    includeAnswers: true,
    includeVocab: true,
    includeDictation: true,
    ocrEnabled: true,
    ocrLang: 'eng+chi_sim',
    ocrPdfPages: OCR_PDF_PAGE_LIMIT,
    showDifficulty: true,
    usbMirror: false,
    sectionAliases: []
  };

  /* ------------------------------------------------------------------------
     状态
     ------------------------------------------------------------------------ */

  const state = {
    db: null,
    materials: [],
    items: [],
    papers: [],
    settings: { ...DEFAULT_SETTINGS },
    view: 'library',
    filters: { q: '', type: '', grade: '', level: '', sort: 'newest' },
    practiceLevel: '',
    currentPaper: null,
    currentParsed: null,
    paperFrame: null,
    editId: null,
    confirmAction: null,
    pendingRestoreFile: null,
    busy: false,
    persistenceRequested: false,
    samplesBusy: false,
    ocrProgress: null,
    aiDialogMode: 'analysis',
    aiSplitId: null,
    questionEdit: null,
    sectionAliases: [],
    usbHandle: null,
    wordDictionary: null,
    dictionaryPromise: null,
    ocrWorker: null,
    ocrWorkerLang: '',
    ocrWorkerPromise: null
  };

  /* ------------------------------------------------------------------------
     小工具
     ------------------------------------------------------------------------ */

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));
  }

  function escapeXml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;'
    }[char]));
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function uid() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function todayIsoDate() {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  }

  function todayCn() {
    const d = new Date();
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function formatDate(iso, withTime = false) {
    if (!iso) return '—';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    if (!withTime) return `${y}-${m}-${d}`;
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}`;
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
    return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  function safeFilename(name) {
    return String(name || '未命名')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/g, '')
      .slice(0, 80) || '未命名';
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 8000);
    mirrorBlobToUsb(blob, filename);
  }

  function debounce(fn, wait = 150) {
    let timer = null;
    return (...args) => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fn(...args), wait);
    };
  }

  function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function unique(list) {
    return Array.from(new Set(list));
  }

  function countOccurrences(haystack, needle) {
    if (!haystack || !needle) return 0;
    const h = haystack.toLowerCase();
    const n = needle.toLowerCase();
    let count = 0;
    let index = 0;
    while (count < 30) {
      const found = h.indexOf(n, index);
      if (found === -1) break;
      count += 1;
      index = found + n.length;
    }
    return count;
  }

  function repairEnglishSpacing(text) {
    // PDF / OCR 常把句号、逗号后的空格吃掉，出现 “word.Wearing”“bird,Help”。
    // 只在“两个字母以上的英文单词 + 标点 + 大写字母”时补空格，避免破坏
    // U.S.A、e.g.、小数和网址。只影响可读性，不改动题目内容。
    return String(text || '')
      .replace(/([a-z]{2})([.!?])([A-Z][a-z])/g, '$1$2 $3')
      .replace(/([a-z])([,;:])([A-Za-z])/g, '$1$2 $3')
      .replace(/([”"])([A-Z][a-z])/g, '$1 $2');
  }

  function toDisplayText(text) {
    return repairEnglishSpacing(String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/ /g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim());
  }

  /* ------------------------- 导入文字清理 ------------------------- */
  // 试卷 PDF / 扫描件里常见页眉、页脚、页码、网址、题库水印和 OCR 噪点。
  // 这些内容一旦进入资料库，就会跟着每日练习一起印出来，所以在入库前先清一遍。
  const NOISE_LINE_RULES = [
    /^\s*第\s*\d{1,3}\s*页(?:\s*[，,/·]?\s*共\s*\d{1,3}\s*页)?\s*$/,
    /^\s*共\s*\d{1,3}\s*页\s*$/,
    /^\s*(?:page|p\.?)\s*\d{1,3}(?:\s*(?:of|\/)\s*\d{1,3})?\s*$/i,
    /^\s*[-—–]\s*\d{1,3}\s*[-—–]\s*$/,
    /^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/,
    /^\s*(?:第[一二三四五六七八九十]+页)\s*$/,
    /^\s*\d{1,3}\s*$/,
    /(?:扫描全能王|CamScanner|全能扫描王|夸克扫描王)/i,
    /(?:学科网|菁优网|组卷网|21世纪教育网|无忧考网|中考网|高考网|百度文库|道客巴巴|豆丁网|橡皮网|题库网|教习网|二一教育)/,
    /(?:https?:\/\/|www\.)\S+/i,
    /^\s*[\w.-]+\.(?:com|cn|net|org)(?:\/\S*)?\s*$/i,
    /^\s*(?:QQ|qq|微信|wechat|WeChat|微信号)\s*[:：]?\s*[A-Za-z0-9_-]{4,}\s*$/,
    /^\s*(?:绝密★?启用前|机密★?启用前)\s*$/,
    /^\s*(?:内部资料|仅供学习|仅供参考|版权所有|侵权必究|翻印必究)[\s·，。;；]*$/,
    /^\s*(?:英语试题|英语试卷|英语测试卷)\s*$/,
    /^\s*(?:请在各题目的答题区域内作答|超出黑色矩形边框限定区域的答案无效).*$/,
    /^\s*(?:试题|试卷|本卷|全卷)\s*结束.*$/,
    /^\s*请认真检查.*$/,
    /^\s*(?:注意事项|考生须知)\s*[:：]?\s*$/
  ];

  function normalizeFurnitureKey(line) {
    return String(line || '')
      .toLowerCase()
      .replace(/[0-9０-９]+/g, '#')
      .replace(/[·•|—–_]+/g, '')
      .replace(/\s+/g, '');
  }

  function isLikelyFurnitureLine(line) {
    const text = String(line || '').trim();
    if (!text) return false;
    // 阅读篇目标签 A–E、题号行、选项行、问句都不是页眉页脚。
    if (/^[A-G]$/.test(text)) return false;
    if (/^[_\-—\s]+$/.test(text)) return false;
    if (/^\d{1,3}\s*[.、．)）]/.test(text)) return false;
    if (/^[A-G]\s*[.、．)）]/.test(text)) return false;
    if (/[?？]/.test(text)) return false;
    if (englishWordTokens(text).length >= 10) return false;
    return text.length <= 60;
  }

  function stripPartHeading(text) {
    // “第二部分（非选择题）”是卷面结构标记，不是题目内容。它常粘在五选五选项
    // 末尾或作文提示后面，必须在入库和渲染时都清掉，否则会印进选项框。
    return String(text || '')
      .replace(/第[一二三四五六七八九十]+\s*部分\s*[（(][^）)]{0,24}[）)]/g, ' ')
      .replace(/第[一二三四五六七八九十]+\s*部分\s*$/g, ' ')
      .replace(/[-]/g, ' ')
      .replace(/[□☐]/g, ' ')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  function isPartHeadingLine(line) {
    const text = String(line || '').trim();
    if (!text) return false;
    return /^第[一二三四五六七八九十]+\s*部分(?:\s*[（(][^）)]{0,24}[）)])?\s*$/.test(text);
  }

  function isNoiseLine(line) {
    const text = String(line || '').trim();
    if (!text) return false;
    if (/^[\s\-—_=*·•.。，,;；:：|\\/]+$/.test(text)) return true;
    if (NOISE_LINE_RULES.some((pattern) => pattern.test(text))) return true;
    // OCR 常把边框、下划线识别成一串符号；字母/汉字/数字占比过低时丢掉。
    if (text.length >= 6) {
      const meaningful = (text.match(/[A-Za-z0-9一-鿿]/g) || []).length;
      if (meaningful / text.length < 0.32) return true;
    }
    return false;
  }

  function cleanPageTexts(pages) {
    const cleaned = (pages || []).map((page) => String(page || '').replace(/\r\n?/g, '\n'));
    if (!cleaned.length) return [];
    const counts = new Map();
    const samples = new Map();
    if (cleaned.length >= 2) {
      cleaned.forEach((page) => {
        const seen = new Set();
        page.split('\n').forEach((line) => {
          const trimmed = line.trim();
          if (!trimmed) return;
          const key = normalizeFurnitureKey(trimmed);
          if (!key || seen.has(key)) return;
          seen.add(key);
          counts.set(key, (counts.get(key) || 0) + 1);
          if (!samples.has(key)) samples.set(key, trimmed);
        });
      });
    }
    const threshold = Math.max(2, Math.ceil(cleaned.length * 0.5));
    const repeated = new Set();
    counts.forEach((count, key) => {
      if (count >= threshold && isLikelyFurnitureLine(samples.get(key))) repeated.add(key);
    });
    return cleaned.map((page) => page.split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return true;
        if (isNoiseLine(trimmed)) return false;
        return !repeated.has(normalizeFurnitureKey(trimmed));
      })
      .join('\n'));
  }

  function cleanImportedText(text, options = {}) {
    const source = String(text || '').replace(/\r\n?/g, '\n');
    if (!source.trim()) return { text: '', removed: 0 };
    const lines = source.split('\n');
    const counts = new Map();
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.length > 60) return;
      const key = normalizeFurnitureKey(trimmed);
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    const repeated = new Set();
    counts.forEach((count, key) => {
      if (count >= 4) repeated.add(key);
    });
    const watermarkKeys = new Set(
      [watermarkText(), DEFAULT_WATERMARK, LEGACY_WATERMARK, BRAND_SIGNATURE]
        .map((value) => normalizeFurnitureKey(value))
        .filter(Boolean)
    );
    let removed = 0;
    const kept = [];
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        kept.push('');
        return;
      }
      if (isNoiseLine(trimmed) || isPartHeadingLine(trimmed)) {
        removed += 1;
        return;
      }
      const key = normalizeFurnitureKey(trimmed);
      if (watermarkKeys.has(key)) {
        removed += 1;
        return;
      }
      if (repeated.has(key) && isLikelyFurnitureLine(trimmed)) {
        removed += 1;
        return;
      }
      kept.push(stripPartHeading(line.replace(/[ \t]+$/g, '')));
    });
    // options.fileName 目前不参与判断，保留参数是为了以后按来源做更细的规则。
    void options.fileName;
    return { text: toDisplayText(kept.join('\n')), removed };
  }

  function isCjk(char) {
    return /[㐀-鿿぀-ヿ]/.test(char || '');
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  function asLocalDate(iso) {
    const text = String(iso || '').slice(0, 10);
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return new Date();
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }

  function cnDate(iso) {
    const date = asLocalDate(iso);
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
  }

  function cnWeekday(iso) {
    const labels = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    return labels[asLocalDate(iso).getDay()];
  }

  function cnDateWithWeek(iso) {
    return `${cnDate(iso)} ${cnWeekday(iso)}`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function escapeRegExp(text) {
    return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalizeEnglish(text) {
    return String(text || '')
      .replace(/[‘’']/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-');
  }

  function splitSentences(text) {
    return normalizeEnglish(text)
      .split(/(?<=[.!?])\s+(?=[A-Z(])|\n+/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 1);
  }

  function splitProseSentences(text) {
    // PDF 每一行都会硬换行；如果按换行切句，长难句会被切成
    // “wants to ask him…” 这种没有主语的半句。散文先并回一行再按标点切。
    return normalizeEnglish(text)
      .replace(/\r\n?/g, '\n')
      .replace(/\n+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .split(/(?<=[.!?])\s+(?=[A-Z0-9("“'①-⑳])/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence.length > 1);
  }

  function englishWordTokens(text) {
    return normalizeEnglish(text)
      .match(/[A-Za-z][A-Za-z'’-]*/g) || [];
  }

  function trimAnswerExplanation(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const kept = [];
    for (const line of lines) {
      const value = line.trim();
      // 上一题的解析末尾常粘着下一段答案速查（如“16. A 17. B 18. C”），在这里截断。
      if (/^\d{1,3}\s*[.、．)）]\s*(?:[A-G](?:\s+\d{1,3}\s*[.、．)）]\s*[A-G])*|[A-Za-z][A-Za-z' ?-]{0,60}[.。?？]?|略|答案[:：]?)\s*$/.test(value)) {
        break;
      }
      kept.push(line);
    }
    return kept.join('\n').trim();
  }

  function parseAnswerKey(text) {
    const source = normalizeEnglish(String(text || ''));
    const map = {};
    const setEntry = (number, answer, explanation) => {
      const key = Number(number);
      if (!Number.isFinite(key) || key < 1 || key > 200) return;
      const existing = map[key] || {};
      const raw = String(answer || '').trim().replace(/[.。]+$/, '');
      const value = /^[A-G]$/i.test(raw) ? raw.toUpperCase() : raw.slice(0, 40);
      map[key] = {
        answer: value || existing.answer || '',
        explanation: trimAnswerExplanation(explanation || existing.explanation || '')
      };
    };

    // “1-5 BBACA”“21—25 ABDCC”这类成组答案。
    const rangePattern = /(?:^|\n|\s)(\d{1,3})\s*[-–—~至]\s*(\d{1,3})\s*[:：]?\s*([A-G](?:[\s,，、;；]*[A-G])*)/g;
    let match = rangePattern.exec(source);
    while (match) {
      const start = Number(match[1]);
      const end = Number(match[2]);
      const letters = (match[3].match(/[A-G]/g) || []);
      if (end >= start && end - start + 1 === letters.length) {
        letters.forEach((letter, index) => setEntry(start + index, letter, ''));
      }
      match = rangePattern.exec(source);
    }

    // “53.C 【解析】……”以及语法填空“1. went 【解析】……”这类逐题详解。
    // 答案部分可能是完整问句或长短语，不能只限四五个单词，否则后一题的解析会粘到前一题里。
    const detailHead = '\\s*(\\d{1,3})\\s*[.、．)）]?\\s*([^\\n【]{1,80}?)\\s*[.。]?\\s*(?:【解析】|\\[解析\\]|解析[:：])';
    const detailPattern = new RegExp(
      '(?:^|\\n)' + detailHead + '\\s*([\\s\\S]*?)' +
      '(?=(?:\\n\\s*\\d{1,3}\\s*[.、．)）]?\\s*[^\\n【]{1,80}?\\s*[.。]?\\s*(?:【解析】|\\[解析\\]|解析[:：]))|$)',
      'gi'
    );
    match = detailPattern.exec(source);
    while (match) {
      setEntry(match[1], match[2], match[3]);
      match = detailPattern.exec(source);
    }

    // “21.B”“21 B”“21、B”这类单题答案。
    const singlePattern = /(\d{1,3})\s*[.、．)）]?\s*([A-G])(?=\s|$|[，,。;；、])/g;
    match = singlePattern.exec(source);
    while (match) {
      setEntry(match[1], match[2], '');
      match = singlePattern.exec(source);
    }

    // 语法填空、短文填空的答案常常是单词或短语，如 “1. went”“2. to go”。
    const wordPattern = /(\d{1,3})\s*[.、．)）]\s*([A-Za-z][A-Za-z'’-]*(?:\s+(?:to\s+)?[A-Za-z][A-Za-z'’-]*){0,3})\s*(?=\d{1,3}\s*[.、．)）]|【|\[|解析|\(|（|$|\n)/g;
    match = wordPattern.exec(source);
    while (match) {
      if (!map[Number(match[1])]) setEntry(match[1], match[2], '');
      match = wordPattern.exec(source);
    }

    return map;
  }

  function trimOptionText(value) {
    let text = String(value || '');
    // 下一篇文章的篇目标签常常单独占一行（B / C…），不能被最后一项选项吞进去。
    let cut = text.search(/\n[ \t]*[A-G][ \t]*(?=\n|$)/);
    if (cut >= 0) text = text.slice(0, cut);
    // 下一大题的标题或作答说明。
    cut = text.search(/\n[ \t]*(?:第[一二三四五六七八九十]+(?:部分|节|大题)|[一二三四五六七八九十]+、|(?:阅读下列短文|阅读下面短文|完形填空|语法填空|短文填空|短文填词|书面表达|听力理解|情景交际|看图写话)[:：]?)/);
    if (cut >= 0) text = text.slice(0, cut);
    // 没有换行的“D. four B The next passage…”：在句末标点后、篇目标签前截断。
    cut = text.search(/[.!?]\s+[A-G]\s+(?=[A-Z][a-z])/);
    if (cut >= 0) text = text.slice(0, cut + 1);
    // 兜底：下一题题号如果没被主解析器切开，也不能留在选项里。
    cut = text.search(/\n[ \t]*\d{1,3}[.、．)）]\s*/);
    if (cut >= 0) text = text.slice(0, cut);
    // 选项通常只占一行；若后面空行接了一整段英文，保留选项本身。
    const paragraphs = text.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    if (paragraphs.length > 1 && paragraphs[0].length <= 100
      && englishWordTokens(paragraphs.slice(1).join(' ')).length >= 12) {
      text = paragraphs[0];
    }
    return text.replace(/\s+/g, ' ').trim();
  }

  function normalizeStemText(text) {
    // PDF 的每一行都会硬换行。题干如果原样保留这些换行，印出来就会一行一截，
    // 像被剪碎一样。这里把软换行并回一段；对话、短诗句和表格行则保留分行。
    const source = String(text || '').replace(/\r\n?/g, '\n').trim();
    if (!source) return '';
    return source.split(/\n{2,}/).map((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      if (!lines.length) return '';
      if (lines.length === 1) return lines[0];
      const dialogue = lines.every((line) => /^(?:[-–—]|(?:A|B|M|W|Man|Woman|Mr|Ms|Mrs|Dr)\s*[:：.])/.test(line));
      const poetic = lines.length >= 3
        && lines.every((line) => line.length <= 58)
        && lines.filter((line) => /[.!?。！？]$/.test(line)).length <= 1;
      if (dialogue || poetic) return lines.join('\n');
      return lines.join(' ').replace(/\s{2,}/g, ' ').trim();
    }).filter(Boolean).join('\n');
  }

  function extractQuestionOptions(block) {
    const source = normalizeEnglish(block);
    const marker = /(?:^|[\s\n])([A-E])[.、．)）]\s*/g;
    const markers = [];
    let match = marker.exec(source);
    while (match) {
      markers.push({
        letter: match[1],
        start: match.index + (match[0].length - match[0].replace(/^[\s\n]+/, '').length),
        contentStart: marker.lastIndex
      });
      match = marker.exec(source);
    }
    // 从 A 开始连续取选项；遇到第一个断点就停，避免把后文正文里的 B、C 当成选项。
    const starts = [];
    let broken = false;
    markers.forEach((item) => {
      if (broken) return;
      if (!starts.length) {
        if (item.letter !== 'A') return;
        starts.push(item);
        return;
      }
      const expected = String.fromCharCode(65 + starts.length);
      if (item.letter === expected) starts.push(item);
      else broken = true;
    });
    if (starts.length < 2) return { stem: normalizeStemText(source), options: [] };
    const stem = normalizeStemText(source.slice(0, starts[0].start));
    const options = starts.map((item, index) => {
      const end = index + 1 < starts.length ? starts[index + 1].start : source.length;
      return {
        letter: item.letter,
        text: trimOptionText(source.slice(item.contentStart, end))
      };
    }).filter((option) => option.text);
    return { stem, options };
  }

  function looksLikeQuestionStartText(text) {
    const sample = String(text || '').slice(0, 120).trim();
    if (!sample) return false;
    if (/^[_（(]/.test(sample)) return true;
    if (!/^[A-Za-z"'“]/.test(sample)) return false;
    return englishWordTokens(sample).length >= 2;
  }

  function findInlineQuestionStart(source, number, from, end) {
    const pattern = new RegExp(`(?:^|[^0-9])(${number})\\s*[.、．)）]\\s*`, 'g');
    pattern.lastIndex = from;
    const match = pattern.exec(source);
    if (!match || match.index >= end) return null;
    const contentStart = pattern.lastIndex;
    if (contentStart >= end) return null;
    if (!looksLikeQuestionStartText(source.slice(contentStart, contentStart + 160))) return null;
    return {
      number,
      index: match.index + (match[0].length - match[0].replace(/^[^0-9]*/, '').length),
      contentStart
    };
  }

  function collectQuestionStarts(source) {
    const anchors = [];
    const pattern = /(?:^|\n)[ \t]*(\d{1,3})[.、．)）][ \t]*/g;
    let match = pattern.exec(source);
    while (match) {
      const number = Number(match[1]);
      if (number >= 1 && number <= 200) {
        anchors.push({
          number,
          index: match.index + (match[0].startsWith('\n') ? 1 : 0),
          contentStart: pattern.lastIndex
        });
      }
      match = pattern.exec(source);
    }
    const starts = anchors.slice();
    // PDF 经常把“24. A. … B. … C. … D. … 25. A. …”压成一行。
    // 在两个行首题号之间按 expected = 上一个 + 1 找内联题号，补回被吞掉的切分点。
    for (let index = 0; index < anchors.length - 1; index += 1) {
      const from = anchors[index];
      const to = anchors[index + 1];
      let expected = from.number + 1;
      let cursor = from.contentStart;
      while (expected < to.number) {
        const found = findInlineQuestionStart(source, expected, cursor, to.index);
        if (!found) break;
        starts.push(found);
        cursor = found.contentStart;
        expected += 1;
      }
    }
    if (anchors.length) {
      const last = anchors[anchors.length - 1];
      let expected = last.number + 1;
      let cursor = last.contentStart;
      let guard = 0;
      while (guard < 120) {
        const found = findInlineQuestionStart(source, expected, cursor, source.length);
        if (!found) break;
        starts.push(found);
        cursor = found.contentStart;
        expected += 1;
        guard += 1;
      }
    }
    starts.sort((a, b) => a.index - b.index);
    return starts.filter((start, index) => index === 0 || start.index !== starts[index - 1].index);
  }

  function filterReadingTableStarts(starts) {
    // 阅读材料里的实验步骤、表格行也常写成“1. 2. 3.”。如果同一段里既有
    // 1–10 的步骤编号，又有 11 以上的连续题号，保留高题号，避免把步骤当小题。
    if (starts.length < 3) return starts;
    const high = starts.filter((start) => start.number >= 11);
    const low = starts.filter((start) => start.number <= 10);
    if (high.length >= 2 && low.length) {
      return starts.filter((start) => start.number >= 11);
    }
    return starts;
  }

  function mergeMisnumberedContinuations(blocks) {
    // PDF 里偶尔出现“80. … / 77. —No, I disagree.”这种印刷或识别错号。
    // 当某个题号不增反降、且后面没有继续降号时，把它并回上一题，避免凭空多一小题。
    // 另一种是页脚页码粘在换行句前面：“56. —Yes, Ms Lu…”，题号会突然从 24 跳到 56
    // 再回到 25；这种“尖峰号”也要并回上一题，或直接丢掉页码。
    const merged = [];
    blocks.forEach((block, index) => {
      const prev = merged[merged.length - 1];
      const next = blocks[index + 1];
      const loneOutOfOrder = prev && block.number <= prev.number && (!next || next.number > prev.number);
      const pageNumberSpike = prev && next
        && block.number > prev.number + 5
        && next.number === prev.number + 1;
      if (!loneOutOfOrder && !pageNumberSpike) {
        merged.push(block);
        return;
      }
      const extra = String(block.raw || '').replace(/^\s*\d{1,3}\s*[.、．)）]\s*/, '').trim();
      // 页码后面直接跟下一题时，正文属于下一题，不能并进上一题。
      if (pageNumberSpike && /^\d{1,3}\s*[.、．)）]/.test(extra)) return;
      if (extra) {
        // 合并后必须重新拆一次选项：对话续行后面常常紧跟着 A/B/C，
        // 只把文字拼进 stem 会把选项一起吞掉，印出来就是一道没有选项的选择题。
        prev.raw = `${prev.raw || ''}\n${extra}`.trim();
        const reparsed = extractQuestionOptions(prev.raw);
        prev.stem = reparsed.stem;
        prev.options = reparsed.options;
        prev.end = block.end;
      }
    });
    return merged;
  }

  function parseQuestionBlocks(text, options = {}) {
    const source = normalizeEnglish(String(text || '')).replace(/\r\n?/g, '\n');
    let starts = collectQuestionStarts(source);
    if (options.reading) starts = filterReadingTableStarts(starts);
    const blocks = [];
    starts.forEach((start, index) => {
      const end = index + 1 < starts.length ? starts[index + 1].index : source.length;
      const raw = source.slice(start.contentStart, end).trim();
      if (!raw || raw.length < 2) return;
      const parsed = extractQuestionOptions(raw);
      blocks.push({
        number: start.number,
        start: start.index,
        end,
        stem: parsed.stem,
        options: parsed.options,
        raw
      });
    });
    return mergeMisnumberedContinuations(blocks);
  }

  function splitPassageAndQuestions(content, type = '') {
    const source = String(content || '').replace(/\r\n?/g, '\n').trim();
    const blocks = parseQuestionBlocks(source, { reading: normalizeType(type) === 'reading' });
    if (!blocks.length) return { passage: source, questions: [] };
    let first = blocks.find((block) => block.stem || block.options.length);
    if (!first) return { passage: source, questions: [] };
    const passage = source.slice(0, first.start).trim();
    return { passage, questions: blocks };
  }

  function inferSkill(stem, type) {
    const text = String(stem || '').toLowerCase();
    if (type === 'writing' || type === 'picture') return 'writing';
    if (type === 'listening') return 'listening';
    if (type === 'grammar' || type === 'shortblank') return 'grammar';
    if (type === 'cloze') {
      if (/however|but|because|so|although|while|instead|therefore/.test(text)) return 'cohesion';
      return 'vocabulary';
    }
    if (type === 'five') return 'cohesion';
    if (type === 'dialogue') return 'general';
    if (type === 'reading' || type === 'single') {
      if (/(best title|title of the (?:text|passage)|mainly about|main idea|mainly discuss|purpose of the (?:text|passage))/.test(text)) {
        return /best title|title of/.test(text) ? 'title' : 'main';
      }
      if (/(infer|imply|suggest|probably|most likely|attitude)/.test(text)) return 'attitude';
      if (/(underlined word|refer to|meaning of|mean by|stand for)/.test(text)) {
        return /refer to/.test(text) ? 'reference' : 'meaning';
      }
      if (/(structure|organization|how is the (?:text|passage) organized)/.test(text)) return 'structure';
      if (/(according to|paragraph|because|why|what do we know|which of the following)/.test(text)) return 'detail';
      return 'general';
    }
    return 'general';
  }

  function skillLabel(skill) {
    return SKILL_LABELS[skill] || SKILL_LABELS.general;
  }

  function difficultyForText(text, options = {}) {
    const source = normalizeEnglish(text);
    const words = englishWordTokens(source);
    const sentences = splitSentences(source);
    const longWords = words.filter((word) => word.replace(/['’-]/g, '').length >= 8);
    const avgWordLength = words.length
      ? words.reduce((sum, word) => sum + word.replace(/['’-]/g, '').length, 0) / words.length
      : 4;
    const longRatio = words.length ? longWords.length / words.length : 0;
    const avgSentenceLength = sentences.length
      ? words.length / sentences.length
      : words.length;
    const maxSentenceLength = sentences.reduce((max, sentence) => {
      return Math.max(max, englishWordTokens(sentence).length);
    }, 0);
    const clauseCount = (source.match(/\b(which|that|who|whom|whose|when|where|while|although|though|because|if|unless|since|before|after|until|whether|so that|even though|in order to|rather than|despite|in spite of)\b/gi) || []).length;
    const passiveCount = (source.match(/\b(?:be|is|are|was|were|been|being)\s+(?:\w+ed|built|made|done|known|seen|given|taken)\b/gi) || []).length;
    const nonFiniteCount = (source.match(/\b(?:to\s+\w+|\w+ing|\w+ed)\b/gi) || []).length;
    const questionMarks = (source.match(/[?？]/g) || []).length;
    const blankCount = (source.match(/_{2,}|\(\s*\)|（\s*）|\b\d{1,2}\s*_{2,}/g) || []).length;

    let score = 2.1;
    score += clamp((avgWordLength - 4.1) * 1.5, 0, 2.4);
    score += clamp(longRatio * 10, 0, 2.2);
    score += clamp((avgSentenceLength - 11) / 7, 0, 2.4);
    score += clamp((maxSentenceLength - 22) / 16, 0, 1.8);
    score += clamp(clauseCount * 0.24, 0, 1.6);
    score += clamp(passiveCount * 0.2, 0, 0.8);
    score += clamp(nonFiniteCount * 0.06, 0, 0.7);
    if (blankCount > 2) score += 0.35;

    const typeWeights = {
      single: 0.15, cloze: 0.9, reading: 0.55, five: 0.85, grammar: 1.1,
      dialogue: 0.1, picture: 0.35, shortblank: 0.95, writing: 1.25, listening: 0.2
    };
    score += typeWeights[options.type] || 0;

    const skillWeights = {
      detail: 0, inference: 0.9, main: 0.55, title: 0.8, meaning: 0.9,
      reference: 0.8, structure: 0.9, attitude: 0.85, grammar: 0.55,
      vocabulary: 0.5, cohesion: 0.8, writing: 0.9, listening: 0.2, general: 0.35
    };
    score += skillWeights[options.skill] || 0;

    const grade = String(options.grade || '');
    if (/高三|高考/.test(grade)) score += 0.9;
    else if (/高二/.test(grade)) score += 0.6;
    else if (/高一/.test(grade)) score += 0.35;
    else if (/中考|九年级|初三/.test(grade)) score += 0.3;
    else if (/八年级|初二/.test(grade)) score += 0.15;

    const level = clamp(Math.round(score), 1, 10);
    return {
      level,
      breakdown: {
        words: words.length,
        uniqueWords: new Set(words.map((word) => word.toLowerCase())).size,
        avgWordLength: Number(avgWordLength.toFixed(2)),
        longRatio: Number((longRatio * 100).toFixed(1)),
        avgSentenceLength: Number(avgSentenceLength.toFixed(1)),
        maxSentenceLength,
        clauses: clauseCount,
        passive: passiveCount,
        blanks: blankCount,
        questionMarks
      }
    };
  }

  function difficultyTone(level) {
    const value = Number(level) || 1;
    if (value <= 3) return '基础';
    if (value <= 5) return '中等';
    if (value <= 7) return '提高';
    if (value <= 9) return '较难';
    return '挑战';
  }

  function starsForLevel(level) {
    const value = clamp(Number(level) || 1, 1, 10);
    const stars = clamp(Math.ceil(value / 2), 1, 5);
    return '★'.repeat(stars) + '☆'.repeat(5 - stars);
  }

  function rangeText(values) {
    const list = values.map((value) => Number(value)).filter(Number.isFinite);
    if (!list.length) return '';
    const min = Math.min(...list);
    const max = Math.max(...list);
    return min === max ? String(min) : `${min}–${max}`;
  }

  function collectBlankNumbers(text) {
    const source = String(text || '');
    const numbers = [];
    const seen = new Set();
    const add = (value) => {
      const number = Number(value);
      if (!Number.isFinite(number) || number < 1 || number > 200 || seen.has(number)) return;
      seen.add(number);
      numbers.push(number);
    };
    const patterns = [
      /_{2,}\s*(\d{1,3})\s*_{2,}/g,
      /\(\s*(\d{1,3})\s*\)\s*_{1,}/g,
      /（\s*(\d{1,3})\s*）\s*_{1,}/g,
      /(?:^|\n|[^\d])(\d{1,3})\s*[.、．]\s*_{2,}/g
    ];
    patterns.forEach((pattern) => {
      let match = pattern.exec(source);
      while (match) {
        add(match[1]);
        match = pattern.exec(source);
      }
    });
    return numbers.sort((a, b) => a - b);
  }

  function collectInlineBlankNumbers(text) {
    // 五选五的编号写成“66 And / 67 First”，没有下划线。只认 1–200 的
    // 独立数字，且后面紧跟英文单词，年份（1915、2026）和分数不会被算进来。
    const source = String(text || '');
    const numbers = [];
    const seen = new Set();
    const pattern = /(?:^|[\s（(])(\d{1,3})(?=\s+[A-Za-z“"‘'])/g;
    let match = pattern.exec(source);
    while (match) {
      const number = Number(match[1]);
      if (number >= 1 && number <= 200 && !seen.has(number)) {
        seen.add(number);
        numbers.push(number);
      }
      match = pattern.exec(source);
    }
    return numbers.sort((a, b) => a - b);
  }

  function remapNumberedBlanks(text, numberMap) {
    if (!numberMap || !Object.keys(numberMap).length) return String(text || '');
    const replace = (value) => {
      const mapped = numberMap[value];
      return mapped ? String(mapped) : String(value);
    };
    return String(text || '')
      .replace(/(_{2,}\s*)(\d{1,3})(\s*_{2,})/g, (match, left, number, right) => `${left}${replace(number)}${right}`)
      .replace(/(\(\s*)(\d{1,3})(\s*\)\s*_{1,})/g, (match, left, number, right) => `${left}${replace(number)}${right}`)
      .replace(/(（\s*)(\d{1,3})(\s*）\s*_{1,})/g, (match, left, number, right) => `${left}${replace(number)}${right}`)
      .replace(/(^|\n|[^\d])(\d{1,3})(\s*[.、．]\s*_{2,})/g, (match, left, number, right) => `${left}${replace(number)}${right}`);
  }

  function markdownRows(markdown) {
    const rows = [];
    String(markdown || '').replace(/\r\n?/g, '\n').split('\n').forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed.includes('|')) return;
      if (/^\|?[\s:|-]+\|?$/.test(trimmed)) return;
      const cells = trimmed.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
      if (!cells.length) return;
      rows.push(cells);
    });
    return rows;
  }

  function parseMarkdownWordTable(markdown) {
    const rows = markdownRows(markdown);
    if (!rows.length) return [];
    const headerIndex = rows.findIndex((row) => row.some((cell) => /(单词|词汇|word|english|英文)/i.test(cell)));
    const start = headerIndex >= 0 ? headerIndex + 1 : 0;
    const entries = [];
    rows.slice(start).forEach((row) => {
      if (!row.length) return;
      const englishIndex = row.findIndex((cell) => /^[A-Za-z][A-Za-z'’ -]*$/.test(cell) && cell.length < 60);
      if (englishIndex === -1) return;
      const english = row[englishIndex].trim();
      if (!english || /^(英语单词|单词|word|english|参考词)$/i.test(english)) return;
      const phoneticIndex = row.findIndex((cell) => /^\/.+\/$|音标|kk|pronunciation/i.test(cell));
      const chineseIndex = row.findIndex((cell) => /[一-鿿]/.test(cell) && !/音标|释义|中文|meaning/i.test(cell));
      const posIndex = row.findIndex((cell) => /^(n|v|adj|adv|prep|pron|conj|num|art|interj|phr)\.?$/i.test(cell));
      entries.push({
        word: english,
        phonetic: phoneticIndex >= 0 && phoneticIndex !== englishIndex ? row[phoneticIndex] : '',
        meaning: chineseIndex >= 0 ? row[chineseIndex] : '',
        pos: posIndex >= 0 ? row[posIndex] : '',
        source: 'ai'
      });
    });
    return entries;
  }

  function normalizeWordKey(word) {
    return String(word || '').toLowerCase().replace(/[‘’']/g, "'").replace(/[^a-z' -]/g, '').trim();
  }

  // 词表只收“值得背”的词。没有这层过滤时，一篇 59 题的卷子会生成七百多行，
  // 连 the / does / what 都印进去，既浪费纸也抓不住重点。
  const VOCAB_STOPWORDS = new Set((`
    a an the and or but if so because as than then that this these those there here when where what which who whom whose why how
    all any both each every few more most other some such no not only own same too very just also again always never often sometimes usually ever still already yet soon later now today tomorrow yesterday before after during while until since
    for from into onto over under above below between among through across along around about against without within behind beside near off on in out up down at by with of to
    be am is are was were been being have has had do does did done can could may might must shall should will would
    i you he she it we they me him her us them my your his its our their mine yours hers ours theirs myself yourself himself herself itself ourselves themselves
    one two three four five six seven eight nine ten first second third next last many much little big small good bad new old great long short high low
    people person thing things time day days year years way ways man woman boy girl child children student students teacher school home world life
    football basketball volleyball baseball tennis soccer sport sports noodle noodles food foods drink drinks fruit apple apples banana rice bread milk water juice coffee tea breakfast lunch dinner
    interesting interested different difficult important information activities activity
    make made take took get got go went come came see saw look looked say said tell told know knew think thought want wanted like liked give gave use used find found work worked call called need needed feel felt keep kept let put seem seemed help helped show showed try tried ask asked turn turned play played run ran move moved live lived believe believed bring brought happen happened write wrote provide sit sat stand stood lose lost pay paid meet met include included continue continued set learn learned change changed lead led understand understood watch watched follow followed stop stopped create created speak spoke read allow allowed add added spend spent grow grew open opened walk walked win won offer offered remember remembered love loved consider considered appear appeared buy bought wait waited serve served die died send sent expect expected build built stay stayed fall fell cut reach reached kill killed remain remained
    don't doesn't didn't isn't aren't wasn't weren't can't couldn't shouldn't wouldn't won't
  `).trim().split(/\s+/));

  function extractVocabularyWords(text) {
    const tokens = englishWordTokens(text);
    const seen = new Set();
    const entries = [];
    tokens.forEach((token) => {
      const cleaned = String(token || '').replace(/^[-']+|[-']+$/g, '');
      if (!cleaned || cleaned.length < 2) return;
      if (/^(?:[A-Z]\.){2,}$/.test(cleaned)) return;
      const key = normalizeWordKey(cleaned);
      if (!key || seen.has(key)) return;
      if (/^(?:mm|cm|km|kg|www|http|https|ok|id)$/i.test(key)) return;
      seen.add(key);
      entries.push({ word: cleaned, key, phonetic: '', pos: '', meaning: '', source: 'local' });
    });
    return entries;
  }

  const PHRASE_MEANINGS = {
    'be interested in': '对……感兴趣',
    'be good at': '擅长',
    'be afraid of': '害怕',
    'be proud of': '为……自豪',
    'be full of': '充满',
    'be famous for': '因……而闻名',
    'be different from': '与……不同',
    'be similar to': '与……相似',
    'be ready for': '为……做好准备',
    'be responsible for': '对……负责',
    'be worried about': '担心',
    'be busy with': '忙于',
    'be able to': '能够',
    'be going to': '打算；将要',
    'look up': '查阅；抬头看',
    'look after': '照顾',
    'look forward to': '期待',
    'look at': '看',
    'take care of': '照顾',
    'take part in': '参加',
    'take photos': '拍照',
    'take a photo': '拍照',
    'take place': '发生',
    'take off': '脱下；起飞',
    'put off': '推迟',
    'put on': '穿上；上演',
    'put up': '举起；张贴；搭建',
    'give up': '放弃',
    'give away': '赠送；泄露',
    'come up with': '想出',
    'come true': '实现',
    'find out': '查明；弄清楚',
    'make sure': '确保',
    'make friends': '交朋友',
    'make a decision': '做决定',
    'make progress': '取得进步',
    'pay attention to': '注意',
    'depend on': '依靠；取决于',
    'focus on': '专注于',
    'rely on': '依靠',
    'insist on': '坚持',
    'turn on': '打开',
    'turn off': '关闭',
    'turn up': '调高；出现',
    'turn down': '调低；拒绝',
    'pick up': '捡起；接人',
    'wake up': '醒来；叫醒',
    'grow up': '长大',
    'set up': '建立；设立',
    'hand in': '上交',
    'join in': '加入',
    'check in': '办理登记',
    'check out': '结账离开；查看',
    'work out': '解决；算出；锻炼',
    'break down': '出故障；垮掉',
    'carry out': '执行',
    'point out': '指出',
    'in front of': '在……前面',
    'in the front of': '在……前部',
    'at the back of': '在……后面',
    'in order to': '为了',
    'so that': '以便；结果',
    'even though': '即使',
    'as soon as': '一……就……',
    'as well as': '以及；和……一样好',
    'such as': '例如',
    'instead of': '代替；而不是',
    'because of': '因为',
    'due to': '由于',
    'thanks to': '多亏',
    'rather than': '而不是',
    'according to': '根据',
    'as a result': '结果',
    'as a result of': '由于',
    'in spite of': '尽管',
    'at least': '至少',
    'at last': '最后',
    'at first': '起初',
    'at noon': '在中午',
    'at night': '在晚上',
    'at home': '在家',
    'at school': '在学校',
    'at the same time': '同时',
    'in fact': '事实上',
    'in the end': '最后',
    'on time': '准时',
    'in time': '及时',
    'for example': '例如',
    'by the way': '顺便说一下',
    'in a word': '总之',
    'all in all': '总而言之',
    'as usual': '像往常一样',
    'at present': '目前',
    'from time to time': '不时地',
    'once upon a time': '从前',
    'all night': '整夜',
    'stay calm': '保持冷静',
    'stay healthy': '保持健康',
    'keep healthy': '保持健康',
    'keep calm': '保持冷静',
    'plan your time': '规划时间',
    'take short breaks': '短暂休息',
    'go to bed': '上床睡觉',
    'go to school': '去上学',
    'go home': '回家',
    'get up': '起床',
    'have fun': '玩得开心',
    'have a good time': '玩得开心',
    'a lot of': '许多',
    'lots of': '许多',
    'a few': '几个；一些',
    'a little': '一点',
    'too much': '太多',
    'too many': '太多',
    'not only': '不仅',
    'each other': '彼此',
    'one another': '彼此'
  };

  function extractPhrases(text) {
    const source = normalizeEnglish(text);
    const phrases = [];
    const seen = new Set();
    const patterns = [
      /\b(?:be|is|are|was|were|been|being)[ \t]+(?:able|afraid|angry|aware|busy|careful|different|famous|fond|full|good|interested|keen|known|late|proud|ready|responsible|similar|sorry|sure|tired|worried)[ \t]+(?:to|of|about|for|with|in|at)\b/gi,
      /\b(?:look|take|put|get|give|make|come|go|turn|bring|keep|set|run|break|carry|pick|point|depend|focus|rely|insist|consist|result|lead|refer)[ \t]+(?:up|down|off|on|in|out|over|through|away|back|forward|into|from|to|with|for|about|after|at|by)\b/gi,
      /\b(?:at[ \t]+(?:home|school|noon|night|last|first|least|present)|in[ \t]+(?:the[ \t]+(?:morning|afternoon|evening)|fact|time|the[ \t]+end|a[ \t]+word)|on[ \t]+time|by[ \t]+the[ \t]+way|for[ \t]+example|from[ \t]+time[ \t]+to[ \t]+time|once[ \t]+upon[ \t]+a[ \t]+time|all[ \t]+night)\b/gi,
      /\b(?:not only|rather than|as well as|so that|even though|in order to|such as|according to|because of|instead of|in addition to|apart from|due to)\b/gi
    ];
    patterns.forEach((pattern) => {
      let match = pattern.exec(source);
      while (match) {
        const phrase = match[0].replace(/\s+/g, ' ').trim();
        const key = phrase.toLowerCase();
        const canonical = key.replace(/^(?:am|is|are|was|were|been|being)\s+/, 'be ');
        const meaning = PHRASE_MEANINGS[canonical] || PHRASE_MEANINGS[key] || '';
        if (phrase.split(/\s+/).length >= 2 && meaning && !seen.has(key)) {
          seen.add(key);
          phrases.push({ word: phrase, key, phonetic: '', pos: 'phr.', meaning, source: 'local' });
        }
        match = pattern.exec(source);
      }
    });
    return phrases;
  }

  function buildVocabulary(text, aiEntries) {
    const local = extractVocabularyWords(text);
    const phrases = extractPhrases(text);
    const byKey = new Map();
    local.forEach((entry) => byKey.set(entry.key, entry));
    (Array.isArray(aiEntries) ? aiEntries : []).forEach((entry) => {
      const key = normalizeWordKey(entry.word);
      if (!key) return;
      const existing = byKey.get(key);
      if (existing) {
        existing.phonetic = entry.phonetic || existing.phonetic;
        existing.meaning = entry.meaning || existing.meaning;
        existing.pos = entry.pos || existing.pos;
        existing.source = 'ai';
      } else {
        byKey.set(key, { ...entry, key });
      }
    });
    const words = Array.from(byKey.values());
    const phraseKeys = new Set(phrases.map((entry) => entry.key));
    (Array.isArray(aiEntries) ? aiEntries : []).forEach((entry) => {
      if (entry.word.split(/\s+/).length < 2) return;
      const key = entry.word.toLowerCase().trim();
      if (!phraseKeys.has(key)) {
        phraseKeys.add(key);
        phrases.push({ ...entry, key });
      }
    });
    return { words, phrases };
  }

  const IRREGULAR_LEMMAS = {
    am: 'be', is: 'be', are: 'be', was: 'be', were: 'be', been: 'be', being: 'be',
    has: 'have', had: 'have', having: 'have', does: 'do', did: 'do', done: 'do', doing: 'do',
    went: 'go', gone: 'go', goes: 'go', said: 'say', made: 'make', took: 'take', taken: 'take',
    came: 'come', got: 'get', gotten: 'get', gave: 'give', given: 'give', saw: 'see', seen: 'see',
    knew: 'know', known: 'know', thought: 'think', bought: 'buy', brought: 'bring', taught: 'teach',
    caught: 'catch', found: 'find', left: 'leave', felt: 'feel', kept: 'keep', slept: 'sleep',
    wrote: 'write', written: 'write', ran: 'run', swam: 'swim', began: 'begin', begun: 'begin',
    drank: 'drink', drunk: 'drink', ate: 'eat', eaten: 'eat', fell: 'fall', fallen: 'fall',
    flew: 'fly', flown: 'fly', forgot: 'forget', forgotten: 'forget', spoke: 'speak', spoken: 'speak',
    wore: 'wear', worn: 'wear', won: 'win', lost: 'lose', met: 'meet', paid: 'pay', sold: 'sell',
    sent: 'send', spent: 'spend', stood: 'stand', told: 'tell', understood: 'understand', built: 'build',
    heard: 'hear', held: 'hold', broke: 'break', broken: 'break', chose: 'choose', chosen: 'choose',
    drove: 'drive', driven: 'drive', grew: 'grow', grown: 'grow', rode: 'ride', ridden: 'ride',
    rose: 'rise', risen: 'rise', sang: 'sing', sung: 'sing', sat: 'sit', stole: 'steal',
    stolen: 'steal', threw: 'throw', thrown: 'throw', woke: 'wake', woken: 'wake', led: 'lead',
    fed: 'feed', fought: 'fight', hung: 'hang', lent: 'lend', meant: 'mean', shone: 'shine',
    shot: 'shoot', showed: 'show', shown: 'show', shut: 'shut', spread: 'spread', struck: 'strike',
    swept: 'sweep', tore: 'tear', torn: 'tear', children: 'child', men: 'man', women: 'woman',
    feet: 'foot', teeth: 'tooth', mice: 'mouse', geese: 'goose', people: 'person',
    better: 'good', best: 'good', worse: 'bad', worst: 'bad', more: 'many', most: 'many',
    less: 'little', least: 'little'
  };

  function wordCandidates(key) {
    const candidates = [key];
    if (IRREGULAR_LEMMAS[key]) candidates.push(IRREGULAR_LEMMAS[key]);
    if (key.endsWith("'s")) candidates.push(key.slice(0, -2));
    if (key.endsWith('ies')) candidates.push(`${key.slice(0, -3)}y`);
    if (key.endsWith('ing')) candidates.push(key.slice(0, -3), `${key.slice(0, -3)}e`);
    if (key.endsWith('ed')) candidates.push(key.slice(0, -2), `${key.slice(0, -1)}`);
    if (key.endsWith('es')) candidates.push(key.slice(0, -2));
    if (key.endsWith('s')) candidates.push(key.slice(0, -1));
    return candidates;
  }

  function dictionaryLookup(word) {
    const dict = state.wordDictionary;
    if (!dict) return null;
    const key = normalizeWordKey(word);
    if (!key) return null;
    for (const candidate of wordCandidates(key)) {
      if (dict[candidate]) return dict[candidate];
    }
    return null;
  }

  function dictionaryFrequencyRank(word) {
    if (!state.wordRanks) return null;
    const key = normalizeWordKey(word);
    if (!key) return null;
    let best = null;
    for (const candidate of wordCandidates(key)) {
      const rank = state.wordRanks.get(candidate);
      // 变形词的词频要按原形算：“decided”本身可能很靠后，但 decide 是高频词。
      if (rank != null && (best == null || rank < best)) best = rank;
    }
    return best;
  }

  function lemmaKey(word) {
    const key = normalizeWordKey(word);
    if (!key || key.includes(' ')) return key;
    let bestKey = key;
    let bestRank = null;
    for (const candidate of wordCandidates(key)) {
      const rank = state.wordRanks ? state.wordRanks.get(candidate) : null;
      if (rank != null && (bestRank == null || rank < bestRank)) {
        bestRank = rank;
        bestKey = candidate;
      }
    }
    return bestKey;
  }

  function canonicalWordEntry(entry) {
    const key = lemmaKey(entry.word);
    if (!key || key === entry.key) return entry;
    const found = dictionaryLookup(key);
    if (!found) return entry;
    return {
      ...entry,
      word: key,
      key,
      phonetic: found.kk || found.ipa || entry.phonetic,
      meaning: found.zh || entry.meaning,
      pos: found.pos || entry.pos
    };
  }

  async function loadWordDictionary() {
    if (state.wordDictionary) return state.wordDictionary;
    if (state.dictionaryPromise) return state.dictionaryPromise;
    state.dictionaryPromise = fetch('vendor/glossary.json', { cache: 'force-cache' })
      .then((response) => response.ok ? response.json() : {})
      .then((data) => {
        state.wordDictionary = data && typeof data === 'object' ? data : {};
        // 词库本身按常用度排序：越靠前越是高频基础词。记下序号，词表就能
        // 按年级跳过太简单的词，只留下略高于学生当前水平的词。
        state.wordRanks = new Map(Object.keys(state.wordDictionary).map((word, index) => [word, index]));
        return state.wordDictionary;
      })
      .catch(() => {
        state.wordDictionary = {};
        return state.wordDictionary;
      });
    return state.dictionaryPromise;
  }

  async function enrichVocabulary(vocabulary) {
    await loadWordDictionary();
    const apply = (entry) => {
      if (!entry) return entry;
      const found = dictionaryLookup(entry.word);
      if (found) {
        entry.phonetic = entry.phonetic || found.kk || found.ipa || '';
        entry.meaning = entry.meaning || found.zh || '';
        entry.pos = entry.pos || found.pos || '';
      }
      return entry;
    };
    vocabulary.words.forEach(apply);
    vocabulary.phrases.forEach(apply);
    return vocabulary;
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise((resolve, reject) => {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand('copy');
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        area.remove();
      }
    });
  }

  function paperPlainText(paper) {
    const lines = [];
    lines.push(paper.title || '英语每日练习');
    lines.push(`本卷共 ${paper.questionTotal || paper.total || 0} 小题。以下题号均为试卷上的印刷题号，请严格按这些题号作答。`);
    (paper.sections || []).forEach((section) => {
      lines.push(`\n【${typeLabel(section.type)}】`);
      section.items.forEach((item, index) => {
        lines.push(`\n第 ${index + 1} 组：`);
        if (item.passage && item.kind !== 'question') {
          lines.push(remapNumberedBlanks(item.passage, item.numberMap || {}));
        }
        const questions = (item.questions || []).filter((question) => question.paperNumber);
        if (questions.length && questions.every((question) => question.stem)) {
          questions.forEach((question) => {
            lines.push(`${question.paperNumber}. ${question.stem}`);
            (question.options || []).forEach((option) => {
              lines.push(`${option.letter}. ${option.text}`);
            });
          });
        } else {
          lines.push(remapNumberedBlanks(item.content || '', item.numberMap || {}));
        }
        if (item.answer) lines.push(`原始答案：${item.answer}`);
      });
    });
    return lines.join('\n');
  }

  function buildAnalysisPrompt(paper) {
    return [
      '你是一位有多年初高中英语教学经验的老师。请根据下面这份英语练习，生成一份可直接发给学生的“答案与详解”。',
      '',
      '要求：',
      '1. 先给“答案速查”：严格使用试卷上的印刷题号列出答案，格式如“1. B  2. C”。',
      '2. 再逐题写解析，严格使用以下格式，题号必须与试卷印刷题号一致：',
      '   1. B 【解析】……',
      '   2. C 【解析】……',
      '3. 阅读、完形、五选五、短文填空的解析要写清楚：题型（细节理解/推理判断/主旨大意/词义猜测/语篇衔接/语法知识）、原文依据（尽量引用关键句）、正确选项为什么对、干扰项为什么错。',
      '4. 每篇阅读或完形前加【语篇导读】，用 2—3 句中文概括文章主旨、结构和背景。',
      '5. 每篇后加【词汇积累】和【长难句提炼】：词汇积累写 3—5 个核心词或短语（英文 + 词性 + 中文）；长难句只提炼含从句、非谓语、插入语、同位语或比较结构的句子，简单句不要收入。每句按“句子 N / 原句 / 长难句分析 / 长难句翻译”四行输出，完形填空要先还原空格处的词。如有熟词生义，再补【熟词生义】。',
      '6. 如果是语法填空或短文填空，逐空说明所填词、语法依据和句意。',
      '7. 如果是书面表达，给出参考范文、亮点表达、评分要点和可迁移句式；不要编造学生姓名。',
      '8. 解析要具体到原文，不要只说“根据上下文可知”。使用简体中文，英文单词和例句保持英文。',
      '9. 解析风格参照各地中考、高考英语答案详解：先判断题型，再引原文证据，再分析选项，最后给出方法点拨。',
      '10. 不要输出与解析无关的寒暄或总结。',
      '',
      '练习内容如下：',
      paperPlainText(paper)
    ].join('\n');
  }

  function buildVocabularyPrompt(paper) {
    return [
      '请处理下面这份英语练习的文本，完成以下全部要求，严格遵守格式，不得擅自改动版式。',
      '',
      '0. 先用文章主题给词表起一个中文标题，再输出表格。',
      '1. 提取原文与所有题目选项里每一个英语单词，全部单词自动去重，固定表格列标题为「英语单词 | 词性 | 美式音标 | 中文释义」，以标准 Markdown 表格呈现。音标请使用 KK 音标，并用 / / 包裹。',
      '2. 动词变形（过去式、现在分词、复数等）单独作为独立词条；词性贴合单词在本篇短文语境里的用法；中文释义优先选用贴合本篇文章的核心含义。',
      '3. 文中出现的固定搭配、动词短语、介词短语单独作为词条，统一放在表格的第二部分，列标题为「英语短语 | 词性 | 美式音标 | 中文释义」。',
      '4. 复合形容词（如 82-year-old）单独收录；人名不需要提取；专有名词需要提取并标注音标与释义。',
      '5. 单词按照在文本中出现的顺序陈列，不要按字母顺序重新排列。',
      '6. 只输出标题和两个 Markdown 表格，不要解释，不得漏词、不得改动列序；不要使用合并单元格，保持纯 Markdown。',
      '',
      '练习内容如下：',
      paperPlainText(paper)
    ].join('\n');
  }

  function openAiDialog(mode) {
    const paper = state.currentPaper;
    if (!paper) {
      toast('请先生成一份练习。', 'error');
      return;
    }
    state.aiDialogMode = mode === 'vocab' ? 'vocab' : 'analysis';
    const dialog = $('#ai-dialog');
    if (!dialog) return;
    const title = $('#ai-title');
    const prompt = $('#ai-prompt');
    const result = $('#ai-result');
    const note = $('#ai-result-note');
    if (state.aiDialogMode === 'vocab') {
      if (title) title.textContent = '豆包词表';
      if (prompt) prompt.value = buildVocabularyPrompt(paper);
      if (result) {
        result.value = paper.aiVocabRaw || '';
        result.placeholder = '把豆包输出的 Markdown 词表整段粘贴到这里。工作台会读取「英语单词 / 音标 / 中文」三列，并补进词汇表和默写表。';
      }
      if (note) note.textContent = '词表会覆盖同名词条的本地音标和释义；短语表也会一起更新。';
    } else {
      if (title) title.textContent = '豆包解析';
      if (prompt) prompt.value = buildAnalysisPrompt(paper);
      if (result) {
        result.value = paper.aiAnalysis || '';
        result.placeholder = '把豆包输出的答案与详解整段粘贴到这里。工作台会把它放进答案区，并随 Word / PDF 一起导出。';
      }
      if (note) note.textContent = '解析会追加到答案区；如果豆包按「1. B」格式给出答案，也会自动补到对应题目。';
    }
    if (!dialog.open) dialog.showModal();
  }

  async function copyAiPrompt() {
    const prompt = $('#ai-prompt');
    if (!prompt || !prompt.value.trim()) {
      toast('当前没有可复制的提示词。', 'error');
      return;
    }
    try {
      await copyText(prompt.value);
      toast('提示词已复制，去豆包粘贴即可。');
    } catch (error) {
      console.error(error);
      toast('复制失败，请手动全选提示词复制。', 'error');
    }
  }

  function buildSplitPrompt(material) {
    const body = cleanImportedText(material.body || material.text || '').text;
    return [
      '你是英语试卷排版助手。下面是一份试卷的文字提取稿，PDF 或 OCR 把很多行粘在了一起。',
      '请只做“分题、分段、换行”，不要改写、不要增删、不要补写任何题目内容。',
      '',
      '必须遵守：',
      '1. 每个大题标题单独占一行，例如“一、单项选择”“二、完形填空”“三、阅读理解”。',
      '2. 每道小题的题号单独起行，题号和题干之间空一格；下一题绝不能粘在上一题的选项后面。',
      '3. 每个选项 A. B. C. D. 单独占一行，不要和题干或下一篇短文粘在一起。',
      '4. 阅读理解每篇的篇目标签 A/B/C/D 单独占一行；文章每个自然段之间空一行。',
      '5. 完形填空、语法填空、五选五的短文保持完整，空格用 ______ 表示，题号保留。',
      '6. 表格改成逐行文字，每行写“项目：内容”，不要把表格挤成一句话。',
      '7. 原文里的中文说明、分值、括号提示都保留。',
      '8. 只输出整理后的试卷正文，不要解释，不要加“以下是整理稿”，不要用 Markdown 代码块。',
      '',
      `【试卷标题】${material.title || '未命名'}`,
      `【年级】${material.grade || '未标注'}`,
      `【题型】${typeLabel(material.type)}`,
      '',
      '【试卷正文】',
      body
    ].join('\n');
  }

  function openSplitDialog(id) {
    const material = findMaterial(id);
    if (!material) return;
    const dialog = $('#split-dialog');
    if (!dialog) return;
    state.aiSplitId = id;
    const title = $('#split-title');
    const prompt = $('#split-prompt');
    const result = $('#split-result');
    const note = $('#split-note');
    if (title) title.textContent = `豆包精排 · ${material.title}`;
    if (prompt) prompt.value = buildSplitPrompt(material);
    if (result) {
      result.value = '';
      result.placeholder = '把豆包整理后的完整试卷正文粘贴到这里。只调整换行和分段，题目内容应与原文一致。';
    }
    if (note) note.textContent = '应用后会按新稿重新拆题；原始文件仍完整保留，可随时下载。分题结果会同时记入识别库。';
    if (!dialog.open) dialog.showModal();
  }

  async function copySplitPrompt() {
    const prompt = $('#split-prompt');
    if (!prompt || !prompt.value.trim()) {
      toast('当前没有可复制的提示词。', 'error');
      return;
    }
    try {
      await copyText(prompt.value);
      toast('分题提示词已复制，去豆包粘贴即可。');
    } catch (error) {
      console.error(error);
      toast('复制失败，请手动全选提示词复制。', 'error');
    }
  }

  function stripResultFence(text) {
    return String(text || '')
      .replace(/^\s*```(?:text|markdown|md)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
  }

  function cleanHeadingAlias(heading) {
    return String(heading || '')
      .replace(/^\s*(?:第[一二三四五六七八九十]+部分(?:\s*[（(][^）)]{0,24}[）)])?\s*)?/, '')
      .replace(/^\s*(?:[一二三四五六七八九十]+|[ⅠⅡⅢⅣⅤⅥ]|[IVX]+)\s*[、.．:：]\s*/, '')
      .replace(/[（(][^）)]{0,30}[）)]\s*$/, '')
      .replace(/[，,。;；].*$/, '')
      .replace(/\s+/g, '')
      .trim()
      .slice(0, 16);
  }

  async function learnSectionAliases(sections) {
    if (!Array.isArray(sections) || !sections.length) return 0;
    const aliases = Array.isArray(state.sectionAliases) ? state.sectionAliases.slice() : [];
    const seen = new Set(aliases.map((entry) => `${entry.alias}|${entry.type}`));
    let added = 0;
    sections.forEach((section) => {
      const alias = cleanHeadingAlias(section.heading || '');
      const type = normalizeType(section.type);
      if (!alias || alias.length < 2 || alias.length > 12) return;
      if (!TYPES[type] || type === 'paper' || type === 'other') return;
      // 太笼统的词不作为别名，否则会把普通正文误判成新大题。
      if (/^(阅读|写作|选择|填空|试题|试卷|英语|部分)$/.test(alias)) return;
      const key = `${alias}|${type}`;
      if (seen.has(key)) return;
      seen.add(key);
      aliases.push({ alias, type });
      added += 1;
    });
    if (added) {
      state.sectionAliases = aliases.slice(-160);
      state.settings.sectionAliases = state.sectionAliases;
      await saveSetting('sectionAliases', state.sectionAliases);
      renderAliasLibrary();
    }
    return added;
  }

  async function applySplitResult() {
    const material = findMaterial(state.aiSplitId);
    if (!material) return;
    const result = $('#split-result');
    if (!result || !result.value.trim()) {
      toast('还没有粘贴豆包整理稿。', 'error');
      return;
    }
    let text = stripResultFence(result.value);
    // 豆包偶尔会在正文前加一句“以下是整理稿：”，从第一个大题标题或题号开始截取。
    const startMatch = text.match(/(?:^|\n)\s*(?:[一二三四五六七八九十]+、|第[一二三四五六七八九十]+部分|(?:\d{1,3})\s*[.、．)）]\s*[A-Za-z“"(])/);
    if (startMatch && startMatch.index > 0) text = text.slice(startMatch.index).trim();
    text = cleanImportedText(toDisplayText(text)).text;
    text = toDisplayText(normalizePaperLayout(text));
    if (text.length < 20) {
      toast('整理稿内容太短，没有保存。请把豆包返回的完整正文粘贴进来。', 'error', 6000);
      return;
    }
    const split = splitAnswerSection(text);
    const body = toDisplayText(normalizePaperLayout(split.body));
    const addedAnswers = toDisplayText(split.answers);
    const answers = [material.answers, addedAnswers].filter(Boolean).join('\n\n');
    const updated = {
      ...material,
      text,
      body,
      answers,
      note: unique([material.note, '已用豆包精排重新分题。']).join(' '),
      parser: 'doubao-split',
      updatedAt: nowIso()
    };
    delete updated.processedBlob;
    delete updated.processedSize;
    const items = buildItemsForMaterial(updated);
    if (!items.length) {
      toast('这份整理稿没有识别出题目，暂未覆盖原资料。请检查豆包是否保留了题号和大题标题。', 'error', 7600);
      return;
    }
    updated.questionCount = items.length;
    updated.processedBlob = makeMaterialBlob(updated);
    updated.processedSize = updated.processedBlob ? updated.processedBlob.size : 0;
    try {
      const learned = await learnSectionAliases(detectExamSections(body));
      await saveMaterialWithItems(updated, items);
      await reloadAndRender();
      const unit = items.length === 1 && updated.type === 'single' ? '道' : '组';
      toast(`已按豆包整理稿重新分为 ${items.length} ${unit}${learned ? `，识别库新增 ${learned} 个题型别名` : ''}。`, 'ok', 6000);
      state.aiSplitId = null;
      const dialog = $('#split-dialog');
      if (dialog && dialog.open) dialog.close();
      go('library');
    } catch (error) {
      console.error(error);
      toast(`保存失败：${error.message || error}`, 'error');
    }
  }

  function parseAnalysisAnswers(text) {
    const map = {};
    const source = String(text || '').replace(/\r\n?/g, '\n');
    const pattern = /(?:^|\n)\s*(\d{1,3})\s*[.、．)）]?\s*([A-G])(?=\s|$|[，,。;；、])/g;
    let match = pattern.exec(source);
    while (match) {
      const number = Number(match[1]);
      if (number >= 1 && number <= 200 && !map[number]) map[number] = match[2];
      match = pattern.exec(source);
    }
    return map;
  }

  function parseAnalysisDetails(text) {
    const source = String(text || '').replace(/\r\n?/g, '\n');
    const map = {};
    const pattern = /(?:^|\n)\s*(\d{1,3})\s*[.、．)）]?\s*([^\n【]{1,80}?)\s*(?:【解析】|\[解析\]|解析[:：])\s*([\s\S]*?)(?=(?:\n\s*\d{1,3}\s*[.、．)）]?\s*[^\n【]{1,80}?\s*(?:【解析】|\[解析\]|解析[:：]))|$)/g;
    let match = pattern.exec(source);
    while (match) {
      const number = Number(match[1]);
      const rawAnswer = String(match[2] || '').trim();
      const explanation = trimAnswerExplanation(String(match[3] || '')).replace(/\n{3,}/g, '\n\n');
      if (number >= 1 && number <= 200 && explanation && !map[number]) {
        map[number] = {
          answer: /^[A-G]$/i.test(rawAnswer) ? rawAnswer.toUpperCase() : rawAnswer.slice(0, 40),
          explanation
        };
      }
      match = pattern.exec(source);
    }
    return map;
  }

  async function applyAiResult() {
    const paper = state.currentPaper;
    if (!paper) return;
    const result = $('#ai-result');
    const text = result ? result.value.trim() : '';
    if (!text) {
      toast('还没有粘贴豆包的结果。', 'error');
      return;
    }
    if (state.aiDialogMode === 'vocab') {
      const entries = parseMarkdownWordTable(text);
      if (!entries.length) {
        toast('没有从粘贴内容里读到词表。请保留 Markdown 表格的竖线和表头。', 'error', 6500);
        return;
      }
      paper.aiVocabRaw = text;
      paper.aiVocab = entries;
      paper.vocab = buildPaperVocabulary(paper);
      await updateSavedPaper(paper);
      renderPaper(paper);
      toast(`已读入 ${entries.length} 个词条，词汇表和默写表已更新。`);
    } else {
      paper.aiAnalysis = text;
      const answers = parseAnalysisAnswers(text);
      const details = parseAnalysisDetails(text);
      let filled = 0;
      let explained = 0;
      (paper.sections || []).forEach((section) => {
        section.items.forEach((item) => {
          (item.questions || []).forEach((question) => {
            const number = question.paperNumber;
            const detail = details[number] || null;
            const answer = (detail && detail.answer) || answers[number] || '';
            if (answer && !question.answer) {
              question.answer = answer;
              filled += 1;
            }
            if (detail && detail.explanation) {
              question.explanation = detail.explanation;
              explained += 1;
            }
          });
          Object.entries(item.numberMap || {}).forEach(([sourceNumber, number]) => {
            if ((item.questions || []).some((question) => Number(question.paperNumber) === Number(number))) return;
            const detail = details[number] || null;
            const answer = (detail && detail.answer) || answers[number] || '';
            if (!answer && !(detail && detail.explanation)) return;
            if (!item.blankAnswers) item.blankAnswers = {};
            const existing = item.blankAnswers[sourceNumber] || {};
            item.blankAnswers[sourceNumber] = {
              ...existing,
              answer: existing.answer || answer,
              explanation: (detail && detail.explanation) || existing.explanation || ''
            };
            if (answer && !existing.answer) filled += 1;
            if (detail && detail.explanation) explained += 1;
          });
        });
      });
      await updateSavedPaper(paper);
      renderPaper(paper);
      toast(explained
        ? `解析已应用：补全 ${filled} 个答案，写入 ${explained} 条逐题详解。`
        : (filled ? `解析已应用，并补全了 ${filled} 道题的答案。` : '解析已应用到答案区。'));
    }
    const dialog = $('#ai-dialog');
    if (dialog && dialog.open) dialog.close();
  }

  async function updateSavedPaper(paper) {
    if (!paper || !paper.savedAt) return;
    try {
      const record = { ...paper };
      delete record.html;
      delete record.wordBlob;
      await dbPut('papers', record);
    } catch (error) {
      console.error('Update saved paper failed:', error);
    }
  }

  function vocabularyDocument(paper, mode) {
    const vocab = paper.vocab || { words: [], phrases: [] };
    const title = mode === 'dictation' ? '默写表' : '词汇背诵表';
    const body = mode === 'dictation'
      ? buildDictationSection({ ...paper, sections: [] })
      : buildVocabularySection({ ...paper, sections: [] });
    return wrapWordDocument(
      `${paper.title} · ${title}`,
      `<div class="sheet">${body || '<p>本次练习没有可导出的词汇。</p>'}</div>`,
      paperStyles()
    );
  }

  function downloadPaperVocabulary(paper, mode) {
    if (!paper) return;
    const vocab = paper.vocab || { words: [], phrases: [] };
    if (!vocab.words.length && !vocab.phrases.length) {
      toast('本次练习还没有词汇表，请先生成练习。', 'error');
      return;
    }
    const blob = new Blob(['﻿', vocabularyDocument(paper, mode)], { type: 'application/msword' });
    const suffix = mode === 'dictation' ? '默写表' : '词汇表';
    downloadBlob(blob, `${safeFilename(`${paper.title} · ${suffix}`)}.doc`);
  }

  /* ---------------------------- 长难句提炼 ---------------------------- */
  // 参考用户 D 盘“阅读及拆解 / 长难句提炼”的整理习惯：原句 + 分析横线 + 译文横线。

  function collectLongSentences(paper, limit = 10) {
    const entries = [];
    const seen = new Set();
    (paper.sections || []).forEach((section) => {
      // 只从成篇阅读里选长难句；语法填空的句子带空格和提示词，不适合直接做翻译拆解。
      if (!['reading', 'cloze', 'five'].includes(normalizeType(section.type))) return;
      section.items.forEach((item) => {
        let source = cleanPaperText(item.passage || item.content || '');
        if (['cloze', 'five'].includes(normalizeType(section.type))) {
          // 完形/五选五的原文里常留着裸题号（如 “the 41 thing”），
          // 先换成空格线，长难句才不会印出莫名其妙的数字。
          source = markBareBlanks(source, item.numberMap).replace(/__\d+__/g, '______');
        }
        splitProseSentences(source).forEach((sentence) => {
          const clean = sentence
            .replace(/_{2,}\s*\d{0,3}\s*_{2,}/g, '______')
            .replace(/^[①-⑳]\s*/, '')
            .replace(/\s+/g, ' ')
            .trim();
          // 真实试卷里“值得拆解”的句子不一定都很长；门槛过高会让一份卷子
          // 只抽出一两句，讲义显得单薄。先收 10 词以上的完整英文句，再按难度排序。
          if (clean.length < 40 || /[一-鿿]/.test(clean)) return;
          // 带空格线的句子本身是待填题，不适合拿来做长难句翻译。
          if (/_{2,}/.test(clean)) return;
          // 实验步骤表、图表说明不是句子，拆解它们没有意义。
          if (/what we need|what to do|what happens|result drawing|materials\s*:/i.test(clean)) return;
          if ((clean.match(/[:：]/g) || []).length >= 2) return;
          if (/^[-•·]/.test(clean)) return;
          const words = englishWordTokens(clean);
          if (words.length < 10) return;
          const clauses = (clean.match(/\b(which|that|who|whom|whose|when|where|while|although|though|because|if|unless|since|before|after|until|whether|so that|even though|in order to|rather than|despite|in spite of)\b/gi) || []).length;
          const key = clean.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          entries.push({
            sentence: clean,
            words: words.length,
            clauses,
            score: words.length + clauses * 4
          });
        });
      });
    });
    return entries.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  function longSentenceDocument(paper) {
    const list = collectLongSentences(paper);
    const items = list.map((entry, index) => (
      `<section class="ls-item">` +
      `<h3>句子 ${index + 1} <em>（${entry.words} 词${entry.clauses ? ` · ${entry.clauses} 处从句/连接` : ''}）</em></h3>` +
      `<p class="ls-sentence">${escapeHtml(entry.sentence)}</p>` +
      `<p class="ls-label">一、长难句分析（划分主干、从句、非谓语与修饰成分）</p>` +
      `<div class="ls-lines">${'<i></i>'.repeat(3)}</div>` +
      `<p class="ls-label">二、参考译文</p>` +
      `<div class="ls-lines">${'<i></i>'.repeat(2)}</div>` +
      `</section>`
    )).join('');
    const extraStyles = `
      .long-sentence-doc { position: relative; z-index: 1; }
      .ls-item { margin-top: 18px; padding-top: 12px; border-top: 1px solid #c9c2b2; break-inside: avoid; page-break-inside: avoid; }
      .ls-item h3 { margin: 0; color: #1b344d; font-family: "Microsoft YaHei", sans-serif; font-size: 11.5pt; }
      .ls-item h3 em { color: #66727a; font-size: 9pt; font-style: normal; font-weight: 400; }
      .ls-tip { margin: 10px 0 0; color: #555; font-size: 9.5pt; line-height: 1.7; }
      .ls-sentence { margin: 6px 0 0; font-family: Arial, "SimHei", sans-serif; font-size: 11.5pt; line-height: 1.9; text-align: justify; }
      .ls-label { margin: 12px 0 2px; color: #1b344d; font-size: 9.5pt; font-weight: 700; }
      .ls-lines i { display: block; height: 24px; border-bottom: 1px solid #c9c2b2; }
    `;
    const meta = [
      paper.grade || '',
      `${list.length} 句`,
      formatDate(paper.createdAt)
    ].filter(Boolean).map((value) => escapeHtml(value)).join(' · ');
    const body = watermarkLayerHtml('doc-watermark') +
      `<article class="doc long-sentence-doc">` +
      `<p class="doc-kicker">${escapeHtml(BRAND_SIGNATURE)} · 长难句提炼</p>` +
      `<h1>${escapeHtml(paper.title)}</h1>` +
      `<p class="doc-meta">${meta}</p>` +
      `<p class="ls-tip">先通读原句，划出主句的主谓宾，再逐层标出从句、非谓语和修饰成分；最后对照自己的分析写出译文。</p>` +
      items +
      `<footer class="doc-footer">${escapeHtml(watermarkText())}</footer>` +
      `</article>`;
    return wrapWordDocument(`${paper.title} · 长难句提炼`, body, extraStyles);
  }

  function downloadLongSentences(paper) {
    if (!paper) return;
    const list = collectLongSentences(paper);
    if (!list.length) {
      toast('这份练习里还没有足够长的句子，暂时不能生成长难句提炼。', 'error', 5200);
      return;
    }
    const blob = new Blob(['﻿', longSentenceDocument(paper)], { type: 'application/msword' });
    downloadBlob(blob, `${safeFilename(`${paper.title} · 长难句提炼`)}.doc`);
  }

  // 旧资料里可能还存着 shortblank；读取时统一归入 grammar，避免在同一份练习里
  // 同时出现“语法填空”和“短文填空”两个大题。
  function normalizeType(type) {
    return type === 'shortblank' ? 'grammar' : type;
  }

  function typeLabel(type) {
    return (TYPES[normalizeType(type)] || TYPES.other).label;
  }

  function typeShort(type) {
    return (TYPES[normalizeType(type)] || TYPES.other).short;
  }

  function typeUnit(type) {
    return (TYPES[normalizeType(type)] || TYPES.other).unit;
  }

  function watermarkText() {
    return (state.settings.watermark || DEFAULT_WATERMARK).trim() || DEFAULT_WATERMARK;
  }

  /* ------------------------------------------------------------------------
     IndexedDB
     ------------------------------------------------------------------------ */

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('当前浏览器不支持 IndexedDB，无法使用本机资料库。'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('materials')) {
          const materials = db.createObjectStore('materials', { keyPath: 'id' });
          materials.createIndex('type', 'type', { unique: false });
          materials.createIndex('grade', 'grade', { unique: false });
          materials.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('items')) {
          const items = db.createObjectStore('items', { keyPath: 'id' });
          items.createIndex('materialId', 'materialId', { unique: false });
          items.createIndex('type', 'type', { unique: false });
          items.createIndex('grade', 'grade', { unique: false });
        }
        if (!db.objectStoreNames.contains('papers')) {
          const papers = db.createObjectStore('papers', { keyPath: 'id' });
          papers.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('无法打开本机资料库。'));
      request.onblocked = () => reject(new Error('资料库被另一个页面占用，请关闭其他工作台页面后重试。'));
    });
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('数据库操作失败。'));
    });
  }

  function txDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('数据库事务失败。'));
      transaction.onabort = () => reject(transaction.error || new Error('数据库事务已取消。'));
    });
  }

  async function dbGetAll(storeName) {
    if (!state.db) throw new Error('资料库尚未打开。');
    const transaction = state.db.transaction(storeName, 'readonly');
    return requestToPromise(transaction.objectStore(storeName).getAll());
  }

  async function dbPut(storeName, value) {
    if (!state.db) throw new Error('资料库尚未打开。');
    const transaction = state.db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value);
    await txDone(transaction);
  }

  async function dbDelete(storeName, key) {
    if (!state.db) throw new Error('资料库尚未打开。');
    const transaction = state.db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).delete(key);
    await txDone(transaction);
  }

  async function dbClear(storeName) {
    if (!state.db) throw new Error('资料库尚未打开。');
    const transaction = state.db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).clear();
    await txDone(transaction);
  }

  function saveMaterialWithItems(material, items) {
    return new Promise((resolve, reject) => {
      if (!state.db) {
        reject(new Error('资料库尚未打开。'));
        return;
      }
      const transaction = state.db.transaction(['materials', 'items'], 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('保存资料失败。'));
      transaction.onabort = () => reject(transaction.error || new Error('保存资料已取消。'));
      transaction.objectStore('materials').put(material);
      const itemStore = transaction.objectStore('items');
      const index = itemStore.index('materialId');
      const keysRequest = index.getAllKeys(IDBKeyRange.only(material.id));
      keysRequest.onsuccess = () => {
        // 先删除旧的题组，再写入新题组，避免游标把刚写入的记录一并删掉。
        keysRequest.result.forEach((key) => itemStore.delete(key));
        items.forEach((item) => itemStore.put(item));
      };
    });
  }

  function deleteMaterialAndItems(materialId) {
    return new Promise((resolve, reject) => {
      if (!state.db) {
        reject(new Error('资料库尚未打开。'));
        return;
      }
      const transaction = state.db.transaction(['materials', 'items'], 'readwrite');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error('删除资料失败。'));
      transaction.onabort = () => reject(transaction.error || new Error('删除资料已取消。'));
      transaction.objectStore('materials').delete(materialId);
      const itemStore = transaction.objectStore('items');
      const index = itemStore.index('materialId');
      const cursorRequest = index.openKeyCursor(IDBKeyRange.only(materialId));
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        itemStore.delete(cursor.primaryKey);
        cursor.continue();
      };
    });
  }

  async function loadData() {
    const [materials, items, papers, settingRecords] = await Promise.all([
      dbGetAll('materials'),
      dbGetAll('items'),
      dbGetAll('papers'),
      dbGetAll('settings')
    ]);
    state.materials = materials.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    state.items = items;
    state.papers = papers.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    const settings = { ...DEFAULT_SETTINGS };
    settingRecords.forEach((record) => {
      if (record && record.key) settings[record.key] = record.value;
    });
    state.settings = settings;
    state.sectionAliases = Array.isArray(settings.sectionAliases)
      ? settings.sectionAliases.filter((entry) => entry && entry.alias && TYPES[entry.type])
      : [];
    state.usbHandle = settings.usbDirectory || null;
  }

  async function saveSetting(key, value) {
    await dbPut('settings', { key, value });
    state.settings[key] = value;
  }

  async function migrateBrandSettings() {
    let changed = 0;
    if (state.settings.watermark === LEGACY_WATERMARK) {
      await saveSetting('watermark', DEFAULT_WATERMARK);
      changed += 1;
    }
    // 只替换旧版本的默认署名；用户自己改过的名字保持原样。
    if (state.settings.examOwner === '阮蔡顺') {
      await saveSetting('examOwner', BRAND_NAME);
      changed += 1;
    }
    return changed;
  }

  async function migrateParserCache() {
    if (Number(state.settings.parserVersion || 0) >= PARSER_VERSION) return 0;
    let rebuilt = 0;
    for (const material of state.materials) {
      if (!material) continue;
      // 顺带清理旧版本已经存进去的页眉、页脚、水印和页码。
      const cleanedBody = normalizePaperLayout(cleanImportedText(material.body || '').text);
      const cleanedAnswers = cleanImportedText(material.answers || '').text;
      const cleanedText = normalizePaperLayout(cleanImportedText(material.text || '').text);
      if (cleanedBody) material.body = cleanedBody;
      if (cleanedAnswers) material.answers = cleanedAnswers;
      if (cleanedText) material.text = cleanedText;
      material.type = normalizeType(material.type);
      material.band = material.band || gradeBand(material.grade);
      const fresh = parseAnswerKey(material.answers || '');
      const merged = { ...(material.answerMap || {}), ...fresh };
      const items = buildItemsForMaterial({ ...material, answerMap: merged });
      material.answerMap = merged;
      material.questionCount = items.length;
      material.processedBlob = makeMaterialBlob(material);
      material.processedSize = material.processedBlob ? material.processedBlob.size : 0;
      await saveMaterialWithItems(material, items);
      rebuilt += 1;
    }
    await saveSetting('parserVersion', PARSER_VERSION);
    if (rebuilt) {
      state.items = await dbGetAll('items');
      toast(`已按新版规则刷新 ${rebuilt} 份资料的题组和答案。`, 'ok', 3600);
    }
    return rebuilt;
  }

  /* ------------------------------------------------------------------------
     通用 UI：提示、确认框、视图
     ------------------------------------------------------------------------ */

  function toast(message, kind = 'ok', duration = 4200) {
    const stack = $('#toast-stack');
    if (!stack) return;
    const node = document.createElement('div');
    node.className = `toast${kind === 'error' ? ' is-error' : ''}`;
    node.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#${kind === 'error' ? 'i-alert' : 'i-check'}"/></svg><span></span>`;
    node.querySelector('span').textContent = message;
    stack.appendChild(node);
    window.setTimeout(() => {
      node.style.opacity = '0';
      node.style.transform = 'translateY(6px)';
      node.style.transition = '0.2s ease';
      window.setTimeout(() => node.remove(), 220);
    }, duration);
  }

  function openConfirm({ title, message, confirmText = '确认', danger = true, onConfirm }) {
    const dialog = $('#confirm-dialog');
    $('#confirm-title').textContent = title || '确认操作';
    $('#confirm-message').textContent = message || '';
    const ok = $('#confirm-ok');
    ok.textContent = confirmText;
    ok.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
    state.confirmAction = typeof onConfirm === 'function' ? onConfirm : null;
    dialog.showModal();
  }

  function go(view, shouldScroll = true) {
    const target = VIEWS.has(view) ? view : 'library';
    state.view = target;
    if (location.hash.slice(1) !== target) {
      window.history.replaceState(null, '', `#${target}`);
    }
    renderView();
    if (shouldScroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderView() {
    $$('.view').forEach((section) => {
      section.classList.toggle('active', section.id === `view-${state.view}`);
    });
    $$('.app-nav [data-view]').forEach((button) => {
      button.classList.toggle('active', button.dataset.view === state.view);
    });
    if (state.view === 'settings') updateStorage();
    if (state.view === 'practice') {
      renderPaperHistoryIfNeeded();
      if (state.paperFrame) {
        requestAnimationFrame(() => fitPaperFrame(state.paperFrame));
      }
    }
  }

  function applyRouteFromHash() {
    const hash = location.hash.replace(/^#/, '');
    state.view = VIEWS.has(hash) ? hash : 'library';
    renderView();
  }

  /* ------------------------------------------------------------------------
     下拉框
     ------------------------------------------------------------------------ */

  function populateTypeSelect(select) {
    if (!select) return;
    const current = select.value;
    select.innerHTML = Object.entries(TYPES)
      .filter(([key, def]) => key !== 'paper' && !def.legacy)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([key, def]) => `<option value="${key}">${escapeHtml(def.label)}</option>`)
      .join('');
    if (current && TYPES[current]) select.value = current;
  }

  function populateTypeSelects() {
    populateTypeSelect($('#edit-type'));
    populateTypeSelect($('#paste-type'));
    populateTypeSelect($('#alias-type'));
    const filter = $('#filter-type');
    if (filter) {
      filter.innerHTML = `<option value="">全部题型</option>${Object.entries(TYPES)
        .filter(([key, def]) => key !== 'paper' && !def.legacy)
        .sort((a, b) => a[1].order - b[1].order)
        .map(([key, def]) => `<option value="${key}">${escapeHtml(def.short)}</option>`)
        .join('')}`;
    }
  }

  function ensureGradeOptions() {
    const selects = [$('#edit-grade'), $('#paste-grade'), $('#default-grade')];
    selects.forEach((select) => {
      if (!select) return;
      GRADE_OPTIONS.forEach((grade) => {
        if (!Array.from(select.options).some((option) => option.value === grade)) {
          const option = document.createElement('option');
          option.value = grade;
          option.textContent = grade;
          select.appendChild(option);
        }
      });
    });
  }

  function populateGradeFilter() {
    const select = $('#filter-grade');
    if (!select) return;
    const current = select.value;
    const level = state.filters.level;
    const grades = unique([
      ...GRADE_OPTIONS,
      ...state.materials.map((material) => material.grade).filter(Boolean)
    ]).filter((grade) => !level || gradeBand(grade) === level);
    select.innerHTML = `<option value="">全部年级</option>${grades
      .map((grade) => `<option value="${escapeAttr(grade)}">${escapeHtml(grade)}</option>`)
      .join('')}`;
    if (current && grades.includes(current)) {
      select.value = current;
    } else {
      state.filters.grade = '';
      select.value = '';
    }
  }

  function hydrateSettingsUI() {
    const watermark = $('#watermark-input');
    const grade = $('#default-grade');
    if (watermark) watermark.value = watermarkText();
    if (grade) grade.value = state.settings.defaultGrade || '';
    const examTitle = $('#exam-title');
    const examOwner = $('#exam-owner');
    if (examTitle) examTitle.value = state.settings.examTitle || DEFAULT_SETTINGS.examTitle;
    if (examOwner) examOwner.value = state.settings.examOwner || DEFAULT_SETTINGS.examOwner;
    const toggles = [
      ['#include-answers', 'includeAnswers'],
      ['#include-vocab', 'includeVocab'],
      ['#include-dictation', 'includeDictation'],
      ['#show-difficulty', 'showDifficulty'],
      ['#ocr-enabled', 'ocrEnabled']
    ];
    toggles.forEach(([selector, key]) => {
      const input = $(selector);
      if (input) input.checked = state.settings[key] !== false;
    });
    const ocrLang = $('#ocr-lang');
    if (ocrLang) ocrLang.value = state.settings.ocrLang === 'eng' ? 'eng' : 'eng+chi_sim';
    const ocrPages = $('#ocr-pages');
    if (ocrPages) ocrPages.value = String(state.settings.ocrPdfPages || OCR_PDF_PAGE_LIMIT);
    const usbMirror = $('#usb-mirror');
    if (usbMirror) usbMirror.checked = state.settings.usbMirror === true;
    renderAliasLibrary();
    renderUsbStatus();
  }

  function renderAliasLibrary() {
    const container = $('#alias-list');
    if (!container) return;
    const aliases = Array.isArray(state.sectionAliases) ? state.sectionAliases : [];
    if (!aliases.length) {
      container.innerHTML = '<p class="alias-empty">识别库还是空的。点“恢复推荐别名”可载入各地常见叫法。</p>';
      return;
    }
    container.innerHTML = aliases.map((entry) => {
      const label = (TYPES[entry.type] || {}).short || entry.type;
      return `<span class="alias-chip">${escapeHtml(entry.alias)}<small>· ${escapeHtml(label)}</small>` +
        `<button type="button" data-action="delete-alias" data-alias="${escapeAttr(entry.alias)}" data-type="${escapeAttr(entry.type)}" aria-label="删除别名">×</button></span>`;
    }).join('');
  }

  function renderUsbStatus() {
    const status = $('#usb-status');
    if (!status) return;
    if (!state.usbHandle) {
      status.textContent = typeof window.showDirectoryPicker === 'function'
        ? '尚未选择 U 盘文件夹。'
        : '当前浏览器不支持直接写 U 盘，请用电脑版 Chrome / Edge。';
      return;
    }
    status.textContent = `已选择：${state.usbHandle.name || 'U 盘文件夹'}。下载时可在浏览器里另存，也会按开关自动存一份到这里。`;
  }

  async function addSectionAlias() {
    const input = $('#alias-input');
    const select = $('#alias-type');
    const alias = String(input ? input.value : '').trim().replace(/\s+/g, '');
    const type = select ? select.value : '';
    if (!alias || alias.length < 2) {
      toast('别名至少写两个字，例如“阅读还原”。', 'error');
      return;
    }
    if (!TYPES[type] || type === 'paper') {
      toast('请先选择归到哪个题型。', 'error');
      return;
    }
    const exists = (state.sectionAliases || []).some((entry) => entry.alias === alias && entry.type === type);
    if (exists) {
      toast('这个别名已经在识别库里了。');
      return;
    }
    state.sectionAliases = [...(state.sectionAliases || []), { alias, type }].slice(-160);
    state.settings.sectionAliases = state.sectionAliases;
    await saveSetting('sectionAliases', state.sectionAliases);
    if (input) input.value = '';
    renderAliasLibrary();
    toast(`已把「${alias}」记入识别库。`);
  }

  async function deleteSectionAlias(alias, type) {
    state.sectionAliases = (state.sectionAliases || []).filter((entry) => !(entry.alias === alias && entry.type === type));
    state.settings.sectionAliases = state.sectionAliases;
    await saveSetting('sectionAliases', state.sectionAliases);
    renderAliasLibrary();
  }

  async function seedSectionAliases() {
    state.sectionAliases = Array.isArray(state.sectionAliases) ? state.sectionAliases.slice() : [];
    const existing = new Set((state.sectionAliases || []).map((entry) => `${entry.alias}|${entry.type}`));
    let added = 0;
    RECOMMENDED_SECTION_ALIASES.forEach((entry) => {
      const key = `${entry.alias}|${entry.type}`;
      if (existing.has(key)) return;
      existing.add(key);
      state.sectionAliases.push({ ...entry });
      added += 1;
    });
    state.sectionAliases = state.sectionAliases.slice(-160);
    state.settings.sectionAliases = state.sectionAliases;
    await saveSetting('sectionAliases', state.sectionAliases);
    renderAliasLibrary();
    toast(added ? `已载入 ${added} 个推荐别名。` : '推荐别名已经都在识别库里了。');
  }

  /* ------------------------------------------------------------------------
     文件读取与解析
     ------------------------------------------------------------------------ */

  function looksLikeAnswerMaterial(material) {
    if (!material) return false;
    const text = String(material.text || '');
    if (!text) return false;
    if (isAnswerOnlyText(text)) return true;
    const answers = material.answerMap && typeof material.answerMap === 'object'
      ? Object.keys(material.answerMap).length
      : 0;
    return answers >= 5
      && String(material.body || '').trim().length < 400
      && /(参考答案|答案与解析|答案详解|答案速查|答案)/.test(text.slice(0, 800));
  }

  function matchNameKey(value) {
    return String(value || '')
      .replace(/\.[^.]+$/, '')
      .toLowerCase()
      .replace(/参考答案|答案与解析|答案详解|答案速查|答案|解析/g, '')
      .replace(/试卷|试题|真题|模拟|练习|英语/g, '')
      .replace(/[^a-z0-9一-鿿]/g, '');
  }

  function commonSubstringLength(left, right) {
    const a = matchNameKey(left);
    const b = matchNameKey(right);
    if (!a || !b) return 0;
    let best = 0;
    const previous = new Array(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i += 1) {
      let diagonal = 0;
      for (let j = 1; j <= b.length; j += 1) {
        const saved = previous[j];
        previous[j] = a[i - 1] === b[j - 1] ? diagonal + 1 : 0;
        if (previous[j] > best) best = previous[j];
        diagonal = saved;
      }
    }
    return best;
  }

  function pickAnswerMaterial(paper, answers) {
    if (!answers.length) return null;
    if (answers.length === 1 && paper.length === 1) return answers[0];
    let best = null;
    let bestScore = 0;
    answers.forEach((candidate) => {
      const score = commonSubstringLength(paper.sourceName, candidate.sourceName);
      if (score > bestScore) {
        bestScore = score;
        best = candidate;
      }
    });
    return bestScore >= 3 ? best : null;
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    if (state.busy) {
      toast('上一批文件还在整理中，请稍等。', 'error');
      return;
    }
    state.busy = true;
    go('upload', false);
    clearQueue();
    let ok = 0;
    let failed = 0;
    const prepared = [];

    for (const file of files) {
      const queueRow = addQueueRow(file);
      try {
        if (file.size > MAX_FILE_BYTES) {
          throw new Error(`文件超过 ${formatBytes(MAX_FILE_BYTES)}，请压缩或拆分后再上传。`);
        }
        setQueueStatus(queueRow, '读取文件…', 'working');
        const material = await buildMaterialFromFile(file, (message, kind) => {
          if (typeof message === 'string') {
            setQueueStatus(queueRow, message, kind === 'error' ? 'error' : 'working');
            return;
          }
          if (message && message.status) {
            const percent = Math.round((Number(message.progress) || 0) * 100);
            setQueueStatus(queueRow, `${message.status}${percent ? ` ${percent}%` : ''}`, 'working');
          }
        });
        prepared.push({ file, queueRow, material });
      } catch (error) {
        failed += 1;
        console.error('Import failed:', file.name, error);
        setQueueStatus(queueRow, error && error.message ? error.message : '处理失败', 'error');
      }
    }

    // 同一批里如果有单独的参考答案，自动并到同名/同批试卷，避免答案题号对不上。
    const answerMaterials = prepared.filter((entry) => looksLikeAnswerMaterial(entry.material));
    const paperMaterials = prepared.filter((entry) => entry.material && entry.material.type === 'paper' && !looksLikeAnswerMaterial(entry.material));
    const usedAnswers = new Set();
    paperMaterials.forEach((paperEntry) => {
      const candidates = answerMaterials.filter((entry) => !usedAnswers.has(entry));
      const matched = pickAnswerMaterial(paperEntry.material, candidates.map((entry) => entry.material));
      if (!matched) return;
      const answerEntry = candidates.find((entry) => entry.material === matched);
      if (!answerEntry) return;
      const paper = paperEntry.material;
      paper.answers = [paper.answers, answerEntry.material.answers || answerEntry.material.text].filter(Boolean).join('\n\n');
      paper.answerMap = { ...(answerEntry.material.answerMap || {}), ...(paper.answerMap || {}) };
      paper.text = [paper.text, answerEntry.material.text].filter(Boolean).join('\n\n');
      paper.tags = unique([...(paper.tags || []), '含答案', '答案已并入']);
      paper.note = unique([paper.note, `参考答案已从「${answerEntry.file.name}」并入。`]).join(' ');
      usedAnswers.add(answerEntry);
      paperEntry.mergedAnswer = answerEntry;
    });

    for (const entry of prepared) {
      if (usedAnswers.has(entry)) {
        setQueueStatus(entry.queueRow, `已并入试卷「${prepared.find((paper) => paper.mergedAnswer === entry)?.material.title || entry.material.title}」`, 'done');
        continue;
      }
      try {
        const material = entry.material;
        setQueueStatus(entry.queueRow, entry.mergedAnswer ? '答案已并入，重新拆题…' : '识别题型、生成整理版…', 'working');
        const items = buildItemsForMaterial(material);
        material.questionCount = items.length;
        material.processedBlob = makeMaterialBlob(material);
        material.processedSize = material.processedBlob ? material.processedBlob.size : 0;
        await saveMaterialWithItems(material, items);
        ok += 1;
        const countUnit = material.type === 'single' ? '道' : '组';
        setQueueStatus(
          entry.queueRow,
          items.length
            ? `已入库 · ${typeLabel(material.type)}${material.grade ? ` · ${material.grade}` : ''} · ${items.length} ${countUnit}${entry.mergedAnswer ? ' · 含答案' : ''}`
            : `已存档 · ${material.note || '未提取到题目'}`,
          'done'
        );
      } catch (error) {
        failed += 1;
        console.error('Import failed:', entry.file.name, error);
        setQueueStatus(entry.queueRow, error && error.message ? error.message : '处理失败', 'error');
      }
    }

    state.busy = false;
    await reloadAndRender();
    await requestPersistence(false);
    if (ok > 0) {
      toast(`已整理 ${ok} 份资料${failed ? `，${failed} 份需要手动处理` : ''}。`);
      go('library', false);
    } else if (failed > 0) {
      toast('文件没有成功入库，请查看上传列表中的提示。', 'error', 6000);
    }
  }

  async function buildMaterialFromFile(file, onProgress) {
    const extension = (file.name.split('.').pop() || '').toLowerCase();
    let text = '';
    let extractionNote = '';

    try {
      const result = await extractFileText(file, extension, onProgress);
      text = result.text || '';
      extractionNote = result.note || '';
    } catch (error) {
      extractionNote = `未能自动提取文字：${error.message || error}。原文件已完整保存。`;
      text = '';
    }

    text = toDisplayText(text);
    const cleaning = cleanImportedText(text, { fileName: file.name });
    text = toDisplayText(normalizePaperLayout(cleaning.text));
    if (cleaning.removed > 0) {
      extractionNote = [extractionNote, `已清理 ${cleaning.removed} 行页眉、页脚、水印或扫描噪点。`]
        .filter(Boolean)
        .join(' ');
    }
    const split = splitAnswerSection(text);
    const body = toDisplayText(split.body);
    const answers = toDisplayText(split.answers);
    const classified = classifyMaterial(file.name, body || text);
    const sections = detectExamSections(body || text);
    const isPaper = sections.length >= 2;
    const grade = classified.grade || state.settings.defaultGrade || '';
    const answerMap = parseAnswerKey(answers || (isAnswerOnlyText(text) ? text : ''));
    const tags = unique([
      ...(classified.tags || []),
      ...(isPaper ? sections.map((section) => typeShort(section.type)) : []),
      ...(grade ? [grade] : []),
      ...(Object.keys(answerMap).length ? ['含答案'] : []),
      '自动入库'
    ]);
    const noteParts = [];
    if (extractionNote) noteParts.push(extractionNote);
    if (classified.note && !isPaper) noteParts.push(classified.note);
    if (!body) noteParts.push('正文为空，可打开资料信息手动补充文字。');
    if (!isPaper && classified.confidence < 45) noteParts.push('自动识别把握不高，建议核对题型。');
    if (isPaper) noteParts.push(`已按试卷结构识别出 ${sections.length} 个部分，可分别抽取组卷。`);

    const id = uid();
    return {
      id,
      title: isPaper ? (detectExamTitle(body || text) || cleanTitle(file.name.replace(/\.[^.]+$/, ''), 'paper')) : classified.title,
      type: isPaper ? 'paper' : normalizeType(classified.type),
      grade,
      band: gradeBand(grade),
      tags,
      text,
      body,
      answers,
      answerMap,
      sectionTypes: isPaper ? unique(sections.map((section) => normalizeType(section.type))) : [normalizeType(classified.type)],
      note: unique(noteParts).join(' '),
      sourceName: file.name,
      sourceType: file.type || extension,
      sourceExtension: extension,
      originalBlob: file,
      originalSize: file.size,
      processedBlob: null,
      processedSize: 0,
      confidence: isPaper ? Math.max(78, classified.confidence) : classified.confidence,
      autoType: isPaper ? 'paper' : classified.type,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  }

  function isAnswerOnlyText(text) {
    const source = String(text || '');
    if (!source) return false;
    const head = source.slice(0, 300);
    return /(答案详解|参考答案|答案与解析|答案速查)/.test(head)
      && Object.keys(parseAnswerKey(source)).length >= 5;
  }

  function detectExamTitle(text) {
    const source = String(text || '').replace(/\r\n?/g, '\n');
    const lines = source.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 30);
    for (const line of lines) {
      if (line.length < 8 || line.length > 80) continue;
      if (/(考试|测试|检测|模拟|联考|质检|学业水平|适应性|调研|英语)/.test(line)
        && !/^\s*(?:\d|[A-D][.、．])/.test(line)
        && !/^(?:第[一二三四五六七八九十]+部分|听力|选择填空|完形填空|阅读理解)/.test(line)) {
        return line.replace(/\s+/g, ' ').slice(0, 80);
      }
    }
    return '';
  }

  async function extractFileText(file, extension, onProgress) {
    const report = typeof onProgress === 'function' ? onProgress : () => {};
    if (extension === 'txt' || extension === 'md') {
      return { text: await decodeTextFile(file), note: '' };
    }
    if (extension === 'docx') {
      const text = await extractDocxText(file);
      return {
        text,
        note: text ? '' : 'Word 文件中没有找到可提取的文字，原文件已保存。'
      };
    }
    if (extension === 'pdf') {
      report({ stage: 'extract', status: '读取 PDF 文字', progress: 0.05 });
      const result = await extractPdfText(file, report);
      if (result.text && result.text.replace(/\s+/g, '').length >= 120) {
        return result;
      }
      if (!state.settings.ocrEnabled) {
        return {
          text: result.text || '',
          note: 'PDF 没有可复制的文字，可能是扫描版；OCR 已在设置中关闭，原文件已保存。'
        };
      }
      try {
        report({ stage: 'ocr', status: '扫描版 PDF，启动本地 OCR', progress: 0.1 });
        const ocr = await ocrPdfPages(file, result.pageCount || 1, report);
        const text = toDisplayText([result.text, ocr.text].filter(Boolean).join('\n\n'));
        if (!text) throw new Error('OCR 没有识别出文字。');
        const pageNote = result.pageCount > ocr.pages
          ? `PDF 共 ${result.pageCount} 页，已 OCR 前 ${ocr.pages} 页；可在设置里调整 OCR 页数。`
          : `已对 ${ocr.pages} 页扫描内容做本地 OCR，识别后请核对文字。`;
        return { text, note: pageNote };
      } catch (error) {
        return {
          text: result.text || '',
          note: `扫描版 PDF 的 OCR 未成功：${error.message || error}。原文件已保存，可截图后按图片上传。`
        };
      }
    }
    if (extension === 'doc') {
      return {
        text: '',
        note: '旧版 .doc 已完整存档，暂不能提取文字。可用 Word 另存为 .docx 后重新上传，或直接手动补充文字。'
      };
    }
    if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'].includes(extension)) {
      if (!state.settings.ocrEnabled) {
        return {
          text: '',
          note: '图片已完整存档；OCR 已在设置中关闭，可在资料信息里手动补充文字。'
        };
      }
      try {
        report({ stage: 'ocr', status: '图片 OCR 识别中', progress: 0.05 });
        const text = await ocrImageFile(file, report);
        return {
          text,
          note: text
            ? '图片内容由本地 OCR 识别，文字和题号请核对后再用于组卷。'
            : '图片 OCR 没有识别出文字，原文件已保存；可换一张更清晰、端正的图片重试。'
        };
      } catch (error) {
        return {
          text: '',
          note: `图片 OCR 未成功：${error.message || error}。原文件已保存。`
        };
      }
    }
    return {
      text: '',
      note: `暂不支持自动解析 .${extension || '未知'} 格式，原文件已存档；可手动补充文字和题型。`
    };
  }

  async function decodeTextFile(file) {
    const buffer = await file.arrayBuffer();
    let text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    const badChars = (text.match(/�/g) || []).length;
    if (badChars > Math.max(2, text.length * 0.01)) {
      try {
        const gbk = new TextDecoder('gbk', { fatal: false }).decode(buffer);
        if ((gbk.match(/�/g) || []).length < badChars) text = gbk;
      } catch (error) {
        // 浏览器不支持 GBK 时保留 UTF-8 结果。
      }
    }
    return text.replace(/^﻿/, '');
  }

  async function extractDocxText(file) {
    if (!window.JSZip) throw new Error('Word 解析组件未加载，请刷新页面后重试。');
    const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
    const documentFile = zip.file('word/document.xml');
    if (!documentFile) throw new Error('Word 文件缺少正文，可能已损坏。');
    const xml = await documentFile.async('string');
    const dom = new DOMParser().parseFromString(xml, 'application/xml');
    if (dom.querySelector('parsererror')) throw new Error('Word 正文解析失败。');

    const hasParagraphAncestor = (element) => {
      let node = element.parentNode;
      while (node && node.nodeType === 1) {
        if (node.localName === 'p') return true;
        node = node.parentNode;
      }
      return false;
    };

    const paragraphs = Array.from(dom.getElementsByTagNameNS('*', 'p'))
      .filter((paragraph) => !hasParagraphAncestor(paragraph));

    const lines = paragraphs.map((paragraph) => {
      const text = Array.from(paragraph.getElementsByTagNameNS('*', 't'))
        .map((node) => node.textContent || '')
        .join('')
        .replace(/ /g, ' ')
        .replace(/[ \t]+$/g, '');
      return text;
    });

    return toDisplayText(lines.join('\n'));
  }

  async function extractPdfText(file, onProgress) {
    const pdfjs = await loadPdfLibrary();
    let pdf = null;
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      pdf = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
      const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
      const pages = [];
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        if (typeof onProgress === 'function') {
          onProgress({
            stage: 'extract',
            status: `读取 PDF 第 ${pageNumber}/${pageCount} 页`,
            progress: pageNumber / pageCount * 0.35
          });
        }
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const lines = groupPdfTextItems(content.items);
        if (lines.length) pages.push(lines.join('\n'));
      }
      const text = toDisplayText(cleanPageTexts(pages).join('\n\n'));
      const notes = [];
      if (!text) notes.push('PDF 中没有提取到可复制的文字，可能是扫描版或纯图片；原文件已完整保存。');
      if (pdf.numPages > MAX_PDF_PAGES) notes.push(`PDF 共 ${pdf.numPages} 页，已提取前 ${MAX_PDF_PAGES} 页。`);
      return { text, note: notes.join(' '), pageCount: pdf.numPages, textPages: pageCount };
    } finally {
      if (pdf) {
        try { await pdf.destroy(); } catch (error) { /* ignore */ }
      }
    }
  }

  let pdfLibraryPromise = null;

  function loadPdfLibrary() {
    if (window.pdfjsLib) {
      configurePdfWorker();
      return Promise.resolve(window.pdfjsLib);
    }
    if (!pdfLibraryPromise) {
      pdfLibraryPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'vendor/pdf.min.js';
        script.async = true;
        script.onload = () => {
          if (!window.pdfjsLib) {
            reject(new Error('PDF 解析组件加载失败。'));
            return;
          }
          configurePdfWorker();
          resolve(window.pdfjsLib);
        };
        script.onerror = () => reject(new Error('无法加载 PDF 解析组件（vendor/pdf.min.js）。'));
        document.head.appendChild(script);
      });
    }
    return pdfLibraryPromise;
  }

  function configurePdfWorker() {
    if (!window.pdfjsLib || !window.pdfjsLib.GlobalWorkerOptions) return;
    try {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdf.worker.min.js', document.baseURI).href;
    } catch (error) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
    }
  }

  function groupPdfTextItems(items) {
    if (!Array.isArray(items) || !items.length) return [];
    const rows = [];
    items.forEach((item) => {
      const text = item.str;
      if (!text || !text.trim()) return;
      const transform = item.transform || [];
      const y = Number(transform[5]);
      const x = Number(transform[4]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      let row = rows.find((candidate) => Math.abs(candidate.y - y) < 2.4);
      if (!row) {
        row = { y, parts: [] };
        rows.push(row);
      }
      row.parts.push({ x, str: text, width: Number(item.width) || 0 });
    });

    rows.sort((a, b) => b.y - a.y);
    return rows.map((row) => {
      row.parts.sort((a, b) => a.x - b.x);
      let line = '';
      let previous = null;
      row.parts.forEach((part) => {
        if (previous) {
          const gap = part.x - (previous.x + previous.width);
          const lastChar = line.trim().slice(-1);
          const firstChar = part.str.trim().slice(0, 1);
          if (gap > 2.2 && !isCjk(lastChar) && !isCjk(firstChar) && !/\s$/.test(line) && !/^\s/.test(part.str)) {
            line += ' ';
          }
        }
        line += part.str;
        previous = part;
      });
      return line.replace(/[ \t]+/g, ' ').trim();
    }).filter(Boolean);
  }

  /* ------------------------------------------------------------------------
     OCR（Tesseract.js，本地浏览器运行，不上传图片）
     ------------------------------------------------------------------------ */

  let ocrLibraryPromise = null;

  function loadOcrLibrary() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!ocrLibraryPromise) {
      ocrLibraryPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = new URL('vendor/tesseract/tesseract.min.js', document.baseURI).href;
        script.async = true;
        script.onload = () => {
          if (window.Tesseract) resolve(window.Tesseract);
          else reject(new Error('OCR 组件加载失败。'));
        };
        script.onerror = () => reject(new Error('无法加载 OCR 组件（vendor/tesseract/tesseract.min.js）。'));
        document.head.appendChild(script);
      });
    }
    return ocrLibraryPromise;
  }

  function ocrLanguage() {
    const value = String(state.settings.ocrLang || 'eng+chi_sim');
    return value === 'eng' ? 'eng' : 'eng+chi_sim';
  }

  async function getOcrWorker(onProgress) {
    const Tesseract = await loadOcrLibrary();
    const lang = ocrLanguage();
    if (state.ocrWorker && state.ocrWorkerLang === lang) {
      state.ocrProgress = onProgress || null;
      return state.ocrWorker;
    }
    if (!state.ocrWorkerPromise) {
      state.ocrWorkerPromise = (async () => {
        if (state.ocrWorker) {
          try { await state.ocrWorker.terminate(); } catch (error) { /* ignore */ }
          state.ocrWorker = null;
        }
        const worker = await Tesseract.createWorker(lang, 1, {
          workerPath: new URL('vendor/tesseract/worker.min.js', document.baseURI).href,
          corePath: new URL('vendor/tesseract/tesseract-core-simd-lstm.wasm.js', document.baseURI).href,
          langPath: new URL('vendor/tesseract/lang', document.baseURI).href,
          logger: (message) => {
            if (state.ocrProgress && message && message.status) {
              state.ocrProgress({ stage: 'ocr', status: message.status, progress: message.progress || 0 });
            }
          }
        });
        state.ocrWorker = worker;
        state.ocrWorkerLang = lang;
        try {
          await worker.setParameters({
            tessedit_pageseg_mode: '3',
            preserve_interword_spaces: '1',
            user_defined_dpi: '300'
          });
        } catch (error) { /* 旧版引擎不支持参数时继续用默认值 */ }
        return worker;
      })().finally(() => {
        state.ocrWorkerPromise = null;
      });
    }
    const worker = await state.ocrWorkerPromise;
    state.ocrProgress = onProgress || null;
    return worker;
  }

  function ocrLinesFromResult(data) {
    const lines = [];
    ((data && data.blocks) || []).forEach((block) => {
      ((block && block.paragraphs) || []).forEach((paragraph) => {
        ((paragraph && paragraph.lines) || []).forEach((line) => {
          const text = String(line && line.text ? line.text : '').replace(/[ \t]+/g, ' ').trim();
          if (!text || !line.bbox) return;
          const bbox = line.bbox;
          if (![bbox.x0, bbox.y0, bbox.x1, bbox.y1].every(Number.isFinite)) return;
          lines.push({ text, bbox });
        });
      });
    });
    return lines;
  }

  function orderOcrLines(lines, width) {
    if (!lines.length) return [];
    const W = Math.max(1, Math.ceil(width || Math.max(...lines.map((line) => line.bbox.x1))));
    const centerX = (line) => (line.bbox.x0 + line.bbox.x1) / 2;
    const centerY = (line) => (line.bbox.y0 + line.bbox.y1) / 2;

    const findVerticalGutter = (items) => {
      const cover = new Uint16Array(W + 2);
      items.forEach((line) => {
        const x0 = Math.max(0, Math.floor(line.bbox.x0));
        const x1 = Math.min(W, Math.ceil(line.bbox.x1));
        for (let x = x0; x <= x1; x += 1) cover[x] += 1;
      });
      let best = null;
      let start = null;
      for (let x = 0; x <= W; x += 1) {
        if (x < W && cover[x] === 0) {
          if (start === null) start = x;
        } else if (start !== null) {
          const end = x;
          const mid = (start + end) / 2;
          const left = items.some((line) => centerX(line) < mid);
          const right = items.some((line) => centerX(line) >= mid);
          if (end - start >= 24 && left && right && (!best || end - start > best[1] - best[0])) {
            best = [start, end];
          }
          start = null;
        }
      }
      return best;
    };

    const findHorizontalGutter = (items) => {
      const H = Math.max(1, Math.ceil(Math.max(...items.map((line) => line.bbox.y1))));
      const cover = new Uint16Array(H + 2);
      items.forEach((line) => {
        const y0 = Math.max(0, Math.floor(line.bbox.y0));
        const y1 = Math.min(H, Math.ceil(line.bbox.y1));
        for (let y = y0; y <= y1; y += 1) cover[y] += 1;
      });
      let best = null;
      let start = null;
      for (let y = 0; y <= H; y += 1) {
        if (y < H && cover[y] === 0) {
          if (start === null) start = y;
        } else if (start !== null) {
          const end = y;
          const mid = (start + end) / 2;
          const top = items.some((line) => centerY(line) < mid);
          const bottom = items.some((line) => centerY(line) >= mid);
          if (end - start >= 20 && top && bottom && (!best || end - start > best[1] - best[0])) {
            best = [start, end];
          }
          start = null;
        }
      }
      return best;
    };

    const sortRows = (items) => {
      const rows = [];
      items.slice().sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0).forEach((line) => {
        const cy = centerY(line);
        const row = rows.find((candidate) => Math.abs(candidate.cy - cy) <= 8);
        if (row) {
          row.parts.push(line);
          row.cy = (row.cy * row.count + cy) / (row.count + 1);
          row.count += 1;
        } else {
          rows.push({ cy, count: 1, parts: [line] });
        }
      });
      return rows
        .sort((a, b) => a.cy - b.cy)
        .map((row) => row.parts.sort((a, b) => a.bbox.x0 - b.bbox.x0).map((line) => line.text).join(' '));
    };

    const cut = (items, depth) => {
      if (items.length <= 1 || depth > 10) return sortRows(items);
      const vertical = findVerticalGutter(items);
      const horizontal = findHorizontalGutter(items);
      if (vertical && (!horizontal || vertical[1] - vertical[0] >= horizontal[1] - horizontal[0])) {
        const mid = (vertical[0] + vertical[1]) / 2;
        const left = items.filter((line) => centerX(line) < mid);
        const right = items.filter((line) => centerX(line) >= mid);
        if (left.length && right.length) return [...cut(left, depth + 1), ...cut(right, depth + 1)];
      }
      if (horizontal) {
        const mid = (horizontal[0] + horizontal[1]) / 2;
        const top = items.filter((line) => centerY(line) < mid);
        const bottom = items.filter((line) => centerY(line) >= mid);
        if (top.length && bottom.length) return [...cut(top, depth + 1), ...cut(bottom, depth + 1)];
      }
      return sortRows(items);
    };

    return cut(lines, 0);
  }

  function ocrTextFromResult(data, width) {
    const lines = ocrLinesFromResult(data);
    if (lines.length) {
      return toDisplayText(orderOcrLines(lines, width).join('\n'));
    }
    return toDisplayText(data && data.text ? data.text : '');
  }

  async function prepareOcrCanvas(source, targetWidth) {
    const bitmap = await createImageBitmap(source);
    const target = Math.max(1200, Math.min(2600, targetWidth || 2200));
    const scale = Math.min(3, Math.max(1, target / Math.max(1, bitmap.width)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();
    try {
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = image.data;
      for (let index = 0; index < pixels.length; index += 4) {
        const grey = pixels[index] * 0.299 + pixels[index + 1] * 0.587 + pixels[index + 2] * 0.114;
        const adjusted = Math.max(0, Math.min(255, (grey - 128) * 1.18 + 128));
        pixels[index] = adjusted;
        pixels[index + 1] = adjusted;
        pixels[index + 2] = adjusted;
      }
      context.putImageData(image, 0, 0);
    } catch (error) { /* 部分浏览器禁止读取画布时保留原图 */ }
    return canvas;
  }

  async function recognizeOcrCanvas(worker, canvas, onProgress) {
    state.ocrProgress = onProgress || null;
    const result = await worker.recognize(canvas, {}, { text: true, blocks: true });
    const text = ocrTextFromResult(result && result.data, canvas.width);
    if (canvas.width > 2600 && canvas.height > 2600) {
      canvas.width = 1;
      canvas.height = 1;
    }
    return text;
  }

  async function ocrImageFile(file, onProgress) {
    if (!state.settings.ocrEnabled) return '';
    onProgress({ stage: 'ocr', status: '准备图片', progress: 0 });
    const worker = await getOcrWorker(onProgress);
    const canvas = await prepareOcrCanvas(file, 2200);
    onProgress({ stage: 'ocr', status: '识别文字', progress: 0.05 });
    return recognizeOcrCanvas(worker, canvas, onProgress);
  }

  async function ocrPdfPages(file, pageCount, onProgress) {
    const limit = Math.max(1, Math.min(Number(state.settings.ocrPdfPages) || OCR_PDF_PAGE_LIMIT, pageCount));
    const pdfjs = await loadPdfLibrary();
    let pdf = null;
    const pages = [];
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      pdf = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
      const worker = await getOcrWorker(onProgress);
      for (let pageNumber = 1; pageNumber <= limit; pageNumber += 1) {
        onProgress({
          stage: 'ocr',
          status: `OCR 第 ${pageNumber}/${limit} 页`,
          progress: (pageNumber - 1) / limit
        });
        const page = await pdf.getPage(pageNumber);
        const base = page.getViewport({ scale: 1 });
        const scale = Math.max(1.6, Math.min(4, 2200 / Math.max(1, base.width)));
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext('2d', { alpha: false });
        context.fillStyle = '#fff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: context, viewport }).promise;
        const text = await recognizeOcrCanvas(worker, canvas, onProgress);
        if (text) pages.push(text);
      }
      return { text: cleanPageTexts(pages).join('\n\n'), pages: limit };
    } finally {
      if (pdf) {
        try { await pdf.destroy(); } catch (error) { /* ignore */ }
      }
    }
  }

  /* ------------------------------------------------------------------------
     题型识别与标题
     ------------------------------------------------------------------------ */

  const SECTION_TITLE_RULES = [
    // 福建等地把听力写成“听音理解”，只认“听力”会把它并进后面的单选，
    // 导致没有音频的听力小题被当成普通选择题抽进每日练习。
    ['listening', /听音理解|听力(?:理解|测试|部分)?/],
    ['single', /选择填空|单项选择|单项填空/],
    ['cloze', /完形填空|完型填空/],
    ['reading', /阅读理解|任务型阅读/],
    ['five', /五选五|七选五|阅读还原|阅读填句|补全短文|信息匹配/],
    ['dialogue', /情景交际|补全对话|完成对话/],
    ['picture', /看图写话|看图作文/],
    // 各地叫法不同：语法填空、短文填空、短文填词、语篇填空、首字母填空、选词填空，
    // 都是“在语篇中按语法/语境填空”，统一归入 grammar，避免同一份卷子被拆成两种题型。
    ['grammar', /语法填空|短文填空|短文填词|语篇填空|首字母填空|选词填空|单词拼写|词汇运用|完成句子/],
    ['writing', /书面表达|写作|作文/]
  ];

  function sectionTypeFromLine(line) {
    const text = String(line || '').trim();
    if (!text || text.length > 120) return '';
    if (/^\s*(?:\d{1,2}[.、．)）]|[A-D][.、．)）])/.test(text)) return '';
    const prefix = /^\s*(?:第[一二三四五六七八九十]+[部分节]\s*)?(?:[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩIVX]+|[一二三四五六七八九十]+)?\s*[.、．:：]?\s*/;
    if (!prefix.test(text)) return '';
    const body = text.replace(prefix, '').trim();
    if (!body) return '';
    const head = body.slice(0, 24);
    for (const [type, pattern] of SECTION_TITLE_RULES) {
      if (pattern.test(head)) return type;
    }
    // 老师自己在识别库里加的别名优先于固定规则，方便各地模拟卷的冷门叫法。
    const custom = (state.sectionAliases || [])
      .filter((entry) => entry && entry.alias && TYPES[entry.type] && entry.type !== 'paper')
      .slice()
      .sort((a, b) => b.alias.length - a.alias.length);
    for (const entry of custom) {
      if (body.startsWith(entry.alias) || head.startsWith(entry.alias)) return entry.type;
    }
    if (/阅读下面短文[，,]?\s*从短文后所给的(?:五个|七个)选项/.test(head)) return 'five';
    if (/阅读下面短文[，,]?\s*在空白处填入/.test(head)) return 'grammar';
    if (/根据每题所提供的图画情景/.test(head)) return 'picture';
    if (/根据情景[，,]?\s*用恰当的/.test(head)) return 'dialogue';
    return '';
  }

  function isInstructionOnlyHeading(line) {
    const text = String(line || '').trim();
    return /^(?:阅读下面短文[，,]?\s*(?:从短文后所给的(?:五个|七个)选项|在空白处填入)|根据每题所提供的图画情景|根据情景[，,]?\s*用恰当的)/.test(text);
  }

  const PAPER_TYPE_WORDS = '单项选择|单项填空|选择填空|语法选择|完形填空|完型填空|阅读理解|任务型阅读|阅读还原|阅读填句|补全短文|信息匹配|五选五|七选五|语法填空|短文填空|短文填词|语篇填空|首字母填空|选词填空|单词拼写|词汇运用|完成句子|情景交际|补全对话|完成对话|看图写话|看图作文|书面表达|应用文写作|读后续写|听力理解|听力测试';

  function normalizePaperLayout(text) {
    // 有些 PDF 把“二、完形填空”粘在上一题的选项后面，整段因此识别不到大题。
    // 只在“已知题型词”前面补换行，不碰普通正文，避免把文章拆碎。
    const source = String(text || '').replace(/\r\n?/g, '\n');
    const heading = `(?:第[一二三四五六七八九十]+部分(?:\\s*[（(][^）)\\n]{0,24}[）)])?|[一二三四五六七八九十]+、|\\b(?:I{1,3}|IV|V|VI{0,3}|[ⅠⅡⅢⅣⅤⅥ])\\s*[.、．])\\s*(?:${PAPER_TYPE_WORDS})`;
    return source
      .replace(new RegExp(`([^\\n])([ \\t]*)(?=${heading})`, 'g'), '$1\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n');
  }

  function detectExamSections(text) {
    const source = String(text || '').replace(/\r\n?/g, '\n');
    const lines = source.split('\n');
    const headings = [];
    let offset = 0;
    lines.forEach((line, index) => {
      const type = sectionTypeFromLine(line);
      if (type) {
        const last = headings[headings.length - 1];
        const adjacent = Boolean(last) && index - last.index <= 2;
        // 题干说明紧跟在标题后时属于上一部分的作答要求，不单独成节。
        if (isInstructionOnlyHeading(line) && adjacent) {
          offset += line.length + 1;
          return;
        }
        // 只有相邻的同类标题才合并，避免把后文另一个同类大题吞掉。
        if (!last || !adjacent || last.type !== type) {
          headings.push({ type, index, offset, line: line.trim() });
        }
      }
      offset += line.length + 1;
    });

    if (headings.length < 2) return [];

    const segments = [];
    headings.forEach((heading, index) => {
      const start = heading.offset;
      const end = index + 1 < headings.length ? headings[index + 1].offset : source.length;
      const content = source.slice(start, end).trim();
      if (!content) return;
      segments.push({
        type: heading.type,
        heading: heading.line,
        content,
        start,
        end
      });
    });
    return segments;
  }

  function splitReadingPassages(sectionText, type) {
    const source = String(sectionText || '').replace(/\r\n?/g, '\n');
    const lines = source.split('\n');
    const marks = [];
    let offset = 0;
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (/^[A-E]$/.test(trimmed) || /^[A-E][.、．]?$/.test(trimmed)) {
        // 阅读部分的篇目标签通常单独占一行（A/B/C…），不要求前面已经有正文。
        marks.push({ letter: trimmed[0], index, offset });
      }
      offset += line.length + 1;
    });
    if (marks.length < 2) return [{
      type,
      title: typeLabel(type),
      content: source
    }];
    const prefix = source.slice(0, marks[0].offset).trim();
    return marks.map((mark, index) => {
      const end = index + 1 < marks.length ? marks[index + 1].offset : source.length;
      const body = source.slice(mark.offset, end).trim();
      const content = index === 0 && prefix && !/阅读理解|阅读下列短文/.test(prefix)
        ? `${prefix}\n\n${body}`
        : body;
      return {
        type,
        title: `${typeLabel(type)} · ${mark.letter} 篇`,
        content
      };
    });
  }

  function classifyMaterial(fileName, text) {
    const baseName = String(fileName || '').replace(/\.[^.]+$/, '');
    const body = String(text || '').slice(0, 80000);
    const head = body.slice(0, 4500);
    const sections = detectExamSections(body);
    const grade = detectGrade(`${baseName}\n${head}`);

    if (sections.length >= 2) {
      const title = detectExamTitle(body) || cleanTitle(baseName, 'paper');
      return {
        type: 'paper',
        confidence: 88,
        grade,
        title,
        tags: ['综合卷', ...sections.map((section) => typeShort(section.type)), ...(grade ? [grade] : [])],
        note: `已识别为综合试卷，包含 ${sections.length} 个部分，可分别随机抽题。`,
        sections
      };
    }

    const scores = {};
    const evidence = {};

    Object.entries(TYPE_KEYWORDS).forEach(([key, rules]) => {
      let score = 0;
      const hits = [];
      const apply = (haystack, keywords, weight, cap) => {
        if (!haystack) return;
        keywords.forEach((keyword) => {
          const count = countOccurrences(haystack, keyword);
          if (count) {
            score += Math.min(count, cap) * weight;
            hits.push(keyword);
          }
        });
      };
      apply(baseName, rules.strong, 15, 2);
      apply(baseName, rules.weak, 11, 2);
      apply(head, rules.strong, 6, 3);
      apply(head, rules.weak, 3, 2);
      apply(body, rules.strong, 1.2, 5);
      apply(body, rules.weak, 0.5, 3);
      scores[key] = score;
      evidence[key] = unique(hits).slice(0, 5);
    });

    // ---- 结构特征 ------------------------------------------------------
    // 各地模拟卷的题型名称不完全相同，但“长什么样”相对稳定。先用结构特征判断，
    // 再用文件名/标题里的关键词兜底，能明显减少把短文填空认成完形、把阅读认成单选的情况。
    const optionLines = (body.match(/(?:^|\n)\s*[A-DＡ-Ｄ][.、．)）]\s+/g) || []).length;
    const blocks = parseQuestionBlocks(body);
    const mcqBlocks = blocks.filter((block) => block.options.length >= 2);
    const blankNumbers = collectBlankNumbers(body);
    const rawBlankCount = (body.match(/_{2,}|\(\s*\)|（\s*）|\b\d{1,2}[.、．]?\s*_{2,}/g) || []).length;
    const blankCount = Math.max(blankNumbers.length, rawBlankCount);
    const totalWords = englishWordTokens(body).length;
    const firstQuestion = blocks.length ? blocks[0].start : body.length;
    const passageWords = englishWordTokens(body.slice(0, firstQuestion)).length;
    const stemWordCounts = mcqBlocks.map((block) => englishWordTokens(block.stem || '').length);
    const emptyStemRatio = stemWordCounts.length
      ? stemWordCounts.filter((count) => count <= 3).length / stemWordCounts.length
      : 0;
    const optionBox = extractChoiceBox(body);
    const sentenceChoiceCount = optionBox.filter((option) => englishWordTokens(option.text).length >= 3).length;
    const passageLabelCount = (body.match(/(?:^|\n)\s*[A-E]\s*(?=(?:\n|$))/g) || []).length;
    const hasWordLimit = /(词左右|词数|字数|写一封|写一篇|写邮件|write an email|write a letter|write a composition)/i.test(body);
    const hasDialogueMarks = /(?:^|\n)\s*(?:A|B|M|W|Man|Woman)\s*[:：]/.test(body)
      || /补全对话|完成对话|情景交际/.test(baseName + head);
    const hasPictureTitle = /看图写话|看图作文/.test(baseName + head);
    const hasWritingTitle = /书面表达|应用文写作|作文|读后续写|写作/.test(baseName + head);
    const hasListeningTitle = /听力理解|听力测试|听下面|listening comprehension/.test(baseName + head);
    const hasFiveTitle = /五选五|七选五|阅读还原|阅读填句|补全短文/.test(baseName + head);
    const hasClozeTitle = /完形填空|完型填空|cloze/i.test(baseName + head);
    const hasGrammarTitle = /语法填空|短文填空|短文填词|语篇填空|首字母填空|选词填空|单词拼写|词汇运用/.test(baseName + head);
    const hasReadingTitle = /阅读理解|阅读下列短文|reading comprehension|read the passage/i.test(baseName + head);
    const hasSingleTitle = /单项选择|单项填空|选择填空|multiple choice|single choice/i.test(baseName + head);

    // ---- 按“试卷上长什么样”依次判断 -----------------------------------
    // 顺序很重要：先排除听力、写作等整块题型，再按“五选五 → 完形 → 语法/短文填空
    // → 阅读 → 单选”的优先级判断，避免一篇阅读里的选择题把整份卷子带成单选。
    let type = '';
    let confidence = 0;
    let evidenceText = '';
    const choose = (candidate, score, evidence) => {
      if (type) return;
      type = candidate;
      confidence = score;
      evidenceText = evidence || '';
    };

    if (hasListeningTitle) {
      choose('listening', 88, '标题或开头出现听力指令');
    }
    if (!type && hasWritingTitle && mcqBlocks.length < 2 && blankCount < 3) {
      choose('writing', 90, '出现书面表达标题，且没有成组的选择题');
    }
    if (!type && hasWordLimit && mcqBlocks.length < 2 && blankCount < 4) {
      choose('writing', 84, '出现词数/写作任务要求');
    }
    if (!type && hasPictureTitle) {
      choose('picture', 88, '出现看图写话标题');
    }
    if (!type && (hasDialogueMarks || /情景交际|补全对话|完成对话/.test(baseName + head)) && mcqBlocks.length < 3) {
      choose('dialogue', 86, '出现对话双方标记或补全对话标题');
    }

    if (!type && (hasFiveTitle && blankCount >= 3
      || (sentenceChoiceCount >= 4 && blankCount >= 4 && mcqBlocks.length < 3))) {
      choose('five', hasFiveTitle ? 92 : 86, '文中有编号空格，文后是 A–E/G 整句选项');
    }
    if (!type && (hasClozeTitle && mcqBlocks.length >= 3
      || (mcqBlocks.length >= 4 && blankCount >= 4 && passageWords >= 80
        && optionLines >= 8 && emptyStemRatio >= 0.5))) {
      choose('cloze', hasClozeTitle ? 92 : 86, '一篇短文里连续编号空格，每题配 A–D 选项，且小题题干很短');
    }
    if (!type && (hasGrammarTitle && blankCount >= 3 && mcqBlocks.length < 2
      || (blankCount >= 4 && mcqBlocks.length < 2 && sentenceChoiceCount < 4))) {
      choose('grammar', hasGrammarTitle ? 92 : 84, '语篇中有连续编号空格，但没有成组的选择题；短文填空、首字母、选词填空均归入此类');
    }
    if (!type && (hasReadingTitle && mcqBlocks.length >= 1
      // 初中阅读短文常常只有 60–100 词，不能因为“没到 120 词”就误判成单选。
      || (mcqBlocks.length >= 2 && passageWords >= 45 && blankCount < 4 && emptyStemRatio < 0.5)
      || (mcqBlocks.length >= 3 && (passageLabelCount >= 2 || passageWords >= 120)
        && passageWords >= 50 && emptyStemRatio < 0.5))) {
      choose('reading', hasReadingTitle ? 90 : 82, '有一篇或几篇短文，后面跟带完整题干的选择题');
    }
    if (!type && (hasSingleTitle && mcqBlocks.length >= 2
      || (mcqBlocks.length >= 3 && passageWords < 100 && emptyStemRatio < 0.6))) {
      choose('single', hasSingleTitle ? 90 : 80, '多道独立选择题，题干短，前面没有成篇短文');
    }
    if (!type && blankCount >= 4) {
      choose('grammar', 72, '连续编号空格较多，按语篇填空处理');
    }
    if (!type && mcqBlocks.length >= 3) {
      choose('single', 68, '多道带选项的题目，按选择题处理');
    }

    // ---- 关键词兜底 ----------------------------------------------------
    if (!type) {
      const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
      const [bestType, bestScore] = ranked[0] || ['other', 0];
      const total = ranked.reduce((sum, entry) => sum + Math.max(entry[1], 0), 0);
      const ratio = total > 0 ? Math.round((bestScore / total) * 100) : 0;
      if (bestScore >= 3.2) {
        type = bestType === 'shortblank' ? 'grammar' : bestType;
        confidence = ratio;
        evidenceText = '标题关键词';
      }
    }

    if (type === 'other') confidence = 0;
    if (type === 'single' && optionLines < 2 && mcqBlocks.length < 2) type = 'other';
    if (type === 'reading' && mcqBlocks.length === 0) type = 'other';
    if (type === 'cloze' && mcqBlocks.length < 3) type = 'other';
    if (type === 'five' && blankCount < 3 && !hasFiveTitle) type = 'other';
    if (type === 'other') confidence = 0;

    const title = cleanTitle(baseName, type);
    const tags = unique([
      typeShort(type),
      ...(grade ? [grade] : []),
      ...(type === 'grammar' ? ['语篇填空'] : [])
    ]);
    const note = type === 'other'
      ? '暂未识别出明确题型，请在上传后核对并修改。'
      : (confidence < 55
        ? `按${evidenceText || '文本结构'}初步判断，建议核对题型。`
        : '');

    return {
      type,
      confidence: type === 'other' ? 0 : Math.min(100, confidence),
      grade,
      title,
      tags,
      note,
      sections: []
    };
  }

  function gradeBand(grade) {
    const text = String(grade || '');
    if (/(七年级|八年级|九年级|初一|初二|初三|中考|初中)/.test(text)) return 'junior';
    if (/(高一|高二|高三|高考|高中)/.test(text)) return 'senior';
    return '';
  }

  function bandLabel(band) {
    return BAND_LABELS[band] || '';
  }

  function materialBand(material) {
    if (!material) return '';
    return material.band || gradeBand(material.grade);
  }

  function detectGrade(text) {
    const source = String(text || '');
    // 先认具体年级，再认“中考 / 高考”，最后才用“初中 / 高中”兜底；
    // 这样“2026 届初三中考模拟”不会被笼统识成“初中”。
    if (/(高一|高中一年级)/.test(source)) return '高一';
    if (/(高二|高中二年级)/.test(source)) return '高二';
    if (/(高三|高中三年级)/.test(source)) return '高三';
    if (/(七年级|初一|初一年级)/.test(source)) return '七年级';
    if (/(八年级|初二|初二年级)/.test(source)) return '八年级';
    if (/(九年级|初三|初三年级)/.test(source)) return '九年级';
    if (/(初中学业水平|中考|中招考试)/.test(source)) return '中考';
    if (/(普通高中学业水平|高考|高招考试)/.test(source)) return '高考';
    if (/(高中)/.test(source)) return '高中';
    if (/(初中)/.test(source)) return '初中';
    return '';
  }

  function cleanTitle(baseName, type) {
    let title = String(baseName || '')
      .replace(/[_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^(副本|copy of)\s*/i, '')
      .trim();
    if (!title || /^(新建|未命名|文档|doc|scan|image|img)\d*$/i.test(title) || title.length < 2) {
      title = `${typeLabel(type)} · ${todayCn()}`;
    }
    return title.slice(0, 80);
  }

  function splitAnswerSection(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const sectionPattern = /^\s*(参考答案|答案与解析|答案|answer\s*key|answers?|keys?)\s*[:：]?\s*$/i;
    const inlinePattern = /^\s*(参考答案|答案与解析|答案|answer\s*key|answers?|keys?)\s*[:：]\s*(.+)$/i;
    const start = Math.floor(lines.length * 0.3);
    for (let index = start; index < lines.length; index += 1) {
      if (sectionPattern.test(lines[index])) {
        return {
          body: lines.slice(0, index).join('\n').trim(),
          answers: lines.slice(index + 1).join('\n').trim()
        };
      }
      const inline = lines[index].match(inlinePattern);
      if (inline) {
        return {
          body: lines.slice(0, index).join('\n').trim(),
          answers: [inline[2], ...lines.slice(index + 1)].join('\n').trim()
        };
      }
    }

    // 没有“参考答案”标题时，识别末尾常见的答案行，例如 “1-5 BBACA”。
    for (let index = lines.length - 1; index >= start; index -= 1) {
      const line = lines[index].trim();
      if (/^\d{1,2}\s*[-–—~至]\s*\d{1,2}\s*[:：]?\s*[A-D][A-D\s,，、;；]*$/i.test(line)) {
        return {
          body: lines.slice(0, index).join('\n').trim(),
          answers: lines.slice(index).join('\n').trim()
        };
      }
    }

    // 也识别连续成列的 “1. A / 2. B / 3. C” 答案表。
    let firstAnswerLine = lines.length;
    for (let index = lines.length - 1; index >= start; index -= 1) {
      if (/^\s*\d{1,2}[.、．)]\s*[A-D]\s*$/i.test(lines[index])) {
        firstAnswerLine = index;
      } else {
        break;
      }
    }
    if (lines.length - firstAnswerLine >= 3) {
      return {
        body: lines.slice(0, firstAnswerLine).join('\n').trim(),
        answers: lines.slice(firstAnswerLine).join('\n').trim()
      };
    }

    return { body: String(text || '').trim(), answers: '' };
  }

  /* ------------------------------------------------------------------------
     题组拆分
     ------------------------------------------------------------------------ */

  const INSTRUCTION_LINE_PATTERN = /(?:每小题\s*[\d一二三四五六七八九十]|满分\s*\d|选出.{0,8}答案|最佳答案|填入.{0,8}空白|补全.{0,8}(?:句子|对话|短文)|使短文.{0,10}(?:通顺|连贯|完整)|意思完整|所给.{0,10}(?:选项|单词)|从短文后所给|根据.{0,10}(?:提示|情景|语境)|每空不超过|完成对话|情景提示|阅读下面短文|阅读以下|阅读下列短文|短文后所给)/;

  function isInstructionLine(line) {
    const text = String(line || '').trim();
    if (!text || text.length > 100) return false;
    if (!INSTRUCTION_LINE_PATTERN.test(text)) return false;
    const chinese = (text.match(/[一-鿿]/g) || []).length;
    const visible = text.replace(/\s/g, '').length || 1;
    // 说明文字以中文为主；英文正文里偶尔出现“答案”等词时不会被误删。
    return chinese / visible >= 0.3;
  }

  function cleanSectionContent(content) {
    const lines = String(content || '').replace(/\r\n?/g, '\n').split('\n')
      .filter((line) => !isPartHeadingLine(line));
    while (lines.length) {
      const line = lines[0].trim();
      if (!line) { lines.shift(); continue; }
      if (sectionTypeFromLine(line)) { lines.shift(); continue; }
      if (/^(?:第[一二三四五六七八九十]+[部分节]|第[一二三四五六七八九十]+节)/.test(line)
        || /^(?:阅读下列短文|阅读下面短文|阅读短文|从每题所给|根据短文内容|根据情景|根据每题所提供|听下面|听第)/.test(line)) {
        lines.shift();
        continue;
      }
      // 页眉页脚清掉后，大题说明常被拆成半句留在正文开头；篇目标签 A/B/C 也在
      // 这里去掉，排版时由程序统一加“A 篇”，避免预览里出现两个 A。
      if (isInstructionLine(line) || /^[A-E]$/.test(line)) {
        lines.shift();
        continue;
      }
      break;
    }
    return lines.join('\n').trim();
  }

  function questionMeta(block, type, passage, answerMap, grade) {
    const skill = inferSkill(block.stem, type);
    const optionText = (block.options || []).map((option) => option.text).join(' ');
    const ownDifficulty = difficultyForText(`${block.stem || ''} ${optionText}`, {
      type,
      skill,
      grade
    });
    let difficulty = ownDifficulty;
    if (passage && ['reading', 'cloze', 'five', 'shortblank', 'grammar'].includes(type)) {
      // 以整篇文章的词汇、句长为底色，再叠加该题设问方式的难度，避免整篇所有题都被拉成同一级。
      const passageDifficulty = difficultyForText(passage, { type, grade });
      const blended = Math.round(ownDifficulty.level * 0.45 + passageDifficulty.level * 0.55);
      difficulty = {
        level: clamp(blended, 1, 10),
        breakdown: ownDifficulty.breakdown
      };
    }
    const sourceAnswer = answerMap && answerMap[block.number] ? answerMap[block.number] : {};
    return {
      id: uid(),
      number: block.number,
      stem: normalizeStemText(block.stem || ''),
      options: (block.options || []).map((option) => ({ letter: option.letter, text: option.text })),
      skill,
      difficulty: difficulty.level,
      difficultyBreakdown: difficulty.breakdown,
      answer: sourceAnswer.answer || '',
      explanation: sourceAnswer.explanation || ''
    };
  }

  function blankAnswerMap(content, answerMap) {
    const map = {};
    collectBlankNumbers(content).forEach((number) => {
      const source = answerMap && answerMap[number];
      if (source && (source.answer || source.explanation)) {
        map[number] = { answer: source.answer || '', explanation: source.explanation || '' };
      }
    });
    return map;
  }

  function blankDifficultyMap(content, answerMap, type, passage, grade) {
    const map = {};
    const passageLevel = passage ? difficultyForText(passage, { type, grade }).level : 0;
    collectBlankNumbers(content).forEach((number) => {
      const sentence = blankSentence(content, number) || content;
      const answer = answerMap && answerMap[number] ? answerMap[number].answer || '' : '';
      const own = difficultyForText(`${sentence} ${answer}`, { type, grade });
      const level = passageLevel
        ? clamp(Math.round(own.level * 0.55 + passageLevel * 0.45), 1, 10)
        : own.level;
      map[number] = level;
    });
    return map;
  }

  function makeSetItem(material, type, content, title, answerMap, order) {
    const cleaned = cleanSectionContent(content);
    const normalizedType = normalizeType(type);
    // 书面表达/看图写话里的“1. 2. 3.”是写作要点，不是小题；若照常拆题，
    // 会把一篇作文算成 3 道题，答案区也会出现 3 条重复的“写作提示”。
    const writingLike = normalizedType === 'writing' || normalizedType === 'picture';
    const parsed = writingLike
      ? { passage: cleaned, questions: [] }
      : splitPassageAndQuestions(cleaned, type);
    // 语法填空/完成句子常常直接从“71.”开始，没有前置短文；这时 passage 必须是空的。
    // 若回退成整段 content，渲染时会把每一小题再当短文印一遍。
    const passage = parsed.passage || (parsed.questions && parsed.questions.length ? '' : cleaned);
    let questions = (parsed.questions || []).map((block) => questionMeta(block, type, passage, answerMap, material.grade));
    if (normalizedType === 'five') {
      // 五选五的小题号直接嵌在短文里（66、67…），没有独立题干行；
      // 不补出这些编号，抽题时会把一整篇只算成 1 小题，答案也无处可挂。
      const existing = new Set(questions.map((question) => Number(question.number)));
      collectInlineBlankNumbers(cleaned).forEach((number) => {
        if (existing.has(number)) return;
        questions.push(questionMeta({ number, stem: '', options: [] }, type, passage, answerMap, material.grade));
      });
      questions.sort((a, b) => Number(a.number) - Number(b.number));
    }
    // 图片选项在 PDF 文字层里是空的。一篇阅读若大部分题有选项、个别题没有，
    // 说明那几题依赖插图；宁可少印一题，也不印一道没有选项的选择题。
    const hasChoiceOptions = questions.some((question) => (question.options || []).length >= 2);
    if (hasChoiceOptions && ['single', 'reading', 'cloze'].includes(normalizedType)) {
      questions = questions.filter((question) => (question.options || []).length >= 2);
    }
    const difficulty = difficultyForText(cleaned, { type, grade: material.grade });
    const levels = questions.map((question) => question.difficulty);
    const blanks = blankAnswerMap(cleaned, answerMap);
    const blankDifficulties = blankDifficultyMap(cleaned, answerMap, type, passage, material.grade);
    Object.entries(blankDifficulties).forEach(([number, level]) => {
      if (!questions.some((question) => Number(question.number) === Number(number))) levels.push(level);
    });
    const blankNumbers = Object.keys(blanks).map(Number).sort((a, b) => a - b);
    return {
      id: uid(),
      materialId: material.id,
      type: normalizeType(type),
      grade: material.grade || '',
      band: material.band || gradeBand(material.grade),
      kind: 'set',
      order,
      title: title || typeLabel(type),
      content: cleaned,
      passage,
      questions,
      blankAnswers: blanks,
      blankDifficulties,
      sourceNumbers: questions.length ? questions.map((question) => question.number) : blankNumbers,
      difficulty: levels.length ? Math.round(levels.reduce((sum, level) => sum + level, 0) / levels.length) : difficulty.level,
      difficultyRange: levels.length ? rangeText(levels) : String(difficulty.level),
      difficultyBreakdown: difficulty.breakdown,
      answer: '',
      explanation: '',
      createdAt: nowIso()
    };
  }

  function makeQuestionItem(material, type, block, answerMap, order) {
    const meta = questionMeta(block, type, '', answerMap, material.grade);
    return {
      id: uid(),
      materialId: material.id,
      type: normalizeType(type),
      grade: material.grade || '',
      band: material.band || gradeBand(material.grade),
      kind: 'question',
      order,
      content: block.raw,
      sourceNumber: block.number,
      questions: [meta],
      sourceNumbers: [block.number],
      difficulty: meta.difficulty,
      difficultyRange: String(meta.difficulty),
      difficultyBreakdown: meta.difficultyBreakdown,
      skill: meta.skill,
      answer: meta.answer,
      explanation: meta.explanation,
      createdAt: nowIso()
    };
  }

  function listeningQuestionLimit(section) {
    const text = `${section.heading || ''}\n${String(section.content || '').slice(0, 180)}`;
    const range = text.match(/(\d{1,3})\s*[-—－~～至]\s*(\d{1,3})\s*小题/);
    if (range) return Math.max(Number(range[1]), Number(range[2]));
    const count = text.match(/共?\s*(\d{1,3})\s*小题/);
    if (count) return Number(count[1]);
    return 20;
  }

  function splitListeningContent(content, limit) {
    const blocks = parseQuestionBlocks(content);
    const firstSingle = blocks.find((block) => block.number > limit);
    if (!firstSingle) return { listening: content, rest: '' };
    return {
      listening: content.slice(0, firstSingle.start).trim(),
      rest: content.slice(firstSingle.start).trim()
    };
  }

  function itemsForSection(material, section, answerMap, startOrder) {
    const type = normalizeType(section.type);
    const rawContent = section.content || '';
    const answerSource = answerMap || {};

    if (type === 'reading') {
      // 必须先在原始正文里按 A/B/C 标签分篇，再逐篇清理开头的“A”标签。
      // 顺序反过来会把 A 标签当说明文字删掉，导致 B 篇并进 A 篇。
      const passages = splitReadingPassages(rawContent, type);
      return passages.map((passage, index) => makeSetItem(
        material,
        type,
        passage.content,
        passage.title,
        answerSource,
        startOrder + index
      ));
    }

    const content = cleanSectionContent(rawContent);
    if (!content.trim()) return [];

    if (type === 'listening') {
      // 听力题依赖录音，PDF 文字层里的图片选项还常常只剩“A B C”。
      // 这类题不进每日练习；但有些卷子漏印了“II. 单项选择”标题，
      // 听力后面的 21–35 题会落在同一块里，要按题号范围接回单选。
      const parts = splitListeningContent(content, listeningQuestionLimit(section));
      if (!parts.rest) return [];
      return itemsForSection(material, {
        ...section,
        type: 'single',
        content: parts.rest
      }, answerMap, startOrder);
    }

    if (type === 'single' || type === 'dialogue' || type === 'picture') {
      const blocks = parseQuestionBlocks(content).filter((block) => {
        return block.options.length >= 2 || /_{2,}|\(\s*\)|（\s*）/.test(block.raw);
      });
      if (blocks.length) {
        return blocks.map((block, index) => makeQuestionItem(
          material,
          type,
          block,
          answerSource,
          startOrder + index
        ));
      }
    }

    return [makeSetItem(material, type, content, section.heading || typeLabel(type), answerSource, startOrder)];
  }

  function orphanPrefixItems(material, body, sections, answerMap) {
    if (!sections.length) return [];
    const prefix = String(body).slice(0, sections[0].start).trim();
    if (prefix.length < 20) return [];
    // OCR 单页常常从上一页的题目中间开始，标题在上一页；这里把卷头下面的“无标题题”接回来。
    const hasNumbered = /(?:^|\n)\s*\d{1,3}\s*[.、．)）]\s*\S/.test(prefix);
    const hasOptions = /(?:^|\n|\s)[A-G]\s*[.、．)）]\s*\S/.test(prefix);
    if (!hasNumbered || !hasOptions) return [];
    const type = /完形填空|完型填空/.test(prefix) ? 'cloze'
      : /阅读理解|阅读下列短文/.test(prefix) ? 'reading'
        : 'single';
    return itemsForSection(material, {
      type,
      heading: '补充题目（承接上一页）',
      content: prefix
    }, answerMap, 1);
  }

  function buildItemsForMaterial(material) {
    const body = material.body || material.text || '';
    if (!String(body).trim()) return [];
    const answerMap = parseAnswerKey(material.answers || '');
    // 新解析结果优先于旧缓存，避免旧版本漏掉 17、18 等答案后一直沿用。
    const mergedMap = { ...(material.answerMap || {}), ...answerMap };
    const sections = detectExamSections(body);
    if (sections.length >= 2) {
      const items = [];
      let order = 1;
      const prefixItems = orphanPrefixItems(material, body, sections, mergedMap);
      if (prefixItems.length) {
        items.push(...prefixItems);
        order += prefixItems.length;
      }
      sections.forEach((section) => {
        const sectionItems = itemsForSection(material, section, mergedMap, order);
        order += sectionItems.length;
        items.push(...sectionItems);
      });
      if (items.length) return items;
    }

    if (material.type === 'paper') {
      const fallbackSections = detectExamSections(body);
      if (fallbackSections.length) {
        const items = [];
        let order = 1;
        fallbackSections.forEach((section) => {
          const sectionItems = itemsForSection(material, section, mergedMap, order);
          order += sectionItems.length;
          items.push(...sectionItems);
        });
        if (items.length) return items;
      }
      return [makeSetItem(material, 'other', body, material.title, mergedMap, 1)];
    }

    return itemsForSection(material, {
      type: normalizeType(material.type),
      heading: material.title,
      content: body
    }, mergedMap, 1);
  }

  function extractSingleQuestions(text) {
    return parseQuestionBlocks(text)
      .filter((block) => block.options.length >= 2 || /_{2,}|\(\s*\)|（\s*）/.test(block.raw))
      .map((block) => ({
        content: block.raw,
        sourceNumber: block.number,
        stem: block.stem,
        options: block.options
      }));
  }

  /* ------------------------------------------------------------------------
     文档生成
     ------------------------------------------------------------------------ */

  function watermarkLayerHtml(className = 'watermark-layer') {
    const text = escapeHtml(watermarkText());
    const marks = Array.from({ length: 18 }, () => `<span>${text}</span>`).join('');
    return `<div class="${escapeAttr(className)}" aria-hidden="true">${marks}</div>`;
  }

  function textToDocHtml(text) {
    const normalized = String(text || '').replace(/\r\n?/g, '\n').trim();
    if (!normalized) {
      return '<p class="doc-empty">（未提取到文字内容，请查看原文件或手动补充。）</p>';
    }
    return normalized
      .split(/\n{2,}/)
      .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  function buildMaterialDocBody(material, body, answers) {
    const meta = [
      typeLabel(material.type),
      material.grade || '',
      material.sourceName || '',
      formatDate(material.createdAt)
    ].filter(Boolean).map((item) => escapeHtml(item)).join(' · ');
    const cleanBody = cleanImportedText(body || '').text;
    const cleanAnswers = cleanImportedText(answers || '').text;
    const answerBlock = cleanAnswers
      ? `<section class="doc-answers"><h2>参考答案</h2>${textToDocHtml(cleanAnswers)}</section>`
      : '';
    return watermarkLayerHtml('doc-watermark') +
      `<article class="doc">` +
      `<p class="doc-kicker">${escapeHtml(BRAND_SIGNATURE)} · 教学资料</p>` +
      `<h1>${escapeHtml(material.title)}</h1>` +
      `<p class="doc-meta">${meta}</p>` +
      `<div class="doc-body">${textToDocHtml(cleanBody)}</div>` +
      `${answerBlock}` +
      `<footer class="doc-footer">${escapeHtml(watermarkText())}</footer>` +
      `</article>`;
  }

  function docStyles() {
    return `
      @page { size: A4; margin: 2cm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #1f2b33; background: #fff; font-family: Arial, "SimHei", "Microsoft YaHei", "Heiti SC", sans-serif; font-size: 12pt; line-height: 1.85; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .doc-watermark, .watermark-layer { position: fixed; inset: 0; z-index: 0; display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: 150px; gap: 8px; overflow: hidden; pointer-events: none; }
      .doc-watermark span, .watermark-layer span { align-self: center; justify-self: center; color: rgba(27, 52, 77, 0.075); font-family: "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 12px; line-height: 1; white-space: nowrap; transform: rotate(-28deg); }
      .doc { position: relative; z-index: 1; }
      .doc-kicker { margin: 0 0 4px; color: #9e3f3c; font-family: "Microsoft YaHei", sans-serif; font-size: 9pt; letter-spacing: 0.12em; }
      h1 { margin: 0; color: #1b344d; font-family: "Microsoft YaHei", sans-serif; font-size: 18pt; line-height: 1.45; }
      .doc-meta { margin: 6px 0 0; padding-bottom: 10px; border-bottom: 1.5px solid #1b344d; color: #66727a; font-size: 9.5pt; }
      .doc-body { margin-top: 15px; }
      .doc-body p { margin: 0 0 8px; }
      .doc-body p:empty { display: none; }
      .doc-empty { color: #8b9398; font-style: italic; }
      .doc-answers { margin-top: 22px; padding-top: 10px; border-top: 1px solid #c9c2b2; }
      .doc-answers h2 { margin: 0 0 6px; color: #1b344d; font-family: "Microsoft YaHei", sans-serif; font-size: 13pt; }
      .doc-footer { margin-top: 28px; padding-top: 8px; border-top: 1px solid #d8d1c3; color: #8b9398; font-size: 9pt; text-align: center; }
    `;
  }

  function wrapWordDocument(title, bodyHtml, extraStyles = '') {
    return '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
      `<head><meta charset="utf-8"><meta http-equiv="Content-Type" content="text/html; charset=utf-8">` +
      `<title>${escapeHtml(title)}</title><style>${docStyles()}${extraStyles}</style></head>` +
      `<body>${bodyHtml}</body></html>`;
  }

  function makeMaterialBlob(material) {
    if (!material.body || !String(material.body).trim()) return null;
    const html = wrapWordDocument(material.title, buildMaterialDocBody(material, material.body, material.answers));
    return new Blob(['﻿', html], { type: 'application/msword' });
  }

  /* ------------------------------------------------------------------------
     组卷指令
     ------------------------------------------------------------------------ */

  function normalizeCommandText(text) {
    return String(text || '')
      .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
      .replace(/[，、；;]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cnNum(value) {
    const text = String(value || '').trim();
    if (!text) return NaN;
    if (/^\d+$/.test(text)) return Number(text);
    if (text === '十') return 10;
    if (text.includes('十')) {
      const [tens, ones] = text.split('十');
      const tensValue = tens ? (CN_NUMS[tens] || 0) : 1;
      const onesValue = ones ? (CN_NUMS[ones] || 0) : 0;
      return tensValue * 10 + onesValue;
    }
    return CN_NUMS[text] ?? NaN;
  }

  function findTypeAlias(text, type) {
    const aliases = (ALIASES[type] || []).slice().sort((a, b) => b.length - a.length);
    let best = null;
    aliases.forEach((alias) => {
      const index = text.toLowerCase().indexOf(alias.toLowerCase());
      if (index === -1) return;
      if (!best || index < best.index || (index === best.index && alias.length > best.alias.length)) {
        best = { index, alias };
      }
    });
    return best;
  }

  function findCountNear(text, match) {
    const tail = text.slice(match.index + match.alias.length, match.index + match.alias.length + 12);
    const head = text.slice(Math.max(0, match.index - 12), match.index);
    const countPattern = '(\\d{1,3}|[一二两三四五六七八九十]{1,3})';
    const after = tail.match(new RegExp(`^\\s*[：:]?\\s*${countPattern}\\s*(道|题|篇|套|个)?`));
    if (after) {
      const count = cnNum(after[1]);
      if (Number.isFinite(count) && count > 0) return { count, unit: after[2] || '' };
    }
    const before = head.match(new RegExp(`${countPattern}\\s*(道|题|篇|套|个)?\\s*$`));
    if (before) {
      const count = cnNum(before[1]);
      if (Number.isFinite(count) && count > 0) return { count, unit: before[2] || '' };
    }
    return { count: null, unit: '' };
  }

  function defaultRequests(band = '') {
    const inBand = (item) => !band || materialBand(item) === band;
    const preferred = [
      { type: 'single', count: 5 },
      { type: 'cloze', count: 1 },
      { type: 'reading', count: 1 },
      { type: 'grammar', count: 1 },
      { type: 'writing', count: 1 }
    ];
    const available = preferred.filter((request) => state.items.some((item) => normalizeType(item.type) === request.type && inBand(item)));
    if (available.length) return available;
    return [
      { type: 'single', count: 5 },
      { type: 'reading', count: 1 }
    ];
  }

  function parseLevelTarget(text) {
    const source = String(text || '');
    const named = source.match(/难度\s*[:：]?\s*(基础|中等|适中|提高|较难|挑战)/);
    if (named) {
      const map = { '基础': 3, '中等': 5, '适中': 5, '提高': 6, '较难': 8, '挑战': 9 };
      const target = map[named[1]];
      return { target, min: Math.max(1, target - 1), max: Math.min(10, target + 1) };
    }
    const range = source.match(/(?:难度|等级|level|L)\s*[:：]?\s*(\d{1,2})(?:\s*[-–—~至]\s*(\d{1,2}))?/i);
    if (!range) return null;
    const first = clamp(Number(range[1]), 1, 10);
    const second = range[2] ? clamp(Number(range[2]), 1, 10) : first;
    return {
      target: Math.round((first + second) / 2),
      min: Math.min(first, second),
      max: Math.max(first, second)
    };
  }

  function parseCommand(raw, fallbackBand = '') {
    const text = normalizeCommandText(raw);
    const grade = detectGrade(text);
    // 指令里的“初中 / 高中”优先；没写时沿用页面上的学段开关。
    const band = gradeBand(grade) || (/(初中|初中学段)/.test(text) ? 'junior' : '')
      || (/(高中|高中学段)/.test(text) ? 'senior' : '')
      || fallbackBand || '';
    const level = parseLevelTarget(text);
    const requests = [];
    const explicit = new Set();

    TYPE_ORDER.forEach((type) => {
      if (type === 'paper' || type === 'other') return;
      const match = findTypeAlias(text, type);
      if (!match) return;
      explicit.add(type);
      const found = findCountNear(text, match);
      const count = found.count && found.count > 0
        ? found.count
        : (type === 'single' ? 5 : 1);
      requests.push({
        type,
        count,
        unit: found.unit || typeUnit(type)
      });
    });

    // “阅读还原/阅读填句”里的“阅读”只是五选五别名的一部分；只有这种重叠才移除阅读，
    // 用户同时写“阅读理解 2 篇 + 五选五 1 篇”时应保留两种题型。
    if (explicit.has('five') && explicit.has('reading')) {
      const readingMatch = findTypeAlias(text, 'reading');
      const fiveMatch = findTypeAlias(text, 'five');
      const readingInsideFive = readingMatch && fiveMatch
        && readingMatch.index >= fiveMatch.index
        && readingMatch.index < fiveMatch.index + fiveMatch.alias.length;
      if (readingInsideFive) {
        const index = requests.findIndex((request) => request.type === 'reading');
        if (index >= 0) requests.splice(index, 1);
        explicit.delete('reading');
      }
    }

    let notes = [];
    let effectiveRequests = requests;
    if (!effectiveRequests.length) {
      effectiveRequests = defaultRequests(band);
      notes.push(band
        ? `未指定题型，已按${bandLabel(band)}题库的默认组合抽取。`
        : '未指定题型，已按今日默认组合抽取。');
    }

    const order = new Map(TYPE_ORDER.map((type, index) => [type, index]));
    effectiveRequests.sort((a, b) => (order.get(a.type) ?? 99) - (order.get(b.type) ?? 99));

    return {
      raw: text,
      grade,
      band,
      level,
      requests: effectiveRequests,
      explicit: Array.from(explicit),
      notes,
      hasExplicitTypes: explicit.size > 0
    };
  }

  function gradeMatches(itemGrade, requestedGrade) {
    if (!requestedGrade) return true;
    if (!itemGrade) return false;
    if (itemGrade === requestedGrade) return true;
    const equivalents = GRADE_EQUIVALENTS[requestedGrade] || [];
    return equivalents.includes(itemGrade);
  }

  function itemDifficultyOf(item) {
    const value = Number(item && item.difficulty);
    if (Number.isFinite(value) && value >= 1 && value <= 10) return Math.round(value);
    const levels = ((item && item.questions) || [])
      .map((question) => Number(question.difficulty))
      .filter((level) => Number.isFinite(level) && level >= 1 && level <= 10);
    if (levels.length) return Math.round(levels.reduce((sum, level) => sum + level, 0) / levels.length);
    return difficultyForText((item && (item.passage || item.content)) || '', {
      type: item && item.type,
      grade: item && item.grade
    }).level;
  }

  function snapshotItem(item) {
    const copy = JSON.parse(JSON.stringify(item));
    copy.originalId = item.id;
    copy.difficulty = itemDifficultyOf(item);
    copy.questions = ((item.questions || [])).map((question) => ({ ...question }));
    return copy;
  }

  function selectItemsForRequest(request, requestedGrade, options = {}) {
    const label = typeShort(request.type);
    // 单选、情景交际、看图写句在入库时按“逐题”拆开；其余题型按“整组”抽。
    const kind = ['single', 'dialogue', 'picture'].includes(request.type) ? 'question' : 'set';
    const usedItemIds = options.usedItemIds || new Set();
    const usedMaterialIds = options.usedMaterialIds || new Set();
    const type = normalizeType(request.type);
    let pool = state.items.filter((item) => normalizeType(item.type) === type && item.kind === kind && !usedItemIds.has(item.id));
    if (!pool.length) {
      return { items: [], warning: `资料库中还没有可用的「${label}」题目。` };
    }

    let warnings = [];
    const band = options.band || '';
    if (band) {
      const inBand = pool.filter((item) => materialBand(item) === band);
      if (inBand.length) {
        pool = inBand;
      } else {
        // 学段是硬边界：初中卷不拿高中题凑数，高中卷也不拿初中题凑数。
        return { items: [], warning: `${bandLabel(band)}题库中暂无「${label}」，已跳过这一项。` };
      }
    }

    if (requestedGrade) {
      const strict = pool.filter((item) => gradeMatches(item.grade, requestedGrade));
      if (strict.length) {
        pool = strict;
      } else {
        warnings.push(`「${requestedGrade}」暂无${label}，已从全部年级的资料中抽取。`);
      }
    }

    const level = options.level;
    if (level) {
      const inRange = pool.filter((item) => {
        const difficulty = itemDifficultyOf(item);
        return difficulty >= level.min && difficulty <= level.max;
      });
      if (inRange.length >= request.count) {
        pool = inRange;
      } else if (inRange.length) {
        const rest = pool
          .filter((item) => !inRange.includes(item))
          .sort((a, b) => {
            const da = Math.abs(itemDifficultyOf(a) - level.target);
            const db = Math.abs(itemDifficultyOf(b) - level.target);
            return da - db;
          });
        pool = [...inRange, ...rest];
        warnings.push(`${label}中难度 ${level.min}–${level.max} 的篇目不足，已用最接近难度的题目补足。`);
      } else {
        warnings.push(`${label}暂无难度 ${level.min}–${level.max} 的题目，已按最接近难度抽取。`);
        pool = pool.slice().sort((a, b) => {
          const da = Math.abs(itemDifficultyOf(a) - level.target);
          const db = Math.abs(itemDifficultyOf(b) - level.target);
          return da - db;
        });
      }
    }

    // 优先使用尚未出现的试卷，避免一份练习反复抽同一篇。
    const fresh = pool.filter((item) => !usedMaterialIds.has(item.materialId));
    const ordered = fresh.length ? [...shuffle(fresh), ...shuffle(pool.filter((item) => usedMaterialIds.has(item.materialId)))] : shuffle(pool);

    if (request.count > ordered.length) {
      warnings.push(`${label}只有 ${ordered.length} ${typeUnit(request.type)}，已全部选入。`);
    }

    const picked = ordered.slice(0, Math.max(1, request.count));
    return { items: picked, warning: warnings.join(' ') };
  }

  function assignPaperNumbers(sections) {
    let next = 1;
    sections.forEach((section) => {
      const levels = [];
      section.items.forEach((item) => {
        item.numberMap = {};
        const questionNumbers = (item.questions || []).map((question) => Number(question.number)).filter(Number.isFinite);
        const blankNumbers = collectBlankNumbers(item.content || '');
        const sourceNumbers = unique([...questionNumbers, ...blankNumbers]).sort((a, b) => a - b);
        const isWriting = normalizeType(section.type) === 'writing';
        if (isWriting) {
          // 书面表达整篇只占一个连续题号；即使提示语里有下划线，也不当小题编号。
          item.writingNumber = next;
          item.paperNumbers = [next];
          next += 1;
        } else {
          sourceNumbers.forEach((number) => {
            item.numberMap[number] = next;
            next += 1;
          });
        }
        (item.questions || []).forEach((question) => {
          question.paperNumber = item.numberMap[question.number] || null;
          if (question.paperNumber) levels.push(Number(question.difficulty) || itemDifficultyOf(item));
        });
        Object.keys(item.numberMap).forEach((number) => {
          if (!(item.questions || []).some((question) => Number(question.number) === Number(number))) {
            const blankLevel = item.blankDifficulties && item.blankDifficulties[number];
            levels.push(Number(blankLevel) || itemDifficultyOf(item));
          }
        });
        if (!isWriting) {
          item.paperNumbers = Object.values(item.numberMap);
        }
        item.paperDifficulty = levels.length
          ? Math.round(levels.reduce((sum, level) => sum + level, 0) / levels.length)
          : itemDifficultyOf(item);
      });
      const sectionLevels = section.items.map((item) => item.paperDifficulty);
      section.difficultyRange = rangeText(sectionLevels);
    });
    return next - 1;
  }

  function paperVocabularyText(paper) {
    const parts = [];
    (paper.sections || []).forEach((section) => {
      section.items.forEach((item) => {
        parts.push(item.passage || item.content || '');
        (item.questions || []).forEach((question) => {
          parts.push(question.stem || '');
          (question.options || []).forEach((option) => parts.push(option.text || ''));
        });
      });
    });
    return parts.join('\n');
  }

  function phrasePhonetic(phrase) {
    const parts = String(phrase || '').split(/\s+/)
      .map((word) => dictionaryLookup(word))
      .map((found) => found && (found.kk || found.ipa))
      .filter(Boolean)
      .map((value) => String(value).replace(/^\/|\/$/g, ''));
    return parts.length ? `/${parts.join(' ')}/` : '';
  }

  function vocabularyMinRank(paper) {
    const grade = `${paper.grade || ''} ${paper.band || ''}`;
    if (/高三|高考/.test(grade)) return 4200;
    if (/高二/.test(grade)) return 3900;
    if (/高中|高一/.test(grade) || paper.band === 'senior') return 3600;
    if (/九年级|中考/.test(grade)) return 2600;
    if (/八年级/.test(grade)) return 2200;
    return 1800;
  }

  function selectPaperVocabulary(vocabulary, text, questionTotal, focusText, minRank = 1100) {
    const frequency = new Map();
    englishWordTokens(text).forEach((token) => {
      const key = normalizeWordKey(token);
      if (key) frequency.set(key, (frequency.get(key) || 0) + 1);
    });
    const focus = new Set(englishWordTokens(focusText || '').map((token) => normalizeWordKey(token)).filter(Boolean));
    const cap = Math.min(48, Math.max(20, Math.round((Number(questionTotal) || 40) * 0.6)));
    const seenKeys = new Set();
    const ranked = [];
    vocabulary.words
      .map((entry) => canonicalWordEntry(entry))
      .filter((entry) => entry.meaning && !VOCAB_STOPWORDS.has(entry.key))
      .filter((entry) => String(entry.word || '').replace(/[^A-Za-z]/g, '').length >= 3)
      .forEach((entry) => {
        // 先把 crabs 归到 crab、Dynasties 归到 dynasty，再按原形去重，
        // 否则同一家族会占掉好几个词表位置。
        if (seenKeys.has(entry.key)) return;
        seenKeys.add(entry.key);
        ranked.push({ entry, rank: dictionaryFrequencyRank(entry.word) });
      });
    // 只留略高于当前年级的词。若某份卷子生词太少，就退回全部候选，
    // 以免词表空着；但通常阅读/完形会提供足够的进阶词。
    const aboveLevel = ranked
      .filter(({ entry, rank }) => entry.source === 'ai' || rank == null || rank >= minRank)
      .map(({ entry }) => entry);
    const pool = aboveLevel.length >= Math.min(12, cap) ? aboveLevel : ranked.map(({ entry }) => entry);
    const words = pool
      .sort((a, b) => {
        const advancedSuffix = /(?:tion|sion|ment|ness|ity|ous|ive|able|ible|less|ful|ence|ance|ify|ize|ise)$/i;
        const score = (entry) => {
          const word = String(entry.word || '').toLowerCase();
          const letters = word.replace(/[^a-z]/g, '').length;
          // 长词、学术后缀、文中反复出现、以及出现在题干/选项里的词优先；
          // 这样 “structure / underlined” 这类考试高频词不会被日常词挤下去。
          return letters
            + (advancedSuffix.test(word) ? 8 : 0)
            + Math.min(frequency.get(entry.key) || 1, 5) * 3
            + (focus.has(entry.key) ? 10 : 0);
        };
        return score(b) - score(a) || String(a.word).localeCompare(String(b.word));
      })
      .slice(0, cap)
      .sort((a, b) => String(a.word).localeCompare(String(b.word), 'en', { sensitivity: 'base' }));
    const phrases = vocabulary.phrases.filter((entry) => entry.meaning).slice(0, 20);
    return { words, phrases };
  }

  function paperFocusText(paper) {
    const parts = [];
    (paper.sections || []).forEach((section) => {
      section.items.forEach((item) => {
        (item.questions || []).forEach((question) => {
          parts.push(question.stem || '');
          (question.options || []).forEach((option) => parts.push(option.text || ''));
        });
      });
    });
    return parts.join('\n');
  }

  function buildPaperVocabulary(paper) {
    const sourceText = paperVocabularyText(paper);
    const vocabulary = buildVocabulary(sourceText, paper.aiVocab || []);
    const apply = (entry) => {
      const found = dictionaryLookup(entry.word);
      if (found) {
        entry.phonetic = entry.phonetic || found.kk || found.ipa || '';
        entry.meaning = entry.meaning || found.zh || '';
        entry.pos = entry.pos || found.pos || '';
      }
      if (!entry.meaning) {
        entry.meaning = PHRASE_MEANINGS[normalizeWordKey(entry.word)] || '';
        if (entry.meaning && !entry.pos) entry.pos = 'phr.';
      }
      if (!entry.phonetic && entry.word.includes(' ')) {
        entry.phonetic = phrasePhonetic(entry.word);
      }
      return entry;
    };
    vocabulary.words.forEach(apply);
    vocabulary.phrases.forEach(apply);
    return selectPaperVocabulary(
      vocabulary,
      sourceText,
      paper.questionTotal || paper.total,
      paperFocusText(paper),
      vocabularyMinRank(paper)
    );
  }

  function generatePaperFromCommand(parsed) {
    if (!state.items.length) return null;
    const sections = [];
    const warnings = [...parsed.notes];
    const usedItemIds = new Set();
    const usedMaterialIds = new Set();
    const usedItemList = [];
    const usedMaterialList = [];

    parsed.requests.forEach((request) => {
      const selection = selectItemsForRequest(request, parsed.grade, {
        level: parsed.level,
        band: parsed.band,
        usedItemIds,
        usedMaterialIds
      });
      if (selection.warning) warnings.push(selection.warning);
      if (!selection.items.length) return;
      // 同一篇阅读的 A、B 篇按篇目标签和原卷顺序排，避免 B 篇印在 A 篇前面。
      const orderedItems = request.type === 'reading'
        ? [...selection.items].sort((a, b) => {
          const letter = (item) => {
            const match = String(item.title || '').match(/·\s*([A-E])\s*篇/);
            return match ? match[1] : 'Z';
          };
          return letter(a).localeCompare(letter(b)) || (Number(a.order) || 0) - (Number(b.order) || 0);
        })
        : selection.items;
      sections.push({
        type: request.type,
        requested: request.count,
        unit: typeUnit(request.type),
        items: orderedItems.map((item) => snapshotItem(item))
      });
      orderedItems.forEach((item) => {
        usedItemIds.add(item.id);
        usedItemList.push(item.id);
        usedMaterialIds.add(item.materialId);
        usedMaterialList.push(item.materialId);
      });
    });

    if (!sections.length) return null;

    const questionTotal = assignPaperNumbers(sections);
    const totalItems = sections.reduce((sum, section) => sum + section.items.length, 0);
    const date = todayIsoDate();
    const examName = (state.settings.examTitle || DEFAULT_SETTINGS.examTitle).trim() || DEFAULT_SETTINGS.examTitle;
    const paper = {
      id: uid(),
      title: `${examName} · ${cnDateWithWeek(date)}`,
      examName,
      date,
      weekday: cnWeekday(date),
      createdAt: nowIso(),
      command: parsed.raw,
      grade: parsed.grade || bandLabel(parsed.band) || '',
      band: parsed.band || '',
      level: parsed.level || null,
      sections,
      warnings: unique(warnings),
      total: totalItems,
      questionTotal,
      itemIds: unique(usedItemList),
      materialIds: unique(usedMaterialList),
      aiAnalysis: '',
      aiVocab: []
    };
    paper.vocab = buildPaperVocabulary(paper);
    return paper;
  }

  function cnSectionNumber(index) {
    const labels = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
    return labels[index] || String(index + 1);
  }

  function cleanPaperText(text) {
    // 渲染时再清一次：旧资料里已经存进去的页眉、水印和页码也不会跟着练习印出来。
    const cleaned = cleanImportedText(text).text;
    return String(cleaned || '')
      .split('\n')
      .map((line) => stripPartHeading(line))
      .filter((line) => !isPartHeadingLine(line))
      .join('\n')
      .replace(/^[ \t]*[A-E][.、．]?[ \t]*$/gm, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
  }

  function paragraphBlocks(text) {
    const source = cleanPaperText(text);
    if (!source) return [];
    const blocks = source.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
    return blocks.map((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      const keepBreaks = lines.some((line) => /^[A-Z][A-Za-z .'-]{0,20}:\s/.test(line))
        || lines.length <= 2 && lines.every((line) => line.length < 55);
      if (keepBreaks) return lines.join('\n');
      return lines.join(' ').replace(/\s+/g, ' ').trim();
    });
  }

  function renderParagraphs(text, className = '') {
    const blocks = paragraphBlocks(text);
    if (!blocks.length) return '';
    return blocks.map((block) => `<p class="${escapeAttr(className)}">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`).join('');
  }

  function renderPassage(item, label, overrideText, allowContentFallback = true) {
    const source = overrideText != null
      ? overrideText
      : (String(item.passage || '').trim()
        ? item.passage
        : (allowContentFallback ? item.content || '' : ''));
    let text = remapNumberedBlanks(source, item.numberMap);
    if (['cloze', 'shortblank', 'five', 'grammar'].includes(item.type)) {
      text = markBareBlanks(text, item.numberMap);
    }
    const body = renderParagraphs(text, 'passage-text');
    if (!body) return '';
    const tag = label ? `<span class="passage-label">${escapeHtml(label)}</span>` : '';
    return `<div class="passage-block">${tag}<div class="passage-body">${body}</div></div>`;
  }

  function optionColumns(options) {
    const texts = options.map((option) => String(option.text || ''));
    const longest = texts.reduce((max, text) => Math.max(max, text.length), 0);
    if (options.length <= 4 && longest <= 12) return 4;
    // 三个选项的初中题很多；只要不太长就让 A/B/C 排成一行，比两列更整齐。
    if (options.length === 3 && longest <= 20) return 3;
    if (longest <= 34) return 2;
    return 1;
  }

  function renderOptionTable(options) {
    if (!options || options.length < 2) return '';
    const columns = optionColumns(options);
    const rows = [];
    for (let index = 0; index < options.length; index += columns) {
      rows.push(options.slice(index, index + columns));
    }
    const body = rows.map((row) => {
      const cells = [];
      for (let index = 0; index < columns; index += 1) {
        const option = row[index];
        const width = (100 / columns).toFixed(4);
        cells.push(option
          ? `<td style="width:${width}%"><span class="option-letter">${escapeHtml(option.letter)}.</span> ${escapeHtml(option.text)}</td>`
          : `<td style="width:${width}%"></td>`);
      }
      return `<tr>${cells.join('')}</tr>`;
    }).join('');
    return `<table class="option-table cols-${columns}" role="presentation"><tbody>${body}</tbody></table>`;
  }

  function renderQuestionBlock(question, type) {
    const number = question.paperNumber || question.number;
    const stem = normalizeStemText(question.stem || '');
    // 完形填空的小题题干为空，空格在短文里；这时只印题号和选项。
    const stemBlocks = stem ? stem.split(/\n{2,}/).filter(Boolean) : [];
    const stemHtml = stemBlocks.length
      ? stemBlocks.map((block, index) => (
        `<p class="question-stem">` +
        `${index === 0 ? `<span class="question-number">${escapeHtml(number)}.</span> ` : ''}` +
        `${escapeHtml(block).replace(/\n/g, '<br>')}</p>`
      )).join('')
      : `<p class="question-stem"><span class="question-number">${escapeHtml(number)}.</span></p>`;
    // 难度只放在答案与解析区，题面保持和正式试卷一样干净。
    // Word 对 div 的 margin 支持不稳定，题末留一个很薄的空段落，
    // 打印时就能稳定地把下一题或下一篇短文隔开。
    return `<div class="question-block">` +
      stemHtml +
      renderOptionTable(question.options || []) +
      `<p class="question-gap" aria-hidden="true">&nbsp;</p>` +
      `</div>`;
  }

  function extractChoiceBox(text) {
    const source = String(text || '').replace(/\r\n?/g, '\n');
    const marker = /(?:^|[\s\n])([A-G])[.、．)）]\s*/g;
    const markers = [];
    let match = marker.exec(source);
    while (match) {
      const start = match.index + (match[0].length - match[0].replace(/^[\s\n]+/, '').length);
      markers.push({ letter: match[1], start, contentStart: marker.lastIndex });
      match = marker.exec(source);
    }
    if (!markers.length || markers[0].letter !== 'A') return [];
    const options = [];
    for (let index = 0; index < markers.length; index += 1) {
      const item = markers[index];
      const next = markers[index + 1];
      const end = next ? next.start : source.length;
      const textValue = stripPartHeading(source.slice(item.contentStart, end).replace(/\s+/g, ' '));
      if (!textValue) continue;
      const expected = String.fromCharCode(65 + options.length);
      if (item.letter !== expected) break;
      options.push({ letter: item.letter, text: textValue });
      if (options.length === 7) break;
    }
    return options.length >= 5 ? options : [];
  }

  function stripChoiceOptions(text) {
    const source = String(text || '');
    const match = /(?:^|\n|\s)A[.、．)）]\s+/.exec(source);
    if (!match) return source.trim();
    return source.slice(0, match.index).trim();
  }

  function markBareBlanks(text, numberMap) {
    const source = String(text || '');
    if (!numberMap || !Object.keys(numberMap).length) return source;
    return source.replace(/(^|[\s(（])(\d{1,3})(?![.、．]\s*_{2,})(?=[\s.,;:!?，。；：！？)）]|$)/g, (match, prefix, value) => {
      const mapped = numberMap[value];
      return mapped ? `${prefix}__${mapped}__` : match;
    });
  }

  function renderChoiceBox(options) {
    if (!options.length) return '';
    // 用两列表格而不是 inline-block：Word 对表格的支持最稳定，
    // 五选五/七选五的 A–E 选项不会在导出后挤成一团。
    const rows = [];
    for (let index = 0; index < options.length; index += 2) {
      const left = options[index];
      const right = options[index + 1];
      rows.push('<tr>' +
        `<td>${left ? `<span class="option-letter">${escapeHtml(left.letter)}.</span> ${escapeHtml(left.text)}` : ''}</td>` +
        `<td>${right ? `<span class="option-letter">${escapeHtml(right.letter)}.</span> ${escapeHtml(right.text)}` : ''}</td>` +
        '</tr>');
    }
    return `<table class="choice-box" role="presentation"><tbody>${rows.join('')}</tbody></table>`;
  }

  function paperSectionLabel(section) {
    const type = normalizeType(section.type);
    const def = TYPES[type] || TYPES.other;
    if (type === 'grammar') {
      // “语法填空”是一大类，卷面上的实际叫法要跟着来源走：完成句子、
      // 选词填空、首字母填空各有各的作答方式，标题写错会误导学生。
      const source = section.items
        .map((item) => `${item.title || ''} ${item.content || ''}`)
        .join(' ');
      if (/完成句子/.test(source)) return '完成句子';
      if (/选词填空/.test(source)) return '选词填空';
      if (/首字母(?:填空|提示)/.test(source)) return '首字母填空';
      return '语法填空';
    }
    if (type !== 'five') return def.label;
    const source = section.items
      .map((item) => `${item.title || ''} ${item.content || ''}`)
      .join(' ');
    // 福建、江苏等地“五选五”和“七选五”是不同题型，试卷上要写来源卷的说法。
    if (/七选五|七个选项|A[—–-]G|A、B、C、D、E、F、G/.test(source)) return '七选五';
    if (/五选五|五个选项|A[—–-]E|A、B、C、D、E/.test(source)) return '五选五';
    return '阅读填句';
  }

  function sectionNoteFor(section) {
    const type = normalizeType(section.type);
    if (type === 'grammar') {
      const label = paperSectionLabel(section);
      if (label === '完成句子') return '根据语境或括号内提示，补全下列句子。';
      if (label === '选词填空') return '从方框中选择恰当的单词，并用其正确形式填空。';
      if (label === '首字母填空') return '根据首字母提示和语境，在空白处填入恰当的单词。';
      return '阅读下面短文，在空白处填入 1 个适当的单词或括号内单词的正确形式。';
    }
    return SECTION_NOTES[type] || '';
  }

  function sectionQuestionCount(section) {
    let count = 0;
    section.items.forEach((item) => {
      const numbered = (item.questions || []).filter((question) => question.paperNumber);
      const mapped = item.numberMap ? Object.keys(item.numberMap).length : 0;
      if (mapped || numbered.length) {
        // 五选五等题型常只解析出一个占位小题，真正的小题数以编号映射为准。
        count += Math.max(mapped, numbered.length);
      } else if (section.type === 'writing') {
        count += 1;
      } else if (['grammar', 'shortblank', 'cloze', 'five'].includes(section.type)) {
        count += collectBlankNumbers(item.content || '').length || 1;
      } else {
        count += section.items.length ? 1 : 0;
      }
    });
    return count;
  }

  function passageLabelFor(item, index) {
    const match = String(item.title || '').match(/([A-E])\s*篇/);
    if (match) return match[1];
    return String.fromCharCode(65 + (index % 5));
  }

  function renderPaperItem(item, section, index) {
    if (section.type === 'writing') {
      const writingQuestion = (item.questions || [])[0];
      const paperNumber = (writingQuestion && writingQuestion.paperNumber) || item.writingNumber;
      // 书面表达的提示语里通常带原卷题号，这里改成当前练习卷的连续题号。
      const promptText = paperNumber
        ? String(cleanPaperText(item.content || '')).replace(/^\s*\d{1,3}\s*[.、．)）]\s*/, `${paperNumber}. `)
        : cleanPaperText(item.content || '');
      return `<div class="writing-block">${renderParagraphs(promptText, 'writing-prompt')}` +
        `<div class="writing-lines" aria-hidden="true">${'<p class="writing-line">&nbsp;</p>'.repeat(12)}</div></div>`;
    }

    const label = section.type === 'reading' ? passageLabelFor(item, index) : '';
    const standalone = item.kind === 'question' && !String(item.passage || '').trim();
    const isFiveSet = section.type === 'five' && !standalone;
    const passageText = isFiveSet ? stripChoiceOptions(item.passage || item.content) : '';
    // 语法填空的小题是一条条带编号的句子，已经由 question 区块逐题渲染；
    // 若 passage 为空又回退到 content，就会把整组题再印一遍。
    const hasParsedQuestions = (item.questions || []).some((question) => question.paperNumber || question.stem || (question.options || []).length);
    const passage = standalone ? '' : renderPassage(item, label, isFiveSet ? passageText : null, !hasParsedQuestions);
    const questions = (item.questions || []).filter((question) => question.paperNumber || question.stem || question.options.length);
    // 五选五的选项整块印刷在语篇之后，小题号已嵌在文中，不再重复渲染成单题。
    const choiceBox = isFiveSet ? renderChoiceBox(extractChoiceBox(item.content)) : '';
    const questionHtml = isFiveSet ? '' : questions.map((question) => renderQuestionBlock(question, section.type)).join('');
    if (!passage && !questionHtml) {
      return `<div class="question-block">${renderParagraphs(item.content)}</div>`;
    }
    return passage + choiceBox + questionHtml;
  }

  /* ---------------------------- 答案与解析 ---------------------------- */

  function optionByLetter(question, letter) {
    const key = String(letter || '').trim().toUpperCase();
    if (!key) return '';
    const option = (question && question.options || []).find((item) => String(item.letter || '').toUpperCase() === key);
    return option ? String(option.text || '').trim() : '';
  }

  function evidenceForQuestion(item, question) {
    const passage = String(item && (item.passage || item.content) || '');
    if (!passage) return '';
    const stop = new Set(['about', 'after', 'before', 'because', 'could', 'does', 'from', 'have', 'into', 'most', 'other', 'passage', 'should', 'their', 'there', 'these', 'they', 'this', 'those', 'what', 'when', 'where', 'which', 'while', 'with', 'would', 'writer', 'according']);
    const keywords = unique(englishWordTokens(String(question && question.stem || ''))
      .map((word) => word.toLowerCase())
      .filter((word) => word.length >= 4 && !stop.has(word)));
    if (!keywords.length) return '';
    const cleanPassage = passage
      .replace(/_{2,}\s*\d{1,3}\s*_{2,}/g, ' ')
      .replace(/\(\s*\d{1,3}\s*\)\s*_{1,}/g, ' ');
    const sentences = splitSentences(cleanPassage);
    let best = '';
    let bestScore = 0;
    sentences.forEach((sentence) => {
      const lower = sentence.toLowerCase();
      const score = keywords.reduce((sum, word) => sum + (lower.includes(word) ? 1 : 0), 0);
      if (score > bestScore) {
        bestScore = score;
        best = sentence.trim();
      }
    });
    if (bestScore < 1 || best.length < 12) return '';
    return best.replace(/\s+/g, ' ').slice(0, 220);
  }

  function blankSentence(content, number) {
    const source = String(content || '').replace(/\r\n?/g, '\n');
    if (!number) return '';
    const patterns = [
      new RegExp(`_{2,}\\s*${number}\\s*_{2,}`),
      new RegExp(`\\(\\s*${number}\\s*\\)\\s*_{1,}`),
      new RegExp(`（\\s*${number}\\s*）\\s*_{1,}`),
      new RegExp(`(?:^|\\n)\\s*${number}\\s*[.、．]\\s*_{2,}`),
      new RegExp(`(?:^|[^0-9])${number}(?=\\s*[.、．]\\s*_{2,})`)
    ];
    let index = -1;
    for (const pattern of patterns) {
      const match = pattern.exec(source);
      if (match) {
        index = match.index + (/^\d/.test(match[0]) ? 0 : 1);
        break;
      }
    }
    if (index < 0) return '';
    let start = 0;
    for (let cursor = index; cursor >= 0; cursor -= 1) {
      if (/[.!?]\s/.test(source.slice(cursor, cursor + 2)) || source[cursor] === '\n') {
        start = cursor + 1;
        break;
      }
    }
    let end = source.length;
    const tailStart = Math.min(source.length, index + String(number).length + 2);
    const tail = source.slice(tailStart).search(/[.!?](?:\s|$)/);
    if (tail >= 0) end = tailStart + tail + 1;
    return source.slice(start, end).replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  function tenseClue(sentence) {
    const text = String(sentence || '').toLowerCase();
    if (/\b(last\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday|week|month|year|night)|yesterday|ago|in\s+(?:19|20)\d{2})\b/.test(text)) {
      return '句中有过去时间状语，谓语用一般过去时。';
    }
    if (/\b(tomorrow|next\s+(?:week|month|year|sunday|monday|tuesday|wednesday|thursday|friday|saturday))\b/.test(text)) {
      return '句中有将来时间状语，谓语用一般将来时（will do / be going to do）。';
    }
    if (/\b(since|for\s+(?:\d+|several|many)\s+(?:years?|months?|days?))\b/.test(text)) {
      return '句中有 since 或 for + 时间段，考虑现在完成时。';
    }
    if (/\b(every\s+(?:day|week|year)|usually|often|always|sometimes|never)\b/.test(text)) {
      return '句中有频率副词或习惯性时间表达，谓语通常用一般现在时，注意第三人称单数。';
    }
    if (/\b(now|look|listen|at the moment)\b/.test(text)) {
      return '句中有 now、look、listen 等标志，考虑现在进行时（be + doing）。';
    }
    return '';
  }

  function grammarClue(question, answer) {
    const stem = String(question && question.stem || '').toLowerCase();
    const correct = optionByLetter(question, answer).toLowerCase();
    const clues = [];
    if (/\bsince\b|\bfor\s+(?:\d+|several|many)\s+(?:years?|months?|days?|hours?)\b/.test(stem)) {
      clues.push('句中出现 since 或 for + 时间段，主句用现在完成时（have/has + 过去分词），动作从过去持续到现在。');
    }
    if (/\bif\b/.test(stem) && /(tomorrow|next|will|主将从现)/.test(stem)) {
      clues.push('if 引导条件状语从句时遵循“主将从现”：从句用一般现在时，主句用一般将来时。');
    }
    if (/interested/.test(stem)) {
      clues.push('be interested in 是固定搭配，in 后接名词、代词或动名词。');
    }
    if (/how often/.test(stem)) {
      clues.push('how often 询问频率，答语用 once、twice、three times a week 等频率表达。');
    }
    if (/(could|can|would)\s+you\s+tell\s+me|do\s+you\s+know|i wonder/.test(stem)) {
      clues.push('宾语从句和“Could you tell me...”后的从句必须用陈述语序，即“疑问词 + 主语 + 谓语”。');
    }
    if (/\bthan\b/.test(stem)) {
      clues.push('看到 than 先考虑比较级；比较对象要一致，much、even、a little 等可修饰比较级。');
    }
    if (/\b(by the time|had)\b/.test(stem)) {
      clues.push('by the time 等过去时间标志通常对应过去完成时（had + 过去分词），表示“过去的过去”。');
    }
    if (/\b(?:is|are|was|were|be|been|being)\s+\w+(?:ed|en)\b/.test(stem) && /\bby\b/.test(stem)) {
      clues.push('主语是动作承受者、句末有 by 短语时，考虑被动语态：be + 过去分词。');
    }
    if (correct && /^to\s+[a-z]/.test(correct)) {
      clues.push(`选项中的“${correct}”为不定式形式，注意判断空格处是否需要 to do 作宾语、目的状语或补语。`);
    } else if (correct && /ing$/.test(correct)) {
      clues.push(`选项中的“${correct}”为动名词/现在分词形式，注意空格前是否有介词，或该动作是否与主语构成主动、进行关系。`);
    } else if (correct && /ed$/.test(correct)) {
      clues.push(`选项中的“${correct}”为过去式/过去分词形式，先看时间状语判断时态，再看主语与动作是主动还是被动关系。`);
    }
    return clues.slice(0, 2).join(' ');
  }

  function localExplanation(input, type, itemArg, answerArg) {
    const entry = input && input.type ? input : null;
    const question = entry ? (entry.question || {}) : (input || {});
    const sectionType = type || (entry && entry.type) || '';
    const item = itemArg || (entry && entry.item) || null;
    const answer = answerArg || (entry && entry.answer) || '';
    const skill = question.skill || (entry && entry.skill) || inferSkill(question.stem || '', sectionType);
    const hints = {
      detail: '先圈定题干中的人名、时间、地点、数据等定位词，回到原文对应句。正确项通常是原文的同义改写；干扰项常在对象、范围或程度上偷换。',
      inference: '推理题不能直接选原文原句，要依据文中的事实、态度或因果关系作一步推断。语气绝对、缺少原文支撑的选项先排除。',
      main: '主旨题看首尾段、段首句和反复出现的关键词。正确项应覆盖全文，而不是只概括某一段。',
      title: '标题要同时覆盖全文对象和作者态度，既不能过宽，也不能只落在某个细节上。',
      meaning: '把划线词放回原句，利用并列、转折、举例、因果等上下文线索判断；逐一代入选项，保证句意和逻辑都通顺。',
      reference: '指代题向前找最近且单复数、逻辑一致的先行词，再把候选词代回原句检验。',
      structure: '先看每段首句，判断文章是按时间、因果、对比还是总分结构展开，再对照选项。',
      attitude: '态度题抓评价性形容词、副词和转折词。区分客观陈述与作者明确赞同或反对的态度。',
      cohesion: '先判断空格前后句的逻辑关系（并列、转折、因果、递进、举例），再从选项中找衔接词和语义都吻合的一项。',
      grammar: '先判断空格在句中的成分，再根据时态、语态、主谓一致、非谓语或词性转换确定形式。',
      vocabulary: '把选项逐一代入原句，结合固定搭配、语境褒贬和逻辑关系排除；注意熟词生义。',
      writing: '先审题，确定文体、人称、时态和要点；再按“开头—主体—结尾”分段，尽量使用熟悉且准确的句式。',
      listening: '听前快速浏览题干，预测场景和关键词；听时抓数字、转折和否定信息。',
      general: '先定位题干关键词，再结合上下文和选项差异逐项排除。'
    };
    const parts = [hints[skill] || hints.general];
    if (sectionType === 'single' || sectionType === 'grammar' || sectionType === 'shortblank') {
      const clue = grammarClue(question, answer);
      if (clue) parts.push(clue);
    }
    if (['grammar', 'shortblank'].includes(sectionType) && item) {
      const sentence = blankSentence(item.content, entry && entry.sourceNumber);
      if (sentence) {
        const displaySentence = remapNumberedBlanks(sentence, item.numberMap || {});
        parts.push(`所在句：“${displaySentence}”`);
        const clue = tenseClue(sentence);
        if (clue) parts.push(clue);
      }
    }
    if (['reading', 'five', 'cloze'].includes(sectionType)) {
      const evidence = evidenceForQuestion(item, question);
      if (evidence) parts.push(`原文依据：“${evidence}”`);
    }
    if (!String(answer || '').trim() && ['grammar', 'shortblank', 'cloze'].includes(sectionType)) {
      parts.unshift('原资料未附本题答案，以下为作答思路。');
    }
    return parts.filter(Boolean).join(' ');
  }

  function answerEntriesForPaper(paper) {
    const entries = [];
    const byKey = new Map();
    const add = (entry) => {
      const key = entry.number ? String(entry.number) : `writing-${entry.item && entry.item.id}`;
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.answer && entry.answer) existing.answer = entry.answer;
        if (!existing.explanation && entry.explanation) existing.explanation = entry.explanation;
        if (!existing.skill && entry.skill) existing.skill = entry.skill;
        return;
      }
      byKey.set(key, entry);
      entries.push(entry);
    };
    (paper.sections || []).forEach((section) => {
      section.items.forEach((item) => {
        (item.questions || []).forEach((question) => {
          if (!question.paperNumber) return;
          // 书面表达只保留下面那条带“参考范文 / 写作提示”的条目，避免同一题出现两次。
          if (section.type === 'writing') return;
          add({
            number: question.paperNumber,
            answer: question.answer || (item.questions.length === 1 ? item.answer : '') || '',
            explanation: question.explanation || (item.questions.length === 1 ? item.explanation : '') || '',
            skill: question.skill || item.skill || '',
            difficulty: question.difficulty || item.paperDifficulty,
            type: section.type,
            item,
            question
          });
        });
        Object.entries(item.numberMap || {}).forEach(([sourceNumber, number]) => {
          if (!number) return;
          const value = item.blankAnswers ? item.blankAnswers[sourceNumber] : null;
          add({
            number,
            sourceNumber: Number(sourceNumber),
            answer: value ? value.answer || '' : '',
            explanation: value ? value.explanation || '' : '',
            skill: inferSkill('', section.type),
            difficulty: (item.blankDifficulties && item.blankDifficulties[sourceNumber]) || item.paperDifficulty,
            type: section.type,
            item,
            question: null
          });
        });
        if (section.type === 'writing') {
          const writingQuestion = (item.questions || [])[0];
          add({
            number: (writingQuestion && writingQuestion.paperNumber) || item.writingNumber || '',
            answer: item.answer || (writingQuestion && writingQuestion.answer) || '',
            explanation: item.explanation || (writingQuestion && writingQuestion.explanation) || '',
            skill: 'writing',
            difficulty: item.paperDifficulty,
            type: section.type,
            item,
            question: null
          });
        }
      });
    });
    return entries;
  }

  function answerDisplay(entry) {
    if (entry.type === 'writing') return entry.answer || '见写作提示';
    return entry.answer || '—';
  }

  function renderAnswerEntry(entry) {
    const answer = answerDisplay(entry);
    const skill = skillLabel(entry.skill || inferSkill('', entry.type));
    const difficulty = entry.difficulty ? `难度 ${entry.difficulty}/10 ${starsForLevel(entry.difficulty)}` : '';
    const meta = [skill, difficulty].filter(Boolean).join(' · ');
    const hint = entry.explanation || localExplanation(entry);
    const formattedHint = escapeHtml(hint).replace(/\r?\n/g, '<br>');
    const answerLine = entry.type === 'writing'
      ? `<p class="answer-text"><strong>参考范文 / 写作提示：</strong>${escapeHtml(answer)}</p>`
      : `<p class="answer-text"><strong>答案：</strong><span class="answer-letter${answer === '—' ? ' is-missing' : ''}">${escapeHtml(answer)}</span><span class="answer-meta">${meta ? ' · ' : ''}${escapeHtml(meta)}</span></p>`;
    return `<div class="answer-item">` +
      `<div class="answer-number">${entry.number ? escapeHtml(entry.number) + '.' : '写作'}</div>` +
      `<div class="answer-content">${answerLine}` +
      `<p class="answer-explain"><span class="answer-tag">【解析】</span>${formattedHint}</p>` +
      `</div></div>`;
  }

  function sectionVocabulary(section) {
    const text = section.items.map((item) => `${item.passage || ''} ${item.content || ''}`).join('\n');
    const vocabulary = buildVocabulary(text, []);
    const apply = (entry) => {
      const found = dictionaryLookup(entry.word);
      if (found) {
        entry.phonetic = entry.phonetic || found.kk || found.ipa || '';
        entry.meaning = entry.meaning || found.zh || '';
        entry.pos = entry.pos || found.pos || '';
      }
      return entry;
    };
    vocabulary.words.forEach(apply);
    return vocabulary.words
      .filter((entry) => entry.meaning && entry.word.length >= 4)
      .sort((a, b) => b.word.length - a.word.length)
      .slice(0, 5);
  }

  function buildAnswerSection(paper) {
    if (!state.settings.includeAnswers) return '';
    const entries = answerEntriesForPaper(paper);
    if (!entries.length && !paper.aiAnalysis) return '';
    const quick = entries
      .filter((entry) => entry.number)
      .map((entry) => `<span class="quick-answer"><em>${escapeHtml(entry.number)}.</em> ${escapeHtml(answerDisplay(entry))}</span>`)
      .join('');
    const detail = (paper.sections || []).map((section, index) => {
      const sectionEntries = entries.filter((entry) => section.items.includes(entry.item));
      if (!sectionEntries.length) return '';
      const vocab = sectionVocabulary(section);
      const vocabHtml = vocab.length
        ? `<div class="section-vocab"><strong>【词汇积累】</strong> ` + vocab.map((entry) => (
          `<span>${escapeHtml(entry.word)}${entry.phonetic ? ` <i>${escapeHtml(entry.phonetic)}</i>` : ''}${entry.meaning ? ` ${escapeHtml(entry.meaning)}` : ''}</span>`
        )).join('；') + `</div>`
        : '';
      return `<div class="answer-group">` +
        `<h3>${cnSectionNumber(index)}、${escapeHtml(paperSectionLabel(section))}</h3>` +
        sectionEntries.map(renderAnswerEntry).join('') +
        vocabHtml +
        `</div>`;
    }).join('');
    const aiHtml = paper.aiAnalysis
      ? `<div class="ai-analysis"><div class="ai-analysis-head">豆包 AI 详解</div><pre>${escapeHtml(paper.aiAnalysis)}</pre></div>`
      : '';
    return `<section class="exam-section answer-section page-break">` +
      `<h2 class="answer-title"><span>参考答案与解析</span><em>Answers &amp; Explanations</em></h2>` +
      `<p class="answer-note">答案优先取自上传资料；未附答案的题号以「—」标注，并给出本地作答思路。可在教师工作台用「豆包解析」补齐语篇导读、逐题证据、干扰项分析和长难句讲解。</p>` +
      `<div class="quick-answers">${quick || '<span>本卷暂无已收录的客观题答案。</span>'}</div>` +
      aiHtml +
      detail +
      `<p class="answer-footer">${escapeHtml(watermarkText())}</p>` +
      `</section>`;
  }

  /* ---------------------------- 词汇与默写 ---------------------------- */

  function vocabularyRows(entries) {
    return entries.map((entry) => {
      const meaning = [entry.pos, entry.meaning].filter(Boolean).join(' ');
      return `<tr><td class="word-cell">${escapeHtml(entry.word)}</td>` +
        `<td class="phonetic-cell">${escapeHtml(entry.phonetic || '—')}</td>` +
        `<td>${escapeHtml(meaning || '—')}</td></tr>`;
    }).join('');
  }

  function buildVocabularySection(paper) {
    if (!state.settings.includeVocab) return '';
    const vocab = paper.vocab || { words: [], phrases: [] };
    if (!vocab.words.length && !vocab.phrases.length) return '';
    const wordTable = vocab.words.length
      ? `<table class="vocab-table"><thead><tr><th>英文</th><th>KK 音标</th><th>中文</th></tr></thead><tbody>${vocabularyRows(vocab.words)}</tbody></table>`
      : '';
    const phraseTable = vocab.phrases.length
      ? `<h3 class="vocab-subtitle">短语与固定搭配</h3><table class="vocab-table"><thead><tr><th>英文</th><th>KK 音标</th><th>中文</th></tr></thead><tbody>${vocabularyRows(vocab.phrases)}</tbody></table>`
      : '';
    return `<section class="exam-section vocab-section page-break">` +
      `<h2 class="answer-title"><span>词汇背诵表</span><em>Vocabulary List</em></h2>` +
      `<p class="answer-note">按在练习中出现的顺序收录。音标为美式 KK（由 CMU 发音词典转换），本地词库未收录的词显示「—」。中文先给常用义；需要本篇语境义、词性和更精确音标时，可用「豆包词表」补全。</p>` +
      wordTable + phraseTable +
      `</section>`;
  }

  function dictationTable(entries, mode) {
    if (!entries.length) return '';
    const rows = [];
    for (let index = 0; index < entries.length; index += 2) {
      const left = entries[index];
      const right = entries[index + 1];
      const prompt = (entry) => {
        if (!entry) return '<td></td><td></td>';
        if (mode === 'en') return `<td class="dictation-word">${escapeHtml(entry.word)}</td><td class="dictation-blank"></td>`;
        const meaning = [entry.pos, entry.meaning].filter(Boolean).join(' ') || entry.word;
        return `<td class="dictation-word">${escapeHtml(meaning)}</td><td class="dictation-blank"></td>`;
      };
      rows.push(`<tr>${prompt(left)}${prompt(right)}</tr>`);
    }
    return `<table class="dictation-table"><thead><tr><th>参考词</th><th>默写</th><th>参考词</th><th>默写</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }

  function buildDictationSection(paper) {
    if (!state.settings.includeDictation) return '';
    const vocab = paper.vocab || { words: [], phrases: [] };
    if (!vocab.words.length && !vocab.phrases.length) return '';
    const wordEn = dictationTable(vocab.words, 'en');
    const phraseEn = dictationTable(vocab.phrases, 'en');
    const wordZh = dictationTable(vocab.words.filter((entry) => entry.meaning), 'zh');
    const phraseZh = dictationTable(vocab.phrases.filter((entry) => entry.meaning), 'zh');
    const block = (title, note, table) => table
      ? `<div class="dictation-block"><h3>${escapeHtml(title)}</h3><p class="dictation-note">${escapeHtml(note)}</p>${table}</div>`
      : '';
    return `<section class="exam-section dictation-section page-break">` +
      `<h2 class="answer-title"><span>默写表</span><em>Dictation</em></h2>` +
      `<p class="answer-note">每行两组，左侧为参考词，右侧空白栏供默写。建议先遮盖参考词，再逐行完成。</p>` +
      `<h2 class="dictation-part">一、英译英</h2>` +
      block('（一）单个词汇', '看英文，默写英文。', wordEn) +
      block('（二）短语词组', '看英文，默写英文。', phraseEn) +
      `<h2 class="dictation-part">二、英译中</h2>` +
      block('（一）单个词汇', '看中文，默写英文单词。', wordZh) +
      block('（二）短语词组', '看中文，默写英文短语。', phraseZh) +
      `</section>`;
  }

  /* ------------------------------- 试卷 ------------------------------- */

  function buildPaperBody(paper) {
    const sections = (paper.sections || []).map((section, index) => {
      const count = sectionQuestionCount(section);
      const countText = section.type === 'writing' ? '共 1 篇' : `共 ${count} 小题`;
      const note = sectionNoteFor(section);
      const items = section.items.map((item, itemIndex) => renderPaperItem(item, section, itemIndex)).join('');
      return `<section class="exam-section">` +
        `<div class="section-heading">` +
        `<h2><span class="section-index">${cnSectionNumber(index)}、</span>${escapeHtml(paperSectionLabel(section))}` +
        `<em>（${countText}）</em></h2></div>` +
        (note ? `<p class="section-note">${escapeHtml(note)}</p>` : '') +
        items +
        `</section>`;
    }).join('');

    const dateText = paper.date ? cnDateWithWeek(paper.date) : cnDateWithWeek(todayIsoDate());
    const examName = paper.examName || state.settings.examTitle || '英语每日练习';
    const grade = paper.grade ? `${escapeHtml(paper.grade)} · ` : '';
    const levelText = paper.level
      ? ` · 目标难度 ${escapeHtml(paper.level.min)}–${escapeHtml(paper.level.max)} 级`
      : '';
    const questionTotal = paper.questionTotal || paper.total || 0;
    return watermarkLayerHtml('watermark-layer') +
      `<header class="exam-head">` +
      `<p class="exam-owner">${escapeHtml(state.settings.examOwner || BRAND_NAME)} · ${escapeHtml(BRAND_TAGLINE)}</p>` +
      `<h1><span class="exam-date">${escapeHtml(dateText)}</span> <span class="exam-name">${escapeHtml(examName)}</span></h1>` +
      `<p class="exam-sub">${grade}共 ${escapeHtml(questionTotal)} 小题${levelText}　·　建议用时 ______ 分钟</p>` +
      `<table class="exam-fields" role="presentation"><tbody><tr>` +
      `<td>姓名：<i></i></td><td>班级：<i></i></td><td>得分：<i></i></td>` +
      `</tr></tbody></table>` +
      `</header>` +
      sections +
      buildAnswerSection(paper) +
      buildVocabularySection(paper) +
      buildDictationSection(paper) +
      `<footer class="paper-foot">${escapeHtml(watermarkText())}</footer>`;
  }

  function paperStyles() {
    return `
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body {
        color: #111;
        background: #eceff2;
        font-family: Arial, "SimHei", "Microsoft YaHei", "Heiti SC", sans-serif;
        font-size: 10.5pt;
        line-height: 1.75;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .sheet {
        position: relative;
        overflow: hidden;
        width: 210mm;
        max-width: 100%;
        min-height: 297mm;
        margin: 18px auto;
        padding: 16mm 15mm 18mm;
        background: #fff;
        box-shadow: 0 14px 40px -26px rgba(0, 0, 0, 0.55);
      }
      .watermark-layer {
        position: absolute; inset: 0; z-index: 0;
        display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: 42mm;
        gap: 2mm; overflow: hidden; pointer-events: none;
      }
      .watermark-layer span {
        align-self: center; justify-self: center;
        color: rgba(17, 17, 17, 0.055);
        font-family: "SimHei", "Microsoft YaHei", sans-serif;
        font-size: 8pt; line-height: 1; white-space: nowrap; transform: rotate(-28deg);
      }
      .sheet > *:not(.watermark-layer) { position: relative; z-index: 1; }

      .exam-head { padding-bottom: 10px; border-bottom: 2.5px double #111; text-align: center; }
      .exam-owner { margin: 0 0 2px; color: #444; font-size: 9pt; letter-spacing: 0.14em; }
      .exam-head h1 { margin: 0; color: #111; font-family: "SimHei", "Microsoft YaHei", Arial, sans-serif; font-size: 20pt; line-height: 1.35; letter-spacing: 0.02em; }
      .exam-date { display: block; margin-bottom: 1px; color: #333; font-size: 10pt; font-weight: 400; letter-spacing: 0.1em; }
      .exam-name { display: block; margin-left: 0; font-size: 20pt; }
      .exam-sub { margin: 5px 0 0; color: #333; font-size: 9.5pt; }
      .exam-fields { width: 100%; margin: 9px auto 0; border-collapse: collapse; table-layout: fixed; font-size: 10pt; }
      .exam-fields td { padding: 0 2mm; text-align: center; white-space: nowrap; }
      .exam-fields i { display: inline-block; width: 28mm; border-bottom: 1px solid #111; height: 1.1em; }

      .exam-section { margin-top: 28px; }
      .exam-section + .exam-section { margin-top: 32px; }
      .section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding-bottom: 6px; border-bottom: 1.5px solid #111; }
      .section-heading h2 { margin: 0; color: #111; font-family: "SimHei", "Microsoft YaHei", Arial, sans-serif; font-size: 12.5pt; line-height: 1.5; }
      .section-heading h2 em { font-style: normal; font-weight: 400; font-size: 9.5pt; }
      .section-index { display: inline-block; margin-right: 6px; }
      .section-note { margin: 7px 0 0; color: #333; font-size: 9pt; line-height: 1.75; }

      .passage-block { position: relative; margin-top: 15px; }
      .passage-label { float: left; width: 18px; margin-left: -18px; color: #111; font-weight: 700; }
      .passage-body { margin-left: 0; }
      .passage-body p { margin: 0 0 7px; line-height: 1.85; text-align: justify; text-justify: inter-word; }
      .passage-body p:last-child { margin-bottom: 0; }

      .question-block { margin-top: 16px; padding-bottom: 2px; break-inside: avoid; page-break-inside: avoid; }
      .passage-block + .question-block { margin-top: 13px; }
      .question-stem { margin: 0; line-height: 1.8; text-align: left; }
      .question-number { font-weight: 700; }
      .question-gap { margin: 0; height: 4px; font-size: 4pt; line-height: 4pt; }
      .blank-line { display: inline-block; min-width: 55mm; border-bottom: 1px solid #111; height: 1em; }
      .option-table { width: 100%; margin: 4px 0 0 0; border-collapse: collapse; table-layout: fixed; }
      .option-table td { padding: 2px 14px 2px 0; vertical-align: top; line-height: 1.7; word-break: break-word; }
      .option-table.cols-1 td { width: 100%; }
      .option-table.cols-2 td { width: 50%; }
      .option-table.cols-3 td { width: 33.333%; }
      .option-table.cols-4 td { width: 25%; }
      .option-letter { font-weight: 700; }

      .choice-box { width: 100%; margin: 15px 0 4px; border-collapse: collapse; table-layout: fixed; border: 1px solid #111; }
      .choice-box td { width: 50%; padding: 5px 10px; vertical-align: top; line-height: 1.65; word-break: break-word; }

      .writing-block { margin-top: 15px; break-inside: avoid; page-break-inside: avoid; }
      .writing-prompt { margin: 0; line-height: 1.85; }
      .writing-lines { margin-top: 10px; }
      .writing-line { margin: 0; height: 27px; border-bottom: 1px solid #b9b9b9; font-size: 10pt; line-height: 27px; }

      .answer-section, .vocab-section, .dictation-section { margin-top: 28px; }
      .page-break { break-before: page; page-break-before: always; }
      .answer-title { display: flex; align-items: baseline; gap: 8px; margin: 0 0 6px; padding-bottom: 5px; border-bottom: 2px solid #111; font-family: "SimHei", "Microsoft YaHei", Arial, sans-serif; font-size: 14pt; }
      .answer-title em { color: #555; font-family: Arial, sans-serif; font-size: 8.5pt; font-style: normal; font-weight: 400; letter-spacing: 0.08em; }
      .answer-note { margin: 0 0 8px; color: #555; font-size: 8.5pt; line-height: 1.6; }
      .quick-answers { display: flex; flex-wrap: wrap; gap: 3px 14px; padding: 7px 9px; border: 1px solid #bbb; background: #f7f7f7; font-size: 9.5pt; }
      .quick-answer em { font-style: normal; color: #555; }
      .answer-group { margin-top: 13px; }
      .answer-group h3 { margin: 0 0 5px; font-family: "SimHei", "Microsoft YaHei", Arial, sans-serif; font-size: 11pt; }
      .answer-item { display: flex; gap: 8px; padding: 8px 0 8px; border-top: 1px dashed #d2d2d2; break-inside: avoid; page-break-inside: avoid; }
      .answer-number { flex: 0 0 22px; color: #111; font-weight: 700; text-align: right; }
      .answer-content { flex: 1 1 auto; min-width: 0; }
      .answer-text { margin: 0; }
      .answer-letter { font-weight: 700; }
      .answer-letter.is-missing { color: #777; font-weight: 400; }
      .answer-meta { margin-left: 2px; color: #666; font-size: 8.5pt; }
      .answer-explain { margin: 2px 0 0; color: #222; font-size: 9.5pt; text-align: justify; }
      .answer-tag { font-weight: 700; }
      .section-vocab { margin: 6px 0 0; padding: 5px 8px; border-left: 3px solid #999; background: #f8f8f8; font-size: 8.8pt; }
      .section-vocab span { margin-right: 8px; white-space: nowrap; }
      .section-vocab i { color: #555; font-style: normal; }
      .ai-analysis { margin: 10px 0 0; padding: 8px 10px; border: 1px solid #bbb; background: #fafafa; }
      .ai-analysis-head { margin-bottom: 4px; font-weight: 700; }
      .ai-analysis pre { margin: 0; font-family: Arial, "SimHei", "Microsoft YaHei", sans-serif; font-size: 9pt; line-height: 1.7; white-space: pre-wrap; word-break: break-word; }
      .answer-footer { margin-top: 14px; color: #777; font-size: 8pt; text-align: center; }

      .vocab-table, .dictation-table { width: 100%; margin-top: 8px; border-collapse: collapse; table-layout: fixed; }
      .vocab-table th, .vocab-table td, .dictation-table th, .dictation-table td { padding: 4px 5px; border: 1px solid #888; vertical-align: top; word-break: break-word; }
      .vocab-table th, .dictation-table th { background: #f2f2f2; font-weight: 700; text-align: left; }
      .vocab-table th:nth-child(1), .vocab-table td:nth-child(1) { width: 30%; }
      .vocab-table th:nth-child(2), .vocab-table td:nth-child(2) { width: 28%; }
      .vocab-table th:nth-child(3), .vocab-table td:nth-child(3) { width: 42%; }
      .word-cell { font-family: Arial, sans-serif; }
      .phonetic-cell { font-family: Arial, "SimHei", sans-serif; color: #333; }
      .vocab-subtitle { margin: 12px 0 0; font-family: "SimHei", "Microsoft YaHei", Arial, sans-serif; font-size: 10.5pt; }
      .dictation-part { margin: 12px 0 0; font-family: "SimHei", "Microsoft YaHei", Arial, sans-serif; font-size: 12pt; }
      .dictation-block { margin-top: 8px; break-inside: auto; }
      .dictation-block h3 { margin: 0; font-size: 10pt; }
      .dictation-note { margin: 1px 0 4px; color: #555; font-size: 8.5pt; }
      .dictation-table th:nth-child(1), .dictation-table td:nth-child(1),
      .dictation-table th:nth-child(3), .dictation-table td:nth-child(3) { width: 24%; }
      .dictation-table th:nth-child(2), .dictation-table td:nth-child(2),
      .dictation-table th:nth-child(4), .dictation-table td:nth-child(4) { width: 26%; }
      .dictation-word { font-weight: 400; }
      .dictation-blank { height: 24px; }

      .paper-foot { margin-top: 18px; padding-top: 6px; border-top: 1px solid #bbb; color: #777; font-size: 8pt; text-align: center; }

      @media (max-width: 720px) {
        body { font-size: 10pt; line-height: 1.8; }
        .sheet { width: 100%; min-height: 0; margin: 0; padding: 20px 14px 28px; box-shadow: none; }
        .exam-section { margin-top: 24px; }
        .exam-section + .exam-section { margin-top: 28px; }
        .section-heading { padding-bottom: 5px; }
        .section-note { line-height: 1.7; }
        .passage-block { margin-top: 13px; }
        .passage-body p { margin-bottom: 6px; line-height: 1.8; }
        .question-block { margin-top: 14px; }
        .question-stem { line-height: 1.75; }
        .option-table { margin-top: 3px; }
        .option-table td { padding: 2px 6px 2px 0; line-height: 1.65; }
        .choice-box { margin-top: 13px; }
        .choice-box td { padding: 4px 6px; }
        .exam-head h1 { font-size: 15.5pt; }
        .exam-date { display: block; margin-bottom: 1px; font-size: 10pt; letter-spacing: 0.04em; }
        .exam-name { display: block; margin-left: 0; font-size: 16pt; }
        .exam-owner { font-size: 8pt; }
        .exam-sub { font-size: 8.5pt; }
        .exam-fields { font-size: 9pt; }
        .exam-fields td { padding: 0 1mm; }
        .exam-fields i { width: 22mm; }
        .section-heading { flex-wrap: wrap; gap: 0 8px; }
        .section-heading h2 { font-size: 11.5pt; }
        .choice-box-item { width: 100%; }
        .passage-label { float: none; display: inline-block; width: auto; margin: 0 5px 0 0; }
        .quick-answers { gap: 2px 10px; }
        .answer-item { gap: 5px; }
        .answer-number { flex-basis: 18px; }
        .vocab-table, .dictation-table { font-size: 8.5pt; }
        .vocab-table th, .vocab-table td, .dictation-table th, .dictation-table td { padding: 3px 3px; }
        .section-vocab span { white-space: normal; }
        .watermark-layer { grid-template-columns: repeat(2, 1fr); grid-auto-rows: 40mm; }
      }

      /* 手机屏幕确实放不下四列；电脑上的预览区虽然不到 A4 宽，仍按试卷排成 2/4 列。 */
      @media (max-width: 520px) {
        .option-table.cols-2 td, .option-table.cols-3 td, .option-table.cols-4 td { display: block; width: 100%; padding-right: 0; }
        .option-table.cols-4 td { padding-bottom: 0; }
      }

      @page { size: A4; margin: 15mm 14mm; }
      @media print {
        body { background: #fff; font-size: 10.5pt; }
        .sheet { width: auto; min-height: 0; margin: 0; padding: 0; background: #fff; box-shadow: none; overflow: visible; }
        .watermark-layer { position: fixed; inset: 0; }
        .page-break { break-before: page; page-break-before: always; }
      }
    `;
  }

  function buildStandalonePaperHtml(paper) {
    return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>${escapeHtml(paper.title)}</title><style>${paperStyles()}</style></head>` +
      `<body><div class="sheet">${buildPaperBody(paper)}</div></body></html>`;
  }

  function makePaperWordBlob(paper) {
    const styles = docStyles() + paperStyles() +
      `@media print { .sheet { width:auto; min-height:0; margin:0; padding:0; box-shadow:none; } .watermark-layer { position:fixed; inset:0; } }`;
    const html = '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
      `<head><meta charset="utf-8"><meta http-equiv="Content-Type" content="text/html; charset=utf-8">` +
      `<title>${escapeHtml(paper.title)}</title><style>${styles}</style></head>` +
      `<body><div class="sheet">${buildPaperBody(paper)}</div></body></html>`;
    return new Blob(['﻿', html], { type: 'application/msword' });
  }

  function paperFilename(paper, extension) {
    const grade = paper.grade ? `${paper.grade}-` : '';
    return safeFilename(`每日练习-${grade}${paper.date || todayIsoDate()}`) + extension;
  }

  /* ------------------------------------------------------------------------
     页面渲染
     ------------------------------------------------------------------------ */

  async function reloadAndRender() {
    await loadData();
    populateGradeFilter();
    renderAll();
  }

  function renderAll() {
    renderStats();
    renderLibrary();
    renderPapers();
    renderView();
    hydrateSettingsUI();
    updateStorage();
  }

  function renderStats() {
    const values = {
      materials: state.materials.length,
      items: state.items.length,
      papers: state.papers.length
    };
    Object.entries(values).forEach(([key, value]) => {
      $$(`[data-stat="${key}"]`).forEach((node) => {
        node.textContent = String(value);
      });
      $$(`[data-count="${key}"]`).forEach((node) => {
        node.textContent = String(value);
      });
    });
    const paperCountLabel = $('#paper-count-label');
    if (paperCountLabel) paperCountLabel.textContent = `${state.papers.length} 份`;
  }

  function filteredMaterials() {
    const query = state.filters.q.trim().toLowerCase();
    let list = state.materials.filter((material) => {
      if (state.filters.type && normalizeType(material.type) !== normalizeType(state.filters.type)) return false;
      if (state.filters.level && materialBand(material) !== state.filters.level) return false;
      if (state.filters.grade && material.grade !== state.filters.grade) return false;
      if (query) {
        const haystack = [
          material.title,
          material.grade,
          material.text,
          material.note,
          ...(material.tags || [])
        ].join('\n').toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });

    if (state.filters.sort === 'oldest') {
      list.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    } else if (state.filters.sort === 'title') {
      list.sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-CN'));
    } else {
      list.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    }
    return list;
  }

  function materialDifficultyText(material) {
    const levels = state.items
      .filter((item) => item.materialId === material.id)
      .map((item) => itemDifficultyOf(item))
      .filter((level) => Number.isFinite(level));
    if (!levels.length) return '';
    const average = levels.reduce((sum, level) => sum + level, 0) / levels.length;
    return `难度 ${rangeText(levels)} · ${starsForLevel(average)}`;
  }

  function renderLibrary() {
    const container = $('#material-list');
    if (!container) return;
    const materials = filteredMaterials();

    if (!state.materials.length) {
      container.innerHTML = emptyLibraryHtml();
      return;
    }
    if (!materials.length) {
      container.innerHTML = `<div class="empty-state">` +
        `<span class="empty-icon"><svg class="icon" aria-hidden="true"><use href="#i-search"/></svg></span>` +
        `<h3>没有找到符合条件的资料</h3><p>换个关键词，或清除筛选条件再看看。</p>` +
        `<div class="empty-actions"><button class="btn btn-outline" type="button" data-action="clear-filters">清除筛选</button></div>` +
        `</div>`;
      return;
    }

    container.innerHTML = materials.map((material) => {
      const normalized = normalizeType(material.type);
      const def = TYPES[normalized] || TYPES.other;
      const unit = normalized === 'single' ? '道' : '篇';
      const count = material.questionCount || 0;
      const tags = (material.tags || []).slice(0, 5).map((tag) => `<span class="mini-tag">${escapeHtml(tag)}</span>`).join('');
      const confidence = Number.isFinite(material.confidence) && material.confidence > 0
        ? `<i class="dot"></i><span>识别 ${material.confidence}%</span>`
        : '';
      const difficulty = materialDifficultyText(material);
      const originalButton = material.originalBlob
        ? `<button class="icon-btn" type="button" data-action="download-original" title="下载原文件" aria-label="下载原文件"><svg class="icon" aria-hidden="true"><use href="#i-file"/></svg></button>`
        : '';
      const processedButton = material.processedBlob
        ? `<button class="icon-btn" type="button" data-action="download-processed" title="下载整理版" aria-label="下载整理版"><svg class="icon" aria-hidden="true"><use href="#i-download"/></svg></button>`
        : '';
      return `<article class="material-card" data-id="${escapeAttr(material.id)}">` +
        `<span class="type-badge" data-type="${escapeAttr(normalized)}">${escapeHtml(def.short)}</span>` +
        `<div class="material-main">` +
        `<h3 class="material-title" title="${escapeAttr(material.title)}">${escapeHtml(material.title)}</h3>` +
        `<p class="material-meta">` +
        `<span>${escapeHtml(material.grade || bandLabel(materialBand(material)) || '未标注年级')}</span><i class="dot"></i>` +
        `<span>${escapeHtml(formatDate(material.createdAt))}</span><i class="dot"></i>` +
        `<span>${count ? `${count} ${unit}` : '仅存档'}</span>${confidence}` +
        (difficulty ? `<i class="dot"></i><span>${escapeHtml(difficulty)}</span>` : '') +
        `</p>` +
        (tags ? `<div class="material-tags">${tags}</div>` : '') +
        `</div>` +
        `<div class="material-actions">` +
        `<button class="icon-btn" type="button" data-action="preview" title="预览 / 修改" aria-label="预览或修改资料"><svg class="icon" aria-hidden="true"><use href="#i-eye"/></svg></button>` +
        `<button class="icon-btn" type="button" data-action="questions" title="逐题查看与编辑" aria-label="逐题查看与编辑"><svg class="icon" aria-hidden="true"><use href="#i-compose"/></svg></button>` +
        `<button class="icon-btn" type="button" data-action="ai-clean" title="AI 清理杂物 / 重新分类" aria-label="AI 清理杂物并重新分类"><svg class="icon" aria-hidden="true"><use href="#i-flash"/></svg></button>` +
        `<button class="icon-btn" type="button" data-action="ai-split" title="豆包精排 / 重新分题" aria-label="豆包精排并重新分题"><svg class="icon" aria-hidden="true"><use href="#i-spark"/></svg></button>` +
        `<button class="icon-btn" type="button" data-action="edit" title="修改信息" aria-label="修改资料信息"><svg class="icon" aria-hidden="true"><use href="#i-edit"/></svg></button>` +
        `${originalButton}${processedButton}` +
        `<button class="icon-btn danger" type="button" data-action="delete-material" title="删除资料" aria-label="删除资料"><svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg></button>` +
        `</div></article>`;
    }).join('');
  }

  function emptyLibraryHtml() {
    return `<div class="empty-state">` +
      `<span class="empty-icon"><svg class="icon" aria-hidden="true"><use href="#i-library"/></svg></span>` +
      `<h3>资料库还是空的</h3>` +
      `<p>上传第一份 Word / PDF / TXT，或先载入几份示例资料，看看自动分类和组卷的流程。</p>` +
      `<div class="empty-actions">` +
      `<button class="btn btn-primary" type="button" data-view="upload"><svg class="icon" aria-hidden="true"><use href="#i-upload"/></svg>上传资料</button>` +
      `<button class="btn btn-outline" type="button" data-action="samples"><svg class="icon" aria-hidden="true"><use href="#i-spark"/></svg>载入示例资料</button>` +
      `</div></div>`;
  }

  function renderPapers() {
    const container = $('#paper-history');
    if (!container) return;
    if (!state.papers.length) {
      container.innerHTML = `<div class="empty-state" style="padding: 28px 18px;">` +
        `<h3 style="margin-top: 0;">还没有生成的练习卷</h3>` +
        `<p>去「每日练习」用一句指令组一份，生成后会保存在这里。</p>` +
        `<div class="empty-actions"><button class="btn btn-outline" type="button" data-view="practice">去组一份</button></div>` +
        `</div>`;
      return;
    }
    container.innerHTML = state.papers.map((paper) => (
      `<div class="paper-history-item" data-paper-id="${escapeAttr(paper.id)}">` +
      `<div><strong>${escapeHtml(paper.title)}</strong>` +
      `<small>${escapeHtml(paper.grade || '综合')} · ${escapeHtml(paper.command || '手动组卷')} · ${escapeHtml(formatDate(paper.createdAt, true))}</small></div>` +
      `<div class="material-actions">` +
      `<button class="icon-btn" type="button" data-action="preview-paper" title="预览" aria-label="预览练习卷"><svg class="icon" aria-hidden="true"><use href="#i-eye"/></svg></button>` +
      `<button class="icon-btn" type="button" data-action="questions-paper" title="逐题编辑" aria-label="逐题编辑练习卷"><svg class="icon" aria-hidden="true"><use href="#i-compose"/></svg></button>` +
      `<button class="icon-btn" type="button" data-action="download-paper" title="下载 Word" aria-label="下载练习卷 Word"><svg class="icon" aria-hidden="true"><use href="#i-download"/></svg></button>` +
      `<button class="icon-btn danger" type="button" data-action="delete-paper" title="删除" aria-label="删除练习卷"><svg class="icon" aria-hidden="true"><use href="#i-trash"/></svg></button>` +
      `</div></div>`
    )).join('');
  }

  function renderPaperHistoryIfNeeded() {
    renderPapers();
    renderStats();
  }

  function renderCommandResult(parsed, paper) {
    const container = $('#command-result');
    if (!container) return;
    const chips = parsed.requests.map((request) => (
      `<span class="result-chip">${escapeHtml(typeShort(request.type))}<em>${request.count}${escapeHtml(typeUnit(request.type))}</em></span>`
    )).join('');
    const band = parsed.band ? `<span class="result-chip">${escapeHtml(bandLabel(parsed.band))}题库</span>` : '';
    const grade = parsed.grade ? `<span class="result-chip">${escapeHtml(parsed.grade)}</span>` : '';
    const level = parsed.level
      ? `<span class="result-chip">难度 <em>${escapeHtml(parsed.level.min)}–${escapeHtml(parsed.level.max)}</em></span>`
      : '';
    const warnings = paper && paper.warnings && paper.warnings.length
      ? `<p class="result-warning">${escapeHtml(paper.warnings.join(' '))}</p>`
      : '';
    container.innerHTML = `<span>识别为</span>${band}${grade}${level}${chips}${warnings}`;
    container.classList.add('is-visible');
  }

  function fitPaperFrame(frame) {
    if (!frame || !frame.contentDocument) return;
    try {
      const doc = frame.contentDocument;
      const height = Math.max(
        doc.body ? doc.body.scrollHeight : 0,
        doc.documentElement ? doc.documentElement.scrollHeight : 0,
        600
      );
      frame.style.height = `${height + 2}px`;
    } catch (error) {
      frame.style.height = '1400px';
    }
  }

  function renderPaper(paper) {
    const preview = $('#paper-preview');
    if (!preview) return;
    preview.innerHTML = '';
    const frame = document.createElement('iframe');
    frame.className = 'paper-frame';
    frame.title = `${paper.title} 预览`;
    frame.setAttribute('scrolling', 'no');
    frame.srcdoc = buildStandalonePaperHtml(paper);
    frame.addEventListener('load', () => fitPaperFrame(frame));
    preview.appendChild(frame);
    state.paperFrame = frame;
    const meta = $('#paper-meta-label');
    if (meta) {
      const level = paper.level ? ` · 目标难度 ${paper.level.min}–${paper.level.max}` : '';
      meta.textContent = `${paper.grade || '综合'} · ${paper.questionTotal || paper.total} 小题${level} · ${formatDate(paper.createdAt, true)}`;
    }
    const buttons = ['reshuffle', 'download-word', 'print-pdf', 'save-paper', 'ai-analysis', 'ai-vocab', 'download-vocab', 'download-dictation', 'download-long-sentences'];
    buttons.forEach((action) => {
      const button = $(`[data-action="${action}"]`);
      if (button) button.disabled = false;
    });
    requestAnimationFrame(() => fitPaperFrame(frame));
  }

  function resetPaperPreview() {
    state.currentPaper = null;
    state.currentParsed = null;
    state.paperFrame = null;
    const preview = $('#paper-preview');
    if (preview) {
      preview.innerHTML = `<div class="practice-empty">` +
        `<svg class="icon" aria-hidden="true"><use href="#i-compose"/></svg>` +
        `<h3>还没有生成练习</h3>` +
        `<p>在上面的指令框里写下年级、题型和数量，或者点一个示例开始。</p></div>`;
    }
    const meta = $('#paper-meta-label');
    if (meta) meta.textContent = '生成后会在这里排版预览。';
    ['reshuffle', 'download-word', 'print-pdf', 'save-paper', 'ai-analysis', 'ai-vocab', 'download-vocab', 'download-dictation', 'download-long-sentences'].forEach((action) => {
      const button = $(`[data-action="${action}"]`);
      if (button) button.disabled = true;
    });
  }

  /* ------------------------------------------------------------------------
     上传辅助 UI
     ------------------------------------------------------------------------ */

  function clearQueue() {
    const queue = $('#upload-queue');
    if (queue) queue.innerHTML = '';
  }

  function addQueueRow(file) {
    const queue = $('#upload-queue');
    const row = document.createElement('div');
    row.className = 'queue-item';
    const icon = document.createElement('span');
    icon.className = 'spinner';
    icon.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.textContent = `${file.name} · ${formatBytes(file.size)}`;
    const status = document.createElement('span');
    status.className = 'status';
    status.textContent = '排队中';
    row.append(icon, name, status);
    if (queue) queue.appendChild(row);
    return { row, status, icon };
  }

  function setQueueStatus(queueRow, message, kind) {
    if (!queueRow) return;
    queueRow.status.textContent = message;
    queueRow.row.classList.toggle('is-done', kind === 'done');
    queueRow.row.classList.toggle('is-error', kind === 'error');
    if (kind === 'done' || kind === 'error') {
      const replacement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      replacement.setAttribute('class', 'icon');
      replacement.setAttribute('aria-hidden', 'true');
      replacement.style.color = kind === 'error' ? 'var(--red)' : 'var(--sage)';
      replacement.style.width = '15px';
      replacement.style.height = '15px';
      const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
      use.setAttribute('href', kind === 'error' ? '#i-alert' : '#i-check');
      replacement.appendChild(use);
      queueRow.icon.replaceWith(replacement);
      queueRow.icon = replacement;
    }
  }

  /* ------------------------------------------------------------------------
     资料编辑、删除、下载
     ------------------------------------------------------------------------ */

  function findMaterial(id) {
    return state.materials.find((material) => material.id === id) || null;
  }

  function findPaper(id) {
    return state.papers.find((paper) => paper.id === id) || null;
  }

  function openEditDialog(id) {
    const material = findMaterial(id);
    if (!material) {
      toast('没有找到这份资料，可能已被删除。', 'error');
      return;
    }
    state.editId = id;
    $('#edit-id').value = id;
    $('#edit-title').value = material.title || '';
    $('#edit-type').value = TYPES[material.type] ? material.type : 'other';
    $('#edit-grade').value = material.grade || '';
    $('#edit-tags').value = (material.tags || []).join('，');
    $('#edit-text').value = material.text || '';
    const info = [];
    if (material.confidence) info.push(`自动识别：${typeLabel(material.type)} · 置信度 ${material.confidence}%`);
    if (material.sourceName) info.push(`原文件：${material.sourceName}`);
    if (material.note) info.push(material.note);
    if (!material.body) info.push('提取文字为空，可直接在上方补充正文。');
    $('#edit-note').textContent = info.join(' ') || '可修改标题、题型、年级，并直接编辑提取出的文字。';
    $('#edit-note').style.display = info.length ? '' : 'none';
    const dialog = $('#edit-dialog');
    if (!dialog.open) dialog.showModal();
  }

  async function saveEditDialog() {
    const id = state.editId;
    const material = findMaterial(id);
    if (!material) return;
    const title = $('#edit-title').value.trim();
    const type = $('#edit-type').value;
    const grade = $('#edit-grade').value;
    const tags = $('#edit-tags').value
      .split(/[,，、]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .filter((tag) => !GRADE_OPTIONS.includes(tag));
    const text = toDisplayText($('#edit-text').value);
    const split = splitAnswerSection(text);
    const body = toDisplayText(normalizePaperLayout(split.body));
    const answers = toDisplayText(split.answers);

    const updated = {
      ...material,
      title: title || `${typeLabel(type)} · ${todayCn()}`,
      type: normalizeType(type),
      grade,
      band: gradeBand(grade),
      tags: unique([...tags, ...(grade ? [grade] : []), ...(gradeBand(grade) ? [bandLabel(gradeBand(grade))] : [])]),
      text,
      body,
      answers,
      updatedAt: nowIso()
    };
    delete updated.processedBlob;
    delete updated.processedSize;
    updated.processedBlob = makeMaterialBlob(updated);
    updated.processedSize = updated.processedBlob ? updated.processedBlob.size : 0;
    const items = buildItemsForMaterial(updated);
    updated.questionCount = items.length;
    if (!body) {
      updated.note = [material.note, '正文为空，可在资料信息中补充。'].filter(Boolean).join(' ');
    }

    try {
      await saveMaterialWithItems(updated, items);
      await reloadAndRender();
      toast('资料信息已更新。');
    } catch (error) {
      console.error(error);
      toast(`保存失败：${error.message || error}`, 'error');
    }
  }

  function confirmDeleteMaterial(id) {
    const material = findMaterial(id);
    if (!material) return;
    openConfirm({
      title: '删除这份资料？',
      message: `「${material.title}」的原文件、提取文字和题组都会从本机资料库中删除。此操作不可撤销。`,
      confirmText: '删除资料',
      danger: true,
      onConfirm: async () => {
        try {
          await deleteMaterialAndItems(id);
          await reloadAndRender();
          toast('资料已删除。');
        } catch (error) {
          console.error(error);
          toast(`删除失败：${error.message || error}`, 'error');
        }
      }
    });
  }

  function downloadOriginal(material) {
    if (!material || !material.originalBlob) {
      toast('这份资料没有保存原文件。', 'error');
      return;
    }
    downloadBlob(material.originalBlob, material.sourceName || `${material.title}.txt`);
  }

  function downloadProcessed(material) {
    if (!material || !material.processedBlob) {
      toast('这份资料还没有整理版，请先补充文字并保存。', 'error');
      return;
    }
    downloadBlob(material.processedBlob, `${safeFilename(material.title)} · 整理版.doc`);
  }

  function confirmDeletePaper(id) {
    const paper = findPaper(id);
    if (!paper) return;
    openConfirm({
      title: '删除这份练习卷？',
      message: `「${paper.title}」会从本机资料库里删除。原始资料不会受影响。`,
      confirmText: '删除练习卷',
      danger: true,
      onConfirm: async () => {
        try {
          await dbDelete('papers', id);
          await reloadAndRender();
          if (state.currentPaper && state.currentPaper.id === id) resetPaperPreview();
          toast('练习卷已删除。');
        } catch (error) {
          console.error(error);
          toast(`删除失败：${error.message || error}`, 'error');
        }
      }
    });
  }

  async function previewPaper(paper) {
    if (!paper) return;
    await loadWordDictionary();
    paper.vocab = buildPaperVocabulary(paper);
    const html = buildStandalonePaperHtml(paper);
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const opened = window.open(url, '_blank');
    if (!opened) {
      URL.revokeObjectURL(url);
      toast('浏览器拦截了新窗口，请允许此站点打开弹窗。', 'error');
      return;
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  function downloadPaperWord(paper) {
    if (!paper) return;
    const blob = makePaperWordBlob(paper);
    downloadBlob(blob, paperFilename(paper, '.doc'));
  }

  /* ------------------------------------------------------------------------
     AI 整理（DeepSeek 直连，共用教师端保存的本机 Key）
     ------------------------------------------------------------------------ */

  function aiTool() {
    return window.Shunshi && window.Shunshi.ai ? window.Shunshi.ai : null;
  }

  function aiCostText(value) {
    const tool = aiTool();
    return tool ? tool.costText(value) : `¥${Number(value || 0).toFixed(4)}`;
  }

  function renderAiSettings() {
    const tool = aiTool();
    if (!tool) return;
    const cfg = tool.config();
    const input = $('#lib-ai-key');
    if (input) {
      input.value = '';
      input.placeholder = cfg.key ? `已保存（尾号 ${cfg.key.slice(-4)}）` : 'sk-... 只存本机';
    }
    const usage = $('#lib-ai-usage');
    if (usage) {
      usage.textContent = `累计 ${cfg.totalTokens} tokens（输入 ${cfg.inputTokens} / 输出 ${cfg.outputTokens}）· ${cfg.calls} 次 · 约 ${aiCostText(cfg.cost)}`;
    }
    const log = $('#lib-ai-log');
    if (log) {
      log.innerHTML = cfg.log.length
        ? cfg.log.slice(0, 8).map((item) => `<li><span>${escapeHtml(formatDate(item.at, true))} · ${escapeHtml(item.source)}</span><b>${item.tokens} tokens · ${aiCostText(item.cost)}</b></li>`).join('')
        : '<li><span>还没有调用记录。每次 AI 整理都会记在这里。</span></li>';
    }
  }

  function saveLibraryAiKey() {
    const tool = aiTool();
    if (!tool) return;
    const key = String(($('#lib-ai-key') || {}).value || '').trim();
    if (!key) { toast('先粘贴 API Key。', 'error'); return; }
    if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(key)) { toast('Key 格式看起来不对，通常以 sk- 开头。', 'error'); return; }
    const cfg = tool.config();
    cfg.key = key;
    tool.save(cfg);
    renderAiSettings();
    toast('Key 已保存在这台电脑的浏览器里，不进入备份，也不会写进网页源码。', 'ok', 6000);
  }

  async function testLibraryAiKey() {
    const tool = aiTool();
    if (!tool) return;
    const cfg = tool.config();
    if (!cfg.key) { toast('先保存 Key，再测试。', 'error'); return; }
    const usage = $('#lib-ai-usage');
    if (usage) usage.textContent = '正在连接…';
    try {
      const response = await fetch('https://api.deepseek.com/models', {
        headers: { Authorization: `Bearer ${cfg.key}` }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      const models = (json.data || []).map((item) => item.id).join('、') || 'deepseek-flash';
      renderAiSettings();
      toast(`连接成功 · 可用：${models}。测试不消耗额度。`, 'ok', 6000);
    } catch (error) {
      renderAiSettings();
      toast(`连接失败：${error.message}`, 'error', 7000);
    }
  }

  function clearLibraryAiKey() {
    const tool = aiTool();
    if (!tool) return;
    if (!window.confirm('清除这台电脑上保存的 API Key？教师端也会同步失效。')) return;
    const cfg = tool.config();
    cfg.key = '';
    tool.save(cfg);
    renderAiSettings();
    toast('已清除 Key。');
  }

  function aiTypeKey(raw) {
    const text = String(raw || '').trim();
    if (TYPES[text]) return text;
    const hit = Object.keys(TYPES).find((key) => TYPES[key].label === text || TYPES[key].short === text);
    return hit || 'other';
  }

  function parseTaggedText(text, tags) {
    const source = String(text || '').replace(/\r\n?/g, '\n');
    const out = {};
    tags.forEach((tag, index) => {
      const next = tags.slice(index + 1).map((item) => `【${item}】`).join('|');
      const pattern = new RegExp(`【${tag}】\\s*([\\s\\S]*?)(?=${next || '$'})`);
      const match = pattern.exec(source);
      out[tag] = match ? match[1].trim() : '';
    });
    return out;
  }

  function aiCleanPrompt(material, text) {
    return [
      '你是英语试卷资料整理助手。请把下面这份老师上传的资料整理成可直接入库的干净文本。',
      '要求：',
      '1. 删除页眉、页脚、页码、学校名、网站广告、水印、无关的考试须知等杂物；保留标题、大题说明、短文、题目、选项、答案与解析。',
      '2. 修复 OCR 造成的断行、错位和多余空格；每题另起一行，选项 A/B/C/D 各占一行或紧凑排列，保持题号清晰。',
      '3. 不要改编题目，不要新增或删除题目，不要编造答案。无法判断的内容保持原样。',
      '4. 判断题型，只能从这些键里选一个：single, cloze, reading, five, grammar, dialogue, picture, writing, listening, other。',
      '5. 判断年级：七年级、八年级、九年级、高一、高二、高三、中考、高考；无法判断就留空。',
      '6. 只输出下面四个标记，不要写解释、不要用 Markdown 代码块。',
      '【标题】不超过 30 字的资料标题',
      '【题型】上面的英文键',
      '【年级】年级或留空',
      '【正文】整理后的完整正文（含答案与解析，如果有）',
      '',
      `资料原题：${material.title || '未命名'}`,
      '原文如下：',
      text
    ].join('\n');
  }

  async function applyAiClean(material, text) {
    const tool = aiTool();
    if (!tool) { toast('AI 模块没有加载，请刷新页面。', 'error'); return; }
    const source = String(text || '').slice(0, 5000);
    const cut = String(text || '').length > 5000;
    const estimate = tool.estimate(source.length + 900, 1800);
    openConfirm({
      title: '用 AI 整理这份资料？',
      message: `将把正文约 ${source.length} 字${cut ? '（已截取前 5000 字）' : ''}发送给 DeepSeek，清理杂物、重新分类并整理排版。预计最多约 ${estimate.inputTokens + estimate.maxOutputTokens} tokens，约 ${aiCostText(estimate.cost)}。只在你确认后调用。`,
      confirmText: '开始整理',
      danger: false,
      onConfirm: async () => {
        const button = document.querySelector(`[data-id="${material.id}"] [data-action="ai-clean"]`);
        if (button) { button.disabled = true; button.classList.add('is-busy'); }
        try {
          const result = await tool.call([
            { role: 'system', content: '你是严谨的英语试卷排版校对员。只做清理、分类和排版，不改题意，不编造答案。严格按用户要求的分段标记输出。' },
            { role: 'user', content: aiCleanPrompt(material, source) }
          ], 1800, '资料库 · AI 整理');
          const parsed = parseTaggedText(result.text, ['标题', '题型', '年级', '正文']);
          if (!parsed['正文']) throw new Error('AI 没有返回可用的正文，请再试一次。');
          const typeKey = aiTypeKey(String(parsed['题型'] || '').trim());
          const grade = GRADE_OPTIONS.includes(String(parsed['年级'] || '').trim()) ? String(parsed['年级']).trim() : material.grade;
          const title = String(parsed['标题'] || '').trim().slice(0, 80) || material.title;
          const fullText = toDisplayText(parsed['正文']);
          const split = splitAnswerSection(fullText);
          const body = toDisplayText(normalizePaperLayout(split.body));
          const answers = toDisplayText(split.answers);
          const updated = {
            ...material,
            title,
            type: typeKey,
            grade,
            band: gradeBand(grade),
            tags: unique([...(material.tags || []).filter((tag) => !GRADE_OPTIONS.includes(tag)), ...(grade ? [grade] : []), ...(gradeBand(grade) ? [bandLabel(gradeBand(grade))] : [])]),
            text: fullText,
            body,
            answers,
            answerMap: {},
            note: [material.note, '已用 AI 清理并重新分类，请核对题目和答案。'].filter(Boolean).join(' '),
            updatedAt: nowIso()
          };
          if (updated.processedBlob) {
            updated.processedBlob = makeMaterialBlob(updated);
            updated.processedSize = updated.processedBlob ? updated.processedBlob.size : 0;
          }
          const items = buildItemsForMaterial(updated);
          updated.questionCount = items.length;
          await saveMaterialWithItems(updated, items);
          await reloadAndRender();
          renderAiSettings();
          toast(`整理完成：${typeLabel(typeKey)} · ${grade || '年级未标注'} · 本次 ${result.tokens} tokens · 约 ${aiCostText(result.cost)}。请打开“逐题编辑”核对。`, 'ok', 9000);
        } catch (error) {
          console.error(error);
          toast(`AI 整理失败：${error.message || error}`, 'error', 8500);
        } finally {
          const latest = document.querySelector(`[data-id="${material.id}"] [data-action="ai-clean"]`);
          if (latest) { latest.disabled = false; latest.classList.remove('is-busy'); }
          renderAiSettings();
        }
      }
    });
  }

  /* ------------------------------------------------------------------------
     逐题编辑
     ------------------------------------------------------------------------ */

  function questionEditorSections() {
    const edit = state.questionEdit;
    if (!edit) return [];
    if (edit.kind === 'paper') {
      const paper = findPaper(edit.id);
      if (!paper) return [];
      return (paper.sections || []).map((section, si) => ({
        key: `s${si}`,
        type: normalizeType(section.type),
        title: typeLabel(section.type),
        items: section.items || [],
        sectionIndex: si
      }));
    }
    const material = findMaterial(edit.id);
    if (!material) return [];
    const items = state.items.filter((item) => item.materialId === material.id);
    return [{
      key: 'm0',
      type: normalizeType(material.type),
      title: material.title || '资料题组',
      items,
      sectionIndex: 0
    }];
  }

  function optionsToText(options) {
    return (options || []).map((option) => `${option.letter || ''}. ${option.text || ''}`).join('\n');
  }

  function textToOptions(text) {
    const list = [];
    String(text || '').split(/\n+/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const match = trimmed.match(/^([A-Ga-g])\s*[.、．)）]\s*(.*)$/);
      if (match) list.push({ letter: match[1].toUpperCase(), text: match[2].trim() });
      else list.push({ letter: String.fromCharCode(65 + list.length), text: trimmed });
    });
    return list.filter((option) => option.text);
  }

  function questionRowHtml(item, qi, qj, question, sectionType) {
    const qid = question.id || `q-${qi}-${qj}`;
    const number = question.number || question.paperNumber || qj + 1;
    const options = Array.isArray(question.options) ? question.options : [];
    return `<div class="q-editor-row" data-qrow data-qi="${qi}" data-qj="${qj}" data-qid="${escapeAttr(qid)}">` +
      `<div class="q-editor-row-head">` +
        `<b>第 ${escapeHtml(number)} 题</b>` +
        `<span>${escapeHtml(typeLabel(sectionType))}</span>` +
        `<span class="q-diff-chip">难度 ${escapeHtml(question.difficulty || '—')}</span>` +
        `<div class="q-row-actions">` +
          `<button class="btn btn-ghost btn-tiny" type="button" data-q-ai>AI 精修此题</button>` +
          `<button class="btn btn-ghost btn-tiny q-danger" type="button" data-q-remove>删除</button>` +
        `</div>` +
      `</div>` +
      `<div class="q-editor-fields">` +
        `<label class="q-field-wide">题干<textarea data-q-field="stem" rows="2">${escapeHtml(question.stem || '')}</textarea></label>` +
        (options.length || ['single', 'cloze', 'reading', 'five', 'dialogue', 'listening'].includes(sectionType)
          ? `<label class="q-field-wide">选项（每行一个，例如 A. ...）<textarea data-q-field="options" rows="4">${escapeHtml(optionsToText(options))}</textarea></label>`
          : '') +
        `<div class="q-field-row">` +
          `<label>答案<input data-q-field="answer" type="text" value="${escapeAttr(question.answer || '')}"></label>` +
          `<label>难度（1–10）<input data-q-field="difficulty" type="number" min="1" max="10" value="${escapeAttr(question.difficulty || 5)}"></label>` +
        `</div>` +
        `<label class="q-field-wide">解析<textarea data-q-field="explanation" rows="2">${escapeHtml(question.explanation || '')}</textarea></label>` +
      `</div>` +
    `</div>`;
  }

  function blankRowHtml(item, qi, number) {
    const answer = (item.blankAnswers && item.blankAnswers[number]) || {};
    const difficulty = (item.blankDifficulties && item.blankDifficulties[number]) || 5;
    return `<div class="q-editor-row" data-qrow data-qi="${qi}" data-blank="${escapeAttr(number)}">` +
      `<div class="q-editor-row-head">` +
        `<b>第 ${escapeHtml(number)} 空</b><span>语法填空 / 短文填空</span>` +
        `<span class="q-diff-chip">难度 ${escapeHtml(difficulty)}</span>` +
        `<div class="q-row-actions"><button class="btn btn-ghost btn-tiny q-danger" type="button" data-q-remove>删除</button></div>` +
      `</div>` +
      `<div class="q-editor-fields">` +
        `<div class="q-field-row">` +
          `<label>答案<input data-q-field="blank-answer" type="text" value="${escapeAttr(answer.answer || '')}"></label>` +
          `<label>难度（1–10）<input data-q-field="blank-difficulty" type="number" min="1" max="10" value="${escapeAttr(difficulty)}"></label>` +
        `</div>` +
        `<label class="q-field-wide">解析<textarea data-q-field="blank-explanation" rows="2">${escapeHtml(answer.explanation || '')}</textarea></label>` +
      `</div>` +
    `</div>`;
  }

  function renderQuestionEditor() {
    const edit = state.questionEdit;
    const body = $('#question-editor-body');
    if (!edit || !body) return;
    const source = edit.kind === 'paper' ? findPaper(edit.id) : findMaterial(edit.id);
    if (!source) { closeQuestionEditor(); return; }
    const sections = questionEditorSections();
    let total = 0;
    let html = '';
    sections.forEach((section) => {
      const itemHtml = (section.items || []).map((item, itemIndex) => {
        const qi = `${section.sectionIndex}:${itemIndex}`;
        const questions = Array.isArray(item.questions) ? item.questions : [];
        const blanks = item.blankAnswers ? Object.keys(item.blankAnswers).sort((a, b) => Number(a) - Number(b)) : [];
        if (!questions.length && !blanks.length) return '';
        total += questions.length + blanks.length;
        const rows = questions.map((question, qj) => questionRowHtml(item, qi, qj, question, section.type)).join('') +
          blanks.map((number) => blankRowHtml(item, qi, number)).join('');
        return `<details class="q-editor-item" open>` +
          `<summary><b>${escapeHtml(item.title || section.title)}</b><span>${questions.length + blanks.length} 题</span></summary>` +
          `<div class="q-editor-item-body">${rows}</div>` +
        `</details>`;
      }).join('');
      if (itemHtml) {
        html += `<section class="q-editor-section"><h3>${escapeHtml(section.title)}</h3>${itemHtml}</section>`;
      }
    });
    body.innerHTML = html || `<div class="q-editor-empty">这份资料还没有识别出可编辑的题目。可以先在卡片上点“修改信息”，补充正文后保存，系统会重新分题。</div>`;
    const count = $('#question-editor-count');
    if (count) count.textContent = `${total} 道/空 · ${edit.kind === 'paper' ? '练习卷' : '资料库'}`;
    const title = $('#question-editor-title');
    if (title) title.textContent = edit.kind === 'paper' ? '逐题编辑 · 练习卷' : '逐题编辑 · 资料题目';
    const sub = $('#question-editor-sub');
    if (sub) sub.textContent = `${source.title || '未命名'}。修改会保存到本机资料库；练习卷是快照，改资料不会自动改已生成的练习卷。`;
  }

  function openQuestionEditor(kind, id) {
    const source = kind === 'paper' ? findPaper(id) : findMaterial(id);
    if (!source) { toast('找不到这份资料。', 'error'); return; }
    state.questionEdit = { kind, id };
    renderQuestionEditor();
    const dialog = $('#question-editor-dialog');
    if (dialog && !dialog.open) dialog.showModal();
  }

  function closeQuestionEditor() {
    const dialog = $('#question-editor-dialog');
    if (dialog && dialog.open) dialog.close();
    state.questionEdit = null;
  }

  function itemAtKey(key) {
    const edit = state.questionEdit;
    if (!edit) return null;
    const [si, ii] = String(key || '').split(':').map(Number);
    if (edit.kind === 'paper') {
      const paper = findPaper(edit.id);
      const section = paper && paper.sections && paper.sections[si];
      return section && section.items ? section.items[ii] : null;
    }
    const material = findMaterial(edit.id);
    const items = state.items.filter((item) => item.materialId === (material && material.id));
    return items[ii] || null;
  }

  function rowFields(row) {
    const get = (name) => {
      const field = row.querySelector(`[data-q-field="${name}"]`);
      return field ? field.value : '';
    };
    return {
      stem: get('stem'),
      options: get('options'),
      answer: get('answer'),
      difficulty: get('difficulty'),
      explanation: get('explanation'),
      blankAnswer: get('blank-answer'),
      blankDifficulty: get('blank-difficulty'),
      blankExplanation: get('blank-explanation')
    };
  }

  function applyRowToModel(row) {
    const item = itemAtKey(row.dataset.qi);
    if (!item) return;
    const fields = rowFields(row);
    if (row.dataset.blank) {
      const number = row.dataset.blank;
      item.blankAnswers = item.blankAnswers || {};
      item.blankDifficulties = item.blankDifficulties || {};
      item.blankAnswers[number] = {
        ...(item.blankAnswers[number] || {}),
        answer: String(fields.blankAnswer || '').trim(),
        explanation: String(fields.blankExplanation || '').trim()
      };
      item.blankDifficulties[number] = clamp(Number(fields.blankDifficulty) || 5, 1, 10);
      return;
    }
    const qj = Number(row.dataset.qj) || 0;
    const question = (item.questions || [])[qj];
    if (!question) return;
    question.stem = String(fields.stem || '').trim();
    question.options = textToOptions(fields.options);
    question.answer = String(fields.answer || '').trim();
    question.difficulty = clamp(Number(fields.difficulty) || 5, 1, 10);
    question.explanation = String(fields.explanation || '').trim();
  }

  function removeMarkedRows(removed) {
    const grouped = new Map();
    Array.from(removed).forEach((key) => {
      const [qi, qk] = key.split('|');
      if (!grouped.has(qi)) grouped.set(qi, { questions: [], blanks: [] });
      if (qk.startsWith('q')) grouped.get(qi).questions.push(Number(qk.slice(1)));
      else grouped.get(qi).blanks.push(qk);
    });
    grouped.forEach(({ questions, blanks }, qi) => {
      const item = itemAtKey(qi);
      if (!item) return;
      questions.sort((a, b) => b - a).forEach((qj) => {
        if (Array.isArray(item.questions)) item.questions.splice(qj, 1);
      });
      blanks.forEach((number) => {
        if (item.blankAnswers) delete item.blankAnswers[number];
        if (item.blankDifficulties) delete item.blankDifficulties[number];
      });
    });
  }

  async function saveQuestionEdits() {
    const edit = state.questionEdit;
    if (!edit) return;
    const rows = $$('#question-editor-body [data-qrow]');
    const removed = new Set();
    rows.forEach((row) => {
      if (row.dataset.removed === '1') removed.add(`${row.dataset.qi}|${row.dataset.blank || `q${row.dataset.qj}`}`);
      else applyRowToModel(row);
    });
    try {
      if (edit.kind === 'paper') {
        const paper = findPaper(edit.id);
        if (!paper) return;
        removeMarkedRows(removed);
        paper.questionTotal = assignPaperNumbers(paper.sections || []);
        paper.updatedAt = nowIso();
        await dbPut('papers', paper);
        await reloadAndRender();
        if (state.currentPaper && state.currentPaper.id === paper.id) {
          state.currentPaper = findPaper(paper.id);
          if (state.currentPaper) renderPaper(state.currentPaper);
        }
      } else {
        const material = findMaterial(edit.id);
        if (!material) return;
        const items = state.items.filter((item) => item.materialId === material.id);
        removeMarkedRows(removed);
        items.forEach((item) => {
          const levels = (item.questions || []).map((question) => Number(question.difficulty)).filter((n) => n >= 1 && n <= 10);
          if (levels.length) item.difficulty = Math.round(levels.reduce((sum, n) => sum + n, 0) / levels.length);
        });
        material.updatedAt = nowIso();
        material.questionCount = items.length;
        await saveMaterialWithItems(material, items);
        await reloadAndRender();
      }
      closeQuestionEditor();
      toast('逐题修改已保存。', 'ok');
    } catch (error) {
      console.error(error);
      toast(`保存失败：${error.message || error}`, 'error', 8000);
    }
  }

  async function aiPolishRow(row) {
    const tool = aiTool();
    if (!tool) return;
    const edit = state.questionEdit;
    if (!edit) return;
    const cfg = tool.config();
    if (!cfg.key) {
      toast('还没有配置 API Key。请到“设置 → AI 整理与消耗”粘贴保存。', 'error', 7000);
      go('settings');
      return;
    }
    const item = itemAtKey(row.dataset.qi);
    if (!item) return;
    const fields = rowFields(row);
    const isBlank = !!row.dataset.blank;
    const payload = {
      type: isBlank ? 'grammar' : (questionEditorSections().find((section) => section.items.includes(item)) || {}).type || 'other',
      stem: fields.stem || (isBlank ? `语法填空第 ${row.dataset.blank} 空` : ''),
      options: fields.options || '',
      answer: isBlank ? fields.blankAnswer : fields.answer,
      explanation: isBlank ? fields.blankExplanation : fields.explanation
    };
    const estimate = tool.estimate(JSON.stringify(payload).length + 300, 360);
    if (!window.confirm(`只发送这一道题给 DeepSeek 精修，预计最多约 ${estimate.inputTokens + estimate.maxOutputTokens} tokens、约 ${aiCostText(estimate.cost)}。继续吗？`)) return;
    row.classList.add('is-busy');
    try {
      const result = await tool.call([
        { role: 'system', content: '你是英语试卷单题校对员。只整理这一道题：修复 OCR 断行和标点，规范选项排版，去掉页眉页码等杂物；不要改题意、不要换答案、不要编造解析。无法判断时保持原样。严格按标记输出。' },
        { role: 'user', content: `题型：${payload.type}\n题干：${payload.stem}\n选项：\n${payload.options}\n答案：${payload.answer}\n解析：${payload.explanation}\n\n只输出：\n【题干】…\n【选项】每行一个 A. …；没有选项就留空\n【答案】…\n【解析】…` }
      ], 360, '资料库 · 单题精修');
      const parsed = parseTaggedText(result.text, ['题干', '选项', '答案', '解析']);
      const apply = (name, value) => {
        const field = row.querySelector(`[data-q-field="${name}"]`);
        if (field && value) field.value = value;
      };
      apply(isBlank ? 'stem' : 'stem', parsed['题干']);
      apply('options', parsed['选项']);
      apply(isBlank ? 'blank-answer' : 'answer', parsed['答案']);
      apply(isBlank ? 'blank-explanation' : 'explanation', parsed['解析']);
      if (parsed['题干'] && isBlank) {
        // 语法填空没有独立题干，AI 返回的题干只用于校对，不写回。
      }
      renderAiSettings();
      toast(`单题精修完成，本次 ${result.tokens} tokens · 约 ${aiCostText(result.cost)}。核对后点“保存全部修改”。`, 'ok', 8000);
    } catch (error) {
      console.error(error);
      toast(`单题精修失败：${error.message || error}`, 'error', 8000);
    } finally {
      row.classList.remove('is-busy');
    }
  }

  function bindQuestionEditorEvents() {
    const body = $('#question-editor-body');
    if (body) {
      body.addEventListener('click', (event) => {
        const aiButton = event.target.closest('[data-q-ai]');
        if (aiButton) {
          const row = aiButton.closest('[data-qrow]');
          if (row) aiPolishRow(row);
          return;
        }
        const removeButton = event.target.closest('[data-q-remove]');
        if (removeButton) {
          const row = removeButton.closest('[data-qrow]');
          if (!row) return;
          if (!window.confirm('删除这道题？保存后才会真正从资料库移除。')) return;
          row.dataset.removed = '1';
          row.hidden = true;
          toast('已标记删除，点“保存全部修改”后生效。');
        }
      });
    }
    $$('[data-q-close]').forEach((button) => button.addEventListener('click', closeQuestionEditor));
    const dialog = $('#question-editor-dialog');
    if (dialog) {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) closeQuestionEditor();
      });
    }
  }

  /* ------------------------------------------------------------------------
     组卷操作
     ------------------------------------------------------------------------ */

  async function runGeneration(rawCommand) {
    if (!state.db) {
      toast('资料库还在打开中，请稍等。', 'error');
      return;
    }
    if (!state.items.length) {
      toast('资料库还没有可抽取的题目，请先上传资料或载入示例。', 'error', 5200);
      return;
    }
    const parsed = parseCommand(rawCommand, state.practiceLevel);
    await loadWordDictionary();
    const paper = generatePaperFromCommand(parsed);
    if (!paper) {
      resetPaperPreview();
      toast('没有生成练习：资料库中没有匹配的题目。', 'error', 5200);
      renderCommandResult(parsed, { warnings: ['没有匹配的题目，请检查题型或先上传资料。'] });
      return;
    }
    state.currentPaper = paper;
    state.currentParsed = parsed;
    renderPaper(paper);
    renderCommandResult(parsed, paper);
    toast(`已生成 ${paper.questionTotal || paper.total} 小题，含答案解析、词汇表和默写表。`);
  }

  async function reshuffleCurrent() {
    if (!state.currentParsed) {
      toast('请先生成一份练习。', 'error');
      return;
    }
    await loadWordDictionary();
    const parsed = parseCommand(state.currentParsed.raw, state.currentParsed.band || state.practiceLevel);
    const paper = generatePaperFromCommand(parsed);
    if (!paper) {
      toast('没有可替换的题目。', 'error');
      return;
    }
    state.currentPaper = paper;
    state.currentParsed = parsed;
    renderPaper(paper);
    renderCommandResult(parsed, paper);
    toast('已换一组题目。');
  }

  function downloadCurrentWord() {
    if (!state.currentPaper) return;
    downloadPaperWord(state.currentPaper);
  }

  function printCurrentPaper() {
    const paper = state.currentPaper;
    if (!paper) return;
    const html = buildStandalonePaperHtml(paper);
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast('浏览器拦截了新窗口，请允许此站点打开弹窗后再试。', 'error', 6000);
      return;
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    window.setTimeout(() => {
      try {
        printWindow.print();
      } catch (error) {
        console.error(error);
        toast('打印窗口没有成功打开，请使用下载 Word 的方式。', 'error');
      }
    }, 600);
    toast('在打印窗口的目标打印机中选择「另存为 PDF」即可。', 'ok', 6000);
  }

  async function saveCurrentPaper() {
    const paper = state.currentPaper;
    if (!paper) return;
    if (state.papers.some((record) => record.id === paper.id)) {
      toast('这份练习卷已经存过了。');
      return;
    }
    try {
      paper.savedAt = nowIso();
      const record = {
        ...paper
      };
      delete record.html;
      delete record.wordBlob;
      await dbPut('papers', record);
      await reloadAndRender();
      toast('练习卷已存入资料库，可在资料库底部找到。');
    } catch (error) {
      console.error(error);
      toast(`保存失败：${error.message || error}`, 'error');
    }
  }

  /* ------------------------------------------------------------------------
     手动录入与示例资料
     ------------------------------------------------------------------------ */

  function openPasteDialog() {
    const dialog = $('#paste-dialog');
    const type = $('#paste-type');
    if (type && !type.value) type.value = 'reading';
    if (!dialog.open) dialog.showModal();
  }

  async function savePasteDialog() {
    const title = $('#paste-title').value.trim();
    const type = $('#paste-type').value;
    const grade = $('#paste-grade').value;
    const text = cleanImportedText(toDisplayText($('#paste-text').value)).text;
    if (!title || !text) return;
    const split = splitAnswerSection(text);
    const body = toDisplayText(normalizePaperLayout(split.body));
    const answers = toDisplayText(split.answers);
    const material = {
      id: uid(),
      title,
      type: normalizeType(type),
      grade,
      band: gradeBand(grade),
      tags: unique([typeShort(type), grade, '手动录入'].filter(Boolean)),
      text,
      body,
      answers,
      note: '手动录入的资料。',
      sourceName: '手动录入',
      sourceType: 'text/plain',
      sourceExtension: 'txt',
      originalBlob: null,
      originalSize: 0,
      processedBlob: null,
      processedSize: 0,
      confidence: null,
      autoType: null,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    const items = buildItemsForMaterial(material);
    material.questionCount = items.length;
    material.processedBlob = makeMaterialBlob(material);
    material.processedSize = material.processedBlob ? material.processedBlob.size : 0;

    try {
      await saveMaterialWithItems(material, items);
      await reloadAndRender();
      $('#paste-form').reset();
      toast('已整理入库。');
      go('library');
    } catch (error) {
      console.error(error);
      toast(`保存失败：${error.message || error}`, 'error');
    }
  }

  const SAMPLE_MATERIALS = [
    {
      title: '示例 · 高一单项选择 5 题',
      type: 'single',
      grade: '高一',
      text: `1. — How often do you play basketball?
— ______ a week.
A. Two
B. Twice
C. Second
D. Two times

2. If it ______ tomorrow, we will stay at home.
A. rain
B. rains
C. will rain
D. rained

3. The little girl is interested ______ drawing.
A. in
B. on
C. at
D. with

4. My father ______ in this school since 2010.
A. teaches
B. taught
C. has taught
D. is teaching

5. — Could you tell me ______?
— Sure. Go along this street and turn left.
A. where the bank is
B. where is the bank
C. the bank where is
D. where was the bank`,
      answers: '1-5 BBACA'
    },
    {
      title: '示例 · 高一阅读理解 1 篇',
      type: 'reading',
      grade: '高一',
      text: `Many students feel nervous before a test. A little stress can help us focus, but too much stress makes it hard to think clearly. Here are three simple ways to stay calm.

First, plan your time. Make a short study plan and finish one small task at a time. Second, take short breaks. Stand up, walk around, or drink some water. Third, sleep well. Going to bed early is more useful than studying all night.

Remember, a test is only a test. It cannot tell the whole story of who you are.

1. What is the main idea of the passage?
A. How to make friends.
B. How to deal with test stress.
C. Why tests are important.
D. How to sleep well.

2. According to the passage, what can help us think clearly?
A. Too much stress.
B. Short breaks.
C. Skipping sleep.
D. Studying all night.

3. What does the writer want to tell us?
A. Tests are the whole story.
B. We should never feel nervous.
C. A test is only a test.
D. Sleep is not important.`,
      answers: '1-3 BBC'
    },
    {
      title: '示例 · 高一语法填空 1 篇',
      type: 'grammar',
      grade: '高一',
      text: `阅读下面短文，在空白处填入 1 个适当的单词或括号内单词的正确形式。

Last Sunday, my friends and I 1. ______ (go) to a small village near the city. The village was quiet and beautiful. We 2. ______ (walk) along a river and took many photos. At noon, we found a small restaurant and had lunch there. The food was simple, but it 3. ______ (taste) wonderful. In the afternoon, we helped an old man 4. ______ (pick) oranges on his farm. He was very kind and told us some interesting stories. We all felt that it was 5. ______ unforgettable day.`,
      answers: '1. went 2. walked 3. tasted 4. pick / to pick 5. an'
    },
    {
      title: '示例 · 高一书面表达 1 篇',
      type: 'writing',
      grade: '高一',
      text: `假定你是李华，你的英国朋友 Chris 想了解你最喜欢的中国传统节日。请你用英语给他写一封邮件，内容包括：

1. 你最喜欢的节日；
2. 你通常如何庆祝；
3. 邀请他有机会来中国体验。

注意：
1. 词数 80 左右；
2. 可以适当增加细节，以使行文连贯；
3. 开头和结尾已给出，不计入总词数。

Dear Chris,

________________________________________________________________________

Yours,
Li Hua`,
      answers: ''
    }
  ];

  async function loadSamples() {
    if (state.samplesBusy) return;
    if (!state.db) {
      toast('资料库还在打开中，请稍等。', 'error');
      return;
    }
    state.samplesBusy = true;
    let added = 0;
    try {
      for (const sample of SAMPLE_MATERIALS) {
        const exists = state.materials.some((material) => material.title === sample.title && (material.tags || []).includes('示例'));
        if (exists) continue;
        const split = splitAnswerSection(sample.text);
        const material = {
          id: uid(),
          title: sample.title,
          type: sample.type,
          grade: sample.grade,
          tags: ['示例', sample.grade, typeShort(sample.type)],
          text: sample.text,
          body: split.body,
          answers: sample.answers || split.answers,
          note: '示例资料，可随时删除。',
          sourceName: '示例资料',
          sourceType: 'text/plain',
          sourceExtension: 'txt',
          originalBlob: null,
          originalSize: 0,
          processedBlob: null,
          processedSize: 0,
          confidence: null,
          autoType: sample.type,
          createdAt: nowIso(),
          updatedAt: nowIso()
        };
        const items = buildItemsForMaterial(material);
        material.questionCount = items.length;
        material.processedBlob = makeMaterialBlob(material);
        material.processedSize = material.processedBlob ? material.processedBlob.size : 0;
        await saveMaterialWithItems(material, items);
        added += 1;
      }
      await reloadAndRender();
      if (added) {
        toast(`已载入 ${added} 份示例资料，可以直接去「每日练习」试组一份。`);
        go('library');
      } else {
        toast('示例资料已经在资料库里了。');
      }
    } catch (error) {
      console.error(error);
      toast(`载入示例失败：${error.message || error}`, 'error');
    } finally {
      state.samplesBusy = false;
    }
  }

  /* ------------------------------------------------------------------------
     存储、备份与恢复
     ------------------------------------------------------------------------ */

  async function updateStorage() {
    const usageEl = $('#storage-usage');
    const statusEl = $('#storage-status');
    const fill = $('#storage-fill');
    if (!usageEl || !statusEl || !fill) return;

    if (!navigator.storage || typeof navigator.storage.estimate !== 'function') {
      usageEl.textContent = '浏览器未提供存储信息';
      statusEl.textContent = '建议定期备份';
      return;
    }

    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percent = quota ? Math.min(100, (usage / quota) * 100) : 0;
      fill.style.width = `${percent.toFixed(1)}%`;
      usageEl.textContent = `${formatBytes(usage)} / ${formatBytes(quota)}`;
      let persisted = false;
      try {
        persisted = await navigator.storage.persisted();
      } catch (error) { /* ignore */ }
      if (percent >= 80) {
        statusEl.textContent = '空间偏紧 · 建议备份';
        statusEl.style.color = 'var(--red-deep)';
        fill.style.background = 'linear-gradient(90deg, var(--red), var(--gold))';
      } else if (persisted) {
        statusEl.textContent = '已获长期保存';
        statusEl.style.color = '#4f715c';
        fill.style.background = '';
      } else {
        statusEl.textContent = '未获长期保存';
        statusEl.style.color = '';
        fill.style.background = '';
      }
    } catch (error) {
      usageEl.textContent = '无法读取存储信息';
      statusEl.textContent = '请定期备份';
    }
  }

  async function requestPersistence(showToast = true) {
    if (state.persistenceRequested && !showToast) return;
    state.persistenceRequested = true;
    if (!navigator.storage || typeof navigator.storage.persist !== 'function') {
      if (showToast) toast('当前浏览器不支持长期保存申请，请定期导出备份。', 'error');
      return;
    }
    try {
      const persisted = await navigator.storage.persist();
      if (showToast) {
        toast(persisted ? '已获得长期保存。仍建议定期导出备份。' : '浏览器暂未授予长期保存，请定期导出备份。');
      }
      updateStorage();
    } catch (error) {
      if (showToast) toast('长期保存申请没有成功，请定期导出备份。', 'error');
    }
  }

  function supportsUsbWorkspace() {
    return typeof window.showDirectoryPicker === 'function';
  }

  async function ensureUsbPermission() {
    if (!state.usbHandle) {
      toast('请先在「设置 → U 盘工作区」选择 U 盘文件夹。', 'error', 5200);
      return null;
    }
    try {
      if (typeof state.usbHandle.queryPermission === 'function') {
        let permission = await state.usbHandle.queryPermission({ mode: 'readwrite' });
        if (permission !== 'granted' && typeof state.usbHandle.requestPermission === 'function') {
          permission = await state.usbHandle.requestPermission({ mode: 'readwrite' });
        }
        if (permission !== 'granted') {
          toast('没有拿到 U 盘的写入权限，请重新选择文件夹。', 'error', 5200);
          return null;
        }
      }
      return state.usbHandle;
    } catch (error) {
      console.error(error);
      toast(`U 盘权限检查失败：${error.message || error}`, 'error', 5200);
      return null;
    }
  }

  async function writeBlobToUsb(blob, filename, subfolder = '下载') {
    if (!supportsUsbWorkspace()) {
      toast('当前浏览器不能直接写 U 盘，请用电脑版 Chrome / Edge。', 'error', 5200);
      return false;
    }
    const root = await ensureUsbPermission();
    if (!root) return false;
    try {
      const directory = subfolder
        ? await root.getDirectoryHandle(subfolder, { create: true })
        : root;
      const handle = await directory.getFileHandle(safeFilename(filename), { create: true });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return true;
    } catch (error) {
      console.error(error);
      toast(`写入 U 盘失败：${error.message || error}`, 'error', 6000);
      return false;
    }
  }

  async function pickUsbFolder() {
    if (!supportsUsbWorkspace()) {
      toast('请用电脑版 Chrome / Edge 打开工作台，手机浏览器不能直接写 U 盘。', 'error', 6000);
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ id: 'shunshi-usb', mode: 'readwrite' });
      state.usbHandle = handle;
      await saveSetting('usbDirectory', handle);
      renderUsbStatus();
      toast(`已选择 U 盘文件夹「${handle.name}」。以后下载 Word 或备份时，可按开关自动存一份。`, 'ok', 5600);
    } catch (error) {
      if (error && error.name === 'AbortError') return;
      console.error(error);
      toast(`选择文件夹失败：${error.message || error}`, 'error', 5200);
    }
  }

  function mirrorBlobToUsb(blob, filename) {
    if (!state.settings.usbMirror || !state.usbHandle || !supportsUsbWorkspace()) return;
    writeBlobToUsb(blob, filename, '下载').then((ok) => {
      if (ok) toast(`已同时保存到 U 盘：${filename}`, 'ok', 3200);
    });
  }

  async function buildBackupPackage() {
    if (!window.JSZip) throw new Error('备份组件未加载，请刷新页面后重试。');
    const zip = new window.JSZip();
    const materials = state.materials.map((material) => {
      const { originalBlob, processedBlob, ...meta } = material;
      const record = {
        ...meta,
        originalFile: originalBlob ? `originals/${material.id}__${safeFilename(material.sourceName || material.title)}` : null,
        processedFile: processedBlob ? `processed/${material.id}.doc` : null
      };
      if (originalBlob) zip.file(record.originalFile, originalBlob);
      if (processedBlob) zip.file(record.processedFile, processedBlob);
      return record;
    });
    const papers = state.papers.map((paper) => {
      const { wordBlob, ...meta } = paper;
      const record = {
        ...meta,
        wordFile: wordBlob ? `papers/${paper.id}.doc` : null
      };
      if (wordBlob) zip.file(record.wordFile, wordBlob);
      return record;
    });
    // FileSystemDirectoryHandle 不能写进 JSON；U 盘位置属于这台电脑的设置，
    // 换电脑后应重新选择，所以备份里只保存其他设置。
    const { usbDirectory, ...backupSettings } = state.settings;
    void usbDirectory;
    zip.file('library.json', JSON.stringify({
      app: 'rcs-teacher-library',
      version: 1,
      exportedAt: nowIso(),
      settings: backupSettings,
      materials,
      items: state.items,
      papers
    }, null, 2));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    return {
      blob,
      filename: safeFilename(`教师资料库备份-${todayIsoDate()}`) + '.zip'
    };
  }

  async function exportBackup() {
    toast('正在打包备份，资料多时请稍等…', 'ok', 6000);
    try {
      const { blob, filename } = await buildBackupPackage();
      downloadBlob(blob, filename);
      toast(`备份已导出（${formatBytes(blob.size)}）。建议放到网盘或移动硬盘。`);
    } catch (error) {
      console.error(error);
      toast(`备份失败：${error.message || error}`, 'error', 6000);
    }
  }

  async function backupToUsb() {
    if (!state.usbHandle) {
      toast('请先选择 U 盘文件夹。', 'error', 5200);
      return;
    }
    toast('正在打包并写入 U 盘，资料多时请稍等…', 'ok', 7000);
    try {
      const { blob, filename } = await buildBackupPackage();
      const ok = await writeBlobToUsb(blob, filename, '备份');
      if (ok) toast(`备份已写入 U 盘「备份」文件夹（${formatBytes(blob.size)}）。`, 'ok', 6000);
    } catch (error) {
      console.error(error);
      toast(`备份到 U 盘失败：${error.message || error}`, 'error', 6000);
    }
  }

  function beginRestore(file) {
    if (!file) return;
    state.pendingRestoreFile = file;
    openConfirm({
      title: '导入这份备份？',
      message: `将读取「${file.name}」，并与当前资料库合并。相同 ID 的资料会跳过，不会覆盖现有内容。`,
      confirmText: '导入并合并',
      danger: false,
      onConfirm: () => importBackup(file)
    });
  }

  async function importBackup(file) {
    if (!window.JSZip) {
      toast('备份组件未加载，请刷新页面后重试。', 'error');
      return;
    }
    if (!file) return;
    toast('正在读取备份…', 'ok', 8000);
    try {
      const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
      const libraryFile = zip.file('library.json');
      if (!libraryFile) throw new Error('备份中缺少 library.json。');
      const data = JSON.parse(await libraryFile.async('string'));
      if (!data || data.app !== 'rcs-teacher-library' || !Array.isArray(data.materials)) {
        throw new Error('这不是有效的教师资料库备份。');
      }

      const existingMaterialIds = new Set(state.materials.map((material) => material.id));
      const existingItemIds = new Set(state.items.map((item) => item.id));
      const existingPaperIds = new Set(state.papers.map((paper) => paper.id));
      let materialCount = 0;
      let paperCount = 0;

      for (const meta of data.materials) {
        if (!meta || !meta.id || existingMaterialIds.has(meta.id)) continue;
        const material = { ...meta };
        delete material.originalFile;
        delete material.processedFile;
        if (meta.originalFile) {
          const entry = zip.file(meta.originalFile);
          if (entry) {
            const blob = await entry.async('blob');
            material.originalBlob = blob.slice(0, blob.size, material.sourceType || blob.type || 'application/octet-stream');
            material.originalSize = material.originalBlob.size;
          } else {
            material.originalBlob = null;
            material.originalSize = 0;
          }
        } else {
          material.originalBlob = null;
        }
        if (meta.processedFile) {
          const entry = zip.file(meta.processedFile);
          material.processedBlob = entry ? await entry.async('blob') : null;
          material.processedSize = material.processedBlob ? material.processedBlob.size : 0;
        } else {
          material.processedBlob = null;
          material.processedSize = 0;
        }
        const items = [];
        (data.items || []).forEach((item) => {
          if (item && item.materialId === meta.id && !existingItemIds.has(item.id)) {
            items.push(item);
            existingItemIds.add(item.id);
          }
        });
        await saveMaterialWithItems(material, items);
        existingMaterialIds.add(material.id);
        materialCount += 1;
      }

      for (const meta of (data.papers || [])) {
        if (!meta || !meta.id || existingPaperIds.has(meta.id)) continue;
        const paper = { ...meta };
        delete paper.wordFile;
        if (meta.wordFile) {
          const entry = zip.file(meta.wordFile);
          paper.wordBlob = entry ? await entry.async('blob') : null;
        } else {
          paper.wordBlob = null;
        }
        await dbPut('papers', paper);
        existingPaperIds.add(paper.id);
        paperCount += 1;
      }

      await reloadAndRender();
      toast(`导入完成：新增 ${materialCount} 份资料、${paperCount} 份练习卷。`);
    } catch (error) {
      console.error(error);
      toast(`导入失败：${error.message || error}`, 'error', 7000);
    }
  }

  function confirmClearAll() {
    openConfirm({
      title: '清空全部资料？',
      message: '这会删除当前浏览器里的所有资料、题组、生成记录和练习卷。操作不可撤销，请先导出备份。',
      confirmText: '继续',
      danger: true,
      onConfirm: () => {
        window.setTimeout(() => {
          openConfirm({
            title: '最后确认',
            message: '确定要清空吗？清空后只能通过备份恢复。',
            confirmText: '确定清空',
            danger: true,
            onConfirm: async () => {
              try {
                for (const store of STORES.filter((name) => name !== 'settings')) {
                  await dbClear(store);
                }
                state.currentPaper = null;
                state.currentParsed = null;
                resetPaperPreview();
                await reloadAndRender();
                toast('资料库已清空。', 'ok');
              } catch (error) {
                console.error(error);
                toast(`清空失败：${error.message || error}`, 'error');
              }
            }
          });
        }, 60);
      }
    });
  }

  async function saveSettingsFromUI() {
    const watermark = ($('#watermark-input') ? $('#watermark-input').value : '').trim() || DEFAULT_WATERMARK;
    const defaultGrade = $('#default-grade') ? $('#default-grade').value : '';
    const examTitle = ($('#exam-title') ? $('#exam-title').value : '').trim() || DEFAULT_SETTINGS.examTitle;
    const examOwner = ($('#exam-owner') ? $('#exam-owner').value : '').trim() || DEFAULT_SETTINGS.examOwner;
    const bool = (selector, key) => {
      const input = $(selector);
      return input ? input.checked : DEFAULT_SETTINGS[key] !== false;
    };
    const ocrEnabled = bool('#ocr-enabled', 'ocrEnabled');
    const ocrLang = $('#ocr-lang') && $('#ocr-lang').value === 'eng' ? 'eng' : 'eng+chi_sim';
    const ocrPdfPages = clamp(Number($('#ocr-pages') ? $('#ocr-pages').value : OCR_PDF_PAGE_LIMIT) || OCR_PDF_PAGE_LIMIT, 1, 40);
    try {
      await saveSetting('watermark', watermark);
      await saveSetting('defaultGrade', defaultGrade);
      await saveSetting('examTitle', examTitle);
      await saveSetting('examOwner', examOwner);
      await saveSetting('includeAnswers', bool('#include-answers', 'includeAnswers'));
      await saveSetting('includeVocab', bool('#include-vocab', 'includeVocab'));
      await saveSetting('includeDictation', bool('#include-dictation', 'includeDictation'));
      await saveSetting('showDifficulty', bool('#show-difficulty', 'showDifficulty'));
      await saveSetting('ocrEnabled', ocrEnabled);
      await saveSetting('ocrLang', ocrLang);
      await saveSetting('ocrPdfPages', ocrPdfPages);
      await saveSetting('usbMirror', bool('#usb-mirror', 'usbMirror'));
      await saveSetting('sectionAliases', Array.isArray(state.sectionAliases) ? state.sectionAliases : []);
      if (state.ocrWorker && state.ocrWorkerLang && state.ocrWorkerLang !== ocrLang) {
        try { await state.ocrWorker.terminate(); } catch (error) { /* ignore */ }
        state.ocrWorker = null;
        state.ocrWorkerLang = '';
      }
      toast('设置已保存，之后生成的练习会使用新的版式与 OCR 选项。');
      updateStorage();
    } catch (error) {
      console.error(error);
      toast(`保存设置失败：${error.message || error}`, 'error');
    }
  }

  function setFilterLevel(level) {
    state.filters.level = level === 'junior' || level === 'senior' ? level : '';
    $$('#filter-level [data-level]').forEach((button) => {
      const active = (button.dataset.level || '') === state.filters.level;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    populateGradeFilter();
    renderLibrary();
  }

  function resetFilters() {
    state.filters = { q: '', type: '', grade: '', level: '', sort: 'newest' };
    const search = $('#library-search');
    const type = $('#filter-type');
    const grade = $('#filter-grade');
    const sort = $('#sort-materials');
    if (search) search.value = '';
    if (type) type.value = '';
    if (grade) grade.value = '';
    if (sort) sort.value = 'newest';
    setFilterLevel('');
    renderLibrary();
  }

  /* ------------------------------------------------------------------------
     事件绑定
     ------------------------------------------------------------------------ */

  function bindEvents() {
    window.addEventListener('hashchange', applyRouteFromHash);
    window.addEventListener('resize', debounce(() => {
      if (state.paperFrame) fitPaperFrame(state.paperFrame);
    }, 180));

    const fileInput = $('#file-input');
    const pickFiles = $('#pick-files');
    const dropzone = $('#dropzone');
    if (pickFiles && fileInput) {
      pickFiles.addEventListener('click', (event) => {
        event.stopPropagation();
        fileInput.click();
      });
    }
    if (fileInput) {
      fileInput.addEventListener('change', (event) => {
        const files = Array.from(event.target.files || []);
        event.target.value = '';
        if (files.length) handleFiles(files);
      });
    }
    if (dropzone) {
      dropzone.addEventListener('click', (event) => {
        if (event.target.closest('button, input')) return;
        if (fileInput) fileInput.click();
      });
      ['dragenter', 'dragover'].forEach((type) => {
        dropzone.addEventListener(type, (event) => {
          event.preventDefault();
          event.stopPropagation();
          dropzone.classList.add('is-dragging');
        });
      });
      ['dragleave', 'drop'].forEach((type) => {
        dropzone.addEventListener(type, (event) => {
          event.preventDefault();
          event.stopPropagation();
          dropzone.classList.remove('is-dragging');
        });
      });
      dropzone.addEventListener('drop', (event) => {
        const files = Array.from(event.dataTransfer.files || []);
        if (files.length) handleFiles(files);
      });
    }
    window.addEventListener('dragover', (event) => event.preventDefault());
    window.addEventListener('drop', (event) => {
      if (dropzone && dropzone.contains(event.target)) return;
      event.preventDefault();
    });

    const search = $('#library-search');
    if (search) {
      search.addEventListener('input', debounce(() => {
        state.filters.q = search.value;
        renderLibrary();
      }, 160));
    }
    const levelFilter = $('#filter-level');
    if (levelFilter) {
      levelFilter.addEventListener('click', (event) => {
        const button = event.target.closest('[data-level]');
        if (!button) return;
        setFilterLevel(button.dataset.level || '');
      });
    }
    const practiceLevel = $('#practice-level');
    if (practiceLevel) {
      practiceLevel.addEventListener('click', (event) => {
        const button = event.target.closest('[data-level]');
        if (!button) return;
        state.practiceLevel = button.dataset.level === 'junior' || button.dataset.level === 'senior'
          ? button.dataset.level
          : '';
        $$('#practice-level [data-level]').forEach((item) => {
          const active = (item.dataset.level || '') === state.practiceLevel;
          item.classList.toggle('is-active', active);
          item.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
      });
    }
    const typeFilter = $('#filter-type');
    if (typeFilter) {
      typeFilter.addEventListener('change', () => {
        state.filters.type = typeFilter.value;
        renderLibrary();
      });
    }
    const gradeFilter = $('#filter-grade');
    if (gradeFilter) {
      gradeFilter.addEventListener('change', () => {
        state.filters.grade = gradeFilter.value;
        renderLibrary();
      });
    }
    const sort = $('#sort-materials');
    if (sort) {
      sort.addEventListener('change', () => {
        state.filters.sort = sort.value;
        renderLibrary();
      });
    }

    document.addEventListener('click', handleGlobalAction);
    bindQuestionEditorEvents();

    const generateButton = $('#generate-paper');
    const commandInput = $('#command-input');
    if (generateButton) {
      generateButton.addEventListener('click', () => { runGeneration(commandInput ? commandInput.value : ''); });
    }
    if (commandInput) {
      commandInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          runGeneration(commandInput.value);
        }
      });
    }
    $$('.example-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        if (commandInput) commandInput.value = chip.dataset.command || '';
        runGeneration(chip.dataset.command || '');
      });
    });

    const editDialog = $('#edit-dialog');
    if (editDialog) {
      editDialog.addEventListener('close', () => {
        if (editDialog.returnValue === 'save') {
          saveEditDialog();
        }
        editDialog.returnValue = '';
      });
    }
    const pasteDialog = $('#paste-dialog');
    if (pasteDialog) {
      pasteDialog.addEventListener('close', () => {
        if (pasteDialog.returnValue === 'save') savePasteDialog();
        pasteDialog.returnValue = '';
      });
    }
    const aiDialog = $('#ai-dialog');
    if (aiDialog) {
      aiDialog.addEventListener('close', () => {
        const value = aiDialog.returnValue;
        aiDialog.returnValue = '';
        if (value === 'apply') applyAiResult();
      });
    }
    const splitDialog = $('#split-dialog');
    if (splitDialog) {
      splitDialog.addEventListener('close', () => {
        splitDialog.returnValue = '';
      });
    }
    const confirmDialog = $('#confirm-dialog');
    if (confirmDialog) {
      confirmDialog.addEventListener('close', () => {
        const action = state.confirmAction;
        state.confirmAction = null;
        if (confirmDialog.returnValue === 'confirm' && action) {
          try {
            action();
          } catch (error) {
            console.error(error);
            toast('操作没有完成，请重试。', 'error');
          }
        }
        confirmDialog.returnValue = '';
      });
    }

    const restoreInput = $('#restore-input');
    if (restoreInput) {
      restoreInput.addEventListener('change', (event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = '';
        if (file) beginRestore(file);
      });
    }

    const pasteForm = $('#paste-form');
    if (pasteForm) {
      pasteForm.addEventListener('submit', () => {
        // 表单通过 method=dialog 关闭；保存逻辑在 close 事件里统一处理。
      });
    }
  }

  async function handleGlobalAction(event) {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) {
      event.preventDefault();
      go(viewButton.dataset.view);
      return;
    }

    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const card = button.closest('[data-id]');
    const paperCard = button.closest('[data-paper-id]');
    const id = card ? card.dataset.id : null;
    const paperId = paperCard ? paperCard.dataset.paperId : null;

    try {
      switch (action) {
        case 'backup':
          await exportBackup();
          break;
        case 'restore': {
          const input = $('#restore-input');
          if (input) input.click();
          break;
        }
        case 'persist':
          await requestPersistence(true);
          break;
        case 'save-settings':
          await saveSettingsFromUI();
          break;
        case 'add-alias':
          await addSectionAlias();
          break;
        case 'delete-alias':
          await deleteSectionAlias(button.dataset.alias || '', button.dataset.type || '');
          break;
        case 'seed-aliases':
          await seedSectionAliases();
          break;
        case 'pick-usb':
          await pickUsbFolder();
          break;
        case 'backup-usb':
          await backupToUsb();
          break;
        case 'clear-all':
          confirmClearAll();
          break;
        case 'paste':
          openPasteDialog();
          break;
        case 'samples':
          await loadSamples();
          break;
        case 'clear-filters':
          resetFilters();
          break;
        case 'preview':
        case 'edit':
          if (id) openEditDialog(id);
          break;
        case 'ai-split':
          if (id) openSplitDialog(id);
          break;
        case 'questions':
          if (id) openQuestionEditor('material', id);
          break;
        case 'questions-paper':
          if (paperId) openQuestionEditor('paper', paperId);
          break;
        case 'ai-clean': {
          const material = findMaterial(id);
          const sourceText = material
            ? [material.body || material.text || '', material.answers ? `参考答案\n${material.answers}` : ''].filter(Boolean).join('\n\n')
            : '';
          if (material) await applyAiClean(material, sourceText);
          break;
        }
        case 'ai-key-save':
          saveLibraryAiKey();
          break;
        case 'ai-key-test':
          await testLibraryAiKey();
          break;
        case 'ai-key-clear':
          clearLibraryAiKey();
          break;
        case 'save-question-edits':
          await saveQuestionEdits();
          break;
        case 'copy-split-prompt':
          await copySplitPrompt();
          break;
        case 'apply-split':
          await applySplitResult();
          break;
        case 'download-original': {
          const material = findMaterial(id);
          downloadOriginal(material);
          break;
        }
        case 'download-processed': {
          const material = findMaterial(id);
          downloadProcessed(material);
          break;
        }
        case 'delete-material':
          if (id) confirmDeleteMaterial(id);
          break;
        case 'preview-paper': {
          const paper = findPaper(paperId);
          await previewPaper(paper);
          break;
        }
        case 'download-paper': {
          const paper = findPaper(paperId);
          downloadPaperWord(paper);
          break;
        }
        case 'delete-paper':
          if (paperId) confirmDeletePaper(paperId);
          break;
        case 'reshuffle':
          await reshuffleCurrent();
          break;
        case 'download-word':
          downloadCurrentWord();
          break;
        case 'print-pdf':
          printCurrentPaper();
          break;
        case 'save-paper':
          await saveCurrentPaper();
          break;
        case 'ai-analysis':
          openAiDialog('analysis');
          break;
        case 'ai-vocab':
          openAiDialog('vocab');
          break;
        case 'copy-ai-prompt':
          await copyAiPrompt();
          break;
        case 'download-vocab':
          downloadPaperVocabulary(state.currentPaper, 'vocab');
          break;
        case 'download-dictation':
          downloadPaperVocabulary(state.currentPaper, 'dictation');
          break;
        case 'download-long-sentences':
          downloadLongSentences(state.currentPaper);
          break;
        default:
          break;
      }
    } catch (error) {
      console.error('Action failed:', action, error);
      toast(`操作失败：${error.message || error}`, 'error');
    }
  }

  /* ------------------------------------------------------------------------
     启动
     ------------------------------------------------------------------------ */

  async function init() {
    ensureGradeOptions();
    populateTypeSelects();
    bindEvents();
    hydrateSettingsUI();
    renderAiSettings();
    loadWordDictionary();
    try {
      state.db = await openDB();
      await loadData();
      await migrateParserCache();
      populateGradeFilter();
      hydrateSettingsUI();
      applyRouteFromHash();
      renderAll();
      await updateStorage();
    } catch (error) {
      console.error(error);
      toast(`资料库初始化失败：${error.message || error}`, 'error', 9000);
      const list = $('#material-list');
      if (list) {
        list.innerHTML = `<div class="empty-state"><span class="empty-icon"><svg class="icon" aria-hidden="true"><use href="#i-alert"/></svg></span>` +
          `<h3>本机资料库没有打开</h3><p>${escapeHtml(error.message || error)}</p>` +
          `<p>请确认浏览器没有禁用网站数据，或换用最新版 Edge / Chrome。</p></div>`;
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
