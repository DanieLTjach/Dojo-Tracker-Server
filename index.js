const express = require('express');
const cors = require('cors');
const app = express()
const config = require('./config/config');

const authRoutes = require('./service/user/UserRoutes');

app.use(express.json());

app.use(cors());

app.use('/api/user', authRoutes);

app.listen(config.PORT, () => {
    console.log(`Server is running on http://176.37.99.189:${PORT}`);
});
