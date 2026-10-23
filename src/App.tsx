import React, { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

// canvas element type definition
interface CanvasElement {
  id: string;
  type: 'sticky' | 'path' | 'circle' | 'rectangle';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  radius?: number;
  color: string;
  text?: string;
  points?: { x: number; y: number }[];
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // pan & zoom state
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [isInteracting, setIsInteracting] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  // active tool mode
  const [activeTool, setActiveTool] = useState<'pan' | 'select' | 'draw'>('select');

  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [activeUsers, setActiveUsers] = useState<number>(1);

  // yjs persistence refs
  const ydocRef = useRef<Y.Doc | null>(null);
  const elementsMapRef = useRef<Y.Map<CanvasElement> | null>(null);
  const undoManagerRef = useRef<Y.UndoManager | null>(null);

  useEffect(() => {
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const elementsMap = ydoc.getMap<CanvasElement>('sanctum-elements');
    elementsMapRef.current = elementsMap;

    const undoManager = new Y.UndoManager(elementsMap);
    undoManagerRef.current = undoManager;

    // connect to websocket server
    const provider = new WebsocketProvider('ws://localhost:1234', 'sanctum-room-alpha', ydoc);

    provider.awareness.on('change', () => {
      setActiveUsers(provider.awareness.getStates().size);
    });

    // sync map changes to local state
    elementsMap.observe(() => {
      setElements(Array.from(elementsMap.values()));
    });

    return () => {
      provider.destroy();
      ydoc.destroy();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // high-dpi resize
    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const dpr = window.devicePixelRatio || 1;

    const render = () => {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.translate(viewport.x, viewport.y);
      ctx.scale(viewport.scale, viewport.scale);

      // draw grid
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1 / viewport.scale;
      const gridSize = 50;
      const extent = 10000;

      for (let x = -extent; x < extent; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, -extent);
        ctx.lineTo(x, extent);
        ctx.stroke();
      }
      for (let y = -extent; y < extent; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(-extent, y);
        ctx.lineTo(extent, y);
        ctx.stroke();
      }

      // render shapes from collaborative state
      elements.forEach((el) => {
        if (el.type === 'sticky' && el.x !== undefined && el.y !== undefined) {
          const w = el.width || 180;
          const h = el.height || 140;

          ctx.fillStyle = el.color;
          ctx.fillRect(el.x, el.y, w, h);

          ctx.fillStyle = '#0f172a';
          ctx.font = 'bold 15px sans-serif';
          ctx.fillText(el.text || '', el.x + 12, el.y + 30);
        } else if (el.type === 'circle' && el.x !== undefined && el.y !== undefined && el.radius) {
          ctx.beginPath();
          ctx.arc(el.x, el.y, el.radius, 0, Math.PI * 2);
          ctx.fillStyle = el.color;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        } else if (el.type === 'rectangle' && el.x !== undefined && el.y !== undefined) {
          const w = el.width || 150;
          const h = el.height || 100;
          ctx.fillStyle = el.color;
          ctx.fillRect(el.x, el.y, w, h);
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ffffff';
          ctx.strokeRect(el.x, el.y, w, h);
        }
      });

      ctx.restore();
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [viewport, elements]);

  // convert screen center to active world coordinates
  const getCenterWorldPos = () => ({
    x: (window.innerWidth / 2 - viewport.x) / viewport.scale,
    y: (window.innerHeight / 2 - viewport.y) / viewport.scale,
  });

  // add sticky note centered relative to view
  const addStickyNote = () => {
    const id = Math.random().toString(36).substring(2, 9);
    const pos = getCenterWorldPos();
    const noteColors = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fbcfe8'];

    elementsMapRef.current?.set(id, {
      id,
      type: 'sticky',
      x: pos.x - 90,
      y: pos.y - 70,
      width: 180,
      height: 140,
      text: 'Double click to edit',
      color: noteColors[Math.floor(Math.random() * noteColors.length)],
    });
  };

  // add circle shape
  const addCircle = () => {
    const id = Math.random().toString(36).substring(2, 9);
    const pos = getCenterWorldPos();
    elementsMapRef.current?.set(id, {
      id,
      type: 'circle',
      x: pos.x,
      y: pos.y,
      radius: 50,
      color: '#ec4899',
    });
  };

  // add rectangle shape
  const addRectangle = () => {
    const id = Math.random().toString(36).substring(2, 9);
    const pos = getCenterWorldPos();
    elementsMapRef.current?.set(id, {
      id,
      type: 'rectangle',
      x: pos.x - 75,
      y: pos.y - 50,
      width: 150,
      height: 100,
      color: '#8b5cf6',
    });
  };

  // canvas pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (activeTool === 'pan' || e.button === 1) {
      setIsInteracting(true);
      setStartPan({ x: e.clientX - viewport.x, y: e.clientY - viewport.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isInteracting) return;
    if (activeTool === 'pan' || e.buttons === 4) {
      setViewport((prev) => ({
        ...prev,
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y,
      }));
    }
  };

  const handleMouseUp = () => {
    setIsInteracting(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.min(Math.max(0.1, viewport.scale * zoomFactor), 5);
    setViewport((prev) => ({ ...prev, scale: newScale }));
  };

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0f172a', position: 'relative', fontFamily: 'sans-serif' }}>
      {/* top toolbar */}
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, display: 'flex', gap: '8px', alignItems: 'center', background: '#1e293b', padding: '10px 14px', borderRadius: '12px', border: '1px solid #334155', boxShadow: '0 10px 25px rgba(0,0,0,0.4)' }}>
        <button onClick={() => setActiveTool('pan')} style={{ padding: '8px 12px', background: activeTool === 'pan' ? '#3b82f6' : '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          ✋ Pan
        </button>
        <button onClick={() => setActiveTool('select')} style={{ padding: '8px 12px', background: activeTool === 'select' ? '#3b82f6' : '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          ↖ Select
        </button>

        <div style={{ width: '1px', height: '24px', background: '#475569', margin: '0 2px' }} />

        <button onClick={addStickyNote} style={{ padding: '8px 10px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          + Sticky
        </button>
        <button onClick={addCircle} style={{ padding: '8px 10px', background: '#ec4899', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          ⭕ Circle
        </button>
        <button onClick={addRectangle} style={{ padding: '8px 10px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          🟦 Rect
        </button>

        <div style={{ padding: '6px 10px', background: '#0f172a', color: '#38bdf8', borderRadius: '6px', border: '1px solid #334155', fontSize: '13px', fontWeight: 500, marginLeft: '8px' }}>
          Online: {activeUsers}
        </div>
      </div>

      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        style={{ display: 'block', cursor: activeTool === 'pan' ? 'grab' : 'default' }}
      />
    </div>
  );
}