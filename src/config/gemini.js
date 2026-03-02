import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// USE FLASH-LITE: 1,000 requests/day vs 20 on standard Flash
export const geminiFlash = genAI.getGenerativeModel({
  model: "gemini-2.5-flash-lite" 
});

export const geminiPro = genAI.getGenerativeModel({
  model: "gemini-2.5-pro"
});