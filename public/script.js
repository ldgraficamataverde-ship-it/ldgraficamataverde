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
const clientTimers = {};
const pendingCharges = {};

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

// Socket.IO
io.on('connection', (socket) => {
    console.log('Novo cliente conectado:', socket.id);

    // Login do cliente
    socket.on('client-login', (data) => {
        const clientName = data.name.trim();
        if (!clientName) return;

        const clientId = clientName.toLowerCase().replace(/\s/g, '_');
        
        // Carregar conversa existente ou criar nova
        if (!conversations[clientId]) {
            conversations[clientId] = loadConversation(clientId);
            if (conversations[clientId].length === 0) {
                // Mensagem inicial
                const welcomeMsg = {
                    timestamp: new Date().toISOString(),
                    type: 'system',
                    text: 'Descreva o seu serviço'
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
            // Inicializar status como Aguardando
            clientStatus[clientId] = 'Aguardando';
        } else {
            clients[clientId].socketId = socket.id;
            // Se o status não estiver definido, definir como Aguardando
            if (!clientStatus[clientId]) {
                clientStatus[clientId] = 'Aguardando';
            }
        }

        socket.join(clientId);
        socket.clientId = clientId;
        socket.userType = 'client';

        // Enviar histórico da conversa
        socket.emit('conversation-history', conversations[clientId]);

        // Atualizar lista de clientes para funcionários
        const clientList = Object.values(clients).sort((a, b) => 
            new Date(b.loginTime) - new Date(a.loginTime)
        );
        io.emit('client-list-update', clientList);
        
        // Enviar status atual
        const currentStatus = clientStatus[clientId] || 'Aguardando';
        socket.emit('status-update', currentStatus);

        // Enviar opções de serviço
        const serviceOptions = [
            'Impressão em Lona',
            'Vinil',
            'Recorte a Laser'
        ];
        socket.emit('service-options', serviceOptions);
        
        console.log(`Cliente logado: ${clientName} (${clientId}) - Status: ${currentStatus}`);
    });

    // Login do funcionário
    socket.on('employee-login', (data) => {
        const { username, password } = data;
        if (username === 'Dinho' && password === '123456') {
            socket.userType = 'employee';
            socket.emit('employee-login-success');
            
            // Enviar lista de clientes
            const clientList = Object.values(clients).sort((a, b) => 
                new Date(b.loginTime) - new Date(a.loginTime)
            );
            socket.emit('client-list-update', clientList);
            
            console.log('Funcionário logado');
        } else {
            socket.emit('employee-login-error', 'Usuário ou senha incorretos');
        }
    });

    // Selecionar serviço
    socket.on('select-service', (service) => {
        const clientId = socket.clientId;
        if (!clientId || !conversations[clientId]) return;

        const message = {
            timestamp: new Date().toISOString(),
            type: 'client',
            text: `Serviço selecionado: ${service}`
        };
        
        conversations[clientId].push(message);
        saveConversation(clientId);
        socket.emit('conversation-update', message);
        
        io.emit('employee-conversation-update', {
            clientId,
            message
        });

        // Mudar status para aguardando dimensões
        clientStatus[clientId] = 'Aguardando Dimensões';
        
        // Atualizar status do cliente
        const clientList = Object.values(clients).sort((a, b) => 
            new Date(b.loginTime) - new Date(a.loginTime)
        );
        io.emit('client-list-update', clientList);

        // Perguntar dimensões automaticamente
        setTimeout(() => {
            const dimensionMsg = {
                timestamp: new Date().toISOString(),
                type: 'system',
                text: 'Quais as dimensões do seu serviço em cm?'
            };
            conversations[clientId].push(dimensionMsg);
            saveConversation(clientId);
            socket.emit('conversation-update', dimensionMsg);
        }, 500);
    });

    // Mensagem do cliente
    socket.on('client-message', (data) => {
        const clientId = socket.clientId;
        if (!clientId || !conversations[clientId]) return;

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

        // Lógica automática baseada no status atual
        const currentStatus = clientStatus[clientId] || 'Aguardando';
        const lastMsg = data.text.toLowerCase();
        
        // Verificar se a mensagem contém números (dimensões em cm)
        const hasDimensions = /\d+/.test(data.text);
        
        console.log(`Mensagem de ${clientId}: "${data.text}" - Status: ${currentStatus} - Tem dimensões: ${hasDimensions}`);
        
        if (currentStatus === 'Aguardando') {
            // Se for a primeira mensagem, perguntar dimensões
            const dimensionMsg = {
                timestamp: new Date().toISOString(),
                type: 'system',
                text: 'Quais as dimensões do seu serviço em cm?'
            };
            conversations[clientId].push(dimensionMsg);
            saveConversation(clientId);
            socket.emit('conversation-update', dimensionMsg);
            
            // Mudar status para aguardando dimensões
            clientStatus[clientId] = 'Aguardando Dimensões';
            socket.emit('status-update', 'Aguardando Dimensões');
            
            console.log(`Status alterado para: Aguardando Dimensões`);
            
        } else if (currentStatus === 'Aguardando Dimensões' && hasDimensions) {
            // Cliente respondeu com as dimensões
            clientStatus[clientId] = 'Em Análise';
            clients[clientId].status = 'Em Análise';
            
            const analysisMsg = {
                timestamp: new Date().toISOString(),
                type: 'system',
                text: 'O seu serviço está sendo analisado por um de nossos funcionários. Aguarde...'
            };
            conversations[clientId].push(analysisMsg);
            saveConversation(clientId);
            socket.emit('conversation-update', analysisMsg);
            socket.emit('status-update', 'Em Análise');
            
            console.log(`Status alterado para: Em Análise`);
            
            // Atualizar lista de clientes para funcionários
            const clientList = Object.values(clients).sort((a, b) => 
                new Date(b.loginTime) - new Date(a.loginTime)
            );
            io.emit('client-list-update', clientList);
        } else if (currentStatus === 'Aguardando Dimensões' && !hasDimensions) {
            // Cliente ainda não enviou dimensões válidas
            const remindMsg = {
                timestamp: new Date().toISOString(),
                type: 'system',
                text: 'Por favor, informe as dimensões do seu serviço em cm (ex: 50x40)'
            };
            conversations[clientId].push(remindMsg);
            saveConversation(clientId);
            socket.emit('conversation-update', remindMsg);
            
            console.log(`Lembrete de dimensões enviado para ${clientId}`);
        }
    });

    // Funcionário: enviar mensagem
    socket.on('employee-message', (data) => {
        const { clientId, text } = data;
        if (!conversations[clientId]) return;

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
        const clientList = Object.values(clients).sort((a, b) => 
            new Date(b.loginTime) - new Date(a.loginTime)
        );
        io.emit('client-list-update', clientList);
        
        console.log(`Pedido confirmado para ${clientId}`);
    });

    // Funcionário: confirmar arte
    socket.on('confirm-art', (clientId) => {
        if (!clients[clientId]) return;
        
        clientStatus[clientId] = 'Arte Pronta';
        clients[clientId].status = 'Arte Pronta';
        
        const message = {
            timestamp: new Date().toISOString(),
            type: 'system',
            text: '🎨 Arte pronta para impressão!'
        };
        
        conversations[clientId].push(message);
        saveConversation(clientId);
        
        io.to(clientId).emit('conversation-update', message);
        io.to(clientId).emit('status-update', 'Arte Pronta');
        
        const clientList = Object.values(clients).sort((a, b) => 
            new Date(b.loginTime) - new Date(a.loginTime)
        );
        io.emit('client-list-update', clientList);
        
        console.log(`Arte confirmada para ${clientId}`);
    });

    // Funcionário: cobrar
    socket.on('charge-client', (data) => {
        const { clientId, amount } = data;
        if (!clients[clientId]) return;
        
        pendingCharges[clientId] = {
            amount: amount,
            timestamp: new Date().toISOString()
        };
        
        const message = {
            timestamp: new Date().toISOString(),
            type: 'system',
            text: `💰 Valor do serviço: R$ ${amount}`
        };
        
        conversations[clientId].push(message);
        saveConversation(clientId);
        
        io.to(clientId).emit('conversation-update', message);
        io.to(clientId).emit('payment-request', {
            amount: amount,
            location: 'Dinho Papelaria - Em frente ao Açaí do Doga'
        });
        
        console.log(`Cobrança enviada para ${clientId}: R$ ${amount}`);
    });

    // Cliente: confirmar pagamento
    socket.on('confirm-payment', () => {
        const clientId = socket.clientId;
        if (!clients[clientId]) return;
        
        // Iniciar timer de produção
        clientStatus[clientId] = 'Em Produção';
        clients[clientId].status = 'Em Produção';
        
        const message = {
            timestamp: new Date().toISOString(),
            type: 'system',
            text: '⏱️ Pagamento confirmado! Em produção - 45 minutos'
        };
        
        conversations[clientId].push(message);
        saveConversation(clientId);
        
        io.to(clientId).emit('conversation-update', message);
        io.to(clientId).emit('status-update', 'Em Produção');
        io.to(clientId).emit('production-timer', 45);
        
        // Notificar funcionários
        const employeeMsg = {
            timestamp: new Date().toISOString(),
            type: 'system',
            text: `💰 Pagamento confirmado por ${clients[clientId].name}`
        };
        io.emit('employee-conversation-update', {
            clientId,
            message: employeeMsg
        });
        
        // Atualizar lista
        const clientList = Object.values(clients).sort((a, b) => 
            new Date(b.loginTime) - new Date(a.loginTime)
        );
        io.emit('client-list-update', clientList);
        
        console.log(`Pagamento confirmado para ${clientId}`);
    });

    // Funcionário: finalizar produção
    socket.on('finish-production', (clientId) => {
        if (!clients[clientId]) return;
        
        const message = {
            timestamp: new Date().toISOString(),
            type: 'system',
            text: '✅ Produção finalizada! Pronto para retirada.'
        };
        
        conversations[clientId].push(message);
        saveConversation(clientId);
        
        io.to(clientId).emit('conversation-update', message);
        io.to(clientId).emit('production-finished');
        io.to(clientId).emit('status-update', 'Pronto para Retirada');
        
        console.log(`Produção finalizada para ${clientId}`);
    });

    // Funcionário: pagamento realizado
    socket.on('employee-payment-done', (clientId) => {
        if (!clients[clientId]) return;
        
        // Iniciar timer de produção
        clientStatus[clientId] = 'Em Produção';
        clients[clientId].status = 'Em Produção';
        
        const message = {
            timestamp: new Date().toISOString(),
            type: 'system',
            text: '⏱️ Pagamento realizado! Em produção - 45 minutos'
        };
        
        conversations[clientId].push(message);
        saveConversation(clientId);
        
        io.to(clientId).emit('conversation-update', message);
        io.to(clientId).emit('status-update', 'Em Produção');
        io.to(clientId).emit('production-timer', 45);
        
        // Atualizar lista
        const clientList = Object.values(clients).sort((a, b) => 
            new Date(b.loginTime) - new Date(a.loginTime)
        );
        io.emit('client-list-update', clientList);
        
        console.log(`Pagamento realizado pelo funcionário para ${clientId}`);
    });

    // Desconectar
    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
        // Remover referências se necessário
    });
});

// Rotas
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
