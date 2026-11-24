import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { WebSocketServer, WebSocket } from 'ws';
import chalk from 'chalk';

export const DEFAULT_MESH_PORT = 49152;

export interface MeshPeerInfo {
  nodeId: string;
  role: string;
  workspace: string;
  mode: 'build' | 'plan';
  model: string;
  provider: string;
  connectedAt: number;
  isHost?: boolean;
}

export interface MeshRPCRequest {
  type: 'RPC_REQUEST';
  id: string;
  from: string;
  fromRole: string;
  to: string; // role or nodeId
  action: 'execute_tool' | 'peer_message' | 'get_status';
  tool?: string;
  args?: Record<string, any>;
  message?: string;
}

export interface MeshRPCResponse {
  type: 'RPC_RESPONSE';
  id: string;
  from: string;
  fromRole: string;
  to: string;
  success: boolean;
  result?: any;
  error?: string;
}

export type MeshMessage =
  | { type: 'AUTH'; token: string; peer: MeshPeerInfo }
  | { type: 'AUTH_OK'; assignedNodeId: string; peers: MeshPeerInfo[] }
  | { type: 'AUTH_FAIL'; reason: string }
  | { type: 'PEER_JOINED'; peer: MeshPeerInfo }
  | { type: 'PEER_LEFT'; nodeId: string }
  | { type: 'PEER_UPDATE'; peer: MeshPeerInfo }
  | { type: 'PEER_LIST'; peers: MeshPeerInfo[] }
  | MeshRPCRequest
  | MeshRPCResponse;

export interface MeshNodeOptions {
  role?: string;
  port?: number;
  token?: string;
  mode?: 'build' | 'plan';
  model?: string;
  provider?: string;
  workspace?: string;
  onRemoteToolExecution?: (
    tool: string,
    args: Record<string, any>,
    fromRole: string
  ) => Promise<string>;
  onPeerMessage?: (message: string, fromRole: string, fromNodeId: string) => void;
  onPeerConnect?: (peer: MeshPeerInfo) => void;
  onPeerDisconnect?: (peer: MeshPeerInfo) => void;
}

/**
 * Retrieve or generate shared local mesh authentication secret token.
 * Kept secure in ~/.banglacli/mesh.token with restricted file permissions.
 */
export function getOrCreateMeshToken(customToken?: string): string {
  if (customToken && customToken.trim().length > 0) {
    return customToken.trim();
  }
  if (process.env.BANGLACLI_MESH_TOKEN && process.env.BANGLACLI_MESH_TOKEN.trim().length > 0) {
    return process.env.BANGLACLI_MESH_TOKEN.trim();
  }

  const dir = path.join(os.homedir(), '.banglacli');
  const tokenFile = path.join(dir, 'mesh.token');

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    if (fs.existsSync(tokenFile)) {
      const existing = fs.readFileSync(tokenFile, 'utf8').trim();
      if (existing.length >= 16) {
        return existing;
      }
    }

    const newToken = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(tokenFile, newToken, { encoding: 'utf8', mode: 0o600 });
    return newToken;
  } catch {
    return 'banglacli-local-mesh-token-default';
  }
}

/**
 * Auto-detect a sensible instance role from workspace files if not explicitly provided.
 */
export function autoDetectRole(workspace = process.cwd()): string {
  const base = path.basename(workspace).toLowerCase();
  if (base.includes('front') || base.includes('client') || base.includes('ui') || base.includes('web')) {
    return 'frontend';
  }
  if (base.includes('back') || base.includes('server') || base.includes('api')) {
    return 'backend';
  }

  try {
    const pkgPath = path.join(workspace, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const raw = fs.readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(raw);
      const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (allDeps['next'] || allDeps['react'] || allDeps['vue'] || allDeps['vite'] || allDeps['svelte']) {
        return 'frontend';
      }
      if (allDeps['express'] || allDeps['@nestjs/core'] || allDeps['fastify'] || allDeps['koa'] || allDeps['prisma']) {
        return 'backend';
      }
    }
  } catch {}

  return base || 'agent';
}

export class MeshNode extends EventEmitter {
  public readonly nodeId: string;
  public role: string;
  public workspace: string;
  public mode: 'build' | 'plan';
  public model: string;
  public provider: string;
  public readonly port: number;
  public readonly token: string;

  private isHost = false;
  private wss: WebSocketServer | null = null;
  private clientWs: WebSocket | null = null;
  private connectedClients = new Map<WebSocket, MeshPeerInfo>();
  private peers = new Map<string, MeshPeerInfo>(); // nodeId -> MeshPeerInfo
  private pendingRequests = new Map<
    string,
    {
      resolve: (value: MeshRPCResponse) => void;
      reject: (reason: any) => void;
      timeoutTimer: NodeJS.Timeout;
    }
  >();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private running = false;

  private onRemoteToolExecution?: (
    tool: string,
    args: Record<string, any>,
    fromRole: string
  ) => Promise<string>;
  private onPeerMessage?: (message: string, fromRole: string, fromNodeId: string) => void;
  private onPeerConnectCallback?: (peer: MeshPeerInfo) => void;
  private onPeerDisconnectCallback?: (peer: MeshPeerInfo) => void;

  constructor(options: MeshNodeOptions = {}) {
    super();
    this.nodeId = `node-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    this.workspace = options.workspace || process.cwd();
    this.role = options.role || autoDetectRole(this.workspace);
    this.port = options.port || DEFAULT_MESH_PORT;
    this.token = getOrCreateMeshToken(options.token);
    this.mode = options.mode || 'build';
    this.model = options.model || 'unknown';
    this.provider = options.provider || 'unknown';

    this.onRemoteToolExecution = options.onRemoteToolExecution;
    this.onPeerMessage = options.onPeerMessage;
    this.onPeerConnectCallback = options.onPeerConnect;
    this.onPeerDisconnectCallback = options.onPeerDisconnect;
  }

  public getMyPeerInfo(): MeshPeerInfo {
    return {
      nodeId: this.nodeId,
      role: this.role,
      workspace: this.workspace,
      mode: this.mode,
      model: this.model,
      provider: this.provider,
      connectedAt: Date.now(),
      isHost: this.isHost,
    };
  }

  /**
   * Start the mesh node: auto-negotiates Broker Host or Peer Client.
   */
  public async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    try {
      await this.tryStartAsHost();
    } catch {
      await this.startAsClient();
    }
  }

  /**
   * Attempt to bind port 49152 as the mesh Broker Host.
   */
  private tryStartAsHost(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = new WebSocketServer({
        host: '127.0.0.1',
        port: this.port,
      });

      server.once('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          reject(err);
        } else {
          reject(err);
        }
      });

      server.once('listening', () => {
        this.wss = server;
        this.isHost = true;
        this.setupHostServer();
        resolve();
      });
    });
  }

  /**
   * Broker Host listener & connection routing logic.
   */
  private setupHostServer(): void {
    if (!this.wss) return;

    this.wss.on('connection', (ws: WebSocket) => {
      let authedPeer: MeshPeerInfo | null = null;

      // Impose a 5-second authentication timeout on unauthenticated sockets
      const authTimeout = setTimeout(() => {
        if (!authedPeer) {
          try {
            ws.send(JSON.stringify({ type: 'AUTH_FAIL', reason: 'Authentication timeout' }));
            ws.close(4001, 'Auth Timeout');
          } catch {}
        }
      }, 5000);

      ws.on('message', async (data: Buffer | string) => {
        try {
          const msg = JSON.parse(data.toString('utf-8')) as MeshMessage;

          // 1. Handshake Authentication
          if (msg.type === 'AUTH') {
            if (msg.token !== this.token) {
              ws.send(JSON.stringify({ type: 'AUTH_FAIL', reason: 'Invalid mesh secret token' }));
              ws.close(4001, 'Unauthorized');
              return;
            }

            clearTimeout(authTimeout);
            authedPeer = msg.peer;
            this.connectedClients.set(ws, authedPeer);
            this.peers.set(authedPeer.nodeId, authedPeer);

            // Send back current peer list to the new connection
            const peerList = this.listPeers();
            ws.send(
              JSON.stringify({
                type: 'AUTH_OK',
                assignedNodeId: authedPeer.nodeId,
                peers: peerList,
              })
            );

            // Broadcast PEER_JOINED to other connected nodes
            this.broadcast(
              {
                type: 'PEER_JOINED',
                peer: authedPeer,
              },
              ws
            );

            this.emit('peer_connected', authedPeer);
            this.onPeerConnectCallback?.(authedPeer);
            return;
          }

          if (!authedPeer) {
            ws.close(4001, 'Unauthenticated');
            return;
          }

          // 2. Route RPC requests & responses
          if (msg.type === 'RPC_REQUEST') {
            await this.handleIncomingRPCRequest(msg, ws);
            return;
          }

          if (msg.type === 'RPC_RESPONSE') {
            this.handleIncomingRPCResponse(msg);
            return;
          }

          if (msg.type === 'PEER_UPDATE') {
            authedPeer = { ...authedPeer, ...msg.peer };
            this.connectedClients.set(ws, authedPeer);
            this.peers.set(authedPeer.nodeId, authedPeer);
            this.broadcast(msg, ws);
            this.emit('peer_updated', authedPeer);
            return;
          }
        } catch {}
      });

      ws.on('close', () => {
        clearTimeout(authTimeout);
        if (authedPeer) {
          const departing = authedPeer;
          this.connectedClients.delete(ws);
          this.peers.delete(departing.nodeId);
          this.broadcast({ type: 'PEER_LEFT', nodeId: departing.nodeId });
          this.emit('peer_disconnected', departing);
          this.onPeerDisconnectCallback?.(departing);
        }
      });
    });
  }

  /**
   * Connect as a Peer Client to an existing Broker Host.
   */
  private startAsClient(): Promise<void> {
    return new Promise((resolve) => {
      const url = `ws://127.0.0.1:${this.port}`;
      const ws = new WebSocket(url);
      this.clientWs = ws;
      this.isHost = false;

      ws.on('open', () => {
        // Send AUTH handshake
        const authMsg: MeshMessage = {
          type: 'AUTH',
          token: this.token,
          peer: this.getMyPeerInfo(),
        };
        ws.send(JSON.stringify(authMsg));
      });

      ws.on('message', async (data: Buffer | string) => {
        try {
          const msg = JSON.parse(data.toString('utf-8')) as MeshMessage;

          if (msg.type === 'AUTH_OK') {
            this.peers.clear();
            for (const p of msg.peers) {
              if (p.nodeId !== this.nodeId) {
                this.peers.set(p.nodeId, p);
              }
            }
            resolve();
            return;
          }

          if (msg.type === 'AUTH_FAIL') {
            this.running = false;
            try { ws.close(); } catch {}
            resolve();
            return;
          }

          if (msg.type === 'PEER_JOINED') {
            if (msg.peer.nodeId !== this.nodeId) {
              this.peers.set(msg.peer.nodeId, msg.peer);
              this.emit('peer_connected', msg.peer);
              this.onPeerConnectCallback?.(msg.peer);
            }
            return;
          }

          if (msg.type === 'PEER_LEFT') {
            const departed = this.peers.get(msg.nodeId);
            if (departed) {
              this.peers.delete(msg.nodeId);
              this.emit('peer_disconnected', departed);
              this.onPeerDisconnectCallback?.(departed);
            }
            return;
          }

          if (msg.type === 'PEER_UPDATE') {
            if (msg.peer.nodeId !== this.nodeId) {
              this.peers.set(msg.peer.nodeId, msg.peer);
              this.emit('peer_updated', msg.peer);
            }
            return;
          }

          if (msg.type === 'RPC_REQUEST') {
            await this.handleIncomingRPCRequest(msg);
            return;
          }

          if (msg.type === 'RPC_RESPONSE') {
            this.handleIncomingRPCResponse(msg);
            return;
          }
        } catch {}
      });

      ws.on('error', () => {
        resolve(); // proceed even if initial connection fails, retry in background
      });

      ws.on('close', () => {
        this.peers.clear();
        this.clientWs = null;
        resolve();
        if (this.running) {
          this.scheduleReconnect();
        }
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (!this.running) return;
      try {
        await this.tryStartAsHost();
      } catch {
        await this.startAsClient();
      }
    }, 3000);
  }

  /**
   * Broadcast a message to all connected clients (if Host).
   */
  private broadcast(msg: MeshMessage, excludeWs?: WebSocket): void {
    const raw = JSON.stringify(msg);
    for (const [client] of this.connectedClients) {
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        try {
          client.send(raw);
        } catch {}
      }
    }
  }

  /**
   * Process incoming RPC Request (e.g. tool execution or message).
   */
  private async handleIncomingRPCRequest(req: MeshRPCRequest, fromWs?: WebSocket): Promise<void> {
    const targetMatch =
      req.to === this.nodeId ||
      req.to.toLowerCase() === this.role.toLowerCase() ||
      req.to.toLowerCase() === 'all' ||
      req.to.toLowerCase() === '*';

    // If I am Host and the request is intended for another client, route it!
    if (this.isHost && !targetMatch) {
      for (const [client, peer] of this.connectedClients) {
        if (client !== fromWs && (peer.nodeId === req.to || peer.role.toLowerCase() === req.to.toLowerCase())) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(req));
            return;
          }
        }
      }
      // Target peer was not found
      this.sendRPCResponse({
        type: 'RPC_RESPONSE',
        id: req.id,
        from: this.nodeId,
        fromRole: this.role,
        to: req.from,
        success: false,
        error: `Mesh peer "${req.to}" not found or disconnected.`,
      });
      return;
    }

    if (!targetMatch) return;

    // Handle peer message
    if (req.action === 'peer_message') {
      const msgText = req.message || '';
      this.emit('peer_message', { message: msgText, fromRole: req.fromRole, fromNodeId: req.from });
      this.onPeerMessage?.(msgText, req.fromRole, req.from);

      this.sendRPCResponse({
        type: 'RPC_RESPONSE',
        id: req.id,
        from: this.nodeId,
        fromRole: this.role,
        to: req.from,
        success: true,
        result: `Message delivered to ${this.role} (${this.nodeId}).`,
      });
      return;
    }

    // Handle tool execution request
    if (req.action === 'execute_tool') {
      const toolName = req.tool || '';
      const toolArgs = req.args || {};

      try {
        if (!this.onRemoteToolExecution) {
          throw new Error(`Instance "${this.role}" does not have a tool execution handler configured.`);
        }

        const result = await this.onRemoteToolExecution(toolName, toolArgs, req.fromRole);
        this.sendRPCResponse({
          type: 'RPC_RESPONSE',
          id: req.id,
          from: this.nodeId,
          fromRole: this.role,
          to: req.from,
          success: !result.startsWith('Error:'),
          result,
        });
      } catch (err: any) {
        this.sendRPCResponse({
          type: 'RPC_RESPONSE',
          id: req.id,
          from: this.nodeId,
          fromRole: this.role,
          to: req.from,
          success: false,
          error: err.message || String(err),
        });
      }
      return;
    }

    if (req.action === 'get_status') {
      this.sendRPCResponse({
        type: 'RPC_RESPONSE',
        id: req.id,
        from: this.nodeId,
        fromRole: this.role,
        to: req.from,
        success: true,
        result: this.getMyPeerInfo(),
      });
    }
  }

  /**
   * Handle incoming RPC response and resolve pending request promise.
   */
  private handleIncomingRPCResponse(res: MeshRPCResponse): void {
    // If I am Host and response is for someone else, forward it
    if (this.isHost && res.to !== this.nodeId) {
      for (const [client, peer] of this.connectedClients) {
        if (peer.nodeId === res.to || peer.role.toLowerCase() === res.to.toLowerCase()) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(res));
            return;
          }
        }
      }
    }

    const pending = this.pendingRequests.get(res.id);
    if (pending) {
      clearTimeout(pending.timeoutTimer);
      this.pendingRequests.delete(res.id);
      pending.resolve(res);
    }
  }

  private sendRPCResponse(res: MeshRPCResponse): void {
    const raw = JSON.stringify(res);
    if (this.isHost) {
      // Find client socket for res.to
      for (const [client, peer] of this.connectedClients) {
        if (peer.nodeId === res.to || peer.role.toLowerCase() === res.to.toLowerCase()) {
          if (client.readyState === WebSocket.OPEN) {
            client.send(raw);
            return;
          }
        }
      }
    } else if (this.clientWs && this.clientWs.readyState === WebSocket.OPEN) {
      this.clientWs.send(raw);
    }
  }

  /**
   * List all other active connected peers in the mesh.
   */
  public listPeers(): MeshPeerInfo[] {
    const list: MeshPeerInfo[] = [];
    // If I am host, include myself first
    if (this.isHost) {
      list.push(this.getMyPeerInfo());
    }
    for (const p of this.peers.values()) {
      list.push(p);
    }
    return list;
  }

  /**
   * Find a peer by role name (e.g. "backend", "frontend") or exact nodeId.
   */
  public findPeer(roleOrId: string): MeshPeerInfo | null {
    const query = roleOrId.toLowerCase().trim();
    if (this.nodeId.toLowerCase() === query || this.role.toLowerCase() === query) {
      return this.getMyPeerInfo();
    }
    for (const p of this.peers.values()) {
      if (p.nodeId.toLowerCase() === query || p.role.toLowerCase() === query) {
        return p;
      }
    }
    return null;
  }

  /**
   * Execute a tool on a remote peer instance over the WebSocket mesh RPC.
   */
  public async callRemoteTool(
    targetRoleOrId: string,
    toolName: string,
    args: Record<string, any> = {},
    timeoutMs = 45000
  ): Promise<string> {
    const peer = this.findPeer(targetRoleOrId);
    if (!peer && targetRoleOrId !== 'all') {
      const activePeers = this.listPeers().filter((p) => p.nodeId !== this.nodeId);
      const peerSummary = activePeers.length > 0
        ? `Connected peers: ${activePeers.map((p) => `"${p.role}" (${p.workspace})`).join(', ')}`
        : 'No other banglacli instances are currently connected.';
      return `Error: Peer instance "${targetRoleOrId}" not found in mesh. ${peerSummary}`;
    }

    const reqId = `rpc-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const req: MeshRPCRequest = {
      type: 'RPC_REQUEST',
      id: reqId,
      from: this.nodeId,
      fromRole: this.role,
      to: peer ? peer.nodeId : targetRoleOrId,
      action: 'execute_tool',
      tool: toolName,
      args,
    };

    return new Promise((resolve) => {
      const timeoutTimer = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        resolve(`Error: Remote tool call "${toolName}" on "${targetRoleOrId}" timed out (${Math.round(timeoutMs / 1000)}s).`);
      }, timeoutMs);

      this.pendingRequests.set(reqId, {
        resolve: (res) => {
          if (res.success) {
            resolve(res.result !== undefined ? String(res.result) : 'Tool completed successfully.');
          } else {
            resolve(`Error on remote peer [${res.fromRole}]: ${res.error || 'Execution failed'}`);
          }
        },
        reject: (err) => {
          resolve(`Error invoking remote tool: ${err.message || String(err)}`);
        },
        timeoutTimer,
      });

      const raw = JSON.stringify(req);
      if (this.isHost) {
        if (peer) {
          for (const [client, p] of this.connectedClients) {
            if (p.nodeId === peer.nodeId && client.readyState === WebSocket.OPEN) {
              client.send(raw);
              return;
            }
          }
        }
      } else if (this.clientWs && this.clientWs.readyState === WebSocket.OPEN) {
        this.clientWs.send(raw);
      } else {
        clearTimeout(timeoutTimer);
        this.pendingRequests.delete(reqId);
        resolve(`Error: Mesh client is not connected to host broker.`);
      }
    });
  }

  /**
   * Send a direct structured communication message to a peer instance.
   */
  public async sendMessage(
    targetRoleOrId: string,
    message: string,
    timeoutMs = 10000
  ): Promise<string> {
    const peer = this.findPeer(targetRoleOrId);
    if (!peer) {
      return `Error: Peer "${targetRoleOrId}" is not connected to the mesh.`;
    }

    const reqId = `msg-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const req: MeshRPCRequest = {
      type: 'RPC_REQUEST',
      id: reqId,
      from: this.nodeId,
      fromRole: this.role,
      to: peer.nodeId,
      action: 'peer_message',
      message,
    };

    return new Promise((resolve) => {
      const timeoutTimer = setTimeout(() => {
        this.pendingRequests.delete(reqId);
        resolve(`Error: Message to "${targetRoleOrId}" timed out.`);
      }, timeoutMs);

      this.pendingRequests.set(reqId, {
        resolve: (res) => {
          if (res.success) {
            resolve(String(res.result || 'Message delivered successfully.'));
          } else {
            resolve(`Failed to deliver message: ${res.error}`);
          }
        },
        reject: (err) => {
          resolve(`Error sending message: ${err.message}`);
        },
        timeoutTimer,
      });

      const raw = JSON.stringify(req);
      if (this.isHost) {
        for (const [client, p] of this.connectedClients) {
          if (p.nodeId === peer.nodeId && client.readyState === WebSocket.OPEN) {
            client.send(raw);
            return;
          }
        }
      } else if (this.clientWs && this.clientWs.readyState === WebSocket.OPEN) {
        this.clientWs.send(raw);
      } else {
        clearTimeout(timeoutTimer);
        this.pendingRequests.delete(reqId);
        resolve(`Error: Not connected to mesh broker.`);
      }
    });
  }

  /**
   * Broadcast state update (e.g. mode change or model change).
   */
  public updateState(updates: { mode?: 'build' | 'plan'; model?: string; role?: string }): void {
    if (updates.mode) this.mode = updates.mode;
    if (updates.model) this.model = updates.model;
    if (updates.role) this.role = updates.role;

    const myInfo = this.getMyPeerInfo();
    const updateMsg: MeshMessage = {
      type: 'PEER_UPDATE',
      peer: myInfo,
    };

    if (this.isHost) {
      this.broadcast(updateMsg);
    } else if (this.clientWs && this.clientWs.readyState === WebSocket.OPEN) {
      this.clientWs.send(JSON.stringify(updateMsg));
    }
  }

  public setToolHandler(
    fn: (tool: string, args: Record<string, any>, fromRole: string) => Promise<string>
  ): void {
    this.onRemoteToolExecution = fn;
  }

  public setMessageHandler(
    fn: (message: string, fromRole: string, fromNodeId: string) => void
  ): void {
    this.onPeerMessage = fn;
  }

  public stop(): void {
    this.running = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const [, req] of this.pendingRequests) {
      clearTimeout(req.timeoutTimer);
    }
    this.pendingRequests.clear();

    if (this.clientWs) {
      try {
        this.clientWs.close();
      } catch {}
      this.clientWs = null;
    }

    if (this.wss) {
      try {
        for (const [client] of this.connectedClients) {
          try { client.close(); } catch {}
        }
        this.connectedClients.clear();
        this.wss.close();
      } catch {}
      this.wss = null;
    }
    this.peers.clear();
  }
}
