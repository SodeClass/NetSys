// TCP接続の状態定数
const TCP_STATES = {
    CLOSED: 'CLOSED',
    LISTEN: 'LISTEN',
    SYN_SENT: 'SYN_SENT',
    SYN_RECEIVED: 'SYN_RECEIVED',
    ESTABLISHED: 'ESTABLISHED',
    FIN_WAIT_1: 'FIN_WAIT_1',
    FIN_WAIT_2: 'FIN_WAIT_2',
    CLOSE_WAIT: 'CLOSE_WAIT',
    CLOSING: 'CLOSING',
    LAST_ACK: 'LAST_ACK',
    TIME_WAIT: 'TIME_WAIT'
};

// TCPフラグ定数
const TCP_FLAGS = {
    SYN: 'SYN',
    ACK: 'ACK',
    FIN: 'FIN',
    RST: 'RST',
    PSH: 'PSH',
    URG: 'URG'
};

// TCPセグメントクラス
class TCPSegment {
    constructor(options = {}) {
        this.sourcePort = options.sourcePort || 0;
        this.destPort = options.destPort || 0;
        this.sequenceNumber = options.sequenceNumber || 0;
        this.acknowledgmentNumber = options.acknowledgmentNumber || 0;
        this.flags = options.flags || [];
        this.windowSize = options.windowSize || 65535;
        this.data = options.data || '';
        this.timestamp = Date.now();
        this.id = Math.random().toString(36).substr(2, 9);
    }

    hasFlag(flag) {
        return this.flags.includes(flag);
    }

    toString() {
        const flagStr = this.flags.join(',');
        return `TCP[${this.sourcePort}→${this.destPort}] Seq=${this.sequenceNumber} Ack=${this.acknowledgmentNumber} Flags=[${flagStr}] Win=${this.windowSize}`;
    }
}

// TCP接続クラス
class TCPConnection {
    constructor(localDevice, remoteDevice, localPort, remotePort) {
        this.localDevice = localDevice;
        this.remoteDevice = remoteDevice;
        this.localPort = localPort;
        this.remotePort = remotePort;
        this.state = TCP_STATES.CLOSED;
        this.localSequenceNumber = Math.floor(Math.random() * 1000000);
        this.remoteSequenceNumber = 0;
        this.localAckNumber = 0;
        this.remoteAckNumber = 0;
        this.windowSize = 65535;
        this.sentSegments = [];
        this.receivedSegments = [];
        this.id = `${localDevice.id}_${remoteDevice.id}_${localPort}_${remotePort}`;
        this.eventListeners = new Map();
        
        // 再送タイマー関連（教育モード対応）
        this.retransmissionTimer = null;
        this.retransmissionTimeout = 5000; // 5秒（実際のネットワーク用）
        this.maxRetransmissions = 3;
        this.retransmissionCount = 0;
        this.educationalMode = true; // 教育モード：アニメーション速度による再送を防ぐ
        
        // フロー制御関連
        this.sendWindow = 65535;
        this.receiveWindow = 65535;
        
        console.log(`新しいTCP接続を作成: ${this.id}`);
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
                    console.error('イベントハンドラーでエラー:', error);
                }
            });
        }
    }

    // 状態変更
    setState(newState) {
        const oldState = this.state;
        this.state = newState;
        console.log(`TCP接続 ${this.id}: ${oldState} → ${newState}`);
        this.emit('stateChange', { oldState, newState, connection: this });
    }

    // セグメント送信（内部処理）
    sendSegment(segment) {
        this.sentSegments.push(segment);
        console.log(`🔍 sendSegment詳細:`, {
            data: segment.data,
            dataLength: segment.data ? segment.data.length : 0,
            flags: segment.flags,
            hasPSH: segment.hasFlag('PSH'),
            hasACK: segment.hasFlag('ACK'),
            toString: segment.toString()
        });
        
        // アニメーション時間を計算（速度調整適用）
        let baseAnimationDelay = 1000; // デフォルト値
        if (typeof window.calculateAnimationDuration === 'function') {
            // console.log('calculateAnimationDuration関数が利用可能です');
            baseAnimationDelay = window.calculateAnimationDuration(
                window.simulator || this.simulator, 
                this.localDevice, 
                this.remoteDevice,
                { hopDuration: 400, hopDelay: 50 }
            );
            // console.log('計算されたアニメーション時間:', baseAnimationDelay, 'ms');
        } else {
            console.warn('calculateAnimationDuration関数が利用できません。デフォルト値を使用:', baseAnimationDelay, 'ms');
        }
        
        const speedMultiplier = window.animationSpeedMultiplier || 1.0;
        const animationDelay = Math.max(50, baseAnimationDelay * speedMultiplier);
        
        // console.log(`${this.id}: アニメーション遅延時間 ${animationDelay}ms で配信を予定 (baseDelay: ${baseAnimationDelay}ms, speedMultiplier: ${speedMultiplier})`);
        
        // アニメーション完了時のコールバックを定義
        const onAnimationComplete = () => {
            // console.log(`✅ ${this.id}: パケット到着！セグメント配信中...`);
            if (this.remoteDevice && typeof this.remoteDevice.receiveSegment === 'function') {
                // 宛先側で対応する接続を探す
                let targetConnection = this.findOrCreateCounterpartConnection(segment);
                this.remoteDevice.receiveSegment(segment, targetConnection);
            }
        };

        // 送信方向は常に localDevice → remoteDevice
        // （クライアント接続：client → server、サーバー接続：server → client）
        const actualSource = this.localDevice;
        const actualDestination = this.remoteDevice;
        
        console.log(`📡 TCP セグメント送信: ${actualSource.name}(${actualSource.type}) → ${actualDestination.name}(${actualDestination.type}) [${segment.toString()}]`);
        
        // アニメーション用イベント発火（コールバック付き）
        this.emit('segmentSent', {
            segment,
            source: actualSource,
            destination: actualDestination,
            connection: this,
            onAnimationComplete // 到着コールバックを渡す
        });
        
        // 再送が必要なセグメント（SYN、データ等）の場合、再送タイマーを開始
        if (segment.hasFlag('SYN') || (segment.data && segment.data.length > 0)) {
            this.startRetransmissionTimer(segment, animationDelay);
        }
    }

    // 対応する接続を探すか作成する
    findOrCreateCounterpartConnection(segment) {
        const manager = window.tcpManager;
        
        // console.log(`🔍 ${this.id}: 対応する接続を検索中... (送信先: ${this.remoteDevice.name || this.remoteDevice.id})`);
        
        // 既存の接続を探す（逆方向）
        const existingConnection = manager.getAllConnections().find(conn => 
            conn.localDevice === this.remoteDevice &&
            conn.remoteDevice === this.localDevice &&
            conn.localPort === this.remotePort &&
            conn.remotePort === this.localPort
        );
        
        if (existingConnection) {
            // console.log(`✅ ${this.id}: 既存の対応接続を発見:`, existingConnection.id, '状態:', existingConnection.state);
            return existingConnection;
        }
        
        // SYNセグメントの場合、新しい接続を作成
        if (segment.hasFlag('SYN') && !segment.hasFlag('ACK')) {
            // console.log(`🆕 ${this.id}: 新しい対応接続を作成（サーバー側）`);
            const serverConnection = manager.createConnection(
                this.remoteDevice,
                this.localDevice,
                this.remotePort,
                this.localPort
            );
            // console.log(`🎧 ${this.id}: サーバー接続 ${serverConnection.id} をLISTEN状態に設定`);
            serverConnection.listen();
            return serverConnection;
        }
        
        console.log(`❌ ${this.id}: 対応する接続が見つからず、新規作成もできません`);
        return null;
    }

    // セグメント受信処理
    receiveSegment(segment) {
        // セグメント受信のデバッグログ
        console.log(`🔄 ${this.id}: receiveSegment called`, {
            hasData: !!(segment.data && segment.data.length > 0),
            dataLength: segment.data ? segment.data.length : 0,
            data: segment.data ? segment.data.substring(0, 50) : 'null',
            flags: segment.flags
        });

        this.receivedSegments.push(segment);
        // 重要な状態変化のみログ出力
        if (segment.hasFlag('SYN') || segment.hasFlag('FIN')) {
            let segmentType;
            if (segment.hasFlag('SYN') && segment.hasFlag('ACK')) {
                segmentType = 'SYN-ACK';
            } else if (segment.hasFlag('SYN')) {
                segmentType = 'SYN';
            } else if (segment.hasFlag('FIN')) {
                segmentType = 'FIN';
            }
            console.log(`🔄 ${this.id}: ${segmentType}セグメント受信`);
        }
        
        this.emit('segmentReceived', {
            segment,
            connection: this
        });

        // 状態に応じた処理
        this.processSegment(segment);
    }

    // セグメント処理の状態マシン
    processSegment(segment) {
        switch (this.state) {
            case TCP_STATES.LISTEN:
                this.handleListenState(segment);
                break;
            case TCP_STATES.SYN_SENT:
                this.handleSynSentState(segment);
                break;
            case TCP_STATES.SYN_RECEIVED:
                this.handleSynReceivedState(segment);
                break;
            case TCP_STATES.ESTABLISHED:
                this.handleEstablishedState(segment);
                break;
            case TCP_STATES.FIN_WAIT_1:
                this.handleFinWait1State(segment);
                break;
            case TCP_STATES.FIN_WAIT_2:
                this.handleFinWait2State(segment);
                break;
            case TCP_STATES.CLOSE_WAIT:
                this.handleCloseWaitState(segment);
                break;
            case TCP_STATES.LAST_ACK:
                this.handleLastAckState(segment);
                break;
            default:
                console.warn(`未処理の状態でセグメント受信: ${this.state}`);
        }
    }

    // LISTEN状態でのセグメント処理
    handleListenState(segment) {
        // console.log(`🎯 ${this.id} (LISTEN状態) でセグメント処理中:`, segment.toString());
        
        if (segment.hasFlag(TCP_FLAGS.SYN)) {
            console.log(`🤝 ${this.id}: SYN受信 → SYN-ACK送信`);
            
            // SYN受信 → SYN-ACK送信
            this.remoteSequenceNumber = segment.sequenceNumber;
            this.localAckNumber = this.remoteSequenceNumber + 1;
            
            const synAckSegment = new TCPSegment({
                sourcePort: this.localPort,
                destPort: this.remotePort,
                sequenceNumber: this.localSequenceNumber,
                acknowledgmentNumber: this.localAckNumber,
                flags: [TCP_FLAGS.SYN, TCP_FLAGS.ACK]
            });
            
            this.setState(TCP_STATES.SYN_RECEIVED);
            
            // console.log(`📤 ${this.id}: サーバーからSYN-ACK送信中...`, synAckSegment.toString());
            this.sendSegment(synAckSegment);
            this.localSequenceNumber++;
        } else {
            // console.log(`❌ ${this.id}: LISTEN状態でSYN以外のセグメント受信:`, segment.toString());
        }
    }

    // SYN_SENT状態でのセグメント処理
    handleSynSentState(segment) {
        if (segment.hasFlag(TCP_FLAGS.SYN) && segment.hasFlag(TCP_FLAGS.ACK)) {
            // 既に接続確立済みの場合は重複SYN-ACKなので無視
            if (this.state === TCP_STATES.ESTABLISHED) {
                console.log(`${this.id}: 既にESTABLISHED状態 - 重複SYN-ACKを無視`);
                return;
            }
            
            // SYN-ACK受信 → ACK送信
            this.remoteSequenceNumber = segment.sequenceNumber;
            this.localAckNumber = this.remoteSequenceNumber + 1;
            
            // 再送タイマーをクリア（SYNに対するACKを受信したため）
            this.clearRetransmissionTimer();
            
            const ackSegment = new TCPSegment({
                sourcePort: this.localPort,
                destPort: this.remotePort,
                sequenceNumber: this.localSequenceNumber,
                acknowledgmentNumber: this.localAckNumber,
                flags: [TCP_FLAGS.ACK]
            });
            
            this.setState(TCP_STATES.ESTABLISHED);
            this.sendSegment(ackSegment);
            
            // 接続確立完了イベント
            this.emit('connectionEstablished', { connection: this });
        }
    }

    // SYN_RECEIVED状態でのセグメント処理
    handleSynReceivedState(segment) {
        if (segment.hasFlag(TCP_FLAGS.ACK)) {
            // 最終ACK受信 → 接続確立
            // 再送タイマーをクリア（SYN-ACKに対するACKを受信したため）
            this.clearRetransmissionTimer();

            this.setState(TCP_STATES.ESTABLISHED);
            this.emit('connectionEstablished', { connection: this });

            // ACKセグメントにデータが含まれている場合は、ESTABLISHED状態として処理
            if (segment.data && segment.data.length > 0) {
                console.log(`🔍 ${this.id}: SYN_RECEIVED→ESTABLISHED移行時にデータ付きセグメント検出`);
                this.handleEstablishedState(segment);
            }
        }
    }

    // ESTABLISHED状態でのセグメント処理
    handleEstablishedState(segment) {
        // 詳細デバッグログ
        console.log(`🔍 ${this.id}: ESTABLISHED状態でセグメント処理`);
        console.log(`🔍 handleEstablishedState セグメント情報:`, {
            hasData: !!(segment.data && segment.data.length > 0),
            dataLength: segment.data ? segment.data.length : 0,
            data: segment.data ? `"${segment.data.substring(0, 100)}"` : 'null',
            flags: segment.flags,
            hasPSH: segment.hasFlag('PSH'),
            hasACK: segment.hasFlag('ACK'),
            hasFIN: segment.hasFlag('FIN'),
            segmentDataType: typeof segment.data,
            segmentDataActual: segment.data
        });

        // データや重要なフラグのみログ出力
        if (segment.hasFlag('FIN') || (segment.data && segment.data.length > 0)) {
            console.log(`${this.id}: ${segment.hasFlag('FIN') ? 'FIN' : 'DATA'}セグメント受信 (${segment.data ? segment.data.length : 0}バイト)`);
        }
        
        if (segment.hasFlag(TCP_FLAGS.FIN)) {
            // FIN受信 → 接続終了プロセス開始
            this.localAckNumber = segment.sequenceNumber + 1;
            
            const ackSegment = new TCPSegment({
                sourcePort: this.localPort,
                destPort: this.remotePort,
                sequenceNumber: this.localSequenceNumber,
                acknowledgmentNumber: this.localAckNumber,
                flags: [TCP_FLAGS.ACK]
            });
            
            this.setState(TCP_STATES.CLOSE_WAIT);
            this.sendSegment(ackSegment);
        } else if (segment.data && segment.data.length > 0) {
            // データ受信 → ACK送信
            // console.log(`${this.id}: データセグメント処理開始`);
            this.handleDataSegment(segment);
        } else if (segment.hasFlag(TCP_FLAGS.ACK)) {
            // ACKのみのセグメント受信 → 適切なACK番号の場合のみ再送タイマーをクリア
            const expectedAck = this.localSequenceNumber;
            // console.log(`期待ACK番号: ${expectedAck}, 受信ACK番号: ${segment.acknowledgmentNumber}`);
            
            if (segment.acknowledgmentNumber >= expectedAck) {
                this.clearRetransmissionTimer();
                // console.log(`${this.id}: 正しいACK受信により再送タイマーをクリア (ACK=${segment.acknowledgmentNumber})`);
            } else {
                // console.log(`${this.id}: 古いACK受信 (ACK=${segment.acknowledgmentNumber} < 期待値=${expectedAck}) - タイマーは継続`);
            }
        }
    }

    // データセグメント処理
    handleDataSegment(segment) {
        console.log(`${this.id}: データ受信 (${segment.data.length}バイト) - ${segment.data.substring(0, 50)}...`);
        
        // 重複チェック: 既に受信済みのシーケンス番号かチェック
        const expectedSeq = this.localAckNumber || 0;
        // console.log(`期待シーケンス番号: ${expectedSeq}, 受信シーケンス番号: ${segment.sequenceNumber}`);
        
        if (segment.sequenceNumber < expectedSeq) {
            console.log(`🔄 ${this.id}: 重複データ検出 - ACKのみ送信`);
            
            // 重複データの場合はACKのみ送信（データイベントは発火しない）
            const ackSegment = new TCPSegment({
                sourcePort: this.localPort,
                destPort: this.remotePort,
                sequenceNumber: this.localSequenceNumber,
                acknowledgmentNumber: expectedSeq, // 既に受信済みの位置
                flags: [TCP_FLAGS.ACK]
            });
            
            this.sendSegment(ackSegment);
            return; // 重複なので処理終了
        }
        
        // 新しいデータの場合のみ処理
        this.localAckNumber = segment.sequenceNumber + segment.data.length;
        
        const ackSegment = new TCPSegment({
            sourcePort: this.localPort,
            destPort: this.remotePort,
            sequenceNumber: this.localSequenceNumber,
            acknowledgmentNumber: this.localAckNumber,
            flags: [TCP_FLAGS.ACK]
        });
        
        this.sendSegment(ackSegment);
        
        // データ受信イベント（新しいデータの場合のみ）
        // console.log(`${this.id}: dataReceivedイベントを発火 (新しいデータ)`);
        console.log(`✅ ${this.id}: 新データ処理完了 → アプリケーションに通知`);
        this.emit('dataReceived', {
            data: segment.data,
            segment,
            connection: this
        });
    }

    // アクティブオープン（クライアント側からの接続開始）
    connect() {
        if (this.state !== TCP_STATES.CLOSED) {
            console.warn('既に接続処理中または接続済みです');
            return;
        }

        const synSegment = new TCPSegment({
            sourcePort: this.localPort,
            destPort: this.remotePort,
            sequenceNumber: this.localSequenceNumber,
            acknowledgmentNumber: 0,
            flags: [TCP_FLAGS.SYN]
        });

        this.setState(TCP_STATES.SYN_SENT);
        this.sendSegment(synSegment);
        this.localSequenceNumber++;
        
        // 再送タイマーはsendSegment内で設定される
    }

    // パッシブオープン（サーバー側の待機開始）
    listen() {
        this.setState(TCP_STATES.LISTEN);
        // console.log(`TCP接続 ${this.id}: LISTEN状態で待機中`);
    }

    // データ送信
    send(data) {
        if (this.state !== TCP_STATES.ESTABLISHED) {
            console.warn('接続が確立されていません');
            return false;
        }

        console.log(`🚀 ${this.id}: データ送信 (${data.length}バイト) - ${data.substring(0, 50)}...`);

        const dataSegment = new TCPSegment({
            sourcePort: this.localPort,
            destPort: this.remotePort,
            sequenceNumber: this.localSequenceNumber,
            acknowledgmentNumber: this.localAckNumber,
            flags: [TCP_FLAGS.PSH, TCP_FLAGS.ACK],
            data: data
        });

        console.log(`🔍 作成されたセグメント詳細:`, {
            data: dataSegment.data,
            dataLength: dataSegment.data ? dataSegment.data.length : 0,
            flags: dataSegment.flags,
            hasPSH: dataSegment.hasFlag('PSH'),
            hasACK: dataSegment.hasFlag('ACK')
        });
        this.sendSegment(dataSegment);
        this.localSequenceNumber += data.length;
        
        return true;
    }

    // 接続終了
    close() {
        if (this.state === TCP_STATES.ESTABLISHED) {
            const finSegment = new TCPSegment({
                sourcePort: this.localPort,
                destPort: this.remotePort,
                sequenceNumber: this.localSequenceNumber,
                acknowledgmentNumber: this.localAckNumber,
                flags: [TCP_FLAGS.FIN, TCP_FLAGS.ACK]
            });

            this.setState(TCP_STATES.FIN_WAIT_1);
            this.sendSegment(finSegment);
            this.localSequenceNumber++;
        }
    }

    // 再送タイマー開始（アニメーション時間を考慮）
    startRetransmissionTimer(segment, actualAnimationDelay = null) {
        this.clearRetransmissionTimer();
        
        // 教育モードでは再送タイマーを実質的に無効化
        // これによりアニメーション速度に関係なく正常な通信フローを観察できる
        let adjustedTimeout;
        if (this.educationalMode) {
            adjustedTimeout = 999999000; // 非常に長い時間（約16分）で実質無効化
            // console.log('📚 教育モード: 再送タイマーを無効化してスムーズな通信フロー観察を可能にします');
        } else {
            // 通常モード：実際のアニメーション時間を考慮
            adjustedTimeout = this.retransmissionTimeout;
            if (actualAnimationDelay) {
                adjustedTimeout = Math.max(this.retransmissionTimeout, actualAnimationDelay * 3);
            }
        }
        
        this.retransmissionTimer = setTimeout(() => {
            if (this.retransmissionCount < this.maxRetransmissions) {
                console.log(`⚠️ ネットワーク遅延による再送 (${this.retransmissionCount + 1}/${this.maxRetransmissions}) - 教育モードでは通常発生しません`);
                this.retransmissionCount++;
                this.sendSegment(segment);
                this.startRetransmissionTimer(segment, actualAnimationDelay);
            } else {
                console.error('❌ 最大再送回数に達しました。接続をリセットします。');
                this.reset();
            }
        }, adjustedTimeout);
    }

    // 再送タイマークリア
    clearRetransmissionTimer() {
        if (this.retransmissionTimer) {
            clearTimeout(this.retransmissionTimer);
            this.retransmissionTimer = null;
            this.retransmissionCount = 0;
        }
    }

    // 接続リセット
    reset() {
        this.clearRetransmissionTimer();
        this.setState(TCP_STATES.CLOSED);
        this.emit('connectionReset', { connection: this });
    }

    // 接続情報の取得
    getConnectionInfo() {
        return {
            id: this.id,
            state: this.state,
            localDevice: this.localDevice.name || this.localDevice.id,
            remoteDevice: this.remoteDevice.name || this.remoteDevice.id,
            localPort: this.localPort,
            remotePort: this.remotePort,
            localSequenceNumber: this.localSequenceNumber,
            remoteSequenceNumber: this.remoteSequenceNumber,
            sentSegments: this.sentSegments.length,
            receivedSegments: this.receivedSegments.length
        };
    }
}

// TCP管理クラス
class TCPManager {
    constructor() {
        this.connections = new Map();
        this.eventListeners = new Map();
        this.portCounter = 1024; // 動的ポート番号の開始値
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
                    console.error('TCPManagerイベントハンドラーでエラー:', error);
                }
            });
        }
    }

    // 新しい接続の作成
    createConnection(localDevice, remoteDevice, localPort = null, remotePort = 80) {
        if (!localPort) {
            localPort = this.getNextAvailablePort();
        }

        const connection = new TCPConnection(localDevice, remoteDevice, localPort, remotePort);
        this.connections.set(connection.id, connection);

        // 接続のイベントをTCPManagerにも転送
        connection.addEventListener('stateChange', (data) => {
            this.emit('connectionStateChange', data);
        });

        connection.addEventListener('segmentSent', (data) => {
            this.emit('segmentSent', data);
        });

        connection.addEventListener('segmentReceived', (data) => {
            this.emit('segmentReceived', data);
        });

        connection.addEventListener('dataReceived', (data) => {
            console.log(`TCPManager: dataReceivedイベントを転送 - ${data.data.length} bytes`);
            this.emit('dataReceived', data);
        });

        connection.addEventListener('connectionEstablished', (data) => {
            this.emit('connectionEstablished', data);
        });

        connection.addEventListener('connectionReset', (data) => {
            this.emit('connectionReset', data);
            this.connections.delete(data.connection.id);
        });

        connection.addEventListener('dataReceived', (data) => {
            this.emit('dataReceived', data);
        });

        console.log(`TCP接続を作成しました: ${connection.id}`);
        return connection;
    }

    // 接続の取得
    getConnection(connectionId) {
        return this.connections.get(connectionId);
    }

    // 全接続の取得
    getAllConnections() {
        return Array.from(this.connections.values());
    }

    // デバイスに関連する接続の取得
    getConnectionsForDevice(device) {
        return this.getAllConnections().filter(conn => 
            conn.localDevice === device || conn.remoteDevice === device
        );
    }

    // 接続の削除
    removeConnection(connectionId) {
        const connection = this.connections.get(connectionId);
        if (connection) {
            connection.reset();
            this.connections.delete(connectionId);
            console.log(`TCP接続を削除しました: ${connectionId}`);
        }
    }

    // 全接続のクリア
    clearAllConnections() {
        this.connections.forEach(connection => {
            connection.reset();
        });
        this.connections.clear();
        console.log('全てのTCP接続をクリアしました');
    }

    // 利用可能なポート番号の取得
    getNextAvailablePort() {
        while (this.isPortInUse(this.portCounter)) {
            this.portCounter++;
            if (this.portCounter > 65535) {
                this.portCounter = 1024;
            }
        }
        return this.portCounter++;
    }

    // ポート使用状況の確認
    isPortInUse(port) {
        return this.getAllConnections().some(conn => 
            conn.localPort === port || conn.remotePort === port
        );
    }

    // 統計情報の取得
    getStatistics() {
        const connections = this.getAllConnections();
        const states = {};
        
        connections.forEach(conn => {
            states[conn.state] = (states[conn.state] || 0) + 1;
        });

        return {
            totalConnections: connections.length,
            stateDistribution: states,
            activeConnections: connections.filter(conn => conn.state === TCP_STATES.ESTABLISHED).length
        };
    }
}

// グローバルTCPマネージャーインスタンス
window.tcpManager = new TCPManager();

console.log('TCP Simulator loaded successfully');