// ════════════════════════════════════════════
// VOICE RECORDING
// ════════════════════════════════════════════

const VOICE_MAX_SECONDS = 300; // 5 minutes

let mediaRecorder    = null;
let audioChunks      = [];
let recordingTimer   = null;
let recordingSeconds = 0;
let isRecording      = false;
let animFrameId      = null;
let analyserNode     = null;
let audioCtx         = null;
let micStream        = null;

// ── Entry point ───────────────────────────────────────────────────
async function toggleVoiceRecording() {
  if (!currentConversation) { showToast("Select a conversation first."); return; }
  if (isRecording) stopRecording();
  else await startRecording();
}

async function startRecording() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (err) {
    showToast("Microphone access denied."); return;
  }

  // Web Audio analyser for live waveform
  audioCtx     = new (window.AudioContext || window.webkitAudioContext)();
  analyserNode = audioCtx.createAnalyser();
  analyserNode.fftSize = 64;
  audioCtx.createMediaStreamSource(micStream).connect(analyserNode);

  const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus"
                 : MediaRecorder.isTypeSupported("audio/webm")             ? "audio/webm"
                 : MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")  ? "audio/ogg;codecs=opus"
                 : "audio/ogg";

  audioChunks  = [];
  mediaRecorder = new MediaRecorder(micStream, { mimeType });
  mediaRecorder.addEventListener("dataavailable", e => { if (e.data.size > 0) audioChunks.push(e.data); });
  mediaRecorder.addEventListener("stop", onRecordingStop);
  mediaRecorder.start(100);

  isRecording      = true;
  recordingSeconds = 0;

  setRecordingUI(true);
  startWaveformAnimation();

  recordingTimer = setInterval(() => {
    recordingSeconds++;
    updateRecordingTimer(recordingSeconds);
    if (recordingSeconds >= VOICE_MAX_SECONDS) stopRecording();
  }, 1000);
}

function stopRecording() {
  if (!mediaRecorder || mediaRecorder.state === "inactive") return;
  clearInterval(recordingTimer);
  cancelAnimationFrame(animFrameId);
  mediaRecorder.stop();
  micStream?.getTracks().forEach(t => t.stop());
  audioCtx?.close();
  isRecording = false;
  setRecordingUI(false);
}

function cancelRecording() {
  if (!isRecording) return;
  clearInterval(recordingTimer);
  cancelAnimationFrame(animFrameId);
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.removeEventListener("stop", onRecordingStop);
    mediaRecorder.stop();
  }
  micStream?.getTracks().forEach(t => t.stop());
  audioCtx?.close();
  isRecording  = false;
  audioChunks  = [];
  setRecordingUI(false);
  showToast("Recording cancelled.");
}

async function onRecordingStop() {
  if (!audioChunks.length) return;
  const duration = recordingSeconds; // recorded from our own timer — always accurate
  const mimeType = mediaRecorder.mimeType || "audio/webm";
  const baseMime = mimeType.split(";")[0].trim();
  const ext      = baseMime.includes("ogg") ? "ogg" : "webm";
  const blob     = new Blob(audioChunks, { type: baseMime });
  audioChunks    = [];

  const filename = `voice_${Date.now()}.${ext}`;
  const file     = new File([blob], filename, { type: baseMime });

  showToast("Uploading voice message…");
  const result = await uploadSingleFile(file);
  if (!result) return;

  result.is_voice  = true;
  result.duration  = duration; // pass our tracked duration to the player
  result.mime_type = baseMime;

  if (!pendingAttachments) pendingAttachments = [];
  pendingAttachments.push(result);
  pendingAttachment = pendingAttachments[0];
  sendMessage();
}

// ── Recording UI ──────────────────────────────────────────────────
function setRecordingUI(on) {
  document.getElementById("voiceMicBtn")?.classList.toggle("recording", on);
  document.getElementById("voiceRecordingBar")?.classList.toggle("hidden", !on);
  document.getElementById("inputBar")?.classList.toggle("recording-active", on);
  if (on) updateRecordingTimer(0);
}

function updateRecordingTimer(s) {
  const el = document.getElementById("voiceRecordingTimer");
  if (!el) return;
  el.textContent = `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`;
  el.classList.toggle("warn", s >= 270);
}

function startWaveformAnimation() {
  const canvas = document.getElementById("voiceWaveformCanvas");
  if (!canvas || !analyserNode) return;
  const ctx  = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const data = new Uint8Array(analyserNode.frequencyBinCount);
  const color = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#3b82f6";

  function draw() {
    animFrameId = requestAnimationFrame(draw);
    analyserNode.getByteFrequencyData(data);
    ctx.clearRect(0, 0, W, H);
    const bars = 24, gap = 3;
    const barW = (W - gap * (bars - 1)) / bars;
    for (let i = 0; i < bars; i++) {
      const val  = data[Math.floor(i * data.length / bars)] / 255;
      const barH = Math.max(3, val * H);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(i * (barW + gap), (H - barH) / 2, barW, barH, 2);
      ctx.fill();
    }
  }
  draw();
}

// ── Voice player in chat ──────────────────────────────────────────
function initVoicePlayers() {
  document.querySelectorAll(".voice-player:not([data-init])").forEach(player => {
    player.dataset.init = "1";

    const playBtn     = player.querySelector(".voice-play-btn");
    const waveWrap    = player.querySelector(".voice-wave-wrap");
    const timeEl      = player.querySelector(".voice-time");
    if (!playBtn) return;

    // Duration from data attribute — set when message was sent (our timer)
    // For loaded messages, fallback to metadata
    const knownDuration = parseInt(player.getAttribute("data-duration") || "0", 10);
    if (knownDuration > 0 && timeEl) {
      timeEl.textContent = formatAudioTime(knownDuration);
    }

    const audio = new Audio();
    audio.preload = "none";
    player.appendChild(audio);

    const src = player.getAttribute("data-audio-src");
    if (src) {
      fetch(toAbsoluteUrl(src), { headers: { Authorization: "Bearer " + token } })
        .then(r => { if (!r.ok) throw new Error(r.status); return r.blob(); })
        .then(blob => { audio.src = URL.createObjectURL(blob); })
        .catch(() => { playBtn.disabled = true; });
    }

    // Play / pause
    playBtn.addEventListener("click", () => {
      if (audio.paused) {
        document.querySelectorAll(".voice-player audio").forEach(a => {
          if (a !== audio) { a.pause(); a.closest(".voice-player")?.querySelector(".voice-play-btn")?.classList.remove("playing"); }
        });
        audio.play();
        playBtn.classList.add("playing");
      } else {
        audio.pause();
        playBtn.classList.remove("playing");
      }
    });

    // Progress
    audio.addEventListener("timeupdate", () => {
      const dur = isFinite(audio.duration) ? audio.duration : knownDuration;
      if (!dur) return;
      updateWaveFill(waveWrap, audio.currentTime / dur);
      if (timeEl && !audio.paused) timeEl.textContent = formatAudioTime(audio.currentTime);
    });

    audio.addEventListener("ended", () => {
      playBtn.classList.remove("playing");
      updateWaveFill(waveWrap, 0);
      const dur = isFinite(audio.duration) ? audio.duration : knownDuration;
      if (timeEl) timeEl.textContent = formatAudioTime(dur || 0);
    });

    // Seek on click
    waveWrap?.addEventListener("click", e => {
      const dur = isFinite(audio.duration) ? audio.duration : knownDuration;
      if (!dur) return;
      const rect = waveWrap.getBoundingClientRect();
      audio.currentTime = ((e.clientX - rect.left) / rect.width) * dur;
    });
  });
}

function updateWaveFill(waveWrap, ratio) {
  if (!waveWrap) return;
  waveWrap.querySelectorAll(".voice-bar").forEach((bar, i, arr) => {
    bar.classList.toggle("filled", i / arr.length <= ratio);
  });
}

function formatAudioTime(secs) {
  if (!secs || isNaN(secs) || !isFinite(secs)) return "0:00";
  const s = Math.floor(secs);
  return `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
}