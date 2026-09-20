// HTTP上位プロトコルクラス
class HTTPSimulator {
    constructor(tcpManager) {
        this.tcpManager = tcpManager;
        this.sessions = new Map();
        this.eventListeners = new Map();
        this.httpLog = [];
        
        // HTTPメソッド
        this.HTTP_METHODS = {
            GET: 'GET',
            POST: 'POST',
            PUT: 'PUT',
            DELETE: 'DELETE',
            HEAD: 'HEAD'
        };
        
        // HTTPステータスコード
        this.HTTP_STATUS = {
            200: 'OK',
            201: 'Created',
            400: 'Bad Request',
            404: 'Not Found',
            500: 'Internal Server Error'
        };
        
        console.log('HTTP Simulator initialized');
    }

    // HTTPログに追加
    addToLog(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] ${type.toUpperCase()}: ${message}`;
        this.httpLog.push(logEntry);
        
        // ログが多くなりすぎないよう制限
        if (this.httpLog.length > 100) {
            this.httpLog.shift();
        }
        
        this.updateStatusPanel();
        console.log(logEntry);
    }

    // HTTPステータスパネル更新
    updateStatusPanel() {
        const panel = document.getElementById('http-status-panel');
        const sessionsList = document.getElementById('http-sessions-list');
        const logElement = document.getElementById('http-log');
        
        if (!panel || !sessionsList || !logElement) return;
        
        // セッション情報更新
        if (this.sessions.size === 0) {
            sessionsList.innerHTML = '<div style="color: #666; font-style: italic;">セッションなし</div>';
            // ログ表示がONの場合のみ表示状態を制御（未定義の場合はfalseとして扱う）
            if (window.showLogPanels) {
                // セッションがない場合でもログがあれば表示
                if (this.httpLog.length > 0) {
                    panel.style.display = 'block';
                } else {
                    panel.style.display = 'none';
                }
            } else {
                panel.style.display = 'none';
            }
        } else {
            // ログ表示がONの場合のみ表示
            if (window.showLogPanels) {
                panel.style.display = 'block';
            }
            
            const sessionsHTML = Array.from(this.sessions.values()).map(session => {
                const conn = session.connection;
                const localName = conn.localDevice.name || conn.localDevice.id;
                const remoteName = conn.remoteDevice.name || conn.remoteDevice.id;
                const status = session.requestSent ? 
                    (session.responseReceived ? 'Complete' : 'Waiting Response') : 
                    'Preparing';
                
                return `
                    <div class="http-session-item">
                        <div style="font-weight: bold;">${localName} ⟷ ${remoteName}</div>
                        <div style="color: #666; font-size: 9px;">
                            Status: ${status} | Port: ${conn.localPort}→${conn.remotePort}
                        </div>
                    </div>
                `;
            }).join('');
            
            sessionsList.innerHTML = sessionsHTML;
        }
        
        // ログ更新
        if (this.httpLog.length === 0) {
            logElement.innerHTML = '<div style="color: #666; font-style: italic;">ログなし</div>';
        } else {
            logElement.textContent = this.httpLog.slice(-20).join('\n'); // 最新20件
        }
    }

    // ログクリア
    clearLog() {
        this.httpLog = [];
        this.updateStatusPanel();
    }

    // イベントリスナーの登録
    addEventListener(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    // イベントの発火
    emit(event, data) {
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('HTTPSimulatorイベントハンドラーでエラー:', error);
                }
            });
        }
    }

    // HTTPリクエストの送信
    sendRequest(clientDevice, serverDevice, options = {}) {
        const {
            method = this.HTTP_METHODS.GET,
            path = '/',
            headers = {},
            body = '',
            serverPort = 80
        } = options;

        const clientName = clientDevice.name || clientDevice.id;
        const serverName = serverDevice.name || serverDevice.id;
        
        console.log(`🌐 HTTPリクエスト開始: ${clientName} → ${serverName}`);
        this.addToLog(`REQUEST START: ${clientName} → ${serverName} ${method} ${path}`);

        // TCP接続を作成
        const connection = this.tcpManager.createConnection(
            clientDevice, 
            serverDevice, 
            null, // クライアントポートは自動割り当て
            serverPort
        );

        if (!connection) {
            console.error('TCP接続の作成に失敗しました');
            return null;
        }

        // 既存セッションがある場合は削除して新規作成
        if (this.sessions.has(connection.id)) {
            console.log('既存HTTPセッションを削除:', connection.id);
            const oldSession = this.sessions.get(connection.id);
            if (oldSession.connection) {
                oldSession.connection.close();
            }
            this.sessions.delete(connection.id);
        }

        console.log('新規HTTPセッション作成:', connection.id);
        const session = new HTTPSession(connection, this);
        this.sessions.set(connection.id, session);

        // TCP接続のイベントリスナーを設定
        this.setupTCPEventListeners(connection, session);

        // HTTPリクエストデータを準備
        const requestData = this.buildHTTPRequest(method, path, headers, body);
        session.pendingRequest = {
            method, path, headers, body, requestData
        };

        // TCP接続を開始（3wayハンドシェイク）
        connection.connect();

        return session;
    }

    // TCP接続のイベントリスナー設定
    setupTCPEventListeners(connection, session) {
        connection.addEventListener('connectionEstablished', () => {
            // console.log('TCP接続確立完了、HTTPリクエストを送信します');
            
            // HTTPリクエストを送信
            if (session.pendingRequest) {
                // console.log('🚀 HTTPリクエスト開始イベントを発火中...');
                this.emit('httpRequestStart', {
                    session,
                    request: session.pendingRequest
                });
                // console.log('✅ HTTPリクエスト開始イベント発火完了');
                
                connection.send(session.pendingRequest.requestData);
                session.requestSent = true;
                session.pendingRequest = null;
            }
        });

        connection.addEventListener('dataReceived', (data) => {
            session.handleReceivedData(data.data);
        });

        connection.addEventListener('connectionReset', () => {
            this.sessions.delete(connection.id);
            this.emit('httpSessionClosed', { session, reason: 'connection_reset' });
        });
    }

    // HTTPリクエストの構築
    buildHTTPRequest(method, path, headers, body) {
        let request = `${method} ${path} HTTP/1.1\r\n`;
        
        // デフォルトヘッダー
        const defaultHeaders = {
            'Host': 'localhost',
            'User-Agent': 'NetworkSimulator/1.0',
            'Accept': '*/*',
            'Connection': 'close'
        };

        // ヘッダーをマージ
        const allHeaders = { ...defaultHeaders, ...headers };
        
        // Content-Lengthを自動設定
        if (body && body.length > 0) {
            allHeaders['Content-Length'] = body.length.toString();
        }

        // ヘッダーを追加
        Object.entries(allHeaders).forEach(([key, value]) => {
            request += `${key}: ${value}\r\n`;
        });

        // 空行でヘッダー終了
        request += '\r\n';

        // ボディを追加
        if (body) {
            request += body;
        }

        return request;
    }

    // HTTPレスポンスの構築
    buildHTTPResponse(statusCode, headers = {}, body = '') {
        const statusText = this.HTTP_STATUS[statusCode] || 'Unknown';
        let response = `HTTP/1.1 ${statusCode} ${statusText}\r\n`;
        
        // デフォルトヘッダー
        const defaultHeaders = {
            'Server': 'NetworkSimulator/1.0',
            'Content-Type': 'text/html; charset=UTF-8',
            'Connection': 'close'
        };

        // ヘッダーをマージ
        const allHeaders = { ...defaultHeaders, ...headers };
        
        // Content-Lengthを自動設定
        if (body && body.length > 0) {
            allHeaders['Content-Length'] = body.length.toString();
        }

        // ヘッダーを追加
        Object.entries(allHeaders).forEach(([key, value]) => {
            response += `${key}: ${value}\r\n`;
        });

        // 空行でヘッダー終了
        response += '\r\n';

        // ボディを追加
        if (body) {
            response += body;
        }

        return response;
    }

    // サンプルHTTPサーバーの設定
    setupSampleServer(serverDevice, port = 80) {
        console.log(`サンプルHTTPサーバーを設定: ${serverDevice.name || serverDevice.id}:${port}`);
        
        // サーバーのHTTPハンドラーを設定
        serverDevice.httpHandler = (request, session) => {
            const { method, path } = request;
            console.log(`📁 HTTPリクエスト受信: ${method} ${path}`);
            
            let responseBody = '';
            let statusCode = 200;
            
            // 簡単なルーティング
            switch (path) {
                case '/':
                    responseBody = `
                        <html>
                        <head><title>Network Simulator Server</title></head>
                        <body>
                            <h1>Welcome to Network Simulator</h1>
                            <p>This is a simulated HTTP server.</p>
                            <p>Current time: ${new Date().toLocaleString()}</p>
                        </body>
                        </html>
                    `;
                    break;
                    
                case '/api/status':
                    responseBody = JSON.stringify({
                        status: 'ok',
                        timestamp: Date.now(),
                        message: 'Server is running'
                    });
                    break;
                    
                case '/api/echo':
                    responseBody = JSON.stringify({
                        echo: 'Hello from server!',
                        method: method,
                        timestamp: Date.now()
                    });
                    break;
                    
                default:
                    statusCode = 404;
                    responseBody = `
                        <html>
                        <head><title>404 Not Found</title></head>
                        <body>
                            <h1>404 Not Found</h1>
                            <p>The requested path "${path}" was not found.</p>
                        </body>
                        </html>
                    `;
            }
            
            const responseData = this.buildHTTPResponse(statusCode, {}, responseBody);
            
            // レスポンス送信をシミュレート（処理時間）
            setTimeout(() => {
                console.log('📤 Sending HTTP response from setupSampleServer...');
                session.connection.send(responseData);

                console.log('🚀 Emitting httpResponseSent from setupSampleServer...');
                this.emit('httpResponseSent', {
                    session,
                    statusCode,
                    responseBody,
                    request
                });
                console.log('✅ httpResponseSent event emitted from setupSampleServer');

                // Connection: closeなので接続を終了
                setTimeout(() => {
                    session.connection.close();
                }, 100);
            }, Math.random() * 200 + 50); // 50-250msの処理時間
        };
    }

    // HTTPセッションの取得
    getSession(connectionId) {
        return this.sessions.get(connectionId);
    }

    // 全セッションの取得
    getAllSessions() {
        return Array.from(this.sessions.values());
    }

    // セッションのクリア
    clearAllSessions() {
        this.sessions.forEach(session => {
            if (session.connection) {
                session.connection.close();
            }
        });
        this.sessions.clear();
        console.log('全てのHTTPセッションをクリアしました');
    }

    // TCP接続IDの方向を反転させるヘルパーメソッド（HTTPSimulatorクラスレベル）
    getReversedConnectionId(connectionId) {
        try {
            // connectionIdの形式: "deviceA-timestampA_deviceB-timestampB_portA_portB"
            // 最後の2つのアンダースコアでポート部分を分離
            const parts = connectionId.split('_');
            if (parts.length >= 4) {
                const portB = parts.pop(); // 最後のポート
                const portA = parts.pop(); // 最後から2番目のポート
                
                // 残りを結合してデバイス部分を取得
                const devicesPart = parts.join('_');
                
                // デバイス部分を最初のアンダースコアで分割
                const firstUnderscoreIndex = devicesPart.indexOf('_');
                if (firstUnderscoreIndex !== -1) {
                    const deviceA = devicesPart.substring(0, firstUnderscoreIndex);
                    const deviceB = devicesPart.substring(firstUnderscoreIndex + 1);
                    
                    return `${deviceB}_${deviceA}_${portB}_${portA}`;
                }
            }
        } catch (error) {
            console.warn('TCP接続ID反転エラー:', error, connectionId);
        }
        return null;
    }
}

// HTTPセッションクラス
class HTTPSession {
    constructor(connection, httpSimulator) {
        this.connection = connection;
        this.httpSimulator = httpSimulator;
        this.id = connection.id;
        this.requestSent = false;
        this.responseReceived = false;
        this.requestProcessed = false; // サーバー側でのリクエスト処理完了フラグ
        this.responseProcessed = false; // クライアント側でのレスポンス処理完了フラグ
        this.responseSent = false; // レスポンス送信済みフラグ
        this.pendingRequest = null;
        this.receivedData = '';
        this.parsedRequest = null;
        this.parsedResponse = null;
        this.startTime = Date.now();
        this.endTime = null;
        
        // console.log(`HTTPセッション作成: ${this.id}`);
    }

    // 受信データの処理
    handleReceivedData(data) {
        // 重複データの処理を防ぐ
        if (this.receivedData.includes(data)) {
            console.log('重複データを検出、処理をスキップ:', data.substring(0, 50));
            return;
        }
        
        this.receivedData += data;
        console.log(`📨 HTTPデータ受信: ${data.length}バイト`);
        console.log(`🔍 受信したデータ: "${data}"`);
        console.log(`📊 累積データ: "${this.receivedData}"`);
        console.log(`🔍 localDeviceにhttpHandler: ${!!this.connection.localDevice.httpHandler}`);
        console.log(`🔍 remoteDeviceにhttpHandler: ${!!this.connection.remoteDevice.httpHandler}`);
        
        this.httpSimulator.addToLog(`DATA RECEIVED: ${data.length} bytes on ${this.id}`);
        
        try {
            // HTTPレスポンスかリクエストかを正しく判定
            const firstLine = this.receivedData.split('\r\n')[0];
            
            if (firstLine.startsWith('HTTP/1.1') || firstLine.startsWith('HTTP/1.0')) {
                // レスポンスを解析（クライアント側のみ）
                if (!this.connection.localDevice.httpHandler && !this.responseProcessed) {
                    console.log('HTTPレスポンスとして解析中...');
                    this.httpSimulator.addToLog(`PARSING: Response on ${this.id}`);
                    this.parseHTTPResponse();
                    this.responseProcessed = true; // レスポンス処理完了マーク
                } else {
                    console.log('サーバー側なのでレスポンス解析をスキップ、またはレスポンス処理済み');
                }
            } else if (firstLine.match(/^(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH)\s/)) {
                // リクエストを解析（サーバー側で未処理の場合のみ）
                const isServer = this.connection.remoteDevice.type === 'server' || this.connection.remoteDevice.name.includes('サーバー');
                console.log(`🔍 リクエスト判定: remoteDevice=${this.connection.remoteDevice.name}, type=${this.connection.remoteDevice.type}, isServer=${isServer}, requestProcessed=${this.requestProcessed}`);
                if (isServer && !this.requestProcessed) {
                    console.log('🚀 HTTPリクエストとして解析中...');
                    this.httpSimulator.addToLog(`PARSING: Request on ${this.id}`);
                    this.parseHTTPRequest();
                    this.requestProcessed = true; // リクエスト処理完了マーク
                } else {
                    console.log('⚠️ クライアント側なのでリクエスト解析をスキップ、またはリクエスト処理済み');
                }
            } else {
                console.log('HTTPメッセージの形式が不明:', firstLine);
                this.httpSimulator.addToLog(`ERROR: Unknown HTTP format: ${firstLine}`, 'error');
            }
        } catch (error) {
            console.error('HTTPデータ解析エラー:', error);
            this.httpSimulator.addToLog(`ERROR: Parse failed - ${error.message}`, 'error');
        }
    }

    // HTTPリクエストの解析
    parseHTTPRequest() {
        const lines = this.receivedData.split('\r\n');
        if (lines.length < 1) return;

        // リクエストラインを解析
        const requestLine = lines[0];
        const [method, path, version] = requestLine.split(' ');
        
        // ヘッダーを解析
        const headers = {};
        let headerEndIndex = 1;
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (line === '') {
                headerEndIndex = i;
                break;
            }
            const [key, ...valueParts] = line.split(':');
            if (key && valueParts.length > 0) {
                headers[key.trim()] = valueParts.join(':').trim();
            }
        }
        
        // ボディを取得
        const body = lines.slice(headerEndIndex + 1).join('\r\n');
        
        this.parsedRequest = { method, path, version, headers, body };
        
        // console.log(`HTTPリクエスト解析完了: ${method} ${path}`);
        
        this.httpSimulator.emit('httpRequestReceived', {
            session: this,
            request: this.parsedRequest
        });
        
        // レスポンス送信済みかチェック
        console.log('🔍 レスポンス送信チェック:', {
            sessionId: this.id,
            responseSent: this.responseSent,
            requestProcessed: this.requestProcessed
        });
        if (this.responseSent) {
            console.log('⚠️ 既にレスポンス送信済み、スキップ');
            return;
        }

        // サーバーハンドラーを呼び出し
        let response;
        if (this.connection.localDevice.httpHandler) {
            response = this.connection.localDevice.httpHandler(this.parsedRequest, this);
        } else {
            // デフォルトレスポンス
            response = {
                statusCode: 200,
                statusText: 'OK',
                headers: { 'Content-Type': 'text/html' },
                body: '<h1>Hello from Network Simulator!</h1><p>Default HTTP response</p>'
            };
            console.log('デフォルトHTTPレスポンス生成');
        }

        // レスポンス送信済みマークを先に設定（重複防止）
        this.responseSent = true;
        console.log('✅ responseSent フラグを設定:', this.id);

        // HTTPレスポンスを送信（サーバー側の接続を使用）
        if (response) {
            this.httpSimulator.addToLog(`RESPONSE: ${response.statusCode} ${response.statusText}`);
            const responseData = this.httpSimulator.buildHTTPResponse(
                response.statusCode, 
                response.statusText, 
                response.headers, 
                response.body
            );
            console.log('HTTPレスポンス送信:', responseData.substring(0, 100));
            
            // サーバー側の接続を見つけて送信
            const localDevice = this.connection.localDevice;
            const remoteDevice = this.connection.remoteDevice;
            
            // 対応するサーバー側接続を検索
            const serverConnection = Array.from(window.tcpManager.connections.values()).find(conn => {
                return conn.localDevice === remoteDevice && conn.remoteDevice === localDevice;
            });
            
            if (serverConnection) {
                console.log('🔍 サーバー側接続でレスポンス送信:', serverConnection.id);
                console.log('🔍 レスポンスデータ詳細:', {
                    dataLength: responseData.length,
                    data: responseData.substring(0, 200) + '...',
                    serverConnectionState: serverConnection.state
                });

                // HTTPレスポンス送信イベントを発火
                console.log('🚀 HTTPレスポンス送信イベントを発火中...');
                this.httpSimulator.emit('httpResponseSent', {
                    session: this,
                    response: response,
                    serverConnection: serverConnection
                });
                console.log('✅ HTTPレスポンス送信イベント発火完了');

                console.log('🔍 serverConnection.send() を呼び出し中...');
                const sendResult = serverConnection.send(responseData);
                console.log('🔍 serverConnection.send() 結果:', sendResult);
            } else {
                console.error('サーバー側接続が見つかりません');
            }
        }
    }

    // HTTPレスポンスの解析
    parseHTTPResponse() {
        const lines = this.receivedData.split('\r\n');
        if (lines.length < 1) return;

        // ステータスラインを解析
        const statusLine = lines[0];
        const [version, statusCode, ...statusTextParts] = statusLine.split(' ');
        const statusText = statusTextParts.join(' ');
        
        // ヘッダーを解析
        const headers = {};
        let headerEndIndex = 1;
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i];
            if (line === '') {
                headerEndIndex = i;
                break;
            }
            const [key, ...valueParts] = line.split(':');
            if (key && valueParts.length > 0) {
                headers[key.trim()] = valueParts.join(':').trim();
            }
        }
        
        // ボディを取得
        const body = lines.slice(headerEndIndex + 1).join('\r\n');
        
        this.parsedResponse = { 
            version, 
            statusCode: parseInt(statusCode), 
            statusText, 
            headers, 
            body 
        };
        
        this.responseReceived = true;
        this.endTime = Date.now();
        
        console.log(`HTTPレスポンス解析完了: ${statusCode} ${statusText}`);
        
        this.httpSimulator.emit('httpResponseReceived', {
            session: this,
            response: this.parsedResponse,
            duration: this.endTime - this.startTime
        });
    }

    // セッション情報の取得
    getSessionInfo() {
        return {
            id: this.id,
            startTime: this.startTime,
            endTime: this.endTime,
            duration: this.endTime ? this.endTime - this.startTime : null,
            requestSent: this.requestSent,
            responseReceived: this.responseReceived,
            request: this.parsedRequest,
            response: this.parsedResponse,
            connectionState: this.connection.state
        };
    }

    // TCP接続IDの方向を反転させるヘルパーメソッド
    // 例: "pc-123_server-456_1024_80" → "server-456_pc-123_80_1024" 
    getReversedConnectionId(connectionId) {
        try {
            // connectionIdの形式: "deviceA-timestampA_deviceB-timestampB_portA_portB"
            // 最後の2つのアンダースコアでポート部分を分離
            const parts = connectionId.split('_');
            if (parts.length >= 4) {
                const portB = parts.pop(); // 最後のポート
                const portA = parts.pop(); // 最後から2番目のポート
                
                // 残りを結合してデバイス部分を取得
                const devicesPart = parts.join('_');
                
                // デバイス部分を最初のアンダースコアで分割
                const firstUnderscoreIndex = devicesPart.indexOf('_');
                if (firstUnderscoreIndex !== -1) {
                    const deviceA = devicesPart.substring(0, firstUnderscoreIndex);
                    const deviceB = devicesPart.substring(firstUnderscoreIndex + 1);
                    
                    return `${deviceB}_${deviceA}_${portB}_${portA}`;
                }
            }
        } catch (error) {
            console.warn('TCP接続ID反転エラー:', error, connectionId);
        }
        return null;
    }

    // セッション状態をリセット（新しい通信の準備）
    reset() {
        console.log(`HTTPセッションリセット: ${this.id}`);
        this.requestSent = false;
        this.responseReceived = false;
        this.requestProcessed = false;
        this.responseProcessed = false;
        this.responseSent = false;
        this.pendingRequest = null;
        this.receivedData = '';
        this.parsedRequest = null;
        this.parsedResponse = null;
        this.startTime = Date.now();
        this.endTime = null;
        // processedフラグもリセット
        this.processed = false;
    }
}

// グローバルHTTPシミュレーターインスタンス
window.httpSimulator = new HTTPSimulator(window.tcpManager);

console.log('HTTP Simulator loaded successfully');