import React, { useEffect, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

interface CanvasElement{
  id:string;
  type:'sticky'|'path'|'circle'|'rectangle';
  x?:number;
  y?:number;
  width?:number;
  height?:number;
  radius?:number;
  color:string;
  text?:string;
  points?:{x:number,y:number}[];
}

export default function App() {
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [activeUsers, setActiveUsers] = useState<number>(1);

  // References to persist Yjs documents and maps without triggering extra re-renders
  const ydocRef = useRef<Y.Doc | null>(null);
  const elementsMapRef = useRef<Y.Map<CanvasElement> | null>(null);
  const undoManagerRef = useRef<Y.UndoManager | null>(null);

  useEffect(() => {
    // 1. Initialize root Yjs doc container
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // 2. Get strictly typed collaborative map
    const elementsMap = ydoc.getMap<CanvasElement>('sanctum-elements');
    elementsMapRef.current = elementsMap;

    // 3. Initialize UndoManager for Ctrl+Z / Ctrl+Y history tracking
    const undoManager = new Y.UndoManager(elementsMap);
    undoManagerRef.current = undoManager;

    // 4. Connect to local WebSocket relay server
    const provider = new WebsocketProvider('ws://localhost:1234', 'sanctum-room-alpha', ydoc);

    // 5. Track live connected peers via WebRTC / WebSocket awareness
    provider.awareness.on('change', () => {
      setActiveUsers(provider.awareness.getStates().size);
    });

    // 6. Listen for changes in the collaborative map and update React state
    elementsMap.observe(() => {
      setElements(Array.from(elementsMap.values()));
    });

    // 7. Cleanup on unmount
    return () => {
      provider.destroy();
      ydoc.destroy();
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0f172a', color: '#fff', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'sans-serif' }}>
      <h1>✦ The Shared Sanctum ✦</h1>
      <p style={{ color: '#38bdf8', fontSize: '18px', marginTop: '10px' }}>Step 1 & Step 2 Successfully Integrated!</p>
      <div style={{ marginTop: '20px', background: '#1e293b', padding: '16px 24px', borderRadius: '12px', border: '1px solid #334155' }}>
        <p>🟢 Active Users Online: <strong>{activeUsers}</strong></p>
        <p>📦 Synchronized Elements Count: <strong>{elements.length}</strong></p>
      </div>
    </div>
  );
}