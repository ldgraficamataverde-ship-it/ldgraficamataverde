const socket = io();

// Estado
let currentUser = null;
let currentClient = null;
let isEmployee = false;
let isClient = false;
let pedidoConfirmado = false;
let arteConfirmada = false;
let pagamentoConfirmado = false;
let cobrancaEnviada = false;
let timerInterval = null;

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
const employeeLoginForm = document.getElementById('employeeLoginForm');

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
const clientCobranca = document.getElementById('clientCobranca');
const clientProducao = document.getElementById('clientProducao');
const clientValorCobranca = document.getElementById('clientValorCobranca');
const clientTimerDisplay = document.getElementById('clientTimerDisplay');
const btnClientPagar = document.getElementById('btnClientPagar');
const msgServico = document.getElementById('msgServico');

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
const btnConfirmarPedido = document.getElementById('btnConfirmarPedido');
const btnConfirmarArte = document.getElementById('btnConfirmarArte');
const btnCobrar = document.getElementById('btnCobrar');
const btnPagamentoRealizado = document.getElementById('btnPagamentoRealizado');
const employeeCobrancaInput = document.getElementById('employeeCobrancaInput');
const employeeValorCobranca = document.getElementById('employeeValorCobranca');
const btnEnviarCobranca = document.getElementById('btnEnviarCobranca');
const employeeCobrancaEnviada = document.getElementById('employeeCobrancaEnviada');

// ===== TABS LOGIN - CORRIGIDO =====
tabs.forEach(tab => {
    tab.addEventListener('click', function() {
        // Remove active de todas as tabs
        tabs.forEach(t => t.classList.remove('active'));
        // Adiciona active na tab clicada
        this.classList.add('active');
        
        // Esconde todos os conteúdos
        tabContents.forEach(tc => tc.classList.remove('active'));
        
        // Mostra o conteúdo correspondente
        const targetId = this.dataset.tab;
        const targetContent = document.getElementById('login' + targetId.charAt(0).toUpperCase() + targetId.slice(1));
        if (targetContent) {
            targetContent.classList.add('active');
        }
        
        // Mostra/Esconde o formulário do funcionário
        if (targetId === 'funcionario') {
            employeeLoginForm.style.display = 'block';
        } else {
            employeeLoginForm.style.display = 'none';
        }
    });
});

// Garantir que o formulário do funcionário comece escondido
employeeLoginForm.style.display = 'none';

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
    
    switchScreen('client');
    clientDisplayName.textContent = name;
    clientNameInput.disabled = true;
    btnClientLogin.disabled = true;
    
    socket.emit('client-join', { clientName: name });
    enableClientChat(true);
    
    showStatus(clientLoginStatus, `✅ Conectado como ${name}`, 'success');
    
    // Iniciar fluxo do cliente
    setTimeout(() => {
        iniciarFluxoCliente();
    }, 1000);
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

// ===== FLUXO DO CLIENTE =====
function iniciarFluxoCliente() {
    let etapa = 0;
    
    // Passo 1: Descrever serviço
    msgServico.textContent = '📌 Descreva o seu serviço:';
    
    // Listener para mensagens do cliente
    const clienteMessageHandler = (data) => {
        if (data.sender === 'Cliente' && data.clientName === currentClient) {
            if (etapa === 0) {
                // Passo 2: Perguntar dimensões
                setTimeout(() => {
                    addMessage(clientMessages, '📏 Quais as dimensões do seu serviço em cm?', 'Sistema', 'system');
                }, 500);
                etapa = 1;
            } else if (etapa === 1) {
                // Passo 3: Análise
                setTimeout(() => {
                    addMessage(clientMessages, '🔍 O seu serviço está sendo analisado por um de nossos funcionários.', 'Sistema', 'system');
                    addMessage(clientMessages, '⏳ Aguarde...', 'Sistema', 'system');
                }, 500);
                etapa = 2;
                // Remover listener após análise
                socket.off('new-message', clienteMessageHandler);
            }
        }
    };
    socket.on('new-message', clienteMessageHandler);
}

// ===== FUNCIONÁRIO - AÇÕES =====
// Confirmar Pedido
btnConfirmarPedido.addEventListener('click', () => {
    if (!currentClient) return;
    pedidoConfirmado = true;
    btnConfirmarArte.disabled = false;
    btnConfirmarPedido.classList.add('active');
    
    socket.emit('confirmar-pedido', { clientName: currentClient });
    addMessage(employeeMessages, '✅ Pedido confirmado!', 'Sistema', 'system');
    employeeStatusBadge.textContent = '📋 Pedido confirmado';
});

// Confirmar Arte
btnConfirmarArte.addEventListener('click', () => {
    if (!currentClient || !pedidoConfirmado) return;
    arteConfirmada = true;
    btnCobrar.disabled = false;
    btnConfirmarArte.classList.add('active');
    
    socket.emit('confirmar-arte', { clientName: currentClient });
    addMessage(employeeMessages, '🎨 Arte confirmada!', 'Sistema', 'system');
    employeeStatusBadge.textContent = '🎨 Arte pronta';
});

// Cobrar
btnCobrar.addEventListener('click', () => {
    if (!currentClient || !arteConfirmada) return;
    employeeCobrancaInput.style.display = 'flex';
    btnCobrar.disabled = true;
});

btnEnviarCobranca.addEventListener('click', () => {
    const valor = employeeValorCobranca.value.trim();
    if (!valor || parseFloat(valor) <= 0) {
        alert('Digite um valor válido');
        return;
    }
    
    const valorFormatado = parseFloat(valor).toFixed(2);
    socket.emit('cobrar-cliente', { clientName: currentClient, valor: valorFormatado });
    
    employeeCobrancaInput.style.display = 'none';
    employeeCobrancaEnviada.style.display = 'block';
    btnPagamentoRealizado.disabled = false;
    employeeValorCobranca.value = '';
    
    addMessage(employeeMessages, `💰 Cobrança enviada: R$ ${valorFormatado}`, 'Sistema', 'system');
});

// Pagamento Realizado
btnPagamentoRealizado.addEventListener('click', () => {
    if (!currentClient) return;
    
    socket.emit('pagamento-realizado', { clientName: currentClient });
    btnPagamentoRealizado.disabled = true;
    btnPagamentoRealizado.classList.add('active');
    
    addMessage(employeeMessages, '✅ Pagamento confirmado! Iniciando produção...', 'Sistema', 'system');
    employeeStatusBadge.textContent = '🟠 Em produção';
    employeeTempo.textContent = '⏱️ 45 min';
});

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

// Eventos do pedido
socket.on('pedido-confirmado', (data) => {
    if (isClient && currentClient === data.clientName) {
        addMessage(clientMessages, '✅ Pedido confirmado!', 'Sistema', 'system');
        clientStatusBadge.textContent = '📋 Pedido confirmado';
    }
});

socket.on('arte-confirmada', (data) => {
    if (isClient && currentClient === data.clientName) {
        addMessage(clientMessages, '🎨 Arte pronta!', 'Sistema', 'system');
        clientStatusBadge.textContent = '🎨 Arte pronta';
        clientArtePronta.style.display = 'block';
    }
});

socket.on('cobranca-enviada', (data) => {
    if (isClient && currentClient === data.clientName) {
        clientCobranca.style.display = 'block';
        clientValorCobranca.textContent = data.valor;
        clientPagamento.style.display = 'flex';
        clientArtePronta.style.display = 'none';
        addMessage(clientMessages, `💰 Valor do serviço: R$ ${data.valor}`, 'Sistema', 'system');
    }
});

socket.on('pagamento-confirmado', (data) => {
    if (isClient && currentClient === data.clientName) {
        clientPagamento.style.display = 'none';
        clientCobranca.style.display = 'none';
        clientProducao.style.display = 'block';
        clientStatusBadge.textContent = '🟠 EM PRODUÇÃO';
        clientStatusBadge.className = 'status-badge em-producao';
        clientTempo.textContent = '⏱️ 45 min';
        
        addMessage(clientMessages, '✅ Pagamento confirmado!', 'Sistema', 'system');
        addMessage(clientMessages, '⏱️ Serviço em produção - 45 minutos', 'Sistema', 'system');
        
        iniciarTimer(45);
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

// ===== TIMER =====
function iniciarTimer(minutos) {
    let totalSegundos = minutos * 60;
    
    if (timerInterval) clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        totalSegundos--;
        
        if (totalSegundos <= 0) {
            clearInterval(timerInterval);
            clientTimerDisplay.textContent = '00:00';
            addMessage(clientMessages, '✅ Serviço finalizado! Pronto para retirada.', 'Sistema', 'system');
            return;
        }
        
        const mins = Math.floor(totalSegundos / 60);
        const segs = totalSegundos % 60;
        clientTimerDisplay.textContent = `${String(mins).padStart(2, '0')}:${String(segs).padStart(2, '0')}`;
    }, 1000);
}

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
                    
                    employeeChatInput.disabled = false;
                    btnEmployeeSend.disabled = false;
                    
                    btnConfirmarPedido.classList.remove('active');
                    btnConfirmarArte.classList.remove('active');
                    btnConfirmarArte.disabled = true;
                    btnCobrar.disabled = true;
                    btnPagamentoRealizado.disabled = true;
                    btnPagamentoRealizado.classList.remove('active');
                    employeeCobrancaInput.style.display = 'none';
                    employeeCobrancaEnviada.style.display = 'none';
                    pedidoConfirmado = false;
                    arteConfirmada = false;
                    cobrancaEnviada = false;
                    
                    fetch(`/api/conversations/${client}`)
                        .then(res => res.json())
                        .then(messages => {
                            employeeMessages.innerHTML = '';
                            messages.forEach(msg => {
                                const type = msg.sender === 'Cliente' ? 'cliente' : 'funcionario';
                                addMessage(employeeMessages, msg.message, msg.sender, type);
                            });
                        });
                    
                    updateClientList();
                });
                
                clientListContainer.appendChild(div);
            });
        })
        .catch(err => console.error('Erro:', err));
}

// ===== LOGOUT =====
btnClientLogout.addEventListener('click', logout);
btnEmployeeLogout.addEventListener('click', logout);

function logout() {
    if (timerInterval) clearInterval(timerInterval);
    
    isClient = false;
    isEmployee = false;
    currentClient = null;
    currentUser = null;
    pedidoConfirmado = false;
    arteConfirmada = false;
    pagamentoConfirmado = false;
    cobrancaEnviada = false;
    
    clientNameInput.disabled = false;
    btnClientLogin.disabled = false;
    employeeUserInput.disabled = false;
    employeePassInput.disabled = false;
    btnEmployeeLogin.disabled = false;
    clientNameInput.value = '';
    clientChatInput.value = '';
    employeeChatInput.value = '';
    employeeValorCobranca.value = '';
    clientMessages.innerHTML = '';
    employeeMessages.innerHTML = '';
    clientPagamento.style.display = 'none';
    clientArtePronta.style.display = 'none';
    clientCobranca.style.display = 'none';
    clientProducao.style.display = 'none';
    clientStatusBadge.textContent = '⏳ Aguardando';
    clientStatusBadge.className = 'status-badge';
    clientTempo.textContent = '-- min';
    clientTimerDisplay.textContent = '00:00';
    employeeStatusBadge.textContent = '⏳ Aguardando';
    employeeStatusBadge.className = 'status-badge';
    employeeTempo.textContent = '-- min';
    employeeChatClient.textContent = 'Selecione um cliente';
    employeeClientStatus.textContent = 'offline';
    employeeClientStatus.className = 'status-badge';
    employeeChatInput.disabled = true;
    btnEmployeeSend.disabled = true;
    btnConfirmarPedido.classList.remove('active');
    btnConfirmarArte.classList.remove('active');
    btnConfirmarArte.disabled = true;
    btnCobrar.disabled = true;
    btnPagamentoRealizado.disabled = true;
    btnPagamentoRealizado.classList.remove('active');
    employeeCobrancaInput.style.display = 'none';
    employeeCobrancaEnviada.style.display = 'none';
    clientLoginStatus.className = 'status-msg';
    employeeLoginStatus.className = 'status-msg';
    msgServico.textContent = '📌 Descreva o seu serviço:';
    employeeLoginForm.style.display = 'none';
    
    switchScreen('login');
    
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
console.log('📋 Fluxo: Serviço → Dimensões → Análise → Pedido → Arte → Cobrança → Pagamento → Produção');
