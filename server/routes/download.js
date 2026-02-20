const express = require('express');
const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const { spawn } = require('child_process');

const router = express.Router();
const tmpDir = path.resolve(__dirname, '..', 'tmp');
const MAX_URL_LENGTH = 2048;
const MAX_FORMAT_ID_LENGTH = 64;
const MAX_TITLE_LENGTH = 180;
const REMOTE_FETCH_TIMEOUT_MS = parsePositiveInt(process.env.REMOTE_FETCH_TIMEOUT_MS, 15 * 1000);
const YTDLP_TIMEOUT_MS = parsePositiveInt(process.env.YTDLP_TIMEOUT_MS, 120 * 1000);

if (!fs.existsSync(tmpDir)) {
  fs.mkdirSync(tmpDir, { recursive: true });
}

router.get('/video', async (req, res, next) => {
  try {
    const { url, formatId, hasAudio, title } = req.query;
    const normalizedUrl = normalizeInput(url);
    const normalizedTitle = normalizeInput(title).slice(0, MAX_TITLE_LENGTH);

    if (!isValidYouTubeUrl(normalizedUrl)) {
      return res.status(400).json({ error: 'Please enter a valid YouTube link.' });
    }

    if (!isSafeFormatId(formatId)) {
      return res.status(400).json({ error: 'This quality is not available. Please choose another one.' });
    }

    const outputPath = path.join(
      tmpDir,
      `video-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.mp4`
    );

    const shouldUseDirectFormat = String(hasAudio).toLowerCase() === 'true';
    const formatSelector = shouldUseDirectFormat
      ? `${formatId}/best[ext=mp4]/best`
      : `${formatId}+bestaudio[ext=m4a]/${formatId}+bestaudio/${formatId}/best[ext=mp4]/best`;
    const baseName = await resolveTitleForFileName({
      url: normalizedUrl,
      requestedTitle: normalizedTitle,
      fallback: 'video'
    });

    await runYtDlp([
      '--no-playlist',
      '--concurrent-fragments',
      '4',
      '-f',
      formatSelector,
      '--merge-output-format',
      'mp4',
      '-o',
      outputPath,
      normalizedUrl
    ]);

    return streamFileWithCleanup({
      res,
      filePath: outputPath,
      contentType: 'video/mp4',
      downloadName: `${baseName}.mp4`
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/mp3', async (req, res, next) => {
  try {
    const { url, title } = req.query;
    const normalizedUrl = normalizeInput(url);
    const normalizedTitle = normalizeInput(title).slice(0, MAX_TITLE_LENGTH);

    if (!isValidYouTubeUrl(normalizedUrl)) {
      return res.status(400).json({ error: 'Please enter a valid YouTube link.' });
    }

    const outputPath = path.join(
      tmpDir,
      `audio-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.mp3`
    );
    const baseName = await resolveTitleForFileName({
      url: normalizedUrl,
      requestedTitle: normalizedTitle,
      fallback: 'audio'
    });

    await runYtDlp([
      '--no-playlist',
      '--concurrent-fragments',
      '4',
      '-x',
      '--audio-format',
      'mp3',
      '--audio-quality',
      '0',
      '-o',
      outputPath,
      normalizedUrl
    ]);

    return streamFileWithCleanup({
      res,
      filePath: outputPath,
      contentType: 'audio/mpeg',
      downloadName: `${baseName}.mp3`
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/thumbnail', async (req, res, next) => {
  try {
    const { url, title } = req.query;
    const normalizedUrl = normalizeInput(url);
    const normalizedTitle = normalizeInput(title).slice(0, MAX_TITLE_LENGTH);

    if (!isValidYouTubeUrl(normalizedUrl)) {
      return res.status(400).json({ error: 'Please enter a valid YouTube link.' });
    }

    const baseName = await resolveTitleForFileName({
      url: normalizedUrl,
      requestedTitle: normalizedTitle,
      fallback: 'thumbnail'
    });
    const thumbnail = await getBestThumbnailInfo(normalizedUrl);

    if (!thumbnail?.url || !isHttpUrl(thumbnail.url)) {
      return res.status(404).json({ error: 'Could not get the thumbnail for this video.' });
    }

    const remoteResponse = await fetchWithTimeout(thumbnail.url, REMOTE_FETCH_TIMEOUT_MS);
    if (!remoteResponse.ok || !remoteResponse.body) {
      return res.status(404).json({ error: 'Could not get the thumbnail for this video.' });
    }

    const contentType =
      remoteResponse.headers.get('content-type') ||
      contentTypeFromExtension(thumbnail.ext) ||
      'image/jpeg';
    const extension =
      extensionFromContentType(contentType) ||
      sanitizeFileExtension(thumbnail.ext) ||
      'jpg';
    const fileName = `${baseName}.${extension}`;

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', buildContentDisposition(fileName));
    res.setHeader('Cache-Control', 'no-store');

    const contentLength = remoteResponse.headers.get('content-length');
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    const stream = Readable.fromWeb(remoteResponse.body);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Could not get the thumbnail for this video.' });
      } else {
        res.destroy();
      }
    });

    return stream.pipe(res);
  } catch (error) {
    return next(error);
  }
});

function isSafeFormatId(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_FORMAT_ID_LENGTH &&
    /^[a-zA-Z0-9+_.\-/]+$/.test(value)
  );
}

function isValidYouTubeUrl(value) {
  if (!value || typeof value !== 'string' || value.length > MAX_URL_LENGTH) {
    return false;
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(value);
  } catch {
    return false;
  }

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return false;
  }

  const host = parsedUrl.hostname.replace(/^www\./, '').toLowerCase();

  return ['youtube.com', 'm.youtube.com', 'youtu.be', 'music.youtube.com'].includes(host);
}

async function getBestThumbnailInfo(url) {
  const { stdout } = await runYtDlp(['-J', '--no-playlist', '--no-warnings', url]);

  let metadata;
  try {
    metadata = JSON.parse(stdout);
  } catch {
    throw withStatus(500, 'Could not get the thumbnail for this video.');
  }

  const thumbnails = Array.isArray(metadata.thumbnails) ? metadata.thumbnails : [];
  const best = thumbnails
    .filter((item) => item && typeof item.url === 'string' && item.url.trim())
    .map((item) => {
      const normalizedUrl = normalizeThumbnailUrl(item.url);
      return {
        url: normalizedUrl,
        ext: sanitizeFileExtension(item.ext) || sanitizeFileExtension(getFileExtensionFromUrl(normalizedUrl)),
        score: getThumbnailScore(item)
      };
    })
    .filter((item) => isHttpUrl(item.url))
    .sort((a, b) => b.score - a.score)[0];

  if (best?.url) {
    return best;
  }

  if (typeof metadata.thumbnail === 'string' && metadata.thumbnail.trim()) {
    const normalizedThumbnail = normalizeThumbnailUrl(metadata.thumbnail);
    if (!isHttpUrl(normalizedThumbnail)) {
      throw withStatus(404, 'Could not get the thumbnail for this video.');
    }

    return {
      url: normalizedThumbnail,
      ext: sanitizeFileExtension(getFileExtensionFromUrl(normalizedThumbnail))
    };
  }

  throw withStatus(404, 'Could not get the thumbnail for this video.');
}

function getThumbnailScore(thumbnail) {
  const width = Number(thumbnail.width) || 0;
  const height = Number(thumbnail.height) || 0;
  const areaScore = width * height;
  const prefScore = Number(thumbnail.preference) || 0;

  return areaScore + prefScore;
}

function normalizeThumbnailUrl(value) {
  const url = String(value || '').trim();
  if (url.startsWith('//')) {
    return `https:${url}`;
  }
  return url;
}

function getFileExtensionFromUrl(value) {
  const normalized = normalizeThumbnailUrl(value);

  try {
    const pathname = new URL(normalized).pathname;
    const ext = pathname.split('.').pop() || '';
    return sanitizeFileExtension(ext);
  } catch {
    return '';
  }
}

function sanitizeFileExtension(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const ext = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!ext) {
    return '';
  }

  if (ext === 'jpeg') {
    return 'jpg';
  }

  return ext.slice(0, 8);
}

function extensionFromContentType(contentType) {
  const normalized = String(contentType || '').toLowerCase();

  if (normalized.includes('image/jpeg')) return 'jpg';
  if (normalized.includes('image/jpg')) return 'jpg';
  if (normalized.includes('image/png')) return 'png';
  if (normalized.includes('image/webp')) return 'webp';
  if (normalized.includes('image/avif')) return 'avif';

  return '';
}

function contentTypeFromExtension(ext) {
  const normalized = sanitizeFileExtension(ext);

  if (normalized === 'jpg') return 'image/jpeg';
  if (normalized === 'png') return 'image/png';
  if (normalized === 'webp') return 'image/webp';
  if (normalized === 'avif') return 'image/avif';

  return '';
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('yt-dlp', args);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, YTDLP_TIMEOUT_MS);

    const complete = ({ error, result }) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeoutId);

      if (error) {
        reject(error);
        return;
      }

      resolve(result);
    };

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      if (error.code === 'ENOENT') {
        return complete({
          error: withStatus(500, 'The download service is temporarily unavailable. Please try again later.')
        });
      }

      return complete({
        error: withStatus(500, 'The download service is temporarily unavailable. Please try again later.')
      });
    });

    child.on('close', (code) => {
      if (timedOut) {
        return complete({
          error: withStatus(504, 'The download service is temporarily unavailable. Please try again later.')
        });
      }

      if (code === 0) {
        return complete({ result: { stdout, stderr } });
      }

      const details = getReadableYtDlpError(stderr || stdout);
      return complete({ error: withStatus(500, details) });
    });
  });
}

function streamFileWithCleanup({ res, filePath, contentType, downloadName }) {
  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats?.isFile()) {
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Could not prepare the file. Please try again.'
        });
      }
      return;
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', buildContentDisposition(downloadName));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Length', stats.size);

    const fileStream = fs.createReadStream(filePath);
    let cleaned = false;

    const cleanup = () => {
      if (cleaned) {
        return;
      }

      cleaned = true;
      fs.unlink(filePath, () => {});
    };

    fileStream.on('error', () => {
      cleanup();

      if (!res.headersSent) {
        res.status(500).json({ error: 'Download was interrupted. Please try again.' });
      } else {
        res.destroy();
      }
    });

    res.on('finish', cleanup);
    res.on('close', cleanup);

    fileStream.pipe(res);
  });
}

async function resolveTitleForFileName({ url, requestedTitle, fallback }) {
  const safeRequestedTitle = sanitizeFileBaseName(requestedTitle);
  if (safeRequestedTitle) {
    return safeRequestedTitle;
  }

  try {
    const fetchedTitle = await fetchVideoTitle(url);
    const safeFetchedTitle = sanitizeFileBaseName(fetchedTitle);
    if (safeFetchedTitle) {
      return safeFetchedTitle;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

async function fetchVideoTitle(url) {
  const { stdout } = await runYtDlp([
    '--no-playlist',
    '--no-warnings',
    '--skip-download',
    '--print',
    '%(title)s',
    url
  ]);

  const firstLine = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  return firstLine || '';
}

function sanitizeFileBaseName(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const cleaned = value
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/[\u007F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.slice(0, 120);
}

function buildContentDisposition(fileName) {
  const safeFileName = sanitizeFileBaseName(fileName) || 'download.file';
  const asciiFallback = safeFileName
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/[;"]/g, '')
    .trim() || 'download.file';
  const encoded = encodeRFC5987Value(safeFileName);

  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

function encodeRFC5987Value(value) {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function getReadableYtDlpError(message) {
  const rawLines = String(message || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const errorLine =
    [...rawLines].reverse().find((line) => /^ERROR:/i.test(line)) ||
    rawLines[rawLines.length - 1] ||
    'This video is unavailable.';

  let cleaned = errorLine.replace(/^ERROR:\s*/i, '');
  cleaned = cleaned.replace(/^\[[^\]]+\]\s*/, '');
  cleaned = cleaned.replace(/^[A-Za-z0-9_-]{6,}:\s*/, '');
  cleaned = cleaned.replace(/^Unable to download [^:]+:\s*/i, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  const normalized = cleaned.toLowerCase();

  if (!normalized) {
    return 'This video is unavailable.';
  }

  if (normalized.includes('video unavailable')) {
    return 'This video is unavailable.';
  }

  if (normalized.includes('private video')) {
    return 'This video is private.';
  }

  if (normalized.includes('age-restricted') || normalized.includes('confirm your age')) {
    return 'This video is age-restricted.';
  }

  if (normalized.includes('not available in your country') || normalized.includes('geo-restricted')) {
    return 'This video is blocked in your region.';
  }

  if (normalized.includes('requested format is not available')) {
    return 'This quality is not available. Please choose another one.';
  }

  if (normalized.includes('too many requests') || normalized.includes('http error 429')) {
    return 'Too many requests right now. Please try again in a few minutes.';
  }

  if (normalized.includes('timed out') || normalized.includes('network') || normalized.includes('connection')) {
    return 'Network issue while contacting YouTube. Please try again.';
  }

  if (normalized.includes('copyright') || normalized.includes('unavailable') || normalized.includes('forbidden')) {
    return 'This video cannot be downloaded.';
  }

  return 'Could not process this video. Please try another link.';
}

function withStatus(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      throw withStatus(504, 'Network issue while contacting YouTube. Please try again.');
    }

    throw withStatus(500, 'Could not get the thumbnail for this video.');
  } finally {
    clearTimeout(timeoutId);
  }
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeInput(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function parsePositiveInt(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.floor(parsed);
}

module.exports = router;
