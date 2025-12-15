/**
 * LogTrace Panel - Socket 通信模块
 *
 * 封装 Socket.IO 客户端，处理与服务端的通信
 */

const LogSocket = (function () {
  'use strict';

  let socket = null;
  let serverUrl = 'http://localhost:3000';
  let nodeId = null;
  let currentStreamId = null;

  // 事件回调
  const callbacks = {
    onConnect: null,
    onDisconnect: null,
    onNodeAssigned: null,
    onStreamCreated: null,
    onStreamJoined: null,
    onStreamLeft: null,
    onLogReceived: null,
    onNodeListUpdated: null,
    onError: null
  };

  /**
   * 初始化连接
   * @param {string} url - 服务器地址
   * @returns {Promise<boolean>}
   */
  function connect(url) {
    return new Promise((resolve, reject) => {
      if (socket && socket.connected) {
        socket.disconnect();
      }

      serverUrl = url || serverUrl;

      try {
        socket = io(serverUrl, {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          timeout: 10000
        });

        // 连接成功
        socket.on('connect', () => {
          console.log('[SOCKET] Connected to server');
          if (callbacks.onConnect) {
            callbacks.onConnect();
          }
          resolve(true);
        });

        // 连接错误
        socket.on('connect_error', (error) => {
          console.error('[SOCKET] Connection error:', error);
          if (callbacks.onError) {
            callbacks.onError('Connection failed: ' + error.message);
          }
          reject(error);
        });

        // 断开连接
        socket.on('disconnect', (reason) => {
          console.log('[SOCKET] Disconnected:', reason);
          currentStreamId = null;
          if (callbacks.onDisconnect) {
            callbacks.onDisconnect(reason);
          }
        });

        // 接收节点 ID
        socket.on('node:assigned', (data) => {
          nodeId = data.nodeId;
          console.log('[SOCKET] Node ID assigned:', nodeId);
          if (callbacks.onNodeAssigned) {
            callbacks.onNodeAssigned(nodeId);
          }
        });

        // 创建 Stream 结果
        socket.on('stream:create:result', (data) => {
          if (callbacks.onStreamCreated) {
            callbacks.onStreamCreated(data);
          }
        });

        // 加入 Stream 结果
        socket.on('stream:join:result', (data) => {
          if (data.success) {
            currentStreamId = data.streamId;
          }
          if (callbacks.onStreamJoined) {
            callbacks.onStreamJoined(data);
          }
        });

        // 离开 Stream 结果
        socket.on('stream:leave:result', (data) => {
          if (data.success) {
            currentStreamId = null;
          }
          if (callbacks.onStreamLeft) {
            callbacks.onStreamLeft(data);
          }
        });

        // 接收日志广播
        socket.on('log:broadcast', (data) => {
          if (callbacks.onLogReceived) {
            callbacks.onLogReceived(data);
          }
        });

        // 节点列表更新
        socket.on('node:list', (data) => {
          if (callbacks.onNodeListUpdated) {
            callbacks.onNodeListUpdated(data.nodes);
          }
        });

        // Stream 列表（调试用）
        socket.on('stream:list:result', (data) => {
          console.log('[SOCKET] Available streams:', data.streams);
        });

      } catch (error) {
        console.error('[SOCKET] Init error:', error);
        reject(error);
      }
    });
  }

  /**
   * 断开连接
   */
  function disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
      nodeId = null;
      currentStreamId = null;
    }
  }

  /**
   * 检查是否已连接
   */
  function isConnected() {
    return socket && socket.connected;
  }

  /**
   * 创建 Stream
   * @param {string} streamName - Stream 名称
   * @param {string} passwordHash - 密码哈希
   */
  function createStream(streamName, passwordHash) {
    if (!isConnected()) {
      if (callbacks.onError) {
        callbacks.onError('Not connected to server');
      }
      return;
    }

    socket.emit('stream:create', {
      streamName,
      passwordHash
    });
  }

  /**
   * 加入 Stream
   * @param {string} streamId - Stream ID
   * @param {string} passwordHash - 密码哈希
   */
  function joinStream(streamId, passwordHash) {
    if (!isConnected()) {
      if (callbacks.onError) {
        callbacks.onError('Not connected to server');
      }
      return;
    }

    socket.emit('stream:join', {
      streamId,
      passwordHash
    });
  }

  /**
   * 离开当前 Stream
   */
  function leaveStream() {
    if (!isConnected()) {
      return;
    }

    socket.emit('stream:leave');
  }

  /**
   * 推送日志消息
   * @param {string} payload - 加密后的消息内容
   * @param {string} level - 日志级别
   */
  function pushLog(payload, level = 'INFO') {
    if (!isConnected()) {
      if (callbacks.onError) {
        callbacks.onError('Not connected to server');
      }
      return;
    }

    if (!currentStreamId) {
      if (callbacks.onError) {
        callbacks.onError('Not joined to any stream');
      }
      return;
    }

    socket.emit('log:push', {
      payload,
      level
    });
  }

  /**
   * 获取 Stream 列表（调试用）
   */
  function listStreams() {
    if (isConnected()) {
      socket.emit('stream:list');
    }
  }

  /**
   * 设置事件回调
   * @param {string} event - 事件名
   * @param {Function} callback - 回调函数
   */
  function on(event, callback) {
    if (callbacks.hasOwnProperty(event)) {
      callbacks[event] = callback;
    }
  }

  /**
   * 获取当前节点 ID
   */
  function getNodeId() {
    return nodeId;
  }

  /**
   * 获取当前 Stream ID
   */
  function getCurrentStreamId() {
    return currentStreamId;
  }

  /**
   * 获取服务器地址
   */
  function getServerUrl() {
    return serverUrl;
  }

  // 导出 API
  return {
    connect,
    disconnect,
    isConnected,
    createStream,
    joinStream,
    leaveStream,
    pushLog,
    listStreams,
    on,
    getNodeId,
    getCurrentStreamId,
    getServerUrl
  };
})();

// 如果在 Node.js 环境中（用于测试）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LogSocket;
}
