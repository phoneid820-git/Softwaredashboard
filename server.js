const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// CORS سیٹنگز تاکہ ہر جگہ سے ریکویسٹ قبول ہو سکے
app.use(cors());

// پروفائل تصویر کے لیے 50mb کی لیمٹ (جیسا کہ آپ نے پہلے مانگا تھا)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// آن لائن ہوسٹنگ (Render) کے لیے پورٹ کی سیٹنگ
const PORT = process.env.PORT || 3000;

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", 
        methods: ["GET", "POST"]
    }
});

// عارضی ڈیٹا بیس (رجسٹرڈ یوزرز کی لسٹ)
let users = {}; 

/**
 * یوزر رجسٹریشن روٹ
 * لاگ ان پیج اسی یو آر ایل پر ڈیٹا بھیجے گا
 */
app.post('/register', (req, res) => {
    const { id, fullName, profilePic } = req.body;
    
    if (id && fullName) {
        users[id] = { 
            id: id, 
            name: fullName, 
            pic: profilePic, 
            online: false,
            socketId: null 
        };
        console.log(`✅ User Registered: ${fullName} (${id})`);
        res.status(200).send({ success: true, message: "Registered successfully" });
    } else {
        res.status(400).send({ success: false, error: "Missing ID or Full Name" });
    }
});

io.on('connection', (socket) => {
    console.log('🟢 New Connection:', socket.id);

    // یوزر آن لائن ہونے پر (ڈیش بورڈ لوڈ ہوتے ہی)
    socket.on('user-online', (data) => {
        if (data.id) {
            socket.join(data.id); 
            
            if (users[data.id]) {
                users[data.id].online = true;
                users[data.id].socketId = socket.id;
            } else {
                // اگر رجسٹریشن ڈیٹا بیس میں نہیں ہے تو نیا بنا دیں
                users[data.id] = { 
                    id: data.id, 
                    name: data.fullName || "User", 
                    pic: data.profilePic || "", 
                    online: true, 
                    socketId: socket.id 
                };
            }
            
            console.log(`📱 ${users[data.id].name} is now Online`);
            // تمام یوزرز کو اپڈیٹڈ لسٹ بھیجنا
            io.emit('users-update', Object.values(users).filter(u => u.online));
        }
    });

    // یوزر تلاش کرنا (ID کے ذریعے یوزر ایڈ کرنے کے لیے)
    socket.on('find-user', (searchId) => {
        const foundUser = users[searchId];
        if (foundUser) {
            socket.emit('user-found', {
                id: foundUser.id,
                name: foundUser.name,
                pic: foundUser.pic
            });
        } else {
            socket.emit('user-found', null);
        }
    });

    // کال کی لاجک
    socket.on('join-call', (data) => {
        socket.to(data.to).emit('call-status', { from: data.from, status: 'connected' });
    });

    // کال ختم کرنا
    socket.on('end-call', (data) => {
        socket.to(data.to).emit('call-ended');
    });

    // ڈس کنیکٹ (آف لائن) ہونا
    socket.on('disconnect', () => {
        for (let id in users) {
            if (users[id].socketId === socket.id) {
                users[id].online = false;
                console.log(`🔴 User Offline: ${users[id].name}`);
                break;
            }
        }
        io.emit('users-update', Object.values(users).filter(u => u.online));
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
});
