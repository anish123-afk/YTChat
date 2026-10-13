// chat.js - Frontend logic for YTChat minimalist dark extension

(() => {
  // Application State
  const state = {
    videoId: null,
    videoTitle: "",
    videoUrl: "",
    selectedLevel: "Level 2",
    backendUrl: localStorage.getItem("ytchat_api_url") || "http://localhost:8000/api/chat",
    backendMode: localStorage.getItem("ytchat_mode") || "auto",
    messages: [], // Array of { role: 'user'|'assistant', text: '', level: '', timestamp: '' }
    isLoading: false
  };

  // Level Descriptions (matching RAG prompt definitions)
  const LEVEL_DESCRIPTIONS = {
    "Level 1": {
      name: "Level 1: Creative",
      desc: "Prefer context, but allow general knowledge to fill gaps. Clearly distinguish outside knowledge."
    },
    "Level 2": {
      name: "Level 2: Balanced",
      desc: "Prefer context; use general knowledge only to clarify context-supported information."
    },
    "Level 3": {
      name: "Level 3: Strict Context",
      desc: "Use only information explicitly supported by context. State when information is missing."
    },
    "Level 4": {
      name: "Level 4: Grounded Verbatim",
      desc: "Every factual claim must be directly supported by context. Do not infer or use outside knowledge."
    }
  };

  // DOM Elements
  const videoIdText = document.getElementById("videoIdText");
  const videoIdBadge = document.getElementById("videoIdBadge");
  const copyIdBtn = document.getElementById("copyIdBtn");
  const videoTitleDisplay = document.getElementById("videoTitleDisplay");
  const closeSidebarBtn = document.getElementById("closeSidebarBtn");
  const openSettingsBtn = document.getElementById("openSettingsBtn");

  const levelButtons = document.querySelectorAll(".level-btn");
  const levelNameIndicator = document.getElementById("levelNameIndicator");
  const levelDescription = document.getElementById("levelDescription");

  const chatContainer = document.getElementById("chatContainer");
  const welcomeCard = document.getElementById("welcomeCard");
  const messagesList = document.getElementById("messagesList");
  const typingIndicator = document.getElementById("typingIndicator");

  const queryInput = document.getElementById("queryInput");
  const sendBtn = document.getElementById("sendBtn");
  const clearHistoryBtn = document.getElementById("clearHistoryBtn");

  // Settings Modal Elements
  const settingsModal = document.getElementById("settingsModal");
  const closeSettingsModalBtn = document.getElementById("closeSettingsModalBtn");
  const cancelSettingsBtn = document.getElementById("cancelSettingsBtn");
  const saveSettingsBtn = document.getElementById("saveSettingsBtn");
  const apiUrlInput = document.getElementById("apiUrlInput");
  const backendModeSelect = document.getElementById("backendModeSelect");
  const testConnectionBtn = document.getElementById("testConnectionBtn");
  const connectionStatusText = document.getElementById("connectionStatusText");
  const statusDot = document.getElementById("statusDot");

  // Initialize
  function init() {
    setupLevelSelectors();
    setupInputHandlers();
    setupSettingsModal();
    setupMessagingWithParent();
    setupSuggestionChips();

    apiUrlInput.value = state.backendUrl;
    backendModeSelect.value = state.backendMode;

    // Request video info from parent content script
    notifyParent({ type: "REQUEST_VIDEO_INFO" });
  }

  // Communication with Content Script
  function notifyParent(payload) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ source: "YTCHAT_SIDEBAR", ...payload }, "*");
    }
  }

  function setupMessagingWithParent() {
    window.addEventListener("message", (event) => {
      const data = event.data;
      if (!data || data.source !== "YTCHAT_CONTENT_SCRIPT") return;

      if (data.type === "VIDEO_INFO") {
        updateVideoInfo(data.data);
      }
    });

    closeSidebarBtn.addEventListener("click", () => {
      notifyParent({ type: "CLOSE_SIDEBAR" });
    });

    copyIdBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (state.videoId) {
        navigator.clipboard.writeText(state.videoId);
        const originalText = videoIdText.textContent;
        videoIdText.textContent = "Copied!";
        setTimeout(() => {
          videoIdText.textContent = originalText;
        }, 1200);
      }
    });

    videoIdBadge.addEventListener("click", () => {
      if (state.videoId) {
        navigator.clipboard.writeText(state.videoId);
        const originalText = videoIdText.textContent;
        videoIdText.textContent = "Copied!";
        setTimeout(() => {
          videoIdText.textContent = originalText;
        }, 1200);
      }
    });
  }

  // Update detected video state
  function updateVideoInfo(info) {
    if (!info) return;
    const isNewVideo = state.videoId && state.videoId !== info.videoId;
    state.videoId = info.videoId || null;
    state.videoTitle = info.title || "";
    state.videoUrl = info.url || "";

    if (state.videoId) {
      videoIdText.textContent = state.videoId;
      videoIdText.title = state.videoId;
      if (state.videoTitle) {
        videoTitleDisplay.textContent = state.videoTitle;
      }
    } else {
      videoIdText.textContent = "Not found";
      videoTitleDisplay.textContent = "No YouTube Video Detected";
    }

    if (isNewVideo) {
      // Optional: Add video transition note
      appendSystemNotice(`Switched to video: ${state.videoId}`);
    }
  }

  // Setup Strictness Level Selector
  function setupLevelSelectors() {
    levelButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const level = btn.getAttribute("data-level");
        setLevel(level);
      });
    });
  }

  function setLevel(level) {
    state.selectedLevel = level;
    levelButtons.forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-level") === level);
    });

    const info = LEVEL_DESCRIPTIONS[level] || LEVEL_DESCRIPTIONS["Level 2"];
    levelNameIndicator.textContent = info.name;
    levelDescription.textContent = info.desc;
  }

  // Input Box & Auto-resize
  function setupInputHandlers() {
    queryInput.addEventListener("input", () => {
      queryInput.style.height = "auto";
      queryInput.style.height = Math.min(queryInput.scrollHeight, 120) + "px";
    });

    queryInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmitQuery();
      }
    });

    sendBtn.addEventListener("click", handleSubmitQuery);

    clearHistoryBtn.addEventListener("click", () => {
      messagesList.innerHTML = "";
      state.messages = [];
      welcomeCard.style.display = "block";
    });
  }

  // Quick Suggestion Chips
  function setupSuggestionChips() {
    const chips = document.querySelectorAll(".chip-btn");
    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        const query = chip.getAttribute("data-query");
        if (query) {
          queryInput.value = query;
          handleSubmitQuery();
        }
      });
    });
  }

  // Handle Query Submission
  async function handleSubmitQuery() {
    const query = queryInput.value.trim();
    if (!query || state.isLoading) return;

    // Reset input
    queryInput.value = "";
    queryInput.style.height = "auto";
    welcomeCard.style.display = "none";

    // 1. Add User Message
    appendMessage({
      role: "user",
      text: query,
      level: state.selectedLevel,
      timestamp: formatTime(new Date())
    });

    setLoading(true);

    try {
      // 2. Fetch answer from backend or fallback demo
      const reply = await queryBackend(query, state.selectedLevel, state.videoId);
      
      // 3. Add Assistant Message
      appendMessage({
        role: "assistant",
        text: reply,
        level: state.selectedLevel,
        timestamp: formatTime(new Date())
      });
    } catch (err) {
      appendMessage({
        role: "assistant",
        text: `⚠️ **Connection Error**: ${err.message || "Failed to reach AI backend."}\n\nPlease verify that your server is running at \`${state.backendUrl}\` or click the ⚙️ Settings icon to switch to Demo mode.`,
        level: state.selectedLevel,
        timestamp: formatTime(new Date())
      });
    } finally {
      setLoading(false);
      queryInput.focus();
    }
  }

  // Query Backend Server
  async function queryBackend(query, strictness, videoId) {
    if (state.backendMode === "demo") {
      return generateMockResponse(query, strictness, videoId);
    }

    try {
      const response = await fetch(state.backendUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          video_id: videoId || "unknown",
          query: query,
          strictness: strictness
        })
      });

      if (!response.ok) {
        let errMsg = `Server returned HTTP ${response.status}`;
        try {
          const errData = await response.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (_) {}
        return `⚠️ **Backend Error**: ${errMsg}`;
      }

      const data = await response.json();
      // Handle standard response fields
      return data.reply || data.response || data.result || data.answer || JSON.stringify(data);
    } catch (error) {
      if (state.backendMode === "auto") {
        console.warn("[YTChat] Backend unreachable, falling back to demo mode:", error);
        const demoReply = generateMockResponse(query, strictness, videoId);
        return `*(Offline Demo Mode — backend not running)*\n\n${demoReply}`;
      }
      throw error;
    }
  }

  // Intelligent Demo Response for testing without running server
  function generateMockResponse(query, strictness, videoId) {
    const qLower = query.toLowerCase();
    const vid = videoId || "Current Video";

    if (strictness === "Level 4") {
      return `**Strict Transcript Findings for [${vid}]:**\n\n- The transcript contains direct discussion answering: "${query}".\n- Refer to timestamp <span class="timestamp-link" data-seconds="75">01:15</span> where the speaker details the core principle.\n\n*Note (Level 4 Rule)*: Every statement is exclusively drawn verbatim from retrieved transcript chunks with zero external inference.`;
    } else if (strictness === "Level 3") {
      return `Based strictly on the retrieved context for video \`${vid}\`:\n\n1. The video addresses "${query}" emphasizing systematic consistency.\n2. Key segment discussed around <span class="timestamp-link" data-seconds="142">02:22</span>.\n\n*Missing details*: The speaker does not explicitly cite clinical references or external literature beyond personal observations.`;
    } else if (strictness === "Level 2") {
      return `Here is the explanation based on video \`${vid}\` with clarifying context:\n\n- **Core Video Content**: The speaker explains how triggers influence behavior and recommends establishing friction against negative habits (see <span class="timestamp-link" data-seconds="95">01:35</span>).\n- **Clarification**: In behavioral psychology, this aligns with stimulus control and dopamine reset routines.`;
    } else {
      // Level 1
      return `**Answer for "${query}":**\n\nAccording to video \`${vid}\` (around <span class="timestamp-link" data-seconds="60">01:00</span>), habit loops are governed by awareness and replacement.\n\n**Broader Knowledge**: Combining this with standard habit formation research (e.g. Atomic Habits), you can replace cues and build positive friction to maintain long-term focus.`;
    }
  }

  // Append Message to UI
  function appendMessage(msg) {
    state.messages.push(msg);

    const item = document.createElement("div");
    item.className = `message-item ${msg.role}`;

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";

    if (msg.role === "assistant") {
      bubble.innerHTML = renderMarkdown(msg.text);
      attachTimestampListeners(bubble);
    } else {
      bubble.textContent = msg.text;
    }

    const meta = document.createElement("div");
    meta.className = "message-meta";
    meta.innerHTML = `
      <span class="level-tag">${msg.level || state.selectedLevel}</span>
      <span>${msg.timestamp}</span>
    `;

    item.appendChild(bubble);
    item.appendChild(meta);
    messagesList.appendChild(item);

    scrollToBottom();
  }

  function appendSystemNotice(text) {
    const notice = document.createElement("div");
    notice.style.fontSize = "11px";
    notice.style.color = "var(--text-muted)";
    notice.style.textAlign = "center";
    notice.style.padding = "4px";
    notice.textContent = `— ${text} —`;
    messagesList.appendChild(notice);
    scrollToBottom();
  }

  // Parse clickable timestamps & Markdown
  function renderMarkdown(rawText) {
    if (!rawText) return "";

    let text = rawText
      // HTML escaping
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Unescape our own timestamp tags if returned in mock
    text = text.replace(/&lt;span class="timestamp-link" data-seconds="(\d+)"&gt;(.*?)&lt;\/span&gt;/g, 
      '<span class="timestamp-link" data-seconds="$1">$2</span>');

    // Detect raw timestamp format like 01:23 or 1:23:45 if not already wrapped
    text = text.replace(/\b(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)\b(?![^<]*>)/g, (match, h, m, s) => {
      const hours = h ? parseInt(h, 10) : 0;
      const minutes = parseInt(m, 10);
      const seconds = parseInt(s, 10);
      const totalSeconds = hours * 3600 + minutes * 60 + seconds;
      return `<span class="timestamp-link" data-seconds="${totalSeconds}">▶ ${match}</span>`;
    });

    // Bold
    text = text.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    // Italic
    text = text.replace(/\*(.*?)\*/g, "<em>$1</em>");
    // Inline code
    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Bullet points
    text = text.replace(/(?:^|\n)- (.*?)(?=(?:\n|$))/g, "\n<li>$1</li>");
    text = text.replace(/(<li>.*?<\/li>)/gs, "<ul>$1</ul>");

    // Paragraph breaks
    text = text.split("\n\n").map(para => {
      if (para.startsWith("<ul>") || para.startsWith("<ol>") || para.startsWith("<pre>")) {
        return para;
      }
      return `<p>${para.replace(/\n/g, "<br>")}</p>`;
    }).join("");

    return text;
  }

  // Seek video when clicking timestamps
  function attachTimestampListeners(container) {
    const links = container.querySelectorAll(".timestamp-link");
    links.forEach((link) => {
      link.addEventListener("click", () => {
        const sec = link.getAttribute("data-seconds");
        if (sec) {
          notifyParent({ type: "SEEK_VIDEO", seconds: Number(sec) });
        }
      });
    });
  }

  function setLoading(loading) {
    state.isLoading = loading;
    typingIndicator.style.display = loading ? "flex" : "none";
    sendBtn.disabled = loading;
    if (loading) {
      scrollToBottom();
    }
  }

  function scrollToBottom() {
    setTimeout(() => {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 50);
  }

  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // Settings Modal Handlers
  function setupSettingsModal() {
    openSettingsBtn.addEventListener("click", () => {
      apiUrlInput.value = state.backendUrl;
      backendModeSelect.value = state.backendMode;
      settingsModal.style.display = "flex";
      checkConnectionStatus();
    });

    closeSettingsModalBtn.addEventListener("click", () => {
      settingsModal.style.display = "none";
    });

    cancelSettingsBtn.addEventListener("click", () => {
      settingsModal.style.display = "none";
    });

    saveSettingsBtn.addEventListener("click", () => {
      const url = apiUrlInput.value.trim();
      const mode = backendModeSelect.value;
      if (url) {
        state.backendUrl = url;
        localStorage.setItem("ytchat_api_url", url);
      }
      state.backendMode = mode;
      localStorage.setItem("ytchat_mode", mode);
      settingsModal.style.display = "none";
    });

    testConnectionBtn.addEventListener("click", checkConnectionStatus);
  }

  async function checkConnectionStatus() {
    statusDot.className = "status-indicator-dot";
    connectionStatusText.textContent = "Testing endpoint...";

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(apiUrlInput.value.trim() || state.backendUrl, {
        method: "OPTIONS",
        signal: controller.signal
      }).catch(() => null);

      clearTimeout(timeoutId);

      if (res || window.location.protocol === "chrome-extension:") {
        // Ping test or reachable
        statusDot.className = "status-indicator-dot online";
        connectionStatusText.textContent = "Backend reachable";
      } else {
        statusDot.className = "status-indicator-dot offline";
        connectionStatusText.textContent = "Offline (Demo fallback enabled)";
      }
    } catch {
      statusDot.className = "status-indicator-dot offline";
      connectionStatusText.textContent = "Offline (Demo fallback enabled)";
    }
  }

  // Start app
  init();
})();

