const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Configurações
const CONVERSATIONS_DIR = path.join(__dirname, 'conversations');
const USERS_FILE = path.join(__dirname, 'users.json');

// Criar pasta de conversas se não existir
if (!fs.existsSync(CONVERSATIONS_DIR)) {
    fs.mkdirSync(CONVERSATIONS_DIR);
}

// Criar arquivo de usuários se não existir
if (!fs.existsSync(USERS_FILE)) {
    const defaultUsers = {
        admin: {
            password: 'admin123',
            name: 'Administrador'
        },
        grafica: {
            password: 'grafica123',
            name: 'LD Gráfica'
        }
    };
    fs.writeFileSync(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
}

// Servir arquivos estáticos
app.use(express.static('public'));
app.use(express.json());

// Rotas para arquivos de conversa
app.get('/api/conversations/:clientName', (req, res) => {
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
});

app.get('/api/clients', (req, res) => {
    const files = fs.readdirSync(CONVERSATIONS_DIR);
    const clients = files
        .filter(file => file.endsWith('.txt'))
        .map(file => file.replace('.txt', ''));
    res.json(clients);
});

// Autenticação
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    
    if (users[username] && users[username].password === password) {
        res.json({ 
            success: true, 
            user: { 
                username, 
                name: users[username].name 
            } 
        });
    } else {
        res.status(401).json({ success: false, message: 'Credenciais inválidas' });
    }
});

// Socket.io - Chat em tempo real
io.on('connection', (socket) => {
    console.log('Novo cliente conectado:', socket.id);

    // Cliente entrou no chat
    socket.on('client-join', (data) => {
        const { clientName } = data;
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
        
        // Notificar funcionários
        io.emit('client-online', { clientName, status: 'online' });
    });

    // Funcionário entrou
    socket.on('employee-join', (data) => {
        const { username, name } = data;
        socket.username = username;
        socket.userName = name;
        socket.isClient = false;
        
        // Enviar lista de clientes ativos
        const activeClients = [];
        const clients = io.sockets.sockets;
        for (let [id, client] of clients) {
            if (client.isClient && client.clientName) {
                activeClients.push(client.clientName);
            }
        }
        socket.emit('active-clients', activeClients);
    });

    // Mensagem do cliente
    socket.on('client-message', (data) => {
        const { clientName, message } = data;
        const timestamp = new Date().toISOString();
        const filePath = path.join(CONVERSATIONS_DIR, `${clientName}.txt`);
        
        // Salvar no arquivo
        const logLine = `${timestamp}|Cliente|${message}\n`;
        fs.appendFileSync(filePath, logLine);
        
        // Enviar para todos os funcionários
        io.emit('new-message', {
            clientName,
            message,
            sender: 'Cliente',
            timestamp
        });
    });

    // Mensagem do funcionário
    socket.on('employee-message', (data) => {
        const { clientName, message, employeeName } = data;
        const timestamp = new Date().toISOString();
        const filePath = path.join(CONVERSATIONS_DIR, `${clientName}.txt`);
        
        // Salvar no arquivo
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
        
        // Enviar para outros funcionários (atualizar conversa)
        socket.broadcast.emit('employee-message-sent', {
            clientName,
            message,
            sender: employeeName,
            timestamp
        });
    });

    // Desconexão
    socket.on('disconnect', () => {
        if (socket.isClient && socket.clientName) {
            io.emit('client-offline', { clientName: socket.clientName });
        }
        console.log('Cliente desconectado:', socket.id);
    });
});

// Iniciar servidor
server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`📁 Conversas salvas em: ${CONVERSATIONS_DIR}`);
});