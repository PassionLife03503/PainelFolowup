// Supabase Configuration
const SUPABASE_URL = 'https://lupecrnrdhvuqbvmmxdc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1cGVjcm5yZGh2dXFidm1teGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMzU1MTAsImV4cCI6MjA4NTcxMTUxMH0.zxegyFwBNaTB1QaxWXwzo1WNGpnOafGPL6Zk7TeksnY'; // Insira aqui a sua chave Anon (PublicKey)
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// App State
let leadsData = [];
let charts = {};
let currentPage = 1;
let itemsPerPage = 10;
let filteredData = []; // Store filtered data to make pagination easier

// DOM Elements
const excelUpload = document.getElementById('excel-upload');
const tableBody = document.getElementById('leads-table-body');
const searchInput = document.getElementById('search-input');
const statusFilter = document.getElementById('status-filter');
const actionFilter = document.getElementById('action-filter');
const countNovos = document.getElementById('count-novos');
const countConversa = document.getElementById('count-conversa');
const countReativados = document.getElementById('count-reativados');
const countFechados = document.getElementById('count-fechados');
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.content-section');
const clientModal = document.getElementById('client-modal');
const closeModalBtn = document.getElementById('close-modal');
const saveClientBtn = document.getElementById('save-client-data');
const actionTags = document.querySelectorAll('.action-tag');
const mobileToggle = document.getElementById('mobile-menu-toggle');
const sidebar = document.querySelector('.sidebar');
const pageSizeSelect = document.getElementById('page-size');
const paginationControls = document.getElementById('pagination-controls');
const tableInfo = document.getElementById('table-info');
const contactedTableBody = document.getElementById('contacted-table-body');
const contactedSearchInput = document.getElementById('contacted-search-input');
let selectedClientId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();

    // Try to load cached data
    const cachedData = localStorage.getItem('passionpro_leads');
    if (cachedData) {
        try {
            leadsData = JSON.parse(cachedData);
            filteredData = [...leadsData];
            updateFilterOptions();
            updateStats();
            renderTable();
        } catch (e) {
            console.error('Erro ao carregar cache:', e);
            localStorage.removeItem('passionpro_leads');
        }
    }

    setupEventListeners();
    initTheme();
    initCharts();

    if (leadsData.length > 0) {
        updateCharts();
    }
});

function setupEventListeners() {
    // Modal
    closeModalBtn.addEventListener('click', closeClientModal);

    // Close on click outside
    clientModal.addEventListener('click', (e) => {
        if (e.target === clientModal) closeClientModal();
    });

    // Action Tags Selection
    actionTags.forEach(tag => {
        tag.addEventListener('click', () => {
            actionTags.forEach(t => t.classList.remove('selected'));
            tag.classList.add('selected');
        });
    });

    // Save Client Data
    saveClientBtn.addEventListener('click', async () => {
        const selectedTag = document.querySelector('.action-tag.selected');
        const description = document.getElementById('modal-action-desc').value;
        const nextActionDate = document.getElementById('modal-next-action-date').value; // Get Date
        const actionText = selectedTag ? selectedTag.getAttribute('data-action') : '';

        const leadIndex = leadsData.findIndex(l => l.id === selectedClientId);
        if (leadIndex !== -1) {
            const updatedLead = {
                ...leadsData[leadIndex],
                lastAction: actionText,
                details: description,
                nextActionDate: nextActionDate // Save Date
            };
            leadsData[leadIndex] = updatedLead;

            // Save & Update
            localStorage.setItem('passionpro_leads', JSON.stringify(leadsData));

            // Sync with Supabase (Background)
            saveLeadToSupabase(updatedLead);
            logActionToSupabase(selectedClientId, actionText, description);

            updatedLead.lastActionDate = Date.now(); // Update interaction time

            // Increment contact count for goals tracking
            if (actionText) {
                await incrementContactCount();
            }

            filteredData = filterLeads(); // Keep current filters
            renderTable();
            updateInsights(); // Refresh alerts
            closeClientModal();
            showNotification('Ação registrada na nuvem!', 'success');
        }
    });

    // Mobile Toggle
    mobileToggle.addEventListener('click', () => {
        sidebar.classList.toggle('active');
        const icon = mobileToggle.querySelector('i');
        if (sidebar.classList.contains('active')) {
            icon.setAttribute('data-lucide', 'x');
        } else {
            icon.setAttribute('data-lucide', 'menu');
        }
        lucide.createIcons();
    });

    // Navigation
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetSection = item.getAttribute('data-section');
            switchSection(targetSection);
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('active');
                mobileToggle.querySelector('i').setAttribute('data-lucide', 'menu');
                lucide.createIcons();
            }
        });
    });

    // File Upload
    excelUpload.addEventListener('change', handleFileUpload);

    // Search & Filter
    searchInput.addEventListener('input', () => {
        currentPage = 1;
        filteredData = filterLeads();
        renderTable();
    });

    statusFilter.addEventListener('change', () => {
        currentPage = 1;
        filteredData = filterLeads();
        renderTable();
    });

    actionFilter.addEventListener('change', () => {
        currentPage = 1;
        filteredData = filterLeads();
        renderTable();
    });

    // Clear Data
    const clearDataBtn = document.getElementById('clear-data');
    clearDataBtn.addEventListener('click', () => {
        if (leadsData.length === 0) {
            showNotification('Não há dados para remover.', 'error');
            return;
        }

        if (confirm('Tem certeza que deseja remover todos os dados da planilha carregada?')) {
            localStorage.removeItem('passionpro_leads');
            leadsData = [];
            filteredData = [];
            currentPage = 1;

            updateFilterOptions();
            updateStats();
            renderTable();
            showNotification('Dados removidos com sucesso!', 'success');
        }
    });

    // Page Size
    pageSizeSelect.addEventListener('change', (e) => {
        itemsPerPage = parseInt(e.target.value);
        currentPage = 1;
        renderTable();
    });

    // Contacted Search
    contactedSearchInput.addEventListener('input', () => {
        renderContactedTable();
    });

    // Login Form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }

    // Logout
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // Register Form
    const registerForm = document.getElementById('register-form');
    if (registerForm) {
        registerForm.addEventListener('submit', handleRegister);
    }

    // Theme Toggle
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', toggleTheme);
    }

    // Profile Edit Form
    const profileForm = document.getElementById('profile-edit-form');
    if (profileForm) {
        profileForm.addEventListener('submit', handleProfileUpdate);
    }

    // Add Client Button
    const addClientBtn = document.getElementById('btn-add-client');
    if (addClientBtn) {
        addClientBtn.addEventListener('click', openAddClientModal);
    }

    // Add Client Form
    const addClientForm = document.getElementById('add-client-form');
    if (addClientForm) {
        addClientForm.addEventListener('submit', handleAddClient);
    }

    // Edit Client Button
    const editClientBtn = document.getElementById('btn-edit-client');
    if (editClientBtn) {
        editClientBtn.addEventListener('click', toggleEditClientMode);
    }

    // Profile Photo Upload
    const photoInput = document.getElementById('profile-photo-input');
    if (photoInput) {
        photoInput.addEventListener('change', handlePhotoUpload);
    }

    const removePhotoBtn = document.getElementById('remove-photo-btn');
    if (removePhotoBtn) {
        removePhotoBtn.addEventListener('click', removeProfilePhoto);
    }
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet);

        leadsData = processLeadsData(rawData);
        filteredData = [...leadsData];

        localStorage.setItem('passionpro_leads', JSON.stringify(leadsData));

        // Sync with Supabase (Upload all)
        leadsData.forEach(async (lead) => {
            await saveLeadToSupabase(lead);
        });

        updateFilterOptions();
        updateStats();
        currentPage = 1;
        renderTable();
        showNotification('Planilha importada e sincronizada!', 'success');
    };
    reader.readAsArrayBuffer(file);
}

function processLeadsData(data) {
    return data.map((item, index) => {
        let rawPhone = item['TEL CELULAR'] || item['Telefone'] || '';
        // Limpa o telefone para usar como ID numérico estável
        const phoneId = rawPhone.toString().replace(/\D/g, '');

        return {
            id: phoneId ? parseInt(phoneId) : (Date.now() + index),
            nome: item['NOME DO CLIENTE'] || item['Nome'] || 'N/A',
            dataCadastro: (item['DATA DE CADASTRO'] instanceof Date)
                ? item['DATA DE CADASTRO'].toLocaleDateString('pt-BR')
                : (item['DATA DE CADASTRO'] || item['Data'] || new Date().toLocaleDateString('pt-BR')),
            status: (item['TIPO DE CLIENTE'] || 'Lead').toUpperCase(),
            proximaAcao: 'Analisar perfil para reativação',
            telefone: rawPhone,
            lastAction: '', // Chamei e não respondeu, etc.
            lastActionDate: (item['DATA DE CADASTRO'] instanceof Date) ? item['DATA DE CADASTRO'].getTime() : Date.now(),
            details: '',     // Descrição detalhada
            lastActionDate: (item['DATA DE CADASTRO'] instanceof Date) ? item['DATA DE CADASTRO'].getTime() : Date.now(),
            details: '',     // Descrição detalhada
            isMessaged: false, // Novo: rastreia se o WhatsApp foi clicado
            nextActionDate: null // Data da próxima ação
        };
    });
}

function getNextActionStatus(dateString) {
    if (!dateString) return 'none';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Fix: Handle timezone offset to avoid "off-by-one-day" errors
    const actionDate = new Date(dateString + 'T00:00:00');

    const diffTime = actionDate - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'delayed';
    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'tomorrow';
    return 'future';
}

function formatDateBr(dateString) {
    if (!dateString) return '';
    const part = dateString.split('-');
    return `${part[2]}/${part[1]}`;
}

function updateFilterOptions() {
    const uniqueStatuses = [...new Set(leadsData.map(l => l.status))];
    const currentFilter = statusFilter.value;
    statusFilter.innerHTML = '<option value="all">Todos os Tipos</option>';
    uniqueStatuses.forEach(status => {
        const option = document.createElement('option');
        option.value = status;
        option.textContent = status;
        statusFilter.appendChild(option);
    });
    statusFilter.value = currentFilter;
}

function filterLeads() {
    const searchTerm = searchInput.value.toLowerCase();
    const filterValue = statusFilter.value;
    const actionValue = actionFilter ? actionFilter.value : 'all';

    return leadsData.filter(lead => {
        const matchesSearch = lead.nome.toLowerCase().includes(searchTerm);
        const matchesFilter = filterValue === 'all' || lead.status === filterValue;

        // Action filter logic
        let matchesAction = true;
        if (actionValue !== 'all') {
            if (actionValue === 'sem-acao') {
                matchesAction = !lead.lastAction || lead.lastAction.trim() === '';
            } else {
                matchesAction = lead.lastAction === actionValue;
            }
        }

        return matchesSearch && matchesFilter && matchesAction;
    });
}

function renderTable() {
    const totalItems = filteredData.length;
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
    const pageData = filteredData.slice(startIndex, endIndex);

    if (totalItems === 0) {
        tableBody.innerHTML = `
            <tr class="empty-state">
                <td colspan="5">
                    <div class="empty-content">
                        <i data-lucide="search-slash"></i>
                        <p>${leadsData.length === 0 ? 'Nenhum dado importado.' : 'Nenhum resultado encontrado.'}</p>
                    </div>
                </td>
            </tr>
        `;
        tableInfo.textContent = 'Mostrando 0 de 0 leads';
        paginationControls.innerHTML = '';
        lucide.createIcons();
        return;
    }

    tableBody.innerHTML = pageData.map(lead => {
        const actionStatus = getNextActionStatus(lead.nextActionDate);
        let actionBadge = '';

        if (actionStatus === 'delayed') {
            actionBadge = `<div class="next-action-badge action-delayed" title="Atrasado"><i data-lucide="alert-triangle" style="width:14px;height:14px;"></i> ${formatDateBr(lead.nextActionDate)}</div>`;
        } else if (actionStatus === 'today') {
            actionBadge = `<div class="next-action-badge action-today" title="Hoje"><i data-lucide="flame" style="width:14px;height:14px;"></i> Hoje</div>`;
        } else if (actionStatus === 'tomorrow') {
            actionBadge = `<div class="next-action-badge action-tomorrow" title="Amanhã"><i data-lucide="hourglass" style="width:14px;height:14px;"></i> Amanhã</div>`;
        } else if (lead.nextActionDate) {
            actionBadge = `<span style="font-size: 0.8rem; color: var(--text-muted);">${formatDateBr(lead.nextActionDate)}</span>`;
        }

        return `
        <tr class="fade-in ${isInactive(lead) ? 'row-alert' : ''}" data-client-id="${lead.id}" onclick="openClientModal(${lead.id})">
            <td>
                <input type="checkbox" class="manual-check" 
                    ${lead.isMessaged ? 'checked' : ''} 
                    onclick="toggleMessaged(event, ${lead.id})">
            </td>
            <td>
                <div style="font-weight: 600;">${lead.nome}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${lead.telefone || 'Sem telefone'}</div>
            </td>
            <td>${lead.dataCadastro}</td>
            <td>
                <span class="status-badge ${getStatusClass(lead.status)}">
                    ${lead.status}
                </span>
            </td>
            <td>
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <div style="max-width: 250px; font-size: 0.9rem;">
                        ${lead.lastAction ? `<strong>${lead.lastAction}</strong>` : lead.proximaAcao}
                    </div>
                    ${actionBadge}
                </div>
            </td>
            <td class="text-right">
                <a href="${generateWhatsAppLink(lead.telefone, lead.nome)}" target="_blank" class="btn-whatsapp" onclick="event.stopPropagation()">
                   <i data-lucide="message-square"></i> WhatsApp
                </a>
            </td>
        </tr>
    `}).join('');

    tableInfo.textContent = `Mostrando ${startIndex + 1} a ${endIndex} de ${totalItems} leads`;
    renderPagination(totalItems);
    renderUrgentTasks(); // Update Urgent Tasks Here
    lucide.createIcons();
}

function renderUrgentTasks() {
    const container = document.getElementById('urgent-tasks-area');
    const grid = document.getElementById('urgent-tasks-grid');

    // Filter for Today and Delayed
    const urgentLeads = leadsData.filter(lead => {
        const status = getNextActionStatus(lead.nextActionDate);
        return status === 'today' || status === 'delayed';
    });

    // Sort: Delayed first, then Today
    urgentLeads.sort((a, b) => {
        const statA = getNextActionStatus(a.nextActionDate);
        const statB = getNextActionStatus(b.nextActionDate);
        if (statA === 'delayed' && statB !== 'delayed') return -1;
        if (statA !== 'delayed' && statB === 'delayed') return 1;
        return 0;
    });

    if (urgentLeads.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';

    // Limit to top 4 cards to not overwhelm
    const displayLeads = urgentLeads.slice(0, 4);

    grid.innerHTML = displayLeads.map(lead => {
        const status = getNextActionStatus(lead.nextActionDate);
        const isDelayed = status === 'delayed';
        const badgeClass = isDelayed ? 'action-delayed' : 'action-today';
        const icon = isDelayed ? 'alert-triangle' : 'flame';
        const label = isDelayed ? 'Atrasado' : 'Para Hoje';

        return `
        <div class="urgent-card fade-in" onclick="openClientModal(${lead.id})">
            <div class="urgent-card-header">
                <span class="urgent-card-name">${lead.nome}</span>
                <span class="status-badge ${getStatusClass(lead.status)}" style="font-size: 0.7rem;">${lead.status}</span>
            </div>
            <div class="urgent-card-action">
                <i data-lucide="${icon}" style="width: 16px; height: 16px;"></i>
                <span>${label} (${formatDateBr(lead.nextActionDate)})</span>
            </div>
            <p style="font-size: 0.85rem; color: var(--text-muted); overflow: hidden; white-space: nowrap; text-overflow: ellipsis;">
                ${lead.lastAction || lead.proximaAcao}
            </p>
            <div class="urgent-card-actions">
                <a href="${generateWhatsAppLink(lead.telefone, lead.nome)}" target="_blank" class="btn-whatsapp" onclick="event.stopPropagation()" style="font-size: 0.8rem; padding: 0.4rem 0.8rem;">
                    <i data-lucide="message-square" style="width: 14px; height: 14px;"></i> Chamar
                </a>
            </div>
        </div>
        `;
    }).join('');
}

function renderPagination(totalItems) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) {
        paginationControls.innerHTML = '';
        return;
    }

    let html = '';

    // Previous Arrow
    html += `<button class="pagination-btn ${currentPage === 1 ? 'disabled' : ''}" onclick="changePage(${currentPage - 1})">
        <i data-lucide="chevron-left"></i>
    </button>`;

    // Page Numbers
    const maxVisible = 5;
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);

    if (endPage - startPage < maxVisible - 1) {
        startPage = Math.max(1, endPage - maxVisible + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
        html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
    }

    // Next Arrow
    html += `<button class="pagination-btn ${currentPage === totalPages ? 'disabled' : ''}" onclick="changePage(${currentPage + 1})">
        <i data-lucide="chevron-right"></i>
    </button>`;

    paginationControls.innerHTML = html;
    lucide.createIcons();
}

window.changePage = function (page) {
    const totalPages = Math.ceil(filteredData.length / itemsPerPage);
    if (page < 1 || page > totalPages) return;
    currentPage = page;
    renderTable();
    // Scroll to top of table
    document.querySelector('.table-container').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function getStatusClass(status) {
    const s = status.toUpperCase();
    if (s.includes('REVENDEDOR')) return 'status-novo';
    if (s.includes('LOJISTA')) return 'status-conversa';
    if (s.includes('USO PRÓPRIO')) return 'status-antigo';
    if (s.includes('CIDADE EXCLUSIVA')) return 'status-fechado';
    return 'status-antigo';
}

function generateWhatsAppLink(phone, name) {
    if (!phone) return '#';
    let cleanPhone = phone.toString().replace(/\D/g, '');
    if (cleanPhone.length === 10 || cleanPhone.length === 11) cleanPhone = '55' + cleanPhone;

    // Pega apenas o primeiro nome
    const firstName = name.split(' ')[0];

    const message = encodeURIComponent(`Olá ${firstName}, tudo bem? Sou da PassionPro e estou entrando em contato para conversarmos sobre novos modelos!`);
    return `https://wa.me/${cleanPhone}?text=${message}`;
}

function updateStats() {
    countNovos.textContent = leadsData.filter(l => l.status.includes('REVENDEDOR')).length;
    countConversa.textContent = leadsData.filter(l => l.status.includes('LOJISTA')).length;
    countReativados.textContent = leadsData.filter(l => l.status.includes('EXCLUSIVA')).length;
    countFechados.textContent = leadsData.filter(l => l.status.includes('USO')).length;
    updateCharts();
    updateInsights();
}

// Active Stat Card Filter
let activeStatFilter = null;

window.filterByStatCard = function (element) {
    const filterValue = element.getAttribute('data-filter');
    const allCards = document.querySelectorAll('.stat-filter');

    // If clicking the same card, clear the filter
    if (activeStatFilter === filterValue) {
        activeStatFilter = null;
        allCards.forEach(card => card.classList.remove('stat-active'));

        // Reset to show all leads
        statusFilter.value = 'all';
        filteredData = filterLeads();
        currentPage = 1;
        renderTable();
        showNotification('Filtro removido - mostrando todos', 'success');
        return;
    }

    // Set new filter
    activeStatFilter = filterValue;

    // Visual feedback - highlight selected card
    allCards.forEach(card => card.classList.remove('stat-active'));
    element.classList.add('stat-active');

    // Filter leads by the selected type
    filteredData = leadsData.filter(lead => {
        return lead.status.toUpperCase().includes(filterValue);
    });

    currentPage = 1;
    renderTable();

    // Show notification
    const count = filteredData.length;
    const label = element.querySelector('.stat-label').textContent;
    showNotification(`Filtrando por ${label}: ${count} leads`, 'success');
}

function updateInsights() {
    const inactiveBadge = document.getElementById('inactive-badge');
    const inactiveCountText = document.getElementById('inactive-count-text');

    const fifteenDaysAgo = Date.now() - (15 * 24 * 60 * 60 * 1000);

    // Filtra leads parados há mais de 15 dias
    const inactiveLeads = leadsData.filter(lead => {
        const interactionDate = lead.lastActionDate || 0;
        return interactionDate < fifteenDaysAgo;
    });

    if (inactiveLeads.length > 0) {
        if (inactiveBadge) inactiveBadge.style.display = 'block';
        if (inactiveCountText) inactiveCountText.textContent = `${inactiveLeads.length} clientes parados há 15 dias`;
    } else {
        if (inactiveBadge) inactiveBadge.style.display = 'none';
    }
}

window.filterInactiveLeads = function () {
    const fifteenDaysAgo = Date.now() - (15 * 24 * 60 * 60 * 1000);
    filteredData = leadsData.filter(lead => {
        const interactionDate = lead.lastActionDate || 0;
        return interactionDate < fifteenDaysAgo;
    });
    currentPage = 1;
    renderTable();
    showNotification(`Mostrando ${filteredData.length} clientes inativos`, 'success');
};

function switchSection(sectionId) {
    navItems.forEach(nav => nav.classList.toggle('active', nav.getAttribute('data-section') === sectionId));
    sections.forEach(section => section.classList.toggle('active', section.id === `section-${sectionId}`));

    if (sectionId === 'contacted') {
        renderContactedTable();
    }

    if (sectionId === 'settings') {
        populateProfileForm();
    }

    if (sectionId === 'reports' && charts.status) {
        setTimeout(() => {
            charts.status.resize();
            charts.trend.resize();
        }, 100);
    }

    if (sectionId === 'admin-dashboard') {
        loadAdminData();
    }
}

function initCharts() {
    const ctxStatus = document.getElementById('statusDistributionChart').getContext('2d');
    const ctxTrend = document.getElementById('conversionTrendChart').getContext('2d');
    Chart.defaults.color = '#b8a89a';
    Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif";
    charts.status = new Chart(ctxStatus, {
        type: 'doughnut',
        data: {
            labels: ['Revendedor', 'Lojista', 'Cidade Exclusiva', 'Uso Próprio'],
            datasets: [{
                data: [0, 0, 0, 0],
                backgroundColor: ['#3b82f6', '#f59e0b', '#8b5cf6', '#64748b'],
                borderWidth: 0,
                hoverOffset: 15
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { padding: 20 } } },
            cutout: '70%'
        }
    });
    charts.trend = new Chart(ctxTrend, {
        type: 'line',
        data: {
            labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
            datasets: [{
                label: 'Interações',
                data: [12, 19, 15, 25, 22, 30],
                borderColor: '#819a9a',
                backgroundColor: 'rgba(129, 154, 154, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#819a9a'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { grid: { display: false } }
            },
            plugins: { legend: { display: false } }
        }
    });
}

function updateCharts() {
    if (!charts.status) return;
    const statusCounts = [
        leadsData.filter(l => l.status.includes('REVENDEDOR')).length,
        leadsData.filter(l => l.status.includes('LOJISTA')).length,
        leadsData.filter(l => l.status.includes('EXCLUSIVA')).length,
        leadsData.filter(l => l.status.includes('USO')).length
    ];
    charts.status.data.datasets[0].data = statusCounts;
    charts.status.update();
}

function openClientModal(clientId) {
    const lead = leadsData.find(l => l.id === clientId);
    if (!lead) return;

    selectedClientId = clientId;

    // Fill Modal Data
    document.getElementById('modal-client-name').textContent = lead.nome;
    document.getElementById('modal-client-phone').textContent = lead.telefone || 'N/A';
    document.getElementById('modal-client-date').textContent = lead.dataCadastro;

    const typeBadge = document.getElementById('modal-client-type');
    typeBadge.textContent = lead.status;
    typeBadge.className = `status-badge ${getStatusClass(lead.status)}`;

    // Reset Tags & Description
    actionTags.forEach(tag => {
        tag.classList.toggle('selected', tag.getAttribute('data-action') === lead.lastAction);
    });
    document.getElementById('modal-action-desc').value = lead.details || '';

    // Preenche campos de visualização
    document.getElementById('modal-client-name-display').textContent = lead.nome;
    document.getElementById('modal-client-email').textContent = lead.email || 'Não informado';

    // Populate Next Action Date Input
    const dateInput = document.getElementById('modal-next-action-date');
    if (lead.nextActionDate) {
        dateInput.value = lead.nextActionDate;
    } else {
        // Default to Today if not set
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
    }

    // Modo de visualização ativo por padrão
    document.getElementById('client-view-mode').style.display = 'block';
    document.getElementById('client-edit-mode').style.display = 'none';

    clientModal.classList.add('active');
}

function closeClientModal() {
    clientModal.classList.remove('active');
    selectedClientId = null;
}

function showNotification(message, type = 'success') {
    const toast = document.getElementById('notification-toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = 'toast'; }, 3000);
}

function renderContactedTable() {
    const searchTerm = contactedSearchInput.value.toLowerCase();

    // Filtra apenas clientes que tiveram ação registrada ou receberam mensagem
    const contactedLeads = leadsData.filter(lead => {
        const hasInteraction = lead.lastAction !== '' || lead.isMessaged;
        const matchesSearch = lead.nome.toLowerCase().includes(searchTerm);
        return hasInteraction && matchesSearch;
    });

    if (contactedLeads.length === 0) {
        contactedTableBody.innerHTML = `
            <tr class="empty-state">
                <td colspan="4">
                    <div class="empty-content">
                        <i data-lucide="message-square-dashed"></i>
                        <p>${searchTerm ? 'Nenhum resultado para esta busca.' : 'Nenhum contato realizado ainda.'}</p>
                    </div>
                </td>
            </tr>
        `;
        lucide.createIcons();
        return;
    }

    contactedTableBody.innerHTML = contactedLeads.map(lead => `
        <tr class="fade-in" onclick="openClientModal(${lead.id})">
            <td>
                <input type="checkbox" class="manual-check" 
                    ${lead.isMessaged ? 'checked' : ''} 
                    onclick="toggleMessaged(event, ${lead.id})">
            </td>
            <td>
                <div style="font-weight: 600;">${lead.nome}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${lead.telefone || 'Sem telefone'}</div>
            </td>
            <td>
                <span class="status-badge ${getStatusClass(lead.status)}">
                    ${lead.status}
                </span>
            </td>
            <td>
                <div style="font-size: 0.9rem;">
                    <strong>${lead.lastAction || (lead.isMessaged ? 'Mensagem Enviada' : 'N/A')}</strong>
                    ${lead.details ? `<br><small style="color: var(--text-muted)">${lead.details.substring(0, 40)}...</small>` : ''}
                </div>
            </td>
            <td class="text-right">
                <a href="${generateWhatsAppLink(lead.telefone, lead.nome)}" target="_blank" class="btn-whatsapp" onclick="event.stopPropagation()">
                   <i data-lucide="message-square"></i> WhatsApp
                </a>
            </td>
        </tr>
    `).join('');
    lucide.createIcons();
}

// Alterna o status de mensagem manual
window.toggleMessaged = async function (event, clientId) {
    event.stopPropagation(); // Não abrir o modal ao clicar no checkbox
    const leadIndex = leadsData.findIndex(l => l.id === clientId);
    if (leadIndex !== -1) {
        leadsData[leadIndex].isMessaged = !leadsData[leadIndex].isMessaged;
        const updatedLead = leadsData[leadIndex];

        localStorage.setItem('passionpro_leads', JSON.stringify(leadsData));

        // Sync with Supabase
        saveLeadToSupabase(updatedLead);
        if (updatedLead.isMessaged) {
            logActionToSupabase(clientId, 'Mensagem Enviada', 'Marcado manualmente');
        }

        // Se estiver na aba de contatados e desmarcar, atualiza a lista
        if (document.getElementById('section-contacted').classList.contains('active')) {
            renderContactedTable();
        } else {
            renderTable();
        }
    }
}

// --- AUTHENTICATION SYSTEM ---

// --- AUTHENTICATION SYSTEM ---

window.switchLoginTab = function (tab) {
    const flipper = document.getElementById('login-flipper');
    if (tab === 'register') {
        flipper.classList.add('flipped');
    } else {
        flipper.classList.remove('flipped');
    }
}

function checkAuth() {
    _supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
            loadProfileAndShowApp(session.user);
        } else {
            showLogin();
        }
    });

    _supabase.auth.onAuthStateChange((_event, session) => {
        if (!session) showLogin();
    });
}

async function loadProfileAndShowApp(authUser) {
    try {
        console.log('Buscando perfil para:', authUser.id); // Debug

        // Busca o perfil na tabela unificada 'cadastros'
        const { data: profile, error } = await _supabase
            .from('cadastros')
            .select('*')
            .eq('id', authUser.id)
            .maybeSingle();

        if (error) {
            alert('Erro de Banco de Dados: ' + error.message);
            console.error(error);
            return;
        }

        if (!profile) {
            alert('Perfil não encontrado na tabela cadastros! ID: ' + authUser.id);
            console.error('Perfil não encontrado em cadastros');
            await _supabase.auth.signOut();
            showLogin();
            return;
        }

        console.log('Perfil carregado:', profile); // Debug

        // Se for admin, o campo 'role' no banco deve ser 'admin'. 
        // Se for vendedora, será 'vendedora'.
        localStorage.setItem('passionpro_session', JSON.stringify(profile));
        showApp(profile);
        loadLeadsFromSupabase();
    } catch (e) {
        alert('Erro Fatal ao carregar perfil: ' + e.message);
        console.error('Erro ao carregar perfil:', e);
        showLogin();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    console.log("handleLogin triggered");

    const email = document.getElementById('login-identifier').value.toLowerCase();
    const password = document.getElementById('login-password').value;
    const errorMsg = document.getElementById('login-error');

    try {
        const { data, error } = await _supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            console.log('Login falhou, tentando migrar usuário antigo...');
            const migrated = await migrateOldUser(email, password);

            if (migrated) {
                const { data: retryData, error: retryError } = await _supabase.auth.signInWithPassword({
                    email: email,
                    password: password,
                });

                if (retryError) {
                    errorMsg.textContent = "Erro ao fazer login após migração";
                    errorMsg.classList.add('active');
                    return;
                }

                errorMsg.classList.remove('active');
                loadProfileAndShowApp(retryData.user);
                showNotification('Conta migrada com sucesso!', 'success');
                return;
            }

            errorMsg.textContent = translateAuthError(error.message);
            errorMsg.classList.add('active');
            return;
        }

        errorMsg.classList.remove('active');
        loadProfileAndShowApp(data.user);
    } catch (e) {
        console.error('Erro no login:', e);
        errorMsg.textContent = "Erro ao fazer login: " + e.message;
        errorMsg.classList.add('active');
    }
}

function translateAuthError(message) {
    if (message.includes("Invalid login credentials")) return "E-mail ou senha inválidos.";
    if (message.includes("Email not confirmed")) return "E-mail não confirmado. Verifique sua caixa de entrada.";
    if (message.includes("User not found")) return "Usuário não encontrado. Crie uma conta primeiro.";
    return message;
}

// Função para migrar usuários antigos do sistema legado
async function migrateOldUser(email, password) {
    try {
        const { data: oldUser, error: searchError } = await _supabase
            .from('cadastros')
            .select('*')
            .eq('email', email)
            .maybeSingle();

        if (searchError || !oldUser) return false;
        if (oldUser.password !== password) return false;

        const { data: newAuthUser, error: signUpError } = await _supabase.auth.signUp({
            email: email,
            password: password,
        });

        if (signUpError) return false;

        const { error: updateError } = await _supabase
            .from('cadastros')
            .update({
                id: newAuthUser.user.id,
                password: null
            })
            .eq('email', email);

        return true;
    } catch (e) {
        return false;
    }
}

window.handleRegister = async function (e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value.toLowerCase();
    const password = document.getElementById('reg-password').value;
    const phone = document.getElementById('reg-phone').value;
    const successMsg = document.getElementById('reg-success');

    try {
        const { data, error } = await _supabase.auth.signUp({
            email: email,
            password: password,
        });

        if (error) throw error;

        if (data.user) {
            const { error: profileError } = await _supabase
                .from('cadastros')
                .insert([{
                    id: data.user.id,
                    name,
                    email,
                    phone,
                    role: 'vendedora' // Padrão
                }]);

            if (profileError) throw profileError;
        }

        successMsg.style.display = 'block';
        setTimeout(() => {
            switchLoginTab('login');
            successMsg.style.display = 'none';
        }, 2000);
    } catch (e) {
        alert('Erro ao cadastrar: ' + e.message);
    }
}

function showApp(user) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';

    document.getElementById('display-user-name').textContent = user.name;
    document.getElementById('display-user-role').textContent = user.role.toUpperCase();

    // Atualiza avatar com foto ou iniciais
    const avatarEl = document.getElementById('display-user-avatar');
    if (user.avatar_url) {
        avatarEl.style.backgroundImage = `url(${user.avatar_url})`;
        avatarEl.style.backgroundSize = 'cover';
        avatarEl.style.backgroundPosition = 'center';
        avatarEl.textContent = '';
    } else {
        avatarEl.style.backgroundImage = 'none';
        avatarEl.textContent = user.name.substring(0, 2).toUpperCase();
    }

    applyRolePermissions(user.role);
    updateGoalsUI(); // Update goals progress
    lucide.createIcons();
}

function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
}

function applyRolePermissions(role) {
    const clearDataBtn = document.getElementById('clear-data');
    const navAdmin = document.getElementById('nav-admin');
    const navContacted = document.querySelector('[data-section="contacted"]');
    const reportsSection = document.querySelector('[data-section="reports"]');

    if (role === 'vendedora') {
        if (clearDataBtn) clearDataBtn.style.display = 'none';
        if (navAdmin) navAdmin.style.display = 'none';
        if (navContacted) navContacted.style.display = 'flex';
    } else if (role === 'admin') {
        if (clearDataBtn) clearDataBtn.style.display = 'flex';
        if (navAdmin) navAdmin.style.display = 'flex';
        if (navContacted) navContacted.style.display = 'none'; // Admin não vê contatados
    } else {
        if (clearDataBtn) clearDataBtn.style.display = 'flex';
        if (navContacted) navContacted.style.display = 'flex';
    }
}

async function logout() {
    if (confirm('Deseja realmente sair do sistema?')) {
        await _supabase.auth.signOut();
        localStorage.removeItem('passionpro_session');
        location.reload();
    }
}

// --- SUPABASE DATA MANAGEMENT ---

async function loadLeadsFromSupabase() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;

    try {
        const { data, error } = await _supabase
            .from('leads_followup')
            .select('*')
            .order('id', { ascending: false });

        leadsData = data || [];
        filteredData = [...leadsData];

        // Atualiza status visual
        document.getElementById('db-status-dot').style.background = '#10b981';
        document.getElementById('db-status-text').textContent = 'Nuvem Online';

        updateFilterOptions();
        updateStats();
        renderTable();
    } catch (e) {
        console.error('Erro ao carregar leads da nuvem:', e.message);
        document.getElementById('db-status-dot').style.background = '#ef4444';
        document.getElementById('db-status-text').textContent = 'Erro na Nuvem';
    }
}

async function saveLeadToSupabase(lead) {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;

    try {
        // Vincula o lead à vendedora antes de salvar
        const leadToSync = { ...lead, vendedora_id: session.user.id };

        const { error } = await _supabase
            .from('leads_followup')
            .upsert([leadToSync]);

        if (error) throw error;
    } catch (e) {
        console.error('Erro ao salvar lead na nuvem:', e.message);
    }
}

async function logActionToSupabase(clientId, action, details) {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) return;

    const profile = JSON.parse(localStorage.getItem('passionpro_session'));

    try {
        const { error } = await _supabase
            .from('logs_acoes')
            .insert([{
                vendedora_id: session.user.id,
                vendedora_nome: profile?.name || 'Usuário',
                client_id: clientId,
                acao: action,
                detalhes: details,
                data_hora: new Date().toISOString()
            }]);

        if (error) throw error;
    } catch (e) {
        console.error('Erro ao logar ação na nuvem:', e.message);
    }
}

// --- THEME MANAGEMENT ---

function initTheme() {
    const savedTheme = localStorage.getItem('passionpro_theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-theme');
        updateThemeUI('light');
    }
}

function toggleTheme() {
    const isLight = document.body.classList.toggle('light-theme');
    const theme = isLight ? 'light' : 'dark';
    localStorage.setItem('passionpro_theme', theme);
    updateThemeUI(theme);

    // Update charts with new theme colors
    updateChartsTheme();
}

function updateThemeUI(theme) {
    const icon = document.getElementById('theme-icon');
    const text = document.getElementById('theme-text');
    if (theme === 'light') {
        icon.setAttribute('data-lucide', 'sun');
        text.textContent = 'Modo Claro';
    } else {
        icon.setAttribute('data-lucide', 'moon');
        text.textContent = 'Modo Escuro';
    }
    lucide.createIcons();
}

function updateChartsTheme() {
    const isLight = document.body.classList.contains('light-theme');
    const textColor = isLight ? '#1d1d1f' : '#b8a89a';
    const accentColor = isLight ? '#000000' : '#819a9a';

    Chart.defaults.color = textColor;

    if (charts.status) {
        charts.status.options.plugins.legend.labels.color = textColor;
        charts.status.update();
    }

    if (charts.trend) {
        charts.trend.options.scales.x.ticks.color = textColor;
        charts.trend.options.scales.y.ticks.color = textColor;
        charts.trend.data.datasets[0].borderColor = accentColor;
        charts.trend.data.datasets[0].pointBackgroundColor = accentColor;
        charts.trend.update();
    }
}

function isInactive(lead) {
    const fifteenDaysAgo = Date.now() - (15 * 24 * 60 * 60 * 1000);
    return lead.lastActionDate < fifteenDaysAgo;
}

// --- ADD CLIENT MODAL ---

function openAddClientModal() {
    document.getElementById('add-client-modal').classList.add('active');
    lucide.createIcons();
}

window.closeAddClientModal = function () {
    document.getElementById('add-client-modal').classList.remove('active');
    document.getElementById('add-client-form').reset();
}

async function handleAddClient(e) {
    e.preventDefault();

    const name = document.getElementById('new-client-name').value;
    const phone = document.getElementById('new-client-phone').value;
    const email = document.getElementById('new-client-email').value;
    const status = document.getElementById('new-client-status').value;
    const notes = document.getElementById('new-client-notes').value;

    // Limpa o telefone para usar como ID
    const phoneId = phone.replace(/\D/g, '');

    const newLead = {
        id: phoneId ? parseInt(phoneId) : Date.now(),
        nome: name,
        telefone: phone,
        email: email || 'N/A',
        dataCadastro: new Date().toLocaleDateString('pt-BR'),
        status: status,
        proximaAcao: 'Primeiro contato',
        lastAction: notes || 'Cliente cadastrado manualmente',
        lastActionDate: Date.now(),
        details: notes || '',
        isMessaged: false,
        nextActionDate: new Date().toISOString().split('T')[0] // Default to today
    };

    // Adiciona ao array local
    leadsData.unshift(newLead);
    filteredData = filterLeads();

    // Salva no Supabase
    await saveLeadToSupabase(newLead);

    // Atualiza a UI
    updateFilterOptions();
    updateStats();
    renderTable();

    closeAddClientModal();
    showNotification(`Cliente ${name} cadastrado com sucesso!`, 'success');
}

// --- EDIT CLIENT ---

function toggleEditClientMode() {
    const viewMode = document.getElementById('client-view-mode');
    const editMode = document.getElementById('client-edit-mode');
    const lead = leadsData.find(l => l.id === selectedClientId);

    if (!lead) return;

    // Preenche os campos de edição
    document.getElementById('edit-client-name').value = lead.nome;
    document.getElementById('edit-client-phone').value = lead.telefone;
    document.getElementById('edit-client-email').value = lead.email === 'N/A' ? '' : lead.email;
    document.getElementById('edit-client-status').value = lead.status;

    // Alterna para modo de edição
    viewMode.style.display = 'none';
    editMode.style.display = 'block';
    lucide.createIcons();
}

window.cancelEditClient = function () {
    document.getElementById('client-view-mode').style.display = 'block';
    document.getElementById('client-edit-mode').style.display = 'none';
}

window.saveClientEdit = async function () {
    const lead = leadsData.find(l => l.id === selectedClientId);
    if (!lead) return;

    const newName = document.getElementById('edit-client-name').value;
    const newPhone = document.getElementById('edit-client-phone').value;
    const newEmail = document.getElementById('edit-client-email').value;
    const newStatus = document.getElementById('edit-client-status').value;

    // Atualiza o objeto
    lead.nome = newName;
    lead.telefone = newPhone;
    lead.email = newEmail || 'N/A';
    lead.status = newStatus;

    // Atualiza ID se o telefone mudou
    const newPhoneId = newPhone.replace(/\D/g, '');
    if (newPhoneId && newPhoneId !== lead.id.toString()) {
        const oldId = lead.id;
        lead.id = parseInt(newPhoneId);

        // Remove o antigo e adiciona com novo ID
        leadsData = leadsData.filter(l => l.id !== oldId);
        leadsData.push(lead);
    }

    // Salva no Supabase
    await saveLeadToSupabase(lead);

    // Atualiza UI
    filteredData = filterLeads();
    updateFilterOptions();
    updateStats();
    renderTable();

    // Atualiza o modal
    document.getElementById('modal-client-name').textContent = newName;
    document.getElementById('modal-client-name-display').textContent = newName;
    document.getElementById('modal-client-phone').textContent = newPhone;
    document.getElementById('modal-client-email').textContent = newEmail || 'Não informado';
    document.getElementById('modal-client-type').textContent = newStatus;
    document.getElementById('modal-client-type').className = `status-badge status-${newStatus.toLowerCase().replace(' ', '-')}`;

    // Volta ao modo visualização
    cancelEditClient();
    showNotification('Cadastro atualizado com sucesso!', 'success');
    lucide.createIcons();
}

// --- PROFILE MANAGEMENT ---

function populateProfileForm() {
    const session = JSON.parse(localStorage.getItem('passionpro_session'));
    if (!session) return;

    document.getElementById('edit-name').value = session.name;
    document.getElementById('edit-email').value = session.email;
    document.getElementById('edit-phone').value = session.phone || '';
    document.getElementById('edit-password').value = ''; // Don't show password

    // Update settings view
    document.getElementById('settings-user-name').textContent = session.name;
    document.getElementById('settings-user-role').textContent = session.role;
    document.getElementById('settings-avatar').textContent = session.name.substring(0, 2).toUpperCase();
    const userIdDisplay = document.getElementById('settings-user-id');
    if (userIdDisplay) userIdDisplay.textContent = `#${session.id.toString().padStart(3, '0')}`;

    // Carrega foto de perfil se existir
    const previewAvatar = document.getElementById('profile-avatar-preview');
    if (session.avatar_url) {
        updateAvatarUI(session.avatar_url);
        document.getElementById('remove-photo-btn').style.display = 'inline-flex';
    } else {
        const initials = session.name.substring(0, 2).toUpperCase();
        if (previewAvatar) previewAvatar.textContent = initials;
    }

    lucide.createIcons();
}

async function handleProfileUpdate(e) {
    e.preventDefault();
    const session = JSON.parse(localStorage.getItem('passionpro_session'));
    if (!session) return;

    const newName = document.getElementById('edit-name').value;
    const newEmail = document.getElementById('edit-email').value;
    const newPhone = document.getElementById('edit-phone').value;
    const newPassword = document.getElementById('edit-password').value;

    const updateData = {
        name: newName,
        email: newEmail,
        phone: newPhone
    };

    if (newPassword) {
        updateData.password = newPassword;
    }

    try {
        const { error } = await _supabase
            .from('cadastros')
            .update(updateData)
            .eq('id', session.id);

        if (error) throw error;

        // Update session locally (since RLS might not return the row)
        const updatedSession = { ...session, ...updateData };
        localStorage.setItem('passionpro_session', JSON.stringify(updatedSession));
        showApp(updatedSession); // Updates sidebar
        populateProfileForm(); // Updates settings view
        showNotification('Perfil atualizado com sucesso!', 'success');
    } catch (e) {
        console.error('Erro ao atualizar perfil:', e.message);
        showNotification('Erro ao atualizar perfil: ' + e.message, 'error');
    }
}

// --- PROFILE PHOTO UPLOAD ---

async function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Valida tamanho (máx 2MB)
    if (file.size > 2 * 1024 * 1024) {
        showNotification('A imagem deve ter no máximo 2MB', 'error');
        return;
    }

    const session = JSON.parse(localStorage.getItem('passionpro_session'));
    if (!session) return;

    try {
        // Preview local
        const reader = new FileReader();
        reader.onload = function (event) {
            updateAvatarUI(event.target.result);
        };
        reader.readAsDataURL(file);

        // Upload para Supabase Storage
        const fileExt = file.name.split('.').pop();
        const fileName = `${session.id}.${fileExt}`;
        const filePath = `avatars/${fileName}`;

        const { error: uploadError } = await _supabase.storage
            .from('profile-photos')
            .upload(filePath, file, { upsert: true });

        if (uploadError) throw uploadError;

        // Obtém URL pública
        const { data: { publicUrl } } = _supabase.storage
            .from('profile-photos')
            .getPublicUrl(filePath);

        // Salva URL no perfil
        const { error: updateError } = await _supabase
            .from('cadastros')
            .update({ avatar_url: publicUrl })
            .eq('id', session.id);

        if (updateError) throw updateError;

        // Atualiza localStorage
        session.avatar_url = publicUrl;
        localStorage.setItem('passionpro_session', JSON.stringify(session));

        // Mostra botão de remover
        document.getElementById('remove-photo-btn').style.display = 'inline-flex';

        showNotification('Foto de perfil atualizada!', 'success');
        lucide.createIcons();
    } catch (e) {
        console.error('Erro ao fazer upload:', e);
        showNotification('Erro ao enviar foto: ' + e.message, 'error');
    }
}

async function removeProfilePhoto() {
    const session = JSON.parse(localStorage.getItem('passionpro_session'));
    if (!session || !session.avatar_url) return;

    if (!confirm('Deseja realmente remover sua foto de perfil?')) return;

    try {
        // Remove do banco
        const { error } = await _supabase
            .from('cadastros')
            .update({ avatar_url: null })
            .eq('id', session.id);

        if (error) throw error;

        // Atualiza localStorage
        delete session.avatar_url;
        localStorage.setItem('passionpro_session', JSON.stringify(session));

        // Restaura iniciais
        const initials = session.name.substring(0, 2).toUpperCase();
        updateAvatarUI(null, initials);

        document.getElementById('remove-photo-btn').style.display = 'none';
        showNotification('Foto de perfil removida', 'success');
    } catch (e) {
        console.error('Erro ao remover foto:', e);
        showNotification('Erro ao remover foto: ' + e.message, 'error');
    }
}

function updateAvatarUI(imageUrl, initials = null) {
    const avatars = [
        document.getElementById('display-user-avatar'),
        document.getElementById('profile-avatar-preview')
    ];

    avatars.forEach(avatar => {
        if (!avatar) return;

        if (imageUrl) {
            avatar.style.backgroundImage = `url(${imageUrl})`;
            avatar.style.backgroundSize = 'cover';
            avatar.style.backgroundPosition = 'center';
            avatar.textContent = '';
        } else if (initials) {
            avatar.style.backgroundImage = 'none';
            avatar.textContent = initials;
        }
    });
}


// --- ADMIN DASHBOARD LOGIC ---

async function loadAdminData() {
    const session = JSON.parse(localStorage.getItem('passionpro_session'));

    // Verificação de segurança no frontend
    if (!session || session.role !== 'admin') {
        showNotification('Acesso negado: Apenas administradores.', 'error');
        return;
    }

    try {
        showNotification('Carregando dados administrativos...', 'success');

        // 1. Fetch ONLY sellers from 'cadastros' (excluding admins)
        const { data: sellers, error: sellersError } = await _supabase
            .from('cadastros')
            .select('*')
            .eq('role', 'vendedora');

        if (sellersError) throw sellersError;

        // 2. Fetch all leads (Admin RLS policy allows this)
        const { data: allLeads, error: leadsError } = await _supabase
            .from('leads_followup')
            .select('*');

        if (leadsError) throw leadsError;

        // 3. Fetch recent actions logs for deeper analysis (optional, but good for "interaction count")
        const { data: recentLogs, error: logsError } = await _supabase
            .from('logs_acoes')
            .select('*');

        // Process Data
        const stats = processAdminStats(sellers, allLeads, recentLogs || []);
        renderAdminDashboard(stats);

        showNotification('Dados atualizados com sucesso!', 'success');

    } catch (e) {
        console.error('Erro ao carregar painel admin:', e);
        showNotification('Erro Admin: ' + (e.message || e.error_description || JSON.stringify(e)), 'error');
    }
}

function processAdminStats(sellers, leads, logs) {
    // Basic Counts
    const totalSellers = sellers.length;
    const totalLeads = leads.length;
    const totalInteractions = logs.length;

    // Per Seller Stats
    const sellerStats = sellers.map(seller => {
        const sellerLeads = leads.filter(l => l.vendedora_id === seller.id);
        const sellerLogs = logs.filter(l => l.vendedora_id === seller.id);

        // Count Reactivated (assuming status 'Reativado' or specific action)
        const reactivatedCount = sellerLeads.filter(l =>
            l.status === 'Reativado' ||
            (l.lastAction && l.lastAction.toLowerCase().includes('reativado'))
        ).length;

        // Count Contacted (leads with any interaction or messages)
        const contactedCount = sellerLeads.filter(l =>
            l.isMessaged || (l.lastAction && l.lastAction.trim() !== '')
        ).length;

        // Find last activity
        let lastActivity = 'Sem atividade';
        if (sellerLogs.length > 0) {
            // Sort logs by date desc
            sellerLogs.sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora));
            const lastDate = new Date(sellerLogs[0].data_hora);
            lastActivity = lastDate.toLocaleDateString('pt-BR') + ' ' + lastDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }

        return {
            id: seller.id,
            name: seller.name,
            avatar_url: seller.avatar_url,
            totalLeads: sellerLeads.length,
            contactedCount,
            reactivatedCount,
            lastActivity,
            meta_diaria: seller.meta_diaria,
            meta_mensal: seller.meta_mensal,
            contatos_hoje: seller.contatos_hoje,
            contatos_mes: seller.contatos_mes
        };
    });

    return {
        totalSellers,
        totalLeads,
        totalInteractions,
        sellerStats
    };
}

function renderAdminDashboard(stats) {
    // Overview Cards
    document.getElementById('admin-total-sellers').textContent = stats.totalSellers;
    document.getElementById('admin-total-leads').textContent = stats.totalLeads;
    document.getElementById('admin-total-interactions').textContent = stats.totalInteractions;

    // Grid Container
    const gridContainer = document.getElementById('admin-sellers-grid');
    if (!gridContainer) return;

    if (stats.sellerStats.length === 0) {
        gridContainer.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding: 2rem; color: var(--text-muted);">Nenhuma vendedora encontrada.</div>`;
        return;
    }

    gridContainer.innerHTML = stats.sellerStats.map(seller => {
        // Use real goals from database
        const dailyGoal = seller.meta_diaria || 10;
        const monthlyGoal = seller.meta_mensal || 200;
        const dailyCurrent = seller.contatos_hoje || 0;
        const monthlyCurrent = seller.contatos_mes || 0;

        const dailyPercent = Math.min((dailyCurrent / dailyGoal) * 100, 100);
        const monthlyPercent = Math.min((monthlyCurrent / monthlyGoal) * 100, 100);

        const dailyStatus = dailyCurrent >= dailyGoal ? 'Meta Diária ✅' : `${dailyCurrent}/${dailyGoal} hoje`;
        const monthlyStatus = monthlyCurrent >= monthlyGoal ? 'Meta Mensal ✅' : `${monthlyCurrent}/${monthlyGoal} mês`;

        return `
        <div class="admin-seller-card fade-in" onclick="openSellerGoalsModal('${seller.id}', '${seller.name}', ${dailyGoal}, ${monthlyGoal}, ${dailyCurrent}, ${monthlyCurrent})" style="cursor: pointer;">
            <div class="seller-header">
                <div class="seller-avatar" 
                     style="${seller.avatar_url ? `background-image: url(${seller.avatar_url}); background-size: cover; color: transparent;` : ''}">
                    ${seller.avatar_url ? '' : seller.name.substring(0, 2).toUpperCase()}
                </div>
                <div class="seller-info">
                    <h3>${seller.name}</h3>
                    <p>Vendedora</p>
                </div>
            </div>
            
            <div class="seller-metrics">
                <div class="metric-row">
                    <span class="metric-label">🔥 Meta Diária:</span>
                    <span class="metric-value ${dailyCurrent >= dailyGoal ? 'text-success' : ''}">${dailyStatus}</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">📊 Meta Mensal:</span>
                    <span class="metric-value ${monthlyCurrent >= monthlyGoal ? 'text-success' : ''}">${monthlyStatus}</span>
                </div>
                <div class="metric-row">
                    <span class="metric-label">Clientes Reativados:</span>
                    <span class="metric-value text-success">${seller.reactivatedCount}</span>
                </div>
            </div>

            <div style="margin-top: 1rem;">
                <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.5rem;">Progresso Diário</div>
                <div style="height: 8px; background: var(--input-bg); border-radius: 8px; overflow: hidden;">
                    <div style="height: 100%; width: ${dailyPercent}%; background: linear-gradient(90deg, #ef4444, #f97316); border-radius: 8px; transition: width 0.3s;"></div>
                </div>
            </div>

            <div class="meta-status" style="margin-top: 1rem; font-size: 0.85rem; color: var(--text-muted);">
                <i data-lucide="settings" style="width: 14px; height: 14px; display: inline;"></i> Clique para definir metas
            </div>
        </div>
    `}).join('');

    lucide.createIcons();
}

// --- GOALS SYSTEM ---

// Open modal to set seller goals (Admin only)
window.openSellerGoalsModal = function (sellerId, sellerName, dailyGoal, monthlyGoal, dailyCurrent, monthlyCurrent) {
    document.getElementById('seller-goals-id').value = sellerId;
    document.getElementById('seller-goals-name').textContent = sellerName;
    document.getElementById('seller-daily-goal').value = dailyGoal;
    document.getElementById('seller-monthly-goal').value = monthlyGoal;
    document.getElementById('seller-current-daily').textContent = dailyCurrent;
    document.getElementById('seller-current-monthly').textContent = monthlyCurrent;

    document.getElementById('seller-goals-modal').classList.add('active');
    lucide.createIcons();
}

window.closeSellerGoalsModal = function () {
    document.getElementById('seller-goals-modal').classList.remove('active');
}

// Handle form submission for goals
document.addEventListener('DOMContentLoaded', () => {
    const goalsForm = document.getElementById('seller-goals-form');
    if (goalsForm) {
        goalsForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const sellerId = document.getElementById('seller-goals-id').value;
            const dailyGoal = parseInt(document.getElementById('seller-daily-goal').value);
            const monthlyGoal = parseInt(document.getElementById('seller-monthly-goal').value);

            try {
                const { error } = await _supabase
                    .from('cadastros')
                    .update({
                        meta_diaria: dailyGoal,
                        meta_mensal: monthlyGoal
                    })
                    .eq('id', sellerId);

                if (error) throw error;

                closeSellerGoalsModal();
                showNotification('Metas atualizadas com sucesso!', 'success');
                loadAdminData(); // Refresh admin dashboard
            } catch (e) {
                console.error('Erro ao salvar metas:', e);
                showNotification('Erro ao salvar metas: ' + e.message, 'error');
            }
        });
    }
});

// Update seller goals UI (for the seller's own view)
function updateGoalsUI() {
    const session = JSON.parse(localStorage.getItem('passionpro_session'));
    if (!session) return;

    const dailyCurrent = session.contatos_hoje || 0;
    const dailyGoal = session.meta_diaria || 10;
    const monthlyCurrent = session.contatos_mes || 0;
    const monthlyGoal = session.meta_mensal || 200;

    // Update daily
    const dailyCurrentEl = document.getElementById('daily-current');
    const dailyGoalEl = document.getElementById('daily-goal');
    const dailyProgressBar = document.getElementById('daily-progress-bar');
    const dailyStatus = document.getElementById('daily-status');

    if (dailyCurrentEl) dailyCurrentEl.textContent = dailyCurrent;
    if (dailyGoalEl) dailyGoalEl.textContent = dailyGoal;
    if (dailyProgressBar) {
        const percent = Math.min((dailyCurrent / dailyGoal) * 100, 100);
        dailyProgressBar.style.width = percent + '%';
    }
    if (dailyStatus) {
        if (dailyCurrent >= dailyGoal) {
            dailyStatus.textContent = '🎉 Meta atingida! Parabéns!';
            dailyStatus.classList.add('completed');
        } else {
            const remaining = dailyGoal - dailyCurrent;
            dailyStatus.textContent = `Faltam ${remaining} contatos para bater a meta!`;
            dailyStatus.classList.remove('completed');
        }
    }

    // Update monthly
    const monthlyCurrentEl = document.getElementById('monthly-current');
    const monthlyGoalEl = document.getElementById('monthly-goal');
    const monthlyProgressBar = document.getElementById('monthly-progress-bar');
    const monthlyStatus = document.getElementById('monthly-status');

    if (monthlyCurrentEl) monthlyCurrentEl.textContent = monthlyCurrent;
    if (monthlyGoalEl) monthlyGoalEl.textContent = monthlyGoal;
    if (monthlyProgressBar) {
        const percent = Math.min((monthlyCurrent / monthlyGoal) * 100, 100);
        monthlyProgressBar.style.width = percent + '%';
    }
    if (monthlyStatus) {
        if (monthlyCurrent >= monthlyGoal) {
            monthlyStatus.textContent = '🏆 Meta mensal atingida! Incrível!';
            monthlyStatus.classList.add('completed');
        } else {
            const remaining = monthlyGoal - monthlyCurrent;
            monthlyStatus.textContent = `Faltam ${remaining} contatos para a meta do mês`;
            monthlyStatus.classList.remove('completed');
        }
    }
}

// Increment contact count when action is registered
async function incrementContactCount() {
    const session = JSON.parse(localStorage.getItem('passionpro_session'));
    if (!session) return;

    const newDailyCount = (session.contatos_hoje || 0) + 1;
    const newMonthlyCount = (session.contatos_mes || 0) + 1;

    try {
        const { error } = await _supabase
            .from('cadastros')
            .update({
                contatos_hoje: newDailyCount,
                contatos_mes: newMonthlyCount
            })
            .eq('id', session.id);

        if (error) throw error;

        // Update local session
        session.contatos_hoje = newDailyCount;
        session.contatos_mes = newMonthlyCount;
        localStorage.setItem('passionpro_session', JSON.stringify(session));

        updateGoalsUI();
    } catch (e) {
        console.error('Erro ao atualizar contador:', e);
    }
}
