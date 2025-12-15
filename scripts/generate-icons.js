/**
 * 简单的 PNG 图标生成器
 * 使用 Node.js 的 fs 模块创建最小有效的 PNG 图标
 *
 * 运行: node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');

// 最小的有效 PNG (1x1 灰色像素)
const MINIMAL_PNG = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
  0x00, 0x00, 0x00, 0x0D, // IHDR length
  0x49, 0x48, 0x44, 0x52, // IHDR type
  0x00, 0x00, 0x00, 0x01, // width: 1
  0x00, 0x00, 0x00, 0x01, // height: 1
  0x08, 0x02, // bit depth: 8, color type: 2 (RGB)
  0x00, 0x00, 0x00, // compression, filter, interlace
  0x90, 0x77, 0x53, 0xDE, // IHDR CRC
  0x00, 0x00, 0x00, 0x0C, // IDAT length
  0x49, 0x44, 0x41, 0x54, // IDAT type
  0x08, 0xD7, 0x63, 0x60, 0x60, 0x60, 0x00, 0x00, 0x00, 0x04, 0x00, 0x01, // compressed data
  0x27, 0x34, 0x60, 0x14, // IDAT CRC (approximate)
  0x00, 0x00, 0x00, 0x00, // IEND length
  0x49, 0x45, 0x4E, 0x44, // IEND type
  0xAE, 0x42, 0x60, 0x82  // IEND CRC
]);

// 简单的蓝绿色 16x16 PNG (预生成的 base64)
const ICON_16_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAW0lEQVQ4y2NgGLTg////DLgk/qOp+48uh88APjaRAsah4ABigyE5BqADXAaQYgAugygxABcgOQZgi9r/ROgd1AYMmgBEMQBbqP8nMwYGVQzAdqX8p14aGhIAANGjJNXs3Q4YAAAAAElFTkSuQmCC';

// 简单的蓝绿色 48x48 PNG (预生成的 base64)
const ICON_48_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAAh0lEQVRoge3QMQ6AMAwF0O+I3v9OdGBgYmJgQRbCUlWJ42A7+ZOlSJEiRYoUKVJkd0n2U/JnMrLuZ3L4DEzy+hly/ADyqO/5T/L4AL7Jez6ABvmg7/kAGuSDvucDaJC3eg/ySd/7M2CQT/veP4NB/jdlAFj/iQMgGgAAAAAAAAAAQJJJkuQNd6YLGtXxCX4AAAAASUVORK5CYII=';

// 简单的蓝绿色 128x128 PNG (预生成的 base64)
const ICON_128_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAAnklEQVR4nO3BMQEAAADCoPVP7WsIoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAeANVZAABmPF4sAAAAABJRU5ErkJggg==';

const iconsDir = path.join(__dirname, '..', 'extension', 'icons');

// 确保目录存在
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// 写入图标文件
function writeIcon(filename, base64) {
  const filepath = path.join(iconsDir, filename);
  const buffer = Buffer.from(base64, 'base64');
  fs.writeFileSync(filepath, buffer);
  console.log(`Created: ${filepath}`);
}

writeIcon('icon16.png', ICON_16_BASE64);
writeIcon('icon48.png', ICON_48_BASE64);
writeIcon('icon128.png', ICON_128_BASE64);

console.log('\nIcons generated successfully!');
console.log('You can also open extension/icons/generate-icons.html in a browser for custom icons.');
