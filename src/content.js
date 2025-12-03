import { getIdentity, getIdentityForModel } from './identity/index.ts';
import { getPageContext } from './context.js';
import { callModel } from './api.js';
import { conversation } from './conversation.js';
import { memory } from './memory/store.js';
import { extractFacts, getFactsForPrompt } from './memory/facts.js';
import { recordPageVisit, getBrowsingContext } from './memory/pages.js';
import { initInjector } from './injector.js';

console.log('Arete loaded');

// Load conversation on init
conversation.load();

// Test memory store (Phase 2)
(async () => {
  const stats = await memory.getStats();
  console.log('Arete Memory Stats:', stats);

  // Debug: dump ALL storage to see actual keys
  const all = await chrome.storage.local.get(null);
  console.log('=== ARETE STORAGE DEBUG ===');
  console.log('All keys:', Object.keys(all));
  console.log('arete_facts_learned:', all['arete_facts_learned']);
  console.log('arete_context_pages:', all['arete_context_pages']);
  console.log('arete_conversation:', all['arete_conversation']);
  console.log('=== END DEBUG ===');

  // Record current page visit
  recordPageVisit(window.location.href, document.title);
})();

// Initialize injector for AI sites (ChatGPT, Claude)
initInjector();

const HOTKEY = { meta: true, shift: true, key: 'o' };

let overlay = null;
let capturedSelection = null; // Store selection before overlay opens

function getHostname(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 20);
  }
}

// Estimate token count from conversation
function estimateTokens() {
  const totalChars = conversation.history.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  const tokens = Math.round(totalChars / 4); // rough estimate: 4 chars per token
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}k`;
  }
  return tokens.toString();
}

async function toggleOverlay() {
  if (overlay) {
    overlay.remove();
    overlay = null;
    return;
  }

  const context = getPageContext();
  const identity = await getIdentity();
  const tokenCount = estimateTokens();

  // Parse identity for cleaner tags
  const role = identity.core.role || 'User';
  const tech = identity.expertise[0] || 'Tech';
  const style = identity.communication.style[0] || 'Direct';

  overlay = document.createElement('div');
  overlay.id = 'arete-overlay';
  overlay.innerHTML = `
    <style>
      @keyframes arete-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      @keyframes arete-spin { to { transform: rotate(360deg); } }
      #arete-overlay * { box-sizing: border-box; }
      #arete-input::placeholder { color: #6b7280; }
      #arete-send:hover { transform: scale(1.05); }
      #arete-model:hover { border-color: rgba(45, 212, 191, 0.5); }
      #arete-new-chat:hover { background: rgba(110, 118, 129, 0.2); color: #e6edf3; }
      #arete-overlay .arete-codeblock {
        background: rgba(45, 212, 191, 0.08);
        border: 1px solid rgba(45, 212, 191, 0.2);
        border-radius: 8px;
        padding: 12px 14px;
        margin: 12px 0;
        font-family: ui-monospace, monospace;
      }
      #arete-overlay .arete-codeblock-header {
        font-size: 10px;
        font-weight: 600;
        color: #7d8590;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 8px;
      }
      #arete-overlay .arete-codeblock-content {
        font-size: 13px;
        color: #2dd4bf;
        line-height: 1.5;
      }
    </style>
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      width: 520px;
      background: linear-gradient(165deg, #0d1117 0%, #161b22 50%, #0d1117 100%);
      border-radius: 16px;
      z-index: 99999;
      padding: 20px;
      color: #e6edf3;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 16px 70px rgba(0,0,0,0.5), 0 0 0 1px rgba(45, 212, 191, 0.15);
      border: 1px solid rgba(48, 54, 61, 0.8);
    ">
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 6px 14px;
            background: rgba(45, 212, 191, 0.12);
            border: 1px solid rgba(45, 212, 191, 0.25);
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
            color: #2dd4bf;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          ">
            <span style="
              width: 8px;
              height: 8px;
              background: #2dd4bf;
              border-radius: 50%;
              animation: arete-pulse 2s ease-in-out infinite;
              box-shadow: 0 0 8px rgba(45, 212, 191, 0.6);
            "></span>
            Identity Active
          </div>
          <span style="color: #484f58;">·</span>
          <span style="font-size: 13px; color: #7d8590;">${tokenCount} tokens${conversation.history.length > 0 ? ` · ${conversation.history.length} msgs` : ''}</span>
        </div>
        <div style="
          padding: 6px 10px;
          background: rgba(110, 118, 129, 0.15);
          border-radius: 6px;
          font-size: 12px;
          color: #7d8590;
          font-family: ui-monospace, monospace;
        ">⌘⇧O</div>
      </div>

      <!-- Context Tags -->
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
        <span style="font-size: 12px; color: #7d8590;">Context:</span>
        <span style="
          padding: 6px 14px;
          background: rgba(110, 118, 129, 0.12);
          border: 1px solid rgba(110, 118, 129, 0.2);
          border-radius: 20px;
          font-size: 13px;
          color: #e6edf3;
        ">${role}</span>
        <span style="
          padding: 6px 14px;
          background: rgba(110, 118, 129, 0.12);
          border: 1px solid rgba(110, 118, 129, 0.2);
          border-radius: 20px;
          font-size: 13px;
          color: #e6edf3;
        ">${tech}</span>
        <span style="
          padding: 6px 14px;
          background: rgba(110, 118, 129, 0.12);
          border: 1px solid rgba(110, 118, 129, 0.2);
          border-radius: 20px;
          font-size: 13px;
          color: #e6edf3;
        ">${style} style</span>
        <span style="
          padding: 6px 14px;
          background: rgba(110, 118, 129, 0.12);
          border: 1px solid rgba(110, 118, 129, 0.2);
          border-radius: 20px;
          font-size: 13px;
          color: #58a6ff;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        ">
          <span style="font-size: 11px;">🔗</span>
          ${getHostname(context.url)}
        </span>
        ${capturedSelection ? `
        <span style="
          padding: 6px 14px;
          background: rgba(45, 212, 191, 0.12);
          border: 1px solid rgba(45, 212, 191, 0.25);
          border-radius: 20px;
          font-size: 13px;
          color: #2dd4bf;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        ">
          <span style="font-size: 11px;">✓</span>
          ${capturedSelection.length} chars
        </span>
        ` : ''}
      </div>

      <!-- Messages -->
      <div id="arete-response" style="
        flex: 1;
        overflow-y: auto;
        margin-bottom: 16px;
        min-height: 200px;
        max-height: 320px;
      "></div>

      <!-- Input Area -->
      <div style="
        display: flex;
        gap: 10px;
        align-items: center;
        padding: 12px 16px;
        background: rgba(110, 118, 129, 0.08);
        border: 1px solid rgba(110, 118, 129, 0.15);
        border-radius: 12px;
      ">
        <button id="arete-new-chat" title="Start new chat (clears history)" style="
          width: 36px;
          height: 36px;
          border: 1px solid rgba(110, 118, 129, 0.3);
          border-radius: 8px;
          background: transparent;
          color: #7d8590;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 16px;
          transition: all 0.15s;
        ">+</button>
        <input
          id="arete-input"
          type="text"
          placeholder="Ask anything..."
          style="
            flex: 1;
            padding: 8px 4px;
            border: none;
            background: transparent;
            color: #e6edf3;
            font-size: 15px;
            outline: none;
          "
        />
        <select id="arete-model" style="
          padding: 10px 14px;
          border: 1px solid rgba(45, 212, 191, 0.3);
          border-radius: 8px;
          background: rgba(45, 212, 191, 0.08);
          color: #2dd4bf;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          outline: none;
          transition: all 0.15s;
          -webkit-appearance: none;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%232dd4bf' d='M3 4.5L6 8l3-3.5H3z'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
          padding-right: 28px;
        ">
          <option value="claude">Claude Sonnet</option>
          <option value="gpt">GPT-4o</option>
        </select>
        <button id="arete-send" style="
          width: 42px;
          height: 42px;
          border: none;
          border-radius: 10px;
          background: linear-gradient(135deg, #2dd4bf 0%, #14b8a6 100%);
          color: #0d1117;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          font-weight: bold;
          transition: transform 0.15s;
          box-shadow: 0 2px 8px rgba(45, 212, 191, 0.3);
        ">→</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = document.getElementById('arete-input');
  const responseDiv = document.getElementById('arete-response');
  const modelSelect = document.getElementById('arete-model');
  const sendBtn = document.getElementById('arete-send');
  const newChatBtn = document.getElementById('arete-new-chat');
  input.focus();

  // New chat button - clears conversation history
  newChatBtn.addEventListener('click', async () => {
    await conversation.clear();
    responseDiv.innerHTML = `
      <div style="color: #7d8590; font-size: 13px; padding: 20px 0; text-align: center;">
        <span style="color: #2dd4bf;">✓</span> New chat started. Context reset to current page.
      </div>
    `;
  });

  // Format AI response with styled code blocks
  function formatContent(text) {
    // Convert markdown-style code blocks to styled divs
    let formatted = text
      // Code blocks with language
      .replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
        const header = lang ? lang.toUpperCase() : 'CODE';
        return `<div class="arete-codeblock">
          <div class="arete-codeblock-header">${header}</div>
          <div class="arete-codeblock-content">${code.trim()}</div>
        </div>`;
      })
      // Inline code
      .replace(/`([^`]+)`/g, '<code style="background: rgba(110, 118, 129, 0.2); padding: 2px 6px; border-radius: 4px; font-family: ui-monospace, monospace; font-size: 13px;">$1</code>')
      // Bold
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // Line breaks
      .replace(/\n/g, '<br>');

    return formatted;
  }

  function renderMessage(role, content) {
    const isUser = role === 'user';
    const formattedContent = isUser ? content : formatContent(content);

    return `
      <div style="
        display: flex;
        gap: 14px;
        margin-bottom: 20px;
        align-items: flex-start;
      ">
        <div style="
          width: 38px;
          height: 38px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
          font-weight: 600;
          flex-shrink: 0;
          ${isUser
            ? 'background: #30363d; color: #7d8590;'
            : 'background: linear-gradient(135deg, #2dd4bf 0%, #14b8a6 100%); color: #0d1117;'
          }
        ">${isUser ? 'G' : '⚡'}</div>
        <div style="
          flex: 1;
          line-height: 1.7;
          font-size: 14px;
          color: ${isUser ? '#7d8590' : '#e6edf3'};
          padding-top: 8px;
        ">${formattedContent}</div>
      </div>
    `;
  }

  async function sendMessage() {
    if (!input.value.trim()) return;

    const userQuery = input.value.trim();
    const model = modelSelect.value;
    input.value = '';

    responseDiv.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; color: #7d8590; padding: 20px 0;">
        <span style="animation: arete-spin 1s linear infinite; display: inline-block; font-size: 18px;">⟳</span>
        <span style="font-size: 14px;">Thinking...</span>
      </div>
    `;

    const ctx = getPageContext();
    const learnedFacts = await getFactsForPrompt();
    const browsingContext = await getBrowsingContext();

    // Use captured selection (from before overlay opened) or fall back to current
    const selection = capturedSelection || ctx.selection;

    // Build page context section - make it very explicit to override old conversation context
    let pageContextStr = `
=== CURRENT PAGE (focus your response here) ===
URL: ${ctx.url}
Title: ${ctx.title}
Type: ${ctx.pageType}`;

    if (selection) {
      pageContextStr += `\n\nSelected text:\n${selection}`;
    } else if (ctx.content) {
      // Include page content (truncated) when no selection
      const contentPreview = ctx.content.slice(0, 4000);
      pageContextStr += `\n\nPage content:\n${contentPreview}${ctx.content.length > 4000 ? '...' : ''}`;
    }

    const identityPrompt = await getIdentityForModel(model);
    const systemPrompt = `${identityPrompt}${learnedFacts}${browsingContext}

${pageContextStr}`;

    try {
      await conversation.append('user', userQuery, { url: ctx.url, model });
      const messages = conversation.forAPI();
      const response = await callModel(model, systemPrompt, messages);
      await conversation.append('assistant', response, { url: ctx.url, model });

      // Extract facts in background (don't block UI)
      extractFacts(userQuery, response);

      responseDiv.innerHTML = renderMessage('user', userQuery) + renderMessage('assistant', response);
    } catch (err) {
      responseDiv.innerHTML = `
        <div style="
          color: #f85149;
          padding: 14px;
          background: rgba(248, 81, 73, 0.1);
          border: 1px solid rgba(248, 81, 73, 0.2);
          border-radius: 10px;
          font-size: 13px;
        ">Error: ${err.message}</div>
      `;
    }
  }

  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') sendMessage();
  });

  sendBtn.addEventListener('click', sendMessage);
}

document.addEventListener('keydown', (e) => {
  if (e.metaKey && e.shiftKey && e.key === HOTKEY.key) {
    e.preventDefault();
    // Capture selection BEFORE opening overlay (focus change clears it)
    capturedSelection = window.getSelection()?.toString() || null;
    toggleOverlay();
  }
  if (e.key === 'Escape' && overlay) {
    overlay.remove();
    overlay = null;
    capturedSelection = null;
  }
});
