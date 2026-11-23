/* ==========================================================================
   顺势 · 二维码任务钥匙
   全部在本机生成和识别：二维码里只放任务码 / 汇报码，不上传任何服务器。
   依赖 vendor/qrcode-generator.js（生成）和 vendor/jsqr.js（识别）。
   ========================================================================== */
(function () {
  'use strict';

  const SINGLE_LIMIT = 900;
  const CHUNK_SIZE = 650;
  const FRAME_MS = 1200;

  function frameId() {
    return Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  function splitFrames(text) {
    const code = String(text || '').trim();
    if (!code) return [];
    if (code.length <= SINGLE_LIMIT) {
      return [`SSQ1|${frameId()}|1|1|${code}`];
    }
    const id = frameId();
    const total = Math.ceil(code.length / CHUNK_SIZE);
    const frames = [];
    for (let index = 0; index < total; index += 1) {
      frames.push(`SSQ1|${id}|${index + 1}|${total}|${code.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE)}`);
    }
    return frames;
  }

  function parseFrame(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    const match = raw.match(/^SSQ1\|([A-Z0-9]+)\|(\d+)\|(\d+)\|([\s\S]*)$/);
    if (match) {
      return {
        id: match[1],
        index: Number(match[2]),
        total: Number(match[3]),
        chunk: match[4]
      };
    }
    if (/^SS[01]\.[A-Za-z0-9_-]+$/.test(raw)) {
      return { single: true, code: raw };
    }
    if (/^https?:\/\//i.test(raw)) {
      try {
        const url = new URL(raw);
        const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
        const fromHash = hash.get('code');
        const fromQuery = url.searchParams.get('code');
        const code = fromHash || fromQuery || '';
        if (/^SS[01]\./.test(code)) return { single: true, code };
      } catch (error) { /* ignore */ }
    }
    return null;
  }

  function drawQr(canvas, text, size) {
    if (!canvas) return false;
    if (typeof window.qrcode !== 'function') {
      canvas.hidden = true;
      return false;
    }
    let qr = null;
    try {
      qr = window.qrcode(0, 'M');
      qr.addData(text);
      qr.make();
    } catch (error) {
      try {
        qr = window.qrcode(0, 'L');
        qr.addData(text);
        qr.make();
      } catch (error2) {
        return false;
      }
    }
    const modules = qr.getModuleCount();
    const quiet = 4;
    const pixels = Math.max(180, Number(size) || 220);
    const cell = Math.max(2, Math.floor(pixels / (modules + quiet * 2)));
    const full = cell * (modules + quiet * 2);
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(full * ratio);
    canvas.height = Math.round(full * ratio);
    canvas.style.width = full + 'px';
    canvas.style.height = full + 'px';
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, full, full);
    ctx.fillStyle = '#102f36';
    for (let row = 0; row < modules; row += 1) {
      for (let col = 0; col < modules; col += 1) {
        if (qr.isDark(row, col)) {
          ctx.fillRect((col + quiet) * cell, (row + quiet) * cell, cell, cell);
        }
      }
    }
    canvas.hidden = false;
    return true;
  }

  /* 把一帧二维码画成 PNG：上面是二维码，下面自带“第 i / N 张”提示框。
     这样老师复制图片发到微信，图片本身和“第几张”就分不开。 */
  function frameDataUrl(frame, index, total, size) {
    const source = document.createElement('canvas');
    if (!drawQr(source, frame, size || 340)) return '';
    const width = source.width;
    const labelHeight = Math.max(42, Math.round(width * 0.13));
    const out = document.createElement('canvas');
    out.width = width;
    out.height = source.height + labelHeight;
    const ctx = out.getContext('2d');
    if (!ctx) return '';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(source, 0, 0);
    const padX = Math.round(width * 0.09);
    const padY = Math.round(labelHeight * 0.16);
    const boxWidth = width - padX * 2;
    const boxHeight = labelHeight - padY * 2;
    const radius = Math.min(12, Math.round(boxHeight * 0.32));
    const boxY = source.height + padY;
    ctx.beginPath();
    if (ctx.roundRect) {
      ctx.roundRect(padX, boxY, boxWidth, boxHeight, radius);
    } else {
      ctx.rect(padX, boxY, boxWidth, boxHeight);
    }
    ctx.fillStyle = '#f1f8f6';
    ctx.fill();
    ctx.strokeStyle = '#bcd8d2';
    ctx.lineWidth = Math.max(1, Math.round(width * 0.004));
    ctx.stroke();
    ctx.fillStyle = '#102f36';
    ctx.font = `700 ${Math.max(15, Math.round(boxHeight * 0.46))}px "Microsoft YaHei", "PingFang SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      total > 1 ? `第 ${index + 1} / ${total} 张` : '这是唯一的 1 张',
      width / 2,
      boxY + boxHeight / 2 + 1
    );
    return out.toDataURL('image/png');
  }

  function dataUrlBlob(dataUrl) {
    return new Promise((resolve) => {
      try {
        const parts = String(dataUrl || '').split(',');
        const binary = atob(parts[1] || '');
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        resolve(new Blob([bytes], { type: 'image/png' }));
      } catch (error) {
        resolve(null);
      }
    });
  }

  function downloadDataUrl(dataUrl, filename) {
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  /* 静态逐张二维码：从左到右排开，每张图下面有“第几张”提示框、复制和保存按钮。
     点图片也能直接复制，粘贴到微信聊天框即可。 */
  function mountFrames(container, code, options) {
    if (!container) return null;
    const opts = options || {};
    const frames = splitFrames(code);
    if (!frames.length) {
      container.innerHTML = '<p class="qr-empty">没有可显示的码。</p>';
      return null;
    }
    const size = Number(opts.size) || 340;
    const cards = frames.map((frame, index) => {
      const dataUrl = frameDataUrl(frame, index, frames.length, size);
      if (!dataUrl) return '';
      return `<figure class="qr-frame-card" data-frame-index="${index}">` +
        `<button class="qr-frame-imgbtn" type="button" data-qr-copy="${index}" title="点击复制这张图片，直接粘贴到微信">` +
          `<img class="qr-frame-img" src="${dataUrl}" alt="第 ${index + 1} 张二维码${frames.length > 1 ? `，共 ${frames.length} 张` : ''}">` +
        `</button>` +
        `<figcaption class="qr-frame-info">` +
          `<span class="qr-frame-no">第 ${index + 1} / ${frames.length} 张</span>` +
          `<span class="qr-frame-hint">${frames.length > 1 ? '微信按顺序发这一张' : '微信发这一张'}</span>` +
          `<span class="qr-frame-actions">` +
            `<button class="p-btn small" type="button" data-qr-copy="${index}">复制这张图片</button>` +
            `<button class="p-btn small ghost" type="button" data-qr-save="${index}">保存图片</button>` +
          `</span>` +
          `<span class="qr-frame-status" data-qr-status="${index}" aria-live="polite"></span>` +
        `</figcaption>` +
      `</figure>`;
    }).filter(Boolean);
    if (!cards.length) {
      container.innerHTML = '<p class="qr-empty">二维码生成失败：当前设备没有加载二维码组件。可继续复制文字码使用。</p>';
      return null;
    }
    container.innerHTML =
      `<details class="qr-frames-wrap" open>` +
        `<summary>${frames.length > 1 ? `共 ${frames.length} 张二维码 · 按第 1 张到第 ${frames.length} 张依次发` : '1 张二维码 · 点图片直接复制'}</summary>` +
        `<div class="qr-frames" role="list">${cards.join('')}</div>` +
        `<p class="qr-frames-note">点图片或“复制这张图片”，再到微信聊天框粘贴。每张图片下方已经自带“第几张”的提示框；学生少发哪张，学生端会提示还差第几张。</p>` +
      `</details>`;

    const dataUrls = frames.map((frame, index) => {
      const img = container.querySelector(`[data-frame-index="${index}"] img`);
      return img ? img.src : '';
    });
    const busy = {};

    function setStatus(index, text, tone) {
      const el = container.querySelector(`[data-qr-status="${index}"]`);
      if (!el) return;
      el.textContent = text;
      el.className = `qr-frame-status${tone ? ` is-${tone}` : ''}`;
    }

    async function copyFrame(index) {
      if (busy[index]) return;
      const dataUrl = dataUrls[index];
      if (!dataUrl) return;
      busy[index] = true;
      try {
        const canCopy = window.ClipboardItem && navigator.clipboard && navigator.clipboard.write;
        if (canCopy) {
          const blob = await dataUrlBlob(dataUrl);
          if (!blob) throw new Error('blob');
          await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
          setStatus(index, '✓ 已复制，去微信粘贴', 'ok');
        } else {
          throw new Error('unsupported');
        }
      } catch (error) {
        downloadDataUrl(dataUrl, `顺势二维码-第${index + 1}张.png`);
        setStatus(index, '浏览器不允许直接复制，已保存图片，请从“下载”里发送', 'warn');
      } finally {
        busy[index] = false;
        setTimeout(() => setStatus(index, ''), 4200);
      }
    }

    container.onclick = (event) => {
      const copyBtn = event.target.closest('[data-qr-copy]');
      if (copyBtn) {
        event.preventDefault();
        copyFrame(Number(copyBtn.dataset.qrCopy) || 0);
        return;
      }
      const saveBtn = event.target.closest('[data-qr-save]');
      if (saveBtn) {
        event.preventDefault();
        const index = Number(saveBtn.dataset.qrSave) || 0;
        downloadDataUrl(dataUrls[index], `顺势二维码-第${index + 1}张.png`);
        setStatus(index, '已保存图片，可从“下载”里发送', 'ok');
        setTimeout(() => setStatus(index, ''), 4200);
      }
    };
    return { frames, stop() {} };
  }

  /* 在任意容器里放一个会轮播的二维码。码短时是一张静态图；
     码长超过 900 字时自动拆成多帧，学生扫完所有帧才会导入。 */
  function mount(container, code, options) {
    if (!container) return null;
    const opts = options || {};
    const frames = splitFrames(code);
    if (!frames.length) {
      container.innerHTML = '<p class="qr-empty">没有可显示的码。</p>';
      return null;
    }
    let index = 0;
    let timer = null;
    let playing = frames.length > 1;
    container.innerHTML =
      `<div class="qr-display">` +
        `<canvas class="qr-canvas" aria-label="任务二维码"></canvas>` +
        `<div class="qr-meta">` +
          `<b class="qr-frame-label"></b>` +
          `<span>${frames.length > 1 ? '二维码会自动轮播；学生用“扫码导入”连续扫完所有帧。' : '学生用“扫码导入”直接扫这张图。'}</span>` +
        `</div>` +
        `<div class="qr-controls" ${frames.length > 1 ? '' : 'hidden'}>` +
          `<button class="p-btn small ghost" type="button" data-qr-prev>上一帧</button>` +
          `<button class="p-btn small" type="button" data-qr-play>暂停</button>` +
          `<button class="p-btn small ghost" type="button" data-qr-next>下一帧</button>` +
        `</div>` +
        `<div class="qr-dots" ${frames.length > 1 ? '' : 'hidden'}></div>` +
      `</div>`;
    const canvas = container.querySelector('.qr-canvas');
    const label = container.querySelector('.qr-frame-label');
    const playBtn = container.querySelector('[data-qr-play]');
    const dots = container.querySelector('.qr-dots');

    function paint() {
      const ok = drawQr(canvas, frames[index], opts.size || 220);
      if (!ok) {
        container.innerHTML = '<p class="qr-empty">二维码生成失败：当前设备没有加载二维码组件。可继续复制文字码使用。</p>';
        stop();
        return;
      }
      if (label) label.textContent = frames.length > 1 ? `第 ${index + 1} / ${frames.length} 帧` : '一张图就能扫完';
      if (dots) {
        dots.innerHTML = frames.map((_, i) => (
          `<button class="qr-dot${i === index ? ' is-on' : ''}" type="button" data-qr-dot="${i}" aria-label="第 ${i + 1} 帧"></button>`
        )).join('');
      }
    }
    function next(step) {
      index = (index + (step || 1) + frames.length) % frames.length;
      paint();
    }
    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
      playing = false;
      if (playBtn) playBtn.textContent = '播放';
    }
    function start() {
      if (frames.length < 2) return;
      if (timer) clearInterval(timer);
      playing = true;
      if (playBtn) playBtn.textContent = '暂停';
      timer = setInterval(() => next(1), FRAME_MS);
    }
    container.onclick = (event) => {
      const dot = event.target.closest('[data-qr-dot]');
      if (dot) {
        index = Number(dot.dataset.qrDot) || 0;
        paint();
        return;
      }
      if (event.target.closest('[data-qr-prev]')) { next(-1); return; }
      if (event.target.closest('[data-qr-next]')) { next(1); return; }
      if (event.target.closest('[data-qr-play]')) {
        if (playing) stop();
        else start();
      }
    };
    paint();
    if (frames.length > 1) start();
    return { frames, stop, start };
  }

  /* ------------------------------- 扫码识别 ------------------------------- */

  function ensureDialog() {
    let dialog = document.getElementById('qr-scan-dialog');
    if (dialog) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = 'qr-scan-dialog';
    dialog.className = 'p-dialog qr-scan-dialog';
    dialog.innerHTML =
      `<div class="p-dialog-inner">` +
        `<div class="p-dialog-head">` +
          `<div><h2>扫码导入</h2><p>把老师 / 学生发来的二维码对准摄像头，或选一张二维码图片。识别只在本机进行。</p></div>` +
          `<button class="p-close" type="button" data-qr-close aria-label="关闭">×</button>` +
        `</div>` +
        `<div class="p-dialog-body">` +
          `<div class="qr-video-wrap" hidden><video class="qr-video" playsinline muted></video><span class="qr-video-guide"></span></div>` +
          `<p class="qr-scan-status" aria-live="polite">点“打开摄像头”，或从相册选一张二维码图片。</p>` +
          `<div class="qr-scan-actions">` +
            `<button class="p-btn" type="button" data-qr-camera>打开摄像头</button>` +
            `<button class="p-btn ghost" type="button" data-qr-image>从图片识别</button>` +
            `<button class="p-btn ghost" type="button" data-qr-stop hidden>停止摄像头</button>` +
          `</div>` +
          `<input type="file" accept="image/*" data-qr-file multiple hidden>` +
          `<p class="hint">老师发来多张二维码图片时，可以点“从图片识别”一次选中多张；少哪一张，这里会直接告诉你还差第几张。没有摄像头时，也可以直接粘贴文字码。</p>` +
        `</div>` +
        `<div class="p-dialog-foot"><button class="p-btn ghost" type="button" data-qr-close>取消</button></div>` +
      `</div>`;
    document.body.appendChild(dialog);
    return dialog;
  }

  function openScanner(options) {
    const opts = options || {};
    const dialog = ensureDialog();
    const video = dialog.querySelector('.qr-video');
    const wrap = dialog.querySelector('.qr-video-wrap');
    const status = dialog.querySelector('.qr-scan-status');
    const cameraBtn = dialog.querySelector('[data-qr-camera]');
    const imageBtn = dialog.querySelector('[data-qr-image]');
    const stopBtn = dialog.querySelector('[data-qr-stop]');
    const fileInput = dialog.querySelector('[data-qr-file]');
    const canvas = document.createElement('canvas');
    const collected = { id: '', total: 0, parts: {} };
    let stream = null;
    let raf = 0;
    let lastScan = 0;
    let finished = false;

    function setStatus(text, tone) {
      status.textContent = text;
      status.className = 'qr-scan-status' + (tone ? ` is-${tone}` : '');
    }

    function stopCamera() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (stream) stream.getTracks().forEach((track) => track.stop());
      stream = null;
      video.srcObject = null;
      wrap.hidden = true;
      stopBtn.hidden = true;
      cameraBtn.hidden = false;
    }

    function close() {
      stopCamera();
      if (dialog.open) dialog.close();
    }

    function finish(code) {
      if (finished) return;
      finished = true;
      stopCamera();
      setStatus('识别成功，正在填入…', 'ok');
      setTimeout(() => {
        close();
        if (typeof opts.onCode === 'function') opts.onCode(code);
      }, 260);
    }

    function ingest(text) {
      if (finished) return;
      const parsed = parseFrame(text);
      if (!parsed) return;
      if (parsed.single) {
        finish(parsed.code);
        return;
      }
      if (!collected.id) collected.id = parsed.id;
      if (parsed.id !== collected.id) {
        collected.id = parsed.id;
        collected.total = parsed.total;
        collected.parts = {};
      }
      collected.total = parsed.total;
      collected.parts[parsed.index] = parsed.chunk;
      const got = Object.keys(collected.parts).length;
      if (got >= collected.total) {
        let code = '';
        for (let i = 1; i <= collected.total; i += 1) code += collected.parts[i] || '';
        finish(code);
        return;
      }
      const missing = [];
      const have = [];
      for (let i = 1; i <= collected.total; i += 1) {
        (collected.parts[i] ? have : missing).push(i);
      }
      const listText = (list) => list.length > 4
        ? `${list.slice(0, 4).join('、')} 等 ${list.length} 张`
        : list.join('、');
      setStatus(
        `已录入第 ${listText(have)} 张；还差第 ${listText(missing)} 张。` +
        `请继续扫，或点“从图片识别”选第 ${listText(missing)} 张的图片（可一次多选）。`,
        'ok'
      );
      if (navigator.vibrate) { try { navigator.vibrate(35); } catch (error) { /* ignore */ } }
    }

    function scanLoop(now) {
      raf = requestAnimationFrame(scanLoop);
      if (finished || video.readyState < 2) return;
      if (now - lastScan < 160) return;
      lastScan = now;
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return;
      const max = 900;
      const scale = Math.min(1, max / Math.max(width, height));
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const result = window.jsQR ? window.jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' }) : null;
      if (result && result.data) ingest(result.data);
    }

    async function startCamera() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setStatus('这个浏览器不能直接开摄像头。可以点“从图片识别”，或直接粘贴文字码。', 'warn');
        return;
      }
      if (!window.jsQR) {
        setStatus('扫码组件没有加载成功。可以点“从图片识别”，或直接粘贴文字码。', 'warn');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        video.srcObject = stream;
        await video.play();
        wrap.hidden = false;
        cameraBtn.hidden = true;
        stopBtn.hidden = false;
        setStatus('把二维码放进取景框，保持稳定。');
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(scanLoop);
      } catch (error) {
        stopCamera();
        setStatus('摄像头没有打开成功（可能未授权，或这台电脑没有摄像头）。可以改用“从图片识别”。', 'error');
      }
    }

    function decodeImage(file) {
      return new Promise((resolve) => {
        if (!file) { resolve(); return; }
        if (!window.jsQR) {
          setStatus('扫码组件没有加载成功。可以直接粘贴文字码。', 'warn');
          resolve();
          return;
        }
        setStatus('正在识别图片…');
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          try {
            const max = 1600;
            const scale = Math.min(1, max / Math.max(img.width, img.height));
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const result = window.jsQR(image.data, image.width, image.height);
            URL.revokeObjectURL(url);
            if (result && result.data) ingest(result.data);
            else setStatus('这张图里没有认出二维码。换一张清晰、正对、没有反光的图片再试。', 'warn');
          } catch (error) {
            URL.revokeObjectURL(url);
            setStatus('图片识别失败，换一张再试，或直接粘贴文字码。', 'error');
          }
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          setStatus('这张图片打不开，换一张再试。', 'error');
          resolve();
        };
        img.src = url;
      });
    }

    async function decodeImages(files) {
      const list = Array.from(files || []);
      for (let i = 0; i < list.length; i += 1) {
        if (finished) return;
        if (list.length > 1) setStatus(`正在识别第 ${i + 1} / ${list.length} 张图片…`);
        await decodeImage(list[i]);
      }
    }

    dialog.onclick = (event) => {
      if (event.target.closest('[data-qr-close]')) { close(); return; }
      if (event.target.closest('[data-qr-camera]')) { startCamera(); return; }
      if (event.target.closest('[data-qr-stop]')) { stopCamera(); setStatus('摄像头已停止。'); return; }
      if (event.target.closest('[data-qr-image]')) { fileInput.click(); return; }
    };
    fileInput.onchange = () => {
      const files = fileInput.files ? Array.from(fileInput.files) : [];
      decodeImages(files);
      fileInput.value = '';
    };
    dialog.addEventListener('close', stopCamera, { once: true });
    setStatus('点“打开摄像头”，或从相册选一张二维码图片。');
    if (typeof opts.status === 'string' && opts.status) setStatus(opts.status);
    if (!dialog.open) dialog.showModal();
  }

  window.ShunshiQR = {
    splitFrames,
    parseFrame,
    mount,
    mountFrames,
    frameDataUrl,
    scan: openScanner,
    draw: drawQr
  };
})();
