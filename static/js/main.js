/* SD-GS Avatar project page: synced comparison players, prompt-driven teaser, before/after slider, drag turntables. No dependencies. */
(() => {
  'use strict';
  const V = 'static/videos/';
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* ---------- keep a group of videos on one clock (first video is the master) ---------- */
  class Sync {
    constructor(videos) {
      this.v = videos; this.on = false; this.visible = false; this.wantPlay = !reduced; this.rate = 1;
      const loop = () => {
        const m = this.v[0];
        if (this.on && m.readyState >= 2 && !m.seeking) {
          for (const o of this.v.slice(1)) {
            if (o.readyState >= 2 && Math.abs(o.currentTime - m.currentTime) > 0.045) o.currentTime = m.currentTime;
          }
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    load(srcs) {
      this.on = false;
      const ready = this.v.map((el, i) => new Promise(res => {
        const done = () => { el.removeEventListener('loadeddata', done); res(); };
        el.addEventListener('loadeddata', done);
        el.poster = srcs[i].replace(/\.mp4$/, '.jpg');
        el.src = srcs[i]; el.load();
      }));
      return Promise.all(ready).then(() => {
        this.v.forEach(el => { el.currentTime = 0; el.playbackRate = this.rate; });
        this.on = true; this.apply();
      });
    }
    apply() { this.v.forEach(el => (this.visible && this.wantPlay ? el.play().catch(() => {}) : el.pause())); }
    setVisible(b) { this.visible = b; this.apply(); }
    setPlaying(b) { this.wantPlay = b; this.apply(); }
    setRate(r) { this.rate = r; this.v.forEach(el => (el.playbackRate = r)); }
    seek(f) { const m = this.v[0]; if (m.duration) this.v.forEach(el => (el.currentTime = f * m.duration)); }
  }

  const watch = (el, cb, threshold = 0.15) => {
    const io = new IntersectionObserver(es => es.forEach(e => cb(e.isIntersecting)), { threshold });
    io.observe(el);
  };

  const tabs = (root, onPick) => {
    $$('[role=tab]', root).forEach(b => b.addEventListener('click', () => {
      $$('[role=tab]', root).forEach(x => { x.classList.toggle('active', x === b); x.setAttribute('aria-selected', x === b); });
      onPick(b.dataset.clip);
    }));
  };

  /* ---------- 1. teaser: one prompt drives three identities ---------- */
  const stage = $('#hero-stage');
  if (stage) {
    const vids = $$('video', stage); const sync = new Sync(vids);
    const text = $('#prompt-text'); let typing = 0;
    const type = s => {
      const id = ++typing; if (reduced) { text.textContent = s; return; }
      text.textContent = ''; let i = 0;
      const step = () => { if (id !== typing) return; text.textContent = s.slice(0, ++i); if (i < s.length) setTimeout(step, 26); };
      step();
    };
    const pick = (motion, prompt) => {
      type(prompt);
      vids.forEach(v => v.classList.add('fading'));
      setTimeout(() => sync.load(vids.map(v => `${V}hero_${v.dataset.avatar}_${motion}.mp4`))
        .then(() => vids.forEach(v => v.classList.remove('fading'))), 250);
    };
    $$('#motion-chips .chip').forEach(c => c.addEventListener('click', () => {
      $$('#motion-chips .chip').forEach(x => x.classList.toggle('active', x === c));
      pick(c.dataset.motion, c.dataset.prompt);
    }));
    const first = $('#motion-chips .chip.active');
    sync.load(vids.map(v => `${V}hero_${v.dataset.avatar}_${first.dataset.motion}.mp4`));
    watch(stage, b => sync.setVisible(b));
  }

  /* ---------- 2. CDRM before / after slider ---------- */
  const cmp = $('#cdrm-compare');
  if (cmp) {
    const handle = $('.handle', cmp);
    const set = p => {
      p = Math.max(0, Math.min(100, p));
      cmp.style.setProperty('--pos', p + '%'); handle.setAttribute('aria-valuenow', Math.round(p));
    };
    const fromEvent = e => { const r = cmp.getBoundingClientRect(); set((e.clientX - r.left) / r.width * 100); };
    let drag = false;
    cmp.addEventListener('pointerdown', e => { drag = true; cmp.setPointerCapture(e.pointerId); fromEvent(e); });
    cmp.addEventListener('pointermove', e => drag && fromEvent(e));
    cmp.addEventListener('pointerup', () => (drag = false));
    cmp.addEventListener('pointercancel', () => (drag = false));
    handle.addEventListener('keydown', e => {
      const now = parseFloat(getComputedStyle(cmp).getPropertyValue('--pos')) || 50;
      if (e.key === 'ArrowLeft') { set(now - 5); e.preventDefault(); }
      if (e.key === 'ArrowRight') { set(now + 5); e.preventDefault(); }
    });
    // gentle one-time sweep when the slider first comes into view, so the reader sees that it can be dragged
    let swept = reduced;
    watch(cmp, b => {
      if (!b || swept) return; swept = true;
      const t0 = performance.now();
      const anim = t => {
        if (drag) return;
        const u = Math.min(1, (t - t0) / 1600);
        set(50 + 22 * Math.sin(u * Math.PI * 2) * (1 - u));
        if (u < 1) requestAnimationFrame(anim);
      };
      requestAnimationFrame(anim);
    }, 0.6);
  }

  /* ---------- 3. drag-to-rotate turntables (sprite strips) ---------- */
  $$('.spin').forEach(fig => {
    const view = $('.spin-view', fig); const n = +fig.dataset.frames; const cols = +fig.dataset.cols; const rows = Math.ceil(n / cols);
    let idx = 0, acc = 0, visible = false, held = false, resumeAt = 0, lastX = 0, lastT = 0;
    const img = new Image();
    view.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
    img.onload = () => { view.style.backgroundImage = `url(${img.src})`; draw(); };
    const draw = () => {
      const c = idx % cols, r = Math.floor(idx / cols);
      view.style.backgroundPosition = `${cols > 1 ? (c / (cols - 1)) * 100 : 0}% ${rows > 1 ? (r / (rows - 1)) * 100 : 0}%`;
    };
    const tick = t => {
      if (visible && !held && !reduced && t > resumeAt && t - lastT > 90) { idx = (idx + 1) % n; draw(); lastT = t; }
      requestAnimationFrame(tick);
    };
    watch(fig, b => { visible = b; if (b && !img.src) img.src = V + fig.dataset.sprite; }, 0.01);
    fig.addEventListener('pointerdown', e => { held = true; lastX = e.clientX; acc = 0; fig.classList.add('dragging'); fig.setPointerCapture(e.pointerId); });
    fig.addEventListener('pointermove', e => {
      if (!held) return; acc += e.clientX - lastX; lastX = e.clientX;
      const step = fig.clientWidth / n * 1.6;
      while (Math.abs(acc) >= step) { idx = (idx + (acc > 0 ? -1 : 1) + n) % n; acc -= Math.sign(acc) * step; }
      draw();
    });
    const release = () => { held = false; fig.classList.remove('dragging'); resumeAt = performance.now() + 1500; };
    fig.addEventListener('pointerup', release); fig.addEventListener('pointercancel', release);
    fig.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        idx = (idx + (e.key === 'ArrowLeft' ? 1 : -1) + n) % n; draw(); resumeAt = performance.now() + 3000; e.preventDefault();
      }
    });
    requestAnimationFrame(tick);
  });

  /* ---------- 4. PAMG synced duo with shared timeline ---------- */
  const duo = $('#pamg-duo');
  if (duo) {
    const vids = $$('video', duo); const sync = new Sync(vids);
    const play = $('#pamg-play'), seek = $('#pamg-seek');
    const show = clip => sync.load(vids.map(v => `${V}${clip}_${v.dataset.variant}.mp4`));
    let scrubbing = false;
    const ui = () => {
      play.classList.toggle('paused', !sync.wantPlay);
      play.setAttribute('aria-label', sync.wantPlay ? '暂停' : '播放');
    };
    play.addEventListener('click', () => { sync.setPlaying(!sync.wantPlay); ui(); });
    seek.addEventListener('input', () => { scrubbing = true; sync.seek(seek.value / 1000); });
    seek.addEventListener('change', () => (scrubbing = false));
    vids[0].addEventListener('timeupdate', () => {
      if (!scrubbing && vids[0].duration) seek.value = Math.round(vids[0].currentTime / vids[0].duration * 1000);
    });
    $$('.speed').forEach(b => b.addEventListener('click', () => {
      $$('.speed').forEach(x => x.classList.toggle('active', x === b)); sync.setRate(+b.dataset.rate);
    }));
    tabs($('#pamg-tabs'), show);
    show($('#pamg-tabs .tab.active').dataset.clip);
    watch(duo, b => sync.setVisible(b));
    ui();
  }

  /* ---------- navigation state, reveal, copy ---------- */
  const toc = $('.toc');
  addEventListener('scroll', () => {
    toc.classList.toggle('scrolled', scrollY > 8);
    if (scrollY < innerHeight * 0.6) links.forEach(a => a.classList.remove('current'));  // hero: nothing highlighted
  }, { passive: true });
  const links = new Map($$('.toc-links a').map(a => [a.getAttribute('href').slice(1), a]));
  const secIO = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting && scrollY >= innerHeight * 0.6) links.forEach((a, id) => a.classList.toggle('current', id === e.target.id));
  }), { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((_, id) => { const s = document.getElementById(id); if (s) secIO.observe(s); });

  const revIO = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); revIO.unobserve(e.target); }
  }), { threshold: 0.08 });
  $$('main section > .wrap, main section.wrap').forEach(el => { el.classList.add('reveal'); revIO.observe(el); });

  const copy = $('#copy-bib');
  if (copy) copy.addEventListener('click', () => {
    navigator.clipboard.writeText($('#bibtex').textContent).then(() => {
      copy.textContent = '已复制'; setTimeout(() => (copy.textContent = '复制'), 1600);
    });
  });
})();
