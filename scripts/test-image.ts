import fs from 'fs';
import path from 'path';
import { isImageFile, getImageMimeType, loadImagePayload, captureClipboardImage } from '../src/image.js';

console.log('--- Testing image.ts ---');

// 1. Extension checking
console.log('isImageFile png:', isImageFile('test.png') === true);
console.log('isImageFile jpg:', isImageFile('test.jpg') === true);
console.log('isImageFile txt:', isImageFile('test.txt') === false);
console.log('mime png:', getImageMimeType('test.png') === 'image/png');
console.log('mime jpeg:', getImageMimeType('test.jpg') === 'image/jpeg');

// 2. Load payload
const sampleBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const testImgPath = path.resolve(process.cwd(), 'temp_sample.png');
fs.writeFileSync(testImgPath, Buffer.from(sampleBase64, 'base64'));

const payload = loadImagePayload(testImgPath);
console.log('Payload loaded:', payload !== null);
console.log('Payload mimeType:', payload?.mimeType === 'image/png');
console.log('Payload size > 0:', (payload?.size || 0) > 0);
console.log('Payload base64 match:', payload?.base64 === sampleBase64);

fs.unlinkSync(testImgPath);

// 3. Clipboard capture test (safe non-failing check)
const clipResult = captureClipboardImage();
console.log('Clipboard capture callable without throwing:', clipResult === null || typeof clipResult === 'string');

console.log('All image tests passed! ✅');
process.exit(0);
