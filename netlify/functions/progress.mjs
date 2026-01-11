import { getStore } from "@netlify/blobs";

export default async (req, context) => {
  const store = getStore("game-progress");
  const progressKey = "stella-progress"; // Single user for now

  // GET - Read progress
  if (req.method === "GET") {
    try {
      const progress = await store.get(progressKey, { type: "json" });
      return new Response(JSON.stringify(progress || {}), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      console.error("Error reading progress:", error);
      return new Response(JSON.stringify({}), {
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  // PUT - Save progress
  if (req.method === "PUT") {
    try {
      const body = await req.json();
      await store.setJSON(progressKey, body);
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" }
      });
    } catch (error) {
      console.error("Error saving progress:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  // Method not allowed
  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" }
  });
};

export const config = {
  path: "/.netlify/blobs/progress"
};
