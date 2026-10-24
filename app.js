const $ = (selector) => document.querySelector(selector);
const code = $("#code");
const output = $("#output");
const runState = $("#run-state");
const runButton = $("#run-code");
const lineNumbers = $("#line-numbers");
const chatMessages = $("#chat-messages");
const chatForm = $("#chat-form");
const chatInput = $("#chat-input");
const sendButton = $("#send-button");
const personality = $("#personality");

const history = [];
let busy = false;

function updateLineNumbers() {
  const count = code.value.split("\n").length;
  lineNumbers.textContent = Array.from({ length: count }, (_, i) => i + 1).join("\n");
}
code.addEventListener("input", updateLineNumbers);
code.addEventListener("scroll", () => { lineNumbers.scrollTop = code.scrollTop; });
updateLineNumbers();

function displayValue(value) {
  if (value === null) return "nothing";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function splitArguments(text) {
  const parts = [];
  let current = "";
  let quote = null;
  let escaped = false;
  let depth = 0;
  for (const char of text) {
    if (escaped) { current += char; escaped = false; continue; }
    if (char === "\\" && quote) { current += char; escaped = true; continue; }
    if ((char === '"' || char === "'") && (!quote || quote === char)) {
      quote = quote ? null : char;
      current += char;
      continue;
    }
    if (!quote && char === "(") depth++;
    if (!quote && char === ")") depth--;
    if (!quote && depth === 0 && char === ",") {
      parts.push(current.trim()); current = ""; continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function parseLiteral(expression, variables) {
  const text = expression.trim();
  if (Object.hasOwn(variables, text)) return variables[text];
  if (text === "yes") return true;
  if (text === "no") return false;
  if (text === "nothing") return null;
  if ((text.startsWith('"') && text.endsWith('"')) ||
      (text.startsWith("'") && text.endsWith("'"))) {
    try { return JSON.parse(text.startsWith("'") ? JSON.stringify(text.slice(1, -1)) : text); }
    catch { return text.slice(1, -1); }
  }
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  const concat = text.split(/\s+\+\s+/);
  if (concat.length > 1) return concat.map(part => parseLiteral(part, variables)).map(displayValue).join("");
  throw new Error(`Unsupported expression: ${text}`);
}

function appendOutput(lines, value) {
  lines.push(displayValue(value));
}

async function runNova(source) {
  const variables = {};
  const lines = [];
  let botPersonality = "You are TAMILAN AI, a friendly and helpful AI assistant.";
  const statements = source.split(/\r?\n/);

  for (let index = 0; index < statements.length; index++) {
    const line = statements[index].trim();
    if (!line || line.startsWith("//")) continue;
    const where = `Line ${index + 1}`;

    let match = line.match(/^([A-Za-z_]\w*)\s*=\s*ai\.chat\(["']gemini["']\)$/);
    if (match) { variables[match[1]] = { type: "bot" }; continue; }

    match = line.match(/^([A-Za-z_]\w*)\.personality\s*=\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')$/);
    if (match) {
      if (!variables[match[1]] || variables[match[1]].type !== "bot") throw new Error(`${where}: Unknown chatbot '${match[1]}'.`);
      botPersonality = parseLiteral(match[2], variables);
      continue;
    }

    match = line.match(/^([A-Za-z_]\w*)\.say\((.*)\)$/);
    if (match) {
      if (!variables[match[1]] || variables[match[1]].type !== "bot") throw new Error(`${where}: Unknown chatbot '${match[1]}'.`);
      appendOutput(lines, parseLiteral(match[2], variables));
      continue;
    }

    match = line.match(/^([A-Za-z_]\w*)\.ask\((.*)\)$/);
    if (match) {
      if (!variables[match[1]] || variables[match[1]].type !== "bot") throw new Error(`${where}: Unknown chatbot '${match[1]}'.`);
      const prompt = parseLiteral(match[2], variables);
      lines.push("TAMILAN AI is thinking…");
      output.textContent = lines.join("\n");
      const result = await callGemini(String(prompt), [], botPersonality);
      lines.pop();
      lines.push(result);
      continue;
    }

    match = line.match(/^show\s+(.+)$/);
    if (match) { appendOutput(lines, parseLiteral(match[1], variables)); continue; }

    match = line.match(/^([A-Za-z_]\w*)\s*=\s*(.+)$/);
    if (match) { variables[match[1]] = parseLiteral(match[2], variables); continue; }

    throw new Error(`${where}: Unknown statement: ${line}`);
  }
  return lines.join("\n") || "Program finished. (No output.)";
}

async function callGemini(message, priorHistory = history, persona = personality.value) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history: priorHistory, personality: persona })
  });
  let data;
  try { data = await response.json(); }
  catch { throw new Error("Server returned an invalid response. Is the backend running?"); }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data.text;
}

runButton.addEventListener("click", async () => {
  if (busy) return;
  busy = true;
  runButton.disabled = true;
  runState.textContent = "Running…";
  output.textContent = "";
  try {
    output.textContent = await runNova(code.value);
    runState.textContent = "Finished";
  } catch (error) {
    output.textContent = `TAMILAN AI ERROR: ${error.message}`;
    runState.textContent = "Error";
  } finally {
    busy = false;
    runButton.disabled = false;
  }
});

$("#reset-code").addEventListener("click", () => {
  code.value = `// Your first TAMILAN AI program
bot = ai.chat("gemini")
bot.personality = "You are TAMILAN AI, a friendly and helpful AI assistant."
bot.say("Hello! I am ready to help.")
bot.ask("Explain artificial intelligence in simple words.")`;
  updateLineNumbers();
  output.textContent = "Code reset. Press “Run program” to execute.";
  runState.textContent = "Ready";
});
$("#clear-output").addEventListener("click", () => {
  output.textContent = "";
  runState.textContent = "Cleared";
});

function addMessage(role, text) {
  const row = document.createElement("div");
  row.className = `message ${role === "user" ? "user-message" : "assistant-message"}`;
  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = role === "user" ? "You" : "✦";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const body = document.createElement("p");
  body.textContent = text;
  bubble.append(body);
  row.append(avatar, bubble);
  chatMessages.append(row);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return row;
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message || busy) return;
  chatInput.value = "";
  chatInput.style.height = "auto";
  addMessage("user", message);
  const previousHistory = history.slice();
  history.push({ role: "user", text: message });
  busy = true;
  sendButton.disabled = true;
  const pending = addMessage("model", "Thinking…");
  try {
    const answer = await callGemini(message, previousHistory, personality.value);
    pending.querySelector("p").textContent = answer;
    history.push({ role: "model", text: answer });
  } catch (error) {
    pending.querySelector("p").textContent = `Couldn't get a response: ${error.message}`;
    history.pop();
  } finally {
    busy = false;
    sendButton.disabled = false;
    chatInput.focus();
  }
});

chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = `${Math.min(chatInput.scrollHeight, 120)}px`;
});
chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
});

$("#clear-chat").addEventListener("click", () => {
  history.length = 0;
  chatMessages.replaceChildren();
  const row = document.createElement("div");
  row.className = "message assistant-message";
  const avatar = document.createElement("div");
  avatar.className = "message-avatar";
  avatar.textContent = "✦";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const title = document.createElement("strong");
  title.textContent = "Fresh conversation";
  const paragraph = document.createElement("p");
  paragraph.textContent = "Your chat history has been cleared. What would you like to explore?";
  bubble.append(title, paragraph);
  row.append(avatar, bubble);
  chatMessages.append(row);
});

async function checkBackend() {
  const status = $("#connection-status");
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    status.textContent = data.configured ? "Backend connected" : "Add Gemini API key";
    status.previousElementSibling.style.background = data.configured ? "var(--green)" : "#e6b567";
  } catch {
    status.textContent = "Backend unavailable";
    status.previousElementSibling.style.background = "var(--red)";
  }
}
checkBackend();
