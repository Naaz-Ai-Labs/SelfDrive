import fs from "fs";
import path from "path";

const currentConv = "aa9d9c81-73f2-4f1b-9a5f-bf3ba70c3b92";
const transcriptPath = path.join("C:\\Users\\Shabiul\\.gemini\\antigravity-ide\\brain", currentConv, ".system_generated", "logs", "transcript_full.jsonl");

if (fs.existsSync(transcriptPath)) {
  const lines = fs.readFileSync(transcriptPath, "utf-8").split("\n");
  console.log(`Found ${lines.length} lines in transcript_full`);
  lines.forEach((line, idx) => {
    if (!line.trim()) return;
    try {
      const parsed = JSON.parse(line);
      if (parsed.type === "USER_INPUT") {
        console.log(`[USER_INPUT #${idx}]:`, parsed.content);
      }
    } catch {}
  });
}
