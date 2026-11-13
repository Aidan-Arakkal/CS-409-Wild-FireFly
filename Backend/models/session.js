const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    expiresAt: { type: Date, required: true, expires: 0 }
});

module.exports = mongoose.model('Session', sessionSchema);
