import express from "express";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

app.use(express.json({ limit: "100kb" }));
app.use(express.static("public"));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    provider: "Google Gemini",
    configured: Boolean(process.env.GEMINI_API_KEY)
  });
});

app.post("/api/chat", async (req, res) => {
  const { message, history = [], personality = "You are TAMILAN AI, a friendly and helpful AI assistant." } = req.body ?? {};

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({
      error: "Gemini is not configured yet. Add GEMINI_API_KEY to your .env file and restart TAMILAN AI."
    });
  }

  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Please enter a message." });
  }

  if (message.length > 12000) {
    return res.status(413).json({ error: "Message is too long (12,000 character limit)." });
  }

  const safeHistory = Array.isArray(history)
    ? history.slice(-12).filter(item =>
        item &&
        ["user", "model"].includes(item.role) &&
        typeof item.text === "string"
      ).map(item => ({
        role: item.role,
        parts: [{ text: item.text.slice(0, 12000) }]
      }))
    : [];

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const chat = ai.chats.create({
      model,
      history: safeHistory,
      config: { systemInstruction: String(personality).slice(0, 2000) }
    });

    const response = await chat.sendMessage({ message: message.trim() });
    res.json({ text: response.text || "(The model returned no text.)" });
  } catch (error) {
    console.error("Gemini request failed:", error?.message || error);
    res.status(502).json({
      error: "Gemini request failed. Check your model name, API key, quota, and network connection."
    });
  }
});

app.listen(port, "0.0.0.0", () => {
  console.log(`TAMILAN AI — Powered by Gemini is running at http://localhost:${port}`);
  console.log(`Gemini API key configured: ${Boolean(process.env.GEMINI_API_KEY)}`);
});
