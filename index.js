const express = require('express');
const cors = require('cors');
const app = express()
const config = require('./config/config');

const authRoutes = require('./service/user/UserRoutes');
const gameRoutes = require('./service/game/GameRoutes');
const achievementsRoutes = require('./service/achievements/AchievementsRoutes');
const clubRoutes = require('./service/club/ClubRoutes');

app.use(express.json());

app.use(cors());

app.use('/api/user', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/achievements', achievementsRoutes);
app.use("/api/club", clubRoutes);

app.listen(config.PORT, () => {
});
