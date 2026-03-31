import { NextRequest } from "next/server";
import OpenAI from "openai";
import { SYSTEM_PROMPT } from "@/lib/ai/system-prompt";
import { AI_TOOLS } from "@/lib/ai/tools";
import { executeTool, setFileContext } from "@/lib/ai/executor";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, file } = body as {
      messages: Array<{ role: "user" | "assistant"; content: string }>;
      file?: { base64: string; fileName: string; mimeType: string };
    };

    // Set file context for tool executor
    setFileContext(file || null);

    // Build OpenAI messages
    const openaiMessages: ChatCompletionMessageParam[] = [
      { role: "system", content: SYSTEM_PROMPT },
    ];

    // Add conversation history
    for (const msg of messages.slice(0, -1)) {
      openaiMessages.push({ role: msg.role, content: msg.content });
    }

    // Build the last user message (possibly with image)
    const lastMessage = messages[messages.length - 1];
    if (file && file.mimeType.startsWith("image/")) {
      // Vision: send image as base64
      openaiMessages.push({
        role: "user",
        content: [
          { type: "text", text: lastMessage.content || `Analyzuj tento soubor: ${file.fileName}` },
          {
            type: "image_url",
            image_url: {
              url: `data:${file.mimeType};base64,${file.base64}`,
              detail: "high",
            },
          },
        ],
      });
    } else if (file) {
      // Non-image file: mention it in text
      openaiMessages.push({
        role: "user",
        content: `${lastMessage.content || ""}\n\n[Přiložený soubor: ${file.fileName} (${file.mimeType}, ${Math.round(file.base64.length * 0.75 / 1024)} KB)]`,
      });
    } else {
      openaiMessages.push({ role: "user", content: lastMessage.content });
    }

    // Call GPT-4o with tools — loop until we get a final response
    let response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: openaiMessages,
      tools: AI_TOOLS,
      tool_choice: "auto",
      temperature: 0.3,
      max_tokens: 4096,
    });

    // Process tool calls in a loop
    let iterations = 0;
    const MAX_ITERATIONS = 5;

    while (
      response.choices[0]?.finish_reason === "tool_calls" &&
      response.choices[0]?.message.tool_calls &&
      iterations < MAX_ITERATIONS
    ) {
      const toolCalls = response.choices[0].message.tool_calls;

      // Add assistant message with tool calls
      openaiMessages.push(response.choices[0].message);

      // Execute each tool
      for (const toolCall of toolCalls) {
        if (toolCall.type !== "function") continue;
        const fn = toolCall.function;
        const args = JSON.parse(fn.arguments);
        console.log(`AI Tool Call: ${fn.name}`, args);

        const result = await executeTool(fn.name, args);

        openaiMessages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      // Get next response
      response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: openaiMessages,
        tools: AI_TOOLS,
        tool_choice: "auto",
        temperature: 0.3,
        max_tokens: 4096,
      });

      iterations++;
    }

    const content = response.choices[0]?.message?.content || "Nepodařilo se zpracovat požadavek.";

    return Response.json({ content });
  } catch (err) {
    console.error("AI Chat error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ error: `AI error: ${message}` }, { status: 500 });
  }
}
