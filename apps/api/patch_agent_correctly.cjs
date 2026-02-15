const fs = require('fs');

const agentId = "agent_4301khfep73de008dcd1ayy84802";
const apiKey = "sk_f7a0147b81d44fe79ea8a737b62f3f8db8563b1d59a1d01d";

// payload structure matches platform_settings.overrides
const payload = {
    platform_settings: {
        overrides: {
            conversation_config_override: {
                agent: {
                    first_message: true,
                    prompt: {
                        prompt: true
                    }
                }
            }
        }
    }
};

(async () => {
    try {
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
