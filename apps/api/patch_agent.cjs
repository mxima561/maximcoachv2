const fs = require('fs');
const agent = JSON.parse(fs.readFileSync('agent.json', 'utf8'));

// Modifying the copy
if (!agent.conversation_config.overrides) {
    agent.conversation_config.overrides = { conversation_config_override: { agent: { prompt: {} } } };
}

const overrides = agent.conversation_config.overrides.conversation_config_override;
if (!overrides.agent) overrides.agent = { prompt: {} };

overrides.agent.first_message = true;
overrides.agent.prompt.prompt = true;

const agentId = "agent_4301khfep73de008dcd1ayy84802";
const apiKey = "sk_f7a0147b81d44fe79ea8a737b62f3f8db8563b1d59a1d01d";

// Send PATCH
(async () => {
    try {
        const payload = {
            conversation_config: {
                overrides: agent.conversation_config.overrides
            }
        };
        console.log("Sending payload:", JSON.stringify(payload, null, 2));

        const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`, {
            method: "PATCH",
            headers: {
                "xi-api-key": apiKey,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        console.log("Status:", response.status);
        console.log("Response:", await response.text());
    } catch (e) {
        console.error(e);
    }
})();
