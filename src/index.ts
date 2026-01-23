import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import config from '../config/config.ts';

import authRoutes from './routes/AuthRoutes.ts';
import userRoutes from './routes/UserRoutes.ts';
import gameRoutes from './routes/GameRoutes.ts';
import eventRoutes from './routes/EventRoutes.ts';
import ratingRoutes from './routes/RatingRoutes.ts';
import userStatsRoutes from './routes/UserStatsRoutes.ts';
import { handleErrors } from './middleware/ErrorHandling.ts';

import LogService from './service/LogService.ts';

const app = express();
app.use(express.json());
app.use(cors());

// Health check endpoint
app.get('/', (_req, res) => {
    res.json({ status: 'ok', message: 'Dojo Tracker Server is running' });
});

// Authentication routes (no auth required)
app.use('/api', authRoutes);

// Protected routes (will add auth middleware later)
app.use('/api/users', userRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/events', eventRoutes);
app.use('/api', ratingRoutes);
app.use('/api/events', userStatsRoutes);

app.use(handleErrors);

app.listen(config.port, (error?: Error) => {
    if (error) {
        LogService.logError('Error starting the server', error);
    } else {
        console.log(`Server is running on port ${config.port}`);
    }
});

process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await LogService.shutdown();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await LogService.shutdown();
    process.exit(0);
});