import { serve } from "bun";
import index from "./index.html";

const BACKEND_URL = "http://192.168.248.200:8080";

const server = serve({
  routes: {
    // Proxy to backend search API
    "/search": async (req) => {
      const url = new URL(req.url);
      const backendUrl = `${BACKEND_URL}/search${url.search}`;

      const backendReq = new Request(backendUrl, {
        method: req.method,
        headers: req.headers,
        body: req.body,
      });

      const response = await fetch(backendReq);

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    },

    // Proxy to backend download endpoint
    "/download": async (req) => {
      const url = new URL(req.url);
      const backendUrl = `${BACKEND_URL}/download${url.search}`;

      const backendReq = new Request(backendUrl, {
        method: req.method,
        headers: req.headers,
        body: req.body,
      });

      const response = await fetch(backendReq);

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    },

    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/hello": {
      async GET(req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(req) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async req => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
