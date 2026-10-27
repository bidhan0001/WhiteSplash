import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';

// Types & Interfaces
export type ToolType = 'select' | 'pan' | 'pen' | 'rectangle' | 'circle' | 'sticky' | 'eraser';

export interface CanvasElement {
  id: string;
  type: ToolType;
  x: number;
  y: number;
  width?: number;
  height?: number;
  radius?: number;
  strokeColor: string;
  fillColor?: string;
  lineWidth: number;
  points?: { x: number; y: number }[];
  text?: string;
}

export interface PeerUser {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
}

export const App: React.FC = () => {
  // Tool & Canvas State
  const [activeTool, setActiveTool] = useState<ToolType>('pen');
  const [strokeColor, setStrokeColor] = useState<string>('#38bdf8');
  const [lineWidth, setLineWidth] = useState<number>(4);
  const [stickyText, setStickyText] = useState<string>('Cosmic Idea ✨');

  // Canvas Viewport State (Pan & Zoom)
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [startPan, setStartPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // History & Elements
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [history, setHistory] = useState<CanvasElement[][]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [currentElement, setCurrentElement] = useState<CanvasElement | null>(null);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  // Camera & Collaboration State
  const [isVideoOn, setIsVideoOn] = useState<boolean>(false);
  const [peers, setPeers] = useState<PeerUser[]>([
    { id: '1', name: 'Astra', color: '#ec4899', x: 200, y: 150 },
    { id: '2', name: 'Orion', color: '#10b981', x: 450, y: 300 }
  ]);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Save history state helper
  const saveToHistory = useCallback((newElements: CanvasElement[]) => {
    const updatedHistory = history.slice(0, historyIndex + 1);
    setHistory([...updatedHistory, newElements]);
    setHistoryIndex(updatedHistory.length);
    setElements(newElements);
  }, [history, historyIndex]);

  // Initial State History Setup
  useEffect(() => {
    if (history.length === 0) {
      setHistory([[]]);
      setHistoryIndex(0);
    }
  }, [history.length]);

  // Handle Camera Toggle
  const toggleCamera = async () => {
    if (isVideoOn) {
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
      setIsVideoOn(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        mediaStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setIsVideoOn(true);
      } catch (err) {
        alert('Could not access camera device.');
      }
    }
  };

  // Simulate Peer Cursor Movements
  useEffect(() => {
    const interval = setInterval(() => {
      setPeers((prevPeers) =>
        prevPeers.map((peer) => ({
          ...peer,
          x: Math.max(100, Math.min(window.innerWidth - 100, peer.x + (Math.random() - 0.5) * 40)),
          y: Math.max(100, Math.min(window.innerHeight - 100, peer.y + (Math.random() - 0.5) * 40))
        }))
      );
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Screen-to-Canvas Coordinate Conversion
  const getCanvasCoordinates = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const rawX = e.clientX - rect.left;
    const rawY = e.clientY - rect.top;
    return {
      x: (rawX - panOffset.x) / zoomScale,
      y: (rawY - panOffset.y) / zoomScale
    };
  };

  // Draw Background Starry Galaxy & Aurora Theme
  const drawCosmicBackground = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const spaceGradient = ctx.createLinearGradient(0, 0, width, height);
    spaceGradient.addColorStop(0, '#030712');
    spaceGradient.addColorStop(0.4, '#0b0f29');
    spaceGradient.addColorStop(0.8, '#0f172a');
    spaceGradient.addColorStop(1, '#1e1b4b');
    ctx.fillStyle = spaceGradient;
    ctx.fillRect(0, 0, width, height);

    const aurora1 = ctx.createRadialGradient(width * 0.3, height * 0.2, 50, width * 0.3, height * 0.2, width * 0.6);
    aurora1.addColorStop(0, 'rgba(16, 185, 129, 0.15)');
    aurora1.addColorStop(0.5, 'rgba(6, 182, 212, 0.08)');
    aurora1.addColorStop(1, 'transparent');
    ctx.fillStyle = aurora1;
    ctx.fillRect(0, 0, width, height);

    const aurora2 = ctx.createRadialGradient(width * 0.7, height * 0.7, 50, width * 0.7, height * 0.7, width * 0.5);
    aurora2.addColorStop(0, 'rgba(168, 85, 247, 0.18)');
    aurora2.addColorStop(0.5, 'rgba(236, 72, 153, 0.08)');
    aurora2.addColorStop(1, 'transparent');
    ctx.fillStyle = aurora2;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1;
    const gridSize = 60 * zoomScale;
    const startX = panOffset.x % gridSize;
    const startY = panOffset.y % gridSize;

    for (let x = startX; x < width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = startY; y < height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  };

  // Render Elements Loop
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    drawCosmicBackground(ctx, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(panOffset.x, panOffset.y);
    ctx.scale(zoomScale, zoomScale);

    const allElements = currentElement ? [...elements, currentElement] : elements;

    allElements.forEach((el) => {
      ctx.beginPath();
      ctx.strokeStyle = el.strokeColor;
      ctx.lineWidth = el.lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.shadowColor = el.strokeColor;
      ctx.shadowBlur = el.type === 'pen' ? 8 : 0;

      if (el.type === 'pen' && el.points && el.points.length > 0) {
        ctx.moveTo(el.points[0].x, el.points[0].y);
        for (let i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.points[i].x, el.points[i].y);
        }
        ctx.stroke();
      } else if (el.type === 'rectangle' && el.width !== undefined && el.height !== undefined) {
        if (el.fillColor) {
          ctx.fillStyle = el.fillColor;
          ctx.fillRect(el.x, el.y, el.width, el.height);
        }
        ctx.strokeRect(el.x, el.y, el.width, el.height);
      } else if (el.type === 'circle' && el.radius !== undefined) {
        ctx.arc(el.x, el.y, Math.abs(el.radius), 0, 2 * Math.PI);
        if (el.fillColor) {
          ctx.fillStyle = el.fillColor;
          ctx.fill();
        }
        ctx.stroke();
      } else if (el.type === 'sticky') {
        const width = el.width || 180;
        const height = el.height || 140;

        ctx.shadowBlur = 12;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.fillStyle = el.fillColor || 'rgba(30, 41, 59, 0.85)';
        ctx.strokeStyle = el.strokeColor || '#38bdf8';
        ctx.lineWidth = 2;

        const r = 12;
        ctx.beginPath();
        ctx.moveTo(el.x + r, el.y);
        ctx.lineTo(el.x + width - r, el.y);
        ctx.quadraticCurveTo(el.x + width, el.y, el.x + width, el.y + r);
        ctx.lineTo(el.x + width, el.y + height - r);
        ctx.quadraticCurveTo(el.x + width, el.y + height, el.x + width - r, el.y + height);
        ctx.lineTo(el.x + r, el.y + height);
        ctx.quadraticCurveTo(el.x, el.y + height, el.x, el.y + height - r);
        ctx.lineTo(el.x, el.y + r);
        ctx.quadraticCurveTo(el.x, el.y, el.x + r, el.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#f8fafc';
        ctx.font = '600 15px sans-serif';

        const words = (el.text || '').split(' ');
        let line = '';
        let lineY = el.y + 32;
        const maxLineWidth = width - 24;

        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxLineWidth && n > 0) {
            ctx.fillText(line, el.x + 12, lineY);
            line = words[n] + ' ';
            lineY += 22;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line, el.x + 12, lineY);
      }

      if (selectedElementId === el.id) {
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        const padding = 10;
        if (el.type === 'rectangle' && el.width && el.height) {
          ctx.strokeRect(el.x - padding, el.y - padding, el.width + padding * 2, el.height + padding * 2);
        } else if (el.type === 'sticky') {
          ctx.strokeRect(
            el.x - padding,
            el.y - padding,
            (el.width || 180) + padding * 2,
            (el.height || 140) + padding * 2
          );
        }
        ctx.setLineDash([]);
      }
    });

    ctx.restore();
  }, [elements, currentElement, panOffset, zoomScale, selectedElementId]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (activeTool === 'pan') {
      setIsPanning(true);
      setStartPan({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
      return;
    }

    const coords = getCanvasCoordinates(e);
    setIsDrawing(true);

    if (activeTool === 'select') {
      const clicked = elements.slice().reverse().find((el) => {
        if (el.type === 'rectangle' || el.type === 'sticky') {
          const w = el.width || 180;
          const h = el.height || 140;
          return coords.x >= el.x && coords.x <= el.x + w && coords.y >= el.y && coords.y <= el.y + h;
        }
        return false;
      });
      setSelectedElementId(clicked ? clicked.id : null);
      setIsDrawing(false);
      return;
    }

    const newId = Date.now().toString();

    if (activeTool === 'pen') {
      setCurrentElement({
        id: newId,
        type: 'pen',
        x: coords.x,
        y: coords.y,
        strokeColor,
        lineWidth,
        points: [{ x: coords.x, y: coords.y }]
      });
    } else if (activeTool === 'rectangle') {
      setCurrentElement({
        id: newId,
        type: 'rectangle',
        x: coords.x,
        y: coords.y,
        width: 0,
        height: 0,
        strokeColor,
        fillColor: 'rgba(56, 189, 248, 0.1)',
        lineWidth
      });
    } else if (activeTool === 'circle') {
      setCurrentElement({
        id: newId,
        type: 'circle',
        x: coords.x,
        y: coords.y,
        radius: 0,
        strokeColor,
        fillColor: 'rgba(168, 85, 247, 0.1)',
        lineWidth
      });
    } else if (activeTool === 'sticky') {
      const newSticky: CanvasElement = {
        id: newId,
        type: 'sticky',
        x: coords.x - 90,
        y: coords.y - 70,
        width: 180,
        height: 140,
        strokeColor,
        fillColor: 'rgba(15, 23, 42, 0.9)',
        lineWidth: 2,
        text: stickyText || 'Cosmic Idea ✨'
      };
      saveToHistory([...elements, newSticky]);
      setIsDrawing(false);
    } else if (activeTool === 'eraser') {
      const filtered = elements.filter((el) => {
        const dist = Math.hypot(el.x - coords.x, el.y - coords.y);
        return dist > 30;
      });
      saveToHistory(filtered);
      setIsDrawing(false);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isPanning) {
      setPanOffset({
        x: e.clientX - startPan.x,
        y: e.clientY - startPan.y
      });
      return;
    }

    if (!isDrawing || !currentElement) return;
    const coords = getCanvasCoordinates(e);

    if (currentElement.type === 'pen' && currentElement.points) {
      setCurrentElement({
        ...currentElement,
        points: [...currentElement.points, { x: coords.x, y: coords.y }]
      });
    } else if (currentElement.type === 'rectangle') {
      setCurrentElement({
        ...currentElement,
        width: coords.x - currentElement.x,
        height: coords.y - currentElement.y
      });
    } else if (currentElement.type === 'circle') {
      const rad = Math.hypot(coords.x - currentElement.x, coords.y - currentElement.y);
      setCurrentElement({
        ...currentElement,
        radius: rad
      });
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }
    if (isDrawing && currentElement) {
      saveToHistory([...elements, currentElement]);
      setCurrentElement(null);
      setIsDrawing(false);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    const newZoom = Math.max(0.2, Math.min(4, zoomScale * zoomFactor));
    setZoomScale(newZoom);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setElements(history[historyIndex - 1]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setElements(history[historyIndex + 1]);
    }
  };

  const exportCanvasImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const imageURI = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'The-Shared-Sanctum-Cosmic-Canvas.png';
    link.href = imageURI;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClear = () => {
    if (window.confirm('Clear all celestial drawings?')) {
      saveToHistory([]);
    }
  };

  return (
    <div className="sanctum-wrapper" ref={containerRef}>
      {/* Top Header Navigation Bar */}
      <header className="sanctum-header">
        <div className="brand-section">
          <svg className="sparkle-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.9 5.8-5.8 1.9 5.8 1.9 1.9 5.8 1.9-5.8 5.8-1.9-5.8-1.9z"/></svg>
          <h1 className="brand-title">The Shared Sanctum</h1>
          <span className="badge-live">GALAXY CRDT LIVE</span>
        </div>

        <div className="peer-badge">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span>{peers.length + 1} Explorers Connected</span>
        </div>

        <div className="header-actions">
          <button className="btn-icon" onClick={handleUndo} disabled={historyIndex <= 0} title="Undo (Ctrl+Z)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
          </button>
          <button className="btn-icon" onClick={handleRedo} disabled={historyIndex >= history.length - 1} title="Redo (Ctrl+Y)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/></svg>
          </button>
          <div className="divider"></div>
          <button className={`btn-primary ${isVideoOn ? 'active' : ''}`} onClick={toggleCamera}>
            {isVideoOn ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.72a4 4 0 1 1-5.56-5.56"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            )}
            <span>{isVideoOn ? 'Stop Camera' : 'Live Camera'}</span>
          </button>
          <button className="btn-export" onClick={exportCanvasImage}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Export Starry PNG</span>
          </button>
        </div>
      </header>

      {/* Floating Toolbar */}
      <div className="sanctum-toolbar">
        <button
          className={`tool-btn ${activeTool === 'select' ? 'selected' : ''}`}
          onClick={() => setActiveTool('select')}
          title="Select Object"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 3 7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="m13 13 6 6"/></svg>
        </button>
        <button
          className={`tool-btn ${activeTool === 'pan' ? 'selected' : ''}`}
          onClick={() => setActiveTool('pan')}
          title="Pan Canvas"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>
        </button>
        <button
          className={`tool-btn ${activeTool === 'pen' ? 'selected' : ''}`}
          onClick={() => setActiveTool('pen')}
          title="Neon Brush"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
        </button>
        <button
          className={`tool-btn ${activeTool === 'rectangle' ? 'selected' : ''}`}
          onClick={() => setActiveTool('rectangle')}
          title="Rectangle"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
        </button>
        <button
          className={`tool-btn ${activeTool === 'circle' ? 'selected' : ''}`}
          onClick={() => setActiveTool('circle')}
          title="Orb / Circle"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/></svg>
        </button>
        <button
          className={`tool-btn ${activeTool === 'sticky' ? 'selected' : ''}`}
          onClick={() => setActiveTool('sticky')}
          title="Cosmic Sticky Note"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z"/><path d="M15 3v6h6"/></svg>
        </button>
        <button
          className={`tool-btn ${activeTool === 'eraser' ? 'selected' : ''}`}
          onClick={() => setActiveTool('eraser')}
          title="Eraser"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/><path d="M22 21H7"/><path d="m5 11 9 9"/></svg>
        </button>

        <div className="divider-vertical"></div>

        <div className="color-picker-container" title="Choose Neon Aura Color">
          <svg className="color-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c0-1.5 1.5-3 3-3s3 1.5 3 3c2.8 0 5-2.2 5-5 0-4.4-3.6-8-8-8z"/></svg>
          <input
            type="color"
            value={strokeColor}
            onChange={(e) => setStrokeColor(e.target.value)}
            className="color-picker-input"
          />
        </div>

        {activeTool === 'pen' && (
          <input
            type="range"
            min="2"
            max="24"
            value={lineWidth}
            onChange={(e) => setLineWidth(Number(e.target.value))}
            className="stroke-slider"
            title="Stroke Thickness"
          />
        )}

        {activeTool === 'sticky' && (
          <input
            type="text"
            value={stickyText}
            onChange={(e) => setStickyText(e.target.value)}
            placeholder="Sticky text..."
            className="sticky-input"
          />
        )}

        <div className="divider-vertical"></div>

        <button className="tool-btn danger" onClick={handleClear} title="Clear Everything">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
      </div>

      <canvas
        ref={canvasRef}
        className={`sanctum-canvas ${activeTool === 'pan' ? 'cursor-grab' : 'cursor-crosshair'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      />

      {peers.map((peer) => (
        <div
          key={peer.id}
          className="peer-cursor"
          style={{
            transform: `translate3d(${peer.x}px, ${peer.y}px, 0px)`,
            backgroundColor: peer.color
          }}
        >
          <span className="peer-label">{peer.name}</span>
        </div>
      ))}

      {isVideoOn && (
        <div className="camera-widget">
          <div className="camera-header">
            <span>Explorer Feed</span>
            <span className="live-dot"></span>
          </div>
          <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
        </div>
      )}

      <div className="zoom-controls">
        <button onClick={() => setZoomScale((z) => Math.min(4, z + 0.15))} title="Zoom In">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </button>
        <span className="zoom-percentage">{Math.round(zoomScale * 100)}%</span>
        <button onClick={() => setZoomScale((z) => Math.max(0.2, z - 0.15))} title="Zoom Out">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
        </button>
        <button
          onClick={() => {
            setZoomScale(1);
            setPanOffset({ x: 0, y: 0 });
          }}
          title="Reset Viewport"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>
        </button>
      </div>
    </div>
  );
};

export default App;