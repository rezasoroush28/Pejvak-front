/**
 * Framework-independent, finite logo animation. Load pejvak-logo.css once.
 * Browser visitors need no dependencies. Assets are deliberately attached late.
 */
export function mountPejvakLogoAnimation(container, options = {}) {
  if (!container || container.nodeType !== 1) throw new TypeError('A DOM container is required.');
  const settings = {
    autoplay: true,
    playOncePerSession: true,
    respectReducedMotion: true,
    respectDataSaver: true,
    pauseWhenOffscreen: true,
    assetBaseUrl: new URL('../assets/optimized/v1/', import.meta.url).href,
    sessionKey: 'pejvak-logo-animation:v1:completed',
    label: 'Pejvak — a grand piano shaped like the letter P',
    ...options,
  };
  const doc = container.ownerDocument;
  const win = doc.defaultView;
  const base = new URL(settings.assetBaseUrl.endsWith('/') ? settings.assetBaseUrl : `${settings.assetBaseUrl}/`, doc.baseURI);
  const asset = (file) => new URL(file, base).href;
  const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
  const connection = win.navigator.connection;
  const mobile = win.matchMedia('(max-width: 767px)').matches;
  const variant = mobile ? 'mobile' : 'desktop';
  const wrapper = doc.createElement('div');
  wrapper.className = 'pejvak-logo';
  wrapper.dataset.frame = 'start';
  wrapper.dataset.state = 'idle';
  wrapper.setAttribute('role', 'img');
  wrapper.setAttribute('aria-label', settings.label);
  const start = doc.createElement('img');
  start.className = 'pejvak-logo__image';
  start.alt = '';
  start.width = start.height = mobile ? 320 : 640;
  start.decoding = 'async';
  start.src = asset(`piano-start-${variant}.webp`);
  const video = doc.createElement('video');
  video.className = 'pejvak-logo__video';
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('aria-hidden', 'true');
  video.tabIndex = -1;
  video.preload = 'none';
  video.disablePictureInPicture = true;
  video.disableRemotePlayback = true;
  const end = doc.createElement('img');
  end.className = 'pejvak-logo__image pejvak-logo__end';
  end.width = start.width;
  end.height = start.height;
  end.alt = '';
  end.decoding = 'async';
  wrapper.append(start, video, end);
  container.append(wrapper);

  let destroyed = false;
  let epoch = 0;
  let wanted = false;
  let visible = false;
  let loaded = false;
  let busy = null;
  let endReady = false;
  let idleId = null;
  let idleIsNative = false;
  let frameId = null;
  let triedMp4 = false;
  let finished = false;
  let preparingEnd = null;
  const timers = new Set();
  const disposers = [];

  function on(target, type, listener) {
    target.addEventListener(type, listener);
    disposers.push(() => target.removeEventListener(type, listener));
  }
  function preferenceBlocks() {
    return (settings.respectReducedMotion && motion.matches) ||
      (settings.respectDataSaver && connection?.saveData === true);
  }
  function eligible() {
    return !destroyed && !preferenceBlocks() && !doc.hidden &&
      (!settings.pauseWhenOffscreen || visible);
  }
  function emit(state) {
    wrapper.dataset.state = state;
    wrapper.dispatchEvent(new win.CustomEvent('pejvak:statechange', { bubbles: true, detail: { state } }));
  }
  function sessionCompleted() {
    if (!settings.playOncePerSession) return false;
    try { return win.sessionStorage.getItem(settings.sessionKey) === '1'; } catch { return false; }
  }
  function remember() {
    if (settings.playOncePerSession) {
      try { win.sessionStorage.setItem(settings.sessionKey, '1'); } catch { /* Storage can be disabled. */ }
    }
  }
  function timeout(callback, delay) {
    const id = win.setTimeout(() => { timers.delete(id); callback(); }, delay);
    timers.add(id);
    return id;
  }
  function cancelFrame() {
    if (frameId !== null && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frameId);
    frameId = null;
  }
  function cancelIdle() {
    if (idleId === null) return;
    if (idleIsNative) win.cancelIdleCallback(idleId);
    else win.clearTimeout(idleId);
    idleId = null;
  }
  function releaseVideo() {
    cancelFrame();
    video.pause();
    video.removeAttribute('src');
    video.replaceChildren();
    video.load();
    loaded = false;
  }
  async function prepareEnd() {
    if (endReady) return true;
    if (preparingEnd) return preparingEnd;
    end.src = asset(`piano-end-${variant}.webp`);
    preparingEnd = end.decode().then(() => {
      if (!destroyed) endReady = true;
      return !destroyed;
    }).catch(() => false).finally(() => { preparingEnd = null; });
    return preparingEnd;
  }
  async function showEnd(token) {
    const ready = await prepareEnd();
    if (destroyed || token !== epoch) return;
    if (ready) {
      wrapper.dataset.frame = 'end';
      // Let the decoded image paint before releasing the video decoder.
      timeout(() => { if (token === epoch && !destroyed) releaseVideo(); }, 60);
    }
    // If a final image fails, retain the video's last decoded frame.
    emit('complete');
  }
  function attachSources(mp4Only = false) {
    if (loaded) return;
    loaded = true;
    video.preload = 'auto';
    const extensions = mp4Only ? ['mp4'] : ['webm', 'mp4'];
    let failedSources = 0;
    for (const extension of extensions) {
      const source = doc.createElement('source');
      source.src = asset(`piano-opening-${variant}.${extension}`);
      source.type = extension === 'webm' ? 'video/webm; codecs="vp9"' : 'video/mp4';
      source.addEventListener('error', () => {
        // Source errors do not bubble to the video element in every browser.
        if (source.parentNode !== video || destroyed) return;
        failedSources++;
        if (failedSources === extensions.length) fail();
      }, { once: true });
      video.append(source);
    }
    video.load();
    // Decode final artwork while the video is playing, never after its end.
    void prepareEnd();
  }
  function fail() {
    if (destroyed || finished || !wanted) return;
    if (!triedMp4) {
      triedMp4 = true;
      epoch++;
      busy = null;
      releaseVideo();
      attachSources(true);
      void startPlayback();
      return;
    }
    epoch++;
    wanted = false;
    busy = null;
    wrapper.dataset.frame = 'start';
    releaseVideo();
    emit('error');
  }
  function revealVideo(token) {
    if (destroyed || token !== epoch || !wanted || !eligible()) return;
    wrapper.dataset.frame = 'video';
    emit('playing');
  }
  async function startPlayback() {
    if (!wanted || !eligible() || finished) return false;
    if (busy) return busy;
    const token = epoch;
    // A failed/slow request must not leave a pending task forever.
    const watchdog = timeout(() => {
      if (token === epoch && wanted && eligible() && video.readyState < 2) fail();
    }, 15000);
    busy = (async () => {
      try {
        // Give the small starting artwork network/decode priority over video.
        // An unavailable poster must not prevent a valid video from playing.
        await start.decode().catch(() => {});
        if (token !== epoch || destroyed || !wanted || !eligible()) return false;
        attachSources(triedMp4);
        emit('loading');
        // The poster is kept underneath until a real decoded frame is ready.
        if (video.requestVideoFrameCallback) {
          cancelFrame();
          frameId = video.requestVideoFrameCallback(() => { frameId = null; revealVideo(token); });
        }
        await video.play();
        if (token !== epoch || destroyed) return false;
        if (!eligible() || !wanted) { video.pause(); return false; }
        if (!video.requestVideoFrameCallback && video.readyState >= 2) revealVideo(token);
        return true;
      } catch (error) {
        if (token !== epoch || destroyed || error.name === 'AbortError') return false;
        if (error.name === 'NotAllowedError') {
          wanted = false;
          wrapper.dataset.frame = 'start';
          releaseVideo();
          emit('blocked');
        } else fail();
        return false;
      } finally {
        win.clearTimeout(watchdog);
        timers.delete(watchdog);
        if (token === epoch) busy = null;
      }
    })();
    return busy;
  }
  function schedule() {
    if (!wanted || !eligible() || idleId !== null || finished) return;
    const run = () => { idleId = null; void startPlayback(); };
    idleIsNative = typeof win.requestIdleCallback === 'function';
    idleId = idleIsNative ? win.requestIdleCallback(run, { timeout: 700 }) : win.setTimeout(run, 80);
  }
  function syncVisibility() {
    if (destroyed) return;
    if (!eligible()) {
      cancelIdle();
      if (!video.paused) { video.pause(); emit('paused'); }
    } else if (wanted && !finished) schedule();
  }
  function preferenceChanged() {
    if (preferenceBlocks()) {
      epoch++;
      wanted = false;
      busy = null;
      cancelIdle();
      wrapper.dataset.frame = finished && endReady ? 'end' : 'start';
      releaseVideo();
      emit('static');
    }
    // Enabling motion later does not unexpectedly start an intro.
  }
  on(video, 'ended', () => {
    if (destroyed) return;
    finished = true;
    wanted = false;
    remember();
    void showEnd(epoch);
  });
  on(video, 'error', fail);
  on(video, 'playing', () => {
    if (!video.requestVideoFrameCallback) revealVideo(epoch);
  });
  on(doc, 'visibilitychange', syncVisibility);
  on(motion, 'change', preferenceChanged);
  if (connection?.addEventListener) on(connection, 'change', preferenceChanged);

  let observer;
  if ('IntersectionObserver' in win) {
    observer = new win.IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio >= .15;
      syncVisibility();
    }, { threshold: [0, .15] });
    observer.observe(wrapper);
  } else {
    const measure = () => {
      const r = wrapper.getBoundingClientRect();
      visible = r.bottom > 0 && r.top < win.innerHeight && r.right > 0 && r.left < win.innerWidth;
      syncVisibility();
    };
    on(win, 'scroll', measure);
    on(win, 'resize', measure);
    measure();
  }

  if (sessionCompleted()) {
    finished = true;
    void showEnd(epoch);
  } else if (preferenceBlocks()) emit('static');
  else if (settings.autoplay) { wanted = true; schedule(); }

  return Object.freeze({
    async play() {
      if (destroyed) return false;
      if (preferenceBlocks()) { emit('static'); return false; }
      epoch++;
      busy = null;
      cancelIdle();
      cancelFrame();
      video.pause();
      finished = false;
      triedMp4 = false;
      wanted = true;
      // Reset the time before displaying the video, including repeated calls.
      if (loaded) video.currentTime = 0;
      wrapper.dataset.frame = 'start';
      if (!eligible()) { emit('waiting'); return false; }
      return startPlayback();
    },
    reset() {
      if (destroyed) return;
      epoch++;
      wanted = false;
      finished = false;
      busy = null;
      triedMp4 = false;
      cancelIdle();
      for (const id of timers) win.clearTimeout(id);
      timers.clear();
      wrapper.dataset.frame = 'start';
      releaseVideo();
      // Session completion is intentionally preserved across a local reset.
      emit('idle');
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      epoch++;
      wanted = false;
      cancelIdle();
      for (const id of timers) win.clearTimeout(id);
      timers.clear();
      observer?.disconnect();
      for (const dispose of disposers) dispose();
      releaseVideo();
      start.removeAttribute('src');
      end.removeAttribute('src');
      wrapper.remove();
    },
  });
}
