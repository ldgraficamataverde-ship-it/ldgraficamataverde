const socket = io();

// Estado
let currentUser = null;
let currentClient = null;
let isEmployee = false;
let isClient = false;
let pedidoConfirmado = false;
let pagamentoConfirmado = false;

// ===== DOM ELEMENTS =====
// Login
const loginScreen = document.getElementById('loginScreen');
const clientScreen = document.getElementById('clientScreen');
const employeeScreen = document.getElementById('employeeScreen');
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// Login Cliente
const clientNameInput = document.getElementById('clientName');
const btnClientLogin = document.getElementById('btnClientLogin');
const clientLoginStatus = document.getElementById('clientLoginStatus');

// Login Funcionário
const employeeUserInput = document.getElementById('employeeUser');
const employeePassInput = document.getElementById('employeePass');
const btnEmployeeLogin = document.getElementById('btnEmployeeLogin');
const employeeLoginStatus = document.getElementById('employeeLoginStatus');

// Cliente
const clientDisplayName = document.getElementById('clientDisplayName');
const clientMessages = document.getElementById('clientMessages');
const clientChatInput = document.getElementById('clientChatInput');
const btnClientSend = document.getElementById('btnClientSend');
const btnClientLogout = document.getElementById('btnClientLogout');
const clientStatusBadge = document.getElementById('clientStatusBadge');
const clientTempo = document.getElementById('clientTempo');
const clientPagamento = document.getElementById('clientPagamento');
const clientArtePronta = document.getElementById('clientArtePronta');
const btnClientPagar = document.getElementById('btnClientPagar');

// Funcionário
const employeeDisplayName = document.getElementById('employeeDisplayName');
const employeeMessages = document.getElementById('employeeMessages');
const employeeChatInput = document.getElementById('employeeChatInput');
const btnEmployeeSend = document.getElementById('btnEmployeeSend');
const btnEmployeeLogout = document.getElementById('btnEmployeeLogout');
const clientListContainer = document.getElementById('clientListContainer');
const employeeChatClient = document.getElementById('employeeChatClient');
const employeeClientStatus = document.getElementById('employeeClientStatus');
const employeeStatusBadge = document.getElementById('employeeStatusBadge');
const employeeTempo = document.getElementById('employeeTempo');

// ===== TABS LOGIN =====
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        tabContents.forEach(tc => tc.classList.remove('active'));
        const target = document.getElementById(tab.dataset.tab);
        if (target) target.classList.add('active');
    });
});

// ===== LOGIN CLIENTE =====
btnClientLogin.addEventListener('click', loginCliente);
clientNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loginCliente();
});

function loginCliente() {
    const name = clientNameInput.value.trim();
    if (name.length < 3) {
        showStatus(clientLoginStatus, 'Digite seu nome completo', 'error');
        return;
    }
    
    currentClient = name;
    isClient = true;
    isEmployee = false;
    
    // Mudar para tela do cliente
    switchScreen('client');
    clientDisplayName.textContent = name;
    clientNameInput.disabled = true;
    btnClientLogin.disabled = true;
    
    socket.emit('client-join', { clientName: name });
    enableClientChat(true);
    
    showStatus(clientLoginStatus, `✅ Conectado como ${name}`, 'success');
}

// ===== LOGIN FUNCIONÁRIO =====
btnEmployeeLogin.addEventListener('click', loginFuncionario);
employeePassInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loginFuncionario();
});

async function loginFuncionario() {
    const username = employeeUserInput.value.trim();
    const password = employeePassInput.value.trim();
    
    if (!username || !password) {
        showStatus(employeeLoginStatus, 'Preencha todos os campos', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (data.success) {
            isEmployee = true;
            isClient = false;
            currentUser = data.user;
            
            switchScreen('employee');
            employeeDisplayName.textContent = `👨‍💼 ${data.user.name}`;
            employeeUserInput.disabled = true;
            employeePassInput.disabled = true;
            btnEmployeeLogin.disabled = true;
            
            socket.emit('employee-join', { username, name: data.user.name });
            showStatus(employeeLoginStatus, `✅ Logado como ${data.user.name}`, 'success');
            
            // Carregar lista de clientes
            updateClientList();
        } else {
            showStatus(employeeLoginStatus, '❌ Credenciais inválidas', 'error');
        }
    } catch (error) {
        showStatus(employeeLoginStatus, '❌ Erro ao fazer login', 'error');
    }
}

// ===== TROCAR TELA =====
function switchScreen(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    if (screen === 'client') {
        clientScreen.classList.add('active');
    } else if (screen === 'employee') {
        employeeScreen.classList.add('active');
    } else {
        loginScreen.classList.add('active');
    }
}

// ===== STATUS =====
function showStatus(element, message, type) {
    element.textContent = message;
    element.className = 'status-msg show ' + type;
}

// ===== CLIENTE - ENVIAR MENSAGEM =====
btnClientSend.addEventListener('click', sendClientMessage);
clientChatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendClientMessage();
});

function sendClientMessage() {
    const message = clientChatInput.value.trim();
    if (!message || !isClient) return;
    
    socket.emit('client-message', { clientName: currentClient, message });
    addMessage(clientMessages, message, 'Cliente', 'cliente');
    clientChatInput.value = '';
    
    verificarServico(message);
}

function enableClientChat(enable) {
    clientChatInput.disabled = !enable;
    btnClientSend.disabled = !enable;
}

// ===== FUNCIONÁRIO - ENVIAR MENSAGEM =====
btnEmployeeSend.addEventListener('click', sendEmployeeMessage);
employeeChatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendEmployeeMessage();
});

function sendEmployeeMessage() {
    const message = employeeChatInput.value.trim();
    if (!message || !isEmployee || !currentClient) return;
    
    socket.emit('employee-message', { 
        clientName: currentClient, 
        message, 
        employeeName: currentUser.name 
    });
    addMessage(employeeMessages, message, currentUser.name, 'funcionario');
    employeeChatInput.value = '';
}

// ===== ADICIONAR MENSAGEM =====
function addMessage(container, message, sender, type) {
    const div = document.createElement('div');
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    
    let className = 'msg';
    if (type === 'cliente') className += ' msg-cliente';
    else if (type === 'funcionario') className += ' msg-funcionario';
    else className += ' msg-system';
    
    div.className = className;
    div.innerHTML = `<strong>${sender}</strong> (${timestamp}): ${message}`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

// ===== VERIFICAR SERVIÇO =====
function verificarServico(message) {
    const lower = message.toLowerCase();
    const servicos = ['lona', 'vinil', 'laser', 'recorte', 'impressão', 'banner', 'adesivo'];
    
    if (servicos.some(s => lower.includes(s)) && !pedidoConfirmado) {
        pedidoConfirmado = true;
        setTimeout(() => {
            addMessage(clientMessages, '✅ Serviço identificado!', 'Sistema', 'system');
            addMessage(clientMessages, '📋 Vamos confirmar seu pedido.', 'Sistema', 'system');
            
            clientStatusBadge.textContent = '📋 Serviço confirmado';
            clientStatusBadge.className = 'status-badge';
            clientTempo.textContent = '⏳ aguardando arte';
            
            // Simular arte pronta
            setTimeout(() => {
                clientArtePronta.style.display = 'block';
                clientPagamento.style.display = 'flex';
                clientStatusBadge.textContent = '🎨 ARTE PRONTA';
                addMessage(clientMessages, '🎨 Arte pronta! Realize o pagamento.', 'Sistema', 'system');
            }, 8000);
        }, 1000);
    }
}

// ===== PAGAMENTO =====
btnClientPagar.addEventListener('click', () => {
    if (pagamentoConfirmado) return;
    
    pagamentoConfirmado = true;
    clientStatusBadge.textContent = '🟠 EM PRODUÇÃO';
    clientStatusBadge.className = 'status-badge em-producao';
    clientTempo.textContent = '⏱️ 45 min';
    clientPagamento.style.display = 'none';
    clientArtePronta.style.display = 'none';
    btnClientPagar.disabled = true;
    
    addMessage(clientMessages, '✅ Pagamento confirmado!', 'Sistema', 'system');
    addMessage(clientMessages, '⏱️ Tempo estimado: 45 minutos.', 'Sistema', 'system');
});

// ===== LISTA DE CLIENTES =====
function updateClientList() {
    if (!isEmployee) return;
    
    fetch('/api/clients')
        .then(res => res.json())
        .then(clients => {
            clientListContainer.innerHTML = '';
            if (clients.length === 0) {
                clientListContainer.innerHTML = '<div style="color:#555;text-align:center;padding:20px;">Nenhum cliente ainda</div>';
                return;
            }
            
            clients.forEach((client, index) => {
                const div = document.createElement('div');
                div.className = 'client-item';
                if (client === currentClient) div.classList.add('active');
                
                // Verifica se é novo (primeiro da lista)
                const isNew = index === 0;
                
                div.innerHTML = `
                    <span class="name">${client}</span>
                    <span class="status-dot online"></span>
                    ${isNew ? '<span class="badge-novo">NOVO</span>' : ''}
                `;
                
                div.addEventListener('click', () => {
                    currentClient = client;
                    employeeChatClient.textContent = client;
                    employeeClientStatus.textContent = '🟢 online';
                    employeeClientStatus.className = 'status-badge online';
                    
                    // Habilitar chat
                    employeeChatInput.disabled = false;
                    btnEmployeeSend.disabled = false;
                    
                    // Carregar histórico
                    fetch(`/api/conversations/${client}`)
                        .then(res => res.json())
                        .then(messages => {
                            employeeMessages.innerHTML = '';
                            messages.forEach(msg => {
                                const type = msg.sender === 'Cliente' ? 'cliente' : 'funcionario';
                                addMessage(employeeMessages, msg.message, msg.sender, type);
                            });
                        });
                    
                    // Atualizar lista
                    updateClientList();
                });
                
                clientListContainer.appendChild(div);
            });
        })
        .catch(err => console.error('Erro:', err));
}

// ===== SOCKET EVENTS =====
socket.on('chat-history', (messages) => {
    if (isClient) {
        clientMessages.innerHTML = '';
        messages.forEach(msg => {
            const type = msg.sender === 'Cliente' ? 'cliente' : 'funcionario';
            addMessage(clientMessages, msg.message, msg.sender, type);
        });
    }
});

socket.on('new-message', (data) => {
    if (isClient && currentClient === data.clientName) {
        const type = data.sender === 'Cliente' ? 'cliente' : 'funcionario';
        addMessage(clientMessages, data.message, data.sender, type);
    } else if (isEmployee) {
        if (currentClient === data.clientName) {
            const type = data.sender === 'Cliente' ? 'cliente' : 'funcionario';
            addMessage(employeeMessages, data.message, data.sender, type);
        }
        updateClientList();
    }
});

socket.on('update-client-list', () => {
    if (isEmployee) updateClientList();
});

socket.on('client-online', (data) => {
    if (isEmployee) {
        updateClientList();
        if (currentClient === data.clientName) {
            employeeClientStatus.textContent = '🟢 online';
            employeeClientStatus.className = 'status-badge online';
        }
    }
});

socket.on('client-offline', (data) => {
    if (isEmployee) {
        updateClientList();
        if (currentClient === data.clientName) {
            employeeClientStatus.textContent = '🔴 offline';
            employeeClientStatus.className = 'status-badge';
        }
    }
});

socket.on('employee-message-sent', (data) => {
    if (isEmployee && currentClient === data.clientName) {
        addMessage(employeeMessages, data.message, data.sender, 'funcionario');
    }
});

// ===== LOGOUT =====
btnClientLogout.addEventListener('click', logout);
btnEmployeeLogout.addEventListener('click', logout);

function logout() {
    isClient = false;
    isEmployee = false;
    currentClient = null;
    currentUser = null;
    pedidoConfirmado = false;
    pagamentoConfirmado = false;
    
    // Resetar campos
    clientNameInput.disabled = false;
    btnClientLogin.disabled = false;
    employeeUserInput.disabled = false;
    employeePassInput.disabled = false;
    btnEmployeeLogin.disabled = false;
    clientNameInput.value = '';
    clientChatInput.value = '';
    employeeChatInput.value = '';
    clientMessages.innerHTML = '';
    employeeMessages.innerHTML = '';
    clientPagamento.style.display = 'none';
    clientArtePronta.style.display = 'none';
    clientStatusBadge.textContent = '⏳ Aguardando';
    clientStatusBadge.className = 'status-badge';
    clientTempo.textContent = '-- min';
    employeeStatusBadge.textContent = '⏳ Aguardando';
    employeeStatusBadge.className = 'status-badge';
    employeeTempo.textContent = '-- min';
    employeeChatClient.textContent = 'Selecione um cliente';
    employeeClientStatus.textContent = 'offline';
    employeeClientStatus.className = 'status-badge';
    employeeChatInput.disabled = true;
    btnEmployeeSend.disabled = true;
    clientLoginStatus.className = 'status-msg';
    employeeLoginStatus.className = 'status-msg';
    
    // Voltar para login
    switchScreen('login');
    
    // Resetar tabs
    tabs.forEach(t => t.classList.remove('active'));
    document.querySelector('.tab[data-tab="cliente"]').classList.add('active');
    tabContents.forEach(tc => tc.classList.remove('active'));
    document.getElementById('loginCliente').classList.add('active');
}

// ===== INICIAR =====
enableClientChat(false);
employeeChatInput.disabled = true;
btnEmployeeSend.disabled = true;
switchScreen('login');

console.log('🚀 Sistema LD Gráfica');
console.log('👤 Funcionário: Dinho | Senha: 123456');