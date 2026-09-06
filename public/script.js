const socket = io();

// Estado da aplicação
let userType = null;
let clientId = null;
let selectedClientId = null;
let timerInterval = null;
let timerSeconds = 0;
let clientsList = [];
let attendanceFinished = false;

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
const currentStatus = document.getElementById('current-status');
const timerDisplay = document.getElementById('timer-display');
const timerCount = document.getElementById('timer-count');
const timerDate = document.getElementById('timer-date');

// Funcionário
const employeeLogout = document.getElementById('employee-logout');
const clientListContainer = document.getElementById('client-list-container');
const selectedClientName = document.getElementById('selected-client-name');
const employeeChatMessages = document.getElementById('employee-chat-messages');
const employeeChatInput = document.getElementById('employee-chat-input');
const employeeSendBtn = document.getElementById('employee-send-btn');
const employeeActions = document.getElementById('employee-actions');
const productionDatetime = document.getElementById('production-datetime');

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
        attendanceFinished = false;
        socket.emit('client-login', { name });
    }
});

clientNameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        clientLoginBtn.click();
    }
});

employeeLoginBtn.addEventListener('click', () => {
    const username = employeeUsername.value.trim();
    const password = employeePassword.value.trim();
    
    if (username && password) {
        socket.emit('employee-login', { username, password });
    }
});

employeeUsername.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        employeePassword.focus();
    }
});

employeePassword.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        employeeLoginBtn.click();
    }
});

// Event Listeners - Cliente
clientLogout.addEventListener('click', resetApp);

chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && chatInput.value.trim() && !attendanceFinished) {
        sendClientMessage();
    }
});

sendBtn.addEventListener('click', () => {
    if (!attendanceFinished) {
        sendClientMessage();
    }
});

function sendClientMessage() {
    const text = chatInput.value.trim();
    if (text && userType === 'client' && !attendanceFinished) {
        socket.emit('client-message', { text });
        chatInput.value = '';
    }
}

// Event Listeners - Funcionário
employeeLogout.addEventListener('click', resetApp);

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

// Ações do Funcionário
document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        if (!selectedClientId) return;
        
        switch(action) {
            case 'confirm-order':
                socket.emit('confirm-order', selectedClientId);
                break;
            case 'confirm-payment':
                socket.emit('confirm-payment', selectedClientId);
                break;
            case 'send-pix':
                if (confirm('Enviar dados do PIX para o cliente?')) {
                    socket.emit('send-pix', selectedClientId);
                }
                break;
            case 'set-production':
                const datetime = productionDatetime.value;
                
                if (!datetime) {
                    alert('Por favor, selecione a data e hora de entrega!');
                    return;
                }
                
                const selectedDate = new Date(datetime);
                const now = new Date();
                
                if (selectedDate <= now) {
                    alert('Por favor, selecione uma data e hora futura!');
                    return;
                }
                
                if (confirm(`Iniciar produção com previsão de entrega para:\n${selectedDate.toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                })}`)) {
                    socket.emit('set-production-time', { 
                        clientId: selectedClientId, 
                        datetime: datetime
                    });
                    // Limpar o input após enviar
                    productionDatetime.value = '';
                }
                break;
            case 'finish-production':
                socket.emit('finish-production', selectedClientId);
                break;
            case 'finish-attendance':
                if (confirm('Tem certeza que deseja finalizar o atendimento deste cliente?')) {
                    socket.emit('finish-attendance', selectedClientId);
                }
                break;
        }
    });
});

// Socket.IO - Eventos do Cliente
socket.on('conversation-history', (messages) => {
    showClientScreen();
    chatMessages.innerHTML = '';
    messages.forEach(msg => addMessageToChat(msg));
    scrollToBottom(chatMessages);
    attendanceFinished = false;
});

socket.on('conversation-update', (message) => {
    if (!attendanceFinished) {
        addMessageToChat(message);
        scrollToBottom(chatMessages);
    }
});

socket.on('status-update', (status) => {
    currentStatus.textContent = status;
    currentStatus.className = status.toLowerCase().replace(/ /g, '-');
    
    if (status === 'Atendimento Finalizado') {
        attendanceFinished = true;
        chatInput.disabled = true;
        sendBtn.disabled = true;
        chatInput.placeholder = 'Atendimento finalizado';
    }
});

socket.on('production-timer', (minutes) => {
    timerSeconds = minutes * 60;
    timerDisplay.style.display = 'block';
    startTimer();
});

socket.on('production-datetime', (data) => {
    const timerDate = document.getElementById('timer-date');
    if (timerDate) {
        timerDate.textContent = `📅 Previsão: ${data.formatted}`;
    }
});

socket.on('production-finished', () => {
    timerDisplay.style.display = 'none';
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
});

socket.on('attendance-finished', () => {
    attendanceFinished = true;
    chatInput.disabled = true;
    sendBtn.disabled = true;
    chatInput.placeholder = 'Atendimento finalizado';
    
    const div = document.createElement('div');
    div.className = 'message system';
    div.innerHTML = `
        <span>✅ Atendimento finalizado! Obrigado pela preferência! 🙏</span>
        <span class="timestamp">${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
    `;
    chatMessages.appendChild(div);
    scrollToBottom(chatMessages);
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
    clientsList = clients;
    renderClientList(clients);
});

socket.on('employee-conversation-history', (data) => {
    if (selectedClientId === data.clientId) {
        employeeChatMessages.innerHTML = '';
        data.messages.forEach(msg => addMessageToEmployeeChat(msg));
        scrollToBottom(employeeChatMessages);
    }
});

socket.on('employee-conversation-update', (data) => {
    if (selectedClientId === data.clientId) {
        addMessageToEmployeeChat(data.message);
        scrollToBottom(employeeChatMessages);
    }
});

socket.on('attendance-finished-confirm', (data) => {
    selectedClientId = null;
    selectedClientName.textContent = 'Selecione um cliente';
    employeeChatMessages.innerHTML = '';
    employeeActions.style.display = 'none';
    employeeChatInput.disabled = true;
    employeeSendBtn.disabled = true;
    
    const div = document.createElement('div');
    div.className = 'message system';
    div.textContent = `✅ ${data.message}`;
    employeeChatMessages.appendChild(div);
});

// Funções auxiliares
function addMessageToChat(message) {
    const div = document.createElement('div');
    div.className = `message ${message.type}`;
    
    // Verificar se é mensagem de Pix
    if (message.type === 'employee' && message.text.includes('PIX')) {
        const lines = message.text.split('\n');
        const textSpan = document.createElement('span');
        textSpan.innerHTML = lines.map(line => {
            if (line.includes('💳')) return `<strong>${line}</strong>`;
            if (line.includes('CPF')) return `<span class="pix-info">${line}</span>`;
            if (line.includes('Favorecido')) return `<span class="pix-info">${line}</span>`;
            if (line.includes('Banco')) return `<span class="pix-info">${line}</span>`;
            return line;
        }).join('<br>');
        div.appendChild(textSpan);
    } else {
        const textSpan = document.createElement('span');
        textSpan.textContent = message.text;
        div.appendChild(textSpan);
    }
    
    if (message.timestamp) {
        const timeSpan = document.createElement('span');
        timeSpan.className = 'timestamp';
        const date = new Date(message.timestamp);
        timeSpan.textContent = date.toLocaleTimeString('pt-BR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        div.appendChild(timeSpan);
    }
    
    chatMessages.appendChild(div);
}

function addMessageToEmployeeChat(message) {
    const div = document.createElement('div');
    div.className = `message ${message.type}`;
    
    // Verificar se é mensagem de Pix
    if (message.type === 'employee' && message.text.includes('PIX')) {
        const lines = message.text.split('\n');
        const textSpan = document.createElement('span');
        textSpan.innerHTML = lines.map(line => {
            if (line.includes('💳')) return `<strong>${line}</strong>`;
            if (line.includes('CPF')) return `<span class="pix-info">${line}</span>`;
            if (line.includes('Favorecido')) return `<span class="pix-info">${line}</span>`;
            if (line.includes('Banco')) return `<span class="pix-info">${line}</span>`;
            return line;
        }).join('<br>');
        div.appendChild(textSpan);
    } else {
        const textSpan = document.createElement('span');
        textSpan.textContent = message.text;
        div.appendChild(textSpan);
    }
    
    if (message.timestamp) {
        const timeSpan = document.createElement('span');
        timeSpan.className = 'timestamp';
        const date = new Date(message.timestamp);
        timeSpan.textContent = date.toLocaleTimeString('pt-BR', { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
        div.appendChild(timeSpan);
    }
    
    employeeChatMessages.appendChild(div);
}

function renderClientList(clients) {
    clientListContainer.innerHTML = '';
    
    if (!clients || clients.length === 0) {
        clientListContainer.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 20px;">Nenhum cliente ativo</div>';
        return;
    }
    
    clients.forEach(client => {
        const div = document.createElement('div');
        div.className = `client-item${selectedClientId === client.id ? ' active' : ''}`;
        
        const statusDisplay = client.status || 'Aguardando';
        const statusClass = statusDisplay.toLowerCase().replace(/ /g, '-');
        
        div.innerHTML = `
            <div class="client-name">${client.name}</div>
            <div class="client-status">
                Status: <span class="status-badge ${statusClass}">${statusDisplay}</span>
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
    
    const client = clientsList.find(c => c.id === clientId);
    if (client) {
        selectedClientName.textContent = client.name;
    }
    
    const items = clientListContainer.querySelectorAll('.client-item');
    items.forEach(item => {
        const name = item.querySelector('.client-name').textContent;
        if (client && name === client.name) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    employeeActions.style.display = 'flex';
    employeeChatInput.disabled = false;
    employeeSendBtn.disabled = false;
    
    employeeChatMessages.innerHTML = '';
    
    socket.emit('employee-select-client', clientId);
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
            socket.emit('finish-production', selectedClientId || socket.clientId);
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
    attendanceFinished = false;
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
    clientsList = [];
    attendanceFinished = false;
    
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    chatMessages.innerHTML = '';
    employeeChatMessages.innerHTML = '';
    clientListContainer.innerHTML = '';
    timerDisplay.style.display = 'none';
    employeeActions.style.display = 'none';
    chatInput.disabled = true;
    sendBtn.disabled = true;
    employeeChatInput.disabled = true;
    employeeSendBtn.disabled = true;
    employeeChatInput.value = '';
    chatInput.value = '';
    chatInput.placeholder = 'Digite sua mensagem...';
    clientNameInput.value = '';
    employeeUsername.value = '';
    employeePassword.value = '';
    employeeError.textContent = '';
    currentStatus.className = '';
    if (productionDatetime) {
        productionDatetime.value = '';
    }
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
    loginScreen.style.display = 'flex';
    clientScreen.style.display = 'none';
    employeeScreen.style.display = 'none';
});

window.addEventListener('beforeunload', () => {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
});
