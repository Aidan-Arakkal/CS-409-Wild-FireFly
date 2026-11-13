const path = require('node:path');
const express = require('express');
const mongoose = require('mongoose');
const User = require('./models/user');

const Session = require('./models/session');

const app = express();
app.use(express.json());
app.use('/api/auth', require('./routes/auth'));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../Frontend/index.html')));
app.get('/auth.js', (req, res) => res.sendFile(path.join(__dirname, '../Frontend/auth.js')));
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid JSON.' });
    }
    if (error.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Request is too large.' });
    }
    console.error('Request failed:', error.name);
    return res.status(500).json({ error: 'Request failed.' });
});

app.get('/api/health', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.status(503).json({ status: 'unavailable' });
        }
        await mongoose.connection.db.command({ ping: 1 });
        return res.json({ status: 'ok', database: mongoose.connection.name });
    } catch {
        return res.status(503).json({ status: 'unavailable' });
    }
});

async function start() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('Set MONGODB_URI in Backend/.env or the server environment.');
        process.exitCode = 1;
        return;
    }

    try {
        await mongoose.connect(uri, {
            dbName: 'cs409_final',
            serverSelectionTimeoutMS: 5000
        });
        await Promise.all([User.init(), Session.init()]);

        const port = Number(process.env.PORT || 3000);
        const server = app.listen(port, () => {
            console.log(`API listening on port ${server.address().port} (database: cs409_final)`);
        });
        server.on('error', async (error) => {
            console.error('HTTP server failed:', error.code);
            await mongoose.disconnect();
            process.exitCode = 1;
        });
    } catch (error) {
        console.error('Backend startup failed:', error.name);
        await mongoose.disconnect();
        process.exitCode = 1;
    }
}

start();
