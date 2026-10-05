/**
 * Centralized War Era API Token manager.
 * Reads tokens strictly from environment variables (.env / process.env).
 */
import dotenv from "dotenv";
dotenv.config();

export function getWarEraTokens(): string[] {
  const raw = [
    ...(process.env.WARERA_API_TOKENS || "").split(","),
    process.env.WARERA_API_TOKEN || "",
  ];

  const tokens = raw.map((t) => t.trim()).filter((t) => t.startsWith("wae_"));
  return Array.from(new Set(tokens));
}

let tokenCounter = 0;
export function getNextWarEraToken(): string {
  const tokens = getWarEraTokens();
  if (tokens.length === 0) return "";
  const token = tokens[tokenCounter % tokens.length];
  tokenCounter++;
  return token;
}
