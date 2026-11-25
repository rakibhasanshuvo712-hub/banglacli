import stringWidth from 'string-width';
import chalk from 'chalk';
import {
  renderTopBorder,
  renderBottomBorder,
  renderContentLine,
  renderHintLine,
} from '../src/prompt.js';

console.log('Testing Prompt Box border alignment and closure across multiple screen sizes...\n');

const testWidths = [50, 60, 72, 80, 84, 96, 120];
const testModels = [
  'gemini-3.5-flash-lite',
  'openrouter/free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen-2.5-coder-32b',
];
const testModes: Array<'build' | 'plan'> = ['build', 'plan'];

let totalTests = 0;
let passedTests = 0;

for (const width of testWidths) {
  for (const model of testModels) {
    for (const mode of testModes) {
      totalTests++;
      const isBuild = mode === 'build';
      const borderColor = isBuild ? chalk.hex('#00FF7F') : chalk.hex('#FFB300');

      const top = renderTopBorder(width, isBuild, model, borderColor);
      const contentEmpty = renderContentLine(width, '', true, isBuild, borderColor);
      const contentTyping = renderContentLine(width, 'Create a simple Python calculator', true, isBuild, borderColor);
      const contentLong = renderContentLine(width, 'A very long prompt that exceeds normal width by containing lots of words and arguments to test truncation', true, isBuild, borderColor);
      const hint = renderHintLine(width, '· Shift+Enter: newline • /help for commands • ↑/↓: history', borderColor);
      const bottom = renderBottomBorder(width, borderColor);

      const topW = stringWidth(top);
      const contentEmptyW = stringWidth(contentEmpty);
      const contentTypingW = stringWidth(contentTyping);
      const contentLongW = stringWidth(contentLong);
      const hintW = stringWidth(hint);
      const bottomW = stringWidth(bottom);

      if (
        topW === width &&
        contentEmptyW === width &&
        contentTypingW === width &&
        contentLongW === width &&
        hintW === width &&
        bottomW === width
      ) {
        passedTests++;
      } else {
        console.error(
          `FAIL at width ${width}, model ${model}, mode ${mode}: ` +
          `top=${topW}, empty=${contentEmptyW}, typing=${contentTypingW}, long=${contentLongW}, hint=${hintW}, bottom=${bottomW}`
        );
        process.exit(1);
      }
    }
  }
}

console.log(`✔ All ${passedTests}/${totalTests} box width and closure tests PASSED!`);
console.log('\nSample rendered box output (width 74):');
const sampleBorderColor = chalk.hex('#00FF7F');
console.log(renderTopBorder(74, true, 'gemini-3.5-flash-lite', sampleBorderColor));
console.log(renderContentLine(74, 'Create a simple Python calculator in this folder', true, true, sampleBorderColor));
console.log(renderHintLine(74, '· Shift+Enter: newline • /help for commands • ↑/↓: history', sampleBorderColor));
console.log(renderBottomBorder(74, sampleBorderColor));
console.log('\nSample rendered box output (width 60, PLAN mode):');
const planBorderColor = chalk.hex('#FFB300');
console.log(renderTopBorder(60, false, 'qwen-2.5-coder-32b', planBorderColor));
console.log(renderContentLine(60, 'Review system architecture', true, false, planBorderColor));
console.log(renderHintLine(60, '· Shift+Enter: newline • /help', planBorderColor));
console.log(renderBottomBorder(60, planBorderColor));
