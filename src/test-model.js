import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listAvailableModels() {
  try {

    const models = await genAI.listModels();

    console.log("Available models:");

    models.models.forEach((model) => {
      console.log(model.name);
    });

  } catch (error) {

    console.error("Error:", error.message);

  }
}

listAvailableModels();