import fs from 'fs';
import path from 'path';
import cp from 'child_process';
import chalk from 'chalk';

export interface ImagePayload {
  path: string;
  base64: string;
  mimeType: string;
  size: number;
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.svg']);

export function isImageFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

export function getImageMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.bmp':
      return 'image/bmp';
    case '.svg':
      return 'image/svg+xml';
    default:
      return 'image/png';
  }
}

/**
 * Read an image file from disk and return base64 payload.
 */
export function loadImagePayload(filePath: string): ImagePayload | null {
  try {
    const resolved = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolved)) return null;

    const stat = fs.statSync(resolved);
    if (!stat.isFile()) return null;

    if (!isImageFile(resolved)) return null;

    // Limit image size to 15MB for API safety
    if (stat.size > 15 * 1024 * 1024) {
      console.log(chalk.yellow(`\n⚠️ Image "${filePath}" is larger than 15MB. Skipping.\n`));
      return null;
    }

    const buffer = fs.readFileSync(resolved);
    const base64 = buffer.toString('base64');
    const mimeType = getImageMimeType(resolved);

    return {
      path: resolved,
      base64,
      mimeType,
      size: stat.size,
    };
  } catch {
    return null;
  }
}

/**
 * Capture an image directly from the system clipboard across Windows, macOS, and Linux.
 * Returns the saved PNG file path, or null if no image was found in clipboard.
 */
export function captureClipboardImage(customOutDir?: string): string | null {
  const outDir = customOutDir || path.resolve(process.cwd(), '.banglacli', 'screenshots');
  try {
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }
  } catch {}

  const filename = `screenshot_${Date.now()}.png`;
  const outPath = path.resolve(outDir, filename);

  if (process.platform === 'win32') {
    // Windows PowerShell clipboard extraction
    const psScript = [
      'Add-Type -AssemblyName System.Windows.Forms',
      'Add-Type -AssemblyName System.Drawing',
      'if ([System.Windows.Forms.Clipboard]::ContainsImage()) {',
      '    $img = [System.Windows.Forms.Clipboard]::GetImage()',
      `    $img.Save('${outPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)`,
      '    Write-Output "OK_IMAGE"',
      '} elseif ([System.Windows.Forms.Clipboard]::ContainsFileDropList()) {',
      '    $files = [System.Windows.Forms.Clipboard]::GetFileDropList()',
      '    foreach ($f in $files) {',
      '        $ext = [System.IO.Path]::GetExtension($f).ToLower()',
      "        if ($ext -in @('.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif')) {",
      `            Copy-Item -Path $f -Destination '${outPath.replace(/'/g, "''")}'`,
      '            Write-Output "OK_FILE"',
      '            break',
      '        }',
      '    }',
      '} else {',
      '    Write-Output "NO_IMAGE"',
      '}',
    ].join('\r\n');

    try {
      const res = cp
        .execSync('powershell -NoProfile -NonInteractive -Command -', {
          input: psScript,
          encoding: 'utf8',
          timeout: 5000,
          windowsHide: true,
        })
        .trim();

      if ((res.includes('OK_IMAGE') || res.includes('OK_FILE')) && fs.existsSync(outPath)) {
        return outPath;
      }
    } catch {
      return null;
    }
  } else if (process.platform === 'darwin') {
    // macOS: try pngpaste first, then AppleScript
    try {
      cp.execSync(`pngpaste "${outPath}"`, { stdio: 'ignore', timeout: 3000 });
      if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) return outPath;
    } catch {}

    const osascript = `
      set outPath to POSIX file "${outPath}"
      try
        set pngData to the clipboard as «class PNGf»
        set f to open for access outPath with write permission
        write pngData to f
        close access f
        return "OK"
      on error
        return "NO"
      end try
    `;
    try {
      const res = cp.execSync(`osascript -e '${osascript.replace(/'/g, "'\\''")}'`, {
        encoding: 'utf8',
        timeout: 4000,
      });
      if (res.includes('OK') && fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
        return outPath;
      }
    } catch {
      return null;
    }
  } else {
    // Linux: try xclip or wl-paste
    try {
      cp.execSync(`xclip -selection clipboard -t image/png -o > "${outPath}"`, {
        shell: '/bin/bash',
        stdio: 'ignore',
        timeout: 3000,
      });
      if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) return outPath;
    } catch {}

    try {
      cp.execSync(`wl-paste -t image/png > "${outPath}"`, {
        shell: '/bin/bash',
        stdio: 'ignore',
        timeout: 3000,
      });
      if (fs.existsSync(outPath) && fs.statSync(outPath).size > 0) return outPath;
    } catch {
      return null;
    }
  }

  return null;
}
