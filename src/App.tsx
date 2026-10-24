import React, { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import './App.css';

interface CanvasElement {
  id: string;
  type: 'sticky' | 'path' | 'circle' | 'rectangle' | 'rounded' | 'diamond';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radius?: number;
  color: string;
  text?: string;
  points?: { x: number; y: number }[];
}

interface PeerState {
  hasVideo?: boolean;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [isInteracting, setIsInteracting] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  const [activeTool, setActiveTool] = useState<'pan' | 'select' | 'draw'>('select');
  const [brushColor, setBrushColor] = useState('#38bdf8');
  const [shapeFillColor, setShapeFillColor] = useState('#fef08a');
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const [peerStates, setPeerStates] = useState<PeerState[]>([]);
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [activeUsers, setActiveUsers] = useState<number>(1);

  const ydocRef = useRef<Y.Doc | null>(null);
  const elementsMapRef = useRef<Y.Map<CanvasElement> | null>(null);
  const undoManagerRef = useRef<Y.UndoManager | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);

  // Sync state values with CSS theme variables dynamically on mount
  useEffect(() => {
    const rootStyle = getComputedStyle(document.documentElement);
    const primaryGlow = rootStyle.getPropertyValue('--shape-selection').trim();
    if (primaryGlow) {
      setBrushColor(primaryGlow);
    }
  }, []);

  useEffect(() => {
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const elementsMap = ydoc.getMap<CanvasElement>('sanctum-elements');
    elementsMapRef.current = elementsMap;

    const undoManager = new Y.UndoManager(elementsMap);
    undoManagerRef.current = undoManager;

    const provider = new WebsocketProvider('ws://localhost:1234', 'sanctum-room-alpha', ydoc);
    providerRef.current = provider;

    provider.awareness.on('change', () => {
      const states = Array.from(provider.awareness.getStates().values()) as PeerState[];
      setActiveUsers(states.length);
      setPeerStates(states.filter((s) => s.hasVideo));
    });

    elementsMap.observe(() => {
      setElements(Array.from(elementsMap.values()));
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;
      if (isCmdOrCtrl && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoManagerRef.current?.undo();
      } else if (isCmdOrCtrl && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        undoManagerRef.current?.redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      provider.destroy();
      ydoc.destroy();
    };
  }, []);
  const renderCanvas = (customCtx?: CanvasRenderingContext2D, isExport = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = customCtx || canvas.getContext('2d');
    if (!ctx) return;

    const rootStyle = getComputedStyle(document.documentElement);
    const selectionColor = rootStyle.getPropertyValue('--shape-selection').trim() || '#38bdf8';
    const bgStart = rootStyle.getPropertyValue('--bg-gradient-start').trim() || '#0f172a';
    const bgEnd = rootStyle.getPropertyValue('--bg-gradient-end').trim() || '#090d16';

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const gradient = ctx.createRadialGradient(
      canvas.width * 0.1,  
      canvas.height * 0.2, 
      0,
      canvas.width * 0.5,
      canvas.height * 0.5,
      Math.max(canvas.width, canvas.height)
    );
    gradient.addColorStop(0, bgStart);
    gradient.addColorStop(0.9, bgEnd);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    if (!isExport) {
      const dpr = window.devicePixelRatio || 1;
      ctx.scale(dpr, dpr);
    }
    ctx.translate(viewport.x, viewport.y);
    ctx.scale(viewport.scale, viewport.scale);

    elements.forEach((el) => {
      const isSelected = el.id === selectedId;

      if (el.type === 'sticky' && el.x !== undefined && el.y !== undefined) {
        const w = el.width || 200;
        const h = el.height || 160;

        ctx.fillStyle = el.color;
        ctx.fillRect(el.x, el.y, w, h);

        if (isSelected && !isExport) {
          ctx.strokeStyle = selectionColor;
          ctx.lineWidth = 2 / viewport.scale;
          ctx.strokeRect(el.x - 2, el.y - 2, w + 4, h + 4);

          ctx.fillStyle = selectionColor;
          const handleSize = 10 / viewport.scale;
          ctx.fillRect(el.x + w - handleSize / 2, el.y + h - handleSize / 2, handleSize, handleSize);
        }

        if (editingId !== el.id) {
          ctx.fillStyle = '#0f172a';
          ctx.font = '16px sans-serif';

          const textContent = el.text || '';
          const words = textContent.split(' ');
          let line = '';
          let posY = el.y + 30;
          const maxWidth = w - 24;

          for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            if (ctx.measureText(testLine).width > maxWidth && n > 0) {
              ctx.fillText(line, el.x + 12, posY);
              line = words[n] + ' ';
              posY += 22;
            } else {
              line = testLine;
            }
          }
          ctx.fillText(line, el.x + 12, posY);
        }
      } else if (el.type === 'path' && el.points && el.points.length > 0) {
        ctx.strokeStyle = el.color;
        ctx.lineWidth = Math.max(2, 3 / viewport.scale);
        ctx.lineCap = 'round';
        ctx.beginPath();
        // Fixed: Read index [0] safely instead of the array container directly
        if (el.points[0]) {
          ctx.moveTo(el.points[0].x, el.points[0].y);
          el.points.forEach((point) => ctx.lineTo(point.x, point.y));
        }
        ctx.stroke();
      } else if (el.type === 'circle' && el.x !== undefined && el.y !== undefined && el.radius) {
        ctx.beginPath();
        ctx.arc(el.x, el.y, el.radius, 0, Math.PI * 2);
        ctx.fillStyle = el.color;
        ctx.fill();
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeStyle = isSelected ? selectionColor : '#ffffff';
        ctx.stroke();

        if (isSelected && !isExport) {
          ctx.fillStyle = selectionColor;
          const handleSize = 10 / viewport.scale;
          ctx.fillRect(el.x + el.radius - handleSize / 2, el.y - handleSize / 2, handleSize, handleSize);
        }
      } else if (el.type === 'rectangle' && el.x !== undefined && el.y !== undefined) {
        const w = el.width || 160;
        const h = el.height || 100;
        ctx.fillStyle = el.color;
        ctx.fillRect(el.x, el.y, w, h);
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeStyle = isSelected ? selectionColor : '#ffffff';
        ctx.strokeRect(el.x, el.y, w, h);

        if (isSelected && !isExport) {
          ctx.fillStyle = selectionColor;
          const handleSize = 10 / viewport.scale;
          ctx.fillRect(el.x + w - handleSize / 2, el.y + h - handleSize / 2, handleSize, handleSize);
        }
      } else if (el.type === 'rounded' && el.x !== undefined && el.y !== undefined) {
        const w = el.width || 160;
        const h = el.height || 100;
        const radius = 16;
        ctx.beginPath();
        ctx.roundRect(el.x, el.y, w, h, radius);
        ctx.fillStyle = el.color;
        ctx.fill();
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeStyle = isSelected ? selectionColor : '#ffffff';
        ctx.stroke();

        if (isSelected && !isExport) {
          ctx.fillStyle = selectionColor;
          const handleSize = 10 / viewport.scale;
          ctx.fillRect(el.x + w - handleSize / 2, el.y + h - handleSize / 2, handleSize, handleSize);
        }
      } else if (el.type === 'diamond' && el.x !== undefined && el.y !== undefined) {
        const w = el.width || 160;
        const h = el.height || 100;
        ctx.beginPath();
        ctx.moveTo(el.x + w / 2, el.y);
        ctx.lineTo(el.x + w, el.y + h / 2);
        ctx.lineTo(el.x + w / 2, el.y + h);
        ctx.lineTo(el.x, el.y + h / 2);
        ctx.closePath();
        ctx.fillStyle = el.color;
        ctx.fill();
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeStyle = isSelected ? selectionColor : '#ffffff';
        ctx.stroke();

        if (isSelected && !isExport) {
          ctx.fillStyle = selectionColor;
          const handleSize = 10 / viewport.scale;
          ctx.fillRect(el.x + w - handleSize / 2, el.y + h - handleSize / 2, handleSize, handleSize);
        }
      }
    });

    // Fixed: Added protection checking that currentPath[0] exists before reading properties
    if (activeTool === 'draw' && currentPath.length > 0 && currentPath[0]) {
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = Math.max(2, 3 / viewport.scale);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(currentPath[0].x, currentPath[0].y);
      currentPath.forEach((p) => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    }

    ctx.restore();
  };

  useEffect(() => {
    renderCanvas();
  }, [elements, viewport, selectedId, editingId, activeTool, currentPath, brushColor]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      renderCanvas();
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [elements, viewport, selectedId]);
  const getCanvasCoords = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    return {
      x: (clientX - viewport.x) / viewport.scale,
      y: (clientY - viewport.y) / viewport.scale
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const coords = getCanvasCoords(e);
    setIsInteracting(true);
    if (activeTool === 'pan') {
      setStartPan({ x: e.clientX - viewport.x, y: e.clientY - viewport.y });
    } else if (activeTool === 'draw') {
      setCurrentPath([{ x: coords.x, y: coords.y }]);
    } else if (activeTool === 'select') {
      const clicked = [...elements].reverse().find(el => {
        if (el.x === undefined || el.y === undefined) return false;
        if (el.type === 'circle' && el.radius) {
          const dist = Math.hypot(coords.x - el.x, coords.y - el.y);
          return dist <= el.radius;
        }
        const w = el.width || 160;
        const h = el.height || 100;
        return coords.x >= el.x && coords.x <= el.x + w && coords.y >= el.y && coords.y <= el.y + h;
      });
      if (clicked) {
        setSelectedId(clicked.id);
        setDragOffset({ x: coords.x - (clicked.x || 0), y: coords.y - (clicked.y || 0) });
      } else {
        setSelectedId(null);
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isInteracting) return;
    const coords = getCanvasCoords(e);
    if (activeTool === 'pan') {
      setViewport(prev => ({
        ...prev,
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y
      }));
    } else if (activeTool === 'draw') {
      setCurrentPath(prev => [...prev, { x: coords.x, y: coords.y }]);
    } else if (activeTool === 'select' && selectedId && !isResizing) {
      const elementsMap = elementsMapRef.current;
      const currentEl = elementsMap?.get(selectedId);
      if (elementsMap && currentEl) {
        elementsMap.set(selectedId, {
          ...currentEl,
          x: coords.x - dragOffset.x,
          y: coords.y - dragOffset.y
        });
      }
    }
  };

  const handleMouseUp = () => {
    setIsInteracting(false);
    if (activeTool === 'draw' && currentPath.length > 1) {
      const elementsMap = elementsMapRef.current;
      if (elementsMap) {
        const id = crypto.randomUUID();
        elementsMap.set(id, {
          id,
          type: 'path',
          color: brushColor,
          points: currentPath
        });
      }
      setCurrentPath([]);
    }
  };

  const createShape = (type: CanvasElement['type']) => {
    const elementsMap = elementsMapRef.current;
    if (!elementsMap) return;
    const id = crypto.randomUUID();
    const spawnX = (-viewport.x + window.innerWidth / 2) / viewport.scale - 80;
    const spawnY = (-viewport.y + window.innerHeight / 2) / viewport.scale - 50;
    elementsMap.set(id, {
      id,
      type,
      x: spawnX,
      y: spawnY,
      width: type === 'sticky' ? 200 : 160,
      height: type === 'sticky' ? 160 : 100,
      radius: type === 'circle' ? 60 : undefined,
      color: type === 'sticky' ? shapeFillColor : 'transparent',
      text: type === 'sticky' ? 'Double click to edit text' : ''
    });
    setSelectedId(id);
  };

  return (
    <div className="wb-container">
      <div className="wb-toolbar">
        <button
          className={activeTool === 'pan' ? 'active-tool' : ''}
          onClick={() => setActiveTool('pan')}
        >
          Pan
        </button>
        <button
          className={activeTool === 'select' ? 'active-tool' : ''}
          onClick={() => setActiveTool('select')}
        >
          Select
        </button>
        <button
          className={activeTool === 'draw' ? 'active-tool' : ''}
          onClick={() => setActiveTool('draw')}
        >
          Draw
        </button>
        
        <button onClick={() => createShape('rectangle')}>+ Rectangle</button>
        <button onClick={() => createShape('circle')}>+ Circle</button>
        <button onClick={() => createShape('sticky')}>+ Sticky</button>
        <button onClick={() => createShape('diamond')}>+ Diamond</button>
        
        <div className="wb-divider" />
        <span className="wb-status-pill">Users Active: {activeUsers}</span>
      </div>

      <div className="wb-zoom-controls">
        <button onClick={() => setViewport(prev => ({ ...prev, scale: Math.max(0.2, prev.scale - 0.1) }))}>-</button>
        <span className="wb-zoom-text">{Math.round(viewport.scale * 100)}%</span>
        <button onClick={() => setViewport(prev => ({ ...prev, scale: Math.min(4, prev.scale + 0.1) }))}>+</button>
      </div>

      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        style={{ display: 'block', cursor: activeTool === 'pan' ? 'grab' : 'default' }}
      />
    </div>
  );
}
