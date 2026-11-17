// 1. Load environment variables FIRST so MONGODB_URI_S and MONGODB_URI exist
require('dotenv').config();

const path = require('node:path');
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// 2. Validate URIs before creating connections
const authUri = process.env.MONGODB_URI;
const sightingsUri = process.env.MONGODB_URI_S;
const authDatabaseName = 'cs409_final';

if (!authUri || !sightingsUri) {
    console.error('Set both MONGODB_URI and MONGODB_URI_S in Backend/.env or the server environment.');
    process.exit(1);
}

// 3. Create the secondary connection BEFORE requiring models/sighting.js
// (mongoose.connections[0] is the default connection; this becomes mongoose.connections[1])
const sightingsConn = mongoose.createConnection(sightingsUri, {
    serverSelectionTimeoutMS: 5000
});

// 4. Load models (Sighting attaches to mongoose.connections[1])
const User = require('./models/user');
const Session = require('./models/session');
const Sighting = require('./models/sighting');

const app = express();

// 5. Global middleware MUST be registered BEFORE routes
app.use((req, res, next) => {
    // Auth handles credentialed CORS, including its own preflight.
    if (/^\/api\/auth(?:\/|$)/i.test(req.path)) return next();

    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With, X-HTTP-Method-Override, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Methods", "POST, GET, PUT, DELETE, OPTIONS");
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 6. API and Frontend routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/sightings')(router));

// Serve every Frontend file for local testing (GitHub Pages serves them in production).
app.use(express.static(path.join(__dirname, '../Frontend')));

app.get('/api/health', async (req, res) => {
    try {
        const authReady = mongoose.connection.readyState === 1;
        const sightingsReady = sightingsConn.readyState === 1;

        if (!authReady || !sightingsReady) {
            return res.status(503).json({
                status: 'unavailable',
                authDb: authReady,
                sightingsDb: sightingsReady
            });
        }

        await Promise.all([
            mongoose.connection.db.command({ ping: 1 }),
            sightingsConn.db.command({ ping: 1 })
        ]);

        return res.json({
            status: 'ok',
            authDatabase: mongoose.connection.name,
            sightingsDatabase: sightingsConn.name
        });
    } catch {
        return res.status(503).json({ status: 'unavailable' });
    }
});

// 7. Error handling middleware MUST be last
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({ error: 'Invalid JSON.' });
    }
    if (error.type === 'entity.too.large') {
        return res.status(413).json({ error: 'Request is too large.' });
    }
    console.error('Request failed:', error);
    return res.status(500).json({ error: 'Request failed.' });
});

// 8. Connect both databases, initialize indexes, and start the server
async function start() {
    try {
        await Promise.all([
            mongoose.connect(authUri, {
                dbName: authDatabaseName,
                serverSelectionTimeoutMS: 5000
            }),
            sightingsConn.asPromise()
        ]);

        await Promise.all([User.init(), Session.init(), Sighting.init()]);

        const port = Number(process.env.PORT || 3000);
        const server = app.listen(port, () => {
            console.log(`API listening on port ${server.address().port} (auth DB: ${authDatabaseName}, sightings DB: ${sightingsConn.name})`);
        });

        server.on('error', async (error) => {
            console.error('HTTP server failed:', error.code);
            await Promise.allSettled([mongoose.disconnect(), sightingsConn.close()]);
            process.exitCode = 1;
        });
    } catch (error) {
        console.error('Backend startup failed:', error);
        await Promise.allSettled([mongoose.disconnect(), sightingsConn.close()]);
        process.exitCode = 1;
    }
}

start();