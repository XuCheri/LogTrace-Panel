/**
 * LogTrace Panel - 加密模块
 *
 * 使用 Web Crypto API 实现端到端加密
 * - AES-GCM 用于消息加密/解密
 * - PBKDF2 用于从密码派生密钥
 * - SHA-256 用于密码哈希（服务端验证）
 */

const LogCrypto = (function () {
  'use strict';

  // 加密参数
  const CONFIG = {
    algorithm: 'AES-GCM',
    keyLength: 256,
    ivLength: 12,        // AES-GCM 推荐 12 字节 IV
    tagLength: 128,      // 认证标签长度
    pbkdf2Iterations: 100000,
    saltLength: 16
  };

  // 固定盐（Demo 阶段，生产环境应每次随机生成）
  const FIXED_SALT = new Uint8Array([
    0x4c, 0x6f, 0x67, 0x54, 0x72, 0x61, 0x63, 0x65,
    0x50, 0x61, 0x6e, 0x65, 0x6c, 0x53, 0x61, 0x6c
  ]); // "LogTracePanelSal"

  /**
   * 将字符串转换为 ArrayBuffer
   */
  function stringToBuffer(str) {
    return new TextEncoder().encode(str);
  }

  /**
   * 将 ArrayBuffer 转换为字符串
   */
  function bufferToString(buffer) {
    return new TextDecoder().decode(buffer);
  }

  /**
   * 将 ArrayBuffer 转换为 Base64
   */
  function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * 将 Base64 转换为 ArrayBuffer
   */
  function base64ToBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * 将 ArrayBuffer 转换为十六进制字符串
   */
  function bufferToHex(buffer) {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * 生成密码的 SHA-256 哈希（用于服务端验证）
   * @param {string} password - 原始密码
   * @returns {Promise<string>} - 十六进制哈希值
   */
  async function hashPassword(password) {
    const data = stringToBuffer(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return bufferToHex(hashBuffer);
  }

  /**
   * 使用 PBKDF2 从密码派生 AES 密钥
   * @param {string} password - 原始密码
   * @returns {Promise<CryptoKey>} - AES-GCM 密钥
   */
  async function deriveKey(password) {
    // 导入密码作为原始密钥
    const passwordKey = await crypto.subtle.importKey(
      'raw',
      stringToBuffer(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    // 使用 PBKDF2 派生 AES 密钥
    const aesKey = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: FIXED_SALT,
        iterations: CONFIG.pbkdf2Iterations,
        hash: 'SHA-256'
      },
      passwordKey,
      {
        name: CONFIG.algorithm,
        length: CONFIG.keyLength
      },
      false,
      ['encrypt', 'decrypt']
    );

    return aesKey;
  }

  /**
   * 加密消息
   * @param {string} plaintext - 明文消息
   * @param {CryptoKey} key - AES 密钥
   * @returns {Promise<string>} - Base64 编码的密文（包含 IV）
   */
  async function encrypt(plaintext, key) {
    // 生成随机 IV
    const iv = crypto.getRandomValues(new Uint8Array(CONFIG.ivLength));

    // 加密
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: CONFIG.algorithm,
        iv: iv,
        tagLength: CONFIG.tagLength
      },
      key,
      stringToBuffer(plaintext)
    );

    // 将 IV 和密文合并
    const combined = new Uint8Array(iv.length + ciphertext.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertext), iv.length);

    // 返回 Base64 编码
    return bufferToBase64(combined.buffer);
  }

  /**
   * 解密消息
   * @param {string} encryptedBase64 - Base64 编码的密文（包含 IV）
   * @param {CryptoKey} key - AES 密钥
   * @returns {Promise<string>} - 明文消息
   */
  async function decrypt(encryptedBase64, key) {
    try {
      // 解码 Base64
      const combined = new Uint8Array(base64ToBuffer(encryptedBase64));

      // 提取 IV 和密文
      const iv = combined.slice(0, CONFIG.ivLength);
      const ciphertext = combined.slice(CONFIG.ivLength);

      // 解密
      const plaintext = await crypto.subtle.decrypt(
        {
          name: CONFIG.algorithm,
          iv: iv,
          tagLength: CONFIG.tagLength
        },
        key,
        ciphertext
      );

      return bufferToString(plaintext);
    } catch (error) {
      console.error('[CRYPTO] Decryption failed:', error);
      return null;
    }
  }

  /**
   * 截断显示的密文（用于 UI 显示）
   * @param {string} encrypted - 加密后的 Base64 字符串
   * @param {number} maxLength - 最大显示长度
   * @returns {string} - 截断后的字符串
   */
  function truncatePayload(encrypted, maxLength = 40) {
    if (encrypted.length <= maxLength) {
      return encrypted;
    }
    return encrypted.slice(0, maxLength) + '...';
  }

  /**
   * 生成随机的日志级别（用于伪装）
   * @returns {string}
   */
  function randomLevel() {
    const levels = ['INFO', 'DEBUG', 'TRACE', 'INFO', 'INFO'];
    return levels[Math.floor(Math.random() * levels.length)];
  }

  // 导出 API
  return {
    hashPassword,
    deriveKey,
    encrypt,
    decrypt,
    truncatePayload,
    randomLevel
  };
})();

// 如果在 Node.js 环境中（用于测试）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LogCrypto;
}
