const BRANCH_ICON = 'E.png';
let BRANCHES = [];
let branchesPromise = null;

function escBranch(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function loadBranches() {
  if (!branchesPromise) {
    branchesPromise = fetch('/branches')
      .then(res => res.json().then(data => {
        if (!res.ok) throw new Error(data.error || 'Could not load branches');
        BRANCHES = data.map(b => ({ value: String(b.id), name: b.name }));
        return BRANCHES;
      }))
      .catch(err => { branchesPromise = null; throw err; });
  }
  return branchesPromise;
}

// Returns text that is safe to put inside innerHTML
function branchName(id) {
  const b = BRANCHES.find(x => x.value === String(id));
  return escBranch(b ? b.name : 'Branch ' + id);
}

async function initBranchDropdown(containerId, options = {}) {
  const { inputId = 'branchSelect', includeAll = false, fullWidth = false, onChange } = options;
  const container = document.getElementById(containerId);
  if (!container) return;

  await loadBranches();
  const list = includeAll ? [{ value: '', name: 'All branches' }, ...BRANCHES] : BRANCHES;
  if (list.length === 0) { container.textContent = 'No branches set up.'; return; }
  const first = list[0];

  container.classList.add('branch-dropdown');
  if (fullWidth) container.classList.add('branch-dropdown--full');

  container.innerHTML = `
    <button type="button" class="branch-trigger">
      <img src="${BRANCH_ICON}" alt="">
      <span class="label">${escBranch(first.name)}</span>
      <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="#9aa1b4" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </button>
    <div class="branch-menu">
      ${list.map((b, i) => `
        <div class="branch-option${i === 0 ? ' selected' : ''}" data-value="${escBranch(b.value)}" data-name="${escBranch(b.name)}">
          <img src="${BRANCH_ICON}" alt="">${escBranch(b.name)}
        </div>
      `).join('')}
    </div>
    <input type="hidden" id="${inputId}" value="${escBranch(first.value)}">
  `;

  const label = container.querySelector('.label');
  const input = container.querySelector('input[type="hidden"]');

  container.querySelector('.branch-trigger').addEventListener('click', (e) => {
    e.stopPropagation();
    container.classList.toggle('open');
  });

  container.querySelectorAll('.branch-option').forEach(option => {
    option.addEventListener('click', () => {
      input.value = option.dataset.value;
      label.textContent = option.dataset.name;
      container.querySelectorAll('.branch-option').forEach(o => o.classList.remove('selected'));
      option.classList.add('selected');
      container.classList.remove('open');
      if (typeof onChange === 'function') onChange(option.dataset.value);
    });
  });

  document.addEventListener('click', () => container.classList.remove('open'));
}