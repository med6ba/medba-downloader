import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Menu, RefreshCw, Star, X } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const GITHUB_URL = import.meta.env.VITE_GITHUB_URL || 'https://github.com/med6ba/medba-downloader';
const LANGUAGE_STORAGE_KEY = 'ui-language';
const THEME_STORAGE_KEY = 'ui-theme';

const I18N = {
  en: {
    appName: 'Medba Downloader',
    subtitle: 'Paste a YouTube link and download MP4, MP3, or the thumbnail.',
    inputPlaceholder: 'Paste your YouTube URL here',
    loadingQualities: 'Loading...',
    download: 'Download',
    preparing: 'Preparing...',
    preparingDownload: 'Preparing your download. Please wait...',
    downloadStarted: (fileName) => `Download started: ${fileName}`,
    pasteUrlError: 'Please paste a valid YouTube link.',
    couldNotFetchQualities: 'Could not load qualities for this video.',
    downloadFailed: 'Could not start the download.',
    downloadFailedRetry: 'Could not start the download. Please try again.',
    serverUnreachable: 'Cannot reach the server. Please check your connection and try again.',
    unexpectedError: 'Something went wrong. Please try again.',
    fallbackVideoTitle: 'YouTube Video',
    thumbnailTitle: 'Thumbnail',
    mp3Title: 'MP3',
    unknownQuality: 'Unknown quality',
    unknownChannel: 'Unknown channel',
    videoThumbnailAlt: 'Video thumbnail',
    openMenuLabel: 'Open settings',
    closeMenuLabel: 'Close settings',
    menuTitle: 'Settings',
    menuGithubCta: 'Add a star on GitHub',
    menuResetShort: 'Reset page',
    menuLanguageLabel: 'Language',
    menuThemeLabel: 'Theme',
    menuLangEnglishLabel: 'English',
    menuLangArabicLabel: 'Arabic',
    menuThemeDarkShort: 'Dark mode',
    menuThemeLightShort: 'Light mode',
    githubStarLabel: 'Add a star on GitHub',
    resetPageLabel: 'Reset page',
    languageTarget: 'Switch to Arabic',
    themeToDark: 'Dark mode',
    themeToLight: 'Light mode',
    footerCopyright: (year) => `© ${year} Medba Downloader. All rights reserved.`
  },
  ar: {
    appName: 'Medba Downloader',
    subtitle: 'ألصق رابط يوتيوب وحمّل الفيديو بصيغة MP4 أو MP3 أو الصورة المصغرة.',
    inputPlaceholder: 'ألصق رابط يوتيوب هنا',
    loadingQualities: 'جارٍ التحميل...',
    download: 'تحميل',
    preparing: 'جارٍ التجهيز...',
    preparingDownload: 'جارٍ تجهيز التحميل، الرجاء الانتظار...',
    downloadStarted: (fileName) => `بدأ التحميل: ${fileName}`,
    pasteUrlError: 'يرجى لصق رابط يوتيوب صحيح.',
    couldNotFetchQualities: 'تعذر تحميل الجودات لهذا الفيديو.',
    downloadFailed: 'تعذر بدء التحميل.',
    downloadFailedRetry: 'تعذر بدء التحميل. حاول مرة أخرى.',
    serverUnreachable: 'تعذر الاتصال بالخادم. تحقق من الإنترنت ثم حاول مرة أخرى.',
    unexpectedError: 'حدث خطأ. حاول مرة أخرى.',
    fallbackVideoTitle: 'فيديو يوتيوب',
    thumbnailTitle: 'الصورة المصغرة',
    mp3Title: 'MP3',
    unknownQuality: 'جودة غير معروفة',
    unknownChannel: 'قناة غير معروفة',
    videoThumbnailAlt: 'الصورة المصغرة للفيديو',
    openMenuLabel: 'فتح الإعدادات',
    closeMenuLabel: 'إغلاق الإعدادات',
    menuTitle: 'الإعدادات',
    menuGithubCta: 'أضف نجمة على GitHub',
    menuResetShort: 'إعادة ضبط الصفحة',
    menuLanguageLabel: 'اللغة',
    menuThemeLabel: 'المظهر',
    menuLangEnglishLabel: 'الإنجليزية',
    menuLangArabicLabel: 'العربية',
    menuThemeDarkShort: 'الوضع الداكن',
    menuThemeLightShort: 'الوضع الفاتح',
    githubStarLabel: 'أضف نجمة على GitHub',
    resetPageLabel: 'إعادة ضبط الصفحة',
    languageTarget: 'Switch to English',
    themeToDark: 'الوضع الداكن',
    themeToLight: 'الوضع الفاتح',
    footerCopyright: (year) => `© ${year} Medba Downloader. جميع الحقوق محفوظة.`
  }
};

const ARABIC_ERROR_MAP = {
  'Please enter a valid YouTube link.': 'يرجى إدخال رابط يوتيوب صحيح.',
  "We couldn't read this video's details. Please try another link.": 'تعذر قراءة تفاصيل هذا الفيديو. جرّب رابطاً آخر.',
  'No downloadable qualities were found for this video.': 'لا توجد جودات قابلة للتحميل لهذا الفيديو.',
  'This quality is not available. Please choose another one.': 'هذه الجودة غير متاحة. اختر جودة أخرى.',
  'The download service is temporarily unavailable. Please try again later.': 'خدمة التحميل غير متاحة حالياً. حاول لاحقاً.',
  'Could not prepare the file. Please try again.': 'تعذر تجهيز الملف. حاول مرة أخرى.',
  'Download was interrupted. Please try again.': 'انقطع التحميل. حاول مرة أخرى.',
  'This video is unavailable.': 'هذا الفيديو غير متاح.',
  'This video is private.': 'هذا الفيديو خاص.',
  'This video is age-restricted.': 'هذا الفيديو مقيّد بالعمر.',
  'This video is blocked in your region.': 'هذا الفيديو محجوب في منطقتك.',
  'Too many requests right now. Please try again in a few minutes.': 'هناك عدد كبير من الطلبات الآن. حاول بعد بضع دقائق.',
  'Network issue while contacting YouTube. Please try again.': 'مشكلة في الشبكة أثناء الاتصال بيوتيوب. حاول مرة أخرى.',
  'This video cannot be downloaded.': 'لا يمكن تحميل هذا الفيديو.',
  'Could not process this video. Please try another link.': 'تعذر معالجة هذا الفيديو. جرّب رابطاً آخر.',
  'Could not get the thumbnail for this video.': 'تعذر جلب الصورة المصغرة لهذا الفيديو.',
  'This page is not available.': 'هذه الصفحة غير متاحة.',
  'Something went wrong on the server. Please try again.': 'حدث خطأ في الخادم. حاول مرة أخرى.',
  'Video unavailable': 'هذا الفيديو غير متاح.',
  'Video unavailable.': 'هذا الفيديو غير متاح.',
  'Private video': 'هذا الفيديو خاص.',
  'Private video.': 'هذا الفيديو خاص.',
  'Requested format is not available.': 'هذه الجودة غير متاحة. اختر جودة أخرى.',
  'Thumbnail unavailable.': 'تعذر جلب الصورة المصغرة لهذا الفيديو.'
};

function extractFileName(disposition, fallbackName) {
  if (!disposition) {
    return fallbackName;
  }

  const encodedMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch?.[1]) {
    return decodeURIComponent(encodedMatch[1]);
  }

  const standardMatch = disposition.match(/filename="?([^"]+)"?/i);
  if (standardMatch?.[1]) {
    return standardMatch[1];
  }

  return fallbackName;
}

function normalizeMessage(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function localizeErrorMessage(message, language, t) {
  const normalized = normalizeMessage(message);

  if (!normalized) {
    return t.unexpectedError;
  }

  const lower = normalized.toLowerCase();
  if (
    lower === 'failed to fetch' ||
    lower.includes('networkerror') ||
    lower.includes('fetch failed') ||
    lower.includes('load failed')
  ) {
    return t.serverUnreachable;
  }

  if (language !== 'ar') {
    return normalized;
  }

  const directMatch =
    ARABIC_ERROR_MAP[normalized] ||
    ARABIC_ERROR_MAP[normalized.replace(/\.$/, '')] ||
    ARABIC_ERROR_MAP[`${normalized}.`];

  if (directMatch) {
    return directMatch;
  }

  if (lower.includes('video unavailable')) return ARABIC_ERROR_MAP['This video is unavailable.'];
  if (lower.includes('private video')) return ARABIC_ERROR_MAP['This video is private.'];
  if (lower.includes('requested format')) return ARABIC_ERROR_MAP['This quality is not available. Please choose another one.'];
  if (lower.includes('thumbnail')) return ARABIC_ERROR_MAP['Could not get the thumbnail for this video.'];
  if (lower.includes('server')) return ARABIC_ERROR_MAP['Something went wrong on the server. Please try again.'];

  return t.unexpectedError;
}

function getApiErrorMessage(payload, fallbackMessage, language, t) {
  if (!payload || typeof payload !== 'object') {
    return localizeErrorMessage(fallbackMessage, language, t);
  }

  const rawMessage = typeof payload.error === 'string' ? payload.error : fallbackMessage;
  return localizeErrorMessage(rawMessage, language, t);
}

function getInitialLanguage() {
  try {
    const savedLanguage = normalizeText(localStorage.getItem(LANGUAGE_STORAGE_KEY));
    if (savedLanguage === 'ar' || savedLanguage === 'en') {
      return savedLanguage;
    }
  } catch {
  }

  return 'en';
}

function getInitialTheme() {
  try {
    const savedTheme = normalizeText(localStorage.getItem(THEME_STORAGE_KEY));
    if (savedTheme === 'dark' || savedTheme === 'light') {
      return savedTheme;
    }
  } catch {
  }

  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }

  return 'light';
}

function createEmptyVideoPreview() {
  return {
    thumbnailUrl: '',
    durationLabel: '',
    channelName: ''
  };
}

function formatDurationLabel(value) {
  const durationSeconds = Number(value);
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return '';
  }

  const total = Math.floor(durationSeconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function normalizeMediaUrl(value) {
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

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getDisplayInitial(value) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return '?';
  }

  return normalized[0].toUpperCase();
}

export default function App() {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [videoPreview, setVideoPreview] = useState(createEmptyVideoPreview);
  const [formats, setFormats] = useState([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isLoadingFormats, setIsLoadingFormats] = useState(false);
  const [isDownloadingMp3, setIsDownloadingMp3] = useState(false);
  const [isDownloadingThumbnail, setIsDownloadingThumbnail] = useState(false);
  const [downloadingFormatId, setDownloadingFormatId] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [language, setLanguage] = useState(getInitialLanguage);
  const [theme, setTheme] = useState(getInitialTheme);
  const firstMenuActionRef = useRef(null);

  const cleanUrl = useMemo(() => url.trim(), [url]);
  const t = I18N[language];
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';

    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
    }
  }, [language]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);

    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
    }
  }, [theme]);

  useEffect(() => {
    document.title = t.appName;
  }, [t.appName]);

  useEffect(() => {
    if (!isMenuOpen) {
      return undefined;
    }

    const focusTimer = setTimeout(() => {
      firstMenuActionRef.current?.focus();
    }, 0);

    return () => {
      clearTimeout(focusTimer);
    };
  }, [isMenuOpen]);

  const fetchFormats = async () => {
    setError('');
    setInfo('');
    setIsLoadingFormats(true);
    setFormats([]);
    setTitle('');
    setVideoPreview(createEmptyVideoPreview());

    try {
      const response = await fetch(`${API_BASE}/api/formats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url: cleanUrl })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(getApiErrorMessage(data, t.couldNotFetchQualities, language, t));
      }

      const resolvedTitle = normalizeText(data.title) || t.fallbackVideoTitle;
      const resolvedChannelName = normalizeText(data?.channel?.name);

      setFormats(Array.isArray(data.formats) ? data.formats : []);
      setTitle(resolvedTitle);
      setVideoPreview({
        thumbnailUrl: normalizeMediaUrl(data?.thumbnail),
        durationLabel: formatDurationLabel(data?.duration),
        channelName: resolvedChannelName
      });
    } catch (err) {
      setError(localizeErrorMessage(err.message, language, t) || t.unexpectedError);
    } finally {
      setIsLoadingFormats(false);
    }
  };

  const triggerBrowserDownload = (blob, fileName) => {
    const objectUrl = URL.createObjectURL(blob);
    const tempLink = document.createElement('a');
    tempLink.href = objectUrl;
    tempLink.download = fileName;
    document.body.appendChild(tempLink);
    tempLink.click();
    tempLink.remove();
    URL.revokeObjectURL(objectUrl);
  };

  const downloadFromApi = async ({ endpoint, fallbackName, setLoadingState, onDone }) => {
    setError('');
    setInfo(t.preparingDownload);
    setLoadingState(true);

    try {
      const response = await fetch(endpoint);
      const contentType = response.headers.get('content-type') || '';

      if (!response.ok) {
        if (contentType.includes('application/json')) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(getApiErrorMessage(payload, t.downloadFailed, language, t));
        }

        throw new Error(t.downloadFailedRetry);
      }

      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const fileName = extractFileName(disposition, fallbackName);

      triggerBrowserDownload(blob, fileName);
      setInfo(t.downloadStarted(fileName));
    } catch (err) {
      setError(localizeErrorMessage(err.message, language, t) || t.unexpectedError);
      setInfo('');
    } finally {
      setLoadingState(false);
      if (onDone) {
        onDone();
      }
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!cleanUrl) {
      setError(t.pasteUrlError);
      return;
    }

    fetchFormats();
  };

  const handleVideoDownload = async (formatId, hasAudio = false) => {
    if (!cleanUrl) {
      setError(t.pasteUrlError);
      return;
    }

    setDownloadingFormatId(formatId);

    await downloadFromApi({
      endpoint: `${API_BASE}/api/download/video?url=${encodeURIComponent(cleanUrl)}&formatId=${encodeURIComponent(formatId)}&hasAudio=${encodeURIComponent(String(Boolean(hasAudio)))}&title=${encodeURIComponent(title)}`,
      fallbackName: 'video.mp4',
      setLoadingState: () => {},
      onDone: () => setDownloadingFormatId('')
    });
  };

  const handleMp3Download = async () => {
    if (!cleanUrl) {
      setError(t.pasteUrlError);
      return;
    }

    await downloadFromApi({
      endpoint: `${API_BASE}/api/download/mp3?url=${encodeURIComponent(cleanUrl)}&title=${encodeURIComponent(title)}`,
      fallbackName: 'audio.mp3',
      setLoadingState: setIsDownloadingMp3
    });
  };

  const handleThumbnailDownload = async () => {
    if (!cleanUrl) {
      setError(t.pasteUrlError);
      return;
    }

    await downloadFromApi({
      endpoint: `${API_BASE}/api/download/thumbnail?url=${encodeURIComponent(cleanUrl)}&title=${encodeURIComponent(title)}`,
      fallbackName: 'thumbnail.jpg',
      setLoadingState: setIsDownloadingThumbnail
    });
  };

  const handleResetPage = () => {
    setUrl('');
    setTitle('');
    setFormats([]);
    setError('');
    setInfo('');
    setVideoPreview(createEmptyVideoPreview());
    setIsLoadingFormats(false);
    setIsDownloadingMp3(false);
    setIsDownloadingThumbnail(false);
    setDownloadingFormatId('');
  };

  const handleLanguageSelect = (nextLanguage) => {
    if (nextLanguage === language) {
      return;
    }

    setLanguage(nextLanguage);
    setError('');
    setInfo('');
  };

  const handleThemeSelect = (nextTheme) => {
    if (nextTheme === theme) {
      return;
    }

    setTheme(nextTheme);
  };

  const channelDisplayName = videoPreview.channelName || t.unknownChannel;
  const channelDisplayInitial = getDisplayInitial(channelDisplayName);
  const languageStateLabel = language === 'ar' ? t.menuLangArabicLabel : t.menuLangEnglishLabel;
  const themeStateLabel = theme === 'dark' ? t.menuThemeDarkShort : t.menuThemeLightShort;

  return (
    <main className="page">
      <section className="panel">
        <header className="topbar">
          <div className="brand">
            <h1>{t.appName}</h1>
            <p>{t.subtitle}</p>
          </div>
          <div className="toggles">
            <div className="menu-wrap">
              <button
                type="button"
                className="ghost-btn menu-trigger-btn"
                aria-label={isMenuOpen ? t.closeMenuLabel : t.openMenuLabel}
                aria-haspopup="dialog"
                aria-expanded={isMenuOpen}
                aria-controls="app-action-menu"
                onClick={() => setIsMenuOpen((current) => !current)}
              >
                {isMenuOpen ? <X size={18} strokeWidth={2} /> : <Menu size={18} strokeWidth={2} />}
              </button>

              {isMenuOpen && (
                <div
                  id="app-action-menu"
                  className="action-menu"
                  role="dialog"
                  aria-modal="false"
                  aria-label={t.menuTitle}
                >
                  <a
                    ref={firstMenuActionRef}
                    className="menu-item"
                    href={GITHUB_URL}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t.githubStarLabel}
                    title={t.githubStarLabel}
                  >
                    <span className="menu-item-title">{t.menuGithubCta}</span>
                    <Star size={15} strokeWidth={2} aria-hidden="true" />
                  </a>

                  <button
                    type="button"
                    className="menu-item"
                    onClick={handleResetPage}
                    aria-label={t.resetPageLabel}
                    title={t.resetPageLabel}
                  >
                    <span className="menu-item-title">{t.menuResetShort}</span>
                    <RefreshCw size={15} strokeWidth={2} aria-hidden="true" />
                  </button>

                  <div className="menu-switch-row">
                    <div className="menu-switch-copy">
                      <span className="menu-switch-label">{t.menuLanguageLabel}</span>
                      <span className="menu-switch-state">{languageStateLabel}</span>
                    </div>
                    <button
                      type="button"
                      className={`menu-switch-btn ${language === 'ar' ? 'is-active' : ''}`}
                      onClick={() => handleLanguageSelect(language === 'en' ? 'ar' : 'en')}
                      aria-label={t.languageTarget}
                      aria-pressed={language === 'ar'}
                      title={t.languageTarget}
                    >
                      <span className="menu-switch-thumb" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="menu-switch-row">
                    <div className="menu-switch-copy">
                      <span className="menu-switch-label">{t.menuThemeLabel}</span>
                      <span className="menu-switch-state">{themeStateLabel}</span>
                    </div>
                    <button
                      type="button"
                      className={`menu-switch-btn ${theme === 'dark' ? 'is-active' : ''}`}
                      onClick={() => handleThemeSelect(theme === 'dark' ? 'light' : 'dark')}
                      aria-label={theme === 'dark' ? t.themeToLight : t.themeToDark}
                      aria-pressed={theme === 'dark'}
                      title={theme === 'dark' ? t.themeToLight : t.themeToDark}
                    >
                      <span className="menu-switch-thumb" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <form onSubmit={handleSubmit} className="url-form">
          <input
            type="url"
            placeholder={t.inputPlaceholder}
            aria-label={t.inputPlaceholder}
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              if (error) setError('');
              if (info) setInfo('');
            }}
          />
          <button
            type="submit"
            className={`primary-btn submit-arrow-btn ${isLoadingFormats ? 'is-loading' : ''}`}
            disabled={isLoadingFormats}
            aria-label={language === 'ar' ? 'إرسال الرابط' : 'Submit URL'}
          >
            {isLoadingFormats ? (
              t.loadingQualities
            ) : (
              <span className="submit-arrow-icon" aria-hidden="true">
                {language === 'ar' ? <ArrowLeft size={20} strokeWidth={2.6} /> : <ArrowRight size={20} strokeWidth={2.6} />}
              </span>
            )}
          </button>
        </form>

        {error && <p className="status error">{error}</p>}
        {info && <p className="status info">{info}</p>}

        {formats.length > 0 && (
          <>
            <article className="video-preview-card">
              <div className="video-preview-thumbnail">
                {videoPreview.thumbnailUrl ? (
                  <img src={videoPreview.thumbnailUrl} alt={t.videoThumbnailAlt} loading="lazy" />
                ) : (
                  <div className="video-preview-thumbnail-fallback" aria-hidden="true" />
                )}
                {videoPreview.durationLabel && (
                  <span className="video-duration-badge">{videoPreview.durationLabel}</span>
                )}
              </div>
              <div className="video-preview-content">
                <h3 className="video-preview-title">{title}</h3>
                <div className="video-channel-row">
                  <span className="video-channel-avatar video-channel-avatar-fallback" aria-hidden="true">
                    {channelDisplayInitial}
                  </span>
                  <span className="video-channel-name">{channelDisplayName}</span>
                </div>
              </div>
            </article>
            <ul className="format-list">
              {formats.map((format) => (
                <li key={format.formatId} className="quality-card">
                  <div className="quality-head">
                    <strong className="quality-label">{format.quality || t.unknownQuality}</strong>
                  </div>
                  <button
                    type="button"
                    className="primary-btn card-btn"
                    onClick={() => handleVideoDownload(format.formatId, format.hasAudio)}
                    disabled={
                      isLoadingFormats ||
                      isDownloadingMp3 ||
                      isDownloadingThumbnail ||
                      Boolean(downloadingFormatId)
                    }
                  >
                    {downloadingFormatId === format.formatId ? t.preparing : t.download}
                  </button>
                </li>
              ))}
              <li key="mp3-download-card" className="quality-card">
                <div className="quality-head">
                  <strong className="quality-label">{t.mp3Title}</strong>
                </div>
                <button
                  type="button"
                  className="primary-btn card-btn"
                  onClick={handleMp3Download}
                  disabled={
                    isLoadingFormats ||
                    isDownloadingMp3 ||
                    isDownloadingThumbnail ||
                    Boolean(downloadingFormatId)
                  }
                >
                  {isDownloadingMp3 ? t.preparing : t.download}
                </button>
              </li>
              <li key="thumbnail-download-card" className="quality-card">
                <div className="quality-head">
                  <strong className="quality-label">{t.thumbnailTitle}</strong>
                </div>
                <button
                  type="button"
                  className="primary-btn card-btn"
                  onClick={handleThumbnailDownload}
                  disabled={
                    isLoadingFormats ||
                    isDownloadingMp3 ||
                    isDownloadingThumbnail ||
                    Boolean(downloadingFormatId)
                  }
                >
                  {isDownloadingThumbnail ? t.preparing : t.download}
                </button>
              </li>
            </ul>
          </>
        )}
      </section>
      <footer className="footer-note">{t.footerCopyright(currentYear)}</footer>
    </main>
  );
}
