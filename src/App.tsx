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

      ctx.restore();
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [viewport]);

  // handle canvas panning
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsInteracting(true);
    setStartPan({ x: e.clientX - viewport.x, y: e.clientY - viewport.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isInteracting) return;
    setViewport((prev) => ({
      ...prev,
      x: e.clientX - startPan.x,
      y: e.clientY - startPan.y,
    }));
  };

  const handleMouseUp = () => {
    setIsInteracting(false);
  };

  // handle mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    const newScale = Math.min(Math.max(0.1, viewport.scale * zoomFactor), 5);
    setViewport((prev) => ({ ...prev, scale: newScale }));
  };

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: '#0f172a', position: 'relative' }}>
      <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 10, background: '#1e293b', padding: '12px 18px', borderRadius: '10px', border: '1px solid #334155', color: '#fff', fontFamily: 'sans-serif' }}>
        <p>Online Users: {activeUsers}</p>
        <p>Zoom Scale: {Math.round(viewport.scale * 100)}%</p>
      </div>

      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        style={{ display: 'block', cursor: 'grab' }}
      />
    </div>
  );
}