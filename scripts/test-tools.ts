import { listFiles, readFile, writeFile, runCommand, safetySession } from '../src/tools.js';
import fs from 'node:fs';
import path from 'node:path';

async function testAll() {
  console.log('Testing tools...');

  // Enable auto approve for test
  safetySession.autoApproveAll = true;

  // 1. Test writeFile
  const testFilePath = 'temp-test/hello.txt';
  const writeRes = await writeFile(testFilePath, 'Hello BanglaCLI from test!');
  console.log('writeFile result:', writeRes);
  if (!fs.existsSync(testFilePath)) {
    throw new Error('writeFile failed to create file');
  }

  // 2. Test readFile
  const readRes = await readFile(testFilePath);
  console.log('readFile result:', readRes);
  if (!readRes.includes('Hello BanglaCLI from test!')) {
    throw new Error('readFile content mismatch');
  }

  // 3. Test listFiles
  const listRes = await listFiles('.');
  console.log('listFiles contains temp-test:', listRes.includes('temp-test/hello.txt'));
  if (!listRes.includes('temp-test/hello.txt')) {
    throw new Error('listFiles missing newly written file');
  }
  if (listRes.includes('node_modules/')) {
    throw new Error('listFiles should ignore node_modules');
  }

  // 4. Test runCommand
  const cmdRes = await runCommand('node -e "console.log(12345);"');
  console.log('runCommand result:', cmdRes);
  if (!cmdRes.includes('12345')) {
    throw new Error('runCommand output mismatch');
  }

  // 5. Test executeTool in PLAN mode (should block write_file)
  const { executeTool } = await import('../src/tools.js');
  const planBlockRes = await executeTool('write_file', { filePath: 'temp-test/block.txt', content: 'test' }, 'plan');
  console.log('planMode block result:', planBlockRes);
  if (!planBlockRes.includes('PLAN MODE')) {
    throw new Error('executeTool in PLAN mode did not block write_file');
  }

  // Clean up
  fs.rmSync('temp-test', { recursive: true, force: true });
  console.log('All tool tests passed successfully! ✅');
}

testAll().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
