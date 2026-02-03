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
const mobileToggle = document.getElementById('mobile-menu-toggle');
const sidebar = document.querySelector('.sidebar');
const pageSizeSelect = document.getElementById('page-size');
const paginationControls = document.getElementById('pagination-controls');
const tableInfo = document.getElementById('table-info');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
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

    // Page Size
    pageSizeSelect.addEventListener('change', (e) => {
        itemsPerPage = parseInt(e.target.value);
        currentPage = 1;
        renderTable();
    });
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const data = new Uint8Array(event.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet);

        leadsData = processLeadsData(rawData);
        filteredData = [...leadsData];

        localStorage.setItem('passionlife_leads', JSON.stringify(leadsData));

        updateFilterOptions();
        updateStats();
        currentPage = 1;
        renderTable();
        showNotification('Planilha importada!', 'success');
    };
    reader.readAsArrayBuffer(file);
}

function processLeadsData(data) {
    return data.map(item => {
        let rawPhone = item['TEL CELULAR'] || item['Telefone'] || '';
        return {
            nome: item['NOME DO CLIENTE'] || item['Nome'] || 'N/A',
            ultimoContato: item['DATA DE CADASTRO'] || item['Data'] || new Date().toLocaleDateString(),
            status: (item['TIPO DE CLIENTE'] || 'Lead').toUpperCase(),
            proximaAcao: 'Analisar perfil para reativação',
            telefone: rawPhone
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
        <tr class="fade-in">
            <td>
                <div style="font-weight: 600;">${lead.nome}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${lead.telefone || 'Sem telefone'}</div>
            </td>
            <td>${lead.ultimoContato}</td>
            <td>
                <span class="status-badge ${getStatusClass(lead.status)}">
                    ${lead.status}
                </span>
            </td>
            <td>
                <div style="max-width: 250px; font-size: 0.9rem;">${lead.proximaAcao}</div>
            </td>
            <td class="text-right">
                <a href="${generateWhatsAppLink(lead.telefone, lead.nome)}" target="_blank" class="btn-whatsapp">
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
    const message = encodeURIComponent(`Olá ${name}, tudo bem? Sou da PassionLife e estou entrando em contato para conversarmos sobre novos modelos!`);
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

function showNotification(message, type = 'success') {
    const toast = document.getElementById('notification-toast');
    toast.textContent = message;
    toast.className = `toast show ${type}`;
    setTimeout(() => { toast.className = 'toast'; }, 3000);
}
