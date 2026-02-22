// js/chat.js
// Handles the Ask AI feature on report cards

let currentChatUrl = null;
let chatHistory = [];
let currentAudio = null;
let currentAudioBtn = null;

function initChat() {
    const chatPanel = document.getElementById('chatPanel');
    const closeBtn = document.getElementById('closeChatBtn');
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInput');
    const chatMessages = document.getElementById('chatMessages');
    const chatReportTitle = document.getElementById('chatReportTitle');

    // Close Panel
    closeBtn.addEventListener('click', closeChatPanel);

    // Global event delegation for "Ask AI" buttons (works with dynamically rendered cards)
    document.body.addEventListener('click', (e) => {
        const askBtn = e.target.closest('.ask-ai-btn');
        if (askBtn) {
            const url = askBtn.dataset.url;
            const title = askBtn.dataset.title;
            openChatPanel(url, title);
        }

        // Audio Listen buttons
        const listenBtn = e.target.closest('.listen-btn');
        if (listenBtn) {
            const url = listenBtn.dataset.url || '';
            const title = listenBtn.dataset.title || '';
            const source = listenBtn.dataset.source || '';
            const summary = listenBtn.dataset.summary || '';
            handleAudioPlay(listenBtn, url, title, source, summary);
        }

        // Suggestion bubbles
        const suggestionBtn = e.target.closest('.chat-suggestion');
        if (suggestionBtn) {
            const text = suggestionBtn.textContent;
            chatInput.value = text;
            chatForm.dispatchEvent(new Event('submit'));
        }
    });

    // Handle Chat Submit
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const query = chatInput.value.trim();
        if (!query || !currentChatUrl) return;

        // Add user message to UI
        appendMessage('user', query);
        chatInput.value = '';

        // Add loading indicator
        const loadingId = appendMessage('assistant', '<div class="spinner" style="width:20px;height:20px;border-width:2px;"></div> Thinking...', true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: currentChatUrl,
                    question: query,
                    history: chatHistory
                })
            });

            const data = await response.json();

            if (!response.ok || data.error) {
                throw new Error(data.error || 'Failed to get answer');
            }

            // Update loading bubble with actual answer
            updateMessage(loadingId, data.answer);

            // Save to history
            chatHistory.push({ role: 'user', content: query });
            chatHistory.push({ role: 'assistant', content: data.answer });

        } catch (err) {
            console.error('Chat error:', err);
            updateMessage(loadingId, `❌ Sorry, I encountered an error: ${err.message}. (This might happen if the report is a protected PDF)`, 'error');
        }
    });

    // Global Esc key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && chatPanel.classList.contains('open')) {
            closeChatPanel();
        }
    });
}

function openChatPanel(url, title) {
    if (!url) {
        alert("This report doesn't have a valid link to analyze yet.");
        return;
    }

    const chatPanel = document.getElementById('chatPanel');
    const chatReportTitle = document.getElementById('chatReportTitle');
    const chatMessages = document.getElementById('chatMessages');

    // Reset if opening a new report
    if (currentChatUrl !== url) {
        currentChatUrl = url;
        chatHistory = [];
        chatReportTitle.textContent = title;

        chatMessages.innerHTML = `
      <div class="chat-message assistant">
        Hi! I'm your AI Research Assistant. Ask me anything about this report, or click a quick prompt below:
        <div class="chat-suggestions">
          <button class="chat-suggestion">Summarize the key takeaways</button>
          <button class="chat-suggestion">What is the outlook or conclusion?</button>
        </div>
      </div>
    `;
    }

    chatPanel.classList.add('open');
    document.getElementById('chatInput').focus();
}

function closeChatPanel() {
    document.getElementById('chatPanel').classList.remove('open');
}

let msgCounter = 0;
function appendMessage(role, content, isHtml = false) {
    const chatMessages = document.getElementById('chatMessages');
    const msgDiv = document.createElement('div');
    const id = `msg-${msgCounter++}`;
    msgDiv.id = id;
    msgDiv.className = `chat-message ${role}`;

    if (role === 'user') {
        msgDiv.textContent = content; // sanitize
    } else {
        // Basic Markdown to HTML parsing for the assistant
        if (isHtml) {
            msgDiv.innerHTML = content;
        } else {
            let html = content
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n\n/g, '<br><br>')
                .replace(/\n- /g, '<br>• ')
                .replace(/^- /g, '• ');
            msgDiv.innerHTML = html;
        }
    }

    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return id;
}

function updateMessage(id, content, typeClass = null) {
    const msgDiv = document.getElementById(id);
    if (msgDiv) {
        if (typeClass) {
            msgDiv.className = `chat-message ${typeClass}`;
            msgDiv.textContent = content;
        } else {
            let html = content
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n\n/g, '<br><br>')
                .replace(/\n- /g, '<br>• ')
                .replace(/^- /g, '• ');
            msgDiv.innerHTML = html;
        }
        const chatMessages = document.getElementById('chatMessages');
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
}

// ==================== AUDIO (TTS) ====================
async function handleAudioPlay(btn, url, title, source, summary) {
    // If already playing this one, stop it (or resume if paused)
    if (currentAudio && currentAudioBtn === btn) {
        if (currentAudio.paused && currentAudio.src && !currentAudio.src.includes('data:audio')) {
            currentAudio.play();
            return;
        }
        currentAudio.pause();
        currentAudio = null;
        btn.classList.remove('playing');
        btn.textContent = '🔊 Listen';
        currentAudioBtn = null;
        return;
    }

    // If playing another one, stop that one first
    if (currentAudio && currentAudioBtn) {
        currentAudio.pause();
        currentAudioBtn.classList.remove('playing');
        currentAudioBtn.textContent = '🔊 Listen';
    }

    // Start loading new one
    btn.textContent = '⏳ Loading...';
    btn.disabled = true;

    // Create the audio element immediately during the trusted click event
    currentAudio = new Audio();
    currentAudioBtn = btn;

    // Play a tiny silent base64 string to "unlock" the audio element for this user gesture
    currentAudio.src = 'data:audio/mp3;base64,//OQxAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';
    currentAudio.play().catch(() => { });
    currentAudio.pause();

    try {
        const response = await fetch('/api/audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, title, source, summary })
        });

        const data = await response.json();

        if (!response.ok || data.error) {
            throw new Error(data.error || 'Audio generation failed');
        }

        // Set the newly generated permanent CDN URL
        currentAudio.src = data.audioContent;

        currentAudio.onplay = () => {
            btn.textContent = '⏸ Stop';
            btn.classList.add('playing');
            btn.disabled = false;
        };

        currentAudio.onended = () => {
            btn.textContent = '🔊 Listen';
            btn.classList.remove('playing');
            currentAudio = null;
            currentAudioBtn = null;
        };

        currentAudio.onerror = () => {
            btn.textContent = '❌ Error';
            btn.classList.remove('playing');
            setTimeout(() => { btn.textContent = '🔊 Listen'; btn.disabled = false; }, 3000);
        };

        const playPromise = currentAudio.play();
        if (playPromise !== undefined) {
            playPromise.catch(err => {
                console.warn("Play blocked by browser tracking policy:", err);
                // If the browser still blocks it, change button state to let user explicitly hit play again
                btn.textContent = '▶️ Play Audio';
                btn.disabled = false;
                btn.classList.remove('playing');
            });
        }

    } catch (err) {
        console.error('Audio error:', err);
        btn.textContent = '❌ Error';
        btn.disabled = false;
        setTimeout(() => { btn.textContent = '🔊 Listen'; }, 3000);
    }
}

// Initialize on load
document.addEventListener('DOMContentLoaded', initChat);
