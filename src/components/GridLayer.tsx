import React from 'react';
import { Layer, Line, Text } from 'react-konva';
import { UNIT_STEP, GRID_SUBDIV, getCanvasOrigin } from '../utils/coordinateSystem';

interface GridLayerProps {
  showGrid: boolean;
  showAxes: boolean;
  width: number;
  height: number;
}

export const GridLayer: React.FC<GridLayerProps> = ({
  showGrid,
  showAxes,
  width,
  height,
}) => {
  if (!showGrid && !showAxes) return null;

  const lines: React.ReactNode[] = [];
  const origin = getCanvasOrigin(width, height);
  const originX = origin.x;
  const originY = origin.y;

  // 1. Draw Grid lines if showGrid is true
  if (showGrid) {
    // Vertical grid lines
    for (let x = 0; x <= width; x += GRID_SUBDIV) {
      const isMajor = (x - originX) % UNIT_STEP === 0;
      lines.push(
        <Line
          key={`v-${x}`}
          points={[x, 0, x, height]}
          stroke={isMajor ? '#cbd5e1' : '#f1f5f9'}
          strokeWidth={isMajor ? 1 : 0.6}
          listening={false}
        />
      );
    }

    // Horizontal grid lines
    for (let y = 0; y <= height; y += GRID_SUBDIV) {
      const isMajor = (y - originY) % UNIT_STEP === 0;
      lines.push(
        <Line
          key={`h-${y}`}
          points={[0, y, width, y]}
          stroke={isMajor ? '#cbd5e1' : '#f1f5f9'}
          strokeWidth={isMajor ? 1 : 0.6}
          listening={false}
        />
      );
    }
  }

  // 2. Draw Oxy Axes if showAxes is true
  if (showAxes) {
    // X Axis line
    lines.push(
      <Line
        key="axis-x"
        points={[20, originY, width - 20, originY]}
        stroke="#334155"
        strokeWidth={1.5}
        listening={false}
      />
    );
    // X arrow
    lines.push(
      <Line
        key="arrow-x"
        points={[width - 30, originY - 5, width - 20, originY, width - 30, originY + 5]}
        stroke="#334155"
        strokeWidth={1.5}
        listening={false}
      />
    );
    // X label
    lines.push(
      <Text
        key="label-x"
        x={width - 16}
        y={originY - 18}
        text="x"
        fontStyle="italic bold"
        fontFamily="serif"
        fontSize={16}
        fill="#1e293b"
        listening={false}
      />
    );

    // Y Axis line
    lines.push(
      <Line
        key="axis-y"
        points={[originX, height - 20, originX, 20]}
        stroke="#334155"
        strokeWidth={1.5}
        listening={false}
      />
    );
    // Y arrow
    lines.push(
      <Line
        key="arrow-y"
        points={[originX - 5, 30, originX, 20, originX + 5, 30]}
        stroke="#334155"
        strokeWidth={1.5}
        listening={false}
      />
    );
    // Y label
    lines.push(
      <Text
        key="label-y"
        x={originX + 10}
        y={15}
        text="y"
        fontStyle="italic bold"
        fontFamily="serif"
        fontSize={16}
        fill="#1e293b"
        listening={false}
      />
    );

    // Origin O label
    lines.push(
      <Text
        key="label-o"
        x={originX - 16}
        y={originY + 4}
        text="O"
        fontStyle="italic bold"
        fontFamily="serif"
        fontSize={15}
        fill="#1e293b"
        listening={false}
      />
    );

    // Positive X ticks & numbers
    let unitCount = 1;
    for (let x = originX + UNIT_STEP; x < width - 40; x += UNIT_STEP) {
      lines.push(
        <Line
          key={`tick-x-pos-${unitCount}`}
          points={[x, originY - 4, x, originY + 4]}
          stroke="#475569"
          strokeWidth={1}
          listening={false}
        />,
        <Text
          key={`num-x-pos-${unitCount}`}
          x={x - (unitCount >= 10 ? 7 : 4)}
          y={originY + 7}
          text={`${unitCount}`}
          fontSize={11}
          fill="#64748b"
          listening={false}
        />
      );
      unitCount++;
    }

    // Negative X ticks & numbers
    unitCount = -1;
    for (let x = originX - UNIT_STEP; x > 40; x -= UNIT_STEP) {
      lines.push(
        <Line
          key={`tick-x-neg-${unitCount}`}
          points={[x, originY - 4, x, originY + 4]}
          stroke="#475569"
          strokeWidth={1}
          listening={false}
        />,
        <Text
          key={`num-x-neg-${unitCount}`}
          x={x - (unitCount <= -10 ? 12 : 9)}
          y={originY + 7}
          text={`${unitCount}`}
          fontSize={11}
          fill="#64748b"
          listening={false}
        />
      );
      unitCount--;
    }

    // Positive Y ticks & numbers (upwards on screen, so originY - UNIT_STEP)
    unitCount = 1;
    for (let y = originY - UNIT_STEP; y > 40; y -= UNIT_STEP) {
      lines.push(
        <Line
          key={`tick-y-pos-${unitCount}`}
          points={[originX - 4, y, originX + 4, y]}
          stroke="#475569"
          strokeWidth={1}
          listening={false}
        />,
        <Text
          key={`num-y-pos-${unitCount}`}
          x={originX - (unitCount >= 10 ? 24 : 18)}
          y={y - 6}
          text={`${unitCount}`}
          fontSize={11}
          fill="#64748b"
          listening={false}
        />
      );
      unitCount++;
    }

    // Negative Y ticks & numbers (downwards on screen, so originY + UNIT_STEP)
    unitCount = -1;
    for (let y = originY + UNIT_STEP; y < height - 40; y += UNIT_STEP) {
      lines.push(
        <Line
          key={`tick-y-neg-${unitCount}`}
          points={[originX - 4, y, originX + 4, y]}
          stroke="#475569"
          strokeWidth={1}
          listening={false}
        />,
        <Text
          key={`num-y-neg-${unitCount}`}
          x={originX - (unitCount <= -10 ? 28 : 22)}
          y={y - 6}
          text={`${unitCount}`}
          fontSize={11}
          fill="#64748b"
          listening={false}
        />
      );
      unitCount--;
    }
  }

  return <Layer name="grid-layer">{lines}</Layer>;
};
