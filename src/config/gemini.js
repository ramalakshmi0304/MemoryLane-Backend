import { GoogleGenerativeAI } from "@google/generative-ai";
import "dotenv/config";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// CHANGE THIS LINE: from 'gemini-1.5-flash' to 'gemini-2.5-flash'
export const geminiFlash = genAI.getGenerativeModel({
  model: "gemini-2.5-flash" 
});

// If you have a Pro fallback, update it too
export const geminiPro = genAI.getGenerativeModel({
  model: "gemini-2.5-pro"
});