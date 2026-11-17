/* ==========================================================================
   阮蔡顺 · 教师工作台
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
  const DEFAULT_WATERMARK = '阮蔡顺 · 初高中英语 · 仅供学习';
  const MAX_FILE_BYTES = 60 * 1024 * 1024;
  const MAX_PDF_PAGES = 60;
  const VIEWS = new Set(['library', 'upload', 'practice', 'settings']);

  const TYPES = {
    single: { label: '单项选择', short: '单选', unit: '道', order: 1 },
    cloze: { label: '完形填空', short: '完形', unit: '篇', order: 2 },
    reading: { label: '阅读理解', short: '阅读', unit: '篇', order: 3 },
    five: { label: '五选五', short: '五选五', unit: '篇', order: 4 },
    grammar: { label: '语法填空', short: '语法', unit: '篇', order: 5 },
    writing: { label: '书面表达', short: '作文', unit: '篇', order: 6 },
    listening: { label: '听力理解', short: '听力', unit: '套', order: 7 },
    paper: { label: '练习卷', short: '练习卷', unit: '份', order: 8 },
    other: { label: '其他资料', short: '其他', unit: '份', order: 9 }
  };

  const TYPE_ORDER = Object.keys(TYPES).sort((a, b) => TYPES[a].order - TYPES[b].order);

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
      strong: ['阅读理解', '阅读下列短文', 'reading comprehension', 'read the passage'],
      weak: ['阅读']
    },
    five: {
      strong: ['五选五', '七选五', '阅读填句', '阅读七选五', '补全短文'],
      weak: ['选五', '阅读填空']
    },
    grammar: {
      strong: ['语法填空', 'grammatical fill', 'fill in the blanks with the correct form'],
      weak: ['语法']
    },
    writing: {
      strong: ['书面表达', '应用文写作', '写作题', '作文题', 'writing task', 'write a composition'],
      weak: ['作文', '写作']
    },
    listening: {
      strong: ['听力测试', '听力理解', 'listening comprehension'],
      weak: ['听力', 'listening']
    }
  };

  const SECTION_NOTES = {
    single: '从每题所给选项中，选出最佳选项。',
    cloze: '阅读下面短文，从每题所给选项中选出最佳选项。',
    reading: '阅读下列短文，从每题所给选项中选出最佳选项。',
    five: '从方框中选择合适的句子补全短文。',
    grammar: '在空白处填入适当的内容（1 个单词）或括号内单词的正确形式。',
    writing: '根据提示，完成写作。',
    listening: '听录音，完成练习。'
  };

  const GRADE_OPTIONS = ['七年级', '八年级', '九年级', '高一', '高二', '高三', '中考', '高考', '初中', '高中'];

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
    five: ['阅读七选五', '五选五', '七选五', '阅读填句', '补全短文', '选五'],
    grammar: ['语法填空', '语法'],
    writing: ['应用文写作', '书面表达', '作文', '写作'],
    listening: ['听力理解', '听力', 'listening']
  };

  const CN_NUMS = {
    '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10
  };

  const DEFAULT_SETTINGS = {
    watermark: DEFAULT_WATERMARK,
    defaultGrade: ''
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
    filters: { q: '', type: '', grade: '', sort: 'newest' },
    currentPaper: null,
    currentParsed: null,
    editId: null,
    confirmAction: null,
    pendingRestoreFile: null,
    busy: false,
    persistenceRequested: false,
    samplesBusy: false
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

  function toDisplayText(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .replace(/ /g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
      .trim();
  }

  function isCjk(char) {
    return /[㐀-鿿぀-ヿ]/.test(char || '');
  }

  function typeLabel(type) {
    return (TYPES[type] || TYPES.other).label;
  }

  function typeShort(type) {
    return (TYPES[type] || TYPES.other).short;
  }

  function typeUnit(type) {
    return (TYPES[type] || TYPES.other).unit;
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
  }

  async function saveSetting(key, value) {
    await dbPut('settings', { key, value });
    state.settings[key] = value;
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
      .filter(([key]) => key !== 'paper')
      .sort((a, b) => a[1].order - b[1].order)
      .map(([key, def]) => `<option value="${key}">${escapeHtml(def.label)}</option>`)
      .join('');
    if (current && TYPES[current]) select.value = current;
  }

  function populateTypeSelects() {
    populateTypeSelect($('#edit-type'));
    populateTypeSelect($('#paste-type'));
    const filter = $('#filter-type');
    if (filter) {
      filter.innerHTML = `<option value="">全部题型</option>${Object.entries(TYPES)
        .filter(([key]) => key !== 'paper')
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
    const grades = unique([
      ...GRADE_OPTIONS,
      ...state.materials.map((material) => material.grade).filter(Boolean)
    ]);
    select.innerHTML = `<option value="">全部年级</option>${grades
      .map((grade) => `<option value="${escapeAttr(grade)}">${escapeHtml(grade)}</option>`)
      .join('')}`;
    if (current && grades.includes(current)) select.value = current;
  }

  function hydrateSettingsUI() {
    const watermark = $('#watermark-input');
    const grade = $('#default-grade');
    if (watermark) watermark.value = watermarkText();
    if (grade) grade.value = state.settings.defaultGrade || '';
  }

  /* ------------------------------------------------------------------------
     文件读取与解析
     ------------------------------------------------------------------------ */

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

    for (const file of files) {
      const queueRow = addQueueRow(file);
      try {
        if (file.size > MAX_FILE_BYTES) {
          throw new Error(`文件超过 ${formatBytes(MAX_FILE_BYTES)}，请压缩或拆分后再上传。`);
        }
        setQueueStatus(queueRow, '读取文件…', 'working');
        const material = await buildMaterialFromFile(file);
        setQueueStatus(queueRow, '识别题型、生成整理版…', 'working');
        const items = buildItemsForMaterial(material);
        material.questionCount = items.length;
        material.processedBlob = makeMaterialBlob(material);
        material.processedSize = material.processedBlob ? material.processedBlob.size : 0;
        await saveMaterialWithItems(material, items);
        ok += 1;
        const countUnit = material.type === 'single' ? '道' : '组';
        setQueueStatus(
          queueRow,
          items.length
            ? `已入库 · ${typeLabel(material.type)}${material.grade ? ` · ${material.grade}` : ''} · ${items.length} ${countUnit}`
            : `已存档 · ${material.note || '未提取到题目'}`,
          'done'
        );
      } catch (error) {
        failed += 1;
        console.error('Import failed:', file.name, error);
        setQueueStatus(queueRow, error && error.message ? error.message : '处理失败', 'error');
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

  async function buildMaterialFromFile(file) {
    const extension = (file.name.split('.').pop() || '').toLowerCase();
    let text = '';
    let extractionNote = '';

    try {
      const result = await extractFileText(file, extension);
      text = result.text || '';
      extractionNote = result.note || '';
    } catch (error) {
      extractionNote = `未能自动提取文字：${error.message || error}。原文件已完整保存。`;
      text = '';
    }

    text = toDisplayText(text);
    const split = splitAnswerSection(text);
    const body = toDisplayText(split.body);
    const answers = toDisplayText(split.answers);
    const classified = classifyMaterial(file.name, body || text);
    const grade = classified.grade || state.settings.defaultGrade || '';
    const tags = unique([
      ...(classified.tags || []),
      ...(grade ? [grade] : []),
      '自动入库'
    ]);
    const noteParts = [];
    if (extractionNote) noteParts.push(extractionNote);
    if (classified.note) noteParts.push(classified.note);
    if (!body) noteParts.push('正文为空，可打开资料信息手动补充文字。');
    if (classified.confidence < 45) noteParts.push('自动识别把握不高，建议核对题型。');

    const id = uid();
    return {
      id,
      title: classified.title,
      type: classified.type,
      grade,
      tags,
      text,
      body,
      answers,
      note: unique(noteParts).join(' '),
      sourceName: file.name,
      sourceType: file.type || extension,
      sourceExtension: extension,
      originalBlob: file,
      originalSize: file.size,
      processedBlob: null,
      processedSize: 0,
      confidence: classified.confidence,
      autoType: classified.type,
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
  }

  async function extractFileText(file, extension) {
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
      return extractPdfText(file);
    }
    if (extension === 'doc') {
      return {
        text: '',
        note: '旧版 .doc 已完整存档，暂不能提取文字。可用 Word 另存为 .docx 后重新上传，或直接手动补充文字。'
      };
    }
    if (['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'].includes(extension)) {
      return {
        text: '',
        note: '图片资料已完整存档；当前版本暂不支持 OCR，可在资料信息里手动补充文字。'
      };
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

  async function extractPdfText(file) {
    const pdfjs = await loadPdfLibrary();
    let pdf = null;
    try {
      const data = new Uint8Array(await file.arrayBuffer());
      pdf = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
      const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
      const pages = [];
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const lines = groupPdfTextItems(content.items);
        if (lines.length) pages.push(lines.join('\n'));
      }
      const text = toDisplayText(pages.join('\n\n'));
      const notes = [];
      if (!text) notes.push('PDF 中没有提取到可复制的文字，可能是扫描版或纯图片；原文件已完整保存。');
      if (pdf.numPages > MAX_PDF_PAGES) notes.push(`PDF 共 ${pdf.numPages} 页，已提取前 ${MAX_PDF_PAGES} 页。`);
      return { text, note: notes.join(' ') };
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
     题型识别与标题
     ------------------------------------------------------------------------ */

  function classifyMaterial(fileName, text) {
    const baseName = String(fileName || '').replace(/\.[^.]+$/, '');
    const body = String(text || '').slice(0, 80000);
    const head = body.slice(0, 4500);
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

    const optionLines = (body.match(/(?:^|\n)\s*[A-DＡ-Ｄ][.、．)）]\s+/g) || []).length;
    const questionNumbers = (body.match(/(?:^|\n)\s*\d{1,3}[.、．)）]\s+/g) || []).length;
    const blankCount = (body.match(/_{2,}|\(\s*\)|（\s*）/g) || []).length;
    if (scores.single) {
      scores.single += Math.min(optionLines, 24) * 0.32 + Math.min(questionNumbers, 20) * 0.16;
    }
    if (scores.grammar) {
      scores.grammar += Math.min(blankCount, 30) * 0.1;
    }
    if (scores.writing) {
      if (/(词左右|字数|写一封|写一篇|写邮件|write an email|write a letter)/i.test(body)) scores.writing += 2.2;
    }
    if (scores.five > 0) scores.reading *= 0.55;
    if (scores.grammar > 0) scores.single *= 0.9;
    if (scores.cloze > 0) scores.reading *= 0.9;

    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [bestType, bestScore] = ranked[0] || ['other', 0];
    const total = ranked.reduce((sum, entry) => sum + Math.max(entry[1], 0), 0);
    let confidence = total > 0 ? Math.round((bestScore / total) * 100) : 0;
    let type = bestScore >= 3.2 ? bestType : 'other';
    if (type === 'other') confidence = 0;

    if (type === 'single' && optionLines < 2) type = 'other';
    if (type === 'writing' && !/(书面表达|作文|写作|writing|composition)/i.test(baseName + head)) {
      type = 'other';
    }

    const grade = detectGrade(`${baseName}\n${head}`);
    const title = cleanTitle(baseName, type);
    const tags = [typeShort(type), ...(grade ? [grade] : [])];
    const note = type === 'other'
      ? '暂未识别出明确题型，请在上传后核对并修改。'
      : '';

    return {
      type,
      confidence: type === 'other' ? 0 : Math.min(100, confidence),
      grade,
      title,
      tags,
      note
    };
  }

  function detectGrade(text) {
    const source = String(text || '');
    if (/(高一|高中一年级)/.test(source)) return '高一';
    if (/(高二|高中二年级)/.test(source)) return '高二';
    if (/(高三|高中三年级)/.test(source)) return '高三';
    if (/(七年级|初一)/.test(source)) return '七年级';
    if (/(八年级|初二)/.test(source)) return '八年级';
    if (/(九年级|初三)/.test(source)) return '九年级';
    if (/(中考)/.test(source)) return '中考';
    if (/(高考)/.test(source)) return '高考';
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

  function buildItemsForMaterial(material) {
    const body = material.body || material.text || '';
    if (!String(body).trim()) return [];
    const base = {
      materialId: material.id,
      type: material.type,
      grade: material.grade || '',
      createdAt: nowIso()
    };

    if (material.type === 'single') {
      const questions = extractSingleQuestions(body);
      if (questions.length) {
        return questions.map((question, index) => ({
          ...base,
          id: uid(),
          kind: 'question',
          order: index + 1,
          content: question.content
        }));
      }
    }

    return [{
      ...base,
      id: uid(),
      kind: 'set',
      order: 1,
      content: body
    }];
  }

  function extractSingleQuestions(text) {
    const normalized = String(text || '').replace(/\r\n?/g, '\n');
    const starts = [];
    const pattern = /(?:^|\n)[ \t]*(\d{1,3})[.、．)）]\s*/g;
    let match = pattern.exec(normalized);
    while (match) {
      starts.push({
        index: match.index + (match[0].startsWith('\n') ? 1 : 0),
        contentStart: pattern.lastIndex
      });
      match = pattern.exec(normalized);
    }
    if (!starts.length) return [];

    const chunks = [];
    starts.forEach((start, index) => {
      const end = index + 1 < starts.length ? starts[index + 1].index : normalized.length;
      const chunk = normalized.slice(start.contentStart, end).trim();
      if (chunk.length < 6) return;
      const optionMarkers = (chunk.match(/(?:^|[\s\n])[A-DＡ-Ｄ][.、．)）]/g) || []).length;
      const hasBlank = /_{2,}|\(\s*\)|（\s*）/.test(chunk);
      if (optionMarkers >= 2 || hasBlank) {
        chunks.push({ content: chunk });
      }
    });
    return chunks;
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
    const answerBlock = answers
      ? `<section class="doc-answers"><h2>参考答案</h2>${textToDocHtml(answers)}</section>`
      : '';
    return watermarkLayerHtml('doc-watermark') +
      `<article class="doc">` +
      `<p class="doc-kicker">阮蔡顺 · 初高中英语 · 教学资料</p>` +
      `<h1>${escapeHtml(material.title)}</h1>` +
      `<p class="doc-meta">${meta}</p>` +
      `<div class="doc-body">${textToDocHtml(body)}</div>` +
      `${answerBlock}` +
      `<footer class="doc-footer">${escapeHtml(watermarkText())}</footer>` +
      `</article>`;
  }

  function docStyles() {
    return `
      @page { size: A4; margin: 2cm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #1f2b33; background: #fff; font-family: "SimSun", "Songti SC", "Microsoft YaHei", serif; font-size: 12pt; line-height: 1.85; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
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

  function wrapWordDocument(title, bodyHtml) {
    return '<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
      `<head><meta charset="utf-8"><meta http-equiv="Content-Type" content="text/html; charset=utf-8">` +
      `<title>${escapeHtml(title)}</title><style>${docStyles()}</style></head>` +
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

  function defaultRequests() {
    const preferred = [
      { type: 'single', count: 5 },
      { type: 'cloze', count: 1 },
      { type: 'reading', count: 1 },
      { type: 'grammar', count: 1 },
      { type: 'writing', count: 1 }
    ];
    const available = preferred.filter((request) => state.items.some((item) => item.type === request.type));
    if (available.length) return available;
    return [
      { type: 'single', count: 5 },
      { type: 'reading', count: 1 }
    ];
  }

  function parseCommand(raw) {
    const text = normalizeCommandText(raw);
    const grade = detectGrade(text);
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

    let notes = [];
    let effectiveRequests = requests;
    if (!effectiveRequests.length) {
      effectiveRequests = defaultRequests();
      notes.push('未指定题型，已按今日默认组合抽取。');
    }

    const order = new Map(TYPE_ORDER.map((type, index) => [type, index]));
    effectiveRequests.sort((a, b) => (order.get(a.type) ?? 99) - (order.get(b.type) ?? 99));

    return {
      raw: text,
      grade,
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

  function selectItemsForRequest(request, requestedGrade) {
    const label = typeShort(request.type);
    const kind = request.type === 'single' ? 'question' : 'set';
    let pool = state.items.filter((item) => item.type === request.type && item.kind === kind);
    if (!pool.length) {
      return { items: [], warning: `资料库中还没有可用的「${label}」题目。` };
    }

    let warnings = [];
    if (requestedGrade) {
      const strict = pool.filter((item) => gradeMatches(item.grade, requestedGrade));
      if (strict.length) {
        pool = strict;
      } else {
        warnings.push(`「${requestedGrade}」暂无${label}，已从全部年级的资料中抽取。`);
      }
    }

    if (request.count > pool.length) {
      warnings.push(`${label}只有 ${pool.length} ${typeUnit(request.type)}，已全部选入。`);
    }

    const picked = shuffle(pool).slice(0, Math.max(1, request.count));
    return { items: picked, warning: warnings.join(' ') };
  }

  function generatePaperFromCommand(parsed) {
    if (!state.items.length) return null;
    const sections = [];
    const warnings = [...parsed.notes];
    const usedItemIds = [];
    const usedMaterialIds = [];

    parsed.requests.forEach((request) => {
      const selection = selectItemsForRequest(request, parsed.grade);
      if (selection.warning) warnings.push(selection.warning);
      if (!selection.items.length) return;
      sections.push({
        type: request.type,
        requested: request.count,
        unit: typeUnit(request.type),
        items: selection.items.map((item) => ({
          id: item.id,
          materialId: item.materialId,
          content: item.content,
          kind: item.kind
        }))
      });
      selection.items.forEach((item) => {
        usedItemIds.push(item.id);
        usedMaterialIds.push(item.materialId);
      });
    });

    if (!sections.length) return null;

    const total = sections.reduce((sum, section) => sum + section.items.length, 0);
    const paper = {
      id: uid(),
      title: `每日练习 · ${todayCn()}`,
      date: todayIsoDate(),
      createdAt: nowIso(),
      command: parsed.raw,
      grade: parsed.grade || '',
      sections,
      warnings: unique(warnings),
      total,
      itemIds: unique(usedItemIds),
      materialIds: unique(usedMaterialIds)
    };
    return paper;
  }

  function buildPaperBody(paper) {
    let questionNumber = 0;
    const sectionLabels = ['一', '二', '三', '四', '五', '六', '七', '八'];
    const sections = paper.sections.map((section, index) => {
      const def = TYPES[section.type] || TYPES.other;
      let content = '';
      if (section.type === 'single') {
        content = section.items.map((item) => {
          questionNumber += 1;
          const lines = String(item.content || '').replace(/\r\n?/g, '\n').split('\n');
          const first = escapeHtml(lines[0] || '');
          const rest = lines.slice(1).map((line) => `<br>${escapeHtml(line)}`).join('');
          return `<div class="paper-question"><p><span class="q-num">${questionNumber}.</span> ${first}${rest}</p></div>`;
        }).join('');
      } else if (section.type === 'writing') {
        content = section.items.map((item) => (
          `<div class="paper-question">${textToDocHtml(item.content)}` +
          `<div class="writing-lines" aria-hidden="true">${'<i></i>'.repeat(10)}</div></div>`
        )).join('');
      } else {
        content = section.items.map((item) => (
          `<div class="paper-question">${textToDocHtml(item.content)}</div>`
        )).join('');
      }
      return `<section class="paper-section">` +
        `<div class="paper-section-title"><strong>${sectionLabels[index] || (index + 1)}、${escapeHtml(def.label)}</strong>` +
        `<span>${escapeHtml(SECTION_NOTES[section.type] || '')}</span></div>` +
        content +
        `</section>`;
    }).join('');

    return watermarkLayerHtml('watermark-layer') +
      `<header class="paper-head">` +
      `<p class="paper-kicker">Daily Practice · 每日练习</p>` +
      `<h1>${escapeHtml(paper.grade ? `${paper.grade} · 英语每日练习` : '英语每日练习')}</h1>` +
      `<div class="paper-meta">` +
      `<span>日期：${escapeHtml(paper.date || todayIsoDate())}</span>` +
      `<span>姓名：____________</span>` +
      `<span>用时：______</span>` +
      `<span>共 ${paper.total} 题 / 篇</span>` +
      `</div></header>` +
      sections +
      `<footer class="paper-foot">${escapeHtml(watermarkText())} · 阮蔡顺 · 初高中英语</footer>`;
  }

  function paperStyles() {
    return `
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; }
      body { color: #1f2b33; background: #e9e4d8; font-family: "Songti SC", "SimSun", "Microsoft YaHei", serif; font-size: 14px; line-height: 1.9; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .sheet { position: relative; overflow: hidden; width: 820px; max-width: 100%; min-height: 1000px; margin: 20px auto; padding: 48px 52px 56px; background: #fffdf8; box-shadow: 0 12px 34px -22px rgba(27, 52, 77, 0.5); }
      .watermark-layer { position: absolute; inset: 0; z-index: 0; display: grid; grid-template-columns: repeat(3, 1fr); grid-auto-rows: 150px; gap: 8px; overflow: hidden; pointer-events: none; }
      .watermark-layer span { align-self: center; justify-self: center; color: rgba(27, 52, 77, 0.075); font-family: "Microsoft YaHei", "PingFang SC", sans-serif; font-size: 12px; line-height: 1; white-space: nowrap; transform: rotate(-28deg); }
      .sheet > *:not(.watermark-layer) { position: relative; z-index: 1; }
      .paper-head { padding-bottom: 14px; border-bottom: 2px solid #1b344d; text-align: center; }
      .paper-kicker { margin: 0; color: #9e3f3c; font-family: "Century Gothic", "Trebuchet MS", sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.2em; }
      .paper-head h1 { margin: 4px 0 0; color: #1b344d; font-family: "YouYuan", "Microsoft YaHei", sans-serif; font-size: 24px; line-height: 1.4; }
      .paper-meta { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 18px; margin-top: 8px; color: #5d666c; font-size: 11px; }
      .paper-section { margin-top: 22px; }
      .paper-section-title { display: flex; align-items: baseline; gap: 8px; padding-bottom: 5px; border-bottom: 1px solid #c9c2b2; }
      .paper-section-title strong { color: #1b344d; font-family: "YouYuan", "Microsoft YaHei", sans-serif; font-size: 15px; }
      .paper-section-title span { color: #7b8185; font-size: 10px; }
      .paper-question { margin-top: 12px; break-inside: avoid; page-break-inside: avoid; }
      .paper-question p { margin: 0; }
      .q-num { color: #9e3f3c; font-weight: 700; }
      .paper-text p { margin: 5px 0 0; }
      .writing-lines { margin-top: 10px; padding: 8px 0; }
      .writing-lines i { display: block; height: 26px; border-bottom: 1px solid #ddd6c8; }
      .paper-foot { margin-top: 30px; padding-top: 10px; border-top: 1px solid #c9c2b2; color: #8a8f92; font-size: 10px; text-align: center; }
      @media (max-width: 700px) {
        .sheet { width: 100%; min-height: 0; margin: 0; padding: 28px 20px 36px; box-shadow: none; }
        .paper-head h1 { font-size: 20px; }
        .paper-meta { gap: 4px 10px; font-size: 10px; }
        .paper-section-title { flex-wrap: wrap; gap: 2px 8px; }
        .watermark-layer { grid-template-columns: repeat(2, 1fr); grid-auto-rows: 140px; }
      }
      @page { size: A4; margin: 16mm 15mm; }
      @media print {
        body { background: #fff; }
        .sheet { width: auto; min-height: 0; margin: 0; padding: 0; background: #fff; box-shadow: none; overflow: visible; }
        .watermark-layer { position: fixed; inset: 0; }
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
      if (state.filters.type && material.type !== state.filters.type) return false;
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
      const def = TYPES[material.type] || TYPES.other;
      const unit = material.type === 'single' ? '道' : '篇';
      const count = material.questionCount || 0;
      const tags = (material.tags || []).slice(0, 5).map((tag) => `<span class="mini-tag">${escapeHtml(tag)}</span>`).join('');
      const confidence = Number.isFinite(material.confidence) && material.confidence > 0
        ? `<i class="dot"></i><span>识别 ${material.confidence}%</span>`
        : '';
      const originalButton = material.originalBlob
        ? `<button class="icon-btn" type="button" data-action="download-original" title="下载原文件" aria-label="下载原文件"><svg class="icon" aria-hidden="true"><use href="#i-file"/></svg></button>`
        : '';
      const processedButton = material.processedBlob
        ? `<button class="icon-btn" type="button" data-action="download-processed" title="下载整理版" aria-label="下载整理版"><svg class="icon" aria-hidden="true"><use href="#i-download"/></svg></button>`
        : '';
      return `<article class="material-card" data-id="${escapeAttr(material.id)}">` +
        `<span class="type-badge" data-type="${escapeAttr(material.type)}">${escapeHtml(def.short)}</span>` +
        `<div class="material-main">` +
        `<h3 class="material-title" title="${escapeAttr(material.title)}">${escapeHtml(material.title)}</h3>` +
        `<p class="material-meta">` +
        `<span>${escapeHtml(material.grade || '未标注年级')}</span><i class="dot"></i>` +
        `<span>${escapeHtml(formatDate(material.createdAt))}</span><i class="dot"></i>` +
        `<span>${count ? `${count} ${unit}` : '仅存档'}</span>${confidence}` +
        `</p>` +
        (tags ? `<div class="material-tags">${tags}</div>` : '') +
        `</div>` +
        `<div class="material-actions">` +
        `<button class="icon-btn" type="button" data-action="preview" title="预览 / 修改" aria-label="预览或修改资料"><svg class="icon" aria-hidden="true"><use href="#i-eye"/></svg></button>` +
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
    const grade = parsed.grade ? `<span class="result-chip">${escapeHtml(parsed.grade)}</span>` : '';
    const warnings = paper && paper.warnings && paper.warnings.length
      ? `<p class="result-warning">${escapeHtml(paper.warnings.join(' '))}</p>`
      : '';
    container.innerHTML = `<span>识别为</span>${grade}${chips}${warnings}`;
    container.classList.add('is-visible');
  }

  function renderPaper(paper) {
    const preview = $('#paper-preview');
    if (!preview) return;
    preview.innerHTML = `<div class="sheet">${buildPaperBody(paper)}</div>`;
    const meta = $('#paper-meta-label');
    if (meta) meta.textContent = `${paper.grade || '综合'} · ${paper.total} 题 / 篇 · ${formatDate(paper.createdAt, true)}`;
    const buttons = ['reshuffle', 'download-word', 'print-pdf', 'save-paper'];
    buttons.forEach((action) => {
      const button = $(`[data-action="${action}"]`);
      if (button) button.disabled = false;
    });
  }

  function resetPaperPreview() {
    state.currentPaper = null;
    state.currentParsed = null;
    const preview = $('#paper-preview');
    if (preview) {
      preview.innerHTML = `<div class="practice-empty">` +
        `<svg class="icon" aria-hidden="true"><use href="#i-compose"/></svg>` +
        `<h3>还没有生成练习</h3>` +
        `<p>在上面的指令框里写下年级、题型和数量，或者点一个示例开始。</p></div>`;
    }
    const meta = $('#paper-meta-label');
    if (meta) meta.textContent = '生成后会在这里排版预览。';
    ['reshuffle', 'download-word', 'print-pdf', 'save-paper'].forEach((action) => {
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
    const body = toDisplayText(split.body);
    const answers = toDisplayText(split.answers);

    const updated = {
      ...material,
      title: title || `${typeLabel(type)} · ${todayCn()}`,
      type,
      grade,
      tags: unique([...tags, ...(grade ? [grade] : [])]),
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

  function previewPaper(paper) {
    if (!paper) return;
    const html = paper.html || buildStandalonePaperHtml(paper);
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
    const blob = paper.wordBlob || makePaperWordBlob(paper);
    downloadBlob(blob, paperFilename(paper, '.doc'));
  }

  /* ------------------------------------------------------------------------
     组卷操作
     ------------------------------------------------------------------------ */

  function runGeneration(rawCommand) {
    if (!state.db) {
      toast('资料库还在打开中，请稍等。', 'error');
      return;
    }
    if (!state.items.length) {
      toast('资料库还没有可抽取的题目，请先上传资料或载入示例。', 'error', 5200);
      return;
    }
    const parsed = parseCommand(rawCommand);
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
    toast(`已生成 ${paper.total} 题 / 篇，可下载或存入练习卷。`);
  }

  function reshuffleCurrent() {
    if (!state.currentParsed) {
      toast('请先生成一份练习。', 'error');
      return;
    }
    const parsed = parseCommand(state.currentParsed.raw);
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
      const html = buildStandalonePaperHtml(paper);
      const wordBlob = makePaperWordBlob(paper);
      const record = {
        ...paper,
        html,
        wordBlob,
        savedAt: nowIso()
      };
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
    const text = toDisplayText($('#paste-text').value);
    if (!title || !text) return;
    const split = splitAnswerSection(text);
    const body = toDisplayText(split.body);
    const answers = toDisplayText(split.answers);
    const material = {
      id: uid(),
      title,
      type,
      grade,
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

  async function exportBackup() {
    if (!window.JSZip) {
      toast('备份组件未加载，请刷新页面后重试。', 'error');
      return;
    }
    toast('正在打包备份，资料多时请稍等…', 'ok', 6000);
    try {
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
      zip.file('library.json', JSON.stringify({
        app: 'rcs-teacher-library',
        version: 1,
        exportedAt: nowIso(),
        settings: state.settings,
        materials,
        items: state.items,
        papers
      }, null, 2));
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      downloadBlob(blob, safeFilename(`教师资料库备份-${todayIsoDate()}`) + '.zip');
      toast(`备份已导出（${formatBytes(blob.size)}）。建议放到网盘或移动硬盘。`);
    } catch (error) {
      console.error(error);
      toast(`备份失败：${error.message || error}`, 'error', 6000);
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
    const watermark = $('#watermark-input').value.trim() || DEFAULT_WATERMARK;
    const defaultGrade = $('#default-grade').value;
    try {
      await saveSetting('watermark', watermark);
      await saveSetting('defaultGrade', defaultGrade);
      toast('设置已保存，之后生成的文档会使用新的水印。');
      updateStorage();
    } catch (error) {
      console.error(error);
      toast(`保存设置失败：${error.message || error}`, 'error');
    }
  }

  function resetFilters() {
    state.filters = { q: '', type: '', grade: '', sort: 'newest' };
    const search = $('#library-search');
    const type = $('#filter-type');
    const grade = $('#filter-grade');
    const sort = $('#sort-materials');
    if (search) search.value = '';
    if (type) type.value = '';
    if (grade) grade.value = '';
    if (sort) sort.value = 'newest';
    renderLibrary();
  }

  /* ------------------------------------------------------------------------
     事件绑定
     ------------------------------------------------------------------------ */

  function bindEvents() {
    window.addEventListener('hashchange', applyRouteFromHash);

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

    const generateButton = $('#generate-paper');
    const commandInput = $('#command-input');
    if (generateButton) {
      generateButton.addEventListener('click', () => runGeneration(commandInput ? commandInput.value : ''));
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
          previewPaper(paper);
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
          reshuffleCurrent();
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
    try {
      state.db = await openDB();
      await loadData();
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

  // 方便在浏览器控制台检查和调试；不会把资料发送到任何地方。
  window.LibraryApp = {
    state,
    parseCommand,
    classifyMaterial,
    extractSingleQuestions,
    handleFiles,
    buildMaterialFromFile,
    loadSamples,
    runGeneration
  };
})();
