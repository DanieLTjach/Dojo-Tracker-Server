import express from 'express';
import cors from 'cors';
const app = express()
const config = require('./config/config');

const authRoutes = require('./service/user/UserRoutes');
const gameRoutes = require('./service/game/GameRoutes');
const achievementsRoutes = require('./service/achievements/AchievementsRoutes');
const clubRoutes = require('./service/club/ClubRoutes');
const eventsRoutes = require('./service/events/EventRoutes');

app.use(express.json());

app.use(cors());

app.use('/api/user', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/achievements', achievementsRoutes);
app.use("/api/club", clubRoutes);
app.use('/api/event', eventsRoutes);

app.listen(config.port, () => {
});
