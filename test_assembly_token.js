const WebSocket = require('ws');
const https = require('https');

const apiKey = process.env.ASSEMBLYAI_API_KEY || ''; 

function getToken() {
    return new Promise((resolve, reject) => {
        const req = https.request('https://api.assemblyai.com/v2/realtime/token', {
            method: 'POST',
            headers: {
                'Authorization': apiKey,
                'Content-Type': 'application/json'
            }
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.token) resolve(json.token);
                    else reject(json.error || data);
                } catch(e) { reject(e); }
            });
        });
        // Try transcription_config object
        req.write(JSON.stringify({ 
            expires_in: 480, 
            transcription_config: { model: 'universal-1' } 
        }));
        req.end();
    });
}

async function testConnection(token, params) {
    return new Promise((resolve) => {
        const url = `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${token}${params}`;
        console.log(`Testing: ${url}`);
        
        const ws = new WebSocket(url);

        const timeout = setTimeout(() => {
            console.log("  [TIMEOUT] Success?");
            ws.close();
            resolve(true);
        }, 3000);

        ws.on('open', () => {
            console.log(`  [OPEN] Connected.`);
        });

        ws.on('message', (data) => {
            const msg = JSON.parse(data.toString());
            if (msg.error) {
                console.log(`  [SERVICE ERROR] ${msg.error}`);
            }
        });

        ws.on('close', (code, reason) => {
            clearTimeout(timeout);
            console.log(`  [CLOSED] Code: ${code}, Reason: ${reason}`);
            resolve(false);
        });
        
        ws.on('error', (e) => {
            console.log(`  [ERROR] ${e.message}`);
        });
    });
}

async function run() {
    try {
        const token = await getToken();
        console.log("Got token:", token.slice(0, 10) + "...");
        
        console.log("--- Testing universal-1 with TOKEN ---");
        await testConnection(token, '&model=universal-1'); 
    } catch(e) {
        console.error("Failed to get token:", e);
    }
}

run();
