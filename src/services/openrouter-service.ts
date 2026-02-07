import { getEnv } from "../config/env.js";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class OpenRouterService {
  async chat(messages: ChatMessage[]): Promise<string> {
    const env = getEnv();

    const response = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.DEFAULT_MODEL,
        temperature: 0.2,
        max_tokens: 700,
        messages
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenRouter request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenRouter returned no assistant content");
    }

    return content;
  }
}
