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
  backgroundOpacity: 0,
  showOutline: true,
  outlineColor: '#f8fafc',
  outlineOpacity: 18,
  imageUrl: '',
  showImage: true,
  imageLayer: 'behind',
  imagePlacement: 'center',
  imageSize: 72,
  imageX: 50,
  imageY: 50,
  fontFamily: 'space',
};

let settings = { ...DEFAULT_SETTINGS };
let startedAt = Date.now();
const SETTINGS_STORAGE_KEY = 'stream-timer-streamlabs-widget-settings';

const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

const applyFieldData = (fieldData) => {
  if (!fieldData || typeof fieldData !== 'object') {
    return;
  }

  const nextSettings = {
    ...settings,
    ...fieldData,
    imageUrl: Object.prototype.hasOwnProperty.call(fieldData, 'imageUrl')
      ? getImageValue(fieldData.imageUrl)
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

const fontFamily = (font) => {
  if (font === 'pokemon' || font === 'Press Start 2P') return '"Press Start 2P", monospace';
  if (font === 'display' || font === 'Bangers') return '"Bangers", "Trebuchet MS", sans-serif';
  return '"Space Grotesk", "Trebuchet MS", sans-serif';
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
    center: [50, 50, '-50%, -50%'],
    'top-left': [0, 0, '0, 0'],
    'top-right': [100, 0, '-100%, 0'],
    'bottom-left': [0, 100, '0, -100%'],
    'bottom-right': [100, 100, '-100%, -100%'],
  };
  const [left, top, transform] = positions[state.imagePlacement] || [number(state.imageX, 50), number(state.imageY, 50), '-50%, -50%'];
  return { left: `${left}%`, top: `${top}%`, transform: `translate(${transform})` };
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

  widget.className = `timer-widget ${settings.layout || 'stacked'} ${visualImage ? 'has-image' : 'no-image'}`;
  widget.style.background = background;
  const hasOutline = isEnabled(settings.showOutline) && number(settings.outlineOpacity) > 0;
  widget.style.borderColor = hasOutline ? outline : 'transparent';
  widget.style.boxShadow = hasOutline ? '0 24px 90px rgba(2, 6, 23, 0.42)' : 'none';
  title.textContent = settings.title || '';
  title.hidden = !settings.title;
  time.style.color = settings.timerColor;
  image.hidden = !visualImage;
  image.src = visualImage;
  image.style.width = `${number(settings.imageSize, 72)}px`;
  image.style.height = `${number(settings.imageSize, 72)}px`;
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
  const fieldData = event.detail?.fieldData || event.detail?.data?.fieldData || event.detail;
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
