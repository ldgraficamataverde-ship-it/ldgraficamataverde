const socket = io();

// Estado
let currentUser = null;
let currentClient = null;
let isEmployee = false;
let isClient = false;
let chatHistory = [];
let pedidoConfirmado = false;
let pagamentoConfirmado = false;

// DOM elements
const clientNameInput = document.getElementById('clientNameInput');
const btnClientEnter = document.getElementById('btnClientEnter');
const clientStatus = document.getElementById('clientStatus');
const employeeUsername = document.getElementById('employeeUsername');
const employeePassword = document.getElementById('employeePassword');
const btnEmployeeLogin = document.getElementById('btnEmployeeLogin');
const employeeStatus = document.getElementById('employeeStatus');
const btnToggleEmployee = document.getElementById('btnToggleEmployeeLogin');
const employeeLoginForm = document.getElementById('employeeLoginForm');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const btnSendChat = document.getElementById('btnSendChat');
const chatClientName = document.getElementById('chatClientName');
const chatStatus = document.getElementById('chatStatus');
const headerStatus = document.getElementById('headerStatus');
const clientList = document.getElementById('clientList');
const clientsContainer = document.getElementById('clientsContainer');

// Painel do pedido
const pedidoPainel = document.getElementById('pedidoPainel');
const statusBadge = document.getElementById('statusBadge');
const clientePedido = document.getElementById('clientePedido');
const tempoRestante = document.getElementById('tempoRestante');
const pagamentoArea = document.getElementById('pagamentoArea');
const avisoArtePronta = document.getElementById('avisoArtePronta');
const btnPagar = document.getElementById('btnPagar');

// ========== CLIENTE - Entrar no chat ==========
btnClientEnter.addEventListener('click', () => {
    const name = clientNameInput.value.trim();
    if (name.length < 3) {
        alert('Digite seu nome completo (mínimo 3 caracteres)');
        return;
    }
    
    currentClient = name;
    isClient = true;
    isEmployee = false;
    
    clientNameInput.disabled = true;
    btnClientEnter.disabled = true;
    clientStatus.textContent = `✅ Conectado como: ${name}`;
    clientStatus.style.background = '#2ecc71';
    clientStatus.style.color = 'white';
    
    socket.emit('client-join', { clientName: name });
    chatClientName.textContent = name;
    clientePedido.textContent = name;
    headerStatus.textContent = '🟢 online';
    headerStatus.style.color = '#2ecc71';
    headerStatus.style.borderColor = '#2ecc71';
    
    enableChat(true);
    
    // Mensagem automática de boas-vindas
    setTimeout(() => {
        addMessageToChat('👋 Olá! Bem-vindo à LD Gráfica!', 'Sistema', 'sistema');
        addMessageToChat('📌 Descreva seu serviço:', 'Sistema', 'sistema');
        addMessageToChat('🎯 Opções disponíveis:', 'Sistema', 'sistema');
        addMessageToChat('• Impressão em Lona', 'Sistema', 'sistema');
        addMessageToChat('• Impressão em Vinil', 'Sistema', 'sistema');
        addMessageToChat('• Recorte a Laser', 'Sistema', 'sistema');
        addMessageToChat('💬 Digite qual serviço você deseja:', 'Sistema', 'sistema');
    }, 500);
});

// ========== FUNCIONÁRIO - Toggle login ==========
btnToggleEmployee.addEventListener('click', () => {
    const isVisible = employeeLoginForm.style.display !== 'none';
    employeeLoginForm.style.display = isVisible ? 'none' : 'block';
    btnToggleEmployee.textContent = isVisible ? '👨‍💼 Área do Funcionário' : '👨‍💼 Ocultar Login';
});

// ========== FUNCIONÁRIO - Login ==========
btnEmployeeLogin.addEventListener('click', async () => {
    const username = employeeUsername.value.trim();
    const password = employeePassword.value.trim();
    
    if (!username || !password) {
        employeeStatus.textContent = '❌ Preencha usuário e senha';
        employeeStatus.style.background = '#e74c3c';
        employeeStatus.style.color = 'white';
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
            employeeStatus.textContent = `✅ Logado como: ${data.user.name}`;
            employeeStatus.style.background = '#2ecc71';
            employeeStatus.style.color = 'white';
            btnEmployeeLogin.disabled = true;
            employeeUsername.disabled = true;
            employeePassword.disabled = true;
            
            socket.emit('employee-join', { username, name: data.user.name });
            headerStatus.textContent = `👨‍💼 ${data.user.name}`;
            headerStatus.style.color = '#f5c800';
            headerStatus.style.borderColor = '#f5c800';
            
            clientList.style.display = 'block';
            enableChat(true);
            chatClientName.textContent = 'Selecione um cliente';
            chatStatus.textContent = '👨‍💼 funcionário';
            chatStatus.style.background = '#f5c800';
            chatStatus.style.color = '#0b0b0b';
            
            // Carregar lista de clientes
            updateClientList();
            
            addMessageToChat('👋 Olá! Você está logado como funcionário.', 'Sistema', 'sistema');
            addMessageToChat('📋 Selecione um cliente na lista para atender.', 'Sistema', 'sistema');
        } else {
            employeeStatus.textContent = '❌ Credenciais inválidas';
            employeeStatus.style.background = '#e74c3c';
            employeeStatus.style.color = 'white';
        }
    } catch (error) {
        employeeStatus.textContent = '❌ Erro ao fazer login';
        employeeStatus.style.background = '#e74c3c';
        employeeStatus.style.color = 'white';
        console.error(error);
    }
});

// ========== ENVIAR MENSAGEM ==========
btnSendChat.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) return;
    
    if (isClient && currentClient) {
        socket.emit('client-message', { clientName: currentClient, message });
        addMessageToChat(message, 'Cliente', 'cliente');
        chatInput.value = '';
        
        // Verificar se o cliente está descrevendo o serviço
        verificarServico(message);
    } else if (isEmployee && currentClient) {
        socket.emit('employee-message', { 
            clientName: currentClient, 
            message, 
            employeeName: currentUser.name 
        });
        addMessageToChat(message, currentUser.name, 'funcionario');
        chatInput.value = '';
    }
}

function enableChat(enable) {
    chatInput.disabled = !enable;
    btnSendChat.disabled = !enable;
}

function addMessageToChat(message, sender, type) {
    const div = document.createElement('div');
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    
    let className = 'msg';
    if (type === 'cliente') className += ' msg-cliente';
    else if (type === 'funcionario' || type === 'Dinho') className += ' msg-funcionario';
    else className += ' msg-sistema';
    
    div.className = className;
    div.innerHTML = `<strong>${sender}</strong> (${timestamp}): ${message}`;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ========== VERIFICAR SERVIÇO DO CLIENTE ==========
function verificarServico(message) {
    const lower = message.toLowerCase();
    const servicos = ['lona', 'vinil', 'laser', 'recorte'];
    
    if (servicos.some(s => lower.includes(s))) {
        setTimeout(() => {
            addMessageToChat('✅ Serviço identificado!', 'Sistema', 'sistema');
            addMessageToChat('📋 Vamos confirmar seu pedido.', 'Sistema', 'sistema');
            addMessageToChat('⏳ Em instantes a arte ficará pronta.', 'Sistema', 'sistema');
            
            // Atualizar painel do pedido
            pedidoConfirmado = true;
            statusBadge.textContent = '📋 Serviço confirmado';
            statusBadge.className = 'status-badge';
            tempoRestante.textContent = '⏳ aguardando arte';
            
            // Simular arte pronta após 10 segundos
            setTimeout(() => {
                avisoArtePronta.style.display = 'block';
                pagamentoArea.style.display = 'flex';
                statusBadge.textContent = '🎨 ARTE PRONTA';
                addMessageToChat('🎨 Arte pronta! Realize o pagamento.', 'Sistema', 'sistema');
                addMessageToChat('💳 Clique em "Confirmar pagamento" abaixo.', 'Sistema', 'sistema');
            }, 10000);
        }, 1000);
    }
}

// ========== PAGAMENTO ==========
btnPagar.addEventListener('click', () => {
    if (pagamentoConfirmado) return;
    
    pagamentoConfirmado = true;
    statusBadge.textContent = '🟠 EM PRODUÇÃO';
    statusBadge.className = 'status-badge em-producao';
    tempoRestante.textContent = '⏱️ 45 min';
    pagamentoArea.style.display = 'none';
    avisoArtePronta.style.display = 'none';
    btnPagar.disabled = true;
    
    addMessageToChat('✅ Pagamento confirmado! Pedido em produção.', 'Sistema', 'sistema');
    addMessageToChat('⏱️ Tempo estimado: 45 minutos.', 'Sistema', 'sistema');
});

// ========== SOCKET EVENTS ==========
socket.on('chat-history', (messages) => {
    chatMessages.innerHTML = '';
    messages.forEach(msg => {
        const type = msg.sender === 'Cliente' ? 'cliente' : 'funcionario';
        addMessageToChat(msg.message, msg.sender, type);
    });
});

socket.on('new-message', (data) => {
    if (isClient && currentClient === data.clientName) {
        const type = data.sender === 'Cliente' ? 'cliente' : 'funcionario';
        addMessageToChat(data.message, data.sender, type);
    } else if (isEmployee) {
        if (currentClient === data.clientName) {
            const type = data.sender === 'Cliente' ? 'cliente' : 'funcionario';
            addMessageToChat(data.message, data.sender, type);
        }
        updateClientList();
    }
});

socket.on('client-online', (data) => {
    if (isEmployee) {
        updateClientList();
        addMessageToChat(`🟢 ${data.clientName} está online`, 'Sistema', 'sistema');
    }
});

socket.on('client-offline', (data) => {
    if (isEmployee) {
        updateClientList();
        addMessageToChat(`🔴 ${data.clientName} está offline`, 'Sistema', 'sistema');
    }
});

socket.on('active-clients', (clients) => {
    if (isEmployee) {
        updateClientList();
    }
});

socket.on('employee-message-sent', (data) => {
    if (isEmployee && currentClient === data.clientName) {
        addMessageToChat(data.message, data.sender, 'funcionario');
    }
});

// ========== ATUALIZAR LISTA DE CLIENTES ==========
function updateClientList() {
    if (!isEmployee) return;
    
    fetch('/api/clients')
        .then(res => res.json())
        .then(clients => {
            clientsContainer.innerHTML = '';
            if (clients.length === 0) {
                clientsContainer.innerHTML = '<p style="color: #888; text-align: center;">Nenhum cliente ainda</p>';
                return;
            }
            
            clients.forEach(client => {
                const div = document.createElement('div');
                div.className = 'client-item';
                
                // Verificar se está online
                const isOnline = checkClientOnline(client);
                
                div.innerHTML = `
                    <span>${client}</span>
                    <span class="status ${isOnline ? 'online' : 'offline'}">${isOnline ? '🟢 online' : '🔴 offline'}</span>
                `;
                div.addEventListener('click', () => {
                    currentClient = client;
                    chatClientName.textContent = client;
                    clientePedido.textContent = client;
                    chatStatus.textContent = isOnline ? '🟢 online' : '🔴 offline';
                    chatStatus.style.background = isOnline ? '#2ecc71' : '#e74c3c';
                    chatStatus.style.color = 'white';
                    
                    // Carregar histórico
                    fetch(`/api/conversations/${client}`)
                        .then(res => res.json())
                        .then(messages => {
                            chatMessages.innerHTML = '';
                            messages.forEach(msg => {
                                const type = msg.sender === 'Cliente' ? 'cliente' : 'funcionario';
                                addMessageToChat(msg.message, msg.sender, type);
                            });
                        });
                });
                clientsContainer.appendChild(div);
            });
        })
        .catch(err => console.error('Erro ao buscar clientes:', err));
}

function checkClientOnline(clientName) {
    // Verificação simples - o socket vai atualizar
    return true; // Por enquanto assume online
}

// ========== INICIALIZAR ==========
enableChat(false);
chatClientName.textContent = 'Aguardando...';
chatStatus.textContent = 'offline';

console.log('🚀 Sistema LD Gráfica iniciado!');
console.log('👤 Funcionário: Dinho | Senha: 123456');
console.log('💡 Cliente: Digite seu nome e inicie o atendimento');