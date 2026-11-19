/* ==========================================================================
   顺势 · 学生端 / 教师端 共用工具
   ========================================================================== */
(function () {
  'use strict';

  const ATTRS = [
    { key: 'vocab', name: '词汇', color: '#d96e51' },
    { key: 'grammar', name: '语法', color: '#b07f39' },
    { key: 'reading', name: '阅读', color: '#3d8f9c' },
    { key: 'writing', name: '写作', color: '#8a74b8' },
    { key: 'listening', name: '听说', color: '#3f8f74' }
  ];

  const BLOCK_LABELS = {
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

  const RANKS = [
    { min: 1, name: '初窥门径' },
    { min: 3, name: '渐入佳境' },
    { min: 6, name: '登堂入室' },
    { min: 9, name: '融会贯通' },
    { min: 12, name: '出神入化' }
  ];

  function $(selector, root) { return (root || document).querySelector(selector); }
  function $$(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function uid(prefix) {
    const time = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).slice(2, 6).toUpperCase();
    return `${prefix || 'ID'}-${time}-${random}`;
  }

  function todayIso() {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  }

  function nowIso() { return new Date().toISOString(); }

  function parseIsoDate(value) {
    const text = String(value || '').slice(0, 10);
    const parts = text.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }

  function fmtDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  function fmtDateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
  }

  function daysBetween(a, b) {
    const da = parseIsoDate(a);
    const db = parseIsoDate(b);
    if (!da || !db) return 0;
    return Math.round((db - da) / 86400000);
  }

  function addDays(iso, days) {
    const d = parseIsoDate(iso) || new Date();
    d.setDate(d.getDate() + days);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${month}-${day}`;
  }

  function streakFromCheckins(checkins) {
    const set = new Set((checkins || []).map((item) => String(item).slice(0, 10)));
    if (!set.size) return 0;
    const today = todayIso();
    let cursor = set.has(today) ? today : addDays(today, -1);
    if (!set.has(cursor)) return 0;
    let streak = 0;
    while (set.has(cursor)) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  function levelInfo(xp) {
    const total = Math.max(0, Number(xp) || 0);
    let level = 1;
    let start = 0;
    let need = 100;
    while (total >= start + need) {
      start += need;
      level += 1;
      need = 100 + (level - 1) * 40;
    }
    let rank = RANKS[0].name;
    RANKS.forEach((item) => { if (level >= item.min) rank = item.name; });
    return {
      level,
      start,
      need,
      current: total - start,
      progress: Math.max(0, Math.min(1, (total - start) / need)),
      rank,
      total
    };
  }

  function emptyAttrs() {
    const attrs = {};
    ATTRS.forEach((attr) => { attrs[attr.key] = { c: 0, t: 0 }; });
    return attrs;
  }

  function normalizeAttrs(raw) {
    const out = emptyAttrs();
    if (!raw || typeof raw !== 'object') return out;
    ATTRS.forEach((attr) => {
      const stat = raw[attr.key];
      if (stat && Number.isFinite(Number(stat.c)) && Number.isFinite(Number(stat.t))) {
        out[attr.key] = { c: Math.max(0, Number(stat.c)), t: Math.max(0, Number(stat.t)) };
      }
    });
    return out;
  }

  function attrScore(stat) {
    if (!stat || !stat.t) return 50;
    return Math.max(0, Math.min(100, Math.round((stat.c / stat.t) * 100)));
  }

  function attrDisplay(stat) {
    if (!stat || !stat.t) return { value: 50, label: '待评估', empty: true };
    return { value: attrScore(stat), label: `${Math.round(stat.c)}/${Math.round(stat.t)}`, empty: false };
  }

  // 每种题型对五项属性的权重。权重加起来为 1，便于按题累计。
  const BLOCK_ATTR_WEIGHTS = {
    single: { vocab: 0.5, grammar: 0.5 },
    cloze: { reading: 0.7, vocab: 0.3 },
    reading: { reading: 1 },
    five: { reading: 0.8, grammar: 0.2 },
    grammar: { grammar: 0.7, vocab: 0.3 },
    dialogue: { listening: 0.7, vocab: 0.3 },
    listening: { listening: 1 },
    picture: { writing: 0.8, grammar: 0.2 },
    writing: { writing: 1 },
    other: { reading: 0.5, grammar: 0.5 }
  };

  function applyAttrResult(attrs, type, correct, total) {
    const weights = BLOCK_ATTR_WEIGHTS[type] || BLOCK_ATTR_WEIGHTS.other;
    const c = Number(correct) || 0;
    const t = Number(total) || 0;
    if (!t) return;
    Object.entries(weights).forEach(([key, weight]) => {
      if (!attrs[key]) attrs[key] = { c: 0, t: 0 };
      attrs[key].c += c * weight;
      attrs[key].t += t * weight;
    });
  }

  function normalizeAnswerText(value) {
    return String(value == null ? '' : value)
      .trim()
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, ' ')
      .replace(/[.。,，;；!！?？]+$/g, '');
  }

  function isCorrectAnswer(question, answer) {
    if (!question) return null;
    const expected = String(question.answer == null ? '' : question.answer).trim();
    if (!expected) return null;
    if (Array.isArray(question.options) && question.options.length) {
      return String(answer || '').trim().toUpperCase() === expected.toUpperCase();
    }
    return normalizeAnswerText(answer) === normalizeAnswerText(expected);
  }

  function getJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      return parsed == null ? fallback : parsed;
    } catch (error) {
      console.warn('读取本机数据失败', key, error);
      return fallback;
    }
  }

  function setJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('保存本机数据失败', error);
      toast('本机存储空间不足，请先导出档案再清理。', 'error', 6000);
      return false;
    }
  }

  function sha256Hex(text) {
    if (window.crypto && window.crypto.subtle && window.TextEncoder) {
      return window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(text)))
        .then((buffer) => Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join(''));
    }
    // 极老浏览器兜底：不是加密哈希，只用于本机校验。
    let hash = 2166136261;
    const source = String(text);
    for (let i = 0; i < source.length; i += 1) {
      hash ^= source.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Promise.resolve((hash >>> 0).toString(16).padStart(8, '0'));
  }

  function bytesToBase64Url(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function base64UrlToBytes(text) {
    let source = String(text || '').replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
    while (source.length % 4) source += '=';
    const binary = atob(source);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  async function packCode(payload) {
    const json = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(json);
    if (window.CompressionStream && window.Response && window.Blob) {
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
        return 'SS1.' + bytesToBase64Url(compressed);
      } catch (error) {
        console.warn('压缩失败，使用未压缩代码', error);
      }
    }
    return 'SS0.' + bytesToBase64Url(bytes);
  }

  async function unpackCode(code) {
    const text = String(code || '').replace(/\s+/g, '');
    if (!text) throw new Error('任务是空的，先把整段代码粘贴进来。');
    const prefix = text.slice(0, 4);
    if (prefix !== 'SS0.' && prefix !== 'SS1.') {
      throw new Error('这不是顺势的代码，请重新复制完整的一整段。');
    }
    let bytes;
    try {
      bytes = base64UrlToBytes(text.slice(4));
    } catch (error) {
      throw new Error('代码里有无法识别的字符，可能没复制完整，请重新复制。');
    }
    let jsonBytes = bytes;
    if (prefix === 'SS1.') {
      if (!window.DecompressionStream) throw new Error('当前浏览器太旧，无法解压代码，请换用新版 Chrome / Edge。');
      try {
        const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        jsonBytes = new Uint8Array(await new Response(stream).arrayBuffer());
      } catch (error) {
        throw new Error('这段代码不完整或已损坏，请让对方重新复制完整的一整段。');
      }
    }
    try {
      return JSON.parse(new TextDecoder().decode(jsonBytes));
    } catch (error) {
      throw new Error('代码内容无法识别，可能没复制完整，请重新复制。');
    }
  }

  async function copyText(text) {
    const value = String(text || '');
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const area = document.createElement('textarea');
    area.value = value;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (error) { ok = false; }
    document.body.removeChild(area);
    if (!ok) throw new Error('复制失败');
    return true;
  }

  function downloadText(filename, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  let toastTimer = null;
  function toast(message, tone, duration) {
    let el = document.querySelector('.p-toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'p-toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = String(message || '');
    el.className = 'p-toast show' + (tone ? ` ${tone}` : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = 'p-toast'; }, duration || 3200);
  }

  function openDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function closeDialog(dialog) {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  }

  function bindDialogClose(root) {
    $$('[data-close]', root || document).forEach((button) => {
      button.addEventListener('click', () => {
        const dialog = button.closest('dialog');
        closeDialog(dialog);
      });
    });
    $$('dialog.p-dialog', root || document).forEach((dialog) => {
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) closeDialog(dialog);
      });
    });
  }

  function blockLabel(type) { return BLOCK_LABELS[type] || BLOCK_LABELS.other; }

  function attrMeta(key) { return ATTRS.find((item) => item.key === key) || ATTRS[0]; }

  /* ------------------------------------------------------------------
     AI 共用设置（学生端不调用；教师端与组卷工作台共享同一份本机配置）
     Key 只存 localStorage，不进入备份码、源码或任何导出文件。
     费用按 DeepSeek Flash 高峰价保守估算：输入 ¥2.2 / 百万 tokens，
     输出 ¥8.6 / 百万 tokens。实际以 DeepSeek 账单为准。
     ------------------------------------------------------------------ */
  const AI_STORAGE_KEY = 'shunshi.ai.v1';
  const AI_ENDPOINT = 'https://api.deepseek.com/chat/completions';
  const AI_MODEL = 'deepseek-flash';
  const AI_PRICE = { input: 2.2, output: 8.6 };

  function aiAggregateLog(log) {
    const map = new Map();
    (Array.isArray(log) ? log : []).forEach((item) => {
      if (!item || !item.at) return;
      const key = String(item.source || '其他').slice(0, 40);
      const row = map.get(key) || { source: key, tokens: 0, input: 0, output: 0, cost: 0, calls: 0, lastAt: '' };
      row.tokens += Number(item.tokens) || 0;
      row.input += Number(item.input) || 0;
      row.output += Number(item.output) || 0;
      row.cost += Number(item.cost) || 0;
      row.calls += 1;
      if (!row.lastAt || String(item.at) > row.lastAt) row.lastAt = String(item.at);
      map.set(key, row);
    });
    return Array.from(map.values()).sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
  }

  function normalizeAiSources(raw, log) {
    const rows = Array.isArray(raw)
      ? raw
        .filter((item) => item && item.source)
        .map((item) => ({
          source: String(item.source).slice(0, 40),
          tokens: Math.max(0, Number(item.tokens) || 0),
          input: Math.max(0, Number(item.input) || 0),
          output: Math.max(0, Number(item.output) || 0),
          cost: Math.max(0, Number(item.cost) || 0),
          calls: Math.max(0, Number(item.calls) || 0),
          lastAt: String(item.lastAt || '')
        }))
        .sort((a, b) => b.cost - a.cost || b.tokens - a.tokens)
      : [];
    /* 旧版本只存了最近 200 条 log：升级后先用这些明细补出来源汇总，
       之后每次调用都会在 sources 里永久累加，不再受明细条数限制。 */
    return rows.length ? rows : aiAggregateLog(log);
  }

  function normalizeAiConfig(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const log = Array.isArray(source.log) ? source.log.filter((item) => item && item.at).slice(0, 200) : [];
    return {
      key: String(source.key || '').trim(),
      model: String(source.model || AI_MODEL),
      inputTokens: Math.max(0, Number(source.inputTokens) || 0),
      outputTokens: Math.max(0, Number(source.outputTokens) || 0),
      totalTokens: Math.max(0, Number(source.totalTokens) || 0),
      calls: Math.max(0, Number(source.calls) || 0),
      cost: Math.max(0, Number(source.cost) || 0),
      sources: normalizeAiSources(source.sources, log),
      log
    };
  }

  function aiConfig() {
    return normalizeAiConfig(getJSON(AI_STORAGE_KEY, null));
  }

  function saveAiConfigObject(cfg) {
    setJSON(AI_STORAGE_KEY, normalizeAiConfig(cfg));
  }

  function aiCostFor(usage) {
    const input = Math.max(0, Number(usage && usage.prompt_tokens) || 0);
    const output = Math.max(0, Number(usage && usage.completion_tokens) || 0);
    return (input * AI_PRICE.input + output * AI_PRICE.output) / 1000000;
  }

  function aiCostText(value) {
    const yuan = Math.max(0, Number(value) || 0);
    if (yuan <= 0) return '¥0';
    if (yuan < 0.0001) return '<¥0.0001';
    return `¥${yuan.toFixed(4)}`;
  }

  function aiRecordCall(source, usage) {
    const cfg = aiConfig();
    const input = Math.max(0, Number(usage && usage.prompt_tokens) || 0);
    const output = Math.max(0, Number(usage && usage.completion_tokens) || 0);
    const total = Math.max(0, Number(usage && usage.total_tokens) || (input + output));
    const cost = aiCostFor({ prompt_tokens: input, completion_tokens: output });
    const label = String(source || 'AI 调用').slice(0, 40);
    const at = nowIso();
    cfg.inputTokens += input;
    cfg.outputTokens += output;
    cfg.totalTokens += total;
    cfg.calls += 1;
    cfg.cost = Math.round((cfg.cost + cost) * 1000000) / 1000000;
    let row = cfg.sources.find((item) => item.source === label);
    if (!row) {
      row = { source: label, tokens: 0, input: 0, output: 0, cost: 0, calls: 0, lastAt: '' };
      cfg.sources.push(row);
    }
    row.tokens += total;
    row.input += input;
    row.output += output;
    row.cost = Math.round((row.cost + cost) * 1000000) / 1000000;
    row.calls += 1;
    row.lastAt = at;
    cfg.sources.sort((a, b) => b.cost - a.cost || b.tokens - a.tokens);
    cfg.log.unshift({
      at,
      source: label,
      tokens: total,
      input,
      output,
      cost: Math.round(cost * 1000000) / 1000000
    });
    cfg.log = cfg.log.slice(0, 200);
    saveAiConfigObject(cfg);
    return { total, input, output, cost };
  }

  function aiUsageSummary() {
    const cfg = aiConfig();
    const sources = cfg.sources.length ? cfg.sources : aiAggregateLog(cfg.log);
    return { config: cfg, sources };
  }

  async function aiCall(messages, maxTokens, source) {
    const cfg = aiConfig();
    if (!cfg.key) throw new Error('还没有配置 API Key，请到“设置 → AI 直连”粘贴并保存。');
    const response = await fetch(AI_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.key}`
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: 0.3,
        max_tokens: Math.max(160, Math.min(4000, Number(maxTokens) || 700)),
        stream: false,
        thinking: { type: 'disabled' }
      })
    });
    if (!response.ok) {
      let detail = '';
      try {
        const error = await response.json();
        detail = (error.error && error.error.message) || '';
      } catch (error) { /* ignore */ }
      const hints = {
        401: 'Key 无效或已失效',
        402: '账户余额不足',
        429: '调用太频繁，等一会儿再试',
        500: 'DeepSeek 服务暂时不可用'
      };
      throw new Error(`${hints[response.status] || '调用失败'}（HTTP ${response.status}）${detail ? `：${detail}` : ''}`);
    }
    const json = await response.json();
    const choice = (json.choices || [])[0] || {};
    const text = String((choice.message && choice.message.content) || '').trim();
    if (!text) throw new Error('这次没有返回内容，请再试一次。');
    const usage = json.usage || {};
    const record = aiRecordCall(source, usage);
    return {
      text,
      usage,
      finishReason: choice.finish_reason || '',
      cost: record.cost,
      tokens: record.total
    };
  }

  function aiEstimateCost(chars, maxOutput) {
    const input = Math.ceil(Math.max(0, Number(chars) || 0) / 1.6);
    const output = Math.max(0, Number(maxOutput) || 0);
    return {
      inputTokens: input,
      maxOutputTokens: output,
      cost: (input * AI_PRICE.input + output * AI_PRICE.output) / 1000000
    };
  }

  function greeting() {
    const hour = new Date().getHours();
    if (hour < 6) return '夜深了';
    if (hour < 11) return '早上好';
    if (hour < 14) return '中午好';
    if (hour < 18) return '下午好';
    return '晚上好';
  }

  window.Shunshi = {
    ATTRS,
    BLOCK_LABELS,
    $,
    $$,
    escapeHtml,
    uid,
    todayIso,
    nowIso,
    fmtDate,
    fmtDateTime,
    daysBetween,
    addDays,
    streakFromCheckins,
    levelInfo,
    emptyAttrs,
    normalizeAttrs,
    attrScore,
    attrDisplay,
    applyAttrResult,
    isCorrectAnswer,
    normalizeAnswerText,
    getJSON,
    setJSON,
    sha256Hex,
    packCode,
    unpackCode,
    copyText,
    downloadText,
    toast,
    openDialog,
    closeDialog,
    bindDialogClose,
    blockLabel,
    attrMeta,
    greeting,
    ai: {
      config: aiConfig,
      save: saveAiConfigObject,
      call: aiCall,
      summary: aiUsageSummary,
      costFor: aiCostFor,
      costText: aiCostText,
      estimate: aiEstimateCost,
      price: AI_PRICE,
      storageKey: AI_STORAGE_KEY,
      endpoint: AI_ENDPOINT,
      model: AI_MODEL
    }
  };
})();
