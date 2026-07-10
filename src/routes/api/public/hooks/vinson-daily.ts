import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/vinson-daily")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { cronSyncYesterday } = await import("@/lib/vinson.functions");
        const result = await cronSyncYesterday();
        return Response.json(result);
      },
    },
  },
});