const WebSocket = require('ws');

const apiKey = process.env.ASSEMBLYAI_API_KEY || ''; 

async function testConnection(queryString) {
    return new Promise((resolve) => {
        const url = `wss://api.assemblyai.com/v2/realtime/ws${queryString}`;
        console.log(`Testing: ${url}`);
        
        const ws = new WebSocket(url, {
            headers: { Authorization: apiKey }
        });

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
    // Try Universal-1 first param
    await testConnection('?model=universal-1&sample_rate=16000');
    
    // Try Best
    await testConnection('?model=best&sample_rate=16000');
}

run();