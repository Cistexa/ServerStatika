# AI Run & Test Instructions (PowerShell Command List)

This document contains precise PowerShell commands and execution sequences for the AI agent to install, compile, and run the ServerStatika system.

---

## Phase 1: Compile React Frontend
To compile the frontend and output static bundles into the backend's embedding directory:
```powershell
# Go to dashboard directory, install dependencies, and build Vite assets
cd c:\Users\cinar\Documents\GitHub\ServerStatika\dashboard
npm install
npm run build
```

---

## Phase 2: Start Central Backend Server
To launch the backend server as a background task. It will automatically load the embedded React application and listen on port `8080`:
```powershell
# Go to backend directory and start the Go server
cd c:\Users\cinar\Documents\GitHub\ServerStatika\backend
go run .
```
> [!NOTE]
> Ensure port `8080` is free. The database file `statika.db` will be created automatically in the backend directory.

---

## Phase 3: Start Monitor Agent
To launch the agent client as a background task. It will register itself and stream CPU, RAM, and Disk metrics every 5 seconds:
```powershell
# Go to agent directory and run the Go client
cd c:\Users\cinar\Documents\GitHub\ServerStatika\agent
go run .
```

---

## Phase 4: Clean Up & Stop Processes
To terminate all background testing tasks and free up port `8080`:
```powershell
# Clean up running backend and agent tasks by querying tasks in the UI or killing processes on port 8080:
Stop-Process -Name "serverstatika" -ErrorAction SilentlyContinue
Stop-Process -Name "agent" -ErrorAction SilentlyContinue
```
