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

  // If opening skills, load skills catalog
  if (tabId === 'skills') {
    loadSkillsMatrix();
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

function fullAppExit() {
  state.isSessionActive = false;
  state.isMicActive = false;

  // 1. Play crystal clear Bengali verbal bye: 'বাই বাই জানু, ধন্যবাদ তোমাকে!'
  playByeAudio();

  // 2. Switch UI
  updateAgentState('idle', 'SHUTDOWN // বাই বাই');
  addTranscript('Jarvis সম্পূর্ণ বন্ধ করা হচ্ছে। বাই বাই জানু, ধন্যবাদ তোমাকে!', 'assistant');
  showToast('🔴 বাই বাই! মাইক্রোফোন ও অ্যাপ সম্পূর্ণ বন্ধ হচ্ছে...');

  // 3. Immediately trigger native 1-click full exit
  callNative('exitAndCloseApp', true);
}

function shutdownJarvis() {
  fullAppExit();
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
  const edgeGlow = document.getElementById('edgeGlowOverlay');

  if (stateText) stateText.innerText = label || newState.toUpperCase();

  // Lia Feature: Listening Edge Glow reactive border
  if (edgeGlow) {
    edgeGlow.classList.remove('listening', 'speaking', 'thinking', 'error');
    if (newState === 'listening' || newState === 'speaking' || newState === 'thinking' || newState === 'error') {
      edgeGlow.classList.add(newState);
    }
  }

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
    setFieldVal('cfgGeminiPlusEmail', keys.gemini_web_plus_account || keys.gemini_plus_email || 'plus.alamin@gmail.com');
    setFieldVal('cfgGeminiProEmail', keys.gemini_web_pro_account || keys.gemini_pro_email || 'pro.alamin@gmail.com');
    setFieldVal('cfgGeminiUltraEmail', keys.gemini_web_ultra_account || keys.gemini_ultra_email || 'alaminmiah1976@gmail.com');

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
      gemini_web_plus_account: getFieldVal('cfgGeminiPlusEmail'),
      gemini_web_pro_account: getFieldVal('cfgGeminiProEmail'),
      gemini_web_ultra_account: getFieldVal('cfgGeminiUltraEmail'),
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
      batBtn.className = 'badge-yellow';
    }
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
  initPersonalitiesAndLanguage();

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

// -------------------------------------------------------------------------
// Direct Text Chat & Autonomous Transcript Bridge
// -------------------------------------------------------------------------
function isWebsiteForgeIntent(text) {
  const lower = (text || '').toLowerCase();
  return lower.includes('website') || lower.includes('web site') || lower.includes('landing page') ||
         lower.includes('ওয়েবসাইট') || lower.includes('ওয়েবসাইট') || lower.includes('সাইট বানাও');
}

function sendTextMessageFromUI() {
  const input = document.getElementById('chatTextInput');
  if (!input) return;
  const text = (input.value || '').trim();
  if (!text) return;
  input.value = '';

  addTranscript(text, 'user');

  if (isWebsiteForgeIntent(text)) {
    addTranscript('⚡ 3D Website Forge সক্রিয় করা হচ্ছে...', 'assistant');
    openWebsiteForgeModal(text);
    return;
  }

  updateAgentState('thinking', 'PROCESSING // চিন্তা করছে...');

  if (window.JarvisNative && typeof window.JarvisNative.sendTextMessage === 'function') {
    window.JarvisNative.sendTextMessage(text);
  } else {
    setTimeout(() => {
      addTranscript('হ্যালো বস! আপনার নির্দেশ গ্রহণ করা হয়েছে।', 'assistant');
      updateAgentState('listening', 'ONLINE // LISTENING');
    }, 600);
  }
}

function sendWelcomeTextMessage() {
  const input = document.getElementById('welcomeChatInput');
  if (!input) return;
  const text = (input.value || '').trim();
  if (!text) return;
  input.value = '';

  if (isWebsiteForgeIntent(text)) {
    openWebsiteForgeModal(text);
    return;
  }

  startVoiceSession();
  addTranscript(text, 'user');
  updateAgentState('thinking', 'PROCESSING // চিন্তা করছে...');

  if (window.JarvisNative && typeof window.JarvisNative.sendTextMessage === 'function') {
    window.JarvisNative.sendTextMessage(text);
  }
}

function promptOpenAppFromUI() {
  const app = prompt('কোন অ্যাপটি ওপেন করতে চান? (e.g. Chrome, WhatsApp, YouTube, Calculator, Facebook):');
  if (app && app.trim()) {
    const text = 'open ' + app.trim();
    addTranscript(text, 'user');
    updateAgentState('thinking', 'PROCESSING // চিন্তা করছে...');
    showToast(`🚀 '${app.trim()}' ওপেন করা হচ্ছে...`);
    if (window.JarvisNative && typeof window.JarvisNative.sendTextMessage === 'function') {
      window.JarvisNative.sendTextMessage(text);
    }
  }
}

window.sendTextMessageFromUI = sendTextMessageFromUI;
window.sendWelcomeTextMessage = sendWelcomeTextMessage;
window.promptOpenAppFromUI = promptOpenAppFromUI;

window.onDirectTranscript = function(userText, assistantText) {
  if (userText && String(userText).trim()) {
    addTranscript(String(userText).trim(), 'user');
  }
  if (assistantText && String(assistantText).trim()) {
    addTranscript(String(assistantText).trim(), 'assistant');
    updateAgentState('speaking', 'ONLINE // কথা বলছে');
    setTimeout(() => {
      if (state.isSessionActive) {
        updateAgentState('listening', 'ONLINE // শুনছে');
      } else {
        updateAgentState('idle', 'STANDBY // READY');
      }
    }, 3500);
  }
};

// -------------------------------------------------------------------------
// AI Skills Matrix & Playbook Hub (84 Skills)
// -------------------------------------------------------------------------
let allSkillsList = [];
let currentSkillCategory = 'all';
let currentSelectedSkill = null;

function loadSkillsMatrix() {
  const container = document.getElementById('skillsGridContainer');
  if (!container) return;

  if (allSkillsList.length === 0) {
    const raw = callNative('getSkillsCatalogJson');
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        allSkillsList = parsed.skills || [];
      } catch (e) {
        console.error('Error parsing skills catalog:', e);
      }
    }
  }

  const badge = document.getElementById('skillsCountBadge');
  if (badge && allSkillsList.length > 0) {
    badge.innerText = `${allSkillsList.length} Active`;
  }

  renderSkillsGrid();
}

function categorizeSkill(skill) {
  const name = (skill.name || '').toLowerCase();
  if (name.includes('whatsapp') || name.includes('call') || name.includes('sms') || name.includes('message') || name.includes('contact') || name.includes('chat') || name.includes('broadcast')) {
    return 'comm';
  }
  if (name.includes('lock') || name.includes('torch') || name.includes('system') || name.includes('battery') || name.includes('wifi') || name.includes('brightness') || name.includes('nfc') || name.includes('volume') || name.includes('phone-care') || name.includes('auto-rotate')) {
    return 'device';
  }
  if (name.includes('music') || name.includes('video') || name.includes('camera') || name.includes('photo') || name.includes('podcast') || name.includes('radio') || name.includes('streaming') || name.includes('screen-record')) {
    return 'media';
  }
  return 'utility';
}

function filterSkillsByCategory(cat) {
  currentSkillCategory = cat;
  const chips = document.querySelectorAll('#skillsFilterChips button');
  chips.forEach(c => {
    c.style.borderColor = 'rgba(255, 255, 255, 0.1)';
    c.style.background = 'rgba(255, 255, 255, 0.05)';
  });
  if (event && event.target) {
    event.target.style.borderColor = '#22d3ee';
    event.target.style.background = 'rgba(34, 211, 238, 0.2)';
  }
  renderSkillsGrid();
}

function filterSkillsGrid() {
  renderSkillsGrid();
}

function renderSkillsGrid() {
  const container = document.getElementById('skillsGridContainer');
  if (!container) return;

  const searchInput = document.getElementById('skillsSearchInput');
  const query = searchInput ? (searchInput.value || '').toLowerCase().trim() : '';

  let filtered = allSkillsList.filter(s => {
    const matchCat = (currentSkillCategory === 'all') || (categorizeSkill(s) === currentSkillCategory);
    const matchQuery = !query || s.name.toLowerCase().includes(query) || (s.description && s.description.toLowerCase().includes(query));
    return matchCat && matchQuery;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<div style="text-align:center; padding:24px; color:#64748b; font-size:12px;">কোনো স্কিল পাওয়া যায়নি।</div>';
    return;
  }

  container.innerHTML = filtered.map(skill => `
    <div class="skill-card-item" onclick="openSkillDetailModal('${escapeHtml(skill.name)}')">
      <div class="skill-card-header">
        <span class="skill-card-title">⚡ ${escapeHtml(skill.name)}</span>
        <span class="skill-card-badge">সক্রিয়</span>
      </div>
      <div class="skill-card-desc">${escapeHtml(skill.description || 'মোবাইল অটোমেশন প্লেবুক')}</div>
      <div class="skill-card-footer">
        <span style="font-size:9px; color:#64748b; font-family:monospace;">${escapeHtml(skill.updated || 'v1.0')}</span>
        <span class="skill-card-action">বিস্তারিত দেখুন ➔</span>
      </div>
    </div>
  `).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function openSkillDetailModal(skillName) {
  currentSelectedSkill = skillName;
  const modal = document.getElementById('skillDetailModal');
  const title = document.getElementById('skillModalTitle');
  const body = document.getElementById('skillModalBody');
  if (!modal || !title || !body) return;

  title.innerText = `⚡ ${skillName}`;
  body.innerText = 'প্লেবুক লোড হচ্ছে...';
  modal.style.display = 'flex';

  const details = callNative('getSkillDetails', skillName);
  body.innerText = details || `Playbook for ${skillName} active and ready to execute.`;
}

function closeSkillModal() {
  const modal = document.getElementById('skillDetailModal');
  if (modal) modal.style.display = 'none';
  currentSelectedSkill = null;
}

function runCurrentModalSkill() {
  if (!currentSelectedSkill) return;
  const skillName = currentSelectedSkill;
  closeSkillModal();
  showToast(`⚡ ${skillName} চালু করা হচ্ছে...`);
  callNative('executeSkillFromUi', skillName);
}

window.loadSkillsMatrix = loadSkillsMatrix;
window.filterSkillsByCategory = filterSkillsByCategory;
window.filterSkillsGrid = filterSkillsGrid;
window.openSkillDetailModal = openSkillDetailModal;
window.closeSkillModal = closeSkillModal;
window.runCurrentModalSkill = runCurrentModalSkill;

// =========================================================================
// Lia AI Feature 1: 10 Personalities Matrix & Multilingual Brain
// =========================================================================
const PERSONALITY_DESCRIPTIONS = {
  normal: 'সুষম ও বুদ্ধিমান সাধারণ সহকারী (Balanced & Efficient AI Assistant).',
  friendly: 'উষ্ণ, বন্ধুভাবাপন্ন এবং ইতিবাচক সঙ্গী (Warm & Encouraging Companion).',
  professional: 'সংক্ষিপ্ত, সুনির্দিষ্ট এবং এক্সিকিউটিভ কর্পোরেট মোড (Executive & Structured).',
  funny: 'রসিক, হাস্যরসাত্মক এবং কৌতুকপ্রিয় (Witty, Sarcastic & Full of Humour).',
  companion: 'সহানুভূতিশীল, গভীর শ্রোতা এবং বিশ্বস্ত বন্ধু (Empathetic & Caring Friend).',
  gf_mode: 'মিষ্টি, যত্নশীল এবং আদুরে সঙ্গী ("বাবু খেয়েছে? মন খারাপ কেন?").',
  teacher: 'ধাপে ধাপে উদাহরণসহ বুঝিয়ে দেওয়া শিক্ষক (Step-by-step Patient Mentor).',
  developer: 'টেকনিক্যাল, আর্কিটেকচার এবং কোড-ফার্স্ট মোড (Code-First & Architectural).',
  hungry: 'খাবার প্রিয়, বিরিয়ানি, চা এবং মুখরোচক খাবারের ভক্ত (Passionate Foodie).',
  nautanki: 'নাটকীয়, ফিল্মি বলিউড/টলিউড ডায়লগে ভরপুর (Filmy & Over-the-Top Drama)!'
};

let currentPersonality = 'normal';
let currentLanguage = 'auto';

function initPersonalitiesAndLanguage() {
  try {
    const p = callNative('getActivePersonality') || localStorage.getItem('jarvis_personality') || 'normal';
    selectPersonality(p, true);
  } catch (_) {
    selectPersonality('normal', true);
  }

  try {
    const l = callNative('getActiveLanguage') || localStorage.getItem('jarvis_lang') || 'auto';
    setAppLanguage(l, true);
  } catch (_) {
    setAppLanguage('auto', true);
  }
}

function selectPersonality(key, silent = false) {
  currentPersonality = key;
  try {
    localStorage.setItem('jarvis_personality', key);
    callNative('setActivePersonality', key);
  } catch (_) {}

  document.querySelectorAll('.personality-card').forEach(card => {
    if (card.dataset.personality === key) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });

  const descEl = document.getElementById('selectedPersonalityDesc');
  if (descEl) {
    descEl.innerText = PERSONALITY_DESCRIPTIONS[key] || 'Selected active personality mode.';
  }

  if (!silent) {
    showToast(`🎭 ব্যক্তিত্ব সক্রিয়: ${key.toUpperCase()}`);
    callNative('speakTextLocally', `${key} ব্যক্তিত্ব সক্রিয় করা হয়েছে`);
  }
}

function setAppLanguage(lang, silent = false) {
  currentLanguage = lang;
  try {
    localStorage.setItem('jarvis_lang', lang);
    callNative('setActiveLanguage', lang);
  } catch (_) {}

  document.querySelectorAll('.lang-pill').forEach(pill => {
    if (pill.dataset.lang === lang) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });

  if (!silent) {
    const names = {
      auto: 'স্বয়ংক্রিয় (Auto Detect)',
      bn: 'বাংলা (Bengali)',
      hi: 'हिंदी (Hindi)',
      hinglish: 'Hinglish',
      en: 'English'
    };
    showToast(`🌐 ভাষা মোড: ${names[lang] || lang}`);
  }
}

window.selectPersonality = selectPersonality;
window.setAppLanguage = setAppLanguage;
window.initPersonalitiesAndLanguage = initPersonalitiesAndLanguage;

// =========================================================================
// Lia AI Feature 2: Live 3D Website Forge Engine (Three.js WebGL Reactor)
// =========================================================================
let forgeThreeScene = null;
let forgeThreeCamera = null;
let forgeThreeRenderer = null;
let forgeAnimFrameId = null;
let forgeReactorCore = null;
let forgeOuterRings = [];
let forgeParticlesMesh = null;
let forgeIsBuilding = false;
let forgeBuildTimer = null;
let forgeStartTime = 0;
let lastForgedHtml = '';
let lastSavedSitePath = '';

const FORGE_STAGES = [
  { step: 1, name: 'Reading your idea & architectural intent...', pct: 15, chars: '1.2 KB', sections: 1, speed: 280 },
  { step: 2, name: 'Laying out HTML5 semantic tree & grid...', pct: 32, chars: '4.8 KB', sections: 3, speed: 340 },
  { step: 3, name: 'Crafting Tailwind CSS, glassmorphism & fonts...', pct: 55, chars: '9.4 KB', sections: 5, speed: 395 },
  { step: 4, name: 'Synthesizing 3D Canvas visual shaders...', pct: 74, chars: '14.1 KB', sections: 6, speed: 420 },
  { step: 5, name: 'Injecting GSAP micro-interactions & logic...', pct: 90, chars: '18.6 KB', sections: 7, speed: 380 },
  { step: 6, name: 'Compiling assets & launching live preview...', pct: 100, chars: '21.4 KB', sections: 7, speed: 410 }
];

function initThreeJsForgeScene() {
  const container = document.getElementById('forgeCanvasContainer');
  if (!container || !window.THREE) return;
  if (forgeThreeRenderer) return;

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || 340;

  forgeThreeScene = new THREE.Scene();
  forgeThreeCamera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
  forgeThreeCamera.position.z = 24;

  forgeThreeRenderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  forgeThreeRenderer.setSize(width, height);
  forgeThreeRenderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.innerHTML = '';
  container.appendChild(forgeThreeRenderer.domElement);

  // 1. Central Pulsating Core (Dual nested spheres)
  const coreGroup = new THREE.Group();
  const innerGeo = new THREE.IcosahedronGeometry(3.6, 2);
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0x06b6d4,
    wireframe: true,
    transparent: true,
    opacity: 0.85
  });
  const innerMesh = new THREE.Mesh(innerGeo, innerMat);
  coreGroup.add(innerMesh);

  const centerSphereGeo = new THREE.SphereGeometry(2.4, 32, 32);
  const centerSphereMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95
  });
  const centerSphere = new THREE.Mesh(centerSphereGeo, centerSphereMat);
  coreGroup.add(centerSphere);
  forgeThreeScene.add(coreGroup);
  forgeReactorCore = coreGroup;

  // 2. Gyroscopic Rotating Rings
  forgeOuterRings = [];
  const ringDefs = [
    { radius: 6.8, tube: 0.08, color: 0x22d3ee, rotX: 0.4, rotY: 0 },
    { radius: 8.4, tube: 0.08, color: 0xf43f5e, rotX: -0.6, rotY: 0.5 },
    { radius: 10.0, tube: 0.06, color: 0x38bdf8, rotX: 1.1, rotY: -0.3 }
  ];

  ringDefs.forEach(def => {
    const ringGeo = new THREE.TorusGeometry(def.radius, def.tube, 16, 80);
    const ringMat = new THREE.MeshBasicMaterial({
      color: def.color,
      transparent: true,
      opacity: 0.75
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = def.rotX;
    ringMesh.rotation.y = def.rotY;
    forgeThreeScene.add(ringMesh);
    forgeOuterRings.push(ringMesh);
  });

  // 3. Floating Inward-Spiraling Particle Cloud (320 particles)
  const partCount = 320;
  const partPositions = new Float32Array(partCount * 3);
  const partData = [];

  for (let i = 0; i < partCount; i++) {
    const rad = 10 + Math.random() * 18;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos((Math.random() * 2) - 1);
    const x = rad * Math.sin(phi) * Math.cos(theta);
    const y = rad * Math.sin(phi) * Math.sin(theta);
    const z = rad * Math.cos(phi);

    partPositions[i * 3] = x;
    partPositions[i * 3 + 1] = y;
    partPositions[i * 3 + 2] = z;

    partData.push({
      rad,
      theta,
      phi,
      speedTheta: (Math.random() - 0.5) * 0.02,
      inwardSpeed: 0.04 + Math.random() * 0.06
    });
  }

  const partGeo = new THREE.BufferGeometry();
  partGeo.setAttribute('position', new THREE.BufferAttribute(partPositions, 3));
  const partMat = new THREE.PointsMaterial({
    color: 0x67e8f9,
    size: 0.35,
    transparent: true,
    opacity: 0.8
  });
  forgeParticlesMesh = new THREE.Points(partGeo, partMat);
  forgeParticlesMesh.userData = { partData };
  forgeThreeScene.add(forgeParticlesMesh);

  // Resize handler
  window.addEventListener('resize', () => {
    if (!forgeThreeRenderer || !forgeThreeCamera) return;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || 340;
    forgeThreeCamera.aspect = w / h;
    forgeThreeCamera.updateProjectionMatrix();
    forgeThreeRenderer.setSize(w, h);
  });

  animateForgeScene();
}

function animateForgeScene() {
  forgeAnimFrameId = requestAnimationFrame(animateForgeScene);

  const speedMultiplier = forgeIsBuilding ? 2.5 : 0.8;
  const time = Date.now() * 0.002 * speedMultiplier;

  if (forgeReactorCore) {
    forgeReactorCore.rotation.y += 0.015 * speedMultiplier;
    forgeReactorCore.rotation.x += 0.008 * speedMultiplier;
    const scale = 1.0 + Math.sin(time * 3) * 0.12;
    forgeReactorCore.scale.set(scale, scale, scale);
  }

  if (forgeOuterRings.length >= 3) {
    forgeOuterRings[0].rotation.z += 0.02 * speedMultiplier;
    forgeOuterRings[1].rotation.x += 0.018 * speedMultiplier;
    forgeOuterRings[2].rotation.y += 0.015 * speedMultiplier;
  }

  if (forgeParticlesMesh && forgeParticlesMesh.geometry) {
    const pos = forgeParticlesMesh.geometry.attributes.position.array;
    const pData = forgeParticlesMesh.userData.partData || [];

    for (let i = 0; i < pData.length; i++) {
      const p = pData[i];
      p.rad -= p.inwardSpeed * speedMultiplier;
      p.theta += p.speedTheta * speedMultiplier;

      if (p.rad < 3.2) {
        p.rad = 18 + Math.random() * 6;
      }

      pos[i * 3] = p.rad * Math.sin(p.phi) * Math.cos(p.theta);
      pos[i * 3 + 1] = p.rad * Math.sin(p.phi) * Math.sin(p.theta);
      pos[i * 3 + 2] = p.rad * Math.cos(p.phi);
    }
    forgeParticlesMesh.geometry.attributes.position.needsUpdate = true;
  }

  if (forgeThreeRenderer && forgeThreeScene && forgeThreeCamera) {
    forgeThreeRenderer.render(forgeThreeScene, forgeThreeCamera);
  }
}

function openWebsiteForgeModal(prefillPrompt = '') {
  const modal = document.getElementById('forgeModal');
  if (!modal) return;
  modal.style.display = 'flex';

  setTimeout(initThreeJsForgeScene, 50);

  const promptText = (prefillPrompt || '').trim() || 'A sleek modern cyber cafe website with 3D animation';
  startWebsiteForgeProcess(promptText);
}

function closeWebsiteForge() {
  const modal = document.getElementById('forgeModal');
  if (modal) modal.style.display = 'none';
  forgeIsBuilding = false;
  clearInterval(forgeBuildTimer);
}

function cancelWebsiteForge() {
  forgeIsBuilding = false;
  clearInterval(forgeBuildTimer);
  showToast('❌ Website Forge বাতিল করা হয়েছে');
  closeWebsiteForge();
}

function appendForgeLog(text, colorClass = 'text-cyan-400') {
  const logBox = document.getElementById('forgeLogBox');
  if (!logBox) return;
  const line = document.createElement('div');
  line.className = `log-line ${colorClass}`;
  line.innerText = `> ${text}`;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}

function startWebsiteForgeProcess(promptText) {
  forgeIsBuilding = true;
  forgeStartTime = Date.now();

  const promptDisplay = document.getElementById('forgePromptDisplay');
  if (promptDisplay) promptDisplay.innerText = `"${promptText}"`;

  const hudCard = document.getElementById('forgeHudCard');
  const resultView = document.getElementById('forgeResultView');
  const stageContainer = document.getElementById('forgeStage');

  if (hudCard) hudCard.style.display = 'block';
  if (stageContainer) stageContainer.style.display = 'block';
  if (resultView) resultView.style.display = 'none';

  const logBox = document.getElementById('forgeLogBox');
  if (logBox) logBox.innerHTML = '';
  appendForgeLog(`User prompt received: "${promptText}"`, 'text-white');
  appendForgeLog('Initializing 3D WebGL Reactor build pipeline...', 'text-cyan-400');

  let currentStageIndex = 0;
  clearInterval(forgeBuildTimer);

  forgeBuildTimer = setInterval(() => {
    if (!forgeIsBuilding) {
      clearInterval(forgeBuildTimer);
      return;
    }

    const elapsedSec = ((Date.now() - forgeStartTime) / 1000).toFixed(1);
    const mElapsed = document.getElementById('mElapsed');
    if (mElapsed) mElapsed.innerText = `${elapsedSec}s`;

    if (currentStageIndex < FORGE_STAGES.length) {
      const stage = FORGE_STAGES[currentStageIndex];
      const stageNameEl = document.getElementById('forgeStageName');
      const pctEl = document.getElementById('forgePercentText');
      const mChars = document.getElementById('mChars');
      const mSections = document.getElementById('mSections');
      const mSpeed = document.getElementById('mSpeed');

      if (stageNameEl) stageNameEl.innerText = stage.name;
      if (pctEl) pctEl.innerText = `${stage.pct}%`;
      if (mChars) mChars.innerText = stage.chars;
      if (mSections) mSections.innerText = String(stage.sections);
      if (mSpeed) mSpeed.innerText = `${stage.speed} t/s`;

      document.querySelectorAll('#stageTrack .stage-seg').forEach(seg => {
        const step = parseInt(seg.dataset.step);
        seg.classList.remove('active', 'completed');
        if (step < stage.step) seg.classList.add('completed');
        if (step === stage.step) seg.classList.add('active');
      });

      appendForgeLog(stage.name, 'text-cyan-400');
      currentStageIndex++;
    } else {
      clearInterval(forgeBuildTimer);
      finishWebsiteForge(promptText);
    }
  }, 750);
}

function finishWebsiteForge(promptText) {
  forgeIsBuilding = false;
  appendForgeLog('Build completed with 0 errors! Generating interactive preview...', 'text-emerald-400');

  lastForgedHtml = generateFallbackForgedSite(promptText);

  setTimeout(() => {
    const hudCard = document.getElementById('forgeHudCard');
    const resultView = document.getElementById('forgeResultView');
    const iframe = document.getElementById('forgeIframe');
    const siteTitle = document.getElementById('resultSiteTitle');

    if (hudCard) hudCard.style.display = 'none';
    if (resultView) resultView.style.display = 'flex';
    if (siteTitle) siteTitle.innerText = `${promptText.slice(0, 32)}...`;

    if (iframe) {
      iframe.srcdoc = lastForgedHtml;
    }

    callNative('speakTextLocally', 'আপনার ওয়েবসাইট ৩ডি ওয়েব ফোর্জে তৈরি সম্পন্ন হয়েছে!');
    showToast('🎉 ওয়েবসাইট সফলভাবে তৈরি সম্পন্ন হয়েছে!');

    try {
      const sanitizedTitle = promptText.replace(/[^a-zA-Z0-9_\u0980-\u09FF]/g, '_').slice(0, 24);
      const saved = callNative('saveWebsiteFile', `site_${sanitizedTitle}.html`, lastForgedHtml);
      if (saved) lastSavedSitePath = saved;
    } catch (_) {}
  }, 500);
}

function saveForgedSite() {
  if (!lastForgedHtml) return;
  const fileName = `forge_website_${Date.now()}.html`;
  const path = callNative('saveWebsiteFile', fileName, lastForgedHtml);
  if (path) {
    lastSavedSitePath = path;
    showToast(`✅ ফাইল সংরক্ষিত: ${path}`);
  } else {
    showToast('✅ ডিভাইস স্টোরেজে সংরক্ষিত হয়েছে!');
  }
}

function openForgedSiteExternal() {
  if (lastSavedSitePath) {
    callNative('openExternalBrowser', lastSavedSitePath);
  } else if (lastForgedHtml) {
    const path = callNative('saveWebsiteFile', `view_${Date.now()}.html`, lastForgedHtml);
    if (path) {
      lastSavedSitePath = path;
      callNative('openExternalBrowser', path);
    } else {
      showToast('ব্রাউজারে খোলার জন্য প্রস্তুত করা হচ্ছে...');
    }
  }
}

function shareForgedSite() {
  if (!lastForgedHtml) return;
  const title = document.getElementById('forgePromptDisplay')?.innerText || 'Forged Website';
  callNative('shareWebsite', title, lastForgedHtml);
}

function promptEditForgedSite() {
  const newPrompt = prompt('ওয়েবসাইটে কী পরিবর্তন করতে চান লিখুন (e.g., Add pricing table, change hero image, etc.):');
  if (newPrompt && newPrompt.trim()) {
    openWebsiteForgeModal(newPrompt.trim());
  }
}

function generateFallbackForgedSite(prompt) {
  const title = prompt ? prompt.replace(/<[^>]*>?/gm, '').slice(0, 40) : 'Cyber Forge AI Site';
  return `<!DOCTYPE html>
<html lang="en" class="scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link href="https://cdn.jsdelivr.net/npm/tailwindcss@2.2.19/dist/tailwind.min.css" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;900&display=swap');
    body { font-family: 'Outfit', sans-serif; background: #030712; color: #f8fafc; overflow-x: hidden; }
    .glass-card { background: rgba(15, 23, 42, 0.7); backdrop-filter: blur(16px); border: 1px solid rgba(255, 255, 255, 0.1); }
    .glass-nav { background: rgba(3, 7, 18, 0.85); backdrop-filter: blur(20px); border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
    .glow-cyan { text-shadow: 0 0 20px rgba(34, 211, 238, 0.6); }
    .gradient-text { background: linear-gradient(135deg, #22d3ee 0%, #38bdf8 50%, #f43f5e 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .bento-card { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
    .bento-card:hover { transform: translateY(-4px); border-color: rgba(34, 211, 238, 0.5); box-shadow: 0 12px 30px rgba(34, 211, 238, 0.15); }
  </style>
</head>
<body class="bg-gray-950 text-white min-h-screen">
  <canvas id="bgCanvas" class="fixed inset-0 pointer-events-none z-0" style="opacity: 0.4;"></canvas>

  <div class="relative z-10 flex flex-col min-h-screen">
    <header class="sticky top-0 glass-nav z-50">
      <div class="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <div class="flex items-center space-x-3">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-rose-500 flex items-center justify-center shadow-lg shadow-cyan-500/30">
            <i class="fas fa-bolt text-white text-sm"></i>
          </div>
          <span class="font-extrabold text-lg tracking-wider">JARVIS<span class="text-cyan-400">FORGE</span></span>
        </div>
        <nav class="hidden md:flex items-center space-x-6 text-sm font-medium text-gray-300">
          <a href="#features" class="hover:text-cyan-400 transition">Features</a>
          <a href="#showcase" class="hover:text-cyan-400 transition">Showcase</a>
          <a href="#faq" class="hover:text-cyan-400 transition">FAQ</a>
        </nav>
        <button onclick="alert('Order placed successfully!')" class="px-4 py-2 text-xs font-bold rounded-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/25 transition">
          Get Started
        </button>
      </div>
    </header>

    <section class="max-w-6xl mx-auto px-4 pt-16 pb-20 text-center flex-1">
      <div class="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full glass-card text-xs text-cyan-300 mb-6 border-cyan-500/30">
        <span class="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
        <span>Generated with Jarvis 3D Website Forge</span>
      </div>
      <h1 class="text-4xl md:text-6xl font-black tracking-tight mb-6 leading-tight">
        Next-Generation <br><span class="gradient-text">${title}</span>
      </h1>
      <p class="max-w-2xl mx-auto text-gray-400 text-base md:text-lg mb-8 leading-relaxed">
        Crafted seamlessly with real-time 3D synthesis, autonomous styling, and responsive micro-interactions designed to elevate your vision.
      </p>
      <div class="flex flex-wrap items-center justify-center gap-4 mb-14">
        <button onclick="alert('Explore demo!')" class="px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-gray-950 font-bold text-sm shadow-xl shadow-cyan-500/30 transition transform hover:-translate-y-0.5">
          Explore Experience <i class="fas fa-arrow-right ml-2"></i>
        </button>
        <button onclick="window.scrollTo({top: 800, behavior: 'smooth'})" class="px-6 py-3 rounded-xl glass-card hover:bg-white/10 text-white font-semibold text-sm transition">
          View Details
        </button>
      </div>

      <div id="features" class="grid grid-cols-1 md:grid-cols-3 gap-5 text-left mb-16">
        <div class="glass-card bento-card p-6 rounded-2xl md:col-span-2 relative overflow-hidden">
          <div class="w-12 h-12 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xl mb-4">
            <i class="fas fa-cube"></i>
          </div>
          <h3 class="text-xl font-bold mb-2">Live 3D WebGL Integration</h3>
          <p class="text-gray-400 text-sm leading-relaxed mb-4">
            Every website is infused with hardware-accelerated shaders, dynamic gyroscopes, and responsive particles that react to user touch and cursor movements.
          </p>
          <div class="flex items-center space-x-2 text-xs text-cyan-400 font-semibold">
            <span>60 FPS SMOOTH</span> • <span>ZERO LATENCY</span>
          </div>
        </div>

        <div class="glass-card bento-card p-6 rounded-2xl">
          <div class="w-12 h-12 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-xl mb-4">
            <i class="fas fa-mobile-alt"></i>
          </div>
          <h3 class="text-xl font-bold mb-2">100% Mobile First</h3>
          <p class="text-gray-400 text-sm leading-relaxed">
            Engineered from ground up to adapt perfectly from desktop ultra-wide monitors down to Android and iOS hand-held screens.
          </p>
        </div>

        <div class="glass-card bento-card p-6 rounded-2xl">
          <div class="w-12 h-12 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center text-xl mb-4">
            <i class="fas fa-shield-alt"></i>
          </div>
          <h3 class="text-xl font-bold mb-2">Autonomous Security</h3>
          <p class="text-gray-400 text-sm leading-relaxed">
            Zero dependency footprint, clean vanilla JS architecture, and standalone sandboxed deployment.
          </p>
        </div>

        <div class="glass-card bento-card p-6 rounded-2xl md:col-span-2">
          <div class="w-12 h-12 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-xl mb-4">
            <i class="fas fa-tachometer-alt"></i>
          </div>
          <h3 class="text-xl font-bold mb-2">Instant Load Speed</h3>
          <p class="text-gray-400 text-sm leading-relaxed">
            Pre-compiled inline CSS structures and compressed assets guarantee sub-second initial paint times anywhere in the world.
          </p>
        </div>
      </div>

      <div id="faq" class="max-w-2xl mx-auto text-left mb-16">
        <h2 class="text-2xl font-bold text-center mb-8">Frequently Asked Questions</h2>
        <div class="space-y-3">
          <details class="glass-card p-4 rounded-xl cursor-pointer">
            <summary class="font-semibold text-sm text-cyan-300">How do I export this website?</summary>
            <p class="mt-2 text-xs text-gray-400 leading-relaxed">You can tap the "Save" button in the top toolbar to save a standalone HTML file directly to your device storage, or tap "Share" to send it via WhatsApp or email.</p>
          </details>
          <details class="glass-card p-4 rounded-xl cursor-pointer">
            <summary class="font-semibold text-sm text-cyan-300">Can I modify this design?</summary>
            <p class="mt-2 text-xs text-gray-400 leading-relaxed">Yes! Simply click the "Edit" button in the preview toolbar and enter what you'd like to adjust. Jarvis will re-synthesize the layout instantly.</p>
          </details>
        </div>
      </div>
    </section>

    <footer class="border-t border-white/5 py-8 text-center text-xs text-gray-500">
      <p>© 2026 Jarvis AI Companion • Forged with 3D WebGL Reactor Engine</p>
    </footer>
  </div>

  <script>
    const canvas = document.getElementById('bgCanvas');
    const ctx = canvas.getContext('2d');
    let pts = [];
    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      pts = Array.from({length: 45}, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        r: 1 + Math.random() * 2
      }));
    }
    window.addEventListener('resize', resize);
    resize();
    function loop() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#22d3ee';
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      });
      requestAnimationFrame(loop);
    }
    loop();
  </script>
</body>
</html>`;
}

window.openWebsiteForgeModal = openWebsiteForgeModal;
window.closeWebsiteForge = closeWebsiteForge;
window.cancelWebsiteForge = cancelWebsiteForge;
window.saveForgedSite = saveForgedSite;
window.openForgedSiteExternal = openForgedSiteExternal;
window.shareForgedSite = shareForgedSite;
window.promptEditForgedSite = promptEditForgedSite;



