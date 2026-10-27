import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

// 1. Paste your MongoDB Atlas connection string below, or leave the local fallback
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://bhaw19867_db_user:YDTS365d1OSpEXgR@cluster0.6lpisxa.mongodb.net/';

mongoose
  .connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB successfully!'))
  .catch((err) => console.error('❌ MongoDB Connection Error:', err));

// 2. Mongoose Schema & Model for Canvas State Persistence
const CanvasSchema = new mongoose.Schema({
  roomName: { type: String, required: true, unique: true },
  elements: { type: Array, default: [] },
  updatedAt: { type: Date, default: Date.now },
});

const CanvasState = mongoose.model('CanvasState', CanvasSchema);

// 3. REST API Endpoints
app.post('/api/save', async (req, res) => {
  try {
    const { roomName, elements } = req.body;
    const canvas = await CanvasState.findOneAndUpdate(
      { roomName },
      { elements, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.status(200).json({ message: 'Canvas progress saved to MongoDB!', canvas });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save canvas progress.' });
  }
});

app.get('/api/load/:roomName', async (req, res) => {
  try {
    const { roomName } = req.params;
    const canvas = await CanvasState.findOne({ roomName });
    if (!canvas) {
      return res.status(404).json({ message: 'No saved canvas found for this room.' });
    }
    res.status(200).json(canvas);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load canvas progress.' });
  }
});

// Run Express Backend on port 5000
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Express Backend Server running on http://localhost:${PORT}`);
});