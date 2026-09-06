const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Configurações
app.use(express.static('public'));
app.use(express.json());

// Configurar upload de imagens
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'public', 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, `img-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    },
    fileFilter: function (req, file, cb) {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Apenas imagens são permitidas (JPEG, PNG, GIF, WEBP)'));
        }
    }
});

// Garantir que a pasta de conversas existe
const conversationsDir = path.join(__dirname, 'conversations');
if (!fs.existsSync(conversationsDir)) {
    fs.mkdirSync(conversationsDir);
}

// Estrutura de dados em memória
const clients = {};
const conversations = {};
const clientStatus = {};
const finishedClients = {};

// Funções auxiliares
function saveConversation(clientId) {
    if (!conversations[clientId]) return;
    const filePath = path.join(conversationsDir, `${clientId}.txt`);
    const content = conversations[clientId].map(msg => {
        if (msg.type === 'image') {
            return `[${msg.timestamp}] ${msg.type}: ${msg.text}|${msg.imageUrl}`;
        }
        return `[${msg.timestamp}] ${msg.type}: ${msg.text}`;
    }).join('\n');
    fs.writeFileSync(filePath, content);
}

function loadConversation(clientId) {
    const filePath = path.join(conversationsDir, `${clientId}.txt`);
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        return content.split('\n').filter(line => line.trim()).map(line => {
            const match = line.match(/\[(.*?)\]\s+(.*?):\s+(.*)/);
            if (match) {
                const text = match[3];
                // Verificar se é uma imagem (contém |)
                if (text.includes('|')) {
                    const [msgText, imageUrl] = text.split('|');
                    return {
                        timestamp: match[1],
                        type: match[2],
                        text: msgText,
                        imageUrl: imageUrl
                    };
                }
                return {
                    timestamp: match[1],
                    type: match[2],
                    text: text
                };
            }
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
    const activeClients = Object.values(clients).filter(client => 
        !finishedClients[client.id]
    );
    const clientList = activeClients.sort((a, b) => 
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
        
        if (finishedClients[clientId]) {
            delete finishedClients[clientId];
        }
        
        if (!conversations[clientId]) {
            conversations[clientId] = loadConversation(clientId);
            if (conversations[clientId].length === 0) {
                const welcomeMsg = {
                    timestamp: new Date().toISOString(),
                    type: 'system',
                    text: `Olá ${clientName}! Como posso ajudá-lo hoje?`
                };
                conversations[clientId].push(welcomeMsg);
                saveConversation(clientId);
            }
        }

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
            if (finishedClients[clientId]) {
                delete finishedClients[clientId];
            }
        }

        socket.join(clientId);
        socket.clientId = clientId;
        socket.userType = 'client';

        socket.emit('conversation-history', conversations[clientId]);
        
        const currentStatus = clientStatus[clientId] || 'Aguardando';
        socket.emit('status-update', currentStatus);
        
        updateClientList();
        
        console.log(`Cliente logado: ${clientName} (${clientId}) - Status: ${currentStatus}`);
    });

    // Login do funcionário
    socket.on('employee-login', (data) => {
        const { username, password } = data;
        if (username === 'Dinho' && password === '123456') {
            socket.userType = 'employee';
            socket.emit('employee-login-success');
            
            const activeClients = Object.values(clients).filter(client => 
                !finishedClients[client.id]
            );
            const clientList = activeClients.sort((a, b) => 
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
        
        if (!clients[clientId]) {
            socket.emit('employee-client-error', 'Cliente não encontrado');
            return;
        }
        
        if (!conversations[clientId]) {
            conversations[clientId] = loadConversation(clientId);
        }
        
        socket.emit('employee-conversation-history', {
            clientId: clientId,
            messages: conversations[clientId] || []
        });
        
        console.log(`Funcionário visualizando cliente: ${clientId}`);
    });

    // Mensagem do cliente
    socket.on('client-message', (data) => {
        const clientId = socket.clientId;
        if (!clientId) return;
        
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
        
        socket.emit('conversation-update', message);
        
        io.emit('employee-conversation-update', {
            clientId,
            message
        });
        
        console.log(`Mensagem de ${clientId}: ${data.text}`);
    });

    // Cliente enviar imagem
    socket.on('client-image', (data) => {
        const clientId = socket.clientId;
        if (!clientId) return;
        
        if (!conversations[clientId]) {
            conversations[clientId] = [];
        }

        const message = {
            timestamp: new Date().toISOString(),
            type: 'image',
            text: '📷 Imagem enviada',
            imageUrl: data.imageUrl,
            sender: 'client'
        };
        
        conversations[clientId].push(message);
        saveConversation(clientId);
        
        socket.emit('conversation-update', message);
        
        io.emit('employee-conversation-update', {
            clientId,
            message
        });
        
        console.log(`Imagem enviada por ${clientId}: ${data.imageUrl}`);
    });

    // Funcionário enviar imagem
    socket.on('employee-image', (data) => {
        const { clientId, imageUrl } = data;
        if (!clientId) return;
        
        if (!conversations[clientId]) {
            conversations[clientId] = [];
        }

        const message = {
            timestamp: new Date().toISOString(),
            type: 'image',
            text: '📷 Imagem enviada',
            imageUrl: imageUrl,
            sender: 'employee'
        };
        
        conversations[clientId].push(message);
        saveConversation(clientId);
        
        io.to(clientId).emit('conversation-update', message);
        
        io.emit('employee-conversation-update', {
            clientId,
            message
        });
        
        console.log(`Imagem enviada pelo funcionário para ${clientId}: ${imageUrl}`);
    });

    // Funcionário: enviar mensagem
    socket.on('employee-message', (data) => {
        const { clientId, text } = data;
        if (!clientId) return;
        
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
        
        io.emit('employee-conversation-update', {
            clientId,
            message
        });
        
        console.log(`Mensagem do funcionário para ${clientId}: ${text}`);
    });

    // Funcionário: enviar Pix
    socket.on('send-pix', (clientId) => {
        if (!clients[clientId]) return;
        
        const pixMessage = `💳 PIX para pagamento:\n📌 CPF: 10622933639\n👤 Favorecido: Silverio Santos Martins\n🏦 Banco: Picpay`;
        
        const message = {
            timestamp: new Date().toISOString(),
            type: 'employee',
            text: pixMessage
        };
        
        if (!conversations[clientId]) {
            conversations[clientId] = [];
        }
        
        conversations[clientId].push(message);
        saveConversation(clientId);
        
        io.to(clientId).emit('conversation-update', message);
        
        io.emit('employee-conversation-update', {
            clientId,
            message
        });
        
        console.log(`PIX enviado para ${clientId}`);
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
        
        updateClientList();
        
        console.log(`Pagamento confirmado para ${clientId}`);
    });

    // Funcionário: definir tempo de produção com data/hora
    socket.on('set-production-time', (data) => {
        const { clientId, datetime } = data;
        if (!clients[clientId]) return;
        
        const productionDate = new Date(datetime);
        const now = new Date();
        const diffMinutes = Math.floor((productionDate - now) / (1000 * 60));
        const minutes = Math.max(diffMinutes, 1);
        
        clientStatus[clientId] = 'Em Produção';
        clients[clientId].status = 'Em Produção';
        
        const formattedDate = productionDate.toLocaleDateString('pt-BR', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const message = {
            timestamp: new Date().toISOString(),
            type: 'system',
            text: `⏱️ Em produção - Previsão de entrega: ${formattedDate}`
        };
        
        conversations[clientId].push(message);
        saveConversation(clientId);
        
        io.to(clientId).emit('conversation-update', message);
        io.to(clientId).emit('status-update', 'Em Produção');
        io.to(clientId).emit('production-timer', minutes);
        io.to(clientId).emit('production-datetime', {
            datetime: datetime,
            formatted: formattedDate
        });
        
        updateClientList();
        
        console.log(`Produção iniciada para ${clientId} - Previsão: ${formattedDate} (${minutes} minutos)`);
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
        
        updateClientList();
        
        console.log(`Produção finalizada para ${clientId}`);
    });

    // Funcionário: finalizar atendimento
    socket.on('finish-attendance', (clientId) => {
        if (!clients[clientId]) return;
        
        finishedClients[clientId] = true;
        
        const message = {
            timestamp: new Date().toISOString(),
            type: 'system',
            text: '✅ Atendimento finalizado! Obrigado pela preferência!'
        };
        
        conversations[clientId].push(message);
        saveConversation(clientId);
        
        io.to(clientId).emit('attendance-finished');
        io.to(clientId).emit('conversation-update', message);
        io.to(clientId).emit('status-update', 'Atendimento Finalizado');
        
        const clientName = clients[clientId].name;
        delete clients[clientId];
        delete clientStatus[clientId];
        
        updateClientList();
        
        console.log(`Atendimento finalizado para ${clientName} (${clientId})`);
        
        socket.emit('attendance-finished-confirm', {
            clientId,
            message: `Atendimento de ${clientName} finalizado com sucesso!`
        });
    });

    // Desconectar
    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
    });
});

// Rota para upload de imagem
app.post('/upload-image', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhuma imagem enviada' });
        }
        
        const imageUrl = `/uploads/${req.file.filename}`;
        res.json({ 
            success: true, 
            imageUrl: imageUrl 
        });
    } catch (error) {
        console.error('Erro no upload:', error);
        res.status(500).json({ error: 'Erro ao fazer upload da imagem' });
    }
});

// Rota para upload de imagem do funcionário
app.post('/upload-employee-image', upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Nenhuma imagem enviada' });
        }
        
        const imageUrl = `/uploads/${req.file.filename}`;
        res.json({ 
            success: true, 
            imageUrl: imageUrl 
        });
    } catch (error) {
        console.error('Erro no upload:', error);
        res.status(500).json({ error: 'Erro ao fazer upload da imagem' });
    }
});

// Rota para servir arquivos estáticos
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
