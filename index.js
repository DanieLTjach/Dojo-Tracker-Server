const express = require('express');
const cors = require('cors');
const app = express()
const PORT = 3000;
app.use(express.json());

app.use(cors());

app.post('/get_game', (req, res) =>{
    const players = req.body;

    // Логируем данные на сервере
    console.log('Received players data:', players);

    // Ответ клиенту
    res.status(200).json({ message: 'Players data received successfully.', players });
})

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});