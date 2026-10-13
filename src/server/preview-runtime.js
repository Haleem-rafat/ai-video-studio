// Injected into a composition when the studio previews it. HyperFrames' own
// renderer decides which clips are on screen and plays the audio; in a plain
// browser tab nothing does, so this does both and lets the studio drive time.
(() => {
  const clips = [...document.querySelectorAll(".clip[data-start]")];
  const audios = [...document.querySelectorAll("audio[data-start]")];
  const root = document.querySelector("[data-composition-id]");
  const duration = Number(root?.dataset.duration ?? 0);
  const timeline = () => window.__timelines?.main;
  let time = 0;
  let playing = false;
  let clockStart = 0;
  let timeAtStart = 0;

  const windowOf = (el) => {
    const start = Number(el.dataset.start);
    return [start, start + Number(el.dataset.duration ?? Infinity)];
  };

  function draw(t) {
    time = Math.max(0, Math.min(duration, t));
    for (const clip of clips) {
      const [start, end] = windowOf(clip);
      clip.style.visibility = time >= start && time < end ? "visible" : "hidden";
    }
    timeline()?.seek(time, false);
    window.parent.postMessage({ type: "preview-time", time, duration, playing }, "*");
  }

  function syncAudio() {
    for (const audio of audios) {
      const [start, end] = windowOf(audio);
      const inside = playing && time >= start && time < end;
      if (inside && audio.paused) {
        audio.currentTime = time - start;
        audio.play().catch(() => {});
      } else if (!inside && !audio.paused) {
        audio.pause();
      }
    }
  }

  function frame(now) {
    if (!playing) return;
    draw(timeAtStart + (now - clockStart) / 1000);
    syncAudio();
    if (time >= duration) return pause();
    requestAnimationFrame(frame);
  }

  function play() {
    if (time >= duration) time = 0;
    playing = true;
    clockStart = performance.now();
    timeAtStart = time;
    requestAnimationFrame(frame);
  }

  function pause() {
    playing = false;
    syncAudio();
    draw(time);
  }

  function seek(t) {
    for (const audio of audios) audio.pause();
    draw(t);
    if (playing) {
      clockStart = performance.now();
      timeAtStart = time;
    }
  }

  window.__preview = { play, pause, seek, get time() { return time; }, get playing() { return playing; }, duration };

  window.addEventListener("message", (event) => {
    const { type, time: t } = event.data ?? {};
    if (type === "play") play();
    else if (type === "pause") pause();
    else if (type === "seek") seek(t);
  });

  // GSAP loads from a CDN; wait for the timeline before the first frame.
  const ready = () => (timeline() ? draw(0) : setTimeout(ready, 50));
  ready();
})();
