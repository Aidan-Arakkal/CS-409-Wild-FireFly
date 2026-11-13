const { randomBytes, scrypt, timingSafeEqual, createHash } = require('node:crypto');
const { promisify } = require('node:util');
const express = require('express');
const User = require('../models/user');
const Session = require('../models/session');

const router = express.Router();
const deriveKey = promisify(scrypt);
const scryptOptions = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const cookieName = 'firefly_session';
const sessionDuration = 24 * 60 * 60 * 1000;
const cookieOptions = {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/api/auth'
};

function publicUser({ id, name, email }) {
    return { id, name, email };
}

function tokenDigest(token) {
    return createHash('sha256').update(token).digest('hex');
}

function sessionId(req) {
    const match = /(?:^|;\s*)firefly_session=([a-f0-9]{64})(?=;|$)/.exec(req.headers.cookie || '');
    return match ? tokenDigest(match[1]) : null;
}

router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method === 'POST' && !req.is('application/json')) {
        return res.status(415).json({ error: 'Send a JSON request.' });
    }
    next();
});

router.post('/register', async (req, res) => {
    const { name, email, password } = req.body ?? {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 ||
        typeof email !== 'string' || email.trim().length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        typeof password !== 'string' || password.length < 15 || password.length > 128) {
        return res.status(400).json({ error: 'Enter a name, a valid email, and a password of 15–128 characters.' });
    }

    const salt = randomBytes(16).toString('hex');
    const key = await deriveKey(password, salt, 64, scryptOptions);
    try {
        const user = await User.create({ name, email, passwordHash: salt + ':' + key.toString('hex') });
        return res.status(201).json({ user: publicUser(user) });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }
        throw error;
    }
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body ?? {};
    if (typeof email !== 'string' || email.length > 254 ||
        typeof password !== 'string' || password.length > 128) {
        return res.status(400).json({ error: 'Enter your email and password.' });
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+passwordHash');
    const hash = user?.passwordHash;
    const parts = /^([a-f0-9]{32}):([a-f0-9]{128})$/.exec(hash || '');
    const key = await deriveKey(password, parts?.[1] ?? '0'.repeat(32), 64, scryptOptions);
    if (!parts || !timingSafeEqual(key, Buffer.from(parts[2], 'hex'))) {
        return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    const oldSession = sessionId(req);
    if (oldSession) await Session.deleteOne({ _id: oldSession });

    const token = randomBytes(32).toString('hex');
    await Session.create({
        _id: tokenDigest(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + sessionDuration)
    });
    res.cookie(cookieName, token, { ...cookieOptions, maxAge: sessionDuration });
    return res.json({ user: publicUser(user) });
});

router.get('/me', async (req, res) => {
    const id = sessionId(req);
    const session = id && await Session.findOne({ _id: id, expiresAt: { $gt: new Date() } });
    const user = session && await User.findById(session.userId);
    if (!user) return res.status(401).json({ error: 'You are signed out.' });
    return res.json({ user: publicUser(user) });
});

router.post('/logout', async (req, res) => {
    const id = sessionId(req);
    if (id) await Session.deleteOne({ _id: id });
    res.clearCookie(cookieName, cookieOptions);
    return res.json({ user: null });
});

module.exports = router;
