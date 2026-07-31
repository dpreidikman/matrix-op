import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

type ChatRequestBody = { messages?: unknown; context?: unknown };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as ChatRequestBody;
        const messages = body.messages;
        if (!Array.isArray(messages)) {
          return new Response("Messages are required", { status: 400 });
        }

        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const context =
          typeof body.context === "string" ? body.context : "(sin datos cargados)";

        const { createLovableAiGatewayProvider } = await import("@/lib/ai-gateway.server");
        const gateway = createLovableAiGatewayProvider(key);

        const system = [
          "Sos el Agente de MATRIX, un analista financiero de un grupo gastronómico argentino.",
          "Respondés en español rioplatense, breve y concreto, con números formateados en pesos ($ 1.234.567).",
          "Usás EXCLUSIVAMENTE los datos del CONTEXTO que se te entrega abajo. No inventes ni estimes valores.",
          "Si el dato exacto para responder no está en el contexto, respondé textualmente: 'No tengo la información para responder eso.' y, si sirve, indicá qué habría que cargar.",
          "Podés hacer cálculos (sumas, promedios, variaciones, rankings) siempre sobre los números del contexto.",
          "Para preguntas de gastos 'por encima de lo normal', comparás el mes contra el promedio de los demás meses del mismo local/concepto y explicás el desvío.",
          "",
          "=== CONTEXTO DE DATOS ===",
          context,
        ].join("\n");

        try {
          const result = streamText({
            model: gateway("google/gemini-3.6-flash"),
            system,
            messages: await convertToModelMessages(messages as UIMessage[]),
          });
          return result.toUIMessageStreamResponse({
            originalMessages: messages as UIMessage[],
          });
        } catch (e) {
          const msg = (e as Error)?.message ?? "Error";
          const status = /429/.test(msg) ? 429 : /402/.test(msg) ? 402 : 500;
          return new Response(msg, { status });
        }
      },
    },
  },
});