const cors = require('cors');
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config()
const { GoogleGenerativeAI, GoogleGenerativeAIResponseError, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");
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
    const { jsonData,README } = req.body;
    var datas = null;

    //cek data dari client
    if (jsonData != null && jsonData != "") {
        try {
            datas = JSON.parse(jsonData);
        } catch (error) {
            datas = null;
            console.log("failed parse json");
        }
    } else {
        console.log("No data from client");
    }

    try {
        var readmeResponse = { status: 404,data:null };
        if(README != null && README != ""){
            readmeResponse = { status: 200, data: README };
        }
        var profileResponse = { status: 404, data: null };
        var useToken = false;
        //request ulang data-data github jika data dari klien kosong
        if (datas == null) {
            // Panggil GitHub API
            var headerGithub = {}
            if (process.env.GITHUB_TOKEN != null) {
                headerGithub = {
                    "Authorization": `token ${process.env.GITHUB_TOKEN}`,
                }
            }
            

            //cek kalau token gak kena limit
            try {
                profileResponse = await axios.get(`https://api.github.com/users/${username}`, { headers: headerGithub });
                useToken = true;
            } catch (error) {
                profileResponse = await axios.get(`https://api.github.com/users/${username}`);
            }

            

            //kalau tokennya juga kena limit kembali ke tanpa token
            if (!useToken) {
                headerGithub = {};
            }
            const repoResponse = await axios.get(`https://api.github.com/users/${username}/repos?sort=updated`, { headers: headerGithub });
           
            try {
                readmeResponse = await axios.get(`https://raw.githubusercontent.com/${username}/${username}/main/README.md`, { headers: headerGithub });
            } catch (error) {
                try {
                    readmeResponse = await axios.get(`https://raw.githubusercontent.com/${username}/${username}/master/README.md`, { headers: headerGithub });
                } catch (error) {
                    console.log("failed get readme");
                }
            }
            datas = {
                "name": profileResponse.data.name,
                "bio": profileResponse.data.bio,
                "company": profileResponse.data.company,
                "location": profileResponse.data.location,
                "followers": profileResponse.data.followers,
                "following": profileResponse.data.following,
                "public_repos": profileResponse.data.public_repos,
                "repositories": repoResponse.data.map(repo => ({
                    "name": repo.name,
                    "description": repo.description,
                    "language": repo.language,
                    "stargazers_count": repo.stargazers_count,
                    "open_issues_count": repo.open_issues_count,
                    "license": repo.license,
                    "fork": repo.fork,
                })).slice(0, 50),
            }
        } else {
            profileResponse = { status: 200, data: datas };
        }
        

        // Buat prompt untuk Gemini AI
        var prompt = `berikan roasting singkat dengan kejam dan menyindir dalam bahasa gaul untuk profile github berikut : ${username}. Berikut detailnya: "${JSON.stringify(datas)}"`;
        
        // pakai bahasa inggris kalau lokasinya bukan di indonesia
        if (profileResponse.data != null && profileResponse.data.location != null && !profileResponse.data.location.includes('Indonesia')) {
            prompt = `give a short and harsh roasting for the following github profile: ${username}. Here are the details: "${JSON.stringify(datas)}"`;
        }
        if (readmeResponse.status === 200 && readmeResponse.data != null) {
            prompt += ", Profile Markdown: ```" + readmeResponse.data + "```";
        } else {
            prompt += `, Profile Markdown: Not Found`;
        }

        //pastikan response selalu konsisten
        if (profileResponse.data.location == null || profileResponse.data.location.includes('Indonesia')) {
            prompt += `. (berikan response dalam bahasa indonesia dan jangan berikan pujian atau saran serta jangan berikan kata-kata terlalu kasar)`
        } else {
            prompt += `. (provide the response in English and do not provide praise or advice and do not use explicit words)`
        }

        //kalau username gak ketemu
        if(profileResponse.status == 404){
            return res.status(404).json({ error: "User not found",type:"Github" });
        }
        const safetySettings = [
            {
              category: HarmCategory.HARM_CATEGORY_HARASSMENT,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
              threshold: HarmBlockThreshold.BLOCK_NONE,
            },
          ];
          
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" ,safetySettings});
        const result = await model.generateContent(prompt);
        const response = await result.response;

        res.json({ roasting: response.text() });
    } catch (error) {
        // kalau error dari google gemini-nya
        if (error instanceof GoogleGenerativeAIResponseError) {
            return res.status(500).json({ error: error.message,type:"AI" });
        }
        //kalau error dari exios (request ke api github)
        if(axios.isAxiosError(error)){
            if(error.response.status == 404){
                return res.status(404).json({ error: "User not found",type:"Github" });
            } else if(error.response.status == 403){
                return res.status(403).json({ error: "Reached github api limit",type:"Github" });
            } else {
                return res.status(500).json({ error: error.message,type:"Github" });
            }
            
        }

        //error yang lain
        console.log(error);
        res.status(500).json({ error: error.message,type:"Server" });
    }
});

const port = 3001;
app.listen(process.env.PORT || port, () => {
    console.log(`Web app listening on port ${port}`)
});
