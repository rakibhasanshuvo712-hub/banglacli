import { listFiles, readFile, writeFile, editFile, webSearch, runCommand, grepSearch, findFiles, safetySession } from '../src/tools.js';
import { detectProjectContext } from '../src/detector.js';
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

  // 2. Test editFile (surgical in-place replacement)
  const editRes = await editFile(testFilePath, 'Hello BanglaCLI', 'Hello World');
  console.log('editFile result:', editRes);
  const updatedContent = await readFile(testFilePath);
  if (!updatedContent.includes('Hello World from test!')) {
    throw new Error('editFile failed to replace target text');
  }

  // 3. Test readFile
  const readRes = await readFile(testFilePath);
  console.log('readFile result:', readRes);
  if (!readRes.includes('Hello World from test!')) {
    throw new Error('readFile content mismatch');
  }

  // 4. Test listFiles
  const listRes = await listFiles('.');
  console.log('listFiles contains temp-test:', listRes.includes('temp-test/hello.txt'));
  if (!listRes.includes('temp-test/hello.txt')) {
    throw new Error('listFiles missing newly written file');
  }
  if (listRes.includes('node_modules/')) {
    throw new Error('listFiles should ignore node_modules');
  }

  // 5. Test grepSearch
  const grepRes = await grepSearch('Hello World', 'temp-test/*');
  console.log('grepSearch result:', grepRes);
  if (!grepRes.includes('Hello World from test!')) {
    throw new Error('grepSearch failed to find text in test file');
  }

  // 6. Test findFiles
  const findRes = await findFiles('*.txt');
  console.log('findFiles result:', findRes);
  if (!findRes.includes('hello.txt')) {
    throw new Error('findFiles failed to locate hello.txt');
  }

  // 7. Test detectProjectContext
  const ctx = detectProjectContext();
  console.log('detectProjectContext summary:', ctx.summary);
  if (!ctx.packageManager || !ctx.language) {
    throw new Error('detectProjectContext missing core properties');
  }

  // 8. Test runCommand
  const cmdRes = await runCommand('node -e "console.log(12345);"');
  console.log('runCommand result:', cmdRes);
  if (!cmdRes.includes('12345')) {
    throw new Error('runCommand output mismatch');
  }

  // 9. Test sequential one-by-one command execution
  const seqRes = await runCommand('node -e "console.log(\'step1\');" && node -e "console.log(\'step2\');"');
  console.log('sequential command result:', seqRes);
  if (!seqRes.includes('step1') || !seqRes.includes('step2')) {
    throw new Error('sequential execution failed');
  }

  // 10. Test executeTool in PLAN mode (should block edit_file and write_file)
  const { executeTool } = await import('../src/tools.js');
  const planBlockRes = await executeTool('write_file', { filePath: 'temp-test/block.txt', content: 'test' }, 'plan');
  console.log('planMode block result:', planBlockRes);
  if (!planBlockRes.includes('PLAN MODE')) {
    throw new Error('executeTool in PLAN mode did not block write_file');
  }
  const planEditBlockRes = await executeTool('edit_file', { filePath: testFilePath, target: 'a', replacement: 'b' }, 'plan');
  if (!planEditBlockRes.includes('PLAN MODE')) {
    throw new Error('executeTool in PLAN mode did not block edit_file');
  }

  // Clean up
  fs.rmSync('temp-test', { recursive: true, force: true });
  console.log('All tool tests passed successfully! ✅');
}

testAll().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
