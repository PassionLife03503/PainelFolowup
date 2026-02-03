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
    const cachedData = localStorage.getItem('passionlife_leads');
    if (cachedData) {
        try {
            leadsData = JSON.parse(cachedData);
            filteredData = [...leadsData];
            updateFilterOptions();
            updateStats();
            renderTable();
        } catch (e) {
            console.error('Erro ao carregar cache:', e);
            localStorage.removeItem('passionlife_leads');
        }
    }

    setupEventListeners();
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
        const actionText = selectedTag ? selectedTag.getAttribute('data-action') : '';

        const leadIndex = leadsData.findIndex(l => l.id === selectedClientId);
        if (leadIndex !== -1) {
            const updatedLead = { ...leadsData[leadIndex], lastAction: actionText, details: description };
            leadsData[leadIndex] = updatedLead;

            // Save & Update
            localStorage.setItem('passionlife_leads', JSON.stringify(leadsData));

            // Sync with Supabase (Background)
            saveLeadToSupabase(updatedLead);
            logActionToSupabase(selectedClientId, actionText, description);

            filteredData = filterLeads(); // Keep current filters
            renderTable();
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

    // Clear Data
    const clearDataBtn = document.getElementById('clear-data');
    clearDataBtn.addEventListener('click', () => {
        if (leadsData.length === 0) {
            showNotification('Não há dados para remover.', 'error');
            return;
        }

        if (confirm('Tem certeza que deseja remover todos os dados da planilha carregada?')) {
            localStorage.removeItem('passionlife_leads');
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

        localStorage.setItem('passionlife_leads', JSON.stringify(leadsData));

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
            details: '',     // Descrição detalhada
            isMessaged: false // Novo: rastreia se o WhatsApp foi clicado
        };
    });
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

    return leadsData.filter(lead => {
        const matchesSearch = lead.nome.toLowerCase().includes(searchTerm);
        const matchesFilter = filterValue === 'all' || lead.status === filterValue;
        return matchesSearch && matchesFilter;
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

    tableBody.innerHTML = pageData.map(lead => `
        <tr class="fade-in" data-client-id="${lead.id}" onclick="openClientModal(${lead.id})">
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
                <div style="max-width: 250px; font-size: 0.9rem;">
                    ${lead.lastAction ? `<strong>${lead.lastAction}</strong>` : lead.proximaAcao}
                </div>
            </td>
            <td class="text-right">
                <a href="${generateWhatsAppLink(lead.telefone, lead.nome)}" target="_blank" class="btn-whatsapp" onclick="event.stopPropagation()">
                   <i data-lucide="message-square"></i> WhatsApp
                </a>
            </td>
        </tr>
    `).join('');

    tableInfo.textContent = `Mostrando ${startIndex + 1} a ${endIndex} de ${totalItems} leads`;
    renderPagination(totalItems);
    lucide.createIcons();
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

    const message = encodeURIComponent(`Olá ${firstName}, tudo bem? Sou da PassionLife e estou entrando em contato para conversarmos sobre novos modelos!`);
    return `https://wa.me/${cleanPhone}?text=${message}`;
}

function updateStats() {
    countNovos.textContent = leadsData.filter(l => l.status.includes('REVENDEDOR')).length;
    countConversa.textContent = leadsData.filter(l => l.status.includes('LOJISTA')).length;
    countReativados.textContent = leadsData.filter(l => l.status.includes('EXCLUSIVA')).length;
    countFechados.textContent = leadsData.filter(l => l.status.includes('USO')).length;
    updateCharts();
}

function switchSection(sectionId) {
    navItems.forEach(nav => nav.classList.toggle('active', nav.getAttribute('data-section') === sectionId));
    sections.forEach(section => section.classList.toggle('active', section.id === `section-${sectionId}`));

    if (sectionId === 'contacted') {
        renderContactedTable();
    }

    if (sectionId === 'reports' && charts.status) {
        setTimeout(() => {
            charts.status.resize();
            charts.trend.resize();
        }, 100);
    }
}

function initCharts() {
    const ctxStatus = document.getElementById('statusDistributionChart').getContext('2d');
    const ctxTrend = document.getElementById('conversionTrendChart').getContext('2d');
    Chart.defaults.color = '#94a3b8';
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
                borderColor: '#6366f1',
                backgroundColor: 'rgba(99, 102, 241, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 4,
                pointBackgroundColor: '#6366f1'
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

        localStorage.setItem('passionlife_leads', JSON.stringify(leadsData));

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

window.switchLoginTab = function (tab) {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const tabLogin = document.getElementById('tab-login');
    const tabRegister = document.getElementById('tab-register');

    if (tab === 'login') {
        loginForm.style.display = 'block';
        registerForm.style.display = 'none';
        tabLogin.classList.add('active');
        tabRegister.classList.remove('active');
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'block';
        tabLogin.classList.remove('active');
        tabRegister.classList.add('active');
    }
}

function checkAuth() {
    const session = localStorage.getItem('passionlife_session');
    if (session) {
        const user = JSON.parse(session);
        showApp(user);
        loadLeadsFromSupabase(); // Sincroniza dados da nuvem ao abrir o app
    } else {
        showLogin();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    const identifier = document.getElementById('login-identifier').value.toLowerCase();
    const passIn = document.getElementById('login-password').value;
    const errorMsg = document.getElementById('login-error');

    try {
        const { data, error } = await _supabase
            .from('vendedoras')
            .select('*')
            .or(`email.eq.${identifier},phone.eq.${identifier}`)
            .eq('password', passIn)
            .single();

        if (error || !data) {
            errorMsg.classList.add('active');
            return;
        }

        localStorage.setItem('passionlife_session', JSON.stringify(data));
        errorMsg.classList.remove('active');
        showApp(data);
        loadLeadsFromSupabase(); // Carrega dados da nuvem
    } catch (e) {
        console.error('Erro no login:', e);
        errorMsg.classList.add('active');
    }
}

window.handleRegister = async function (e) {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value.toLowerCase();
    const phone = document.getElementById('reg-phone').value;
    const password = document.getElementById('reg-password').value;
    const successMsg = document.getElementById('reg-success');

    try {
        const { error } = await _supabase
            .from('vendedoras')
            .insert([{ name, email, phone, password, role: 'Vendedora' }]);

        if (error) throw error;

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
    document.getElementById('display-user-role').textContent = user.role;
    document.getElementById('display-user-avatar').textContent = user.name.substring(0, 2).toUpperCase();

    lucide.createIcons();
}

function showLogin() {
    document.getElementById('login-screen').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
}

function logout() {
    if (confirm('Deseja realmente sair do sistema?')) {
        localStorage.removeItem('passionlife_session');
        location.reload();
    }
}

// --- SUPABASE DATA MANAGEMENT ---

async function loadLeadsFromSupabase() {
    const session = JSON.parse(localStorage.getItem('passionlife_session'));
    if (!session) return;

    try {
        const { data, error } = await _supabase
            .from('leads_followup')
            .select('*')
            .eq('vendedora_id', session.id) // FILTRO: Só vê o que é dela
            .order('id', { ascending: false });

        if (error) throw error;

        // Atualiza status visual
        document.getElementById('db-status-dot').style.background = '#10b981';
        document.getElementById('db-status-text').textContent = 'Cloud Online';

        if (data && data.length > 0) {
            leadsData = data;
            filteredData = [...leadsData];
            updateFilterOptions();
            updateStats();
            renderTable();
        } else {
            // Se não houver nada na nuvem, limpa a tabela local
            leadsData = [];
            filteredData = [];
            renderTable();
        }
    } catch (e) {
        console.error('Erro ao carregar leads da nuvem:', e.message);
        document.getElementById('db-status-dot').style.background = '#ef4444';
        document.getElementById('db-status-text').textContent = 'Cloud Erro (API Key)';
    }
}

async function saveLeadToSupabase(lead) {
    const session = JSON.parse(localStorage.getItem('passionlife_session'));
    if (!session) return;

    try {
        // Vincula o lead à vendedora antes de salvar
        const leadToSync = { ...lead, vendedora_id: session.id };

        const { error } = await _supabase
            .from('leads_followup')
            .upsert([leadToSync]);

        if (error) throw error;
    } catch (e) {
        console.error('Erro ao salvar lead na nuvem:', e.message);
    }
}

async function logActionToSupabase(clientId, action, details) {
    const session = JSON.parse(localStorage.getItem('passionlife_session'));
    if (!session) return;

    try {
        const { error } = await _supabase
            .from('logs_acoes')
            .insert([{
                vendedora_id: session.id,
                vendedora_nome: session.name,
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
