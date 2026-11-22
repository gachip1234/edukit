import React, { useEffect, useState } from 'react';
import { Group, Image as KonvaImage, Rect } from 'react-konva';
import type { LatexElement } from '../types/geometry';
import { renderLatexToImage } from '../utils/latexRenderer';

interface LatexShapeProps {
  element: LatexElement;
  isSelected: boolean;
  onSelect: (e: any) => void;
  onDoubleClick?: () => void;
  onChange: (newAttrs: Partial<LatexElement>) => void;
  draggable: boolean;
  onDragStart?: (e: any) => void;
  onDragMove?: (e: any) => void;
  onDragEnd?: (e: any) => void;
}

export const LatexShape: React.FC<LatexShapeProps> = ({
  element,
  isSelected,
  onSelect,
  onDoubleClick,
  onChange,
  draggable,
  onDragStart,
  onDragMove,
  onDragEnd,
}) => {
  const [imageObj, setImageObj] = useState<HTMLImageElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    let isCancelled = false;

    renderLatexToImage(element.latex, element.fontSize, element.color || element.stroke).then(
      (rendered) => {
        if (isCancelled) return;
        const img = new window.Image();
        img.src = rendered.dataUrl;
        img.onload = () => {
          if (!isCancelled) {
            setImageObj(img);
            setSize({ width: rendered.width, height: rendered.height });
          }
        };
      }
    );

    return () => {
      isCancelled = true;
    };
  }, [element.latex, element.fontSize, element.color, element.stroke]);

  if (!imageObj) return null;

  return (
    <Group
      id={element.id}
      x={element.x}
      y={element.y}
      draggable={draggable}
      onClick={onSelect}
      onTap={onSelect}
      onDblClick={onDoubleClick}
      onDblTap={onDoubleClick}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={(e) => {
        if (onDragEnd) {
          onDragEnd(e);
        } else {
          onChange({
            x: e.target.x(),
            y: e.target.y(),
          });
        }
      }}
    >
      {/* Visual selection outline when selected */}
      {isSelected && (
        <Rect
          x={-4}
          y={-4}
          width={size.width + 8}
          height={size.height + 8}
          stroke="#2563eb"
          strokeWidth={1.5}
          dash={[4, 4]}
          cornerRadius={4}
          fill="rgba(37, 99, 235, 0.05)"
          listening={false}
        />
      )}

      {/* Rendered KaTeX Image */}
      <KonvaImage
        image={imageObj}
        width={size.width}
        height={size.height}
      />
    </Group>
  );
};
