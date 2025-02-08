// 初始化环境
const { jsPDF } = window.jspdf;
const API_URL = "https://api.siliconflow.cn/v1/chat/completions";

// 模型名称映射
const modelNameMap = {
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-7B": "免费 Qwen-7B",
    "deepseek-ai/DeepSeek-R1-Distill-Qwen-32B": "付费 Qwen-32B",
    "deepseek-ai/DeepSeek-R1-Distill-Llama-8B": "免费 Llama-8B",
    "deepseek-ai/DeepSeek-R1-Distill-Llama-70B": "付费 Llama-70B",
    "deepseek-ai/DeepSeek-V3": "付费 DeepSeek-V3",
    "THUDM/glm-4-9b-chat": "免费 glm-4",
    "01-ai/Yi-1.5-6B-Chat": "免费 Yi-1.5-6B",
    "01-ai/Yi-1.5-9B-Chat-16K": "免费 Yi-1.5-9B",
    "google/gemma-2-9b-it": "免费 gemma-2-9b"
};

// 模型列表
const modelList = Object.keys(modelNameMap);

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
    pendingSave: false, // 新增状态追踪字段
    currentModel: modelList[0], // 自动设置为模型列表中的第一个模型
    lastUserMessageTimestamp: null // 记录最后一次用户提问的时间戳
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

        // 删除指定对话记录
        state.conversations.splice(index, 1);
        localStorage.setItem("conversations", JSON.stringify(state.conversations));

        // 如果删除的是当前对话记录
        if (isCurrent) {
            if (state.conversations.length > 0) {
                // 跳转到最新保存的对话记录（按时间排序后的第一个）
                loadConversation(0);
            } else {
                // 如果所有对话记录都被删除，清空聊天框
                dom.chatBox.innerHTML = "";
                state.currentConversation = [];
                state.currentConversationIndex = null;
                updateChatTitle(i18next.t("app_title"));
            }
        }

        // 刷新对话历史记录
        loadHistory();

        // 如果没有对话记录，自动创建一个新的对话记录
        if (state.conversations.length === 0) {
            createNewConversation();
        } else if (isCurrent) {
            // 高亮显示最新跳转的对话记录卡片
            const historyItems = document.querySelectorAll('.history-item');
            if (historyItems.length > 0) {
                historyItems[0].classList.add('active');
            }
        }
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
    initModelSelector(); // 初始化模型选择器
    
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

    // 高亮显示当前对话记录的卡片
    if (state.currentConversationIndex !== null) {
        const historyItems = document.querySelectorAll('.history-item');
        if (historyItems[state.currentConversationIndex]) {
            historyItems[state.currentConversationIndex].classList.add('active');
        }
    }
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
            timestamp: Date.now(),
            model: modelList[0] // 默认选择第一个模型
        };

        state.conversations = [newConversation, ...state.conversations];
        state.currentConversationIndex = 0;
        state.currentModel = modelList[0]; // 更新当前模型为默认模型
        localStorage.setItem("conversations", JSON.stringify(state.conversations));
        loadHistory();
        updateChatTitle(newConversation.title);

        // 设置模型选择器的值
        const modelSelect = document.getElementById("model-select");
        if (modelSelect) {
            modelSelect.value = state.currentModel;
        }

        // 确保新创建的对话记录背景颜色设置为active模式
        const historyItems = document.querySelectorAll('.history-item');
        if (historyItems.length > 0) {
            historyItems[0].classList.add('active');
        }

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
    conversation.model = state.currentModel; // 保存当前模型

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
    if (historyItems[index]) {
        historyItems[index].classList.add('active');
    }

    state.currentConversationIndex = index;
    state.currentConversation = [...conversation.messages];
    dom.chatBox.innerHTML = "";
    state.currentConversation.forEach(msg => addMessageElement(msg));
    updateChatTitle(conversation.title);

    // 恢复当前对话的模型选择
    const modelSelect = document.getElementById("model-select");
    if (modelSelect) {
        modelSelect.value = conversation.model || modelList[0];
    }
    state.currentModel = conversation.model || modelList[0];
}

// 更新聊天框标题
function updateChatTitle(title) {
    const maxLength = 14;
    const displayTitle = title.length > maxLength? title.substring(0, maxLength - 3) + '...' : title;
    dom.chatTitle.textContent = displayTitle;
}

// 消息处理
const API_KEY = "sk-yptzbigpwpaiknvixhrhqcwodgzekskfcernrcirnmdregmv";
function addMessageElement(message) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `chat-message ${message.role} message-enter-animation`;
    messageDiv.dataset.timestamp = message.timestamp;

    const timestamp = new Date(message.timestamp).toLocaleString(
        i18next.language,
        i18next.t('timestamp_format')
    );

    const aiName = modelNameMap[message.model] || modelNameMap[state.currentModel] || "助手";

    messageDiv.innerHTML = `
        <div class="avatar">${message.role === 'user' ? '👤' : '🤖'}</div>
        <div class="message-container">
            <div class="message-header">
                <span class="message-role">${message.role === 'user' ? i18next.t('you') : aiName}</span>
                <span class="message-time">${timestamp}</span>
            </div>
            <div class="message-content">${message.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            ${message.role === 'user' ? `
                <div class="message-buttons">
                    <button class="copy-button" data-tooltip="复制">📄</button>
                    <button class="copy-to-input-button" data-tooltip="一键复制到输入框">📥</button>
                </div>
            ` : ''}
            ${message.role === 'assistant' ? `
                <div class="message-buttons">
                    <button class="copy-button" data-tooltip="复制">📄</button>
                    <button class="reconnect-button" data-tooltip="重连">🔄</button>
                </div>
            ` : ''}
        </div>
    `;

    setupCopyButton(messageDiv, message.content);
    if (message.role === 'user') {
        setupCopyToInputButton(messageDiv, message.content);
    }
    if (message.role === 'assistant') {
        setupReconnectButton(messageDiv, message);
    }

    dom.chatBox.appendChild(messageDiv);
    dom.chatBox.scrollTo({
        top: dom.chatBox.scrollHeight,
        behavior: 'smooth'
    });
}

// 复制按钮功能
function setupCopyButton(messageDiv, content) {
    const copyButton = messageDiv.querySelector('.copy-button');
    if (copyButton) {
        copyButton.addEventListener('click', () => {
            navigator.clipboard.writeText(content)
              .then(() => {
                    alert('内容已复制到剪贴板');
                })
              .catch(() => {
                    alert('复制失败，请重试');
                });
        });
    }
}

// 一键复制到输入框按钮功能
function setupCopyToInputButton(messageDiv, content) {
    const copyToInputButton = messageDiv.querySelector('.copy-to-input-button');
    if (copyToInputButton) {
        copyToInputButton.addEventListener('click', () => {
            dom.userInput.value = content;
        });
    }
}

// 重连按钮功能
function setupReconnectButton(messageDiv, aiMessage) {
    const reconnectButton = messageDiv.querySelector('.reconnect-button');
    if (reconnectButton) {
        reconnectButton.addEventListener('click', () => {
            // 找到对应的用户问题
            let userMessage = null;
            const conversationLength = state.currentConversation.length;
            for (let i = conversationLength - 1; i >= 0; i--) {
                if (state.currentConversation[i].role === 'user' && state.currentConversation[i].timestamp < aiMessage.timestamp) {
                    userMessage = state.currentConversation[i];
                    break;
                }
            }

            if (userMessage) {
                dom.userInput.value = userMessage.content; // 将用户问题复制到输入框

                // 删除当前 AI 回答
                messageDiv.remove();

                // 通过唯一标识找到对应的用户问题消息元素并删除
                const userMessageDiv = dom.chatBox.querySelector(`.chat-message[data-timestamp="${userMessage.timestamp}"]`);
                if (userMessageDiv) {
                    userMessageDiv.remove();
                }

                // 更新状态
                const userMessageIndex = state.currentConversation.findIndex(msg => msg === userMessage);
                state.currentConversation.splice(userMessageIndex, 1);
                const aiMessageIndex = state.currentConversation.findIndex(msg => msg === aiMessage);
                if (aiMessageIndex!== -1) {
                    state.currentConversation.splice(aiMessageIndex, 1);
                }

                sendMessage(); // 重新发送用户问题
            } else {
                alert('未找到对应的用户问题');
            }
        });
    }
}

// 初始化模型选择器
function initModelSelector() {
    const modelSelect = document.getElementById("model-select");
    const modelSelectContainer = document.querySelector(".model-select-container");

    // 初始化模型选择器
    modelSelect.innerHTML = Object.entries(modelNameMap).map(([key, value]) => `
        <option value="${key}" data-tooltip="${modelSelect.querySelector(`option[value="${key}"]`)?.getAttribute("data-tooltip") || ''}">${value}</option>
    `).join('');
    modelSelect.value = state.currentModel;

    // 监听模型选择变化
    modelSelect.addEventListener("change", (e) => {
        state.currentModel = e.target.value;
        updateAIModelName();

        // 保存当前模型到对话
        if (state.currentConversationIndex !== null) {
            state.conversations[state.currentConversationIndex].model = state.currentModel;
            localStorage.setItem("conversations", JSON.stringify(state.conversations));
        }
    });

    // 监听鼠标悬停事件，更新提示内容
    modelSelect.addEventListener("mouseover", () => {
        const selectedOption = modelSelect.options[modelSelect.selectedIndex];
        modelSelectContainer.setAttribute("data-tooltip", selectedOption.getAttribute("data-tooltip"));
    });
}


// 更新 AI 名称
function updateAIModelName() {
    const aiName = modelNameMap[state.currentModel] || "助手";
    i18next.t('ai', aiName);
    updateUI();
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

    // 记录当前用户提问的时间戳
    const currentUserMessageTimestamp = Date.now();
    state.lastUserMessageTimestamp = currentUserMessageTimestamp;

    try {
        // 添加用户消息
        const userMessageData = {
            role: "user",
            content: userMessage,
            timestamp: currentUserMessageTimestamp,
            model: state.currentModel // 保存当前模型
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
                model: state.currentModel, // 使用当前选择的模型
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
        
        // 检查时间戳是否匹配
        if (state.lastUserMessageTimestamp === currentUserMessageTimestamp) {
            const aiMessageData = {
                role: "assistant",
                content: aiMessage,
                timestamp: Date.now(),
                model: state.currentModel // 保存当前模型
            };
            removeTypingIndicator();
            addMessageElement(aiMessageData);
            state.currentConversation.push(aiMessageData);
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error("API Error:", error);
            removeTypingIndicator();
            const errorMessageData = {
                role: "assistant",
                content: "请求处理失败，请稍后再试。",
                timestamp: Date.now(),
                model: state.currentModel // 保存当前模型
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
