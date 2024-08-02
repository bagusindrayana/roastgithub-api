const cors = require('cors');
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config()
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const app = express();
const options = [
    cors({
      origin: '*',
      methods: '*',
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    })
  ];
  
app.use(options);
app.use(bodyParser.json());

app.post('/roast', async (req, res) => {
    const { username } = req.query;

    try {
        // Panggil GitHub API
        const profileResponse = await axios.get(`https://api.github.com/users/${username}`);
        const repoResponse = await axios.get(`https://api.github.com/users/${username}/repos`);
        var readmeResponse = { status: 404 };
        try {
            readmeResponse = await axios.get(`https://raw.githubusercontent.com/${username}/${username}/main/README.md`);
        } catch (error) {
            try {
                readmeResponse = await axios.get(`https://raw.githubusercontent.com/${username}/${username}/master/README.md`);
            } catch (error) {
                
            }
        }

        // Buat prompt untuk Gemini AI
        var prompt = `berikan roasting singkat dengan kejam dan menyindir dalam bahasa gaul untuk profile github berikut : ${username}. Berikut detailnya: Nama : ${profileResponse.data.name}, Bio :  ${profileResponse.data.bio ?? '-'} Repositories: "${repoResponse.data.map(repo => repo.name).slice(0,50).join(', ')}"`;
        if(profileResponse.data.location != null && !profileResponse.data.location.includes('Indonesia')) {
            prompt = `give a short and harsh roasting in Indonesian slang for the following github profile: ${username}. Here are the details: Name : ${profileResponse.data.name}, Bio :  ${profileResponse.data.bio ?? '-'} Repositories: "${repoResponse.data.map(repo => repo.name).slice(0,50).join(', ')}"`;
        }
        if(readmeResponse.status === 200) {
            prompt += `, Profile README: ${readmeResponse.data}`;
        } else {
            prompt += `, Profile README: Not Found`;
        }

        if(profileResponse.data.location == null || profileResponse.data.location.includes('Indonesia')){
            prompt += `. (berikan response dalam bahasa indonesia dan jangan berikan pujian atau saran serta jangan berikan kata-kata kasar)`
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});
        const result = await model.generateContent(prompt);
        const response = await result.response;

        res.json({ roasting:response.text() });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Something went wrong' });
    }
});

const port = 3001;
app.listen(process.env.PORT || port, () => {
    console.log(`Web app listening on port ${port}`)
});
