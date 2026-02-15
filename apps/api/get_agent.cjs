const agentId = "agent_4301khfep73de008dcd1ayy84802";
const apiKey = "sk_f7a0147b81d44fe79ea8a737b62f3f8db8563b1d59a1d01d";

// Use https library for older node versions if fetch is missing, but modern node has fetch.
// We'll assume node 18+.

async function getAgent() {
    try {
        const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
            method: "GET",
            headers: {
                "xi-api-key": apiKey,
            },
        });

        if (!response.ok) {
            console.error("Error:", response.status, await response.text());
        } else {
            console.log(JSON.stringify(await response.json(), null, 2));
        }
    } catch (e) {
        console.error(e);
    }
}

getAgent();
