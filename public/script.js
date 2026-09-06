const socket = io();

// Estado da aplicação
let userType = null;
let clientId = null;
let selectedClientId = null;
let timerInterval = null;
let timerSeconds = 0;
let isPaymentConfirmed = false;

// DOM Elements
const loginScreen = document.getElementById('login-screen');
const clientScreen = document.getElementById('client-screen');
const employeeScreen = document.getElementById('employee-screen');

// Login
const tabs = document.querySelectorAll('.tab');
const loginClient = document.getElementById('login-client');
const loginEmployee = document.getElementById('login-employee');
const clientNameInput = document.getElementById('client-name');
const clientLoginBtn = document.getElementById('client-login-btn');
const employeeUsername = document.getElementById('employee-username');
const employeePassword = document.getElementById('employee-password');
const employeeLoginBtn = document.getElementById('employee-login-btn');
const employeeError = document.getElementById('employee-error');

// Cliente
const clientLogout = document.getElementById('client-logout');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const serviceOptions = document.getElementById('service-options');
const optionsGrid = document.querySelector('.options-grid');
const currentStatus = document.getElementById('current-status');
const timerDisplay = document.getElementById('timer-display');
const timerCount = document.getElementById('timer-count');
const paymentSection = document.getElementById('payment-section');
const paymentAmount = document.getElementById('payment-amount');
const confirmPaymentBtn = document.getElementById('confirm-payment-btn');

// Funcionário
const employeeLogout = document.getElementById('employee-logout');
const clientListContainer = document.getElementById('client-list-container');
const selectedClientName = document.getElementById('selected-client-name');
const employeeChatMessages = document.getElementById('employee-chat-messages');
const employeeChatInput = document.getElementById('employee-chat-input');
const employeeSendBtn = document.getElementById('employee-send-btn');
const employeeActions = document.getElementById('employee-actions');
const chargeInput = document.getElementById('charge-input');
const chargeAmount = document.getElementById('charge-amount');
const sendChargeBtn = document.getElementById('send-charge-btn');

// Event Listeners - Login
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        if (tab.dataset.tab === 'client') {
            loginClient.classList.add('active');
            loginEmployee.classList.remove('active');
        } else {
            loginClient.classList.remove('active');
            loginEmployee.classList.add('active');
        }
    });
});

clientLoginBtn.addEventListener('click', () => {
    const name = clientNameInput.value.trim();
    if (name) {
        userType = 'client';
        socket.emit('client-login', { name });
    }
});

employeeLoginBtn.addEventListener('click', () => {
    const username = employeeUsername.value.trim();
    const password = employeePassword.value.trim();
    
    if (username && password) {
        socket.emit('employee-login', { username, password });
    }
});

// Event Listeners - Cliente
clientLogout.addEventListener('click', () => {
    resetApp();
});

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim()) {
        sendClientMessage();
    }
});

sendBtn.addEventListener('click', sendClientMessage);

function sendClientMessage() {
    const text = chatInput.value.trim();
    if (text && userType === 'client') {
        socket.emit('client-message', { text });
        chatInput.value = '';
    }
}

// Event Listeners - Funcionário
employeeLogout.addEventListener('click', () => {
    resetApp();
});

employeeChatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && employeeChatInput.value.trim() && selectedClientId) {
        sendEmployeeMessage();
    }
});

employeeSendBtn.addEventListener('click', sendEmployeeMessage);

function sendEmployeeMessage() {
    const text = employeeChatInput.value.trim();
    if (text && selectedClientId) {
        socket.emit('employee-message', { clientId: selectedClientId, text });
        employeeChatInput.value = '';
    }
}

// Socket.IO - Eventos do Cliente
socket.on('conversation-history', (messages) => {
    showClientScreen();
    chatMessages.innerHTML = '';
    messages.forEach(msg => addMessageToChat(msg));
    scrollToBottom(chatMessages);
});

socket.on('conversation-update', (message) => {
    addMessageToChat(message);
    scrollToBottom(chatMessages);
});

socket.on('service-options', (options) => {
    serviceOptions.style.display = 'block';
    optionsGrid.innerHTML = '';
    options.forEach(option => {
        const btn = document.createElement('button');
        btn.className = 'service-option';
        btn.textContent = option;
        btn.addEventListener('click', () => {
            socket.emit('select-service', option);
            serviceOptions.style.display = 'none';
        });
        optionsGrid.appendChild(btn);
    });
});

socket.on('status-update', (status) => {
    currentStatus.textContent = status;
    currentStatus.className = status.toLowerCase().replace(' ', '-');
});

socket.on('payment-request', (data) => {
    paymentSection.style.display = 'block';
    paymentAmount.textContent = `Valor: R$ ${data.amount}`;
    isPaymentConfirmed = false;
});

socket.on('production-timer', (minutes) => {
    timerSeconds = minutes * 60;
    timerDisplay.style.display = 'block';
    startTimer();
});

socket.on('production-finished', () => {
    timerDisplay.style.display = 'none';
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    currentStatus.textContent = 'Pronto para Retirada';
});

// Socket.IO - Eventos do Funcionário
socket.on('employee-login-success', () => {
    showEmployeeScreen();
    employeeError.textContent = '';
});

socket.on('employee-login-error', (error) => {
    employeeError.textContent = error;
});

socket.on('client-list-update', (clients) => {
    renderClientList(clients);
});

socket.on('employee-conversation-update', (data) => {
    if (selectedClientId === data.clientId) {
        addMessageToEmployeeChat(data.message);
        scrollToBottom(employeeChatMessages);
    }
});

// Ações do Funcionário
document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (!selectedClientId) return;
        
        switch(action) {
            case 'confirm-order':
                socket.emit('confirm-order', selectedClientId);
                break;
            case 'confirm-art':
                socket.emit('confirm-art', selectedClientId);
                break;
            case 'charge':
                chargeInput.style.display = 'flex';
                break;
            case 'payment-done':
                // Simular pagamento realizado pelo funcionário
                socket.emit('employee-payment-done', selectedClientId);
                break;
        }
    });
});

sendChargeBtn.addEventListener('click', () => {
    const amount = chargeAmount.value.trim();
    if (amount && selectedClientId) {
        socket.emit('charge-client', { clientId: selectedClientId, amount });
        chargeInput.style.display = 'none';
        chargeAmount.value = '';
    }
});

// Confirmar pagamento pelo cliente
confirmPaymentBtn.addEventListener('click', () => {
    if (!isPaymentConfirmed) {
        socket.emit('confirm-payment');
        isPaymentConfirmed = true;
        paymentSection.style.display = 'none';
    }
});

// Funções auxiliares
function addMessageToChat(message) {
    const div = document.createElement('div');
    div.className = `message ${message.type}`;
    
    const textSpan = document.createElement('span');
    textSpan.textContent = message.text;
    div.appendChild(textSpan);
    
    if (message.timestamp) {
        const timeSpan = document.createElement('span');
        timeSpan.className = 'timestamp';
        timeSpan.textContent = new Date(message.timestamp).toLocaleTimeString();
        div.appendChild(timeSpan);
    }
    
    chatMessages.appendChild(div);
}

function addMessageToEmployeeChat(message) {
    const div = document.createElement('div');
    div.className = `message ${message.type}`;
    
    const textSpan = document.createElement('span');
    textSpan.textContent = message.text;
    div.appendChild(textSpan);
    
    if (message.timestamp) {
        const timeSpan = document.createElement('span');
        timeSpan.className = 'timestamp';
        timeSpan.textContent = new Date(message.timestamp).toLocaleTimeString();
        div.appendChild(timeSpan);
    }
    
    employeeChatMessages.appendChild(div);
}

function renderClientList(clients) {
    clientListContainer.innerHTML = '';
    clients.forEach(client => {
        const div = document.createElement('div');
        div.className = `client-item${selectedClientId === client.id ? ' active' : ''}`;
        
        div.innerHTML = `
            <div class="client-name">${client.name}</div>
            <div class="client-status">
                Status: <span class="status-badge ${client.status.toLowerCase().replace(' ', '-')}">${client.status}</span>
            </div>
        `;
        
        div.addEventListener('click', () => {
            selectClient(client.id);
        });
        
        clientListContainer.appendChild(div);
    });
}

function selectClient(clientId) {
    selectedClientId = clientId;
    const client = Object.values(clients).find(c => c.id === clientId);
    if (client) {
        selectedClientName.textContent = client.name;
    }
    
    // Atualizar lista
    const items = clientListContainer.querySelectorAll('.client-item');
    items.forEach(item => {
        const name = item.querySelector('.client-name').textContent;
        if (name === client.name) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Ativar ações
    employeeActions.style.display = 'flex';
    employeeChatInput.disabled = false;
    employeeSendBtn.disabled = false;
    
    // Limpar chat
    employeeChatMessages.innerHTML = '';
}

function scrollToBottom(element) {
    element.scrollTop = element.scrollHeight;
}

function startTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
    timerInterval = setInterval(() => {
        timerSeconds--;
        if (timerSeconds <= 0) {
            clearInterval(timerInterval);
            timerInterval = null;
            timerCount.textContent = '00:00';
            socket.emit('production-finished');
        } else {
            const minutes = Math.floor(timerSeconds / 60);
            const seconds = timerSeconds % 60;
            timerCount.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
    }, 1000);
}

function showClientScreen() {
    loginScreen.style.display = 'none';
    clientScreen.style.display = 'block';
    employeeScreen.style.display = 'none';
    chatInput.disabled = false;
    sendBtn.disabled = false;
}

function showEmployeeScreen() {
    loginScreen.style.display = 'none';
    clientScreen.style.display = 'none';
    employeeScreen.style.display = 'block';
}

function resetApp() {
    loginScreen.style.display = 'flex';
    clientScreen.style.display = 'none';
    employeeScreen.style.display = 'none';
    userType = null;
    clientId = null;
    selectedClientId = null;
    isPaymentConfirmed = false;
    
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    // Resetar campos
    chatMessages.innerHTML = '';
    employeeChatMessages.innerHTML = '';
    clientListContainer.innerHTML = '';
    serviceOptions.style.display = 'none';
    timerDisplay.style.display = 'none';
    paymentSection.style.display = 'none';
    employeeActions.style.display = 'none';
    chargeInput.style.display = 'none';
    chatInput.disabled = true;
    sendBtn.disabled = true;
    employeeChatInput.disabled = true;
    employeeSendBtn.disabled = true;
}

// Dados em memória para funcionário
const clients = {};

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    // Tela de login como padrão
    loginScreen.style.display = 'flex';
    clientScreen.style.display = 'none';
    employeeScreen.style.display = 'none';
});
