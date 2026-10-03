const listenBtn = document.querySelector('#listenBtn');
const card = document.querySelector('.command-card');
const label = document.querySelector('#listeningLabel');
const hint = document.querySelector('#voiceHint');
const transcript = document.querySelector('#transcript');
const toast = document.querySelector('#toast');
const activityList = document.querySelector('#activityList');
let recognition;
let listening = false;
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}
function setListening(value) {
  listening = value;
  card.classList.toggle('listening', value);
  label.textContent = value ? 'LISTENING…' : 'TAP TO SPEAK';
  hint.textContent = value ? 'I’m listening for your command' : 'Say “Hey Jarwis” or tap the orb to begin';
  listenBtn.setAttribute('aria-label', value ? 'Stop listening' : 'Start listening');
}
function addActivity(command, detail = 'Completed by JARWIS') {
  const item = document.createElement('article');
  item.className = 'activity-item';
  item.innerHTML = `<span class="activity-icon green">✓</span><div><strong>${command}</strong><p>${detail}</p></div><time>Just now</time>`;
  activityList.prepend(item);
  showToast(`Done — ${command}`);
}
function performCommand(command) {
  const clean = command.trim();
  if (!clean) return;
  transcript.hidden = false;
  transcript.textContent = `“${clean}”`;
  setListening(false);
  const lower = clean.toLowerCase();
  let detail = 'Action queued with your approval';
  if (lower.includes('timer')) detail = 'Timer started · 10 minutes';
  else if (lower.includes('calendar')) detail = 'Your schedule is ready';
  else if (lower.includes('call')) detail = 'Confirmation required before calling';
  else if (lower.includes('text') || lower.includes('message')) detail = 'Confirmation required before sending';
  else if (lower.includes('playlist') || lower.includes('music')) detail = 'Playing in your music app';
  else if (lower.includes('navigate') || lower.includes('map')) detail = 'Opening directions';
  setTimeout(() => addActivity(clean, detail), 250);
}

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SpeechRecognition) {
  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.onstart = () => setListening(true);
  recognition.onresult = (event) => {
    const result = event.results[event.results.length - 1];
    transcript.hidden = false;
    transcript.textContent = `“${result[0].transcript}”`;
    if (result.isFinal) performCommand(result[0].transcript);
  };
  recognition.onerror = () => { setListening(false); showToast('I couldn’t hear that. Try again.'); };
  recognition.onend = () => { if (listening) setListening(false); };
} else {
  hint.textContent = 'Voice input is not supported in this browser';
}
listenBtn.addEventListener('click', () => {
  if (!recognition) return showToast('Try Chrome or Safari for voice input');
  if (listening) recognition.stop(); else { transcript.hidden = true; recognition.start(); }
});
document.querySelectorAll('[data-command]').forEach(button => button.addEventListener('click', () => performCommand(button.dataset.command)));
document.querySelector('#clearActivity').addEventListener('click', () => { activityList.innerHTML = '<p style="color:#84909c;font-size:11px;text-align:center;padding:16px 0">No recent activity</p>'; showToast('Activity cleared'); });
document.querySelector('#privacyBtn').addEventListener('click', () => showToast('Permissions center coming next'));
document.querySelector('#settingsBtn').addEventListener('click', () => showToast('Settings are protected by your device'));
document.querySelector('#customizeBtn').addEventListener('click', () => showToast('Long-press an action to customize it'));
document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => { document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active')); item.classList.add('active'); if (!item.classList.contains('active')) return; if (item.id === 'activityNav') document.querySelector('.activity-block').scrollIntoView({behavior:'smooth'}); if (item.id === 'permissionsNav') document.querySelector('.privacy-banner').scrollIntoView({behavior:'smooth'}); }));
