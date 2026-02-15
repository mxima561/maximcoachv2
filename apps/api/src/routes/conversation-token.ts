import type { FastifyInstance } from "fastify";

export async function conversationTokenRoutes(fastify: FastifyInstance) {
    // Generate ElevenLabs signed URL for direct WebSocket connection
    fastify.get("/conversation-token", async (request, reply) => {
        const agentId = process.env.ELEVENLABS_AGENT_ID;
        const apiKey = process.env.ELEVENLABS_API_KEY;

        if (!agentId || !apiKey) {
            return reply.code(500).send({
                error: "ElevenLabs configuration missing",
            });
        }

        try {
            const response = await fetch(
                `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${agentId}`,
                {
                    method: "GET",
                    headers: {
                        "xi-api-key": apiKey,
                    },
                }
            );

            if (!response.ok) {
                const error = await response.text();
                console.error("ElevenLabs signed URL error:", error);
                return reply.code(response.status).send({
                    error: "Failed to generate signed URL",
                });
            }

            const data = await response.json();
            return reply.send(data);
        } catch (error) {
            console.error("Error generating signed URL:", error);
            return reply.code(500).send({
                error: "Internal server error",
            });
        }
    });
}
