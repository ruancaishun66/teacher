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
          `<input type="file" accept="image/*" data-qr-file hidden>` +
          `<p class="hint">长码会拆成多帧轮播：屏幕上的二维码会一张一张换，继续对准扫完即可。没有摄像头时，可以直接粘贴文字码。</p>` +
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
      setStatus(`已扫 ${got} / ${collected.total} 帧，请继续对准屏幕上的二维码。`, 'ok');
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
      if (!file) return;
      if (!window.jsQR) {
        setStatus('扫码组件没有加载成功。可以直接粘贴文字码。', 'warn');
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
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        setStatus('这张图片打不开，换一张再试。', 'error');
      };
      img.src = url;
    }

    dialog.onclick = (event) => {
      if (event.target.closest('[data-qr-close]')) { close(); return; }
      if (event.target.closest('[data-qr-camera]')) { startCamera(); return; }
      if (event.target.closest('[data-qr-stop]')) { stopCamera(); setStatus('摄像头已停止。'); return; }
      if (event.target.closest('[data-qr-image]')) { fileInput.click(); return; }
    };
    fileInput.onchange = () => {
      decodeImage(fileInput.files && fileInput.files[0]);
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
    scan: openScanner,
    draw: drawQr
  };
})();
