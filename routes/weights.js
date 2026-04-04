const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const router = express.Router();

const scriptPath = path.resolve(__dirname, '../scripts/get_weights.py');

router.get('/weights', (req, res) => {
    exec(`python ${scriptPath} --method all`, (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${error.message}`);
            return res.status(500).send('Error executing weights script');
        }
        if (stderr) {
            console.error(`Stderr: ${stderr}`);
            return res.status(500).send('Error in weights script');
        }

        res.send(stdout);
    });
});

module.exports = router;