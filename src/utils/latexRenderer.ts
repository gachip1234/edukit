import katex from 'katex';
import { toPng } from 'html-to-image';

interface CachedRender {
  dataUrl: string;
  width: number;
  height: number;
}

const renderCache = new Map<string, CachedRender>();

let hiddenContainer: HTMLDivElement | null = null;

function getHiddenContainer(): HTMLDivElement {
  if (!hiddenContainer) {
    hiddenContainer = document.createElement('div');
    hiddenContainer.id = 'katex-render-sandbox';
    hiddenContainer.style.position = 'absolute';
    hiddenContainer.style.left = '-9999px';
    hiddenContainer.style.top = '-9999px';
    hiddenContainer.style.pointerEvents = 'none';
    hiddenContainer.style.opacity = '0';
    document.body.appendChild(hiddenContainer);
  }
  return hiddenContainer;
}

export async function renderLatexToImage(
  latex: string,
  fontSize: number = 20,
  color: string = '#1e293b'
): Promise<CachedRender> {
  const cacheKey = `${latex}__${fontSize}__${color}`;
  if (renderCache.has(cacheKey)) {
    return renderCache.get(cacheKey)!;
  }

  const container = getHiddenContainer();
  const wrapper = document.createElement('div');
  wrapper.style.display = 'inline-block';
  wrapper.style.padding = '4px 6px';
  wrapper.style.fontSize = `${fontSize}px`;
  wrapper.style.color = color;
  wrapper.style.backgroundColor = 'transparent';
  wrapper.style.lineHeight = '1.2';

  try {
    // If latex is wrapped in $ or not, render it appropriately
    const cleanLatex = latex.trim();
    const isDisplay = cleanLatex.startsWith('$$') && cleanLatex.endsWith('$$');
    const expr = isDisplay
      ? cleanLatex.slice(2, -2)
      : cleanLatex.startsWith('$') && cleanLatex.endsWith('$')
      ? cleanLatex.slice(1, -1)
      : cleanLatex;

    katex.render(expr, wrapper, {
      displayMode: isDisplay,
      throwOnError: false,
      output: 'htmlAndMathml',
    });

    container.appendChild(wrapper);

    // Give browser brief tick to layout
    const rect = wrapper.getBoundingClientRect();
    const width = Math.max(Math.ceil(rect.width), 20);
    const height = Math.max(Math.ceil(rect.height), 20);

    const dataUrl = await toPng(wrapper, {
      pixelRatio: 3, // High-res crisp rendering for canvas
      backgroundColor: 'transparent',
    });

    const result: CachedRender = { dataUrl, width, height };
    renderCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.warn('Failed to render KaTeX formula, fallback to text:', err);
    // Fallback: render plain text canvas
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = `${fontSize}px serif`;
      ctx.fillStyle = color;
      ctx.fillText(latex, 5, 25);
    }
    const fallback: CachedRender = {
      dataUrl: canvas.toDataURL(),
      width: 200,
      height: 40,
    };
    renderCache.set(cacheKey, fallback);
    return fallback;
  } finally {
    if (wrapper.parentNode) {
      wrapper.parentNode.removeChild(wrapper);
    }
  }
}
