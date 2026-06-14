/**
 * Habit Flow Onboarding Popup
 * Translated from React to Vanilla JS for integration in static HTML homepage
 */

window.habitFlowPopup = {
  currentStep: 0,
  steps: [
    {
      id: 1,
      title: "Selamat datang di",
      titleHighlight: "Habit Flow! 🌿",
      subtitle: "Ayo bangun kebiasaan positif dan jadi versi terbaik dirimu setiap hari.",
      features: [
        { icon: "✅", text: "Membangun kebiasaan baik" },
        { icon: "📈", text: "Melacak progres setiap hari" },
        { icon: "⭐", text: "Mencapai tujuan hidupmu" },
      ],
      visual: "welcome",
      label: "Selamat datang",
    },
    {
      id: 2,
      title: "Pantau kebiasaanmu",
      titleHighlight: "setiap hari",
      subtitle: "Gunakan kalender untuk menandai kebiasaan yang sudah kamu lakukan.",
      tip: { icon: "🔥", text: "Semakin konsisten kamu, semakin panjang streak kamu!" },
      visual: "calendar",
      label: "Fitur utama",
    },
    {
      id: 3,
      title: "Jangan lewatkan",
      titleHighlight: "momen penting",
      subtitle: "Aktifkan pengingat agar kamu tetap konsisten mencapai tujuan.",
      reminder: { name: "Minum Air Putih", time: "08:00 AM" },
      visual: "bell",
      label: "Tetap konsisten",
    },
    {
      id: 4,
      title: "Siap untuk memulai",
      titleHighlight: "perjalanan terbaikmu?",
      subtitle: "Buat kebiasaan pertamamu dan mulai perubahan positif hari ini!",
      quote: '"Perubahan kecil hari ini, hasil luar biasa esok hari."',
      visual: "trophy",
      label: "Siap memulai",
    },
  ],

  init: function() {
    // Auto-open on page load if the user hasn't completed/skipped the tutorial before
    const hasCompleted = localStorage.getItem('habitflow_popup_completed');
    if (!hasCompleted) {
      setTimeout(() => {
        this.open();
      }, 400);
    }
  },

  open: function() {
    this.currentStep = 0;
    this.render();
    const overlay = document.getElementById('habitflowPopupOverlay');
    const card = document.getElementById('habitflowPopupCard');
    if (overlay && card) {
      overlay.style.display = 'flex';
      card.style.animation = 'slideIn 0.32s cubic-bezier(0.22, 1, 0.36, 1) forwards';
    }
  },

  close: function() {
    const overlay = document.getElementById('habitflowPopupOverlay');
    const card = document.getElementById('habitflowPopupCard');
    if (overlay && card) {
      card.style.animation = 'slideOut 0.22s ease forwards';
      setTimeout(() => {
        overlay.style.display = 'none';
      }, 220);
    }
    // Persist onboarding completion state
    localStorage.setItem('habitflow_popup_completed', 'true');
  },

  goTo: function(idx) {
    const card = document.getElementById('habitflowPopupCard');
    if (card) {
      card.style.animation = 'slideOut 0.22s ease forwards';
      setTimeout(() => {
        this.currentStep = idx;
        this.render();
        card.style.animation = 'slideIn 0.32s cubic-bezier(0.22, 1, 0.36, 1) forwards';
      }, 220);
    }
  },

  next: function() {
    if (this.currentStep < this.steps.length - 1) {
      this.goTo(this.currentStep + 1);
    } else {
      this.close();
    }
  },

  prev: function() {
    if (this.currentStep > 0) {
      this.goTo(this.currentStep - 1);
    }
  },

  toggleReminder: function() {
    const container = document.getElementById('habitflowToggleContainer');
    const knob = document.getElementById('habitflowToggleKnob');
    if (container && knob) {
      if (container.classList.contains('toggle-on')) {
        container.classList.remove('toggle-on');
        container.style.background = '#d0d0d0';
        knob.style.transform = 'translateX(0px)';
      } else {
        container.classList.add('toggle-on');
        container.style.background = 'linear-gradient(90deg, #22a94f, #2ecc71)';
        knob.style.transform = 'translateX(22px)';
      }
    }
  },

  render: function() {
    const step = this.steps[this.currentStep];

    // Prev Button visibility
    const prevBtn = document.getElementById('habitflowPrevBtn');
    if (prevBtn) {
      if (this.currentStep > 0) {
        prevBtn.style.visibility = 'visible';
      } else {
        prevBtn.style.visibility = 'hidden';
      }
    }

    // Step text label
    const stepText = document.getElementById('habitflowStepText');
    if (stepText) {
      stepText.textContent = `STEP ${this.currentStep + 1} / ${this.steps.length}`;
    }

    // Visual area rendering
    const visualContainer = document.getElementById('habitflowVisualContainer');
    if (visualContainer) {
      if (step.visual === 'welcome') {
        visualContainer.innerHTML = `
          <div style="display: flex; justify-content: center; padding: 8px 0 4px; position: relative;">
            <div style="font-size: 80px; filter: drop-shadow(0 8px 24px rgba(34,139,34,0.18));">🧑🌱</div>
            <div style="position: absolute; top: 0; left: 18%; font-size: 22px; animation: floatLeaf 2.2s ease-in-out infinite;">🍃</div>
            <div style="position: absolute; bottom: 8px; right: 18%; font-size: 18px; animation: floatLeaf 2.8s ease-in-out infinite reverse;">🌿</div>
          </div>
        `;
      } else if (step.visual === 'calendar') {
        const days = ["S", "M", "T", "W", "F", "S"];
        const grid = [
          [true, true, true, true, true, false],
          [true, true, false, true, true, true],
          [false, true, true, false, "star", false],
        ];
        
        let gridHtml = '';
        grid.forEach((row) => {
          let rowHtml = '';
          row.forEach((cell) => {
            let bg = cell === true ? "#22a94f" : cell === "star" ? "#f5c842" : "#f0f0f0";
            let content = cell === true ? '<span style="color: white; font-size: 13px;">✓</span>' : cell === "star" ? '<span style="font-size: 12px;">⭐</span>' : '';
            rowHtml += `
              <div style="width: 24px; height: 24px; border-radius: 50%; background: ${bg}; display: flex; align-items: center; justify-content: center; font-size: 13px;">
                ${content}
              </div>
            `;
          });
          gridHtml += `
            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
              ${rowHtml}
            </div>
          `;
        });

        visualContainer.innerHTML = `
          <div style="display: flex; justify-content: center; padding: 8px 0 4px;">
            <div style="background: white; border-radius: 16px; padding: 14px 18px; box-shadow: 0 8px 32px rgba(34,139,34,0.13); width: 210px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                ${days.map(d => `<span style="font-size: 11px; font-weight: 700; color: #aaa; width: 24px; text-align: center;">${d}</span>`).join('')}
              </div>
              ${gridHtml}
            </div>
          </div>
        `;
      } else if (step.visual === 'bell') {
        visualContainer.innerHTML = `
          <div style="display: flex; justify-content: center; padding: 8px 0 4px; position: relative;">
            <div style="font-size: 80px; filter: drop-shadow(0 8px 24px rgba(34,139,34,0.18)); animation: bellRing 2s ease-in-out infinite;">🔔</div>
            <div style="position: absolute; bottom: 10px; right: 26%; font-size: 34px;">🕐</div>
          </div>
        `;
      } else if (step.visual === 'trophy') {
        visualContainer.innerHTML = `
          <div style="display: flex; justify-content: center; padding: 8px 0 4px; position: relative;">
            <div style="font-size: 80px; filter: drop-shadow(0 8px 24px rgba(34,139,34,0.18)); animation: trophyBounce 1.8s ease-in-out infinite;">🏆</div>
            <div style="position: absolute; top: 2px; left: 22%; font-size: 20px;">🎊</div>
            <div style="position: absolute; top: 2px; right: 22%; font-size: 20px;">✨</div>
          </div>
        `;
      }
    }

    // Title
    const titleEl = document.getElementById('habitflowTitle');
    if (titleEl) {
      titleEl.innerHTML = `${step.title} <span style="color: #22a94f">${step.titleHighlight}</span>`;
    }

    // Subtitle
    const subtitleEl = document.getElementById('habitflowSubtitle');
    if (subtitleEl) {
      subtitleEl.textContent = step.subtitle;
    }

    // Dynamic step details
    const dynamicContent = document.getElementById('habitflowDynamicContent');
    if (dynamicContent) {
      dynamicContent.innerHTML = '';
      
      if (step.features) {
        dynamicContent.innerHTML = `
          <div style="background: #f6fdf7; border-radius: 14px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; border: 1px solid #d4eeda;">
            <p style="font-size: 11px; font-weight: 800; color: #22a94f; letter-spacing: 0.8px; margin-bottom: 2px;">
              HABIT FLOW MEMBANTUMU UNTUK:
            </p>
            ${step.features.map(f => `
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-size: 16px;">${f.icon}</span>
                <span style="font-size: 13px; font-weight: 700; color: #2d4a2d;">${f.text}</span>
              </div>
            `).join('')}
          </div>
        `;
      } else if (step.tip) {
        dynamicContent.innerHTML = `
          <div style="background: linear-gradient(135deg, #fff8e8, #fff3d0); border-radius: 12px; padding: 10px 14px; display: flex; align-items: center; gap: 10px; border: 1px solid #f5d78e; margin-bottom: 14px;">
            <span style="font-size: 20px;">${step.tip.icon}</span>
            <span style="font-size: 13px; font-weight: 700; color: #7a5a00;">${step.tip.text}</span>
          </div>
        `;
      } else if (step.reminder) {
        dynamicContent.innerHTML = `
          <div style="background: #f6fdf7; border-radius: 14px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; border: 1px solid #d4eeda; margin-bottom: 14px;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 22px;">🔔</span>
              <div>
                <div style="font-size: 13px; font-weight: 800; color: #1a2e1a;">${step.reminder.name}</div>
                <div style="font-size: 12px; color: #22a94f; font-weight: 700;">${step.reminder.time}</div>
              </div>
            </div>
            <div id="habitflowToggleContainer" class="toggle-on" onclick="habitFlowPopup.toggleReminder()" style="width: 48px; height: 26px; border-radius: 13px; background: linear-gradient(90deg, #22a94f, #2ecc71); position: relative; cursor: pointer; transition: background 0.3s;">
              <div id="habitflowToggleKnob" style="position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: white; box-shadow: 0 1px 4px rgba(0,0,0,0.2); transform: translateX(22px); transition: transform 0.3s;"></div>
            </div>
          </div>
        `;
      } else if (step.quote) {
        dynamicContent.innerHTML = `
          <div style="background: linear-gradient(135deg, #f6fdf7, #edf7ee); border-radius: 14px; padding: 12px 16px; display: flex; align-items: flex-start; gap: 10px; border: 1px solid #c8eacb; margin-bottom: 14px;">
            <span style="font-size: 20px; margin-top: 1px;">🌱</span>
            <span style="font-size: 13px; font-weight: 700; color: #2d4a2d; font-style: italic; line-height: 1.5;">
              ${step.quote}
            </span>
          </div>
        `;
      }
    }

    // Indicator Dots rendering
    const dotsEl = document.getElementById('habitflowDots');
    if (dotsEl) {
      let dotsHtml = '';
      this.steps.forEach((_, i) => {
        const isActive = i === this.currentStep;
        const width = isActive ? '20px' : '7px';
        const bg = isActive ? '#22a94f' : '#d4eeda';
        const pulse = isActive ? 'animation: dotPulse 1.8s ease-in-out infinite;' : '';
        dotsHtml += `
          <div onclick="habitFlowPopup.goTo(${i})" style="width: ${width}; height: 7px; border-radius: 4px; background: ${bg}; cursor: pointer; transition: all 0.3s cubic-bezier(0.22, 1, 0.36, 1); ${pulse}"></div>
        `;
      });
      dotsEl.innerHTML = dotsHtml;
    }

    // CTA Button text
    const ctaBtn = document.getElementById('habitflowCtaBtn');
    if (ctaBtn) {
      if (this.currentStep < this.steps.length - 1) {
        ctaBtn.innerHTML = `Lanjutkan <span style="font-size: 18px">→</span>`;
      } else {
        ctaBtn.innerHTML = `Mulai Sekarang <span style="font-size: 18px">✨</span>`;
      }
    }
  }
};

document.addEventListener('DOMContentLoaded', () => {
  // 1. Inject CSS styles for popup
  const styles = document.createElement('style');
  styles.innerHTML = `
    @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap');
    
    @keyframes bellRing {
      0%, 100% { transform: rotate(0deg); }
      20% { transform: rotate(-18deg); }
      40% { transform: rotate(18deg); }
      60% { transform: rotate(-10deg); }
      80% { transform: rotate(10deg); }
    }
    @keyframes trophyBounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-10px); }
    }
    @keyframes floatLeaf {
      0%, 100% { transform: translateY(0) rotate(0deg); }
      50% { transform: translateY(-10px) rotate(12deg); }
    }
    @keyframes slideIn {
      from { opacity: 0; transform: translateY(28px) scale(0.97); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes slideOut {
      from { opacity: 1; transform: translateY(0) scale(1); }
      to { opacity: 0; transform: translateY(-20px) scale(0.97); }
    }
    @keyframes overlayIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes dotPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.35); }
    }
    .toggle-on {
      background: linear-gradient(90deg, #22a94f, #2ecc71) !important;
    }
  `;
  document.head.appendChild(styles);

  // 2. Inject HTML overlay
  const overlay = document.createElement('div');
  overlay.id = 'habitflowPopupOverlay';
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(10,30,15,0.45)';
  overlay.style.backdropFilter = 'blur(3px)';
  overlay.style.zIndex = '10000';
  overlay.style.animation = 'overlayIn 0.3s ease';
  overlay.style.display = 'none';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.fontFamily = "'Nunito', sans-serif";
  
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      habitFlowPopup.close();
    }
  };

  overlay.innerHTML = `
    <!-- Modal Card -->
    <div id="habitflowPopupCard" style="background: white; border-radius: 28px; width: min(360px, 92vw); overflow: hidden; box-shadow: 0 24px 80px rgba(0,0,0,0.22), 0 2px 0 rgba(34,169,79,0.3) inset; position: relative;">
      <!-- Top green accent -->
      <div style="background: linear-gradient(135deg, #22a94f 0%, #1a7a3a 100%); padding: 14px 20px 0; position: relative; overflow: hidden;">
        <!-- Decorative circles -->
        <div style="position: absolute; top: -24px; right: -24px; width: 80px; height: 80px; border-radius: 50%; background: rgba(255,255,255,0.08);"></div>
        <div style="position: absolute; top: -10px; right: 30px; width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.06);"></div>
        
        <!-- Top bar -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; position: relative; z-index: 10;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <button id="habitflowPrevBtn" style="background: rgba(255,255,255,0.18); border: none; border-radius: 50%; width: 30px; height: 30px; cursor: pointer; color: white; font-size: 16px; display: flex; align-items: center; justify-content: center;" onclick="habitFlowPopup.prev()">‹</button>
            <span id="habitflowStepText" style="color: rgba(255,255,255,0.85); font-size: 12px; font-weight: 700; letter-spacing: 1px;">STEP 1 / 4</span>
          </div>
          <button style="background: rgba(255,255,255,0.18); border: none; border-radius: 20px; padding: 4px 14px; color: white; font-size: 13px; font-weight: 700; cursor: pointer; letter-spacing: 0.3px;" onclick="habitFlowPopup.close()">Skip</button>
        </div>
        
        <!-- Visual container -->
        <div id="habitflowVisualContainer" style="min-height: 110px; display: flex; align-items: flex-end; justify-content: center; padding-bottom: 0;"></div>
      </div>
      
      <!-- Content -->
      <div style="padding: 22px 24px 20px;">
        <!-- Title -->
        <h2 id="habitflowTitle" style="font-size: 22px; font-weight: 900; color: #1a2e1a; line-height: 1.25; margin-bottom: 10px; font-family: 'Nunito', sans-serif;"></h2>
        
        <!-- Subtitle -->
        <p id="habitflowSubtitle" style="font-size: 14px; color: #5a7a5a; line-height: 1.6; margin-bottom: 14px; font-weight: 600;"></p>
        
        <!-- Dynamic content (Features, Tip, Reminder, Quote) -->
        <div id="habitflowDynamicContent"></div>
        
        <!-- Dots -->
        <div id="habitflowDots" style="display: flex; justify-content: center; gap: 7px; margin-bottom: 16px;"></div>
        
        <!-- CTA Button -->
        <button id="habitflowCtaBtn" style="width: 100%; background: linear-gradient(135deg, #22a94f 0%, #1a7a3a 100%); color: white; border: none; border-radius: 16px; padding: 15px 0; font-size: 16px; font-weight: 900; cursor: pointer; font-family: inherit; box-shadow: 0 6px 20px rgba(34,169,79,0.38); letter-spacing: 0.3px; display: flex; align-items: center; justify-content: center; gap: 8px; transition: transform 0.15s, box-shadow 0.15s;" onmouseenter="this.style.transform = 'translateY(-2px)'; this.style.boxShadow = '0 10px 28px rgba(34,169,79,0.45)';" onmouseleave="this.style.transform = ''; this.style.boxShadow = '0 6px 20px rgba(34,169,79,0.38)';" onclick="habitFlowPopup.next()"></button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // Initialize popup logic
  habitFlowPopup.init();
});
