import express from 'express';
import cors from 'cors';
const app = express()
import config from './config/config.ts';

import userRoutes from './service/user/UserRoutes.ts';
import gameRoutes from './service/game/GameRoutes.js';
import achievementRoutes from './service/achievements/AchievementsRoutes.js';
import clubRoutes from './service/club/ClubRoutes.js';
import eventRoutes from './service/events/EventRoutes.js';

app.use(express.json());

app.use(cors());

app.use('/api/user', userRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/achievements', achievementRoutes);
app.use("/api/club", clubRoutes);
app.use('/api/event', eventRoutes);

app.listen(config.port, () => {
});
