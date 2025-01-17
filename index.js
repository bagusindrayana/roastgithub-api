const cors = require('cors');
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
require('dotenv').config()
const { GoogleGenerativeAI, GoogleGenerativeAIResponseError, HarmCategory, HarmBlockThreshold, GoogleGenerativeAIError } = require("@google/generative-ai");
const { Groq } = require('groq-sdk');




async function generateContent(model, prompt, aiService) {
    if (model == "llama") {
        const chatCompletion = await aiService.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: 'llama-3.1-70b-versatile',
        });
        return chatCompletion.choices[0].message.content;
    } else {
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

        const modelAi = aiService.getGenerativeModel({ model: "gemini-1.5-flash", safetySettings });
        const result = await modelAi.generateContent(prompt);
        const response = await result.response;
        return response.text();
    }
}

const app = express();

if (process.env.CORS == "true") {
    var allowlist = ["roastgithub.netlify.app", "roastgithub.vercel.app", "https://roastgithub.netlify.app", "https://roastgithub.vercel.app", "http://roastgithub.netlify.app", "http://roastgithub.vercel.app"]
    var corsOptionsDelegate = function (req, callback) {
        var corsOptions;

        if (allowlist.indexOf(req.header('Origin')) !== -1) {
            corsOptions = { origin: true }
        } else {
            corsOptions = { origin: false };
        }
        callback(null, corsOptions)
    }
    app.use(cors(corsOptionsDelegate));
} else {
    const options = [
        cors({
            origin: "*",
        })
    ];
    app.use(options);
}




const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // minutes
    limit: 30, // Limit each IP per `window`.
    standardHeaders: 'draft-7', // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers.
    // store: ... , // Redis, Memcached, etc. See below.
})

app.use(limiter);

app.use(bodyParser.json());

app.post('/roasting', async (req, res) => {
    //if user agent contains curl, golang, or python, return 403
    if (req.headers['user-agent'] != null && (req.headers['user-agent'].includes("curl") || req.headers['user-agent'].includes("python") || req.headers['user-agent'].includes("Go-http-client"))) {
        return res.status(403).json({ error: "Forbidden" });
    }
    const { username } = req.query;
    const { jsonData, README, model, language, apiKey } = req.body;

    if (model == null || model == "" || model == undefined || username == null || username == "" || username == undefined || language == null || language == "" || language == undefined) {
        return res.status(400).json({ error: "Request not compleate" });
    }

    // if have multiple api key
    const geminiApiKey = process.env.GEMINI_API_KEY;
    //split coma and get one random key
    const geminiApiKeys = geminiApiKey.split(",");
    const randomGeminiApiKey = geminiApiKeys[Math.floor(Math.random() * geminiApiKeys.length)];
    let genAI = new GoogleGenerativeAI(randomGeminiApiKey);
    let groq = new Groq({
        apiKey: process.env.GROQ_API_KEY, // This is the default and can be omitted
    });
    if (apiKey != undefined && apiKey != "" && apiKey != null) {
        if (model == "gemini") {
            genAI = new GoogleGenerativeAI(apiKey);
        } else {
            groq = new Groq({
                apiKey: apiKey, // This is the default and can be omitted
            });
        }

    }
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
        var readmeResponse = { status: 404, data: null };
        if (README != null && README != "") {
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
                "created_at": profileResponse.data.created_at,
                "updated_at": profileResponse.data.updated_at,
                "repositories": repoResponse.data.map(repo => ({
                    "name": repo.name,
                    "description": repo.description,
                    "language": repo.language,
                    "stargazers_count": repo.stargazers_count,
                    "open_issues_count": repo.open_issues_count,
                    "license": repo.license,
                    "fork": repo.fork,
                    "created_at": repo.created_at,
                    "updated_at": repo.updated_at
                })).slice(0, 50),
            }
        } else {
            profileResponse = { status: 200, data: datas };
        }


        // Buat prompt untuk Gemini AI
        var prompt = `berikan roasting singkat dengan kejam,menyindir, serta menyakitkan dalam bahasa gaul untuk profile github berikut : ${username}. Berikut detailnya: "${JSON.stringify(datas)}"`;

        // pakai bahasa inggris kalau lokasinya bukan di indonesia
        if ((profileResponse.data != null && profileResponse.data.location != null && !profileResponse.data.location.includes('Indonesia') && language == "auto") || language == "english") {
            prompt = `give a short and harsh roasting for the following github profile: ${username}. Here are the details: "${JSON.stringify(datas)}"`;
        }
        if (readmeResponse.status === 200 && readmeResponse.data != null) {
            prompt += ", Profile Markdown: ```" + readmeResponse.data + "```";
        } else {
            prompt += `, Profile Markdown: Not Found`;
        }

        //pastikan response selalu konsisten
        if ((profileResponse.data != null && profileResponse.data.location != null && !profileResponse.data.location.includes('Indonesia') && language == "auto") || language == "english") {
            prompt += `. (provide the response in English and do not provide praise or advice)`;
        } else {
            prompt += `. (berikan response dalam bahasa indonesia dan jangan berikan pujian atau saran)`;
        }

        //kalau username gak ketemu
        if (profileResponse.status == 404) {
            return res.status(404).json({ error: "User not found", type: "Github" });
        }

        if (model == "llama") {
            const result = await generateContent(model, prompt, groq);

            res.json({ roasting: result });
        } else {
            const result = await generateContent(model ?? "gemini", prompt, genAI);

            res.json({ roasting: result });
        }
    } catch (error) {
        console.log(error);
        // kalau error dari google gemini-nya
        if (error instanceof GoogleGenerativeAIResponseError || error instanceof GoogleGenerativeAIError) {
            return res.status(500).json({ error: error.message, type: "AI" });
        }
        //kalau error dari exios (request ke api github)
        if (axios.isAxiosError(error)) {
            if (error.response.status == 404) {
                return res.status(404).json({ error: "User not found", type: "Github" });
            } else if (error.response.status == 403) {
                return res.status(403).json({ error: "Reached github api limit", type: "Github" });
            } else {
                return res.status(500).json({ error: error.message, type: "Github" });
            }

        }

        //error yang lain
        res.status(500).json({ error: error.message, type: "Server" });
    }
});

const port = 3001;
app.listen(process.env.PORT || port, () => {
    console.log(`Web app listening on port ${port}`)
});
