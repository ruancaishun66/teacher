/* 顺势 · 原题排版
 * 把 PDF / Word 里的题目按原位置切成图片，保留原来的字体、题号、选项和分栏。
 * 全部在浏览器本机完成，不上传文件，也不调用 AI。
 */
(function () {
  'use strict';

  var PDF_SCALE = 2.6;
  var MAX_PDF_PAGES = 80;
  var PAD = 6;
  var MIN_MATCH = 5;

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function report(handler, message, progress) {
    if (typeof handler !== 'function') return;
    try {
      handler({ stage: 'visual', status: message, progress: progress || 0 });
    } catch (error) {
      /* 进度提示失败不影响生成。 */
    }
  }

  function loadScript(src, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = function () {
        if (window[globalName]) resolve(window[globalName]);
        else reject(new Error(globalName + ' 组件加载失败。'));
      };
      script.onerror = function () {
        reject(new Error('无法加载原样排版组件（' + src + '）。'));
      };
      document.head.appendChild(script);
    });
  }

  var pdfLibraryPromise = null;
  function loadPdfLibrary() {
    if (window.pdfjsLib) {
      configurePdfWorker();
      return Promise.resolve(window.pdfjsLib);
    }
    if (!pdfLibraryPromise) {
      pdfLibraryPromise = loadScript('vendor/pdf.min.js', 'pdfjsLib').then(function (lib) {
        configurePdfWorker();
        return lib;
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

  function compact(text) {
    return String(text || '')
      .replace(/ /g, ' ')
      // 只留字母、数字和汉字：原文里的破折号、下划线、引号常和解析结果对不上，
      // 保留符号会让「—Where…」和「- Where…」匹配失败，题目就被从选项行开始切。
      .replace(/[^0-9a-zA-ZÀ-ɏ㐀-鿿]+/g, '')
      .toLowerCase();
  }

  function meaningfulLines(text) {
    return String(text || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(function (line) { return line.trim(); })
      .filter(function (line) { return line.length > 0; });
  }

  function isCjk(char) {
    return /[㐀-鿿豈-﫿]/.test(char || '');
  }

  function joinParts(parts) {
    var line = '';
    var previous = null;
    parts.forEach(function (part) {
      var text = part.text || '';
      if (!text) return;
      if (previous) {
        var gap = part.x - (previous.x + previous.width);
        var left = line.trim().slice(-1);
        var right = text.trim().slice(0, 1);
        if (gap > 1.8
          && !isCjk(left) && !isCjk(right)
          && !/\s$/.test(line) && !/^\s/.test(text)) {
          line += ' ';
        }
      }
      line += text;
      previous = part;
    });
    return line.replace(/[ \t]+/g, ' ').trim();
  }

  // 试卷 PDF 常把一页排成两栏。若按整页同一基线拼行，左栏的阅读原文会和
  // 右栏的题目拼成一行，原题图片就会从错误的位置切开。这里先找整页的竖向
  // 空白缝，再按“左栏从上到下、右栏从上到下”的顺序读；找不到缝就照旧单栏读。
  function splitPdfColumns(items) {
    var boxes = [];
    (items || []).forEach(function (item) {
      var text = item && item.str;
      if (!text || !text.trim()) return;
      var transform = item.transform || [];
      var x = Number(transform[4]);
      var y = Number(transform[5]);
      var width = Number(item.width) || 0;
      if (!Number.isFinite(x) || !Number.isFinite(y) || width <= 0) return;
      boxes.push({ item: item, x: x, y: y, width: width });
    });
    if (boxes.length < 8) return [items];
    var minX = Math.min.apply(null, boxes.map(function (box) { return box.x; }));
    var maxX = Math.max.apply(null, boxes.map(function (box) { return box.x + box.width; }));
    var minY = Math.min.apply(null, boxes.map(function (box) { return box.y; }));
    var maxY = Math.max.apply(null, boxes.map(function (box) { return box.y; }));
    var pageWidth = maxX - minX;
    var pageHeight = maxY - minY;
    if (!(pageWidth > 60)) return [items];
    var narrow = boxes.filter(function (box) {
      if (box.width >= pageWidth * 0.5) return false;
      if (pageHeight > 20 && (box.y < minY + pageHeight * 0.08 || box.y > maxY - pageHeight * 0.05)) return false;
      var text = String(box.item.str || '').trim();
      if (text.length >= 6) {
        var meaningful = (text.match(/[A-Za-z0-9㐀-鿿]/g) || []).length;
        if (meaningful / text.length < 0.5) return false;
      }
      return true;
    });
    if (narrow.length < 6) return [items];
    var cover = new Uint16Array(Math.ceil(maxX) + 2);
    narrow.forEach(function (box) {
      var from = Math.max(0, Math.floor(box.x));
      var to = Math.min(cover.length - 1, Math.ceil(box.x + box.width));
      for (var x = from; x <= to; x += 1) cover[x] += 1;
    });
    var gutters = [];
    var start = null;
    for (var x = Math.floor(minX); x <= Math.ceil(maxX); x += 1) {
      if (cover[x] === 0) {
        if (start === null) start = x;
      } else if (start !== null) {
        var end = x;
        var mid = (start + end) / 2;
        if (end - start >= 8 && mid > minX + pageWidth * 0.16 && mid < maxX - pageWidth * 0.16) {
          gutters.push([start, end]);
        }
        start = null;
      }
    }
    if (!gutters.length) return [items];
    var boundaries = gutters
      .sort(function (a, b) { return (b[1] - b[0]) - (a[1] - a[0]); })
      .slice(0, 2)
      .map(function (gutter) { return (gutter[0] + gutter[1]) / 2; })
      .sort(function (a, b) { return a - b; });
    var buckets = [];
    for (var b = 0; b < boundaries.length + 1; b += 1) buckets.push([]);
    boxes.forEach(function (box) {
      var center = box.x + box.width / 2;
      var index = 0;
      while (index < boundaries.length && center >= boundaries[index]) index += 1;
      buckets[index].push(box.item);
    });
    var kept = buckets.filter(function (bucket) { return bucket.length >= Math.max(4, boxes.length * 0.08); });
    return kept.length >= 2 ? kept : [items];
  }

  function groupPdfRows(items, viewport) {
    var rows = [];
    (items || []).forEach(function (item) {
      var text = item && item.str;
      if (!text || !text.trim()) return;
      var transform = item.transform || [];
      var x = Number(transform[4]);
      var y = Number(transform[5]);
      var height = Math.abs(Number(transform[3])) || Number(item.height) || 10;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      var top = viewport.height - y - height;
      var bottom = viewport.height - y;
      var row = null;
      for (var i = 0; i < rows.length; i += 1) {
        if (Math.abs(rows[i].baseline - y) < Math.max(2.2, height * 0.22)) {
          row = rows[i];
          break;
        }
      }
      if (!row) {
        row = { baseline: y, top: top, bottom: bottom, parts: [] };
        rows.push(row);
      }
      row.parts.push({
        x: x,
        width: Number(item.width) || 0,
        text: text,
        top: top,
        bottom: bottom
      });
      row.top = Math.min(row.top, top);
      row.bottom = Math.max(row.bottom, bottom);
    });

    rows.sort(function (a, b) { return a.top - b.top || a.baseline - b.baseline; });
    return rows.map(function (row) {
      row.parts.sort(function (a, b) { return a.x - b.x; });
      var xMin = Infinity;
      var xMax = -Infinity;
      row.parts.forEach(function (part) {
        xMin = Math.min(xMin, part.x);
        xMax = Math.max(xMax, part.x + part.width);
      });
      return {
        text: joinParts(row.parts),
        top: row.top,
        bottom: row.bottom,
        xMin: Number.isFinite(xMin) ? xMin : 0,
        xMax: Number.isFinite(xMax) ? xMax : 0,
        page: row.page
      };
    }).filter(function (line) { return line.text; });
  }

  function groupPdfLines(items, viewport) {
    var groups = splitPdfColumns(items);
    var lines = [];
    groups.forEach(function (group) {
      lines = lines.concat(groupPdfRows(group, viewport));
    });
    return lines;
  }

  async function readPdf(blob, onProgress) {
    var pdfjs = await loadPdfLibrary();
    var data = new Uint8Array(await blob.arrayBuffer());
    var pdf = await pdfjs.getDocument({ data: data, isEvalSupported: false }).promise;
    var total = Math.min(pdf.numPages, MAX_PDF_PAGES);
    var pages = [];
    for (var number = 1; number <= total; number += 1) {
      var page = await pdf.getPage(number);
      var viewport = page.getViewport({ scale: 1 });
      var content = await page.getTextContent();
      var lines = groupPdfLines(content.items, viewport);
      lines.forEach(function (line) { line.page = number; });
      pages.push({
        number: number,
        width: viewport.width,
        height: viewport.height,
        lines: lines
      });
      if (number === total || number % 3 === 0) {
        report(onProgress, '读取原 PDF 第 ' + number + '/' + total + ' 页', number / total * 0.18);
      }
    }
    return { pdf: pdf, pages: pages, total: pdf.numPages, read: total };
  }

  // 原卷行首常带印刷题号，解析出来的题目文字不带题号，比较时把行首数字去掉再试一次。
  function lineKeyVariants(text) {
    var key = compact(text);
    if (!key) return [];
    var noNumber = key.replace(/^\d{1,3}/, '');
    return noNumber && noNumber !== key ? [key, noNumber] : [key];
  }

  function printedNumbers(item) {
    var raw = item && item.sourceNumbers;
    var text = Array.isArray(raw) ? raw.join(' ') : String(raw || '');
    return text.split(/[^0-9]+/)
      .map(Number)
      .filter(function (number) { return number >= 1 && number <= 999; });
  }

  // 万一还是先从选项行对上，就往上找这道题自己的印刷题号，别把题干切掉。
  function pullBackToQuestionNumber(lines, index, item) {
    var numbers = printedNumbers(item);
    if (!numbers.length) return index;
    var current = String((lines[index] && lines[index].text) || '').trim();
    if (!/^[A-Da-d][.、．)]/.test(current)) return index;
    for (var back = index - 1; back >= Math.max(0, index - 4); back -= 1) {
      var text = String((lines[back] && lines[back].text) || '').trim();
      var match = text.match(/^(\d{1,3})\s*[.、．)]/);
      if (match && numbers.indexOf(Number(match[1])) >= 0) return back;
    }
    return index;
  }

  function findLineIndex(lines, source, from, to) {
    var sourceLines = meaningfulLines(source);
    var start = Math.max(0, from || 0);
    var limit = Math.min(to == null ? lines.length : to, lines.length);
    for (var s = 0; s < sourceLines.length && s < 5; s += 1) {
      var key = compact(sourceLines[s]);
      if (key.length < MIN_MATCH) continue;
      var needles = [];
      needles.push(key.slice(0, Math.min(30, key.length)));
      if (key.length > 14) needles.push(key.slice(0, 14));
      if (key.length > 9) needles.push(key.slice(0, 9));
      for (var n = 0; n < needles.length; n += 1) {
        var needle = needles[n];
        if (needle.length < MIN_MATCH) continue;
        for (var i = start; i < limit; i += 1) {
          var lineKeys = lineKeyVariants(lines[i] && lines[i].text);
          for (var k = 0; k < lineKeys.length; k += 1) {
            var lineKey = lineKeys[k];
            if (!lineKey) continue;
            if (lineKey.indexOf(needle) >= 0) return i;
            if (needle.indexOf(lineKey) >= 0 && lineKey.length >= MIN_MATCH + 1) {
              var nextKey = compact((lines[i + 1] && lines[i + 1].text) || '');
              if (needle.indexOf(lineKey + nextKey.slice(0, 12)) >= 0) return i;
            }
          }
        }
      }
    }
    return -1;
  }

  function findStartLine(lines, item, from) {
    var sources = [];
    if (item && item.kind !== 'question' && item.passage && String(item.passage).trim()) {
      sources.push(item.passage);
    }
    if (item && item.content) sources.push(item.content);
    if (item && item.passage) sources.push(item.passage);
    var firstQuestion = item && item.questions && item.questions[0];
    if (firstQuestion && firstQuestion.stem) sources.push(firstQuestion.stem);

    for (var i = 0; i < sources.length; i += 1) {
      var index = findLineIndex(lines, sources[i], from || 0, lines.length);
      if (index >= 0) {
        index = pullBackToQuestionNumber(lines, index, item);
        // 篇目标签 A/B/C 常单独占一行；向前补一行，保住原卷的篇目字母。
        for (var back = index - 1; back >= Math.max(0, index - 2); back -= 1) {
          var text = String((lines[back] && lines[back].text) || '').trim();
          if (/^[A-E][.、．]?$/.test(text)) {
            return back;
          }
        }
        return index;
      }
    }
    return -1;
  }

  function sequentialStarts(items, lines) {
    var cursor = 0;
    return items.map(function (item) {
      var found = findStartLine(lines, item, cursor);
      if (found < 0) found = findStartLine(lines, item, 0);
      if (found >= cursor) cursor = found;
      return found;
    });
  }

  function findEndLine(lines, item, start, limit) {
    var source = (item && (item.content || item.passage)) || '';
    var sourceLines = meaningfulLines(source);
    var max = Math.min(limit, lines.length);
    for (var s = sourceLines.length - 1; s >= 0 && s >= sourceLines.length - 5; s -= 1) {
      var key = compact(sourceLines[s]);
      if (key.length < MIN_MATCH) continue;
      var needles = [
        key.slice(0, Math.min(26, key.length)),
        key.slice(Math.max(0, key.length - 26))
      ];
      for (var n = 0; n < needles.length; n += 1) {
        var needle = needles[n];
        if (needle.length < MIN_MATCH) continue;
        for (var i = max - 1; i >= start; i -= 1) {
          var lineKeys = lineKeyVariants(lines[i] && lines[i].text);
          for (var k = 0; k < lineKeys.length; k += 1) {
            if (lineKeys[k] && lineKeys[k].indexOf(needle) >= 0) return i;
          }
        }
      }
    }
    return -1;
  }

  function isAnswerHeading(text) {
    return /^(?:参考答案|答案与解析|答案详解|答案速查|参考答案与解析|答案|解析)[:：]?$/.test(String(text || '').trim());
  }

  function isSectionHeading(text) {
    var value = String(text || '').trim();
    if (!value || value.length > 60) return false;
    if (!/^(?:第[一二三四五六七八九十]+部分|[一二三四五六七八九十]+[、.．]|(?:I{1,3}|IV|V|VI{0,3})[、.．])\s*\S/.test(value)) return false;
    return /(听力|单项选择|完形|阅读|语法|写作|书面表达|情景|词汇|判断|填空|选择|交际|看图)/.test(value);
  }

  function findStopLine(lines, start, limit) {
    var max = Math.min(limit, lines.length);
    for (var i = start + 1; i < max; i += 1) {
      var text = lines[i] && lines[i].text;
      if (isAnswerHeading(text) || isSectionHeading(text)) return i;
    }
    return max;
  }

  function usableBounds(page) {
    var lines = (page.lines || []).filter(function (line) { return line.text; });
    if (!lines.length) {
      return { top: 0, bottom: page.height, left: 0, right: page.width };
    }
    var heights = lines.map(function (line) { return Math.max(1, line.bottom - line.top); })
      .sort(function (a, b) { return a - b; });
    var median = heights[Math.floor(heights.length / 2)] || 10;
    var content = lines.filter(function (line) {
      var height = Math.max(1, line.bottom - line.top);
      if (line.top < page.height * 0.055 && height < median * 0.8) return false;
      if (line.bottom > page.height * 0.945 && height < median * 0.8) return false;
      return true;
    });
    if (!content.length) content = lines;
    var top = Math.min.apply(null, content.map(function (line) { return line.top; }));
    var bottom = Math.max.apply(null, content.map(function (line) { return line.bottom; }));
    var left = Math.min.apply(null, content.map(function (line) { return line.xMin; }));
    var right = Math.max.apply(null, content.map(function (line) { return line.xMax; }));
    return {
      top: Math.max(0, top - 4),
      bottom: Math.min(page.height, bottom + 4),
      left: Math.max(0, left - 6),
      right: Math.min(page.width, right + 6)
    };
  }

  function rectsForRange(lines, pagesByNumber, start, end) {
    if (start < 0 || end < start) return [];
    var groups = {};
    for (var i = start; i <= end && i < lines.length; i += 1) {
      var line = lines[i];
      if (!line) continue;
      if (!groups[line.page]) {
        groups[line.page] = { page: line.page, lines: [], first: line, last: line };
      }
      groups[line.page].lines.push(line);
      groups[line.page].last = line;
    }
    var rects = [];
    Object.keys(groups).map(Number).sort(function (a, b) { return a - b; }).forEach(function (pageNumber) {
      var group = groups[pageNumber];
      var page = pagesByNumber[pageNumber];
      if (!page) return;
      var usable = usableBounds(page);
      var isFirst = pageNumber === lines[start].page;
      var isLast = pageNumber === lines[end].page;
      var top = isFirst ? Math.max(0, group.first.top - PAD) : usable.top;
      var bottom = isLast ? Math.min(page.height, group.last.bottom + PAD) : usable.bottom;
      if (bottom - top < 8) return;
      var xMin = Math.min.apply(null, group.lines.map(function (line) { return line.xMin; }));
      var xMax = Math.max.apply(null, group.lines.map(function (line) { return line.xMax; }));
      var left = Math.max(usable.left, xMin - 10);
      var right = Math.min(usable.right, xMax + 10);
      if (right - left < 8) {
        left = usable.left;
        right = usable.right;
      }
      rects.push({
        page: pageNumber,
        x: left,
        y: top,
        w: right - left,
        h: bottom - top
      });
    });
    return rects;
  }

  function locatePdfItems(items, lines, pagesByNumber) {
    var starts = sequentialStarts(items, lines);
    return items.map(function (item, index) {
      var start = starts[index];
      if (start < 0) return [];
      var nextStart = -1;
      for (var n = index + 1; n < starts.length; n += 1) {
        if (starts[n] > start) { nextStart = starts[n]; break; }
      }
      var limit = nextStart > start ? nextStart : lines.length;
      if (nextStart > start) limit = findStopLine(lines, start, limit);
      var end = findEndLine(lines, item, start, limit);
      if (end < start) end = limit - 1;
      if (end < start) return [];
      return rectsForRange(lines, pagesByNumber, start, end);
    });
  }

  async function renderPdfPage(pdf, pageNumber) {
    var page = await pdf.getPage(pageNumber);
    var viewport = page.getViewport({ scale: PDF_SCALE });
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    var context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport: viewport }).promise;
    return canvas;
  }

  function cropCanvas(source, rect, scale) {
    var sx = Math.max(0, Math.round(rect.x * scale));
    var sy = Math.max(0, Math.round(rect.y * scale));
    var sw = Math.min(source.width - sx, Math.round(rect.w * scale));
    var sh = Math.min(source.height - sy, Math.round(rect.h * scale));
    if (sw < 8 || sh < 8) return null;
    var canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    var context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, sw, sh);
    context.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
    return {
      url: canvas.toDataURL('image/jpeg', 0.94),
      width: sw,
      height: sh
    };
  }

  // 扫描版 PDF 没有文字层，原题图片只能靠 OCR 给出的每行坐标来切。
  // Tesseract 返回的行序在分栏页面上不一定可靠，这里按空白竖缝恢复阅读顺序。
  function ocrPageLines(ocrPage, pageNumber) {
    var source = (ocrPage && ocrPage.lines || []).filter(function (line) {
      var box = line && line.bbox;
      return line && line.text && box && [box.x0, box.y0, box.x1, box.y1].every(Number.isFinite);
    });
    if (!source.length) return [];
    var scale = Number(ocrPage.scale) > 0 ? Number(ocrPage.scale) : 1;
    var width = Number(ocrPage.width) || 0;

    function centerX(line) { return (line.bbox.x0 + line.bbox.x1) / 2; }
    function centerY(line) { return (line.bbox.y0 + line.bbox.y1) / 2; }
    function sortRows(list) {
      return list.slice().sort(function (a, b) {
        return a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0;
      });
    }
    function findGutter(list) {
      if (!(width > 40) || list.length < 4) return null;
      var cover = new Uint16Array(Math.ceil(width) + 2);
      list.forEach(function (line) {
        var x0 = Math.max(0, Math.floor(line.bbox.x0));
        var x1 = Math.min(cover.length - 1, Math.ceil(line.bbox.x1));
        for (var x = x0; x <= x1; x += 1) cover[x] += 1;
      });
      var best = null;
      var start = null;
      for (var x = 0; x <= width; x += 1) {
        if (x < width && cover[x] === 0) {
          if (start === null) start = x;
        } else if (start !== null) {
          var end = x;
          var mid = (start + end) / 2;
          var left = list.some(function (line) { return centerX(line) < mid; });
          var right = list.some(function (line) { return centerX(line) >= mid; });
          if (end - start >= 18 && left && right && (!best || end - start > best[1] - best[0])) {
            best = [start, end];
          }
          start = null;
        }
      }
      return best;
    }
    function order(list, depth) {
      if (list.length <= 1 || depth > 8) return sortRows(list);
      var gutter = findGutter(list);
      if (gutter) {
        var mid = (gutter[0] + gutter[1]) / 2;
        var left = list.filter(function (line) { return centerX(line) < mid; });
        var right = list.filter(function (line) { return centerX(line) >= mid; });
        if (left.length && right.length) return order(left, depth + 1).concat(order(right, depth + 1));
      }
      return sortRows(list);
    }

    return order(source, 0).map(function (line) {
      var box = line.bbox;
      return {
        text: String(line.text || '').replace(/[ \t]+/g, ' ').trim(),
        top: box.y0 / scale,
        bottom: box.y1 / scale,
        xMin: box.x0 / scale,
        xMax: box.x1 / scale,
        page: pageNumber
      };
    }).filter(function (line) { return line.text; });
  }

  async function buildPdfVisuals(blob, items, onProgress, ocrPages) {
    report(onProgress, '正在读取原 PDF 的版面…', 0.02);
    var pdfInfo = await readPdf(blob, onProgress);
    var ocrByPage = {};
    (ocrPages || []).forEach(function (page) { ocrByPage[Number(page.page)] = page; });
    var lines = [];
    var pagesByNumber = {};
    pdfInfo.pages.forEach(function (page) {
      var pageTextLength = page.lines.reduce(function (sum, line) { return sum + String(line.text || '').length; }, 0);
      var ocrPage = ocrByPage[page.number];
      if (ocrPage && pageTextLength < 40) {
        var recovered = ocrPageLines(ocrPage, page.number);
        if (recovered.length) page.lines = recovered;
      }
      pagesByNumber[page.number] = page;
      page.lines.forEach(function (line) { lines.push(line); });
    });
    if (!lines.length) {
      try { await pdfInfo.pdf.destroy(); } catch (error) { /* ignore */ }
      return {
        attached: 0,
        total: items.length,
        mode: 'pdf',
        note: '这份 PDF 没有可复制的文字层（可能是扫描版），暂时不能按题切原图；文字仍已入库。'
      };
    }
    var rectsById = locatePdfItems(items, lines, pagesByNumber);
    var byPage = {};
    rectsById.forEach(function (rects, itemIndex) {
      rects.forEach(function (rect) {
        rect.itemIndex = itemIndex;
        rect.pixelWidth = 0;
        rect.pixelHeight = 0;
        if (!byPage[rect.page]) byPage[rect.page] = [];
        byPage[rect.page].push(rect);
      });
    });
    var pageNumbers = Object.keys(byPage).map(Number).sort(function (a, b) { return a - b; });
    var done = 0;
    for (var p = 0; p < pageNumbers.length; p += 1) {
      var pageNumber = pageNumbers[p];
      report(onProgress, '正在切第 ' + pageNumber + ' 页的题目图片…', 0.2 + (p / pageNumbers.length) * 0.65);
      var canvas = await renderPdfPage(pdfInfo.pdf, pageNumber);
      byPage[pageNumber].forEach(function (rect) {
        var image = cropCanvas(canvas, rect, PDF_SCALE);
        if (image) {
          rect.url = image.url;
          rect.pixelWidth = image.width;
          rect.pixelHeight = image.height;
        }
      });
      canvas.width = 1;
      canvas.height = 1;
      done += 1;
    }
    try { await pdfInfo.pdf.destroy(); } catch (error) { /* ignore */ }
    var attached = 0;
    items.forEach(function (item, index) {
      var visuals = (rectsById[index] || [])
        .filter(function (rect) { return rect.url; })
        .map(function (rect) {
          return {
            url: rect.url,
            page: rect.page,
            width: rect.pixelWidth,
            height: rect.pixelHeight
          };
        });
      if (visuals.length) {
        item.visuals = visuals;
        item.visualSource = 'pdf';
        attached += 1;
      }
    });
    report(onProgress, '原题图片已生成', 0.9);
    return {
      attached: attached,
      total: items.length,
      mode: 'pdf',
      note: attached < items.length
        ? '有 ' + (items.length - attached) + ' 组题没有对上原文位置，这几组仍用文字排版。'
        : ''
    };
  }

  /* ------------------------------ Word ------------------------------ */

  function textBounds(element, fallback) {
    try {
      var range = document.createRange();
      range.selectNodeContents(element);
      var rects = Array.prototype.slice.call(range.getClientRects())
        .filter(function (rect) { return rect.width > 1 && rect.height > 1; });
      if (rects.length) {
        return {
          top: Math.min.apply(null, rects.map(function (rect) { return rect.top; })),
          bottom: Math.max.apply(null, rects.map(function (rect) { return rect.bottom; })),
          left: Math.min.apply(null, rects.map(function (rect) { return rect.left; })),
          right: Math.max.apply(null, rects.map(function (rect) { return rect.right; }))
        };
      }
    } catch (error) {
      /* 取文字边界失败时退回整段边界。 */
    }
    return fallback;
  }

  function docxParagraphList(container) {
    var sections = Array.prototype.slice.call(container.querySelectorAll('section.docx'));
    if (!sections.length) sections = [container];
    var list = [];
    sections.forEach(function (section, pageIndex) {
      var sectionRect = section.getBoundingClientRect();
      var paragraphs = Array.prototype.slice.call(section.querySelectorAll('p, li'));
      paragraphs.forEach(function (element) {
        var text = String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim();
        if (!text) return;
        var rect = element.getBoundingClientRect();
        if (rect.height < 1) return;
        // 段落本身占满整行，直接裁会把大片空白一起带上；改用文字的紧边界。
        var bounds = textBounds(element, rect);
        list.push({
          element: element,
          text: text,
          page: pageIndex,
          top: bounds.top - sectionRect.top,
          bottom: bounds.bottom - sectionRect.top,
          left: bounds.left - sectionRect.left,
          right: bounds.right - sectionRect.left
        });
      });
    });
    return { sections: sections, paragraphs: list };
  }

  function locateDocxItems(items, paragraphs, sections) {
    var lines = paragraphs;
    var pagesByNumber = {};
    sections.forEach(function (section, index) {
      pagesByNumber[index] = {
        number: index,
        width: section.getBoundingClientRect().width,
        height: section.getBoundingClientRect().height,
        lines: paragraphs.filter(function (paragraph) { return paragraph.page === index; })
      };
    });
    var starts = sequentialStarts(items, lines);
    return items.map(function (item, index) {
      var start = starts[index];
      if (start < 0) return [];
      var nextStart = -1;
      for (var n = index + 1; n < starts.length; n += 1) {
        if (starts[n] > start) { nextStart = starts[n]; break; }
      }
      var limit = nextStart > start ? nextStart : lines.length;
      if (nextStart > start) limit = findStopLine(lines, start, limit);
      var end = findEndLine(lines, item, start, limit);
      if (end < start) end = limit - 1;
      if (end < start) return [];
      var groups = {};
      for (var i = start; i <= end && i < lines.length; i += 1) {
        var line = lines[i];
        if (!line) continue;
        if (!groups[line.page]) groups[line.page] = { page: line.page, lines: [], first: line, last: line };
        groups[line.page].lines.push(line);
        groups[line.page].last = line;
      }
      var rects = [];
      Object.keys(groups).map(Number).forEach(function (pageIndex) {
        var group = groups[pageIndex];
        var page = pagesByNumber[pageIndex];
        if (!page) return;
        var isFirst = pageIndex === lines[start].page;
        var isLast = pageIndex === lines[end].page;
        var top = isFirst ? Math.max(0, group.first.top - PAD) : 0;
        var bottom = isLast ? Math.min(page.height, group.last.bottom + PAD) : page.height;
        var left = Math.max(0, Math.min.apply(null, group.lines.map(function (line) { return line.left; })) - 10);
        var right = Math.min(page.width, Math.max.apply(null, group.lines.map(function (line) { return line.right; })) + 10);
        if (bottom - top < 8 || right - left < 8) return;
        rects.push({ page: pageIndex, x: left, y: top, w: right - left, h: bottom - top });
      });
      return rects;
    });
  }

  async function buildDocxVisuals(blob, items, onProgress) {
    report(onProgress, '正在准备 Word 原样排版组件…', 0.03);
    if (!window.JSZip) await loadScript('vendor/jszip.min.js', 'JSZip');
    var docx = await loadScript('vendor/docx-preview.min.js', 'docx');
    var html2canvas = await loadScript('vendor/html2canvas.min.js', 'html2canvas');
    var stage = document.createElement('div');
    stage.setAttribute('aria-hidden', 'true');
    stage.style.cssText = 'position:fixed;left:0;top:0;z-index:-1;width:900px;background:#fff;pointer-events:none;';
    document.body.appendChild(stage);
    try {
      report(onProgress, '正在按 Word 原样排版…', 0.08);
      await docx.renderAsync(await blob.arrayBuffer(), stage, null, {
        className: 'docx',
        inWrapper: true,
        breakPages: true,
        ignoreWidth: false,
        ignoreHeight: false,
        renderHeaders: false,
        renderFooters: false,
        renderFootnotes: false,
        useBase64URL: true,
        experimental: true
      });
      try { await document.fonts.ready; } catch (error) { /* ignore */ }
      await sleep(450);

      var parsed = docxParagraphList(stage);
      if (!parsed.paragraphs.length) {
        return {
          attached: 0,
          total: items.length,
          mode: 'docx',
          note: 'Word 里没有读到可排版的段落，暂时仍用文字排版。'
        };
      }
      var rectsById = locateDocxItems(items, parsed.paragraphs, parsed.sections);
      var neededPages = {};
      rectsById.forEach(function (rects) {
        rects.forEach(function (rect) { neededPages[rect.page] = true; });
      });
      var pageIndexes = Object.keys(neededPages).map(Number).sort(function (a, b) { return a - b; });
      for (var p = 0; p < pageIndexes.length; p += 1) {
        var pageIndex = pageIndexes[p];
        var section = parsed.sections[pageIndex];
        if (!section) continue;
        report(onProgress, '正在切 Word 第 ' + (p + 1) + '/' + pageIndexes.length + ' 页的题目…', 0.2 + (p / Math.max(1, pageIndexes.length)) * 0.65);
        var sectionRect = section.getBoundingClientRect();
        if (sectionRect.height > 60000) continue;
        var canvas = await html2canvas(section, {
          scale: 2,
          backgroundColor: '#ffffff',
          useCORS: true,
          logging: false,
          imageTimeout: 15000
        });
        var scaleX = canvas.width / Math.max(1, sectionRect.width);
        var scaleY = canvas.height / Math.max(1, sectionRect.height);
        rectsById.forEach(function (rects) {
          rects.forEach(function (rect) {
            if (rect.page !== pageIndex) return;
            var sx = Math.max(0, Math.round(rect.x * scaleX));
            var sy = Math.max(0, Math.round(rect.y * scaleY));
            var sw = Math.min(canvas.width - sx, Math.round(rect.w * scaleX));
            var sh = Math.min(canvas.height - sy, Math.round(rect.h * scaleY));
            if (sw < 8 || sh < 8) return;
            var out = document.createElement('canvas');
            out.width = sw;
            out.height = sh;
            var context = out.getContext('2d', { alpha: false });
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, sw, sh);
            context.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
            rect.url = out.toDataURL('image/jpeg', 0.94);
            rect.pixelWidth = sw;
            rect.pixelHeight = sh;
          });
        });
        canvas.width = 1;
        canvas.height = 1;
      }
      var attached = 0;
      items.forEach(function (item, index) {
        var visuals = (rectsById[index] || [])
          .filter(function (rect) { return rect.url; })
          .map(function (rect) {
            return {
              url: rect.url,
              page: rect.page + 1,
              width: rect.pixelWidth,
              height: rect.pixelHeight
            };
          });
        if (visuals.length) {
          item.visuals = visuals;
          item.visualSource = 'docx';
          attached += 1;
        }
      });
      report(onProgress, 'Word 原题图片已生成', 0.9);
      return {
        attached: attached,
        total: items.length,
        mode: 'docx',
        note: attached < items.length
          ? '有 ' + (items.length - attached) + ' 组题没有对上 Word 的位置，这几组仍用文字排版。'
          : ''
      };
    } finally {
      stage.remove();
    }
  }

  async function build(blob, options) {
    options = options || {};
    var items = Array.isArray(options.items) ? options.items : [];
    var extension = String(options.extension || '').toLowerCase();
    if (!blob || !items.length) {
      return { attached: 0, total: items.length, mode: '', note: '' };
    }
    if (extension === 'pdf') return buildPdfVisuals(blob, items, options.onProgress, options.ocrPages);
    if (extension === 'docx') return buildDocxVisuals(blob, items, options.onProgress);
    return { attached: 0, total: items.length, mode: '', note: '' };
  }

  window.ShunshiVisual = {
    build: build,
    version: '20261121e'
  };
})();
