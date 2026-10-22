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

export default function App(){
  return(
    <div style={{ width: '100vw', height: '100vh', background: '#0f172a', color: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <h2>White Splash</h2>
    </div>
  );
}