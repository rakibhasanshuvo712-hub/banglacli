import { getConfig } from '../src/config.js';
import { GoogleGenAI } from '@google/genai';
import { BUILD_GEMINI_TOOLS } from '../src/tools.js';

async function main() {
  const cfg = getConfig();
  const key = cfg?.savedProviders?.gemini?.apiKey || (cfg?.provider === 'gemini' ? cfg?.apiKey : '');
  if (!key) return;
  const ai = new GoogleGenAI({ apiKey: key });

  try {
    const res = await ai.models.generateContent({
      model: 'gemini-3.5-flash-lite',
      contents: [{ role: 'user', parts: [{ text: 'List the files in the directory' }] }],
      config: {
        tools: BUILD_GEMINI_TOOLS as any
      }
    });
    console.log('Gemini tools test succeeded! Response:', res.text || res.functionCalls);
  } catch (err: any) {
    console.error('Gemini tools test failed:', err.message);
  }
}

main().catch(console.error);
