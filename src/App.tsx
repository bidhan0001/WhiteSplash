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

interface PeerState {
  hasVideo?: boolean;
  peerId?: string;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // pan & zoom state
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [isInteracting, setIsInteracting] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  // canvas background color state
  const [bgColor, setBgColor] = useState('#0f172a');

  // active tool mode & brush settings
  const [activeTool, setActiveTool] = useState<'pan' | 'select' | 'draw'>('select');
  const [brushColor, setBrushColor] = useState('#38bdf8');
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);

  // selection & dragging state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // inline sticky note editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  // camera stream state
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isVideoActive, setIsVideoActive] = useState(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [peerStates, setPeerStates] = useState<PeerState[]>([]);

  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [activeUsers, setActiveUsers] = useState<number>(1);

  // yjs persistence refs
  const ydocRef = useRef<Y.Doc | null>(null);
  const elementsMapRef = useRef<Y.Map<CanvasElement> | null>(null);
  const undoManagerRef = useRef<Y.UndoManager | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);

  useEffect(() => {
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const elementsMap = ydoc.getMap<CanvasElement>('sanctum-elements');
    elementsMapRef.current = elementsMap;

    const undoManager = new Y.UndoManager(elementsMap);
    undoManagerRef.current = undoManager;

    // connect to websocket server
    const provider = new WebsocketProvider('ws://localhost:1234', 'sanctum-room-alpha', ydoc);
    providerRef.current = provider;

    provider.awareness.on('change', () => {
      const states = Array.from(provider.awareness.getStates().values()) as PeerState[];
      setActiveUsers(states.length);
      setPeerStates(states.filter((s) => s.hasVideo));
    });

    // sync map changes to local state
    elementsMap.observe(() => {
      setElements(Array.from(elementsMap.values()));
    });

    // keyboard shortcuts for undo / redo
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

  // high performance canvas render loop
  const renderCanvas = (customCtx?: CanvasRenderingContext2D, isExport = false) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = customCtx || canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    if (!isExport) {
      const dpr = window.devicePixelRatio || 1;
      ctx.scale(dpr, dpr);
    }
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

    // render shapes, paths, and selection frames
    elements.forEach((el) => {
      const isSelected = el.id === selectedId;

      if (el.type === 'sticky' && el.x !== undefined && el.y !== undefined) {
        const w = el.width || 180;
        const h = el.height || 140;

        ctx.fillStyle = el.color;
        ctx.fillRect(el.x, el.y, w, h);

        if (isSelected && !isExport) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2 / viewport.scale;
          ctx.strokeRect(el.x - 2, el.y - 2, w + 4, h + 4);

          // resize handle
          ctx.fillStyle = '#38bdf8';
          const handleSize = 10 / viewport.scale;
          ctx.fillRect(el.x + w - handleSize / 2, el.y + h - handleSize / 2, handleSize, handleSize);
        }

        if (editingId !== el.id) {
          ctx.fillStyle = '#0f172a';
          const dynamicFontSize = Math.max(10, Math.min(w / 8, h / 5));
          ctx.font = `bold ${dynamicFontSize}px sans-serif`;

          const words = (el.text || '').split(' ');
          let line = '';
          let posY = el.y + dynamicFontSize + 10;
          const maxWidth = w - 24;

          for (let n = 0; n < words.length; n++) {
            const testLine = line + words[n] + ' ';
            if (ctx.measureText(testLine).width > maxWidth && n > 0) {
              ctx.fillText(line, el.x + 12, posY);
              line = words[n] + ' ';
              posY += dynamicFontSize + 4;
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
        ctx.moveTo(el.points[0].x, el.points[0].y);
        el.points.forEach((point) => ctx.lineTo(point.x, point.y));
        ctx.stroke();
      } else if (el.type === 'circle' && el.x !== undefined && el.y !== undefined && el.radius) {
        ctx.beginPath();
        ctx.arc(el.x, el.y, el.radius, 0, Math.PI * 2);
        ctx.fillStyle = el.color;
        ctx.fill();
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeStyle = isSelected ? '#38bdf8' : '#ffffff';
        ctx.stroke();

        if (isSelected && !isExport) {
          ctx.fillStyle = '#38bdf8';
          const handleSize = 10 / viewport.scale;
          ctx.fillRect(el.x + el.radius - handleSize / 2, el.y - handleSize / 2, handleSize, handleSize);
        }
      } else if (el.type === 'rectangle' && el.x !== undefined && el.y !== undefined) {
        const w = el.width || 150;
        const h = el.height || 100;
        ctx.fillStyle = el.color;
        ctx.fillRect(el.x, el.y, w, h);
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeStyle = isSelected ? '#38bdf8' : '#ffffff';
        ctx.strokeRect(el.x, el.y, w, h);

        if (isSelected && !isExport) {
          ctx.fillStyle = '#38bdf8';
          const handleSize = 10 / viewport.scale;
          ctx.fillRect(el.x + w - handleSize / 2, el.y + h - handleSize / 2, handleSize, handleSize);
        }
      }
    });

    ctx.restore();
  };

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
    renderCanvas();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [viewport, elements, selectedId, editingId, bgColor]);

  // convert screen center to active world coordinates
  const getCenterWorldPos = () => ({
    x: (window.innerWidth / 2 - viewport.x) / viewport.scale,
    y: (window.innerHeight / 2 - viewport.y) / viewport.scale,
  });

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

  // test if world click hits an element or its resize handle
  const getElementHitInfo = (worldX: number, worldY: number) => {
    const handleThreshold = 12 / viewport.scale;

    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (el.type === 'sticky' || el.type === 'rectangle') {
        const w = el.width || (el.type === 'sticky' ? 180 : 150);
        const h = el.height || (el.type === 'sticky' ? 140 : 100);
        if (el.x === undefined || el.y === undefined) continue;

        const handleX = el.x + w;
        const handleY = el.y + h;
        if (Math.abs(worldX - handleX) <= handleThreshold && Math.abs(worldY - handleY) <= handleThreshold) {
          return { element: el, isResizeHandle: true };
        }

        if (worldX >= el.x && worldX <= el.x + w && worldY >= el.y && worldY <= el.y + h) {
          return { element: el, isResizeHandle: false };
        }
      } else if (el.type === 'circle' && el.radius) {
        if (el.x === undefined || el.y === undefined) continue;
        const dx = worldX - el.x;
        const dy = worldY - el.y;

        const handleX = el.x + el.radius;
        const handleY = el.y;
        if (Math.abs(worldX - handleX) <= handleThreshold && Math.abs(worldY - handleY) <= handleThreshold) {
          return { element: el, isResizeHandle: true };
        }

        if (Math.sqrt(dx * dx + dy * dy) <= el.radius) {
          return { element: el, isResizeHandle: false };
        }
      }
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - viewport.x) / viewport.scale;
    const worldY = (e.clientY - rect.top - viewport.y) / viewport.scale;

    setIsInteracting(true);

    if (activeTool === 'pan' || e.button === 1) {
      setStartPan({ x: e.clientX - viewport.x, y: e.clientY - viewport.y });
    } else if (activeTool === 'draw') {
      setCurrentPath([{ x: worldX, y: worldY }]);
    } else if (activeTool === 'select') {
      const hit = getElementHitInfo(worldX, worldY);
      if (hit) {
        setSelectedId(hit.element.id);
        if (hit.isResizeHandle) {
          setIsResizing(true);
        } else if (hit.element.x !== undefined && hit.element.y !== undefined) {
          setIsResizing(false);
          setDragOffset({ x: worldX - hit.element.x, y: worldY - hit.element.y });
        }
      } else {
        setSelectedId(null);
        setEditingId(null);
        setIsResizing(false);
      }
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - viewport.x) / viewport.scale;
    const worldY = (e.clientY - rect.top - viewport.y) / viewport.scale;

    const hit = getElementHitInfo(worldX, worldY);
    if (hit && hit.element.type === 'sticky') {
      setEditingId(hit.element.id);
      setEditText(hit.element.text || '');
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isInteracting) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const worldX = (e.clientX - rect.left - viewport.x) / viewport.scale;
    const worldY = (e.clientY - rect.top - viewport.y) / viewport.scale;

    if (activeTool === 'pan' || e.buttons === 4) {
      setViewport((prev) => ({
        ...prev,
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y,
      }));
    } else if (activeTool === 'draw') {
      const updatedPath = [...currentPath, { x: worldX, y: worldY }];
      setCurrentPath(updatedPath);

      elementsMapRef.current?.set('temp-path', {
        id: 'temp-path',
        type: 'path',
        color: brushColor,
        points: updatedPath,
      });
    } else if (activeTool === 'select' && selectedId) {
      const existing = elementsMapRef.current?.get(selectedId);
      if (!existing) return;

      if (isResizing) {
        if (existing.type === 'circle' && existing.x !== undefined) {
          const newRadius = Math.max(10, Math.abs(worldX - existing.x));
          elementsMapRef.current?.set(selectedId, {
            ...existing,
            radius: newRadius,
          });
        } else if (existing.x !== undefined && existing.y !== undefined) {
          const newWidth = Math.max(40, worldX - existing.x);
          const newHeight = Math.max(40, worldY - existing.y);
          elementsMapRef.current?.set(selectedId, {
            ...existing,
            width: newWidth,
            height: newHeight,
          });
        }
      } else if (!isResizing) {
        elementsMapRef.current?.set(selectedId, {
          ...existing,
          x: worldX - dragOffset.x,
          y: worldY - dragOffset.y,
        });
      }
    }
  };

  const handleMouseUp = () => {
    if (!isInteracting) return;
    setIsInteracting(false);
    setIsResizing(false);

    if (activeTool === 'draw' && currentPath.length > 0) {
      const uniqueId = Math.random().toString(36).substring(2, 9);
      elementsMapRef.current?.set(uniqueId, {
        id: uniqueId,
        type: 'path',
        color: brushColor,
        points: currentPath,
      });
      elementsMapRef.current?.delete('temp-path');
      setCurrentPath([]);
    }
  };

  // uncapped infinite wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    setViewport((prev) => ({ ...prev, scale: Math.max(0.001, prev.scale * zoomFactor) }));
  };

  const zoomIn = () => setViewport((prev) => ({ ...prev, scale: prev.scale * 1.25 }));
  const zoomOut = () => setViewport((prev) => ({ ...prev, scale: Math.max(0.001, prev.scale / 1.25) }));
  const resetZoom = () => setViewport({ x: 0, y: 0, scale: 1 });

  const saveTextEdit = () => {
    if (editingId) {
      const existing = elementsMapRef.current?.get(editingId);
      if (existing) {
        elementsMapRef.current?.set(editingId, {
          ...existing,
          text: editText,
        });
      }
      setEditingId(null);
    }
  };

  const exportCanvasAsPNG = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      renderCanvas(tempCtx, true);
      const link = document.createElement('a');
      link.download = 'shared-sanctum-canvas.png';
      link.href = tempCanvas.toDataURL('image/png');
      link.click();
    }
  };

  const toggleVideoCall = async () => {
    if (!isVideoActive) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        mediaStreamRef.current = stream;
        setIsVideoActive(true);
        providerRef.current?.awareness.setLocalStateField('hasVideo', true);

        setTimeout(() => {
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }
        }, 100);
      } catch (err) {
        alert('Camera access denied or device unavailable.');
      }
    } else {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      setIsVideoActive(false);
      providerRef.current?.awareness.setLocalStateField('hasVideo', false);
    }
  };

  const activeEditingElement = elements.find((el) => el.id === editingId);
  const editingScreenBounds = activeEditingElement && activeEditingElement.x !== undefined && activeEditingElement.y !== undefined ? {
    left: activeEditingElement.x * viewport.scale + viewport.x + 12,
    top: activeEditingElement.y * viewport.scale + viewport.y + 12,
    width: (activeEditingElement.width || 180) * viewport.scale - 24,
    height: (activeEditingElement.height || 140) * viewport.scale - 24,
  } : null;

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: bgColor, position: 'relative', fontFamily: 'sans-serif' }}>
      
      {/* fixed top toolbar */}
      <div style={{ position: 'fixed', top: 20, left: 20, zIndex: 1000, display: 'flex', gap: '8px', alignItems: 'center', background: '#1e293b', padding: '10px 14px', borderRadius: '12px', border: '1px solid #334155', boxShadow: '0 10px 25px rgba(0,0,0,0.4)', flexWrap: 'wrap' }}>
        <button onClick={() => setActiveTool('pan')} style={{ padding: '8px 12px', background: activeTool === 'pan' ? '#3b82f6' : '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          ✋ Pan
        </button>
        <button onClick={() => setActiveTool('select')} style={{ padding: '8px 12px', background: activeTool === 'select' ? '#3b82f6' : '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          ↖ Select & Resize
        </button>
        <button onClick={() => setActiveTool('draw')} style={{ padding: '8px 12px', background: activeTool === 'draw' ? '#3b82f6' : '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          ✏️ Draw
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

        {activeTool === 'draw' && (
          <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} title="Brush Color" style={{ width: '28px', height: '28px', border: 'none', cursor: 'pointer', background: 'none' }} />
        )}

        <div style={{ width: '1px', height: '24px', background: '#475569', margin: '0 2px' }} />

        {/* background color picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 'bold' }}>BG:</span>
          <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} title="Canvas Background Color" style={{ width: '28px', height: '28px', border: 'none', cursor: 'pointer', background: 'none' }} />
        </div>

        <div style={{ width: '1px', height: '24px', background: '#475569', margin: '0 2px' }} />

        <button onClick={() => undoManagerRef.current?.undo()} title="Undo (Ctrl+Z)" style={{ padding: '8px 10px', background: '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          ↩
        </button>
        <button onClick={() => undoManagerRef.current?.redo()} title="Redo (Ctrl+Y)" style={{ padding: '8px 10px', background: '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          ↪
        </button>

        <div style={{ width: '1px', height: '24px', background: '#475569', margin: '0 2px' }} />

        <button onClick={exportCanvasAsPNG} style={{ padding: '8px 12px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          💾 Save PNG
        </button>
        <button onClick={toggleVideoCall} style={{ padding: '8px 12px', background: isVideoActive ? '#ef4444' : '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          {isVideoActive ? '🔴 End Cam' : '📹 Cam'}
        </button>

        <div style={{ padding: '6px 10px', background: '#0f172a', color: '#38bdf8', borderRadius: '6px', border: '1px solid #334155', fontSize: '13px', fontWeight: 500 }}>
          Online: {activeUsers}
        </div>
      </div>

      {/* fixed bottom left zoom controls */}
      <div style={{ position: 'fixed', bottom: 20, left: 20, zIndex: 1000, display: 'flex', gap: '8px', background: '#1e293b', padding: '8px 12px', borderRadius: '10px', border: '1px solid #334155', boxShadow: '0 10px 25px rgba(0,0,0,0.4)', alignItems: 'center' }}>
        <button onClick={zoomOut} style={{ padding: '6px 12px', background: '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>－</button>
        <span style={{ color: '#38bdf8', fontSize: '13px', fontWeight: 'bold', minWidth: '55px', textAlign: 'center' }}>{Math.round(viewport.scale * 100)}%</span>
        <button onClick={zoomIn} style={{ padding: '6px 12px', background: '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>＋</button>
        <button onClick={resetZoom} style={{ padding: '6px 10px', background: '#475569', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Reset</button>
      </div>

      {/* collaborative camera preview grid */}
      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 1000, display: 'flex', gap: '10px', flexWrap: 'wrap', maxWidth: '440px', justifyContent: 'flex-end' }}>
        {isVideoActive && (
          <div style={{ background: '#1e293b', padding: '6px', borderRadius: '12px', border: '2px solid #8b5cf6', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
            <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '180px', height: '120px', borderRadius: '8px', objectFit: 'cover', transform: 'scaleX(-1)', display: 'block' }} />
            <div style={{ color: '#fff', fontSize: '11px', textAlign: 'center', marginTop: '4px', fontWeight: 'bold' }}>You (Local)</div>
          </div>
        )}
        {peerStates.filter(() => isVideoActive).map((_, idx) => (
          <div key={idx} style={{ background: '#1e293b', padding: '6px', borderRadius: '12px', border: '2px solid #10b981', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
            <div style={{ width: '180px', height: '120px', borderRadius: '8px', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', fontWeight: 'bold', fontSize: '13px' }}>
              📹 Peer Stream #{idx + 1}
            </div>
            <div style={{ color: '#fff', fontSize: '11px', textAlign: 'center', marginTop: '4px', fontWeight: 'bold' }}>Collaborator #{idx + 1}</div>
          </div>
        ))}
      </div>

      {/* inline textarea overlay for editing sticky note text */}
      {editingId && editingScreenBounds && (
        <textarea
          autoFocus
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={saveTextEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              saveTextEdit();
            }
          }}
          style={{
            position: 'fixed',
            left: `${editingScreenBounds.left}px`,
            top: `${editingScreenBounds.top}px`,
            width: `${editingScreenBounds.width}px`,
            height: `${editingScreenBounds.height}px`,
            fontSize: `${Math.max(10, Math.min(editingScreenBounds.width / 8, editingScreenBounds.height / 5))}px`,
            fontFamily: 'sans-serif',
            color: '#0f172a',
            background: 'transparent',
            border: '1px dashed #0f172a',
            outline: 'none',
            resize: 'none',
            zIndex: 1001,
          }}
        />
      )}

      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onWheel={handleWheel}
        style={{ display: 'block', cursor: activeTool === 'pan' ? 'grab' : activeTool === 'draw' ? 'crosshair' : 'default' }}
      />
    </div>
  );
}