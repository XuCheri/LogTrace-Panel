/**
 * LogTrace Panel - Relay Server
 *
 * 职责：
 * - 管理 Stream（Channel）的创建与验证
 * - 转发加密消息（不解密）
 * - 维护在线节点列表
 * - 不存储任何消息历史
 */

require('dotenv').config();
const { createServer } = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// 创建 HTTP 服务器
const httpServer = createServer((req, res) => {
  // 健康检查端点
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('LogTrace Relay Server');
});

// 创建 Socket.IO 服务器
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(','),
    methods: ['GET', 'POST']
  }
});

/**
 * 内存存储结构
 *
 * streams: Map<streamId, {
 *   id: string,
 *   name: string,
 *   passwordHash: string,
 *   createdAt: number,
 *   nodes: Set<socketId>
 * }>
 *
 * nodeMap: Map<socketId, {
 *   nodeId: string,
 *   streamId: string | null
 * }>
 */
const streams = new Map();
const nodeMap = new Map();

/**
 * 生成随机节点 ID
 */
function generateNodeId() {
  return 'node-' + uuidv4().slice(0, 8);
}

/**
 * 获取 Stream 中的在线节点列表
 */
function getStreamNodes(streamId) {
  const stream = streams.get(streamId);
  if (!stream) return [];

  const nodes = [];
  for (const socketId of stream.nodes) {
    const nodeInfo = nodeMap.get(socketId);
    if (nodeInfo) {
      nodes.push(nodeInfo.nodeId);
    }
  }
  return nodes;
}

/**
 * 广播节点列表更新
 */
function broadcastNodeList(streamId) {
  const nodes = getStreamNodes(streamId);
  io.to(streamId).emit('node:list', { streamId, nodes });
}

// Socket.IO 连接处理
io.on('connection', (socket) => {
  const nodeId = generateNodeId();
  nodeMap.set(socket.id, { nodeId, streamId: null });

  console.log(`[CONNECT] ${nodeId} connected (socket: ${socket.id})`);

  // 发送节点 ID 给客户端
  socket.emit('node:assigned', { nodeId });

  /**
   * 创建 Stream
   * @param {Object} data - { streamName: string, passwordHash: string }
   */
  socket.on('stream:create', (data) => {
    const { streamName, passwordHash } = data;

    if (!streamName || !passwordHash) {
      socket.emit('stream:create:result', {
        success: false,
        error: 'Missing required parameters'
      });
      return;
    }

    const streamId = uuidv4();

    streams.set(streamId, {
      id: streamId,
      name: streamName,
      passwordHash,
      createdAt: Date.now(),
      nodes: new Set()
    });

    console.log(`[STREAM:CREATE] ${streamId} created by ${nodeId}`);

    socket.emit('stream:create:result', {
      success: true,
      streamId,
      streamName
    });
  });

  /**
   * 加入 Stream
   * @param {Object} data - { streamId: string, passwordHash: string }
   */
  socket.on('stream:join', (data) => {
    const { streamId, passwordHash } = data;

    const stream = streams.get(streamId);

    if (!stream) {
      socket.emit('stream:join:result', {
        success: false,
        error: 'Stream not found'
      });
      return;
    }

    // 验证密码哈希
    if (stream.passwordHash !== passwordHash) {
      socket.emit('stream:join:result', {
        success: false,
        error: 'Invalid access key'
      });
      return;
    }

    // 离开之前的 Stream
    const currentNode = nodeMap.get(socket.id);
    if (currentNode && currentNode.streamId) {
      const oldStream = streams.get(currentNode.streamId);
      if (oldStream) {
        oldStream.nodes.delete(socket.id);
        socket.leave(currentNode.streamId);
        broadcastNodeList(currentNode.streamId);
      }
    }

    // 加入新 Stream
    stream.nodes.add(socket.id);
    socket.join(streamId);
    nodeMap.set(socket.id, { nodeId, streamId });

    console.log(`[STREAM:JOIN] ${nodeId} joined ${streamId}`);

    socket.emit('stream:join:result', {
      success: true,
      streamId,
      streamName: stream.name
    });

    // 广播更新的节点列表
    broadcastNodeList(streamId);
  });

  /**
   * 离开 Stream
   */
  socket.on('stream:leave', () => {
    const currentNode = nodeMap.get(socket.id);

    if (currentNode && currentNode.streamId) {
      const stream = streams.get(currentNode.streamId);
      if (stream) {
        stream.nodes.delete(socket.id);
        socket.leave(currentNode.streamId);

        console.log(`[STREAM:LEAVE] ${nodeId} left ${currentNode.streamId}`);

        // 广播更新的节点列表
        broadcastNodeList(currentNode.streamId);

        // 如果 Stream 没有节点了，可选择删除（当前保留）
        // if (stream.nodes.size === 0) {
        //   streams.delete(currentNode.streamId);
        // }
      }

      nodeMap.set(socket.id, { nodeId, streamId: null });
    }

    socket.emit('stream:leave:result', { success: true });
  });

  /**
   * 推送日志（加密消息）
   * @param {Object} data - { payload: string, level?: string }
   */
  socket.on('log:push', (data) => {
    const currentNode = nodeMap.get(socket.id);

    if (!currentNode || !currentNode.streamId) {
      socket.emit('log:push:result', {
        success: false,
        error: 'Not connected to any stream'
      });
      return;
    }

    const { payload, level = 'INFO' } = data;

    if (!payload) {
      socket.emit('log:push:result', {
        success: false,
        error: 'Empty payload'
      });
      return;
    }

    const message = {
      streamId: currentNode.streamId,
      nodeId: currentNode.nodeId,
      payload,
      level,
      timestamp: Date.now()
    };

    // 广播给 Stream 中的所有节点（包括发送者）
    io.to(currentNode.streamId).emit('log:broadcast', message);

    socket.emit('log:push:result', { success: true });
  });

  /**
   * 获取 Stream 列表（用于调试，生产环境可移除）
   */
  socket.on('stream:list', () => {
    const list = [];
    for (const [id, stream] of streams) {
      list.push({
        id,
        name: stream.name,
        nodeCount: stream.nodes.size,
        createdAt: stream.createdAt
      });
    }
    socket.emit('stream:list:result', { streams: list });
  });

  /**
   * 断开连接处理
   */
  socket.on('disconnect', () => {
    const currentNode = nodeMap.get(socket.id);

    if (currentNode) {
      if (currentNode.streamId) {
        const stream = streams.get(currentNode.streamId);
        if (stream) {
          stream.nodes.delete(socket.id);
          broadcastNodeList(currentNode.streamId);
        }
      }
      nodeMap.delete(socket.id);
    }

    console.log(`[DISCONNECT] ${nodeId} disconnected`);
  });
});

// 启动服务器
httpServer.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║       LogTrace Relay Server Started        ║
╠════════════════════════════════════════════╣
║  Port: ${PORT.toString().padEnd(36)}║
║  CORS: ${CORS_ORIGIN.slice(0, 36).padEnd(36)}║
║  Mode: ${(process.env.NODE_ENV || 'development').padEnd(36)}║
╚════════════════════════════════════════════╝
  `);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('[SERVER] Shutting down...');
  io.close(() => {
    console.log('[SERVER] Closed');
    process.exit(0);
  });
});
