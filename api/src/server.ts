/**
 * Express server for EUDI VP Debugger
 */

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import debugRoutes from "./routes/debug.js";
import { logger } from "./utils/Logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// API Routes
app.use("/api", debugRoutes);

// Serve static frontend files (for production/Docker)
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

// SPA fallback - serve index.html for all other routes
app.get("*", (_req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// Start server
app.listen(PORT, () => {
  logger.info(`EUDI VP Debugger API started`, {
    port: PORT,
    debugEndpoint: `/api/debug`,
  });
});
