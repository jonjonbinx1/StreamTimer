const STORAGE_KEY = 'stream-timer-helper-state';
const STORAGE_VERSION = 2;
const DEFAULT_STATE = {
  title: '',
  mode: 'countdown',
  layout: 'stacked',
  hours: '0',
  minutes: '10',
  seconds: '0',
  countupHours: '0',
  countupMinutes: '0',
  countupSeconds: '0',
  titleColor: '#f8fafc',
  timerColor: '#fbbf24',
  accentColor: '#22c55e',
  backgroundColor: '#08111f',
  backgroundOpacity: '78',
  fontFamily: 'space',
  customFontFamily: '',
  customFontUrl: '',
  imageLayer: 'behind',
  imagePlacement: 'manual',
  imageSize: '72',
  imageX: '18',
  imageY: '18',
  showOutline: true,
  outlineColor: '#f8fafc',
  outlineOpacity: '18',
  imageUrl: '',
  imageData: '',
  showImage: true,
  storageVersion: STORAGE_VERSION,
};

const DOM = {};
let previewTimer = null;
let sourceTimer = null;
let sourceStartAt = Date.now();
let liveState = null;
let dragPointerId = null;

const clampNumber = (value, min, max) => {
  const numeric = Number.parseInt(String(value), 10);
  if (Number.isNaN(numeric)) {
    return min;
  }
  return Math.min(max, Math.max(min, numeric));
};

const pad2 = (value) => String(value).padStart(2, '0');

const clampPercent = (value) => {
  const numeric = Number.parseInt(String(value), 10);
  if (Number.isNaN(numeric)) {
    return 0;
  }

  return Math.min(100, Math.max(0, numeric));
};

const hexToRgba = (hex, alphaPercent) => {
  const sanitized = hex.replace('#', '');
  const normalized =
    sanitized.length === 3
      ? sanitized
          .split('')
          .map((character) => character + character)
          .join('')
      : sanitized;

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  const alpha = clampPercent(alphaPercent) / 100;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const escapeCssString = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const getFontFamily = (fontKey, customFontFamily = '') => {
  if (fontKey === 'custom') {
    const trimmedCustomFont = customFontFamily.trim();
    return trimmedCustomFont
      ? `"${escapeCssString(trimmedCustomFont)}", "Trebuchet MS", sans-serif`
      : '"Space Grotesk", "Trebuchet MS", sans-serif';
  }

  switch (fontKey) {
    case 'pokemon':
      return '"Press Start 2P", monospace';
    case 'display':
      return '"Bangers", "Trebuchet MS", sans-serif';
    default:
      if (fontKey && !['space', 'pokemon', 'display'].includes(fontKey)) {
        return `"${escapeCssString(String(fontKey).trim())}", "Trebuchet MS", sans-serif`;
      }
      return '"Space Grotesk", "Trebuchet MS", sans-serif';
  }
};

const applyCustomFont = (state) => {
  const existingStyle = document.getElementById('customFontStyle');
  const customFontFamily = String(state.customFontFamily || '').trim();
  const customFontUrl = String(state.customFontUrl || '').trim();

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

  if (hours > 0) {
    return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  }

  return `${pad2(minutes)}:${pad2(seconds)}`;
};

const totalDurationSeconds = (state) => {
  return (
    clampNumber(state.hours, 0, 24) * 3600 +
    clampNumber(state.minutes, 0, 59) * 60 +
    clampNumber(state.seconds, 0, 59)
  );
};

const countupStartSeconds = (state) => {
  return (
    clampNumber(state.countupHours, 0, 24) * 3600 +
    clampNumber(state.countupMinutes, 0, 59) * 60 +
    clampNumber(state.countupSeconds, 0, 59)
  );
};

const getDisplayedSeconds = (state, elapsedSeconds) => {
  if (state.mode === 'countdown') {
    return Math.max(0, totalDurationSeconds(state) - elapsedSeconds);
  }

  return countupStartSeconds(state) + elapsedSeconds;
};

const migrateStoredState = (parsedState) => {
  if (parsedState?.storageVersion === STORAGE_VERSION) {
    return parsedState;
  }

  return {
    ...parsedState,
    countupHours: DEFAULT_STATE.countupHours,
    countupMinutes: DEFAULT_STATE.countupMinutes,
    countupSeconds: DEFAULT_STATE.countupSeconds,
    storageVersion: STORAGE_VERSION,
  };
};

const getStateFromStorage = () => {
  try {
    const rawState = localStorage.getItem(STORAGE_KEY);
    if (!rawState) {
      return null;
    }

    const parsedState = migrateStoredState(JSON.parse(rawState));
    return {
      ...DEFAULT_STATE,
      ...parsedState,
    };
  } catch {
    return null;
  }
};

const saveStateToStorage = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can fail in browser-source sandboxes; ignore it.
  }
};

const getStateFromForm = () => ({
  title: DOM.titleInput.value.trim(),
  mode: DOM.modeInput.value,
  layout: DOM.layoutInput.value,
  hours: String(clampNumber(DOM.hoursInput.value, 0, 24)),
  minutes: String(clampNumber(DOM.minutesInput.value, 0, 59)),
  seconds: String(clampNumber(DOM.secondsInput.value, 0, 59)),
  countupHours: String(clampNumber(DOM.countupHoursInput.value, 0, 24)),
  countupMinutes: String(clampNumber(DOM.countupMinutesInput.value, 0, 59)),
  countupSeconds: String(clampNumber(DOM.countupSecondsInput.value, 0, 59)),
  titleColor: DOM.titleColorInput.value,
  timerColor: DOM.timerColorInput.value,
  accentColor: DOM.accentColorInput.value,
  backgroundColor: DOM.backgroundColorInput.value,
  backgroundOpacity: DOM.backgroundOpacityInput.value,
  fontFamily: DOM.fontFamilyInput.value,
  customFontFamily: DOM.customFontFamilyInput.value.trim(),
  customFontUrl: DOM.customFontUrlInput.value.trim(),
  imageLayer: DOM.imageLayerInput.value,
  imagePlacement: DOM.imagePlacementInput.value,
  imageSize: DOM.imageSizeInput.value,
  imageX: DOM.imageXInput.value,
  imageY: DOM.imageYInput.value,
  showOutline: DOM.showOutlineInput.checked,
  outlineColor: DOM.outlineColorInput.value,
  outlineOpacity: DOM.outlineOpacityInput.value,
  imageUrl: DOM.imageUrlInput.value.trim(),
  imageData: DOM.imageDataInput.value,
  showImage: DOM.showImageInput.checked,
});

const setFormState = (state) => {
  DOM.titleInput.value = state.title ?? DEFAULT_STATE.title;
  DOM.modeInput.value = state.mode ?? DEFAULT_STATE.mode;
  DOM.layoutInput.value = state.layout ?? DEFAULT_STATE.layout;
  DOM.hoursInput.value = state.hours ?? DEFAULT_STATE.hours;
  DOM.minutesInput.value = state.minutes ?? DEFAULT_STATE.minutes;
  DOM.secondsInput.value = state.seconds ?? DEFAULT_STATE.seconds;
  DOM.countupHoursInput.value = state.countupHours ?? DEFAULT_STATE.countupHours;
  DOM.countupMinutesInput.value = state.countupMinutes ?? DEFAULT_STATE.countupMinutes;
  DOM.countupSecondsInput.value = state.countupSeconds ?? DEFAULT_STATE.countupSeconds;
  DOM.titleColorInput.value = state.titleColor ?? DEFAULT_STATE.titleColor;
  DOM.timerColorInput.value = state.timerColor ?? DEFAULT_STATE.timerColor;
  DOM.accentColorInput.value = state.accentColor ?? DEFAULT_STATE.accentColor;
  DOM.backgroundColorInput.value = state.backgroundColor ?? DEFAULT_STATE.backgroundColor;
  DOM.backgroundOpacityInput.value = state.backgroundOpacity ?? DEFAULT_STATE.backgroundOpacity;
  DOM.backgroundOpacityValue.textContent = `${clampPercent(state.backgroundOpacity ?? DEFAULT_STATE.backgroundOpacity)}%`;
  DOM.fontFamilyInput.value = state.fontFamily ?? DEFAULT_STATE.fontFamily;
  DOM.customFontFamilyInput.value = state.customFontFamily ?? DEFAULT_STATE.customFontFamily;
  DOM.customFontUrlInput.value = state.customFontUrl ?? DEFAULT_STATE.customFontUrl;
  DOM.imageLayerInput.value = state.imageLayer ?? DEFAULT_STATE.imageLayer;
  DOM.imagePlacementInput.value = state.imagePlacement ?? DEFAULT_STATE.imagePlacement;
  DOM.imageSizeInput.value = state.imageSize ?? DEFAULT_STATE.imageSize;
  DOM.imageSizeValue.textContent = `${state.imageSize ?? DEFAULT_STATE.imageSize}px`;
  DOM.imageXInput.value = state.imageX ?? DEFAULT_STATE.imageX;
  DOM.imageYInput.value = state.imageY ?? DEFAULT_STATE.imageY;
  DOM.showOutlineInput.checked = state.showOutline ?? DEFAULT_STATE.showOutline;
  DOM.outlineColorInput.value = state.outlineColor ?? DEFAULT_STATE.outlineColor;
  DOM.outlineOpacityInput.value = state.outlineOpacity ?? DEFAULT_STATE.outlineOpacity;
  DOM.outlineOpacityValue.textContent = `${clampPercent(state.outlineOpacity ?? DEFAULT_STATE.outlineOpacity)}%`;
  DOM.imageUrlInput.value = state.imageUrl ?? DEFAULT_STATE.imageUrl;
  DOM.imageDataInput.value = state.imageData ?? DEFAULT_STATE.imageData;
  DOM.showImageInput.checked = state.showImage ?? DEFAULT_STATE.showImage;
};

const getVisualImage = (state) => {
  if (!state.showImage) {
    return '';
  }

  return state.imageUrl || state.imageData || '';
};

const IMAGE_PLACEMENTS = {
  manual: {
    left: (state) => `${clampPercent(state.imageX)}%`,
    top: (state) => `${clampPercent(state.imageY)}%`,
    transform: 'translate(-50%, -50%)',
  },
  center: {
    left: () => '50%',
    top: () => '50%',
    transform: 'translate(-50%, -50%)',
  },
  'top-left': {
    left: () => '0%',
    top: () => '0%',
    transform: 'translate(0, 0)',
  },
  'top-right': {
    left: () => '100%',
    top: () => '0%',
    transform: 'translate(-100%, 0)',
  },
  'bottom-left': {
    left: () => '0%',
    top: () => '100%',
    transform: 'translate(0, -100%)',
  },
  'bottom-right': {
    left: () => '100%',
    top: () => '100%',
    transform: 'translate(-100%, -100%)',
  },
};

const applyImagePlacement = (element, state) => {
  const placement = IMAGE_PLACEMENTS[state.imagePlacement] ?? IMAGE_PLACEMENTS.manual;
  element.style.left = placement.left(state);
  element.style.top = placement.top(state);
  element.style.transform = placement.transform;
};

const updateImagePosition = (event, stageElement) => {
  const visualImage = getVisualImage(getStateFromForm());
  if (!visualImage) {
    return;
  }

  const stageRect = stageElement.getBoundingClientRect();
  const nextX = clampPercent(((event.clientX - stageRect.left) / stageRect.width) * 100);
  const nextY = clampPercent(((event.clientY - stageRect.top) / stageRect.height) * 100);
  DOM.imagePlacementInput.value = 'manual';
  DOM.imageXInput.value = String(nextX);
  DOM.imageYInput.value = String(nextY);
  renderPreview();
  setFeedback('Image position updated.');
};

const buildSourceUrl = (state) => {
  const url = new URL(window.location.href);
  url.searchParams.set('view', 'source');
  if (state.title) {
    url.searchParams.set('title', state.title);
  }
  url.searchParams.set('mode', state.mode);
  url.searchParams.set('layout', state.layout);
  url.searchParams.set('hours', state.hours);
  url.searchParams.set('minutes', state.minutes);
  url.searchParams.set('seconds', state.seconds);
  url.searchParams.set('countupHours', state.countupHours);
  url.searchParams.set('countupMinutes', state.countupMinutes);
  url.searchParams.set('countupSeconds', state.countupSeconds);
  url.searchParams.set('titleColor', state.titleColor);
  url.searchParams.set('timerColor', state.timerColor);
  url.searchParams.set('accentColor', state.accentColor);
  url.searchParams.set('backgroundColor', state.backgroundColor);
  url.searchParams.set('backgroundOpacity', state.backgroundOpacity);
  url.searchParams.set('fontFamily', state.fontFamily);
  if (state.customFontFamily) {
    url.searchParams.set('customFontFamily', state.customFontFamily);
  }
  if (state.customFontUrl) {
    url.searchParams.set('customFontUrl', state.customFontUrl);
  }
  url.searchParams.set('imageLayer', state.imageLayer);
  url.searchParams.set('imagePlacement', state.imagePlacement);
  url.searchParams.set('imageSize', state.imageSize);
  url.searchParams.set('imageX', state.imageX);
  url.searchParams.set('imageY', state.imageY);
  url.searchParams.set('showOutline', state.showOutline ? '1' : '0');
  url.searchParams.set('outlineColor', state.outlineColor);
  url.searchParams.set('outlineOpacity', state.outlineOpacity);
  url.searchParams.set('showImage', state.showImage ? '1' : '0');

  const visualImage = getVisualImage(state);
  if (visualImage) {
    url.searchParams.set('image', visualImage);
  }

  return url.toString();
};

const getStateFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const state = { ...DEFAULT_STATE };
  const view = params.get('view');

  if (view === 'source') {
    state.title = params.has('title') ? (params.get('title') ?? '') : '';
    state.mode = params.get('mode') ?? state.mode;
    state.layout = params.get('layout') ?? state.layout;
    state.hours = params.get('hours') ?? state.hours;
    state.minutes = params.get('minutes') ?? state.minutes;
    state.seconds = params.get('seconds') ?? state.seconds;
    state.countupHours = params.get('countupHours') ?? state.countupHours;
    state.countupMinutes = params.get('countupMinutes') ?? state.countupMinutes;
    state.countupSeconds = params.get('countupSeconds') ?? state.countupSeconds;
    state.titleColor = params.get('titleColor') ?? state.titleColor;
    state.timerColor = params.get('timerColor') ?? state.timerColor;
    state.accentColor = params.get('accentColor') ?? state.accentColor;
    state.backgroundColor = params.get('backgroundColor') ?? state.backgroundColor;
    state.backgroundOpacity = params.get('backgroundOpacity') ?? state.backgroundOpacity;
    state.fontFamily = params.get('fontFamily') ?? state.fontFamily;
    state.customFontFamily = params.get('customFontFamily') ?? state.customFontFamily;
    state.customFontUrl = params.get('customFontUrl') ?? state.customFontUrl;
    state.imageLayer = params.get('imageLayer') ?? state.imageLayer;
    state.imagePlacement = params.get('imagePlacement') ?? state.imagePlacement;
    state.imageSize = params.get('imageSize') ?? state.imageSize;
    state.imageX = params.get('imageX') ?? state.imageX;
    state.imageY = params.get('imageY') ?? state.imageY;
    state.showOutline = params.get('showOutline') !== '0';
    state.outlineColor = params.get('outlineColor') ?? state.outlineColor;
    state.outlineOpacity = params.get('outlineOpacity') ?? state.outlineOpacity;
    state.showImage = params.get('showImage') !== '0';
    state.imageUrl = params.get('image') ?? '';
    state.imageData = state.imageUrl;
    return { view, state };
  }

  return { view, state: null };
};

const renderPreview = () => {
  const state = getStateFromForm();
  liveState = state;
  applyCustomFont(state);

  document.documentElement.style.setProperty('--bg', state.backgroundColor);
  document.documentElement.style.setProperty('--timer', state.timerColor);
  document.documentElement.style.setProperty('--accent', state.accentColor);
  document.documentElement.style.setProperty('--title-color', state.titleColor);
  document.documentElement.style.setProperty('--widget-font', getFontFamily(state.fontFamily, state.customFontFamily));

  const hasOutline = state.showOutline && clampPercent(state.outlineOpacity) > 0;
  DOM.previewWidget.className = `timer-widget ${state.layout} ${hasOutline ? '' : 'no-outline'}`;
  DOM.previewWidget.style.background = hexToRgba(state.backgroundColor, state.backgroundOpacity);
  DOM.previewWidget.style.setProperty('border-color', hasOutline ? hexToRgba(state.outlineColor, state.outlineOpacity) : 'transparent', 'important');
  DOM.previewWidget.style.setProperty('border-width', hasOutline ? '1px' : '0', 'important');
  DOM.previewWidget.style.boxShadow = hasOutline ? 'var(--shadow)' : 'none';
  DOM.previewTitle.textContent = state.title;
  DOM.previewTitle.style.color = state.titleColor;
  DOM.previewTime.style.color = state.timerColor;
  DOM.previewTitle.style.fontFamily = getFontFamily(state.fontFamily, state.customFontFamily);
  DOM.previewTime.style.fontFamily = getFontFamily(state.fontFamily, state.customFontFamily);
  DOM.backgroundOpacityValue.textContent = `${clampPercent(state.backgroundOpacity)}%`;
  DOM.imageSizeValue.textContent = `${clampNumber(state.imageSize, 24, 240)}px`;
  DOM.outlineOpacityValue.textContent = `${clampPercent(state.outlineOpacity)}%`;
  const visualImage = getVisualImage(state);
  DOM.previewWidget.classList.toggle('has-image', Boolean(visualImage));
  DOM.previewWidget.classList.toggle('no-image', !visualImage);
  DOM.previewTitle.hidden = !state.title;
  DOM.previewImage.hidden = !visualImage;
  DOM.previewImage.src = visualImage;
  DOM.previewImage.style.width = `${clampNumber(state.imageSize, 24, 240)}px`;
  DOM.previewImage.style.height = `${clampNumber(state.imageSize, 24, 240)}px`;
  DOM.previewImage.style.zIndex = state.imageLayer === 'front' ? '3' : '0';
  applyImagePlacement(DOM.previewImage, state);
  DOM.previewImage.draggable = Boolean(visualImage);
  DOM.sourceUrlPreview.textContent = buildSourceUrl(state);
  saveStateToStorage(state);
  updatePreviewTime();
};

const updatePreviewTime = () => {
  if (!liveState) {
    return;
  }

  const elapsed = Math.floor((Date.now() - sourceStartAt) / 1000);
  DOM.previewTime.textContent = formatTime(getDisplayedSeconds(liveState, elapsed));
};

const setFeedback = (message, isError = false) => {
  DOM.copyFeedback.textContent = message;
  DOM.copyFeedback.style.color = isError ? '#fb7185' : 'var(--muted)';
};

const copyText = async (text) => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

const wireHelper = () => {
  const syncFromForm = () => {
    renderPreview();
  };

  const handleImageFile = () => {
    const [file] = DOM.imageFileInput.files ?? [];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      DOM.imageDataInput.value = String(reader.result ?? '');
      DOM.imageUrlInput.value = '';
      renderPreview();
      setFeedback(`Loaded ${file.name} into the shareable URL.`);
    };
    reader.readAsDataURL(file);
  };

  DOM.previewStage.addEventListener('pointerdown', (event) => {
    if (event.target !== DOM.previewImage || !getVisualImage(getStateFromForm())) {
      return;
    }

    dragPointerId = event.pointerId;
    DOM.previewStage.setPointerCapture(dragPointerId);
    updateImagePosition(event, DOM.previewStage);
  });

  DOM.previewStage.addEventListener('pointermove', (event) => {
    if (dragPointerId !== event.pointerId) {
      return;
    }

    updateImagePosition(event, DOM.previewStage);
  });

  const endDrag = (event) => {
    if (dragPointerId !== event.pointerId) {
      return;
    }

    dragPointerId = null;
    if (DOM.previewStage.hasPointerCapture(event.pointerId)) {
      DOM.previewStage.releasePointerCapture(event.pointerId);
    }
  };

  DOM.previewStage.addEventListener('pointerup', endDrag);
  DOM.previewStage.addEventListener('pointercancel', endDrag);

  DOM.previewImage.addEventListener('dragstart', (event) => {
    event.preventDefault();
  });

  [
    DOM.titleInput,
    DOM.modeInput,
    DOM.layoutInput,
    DOM.hoursInput,
    DOM.minutesInput,
    DOM.secondsInput,
    DOM.countupHoursInput,
    DOM.countupMinutesInput,
    DOM.countupSecondsInput,
    DOM.titleColorInput,
    DOM.timerColorInput,
    DOM.accentColorInput,
    DOM.backgroundColorInput,
    DOM.backgroundOpacityInput,
    DOM.fontFamilyInput,
    DOM.customFontFamilyInput,
    DOM.customFontUrlInput,
    DOM.imageLayerInput,
    DOM.imagePlacementInput,
    DOM.imageSizeInput,
    DOM.imageXInput,
    DOM.imageYInput,
    DOM.imageUrlInput,
    DOM.showImageInput,
  ].forEach((element) => {
    element.addEventListener('input', syncFromForm);
    element.addEventListener('change', syncFromForm);
  });

  DOM.imageFileInput.addEventListener('change', handleImageFile);

  DOM.copyUrlButton.addEventListener('click', async () => {
    try {
      await copyText(buildSourceUrl(getStateFromForm()));
      setFeedback('Browser-source URL copied to the clipboard.');
    } catch {
      setFeedback('Clipboard access was blocked. Copy the URL from the preview card.', true);
    }
  });

  DOM.openSourceButton.addEventListener('click', () => {
    window.open(buildSourceUrl(getStateFromForm()), '_blank', 'noopener,noreferrer');
  });

  DOM.resetButton.addEventListener('click', () => {
    setFormState(DEFAULT_STATE);
    DOM.imageFileInput.value = '';
    renderPreview();
    setFeedback('Reset to the default timer configuration.');
  });

  DOM.timerForm.addEventListener('submit', (event) => {
    event.preventDefault();
  });
};

const renderSource = (state) => {
  document.body.classList.add('source-mode');
  DOM.helperView.classList.add('hidden');
  DOM.sourceView.classList.remove('hidden');
  applyCustomFont(state);

  document.documentElement.style.setProperty('--bg', state.backgroundColor);
  document.documentElement.style.setProperty('--timer', state.timerColor);
  document.documentElement.style.setProperty('--accent', state.accentColor);
  document.documentElement.style.setProperty('--widget-font', getFontFamily(state.fontFamily, state.customFontFamily));

  const hasOutline = state.showOutline && clampPercent(state.outlineOpacity) > 0;
  DOM.sourceWidget.className = `timer-widget ${state.layout} ${hasOutline ? '' : 'no-outline'}`;
  DOM.sourceWidget.style.background = hexToRgba(state.backgroundColor, state.backgroundOpacity);
  DOM.sourceWidget.style.setProperty('border-color', hasOutline ? hexToRgba(state.outlineColor, state.outlineOpacity) : 'transparent', 'important');
  DOM.sourceWidget.style.setProperty('border-width', hasOutline ? '1px' : '0', 'important');
  DOM.sourceWidget.style.boxShadow = hasOutline ? 'var(--shadow)' : 'none';
  DOM.sourceTitle.textContent = state.title;
  DOM.sourceTitle.style.color = state.titleColor;
  DOM.sourceTitle.style.fontFamily = getFontFamily(state.fontFamily, state.customFontFamily);
  DOM.sourceTime.style.color = state.timerColor;
  DOM.sourceTime.style.fontFamily = getFontFamily(state.fontFamily, state.customFontFamily);
  const visualImage = getVisualImage(state);
  DOM.sourceWidget.classList.toggle('has-image', Boolean(visualImage));
  DOM.sourceWidget.classList.toggle('no-image', !visualImage);
  DOM.sourceTitle.hidden = !state.title;
  DOM.sourceImage.hidden = !visualImage;
  DOM.sourceImage.src = visualImage;
  DOM.sourceImage.style.width = `${clampNumber(state.imageSize, 24, 240)}px`;
  DOM.sourceImage.style.height = `${clampNumber(state.imageSize, 24, 240)}px`;
  DOM.sourceImage.style.zIndex = state.imageLayer === 'front' ? '3' : '0';
  applyImagePlacement(DOM.sourceImage, state);
  DOM.sourceImage.draggable = false;

  const tick = () => {
    const elapsed = Math.floor((Date.now() - sourceStartAt) / 1000);
    const displaySeconds = getDisplayedSeconds(state, elapsed);
    DOM.sourceTime.textContent = formatTime(displaySeconds);
    DOM.sourceTime.style.textShadow = displaySeconds === 0 && state.mode === 'countdown' ? '0 0 36px rgba(239, 68, 68, 0.18)' : '0 0 30px rgba(251, 191, 36, 0.16)';
  };

  tick();
  sourceTimer = window.setInterval(tick, 1000);
};

const initialize = () => {
  DOM.helperView = document.getElementById('helperView');
  DOM.sourceView = document.getElementById('sourceView');
  DOM.timerForm = document.getElementById('timerForm');
  DOM.titleInput = document.getElementById('titleInput');
  DOM.modeInput = document.getElementById('modeInput');
  DOM.layoutInput = document.getElementById('layoutInput');
  DOM.hoursInput = document.getElementById('hoursInput');
  DOM.minutesInput = document.getElementById('minutesInput');
  DOM.secondsInput = document.getElementById('secondsInput');
  DOM.countupHoursInput = document.getElementById('countupHoursInput');
  DOM.countupMinutesInput = document.getElementById('countupMinutesInput');
  DOM.countupSecondsInput = document.getElementById('countupSecondsInput');
  DOM.titleColorInput = document.getElementById('titleColorInput');
  DOM.timerColorInput = document.getElementById('timerColorInput');
  DOM.accentColorInput = document.getElementById('accentColorInput');
  DOM.backgroundColorInput = document.getElementById('backgroundColorInput');
  DOM.backgroundOpacityInput = document.getElementById('backgroundOpacityInput');
  DOM.backgroundOpacityValue = document.getElementById('backgroundOpacityValue');
  DOM.fontFamilyInput = document.getElementById('fontFamilyInput');
  DOM.customFontFamilyInput = document.getElementById('customFontFamilyInput');
  DOM.customFontUrlInput = document.getElementById('customFontUrlInput');
  DOM.imageLayerInput = document.getElementById('imageLayerInput');
  DOM.imagePlacementInput = document.getElementById('imagePlacementInput');
  DOM.imageSizeInput = document.getElementById('imageSizeInput');
  DOM.imageSizeValue = document.getElementById('imageSizeValue');
  DOM.imageXInput = document.createElement('input');
  DOM.imageXInput.type = 'hidden';
  DOM.imageYInput = document.createElement('input');
  DOM.imageYInput.type = 'hidden';
  DOM.showOutlineInput = document.getElementById('showOutlineInput');
  DOM.outlineColorInput = document.getElementById('outlineColorInput');
  DOM.outlineOpacityInput = document.getElementById('outlineOpacityInput');
  DOM.outlineOpacityValue = document.getElementById('outlineOpacityValue');
  DOM.imageUrlInput = document.getElementById('imageUrlInput');
  DOM.imageDataInput = document.createElement('input');
  DOM.imageDataInput.type = 'hidden';
  DOM.showImageInput = document.getElementById('showImageInput');
  DOM.imageFileInput = document.getElementById('imageFileInput');
  DOM.resetButton = document.getElementById('resetButton');
  DOM.copyUrlButton = document.getElementById('copyUrlButton');
  DOM.openSourceButton = document.getElementById('openSourceButton');
  DOM.copyFeedback = document.getElementById('copyFeedback');
  DOM.previewWidget = document.getElementById('previewWidget');
  DOM.previewStage = document.getElementById('previewStage');
  DOM.previewTitle = document.getElementById('previewTitle');
  DOM.previewTime = document.getElementById('previewTime');
  DOM.previewImage = document.getElementById('previewImage');
  DOM.sourceUrlPreview = document.getElementById('sourceUrlPreview');
  DOM.sourceStage = document.getElementById('sourceStage');
  DOM.sourceWidget = document.getElementById('sourceWidget');
  DOM.sourceTitle = document.getElementById('sourceTitle');
  DOM.sourceTime = document.getElementById('sourceTime');
  DOM.sourceImage = document.getElementById('sourceImage');
  DOM.timerForm.appendChild(DOM.imageXInput);
  DOM.timerForm.appendChild(DOM.imageYInput);
  DOM.timerForm.appendChild(DOM.imageDataInput);

  const { view, state: urlState } = getStateFromUrl();
  const storedState = getStateFromStorage();
  const initialState = view === 'source' ? urlState : storedState ?? DEFAULT_STATE;

  setFormState(initialState);

  if (view === 'source') {
    renderSource(initialState);
    return;
  }

  wireHelper();
  renderPreview();

  if (previewTimer) {
    window.clearInterval(previewTimer);
  }
  previewTimer = window.setInterval(updatePreviewTime, 1000);
};

document.addEventListener('DOMContentLoaded', initialize);
