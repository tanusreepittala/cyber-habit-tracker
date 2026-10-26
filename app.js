/* ==========================================================================
   CYBERPUNK HABIT TRACKER - ENGINE & STATE MANAGEMENT
   ========================================================================== */

// Ranks definition based on Level
const RANKS = [
  "CYBER NOVICE",
  "NEO ROOKIE",
  "CODE RUNNER",
  "CYBER DECKER",
  "SYSTEM HACKER",
  "NETRUNNER",
  "MATRIX MASTER",
  "CYBER OVERLORD"
];

// Initial State Blueprint
let state = {
  player: {
    level: 1,
    currentXp: 0,
    nextLevelXp: 100,
    streak: 0,
    lastCompletedDate: null,
    lifetimeXp: 0,
    totalCompletedCount: 0
  },
  habits: [],
  logs: {}, // Format: "YYYY-MM-DD": [habitId1, habitId2]
  settings: {
    scanlines: true,
    audio: true
  }
};

// Web Audio Synthesizer (Zero external dependencies)
class CyberAudio {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  playTone(freq, type = 'sine', duration = 0.15) {
    if (!state.settings.audio) return;
    this.init();
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  playCheck() {
    this.playTone(523.25, 'triangle', 0.1); // C5
    setTimeout(() => this.playTone(659.25, 'triangle', 0.15), 80); // E5
  }

  playUncheck() {
    this.playTone(400, 'sawtooth', 0.1);
  }

  playLevelUp() {
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99];
    notes.forEach((freq, index) => {
      setTimeout(() => this.playTone(freq, 'square', 0.2), index * 90);
    });
  }
}

const audio = new CyberAudio();

// HELPERS
const getTodayStr = () => new Date().toISOString().split('T')[0];

function loadState() {
  const saved = localStorage.getItem('cyber_habit_state');
  if (saved) {
    try {
      state = JSON.parse(saved);
    } catch (e) {
      console.error("Failed to parse state", e);
    }
  }
  checkStreakReset();
}

function saveState() {
  localStorage.setItem('cyber_habit_state', JSON.stringify(state));
  renderUI();
}

function checkStreakReset() {
  if (!state.player.lastCompletedDate) return;

  const today = new Date(getTodayStr());
  const lastDate = new Date(state.player.lastCompletedDate);
  const diffDays = Math.round((today - lastDate) / (1000 * 60 * 60 * 24));

  if (diffDays > 1) {
    state.player.streak = 0; // Streak broken if missed more than 1 day
  }
}

// LEVEL & XP CALCULATIONS
function addExperience(amount) {
  state.player.currentXp += amount;
  state.player.lifetimeXp += amount;

  // Level Up Check
  if (state.player.currentXp >= state.player.nextLevelXp) {
    state.player.currentXp -= state.player.nextLevelXp;
    state.player.level += 1;
    state.player.nextLevelXp = Math.floor(state.player.nextLevelXp * 1.35);

    // Trigger Level Up FX
    audio.playLevelUp();
    triggerConfetti();
    showLevelUpModal();
  }
}

function deductExperience(amount) {
  state.player.currentXp = Math.max(0, state.player.currentXp - amount);
  state.player.lifetimeXp = Math.max(0, state.player.lifetimeXp - amount);
}

// RENDERERS
function renderUI() {
  renderPlayerStats();
  renderHabitList();
  renderAnalytics();
  renderSettings();
}

function renderPlayerStats() {
  document.getElementById('playerLevel').textContent = `LVL ${state.player.level}`;
  
  const rankIndex = Math.min(state.player.level - 1, RANKS.length - 1);
  document.getElementById('playerRankTitle').textContent = RANKS[rankIndex];
  
  document.getElementById('streakDays').textContent = state.player.streak;
  document.getElementById('currentXpText').textContent = state.player.currentXp;
  document.getElementById('nextLevelXpText').textContent = state.player.nextLevelXp;

  const xpPct = Math.min(100, Math.floor((state.player.currentXp / state.player.nextLevelXp) * 100));
  document.getElementById('xpProgressFill').style.width = `${xpPct}%`;
  document.getElementById('xpPercentText').textContent = `${xpPct}%`;
}

function renderHabitList() {
  const container = document.getElementById('habitList');
  const emptyState = document.getElementById('emptyState');
  const today = getTodayStr();
  const todayLogs = state.logs[today] || [];

  container.innerHTML = '';

  if (state.habits.length === 0) {
    emptyState.classList.remove('hidden');
    return;
  }
  emptyState.classList.add('hidden');

  state.habits.forEach(habit => {
    const isDone = todayLogs.includes(habit.id);
    
    const item = document.createElement('div');
    item.className = `habit-item ${isDone ? 'completed' : ''}`;
    
    item.innerHTML = `
      <div class="habit-left">
        <div class="habit-checkbox" onclick="toggleHabit('${habit.id}')">
          ${isDone ? '<i class="fa-solid fa-check"></i>' : ''}
        </div>
        <div>
          <div class="habit-title">${escapeHtml(habit.name)}</div>
          <div class="habit-meta">
            <span><i class="fa-solid fa-tag"></i> ${habit.category}</span>
            <span class="text-neon-yellow">+${habit.xp} XP</span>
          </div>
        </div>
      </div>
      <div class="habit-actions">
        <button class="icon-btn" onclick="deleteHabit('${habit.id}')" title="Delete Protocol">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;

    container.appendChild(item);
  });
}

function renderAnalytics() {
  const today = getTodayStr();
  const todayLogs = state.logs[today] || [];
  
  // Daily percentage
  const total = state.habits.length;
  const doneCount = todayLogs.length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  document.getElementById('dailyPercentText').textContent = `${pct}%`;
  document.getElementById('dailyProgressBar').style.width = `${pct}%`;
  document.getElementById('statTotalCompleted').textContent = state.player.totalCompletedCount;
  document.getElementById('statLifetimeXp').textContent = state.player.lifetimeXp;

  // 7-Day History Matrix
  const matrixContainer = document.getElementById('matrixGrid');
  matrixContainer.innerHTML = '';

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const dayName = d.toLocaleDateString('en-US', { weekday: 'narrow' });
    
    const dayLogs = state.logs[dateStr] || [];
    const isDayCompleted = dayLogs.length > 0;

    const dayEl = document.createElement('div');
    dayEl.className = 'matrix-day';
    dayEl.innerHTML = `
      <div class="matrix-dot ${isDayCompleted ? 'done' : ''}"></div>
      <span class="matrix-day-label">${dayName}</span>
    `;
    matrixContainer.appendChild(dayEl);
  }
}

function renderSettings() {
  const scanlinesEl = document.getElementById('scanlines');
  if (state.settings.scanlines) {
    scanlinesEl.classList.remove('off');
  } else {
    scanlinesEl.classList.add('off');
  }

  document.getElementById('audioToggleBtn').innerHTML = state.settings.audio
    ? '<i class="fa-solid fa-volume-high"></i> Audio: ON'
    : '<i class="fa-solid fa-volume-xmark"></i> Audio: OFF';
}

// ACTIONS
function toggleHabit(id) {
  const today = getTodayStr();
  if (!state.logs[today]) state.logs[today] = [];

  const habit = state.habits.find(h => h.id === id);
  if (!habit) return;

  const index = state.logs[today].indexOf(id);

  if (index === -1) {
    // Complete Habit
    state.logs[today].push(id);
    state.player.totalCompletedCount += 1;
    addExperience(habit.xp);
    audio.playCheck();

    // Streak Check
    if (state.player.lastCompletedDate !== today) {
      state.player.streak += 1;
      state.player.lastCompletedDate = today;
    }
  } else {
    // Un-complete Habit
    state.logs[today].splice(index, 1);
    state.player.totalCompletedCount = Math.max(0, state.player.totalCompletedCount - 1);
    deductExperience(habit.xp);
    audio.playUncheck();
  }

  saveState();
}

function deleteHabit(id) {
  state.habits = state.habits.filter(h => h.id !== id);
  saveState();
}

// MODALS & OVERLAYS
const modal = document.getElementById('habitModal');

document.getElementById('openModalBtn').addEventListener('click', () => {
  modal.classList.remove('hidden');
});

document.getElementById('closeModalBtn').addEventListener('click', closeModal);
document.getElementById('cancelModalBtn').addEventListener('click', closeModal);

function closeModal() {
  modal.classList.add('hidden');
  document.getElementById('addHabitForm').reset();
}

document.getElementById('addHabitForm').addEventListener('submit', (e) => {
  e.preventDefault();
  
  const name = document.getElementById('habitName').value.trim();
  const category = document.getElementById('habitCategory').value;
  const xp = parseInt(document.getElementById('habitDifficulty').value, 10);

  if (!name) return;

  const newHabit = {
    id: 'habit_' + Date.now(),
    name,
    category,
    xp
  };

  state.habits.push(newHabit);
  saveState();
  closeModal();
});

function showLevelUpModal() {
  const overlay = document.getElementById('levelUpOverlay');
  const rankIndex = Math.min(state.player.level - 1, RANKS.length - 1);

  document.getElementById('newLevelTitle').textContent = `LEVEL ${state.player.level}`;
  document.getElementById('newRankBadge').textContent = RANKS[rankIndex];
  overlay.classList.remove('hidden');
}

document.getElementById('closeLevelUpBtn').addEventListener('click', () => {
  document.getElementById('levelUpOverlay').classList.add('hidden');
});

// SETTINGS TOGGLES
document.getElementById('scanlineToggleBtn').addEventListener('click', () => {
  state.settings.scanlines = !state.settings.scanlines;
  saveState();
});

document.getElementById('audioToggleBtn').addEventListener('click', () => {
  state.settings.audio = !state.settings.audio;
  saveState();
});

// Confetti Engine
function triggerConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#00f3ff', '#ff0055', '#ffee00']
    });
  }
}

// Utility
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}

// INIT APP
window.addEventListener('DOMContentLoaded', () => {
  loadState();
  renderUI();
});