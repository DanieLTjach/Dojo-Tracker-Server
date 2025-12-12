import express from 'express';
import cors from 'cors';
import config from './config/config.ts';

import userRoutes from './service/user/UserRoutes.ts';
import gameRoutes from './service/game/GameRoutes.js';
import achievementRoutes from './service/achievements/AchievementsRoutes.js';
import clubRoutes from './service/club/ClubRoutes.js';
import eventRoutes from './service/events/EventRoutes.js';
import { handleErrors } from './service/middleware/ErrorHandling.ts';

const app = express();
app.use(express.json());
app.use(cors());

app.use('/api/users', userRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/clubs', clubRoutes);
app.use('/api/events', eventRoutes);

app.use(handleErrors);

app.listen(config.port, (error?: Error) => {
    if (error) {
        console.error('Error starting the server:', error);
    } else {
        console.log(`Server is running on port ${config.port}`);
    }
});
