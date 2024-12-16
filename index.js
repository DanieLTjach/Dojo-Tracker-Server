const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express()
const PORT = 3000;

const authRoutes = require('./service/auth/authRoutes');

app.use(express.json());

app.use(cors());

app.use('/api/auth', authRoutes);
// app.post('/get_game', (req, res) =>{
//     const players = req.body;

//     // Логируем данные на сервере
//     console.log('Received players data:', players);

//     // Ответ клиенту
//     res.status(200).json({ message: 'Players data received successfully.', players });
// })

app.listen(PORT, () => {
    console.log(`Server is running on http://176.37.99.189:${PORT}`);
});