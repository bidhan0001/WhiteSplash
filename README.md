# ✦ WhiteSplash ✦

A real-time collaborative infinite canvas application built with **React**, **Vite**, **Node.js**, **Express**, **MongoDB**, and **Yjs**. WhiteSplash allows multiple users to draw, brainstorm with sticky notes, create shapes, and collaborate in real time with live video streams and persistent cloud storage.

---

## 🚀 Features

- **Infinite Canvas & Viewport Controls**: Smooth panning, zooming, and customizable canvas backgrounds.
- **Real-Time Collaboration**: Powered by WebSockets and Yjs for live multi-user cursor and element synchronization.
- **Custom Shapes & Sticky Notes**: Draw freehand paths, rectangles, circles, rounded boxes, diamonds, and double-click editable sticky notes.
- **Database Persistence**: Save and restore canvas states securely to/from MongoDB.
- **Video Chat Integration**: Built-in peer video streaming preview for collaborators.
- **Secure Authentication Gate**: Clean login screen gate before accessing the collaborative workspace.

---

## 🛠️ Tech Stack

- **Frontend**: React, Vite, HTML5 Canvas API, Yjs, `y-websocket`
- **Backend**: Node.js, Express, Mongoose, CORS
- **Database**: MongoDB / MongoDB Atlas

---

## 📦 Project Setup & Installation

### 1. Clone the Repository
```bash
git clone [https://github.com/bidhan0001/whitesplash.git](https://github.com/your-username/whitesplash.git)
cd whitesplash

# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
