/**
 * LogTrace 日志面板 - 主界面逻辑
 *
 * 整合加密模块和通信模块，实现完整的 UI 交互
 * 核心功能：hover 时解密显示明文，离开时恢复密文
 */

(function () {
  'use strict';

  // ========== 状态管理 ==========
  const state = {
    connected: false,       // 是否已连接服务器
    streamId: null,         // 当前数据流 ID
    streamName: null,       // 当前数据流名称
    nodeId: null,           // 本机节点 ID
    nodes: [],              // 在线节点列表
    cryptoKey: null,        // AES 加密密钥
    currentPassword: null,  // 当前密码（用于派生密钥）
    logs: []                // 日志列表 { id, timestamp, nodeId, level, payload, encrypted }
  };

  // ========== DOM 元素 ==========
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  const elements = {
    // 设置
    btnSettings: $('#btn-settings'),
    settingsPanel: $('#settings-panel'),
    serverUrl: $('#server-url'),
    btnSaveSettings: $('#btn-save-settings'),
    btnCloseSettings: $('#btn-close-settings'),

    // 连接控制
    streamSelect: $('#stream-select'),
    btnConnect: $('#btn-connect'),
    btnCreate: $('#btn-create'),
    connectionStatus: $('#connection-status'),
    nodeCount: $('#node-count'),

    // 模态框
    modal: $('#modal-stream'),
    modalTitle: $('#modal-title'),
    streamName: $('#stream-name'),
    streamIdGroup: $('#stream-id-group'),
    streamId: $('#stream-id'),
    streamPassword: $('#stream-password'),
    btnModalConfirm: $('#btn-modal-confirm'),
    btnModalCancel: $('#btn-modal-cancel'),

    // 过滤器
    filterInput: $('#filter-input'),
    levelFilter: $('#level-filter'),
    btnClear: $('#btn-clear'),

    // 日志列表
    logContainer: $('#log-container'),

    // 输入
    messageInput: $('#message-input'),
    btnSend: $('#btn-send')
  };

  // ========== 工具函数 ==========

  /**
   * 格式化时间戳
   */
  function formatTimestamp(ts) {
    const date = new Date(ts);
    const pad = (n) => n.toString().padStart(2, '0');
    const pad3 = (n) => n.toString().padStart(3, '0');
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad3(date.getMilliseconds())}`;
  }

  /**
   * 生成唯一 ID
   */
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /**
   * 更新连接状态显示
   */
  function updateConnectionStatus(status) {
    const el = elements.connectionStatus;
    el.className = 'status-indicator ' + status;

    const statusText = {
      'disconnected': '未连接',
      'connecting': '连接中',
      'connected': '已连接'
    };
    el.textContent = statusText[status] || status.toUpperCase();

    const isConnected = status === 'connected';
    elements.messageInput.disabled = !isConnected;
    elements.btnSend.disabled = !isConnected;
  }

  /**
   * 更新节点计数
   */
  function updateNodeCount(count) {
    elements.nodeCount.textContent = `${count} 个节点`;
  }

  // ========== 日志渲染 ==========

  /**
   * 创建日志条目 DOM
   * 核心功能：hover 显示明文，离开恢复密文
   */
  function createLogEntry(log) {
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.dataset.logId = log.id;
    entry.dataset.encrypted = log.payload;

    entry.innerHTML = `
      <div class="log-header">
        <span class="log-timestamp">${formatTimestamp(log.timestamp)}</span>
        <span class="log-level ${log.level}">${log.level}</span>
        <span class="log-node">${log.nodeId}</span>
      </div>
      <div class="log-payload">&gt; ${LogCrypto.truncatePayload(log.payload)}</div>
    `;

    // Hover 事件 - 解密显示明文
    const payloadEl = entry.querySelector('.log-payload');

    entry.addEventListener('mouseenter', async () => {
      if (!state.cryptoKey) return;

      try {
        const decrypted = await LogCrypto.decrypt(log.payload, state.cryptoKey);
        if (decrypted) {
          payloadEl.textContent = '> ' + decrypted;
          payloadEl.classList.add('decrypted');
        }
      } catch (error) {
        console.error('[界面] 解密失败:', error);
      }
    });

    entry.addEventListener('mouseleave', () => {
      // 离开时恢复显示密文
      payloadEl.textContent = '> ' + LogCrypto.truncatePayload(log.payload);
      payloadEl.classList.remove('decrypted');
    });

    return entry;
  }

  /**
   * 添加日志到列表
   */
  function addLog(log) {
    state.logs.push(log);

    // 清除空状态提示
    const emptyEl = elements.logContainer.querySelector('.log-empty');
    if (emptyEl) {
      emptyEl.remove();
    }

    // 应用过滤器
    if (!matchesFilter(log)) {
      return;
    }

    const entry = createLogEntry(log);
    elements.logContainer.appendChild(entry);

    // 滚动到底部
    elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
  }

  /**
   * 检查日志是否匹配过滤条件
   */
  function matchesFilter(log) {
    const textFilter = elements.filterInput.value.toLowerCase();
    const levelFilter = elements.levelFilter.value;

    if (levelFilter && log.level !== levelFilter) {
      return false;
    }

    if (textFilter && !log.payload.toLowerCase().includes(textFilter)) {
      return false;
    }

    return true;
  }

  /**
   * 重新渲染日志列表（应用过滤器后）
   */
  function rerenderLogs() {
    // 清空容器
    elements.logContainer.innerHTML = '';

    const filteredLogs = state.logs.filter(matchesFilter);

    if (filteredLogs.length === 0) {
      elements.logContainer.innerHTML = `
        <div class="log-empty">
          <p>无匹配日志</p>
        </div>
      `;
      return;
    }

    filteredLogs.forEach(log => {
      const entry = createLogEntry(log);
      elements.logContainer.appendChild(entry);
    });
  }

  /**
   * 清空日志
   */
  function clearLogs() {
    state.logs = [];
    elements.logContainer.innerHTML = `
      <div class="log-empty">
        <p>暂无日志</p>
        <p class="hint">连接数据流后即可接收日志</p>
      </div>
    `;
  }

  // ========== 模态框控制 ==========

  let modalMode = 'create'; // 'create' 或 'join'

  function showModal(mode) {
    modalMode = mode;
    elements.modal.classList.remove('hidden');

    if (mode === 'create') {
      elements.modalTitle.textContent = '创建数据流';
      elements.streamIdGroup.style.display = 'none';
      elements.streamName.style.display = 'block';
      elements.streamName.parentElement.style.display = 'block';
      elements.btnModalConfirm.textContent = '创建';
    } else {
      elements.modalTitle.textContent = '加入数据流';
      elements.streamIdGroup.style.display = 'block';
      elements.streamName.parentElement.style.display = 'none';
      elements.btnModalConfirm.textContent = '加入';
    }

    // 清空输入
    elements.streamName.value = '';
    elements.streamId.value = '';
    elements.streamPassword.value = '';
  }

  function hideModal() {
    elements.modal.classList.add('hidden');
  }

  // ========== 设置面板 ==========

  function toggleSettings() {
    elements.settingsPanel.classList.toggle('hidden');
  }

  async function loadSettings() {
    // 从 Chrome 存储加载设置
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const result = await chrome.storage.sync.get(['serverUrl']);
      if (result.serverUrl) {
        elements.serverUrl.value = result.serverUrl;
      }
    }
  }

  async function saveSettings() {
    const url = elements.serverUrl.value.trim() || 'http://localhost:3000';

    if (typeof chrome !== 'undefined' && chrome.storage) {
      await chrome.storage.sync.set({ serverUrl: url });
    }

    elements.settingsPanel.classList.add('hidden');

    // 如果已连接，重新连接到新服务器
    if (state.connected) {
      await connectToServer(url);
    }
  }

  // ========== 网络连接 ==========

  async function connectToServer(url) {
    url = url || elements.serverUrl.value.trim() || 'http://localhost:3000';

    updateConnectionStatus('connecting');

    try {
      await LogSocket.connect(url);
    } catch (error) {
      updateConnectionStatus('disconnected');
      console.error('[界面] 连接失败:', error);
    }
  }

  // ========== 数据流操作 ==========

  async function handleModalConfirm() {
    const password = elements.streamPassword.value.trim();

    if (!password) {
      alert('请输入访问密钥');
      return;
    }

    // 计算密码哈希
    const passwordHash = await LogCrypto.hashPassword(password);

    // 派生加密密钥
    state.currentPassword = password;
    state.cryptoKey = await LogCrypto.deriveKey(password);

    if (modalMode === 'create') {
      const streamName = elements.streamName.value.trim() || 'stream-' + generateId();
      LogSocket.createStream(streamName, passwordHash);
    } else {
      const streamId = elements.streamId.value.trim();
      if (!streamId) {
        alert('请输入数据流 ID');
        return;
      }
      LogSocket.joinStream(streamId, passwordHash);
    }

    hideModal();
  }

  async function handleConnect() {
    if (!state.connected) {
      // 连接到服务器
      const url = elements.serverUrl.value.trim() || 'http://localhost:3000';
      await connectToServer(url);
      return;
    }

    // 如果有选中的数据流，尝试加入
    const selectedStreamId = elements.streamSelect.value;
    if (selectedStreamId) {
      // 显示加入模态框
      showModal('join');
      elements.streamId.value = selectedStreamId;
    } else {
      // 显示加入模态框（手动输入 ID）
      showModal('join');
    }
  }

  function handleDisconnect() {
    LogSocket.leaveStream();
    LogSocket.disconnect();
    updateConnectionStatus('disconnected');
    state.connected = false;
    state.streamId = null;
    state.cryptoKey = null;
    clearLogs();
  }

  // ========== 消息发送 ==========

  async function sendMessage() {
    const message = elements.messageInput.value.trim();

    if (!message || !state.cryptoKey) {
      return;
    }

    try {
      // 加密消息
      const encrypted = await LogCrypto.encrypt(message, state.cryptoKey);

      // 发送
      const level = LogCrypto.randomLevel();
      LogSocket.pushLog(encrypted, level);

      // 清空输入
      elements.messageInput.value = '';
    } catch (error) {
      console.error('[界面] 加密/发送失败:', error);
    }
  }

  // ========== Socket 事件处理 ==========

  function setupSocketCallbacks() {
    LogSocket.on('onConnect', () => {
      state.connected = true;
      updateConnectionStatus('connected');
      elements.btnConnect.textContent = '加入';
    });

    LogSocket.on('onDisconnect', (reason) => {
      state.connected = false;
      state.streamId = null;
      updateConnectionStatus('disconnected');
      elements.btnConnect.textContent = '连接';
      updateNodeCount(0);
    });

    LogSocket.on('onNodeAssigned', (nodeId) => {
      state.nodeId = nodeId;
    });

    LogSocket.on('onStreamCreated', (data) => {
      if (data.success) {
        console.log('[界面] 数据流已创建:', data.streamId);

        // 复制数据流 ID 到剪贴板
        if (navigator.clipboard) {
          navigator.clipboard.writeText(data.streamId);
          console.log('[界面] 数据流 ID 已复制到剪贴板');
        }

        // 更新下拉框
        const option = document.createElement('option');
        option.value = data.streamId;
        option.textContent = data.streamName;
        elements.streamSelect.appendChild(option);
        elements.streamSelect.value = data.streamId;

        // 使用之前输入的密码自动加入
        setTimeout(async () => {
          const passwordHash = await LogCrypto.hashPassword(state.currentPassword);
          LogSocket.joinStream(data.streamId, passwordHash);
        }, 100);
      } else {
        alert('创建数据流失败: ' + data.error);
      }
    });

    LogSocket.on('onStreamJoined', (data) => {
      if (data.success) {
        state.streamId = data.streamId;
        state.streamName = data.streamName;
        console.log('[界面] 已加入数据流:', data.streamId);

        // 更新 UI
        elements.btnConnect.textContent = '离开';
        clearLogs();
      } else {
        alert('加入数据流失败: ' + data.error);
        state.cryptoKey = null;
        state.currentPassword = null;
      }
    });

    LogSocket.on('onStreamLeft', () => {
      state.streamId = null;
      state.streamName = null;
      state.cryptoKey = null;
      elements.btnConnect.textContent = '加入';
      updateNodeCount(0);
    });

    LogSocket.on('onLogReceived', (data) => {
      const log = {
        id: generateId(),
        timestamp: data.timestamp,
        nodeId: data.nodeId,
        level: data.level,
        payload: data.payload
      };
      addLog(log);
    });

    LogSocket.on('onNodeListUpdated', (nodes) => {
      state.nodes = nodes;
      updateNodeCount(nodes.length);
    });

    LogSocket.on('onError', (error) => {
      console.error('[界面] Socket 错误:', error);
    });
  }

  // ========== 事件绑定 ==========

  function bindEvents() {
    // 设置按钮
    elements.btnSettings.addEventListener('click', toggleSettings);
    elements.btnSaveSettings.addEventListener('click', saveSettings);
    elements.btnCloseSettings.addEventListener('click', () => {
      elements.settingsPanel.classList.add('hidden');
    });

    // 连接按钮
    elements.btnConnect.addEventListener('click', () => {
      if (state.streamId) {
        // 已加入数据流，离开
        LogSocket.leaveStream();
      } else if (state.connected) {
        // 已连接但未加入，显示加入模态框
        showModal('join');
      } else {
        // 未连接，连接服务器
        connectToServer();
      }
    });

    // 创建数据流按钮
    elements.btnCreate.addEventListener('click', () => {
      if (!state.connected) {
        alert('请先连接服务器');
        return;
      }
      showModal('create');
    });

    // 模态框
    elements.btnModalConfirm.addEventListener('click', handleModalConfirm);
    elements.btnModalCancel.addEventListener('click', hideModal);
    elements.modal.addEventListener('click', (e) => {
      if (e.target === elements.modal) {
        hideModal();
      }
    });

    // 过滤器
    elements.filterInput.addEventListener('input', rerenderLogs);
    elements.levelFilter.addEventListener('change', rerenderLogs);
    elements.btnClear.addEventListener('click', clearLogs);

    // 发送消息
    elements.btnSend.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // 下拉框选择数据流
    elements.streamSelect.addEventListener('change', () => {
      if (elements.streamSelect.value && state.connected && !state.streamId) {
        showModal('join');
        elements.streamId.value = elements.streamSelect.value;
      }
    });
  }

  // ========== 初始化 ==========

  async function init() {
    await loadSettings();
    setupSocketCallbacks();
    bindEvents();

    // 默认服务器地址
    if (!elements.serverUrl.value) {
      elements.serverUrl.value = 'http://localhost:3000';
    }

    console.log('[界面] LogTrace 日志面板已初始化');
  }

  // 启动
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
