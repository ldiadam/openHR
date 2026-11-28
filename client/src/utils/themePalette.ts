export interface ThemePalette {
  primary: string;
  primaryDark: string;
  primaryLight: string;
  primarySoft: string;
  primaryRing: string;
  onPrimary: string;
  gradient: string;
}

export const DEFAULT_PRIMARY_COLOR = '#E12D53';

export const PRESET_THEME_COLORS: Array<{ name: string; hex: string }> = [
  { name: 'Rose Crimson', hex: '#E12D53' },
  { name: 'Royal Blue', hex: '#2563EB' },
  { name: 'Indigo', hex: '#4F46E5' },
  { name: 'Emerald', hex: '#059669' },
  { name: 'Teal', hex: '#0D9488' },
  { name: 'Amber', hex: '#D97706' },
  { name: 'Violet', hex: '#7C3AED' },
  { name: 'Slate', hex: '#0F172A' },
];

export function normalizeHexColor(input?: string | null): string {
  if (!input) return DEFAULT_PRIMARY_COLOR;
  const trimmed = input.trim();
  const match3 = /^#([0-9a-fA-F]{3})$/.exec(trimmed);
  if (match3) {
    const [r, g, b] = match3[1].split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  const match6 = /^#([0-9a-fA-F]{6})$/.exec(trimmed);
  if (match6) {
    return `#${match6[1].toUpperCase()}`;
  }
  return DEFAULT_PRIMARY_COLOR;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = normalizeHexColor(hex).slice(1);
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function mixRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  weightB: number
): { r: number; g: number; b: number } {
  const w = Math.max(0, Math.min(1, weightB));
  return {
    r: a.r * (1 - w) + b.r * w,
    g: a.g * (1 - w) + b.g * w,
    b: a.b * (1 - w) + b.b * w,
  };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function generateThemePalette(primaryHex?: string | null): ThemePalette {
  const primary = normalizeHexColor(primaryHex);
  const rgb = hexToRgb(primary);
  const darkRgb = mixRgb(rgb, { r: 0, g: 0, b: 0 }, 0.22);
  const lightRgb = mixRgb(rgb, { r: 255, g: 255, b: 255 }, 0.85);
  const softRgb = mixRgb(rgb, { r: 255, g: 255, b: 255 }, 0.93);

  const primaryDark = rgbToHex(darkRgb.r, darkRgb.g, darkRgb.b);
  const primaryLight = rgbToHex(lightRgb.r, lightRgb.g, lightRgb.b);
  const primarySoft = rgbToHex(softRgb.r, softRgb.g, softRgb.b);
  const onPrimary = relativeLuminance(rgb) > 0.45 ? '#0F172A' : '#FFFFFF';

  return {
    primary,
    primaryDark,
    primaryLight,
    primarySoft,
    primaryRing: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.22)`,
    onPrimary,
    gradient: `linear-gradient(135deg, ${primary} 0%, ${primaryDark} 100%)`,
  };
}

export function applyThemePalette(primaryHex?: string | null): ThemePalette {
  const palette = generateThemePalette(primaryHex);
  if (typeof document !== 'undefined') {
    const root = document.documentElement.style;
    root.setProperty('--brand-primary', palette.primary);
    root.setProperty('--brand-primary-dark', palette.primaryDark);
    root.setProperty('--brand-primary-light', palette.primaryLight);
    root.setProperty('--brand-primary-soft', palette.primarySoft);
    root.setProperty('--brand-primary-ring', palette.primaryRing);
    root.setProperty('--brand-on-primary', palette.onPrimary);
    root.setProperty('--brand-gradient', palette.gradient);

    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute('content', palette.primary);
    }
  }
  return palette;
}
