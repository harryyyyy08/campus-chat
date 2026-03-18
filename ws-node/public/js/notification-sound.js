/**
 * Plays a two-tone chime when a new announcement arrives.
 * Uses Web Audio API — no audio file required.
 */
function playAnnouncementSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();

    // [frequency (Hz), startOffset (s), stopOffset (s)]
    const notes = [
      [880, 0,    0.15],
      [660, 0.18, 0.42],
    ];

    notes.forEach(([freq, start, end]) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type          = "sine";
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0.4, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + end);

      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + end);
    });
  } catch (e) {
    // Silently ignore — audio may be blocked or unsupported
  }
}
