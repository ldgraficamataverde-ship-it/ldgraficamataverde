const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Configuração do Socket.IO para produção
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['polling', 'websocket'],
    allowEIO3: true
});

const PORT = process.env.PORT || 8080;

// Pastas e arquivos
const CONVERSATIONS_DIR = path.join(__dirname, 'conversations');
const USERS_FILE = path.join(__dirname, 'users.json');

if (!fs.existsSync(CONVERSATIONS_DIR)) {
    fs.mkdirSync(CONVERSATIONS_DIR);
    console.log('📁 Pasta conversations criada');
}

if (!fs.existsSync(USERS_FILE)) {
    const defaultUsers = {
        "Dinho": {
            password: "123456",
            name: "Dinho",
            role: "funcionario"
        }
    };
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
    console.log('📄 users.json criado');
}

// Servir arquivos estáticos
app.use(express.static('public'));
app.use(express.json());

// Rotas da API
app.get('/api/clients', (req, res) => {
    try {
        const files = fs.readdirSync(CONVERSATIONS_DIR);
        const clients = files
            .filter(file => file.endsWith('.txt'))
            .map(file => file.replace('.txt', ''))
            .sort();
        res.json(clients);
    } catch (error) {
        res.json([]);
    }
});

app.get('/api/conversations/:clientName', (req, res) => {
    try {
        const clientName = req.params.clientName;
        const filePath = path.join(CONVERSATIONS_DIR, `${clientName}.txt`);
        
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            const messages = content.split('\n')
                .filter(line => line.trim())
                .map(line => {
                    const parts = line.split('|');
                    return {
                        timestamp: parts[0] || '',
                        sender: parts[1] || '',
                        message: parts.slice(2).join('|') || ''
                    };
                });
            res.json(messages);
        } else {
            res.json([]);
        }
    } catch (error) {
        res.json([]);
    }
});

app.post('/api/login', (req, res) => {
    try {
        const { username, password } = req.body;
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        
        if (users[username] && users[username].password === password) {
            res.json({ 
                success: true, 
                user: { 
                    username, 
                    name: users[username].name,
                    role: users[username].role
                } 
            });
        } else {
            res.status(401).json({ success: false, message: 'Credenciais inválidas' });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: 'Erro interno' });
    }
});

// Rota de teste
app.get('/api/test', (req, res) => {
    res.json({ message: 'API funcionando!' });
});

// Socket.IO
io.on('connection', (socket) => {
    console.log('✅ Cliente conectado:', socket.id);

    // Cliente entrou
    socket.on('client-join', (data) => {
        const { clientName } = data;
        socket.clientName = clientName;
        socket.isClient = true;
        console.log('👤 Cliente entrou:', clientName);
        
        // Carregar histórico
        const filePath = path.join(CONVERSATIONS_DIR, `${clientName}.txt`);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            const messages = content.split('\n')
                .filter(line => line.trim())
                .map(line => {
                    const parts = line.split('|');
                    return {
                        timestamp: parts[0] || '',
                        sender: parts[1] || '',
                        message: parts.slice(2).join('|') || ''
                    };
                });
            socket.emit('chat-history', messages);
        }
        
        // Notificar todos
        io.emit('client-online', { clientName });
        io.emit('update-client-list');
        socket.emit('client-join-success', { clientName });
    });

    // Funcionário entrou
    socket.on('employee-join', (data) => {
        const { username, name } = data;
        socket.username = username;
        socket.userName = name;
        socket.isClient = false;
        console.log('👨‍💼 Funcionário entrou:', username);
        socket.emit('update-client-list');
    });

    // Mensagem do cliente
    socket.on('client-message', (data) => {
        const { clientName, message } = data;
        const timestamp = new Date().toLocaleString('pt-BR');
        const filePath = path.join(CONVERSATIONS_DIR, `${clientName}.txt`);
        
        // Salvar
        const logLine = `${timestamp}|Cliente|${message}\n`;
        fs.appendFileSync(filePath, logLine);
        
        // Enviar para todos
        io.emit('new-message', {
            clientName,
            message,
            sender: 'Cliente',
            timestamp
        });
        io.emit('update-client-list');
    });

    // Mensagem do funcionário
    socket.on('employee-message', (data) => {
        const { clientName, message, employeeName } = data;
        const timestamp = new Date().toLocaleString('pt-BR');
        const filePath = path.join(CONVERSATIONS_DIR, `${clientName}.txt`);
        
        // Salvar
        const logLine = `${timestamp}|${employeeName}|${message}\n`;
        fs.appendFileSync(filePath, logLine);
        
        // Enviar para o cliente específico
        const clients = io.sockets.sockets;
        for (let [id, client] of clients) {
            if (client.isClient && client.clientName === clientName) {
                client.emit('new-message', {
                    message,
                    sender: employeeName,
                    timestamp
                });
            }
        }
        
        // Enviar para todos os funcionários
        socket.broadcast.emit('employee-message-sent', {
            clientName,
            message,
            sender: employeeName,
            timestamp
        });
        io.emit('update-client-list');
    });

    // Eventos do pedido
    socket.on('confirmar-pedido', (data) => {
        const { clientName } = data;
        console.log('📋 Pedido confirmado:', clientName);
        io.emit('pedido-confirmado', { clientName });
    });

    socket.on('confirmar-arte', (data) => {
        const { clientName } = data;
        console.log('🎨 Arte confirmada:', clientName);
        io.emit('arte-confirmada', { clientName });
    });

    socket.on('cobrar-cliente', (data) => {
        const { clientName, valor } = data;
        console.log('💰 Cobrança enviada:', clientName, 'R$', valor);
        io.emit('cobranca-enviada', { clientName, valor });
    });

    socket.on('pagamento-realizado', (data) => {
        const { clientName } = data;
        console.log('✅ Pagamento realizado:', clientName);
        io.emit('pagamento-confirmado', { clientName });
    });

    socket.on('disconnect', () => {
        if (socket.isClient && socket.clientName) {
            console.log('🔴 Cliente desconectou:', socket.clientName);
            io.emit('client-offline', { clientName: socket.clientName });
            io.emit('update-client-list');
        }
    });
});

// Iniciar servidor
server.listen(PORT, '0.0.0.0', () => {
    console.log('\n🚀 ==================================');
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🔗 Acesse: https://${process.env.RAILWAY_STATIC_URL || 'localhost:' + PORT}`);
    console.log('👤 Funcionário: Dinho | Senha: 123456');
    console.log('📁 Conversas salvas em:', CONVERSATIONS_DIR);
    console.log('🚀 ==================================\n');
});
