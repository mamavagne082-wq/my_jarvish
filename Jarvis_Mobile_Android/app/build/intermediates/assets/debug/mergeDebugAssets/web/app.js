/**
 * Jarvis AI Companion Mobile Web UI - Interactive Controller & Native Bridge
 * Replicates PC React/Next.js Interface: 3D Holographic Canvas Orb, Audio Spectrum,
 * Multi-Tab Navigation, Full API Key Configuration, and Native Android Controls.
 */

// Global State
const state = {
  currentTab: 'home',
  agentState: 'idle', // 'idle' | 'listening' | 'thinking' | 'speaking'
  orbTheme: 'neon',
  particlesEnabled: true,
  audioDynamicsEnabled: true,
  isMicActive: false,
  serviceRunning: true,
  accessibilityEnabled: false,
  batteryIgnored: false,
};

// Color Palettes for Themes
const THEMES = {
  neon: {
    core1: '#22d3ee',
    core2: '#0891b2',
    ring: 'rgba(34, 211, 238, 0.6)',
    particle: '#67e8f9',
    glow: 'rgba(6, 182, 212, 0.4)'
  },
  arc: {
    core1: '#ffffff',
    core2: '#38bdf8',
    ring: 'rgba(56, 189, 248, 0.8)',
    particle: '#bae6fd',
    glow: 'rgba(14, 165, 233, 0.5)'
  },
  purple: {
    core1: '#c084fc',
    core2: '#9333ea',
    ring: 'rgba(192, 132, 252, 0.7)',
    particle: '#e9d5ff',
    glow: 'rgba(168, 85, 247, 0.5)'
  },
  gold: {
    core1: '#fde047',
    core2: '#ca8a04',
    ring: 'rgba(250, 204, 21, 0.7)',
    particle: '#fef08a',
    glow: 'rgba(234, 179, 8, 0.5)'
  },
  emerald: {
    core1: '#34d399',
    core2: '#059669',
    ring: 'rgba(52, 211, 153, 0.7)',
    particle: '#a7f3d0',
    glow: 'rgba(16, 185, 129, 0.5)'
  }
};

// -------------------------------------------------------------------------
// Tab Navigation
// -------------------------------------------------------------------------
function switchTab(rawTabId) {
  let tabId = rawTabId || 'home';
  if (tabId === 'pclink' || tabId === 'pc' || tabId === 'pc-link') tabId = 'pc-connect';
  if (tabId === 'models' || tabId === 'model') tabId = 'modes';
  if (tabId === 'setting') tabId = 'settings';

  state.currentTab = tabId;

  // Update tabs
  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.remove('active');
  });
  const target = document.getElementById(`tab-${tabId}`);
  if (target) {
    target.classList.add('active');
  }

  // Update bottom navigation
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.remove('active');
  });
  const navItem = document.getElementById(`nav-${tabId}`);
  if (navItem) {
    navItem.classList.add('active');
  }

  // If opening settings, reload latest saved configuration & health
  if (tabId === 'settings') {
    loadConfiguration();
    refreshApiHealth(false);
  }

  // Notify native of user activity
  callNative('resetIdleTimer');
}
window.switchTab = switchTab;

// -------------------------------------------------------------------------
// 3D Holographic Canvas Orb
// -------------------------------------------------------------------------
const orbCanvas = document.getElementById('orbCanvas');
const orbCtx = orbCanvas.getContext('2d');
let orbAnimationId = null;
let orbAngle = 0;
let orbParticles = [];

function initParticles() {
  orbParticles = [];
  const count = 90;
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    const radius = 55 + Math.random() * 35;
    orbParticles.push({
      theta,
      phi,
      radius,
      speedTheta: (Math.random() - 0.5) * 0.02,
      speedPhi: (Math.random() - 0.5) * 0.015,
      size: 1 + Math.random() * 2.2,
      alpha: 0.2 + Math.random() * 0.8
    });
  }
}

function renderOrb() {
  const width = orbCanvas.width;
  const height = orbCanvas.height;
  const cx = width / 2;
  const cy = height / 2;

  orbCtx.clearRect(0, 0, width, height);

  const theme = THEMES[state.orbTheme] || THEMES.neon;
  let pulseSpeed = 0.03;
  let scalePulse = Math.sin(Date.now() * 0.003) * 6;

  // React to Agent State
  if (state.agentState === 'listening') {
    pulseSpeed = 0.08;
    scalePulse = Math.sin(Date.now() * 0.008) * 14;
  } else if (state.agentState === 'thinking') {
    orbAngle += 0.05;
    scalePulse = Math.sin(Date.now() * 0.006) * 10;
  } else if (state.agentState === 'speaking') {
    pulseSpeed = 0.12;
    scalePulse = Math.sin(Date.now() * 0.012) * 18;
  } else {
    orbAngle += 0.01;
  }

  // 1. Ambient Background Glow
  const bgGlow = orbCtx.createRadialGradient(cx, cy, 10, cx, cy, 110);
  bgGlow.addColorStop(0, theme.glow);
  bgGlow.addColorStop(0.7, 'rgba(6, 182, 212, 0.08)');
  bgGlow.addColorStop(1, 'transparent');
  orbCtx.fillStyle = bgGlow;
  orbCtx.beginPath();
  orbCtx.arc(cx, cy, 110, 0, Math.PI * 2);
  orbCtx.fill();

  // 2. Central Pulsating Core
  const coreRadius = Math.max(25, 42 + scalePulse);
  const coreGrad = orbCtx.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, coreRadius);
  coreGrad.addColorStop(0, '#ffffff');
  coreGrad.addColorStop(0.3, theme.core1);
  coreGrad.addColorStop(0.85, theme.core2);
  coreGrad.addColorStop(1, 'rgba(2, 6, 23, 0.2)');

  orbCtx.save();
  orbCtx.shadowColor = theme.core1;
  orbCtx.shadowBlur = 25;
  orbCtx.fillStyle = coreGrad;
  orbCtx.beginPath();
  orbCtx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
  orbCtx.fill();
  orbCtx.restore();

  // 3. Dual 3D Holographic Orbiting Rings
  orbCtx.save();
  orbCtx.translate(cx, cy);

  // Outer Ring
  orbCtx.save();
  orbCtx.rotate(orbAngle);
  orbCtx.beginPath();
  orbCtx.ellipse(0, 0, 75 + scalePulse * 0.5, 30, Math.PI / 4, 0, Math.PI * 2);
  orbCtx.strokeStyle = theme.ring;
  orbCtx.lineWidth = 2;
  orbCtx.shadowColor = theme.core1;
  orbCtx.shadowBlur = 12;
  orbCtx.stroke();
  orbCtx.restore();

  // Inner Ring
  orbCtx.save();
  orbCtx.rotate(-orbAngle * 1.4);
  orbCtx.beginPath();
  orbCtx.ellipse(0, 0, 65, 22, -Math.PI / 5, 0, Math.PI * 2);
  orbCtx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  orbCtx.lineWidth = 1.5;
  orbCtx.stroke();
  orbCtx.restore();

  orbCtx.restore();

  // 4. 3D Spherical Particle Cloud
  if (state.particlesEnabled) {
    orbParticles.forEach(p => {
      p.theta += p.speedTheta;
      p.phi += p.speedPhi;

      // 3D to 2D projection
      const x3d = p.radius * Math.sin(p.phi) * Math.cos(p.theta);
      const y3d = p.radius * Math.sin(p.phi) * Math.sin(p.theta);
      const z3d = p.radius * Math.cos(p.phi);

      const fov = 160;
      const scale = fov / (fov + z3d);
      const px = cx + x3d * scale;
      const py = cy + y3d * scale;

      const pSize = Math.max(0.5, p.size * scale);
      const alpha = Math.max(0.1, Math.min(1, p.alpha * (z3d + 60) / 120));

      orbCtx.fillStyle = theme.particle;
      orbCtx.globalAlpha = alpha;
      orbCtx.beginPath();
      orbCtx.arc(px, py, pSize, 0, Math.PI * 2);
      orbCtx.fill();
      orbCtx.globalAlpha = 1.0;
    });
  }

  orbAnimationId = requestAnimationFrame(renderOrb);
}

// -------------------------------------------------------------------------
// Audio Spectrum Canvas Simulator
// -------------------------------------------------------------------------
const spectrumCanvas = document.getElementById('spectrumCanvas');
const specCtx = spectrumCanvas.getContext('2d');
const numBars = 32;

function renderSpectrum() {
  specCtx.clearRect(0, 0, spectrumCanvas.width, spectrumCanvas.height);

  const barWidth = 6;
  const gap = 3;
  const startX = (spectrumCanvas.width - (numBars * (barWidth + gap))) / 2;

  for (let i = 0; i < numBars; i++) {
    let barHeight = 4;
    if (state.agentState === 'speaking' || state.agentState === 'listening') {
      const freq = Math.sin(Date.now() * 0.01 + i * 0.4);
      barHeight = 6 + Math.abs(freq) * 36;
    } else {
      barHeight = 4 + Math.sin(Date.now() * 0.002 + i * 0.2) * 5;
    }

    const x = startX + i * (barWidth + gap);
    const y = spectrumCanvas.height - barHeight;

    const grad = specCtx.createLinearGradient(x, y, x, spectrumCanvas.height);
    grad.addColorStop(0, '#22d3ee');
    grad.addColorStop(1, 'rgba(6, 182, 212, 0.15)');

    specCtx.fillStyle = grad;
    specCtx.beginPath();
    specCtx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
    specCtx.fill();
  }

  requestAnimationFrame(renderSpectrum);
}

// -------------------------------------------------------------------------
// Call Session State Management (Talk To Jarvis & Bye Jarvis / End Call)
// -------------------------------------------------------------------------
function playByeAudio() {
  try {
    callNative('speakTextLocally', 'বাই বাই জানু, ধন্যবাদ তোমাকে!');
  } catch (_) {}
  try {
    const audio = new Audio('bye.mp3');
    audio.volume = 1.0;
    audio.play().catch(() => {});
  } catch (_) {}
}

function startVoiceSession() {
  state.isSessionActive = true;
  state.isMicActive = true;

  // Switch UI to Active Session View (3D Orb & Live Spectrum)
  const welcome = document.getElementById('welcomeView');
  const session = document.getElementById('sessionView');
  if (welcome) welcome.classList.add('view-hidden');
  if (session) session.classList.remove('view-hidden');

  const micBtn = document.getElementById('centerMicBtn');
  if (micBtn) micBtn.classList.add('active');

  updateAgentState('listening', 'ONLINE // LISTENING');
  addTranscript('Jarvis সক্রিয় হচ্ছে (Loudspeaker On)... কথা বলুন!', 'assistant');

  // Trigger Native LiveKit Connection / Gemini Direct fallback
  callNative('startVoiceCall');
  showToast('JARVIS VOICE SESSION STARTED // কথা বলুন');
}

function endVoiceSession() {
  state.isSessionActive = false;
  state.isMicActive = false;

  // 1. Play crystal clear Bengali verbal bye: 'বাই বাই জানু, ধন্যবাদ তোমাকে!'
  playByeAudio();

  // 2. Switch UI back to Standby Welcome View with big Talk To Jarvis button
  const welcome = document.getElementById('welcomeView');
  const session = document.getElementById('sessionView');
  if (session) session.classList.add('view-hidden');
  if (welcome) welcome.classList.remove('view-hidden');

  const micBtn = document.getElementById('centerMicBtn');
  if (micBtn) micBtn.classList.remove('active');

  updateAgentState('idle', 'STANDBY // READY');
  addTranscript('Jarvis বন্ধ করা হয়েছে। বাই বাই জানু, ধন্যবাদ তোমাকে!', 'assistant');

  // 3. Trigger Native LiveKit Disconnect (with SAY_BYE data packet & sound release)
  callNative('endVoiceCall');
  showToast('JARVIS DISCONNECTED // বন্ধ করা হয়েছে (বাই বাই!)');
}

function toggleVoiceSession() {
  if (state.isSessionActive) {
    endVoiceSession();
  } else {
    startVoiceSession();
  }
}

function toggleMicrophone() {
  toggleVoiceSession();
}

function shutdownJarvis() {
  endVoiceSession();
  callNative('shutdownJarvis');
  showToast('JARVIS SYSTEM SHUTDOWN COMPLETED');
}

let isMicMuted = false;
function toggleMuteMic() {
  isMicMuted = !isMicMuted;
  const btn = document.getElementById('btnMicMute');
  if (btn) {
    btn.innerHTML = isMicMuted ? '<span>🔇 Mic Muted</span>' : '<span>🎙️ Mute Mic</span>';
    if (isMicMuted) btn.classList.add('active'); else btn.classList.remove('active');
  }
  callNative('toggleMic');
  showToast(isMicMuted ? 'MICROPHONE MUTED' : 'MICROPHONE LIVE');
}

let isSpeakerphoneOn = true;
function toggleSpeakerphone() {
  isSpeakerphoneOn = !isSpeakerphoneOn;
  const btn = document.getElementById('btnSpeaker');
  if (btn) {
    btn.innerHTML = isSpeakerphoneOn ? '<span>🔊 Loudspeaker: ON</span>' : '<span>🔈 Earpiece Mode</span>';
    if (isSpeakerphoneOn) btn.classList.add('active'); else btn.classList.remove('active');
  }
  callNative('setSpeakerphone', isSpeakerphoneOn);
  showToast(isSpeakerphoneOn ? 'LOUDSPEAKER ACTIVE (হাই সাউন্ড)' : 'EARPIECE ACTIVE');
}

function updateAgentState(newState, label) {
  state.agentState = newState;
  const stateText = document.getElementById('orbStateText');
  const stateDot = document.getElementById('orbStateDot');

  if (stateText) stateText.innerText = label || newState.toUpperCase();

  if (newState === 'listening') {
    stateDot.style.background = '#22d3ee';
    stateDot.style.boxShadow = '0 0 10px #22d3ee';
  } else if (newState === 'thinking') {
    stateDot.style.background = '#c084fc';
    stateDot.style.boxShadow = '0 0 10px #c084fc';
  } else if (newState === 'speaking') {
    stateDot.style.background = '#f43f5e';
    stateDot.style.boxShadow = '0 0 10px #f43f5e';
  } else {
    stateDot.style.background = '#22d3ee';
    stateDot.style.boxShadow = '0 0 10px #22d3ee';
  }
}

function addTranscript(text, sender) {
  const container = document.getElementById('transcriptBody');
  if (!container) return;

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${sender || 'assistant'}`;
  bubble.innerText = text;
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

// -------------------------------------------------------------------------
// Theme & Settings Handlers
// -------------------------------------------------------------------------
function changeOrbTheme(themeKey) {
  state.orbTheme = themeKey;
  callNative('resetIdleTimer');
}

function toggleParticles(enabled) {
  state.particlesEnabled = enabled;
  callNative('resetIdleTimer');
}

function onProviderSelectChanged() {
  const provider = document.getElementById('modeProviderSelect').value;
  const modelSelect = document.getElementById('modeModelSelect');
  if (provider === 'openai') {
    modelSelect.value = 'gpt-4o-realtime-preview';
  } else {
    modelSelect.value = 'gemini-3.8-live';
  }
}

// -------------------------------------------------------------------------
// Native Bridge Communication (JarvisNative)
// -------------------------------------------------------------------------
function callNative(method, ...args) {
  try {
    if (window.JarvisNative && typeof window.JarvisNative[method] === 'function') {
      return window.JarvisNative[method](...args);
    }
  } catch (err) {
    console.warn(`JarvisNative.${method} error:`, err);
  }
  return null;
}

// Safe DOM field setter & getter helpers
function setFieldVal(id, val) {
  try {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) {
      el.value = val;
    }
  } catch (_) {}
}

function getFieldVal(id, fallback = '') {
  try {
    const el = document.getElementById(id);
    return (el && el.value !== undefined) ? el.value.trim() : fallback;
  } catch (_) {
    return fallback;
  }
}

function loadConfiguration() {
  try {
    const raw = callNative('getConfig');
    if (!raw) return;
    const cfg = JSON.parse(raw);

    setFieldVal('cfgUserName', cfg.user_name || 'ALAMIN');
    setFieldVal('cfgAssistantName', cfg.assistant_name || 'Jarvis');
    if (cfg.llm_provider) setFieldVal('modeProviderSelect', cfg.llm_provider);
    if (cfg.llm_model) setFieldVal('modeModelSelect', cfg.llm_model);
    if (cfg.orb_theme) {
      setFieldVal('auraThemeSelect', cfg.orb_theme);
      state.orbTheme = cfg.orb_theme;
    }
    if (cfg.pc_host) {
      setFieldVal('pcHostIpInput', cfg.pc_host.split(':')[0]);
      if (cfg.pc_host.includes(':')) {
        setFieldVal('pcPortInput', cfg.pc_host.split(':')[1]);
      }
    }

    const keys = cfg.api_keys || {};
    setFieldVal('cfgGoogleKey', keys.google || keys.google_key || '');
    setFieldVal('cfgOpenAiKey', keys.openai || keys.openai_key || '');
    setFieldVal('cfgOpenRouterKey', keys.openrouter || keys.openrouter_key || '');
    setFieldVal('cfgGrokKey', keys.grok || keys.grok_key || '');
    setFieldVal('cfgLiveKitUrl', keys.livekit_url || '');
    setFieldVal('cfgLiveKitKey', keys.livekit_key || '');
    setFieldVal('cfgLiveKitSecret', keys.livekit_secret || '');
    setFieldVal('cfgMem0Key', keys.mem0 || keys.mem0_key || '');
    setFieldVal('cfgGoogleSearchKey', keys.google_search || keys.google_search_key || '');
    setFieldVal('cfgSearchEngineId', keys.search_engine_id || '');
    setFieldVal('cfgOpenWeatherKey', keys.openweather || keys.openweather_key || '');
    setFieldVal('cfgXiaomiMimoKey', keys.xiaomi_mimo || keys.xiaomi_mimo_key || '');
    setFieldVal('cfgElevenLabsKey', keys.elevenlabs || keys.elevenlabs_key || '');
    setFieldVal('cfgElevenLabsVoiceId', keys.elevenlabs_voice_id || '');

    // Load initial PC Pairing Status
    try {
      const pairStatusRaw = callNative('getPcPairingStatus');
      if (pairStatusRaw) {
        const pStatus = JSON.parse(pairStatusRaw);
        if (pStatus.ip) setFieldVal('pcHostIpInput', pStatus.ip);
        if (pStatus.port) setFieldVal('pcPortInput', pStatus.port);
        if (pStatus.secret) setFieldVal('pcSecretKeyInput', pStatus.secret);
        if (typeof window.onPcPairStatusChanged === 'function') {
          window.onPcPairStatusChanged(pStatus.paired, `${pStatus.ip}:${pStatus.port}`);
        }
      }
    } catch (_) {}
    console.log("Configuration and API keys loaded successfully!");
    // Trigger initial health refresh
    setTimeout(() => refreshApiHealth(false), 200);
  } catch (e) {
    console.error('Failed to load initial config from native bridge:', e);
  }
}

// Debounced auto-save so user never loses their typed API keys
let autoSaveTimer = null;
function triggerAutoSave() {
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    saveConfiguration(true);
  }, 1000);
}

function saveConfiguration(silent = false) {
  const hostIp = getFieldVal('pcHostIpInput', '192.168.31.163');
  const hostPort = getFieldVal('pcPortInput', '8765');
  const fullPcHost = `${hostIp}:${hostPort}`;

  const config = {
    user_name: getFieldVal('cfgUserName', 'ALAMIN'),
    assistant_name: getFieldVal('cfgAssistantName', 'Jarvis'),
    llm_provider: getFieldVal('modeProviderSelect', 'google'),
    llm_model: getFieldVal('modeModelSelect', 'gemini-3.8-flash'),
    orb_theme: getFieldVal('auraThemeSelect', 'neon'),
    pc_host: fullPcHost,
    api_keys: {
      google: getFieldVal('cfgGoogleKey'),
      openai: getFieldVal('cfgOpenAiKey'),
      openrouter: getFieldVal('cfgOpenRouterKey'),
      grok: getFieldVal('cfgGrokKey'),
      livekit_url: getFieldVal('cfgLiveKitUrl'),
      livekit_key: getFieldVal('cfgLiveKitKey'),
      livekit_secret: getFieldVal('cfgLiveKitSecret'),
      mem0: getFieldVal('cfgMem0Key'),
      google_search: getFieldVal('cfgGoogleSearchKey'),
      search_engine_id: getFieldVal('cfgSearchEngineId'),
      openweather: getFieldVal('cfgOpenWeatherKey'),
      xiaomi_mimo: getFieldVal('cfgXiaomiMimoKey'),
      elevenlabs: getFieldVal('cfgElevenLabsKey'),
      elevenlabs_voice_id: getFieldVal('cfgElevenLabsVoiceId'),
    }
  };

  const success = callNative('saveConfig', JSON.stringify(config));
  if (!silent) {
    showToast(success !== false ? '✅ সকল সেটিংস ও API কী ডিভাইসে সংরক্ষিত হয়েছে!' : '⚠️ সেটিংস সংরক্ষণে সমস্যা হয়েছে');
  }
  // Refresh health indicator after save
  setTimeout(() => refreshApiHealth(true), 300);
}

function toggleFieldVisibility(fieldId) {
  const input = document.getElementById(fieldId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

function executeAction(action, payload) {
  callNative('executeMobileAction', action, JSON.stringify(payload || {}));
  showToast(`Action: ${action.toUpperCase()}`);
}

function onServiceToggleChanged(enabled) {
  callNative('toggleService', enabled);
  showToast(enabled ? '24/7 BACKGROUND SERVICE STARTED' : 'SERVICE STOPPED');
}

function requestAccessibilityPermission() {
  callNative('openAccessibilitySettings');
}

function requestBatteryOptimization() {
  callNative('requestBatteryOptimization');
}

function requestNotificationAccess() {
  callNative('openNotificationListenerSettings');
}

// -------------------------------------------------------------------------
// PC Pairing & Remote Controls Matrix
// -------------------------------------------------------------------------
function pairWithPcManual() {
  const ip = (document.getElementById('pcHostIpInput').value || '').trim();
  const port = parseInt(document.getElementById('pcPortInput').value || '8765');
  const secret = (document.getElementById('pcSecretKeyInput').value || '').trim();
  if (!ip) {
    showToast('⚠️ পিসির আইপি এড্রেস দিন!');
    return;
  }
  showToast(`পিসির সাথে পেয়ার করার চেষ্টা করা হচ্ছে (${ip}:${port})...`);
  callNative('pairWithPc', ip, port, secret);
}

function unpairFromPc() {
  callNative('unpairFromPc');
}

function sendPcAction(action, target) {
  callNative('sendPcAction', action, target || '');
}

function fetchPcScreenNow() {
  callNative('fetchPcScreen');
  showToast('🖥️ পিসির স্ক্রিন রিফ্রেশ করা হচ্ছে...');
}

window.onPcPairStatusChanged = function(isPaired, hostStr, pcName) {
  state.isPcPaired = !!isPaired;
  const unpairedBanner = document.getElementById('pcUnpairedBanner');
  const pairedBanner = document.getElementById('pcPairedBanner');
  const hostBadge = document.getElementById('pairedHostBadge');

  if (isPaired) {
    if (unpairedBanner) unpairedBanner.classList.add('view-hidden');
    if (pairedBanner) pairedBanner.classList.remove('view-hidden');
    if (hostBadge && hostStr) hostBadge.innerText = `${hostStr} (${pcName || 'PC'})`;
    showToast('✅ পিসির সাথে সফলভাবে কানেক্টেড!');
    setTimeout(fetchPcScreenNow, 800);
  } else {
    if (pairedBanner) pairedBanner.classList.add('view-hidden');
    if (unpairedBanner) unpairedBanner.classList.remove('view-hidden');
    const screenImg = document.getElementById('pcScreenImg');
    const screenPlaceholder = document.getElementById('pcScreenPlaceholder');
    if (screenImg) screenImg.style.display = 'none';
    if (screenPlaceholder) screenPlaceholder.style.display = 'block';
  }
};

window.onPcScreenReceived = function(b64Data) {
  const screenImg = document.getElementById('pcScreenImg');
  const screenPlaceholder = document.getElementById('pcScreenPlaceholder');
  if (screenImg) {
    screenImg.src = b64Data;
    screenImg.style.display = 'block';
  }
  if (screenPlaceholder) {
    screenPlaceholder.style.display = 'none';
  }
};

// QR Scanner Handlers
let qrMediaStream = null;
let qrScanInterval = null;

async function startQrScan() {
  const container = document.getElementById('qrScannerContainer');
  const video = document.getElementById('qrVideo');
  if (!container || !video) return;

  container.classList.remove('view-hidden');
  try {
    qrMediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    });
    video.srcObject = qrMediaStream;
    await video.play();

    if ('BarcodeDetector' in window) {
      const barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
      qrScanInterval = setInterval(async () => {
        try {
          const barcodes = await barcodeDetector.detect(video);
          if (barcodes.length > 0) {
            handleQrScannedResult(barcodes[0].rawValue);
          }
        } catch (_) {}
      }, 500);
    } else {
      showToast('ক্যামেরা সক্রিয়। পিসির কিউআর কোডের দিকে ধরুন...');
    }
  } catch (err) {
    console.error('Camera QR error:', err);
    showToast('⚠️ ক্যামেরা এক্সেস পাওয়া যায়নি। ছবি আপলোড বা আইপি দিয়ে পেয়ার করুন।');
    stopQrScan();
  }
}

function stopQrScan() {
  const container = document.getElementById('qrScannerContainer');
  const video = document.getElementById('qrVideo');
  if (qrScanInterval) {
    clearInterval(qrScanInterval);
    qrScanInterval = null;
  }
  if (qrMediaStream) {
    qrMediaStream.getTracks().forEach(t => t.stop());
    qrMediaStream = null;
  }
  if (video) video.srcObject = null;
  if (container) container.classList.add('view-hidden');
}

function handleQrFile(input) {
  if (!input.files || !input.files[0]) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = async function() {
      if ('BarcodeDetector' in window) {
        try {
          const barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
          const barcodes = await barcodeDetector.detect(img);
          if (barcodes.length > 0) {
            handleQrScannedResult(barcodes[0].rawValue);
            return;
          }
        } catch (_) {}
      }
      showToast('⚠️ কিউআর কোড পড়া যায়নি। আইপি ও সিকিউরিটি কোড লিখে পেয়ার করুন।');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function handleQrScannedResult(rawText) {
  stopQrScan();
  showToast('📷 কিউআর কোড স্ক্যান সফল!');
  try {
    let obj = null;
    if (rawText.trim().startsWith('{')) {
      obj = JSON.parse(rawText);
    } else if (rawText.includes(':')) {
      const parts = rawText.split(':');
      if (parts.length >= 3) {
        obj = { ip: parts[0], port: parts[1], secret: parts[2] };
      }
    }
    if (obj) {
      if (obj.ip) document.getElementById('pcHostIpInput').value = obj.ip;
      if (obj.port) document.getElementById('pcPortInput').value = obj.port;
      if (obj.secret) document.getElementById('pcSecretKeyInput').value = obj.secret;
      pairWithPcManual();
      return;
    }
  } catch (_) {}
  showToast(`কিউআর ডেটা: ${rawText}`);
}

function showToast(msg) {
  const toast = document.getElementById('toastNotice');
  if (!toast) return;
  toast.innerText = msg;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2400);
}

// -------------------------------------------------------------------------
// API Health Verification & HUD Bar (Matches Desktop Jarvis EXE)
// -------------------------------------------------------------------------
let latestHealthData = null;

function refreshApiHealth(force = false) {
  const icon = document.getElementById('healthRefreshIcon');
  if (icon) icon.style.animation = 'spin 0.8s linear infinite';

  try {
    // 1. Trigger background async network health check in native Kotlin
    callNative('checkApiHealthAsync');

    // 2. Also fetch cached health immediately
    const raw = callNative('getApiHealth');
    if (raw) {
      const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
      renderApiHealth(data);
    }
  } catch (err) {
    console.error('refreshApiHealth error:', err);
  } finally {
    setTimeout(() => {
      if (icon) icon.style.animation = '';
    }, 1000);
  }
}

function renderApiHealth(data) {
  if (!data) return;
  latestHealthData = data;

  const pct = Math.max(0, Math.min(100, Math.round(data.overall_health_percent || 0)));
  const healthyCount = data.healthy_keys_count || 0;
  const totalCount = data.total_keys_count || 0;

  // 1. Overall Progress Fill & Percent text
  const fillEl = document.getElementById('healthProgressFill');
  const pctEl = document.getElementById('healthPctText');
  const countEl = document.getElementById('healthSummaryCount');
  const timeEl = document.getElementById('healthTime');

  if (fillEl) {
    fillEl.style.width = `${pct}%`;
    fillEl.className = 'health-progress-fill ' + (pct >= 80 ? 'fill-emerald' : pct >= 40 ? 'fill-amber' : 'fill-red');
  }

  if (pctEl) {
    pctEl.innerText = `${pct}%`;
    pctEl.className = 'health-pct-text ' + (pct >= 80 ? 'text-emerald' : pct >= 40 ? 'text-amber' : 'text-red');
  }

  if (countEl) {
    countEl.innerText = `${healthyCount}/${totalCount} OK`;
  }

  if (timeEl && data.checked_at) {
    try {
      const dt = new Date(data.checked_at);
      const hours = String(dt.getHours()).padStart(2, '0');
      const mins = String(dt.getMinutes()).padStart(2, '0');
      const secs = String(dt.getSeconds()).padStart(2, '0');
      timeEl.innerText = `${hours}:${mins}:${secs}`;
    } catch (_) {
      timeEl.innerText = 'Active';
    }
  }

  // 2. Render Status Chips
  const chipsRow = document.getElementById('healthChipsRow');
  if (chipsRow && Array.isArray(data.keys)) {
    chipsRow.innerHTML = '';
    data.keys.forEach(k => {
      const chip = document.createElement('div');
      const isErr = k.status === 'exhausted' || k.status === 'invalid';
      chip.className = 'health-chip' + (isErr ? ' chip-error' : '');
      chip.onclick = () => focusApiKey(k.provider || k.name);

      const dotClass = k.status === 'healthy' ? 'dot-emerald' :
                       isErr ? 'dot-red' :
                       k.status === 'configured' ? 'dot-amber' : 'dot-gray';

      const iconBadge = k.status === 'healthy' ? '✅' :
                        k.status === 'exhausted' ? '⚠️ কোটা শেষ' :
                        k.status === 'invalid' ? '❌ ত্রুটি' :
                        k.status === 'not_configured' ? '—' : '⚙️';

      chip.innerHTML = `
        <span class="health-chip-dot ${dotClass}"></span>
        <span class="health-chip-name">${k.name || k.provider}</span>
        <span class="health-chip-badge">${iconBadge}</span>
      `;
      chipsRow.appendChild(chip);

      // Also update settings badges if visible
      updateSettingKeyBadge(k.provider, k.status, k.detail);
    });
  }

  // 3. Error Banner
  const errBanner = document.getElementById('healthErrorsRow');
  if (errBanner) {
    const errorKeys = (data.keys || []).filter(k => k.status === 'exhausted' || k.status === 'invalid');
    if (errorKeys.length > 0) {
      errBanner.style.display = 'flex';
      const msg = errorKeys.map(k => `<strong>${k.name}</strong>: ${k.detail || 'ত্রুটি'}`).join(' • ');
      errBanner.innerHTML = `⚠️ <span>${msg}</span> <button class="btn-fix-key" onclick="focusApiKey('${errorKeys[0].provider}')">চেঞ্জ করুন</button>`;
    } else {
      errBanner.style.display = 'none';
      errBanner.innerHTML = '';
    }
  }
}

function updateSettingKeyBadge(provider, status, detail) {
  const badge = document.getElementById(`statusBadge-${provider}`);
  if (!badge) return;

  if (status === 'healthy') {
    badge.innerText = '✅ Healthy (সক্রিয়)';
    badge.style.color = '#34d399';
  } else if (status === 'exhausted') {
    badge.innerText = '⚠️ কোটা শেষ (429 Quota Exhausted)';
    badge.style.color = '#f87171';
  } else if (status === 'invalid') {
    badge.innerText = '❌ ইনভ্যালিড কী (Invalid Key)';
    badge.style.color = '#ef4444';
  } else if (status === 'not_configured') {
    badge.innerText = '— সেট করা হয়নি';
    badge.style.color = '#94a3b8';
  } else {
    badge.innerText = detail || 'কনফিগার করা হয়েছে';
    badge.style.color = '#fbbf24';
  }
}

function focusApiKey(provider) {
  switchTab('settings');
  const map = {
    google: 'cfgGoogleKey',
    openai: 'cfgOpenAiKey',
    openrouter: 'cfgOpenRouterKey',
    grok: 'cfgGrokKey',
    elevenlabs: 'cfgElevenLabsKey',
    livekit: 'cfgLiveKitKey'
  };
  const inputId = map[provider] || 'cfgGoogleKey';
  const el = document.getElementById(inputId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus();
    el.style.boxShadow = '0 0 16px rgba(34, 211, 238, 0.8)';
    setTimeout(() => { el.style.boxShadow = ''; }, 2000);
  }
}

function onApiKeyInputChanged(provider) {
  triggerAutoSave();
  const badge = document.getElementById(`statusBadge-${provider}`);
  if (badge) {
    badge.innerText = '🔄 সেভ হচ্ছে...';
    badge.style.color = '#38bdf8';
  }
}

function testKeyLive(provider) {
  const map = {
    google: 'cfgGoogleKey',
    openai: 'cfgOpenAiKey',
    openrouter: 'cfgOpenRouterKey',
    grok: 'cfgGrokKey'
  };
  const inputId = map[provider];
  const keyVal = getFieldVal(inputId);
  const badge = document.getElementById(`statusBadge-${provider}`);

  if (!keyVal) {
    if (badge) {
      badge.innerText = '⚠️ কী খালি!';
      badge.style.color = '#f87171';
    }
    showToast('অনুগ্রহ করে আগে API কী পেস্ট করুন');
    return;
  }

  if (badge) {
    badge.innerText = '⏳ টেস্ট করা হচ্ছে...';
    badge.style.color = '#38bdf8';
  }

  // Trigger test directly through native bridge
  const res = callNative('checkSingleKeyHealth', provider, keyVal);
  if (res) {
    try {
      const obj = JSON.parse(res);
      updateSettingKeyBadge(provider, obj.status, obj.detail);
      showToast(`${provider.toUpperCase()}: ${obj.detail}`);
      // Refresh overall HUD bar
      setTimeout(() => refreshApiHealth(false), 500);
    } catch (_) {}
  } else {
    saveConfiguration(true);
  }
}

// -------------------------------------------------------------------------
// Native Event Hooks (Invoked from Kotlin via evaluateJavascript)
// -------------------------------------------------------------------------
window.onApiHealthUpdated = function(healthJson) {
  try {
    const data = typeof healthJson === 'string' ? JSON.parse(healthJson) : healthJson;
    renderApiHealth(data);
  } catch (err) {
    console.error('onApiHealthUpdated parse error:', err);
  }
};

window.onDirectTranscript = function(userPrompt, replyText) {
  if (userPrompt) {
    addTranscript(userPrompt, 'user');
  }
  if (replyText) {
    addTranscript(replyText, 'assistant');
    updateAgentState('speaking', 'SPEAKING // GEMINI 3.8');
  }
};
window.onWakeWordDetected = function(phrase) {
  console.log('Wake word received from native:', phrase);
  updateAgentState('listening', 'WAKE DETECTED // LISTENING');
  addTranscript(phrase || 'Hey Jarvis', 'user');
  switchTab('home');
};

window.onAgentStateChanged = function(agentState, responseText) {
  updateAgentState(agentState);
  if (responseText) {
    addTranscript(responseText, 'assistant');
  }
};

window.onNativeSessionState = function(active, agentState) {
  state.isSessionActive = !!active;
  state.isMicActive = !!active;
  const welcome = document.getElementById('welcomeView');
  const session = document.getElementById('sessionView');
  const micBtn = document.getElementById('centerMicBtn');

  if (active) {
    if (welcome) welcome.classList.add('view-hidden');
    if (session) session.classList.remove('view-hidden');
    if (micBtn) micBtn.classList.add('active');
    updateAgentState(agentState || 'listening', 'ONLINE // LISTENING');
  } else {
    if (session) session.classList.add('view-hidden');
    if (welcome) welcome.classList.remove('view-hidden');
    if (micBtn) micBtn.classList.remove('active');
    updateAgentState('idle', 'STANDBY // READY');
  }
};

window.onMissingApiKeys = function() {
  switchTab('settings');
  showToast('⚠️ লাইভকিট API কী মিসিং! Settings ট্যাবে সেভ করুন।');
};

window.updateServiceStatus = function(serviceRunning, accessibilityEnabled, batteryIgnored, sessionActive, notifEnabled) {
  state.serviceRunning = serviceRunning;
  state.accessibilityEnabled = accessibilityEnabled;
  state.batteryIgnored = batteryIgnored;
  if (notifEnabled !== undefined) {
    state.notifEnabled = notifEnabled;
  }

  if (sessionActive !== undefined) {
    state.isSessionActive = !!sessionActive;
    const welcome = document.getElementById('welcomeView');
    const session = document.getElementById('sessionView');
    const micBtn = document.getElementById('centerMicBtn');
    if (sessionActive) {
      if (welcome) welcome.classList.add('view-hidden');
      if (session) session.classList.remove('view-hidden');
      if (micBtn) micBtn.classList.add('active');
    } else {
      if (session) session.classList.add('view-hidden');
      if (welcome) welcome.classList.remove('view-hidden');
      if (micBtn) micBtn.classList.remove('active');
    }
  }

  // Header Pill
  const statusLabel = document.getElementById('serviceStatusLabel');
  const statusDot = document.getElementById('statusDot');
  if (statusLabel && statusDot) {
    if (serviceRunning) {
      statusLabel.innerText = 'ONLINE // 24/7';
      statusDot.style.background = '#10b981';
      statusDot.style.boxShadow = '0 0 8px #10b981';
    } else {
      statusLabel.innerText = 'OFFLINE';
      statusDot.style.background = '#ef4444';
      statusDot.style.boxShadow = '0 0 8px #ef4444';
    }
  }

  // Settings Subtitles
  const servSub = document.getElementById('serviceStatusSub');
  if (servSub) servSub.innerText = serviceRunning ? 'Active (Foreground Mic & Wake Word)' : 'Stopped';

  const accSub = document.getElementById('accessibilityStatusSub');
  const accBtn = document.getElementById('btnGrantAccessibility');
  if (accSub && accBtn) {
    if (accessibilityEnabled) {
      accSub.innerText = 'Active (Phone lock, App auto, Survey enabled)';
      accBtn.innerText = 'ACTIVE';
      accBtn.className = 'badge-green';
    } else {
      accSub.innerText = 'Disabled (Tap to grant permission)';
      accBtn.innerText = 'ENABLE';
      accBtn.className = 'badge-yellow';
    }
  }

  const notifSub = document.getElementById('notifStatusSub');
  const notifBtn = document.getElementById('btnGrantNotifAccess');
  if (notifSub && notifBtn) {
    const isNotif = notifEnabled !== undefined ? notifEnabled : state.notifEnabled;
    if (isNotif) {
      notifSub.innerText = 'Active (WhatsApp, Messenger, SMS পড়ে শোনাবে)';
      notifBtn.innerText = 'ACTIVE';
      notifBtn.className = 'badge-green';
    } else {
      notifSub.innerText = 'Disabled (মেসেজ ও নোটিফিকেশন শুনতে সক্রিয় করুন)';
      notifBtn.innerText = 'ENABLE';
      notifBtn.className = 'badge-yellow';
    }
  }

  const batSub = document.getElementById('batteryStatusSub');
  const batBtn = document.getElementById('btnIgnoreBattery');
  if (batSub && batBtn) {
    if (batteryIgnored) {
      batSub.innerText = 'Whitelisted (Unrestricted 24/7 Background Run)';
      batBtn.innerText = 'WHITELISTED';
      batBtn.className = 'badge-green';
    } else {
      batSub.innerText = 'Restricted by Android Battery Saver';
      batBtn.innerText = 'WHITELIST';
  }
};

window.onDirectTranscript = function(userText, assistantText) {
  if (userText) addTranscript(userText, 'user');
  if (assistantText) addTranscript(assistantText, 'assistant');
};

window.onWakeWordDetected = function(phrase) {
  startVoiceSession();
  addTranscript(`🎤 ওয়েক ওয়ার্ড শনাক্ত: "${phrase}"`, 'assistant');
};

window.onNativeSessionState = function(active, newState) {
  state.isSessionActive = active;
  if (active) {
    const welcome = document.getElementById('welcomeView');
    const session = document.getElementById('sessionView');
    if (welcome) welcome.classList.add('view-hidden');
    if (session) session.classList.remove('view-hidden');
    const micBtn = document.getElementById('centerMicBtn');
    if (micBtn) micBtn.classList.add('active');
  }
  const labelMap = {
    'listening': 'ONLINE // LISTENING',
    'thinking': 'ANALYZING // THINKING',
    'speaking': 'SPEAKING // LOUDSPEAKER',
    'idle': 'STANDBY // READY'
  };
  updateAgentState(newState || (active ? 'listening' : 'idle'), labelMap[newState] || (newState ? newState.toUpperCase() : 'STANDBY'));
};

// Periodic status poll
setInterval(() => {
  try {
    const raw = callNative('getServiceStatus');
    if (raw) {
      const s = JSON.parse(raw);
      window.updateServiceStatus(s.serviceRunning, s.accessibilityEnabled, s.batteryIgnored, s.sessionActive, s.notificationListenerEnabled);
    }
  } catch (_) {}
}, 2500);

// Periodic API health poll (every 30 seconds)
setInterval(() => {
  refreshApiHealth(false);
}, 30000);

// Interaction keeps idle timer alive
document.addEventListener('touchstart', () => callNative('resetIdleTimer'), { passive: true });
document.addEventListener('click', () => callNative('resetIdleTimer'), { passive: true });

// -------------------------------------------------------------------------
// Startup
// -------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  initParticles();
  renderOrb();
  renderSpectrum();
  loadConfiguration();
  refreshApiHealth(true);

  // Initial service status check
  try {
    const raw = callNative('getServiceStatus');
    if (raw) {
      const s = JSON.parse(raw);
      window.updateServiceStatus(s.serviceRunning, s.accessibilityEnabled, s.batteryIgnored);
    }
  } catch (_) {}
});

// Explicit global exports for HTML inline onclick handlers
window.switchTab = switchTab;
window.startVoiceSession = startVoiceSession;
window.endVoiceSession = endVoiceSession;
window.toggleVoiceSession = toggleVoiceSession;
window.toggleMicrophone = toggleMicrophone;
window.toggleMuteMic = toggleMuteMic;
window.toggleSpeakerphone = toggleSpeakerphone;
window.shutdownJarvis = shutdownJarvis;
window.executeAction = executeAction;
window.pairWithPcManual = pairWithPcManual;
window.unpairFromPc = unpairFromPc;
window.sendPcAction = sendPcAction;
window.fetchPcScreenNow = fetchPcScreenNow;
window.loadConfiguration = loadConfiguration;
window.saveConfiguration = saveConfiguration;
window.triggerAutoSave = triggerAutoSave;
window.toggleFieldVisibility = toggleFieldVisibility;
window.onServiceToggleChanged = onServiceToggleChanged;
window.requestAccessibilityPermission = requestAccessibilityPermission;
window.requestBatteryOptimization = requestBatteryOptimization;
window.requestNotificationAccess = requestNotificationAccess;
window.refreshApiHealth = refreshApiHealth;
window.focusApiKey = focusApiKey;
window.testKeyLive = testKeyLive;
window.onApiKeyInputChanged = onApiKeyInputChanged;
window.changeOrbTheme = changeOrbTheme;
window.toggleParticles = toggleParticles;
window.onProviderSelectChanged = onProviderSelectChanged;

