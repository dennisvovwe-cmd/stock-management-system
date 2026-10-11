const NAV_SECTIONS = [
  {
    items: [
      { label: 'Dashboard', href: '/dashboard.html', icon: '⊞' }
    ]
  },
  {
    label: 'Sales',
    items: [
      { label: 'New Sale', href: '/checkout.html', icon: '🧾' },
           { label: 'Sales Records', href: '/sales-records.html', icon: '📒', roles: ['accountant', 'admin'] },
      { label: 'Credit', href: '/credit.html', icon: '💳' }
    ]
  },
  {
    label: 'Inventory & Stock',
    items: [
      { label: 'Products', href: '/products.html', icon: '📦' },
      { label: 'Adjust Stock', href: '/stock-adjust.html', icon: '↕' }
    ]
  },
  {
    label: 'Report',
    items: [
      { label: 'Reports', href: '/reports.html', icon: '📊' }
    ]
  },
  {
    label: 'Shop Management',
    items: [
      { label: 'Staff', href: '/staff.html', icon: '👤', roles: ['accountant', 'admin'] },
      { label: 'Approvals', href: '/admin-request.html', icon: '✓', roles: ['admin'] },
      { label: 'All Users', href: '/all-users.html', icon: '👥', roles: ['admin'] }
    ]
  }
];

function renderSidebar() {
  const role = localStorage.getItem('role');
  const currentPath = window.location.pathname;

  let html = `<img src="ChatGPT Image Sep 22, 2026, 10_04_10 PM 1.svg" alt="Ejisco" class="logo">`;

  NAV_SECTIONS.forEach(section => {
    const visibleItems = section.items.filter(item => !item.roles || item.roles.includes(role));
    if (visibleItems.length === 0) return;

    if (section.label) {
      html += `<div class="nav-section-label">${section.label}</div>`;
    }
    visibleItems.forEach(item => {
      const isActive = currentPath === item.href;
      html += `<a href="${item.href}" class="nav-item${isActive ? ' active' : ''}">
        <span class="icon">${item.icon}</span>${item.label}
      </a>`;
    });
  });

  document.getElementById('sidebarRoot').innerHTML = html;
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

function renderTopbar(pageTitle) {
  const name = localStorage.getItem('name') || '';
  const role = localStorage.getItem('role') || '';

  document.getElementById('topbarRoot').innerHTML = `
    <div class="page-title">${pageTitle || ''}</div>
    <div class="user-box">
      <div class="user-identity">
        <div class="user-avatar">${getInitials(name)}</div>
        <div class="user-text">
          <span class="user-name">${name}</span>
          <span class="user-role">${role}</span>
        </div>
      </div>
      <button class="logout" onclick="logout()">Log Out</button>
    </div>
  `;
}
function logout() {
  localStorage.clear();
  window.location.href = '/login.html';
}

function initLayout(pageTitle) {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login.html';
    return;
  }
  renderSidebar();
  renderTopbar(pageTitle);
}