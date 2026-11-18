/* ==========================================================================
   顺势 · 学习心得共用工具
   主页与教师端共用：清洗文章、渲染轻量排版、生成发布文件。
   正文只支持最简单的标记：## 小标题、- 列表、> 引用、**加粗**。
   ========================================================================== */
(function () {
  'use strict';

  const MAX_TITLE = 80;
  const MAX_EXCERPT = 120;
  const MAX_BODY = 12000;
  const MAX_TAGS = 4;

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function todayIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function cleanDate(value) {
    const text = String(value || '').trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : todayIso();
  }

  function formatDateLong(value) {
    const text = cleanDate(value);
    const [year, month, day] = text.split('-').map(Number);
    return `${year}年${month}月${day}日`;
  }

  function formatDateShort(value) {
    const text = cleanDate(value);
    const [, month, day] = text.split('-');
    return `${Number(month)}.${day}`;
  }

  function normalizeTags(raw) {
    let list = [];
    if (Array.isArray(raw)) list = raw;
    else list = String(raw || '').split(/[,，、;；\s]+/);
    const seen = new Set();
    const out = [];
    list.forEach((item) => {
      const tag = String(item || '').trim().replace(/^#/, '').slice(0, 12);
      if (!tag || seen.has(tag)) return;
      seen.add(tag);
      out.push(tag);
    });
    return out.slice(0, MAX_TAGS);
  }

  function stripMarkup(text) {
    return String(text || '')
      .replace(/\r\n/g, '\n')
      .replace(/^\s*#{2,3}\s+/gm, '')
      .replace(/^\s*[-*]\s+/gm, '')
      .replace(/^\s*>\s?/gm, '')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  function excerptOf(post, maxLength) {
    const custom = String(post && post.excerpt || '').trim();
    if (custom) return custom.slice(0, MAX_EXCERPT);
    const plain = stripMarkup(post && post.body).replace(/\n/g, ' ').trim();
    const limit = maxLength || 70;
    return plain.length > limit ? `${plain.slice(0, limit)}…` : plain;
  }

  function normalizePost(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = String(raw.title || '').trim().slice(0, MAX_TITLE);
    const body = String(raw.body || '').replace(/\r\n/g, '\n').trim().slice(0, MAX_BODY);
    if (!title || !body) return null;
    return {
      id: String(raw.id || '').trim().slice(0, 60) || `LOG-${Date.now().toString(36).toUpperCase()}`,
      title,
      date: cleanDate(raw.date),
      tags: normalizeTags(raw.tags),
      excerpt: String(raw.excerpt || '').trim().slice(0, MAX_EXCERPT),
      body
    };
  }

  function normalizePosts(rawList) {
    if (!Array.isArray(rawList)) return [];
    const seen = new Set();
    return rawList.map(normalizePost).filter((post) => {
      if (!post || seen.has(post.id)) return false;
      seen.add(post.id);
      return true;
    });
  }

  function inline(text) {
    return escapeHtml(text)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  }

  function renderBody(text) {
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let paragraph = [];
    let list = [];
    let quote = [];

    function flushParagraph() {
      if (!paragraph.length) return;
      out.push(`<p>${paragraph.map(inline).join('<br>')}</p>`);
      paragraph = [];
    }
    function flushList() {
      if (!list.length) return;
      out.push(`<ul>${list.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`);
      list = [];
    }
    function flushQuote() {
      if (!quote.length) return;
      out.push(`<blockquote>${quote.map(inline).join('<br>')}</blockquote>`);
      quote = [];
    }
    function flushAll() {
      flushParagraph();
      flushList();
      flushQuote();
    }

    lines.forEach((line) => {
      const value = line.trim();
      if (!value) { flushAll(); return; }
      if (/^###\s+/.test(value)) {
        flushAll();
        out.push(`<h4>${inline(value.replace(/^###\s+/, ''))}</h4>`);
        return;
      }
      if (/^##\s+/.test(value)) {
        flushAll();
        out.push(`<h3>${inline(value.replace(/^##\s+/, ''))}</h3>`);
        return;
      }
      if (/^[-*]\s+/.test(value)) {
        flushParagraph();
        flushQuote();
        list.push(value.replace(/^[-*]\s+/, ''));
        return;
      }
      if (/^>\s?/.test(value)) {
        flushParagraph();
        flushList();
        quote.push(value.replace(/^>\s?/, ''));
        return;
      }
      flushList();
      flushQuote();
      paragraph.push(value);
    });
    flushAll();
    return out.join('');
  }

  function clonePosts(posts) {
    return normalizePosts(posts).map((post) => ({
      ...post,
      tags: post.tags.slice()
    }));
  }

  function publishedPosts() {
    const source = window.SHUNSHI_INSIGHTS;
    return normalizePosts(source && source.posts);
  }

  function samePosts(a, b) {
    return JSON.stringify(normalizePosts(a)) === JSON.stringify(normalizePosts(b));
  }

  function buildFile(posts, updatedAt) {
    const payload = {
      version: 1,
      updatedAt: updatedAt || new Date().toISOString(),
      posts: normalizePosts(posts)
    };
    return '/* 由顺势教师端导出。此文件用于主页公开展示，请勿写入学生隐私。 */\n' +
      'window.SHUNSHI_INSIGHTS = ' + JSON.stringify(payload, null, 2) + ';\n';
  }

  window.ShunshiInsightCore = {
    MAX_TITLE,
    MAX_EXCERPT,
    MAX_BODY,
    MAX_TAGS,
    escapeHtml,
    todayIso,
    cleanDate,
    formatDateLong,
    formatDateShort,
    normalizeTags,
    stripMarkup,
    excerptOf,
    normalizePost,
    normalizePosts,
    renderBody,
    clonePosts,
    publishedPosts,
    samePosts,
    buildFile
  };
})();
