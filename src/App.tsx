import React, { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

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
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 1 });
  const [isInteracting, setIsInteracting] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });

  const [bgColor, setBgColor] = useState('#0f172a');
  const [activeTool, setActiveTool] = useState<'pan' | 'select' | 'draw'>('select');
  const [brushColor, setBrushColor] = useState('#38bdf8');
  const [shapeFillColor, setShapeFillColor] = useState('#fef08a');
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const [isVideoActive, setIsVideoActive] = useState(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [peerStates, setPeerStates] = useState<PeerState[]>([]);

  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [activeUsers, setActiveUsers] = useState<number>(1);

  const ydocRef = useRef<Y.Doc | null>(null);
  const elementsMapRef = useRef<Y.Map<CanvasElement> | null>(null);
  const undoManagerRef = useRef<Y.UndoManager | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);

  useEffect(() => {
    if (!currentUser) return;

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const elementsMap = ydoc.getMap<CanvasElement>('whitesplash-elements');
    elementsMapRef.current = elementsMap;

    const undoManager = new Y.UndoManager(elementsMap);
    undoManagerRef.current = undoManager;

    const provider = new WebsocketProvider('ws://localhost:1234', 'whitesplash-room-alpha', ydoc);
    providerRef.current = provider;

    provider.awareness.setLocalStateField('user', currentUser);

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
  }, [currentUser]);

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

    elements.forEach((el) => {
      const isSelected = el.id === selectedId;

      if (el.type === 'sticky' && el.x !== undefined && el.y !== undefined) {
        const w = el.width || 200;
        const h = el.height || 160;

        ctx.fillStyle = el.color;
        ctx.fillRect(el.x, el.y, w, h);

        if (isSelected && !isExport) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 2 / viewport.scale;
          ctx.strokeRect(el.x - 2, el.y - 2, w + 4, h + 4);

          ctx.fillStyle = '#38bdf8';
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
        const w = el.width || 160;
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
      } else if (el.type === 'rounded' && el.x !== undefined && el.y !== undefined) {
        const w = el.width || 160;
        const h = el.height || 100;
        const radius = 16;
        ctx.beginPath();
        ctx.roundRect(el.x, el.y, w, h, radius);
        ctx.fillStyle = el.color;
        ctx.fill();
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.strokeStyle = isSelected ? '#38bdf8' : '#ffffff';
        ctx.stroke();

        if (isSelected && !isExport) {
          ctx.fillStyle = '#38bdf8';
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
        ctx.strokeStyle = isSelected ? '#38bdf8' : '#ffffff';
        ctx.stroke();

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
    if (!currentUser) return;
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
  }, [currentUser, viewport, elements, selectedId, editingId, bgColor]);

  const getCenterWorldPos = () => ({
    x: (window.innerWidth / 2 - viewport.x) / viewport.scale,
    y: (window.innerHeight / 2 - viewport.y) / viewport.scale,
  });

  const addShape = (type: 'sticky' | 'circle' | 'rectangle' | 'rounded' | 'diamond') => {
    const id = Math.random().toString(36).substring(2, 9);
    const pos = getCenterWorldPos();
    const defaultW = Math.max(180, (window.innerWidth * 0.15) / viewport.scale);
    const defaultH = Math.max(140, (window.innerHeight * 0.15) / viewport.scale);

    elementsMapRef.current?.set(id, {
      id,
      type,
      x: pos.x - defaultW / 2,
      y: pos.y - defaultH / 2,
      width: defaultW,
      height: defaultH,
      radius: type === 'circle' ? defaultW / 3 : undefined,
      text: type === 'sticky' ? 'Double click to edit' : undefined,
      color: shapeFillColor,
    });
  };

  const getElementHitInfo = (worldX: number, worldY: number) => {
    const handleThreshold = 14 / viewport.scale;

    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (el.type === 'sticky' || el.type === 'rectangle' || el.type === 'rounded' || el.type === 'diamond') {
        const w = el.width || 160;
        const h = el.height || 100;
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

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
    setViewport((prev) => ({ ...prev, scale: prev.scale * zoomFactor }));
  };

  const zoomIn = () => setViewport((prev) => ({ ...prev, scale: prev.scale * 1.25 }));
  const zoomOut = () => setViewport((prev) => ({ ...prev, scale: prev.scale / 1.25 }));
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

  const saveCanvasToMongoDB = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomName: 'whitesplash-room-alpha',
          elements: elements,
        }),
      });
      if (response.ok) {
        alert('☁️ Canvas progress saved to MongoDB!');
      } else {
        alert('Failed to save to database.');
      }
    } catch (err) {
      alert('Error connecting to backend server.');
    }
  };

  const loadCanvasFromMongoDB = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/load/whitesplash-room-alpha');
      if (response.ok) {
        const data = await response.json();
        if (data && data.elements) {
          elementsMapRef.current?.clear();
          data.elements.forEach((el: CanvasElement) => {
            elementsMapRef.current?.set(el.id, el);
          });
          alert('📂 Canvas progress loaded from MongoDB!');
        }
      } else {
        alert('No previous save found in database.');
      }
    } catch (err) {
      alert('Error connecting to backend server.');
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
      link.download = 'whitesplash-canvas.png';
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

  if (!currentUser) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#0f172a', fontFamily: 'sans-serif' }}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (usernameInput.trim() && passwordInput.trim()) {
              setCurrentUser(usernameInput.trim());
            }
          }}
          style={{ background: '#1e293b', padding: '40px', borderRadius: '16px', border: '1px solid #334155', width: '320px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', color: '#fff' }}
        >
          <h2 style={{ color: '#38bdf8', marginBottom: '24px', textAlign: 'center' }}>✦ WhiteSplash ✦</h2>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>Username</label>
            <input
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              required
              style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #475569', borderRadius: '8px', color: '#fff', outline: 'none' }}
            />
          </div>
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px' }}>Password</label>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              required
              style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid #475569', borderRadius: '8px', color: '#fff', outline: 'none' }}
            />
          </div>
          <button type="submit" style={{ width: '100%', padding: '12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
            Enter Canvas
          </button>
        </form>
      </div>
    );
  }

  const activeEditingElement = elements.find((el) => el.id === editingId);
  const editingScreenBounds = activeEditingElement && activeEditingElement.x !== undefined && activeEditingElement.y !== undefined ? {
    left: activeEditingElement.x * viewport.scale + viewport.x + 12,
    top: activeEditingElement.y * viewport.scale + viewport.y + 12,
    width: (activeEditingElement.width || 200) * viewport.scale - 24,
    height: (activeEditingElement.height || 160) * viewport.scale - 24,
  } : null;

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', background: bgColor, position: 'relative', fontFamily: 'sans-serif' }}>
      
      {/* toolbar */}
      <div style={{ position: 'fixed', top: 20, left: 20, zIndex: 9999, pointerEvents: 'auto', display: 'flex', gap: '8px', alignItems: 'center', background: '#1e293b', padding: '10px 14px', borderRadius: '12px', border: '1px solid #334155', boxShadow: '0 10px 25px rgba(0,0,0,0.4)', flexWrap: 'wrap' }}>
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

        <button onClick={() => addShape('sticky')} style={{ padding: '8px 10px', background: '#10b981', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          + Sticky
        </button>
        <button onClick={() => addShape('circle')} style={{ padding: '8px 10px', background: '#ec4899', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          ⭕ Circle
        </button>
        <button onClick={() => addShape('rectangle')} style={{ padding: '8px 10px', background: '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          🟦 Rect
        </button>
        <button onClick={() => addShape('rounded')} style={{ padding: '8px 10px', background: '#f59e0b', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          🔲 Rounded
        </button>
        <button onClick={() => addShape('diamond')} style={{ padding: '8px 10px', background: '#06b6d4', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          🔶 Diamond
        </button>

        <input type="color" value={shapeFillColor} onChange={(e) => setShapeFillColor(e.target.value)} title="Shape Fill Color" style={{ width: '28px', height: '28px', border: 'none', cursor: 'pointer', background: 'none' }} />

        {activeTool === 'draw' && (
          <input type="color" value={brushColor} onChange={(e) => setBrushColor(e.target.value)} title="Brush Color" style={{ width: '28px', height: '28px', border: 'none', cursor: 'pointer', background: 'none' }} />
        )}

        <div style={{ width: '1px', height: '24px', background: '#475569', margin: '0 2px' }} />

        <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} title="Canvas Background Color" style={{ width: '28px', height: '28px', border: 'none', cursor: 'pointer', background: 'none' }} />

        <div style={{ width: '1px', height: '24px', background: '#475569', margin: '0 2px' }} />

        <button onClick={() => undoManagerRef.current?.undo()} title="Undo (Ctrl+Z)" style={{ padding: '8px 10px', background: '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          ↩
        </button>
        <button onClick={() => undoManagerRef.current?.redo()} title="Redo (Ctrl+Y)" style={{ padding: '8px 10px', background: '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          ↪
        </button>

        <div style={{ width: '1px', height: '24px', background: '#475569', margin: '0 2px' }} />

        <button onClick={saveCanvasToMongoDB} style={{ padding: '8px 10px', background: '#059669', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          ☁️ Save DB
        </button>
        <button onClick={loadCanvasFromMongoDB} style={{ padding: '8px 10px', background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          📂 Load DB
        </button>

        <div style={{ width: '1px', height: '24px', background: '#475569', margin: '0 2px' }} />

        <button onClick={exportCanvasAsPNG} style={{ padding: '8px 12px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          💾 PNG
        </button>
        <button onClick={toggleVideoCall} style={{ padding: '8px 12px', background: isVideoActive ? '#ef4444' : '#8b5cf6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>
          {isVideoActive ? '🔴 End Cam' : '📹 Cam'}
        </button>

        <div style={{ padding: '6px 10px', background: '#0f172a', color: '#38bdf8', borderRadius: '6px', border: '1px solid #334155', fontSize: '13px', fontWeight: 500 }}>
          Online: {activeUsers} ({currentUser})
        </div>
      </div>

      {/* zoom controls */}
      <div style={{ position: 'fixed', bottom: 20, left: 20, zIndex: 9999, pointerEvents: 'auto', display: 'flex', gap: '8px', background: '#1e293b', padding: '8px 12px', borderRadius: '10px', border: '1px solid #334155', boxShadow: '0 10px 25px rgba(0,0,0,0.4)', alignItems: 'center' }}>
        <button onClick={zoomOut} style={{ padding: '6px 12px', background: '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>－</button>
        <span style={{ color: '#38bdf8', fontSize: '13px', fontWeight: 'bold', minWidth: '55px', textAlign: 'center' }}>{Math.round(viewport.scale * 100)}%</span>
        <button onClick={zoomIn} style={{ padding: '6px 12px', background: '#334155', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '16px' }}>＋</button>
        <button onClick={resetZoom} style={{ padding: '6px 10px', background: '#475569', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>Reset</button>
      </div>

      {/* camera preview grid */}
      <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, pointerEvents: 'auto', display: 'flex', gap: '10px', flexWrap: 'wrap', maxWidth: '440px', justifyContent: 'flex-end' }}>
        {isVideoActive && (
          <div style={{ background: '#1e293b', padding: '6px', borderRadius: '12px', border: '2px solid #8b5cf6', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
            <video ref={localVideoRef} autoPlay playsInline muted style={{ width: '180px', height: '120px', borderRadius: '8px', objectFit: 'cover', transform: 'scaleX(-1)', display: 'block' }} />
            <div style={{ color: '#fff', fontSize: '11px', textAlign: 'center', marginTop: '4px', fontWeight: 'bold' }}>{currentUser} (You)</div>
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

      {/* inline textarea overlay */}
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
            fontSize: '16px',
            fontFamily: 'sans-serif',
            color: '#0f172a',
            background: 'transparent',
            border: '1px dashed #0f172a',
            outline: 'none',
            resize: 'none',
            zIndex: 10000,
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