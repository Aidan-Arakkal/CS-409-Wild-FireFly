const express = require('express');
const mongoose = require('mongoose');
const User = require('./models/user');

const app = express();
app.use(express.json());

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
        await User.init();

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
