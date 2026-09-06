const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

const CONVERSATIONS_DIR = path.join(__dirname, 'conversations');
const USERS_FILE = path.join(__dirname, 'users.json');

// Criar pastas e arquivos
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
    console.log('📄 Arquivo users.json criado');
}

// Servir arquivos estáticos
app.use(express.static('public'));
app.use(express.json());

// Rota para listar clientes
app.get('/api/clients', (req, res) => {
    try {
        const files = fs.readdirSync(CONVERSATIONS_DIR);
        const clients = files
            .filter(file => file.endsWith('.txt'))
            .map(file => {
                const clientName = file.replace('.txt', '');
                const stats = fs.statSync(path.join(CONVERSATIONS_DIR, file));
                return {
                    name: clientName,
                    lastActivity: stats.mtime.getTime()
                };
            })
            .sort((a, b) => b.lastActivity - a.lastActivity)
            .map(client => client.name);
        
        res.json(clients);
    } catch (error) {
        console.error('Erro ao listar clientes:', error);
        res.json([]);
    }
});

// Rota para histórico de conversas
app.get('/api/conversations/:clientName', (req, res) => {
    try {
        const clientName = req.params.clientName;
        const filePath = path.join(CONVERSATIONS_DIR, `${clientName}.txt`);
        
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            const messages = content.split('\n')
                .filter(line => line.trim())
                .map(line => {
                    const [timestamp, sender, ...msgParts] = line.split('|');
                    return {
                        timestamp,
                        sender,
                        message: msgParts.join('|')
                    };
                });
            res.json(messages);
        } else {
            res.json([]);
        }
    } catch (error) {
        console.error('Erro ao carregar conversa:', error);
        res.json([]);
    }
});

// Rota de login
app.post('/api/login', (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('Tentativa de login:', username);
        
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        
        if (users[username] && users[username].password === password) {
            console.log('✅ Login bem-sucedido:', username);
            res.json({ 
                success: true, 
                user: { 
                    username, 
                    name: users[username].name,
                    role: users[username].role
                } 
            });
        } else {
            console.log('❌ Falha no login:', username);
            res.status(401).json({ success: false, message: 'Credenciais inválidas' });
        }
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ success: false, message: 'Erro interno' });
    }
});

// Rota de teste
app.get('/api/test', (req, res) => {
    res.json({ message: 'API funcionando!' });
});

// Socket.IO
io.on('connection', (socket) => {
    console.log('🔌 Cliente conectado:', socket.id);

    socket.on('client-join', (data) => {
        try {
            const { clientName } = data;
            console.log('👤 Cliente entrou:', clientName);
            socket.clientName = clientName;
            socket.isClient = true;
            
            // Carregar histórico
            const filePath = path.join(CONVERSATIONS_DIR, `${clientName}.txt`);
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf8');
                const messages = content.split('\n')
                    .filter(line => line.trim())
                    .map(line => {
                        const [timestamp, sender, ...msgParts] = line.split('|');
                        return {
                            timestamp,
                            sender,
                            message: msgParts.join('|')
                        };
                    });
                socket.emit('chat-history', messages);
            }
            
            // Notificar todos
            io.emit('client-online', { clientName, status: 'online' });
            io.emit('update-client-list');
            
            // Confirmar para o cliente
            socket.emit('client-join-success', { clientName });
        } catch (error) {
            console.error('Erro no client-join:', error);
        }
    });

    socket.on('employee-join', (data) => {
        try {
            const { username, name } = data;
            console.log('👨‍💼 Funcionário entrou:', username);
            socket.username = username;
            socket.userName = name;
            socket.isClient = false;
            
            socket.emit('update-client-list');
        } catch (error) {
            console.error('Erro no employee-join:', error);
        }
    });

    socket.on('client-message', (data) => {
        try {
            const { clientName, message } = data;
            console.log('💬 Mensagem de', clientName, ':', message);
            const timestamp = new Date().toLocaleString('pt-BR');
            const filePath = path.join(CONVERSATIONS_DIR, `${clientName}.txt`);
            
            const logLine = `${timestamp}|Cliente|${message}\n`;
            fs.appendFileSync(filePath, logLine);
            
            io.emit('new-message', {
                clientName,
                message,
                sender: 'Cliente',
                timestamp
            });
            io.emit('update-client-list');
        } catch (error) {
            console.error('Erro no client-message:', error);
        }
    });

    socket.on('employee-message', (data) => {
        try {
            const { clientName, message, employeeName } = data;
            console.log('💬 Mensagem do funcionário para', clientName, ':', message);
            const timestamp = new Date().toLocaleString('pt-BR');
            const filePath = path.join(CONVERSATIONS_DIR, `${clientName}.txt`);
            
            const logLine = `${timestamp}|${employeeName}|${message}\n`;
            fs.appendFileSync(filePath, logLine);
            
            // Enviar para o cliente
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
            
            socket.broadcast.emit('employee-message-sent', {
                clientName,
                message,
                sender: employeeName,
                timestamp
            });
            io.emit('update-client-list');
        } catch (error) {
            console.error('Erro no employee-message:', error);
        }
    });

    // Eventos do pedido
    socket.on('confirmar-pedido', (data) => {
        try {
            const { clientName } = data;
            console.log('📋 Pedido confirmado para:', clientName);
            io.emit('pedido-confirmado', { clientName });
        } catch (error) {
            console.error('Erro no confirmar-pedido:', error);
        }
    });

    socket.on('confirmar-arte', (data) => {
        try {
            const { clientName } = data;
            console.log('🎨 Arte confirmada para:', clientName);
            io.emit('arte-confirmada', { clientName });
        } catch (error) {
            console.error('Erro no confirmar-arte:', error);
        }
    });

    socket.on('cobrar-cliente', (data) => {
        try {
            const { clientName, valor } = data;
            console.log('💰 Cobrança enviada para:', clientName, 'Valor: R$', valor);
            io.emit('cobranca-enviada', { clientName, valor });
        } catch (error) {
            console.error('Erro no cobrar-cliente:', error);
        }
    });

    socket.on('pagamento-realizado', (data) => {
        try {
            const { clientName } = data;
            console.log('✅ Pagamento realizado para:', clientName);
            io.emit('pagamento-confirmado', { clientName });
        } catch (error) {
            console.error('Erro no pagamento-realizado:', error);
        }
    });

    socket.on('disconnect', () => {
        try {
            if (socket.isClient && socket.clientName) {
                console.log('🔴 Cliente desconectado:', socket.clientName);
                io.emit('client-offline', { clientName: socket.clientName });
                io.emit('update-client-list');
            }
        } catch (error) {
            console.error('Erro no disconnect:', error);
        }
    });
});

server.listen(PORT, () => {
    console.log('\n🚀 ==================================');
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`🔗 Acesse: http://localhost:${PORT}`);
    console.log('👤 Funcionário: Dinho | Senha: 123456');
    console.log('📁 Conversas salvas em:', CONVERSATIONS_DIR);
    console.log('🚀 ==================================\n');
});
