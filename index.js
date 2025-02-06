const express = require('express');
const cors = require('cors');
const app = express()
const PORT = 3000;

const authRoutes = require('./service/auth/UserRoutes');

app.use(express.json());

app.use(cors());

app.use('/api/auth', authRoutes);

app.listen(PORT, () => {
    console.log(`Server is running on http://176.37.99.189:${PORT}`);
});
