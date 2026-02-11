// Supabase Configuration
const SUPABASE_URL = 'https://lupecrnrdhvuqbvmmxdc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1cGVjcm5yZGh2dXFidm1teGRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAxMzU1MTAsImV4cCI6MjA4NTcxMTUxMH0.zxegyFwBNaTB1QaxWXwzo1WNGpnOafGPL6Zk7TeksnY'; // Insira aqui a sua chave Anon (PublicKey)
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// n8n Webhook Configuration
let N8N_BASE_URL = 'https://adryanlife.app.n8n.cloud/webhook/sistemafolowup';
let isN8nTestMode = false;

// App State
let leadsData = [];
let charts = {};
let currentPage = 1;
let itemsPerPage = 10;
let filteredData = []; // Store filtered data to make pagination easier
let aiDocuments = []; // Store AI knowledge base documents

// Helper to save leads to localStorage consistently
function saveLeadsToLocal() {
    localStorage.setItem('passionpro_leads', JSON.stringify(leadsData));
}

// Broadcast State
let broadcastTimer = null;
let broadcastQueue = [];
let isBroadcasting = false;
let currentCampaignId = null; // New state for campaign tracking
let broadcastConfig = {
    limit: 50,
    intervalMin: 30,
    intervalMax: 90,
    timeStart: "09:00",
    timeEnd: "18:00",
    filterStatus: "all"
};

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
    loadAIConfig(); // Load AI configuration from Supabase
    loadAIDocuments(); // Load AI documents from Supabase
    loadBroadcastConfig(); // Load broadcast config from localStorage

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

    // Message Type Selection
    const typeTags = document.querySelectorAll('.type-tag');
    typeTags.forEach(tag => {
        tag.addEventListener('click', () => {
            typeTags.forEach(t => t.classList.remove('selected'));
            tag.classList.add('selected');
        });
    });

    // Save Client Data
    saveClientBtn.addEventListener('click', async () => {
        const selectedTag = document.querySelector('.action-tag.selected');
        const selectedTypeTag = document.querySelector('.type-tag.selected');
        const description = document.getElementById('modal-action-desc').value;
        const nextActionDate = document.getElementById('modal-next-action-date').value; // Get Date
        const actionText = selectedTag ? selectedTag.getAttribute('data-action') : '';
        const messageType = selectedTypeTag ? selectedTypeTag.getAttribute('data-type') : 'text';

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

            // NOVO: Notificar n8n sobre a interação
            const isCustomerMessage = actionText === 'Cliente respondeu';

            sendToN8N('lead_interaction', {
                lead: updatedLead,
                whatsappNumber: formatPhoneForWA(updatedLead.telefone),
                action: actionText,
                message: description,
                details: description,
                vendedora: JSON.parse(localStorage.getItem('passionpro_session')),
                fromMe: !isCustomerMessage,
                isGroup: false,
                isMassSending: false,
                messageType: messageType
            }).catch(e => console.error('Erro n8n interaction:', e));

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

    // AI Tabs Switching
    const aiTabs = document.querySelectorAll('.ai-tab');
    aiTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.getAttribute('data-ai-tab');

            // UI Update
            aiTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Content Update
            document.querySelectorAll('.ai-tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`ai-tab-${targetTab}`).classList.add('active');

            lucide.createIcons();
        });
    });

    // AI File Upload
    const aiDbUpload = document.getElementById('ai-db-upload');
    if (aiDbUpload) {
        aiDbUpload.addEventListener('change', handleAIFileUpload);
    }

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
    if (clearDataBtn) {
        clearDataBtn.addEventListener('click', async () => {
            if (leadsData.length === 0) {
                showNotification('Não há dados para remover.', 'error');
                return;
            }

            const profile = JSON.parse(localStorage.getItem('passionpro_session'));
            const isAdmin = profile && profile.role === 'admin';

            let confirmMsg = 'Tem certeza que deseja remover todos os seus leads?';
            if (isAdmin) {
                confirmMsg = 'Você é ADMIN. Deseja remover APENAS OS SEUS LEADS ou LIMPAR O BANCO DE DADOS INTEIRO? \n\nClique em OK para APENAS OS SEUS ou CANCELAR para desistir (Use o Painel Admin para limpeza global).';
            }

            if (confirm(confirmMsg)) {
                try {
                    showNotification('Removendo dados da nuvem...', 'info');

                    const { data: { session } } = await _supabase.auth.getSession();
                    if (session) {
                        let query = _supabase.from('leads_followup').delete();

                        // Se não for admin, ou se for admin mas quiser deletar apenas os seus
                        if (!isAdmin) {
                            query = query.eq('vendedora_id', session.user.id);
                        } else {
                            // Se for admin, perguntamos se quer deletar TUDO (perigoso)
                            if (confirm('⚠️ ATENÇÃO: Deseja apagar os leads de TODOS os vendedores do sistema? Esta ação é irreversível.')) {
                                // Deleta tudo (sem filtro de vendedora_id)
                                // Nota: RLS deve permitir isso para admins
                            } else {
                                // Deleta apenas os do admin
                                query = query.eq('vendedora_id', session.user.id);
                            }
                        }

                        const { error } = await query;
                        if (error) throw error;
                    }

                    localStorage.removeItem('passionpro_leads');
                    leadsData = [];
                    filteredData = [];
                    currentPage = 1;

                    updateFilterOptions();
                    updateStats();
                    renderTable();
                    showNotification('Dados removidos com sucesso da nuvem e local!', 'success');
                } catch (e) {
                    console.error('Erro ao limpar dados:', e);
                    showNotification('Erro ao remover dados da nuvem: ' + e.message, 'error');
                }
            }
        });
    }

    // Botão de Limpar Dados no Painel Admin (se houver outro ID)
    const clearDataAdminBtn = document.getElementById('clear-data-admin');
    if (clearDataAdminBtn) {
        clearDataAdminBtn.addEventListener('click', () => {
            // Reutiliza a lógica ou chama o outro botão
            document.getElementById('clear-data').click();
        });
    }

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

    // Broadcast Listeners
    const broadcastInputs = [
        'broadcast-limit', 'broadcast-interval-min', 'broadcast-interval-max',
        'broadcast-time-start', 'broadcast-time-end', 'broadcast-filter-status',
        'broadcast-filter-type', 'broadcast-filter-city', 'broadcast-filter-date',
        'broadcast-message', 'broadcast-type', 'broadcast-media-url'
    ];
    broadcastInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateBroadcastPreview);
        if (el) el.addEventListener('change', updateBroadcastPreview);
    });

    const btnStartBroadcast = document.getElementById('btn-start-broadcast');
    if (btnStartBroadcast) btnStartBroadcast.addEventListener('click', toggleBroadcast);

    const btnSaveBroadcast = document.getElementById('btn-save-broadcast-config');
    if (btnSaveBroadcast) btnSaveBroadcast.addEventListener('click', saveBroadcastConfig);

    // Initial Preview update
    setTimeout(() => {
        loadBroadcastConfig();
        updateBroadcastPreview();
    }, 1000);
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
            cidade: item['CIDADE'] || item['Cidade'] || 'N/A',
            proximaAcao: 'Analisar perfil para reativação',
            telefone: rawPhone,
            whatsappNumber: formatPhoneForWA(rawPhone),
            lastAction: '',
            lastActionDate: (item['DATA DE CADASTRO'] instanceof Date) ? item['DATA DE CADASTRO'].getTime() : Date.now(),
            details: '',
            isMessaged: false,
            nextActionDate: null
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
    // Main Status Filter
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

    // Broadcast City Filter
    const broadcastCityFilter = document.getElementById('broadcast-filter-city');
    if (broadcastCityFilter) {
        const uniqueCities = [...new Set(leadsData.map(l => l.cidade).filter(c => c && c !== 'N/A'))];
        const currentCity = broadcastCityFilter.value;
        broadcastCityFilter.innerHTML = '<option value="all">Cidade: Todas</option>';
        uniqueCities.sort().forEach(city => {
            const option = document.createElement('option');
            option.value = city;
            option.textContent = city;
            broadcastCityFilter.appendChild(option);
        });
        broadcastCityFilter.value = currentCity;
    }
}

function filterLeads() {
    const searchTerm = searchInput.value.toLowerCase();
    const filterValue = statusFilter.value;
    const actionValue = actionFilter ? actionFilter.value : 'all';

    return leadsData.filter(lead => {
        const matchesSearch = lead.nome.toLowerCase().includes(searchTerm) ||
            (lead.telefone && String(lead.telefone).includes(searchTerm));

        // Status matching (flexível)
        let matchesFilter = filterValue === 'all';
        if (!matchesFilter) {
            const lStatus = (lead.status || '').toUpperCase();
            const fValue = filterValue.toUpperCase();
            matchesFilter = lStatus === fValue || lStatus.includes(fValue) || fValue.includes(lStatus);
        }

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
                <td colspan="6">
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
    if (s.includes('REVENDEDOR') || s.includes('NOVO')) return 'status-novo';
    if (s.includes('LOJISTA') || s.includes('CONVERSA')) return 'status-conversa';
    if (s.includes('USO PRÓPRIO') || s.includes('ANTIGO')) return 'status-antigo';
    if (s.includes('CIDADE EXCLUSIVA') || s.includes('FECHADO')) return 'status-fechado';
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

    if (sectionId === 'ai-config') {
        loadAIConfig();
        loadAIDocuments();
    }

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

    // Reset Type Selection to 'text' default
    const typeTags = document.querySelectorAll('.type-tag');
    typeTags.forEach(tag => {
        tag.classList.toggle('selected', tag.getAttribute('data-type') === 'text');
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
                <td colspan="5">
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
        if (document.getElementById('nav-ai-config')) document.getElementById('nav-ai-config').style.display = 'none';
        if (navContacted) navContacted.style.display = 'flex';
    } else if (role === 'admin') {
        if (clearDataBtn) clearDataBtn.style.display = 'flex';
        if (navAdmin) navAdmin.style.display = 'flex';
        if (document.getElementById('nav-ai-config')) document.getElementById('nav-ai-config').style.display = 'flex';
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
        const profile = JSON.parse(localStorage.getItem('passionpro_session'));

        let query = _supabase.from('leads_followup').select('*');
        if (profile && profile.role !== 'admin') {
            query = query.eq('vendedora_id', session.user.id);
        }

        const { data: cloudLeads, error } = await query.order('id', { ascending: false });

        if (error) throw error;

        // MERGE: Mantém o que tem no local (manuais recentes) e junta com o da nuvem
        // Evita que o F5 apague o que foi cadastrado e ainda não sincronizou totalmente
        const localLeads = JSON.parse(localStorage.getItem('passionpro_leads') || '[]');

        // Criar um Map por ID para evitar duplicados, priorizando o dado da nuvem
        const leadsMap = new Map();

        // Primeiro insere os locais
        localLeads.forEach(l => leadsMap.set(String(l.id), l));
        // Sobrescreve com os da nuvem (mais oficiais)
        if (cloudLeads) {
            cloudLeads.forEach(l => leadsMap.set(String(l.id), l));
        }

        leadsData = Array.from(leadsMap.values());
        leadsData.sort((a, b) => (b.lastActionDate || 0) - (a.lastActionDate || 0));

        filteredData = [...leadsData];
        saveLeadsToLocal();

        // Atualiza status visual
        const statusDot = document.getElementById('db-status-dot');
        const statusText = document.getElementById('db-status-text');
        if (statusDot) statusDot.style.background = '#10b981';
        if (statusText) statusText.textContent = 'Nuvem Online';

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

        console.log('Sincronizando lead com Supabase:', leadToSync);

        const { error } = await _supabase
            .from('leads_followup')
            .upsert([leadToSync]);

        if (error) {
            console.error('Erro retornado pelo Supabase:', error);
            throw error;
        }

        console.log('Lead sincronizado com sucesso!');
    } catch (e) {
        console.error('Erro ao salvar lead na nuvem:', e.message);
        showNotification('Erro ao sincronizar com a nuvem: ' + e.message, 'error');
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

    const session = JSON.parse(localStorage.getItem('passionpro_session'));

    const newLead = {
        id: phoneId ? Number(phoneId) : Date.now(), // Garantir que ID seja numérico para o BIGINT do Supabase
        nome: name,
        telefone: phone,
        email: email || 'N/A',
        cidade: 'Manual', // Campo que faltava e pode estar como NOT NULL no banco
        dataCadastro: new Date().toLocaleDateString('pt-BR'),
        status: status.toUpperCase(), // Padronizar para maiúsculas como na planilha
        vendedora_id: session ? session.id : null,
        proximaAcao: 'Primeiro contato',
        lastAction: notes || 'Cliente cadastrado manualmente',
        lastActionDate: Date.now(),
        details: notes || '',
        isMessaged: false,
        nextActionDate: new Date().toISOString().split('T')[0]
    };

    // Adiciona ao array local
    leadsData.unshift(newLead);
    filteredData = filterLeads();

    // Sincroniza cache local para persistência imediata
    saveLeadsToLocal();

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

    // Sincroniza cache local
    saveLeadsToLocal();

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

// --- AI AGENT CONFIGURATION ---

const DEFAULT_SYSTEM_PROMPT = `Você é um assistente comercial de alta performance da PassionPro.
Sua missão é atender leads, tirar dúvidas sobre os produtos e converter em vendas.
Mantenha sempre um tom profissional e prestativo.`;

async function loadAIConfig() {
    try {
        const { data, error } = await _supabase
            .from('ai_agent_config')
            .select('*')
            .maybeSingle();

        if (error) throw error;

        if (data) {
            document.getElementById('ai-personality').value = data.agent_personality || '';
            document.getElementById('ai-characteristics').value = data.agent_characteristics || '';
            document.getElementById('ai-tone').value = data.tone_of_voice || 'elegant';
            document.getElementById('ai-voice-enabled').checked = data.enable_voice || false;
            document.getElementById('ai-voice-provider').value = data.voice_provider || 'elevenlabs';
            document.getElementById('ai-voice-id').value = data.voice_id || '';
            document.getElementById('ai-voice-style').value = data.voice_speed_style || '';
            document.getElementById('ai-system-prompt').value = data.system_prompt || DEFAULT_SYSTEM_PROMPT;

            // n8n Fields
            if (document.getElementById('n8n-webhook-url')) document.getElementById('n8n-webhook-url').value = data.n8n_webhook_url || 'https://adryanlife.app.n8n.cloud/webhook/sistemafolowup';
            if (document.getElementById('n8n-test-mode')) {
                document.getElementById('n8n-test-mode').checked = data.n8n_test_mode || false;
                toggleN8nMode(data.n8n_test_mode || false); // Sincroniza visual do badge
            }

            // WhatsApp Fields
            if (document.getElementById('wa-api-platform')) document.getElementById('wa-api-platform').value = data.wa_api_platform || 'evolution';
            if (document.getElementById('wa-instance-name')) document.getElementById('wa-instance-name').value = data.wa_instance_name || '';
            if (document.getElementById('wa-api-url')) document.getElementById('wa-api-url').value = data.wa_api_url || '';
            if (document.getElementById('wa-api-key')) document.getElementById('wa-api-key').value = data.wa_api_key || '';
        } else {

            document.getElementById('ai-system-prompt').value = DEFAULT_SYSTEM_PROMPT;
        }
    } catch (e) {
        console.error('Erro ao carregar config IA:', e);
    }
}

// Auxiliar para formatar a resposta da IA (Markdown básico)
function formatAIResponse(text) {
    if (!text) return '';
    // Converte **texto** para negrito
    let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Converte links simples em tags <a> se necessário (opcional)
    return formatted;
}

// Auxiliar para obter a configuração completa da IA da interface
function getAIConfigPayload() {
    const activeDocs = (aiDocuments || []).filter(doc => doc.is_active).map(doc => ({
        name: doc.file_name,
        path: doc.storage_path,
        type: doc.file_type
    }));

    return {
        personality: document.getElementById('ai-personality')?.value || '',
        characteristics: document.getElementById('ai-characteristics')?.value || '',
        tone: document.getElementById('ai-tone')?.value || 'elegant',
        system_prompt: document.getElementById('ai-system-prompt')?.value || '',
        active_documents: activeDocs,
        voice: {
            enabled: document.getElementById('ai-voice-enabled')?.checked || false,
            provider: document.getElementById('ai-voice-provider')?.value || '',
            id: document.getElementById('ai-voice-id')?.value || '',
            style: document.getElementById('ai-voice-style')?.value || ''
        }
    };
}

async function saveAIConfig() {
    const configFull = {
        agent_personality: document.getElementById('ai-personality').value,
        agent_characteristics: document.getElementById('ai-characteristics').value,
        tone_of_voice: document.getElementById('ai-tone').value,
        enable_voice: document.getElementById('ai-voice-enabled').checked,
        voice_provider: document.getElementById('ai-voice-provider').value,
        voice_id: document.getElementById('ai-voice-id').value,
        voice_speed_style: document.getElementById('ai-voice-style').value,
        system_prompt: document.getElementById('ai-system-prompt').value,
        // n8n Fields
        n8n_webhook_url: document.getElementById('n8n-webhook-url')?.value,
        n8n_test_mode: document.getElementById('n8n-test-mode')?.checked,
        // WhatsApp Fields
        wa_api_platform: document.getElementById('wa-api-platform')?.value,
        wa_instance_name: document.getElementById('wa-instance-name')?.value,
        wa_api_url: document.getElementById('wa-api-url')?.value,
        wa_api_key: document.getElementById('wa-api-key')?.value,
        updated_at: new Date().toISOString()
    };

    console.log('🔵 Tentando salvar configuração:', configFull);

    try {
        const { data: existing, error: selectError } = await _supabase.from('ai_agent_config').select('id').maybeSingle();

        if (selectError) {
            console.error('❌ Erro ao buscar config existente:', selectError);
            throw selectError;
        }

        let error;
        if (existing) {
            console.log('📝 Atualizando registro existente (ID:', existing.id, ')');
            const result = await _supabase
                .from('ai_agent_config')
                .update(configFull)
                .eq('id', existing.id);
            error = result.error;
        } else {
            console.log('➕ Criando novo registro');
            const result = await _supabase
                .from('ai_agent_config')
                .insert([configFull]);
            error = result.error;
        }

        if (error) {
            console.error('❌ Erro do Supabase:', error);
            console.error('❌ Detalhes completos:', JSON.stringify(error, null, 2));

            // Se o erro for de coluna inexistente, tenta novamente SEM as colunas n8n
            if (error.message && (error.message.includes('column') || error.message.includes('n8n'))) {
                console.warn('⚠️ Detectado erro de coluna. Tentando salvar SEM campos n8n...');

                // Config sem os campos n8n
                const configBasic = {
                    agent_personality: configFull.agent_personality,
                    agent_characteristics: configFull.agent_characteristics,
                    tone_of_voice: configFull.tone_of_voice,
                    enable_voice: configFull.enable_voice,
                    voice_provider: configFull.voice_provider,
                    voice_id: configFull.voice_id,
                    voice_speed_style: configFull.voice_speed_style,
                    system_prompt: configFull.system_prompt,
                    wa_api_platform: configFull.wa_api_platform,
                    wa_instance_name: configFull.wa_instance_name,
                    wa_api_url: configFull.wa_api_url,
                    wa_api_key: configFull.wa_api_key,
                    updated_at: configFull.updated_at
                };

                let retryError;
                if (existing) {
                    const retryResult = await _supabase
                        .from('ai_agent_config')
                        .update(configBasic)
                        .eq('id', existing.id);
                    retryError = retryResult.error;
                } else {
                    const retryResult = await _supabase
                        .from('ai_agent_config')
                        .insert([configBasic]);
                    retryError = retryResult.error;
                }

                if (retryError) {
                    console.error('❌ Erro no retry (sem n8n):', retryError);
                    console.error('❌ Detalhes do retry:', JSON.stringify(retryError, null, 2));
                    throw retryError;
                }

                console.log('✅ Salvo SEM campos n8n (salvo apenas localmente)');
                // Salvar n8n no localStorage como fallback
                localStorage.setItem('n8n_config', JSON.stringify({
                    webhook_url: configFull.n8n_webhook_url,
                    test_mode: configFull.n8n_test_mode
                }));
                showNotification('⚠️ Configurações salvas (n8n salvo localmente). Execute o SQL de atualização!', 'warning');
                return;
            }

            throw error;
        }

        console.log('✅ Configuração salva com sucesso!');
        showNotification('Configurações da IA salvas!', 'success');
    } catch (e) {
        console.error('❌ Erro detalhado ao salvar config IA:', e);

        // Mensagem mais específica para o usuário
        let errorMsg = 'Erro ao salvar configurações';
        if (e.message && e.message.includes('column')) {
            errorMsg = 'Erro: Execute o script SQL "update_ai_table_n8n.sql" no Supabase primeiro!';
        } else if (e.message) {
            errorMsg = `Erro: ${e.message}`;
        }

        showNotification(errorMsg, 'error');
    }
}

window.restoreDefaultPrompt = function () {
    if (confirm('Deseja realmente restaurar o prompt padrão?')) {
        document.getElementById('ai-system-prompt').value = DEFAULT_SYSTEM_PROMPT;
    }
}

window.testWhatsAppConnection = async function () {
    const platform = document.getElementById('wa-api-platform').value;
    const url = document.getElementById('wa-api-url').value;
    const key = document.getElementById('wa-api-key').value;
    const instance = document.getElementById('wa-instance-name').value;

    if (!url) {
        showNotification('Informe a URL da API para testar.', 'error');
        return;
    }

    showNotification('Testando conexão com WhatsApp...', 'info');

    try {
        // Notifica o n8n sobre o teste para validação inteligente
        const result = await sendToN8N('test_whatsapp', {
            platform, url, instance, key,
            fromMe: true
        });

        if (result.status === 'success' || result.connected) {
            showNotification('WhatsApp conectado com sucesso!', 'success');
        } else {
            showNotification('Erro: n8n não conseguiu validar a instância.', 'error');
        }
    } catch (e) {
        // Fallback local simples se o n8n falhar
        try {
            const response = await fetch(`${url}/instance/status/${instance}`, {
                headers: { 'apikey': key }
            });
            if (response.ok) {
                showNotification('Instância online (validação direta)!', 'success');
            } else {
                throw new Error('Falha na resposta da API');
            }
        } catch (localErr) {
            showNotification('Falha ao conectar: ' + localErr.message, 'error');
        }
    }
}


window.testAIResponse = async function () {
    const inputEl = document.getElementById('ai-test-input');
    const message = inputEl ? inputEl.value.trim() : '';

    if (!message) return;

    // Add user message to chat
    addChatMessage(message, 'outgoing');
    inputEl.value = '';

    const typingIndicator = document.getElementById('ai-typing-indicator');
    if (typingIndicator) typingIndicator.style.display = 'flex';

    try {
        const config = getAIConfigPayload();
        const responseData = await sendToN8N('ai_test', {
            message: message,
            prompt: message,
            ...config,
            whatsappNumber: "00000000000",
            isTest: true,
            fromMe: true,
            messageType: 'text'
        });

        if (typingIndicator) typingIndicator.style.display = 'none';

        const getResponseText = (data) => {
            if (!data) return null;
            const body = Array.isArray(data) ? data[0] : data;
            return body.output || body.response || body.text || body.message || body.data ||
                (typeof body === 'string' ? body : null);
        };

        const responseText = getResponseText(responseData);
        if (responseText) {
            addChatMessage(responseText, 'incoming');
        } else {
            addChatMessage('⚠️ Erro: Formato de resposta não reconhecido pelo simulador.', 'incoming');
            console.log('Dados recebidos:', responseData);
        }
    } catch (e) {
        if (typingIndicator) typingIndicator.style.display = 'none';
        addChatMessage(`❌ Erro de conexão: ${e.message}`, 'incoming');
    }
}

// Function to add a bubble to the chat simulator
function addChatMessage(text, type) {
    const chatHistory = document.getElementById('ai-chat-history');
    if (!chatHistory) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;

    // Process markdown (bold) for income messages
    const formattedText = type === 'incoming' ? formatAIResponse(text) : text;

    messageDiv.innerHTML = `
        <div class="message-content">
            ${formattedText}
        </div>
    `;

    chatHistory.appendChild(messageDiv);
    chatHistory.scrollTop = chatHistory.scrollHeight; // Scroll to bottom
}

window.clearAIChat = function () {
    const chatHistory = document.getElementById('ai-chat-history');
    if (chatHistory) {
        chatHistory.innerHTML = '<div class="chat-date">Chat Reiniciado</div>';
        addChatMessage('Oi! Tudo bem? 😊<br><br>Aqui é a Bianca da PassionLife.<br>Vi que você já fez parte da nossa família há um tempo e quis retomar contato.<br><br><strong>Você ainda trabalha com moda íntima/praia ou mudou de área?</strong>', 'incoming');
    }
}

async function handleAIFileUpload(e) {
    console.log('handleAIFileUpload triggered');
    const files = e.target.files;
    if (!files || files.length === 0) {
        console.log('No files selected');
        return;
    }

    showNotification(`Iniciando upload de ${files.length} arquivo(s)...`, 'info');

    for (const file of files) {
        try {
            const filePath = `ai_knowledge_base/${Date.now()}_${file.name}`;
            console.log(`Uploading file: ${file.name} to path: ${filePath}`);
            const { data: uploadData, error: uploadError } = await _supabase.storage
                .from('ai_files')
                .upload(filePath, file);

            if (uploadError) {
                console.error('Storage Upload Error:', uploadError);
                if (uploadError.message.includes('bucket not found')) {
                    throw new Error('O bucket "ai_files" não foi encontrado no seu Supabase. Crie-o na aba Storage.');
                }
                throw uploadError;
            }

            console.log('Upload successful, inserting into database...');

            const { error: dbError } = await _supabase
                .from('ai_agent_documents')
                .insert([{
                    file_name: file.name,
                    file_type: file.type || file.name.split('.').pop(),
                    file_size: file.size,
                    storage_path: filePath,
                    is_active: true
                }]);

            if (dbError) throw dbError;

        } catch (e) {
            console.error('Erro no upload do arquivo:', file.name, e);
            showNotification(`Erro ao enviar ${file.name}: ${e.message}`, 'error');
        }
    }

    loadAIDocuments();
    showNotification('Base de conhecimento atualizada!', 'success');
}

async function loadAIDocuments() {
    try {
        const { data, error } = await _supabase
            .from('ai_agent_documents')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        aiDocuments = data || []; // Update global state
        renderAIDocuments(data);
    } catch (e) {
        console.error('Erro ao carregar documentos:', e);
    }
}

function renderAIDocuments(docs) {
    const tbody = document.getElementById('ai-documents-table-body');
    if (!tbody) return;

    if (!docs || docs.length === 0) {
        tbody.innerHTML = `
            <tr class="empty-state">
                <td colspan="5">
                    <div class="empty-content">
                        <i data-lucide="file-text"></i>
                        <p>Nenhum documento enviado ainda.</p>
                    </div>
                </td>
            </tr>
        `;
        lucide.createIcons();
        return;
    }

    tbody.innerHTML = docs.map(doc => `
        <tr>
            <td>
                <div style="font-weight: 600;">${doc.file_name}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">${(doc.file_size / 1024).toFixed(1)} KB</div>
            </td>
            <td>${doc.file_type.toUpperCase()}</td>
            <td>${new Date(doc.created_at).toLocaleDateString('pt-BR')}</td>
            <td>
                <label class="switch" style="transform: scale(0.8);">
                    <input type="checkbox" ${doc.is_active ? 'checked' : ''} onchange="toggleAIDocument(${doc.id}, this.checked)">
                    <span class="slider round"></span>
                </label>
            </td>
            <td class="text-right">
                <button class="btn-icon" style="color: #ef4444;" onclick="deleteAIDocument(${doc.id}, '${doc.storage_path}')">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        </tr>
    `).join('');
    lucide.createIcons();
}

window.toggleAIDocument = async function (id, isActive) {
    try {
        await _supabase.from('ai_agent_documents').update({ is_active: isActive }).eq('id', id);
        // Sync local state
        const docIndex = aiDocuments.findIndex(d => d.id === id);
        if (docIndex !== -1) {
            aiDocuments[docIndex].is_active = isActive;
        }
    } catch (e) {
        showNotification('Erro ao atualizar documento', 'error');
    }
}

window.deleteAIDocument = async function (id, path) {
    if (!confirm('Tem certeza que deseja excluir este documento?')) return;
    try {
        await _supabase.storage.from('ai_files').remove([path]);
        await _supabase.from('ai_agent_documents').delete().eq('id', id);
        loadAIDocuments();
        showNotification('Documento excluído', 'success');
    } catch (e) {
        showNotification('Erro ao excluir documento', 'error');
    }
}

// --- PROMPT PREVIEW LOGIC ---

window.openPromptPreview = function () {
    const personality = document.getElementById('ai-personality').value || '[Não configurado]';
    const characteristics = document.getElementById('ai-characteristics').value || '[Não configurado]';
    const toneSelect = document.getElementById('ai-tone');
    const tone = toneSelect.options[toneSelect.selectedIndex].text;
    const systemPrompt = document.getElementById('ai-system-prompt').value || '[Vazio]';

    // Get active documents from local state
    const activeDocs = aiDocuments
        .filter(doc => doc.is_active)
        .map(doc => doc.file_name);

    const docsText = activeDocs.length > 0
        ? activeDocs.join('\n- ')
        : 'Nenhum documento ativo no momento.';

    const finalPrompt = `Você é um agente configurado com:
Personalidade: ${personality}
Características: ${characteristics}
Tom de voz: ${tone}

Instruções principais:
${systemPrompt}

Base de conhecimento disponível:
- ${docsText}`;

    document.getElementById('final-prompt-text').textContent = finalPrompt;
    document.getElementById('prompt-preview-modal').classList.add('active');
    lucide.createIcons();
}

window.closePromptPreview = function () {
    document.getElementById('prompt-preview-modal').classList.remove('active');
}

window.copyFinalPrompt = function () {
    const text = document.getElementById('final-prompt-text').textContent;
    navigator.clipboard.writeText(text).then(() => {
        showNotification('Prompt copiado para a área de transferência!', 'success');
    }).catch(err => {
        console.error('Erro ao copiar:', err);
        showNotification('Erro ao copiar prompt', 'error');
    });
}

window.testAIWithKnowledgeBase = async function () {
    const inputEl = document.getElementById('ai-test-input');
    const message = inputEl ? inputEl.value.trim() : '';

    if (!message) return;

    const activeDocs = aiDocuments.filter(d => d.is_active);
    if (activeDocs.length === 0) {
        showNotification('Nenhum documento ativo na base de dados!', 'warning');
        return;
    }

    addChatMessage(message, 'outgoing');
    inputEl.value = '';

    const typingIndicator = document.getElementById('ai-typing-indicator');
    if (typingIndicator) typingIndicator.style.display = 'flex';

    try {
        const config = getAIConfigPayload();
        const responseData = await sendToN8N('ai_knowledge_query', {
            message: message,
            prompt: message,
            ...config,
            whatsappNumber: "00000000000",
            isTest: true,
            fromMe: true,
            messageType: 'text'
        });

        if (typingIndicator) typingIndicator.style.display = 'none';

        const getResponseText = (data) => {
            if (!data) return null;
            const body = Array.isArray(data) ? data[0] : data;
            return body.output || body.response || body.text || body.message || body.data ||
                (typeof body === 'string' ? body : null);
        };

        const responseText = getResponseText(responseData);
        if (responseText) {
            addChatMessage(`📚 [Base de Dados]: ${responseText}`, 'incoming');
        } else {
            addChatMessage('⚠️ Erro RAG: Formato não reconhecido.', 'incoming');
        }
    } catch (e) {
        if (typingIndicator) typingIndicator.style.display = 'none';
        addChatMessage(`❌ Erro RAG: ${e.message}`, 'incoming');
    }
}

// --- BROADCAST LOGIC ---

function updateBroadcastPreview() {
    const limitInput = document.getElementById('broadcast-limit');
    const intervalMinInput = document.getElementById('broadcast-interval-min');
    const intervalMaxInput = document.getElementById('broadcast-interval-max');
    const filterStatusInput = document.getElementById('broadcast-filter-status');
    const timeStartInput = document.getElementById('broadcast-time-start');
    const timeEndInput = document.getElementById('broadcast-time-end');

    if (!limitInput) return;

    const limit = parseInt(limitInput.value) || 50;
    const intervalMin = parseInt(intervalMinInput.value) || 30;
    const intervalMax = parseInt(intervalMaxInput.value) || 90;
    const filterStatus = filterStatusInput.value;

    // Filter leads
    const filterType = document.getElementById('broadcast-filter-type')?.value || 'all';
    const filterCity = document.getElementById('broadcast-filter-city')?.value || 'all';
    const filterDate = document.getElementById('broadcast-filter-date')?.value || '';

    let eligibleLeads = leadsData.filter(l => {
        // Status Filter
        let matchStatus = filterStatus === 'all';
        if (!matchStatus) {
            const lStatus = (l.status || '').toUpperCase();
            const fStatus = filterStatus.toUpperCase();
            matchStatus = lStatus === fStatus || lStatus.includes(fStatus) || fStatus.includes(lStatus);
        }

        // Type Filter (some sheets use status as type)
        let matchType = filterType === 'all';
        if (!matchType) {
            const lStatus = (l.status || '').toUpperCase();
            matchType = lStatus.includes(filterType.toUpperCase());
        }

        // City Filter
        let matchCity = filterCity === 'all';
        if (!matchCity) {
            matchCity = l.cidade === filterCity;
        }

        // Date Filter (simple string check for now)
        let matchDate = !filterDate;
        if (filterDate) {
            const fDate = new Date(filterDate).toLocaleDateString('pt-BR');
            matchDate = l.dataCadastro === fDate;
        }

        return matchStatus && matchType && matchCity && matchDate;
    });

    const count = Math.min(eligibleLeads.length, limit);
    const avgInterval = (intervalMin + intervalMax) / 2;
    const totalMinutes = Math.round((count * avgInterval) / 60);

    const previewCountEl = document.getElementById('broadcast-preview-count');
    const previewTimeEl = document.getElementById('broadcast-preview-time');

    if (previewCountEl) previewCountEl.textContent = isBroadcasting ? broadcastQueue.length : count;
    if (previewTimeEl) previewTimeEl.textContent = totalMinutes > 60
        ? `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}min`
        : `${totalMinutes} min`;

    broadcastConfig = {
        limit,
        intervalMin,
        intervalMax,
        timeStart: timeStartInput.value,
        timeEnd: timeEndInput.value,
        filterStatus,
        message: document.getElementById('broadcast-message')?.value || '',
        messageType: document.getElementById('broadcast-type')?.value || 'text',
        mediaUrl: document.getElementById('broadcast-media-url')?.value || ''
    };
}

window.toggleMediaUrlField = function () {
    const type = document.getElementById('broadcast-type').value;
    const mediaGroup = document.getElementById('media-url-group');
    if (mediaGroup) {
        mediaGroup.style.display = type === 'text' ? 'none' : 'block';
    }
    updateBroadcastPreview();
}


window.insertVar = function (variable) {
    const textarea = document.getElementById('broadcast-message');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const after = text.substring(end, text.length);

    textarea.value = before + variable + after;
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + variable.length;
    updateBroadcastPreview();
}


function saveBroadcastConfig() {
    updateBroadcastPreview();
    localStorage.setItem('passionpro_broadcast_config', JSON.stringify(broadcastConfig));
    showNotification('Configuração de disparo salva!', 'success');
}

function toggleBroadcast() {
    if (isBroadcasting) {
        stopBroadcast();
    } else {
        startBroadcast();
    }
}

async function startBroadcast() {
    updateBroadcastPreview();

    if (leadsData.length === 0) {
        showNotification('Importe uma planilha primeiro!', 'error');
        return;
    }

    const filterStatus = broadcastConfig.filterStatus;
    const filterType = document.getElementById('broadcast-filter-type')?.value || 'all';
    const filterCity = document.getElementById('broadcast-filter-city')?.value || 'all';
    const filterDate = document.getElementById('broadcast-filter-date')?.value || '';

    let eligibleLeads = leadsData.filter(l => {
        // Status Filter
        let matchStatus = filterStatus === 'all';
        if (!matchStatus) {
            const lStatus = (l.status || '').toUpperCase();
            const fStatus = filterStatus.toUpperCase();
            matchStatus = lStatus === fStatus || lStatus.includes(fStatus) || fStatus.includes(lStatus);
        }

        // Type Filter
        let matchType = filterType === 'all';
        if (!matchType) {
            const lStatus = (l.status || '').toUpperCase();
            matchType = lStatus.includes(filterType.toUpperCase());
        }

        // City Filter
        let matchCity = filterCity === 'all';
        if (!matchCity) {
            matchCity = l.cidade === filterCity;
        }

        // Date Filter
        let matchDate = !filterDate;
        if (filterDate) {
            const fDate = new Date(filterDate).toLocaleDateString('pt-BR');
            matchDate = l.dataCadastro === fDate;
        }

        return matchStatus && matchType && matchCity && matchDate;
    });

    broadcastQueue = eligibleLeads.slice(0, broadcastConfig.limit);

    if (broadcastQueue.length === 0) {
        showNotification('Nenhum contato elegível para os filtros selecionados.', 'warning');
        return;
    }

    // 1. Criar registro da Campanha no Supabase para rastreamento
    try {
        const campaignNameInput = document.getElementById('broadcast-campaign-name');
        const campaignName = (campaignNameInput && campaignNameInput.value) ? campaignNameInput.value : `Campanha ${new Date().toLocaleString('pt-BR')}`;

        const { data: campaign, error } = await _supabase.from('campaigns').insert([{
            name: campaignName,
            message_template: broadcastConfig.message,
            status: 'active'
        }]).select().single();

        if (error) throw error;
        currentCampaignId = campaign.id;
        console.log('Campanha iniciada com ID:', currentCampaignId);
    } catch (err) {
        console.error('Erro ao criar campanha:', err);
        showNotification('Erro ao iniciar rastreamento de campanha. O disparo continuará sem rastreio.', 'warning');
        currentCampaignId = null;
    }

    isBroadcasting = true;
    const btn = document.getElementById('btn-start-broadcast');
    if (btn) {
        btn.innerHTML = '<i data-lucide="pause-circle"></i> Parar Disparo';
        btn.style.background = 'var(--status-sumiu)';
        lucide.createIcons();
    }

    showNotification(`Iniciando disparo para ${broadcastQueue.length} contatos...`, 'info');
    runBroadcastCycle();
}

function stopBroadcast() {
    isBroadcasting = false;
    if (broadcastTimer) clearTimeout(broadcastTimer);

    const btn = document.getElementById('btn-start-broadcast');
    if (btn) {
        btn.innerHTML = '<i data-lucide="play-circle"></i> Iniciar Disparo';
        btn.style.background = 'var(--status-novo)';
        lucide.createIcons();
    }

    showNotification('Disparo finalizado ou interrompido.', 'warning');
    updateBroadcastPreview();
}

async function runBroadcastCycle() {
    if (!isBroadcasting || broadcastQueue.length === 0) {
        if (broadcastQueue.length === 0 && isBroadcasting) {
            showNotification('Disparo concluído!', 'success');

            // Atualizar status da campanha para finalizada
            if (currentCampaignId) {
                _supabase.from('campaigns').update({ status: 'finished' }).eq('id', currentCampaignId)
                    .then(() => console.log('Campanha marcada como finalizada.'))
                    .catch(err => console.error('Erro ao finalizar campanha:', err));
            }

            // Webhook de finalização
            sendToN8N('broadcast_finished', {
                config: broadcastConfig,
                campaignId: currentCampaignId,
                fromMe: true,
                isGroup: false,
                timestamp: new Date().toISOString()
            }).catch(e => console.error('Erro ao enviar finalização para n8n:', e));

            stopBroadcast();
        }
        return;
    }


    // Check time window
    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    if (currentTime < broadcastConfig.timeStart || currentTime > broadcastConfig.timeEnd) {
        console.log('Outside time window, waiting 1 minute...');
        broadcastTimer = setTimeout(runBroadcastCycle, 60000);
        return;
    }

    // Proccess one lead
    const lead = broadcastQueue.shift();

    // Processar variáveis na mensagem
    let finalMessage = broadcastConfig.message || '';
    if (finalMessage) {
        finalMessage = finalMessage
            .replace(/{{nome}}/g, lead.nome || '')
            .replace(/{{tipo}}/g, lead.status || '')
            .replace(/{{cidade}}/g, lead.cidade || '')
            .replace(/{{telefone}}/g, lead.telefone || '')
            .replace(/{{proxima_acao}}/g, lead.nextActionDate ? formatDateBr(lead.nextActionDate) : '');
    }

    console.log(`Enviando lead para processamento no n8n: ${lead.nome}`);

    // Integração com n8n para o disparo
    try {
        console.log(`🚀 Iniciando processo de envio para: ${lead.nome} (${lead.telefone})`);

        // 1. Enviar para o n8n primeiro (Prioridade)
        const config = getAIConfigPayload();
        const n8nPayload = {
            lead: lead,
            whatsappNumber: formatPhoneForWA(lead.telefone),
            message: finalMessage,
            rawMessage: broadcastConfig.message,
            config: broadcastConfig,
            ai_config: config, // Envia a personalidade atual para o disparo
            campaignId: currentCampaignId,
            vendedora: JSON.parse(localStorage.getItem('passionpro_session')),
            fromMe: true,
            isGroup: false,
            isMassSending: true,
            messageType: broadcastConfig.messageType || 'text',
            mediaUrl: broadcastConfig.mediaUrl || ''
        };

        // Não usamos await aqui se quisermos que seja ultra rápido, 
        // mas como é um loop com intervalo, o await é mais seguro para não atropelar
        const n8nResponse = await sendToN8N('broadcast_lead', n8nPayload);
        console.log('✅ Resposta do n8n recebida:', n8nResponse);

        // 2. Registrar o envio no Supabase (Segundo plano/Opcional)
        if (currentCampaignId) {
            _supabase.from('campaign_dispatches').insert([{
                campaign_id: currentCampaignId,
                contact_phone: formatPhoneForWA(lead.telefone),
                status: 'sent',
                sent_at: new Date().toISOString()
            }]).then(({ error }) => {
                if (error) console.error('Erro ao registrar dispatch no Supabase:', error);
                else console.log('📊 Dispatch registrado no Supabase.');
            });
        }
    } catch (error) {
        console.error('❌ Falha Crítica no ciclo de disparo:', error);
        showNotification(`Erro ao enviar para ${lead.nome}. Verifique o console.`, 'error');
    }


    await incrementContactCount();
    updateBroadcastPreview(); // Update numbers in UI

    // Schedule next
    const intMin = parseInt(broadcastConfig.intervalMin) || 30;
    const intMax = parseInt(broadcastConfig.intervalMax) || 90;
    const randomInterval = Math.floor(Math.random() * (intMax - intMin + 1)) + intMin;
    console.log(`Próximo envio em ${randomInterval} segundos`);
    broadcastTimer = setTimeout(runBroadcastCycle, randomInterval * 1000);
}

// Helper to format phone for WhatsApp (55 + DDD + Number)
function formatPhoneForWA(phone) {
    if (!phone) return '';
    let cleaned = phone.toString().replace(/\D/g, '');

    // Regra para Brasil: se tiver 10 ou 11 dígitos, adiciona o 55
    if (cleaned.length === 10 || cleaned.length === 11) {
        if (!cleaned.startsWith('55')) {
            cleaned = '55' + cleaned;
        }
    }
    return cleaned;
}

// Helper to get n8n URL from config
function getN8nUrl() {
    const urlInput = document.getElementById('n8n-webhook-url');
    if (urlInput && urlInput.value) {
        return urlInput.value;
    }
    // Fallback to default
    return 'https://adryanlife.app.n8n.cloud/webhook/sistemafolowup';
}

// Helper to send data to n8n
async function sendToN8N(event, data) {
    // Detect if running via file:// protocol
    if (window.location.protocol === 'file:') {
        console.warn('⚠️ Alerta: Você está executando o sistema via protocolo file://. Isso pode causar erros de CORS com o n8n.');
    }

    const fromMe = data.fromMe === true;
    const isGroup = data.isGroup === true;

    const targetUrl = getN8nUrl();
    console.group(`n8n Request: ${event}`);
    console.log('URL:', targetUrl);
    console.log('Payload:', data);

    try {
        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event: event,
                fromMe: fromMe,
                isGroup: isGroup,
                data: data,
                timestamp: new Date().toISOString()
            })
        });

        console.log('Response Status:', response.status);
        console.groupEnd();

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Erro n8n (${response.status}): ${errorText || 'Sem resposta'}`);
        }

        const text = await response.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            return { message: text };
        }
    } catch (e) {
        console.error('Erro ao enviar para n8n:', e);
        console.groupEnd();
        if (e.message.includes('Failed to fetch')) {
            let msg = 'Erro de Conexão: Bloqueio de Segurança (CORS) ou URL inválida.';
            if (window.location.protocol === 'file:') {
                msg = 'Erro: O navegador bloqueou o envio porque o arquivo está aberto localmente. Tente rodar como servidor local ou verifique o CORS do n8n.';
            }
            showNotification(msg, 'error');
        } else {
            showNotification(`Erro n8n: ${e.message}`, 'error');
        }
        throw e;
    }
}

// Helper to toggle n8n test/prod mode
window.toggleN8nMode = function (isTest) {
    isN8nTestMode = isTest;
    const urlInput = document.getElementById('n8n-webhook-url');
    const badge = document.getElementById('n8n-status-badge');
    const badgeText = badge ? badge.querySelector('span') : null;

    if (isTest) {
        if (urlInput) {
            urlInput.value = urlInput.value.replace('/webhook/', '/webhook-test/');
            // Caso não tenha /webhook/ para substituir, mas o usuário queira modo teste
            if (!urlInput.value.includes('/webhook-test/')) {
                urlInput.value = urlInput.value.replace('webhook', 'webhook-test');
            }
        }
        if (badge) {
            badge.style.background = 'var(--status-conversa)';
            if (badgeText) badgeText.textContent = 'Modo Teste';
        }
        showNotification('Modo de Teste ativado! Certifique-se de usar "Listen for test event" no n8n.', 'info');
    } else {
        if (urlInput) {
            urlInput.value = urlInput.value.replace('/webhook-test/', '/webhook/');
        }
        if (badge) {
            badge.style.background = 'var(--status-novo)';
            if (badgeText) badgeText.textContent = 'Produção';
        }
        showNotification('Modo Produção ativado! O Workflow deve estar ATIVO no n8n.', 'success');
    }
}

// Helper to test webhook connection
window.testWebhookConnection = async function () {
    showNotification('Testando conexão com n8n...', 'info');
    try {
        const result = await sendToN8N('ping_test', {
            message: 'Teste de conexão do sistema',
            fromMe: true,
            isGroup: false
        });
        console.log('Webhook test result:', result);
        showNotification('✅ Conexão estabelecida com sucesso!', 'success');
    } catch (e) {
        console.error('Falha no teste de webhook:', e);
        const targetUrl = getN8nUrl();
        const curlCmd = `curl -X POST "${targetUrl}" -H "Content-Type: application/json" -d '{"event":"ping_test","message":"Teste manual"}'`;

        showNotification(`❌ Erro: ${e.message}`, 'error');

        // Oferecer cópia do comando CURL para teste fora do navegador
        if (confirm(`Falha no navegador (provavelmente CORS). Deseja copiar um comando CURL para testar no seu terminal/CMD? Isso confirma se o n8n está recebendo dados.`)) {
            navigator.clipboard.writeText(curlCmd);
            showNotification('Comando CURL copiado! Cole no Prompt de Comando/Terminal.', 'success');
        }
    }
}

function loadBroadcastConfig() {
    const saved = localStorage.getItem('passionpro_broadcast_config');
    if (saved) {
        try {
            const config = JSON.parse(saved);
            broadcastConfig = {
                ...broadcastConfig,
                ...config,
                limit: parseInt(config.limit) || 50,
                intervalMin: parseInt(config.intervalMin) || 30,
                intervalMax: parseInt(config.intervalMax) || 90
            };

            // Update UI
            if (document.getElementById('broadcast-limit')) document.getElementById('broadcast-limit').value = config.limit;
            if (document.getElementById('broadcast-interval-min')) document.getElementById('broadcast-interval-min').value = config.intervalMin;
            if (document.getElementById('broadcast-interval-max')) document.getElementById('broadcast-interval-max').value = config.intervalMax;
            if (document.getElementById('broadcast-time-start')) document.getElementById('broadcast-time-start').value = config.timeStart;
            if (document.getElementById('broadcast-time-end')) document.getElementById('broadcast-time-end').value = config.timeEnd;
            if (document.getElementById('broadcast-filter-status')) document.getElementById('broadcast-filter-status').value = config.filterStatus;
            if (document.getElementById('broadcast-message')) document.getElementById('broadcast-message').value = config.message || '';
            if (document.getElementById('broadcast-type')) document.getElementById('broadcast-type').value = config.messageType || 'text';
            if (document.getElementById('broadcast-media-url')) document.getElementById('broadcast-media-url').value = config.mediaUrl || '';

            toggleMediaUrlField();
            updateBroadcastPreview();
        } catch (e) {
            console.error('Erro ao carregar config de disparo:', e);
        }
    }
}

