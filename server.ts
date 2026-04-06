import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import cors from "cors";
// import { Pool } from "pg"; // Uncomment this when you have a real PostgreSQL DB

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

/* 
// SQL DATABASE CONNECTION EXAMPLE (PostgreSQL)
const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432"),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
*/

// API Route to fetch production data
app.get("/api/production-data", async (req, res) => {
  try {
    /* 
    // REAL SQL QUERY EXAMPLE:
    const result = await pool.query(
      "SELECT timestamp, value FROM production_logs ORDER BY timestamp DESC LIMIT 100"
    );
    res.json(result.rows);
    */

    // MOCK DATA FOR PREVIEW (Simulating SQL response)
    const mockData = Array.from({ length: 50 }, (_, i) => ({
      timestamp: new Date(Date.now() - (50 - i) * 60000).toISOString(),
      value: 10 + (Math.random() - 0.5) * 2
    }));
    
    res.json(mockData);
  } catch (error) {
    console.error("Database error:", error);
    res.status(500).json({ error: "Failed to fetch data from SQL" });
  }
});

// API Route for a single real-time point
app.get("/api/latest-point", async (req, res) => {
  try {
    /* 
    const result = await pool.query(
      "SELECT timestamp, value FROM production_logs ORDER BY timestamp DESC LIMIT 1"
    );
    res.json(result.rows[0]);
    */
    
    res.json({
      timestamp: new Date().toISOString(),
      value: 10 + (Math.random() - 0.5) * 2
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch latest point" });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
