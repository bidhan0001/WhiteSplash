// CanvasModel.js
const mongoose = require('mongoose');

const CanvasSchema = new mongoose.Schema({
  roomName: { type: String, required: true, unique: true },
  elements: { type: Array, default: [] },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('CanvasState', CanvasSchema);