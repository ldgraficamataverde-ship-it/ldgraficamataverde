const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Configurações
app.use(express.static('public'));
app.use(express.json());

// Garantir que a pasta de conversas existe
const conversationsDir = path.join(__dirname, 'conversations');
if (!fs.existsSync(conversationsDir)) {
    fs.mkdirSync(conversationsDir);
}

// Estrutura de dados em memória
const clients = {};
const conversations = {};
const clientStatus = {};

// Funções auxiliares
function saveConversation(clientId) {
    if (!conversations[clientId]) return;
    const filePath = path.join(conversationsDir, `${clientId}.txt`);
    const content = conversations[clientId].map(msg => 
        `[${msg.timestamp}] ${msg.type}: ${msg.text}`
    ).join('\n');
    fs.writeFileSync(filePath, content);
}

function loadConversation(clientId) {
    const filePath = path.join(conversationsDir, `${clientId}.txt`);
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        return content.split('\n').filter(line => line.trim()).map(line => {
            // Extrair timestamp, tipo e texto
            const match = line.match(/\[(.*?)\]\s+(.*?):\s+(.*)/);
            if (match) {
                return {
                    timestamp: match[1],
                    type: match[2],
                    text: match[3]
                };
            }
            // Fallback para formato antigo
            const [timestamp, type, ...textParts] = line.replace(/[\[\]]/g, '').split(' ');
            return {
                timestamp,
                type,
                text: textParts.join(' ')
            };
        });
    }
    return [];
}

// Função para atualizar lista de clientes
function updateClientList() {
    const clientList = Object.values(clients).sort((a, b) => 
        new Date(b.loginTime) - new Date(a.loginTime)
    );
    io.emit('client-list-update', clientList);
    return clientList;
}

// Socket.IO
io.on('connection', (socket) => {
    console.log('Novo cliente conectado:', socket.id);

    // Login do cliente
    socket.on('client-login', (data) => {
        const clientName = data.name.trim();
        if (!clientName) {
            socket.emit('login-error', 'Nome inválido');
            return;
        }

        const clientId = clientName.toLowerCase().replace(/\s/g, '_');
        
        // Carregar conversa existente ou criar nova
        if (!conversations[clientId]) {
            conversations[clientId] = loadConversation(clientId);
            if (conversations[clientId].length === 0) {
                // Mensagem inicial
                const welcomeMsg = {
                    timestamp: new Date().toISOString(),
                    type: 'system',
                    text: `Olá ${clientName}! Como posso ajudá-lo hoje?`
                };
                conversations[clientId].push(welcomeMsg);
                saveConversation(clientId);
            }
        }

        // Adicionar cliente à lista
        if (!clients[clientId]) {
            clients[clientId] = {
                id: clientId,
                name: clientName,
                socketId: socket.id,
                loginTime: new Date().toISOString(),
                status: 'Aguardando'
            };
            clientStatus[clientId] = 'Aguardando';
        } else {
            clients[clientId].socketId = socket.id;
            clients[clientId].loginTime = new Date().toISOString();
            if (!clientStatus[clientId]) {
                clientStatus[clientId] = 'Aguardando';
            }
        }

        socket.join(clientId);
        socket.clientId = clientId;
        socket.userType = 'client';

        // Enviar histórico da conversa
        socket.emit('conversation-history', conversations[clientId]);
        
        // Enviar status atual
        const currentStatus = clientStatus[clientId] || 'Aguardando';
        socket.emit('status-update', currentStatus);
        
        // Atualizar lista de clientes para todos
        updateClientList();
        
        console.log(`Cliente logado: ${clientName} (${clientId}) - Status: ${currentStatus}`);
        console.log(`Conversa tem ${conversations[clientId].length} mensagens`);
    });

    // Login do funcionário
    socket.on('employee-login', (data) => {
        const { username, password } = data;
        if (username === 'Dinho' && password === '123456') {
            socket.userType = 'employee';
            socket.emit('employee-login-success');
            
            // Enviar lista de clientes atualizada
            const clientList = Object.values(clients).sort((a, b) => 
                new Date(b.loginTime) - new Date(a.loginTime)
            );
            socket.emit('client-list-update', clientList);
            
            console.log('Funcionário logado');
        } else {
            socket.emit('employee-login-error', 'Usuário ou senha incorretos');
        }
    });

    // Funcionário: selecionar cliente e ver histórico
    socket.on('employee-select-client', (clientId) => {
        if (!clientId) return;
        
        // Verificar se o cliente existe
        if (!clients[clientId]) {
            socket.emit('employee-client-error', 'Cliente não encontrado');
            return;
        }
        
        // Carregar conversa se não estiver em memória
        if (!conversations[clientId]) {
            conversations[clientId] = loadConversation(clientId);
        }
        
        // Enviar histórico completo para o funcionário
        socket.emit('employee-conversation-history', {
            clientId: clientId,
            messages: conversations[clientId] || []
        });
        
        console.log(`Funcionário visualizando cliente: ${clientId} - ${conversations[clientId].length} mensagens`);
    });

    // Mensagem do cliente
    socket.on('client-message', (data) => {
        const clientId = socket.clientId;
        if (!clientId) {
            console.log('Erro: clientId não definido');
            return;
        }
        
        if (!conversations[clientId]) {
            conversations[clientId] = [];
        }

        const message = {
            timestamp: new Date().toISOString(),
            type: 'client',
            text: data.text
        };
        
        conversations[clientId].push(message);
        saveConversation(clientId);
        
        // Enviar para o próprio cliente
        socket.emit('conversation-update', message);
        
        // Enviar para funcionários
        io.emit('employee-conversation-update', {
            clientId,
            message
        });
        
        console.log(`Mensagem de ${clientId}: ${data.text}`);
    });

    // Funcionário: enviar mensagem
    socket.on('employee-message', (data) => {
        const { clientId, text } = data;
        if (!clientId) {
            console.log('Erro: clientId não definido');
            return;
        }
        
        if (!conversations[clientId]) {
            conversations[clientId] = [];
        }

        const message = {
            timestamp: new Date().toISOString(),
            type: 'employee',
            text: text
        };
        
        conversations[clientId].push(message);
        saveConversation(clientId);
        
        io.to(clientId).emit('conversation-update', message);
        
        // Atualizar funcionários
        io.emit('employee-conversation-update', {
            clientId,
            message
        });
        
        console.log(`Mensagem do funcionário para ${clientId}: ${text}`);
    });

    // Funcionário: confirmar pedido
    socket.on('confirm-order', (clientId) => {
        if (!clients[clientId]) return;
        
        clientStatus[clientId] = 'Pedido Confirmado';
        clients[clientId].status = 'Pedido Confirmado';
        
        const message = {
            timestamp: new Date().toISOString(),
            type: 'system',
            text: '✅ Pedido confirmado!'
        };
        
        conversations[clientId].push(message);
        saveConversation(clientId);
        
        io.to(clientId).emit('conversation-update', message);
        io.to(clientId).emit('status-update', 'Pedido Confirmado');
        
        // Atualizar lista
        updateClientList();
        
        console.log(`Pedido confirmado para ${clientId}`);
    });

    // Funcionário: confirmar pagamento
    socket.on('confirm-payment', (clientId) => {
        if (!clients[clientId]) return;
        
        clientStatus[clientId] = 'Pagamento Confirmado';
        clients[clientId].status = 'Pagamento Confirmado';
        
        const message = {
            timestamp: new Date().toISOString(),
            type: 'system',
            text: '💰 Pagamento confirmado!'
        };
        
        conversations[clientId].push(message);
        saveConversation(clientId);
        
        io.to(clientId).emit('conversation-update', message);
        io.to(clientId).emit('status-update', 'Pagamento Confirmado');
        
        // Atualizar lista
        updateClientList();
        
        console.log(`Pagamento confirmado para ${clientId}`);
    });

    // Funcionário: definir tempo de produção
    socket.on('set-production-time', (data) => {
        const { clientId, minutes } = data;
        if (!clients[clientId]) return;
        
        clientStatus[clientId] = 'Em Produção';
        clients[clientId].status = 'Em Produção';
        
        const message = {
            timestamp: new Date().toISOString(),
            type: 'system',
            text: `⏱️ Em produção - ${minutes} minutos`
        };
        
        conversations[clientId].push(message);
        saveConversation(clientId);
        
        io.to(clientId).emit('conversation-update', message);
        io.to(clientId).emit('status-update', 'Em Produção');
        io.to(clientId).emit('production-timer', minutes);
        
        // Atualizar lista
        updateClientList();
        
        console.log(`Produção iniciada para ${clientId}: ${minutes} minutos`);
    });

    // Funcionário: finalizar produção
    socket.on('finish-production', (clientId) => {
        if (!clients[clientId]) return;
        
        clientStatus[clientId] = 'Pronto para Retirada';
        clients[clientId].status = 'Pronto para Retirada';
        
        const message = {
            timestamp: new Date().toISOString(),
            type: 'system',
            text: '✅ Produção finalizada! Pronto para retirada.'
        };
        
        conversations[clientId].push(message);
        saveConversation(clientId);
        
        io.to(clientId).emit('conversation-update', message);
        io.to(clientId).emit('status-update', 'Pronto para Retirada');
        io.to(clientId).emit('production-finished');
        
        // Atualizar lista
        updateClientList();
        
        console.log(`Produção finalizada para ${clientId}`);
    });

    // Desconectar
    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
    });
});

// Rotas
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
