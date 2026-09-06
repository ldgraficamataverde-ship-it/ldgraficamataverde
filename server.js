const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

const CONVERSATIONS_DIR = path.join(__dirname, 'conversations');
const USERS_FILE = path.join(__dirname, 'users.json');

// Criar pastas e arquivos necessários
if (!fs.existsSync(CONVERSATIONS_DIR)) {
    fs.mkdirSync(CONVERSATIONS_DIR);
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
}

app.use(express.static('public'));
app.use(express.json());

// Lista de clientes ordenada por último login
app.get('/api/clients', (req, res) => {
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
        .sort((a, b) => b.lastActivity - a.lastActivity) // Ordenar por mais recente
        .map(client => client.name);
    
    res.json(clients);
});

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

app.post('/api/login', (req, res) => {
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
});

// Socket.io
io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);

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
        
        // Notificar funcionários sobre novo cliente
        io.emit('client-online', { clientName, status: 'online' });
        io.emit('update-client-list');
    });

    // Funcionário entrou
    socket.on('employee-join', (data) => {
        const { username, name } = data;
        socket.username = username;
        socket.userName = name;
        socket.isClient = false;
        socket.emit('update-client-list');
    });

    // Mensagem do cliente
    socket.on('client-message', (data) => {
        const { clientName, message } = data;
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
    });

    // Mensagem do funcionário
    socket.on('employee-message', (data) => {
        const { clientName, message, employeeName } = data;
        const timestamp = new Date().toLocaleString('pt-BR');
        const filePath = path.join(CONVERSATIONS_DIR, `${clientName}.txt`);
        
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
        
        socket.broadcast.emit('employee-message-sent', {
            clientName,
            message,
            sender: employeeName,
            timestamp
        });
        io.emit('update-client-list');
    });

    socket.on('disconnect', () => {
        if (socket.isClient && socket.clientName) {
            io.emit('client-offline', { clientName: socket.clientName });
            io.emit('update-client-list');
        }
        console.log('Cliente desconectado:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Servidor rodando na porta ${PORT}`);
    console.log(`👤 Usuário: Dinho | Senha: 123456`);
});