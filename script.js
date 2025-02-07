// 初始化环境
const { jsPDF } = window.jspdf;
const API_URL = "https://api.siliconflow.cn/v1/chat/completions";
const API_KEY = "sk-yptzbigpwpaiknvixhrhqcwodgzekskfcernrcirnmdregmv";

// DOM 元素引用
const dom = {
    chatBox: document.getElementById("chat-box"),
    userInput: document.getElementById("user-input"),
    sendButton: document.getElementById("send-button"),
    newChatButton: document.getElementById("new-chat-button"),
    historyList: document.getElementById("history-list"),
    languageSelect: document.getElementById("language-select"),
    sidebar: document.getElementById("sidebar"),
    toggleSidebar: document.getElementById("toggle-sidebar"),
    exportButtons: {
        json: document.getElementById("export-json-button"),
        // pdf: document.getElementById("export-pdf-button"),
        html: document.getElementById("export-html-button")
    },
    chatTitle: document.getElementById("chat-title")
};

let state = {
    isProcessing: false,
    conversations: JSON.parse(localStorage.getItem("conversations")) || [],
    currentConversation: [],
    currentConversationIndex: null,
    abortController: null,
    pendingSave: false  // 新增状态追踪字段
};

// 初始化事件监听
dom.exportButtons.json.addEventListener('click', () => exportConversation('json'));
// dom.exportButtons.pdf.addEventListener('click', () => exportConversation('pdf'));
dom.exportButtons.html.addEventListener('click', () => exportConversation('html'));
dom.sendButton.addEventListener("click", sendMessage);
dom.userInput.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

dom.newChatButton.addEventListener("click", () => {
    if (state.currentConversation.length > 0) {
        const confirmMessage = i18next.t("new_chat_confirm");
        if (!confirm(confirmMessage)) return;
    }
    createNewConversation();
});

// 侧边栏控制
dom.toggleSidebar.addEventListener("click", () => {
    dom.sidebar.classList.toggle("collapsed");
    dom.toggleSidebar.textContent = dom.sidebar.classList.contains("collapsed") ? "👉" : "👈";
    adjustChatContainerWidth();
});

// 重命名功能
function renameConversation(index) {
    const newTitle = prompt(i18next.t('rename_prompt'), state.conversations[index].title);
    if (newTitle && newTitle.trim()) {
        state.conversations[index].title = newTitle.trim();
        state.conversations[index].titleChanged = true; // 标记为重命名对话
        localStorage.setItem("conversations", JSON.stringify(state.conversations));
        loadHistory();
        if (index === state.currentConversationIndex) {
            updateChatTitle(newTitle.trim());
        }
    }
}

// 删除功能
function deleteConversation(index) {
    if (confirm(i18next.t('delete_confirm'))) {
        const isCurrent = index === state.currentConversationIndex;
        const isFirst = index === 0;
        
        state.conversations.splice(index, 1);
        localStorage.setItem("conversations", JSON.stringify(state.conversations));
        
        if (isCurrent) {
            if (state.conversations.length > 0) {
                loadConversation(isFirst ? 0 : Math.min(index, state.conversations.length - 1));
            } else {
                dom.chatBox.innerHTML = "";
                state.currentConversation = [];
                state.currentConversationIndex = null;
                updateChatTitle(i18next.t("app_title"));
            }
        }
        loadHistory();
    }
}

// 多语言支持
const i18nConfig = {
    lng: "zh",
    resources: {
        zh: {
            translation: {
                app_title: "AI 聊天助手",
                conversation_history: "对话记录",
                new_conversation: "新建对话",
                send: "发送",
                export: "导出",
                input_placeholder: "请输入您的问题...",
                rename: "重命名",
                delete: "删除",
                rename_prompt: "请输入新的对话名称：",
                delete_confirm: "您确定要删除此对话吗？",
                new_chat_confirm: "是否保存当前对话？",
                typing: "正在思考...",
                default_response: "抱歉，我无法理解您的问题。",
                error_response: "请求处理失败，请稍后再试。",
                you: "您",
                ai: "助手",
                timestamp_format: {
                    timeStyle: "short",
                    dateStyle: "short"
                }
            }
        },
        en: {
            translation: {
                app_title: "AI Chat Assistant",
                conversation_history: "Conversation History",
                new_conversation: "New Chat",
                send: "Send",
                export: "Export",
                input_placeholder: "Type your question...",
                rename: "Rename",
                delete: "Delete",
                rename_prompt: "Enter new name:",
                delete_confirm: "Confirm to delete this conversation?",
                new_chat_confirm: "Save current conversation?",
                typing: "Thinking...",
                default_response: "Sorry, I can't understand that.",
                error_response: "Request failed, please try again.",
                you: "You",
                ai: "Assistant",
                timestamp_format: {
                    timeStyle: "short",
                    dateStyle: "medium"
                }
            }
        }
    }
};

async function initI18n() {
    await i18next.init(i18nConfig);
    updateUI();
}

function updateUI() {
    document.querySelectorAll("[data-i18n]").forEach(el => {
        el.textContent = i18next.t(el.getAttribute("data-i18n"));
    });
    dom.userInput.placeholder = i18next.t("input_placeholder");
}

dom.languageSelect.addEventListener("change", (e) => {
    i18next.changeLanguage(e.target.value, () => {
        updateUI();
        loadHistory();
        reloadCurrentConversation();
    });
});

// 对话管理
function initApp() {
    state.conversations.sort((a, b) => b.timestamp - a.timestamp);
    loadHistory();
    
    if (state.conversations.length > 0) {
        loadConversation(0);
    } else {
        createNewConversation();
    }
}

function loadHistory() {
    dom.historyList.innerHTML = "";
    state.conversations.forEach((conv, index) => {
        const li = document.createElement("li");
        li.className = "history-item";
        
        const displayTitle = conv.title.length > 16 ? 
            conv.title.substring(0, 14) + '...' : 
            conv.title;

        li.innerHTML = `
            <div class="history-item-main">
                <span class="history-title">${displayTitle}</span>
                <span class="history-time">
                    ${new Date(conv.timestamp).toLocaleString(i18next.language, i18next.t('timestamp_format'))}
                </span>
            </div>
            <div class="history-controls">
                <button class="rename-button" data-tooltip="${i18next.t('rename')}">✏️</button>
                <button class="delete-button" data-tooltip="${i18next.t('delete')}">❌</button>
            </div>
        `;

        li.querySelector(".rename-button").addEventListener("click", (e) => {
            e.stopPropagation();
            renameConversation(index);
        });
        
        li.querySelector(".delete-button").addEventListener("click", (e) => {
            e.stopPropagation();
            deleteConversation(index);
        });

        li.addEventListener("click", () => loadConversation(index));
        dom.historyList.appendChild(li);
    });
}

async function createNewConversation() {
    if (state.pendingSave) {
        saveCurrentConversation(false);
    }
    
    return new Promise((resolve) => {

        state.currentConversation = [];
        state.currentConversationIndex = null;
        dom.chatBox.innerHTML = "";
        
        // 直接创建新对话对象
        const newConversation = {
            title: i18next.t("new_conversation"),
            messages: [],
            timestamp: Date.now()
        };
        
        state.conversations = [newConversation, ...state.conversations];
        state.currentConversationIndex = 0;
        
        localStorage.setItem("conversations", JSON.stringify(state.conversations));
        loadHistory();
        updateChatTitle(newConversation.title);
        resolve(true);
    });
}

// 保存对话记录
function saveCurrentConversation(forceSave = false) {
    if (!forceSave && state.pendingSave) return;

    state.pendingSave = true;
    
    // 确保索引有效性
    if (state.currentConversationIndex === null) return;

    const conversation = state.conversations[state.currentConversationIndex];
    const currentTitle = conversation.title;
    
    // 自动标题生成逻辑优化
    if (currentTitle === i18next.t("new_conversation")) {
        const firstQuestion = state.currentConversation.find(m => m.role === "user")?.content || '';
        conversation.title = firstQuestion.replace(/[\r\n]/g, ' ').substring(0, 24);
    }

    // 强制同步更新
    conversation.messages = [...state.currentConversation];
    conversation.timestamp = Date.now();
    
    localStorage.setItem("conversations", JSON.stringify(state.conversations));
    
    // 同步更新所有UI元素
    updateChatTitle(conversation.title);
    refreshHistoryItem(state.currentConversationIndex);
    state.pendingSave = false;
}

// 新增：刷新指定历史记录项
function refreshHistoryItem(index) {
    const items = dom.historyList.children;
    if (items.length > index) {
        const conversation = state.conversations[index];
        const titleElement = items[index].querySelector('.history-title');
        if (titleElement) {
            titleElement.textContent = conversation.title;
        }
    }
}


function loadConversation(index) {
    if (state.isProcessing) {
        state.abortController?.abort();
        state.isProcessing = false;
        setUIState(true);
    }
    
    const conversation = state.conversations[index];
    if (!conversation) return;

    // 移除所有历史记录的高亮样式
    const historyItems = document.querySelectorAll('.history-item');
    historyItems.forEach(item => item.classList.remove('active'));

    // 为当前选中的历史记录添加高亮样式
    historyItems[index].classList.add('active');

    state.currentConversationIndex = index;
    state.currentConversation = [...conversation.messages];
    dom.chatBox.innerHTML = "";
    state.currentConversation.forEach(msg => addMessageElement(msg));
    updateChatTitle(conversation.title);
}


// 更新聊天框标题
function updateChatTitle(title) {
    const maxLength = 16;
    const displayTitle = title.length > maxLength? title.substring(0, maxLength - 3) + '...' : title;
    dom.chatTitle.textContent = displayTitle;
}

// 消息处理
function addMessageElement(message) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `chat-message ${message.role} message-enter-animation`;
    
    const timestamp = new Date(message.timestamp).toLocaleString(
        i18next.language,
        i18next.t('timestamp_format')
    );

    messageDiv.innerHTML = `
        <div class="avatar">${message.role === 'user' ? '👤' : '🤖'}</div>
        <div class="message-container">
            <div class="message-header">
                <span class="message-role">${message.role === 'user' ? i18next.t('you') : i18next.t('ai')}</span>
                <span class="message-time">${timestamp}</span>
            </div>
            <div class="message-content">${message.content}</div>
        </div>
    `;

    dom.chatBox.appendChild(messageDiv);
    dom.chatBox.scrollTo({
        top: dom.chatBox.scrollHeight,
        behavior: 'smooth'
    });
}

// 消息发送处理
async function sendMessage() {
    if (state.isProcessing) {
        if (state.abortController) {
            state.abortController.abort();
            state.isProcessing = false;
            updateSendButton();
        }
        return;
    }

    const userMessage = dom.userInput.value.trim();
    if (!userMessage) {
        alert("请输入内容");
        return;
    }

    if (userMessage.length > 10000) {
        alert("内容过长，请减少输入字数！");
        return;
    }

    state.abortController = new AbortController();
    state.isProcessing = true;
    setUIState(false);

    try {
        // 添加用户消息
        const userMessageData = {
            role: "user",
            content: userMessage,
            timestamp: Date.now()
        };
        state.currentConversation.push(userMessageData);
        addMessageElement(userMessageData);
        dom.userInput.value = "";

        // 优化标题更新逻辑
        if (state.currentConversation.length === 1) { // 仅在首次提问时更新
            const shouldUpdateTitle = state.conversations[state.currentConversationIndex]?.title === i18next.t("new_conversation");
            if (shouldUpdateTitle) {
                const newTitle = userMessage.substring(0, 24);
                state.conversations[state.currentConversationIndex].title = newTitle;
                updateChatTitle(newTitle);
                refreshHistoryItem(state.currentConversationIndex); // 同步更新对话记录卡片标题
            }
        }
        // 显示输入状态
        showTypingIndicator();

        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "deepseek-ai/DeepSeek-V3",
                messages: state.currentConversation.map(({ role, content }) => ({ role, content })),
                stream: false,
                max_tokens: 4096,
                temperature: 0.7,
                top_p: 0.7,
                top_k: 50,
                frequency_penalty: 0.5,
                n: 1,
                stop: ["null"],
                response_format: { type: "text" }
            }),
            signal: state.abortController.signal
        });

        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        
        const data = await response.json();
        const aiMessage = data.choices[0]?.message?.content || "抱歉，我无法理解您的问题。";
        
        const aiMessageData = {
            role: "assistant",
            content: aiMessage,
            timestamp: Date.now()
        };
        removeTypingIndicator();
        addMessageElement(aiMessageData);
        state.currentConversation.push(aiMessageData);
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error("API Error:", error);
            removeTypingIndicator();
            const errorMessageData = {
                role: "assistant",
                content: "请求处理失败，请稍后再试。",
                timestamp: Date.now()
            };
            addMessageElement(errorMessageData);
        }
    } finally {
        state.isProcessing = false;
        state.abortController = null;
        setUIState(true);
        removeTypingIndicator();
        saveCurrentConversation();
    }
}


// 导出功能
function exportConversation(type) {
    if (!state.currentConversation.length) {
        alert(i18next.t('export_empty'));
        return;
    }

    const timestamp = new Date().toISOString().slice(0,10);
    const filename = `Chat_Export_${timestamp}`;

    try{
        switch(type) {
            case 'json':
                const jsonData = JSON.stringify(state.currentConversation, null, 2);
                saveAs(new Blob([jsonData], { type: 'application/json' }), `${filename}.json`);
                break;
                
            case 'pdf':
                const doc = new jsPDF();
                // 加载中文字体文件
                const fontPath = 'https://cdn.jsdelivr.net/gh/opentypejs/opentype.js@master/fonts/SourceHanSansSC-Regular.ttf'; // 使用思源黑体
                // const fontData = await fetch(fontPath).then(res => res.arrayBuffer());

                // 注册字体
                doc.addFileToVFS('SourceHanSansSC-Regular.ttf', fontData);
                doc.addFont('SourceHanSansSC-Regular.ttf', 'SourceHanSansSC', 'normal');
                doc.setFont('SourceHanSansSC');
                doc.setFontSize(12);
                let y = 20;
                state.currentConversation.forEach((msg, index) => {
                    const text = `${msg.role === 'user' ? i18next.t('you') : i18next.t('ai')}: ${msg.content}`;
                    const splitText = doc.splitTextToSize(text, 180);
                    splitText.forEach((line, i) => {
                        if (y > 280) {
                            doc.addPage();
                            y = 20;
                        }
                        doc.text(line, 20, y + (i * 10));
                    });
                    y += splitText.length * 10 + 10;
                });
                doc.save(`${filename}.pdf`);
                break;
                
            case 'html':
                const htmlContent = `<!DOCTYPE html>
                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <title>${filename}</title>
                        <style>
                            body { font-family: Arial, sans-serif; padding: 20px; }
                            .user { color: #1abc9c; margin: 10px 0; }
                            .assistant { color: #666; margin: 10px 0; }
                        </style>
                    </head>
                    <body>
                        ${state.currentConversation.map(msg => 
                            `<div class="${msg.role}">
                                <strong>${msg.role === 'user' ? i18next.t('you') : i18next.t('ai')}:</strong>
                                <p>${msg.content.replace(/\n/g, '<br>')}</p>
                            </div>`
                        ).join('')}
                    </body>
                    </html>`;
                const htmlBlob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
                saveAs(htmlBlob, `${filename}.html`);
                break;
        }

    }catch(error) {
        console.error(`Export ${type} failed:`, error);
        alert(i18next.t('export_error'));
    }
    
}

// 完善UI状态控制
function setUIState(enabled) {
    dom.newChatButton.disabled = !enabled;
    dom.userInput.disabled = !enabled;
    dom.sendButton.textContent = state.isProcessing ? i18next.t('stop') : i18next.t('send');
    dom.sendButton.style.backgroundColor = state.isProcessing ? '#e74c3c' : '#1abc9c';
    
}

function showTypingIndicator() {
    const indicator = document.createElement("div");
    indicator.className = "chat-message ai typing-indicator";
    indicator.innerHTML = `
        <div class="avatar">🤖</div>
        <div class="message-container">
            <div class="typing-content" >
                <div class="typing-dots" >
                    <div class="dot"></div>
                    <div class="dot"></div>
                    <div class="dot"></div>
                </div>
            </div>
        </div>
    `;
    dom.chatBox.appendChild(indicator);
    dom.chatBox.scrollTop = dom.chatBox.scrollHeight;
}

function removeTypingIndicator() {
    document.querySelector(".typing-indicator")?.remove();
}

// 初始化应用
initI18n().then(() => {
    initApp();
    updateUI();
});
