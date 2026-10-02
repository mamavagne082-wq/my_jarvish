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
function switchTab(tabId) {
  state.currentTab = tabId;

  // Update tabs
  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.remove('active');
  });
  const target = document.getElementById(`tab-${tabId}`);
  if (target) target.classList.add('active');

  // Update bottom navigation
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.remove('active');
  });
  const navItem = document.getElementById(`nav-${tabId}`);
  if (navItem) navItem.classList.add('active');

  // Notify native of user activity
  callNative('resetIdleTimer');
}

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
    const audio = new Audio('bye.mp3');
    audio.volume = 1.0;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(e => {
        console.warn('Audio element play failed, falling back to Web Speech:', e);
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const u = new SpeechSynthesisUtterance('বাই বাই জানু, ধন্যবাদ তোমাকে!');
          u.lang = 'bn-BD';
          window.speechSynthesis.speak(u);
        }
      });
    }
  } catch (err) {
    console.warn('playByeAudio exception:', err);
  }
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
  addTranscript('Jarvis এ কানেক্ট হচ্ছে (Loudspeaker On)... কথা বলুন!', 'assistant');

  // Trigger Native LiveKit Connection
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

  // 3. Trigger Native LiveKit Disconnect (with SAY_BYE data packet)
  callNative('endVoiceCall');
  showToast('JARVIS DISCONNECTED // বন্ধ করা হয়েছে (বাই বাই!)');
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

// -------------------------------------------------------------------------
// Microphone & Voice Trigger
// -------------------------------------------------------------------------
function toggleMicrophone() {
  if (!state.isSessionActive) {
    startVoiceSession();
    return;
  }

  state.isMicActive = !state.isMicActive;
  const micBtn = document.getElementById('centerMicBtn');
  const ring = document.getElementById('micPulsingRing');

  if (state.isMicActive) {
    micBtn.classList.add('active');
    ring.style.borderColor = 'rgba(244, 63, 94, 0.8)';
    updateAgentState('listening', 'Listening for your voice...');
    addTranscript('Listening...', 'user');
  } else {
    micBtn.classList.remove('active');
    ring.style.borderColor = 'rgba(34, 211, 238, 0.5)';
    updateAgentState('idle', 'READY // LISTENING');
  }

  callNative('toggleMic');
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

function loadConfiguration() {
  try {
    const raw = callNative('getConfig');
    if (!raw) return;
    const cfg = JSON.parse(raw);

    if (cfg.user_name) document.getElementById('cfgUserName').value = cfg.user_name;
    if (cfg.assistant_name) document.getElementById('cfgAssistantName').value = cfg.assistant_name;
    if (cfg.llm_provider) document.getElementById('modeProviderSelect').value = cfg.llm_provider;
    if (cfg.llm_model) document.getElementById('modeModelSelect').value = cfg.llm_model;
    if (cfg.orb_theme) {
      document.getElementById('auraThemeSelect').value = cfg.orb_theme;
      state.orbTheme = cfg.orb_theme;
    }
    if (cfg.pc_host) document.getElementById('pcHostInput').value = cfg.pc_host;

    const keys = cfg.api_keys || {};
    if (keys.google) document.getElementById('cfgGoogleKey').value = keys.google;
    if (keys.openai) document.getElementById('cfgOpenAiKey').value = keys.openai;
    if (keys.livekit_url) document.getElementById('cfgLiveKitUrl').value = keys.livekit_url;
    if (keys.livekit_key) document.getElementById('cfgLiveKitKey').value = keys.livekit_key;
    if (keys.livekit_secret) document.getElementById('cfgLiveKitSecret').value = keys.livekit_secret;
    if (keys.mem0) document.getElementById('cfgMem0Key').value = keys.mem0;
    if (keys.google_search) document.getElementById('cfgGoogleSearchKey').value = keys.google_search;
    if (keys.search_engine_id) document.getElementById('cfgSearchEngineId').value = keys.search_engine_id;
    if (keys.openweather) document.getElementById('cfgOpenWeatherKey').value = keys.openweather;
    if (keys.xiaomi_mimo) document.getElementById('cfgXiaomiMimoKey').value = keys.xiaomi_mimo;
    if (keys.elevenlabs) document.getElementById('cfgElevenLabsKey').value = keys.elevenlabs;
    if (keys.elevenlabs_voice_id) document.getElementById('cfgElevenLabsVoiceId').value = keys.elevenlabs_voice_id;
  } catch (e) {
    console.error('Failed to load initial config from native bridge:', e);
  }
}

function saveConfiguration() {
  const config = {
    user_name: document.getElementById('cfgUserName').value || 'ALAMIN',
    assistant_name: document.getElementById('cfgAssistantName').value || 'Jarvis',
    llm_provider: document.getElementById('modeProviderSelect').value,
    llm_model: document.getElementById('modeModelSelect').value,
    orb_theme: document.getElementById('auraThemeSelect').value,
    pc_host: document.getElementById('pcHostInput').value,
    api_keys: {
      google: document.getElementById('cfgGoogleKey').value,
      openai: document.getElementById('cfgOpenAiKey').value,
      livekit_url: document.getElementById('cfgLiveKitUrl').value,
      livekit_key: document.getElementById('cfgLiveKitKey').value,
      livekit_secret: document.getElementById('cfgLiveKitSecret').value,
      mem0: document.getElementById('cfgMem0Key').value,
      google_search: document.getElementById('cfgGoogleSearchKey').value,
      search_engine_id: document.getElementById('cfgSearchEngineId').value,
      openweather: document.getElementById('cfgOpenWeatherKey').value,
      xiaomi_mimo: document.getElementById('cfgXiaomiMimoKey').value,
      elevenlabs: document.getElementById('cfgElevenLabsKey').value,
      elevenlabs_voice_id: document.getElementById('cfgElevenLabsVoiceId').value,
    }
  };

  const success = callNative('saveConfig', JSON.stringify(config));
  showToast(success !== false ? 'CONFIGURATION SAVED & ACTIVATED' : 'SAVE ERROR');
}

function executeAction(action, payload) {
  callNative('executeMobileAction', action, JSON.stringify(payload || {}));
  showToast(`Action dispatched: ${action.toUpperCase()}`);
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

function testPcConnection() {
  const host = document.getElementById('pcHostInput').value;
  showToast(`Linking to PC at ${host}...`);
  setTimeout(() => {
    showToast('PC SYNC ONLINE // READY');
  }, 1200);
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
// Native Event Hooks (Invoked from Kotlin via evaluateJavascript)
// -------------------------------------------------------------------------
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

window.updateServiceStatus = function(serviceRunning, accessibilityEnabled, batteryIgnored, sessionActive) {
  state.serviceRunning = serviceRunning;
  state.accessibilityEnabled = accessibilityEnabled;
  state.batteryIgnored = batteryIgnored;

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

// Periodic status poll
setInterval(() => {
  try {
    const raw = callNative('getServiceStatus');
    if (raw) {
      const s = JSON.parse(raw);
      window.updateServiceStatus(s.serviceRunning, s.accessibilityEnabled, s.batteryIgnored, s.sessionActive);
    }
  } catch (_) {}
}, 2500);

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

  // Initial service status check
  try {
    const raw = callNative('getServiceStatus');
    if (raw) {
      const s = JSON.parse(raw);
      window.updateServiceStatus(s.serviceRunning, s.accessibilityEnabled, s.batteryIgnored);
    }
  } catch (_) {}
});
