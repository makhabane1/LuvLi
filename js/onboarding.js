// Luvli ♡ — First-time Onboarding
// Interactive 3-step guide for new users, showing Focus mode, Study mode, and Friends

const Onboarding = (() => {
  const steps = [
    {
      id: 'focus-mode',
      title: 'Focus Mode',
      subtitle: 'Deep work sessions',
      icon: 'sparkles',
      description: 'Use Pomodoro-style focus sessions to tackle your most important work. Pick a duration (15–60 min), go fullscreen, and silence distractions.',
      cta: 'Try a 25-min session'
    },
    {
      id: 'study-mode',
      title: 'Study Mode',
      subtitle: 'Organized learning',
      icon: 'book',
      description: 'Manage assignments, exams, and notes all in one place. Track your revision, organize by subject, and celebrate progress.',
      cta: 'Add a sample assignment'
    },
    {
      id: 'friends',
      title: 'Study Buddies',
      subtitle: 'Shared accountability',
      icon: 'people',
      description: 'Connect with friends, compare focus streaks, and start collaborative focus rooms. Stay motivated together.',
      cta: 'Generate an invite code'
    }
  ];

  function hasCompleted() {
    const storage = Storage.get();
    return storage.onboarding?.completed === true;
  }

  function markCompleted() {
    Storage.update(s => {
      if (!s.onboarding) s.onboarding = {};
      s.onboarding.completed = true;
      s.onboarding.completedAt = new Date().toISOString();
    }, 'onboarding completed');
  }

  function getCurrentStep() {
    const storage = Storage.get();
    return storage.onboarding?.currentStep || 0;
  }

  function setCurrentStep(step) {
    Storage.update(s => {
      if (!s.onboarding) s.onboarding = {};
      s.onboarding.currentStep = step;
    }, 'onboarding step');
  }

  function addSampleTasks() {
    const samples = [
      {
        id: Utils.id(),
        title: 'Try a focus session',
        tags: ['focus', 'sample'],
        duration: 25,
        priority: 'high',
        deadline: new Date().toISOString().split('T')[0],
        completed: false
      },
      {
        id: Utils.id(),
        title: 'Add your first study note',
        tags: ['study', 'sample'],
        duration: 15,
        priority: 'medium',
        deadline: new Date().toISOString().split('T')[0],
        completed: false
      },
      {
        id: Utils.id(),
        title: 'Invite a study buddy',
        tags: ['friends', 'sample'],
        duration: 5,
        priority: 'medium',
        deadline: new Date().toISOString().split('T')[0],
        completed: false
      }
    ];

    Storage.update(s => {
      if (!s.activities) s.activities = [];
      samples.forEach(sample => {
        if (!s.activities.find(a => a.tags?.includes('sample'))) {
          s.activities.push(sample);
        }
      });
    }, 'sample tasks added');
  }

  function show() {
    if (hasCompleted()) return false;

    const modal = document.createElement('div');
    modal.className = 'onboarding-modal';
    modal.id = 'onboardingModal';

    const currentStep = getCurrentStep();
    const step = steps[currentStep];

    modal.innerHTML = `
      <div class="onboarding-overlay"></div>
      <div class="onboarding-card">
        <div class="onboarding-progress">
          <div class="progress-dots">
            ${steps.map((s, i) => `<div class="dot ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'done' : ''}"></div>`).join('')}
          </div>
          <span class="progress-text">Step ${currentStep + 1} of ${steps.length}</span>
        </div>

        <div class="onboarding-content">
          <div class="onboarding-icon" data-ico="${step.icon}"></div>
          <h2 class="onboarding-title">${step.title}</h2>
          <p class="onboarding-subtitle">${step.subtitle}</p>
          <p class="onboarding-description">${step.description}</p>
        </div>

        <div class="onboarding-actions">
          ${currentStep > 0 ? '<button class="btn btn-ghost" id="prevStep" type="button">Back</button>' : ''}
          <button class="btn btn-primary" id="nextStep" type="button">
            ${currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
          </button>
        </div>

        <button class="onboarding-close" id="skipOnboarding" type="button" aria-label="Skip onboarding">Skip for now</button>
      </div>
    `;

    document.body.appendChild(modal);

    // Set icons
    const iconEls = modal.querySelectorAll('.onboarding-icon[data-ico]');
    iconEls.forEach(el => {
      const iconName = el.getAttribute('data-ico');
      el.innerHTML = Utils.ico(iconName);
    });

    const nextBtn = modal.querySelector('#nextStep');
    const prevBtn = modal.querySelector('#prevStep');
    const skipBtn = modal.querySelector('#skipOnboarding');

    nextBtn.addEventListener('click', () => {
      if (currentStep === steps.length - 1) {
        // Onboarding complete
        markCompleted();
        addSampleTasks();
        close();
        App.renderAll();
        UI.toast({ icon: 'heart', title: 'Welcome to Luvli!', body: 'You\'re all set. Explore at your own pace.' });
      } else {
        // Next step
        setCurrentStep(currentStep + 1);
        close();
        show();
      }
    });

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        setCurrentStep(currentStep - 1);
        close();
        show();
      });
    }

    skipBtn.addEventListener('click', () => {
      markCompleted();
      close();
      App.renderAll();
    });

    return true;
  }

  function close() {
    const modal = document.getElementById('onboardingModal');
    if (modal) {
      modal.style.animation = 'fadeOut 0.3s ease-out forwards';
      setTimeout(() => modal.remove(), 300);
    }
  }

  function reset() {
    Storage.update(s => {
      if (s.onboarding) {
        s.onboarding.completed = false;
        s.onboarding.currentStep = 0;
      }
    }, 'onboarding reset');
  }

  return {
    show,
    close,
    hasCompleted,
    markCompleted,
    reset,
    getCurrentStep
  };
})();
