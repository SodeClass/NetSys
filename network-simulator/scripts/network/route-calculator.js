// ネットワーク経路計算モジュール

class RouteCalculator {
    constructor(simulator) {
        this.simulator = simulator;
    }

    // デバイス間の経路を検索（BFS）
    findPath(sourceDevice, targetDevice) {
        if (sourceDevice === targetDevice) return [sourceDevice];
        
        const visited = new Set();
        const queue = [[sourceDevice]];
        visited.add(sourceDevice.id);
        
        while (queue.length > 0) {
            const path = queue.shift();
            const currentDevice = path[path.length - 1];
            
            // 現在のデバイスの接続をチェック
            for (const conn of this.simulator.connections) {
                let nextDevice = null;
                
                if (conn.fromDevice === currentDevice.id) {
                    nextDevice = this.simulator.devices.get(conn.toDevice);
                } else if (conn.toDevice === currentDevice.id) {
                    nextDevice = this.simulator.devices.get(conn.fromDevice);
                }
                
                if (nextDevice && !visited.has(nextDevice.id)) {
                    visited.add(nextDevice.id);
                    const newPath = [...path, nextDevice];
                    
                    if (nextDevice === targetDevice) {
                        return newPath;
                    }
                    
                    queue.push(newPath);
                }
            }
        }
        
        return []; // 経路が見つからない場合
    }

    // 複数の経路を検索（冗長性チェック用）
    findAllPaths(sourceDevice, targetDevice, maxDepth = 10) {
        if (sourceDevice === targetDevice) return [[sourceDevice]];
        
        const allPaths = [];
        const visited = new Set();
        
        const dfs = (currentPath, depth) => {
            if (depth > maxDepth) return;
            
            const currentDevice = currentPath[currentPath.length - 1];
            visited.add(currentDevice.id);
            
            // 現在のデバイスの接続をチェック
            for (const conn of this.simulator.connections) {
                let nextDevice = null;
                
                if (conn.fromDevice === currentDevice.id) {
                    nextDevice = this.simulator.devices.get(conn.toDevice);
                } else if (conn.toDevice === currentDevice.id) {
                    nextDevice = this.simulator.devices.get(conn.fromDevice);
                }
                
                if (nextDevice && !visited.has(nextDevice.id)) {
                    const newPath = [...currentPath, nextDevice];
                    
                    if (nextDevice === targetDevice) {
                        allPaths.push(newPath);
                    } else {
                        dfs(newPath, depth + 1);
                    }
                }
            }
            
            visited.delete(currentDevice.id);
        };
        
        dfs([sourceDevice], 0);
        return allPaths;
    }

    // 最短経路を取得
    findShortestPath(sourceDevice, targetDevice) {
        return this.findPath(sourceDevice, targetDevice);
    }

    // 特定のデバイスタイプを経由する経路を検索
    findPathVia(sourceDevice, targetDevice, viaDeviceType) {
        const allPaths = this.findAllPaths(sourceDevice, targetDevice);
        return allPaths.filter(path => 
            path.some(device => device.type === viaDeviceType)
        );
    }

    // ルーターを経由する経路を検索
    findPathViaRouter(sourceDevice, targetDevice) {
        return this.findPathVia(sourceDevice, targetDevice, 'router');
    }

    // スイッチを経由する経路を検索
    findPathViaSwitch(sourceDevice, targetDevice) {
        return this.findPathVia(sourceDevice, targetDevice, 'switch');
    }

    // 経路の妥当性をチェック
    validatePath(path) {
        if (!path || path.length === 0) return false;
        
        for (let i = 0; i < path.length - 1; i++) {
            const currentDevice = path[i];
            const nextDevice = path[i + 1];
            
            // 隣接するデバイス間に接続があるかチェック
            const hasConnection = this.simulator.connections.some(conn => 
                (conn.fromDevice === currentDevice.id && conn.toDevice === nextDevice.id) ||
                (conn.toDevice === currentDevice.id && conn.fromDevice === nextDevice.id)
            );
            
            if (!hasConnection) {
                return false;
            }
        }
        
        return true;
    }

    // 経路上の中継デバイスを取得（送信元と送信先を除く）
    getIntermediateDevices(path) {
        if (path.length <= 2) return [];
        return path.slice(1, -1);
    }

    // 経路の統計情報を取得
    getPathStatistics(path) {
        if (!path || path.length === 0) {
            return {
                length: 0,
                hops: 0,
                deviceTypes: {},
                hasRouter: false,
                hasSwitch: false,
                hasHub: false
            };
        }

        const deviceTypes = {};
        let hasRouter = false;
        let hasSwitch = false;
        let hasHub = false;

        path.forEach(device => {
            deviceTypes[device.type] = (deviceTypes[device.type] || 0) + 1;
            
            if (device.type === 'router') hasRouter = true;
            if (device.type === 'switch') hasSwitch = true;
            if (device.type === 'hub') hasHub = true;
        });

        return {
            length: path.length,
            hops: path.length - 1,
            deviceTypes,
            hasRouter,
            hasSwitch,
            hasHub,
            intermediateDevices: this.getIntermediateDevices(path)
        };
    }

    // デバイス間の直接接続をチェック
    isDirectlyConnected(device1, device2) {
        return this.simulator.connections.some(conn => 
            (conn.fromDevice === device1.id && conn.toDevice === device2.id) ||
            (conn.toDevice === device1.id && conn.fromDevice === device2.id)
        );
    }

    // 特定のデバイスに接続されているすべてのデバイスを取得
    getConnectedDevices(device) {
        const connectedDevices = [];
        
        for (const conn of this.simulator.connections) {
            let connectedDevice = null;
            
            if (conn.fromDevice === device.id) {
                connectedDevice = this.simulator.devices.get(conn.toDevice);
            } else if (conn.toDevice === device.id) {
                connectedDevice = this.simulator.devices.get(conn.fromDevice);
            }
            
            if (connectedDevice) {
                connectedDevices.push(connectedDevice);
            }
        }
        
        return connectedDevices;
    }

    // ネットワークトポロジーの分析
    analyzeTopology() {
        const devices = Array.from(this.simulator.devices.values());
        const deviceCounts = {};
        const isolatedDevices = [];
        
        devices.forEach(device => {
            deviceCounts[device.type] = (deviceCounts[device.type] || 0) + 1;
            
            const connectedDevices = this.getConnectedDevices(device);
            if (connectedDevices.length === 0) {
                isolatedDevices.push(device);
            }
        });

        return {
            totalDevices: devices.length,
            deviceCounts,
            totalConnections: this.simulator.connections.length,
            isolatedDevices,
            hasRedundancy: this.checkRedundancy(),
            networkDiameter: this.calculateNetworkDiameter()
        };
    }

    // 冗長性のチェック
    checkRedundancy() {
        const devices = Array.from(this.simulator.devices.values());
        
        // すべてのデバイスペア間で複数経路があるかチェック
        for (let i = 0; i < devices.length; i++) {
            for (let j = i + 1; j < devices.length; j++) {
                const paths = this.findAllPaths(devices[i], devices[j], 5);
                if (paths.length > 1) {
                    return true; // 少なくとも1つのペアで冗長経路がある
                }
            }
        }
        
        return false;
    }

    // ネットワーク直径の計算（最も遠いデバイス間の距離）
    calculateNetworkDiameter() {
        const devices = Array.from(this.simulator.devices.values());
        let maxDistance = 0;
        
        for (let i = 0; i < devices.length; i++) {
            for (let j = i + 1; j < devices.length; j++) {
                const path = this.findPath(devices[i], devices[j]);
                if (path.length > 0) {
                    maxDistance = Math.max(maxDistance, path.length - 1);
                }
            }
        }
        
        return maxDistance;
    }

    // デバッグ用：経路情報を詳細表示
    debugPath(sourceDevice, targetDevice) {
        const path = this.findPath(sourceDevice, targetDevice);
        const stats = this.getPathStatistics(path);
        
        console.log('\n=== 経路デバッグ情報 ===');
        console.log(`送信元: ${sourceDevice.name || sourceDevice.id}`);
        console.log(`送信先: ${targetDevice.name || targetDevice.id}`);
        console.log(`経路: ${path.map(d => d.name || d.id).join(' → ')}`);
        console.log(`ホップ数: ${stats.hops}`);
        console.log(`デバイスタイプ分布:`, stats.deviceTypes);
        console.log(`中継デバイス: ${stats.intermediateDevices.map(d => d.name || d.id).join(', ')}`);
        console.log('=== デバッグ情報終了 ===\n');
        
        return { path, stats };
    }
}

// グローバルインスタンス（シミュレーター初期化後に設定）
window.routeCalculator = null;

// シミュレーター用のヘルパー関数
function initializeRouteCalculator(simulator) {
    window.routeCalculator = new RouteCalculator(simulator);
    console.log('Route Calculator initialized');
}

// グローバルにアクセス可能にする
window.initializeRouteCalculator = initializeRouteCalculator;

console.log('Route Calculator module loaded successfully');