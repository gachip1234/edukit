import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  Stage,
  Layer,
  Line as KonvaLine,
  Circle as KonvaCircle,
  Text as KonvaText,
  Group,
  Transformer,
  Rect,
} from 'react-konva';
import type Konva from 'konva';
import type {
  GeoElement,
  ToolType,
  PointElement,
  SegmentElement,
  LineElement,
  CircleElement,
  PolygonElement,
  AngleElement,
  LatexElement,
  GlobalLabelStyle,
} from '../types/geometry';
import {
  getDashArray,
  snapCoordinate,
  distance,
  computeInfiniteLinePoints,
  computeAngleDetails,
  getNextAvailableLabel,
  getNextAvailableLabels,
  findSnapTarget,
  findEdgeAt,
  getEdgesIntersectionAndArms,
  computeSmartPointLabelOffset,
  moveElements,
} from '../utils/mathUtils';
import type { EdgeTarget } from '../utils/mathUtils';
import { GridLayer } from './GridLayer';
import { LatexShape } from './LatexShape';

interface CanvasAreaProps {
  currentTool: ToolType;
  onToolUsed?: () => void;
  elements: GeoElement[];
  onElementsChange: (elements: GeoElement[]) => void;
  selectedIds: string[];
  onSelectIds: (ids: string[]) => void;
  showGrid: boolean;
  showAxes: boolean;
  snapToGrid: boolean;
  stageRef: React.RefObject<Konva.Stage | null>;
  onOpenLatexDialog: (pos: { x: number; y: number }) => void;
  onEditLatexElement?: (element: LatexElement) => void;
  onSelectionPositionChange?: (pos: { x: number; y: number } | null) => void;
  zoom: number;
  globalLabelStyle?: GlobalLabelStyle;
}

export const CanvasArea: React.FC<CanvasAreaProps> = ({
  currentTool,
  elements,
  onElementsChange,
  selectedIds,
  onSelectIds,
  showGrid,
  showAxes,
  snapToGrid,
  stageRef,
  onOpenLatexDialog,
  onEditLatexElement,
  onSelectionPositionChange,
  zoom,
  globalLabelStyle,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  const [dimensions, setDimensions] = useState({ width: 1200, height: 800 });

  // In-progress drawing states
  const [drawingStart, setDrawingStart] = useState<{ x: number; y: number } | null>(null);
  const [currentPointer, setCurrentPointer] = useState<{ x: number; y: number } | null>(null);
  const [polygonVertices, setPolygonVertices] = useState<number[]>([]);
  const [angleClicks, setAngleClicks] = useState<{ x: number; y: number; id?: string }[]>([]);
  const [hoveredEdge, setHoveredEdge] = useState<EdgeTarget | null>(null);
  const [selectedEdge1, setSelectedEdge1] = useState<EdgeTarget | null>(null);
  const [selectedEdge1ClickPos, setSelectedEdge1ClickPos] = useState<{ x: number; y: number } | null>(null);

  // Reset angle clicks & edge selections when tool changes
  useEffect(() => {
    if (currentTool !== 'angle') {
      setAngleClicks([]);
      setHoveredEdge(null);
      setSelectedEdge1(null);
      setSelectedEdge1ClickPos(null);
    }
  }, [currentTool]);

  // Selection marquee box
  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // Group drag reference for preserving relative positions of all selected elements
  const dragGroupRef = useRef<{
    draggedId: string;
    originX: number;
    originY: number;
    elementsSnapshot: GeoElement[];
    selectionIds: string[];
  } | null>(null);

  // Unified click handler with Shift/Ctrl multi-selection support
  const handleElementClick = (
    elId: string,
    e: Konva.KonvaEventObject<MouseEvent | TouchEvent>
  ) => {
    if (currentTool !== 'select') return;
    e.cancelBubble = true;
    const evt = e.evt;
    const isShift = evt && (evt.shiftKey || evt.ctrlKey || evt.metaKey);

    if (isShift) {
      if (selectedIds.includes(elId)) {
        onSelectIds(selectedIds.filter((id) => id !== elId));
      } else {
        onSelectIds([...selectedIds, elId]);
      }
    } else {
      if (!selectedIds.includes(elId)) {
        onSelectIds([elId]);
      }
    }
  };

  // Drag start handler: preserves and prepares multi-selection group drag
  const handleDragStart = (
    el: GeoElement,
    e: Konva.KonvaEventObject<DragEvent>
  ) => {
    if (currentTool !== 'select') return;

    let currentSelection = selectedIds;
    if (!selectedIds.includes(el.id)) {
      currentSelection = [el.id];
      onSelectIds([el.id]);
    }

    if (currentSelection.length > 1) {
      dragGroupRef.current = {
        draggedId: el.id,
        originX: e.target.x(),
        originY: e.target.y(),
        elementsSnapshot: elements,
        selectionIds: currentSelection,
      };
    } else {
      dragGroupRef.current = null;
    }
  };

  // Group drag move handler: moves all selected items synchronously with subpixel precision
  const handleGroupDragMove = (
    el: GeoElement,
    e: Konva.KonvaEventObject<DragEvent>
  ): boolean => {
    if (!dragGroupRef.current || dragGroupRef.current.draggedId !== el.id) {
      return false;
    }
    const stage = e.target.getStage();
    if (!stage) return false;
    const layer = e.target.getLayer();

    const dx = e.target.x() - dragGroupRef.current.originX;
    const dy = e.target.y() - dragGroupRef.current.originY;
    const { elementsSnapshot, selectionIds } = dragGroupRef.current;
    const selSet = new Set(selectionIds);

    elementsSnapshot.forEach((item) => {
      if (item.id === el.id) return;
      if (!selSet.has(item.id)) return;

      if (item.type === 'point') {
        const isLabelOnly = selSet.has('label-' + item.id) && !selSet.has(item.id);
        if (isLabelOnly) {
          const labelNode = stage.findOne<Konva.Group>('#label-' + item.id);
          if (labelNode) {
            const offset = computeSmartPointLabelOffset(item, elementsSnapshot);
            labelNode.position({ x: item.x + offset.x + dx, y: item.y + offset.y + dy });
          }
          return;
        }

        const ptNode = stage.findOne<Konva.Group>('#' + item.id);
        if (ptNode) ptNode.position({ x: item.x + dx, y: item.y + dy });
        const labelNode = stage.findOne<Konva.Group>('#label-' + item.id);
        if (labelNode) {
          const offset = computeSmartPointLabelOffset(item, elementsSnapshot);
          labelNode.position({ x: item.x + offset.x + dx, y: item.y + offset.y + dy });
        }
      } else if (item.type === 'segment') {
        const segNode = stage.findOne<Konva.Line>('#' + item.id);
        if (segNode) segNode.position({ x: dx, y: dy });
      } else if (item.type === 'polygon') {
        const polyNode = stage.findOne<Konva.Line>('#' + item.id);
        if (polyNode) polyNode.position({ x: dx, y: dy });
      } else if (item.type === 'circle') {
        const circNode = stage.findOne<Konva.Circle>('#' + item.id);
        if (circNode) circNode.position({ x: item.cx + dx, y: item.cy + dy });
      } else if (item.type === 'line') {
        const lineNode = stage.findOne<Konva.Line>('#' + item.id);
        if (lineNode) lineNode.position({ x: dx, y: dy });
      } else if (item.type === 'latex') {
        const latexNode = stage.findOne<Konva.Group>('#' + item.id);
        if (latexNode) latexNode.position({ x: item.x + dx, y: item.y + dy });
      } else if (item.type === 'angle' || item.type === 'right_angle') {
        const raNode = stage.findOne<Konva.Line>('#' + item.id);
        if (raNode) raNode.position({ x: dx, y: dy });
        const fillNode = stage.findOne<Konva.Line>('#' + item.id + '-fill');
        if (fillNode) fillNode.position({ x: dx, y: dy });
      }
    });

    // Dynamic stretching for unselected connected segments
    elementsSnapshot.forEach((item) => {
      if (selSet.has(item.id)) return;
      if (item.type === 'segment') {
        let p1x = item.x1;
        let p1y = item.y1;
        let p2x = item.x2;
        let p2y = item.y2;
        let changed = false;

        elementsSnapshot.forEach((p) => {
          if (p.type === 'point' && selSet.has(p.id)) {
            if (Math.hypot(item.x1 - p.x, item.y1 - p.y) < 10) {
              p1x = p.x + dx;
              p1y = p.y + dy;
              changed = true;
            }
            if (Math.hypot(item.x2 - p.x, item.y2 - p.y) < 10) {
              p2x = p.x + dx;
              p2y = p.y + dy;
              changed = true;
            }
          }
        });
        if (changed) {
          const segNode = stage.findOne<Konva.Line>('#' + item.id);
          if (segNode) segNode.points([p1x, p1y, p2x, p2y]);
        }
      }
    });

    if (transformerRef.current) {
      transformerRef.current.getLayer()?.batchDraw();
    }
    if (layer) layer.batchDraw();
    return true;
  };

  // Group drag end handler: resets local Konva offsets and commits translated elements
  const handleGroupDragEnd = (
    el: GeoElement,
    e: Konva.KonvaEventObject<DragEvent>
  ): boolean => {
    if (!dragGroupRef.current || dragGroupRef.current.draggedId !== el.id) {
      return false;
    }
    const stage = e.target.getStage();
    const dx = e.target.x() - dragGroupRef.current.originX;
    const dy = e.target.y() - dragGroupRef.current.originY;
    const { elementsSnapshot, selectionIds } = dragGroupRef.current;
    dragGroupRef.current = null;

    if (stage) {
      selectionIds.forEach((id) => {
        const node = stage.findOne('#' + id);
        if (node) {
          const itemType = elementsSnapshot.find((it) => it.id === id)?.type;
          if (
            itemType === 'segment' ||
            itemType === 'polygon' ||
            itemType === 'line' ||
            itemType === 'angle' ||
            itemType === 'right_angle'
          ) {
            node.position({ x: 0, y: 0 });
          }
          if (itemType === 'angle' || itemType === 'right_angle') {
            const fillNode = stage.findOne('#' + id + '-fill');
            if (fillNode) fillNode.position({ x: 0, y: 0 });
          }
        }
      });
    }

    if (
      el.type === 'segment' ||
      el.type === 'polygon' ||
      el.type === 'line' ||
      el.type === 'angle' ||
      el.type === 'right_angle'
    ) {
      e.target.position({ x: 0, y: 0 });
    }

    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      const updated = moveElements(elementsSnapshot, selectionIds, dx, dy);
      onElementsChange(updated);
    }
    return true;
  };

  // Resize listener
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Update Transformer nodes when selection changes
  useEffect(() => {
    if (!transformerRef.current || !stageRef.current) return;
    const stage = stageRef.current;
    if (selectedIds.length === 0 || currentTool !== 'select') {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
      if (onSelectionPositionChange) onSelectionPositionChange(null);
      return;
    }

    const selectedNodes: Konva.Node[] = [];
    selectedIds.forEach((id) => {
      // Don't attach Transformer resize handles to standalone label
      if (selectedIds.length === 1 && id.startsWith('label-')) return;
      const node = stage.findOne(`#${id}`);
      if (node) selectedNodes.push(node);
    });

    transformerRef.current.nodes(selectedNodes);
    transformerRef.current.getLayer()?.batchDraw();

    // Calculate position for floating bar (supports elements and labels)
    if (selectedIds.length > 0 && onSelectionPositionChange) {
      const firstId = selectedIds[0];
      const targetNode = stage.findOne(`#${firstId}`);
      if (targetNode) {
        const box = targetNode.getClientRect();
        onSelectionPositionChange({
          x: box.x + box.width / 2,
          y: box.y,
        });
      }
    }
  }, [selectedIds, currentTool, elements, onSelectionPositionChange]);

  // Helper to get adjusted coordinates considering snap
  const getPointerPos = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return { x: 0, y: 0 };
      const pos = stage.getPointerPosition();
      if (!pos) return { x: 0, y: 0 };

      // adjust by stage scale / offset if any
      const stageScale = stage.scaleX() || 1;
      let rawX = pos.x / stageScale;
      let rawY = pos.y / stageScale;

      if (snapToGrid) {
        rawX = snapCoordinate(rawX, 25);
        rawY = snapCoordinate(rawY, 25);
      }
      return { x: rawX, y: rawY };
    },
    [snapToGrid]
  );

  // GSP-style point renaming handler
  const handleRenamePoint = (pt: PointElement) => {
    const currentName = pt.label || '';
    const newName = window.prompt('Nhập tên nhãn điểm mới (GSP):', currentName);
    if (newName !== null && newName.trim() !== '') {
      const trimmed = newName.trim();
      const updated = elements.map((item) =>
        item.id === pt.id ? { ...item, label: trimmed } : item
      );
      onElementsChange(updated);
    }
  };

  // Handle stage mouse down
  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const clickedOnEmpty = e.target === e.target.getStage() || e.target.hasName('grid-layer');
    const pos = getPointerPos(e);

    if (currentTool === 'select') {
      if (clickedOnEmpty) {
        onSelectIds([]);
        // Start selection rectangle
        setSelectionBox({
          startX: pos.x,
          startY: pos.y,
          x: pos.x,
          y: pos.y,
          width: 0,
          height: 0,
        });
      }
      return;
    }

    if (currentTool === 'point') {
      // Magnetic snap point onto line, segment, circle, or polygon
      const snap = findSnapTarget(pos, elements, 16);
      const targetPos = snap ? { x: snap.x, y: snap.y } : pos;
      const nextLabel = getNextAvailableLabel(elements);

      const newPoint: PointElement = {
        id: `point-${Date.now()}`,
        type: 'point',
        x: targetPos.x,
        y: targetPos.y,
        radius: 4.5,
        label: nextLabel,
        stroke: '#0f172a',
        strokeWidth: 2,
        strokeStyle: 'solid',
        attachedTo: snap ? snap.attachedTo : undefined,
        constraintMode: 'attached',
      };
      onElementsChange([...elements, newPoint]);
      onSelectIds([newPoint.id]);
      return;
    }

    if (currentTool === 'latex') {
      onOpenLatexDialog(pos);
      return;
    }

    if (currentTool === 'angle') {
      // 1. Edge selection mode: Click to pick edge 1, then edge 2
      const clickedEdge = findEdgeAt(pos, elements, 20);
      if (clickedEdge) {
        if (!selectedEdge1) {
          // Select Edge 1
          setSelectedEdge1(clickedEdge);
          setSelectedEdge1ClickPos(pos);
          setAngleClicks([]);
          return;
        } else {
          // Select Edge 2
          const isSameEdge =
            selectedEdge1.elementId === clickedEdge.elementId &&
            selectedEdge1.edgeIndex === clickedEdge.edgeIndex;
          if (!isSameEdge) {
            const res = getEdgesIntersectionAndArms(
              selectedEdge1,
              clickedEdge,
              selectedEdge1ClickPos || undefined,
              pos
            );
            if (res) {
              const newAngle: AngleElement = {
                id: `angle-${Date.now()}`,
                type: 'angle',
                vx: res.v.x,
                vy: res.v.y,
                p1x: res.p1.x,
                p1y: res.p1.y,
                p2x: res.p2.x,
                p2y: res.p2.y,
                size: 24,
                stroke: '#2563eb',
                strokeWidth: 1.5,
                strokeStyle: 'solid',
                fill: 'rgba(59, 130, 246, 0.2)',
                vertexId: res.v.id,
                p1Id: res.p1.id,
                p2Id: res.p2.id,
                groupId: res.v.id ? elements.find((e) => e.id === res.v.id)?.groupId : undefined,
              };
              onElementsChange([...elements, newAngle]);
              onSelectIds([newAngle.id]);
              setSelectedEdge1(null);
              setSelectedEdge1ClickPos(null);
              setHoveredEdge(null);
              setAngleClicks([]);
              return;
            }
          }
        }
      }

      // 2. Point selection mode fallback (3 clicks: P1 -> V -> P2)
      if (selectedEdge1) {
        // Cancel edge selection if clicked outside
        setSelectedEdge1(null);
        setSelectedEdge1ClickPos(null);
        return;
      }

      const clickedPt = elements.find(
        (el): el is PointElement =>
          el.type === 'point' && Math.hypot(el.x - pos.x, el.y - pos.y) < 20
      );
      const ptPos = clickedPt
        ? { x: clickedPt.x, y: clickedPt.y, id: clickedPt.id }
        : { x: pos.x, y: pos.y };

      const nextClicks = [...angleClicks, ptPos];

      if (nextClicks.length === 3) {
        const [p1, v, p2] = nextClicks;
        const d1 = Math.hypot(v.x - p1.x, v.y - p1.y);
        const d2 = Math.hypot(v.x - p2.x, v.y - p2.y);
        if (d1 > 2 && d2 > 2) {
          const newAngle: AngleElement = {
            id: `angle-${Date.now()}`,
            type: 'angle',
            vx: v.x,
            vy: v.y,
            p1x: p1.x,
            p1y: p1.y,
            p2x: p2.x,
            p2y: p2.y,
            size: 24,
            stroke: '#2563eb',
            strokeWidth: 1.5,
            strokeStyle: 'solid',
            fill: 'rgba(59, 130, 246, 0.2)',
            vertexId: v.id,
            p1Id: p1.id,
            p2Id: p2.id,
            groupId: v.id ? elements.find((e) => e.id === v.id)?.groupId : undefined,
          };
          onElementsChange([...elements, newAngle]);
          onSelectIds([newAngle.id]);
        }
        setAngleClicks([]);
      } else {
        setAngleClicks(nextClicks);
      }
      return;
    }

    if (currentTool === 'polygon') {
      // If clicking near first vertex, close polygon
      if (polygonVertices.length >= 6) {
        const firstX = polygonVertices[0];
        const firstY = polygonVertices[1];
        if (distance(pos.x, pos.y, firstX, firstY) < 18) {
          finishPolygon();
          return;
        }
      }
      setPolygonVertices((prev) => [...prev, pos.x, pos.y]);
      return;
    }

    if (currentTool === 'segment' || currentTool === 'line' || currentTool === 'circle') {
      setDrawingStart(pos);
      setCurrentPointer(pos);
    }
  };

  // Handle mouse move
  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const pos = getPointerPos(e);
    setCurrentPointer(pos);

    if (currentTool === 'angle') {
      const edge = findEdgeAt(pos, elements, 18);
      setHoveredEdge(edge);
    }

    // Update selection marquee box
    if (selectionBox && currentTool === 'select') {
      const sx = selectionBox.startX;
      const sy = selectionBox.startY;
      setSelectionBox({
        startX: sx,
        startY: sy,
        x: Math.min(sx, pos.x),
        y: Math.min(sy, pos.y),
        width: Math.abs(pos.x - sx),
        height: Math.abs(pos.y - sy),
      });
    }
  };

  // Handle mouse up
  const handleMouseUp = () => {
    // Select objects within selection marquee box
    if (selectionBox && currentTool === 'select') {
      if (selectionBox.width > 5 || selectionBox.height > 5) {
        const bx = selectionBox.x;
        const by = selectionBox.y;
        const bw = selectionBox.width;
        const bh = selectionBox.height;

        const insideIds = elements
          .filter((el) => {
            if (el.type === 'point') {
              return el.x >= bx && el.x <= bx + bw && el.y >= by && el.y <= by + bh;
            }
            if (el.type === 'segment' || el.type === 'line') {
              return (
                (el.x1 >= bx && el.x1 <= bx + bw && el.y1 >= by && el.y1 <= by + bh) ||
                (el.x2 >= bx && el.x2 <= bx + bw && el.y2 >= by && el.y2 <= by + bh)
              );
            }
            if (el.type === 'circle') {
              return el.cx >= bx && el.cx <= bx + bw && el.cy >= by && el.cy <= by + bh;
            }
            if (el.type === 'polygon') {
              return el.points.some((p, i) =>
                i % 2 === 0
                  ? p >= bx && p <= bx + bw
                  : p >= by && p <= by + bh
              );
            }
            if (el.type === 'latex') {
              return el.x >= bx && el.x <= bx + bw && el.y >= by && el.y <= by + bh;
            }
            if (el.type === 'right_angle' || el.type === 'angle') {
              return el.vx >= bx && el.vx <= bx + bw && el.vy >= by && el.vy <= by + bh;
            }
            return false;
          })
          .map((el) => el.id);

        onSelectIds(insideIds);
      }
      setSelectionBox(null);
      return;
    }

    if (!drawingStart || !currentPointer) return;

    const dx = currentPointer.x - drawingStart.x;
    const dy = currentPointer.y - drawingStart.y;
    const dist = Math.hypot(dx, dy);

    // Minimum distance threshold to avoid accidental tiny shapes
    if (dist > 8) {
      if (currentTool === 'segment') {
        const segGid = `seg-group-${Date.now()}`;
        const newSeg: SegmentElement = {
          id: `seg-${Date.now()}`,
          type: 'segment',
          groupId: segGid,
          x1: drawingStart.x,
          y1: drawingStart.y,
          x2: currentPointer.x,
          y2: currentPointer.y,
          stroke: '#0f172a',
          strokeWidth: 2,
          strokeStyle: 'solid',
        };

        // Automatically assign alphabet points to the two segment endpoints like GSP
        const labels = getNextAvailableLabels(elements, 2);
        const pt1: PointElement = {
          id: `pt-${labels[0]}-${Date.now()}-1`,
          type: 'point',
          groupId: segGid,
          x: drawingStart.x,
          y: drawingStart.y,
          radius: 4.5,
          label: labels[0],
          stroke: '#0f172a',
          strokeWidth: 2,
          strokeStyle: 'solid',
        };
        const pt2: PointElement = {
          id: `pt-${labels[1]}-${Date.now()}-2`,
          type: 'point',
          groupId: segGid,
          x: currentPointer.x,
          y: currentPointer.y,
          radius: 4.5,
          label: labels[1],
          stroke: '#0f172a',
          strokeWidth: 2,
          strokeStyle: 'solid',
        };

        onElementsChange([...elements, newSeg, pt1, pt2]);
        onSelectIds([newSeg.id]);
      } else if (currentTool === 'line') {
        const newLine: LineElement = {
          id: `line-${Date.now()}`,
          type: 'line',
          x1: drawingStart.x,
          y1: drawingStart.y,
          x2: currentPointer.x,
          y2: currentPointer.y,
          stroke: '#0f172a',
          strokeWidth: 2,
          strokeStyle: 'solid',
        };
        onElementsChange([...elements, newLine]);
        onSelectIds([newLine.id]);
      } else if (currentTool === 'circle') {
        const newCircle: CircleElement = {
          id: `circle-${Date.now()}`,
          type: 'circle',
          cx: drawingStart.x,
          cy: drawingStart.y,
          radius: Math.round(dist),
          stroke: '#0f172a',
          strokeWidth: 2,
          strokeStyle: 'solid',
          fill: 'transparent',
        };
        onElementsChange([...elements, newCircle]);
        onSelectIds([newCircle.id]);
      }
    }

    setDrawingStart(null);
    setCurrentPointer(null);
  };

  // Finish polygon drawing
  const finishPolygon = () => {
    if (polygonVertices.length >= 6) {
      const polyGid = `poly-group-${Date.now()}`;
      const newPoly: PolygonElement = {
        id: `poly-${Date.now()}`,
        type: 'polygon',
        groupId: polyGid,
        points: [...polygonVertices],
        stroke: '#2563eb',
        strokeWidth: 2,
        strokeStyle: 'solid',
        fill: 'rgba(59, 130, 246, 0.2)',
        closed: true,
      };

      // Automatically assign alphabet points to each vertex of the polygon like GSP
      const vertexCount = polygonVertices.length / 2;
      const labels = getNextAvailableLabels(elements, vertexCount);
      const newPoints: PointElement[] = [];
      for (let i = 0; i < polygonVertices.length; i += 2) {
        const vx = polygonVertices[i];
        const vy = polygonVertices[i + 1];
        const lbl = labels[i / 2];
        newPoints.push({
          id: `pt-${lbl}-${Date.now()}-${i / 2}`,
          type: 'point',
          groupId: polyGid,
          x: vx,
          y: vy,
          radius: 4.5,
          label: lbl,
          stroke: '#0f172a',
          strokeWidth: 2,
          strokeStyle: 'solid',
          constraintMode: 'control', // Mặc định là điểm khóa cho các đỉnh đa giác
          attachedTo: {
            elementId: newPoly.id,
            type: 'polygon',
            edgeIndex: i / 2,
          },
        });
      }

      onElementsChange([...elements, newPoly, ...newPoints]);
      onSelectIds([newPoly.id]);
    }
    setPolygonVertices([]);
  };

  // Double click closes polygon
  const handleDblClick = () => {
    if (currentTool === 'polygon') {
      finishPolygon();
    }
  };

  // Render preview while drawing
  const renderDrawingPreview = () => {
    if (currentTool === 'segment' && drawingStart && currentPointer) {
      return (
        <KonvaLine
          points={[drawingStart.x, drawingStart.y, currentPointer.x, currentPointer.y]}
          stroke="#2563eb"
          strokeWidth={2}
          dash={[5, 5]}
        />
      );
    }
    if (currentTool === 'line' && drawingStart && currentPointer) {
      const [lx1, ly1, lx2, ly2] = computeInfiniteLinePoints(
        drawingStart.x,
        drawingStart.y,
        currentPointer.x,
        currentPointer.y,
        dimensions.width,
        dimensions.height
      );
      return (
        <KonvaLine
          points={[lx1, ly1, lx2, ly2]}
          stroke="#2563eb"
          strokeWidth={2}
          dash={[5, 5]}
        />
      );
    }
    if (currentTool === 'circle' && drawingStart && currentPointer) {
      const r = Math.hypot(currentPointer.x - drawingStart.x, currentPointer.y - drawingStart.y);
      return (
        <KonvaCircle
          x={drawingStart.x}
          y={drawingStart.y}
          radius={r}
          stroke="#2563eb"
          strokeWidth={2}
          dash={[5, 5]}
          fill="rgba(59, 130, 246, 0.1)"
        />
      );
    }
    if (currentTool === 'polygon' && polygonVertices.length > 0 && currentPointer) {
      const previewPoints = [...polygonVertices, currentPointer.x, currentPointer.y];
      return (
        <Group>
          <KonvaLine
            points={previewPoints}
            stroke="#2563eb"
            strokeWidth={2}
            dash={[4, 4]}
            fill="rgba(59, 130, 246, 0.15)"
            closed={polygonVertices.length >= 4}
          />
          {/* Start vertex circle indicator */}
          <KonvaCircle
            x={polygonVertices[0]}
            y={polygonVertices[1]}
            radius={7}
            fill="#2563eb"
            opacity={0.7}
          />
        </Group>
      );
    }
    if (currentTool === 'angle') {
      const previewNodes: React.ReactNode[] = [];

      // A. Edge 1 Selected Highlight
      if (selectedEdge1) {
        const midX = (selectedEdge1.x1 + selectedEdge1.x2) / 2;
        const midY = (selectedEdge1.y1 + selectedEdge1.y2) / 2;
        previewNodes.push(
          <Group key="selected-edge-1" listening={false}>
            {/* Outer glowing halo */}
            <KonvaLine
              points={[selectedEdge1.x1, selectedEdge1.y1, selectedEdge1.x2, selectedEdge1.y2]}
              stroke="#10b981"
              strokeWidth={9}
              opacity={0.65}
              lineCap="round"
            />
            {/* Core sharp line */}
            <KonvaLine
              points={[selectedEdge1.x1, selectedEdge1.y1, selectedEdge1.x2, selectedEdge1.y2]}
              stroke="#059669"
              strokeWidth={3}
              opacity={1}
              lineCap="round"
            />
            {/* Click dot on edge 1 */}
            {selectedEdge1ClickPos && (
              <KonvaCircle
                x={selectedEdge1ClickPos.x}
                y={selectedEdge1ClickPos.y}
                radius={5}
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth={2}
              />
            )}
            {/* Label badge */}
            <KonvaText
              text={`Cạnh 1: ${selectedEdge1.label || 'Đã chọn'}`}
              x={midX + 8}
              y={midY - 14}
              fontSize={11}
              fontStyle="bold"
              fill="#065f46"
            />
          </Group>
        );
      }

      // B. Hovered Edge Highlight
      if (
        hoveredEdge &&
        (!selectedEdge1 ||
          selectedEdge1.elementId !== hoveredEdge.elementId ||
          selectedEdge1.edgeIndex !== hoveredEdge.edgeIndex)
      ) {
        const midX = (hoveredEdge.x1 + hoveredEdge.x2) / 2;
        const midY = (hoveredEdge.y1 + hoveredEdge.y2) / 2;
        previewNodes.push(
          <Group key="hovered-edge" listening={false}>
            {/* Outer halo */}
            <KonvaLine
              points={[hoveredEdge.x1, hoveredEdge.y1, hoveredEdge.x2, hoveredEdge.y2]}
              stroke="#f59e0b"
              strokeWidth={9}
              opacity={0.65}
              lineCap="round"
            />
            {/* Core line */}
            <KonvaLine
              points={[hoveredEdge.x1, hoveredEdge.y1, hoveredEdge.x2, hoveredEdge.y2]}
              stroke="#d97706"
              strokeWidth={3}
              opacity={1}
              lineCap="round"
            />
            {/* Label badge */}
            <KonvaText
              text={
                selectedEdge1
                  ? `Cạnh 2 (${hoveredEdge.label || ''}) - Click để tạo góc`
                  : `Click chọn cạnh ${hoveredEdge.label || ''}`
              }
              x={midX + 8}
              y={midY - 14}
              fontSize={11}
              fontStyle="bold"
              fill="#b45309"
            />
          </Group>
        );
      }

      // C. Live angle preview between selectedEdge1 and hoveredEdge
      if (
        selectedEdge1 &&
        hoveredEdge &&
        (selectedEdge1.elementId !== hoveredEdge.elementId ||
          selectedEdge1.edgeIndex !== hoveredEdge.edgeIndex)
      ) {
        const res = getEdgesIntersectionAndArms(
          selectedEdge1,
          hoveredEdge,
          selectedEdge1ClickPos || undefined,
          currentPointer || undefined
        );
        if (res) {
          const details = computeAngleDetails(
            res.v.x,
            res.v.y,
            res.p1.x,
            res.p1.y,
            res.p2.x,
            res.p2.y,
            24
          );
          previewNodes.push(
            <Group key="edge-angle-preview" listening={false}>
              {/* Sector fill preview tightly hugging both edges and vertex */}
              <KonvaLine
                points={details.fillPoints}
                closed={true}
                fill="rgba(59, 130, 246, 0.3)"
              />
              {/* Arc / box stroke preview */}
              <KonvaLine
                points={details.strokePoints}
                stroke="#2563eb"
                strokeWidth={2.5}
              />
              {/* Exact start point K1 on edge 1 */}
              <KonvaCircle
                x={details.k1.x}
                y={details.k1.y}
                radius={4.5}
                fill="#10b981"
                stroke="#ffffff"
                strokeWidth={1.5}
              />
              {/* Exact end point K2 on edge 2 */}
              <KonvaCircle
                x={details.k2.x}
                y={details.k2.y}
                radius={4.5}
                fill="#f59e0b"
                stroke="#ffffff"
                strokeWidth={1.5}
              />
              {/* Vertex V dot */}
              <KonvaCircle
                x={res.v.x}
                y={res.v.y}
                radius={5}
                fill="#2563eb"
                stroke="#ffffff"
                strokeWidth={2}
              />
              {/* Degree label */}
              <KonvaText
                text={details.isRightAngle ? '90° (Vuông)' : `${Math.round(details.degrees)}°`}
                x={details.labelPos.x}
                y={details.labelPos.y}
                fontSize={12}
                fontStyle="bold"
                fill="#1d4ed8"
              />
            </Group>
          );
        }
      }

      // D. Point-by-point preview if user is clicking points
      if (angleClicks.length === 1 && currentPointer) {
        const p1 = angleClicks[0];
        previewNodes.push(
          <Group key="pt-preview-1" listening={false}>
            <KonvaLine
              points={[p1.x, p1.y, currentPointer.x, currentPointer.y]}
              stroke="#2563eb"
              strokeWidth={1.5}
              dash={[4, 4]}
            />
            <KonvaCircle
              x={p1.x}
              y={p1.y}
              radius={6}
              fill="#bfdbfe"
              stroke="#2563eb"
              strokeWidth={2}
            />
          </Group>
        );
      }
      if (angleClicks.length === 2 && currentPointer) {
        const [p1, v] = angleClicks;
        const details = computeAngleDetails(
          v.x,
          v.y,
          p1.x,
          p1.y,
          currentPointer.x,
          currentPointer.y,
          24
        );
        previewNodes.push(
          <Group key="pt-preview-2" listening={false}>
            <KonvaLine
              points={details.fillPoints}
              closed={true}
              fill="rgba(59, 130, 246, 0.2)"
            />
            <KonvaLine
              points={details.strokePoints}
              stroke="#2563eb"
              strokeWidth={2}
            />
            <KonvaCircle x={p1.x} y={p1.y} radius={5} fill="#3b82f6" />
            <KonvaCircle x={v.x} y={v.y} radius={6} fill="#1d4ed8" stroke="#fff" strokeWidth={2} />
          </Group>
        );
      }

      if (previewNodes.length > 0) {
        return <Group>{previewNodes}</Group>;
      }
    }
    return null;
  };

  // Render ghost/translucent preview following cursor to indicate current tool
  const renderGhostCursor = () => {
    if (!currentPointer || currentTool === 'select' || drawingStart) return null;

    const snap = currentTool === 'point' ? findSnapTarget(currentPointer, elements, 16) : null;
    const targetX = snap ? snap.x : currentPointer.x;
    const targetY = snap ? snap.y : currentPointer.y;

    switch (currentTool) {
      case 'point': {
        const nextLabel = getNextAvailableLabel(elements);
        return (
          <Group x={targetX} y={targetY} listening={false}>
            {/* Magnetic snap indicator halo */}
            {snap && (
              <KonvaCircle
                radius={12}
                stroke="#10b981"
                strokeWidth={1.5}
                dash={[3, 3]}
                fill="rgba(16, 185, 129, 0.18)"
              />
            )}
            <KonvaCircle
              radius={snap ? 5.5 : 4.5}
              fill={snap ? '#10b981' : 'rgba(37, 99, 235, 0.7)'}
              stroke="#ffffff"
              strokeWidth={1.5}
            />
            <KonvaText
              text={snap ? `${nextLabel} (Hút: ${snap.desc})` : nextLabel}
              x={9}
              y={-18}
              fontSize={13}
              fontStyle="italic bold"
              fontFamily="serif"
              fill={snap ? '#059669' : 'rgba(37, 99, 235, 0.85)'}
            />
          </Group>
        );
      }

      case 'segment': {
        return (
          <Group x={currentPointer.x + 16} y={currentPointer.y + 16} listening={false} opacity={0.65}>
            <KonvaLine points={[-12, 10, 12, -10]} stroke="#2563eb" strokeWidth={2} />
            <KonvaCircle x={-12} y={10} radius={3} fill="#2563eb" />
            <KonvaCircle x={12} y={-10} radius={3} fill="#2563eb" />
          </Group>
        );
      }

      case 'line': {
        return (
          <Group x={currentPointer.x + 16} y={currentPointer.y + 16} listening={false} opacity={0.65}>
            <KonvaLine points={[-16, 12, 16, -12]} stroke="#2563eb" strokeWidth={2} dash={[4, 2]} />
            <KonvaCircle x={-6} y={4.5} radius={2.5} fill="#2563eb" />
            <KonvaCircle x={6} y={-4.5} radius={2.5} fill="#2563eb" />
          </Group>
        );
      }

      case 'circle': {
        return (
          <Group x={currentPointer.x + 18} y={currentPointer.y + 18} listening={false} opacity={0.65}>
            <KonvaCircle radius={11} stroke="#2563eb" strokeWidth={1.5} dash={[3, 3]} />
            <KonvaCircle radius={2} fill="#2563eb" />
          </Group>
        );
      }

      case 'polygon': {
        if (polygonVertices.length > 0) return null;
        return (
          <Group x={currentPointer.x + 18} y={currentPointer.y + 18} listening={false} opacity={0.65}>
            <KonvaLine
              points={[0, -11, 10, 9, -10, 9]}
              closed={true}
              stroke="#2563eb"
              strokeWidth={1.5}
              fill="rgba(59, 130, 246, 0.25)"
            />
          </Group>
        );
      }

      case 'angle': {
        const stepText = selectedEdge1
          ? 'Click chọn Cạnh 2'
          : angleClicks.length === 1
          ? 'Click đỉnh góc'
          : angleClicks.length === 2
          ? 'Click điểm trên cạnh 2'
          : 'Click chọn Cạnh 1 (hoặc điểm)';
        return (
          <Group x={currentPointer.x + 16} y={currentPointer.y + 16} listening={false} opacity={0.95}>
            <KonvaLine points={[-12, 10, 0, 10, 8, -6]} stroke={selectedEdge1 ? '#059669' : '#2563eb'} strokeWidth={2} />
            <KonvaLine points={[-4, 10, -2, 5, 4, 3]} stroke={selectedEdge1 ? '#059669' : '#2563eb'} strokeWidth={1.5} />
            <KonvaText
              text={stepText}
              x={12}
              y={-4}
              fontSize={11}
              fontStyle="bold"
              fill={selectedEdge1 ? '#059669' : '#1d4ed8'}
            />
          </Group>
        );
      }

      case 'latex': {
        return (
          <Group x={currentPointer.x + 16} y={currentPointer.y + 16} listening={false} opacity={0.75}>
            <KonvaText
              text="f(x)"
              fontSize={14}
              fontStyle="italic bold"
              fontFamily="serif"
              fill="#2563eb"
            />
          </Group>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-slate-50/50 overflow-hidden cursor-crosshair select-none"
      style={{
        cursor: currentTool === 'select' ? 'default' : 'crosshair',
      }}
    >
      <Stage
        ref={stageRef}
        width={dimensions.width}
        height={dimensions.height}
        scaleX={zoom}
        scaleY={zoom}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDblClick={handleDblClick}
      >
        {/* Layer 1: Coordinate Grid & Axes */}
        <GridLayer
          showGrid={showGrid}
          showAxes={showAxes}
          width={dimensions.width / zoom}
          height={dimensions.height / zoom}
          hideOriginLabel={elements.some(
            (el) => el.type === 'point' && (el as PointElement).label?.trim().toUpperCase() === 'O',
          )}
        />

        {/* Layer 2: Main Geometry Shapes */}
        <Layer name="shapes-layer">
          {elements.map((el) => {
            const isSelected = selectedIds.includes(el.id);
            const isDraggable = currentTool === 'select';
            const dash = getDashArray(el.strokeStyle, el.strokeWidth);

            switch (el.type) {
              case 'point': {
                const isLabelSelected = selectedIds.includes('label-' + el.id);
                const offset = computeSmartPointLabelOffset(el, elements);
                const fSize = el.labelFontSize || globalLabelStyle?.fontSize || 15;
                const fColor = el.labelColor || globalLabelStyle?.color || el.stroke || '#0f172a';
                const fFamily = el.labelFontFamily || globalLabelStyle?.fontFamily || 'serif';
                const fStyle = el.labelFontStyle || globalLabelStyle?.fontStyle || 'italic bold';

                return (
                  <React.Fragment key={el.id}>
                    <Group
                      id={el.id}
                      x={el.x}
                      y={el.y}
                      draggable={isDraggable}
                      onClick={(e) => handleElementClick(el.id, e)}
                      onTap={(e) => handleElementClick(el.id, e)}
                      onDblClick={(e) => {
                        e.cancelBubble = true;
                        handleRenamePoint(el);
                      }}
                      onDragStart={(e) => handleDragStart(el, e)}
                      onDragMove={(e) => {
                        if (handleGroupDragMove(el, e)) return;
                        const curX = e.target.x();
                        const curY = e.target.y();
                        const oldX = el.x;
                        const oldY = el.y;
                        const stage = e.target.getStage();
                        if (!stage) return;
                        const layer = e.target.getLayer();

                        // Sync independent label position during point drag
                        const labelNode = stage.findOne<Konva.Group>('#label-' + el.id);
                        if (labelNode) {
                          labelNode.position({ x: curX + offset.x, y: curY + offset.y });
                        }

                      // 1. Real-time dynamic stretching for connected segments
                      elements.forEach((item) => {
                        if (item.type === 'segment') {
                          const at1 = Math.hypot(item.x1 - oldX, item.y1 - oldY) < 10;
                          const at2 = Math.hypot(item.x2 - oldX, item.y2 - oldY) < 10;
                          if (at1 || at2) {
                            const segNode = stage.findOne<Konva.Line>('#' + item.id);
                            if (segNode) {
                              const p1x = at1 ? curX : item.x1;
                              const p1y = at1 ? curY : item.y1;
                              const p2x = at2 ? curX : item.x2;
                              const p2y = at2 ? curY : item.y2;
                              segNode.points([p1x, p1y, p2x, p2y]);
                            }
                          }
                        }

                        // 2. Real-time dynamic stretching for connected polygons: only move matching vertex
                        if (item.type === 'polygon') {
                          const polyNode = stage.findOne<Konva.Line>('#' + item.id);
                          if (polyNode) {
                            const pts = [...item.points];
                            let bestIdx = -1;
                            let minD = 14;
                            for (let i = 0; i < pts.length; i += 2) {
                              const d = Math.hypot(pts[i] - oldX, pts[i + 1] - oldY);
                              if (d < minD) {
                                minD = d;
                                bestIdx = i;
                              }
                            }
                            if (bestIdx !== -1) {
                              pts[bestIdx] = curX;
                              pts[bestIdx + 1] = curY;
                              polyNode.points(pts);
                            }
                          }
                        }

                        // 3. Real-time dynamic rotation and positioning for connected angle / right-angle marks
                        if (item.type === 'right_angle' || item.type === 'angle') {
                          const raNode = stage.findOne<Konva.Line>('#' + item.id);
                          if (raNode) {
                            let nvx = item.vx;
                            let nvy = item.vy;
                            let np1x = item.p1x;
                            let np1y = item.p1y;
                            let np2x = item.p2x;
                            let np2y = item.p2y;
                            let raChanged = false;

                            if (item.vertexId === el.id || Math.hypot(item.vx - oldX, item.vy - oldY) < 10) {
                              nvx = curX;
                              nvy = curY;
                              raChanged = true;
                            }
                            if (item.p1Id === el.id || Math.hypot(item.p1x - oldX, item.p1y - oldY) < 10) {
                              np1x = curX;
                              np1y = curY;
                              raChanged = true;
                            }
                            if (item.p2Id === el.id || Math.hypot(item.p2x - oldX, item.p2y - oldY) < 10) {
                              np2x = curX;
                              np2y = curY;
                              raChanged = true;
                            }

                            if (raChanged) {
                              const details = computeAngleDetails(
                                nvx,
                                nvy,
                                np1x,
                                np1y,
                                np2x,
                                np2y,
                                item.size || 24
                              );
                              raNode.points(details.strokePoints);
                              const fillNode = stage.findOne<Konva.Line>('#' + item.id + '-fill');
                              if (fillNode) {
                                fillNode.points(details.fillPoints);
                              }
                            }
                          }
                        }
                      });

                      // 4. Đặc tính 2 (Khóa dính / Điều khiển hình): Thay đổi bán kính đường tròn hoặc kéo co dãn mút đoạn thẳng
                      if (el.constraintMode === 'control') {
                        // a. Đường tròn: thay đổi bán kính theo khoảng cách từ tâm đến vị trí chuột
                        const circleEl = elements.find(
                          (item) =>
                            item.type === 'circle' &&
                            (item.id === el.attachedTo?.elementId ||
                              Math.abs(Math.hypot(oldX - (item as CircleElement).cx, oldY - (item as CircleElement).cy) - (item as CircleElement).radius) < 15)
                        ) as CircleElement | undefined;

                        if (circleEl) {
                          const newRadius = Math.max(5, Math.round(Math.hypot(curX - circleEl.cx, curY - circleEl.cy)));
                          const circleNode = stage.findOne<Konva.Circle>('#' + circleEl.id);
                          if (circleNode) {
                            circleNode.radius(newRadius);
                          }
                        }

                        // b. Đoạn thẳng: co dãn đầu mút gần nhất
                        const segEl = elements.find(
                          (item) => item.type === 'segment' && item.id === el.attachedTo?.elementId
                        ) as SegmentElement | undefined;
                        if (segEl) {
                          const segNode = stage.findOne<Konva.Line>('#' + segEl.id);
                          if (segNode) {
                            const d1 = Math.hypot(segEl.x1 - oldX, segEl.y1 - oldY);
                            const d2 = Math.hypot(segEl.x2 - oldX, segEl.y2 - oldY);
                            if (d1 < d2) {
                              segNode.points([curX, curY, segEl.x2, segEl.y2]);
                            } else {
                              segNode.points([segEl.x1, segEl.y1, curX, curY]);
                            }
                          }
                        }
                      }

                      if (layer) {
                        layer.batchDraw();
                      }
                    }}
                    onDragEnd={(e) => {
                      if (handleGroupDragEnd(el, e)) return;
                      const rawX = e.target.x();
                      const rawY = e.target.y();
                      const oldX = el.x;
                      const oldY = el.y;

                      // A. Xử lý Đặc tính 2 (Khóa dính / Điều khiển hình) cho đường tròn và đoạn thẳng
                      if (el.constraintMode === 'control') {
                        // 1. Đường tròn: Cập nhật bán kính mới
                        const targetCircle = elements.find(
                          (item) =>
                            item.type === 'circle' &&
                            (item.id === el.attachedTo?.elementId ||
                              Math.abs(Math.hypot(oldX - (item as CircleElement).cx, oldY - (item as CircleElement).cy) - (item as CircleElement).radius) < 15)
                        ) as CircleElement | undefined;

                        if (targetCircle) {
                          const newRadius = Math.max(5, Math.round(Math.hypot(rawX - targetCircle.cx, rawY - targetCircle.cy)));
                          const angle = Math.atan2(rawY - targetCircle.cy, rawX - targetCircle.cx);
                          const updated = elements.map((item) => {
                            if (item.id === targetCircle.id) {
                              return { ...item, radius: newRadius };
                            }
                            if (item.id === el.id) {
                              return {
                                ...item,
                                x: rawX,
                                y: rawY,
                                attachedTo: {
                                  elementId: targetCircle.id,
                                  type: 'circle' as const,
                                  angle: angle,
                                },
                              };
                            }
                            return item;
                          });
                          onElementsChange(updated);
                          return;
                        }

                        // 2. Đoạn thẳng: Cập nhật mút đoạn thẳng
                        const targetSeg = elements.find(
                          (item) => item.type === 'segment' && item.id === el.attachedTo?.elementId
                        ) as SegmentElement | undefined;
                        if (targetSeg) {
                          const d1 = Math.hypot(targetSeg.x1 - oldX, targetSeg.y1 - oldY);
                          const d2 = Math.hypot(targetSeg.x2 - oldX, targetSeg.y2 - oldY);
                          const updated = elements.map((item) => {
                            if (item.id === targetSeg.id) {
                              if (d1 < d2) {
                                return { ...item, x1: rawX, y1: rawY };
                              } else {
                                return { ...item, x2: rawX, y2: rawY };
                              }
                            }
                            if (item.id === el.id) {
                              return { ...item, x: rawX, y: rawY };
                            }
                            return item;
                          });
                          onElementsChange(updated);
                          return;
                        }
                      }

                      // B. Xử lý di chuyển điểm và cập nhật các liên kết hình học
                      const snap = findSnapTarget({ x: rawX, y: rawY }, elements, 16, el.id);
                      const newX = snap ? snap.x : rawX;
                      const newY = snap ? snap.y : rawY;
                      const newAttachedTo = snap ? snap.attachedTo : el.attachedTo;

                      const updated = elements.map((item) => {
                        if (item.id === el.id) {
                          return {
                            ...item,
                            x: newX,
                            y: newY,
                            stroke: item.stroke,
                            attachedTo: newAttachedTo,
                          };
                        }

                        // If a polygon has a vertex at (oldX, oldY), ONLY update that specific vertex
                        if (item.type === 'polygon') {
                          let bestIdx = -1;
                          let minD = 14;
                          for (let i = 0; i < item.points.length; i += 2) {
                            const d = Math.hypot(item.points[i] - oldX, item.points[i + 1] - oldY);
                            if (d < minD) {
                              minD = d;
                              bestIdx = i;
                            }
                          }
                          if (bestIdx !== -1) {
                            const newPoints = [...item.points];
                            newPoints[bestIdx] = newX;
                            newPoints[bestIdx + 1] = newY;
                            return { ...item, points: newPoints };
                          }
                        }

                        // If a segment connects to this point, update endpoint
                        if (item.type === 'segment') {
                          let sChanged = false;
                          let nx1 = item.x1;
                          let ny1 = item.y1;
                          let nx2 = item.x2;
                          let ny2 = item.y2;
                          if (Math.hypot(item.x1 - oldX, item.y1 - oldY) < 10) {
                            nx1 = newX;
                            ny1 = newY;
                            sChanged = true;
                          }
                          if (Math.hypot(item.x2 - oldX, item.y2 - oldY) < 10) {
                            nx2 = newX;
                            ny2 = newY;
                            sChanged = true;
                          }
                          if (sChanged) {
                            return { ...item, x1: nx1, y1: ny1, x2: nx2, y2: ny2 };
                          }
                        }

                        // If an angle / right angle symbol is attached to this point
                        if (item.type === 'right_angle' || item.type === 'angle') {
                          let raChanged = false;
                          let nvx = item.vx;
                          let nvy = item.vy;
                          let np1x = item.p1x;
                          let np1y = item.p1y;
                          let np2x = item.p2x;
                          let np2y = item.p2y;

                          if (item.vertexId === el.id || Math.hypot(item.vx - oldX, item.vy - oldY) < 10) {
                            nvx = newX;
                            nvy = newY;
                            raChanged = true;
                          }
                          if (item.p1Id === el.id || Math.hypot(item.p1x - oldX, item.p1y - oldY) < 10) {
                            np1x = newX;
                            np1y = newY;
                            raChanged = true;
                          }
                          if (item.p2Id === el.id || Math.hypot(item.p2x - oldX, item.p2y - oldY) < 10) {
                            np2x = newX;
                            np2y = newY;
                            raChanged = true;
                          }

                          if (raChanged) {
                            return {
                              ...item,
                              vx: nvx,
                              vy: nvy,
                              p1x: np1x,
                              p1y: np1y,
                              p2x: np2x,
                              p2y: np2y,
                            };
                          }
                        }

                        return item;
                      });
                      onElementsChange(updated);
                    }}
                  >
                    <KonvaCircle
                      radius={el.radius}
                      fill={el.stroke}
                      stroke={isSelected ? '#3b82f6' : '#ffffff'}
                      strokeWidth={isSelected ? 3 : 1.5}
                      shadowColor="rgba(0,0,0,0.2)"
                      shadowBlur={isSelected ? 6 : 2}
                    />
                  </Group>

                  {/* Independent Draggable & Selectable Label */}
                  {el.label && (
                    <Group
                      key={'label-' + el.id}
                      id={'label-' + el.id}
                      x={el.x + offset.x}
                      y={el.y + offset.y}
                      draggable={isDraggable}
                      onClick={(e) => handleElementClick('label-' + el.id, e)}
                      onTap={(e) => handleElementClick('label-' + el.id, e)}
                      onDblClick={(e) => {
                        e.cancelBubble = true;
                        handleRenamePoint(el);
                      }}
                      onMouseEnter={(e) => {
                        if (currentTool === 'select') {
                          const stage = e.target.getStage();
                          if (stage) stage.container().style.cursor = 'grab';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (currentTool === 'select') {
                          const stage = e.target.getStage();
                          if (stage) stage.container().style.cursor = 'default';
                        }
                      }}
                      onDragStart={(e) => {
                        e.cancelBubble = true;
                        handleDragStart({ ...el, id: 'label-' + el.id }, e);
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = 'grabbing';
                      }}
                      onDragMove={(e) => {
                        e.cancelBubble = true;
                        if (handleGroupDragMove({ ...el, id: 'label-' + el.id }, e)) return;
                        e.target.getLayer()?.batchDraw();
                      }}
                      onDragEnd={(e) => {
                        e.cancelBubble = true;
                        const stage = e.target.getStage();
                        if (stage) stage.container().style.cursor = 'default';
                        if (handleGroupDragEnd({ ...el, id: 'label-' + el.id }, e)) return;

                        const rawX = e.target.x();
                        const rawY = e.target.y();
                        const newOffsetX = Math.round(rawX - el.x);
                        const newOffsetY = Math.round(rawY - el.y);

                        const updated = elements.map((item) =>
                          item.id === el.id
                            ? {
                                ...item,
                                labelOffset: { x: newOffsetX, y: newOffsetY },
                              }
                            : item
                        );
                        onElementsChange(updated);
                      }}
                    >
                      {/* Selection Halo Box */}
                      {isLabelSelected && (
                        <Rect
                          x={-3}
                          y={-2}
                          width={Math.max(18, el.label.length * (fSize * 0.72) + 6)}
                          height={fSize + 4}
                          stroke="#2563eb"
                          strokeWidth={1.5}
                          dash={[3, 3]}
                          fill="rgba(37, 99, 235, 0.12)"
                          cornerRadius={3}
                          listening={false}
                        />
                      )}

                      <KonvaText
                        text={el.label}
                        x={0}
                        y={0}
                        fontSize={fSize}
                        fontStyle={fStyle}
                        fontFamily={fFamily}
                        fill={isLabelSelected ? '#2563eb' : fColor}
                      />
                    </Group>
                  )}
                </React.Fragment>
              );
            }

              case 'segment': {
                return (
                  <KonvaLine
                    key={el.id}
                    id={el.id}
                    points={[el.x1, el.y1, el.x2, el.y2]}
                    stroke={isSelected ? '#2563eb' : el.stroke}
                    strokeWidth={isSelected ? el.strokeWidth + 1.5 : el.strokeWidth}
                    dash={dash}
                    draggable={isDraggable}
                    hitStrokeWidth={16}
                    onClick={(e) => handleElementClick(el.id, e)}
                    onTap={(e) => handleElementClick(el.id, e)}
                    onDragStart={(e) => handleDragStart(el, e)}
                    onDragMove={(e) => {
                      if (handleGroupDragMove(el, e)) return;
                      const dx = e.target.x();
                      const dy = e.target.y();
                      const stage = e.target.getStage();
                      if (!stage) return;
                      const layer = e.target.getLayer();

                      elements.forEach((item) => {
                        if (item.type === 'point') {
                          const at1 = Math.hypot(item.x - el.x1, item.y - el.y1) < 10;
                          const at2 = Math.hypot(item.x - el.x2, item.y - el.y2) < 10;
                          const isSameGroup = el.groupId && item.groupId === el.groupId;
                          const isAttached = item.attachedTo?.elementId === el.id;
                          if (at1 || at2 || isSameGroup || isAttached) {
                            const ptNode = stage.findOne<Konva.Group>('#' + item.id);
                            if (ptNode) {
                              ptNode.position({ x: item.x + dx, y: item.y + dy });
                            }
                          }
                        }

                        if (item.type === 'right_angle' || item.type === 'angle') {
                          const isSameGroup = el.groupId && item.groupId === el.groupId;
                          const isLinked =
                            isSameGroup ||
                            Math.hypot(item.vx - el.x1, item.vy - el.y1) < 10 ||
                            Math.hypot(item.vx - el.x2, item.vy - el.y2) < 10;
                          if (isLinked) {
                            const raNode = stage.findOne<Konva.Line>('#' + item.id);
                            if (raNode) {
                              const details = computeAngleDetails(
                                item.vx + dx,
                                item.vy + dy,
                                item.p1x + dx,
                                item.p1y + dy,
                                item.p2x + dx,
                                item.p2y + dy,
                                item.size || 24
                              );
                              raNode.points(details.strokePoints);
                              const fillNode = stage.findOne<Konva.Line>('#' + item.id + '-fill');
                              if (fillNode) {
                                fillNode.points(details.fillPoints);
                              }
                            }
                          }
                        }
                      });

                      if (layer) layer.batchDraw();
                    }}
                    onDragEnd={(e) => {
                      if (handleGroupDragEnd(el, e)) return;
                      const dx = e.target.x();
                      const dy = e.target.y();
                      e.target.position({ x: 0, y: 0 });
                      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

                      const oldX1 = el.x1;
                      const oldY1 = el.y1;
                      const oldX2 = el.x2;
                      const oldY2 = el.y2;

                      const updated = elements.map((item) => {
                        if (item.id === el.id) {
                          return {
                            ...item,
                            x1: oldX1 + dx,
                            y1: oldY1 + dy,
                            x2: oldX2 + dx,
                            y2: oldY2 + dy,
                          };
                        }

                        // Shift linked endpoints by groupId, proximity, or magnetic attachment
                        const isSameGroup = el.groupId && item.groupId === el.groupId;
                        if (item.type === 'point') {
                          const atEnd1 = Math.hypot(item.x - oldX1, item.y - oldY1) < 10;
                          const atEnd2 = Math.hypot(item.x - oldX2, item.y - oldY2) < 10;
                          const isAttached = item.attachedTo?.elementId === el.id;
                          if (isSameGroup || atEnd1 || atEnd2 || isAttached) {
                            return { ...item, x: item.x + dx, y: item.y + dy };
                          }
                        }

                        if (item.type === 'right_angle' || item.type === 'angle') {
                          const isLinked =
                            isSameGroup ||
                            Math.hypot(item.vx - oldX1, item.vy - oldY1) < 10 ||
                            Math.hypot(item.vx - oldX2, item.vy - oldY2) < 10;
                          if (isLinked) {
                            return {
                              ...item,
                              vx: item.vx + dx,
                              vy: item.vy + dy,
                              p1x: item.p1x + dx,
                              p1y: item.p1y + dy,
                              p2x: item.p2x + dx,
                              p2y: item.p2y + dy,
                            };
                          }
                        }

                        return item;
                      });
                      onElementsChange(updated);
                    }}
                  />
                );
              }

              case 'line': {
                const [lx1, ly1, lx2, ly2] = computeInfiniteLinePoints(
                  el.x1,
                  el.y1,
                  el.x2,
                  el.y2,
                  dimensions.width / zoom,
                  dimensions.height / zoom
                );
                return (
                  <KonvaLine
                    key={el.id}
                    id={el.id}
                    points={[lx1, ly1, lx2, ly2]}
                    stroke={isSelected ? '#2563eb' : el.stroke}
                    strokeWidth={isSelected ? el.strokeWidth + 1.5 : el.strokeWidth}
                    dash={dash}
                    draggable={isDraggable}
                    hitStrokeWidth={16}
                    onClick={(e) => handleElementClick(el.id, e)}
                    onTap={(e) => handleElementClick(el.id, e)}
                    onDragStart={(e) => handleDragStart(el, e)}
                    onDragMove={(e) => {
                      if (handleGroupDragMove(el, e)) return;
                      const dx = e.target.x();
                      const dy = e.target.y();
                      const stage = e.target.getStage();
                      if (!stage) return;
                      const layer = e.target.getLayer();

                      elements.forEach((item) => {
                        if (item.type === 'point' && item.attachedTo?.elementId === el.id) {
                          const ptNode = stage.findOne<Konva.Group>('#' + item.id);
                          if (ptNode) {
                            ptNode.position({ x: item.x + dx, y: item.y + dy });
                          }
                        }
                      });

                      if (layer) layer.batchDraw();
                    }}
                    onDragEnd={(e) => {
                      if (handleGroupDragEnd(el, e)) return;
                      const dx = e.target.x();
                      const dy = e.target.y();
                      e.target.position({ x: 0, y: 0 });
                      const updated = elements.map((item) => {
                        if (item.id === el.id) {
                          return {
                            ...item,
                            x1: el.x1 + dx,
                            y1: el.y1 + dy,
                            x2: el.x2 + dx,
                            y2: el.y2 + dy,
                          };
                        }
                        // Shift any point magnetically attached to this line
                        if (item.type === 'point' && item.attachedTo?.elementId === el.id) {
                          return { ...item, x: item.x + dx, y: item.y + dy };
                        }
                        return item;
                      });
                      onElementsChange(updated);
                    }}
                  />
                );
              }

              case 'circle': {
                return (
                  <KonvaCircle
                    key={el.id}
                    id={el.id}
                    x={el.cx}
                    y={el.cy}
                    radius={el.radius}
                    stroke={isSelected ? '#2563eb' : el.stroke}
                    strokeWidth={isSelected ? el.strokeWidth + 1.5 : el.strokeWidth}
                    fill={el.fill}
                    dash={dash}
                    draggable={isDraggable}
                    hitStrokeWidth={16}
                    onClick={(e) => handleElementClick(el.id, e)}
                    onTap={(e) => handleElementClick(el.id, e)}
                    onDragStart={(e) => handleDragStart(el, e)}
                    onDragMove={(e) => {
                      if (handleGroupDragMove(el, e)) return;
                      const dx = e.target.x() - el.cx;
                      const dy = e.target.y() - el.cy;
                      const stage = e.target.getStage();
                      if (!stage) return;
                      const layer = e.target.getLayer();

                      elements.forEach((item) => {
                        if (item.type === 'point') {
                          const isSameGroup = el.groupId && item.groupId === el.groupId;
                          const atCenter = Math.hypot(item.x - el.cx, item.y - el.cy) < 10;
                          const isAttached = item.attachedTo?.elementId === el.id;
                          if (isSameGroup || atCenter || isAttached) {
                            const ptNode = stage.findOne<Konva.Group>('#' + item.id);
                            if (ptNode) {
                              ptNode.position({ x: item.x + dx, y: item.y + dy });
                            }
                          }
                        }
                      });

                      if (layer) layer.batchDraw();
                    }}
                    onDragEnd={(e) => {
                      if (handleGroupDragEnd(el, e)) return;
                      const dx = e.target.x() - el.cx;
                      const dy = e.target.y() - el.cy;
                      const newCx = e.target.x();
                      const newCy = e.target.y();

                      const updated = elements.map((item) => {
                        if (item.id === el.id) {
                          return { ...item, cx: newCx, cy: newCy };
                        }

                        // Shift center point if linked by groupId or at original center, or attached point
                        const isSameGroup = el.groupId && item.groupId === el.groupId;
                        if (item.type === 'point') {
                          const atCenter = Math.hypot(item.x - el.cx, item.y - el.cy) < 10;
                          const isAttached = item.attachedTo?.elementId === el.id;
                          if (isSameGroup || atCenter || isAttached) {
                            return { ...item, x: item.x + dx, y: item.y + dy };
                          }
                        }

                        return item;
                      });
                      onElementsChange(updated);
                    }}
                  />
                );
              }

              case 'polygon': {
                return (
                  <KonvaLine
                    key={el.id}
                    id={el.id}
                    points={el.points}
                    closed={el.closed}
                    fill={el.fill}
                    stroke={isSelected ? '#2563eb' : el.stroke}
                    strokeWidth={isSelected ? el.strokeWidth + 1.5 : el.strokeWidth}
                    dash={dash}
                    draggable={isDraggable}
                    hitStrokeWidth={16}
                    onClick={(e) => handleElementClick(el.id, e)}
                    onTap={(e) => handleElementClick(el.id, e)}
                    onDragStart={(e) => handleDragStart(el, e)}
                    onDragMove={(e) => {
                      if (handleGroupDragMove(el, e)) return;
                      const dx = e.target.x();
                      const dy = e.target.y();
                      const stage = e.target.getStage();
                      if (!stage) return;
                      const layer = e.target.getLayer();

                      elements.forEach((item) => {
                        if (item.type === 'point') {
                          const isSameGroup = el.groupId && item.groupId === el.groupId;
                          const isAttached = item.attachedTo?.elementId === el.id;
                          const isVertex = el.points.some((_, idx) => {
                            if (idx % 2 === 0) {
                              return (
                                Math.hypot(
                                  item.x - el.points[idx],
                                  item.y - el.points[idx + 1]
                                ) < 10
                              );
                            }
                            return false;
                          });
                          if (isSameGroup || isAttached || isVertex) {
                            const ptNode = stage.findOne<Konva.Group>('#' + item.id);
                            if (ptNode) {
                              ptNode.position({ x: item.x + dx, y: item.y + dy });
                            }
                          }
                        }

                        if (item.type === 'right_angle' || item.type === 'angle') {
                          const isSameGroup = el.groupId && item.groupId === el.groupId;
                          const isLinked = el.points.some((_, idx) => {
                            if (idx % 2 === 0) {
                              return (
                                Math.hypot(
                                  item.vx - el.points[idx],
                                  item.vy - el.points[idx + 1]
                                ) < 10
                              );
                            }
                            return false;
                          });
                          if (isSameGroup || isLinked) {
                            const raNode = stage.findOne<Konva.Line>('#' + item.id);
                            if (raNode) {
                              const details = computeAngleDetails(
                                item.vx + dx,
                                item.vy + dy,
                                item.p1x + dx,
                                item.p1y + dy,
                                item.p2x + dx,
                                item.p2y + dy,
                                item.size || 24
                              );
                              raNode.points(details.strokePoints);
                              const fillNode = stage.findOne<Konva.Line>('#' + item.id + '-fill');
                              if (fillNode) {
                                fillNode.points(details.fillPoints);
                              }
                            }
                          }
                        }
                      });

                      if (layer) layer.batchDraw();
                    }}
                    onDragEnd={(e) => {
                      if (handleGroupDragEnd(el, e)) return;
                      const dx = e.target.x();
                      const dy = e.target.y();
                      e.target.position({ x: 0, y: 0 });
                      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;

                      const oldPoints = el.points;
                      const shiftedPoints = oldPoints.map((p, i) =>
                        i % 2 === 0 ? p + dx : p + dy
                      );

                      const updated = elements.map((item) => {
                        if (item.id === el.id) {
                          return { ...item, points: shiftedPoints };
                        }

                        const isSameGroup = el.groupId && item.groupId === el.groupId;

                        // Shift vertex points or attached points
                        if (item.type === 'point') {
                          const isAttached = item.attachedTo?.elementId === el.id;
                          const isVertex =
                            isSameGroup ||
                            isAttached ||
                            oldPoints.some((_, idx) => {
                              if (idx % 2 === 0) {
                                const vx = oldPoints[idx];
                                const vy = oldPoints[idx + 1];
                                return Math.hypot(item.x - vx, item.y - vy) < 10;
                              }
                              return false;
                            });
                          if (isVertex) {
                            return { ...item, x: item.x + dx, y: item.y + dy };
                          }
                        }

                        // Shift angle marks
                        if (item.type === 'right_angle' || item.type === 'angle') {
                          const isLinked =
                            isSameGroup ||
                            oldPoints.some((_, idx) => {
                              if (idx % 2 === 0) {
                                const vx = oldPoints[idx];
                                const vy = oldPoints[idx + 1];
                                return Math.hypot(item.vx - vx, item.vy - vy) < 10;
                              }
                              return false;
                            });
                          if (isLinked) {
                            return {
                              ...item,
                              vx: item.vx + dx,
                              vy: item.vy + dy,
                              p1x: item.p1x + dx,
                              p1y: item.p1y + dy,
                              p2x: item.p2x + dx,
                              p2y: item.p2y + dy,
                            };
                          }
                        }

                        // Shift linked segments
                        if (item.type === 'segment' && isSameGroup) {
                          return {
                            ...item,
                            x1: item.x1 + dx,
                            y1: item.y1 + dy,
                            x2: item.x2 + dx,
                            y2: item.y2 + dy,
                          };
                        }

                        // Shift linked latex labels
                        if (item.type === 'latex' && isSameGroup) {
                          return {
                            ...item,
                            x: item.x + dx,
                            y: item.y + dy,
                          };
                        }

                        return item;
                      });
                      onElementsChange(updated);
                    }}
                  />
                );
              }

              case 'angle':
              case 'right_angle': {
                const details = computeAngleDetails(
                  el.vx,
                  el.vy,
                  el.p1x,
                  el.p1y,
                  el.p2x,
                  el.p2y,
                  el.size || 24,
                  el.arcType || 'single'
                );
                return (
                  <Group key={el.id}>
                    {/* Angle sector / square fill */}
                    {el.fill && el.fill !== 'transparent' && details.fillPoints.length > 0 && (
                      <KonvaLine
                        id={`${el.id}-fill`}
                        points={details.fillPoints}
                        closed={true}
                        fill={isSelected ? 'rgba(59, 130, 246, 0.35)' : el.fill}
                        listening={false}
                      />
                    )}
                    {/* Primary Angle arc or right angle corner line */}
                    <KonvaLine
                      id={el.id}
                      points={details.strokePoints}
                      stroke={isSelected ? '#2563eb' : el.stroke}
                      strokeWidth={isSelected ? el.strokeWidth + 1.5 : el.strokeWidth}
                      dash={dash}
                      draggable={isDraggable}
                      hitStrokeWidth={16}
                      onClick={(e) => handleElementClick(el.id, e)}
                      onTap={(e) => handleElementClick(el.id, e)}
                      onDragStart={(e) => handleDragStart(el, e)}
                      onDragMove={(e) => {
                        if (handleGroupDragMove(el, e)) return;
                      }}
                      onDragEnd={(e) => {
                        if (handleGroupDragEnd(el, e)) return;
                        const dx = e.target.x();
                        const dy = e.target.y();
                        e.target.position({ x: 0, y: 0 });
                        const updated = elements.map((item) =>
                          item.id === el.id
                            ? {
                                ...item,
                                vx: el.vx + dx,
                                vy: el.vy + dy,
                                p1x: el.p1x + dx,
                                p1y: el.p1y + dy,
                                p2x: el.p2x + dx,
                                p2y: el.p2y + dy,
                              }
                            : item
                        );
                        onElementsChange(updated);
                      }}
                    />
                    {/* Extra parallel arcs or tick marks for diverse styles (nét đôi, nét ba, nét gạch) */}
                    {details.extraStrokeLines?.map((pts, idx) => (
                      <KonvaLine
                        key={`${el.id}-extra-${idx}`}
                        points={pts}
                        stroke={isSelected ? '#2563eb' : el.stroke}
                        strokeWidth={isSelected ? el.strokeWidth + 1.5 : el.strokeWidth}
                        dash={dash}
                        listening={false}
                      />
                    ))}
                    {/* When selected: show anchor dots at k1 on arm 1 and k2 on arm 2 */}
                    {isSelected && (
                      <Group listening={false}>
                        <KonvaCircle
                          x={details.k1.x}
                          y={details.k1.y}
                          radius={3.5}
                          fill="#2563eb"
                          stroke="#ffffff"
                          strokeWidth={1.5}
                        />
                        <KonvaCircle
                          x={details.k2.x}
                          y={details.k2.y}
                          radius={3.5}
                          fill="#2563eb"
                          stroke="#ffffff"
                          strokeWidth={1.5}
                        />
                      </Group>
                    )}
                  </Group>
                );
              }

              case 'latex': {
                return (
                  <LatexShape
                    key={el.id}
                    element={el}
                    isSelected={isSelected}
                    draggable={isDraggable}
                    onSelect={(e) => handleElementClick(el.id, e)}
                    onDoubleClick={() => {
                      onEditLatexElement?.(el);
                    }}
                    onDragStart={(e) => handleDragStart(el, e)}
                    onDragMove={(e) => {
                      if (handleGroupDragMove(el, e)) return;
                    }}
                    onDragEnd={(e) => {
                      if (handleGroupDragEnd(el, e)) return;
                      const updated = elements.map((item) =>
                        item.id === el.id ? ({ ...item, x: e.target.x(), y: e.target.y() } as GeoElement) : item
                      );
                      onElementsChange(updated);
                    }}
                    onChange={(newAttrs) => {
                      const updated = elements.map((item) =>
                        item.id === el.id ? ({ ...item, ...newAttrs } as GeoElement) : item
                      );
                      onElementsChange(updated);
                    }}
                  />
                );
              }

              default:
                return null;
            }
          })}

          {/* Active drawing rubber-band preview */}
          {renderDrawingPreview()}
          {renderGhostCursor()}
        </Layer>

        {/* Layer 3: Selection handles & Transformer */}
        <Layer name="helper-layer">
          <Transformer
            ref={transformerRef}
            boundBoxFunc={(oldBox, newBox) => {
              if (newBox.width < 5 || newBox.height < 5) return oldBox;
              return newBox;
            }}
            rotateEnabled={true}
            enabledAnchors={[
              'top-left',
              'top-right',
              'bottom-left',
              'bottom-right',
              'middle-left',
              'middle-right',
              'top-center',
              'bottom-center',
            ]}
            anchorSize={8}
            anchorCornerRadius={2}
            borderStroke="#3b82f6"
            anchorStroke="#3b82f6"
            anchorFill="#ffffff"
          />

          {/* Marquee Selection Box */}
          {selectionBox && (
            <Rect
              x={selectionBox.x}
              y={selectionBox.y}
              width={selectionBox.width}
              height={selectionBox.height}
              fill="rgba(59, 130, 246, 0.12)"
              stroke="#3b82f6"
              strokeWidth={1}
              dash={[4, 4]}
            />
          )}
        </Layer>
      </Stage>

      {/* Polygon in-progress notice */}
      {currentTool === 'polygon' && polygonVertices.length > 0 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2 animate-bounce">
          <span>
            Click điểm tiếp theo hoặc click đúp / click điểm đầu để đóng đa giác ({polygonVertices.length / 2} đỉnh)
          </span>
          <button
            onClick={finishPolygon}
            className="bg-white text-blue-700 px-2 py-0.5 rounded-full text-[11px] font-bold hover:bg-blue-50"
          >
            Hoàn tất
          </button>
        </div>
      )}
    </div>
  );
};
