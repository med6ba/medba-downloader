const express = require('express');
const { spawn } = require('child_process');

const router = express.Router();
const MAX_URL_LENGTH = 2048;
const YTDLP_TIMEOUT_MS = parsePositiveInt(process.env.YTDLP_TIMEOUT_MS, 120 * 1000);

router.post('/', async (req, res, next) => {
  try {
    const { url } = req.body || {};
    const normalizedUrl = normalizeInput(url);

    if (!isValidYouTubeUrl(normalizedUrl)) {
      return res.status(400).json({ error: 'Please enter a valid YouTube link.' });
    }

    const { stdout } = await runYtDlp(['-J', '--no-playlist', '--no-warnings', normalizedUrl]);

    let metadata;
    try {
      metadata = JSON.parse(stdout);
    } catch {
      return res.status(500).json({
        error: "We couldn't read this video's details. Please try another link."
      });
    }

    const allFormats = Array.isArray(metadata.formats) ? metadata.formats : [];

    const mp4VideoFormats = allFormats
      .filter(
        (format) =>
          format.ext === 'mp4' &&
          format.vcodec &&
          format.vcodec !== 'none' &&
          format.format_id &&
          Number.isFinite(Number(format.height)) &&
          Number(format.height) > 0
      )
      .sort((a, b) => {
        if ((b.height || 0) !== (a.height || 0)) {
          return (b.height || 0) - (a.height || 0);
        }

        const aHasAudio = a.acodec && a.acodec !== 'none' ? 1 : 0;
        const bHasAudio = b.acodec && b.acodec !== 'none' ? 1 : 0;

        if (bHasAudio !== aHasAudio) {
          return bHasAudio - aHasAudio;
        }

        if ((b.tbr || 0) !== (a.tbr || 0)) {
          return (b.tbr || 0) - (a.tbr || 0);
        }

        return (b.filesize || b.filesize_approx || 0) - (a.filesize || a.filesize_approx || 0);
      });

    if (mp4VideoFormats.length === 0) {
      return res.status(404).json({
        error: 'No downloadable qualities were found for this video.'
      });
    }

    const seenHeights = new Set();
    const qualityFormats = [];

    for (const format of mp4VideoFormats) {
      const height = Number(format.height);

      if (seenHeights.has(height)) {
        continue;
      }

      seenHeights.add(height);
      const hasAudio = Boolean(format.acodec && format.acodec !== 'none');
      qualityFormats.push({
        formatId: format.format_id,
        quality: `${height}p`,
        hasAudio
      });

      if (qualityFormats.length >= 12) {
        break;
      }
    }

    if (qualityFormats.length === 0) {
      return res.status(404).json({
        error: 'No downloadable qualities were found for this video.'
      });
    }

    const channelName = getChannelName(metadata);

    return res.json({
      title: metadata.title || 'YouTube Video',
      duration: normalizeDuration(metadata.duration),
      thumbnail: getBestVideoThumbnail(metadata),
      channel: {
        name: channelName
      },
      formats: qualityFormats
    });
  } catch (error) {
    return next(error);
  }
});

function getBestVideoThumbnail(metadata) {
  const thumbnails = Array.isArray(metadata?.thumbnails) ? metadata.thumbnails : [];
  const bestFromList = thumbnails
    .map((thumbnail) => {
      const normalizedUrl = normalizeHttpUrl(thumbnail?.url);
      return {
        url: normalizedUrl,
        score: getThumbnailScore(thumbnail)
      };
    })
    .filter((thumbnail) => thumbnail.url)
    .sort((a, b) => b.score - a.score)[0];

  if (bestFromList?.url) {
    return bestFromList.url;
  }

  return normalizeHttpUrl(metadata?.thumbnail);
}

function getChannelName(metadata) {
  const candidates = [
    metadata?.channel,
    metadata?.uploader,
    metadata?.creator,
    metadata?.uploader_id,
    metadata?.channel_id
  ];

  for (const candidate of candidates) {
    const normalized = normalizeInput(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

function normalizeHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }

  const normalizedValue = value.trim().startsWith('//') ? `https:${value.trim()}` : value.trim();

  try {
    const parsed = new URL(normalizedValue);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '';
    }

    return parsed.toString();
  } catch {
    return '';
  }
}

function getThumbnailScore(thumbnail) {
  const width = Number(thumbnail?.width) || 0;
  const height = Number(thumbnail?.height) || 0;
  const preference = Number(thumbnail?.preference) || 0;

  return width * height + preference;
}

function normalizeDuration(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return Math.floor(seconds);
}

function isValidYouTubeUrl(value) {
  if (!value || typeof value !== 'string' || value.length > MAX_URL_LENGTH) {
    return false;
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return false;
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  return ['youtube.com', 'm.youtube.com', 'youtu.be', 'music.youtube.com'].includes(host);
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
