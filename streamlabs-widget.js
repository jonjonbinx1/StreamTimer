const DEFAULT_SETTINGS = {
  title: '',
  mode: 'countdown',
  layout: 'stacked',
  hours: 0,
  minutes: 10,
  seconds: 0,
  countupHours: 0,
  countupMinutes: 0,
  countupSeconds: 0,
  titleColor: '#f8fafc',
  timerColor: '#fbbf24',
  backgroundColor: '#08111f',
  backgroundOpacity: 78,
  showOutline: true,
  outlineColor: '#f8fafc',
  outlineOpacity: 18,
  imageUrl: '',
  showImage: true,
  imageLayer: 'behind',
  imagePlacement: 'manual',
  imageSize: 72,
  imageX: 14,
  imageY: 50,
  fontFamily: 'Space Grotesk',
  customFontFamily: '',
  customFontUrl: '',
};

let settings = { ...DEFAULT_SETTINGS };
let startedAt = Date.now();
const SETTINGS_STORAGE_KEY = 'stream-timer-streamlabs-widget-settings';

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampPercent = (value, fallback = 0) => {
  const parsed = number(value, fallback);
  return Math.max(0, Math.min(100, parsed));
};

const isEnabled = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return value === true || value === 'true' || value === '1' || value === 1;
};

const getImageValue = (value) => {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object') {
    const directValue = value.url || value.src || value.imageUrl || value.image || value.data;
    if (typeof directValue === 'string') {
      return directValue;
    }

    if (Array.isArray(value)) {
      return value.map(getImageValue).find(Boolean) || '';
    }

    return Object.values(value).map(getImageValue).find(Boolean) || '';
  }

  return '';
};

const readSavedSettings = () => {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
};

const saveSettings = (nextSettings) => {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(nextSettings));
  } catch {
    // Streamlabs may disable storage for a widget; the live settings still work.
  }
};

const mergeObjects = (...sources) => {
  const merged = {};

  sources.forEach((source) => {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return;
    }

    Object.entries(source).forEach(([key, value]) => {
      if (value !== undefined) {
        merged[key] = value;
      }
    });
  });

  return merged;
};

const applyFieldData = (fieldData) => {
  if (!fieldData || typeof fieldData !== 'object') {
    return;
  }

  const imageValue = Object.prototype.hasOwnProperty.call(fieldData, 'imageUrl')
    ? fieldData.imageUrl
    : fieldData.image;

  const nextSettings = {
    ...settings,
    ...fieldData,
    imageUrl: imageValue !== undefined
      ? getImageValue(imageValue)
      : getImageValue(settings.imageUrl),
  };
  const normalizedMode = String(nextSettings.mode || '').toLowerCase().replace(/[\s_-]/g, '');
  nextSettings.mode = normalizedMode === 'countup' ? 'countup' : 'countdown';
  settings = nextSettings;
  saveSettings(settings);
  render();
};

const rgba = (hex, percent) => {
  const value = String(hex || '#08111f').replace('#', '');
  const normalized = value.length === 3
    ? value.split('').map((character) => character + character).join('')
    : value;
  const red = parseInt(normalized.slice(0, 2), 16) || 0;
  const green = parseInt(normalized.slice(2, 4), 16) || 0;
  const blue = parseInt(normalized.slice(4, 6), 16) || 0;
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(100, number(percent))) / 100})`;
};

const escapeCssString = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const fontFamily = (font) => {
  const normalized = String(font || '').trim().toLowerCase();
  if (normalized === 'pokemon' || normalized === 'press start 2p') return '"Press Start 2P", monospace';
  if (normalized === 'display' || normalized === 'bangers') return '"Bangers", "Trebuchet MS", sans-serif';
  if (normalized === 'custom') {
    const customFont = String(settings.customFontFamily || '').trim();
    return customFont
      ? `"${escapeCssString(customFont)}", "Trebuchet MS", sans-serif`
      : '"Space Grotesk", "Trebuchet MS", sans-serif';
  }
  if (font && normalized !== 'space' && normalized !== 'space grotesk') {
    return `"${escapeCssString(String(font).trim())}", "Trebuchet MS", sans-serif`;
  }
  return '"Space Grotesk", "Trebuchet MS", sans-serif';
};

const applyCustomFont = () => {
  const existingStyle = document.getElementById('customFontStyle');
  const customFontFamily = String(settings.customFontFamily || '').trim();
  const customFontUrl = String(settings.customFontUrl || '').trim();

  if (!customFontFamily || !customFontUrl) {
    if (existingStyle) {
      existingStyle.remove();
    }
    return;
  }

  let resolvedUrl = customFontUrl;
  try {
    resolvedUrl = new URL(customFontUrl, window.location.href).href;
  } catch {
    resolvedUrl = customFontUrl;
  }

  const style = existingStyle || document.createElement('style');
  style.id = 'customFontStyle';
  style.textContent = `@font-face { font-family: "${escapeCssString(customFontFamily)}"; src: url("${escapeCssString(resolvedUrl)}"); font-display: swap; }`;
  if (!existingStyle) {
    document.head.appendChild(style);
  }
};

const formatTime = (totalSeconds) => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${formatted}` : formatted;
};

const durationSeconds = (state) =>
  number(state.hours) * 3600 + number(state.minutes) * 60 + number(state.seconds);

const countupStartSeconds = (state) =>
  number(state.countupHours) * 3600 + number(state.countupMinutes) * 60 + number(state.countupSeconds);

const placement = (state) => {
  const positions = {
    manual: [clampPercent(state.imageX, 14), clampPercent(state.imageY, 50), '-50%, -50%'],
    center: [50, 50, '-50%, -50%'],
    'top-left': [0, 0, '0, 0'],
    'top-right': [100, 0, '-100%, 0'],
    'bottom-left': [0, 100, '0, -100%'],
    'bottom-right': [100, 100, '-100%, -100%'],
  };
  const [left, top, transform] = positions[state.imagePlacement] || positions.manual;
  return { left: `${left}%`, top: `${top}%`, transform: `translate(${transform})` };
};

const resolveFieldData = (event) => {
  if (!event || typeof event !== 'object') {
    return null;
  }

  const detail = event.detail && typeof event.detail === 'object' ? event.detail : null;
  const detailData = detail && detail.data && typeof detail.data === 'object' ? detail.data : null;
  const normalized = mergeObjects(
    detail && detail.settings,
    detail && detail.fieldData,
    detail && detail.field_data,
    detailData && detailData.settings,
    detailData && detailData.fieldData,
    detailData && detailData.field_data,
    detail,
    event,
  );

  return Object.keys(normalized).length > 0 ? normalized : null;
};

function render() {
  const widget = document.getElementById('timerWidget');
  const title = document.getElementById('widgetTitle');
  const time = document.getElementById('widgetTime');
  const image = document.getElementById('widgetImage');

  const visualImage = isEnabled(settings.showImage) && getImageValue(settings.imageUrl)
    ? getImageValue(settings.imageUrl)
    : '';
  const background = rgba(settings.backgroundColor, settings.backgroundOpacity);
  const outline = isEnabled(settings.showOutline)
    ? rgba(settings.outlineColor, settings.outlineOpacity)
    : 'transparent';
  applyCustomFont();

  const hasOutline = isEnabled(settings.showOutline) && number(settings.outlineOpacity) > 0;
  widget.className = `timer-widget ${settings.layout || 'stacked'} ${visualImage ? 'has-image' : 'no-image'} ${hasOutline ? '' : 'no-outline'}`;
  widget.style.background = background;
  widget.style.setProperty('border-color', hasOutline ? outline : 'transparent', 'important');
  widget.style.setProperty('border-width', hasOutline ? '1px' : '0', 'important');
  widget.style.boxShadow = hasOutline ? '0 24px 90px rgba(2, 6, 23, 0.42)' : 'none';
  title.textContent = settings.title || '';
  title.hidden = !settings.title;
  time.style.color = settings.timerColor;
  image.hidden = !visualImage;
  image.src = visualImage;
  image.style.width = `${number(settings.imageSize, 72)}px`;
  image.style.height = `${number(settings.imageSize, 72)}px`;
  image.style.maxWidth = 'none';
  image.style.maxHeight = 'none';
  image.style.display = visualImage ? 'block' : 'none';
  image.style.zIndex = settings.imageLayer === 'front' ? '3' : '1';
  Object.assign(image.style, placement(settings));
  document.documentElement.style.setProperty('--title', settings.titleColor);
  document.documentElement.style.setProperty('--timer', settings.timerColor);
  document.documentElement.style.setProperty('--widget-font', fontFamily(settings.fontFamily));

  const elapsed = Math.floor((Date.now() - startedAt) / 1000);
  const total = settings.mode === 'countdown'
    ? Math.max(0, durationSeconds(settings) - elapsed)
    : countupStartSeconds(settings) + elapsed;
  time.textContent = formatTime(total);
  time.style.textShadow = total === 0 && settings.mode === 'countdown'
    ? '0 0 36px rgba(239, 68, 68, 0.18)'
    : '0 0 30px rgba(251, 191, 36, 0.16)';
}

const handleWidgetSettings = (event) => {
  const fieldData = resolveFieldData(event);
  applyFieldData(fieldData);
  startedAt = Date.now();
};

window.addEventListener('onWidgetLoad', (event) => {
  settings = { ...DEFAULT_SETTINGS, ...(readSavedSettings() || {}) };
  handleWidgetSettings(event);
});

window.addEventListener('onWidgetUpdate', handleWidgetSettings);

render();
setInterval(render, 1000);
