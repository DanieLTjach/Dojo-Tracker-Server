import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import config from '../config/config.ts';

import authRoutes from './routes/AuthRoutes.ts';
import userRoutes from './routes/UserRoutes.ts';
import gameRoutes from './routes/GameRoutes.ts';
import { handleErrors } from './middleware/ErrorHandling.ts';

const app = express();
app.use(express.json());
app.use(cors());

// Health check endpoint
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Dojo Tracker Server is running' });
});

// Authentication routes (no auth required)
app.use('/api/auth', authRoutes);

// Protected routes (will add auth middleware later)
app.use('/api/users', userRoutes);
app.use('/api/games', gameRoutes);

app.use(handleErrors);

app.listen(config.port, (error?: Error) => {
    if (error) {
        console.error('Error starting the server:', error);
    } else {
        console.log(`Server is running on port ${config.port}`);
    }
});
