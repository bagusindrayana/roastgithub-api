const cors = require('cors');
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config()
const { GoogleGenerativeAI,GoogleGenerativeAIResponseError } = require("@google/generative-ai");
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
        var headerGithub = {}
        if(process.env.GITHUB_TOKEN != null) {
            headerGithub = {
                "Authorization": `token ${process.env.GITHUB_TOKEN}`,
            }
        }
        const profileResponse = await axios.get(`https://api.github.com/users/${username}`, { headers: headerGithub });
        const repoResponse = await axios.get(`https://api.github.com/users/${username}/repos`, { headers: headerGithub });
        var readmeResponse = { status: 404 };
        try {
            readmeResponse = await axios.get(`https://raw.githubusercontent.com/${username}/${username}/main/README.md`, { headers: headerGithub });
        } catch (error) {
            try {
                readmeResponse = await axios.get(`https://raw.githubusercontent.com/${username}/${username}/master/README.md`, { headers: headerGithub });
            } catch (error) {
                
            }
        }
        const datas  = {
            "name": profileResponse.data.name,
            "bio": profileResponse.data.bio,
            "company": profileResponse.data.company,
            "location": profileResponse.data.location,
            "followers": profileResponse.data.followers,
            "following": profileResponse.data.following,
            "public_repos": profileResponse.data.public_repos,
            "repositories":repoResponse.data.map(repo => ({
                "name": repo.name,
                "description": repo.description,
                "language": repo.language,
                "stargazers_count": repo.stargazers_count,
                "open_issues_count": repo.open_issues_count,
                "license": repo.license,
                "fork": repo.fork,
            })).reverse().slice(0,50),
        }
        // Buat prompt untuk Gemini AI
        var prompt = `berikan roasting singkat dengan kejam dan menyindir dalam bahasa gaul untuk profile github berikut : ${username}. Berikut detailnya: "${JSON.stringify(datas)}"`;
        if(profileResponse.data.location != null && !profileResponse.data.location.includes('Indonesia')) {
            prompt = `give a short and harsh roasting for the following github profile: ${username}. Here are the details: "${JSON.stringify(datas)}"`;
        }
        if(readmeResponse.status === 200) {
            prompt += ", Profile Markdown: ```"+readmeResponse.data+"```";
        } else {
            prompt += `, Profile Markdown: Not Found`;
        }

        if(profileResponse.data.location == null || profileResponse.data.location.includes('Indonesia')){
            prompt += `. (berikan response dalam bahasa indonesia dan jangan berikan pujian atau saran serta jangan berikan kata-kata terlalu kasar)`
        } else {
            prompt += `. (provide the response in English and do not provide praise or advice and do not use explicit words)`
        }

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash"});
        const result = await model.generateContent(prompt);
        const response = await result.response;
      
        res.json({ roasting:response.text() });
    } catch (error) {
        console.log(error);
        // if error is GoogleGenerativeAIResponseError
        if (error instanceof GoogleGenerativeAIResponseError) {
           
            return res.status(500).json({ error: error.message });
        }
        res.status(500).json({ error: 'Something went wrong' });
    }
});

const port = 3001;
app.listen(process.env.PORT || port, () => {
    console.log(`Web app listening on port ${port}`)
});
