// ネットワークシミュレータクラス
class NetworkSimulator {
    constructor() {
        this.canvas = document.getElementById('network-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.devices = new Map();
        this.connections = [];
        this.selectedDevice = null;
        
        // アニメーションキューシステム
        this.animationQueue = [];
        this.isAnimationRunning = false;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.scale = 1;
        this.panX = 0;
        this.panY = 0;
        this.connectionStart = null;
        this.currentMousePos = { x: 0, y: 0 };
        this.isPanning = false;
        this.lastPanPoint = null;
        this.touches = [];

        // ユーザーインタラクション追跡（振動機能用）
        this.userHasInteracted = false;

        // ページレベルでの最初のユーザーインタラクションを検知
        this.setupUserInteractionTracking();
        this.lastPinchDistance = null;
        this.lastPinchCenter = null;
        this.touchStartTime = 0;
        this.touchStartPos = null;
        this.dragThreshold = 10;
        this.selectedConnection = null;
        this.nextZIndex = 1;
        this.currentDeviceConfig = null;
        
        // 論理回路シミュレータから完全コピーした変数
        this.isPaletteScrolling = false;
        this.paletteScrollStartX = 0;
        this.paletteScrollStartY = 0;
        this.paletteScrollThreshold = 10; // スクロール判定を緩く（横スクロール優先）
        this.paletteScrollStartScrollLeft = 0;
        this.pendingDeviceDrag = null; // デバイスドラッグ開始待機用
        this.lastClickTime = 0;
        this.doubleClickDelay = 300;
        this.lastClickPosition = null;
        this.lastClickedDevice = null;
        
        // パレットスクロール対応
        this.isPaletteScrolling = false;
        this.paletteScrollStartX = 0;
        this.paletteScrollStartY = 0;
        this.paletteScrollThreshold = 6; // より敏感な横スクロール検出
        this.paletteScrollStartScrollLeft = 0;
        this.pendingDeviceDrag = null;
        this.pendingDevice = null;
        this.dragStarted = false;
        
        // パフォーマンス最適化用
        this.renderScheduled = false;
        this.lastRenderTime = 0;
        this.renderThrottle = 16; // 60fps制限（16ms）
        this.lastNICUpdateFrame = 0; // NIC位置更新のフレーム制限用
        
        // グローバルマウスハンドラをバインド
        this.globalMouseMoveHandler = this.handleGlobalMouseMove.bind(this);
        this.globalMouseUpHandler = this.handleGlobalMouseUp.bind(this);
        
        // ドラッグ終了時のスクリーン座標を記録
        this.lastDropScreenPos = { x: 0, y: 0 };
        
        // Pingモード関連
        this.isPingMode = false;
        this.pingSourceDevice = null;
        this.pingTargetDevice = null;

        // DHCPモード関連
        this.isDHCPMode = false;
        
        // ドラッグ判定関連
        this.dragPrepared = false; // ドラッグ準備状態
        
        // エラー表示関連
        this.errorBlinkDevices = null; // エラー点滅中のデバイス
        this.successBlinkDevices = null; // 成功点滅中のデバイス
        
        // タッチ・マウスイベント重複防止
        this.lastTouchTime = 0;
        this.touchEventProcessed = false;

        // ファイル読み込み処理の重複実行防止
        this.isLoadingFile = false;

        this.init();
    }
    
    // タッチデバイスかどうかを判定
    isTouchDevice() {
        const isMobileWidth = window.innerWidth <= 1024;
        const hasTouch = ('ontouchstart' in window || navigator.maxTouchPoints > 0);
        const isPrimaryTouch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
        return isMobileWidth && hasTouch && isPrimaryTouch;
    }

    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.setupPalette();
        this.render();

        // URLパラメータ / ハッシュから共有構成を読み込み
        this.loadNetworkFromUrl();
        window.addEventListener('hashchange', () => this.loadNetworkFromUrl());

        // コンポーネント読み込み完了を待つ
        if (window.componentsLoaded) {
            console.log('🎯 Components already loaded, re-running setupPalette');
            this.setupPalette();
        } else {
            console.log('⏳ Waiting for components to load...');
            window.addEventListener('componentsLoaded', () => {
                console.log('🎯 Components loaded event received, running setupPalette');
                this.setupPalette();
            });
        }
    }

    setupCanvas() {
        this.resizeCanvas = () => {
            const container = this.canvas.parentElement;
            const dpr = window.devicePixelRatio || 1;
            
            this.canvas.width = container.clientWidth * dpr;
            this.canvas.height = container.clientHeight * dpr;
            this.canvas.style.width = container.clientWidth + 'px';
            this.canvas.style.height = container.clientHeight + 'px';
            
            this.ctx.scale(dpr, dpr);
            this.render();
        };

        window.addEventListener('resize', this.resizeCanvas);
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                this.resizeCanvas();
            }, 100);
        });
        
        this.resizeCanvas();
    }

    setupEventListeners() {
        // マウスイベント
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('wheel', this.handleWheel.bind(this));
        this.canvas.addEventListener('contextmenu', this.handleContextMenu.bind(this));

        // タッチイベント
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });

        // ボタンイベント（要素存在確認）
        const clearBtn = document.getElementById('clear-btn');
        const pingBtn = document.getElementById('ping-btn');
        const dhcpBtn = document.getElementById('dhcp-btn');
        const configBtn = document.getElementById('config-btn');
        
        if (clearBtn) clearBtn.addEventListener('click', this.clearAll.bind(this));
        if (pingBtn) pingBtn.addEventListener('click', this.startPing.bind(this));
        if (dhcpBtn) dhcpBtn.addEventListener('click', this.startDHCP.bind(this));
        if (configBtn) configBtn.addEventListener('click', this.showDeviceConfig.bind(this));

        // ファイル・共有関連イベント（要素存在確認）
        const saveNetBtn = document.getElementById('save-network-btn');
        const loadNetBtn = document.getElementById('load-network-btn');
        const shareNetBtn = document.getElementById('share-network-btn');
        const exportBtn = document.getElementById('export-network-btn');
        const fileInput = document.getElementById('file-input');
        
        if (saveNetBtn) saveNetBtn.addEventListener('click', this.saveNetwork.bind(this));
        if (loadNetBtn) loadNetBtn.addEventListener('click', this.loadNetwork.bind(this));
        if (shareNetBtn) shareNetBtn.addEventListener('click', this.openShareDialog.bind(this));
        if (exportBtn) exportBtn.addEventListener('click', this.exportImage.bind(this));
        if (fileInput) fileInput.addEventListener('change', this.handleFileLoad.bind(this));

        // ページ全体のドラッグ&ドロップ機能
        this.setupDragAndDrop();

        // ダイアログイベント（要素存在確認）
        const cancelBtn = document.getElementById('cancel-btn');
        const saveBtn = document.getElementById('save-btn');
        const dialogOverlay = document.getElementById('dialog-overlay');
        
        if (cancelBtn) cancelBtn.addEventListener('click', this.hideDeviceConfig.bind(this));
        if (saveBtn) saveBtn.addEventListener('click', this.saveDeviceConfig.bind(this));
        if (dialogOverlay) dialogOverlay.addEventListener('click', this.hideDeviceConfig.bind(this));
    }

    setupPalette() {
        console.log('🎨 setupPalette() called');
        const palette = document.querySelector('.device-palette');

        if (!palette) {
            console.warn('⚠️ .device-palette not found - components may not be loaded yet');
            return;
        }

        const items = palette.querySelectorAll('.device-item');
        console.log('🔍 Palette elements found:', {
            palette: !!palette,
            itemCount: items.length,
            paletteVisible: getComputedStyle(palette).display
        });

        if (items.length === 0) {
            console.warn('⚠️ No .device-item elements found in palette');
            return;
        }
        const isTouchDevice = this.isTouchDevice();
        const isNarrowScreen = window.innerWidth <= 1024;
        
        console.log('Device detection:', {
            isTouchDevice: isTouchDevice,
            isNarrowScreen: isNarrowScreen,
            width: window.innerWidth,
            hasTouch: ('ontouchstart' in window || navigator.maxTouchPoints > 0),
            primaryTouch: window.matchMedia('(hover: none) and (pointer: coarse)').matches
        });
        
        // パレットスクロールはCSSのみで処理（JavaScriptイベントは無効化）
        // CSSで touch-action: pan-x が設定されているため、ブラウザがネイティブスクロールを処理
        console.log('Relying on CSS-only horizontal scrolling for palette');
        
        // デバイスドラッグを有効化（横スクロールと競合しないよう調整）
        console.log('Setting up device drag handlers for all environments');
        
        // デスクトップ環境では画面サイズに関係なくマウス操作を確保
        const isDesktopMouse = !isTouchDevice || window.innerWidth >= 1024;

        // 論理回路シミュレータのアプローチを採用：パレット全体でタッチ処理
        if (isNarrowScreen) {
            console.log('🍎 Narrow screen: Setting up palette-level touch handling');
            const paletteContent = document.querySelector('.palette-content');
            const devicePalette = document.querySelector('.device-palette');
            console.log('📦 PaletteContent element:', paletteContent);
            console.log('📦 DevicePalette element:', devicePalette);
            
            if (paletteContent && devicePalette) {
                // 親要素の状態を確認
                console.log('📏 Parent (device-palette) state:', {
                    scrollWidth: devicePalette.scrollWidth,
                    clientWidth: devicePalette.clientWidth,
                    offsetWidth: devicePalette.offsetWidth,
                    computedWidth: getComputedStyle(devicePalette).width,
                    computedOverflowX: getComputedStyle(devicePalette).overflowX,
                });
                
                // パレット要素の初期状態を確認
                console.log('📏 Child (palette-content) state:', {
                    scrollWidth: paletteContent.scrollWidth,
                    clientWidth: paletteContent.clientWidth,
                    offsetWidth: paletteContent.offsetWidth,
                    computedWidth: getComputedStyle(paletteContent).width,
                    computedOverflowX: getComputedStyle(paletteContent).overflowX,
                    canScrollInitially: paletteContent.scrollWidth > paletteContent.clientWidth
                });
                
                // 強制的にスクロール設定を適用
                devicePalette.style.overflowX = 'auto';
                devicePalette.style.width = '100vw';
                paletteContent.style.width = '800px'; // 十分な幅を設定
                paletteContent.style.minWidth = '800px';
                paletteContent.style.overflowX = 'visible'; // 親でスクロール処理
                
                console.log('✅ Adding touch event listeners to palette');
                paletteContent.addEventListener('touchstart', this.handlePaletteScrollStart.bind(this), { passive: false });
                paletteContent.addEventListener('touchmove', this.handlePaletteScrollMove.bind(this), { passive: false });
                paletteContent.addEventListener('touchend', this.handlePaletteScrollEnd.bind(this), { passive: false });
                console.log('✅ Touch event listeners added successfully');
                
                // 設定後の状態を再確認
                console.log('📏 After force style - Parent:', {
                    scrollWidth: devicePalette.scrollWidth,
                    clientWidth: devicePalette.clientWidth,
                });
                console.log('📏 After force style - Child:', {
                    scrollWidth: paletteContent.scrollWidth,
                    clientWidth: paletteContent.clientWidth,
                });
            } else {
                console.error('❌ PaletteContent not found! Cannot add touch listeners');
            }
            
            // 狭い画面でもデスクトップマウス環境なら個別アイテムハンドラーを設定
            if (isDesktopMouse) {
                console.log('🖱️ Desktop mouse detected: Adding individual item handlers despite narrow screen');
                items.forEach((item, index) => {
                    console.log(`🔧 Setting up item ${index}: ${item.dataset.deviceType}`);
                    item.addEventListener('mousedown', this.startDeviceDrag.bind(this));
                });
            } else {
                console.log('🚫 Pure mobile: No individual item handlers (handled by palette)');
            }
        } else {
            console.log('🖥️ Wide screen: Setting up individual item handling');
            console.log(`📋 Found ${items.length} device items to setup`);
            // 広い画面では個別アイテムでマウス・タッチ両方
            items.forEach((item, index) => {
                console.log(`🔧 Setting up item ${index}: ${item.dataset.deviceType}`);
                item.addEventListener('mousedown', this.startDeviceDrag.bind(this));
                item.addEventListener('touchstart', this.startDeviceDrag.bind(this), { passive: false });

                // テスト用にクリックイベントも追加
                item.addEventListener('click', (e) => {
                    console.log('📱 Device item clicked:', item.dataset.deviceType);
                });
            });
            console.log('✅ All device items setup complete');
        }
    }

    // 論理回路シミュレータから完全コピーしたスクロール処理
    handlePaletteScrollStart(e) {
        // 狭い画面でのみ動作
        if (window.innerWidth > 1024) return;
        
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            this.paletteScrollStartX = touch.clientX;
            this.paletteScrollStartY = touch.clientY;
            
            // 親要素（device-palette）の現在のスクロール位置を記録
            const devicePalette = e.currentTarget.closest('.device-palette');
            this.paletteScrollStartScrollLeft = devicePalette ? devicePalette.scrollLeft : 0;
            
            this.isPaletteScrolling = false;
            this.pendingDeviceDrag = null;
            
            console.log('handlePaletteScrollStart: resetting isPaletteScrolling from', this.isPaletteScrolling, 'to false');
            console.log('📏 Start scroll position:', this.paletteScrollStartScrollLeft, 'from element:', devicePalette ? 'parent' : 'self');
            
            // タッチ対象がデバイスアイテムかどうかチェック
            const targetItem = e.target.closest('.device-item');
            if (targetItem) {
                const deviceType = targetItem.dataset.deviceType;
                console.log('🎯 Touch on device item:', deviceType);
                this.pendingDeviceDrag = { type: deviceType, x: touch.clientX, y: touch.clientY };
            } else {
                console.log('📋 Touch on palette background, ready for scroll');
            }
        }
    }
    
    handlePaletteScrollMove(e) {
        // 狭い画面でのみ動作
        if (window.innerWidth > 1024) return;
        
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            const deltaX = Math.abs(touch.clientX - this.paletteScrollStartX);
            const deltaY = Math.abs(touch.clientY - this.paletteScrollStartY);
            const diffY = touch.clientY - this.paletteScrollStartY; // 下方向への移動量
            
            console.log('Palette scroll move:', {
                deltaX: deltaX,
                deltaY: deltaY,
                diffY: diffY,
                threshold: this.paletteScrollThreshold,
                isScrolling: this.isPaletteScrolling,
                targetClass: e.target.classList.contains('device-item') ? 'device-item' : 'background',
                pendingDrag: this.pendingDeviceDrag ? this.pendingDeviceDrag.type : null
            });
            
            if (this.pendingDeviceDrag) {
                // デバイスドラッグ待機中の場合
                // 下方向への引き出し意図、または有意な縦移動があれば即座にドラッグ開始
                if (diffY > 8 || (deltaY > 10 && deltaY >= deltaX * 0.7)) {
                    console.log('🔽 Starting device drag (vertical/downward movement), diffY:', diffY, 'deltaY:', deltaY, 'deltaX:', deltaX);
                    const deviceType = this.pendingDeviceDrag.type;
                    const startX = touch.clientX;
                    const startY = touch.clientY;
                    this.createDeviceFromTouch(deviceType, startX, startY);
                    this.pendingDeviceDrag = null;
                    return; // スクロール処理は実行しない
                }
                // 明確な横スワイプの場合のみスクロール優先
                else if (deltaX > 15 && deltaX > deltaY * 1.5) {
                    this.isPaletteScrolling = true;
                    console.log('◀️▶️ Palette scroll activated (horizontal movement)! deltaX:', deltaX);
                    this.pendingDeviceDrag = null;
                }
            }
            
            // スクロール状態でのスクロール実行
            if (this.isPaletteScrolling && (deltaX > this.paletteScrollThreshold || deltaY > this.paletteScrollThreshold)) {
                console.log('Palette scroll activated!');
                e.preventDefault();
                
                // スクロール実行
                const scrollDelta = this.paletteScrollStartX - touch.clientX;
                const newScrollLeft = this.paletteScrollStartScrollLeft + scrollDelta;
                console.log('📏 scrollWidth:', e.currentTarget.scrollWidth, 'clientWidth:', e.currentTarget.clientWidth, 'canScroll:', e.currentTarget.scrollWidth > e.currentTarget.clientWidth);
                console.log('📏 scrollDelta:', scrollDelta, 'newScrollLeft:', newScrollLeft);
                
                // 親要素（device-palette）でスクロール実行
                const devicePalette = e.currentTarget.closest('.device-palette');
                if (devicePalette) {
                    devicePalette.scrollLeft = newScrollLeft;
                    console.log('🎯 Applied scrollLeft to parent:', devicePalette.scrollLeft);
                    console.log('🎯 Parent element styles:', {
                        scrollWidth: devicePalette.scrollWidth,
                        clientWidth: devicePalette.clientWidth,
                        canScroll: devicePalette.scrollWidth > devicePalette.clientWidth,
                        overflowX: getComputedStyle(devicePalette).overflowX,
                        width: getComputedStyle(devicePalette).width
                    });
                } else {
                    // フォールバック：子要素で実行
                    e.currentTarget.scrollLeft = newScrollLeft;
                    console.log('🎯 Applied scrollLeft to child:', e.currentTarget.scrollLeft);
                }
            }
        }
    }
    
    handlePaletteScrollEnd(e) {
        // 狭い画面でのみ動作
        if (window.innerWidth > 1024) return;
        
        console.log('handlePaletteScrollEnd: clearing pendingDeviceDrag from', this.pendingDeviceDrag);
        this.pendingDeviceDrag = null;
        this.isPaletteScrolling = false;
    }

    // タッチからのデバイス作成
    createDeviceFromTouch(deviceType, touchX, touchY) {
        console.log('🎯 createDeviceFromTouch called for:', deviceType, 'at touch:', touchX, touchY);
        
        // キャンバス座標に変換
        const canvasRect = this.canvas.getBoundingClientRect();
        let x, y;
        
        // タッチ位置がキャンバス内かチェック
        const isWithinCanvas = touchX >= canvasRect.left && touchX <= canvasRect.right &&
                             touchY >= canvasRect.top && touchY <= canvasRect.bottom;
        
        if (isWithinCanvas) {
            // キャンバス内の場合、その座標を使用
            x = (touchX - canvasRect.left - this.panX) / this.scale;
            y = (touchY - canvasRect.top - this.panY) / this.scale;
            console.log('📍 Touch within canvas, using position:', x, y);
        } else {
            // キャンバス外の場合、中央に配置
            x = (canvasRect.width / 2 - this.panX) / this.scale;
            y = (canvasRect.height / 2 - this.panY) / this.scale;
            console.log('📍 Touch outside canvas, using center:', x, y);
        }
        
        // デバイスを作成
        const device = this.createDevice(deviceType, x, y);
        console.log('📦 Touch device created:', device.type, 'at:', x, y);
        device.isNewFromPalette = true;
        
        // ドラッグ状態を設定
        this.pendingDevice = device;
        this.selectedDevice = device;
        this.isDragging = true;
        this.dragOffset = { x: device.width / 2, y: device.height / 2 };
        
        console.log('🔄 Device drag state prepared from touch');
        
        // フローティングプレビューを表示
        this.showDragPreview(deviceType, touchX, touchY);
        
        // グローバルタッチハンドラーを設定
        this.setupGlobalTouchHandlers();
        console.log('✅ Global touch handlers set up for touch drag');
        
        this.scheduleRender();
        
        // バイブレーション（安全に実行）
        this.safeVibrate(30);
    }


    // ユーザーインタラクション検知の設定
    setupUserInteractionTracking() {
        const events = ['touchstart', 'touchend', 'mousedown', 'mouseup', 'click'];
        const trackInteraction = (e) => {
            this.userHasInteracted = true;
            console.log('ユーザーインタラクションを検知しました');
            // イベントリスナーを一度だけ実行するため削除
            events.forEach(event => {
                document.removeEventListener(event, trackInteraction, true);
            });
        };

        // すべてのユーザーインタラクションイベントをキャプチャフェーズで監視
        // ただし、イベントの進行は妨げない（preventDefault しない）
        events.forEach(event => {
            document.addEventListener(event, trackInteraction, true);
        });
    }

    // 安全な振動機能（ユーザーインタラクション後のみ実行）
    safeVibrate(duration) {
        try {
            if (this.userHasInteracted && navigator.vibrate && typeof navigator.vibrate === 'function') {
                navigator.vibrate(duration);
            } else if (!this.userHasInteracted) {
                console.log('振動スキップ: ユーザーインタラクション待ち');
            }
        } catch (error) {
            console.warn('振動機能の実行に失敗しました:', error);
        }
    }

    // スマート動作判定デバイスドラッグ（タップ後の動きで判定）
    startDeviceDragDelayed(e) {
        const item = e.currentTarget;
        const deviceType = item.dataset.deviceType;
        const paletteContent = item.closest('.palette-content');
        
        console.log('startDeviceDragDelayed called for:', deviceType);
        
        // タッチ開始位置を記録
        const startX = e.touches[0].clientX;
        const startY = e.touches[0].clientY;
        const startScrollLeft = paletteContent ? paletteContent.scrollLeft : 0;
        
        let actionDecided = false;
        let isDragMode = false;
        let isScrollMode = false;
        
        // タッチ移動ハンドラー
        const handleTouchMove = (moveEvent) => {
            if (actionDecided) return;
            
            const deltaX = Math.abs(moveEvent.touches[0].clientX - startX);
            const deltaY = Math.abs(moveEvent.touches[0].clientY - startY);
            const moveThreshold = 4; // 動き判定の閾値（より敏感に）
            
            if (deltaX > moveThreshold || deltaY > moveThreshold) {
                actionDecided = true;
                
                // 明確に横方向の動きが優勢な場合はスクロールモード
                if (deltaX > deltaY * 1.5 && deltaX > 5) {
                    console.log('🔄 Switching to scroll mode (horizontal movement detected)');
                    isScrollMode = true;
                    
                    // スクロール処理を開始
                    if (paletteContent) {
                        const scrollDelta = startX - moveEvent.touches[0].clientX;
                        paletteContent.scrollLeft = startScrollLeft + scrollDelta;
                    }
                }
                // その他の場合は全てドラッグモード（デバイス配置を優先）
                else {
                    console.log('🔽 Switching to drag mode (default behavior)');
                    isDragMode = true;
                    
                    // デバイスドラッグを開始
                    const rect = item.getBoundingClientRect();
                    this.createDevice(deviceType, startX, startY);
                    this.startDrag(this.draggedDevice, moveEvent.touches[0]);
                }
                
                // 後続の移動処理を設定
                if (isScrollMode || isDragMode) {
                    setupContinuousHandling();
                }
            }
        };
        
        // 継続処理の設定
        const setupContinuousHandling = () => {
            const continuousMoveHandler = (moveEvent) => {
                if (isScrollMode && paletteContent) {
                    const scrollDelta = startX - moveEvent.touches[0].clientX;
                    paletteContent.scrollLeft = startScrollLeft + scrollDelta;
                    moveEvent.preventDefault();
                }
                // ドラッグモードの場合は既存の処理が継続
            };
            
            document.addEventListener('touchmove', continuousMoveHandler, { passive: false });
            
            const cleanup = () => {
                document.removeEventListener('touchmove', continuousMoveHandler);
                document.removeEventListener('touchmove', handleTouchMove);
                document.removeEventListener('touchend', cleanup);
                document.removeEventListener('touchcancel', cleanup);
            };
            
            document.addEventListener('touchend', cleanup, { once: true });
            document.addEventListener('touchcancel', cleanup, { once: true });
        };
        
        // 初期移動監視
        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        
        // クリーンアップ
        const initialCleanup = () => {
            if (!actionDecided) {
                console.log('Touch ended without significant movement');
                document.removeEventListener('touchmove', handleTouchMove);
            }
        };
        
        document.addEventListener('touchend', initialCleanup, { once: true });
        document.addEventListener('touchcancel', initialCleanup, { once: true });
    }

    // デバイスドラッグ開始（論理回路シミュレータの実装を正確に模倣）
    startDeviceDrag(event) {
        console.log('🚀 startDeviceDrag called!', {
            eventType: event.type,
            deviceType: event.currentTarget.dataset.deviceType,
            screenWidth: window.innerWidth,
            target: event.currentTarget.className,
            timestamp: Date.now()
        });

        event.preventDefault();
        
        // スクロール判定をスキップしてタッチ操作を改善
        const isTouchDevice = this.isTouchDevice();
        const isNarrowScreen = window.innerWidth <= 1024;
        console.log('isTouchDevice:', isTouchDevice, 'isNarrowScreen:', isNarrowScreen);
        
        // タッチ操作を常に有効化（スクロール判定をスキップ）
        console.log('Device drag starting immediately for better touch support');
        
        // デスクトップ環境または広い画面時：即座にドラッグ開始
        this.isPaletteScrolling = false;
        const deviceType = event.currentTarget.dataset.deviceType;
        console.log('🚀 startDeviceDrag called for:', deviceType, 'event type:', event.type);
        
        // パレットアイテムの場合は、適切なキャンバス座標にデバイスを作成
        let x, y;
        let screenX, screenY;
        const canvasRect = this.canvas.getBoundingClientRect();
        
        if (event.type === 'touchstart' && event.touches && event.touches.length > 0) {
            // タッチの場合
            const touch = event.touches[0];
            screenX = touch.clientX;
            screenY = touch.clientY;
            console.log('Touch position:', screenX, screenY);
            console.log('Canvas rect:', canvasRect);
            
            // タッチ位置がキャンバス内かチェック
            const isWithinCanvas = screenX >= canvasRect.left && screenX <= canvasRect.right &&
                                 screenY >= canvasRect.top && screenY <= canvasRect.bottom;
            
            if (isWithinCanvas) {
                // キャンバス内の場合、その座標を使用
                x = (screenX - canvasRect.left - this.panX) / this.scale;
                y = (screenY - canvasRect.top - this.panY) / this.scale;
                console.log('Touch within canvas, using touch position:', x, y);
            } else {
                // キャンバス外の場合、中央に配置
                x = (canvasRect.width / 2 - this.panX) / this.scale;
                y = (canvasRect.height / 2 - this.panY) / this.scale;
                console.log('Touch outside canvas, using center position:', x, y);
            }
        } else {
            // マウスの場合
            screenX = event.clientX;
            screenY = event.clientY;
            x = (screenX - canvasRect.left - this.panX) / this.scale;
            y = (screenY - canvasRect.top - this.panY) / this.scale;
            console.log('Mouse event, using pointer position:', x, y);
        }
        
        const device = this.createDevice(deviceType, x, y);
        console.log('📦 Device created:', device.type, 'at position:', x, y);
        device.isNewFromPalette = true; // パレットから作成されたことを記録
        
        // 重要：まだマップには追加せず、一時的に保持
        this.pendingDevice = device;
        this.selectedDevice = device;
        this.isDragging = true;
        console.log('🔄 Device drag state set:', this.isDragging);
        
        // ドラッグオフセットを中央に設定
        this.dragOffset = { 
            x: device.width / 2,
            y: device.height / 2
        };
        
        this.dragStarted = false; // 実際のドラッグが開始されたかのフラグ
        
        // フローティングプレビューを表示
        if (screenX !== undefined && screenY !== undefined) {
            this.showDragPreview(deviceType, screenX, screenY);
        }
        
        // タッチイベントの場合、グローバルなイベントリスナーを追加
        if (event.type === 'touchstart') {
            console.log('🎯 Setting up global touch handlers');
            this.setupGlobalTouchHandlers();
        } else {
            // マウスイベントの場合
            console.log('🖱️ Setting up global mouse handlers');
            document.addEventListener('mousemove', this.globalMouseMoveHandler);
            document.addEventListener('mouseup', this.globalMouseUpHandler);
        }
        
        this.scheduleRender();
        
        console.log('✅ Device prepared for drag with preview:', device.type);
    }

    // モバイル用：長押しでデバイスドラッグを開始
    startDeviceDragWithLongPress(event) {
        // preventDefault()を安全に実行
        try {
            if (event.cancelable) {
                event.preventDefault();
            }
        } catch (e) {
            console.warn('Could not prevent default:', e);
        }
        console.log('startDeviceDragWithLongPress called');
        console.log('Event:', event);
        console.log('Event type:', event.type);
        console.log('Current target:', event.currentTarget);
        console.log('Touches:', event.touches);
        console.log('Touches length:', event.touches ? event.touches.length : 'undefined');
        
        const deviceType = event.currentTarget.dataset.deviceType;
        console.log('Device type:', deviceType);
        
        if (!event.touches || event.touches.length === 0) {
            console.error('❌ No touches found, aborting');
            return;
        }
        
        const touch = event.touches[0];
        const targetElement = event.currentTarget; // 参照を保存
        let longPressActivated = false;
        
        console.log('Touch object:', touch);
        console.log('Target element:', targetElement);
        
        // 初期位置を記録
        const startX = touch.clientX;
        const startY = touch.clientY;
        
        // 長押し判定用のタイマー設定（200ms）
        console.log('Setting long press timer for:', deviceType);
        this.longPressTimer = setTimeout(() => {
            console.log('🔥 Long press timer fired! Starting drag for:', deviceType);
            longPressActivated = true;
            
            // 長押し成功時にデバイスを直接作成
            this.createDeviceFromLongPress(deviceType, startX, startY);
            
            // 視覚的フィードバック（バイブレーション、安全に実行）
            this.safeVibrate(50);
        }, 200);
        console.log('Long press timer set with ID:', this.longPressTimer);
        
        // タッチ移動処理
        const handleTouchMove = (moveEvent) => {
            const moveTouch = moveEvent.touches[0];
            const deltaX = Math.abs(moveTouch.clientX - startX);
            const deltaY = Math.abs(moveTouch.clientY - startY);
            
            console.log('Touch move detected:', deltaX, deltaY, 'longPressActivated:', longPressActivated);
            
            // 長押し成功前に意図的な大きな動きがあった場合はタイマーをクリア（閾値を大幅に緩和）
            if (!longPressActivated && (deltaX > 50 || deltaY > 50)) {
                console.log('🚫 Canceling long press timer due to large movement (deltaX:', deltaX, 'deltaY:', deltaY, ')');
                if (this.longPressTimer) {
                    clearTimeout(this.longPressTimer);
                    this.longPressTimer = null;
                }
            }
        };
        
        // タッチ終了処理
        const handleTouchEnd = () => {
            console.log('🔚 Touch end detected');
            if (this.longPressTimer) {
                console.log('🚫 Clearing long press timer on touch end');
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
            // イベントリスナーを削除（保存した参照を使用）
            if (targetElement) {
                try {
                    targetElement.removeEventListener('touchmove', handleTouchMove);
                    targetElement.removeEventListener('touchend', handleTouchEnd);
                    targetElement.removeEventListener('touchcancel', handleTouchEnd);
                } catch (e) {
                    console.warn('Error removing event listeners:', e);
                }
            }
        };
        
        // イベントリスナーを追加
        if (targetElement) {
            targetElement.addEventListener('touchmove', handleTouchMove, { passive: true });
            targetElement.addEventListener('touchend', handleTouchEnd, { once: true });
            targetElement.addEventListener('touchcancel', handleTouchEnd, { once: true });
        }
    }

    // 長押しからのデバイス作成
    createDeviceFromLongPress(deviceType, touchX, touchY) {
        console.log('🎯 createDeviceFromLongPress called for:', deviceType, 'at touch:', touchX, touchY);
        
        // キャンバス座標に変換
        const canvasRect = this.canvas.getBoundingClientRect();
        let x, y;
        
        // タッチ位置がキャンバス内かチェック
        const isWithinCanvas = touchX >= canvasRect.left && touchX <= canvasRect.right &&
                             touchY >= canvasRect.top && touchY <= canvasRect.bottom;
        
        if (isWithinCanvas) {
            // キャンバス内の場合、その座標を使用
            x = (touchX - canvasRect.left - this.panX) / this.scale;
            y = (touchY - canvasRect.top - this.panY) / this.scale;
            console.log('📍 Touch within canvas, using position:', x, y);
        } else {
            // キャンバス外の場合、中央に配置
            x = (canvasRect.width / 2 - this.panX) / this.scale;
            y = (canvasRect.height / 2 - this.panY) / this.scale;
            console.log('📍 Touch outside canvas, using center:', x, y);
        }
        
        // デバイスを作成
        const device = this.createDevice(deviceType, x, y);
        console.log('📦 Long press device created:', device.type, 'at:', x, y);
        device.isNewFromPalette = true;
        
        // ドラッグ状態を設定
        this.pendingDevice = device;
        this.selectedDevice = device;
        this.isDragging = true;
        this.dragOffset = { x: device.width / 2, y: device.height / 2 };
        
        console.log('🔄 Device drag state prepared');
        
        // フローティングプレビューを表示
        this.showDragPreview(deviceType, touchX, touchY);
        
        // グローバルタッチハンドラーを設定
        this.setupGlobalTouchHandlers();
        console.log('✅ Global touch handlers set up for long press drag');
        
        this.scheduleRender();
    }

    // デバイス表示名を取得
    getDeviceDisplayName(deviceType) {
        const names = {
            'pc': 'PC',
            'router': 'ルーター',
            'switch': 'スイッチ',
            'server': 'Webサーバー',
            'dns': 'DNSサーバー',
            'onu': 'ONU',
            'internet': 'インターネット'
        };
        return names[deviceType] || deviceType;
    }


    // デバイスのMACアドレス取得・生成
    generateMACAddress(type, count) {
        const typePrefixes = {
            'pc': '02:00:00:01',
            'server': '02:00:00:02',
            'dns': '02:00:00:03',
            'router': '02:00:00:10',
            'router-wan': '02:00:00:11',
            'router-lan1': '02:00:00:12',
            'router-lan2': '02:00:00:13',
            'router-lan3': '02:00:00:14',
            'switch': '02:00:00:20',
            'internet': '02:00:00:fe'
        };
        const prefix = typePrefixes[type] || '02:00:00:99';
        const countHigh = Math.floor(count / 256).toString(16).padStart(2, '0').toUpperCase();
        const countLow = (count % 256).toString(16).padStart(2, '0').toUpperCase();
        return `${prefix}:${countHigh}:${countLow}`;
    }

    // デバイスのMACアドレスを取得
    getDeviceMAC(device, portId = null) {
        if (!device) return null;
        if (device.type === 'router') {
            if (portId === 'wan' && device.wanConfig?.macAddress) {
                return device.wanConfig.macAddress;
            }
            if (portId === 'lan1' && device.config?.lan1?.macAddress) {
                return device.config.lan1.macAddress;
            }
            if (portId === 'lan2' && device.config?.lan2?.macAddress) {
                return device.config.lan2.macAddress;
            }
            if (portId === 'lan3' && device.config?.lan3?.macAddress) {
                return device.config.lan3.macAddress;
            }
        }
        return device.macAddress || null;
    }

    // デバイスのデフォルトIP取得
    getDefaultIP(type, count) {
        // 同一サブネット（192.168.1.x）内で連番割り当てを行う
        const configs = {
            'pc': {
                subnets: ['192.168.1.'],
                start: 100
            },
            'server': {
                subnets: ['192.168.1.'],
                start: 50
            },
            'router': {
                subnets: ['192.168.1.'],
                start: 1
            },
            'switch': {
                subnets: ['192.168.1.'],
                start: 10
            },
            'onu': {
                subnets: ['192.168.1.'],
                start: 20
            },
            'internet': {
                subnets: ['203.0.113.', '198.51.100.', '192.0.2.'], // RFC5737 テスト用パブリックIP
                start: 1
            }
        };
        
        const config = configs[type] || configs['pc'];
        const subnetIndex = (count - 1) % config.subnets.length;
        const subnet = config.subnets[subnetIndex];
        const hostNumber = config.start + Math.floor((count - 1) / config.subnets.length);
        
        return subnet + hostNumber;
    }

    // LAN2のデフォルトIP取得
    getLAN2DefaultIP(type, count) {
        if (type !== 'router') return '192.168.2.1';
        
        const routerIP = this.getDefaultIP(type, count);
        const parts = routerIP.split('.');
        return `${parts[0]}.${parts[1]}.2.1`;
    }

    // LAN3のデフォルトIP取得
    getLAN3DefaultIP(type, count) {
        if (type !== 'router') return '192.168.3.1';
        
        const routerIP = this.getDefaultIP(type, count);
        const parts = routerIP.split('.');
        return `${parts[0]}.${parts[1]}.3.1`;
    }

    // DHCPプール開始アドレス取得（LAN番号対応）
    getDHCPPoolStart(type, count, lanNumber = 1) {
        if (type !== 'router') return '192.168.1.100';
        
        const routerIP = this.getDefaultIP(type, count);
        const parts = routerIP.split('.');
        return `${parts[0]}.${parts[1]}.${lanNumber}.100`;
    }

    // DHCPプール終了アドレス取得（LAN番号対応）
    getDHCPPoolEnd(type, count, lanNumber = 1) {
        if (type !== 'router') return '192.168.1.199';
        
        const routerIP = this.getDefaultIP(type, count);
        const parts = routerIP.split('.');
        return `${parts[0]}.${parts[1]}.${lanNumber}.199`;
    }

    // デバイスのNICポート情報を取得（入出力兼用）
    getDevicePorts(type) {
        const portConfigs = {
            'pc': {
                nics: [{ id: 'eth', label: 'ETH', x: 1, y: 0.5, isDynamic: true }]
            },
            'server': {
                nics: [{ id: 'eth', label: 'ETH', x: 0, y: 0.5, isDynamic: true }]
            },
            'dns': {
                nics: [{ id: 'eth', label: 'ETH', x: 1, y: 0.5, isDynamic: true }]
            },
            'router': {
                nics: [
                    { id: 'wan', label: 'WAN', x: 0, y: 0.3, isDynamic: true },
                    { id: 'lan1', label: 'LAN1', x: 0, y: 0.7, isDynamic: true },
                    { id: 'lan2', label: 'LAN2', x: 1, y: 0.3, isDynamic: true },
                    { id: 'lan3', label: 'LAN3', x: 1, y: 0.7, isDynamic: true }
                ]
            },
            'switch': {
                nics: [
                    { id: 'port1', label: 'P1', x: 0, y: 0.15 },
                    { id: 'port2', label: 'P2', x: 0, y: 0.35 },
                    { id: 'port3', label: 'P3', x: 0, y: 0.55 },
                    { id: 'port4', label: 'P4', x: 0, y: 0.75 },
                    { id: 'port5', label: 'P5', x: 1, y: 0.15 },
                    { id: 'port6', label: 'P6', x: 1, y: 0.35 },
                    { id: 'port7', label: 'P7', x: 1, y: 0.55 },
                    { id: 'port8', label: 'P8', x: 1, y: 0.75 }
                ]
            },
            'onu': {
                nics: [
                    { id: 'wan', label: 'WAN', x: 0, y: 0.5, isDynamic: true },
                    { id: 'lan', label: 'LAN', x: 1, y: 0.5, isDynamic: true }
                ]
            },
            'internet': {
                nics: [
                    { id: 'isp1', label: 'ISP1', x: 0, y: 0.3, isDynamic: true },
                    { id: 'isp2', label: 'ISP2', x: 0, y: 0.7, isDynamic: true },
                    { id: 'isp3', label: 'ISP3', x: 1, y: 0.3, isDynamic: true },
                    { id: 'isp4', label: 'ISP4', x: 1, y: 0.7, isDynamic: true },
                    { id: 'isp5', label: 'ISP5', x: 0.5, y: 0, isDynamic: true },
                    { id: 'isp6', label: 'ISP6', x: 0.5, y: 1, isDynamic: true }
                ]
            }
        };
        return portConfigs[type] || { nics: [] };
    }

    // 動的NICデバイスかどうかを判定（スイッチ以外は全て動的）
    isSingleNICDevice(device) {
        return device.type !== 'switch'; // スイッチ以外は全て動的NIC対応
    }

    // 線と矩形の交点を計算
    getLineRectIntersection(x1, y1, x2, y2, rectX, rectY, rectWidth, rectHeight) {
        const intersections = [];
        
        // 上辺との交点
        const topY = rectY;
        if ((y1 <= topY && y2 >= topY) || (y1 >= topY && y2 <= topY)) {
            const t = (topY - y1) / (y2 - y1);
            const intersectX = x1 + t * (x2 - x1);
            if (intersectX >= rectX && intersectX <= rectX + rectWidth) {
                intersections.push({ x: intersectX, y: topY, side: 'top' });
            }
        }
        
        // 下辺との交点
        const bottomY = rectY + rectHeight;
        if ((y1 <= bottomY && y2 >= bottomY) || (y1 >= bottomY && y2 <= bottomY)) {
            const t = (bottomY - y1) / (y2 - y1);
            const intersectX = x1 + t * (x2 - x1);
            if (intersectX >= rectX && intersectX <= rectX + rectWidth) {
                intersections.push({ x: intersectX, y: bottomY, side: 'bottom' });
            }
        }
        
        // 左辺との交点
        const leftX = rectX;
        if ((x1 <= leftX && x2 >= leftX) || (x1 >= leftX && x2 <= leftX)) {
            const t = (leftX - x1) / (x2 - x1);
            const intersectY = y1 + t * (y2 - y1);
            if (intersectY >= rectY && intersectY <= rectY + rectHeight) {
                intersections.push({ x: leftX, y: intersectY, side: 'left' });
            }
        }
        
        // 右辺との交点
        const rightX = rectX + rectWidth;
        if ((x1 <= rightX && x2 >= rightX) || (x1 >= rightX && x2 <= rightX)) {
            const t = (rightX - x1) / (x2 - x1);
            const intersectY = y1 + t * (y2 - y1);
            if (intersectY >= rectY && intersectY <= rectY + rectHeight) {
                intersections.push({ x: rightX, y: intersectY, side: 'right' });
            }
        }
        
        return intersections;
    }

    // 動的NICポート位置を更新
    updateDynamicNICPosition(device) {
        if (!this.isSingleNICDevice(device)) return;
        if (!device.ports || !device.ports.nics || device.ports.nics.length === 0) return;
        
        // 複数ポートデバイス（ルーター、インターネット、ONU）は全てのNICポートを更新
        // 単一ポートデバイス（PC、サーバー、DNS）は最初のNICのみ
        const isMultiPortDevice = ['router', 'internet', 'onu'].includes(device.type);
        const nicsToUpdate = isMultiPortDevice ? device.ports.nics : [device.ports.nics[0]];
        
        for (const nic of nicsToUpdate) {
            if (!nic || !nic.connected || !nic.isDynamic) continue;
            
            const connection = nic.connected;
            let otherDevice = null;
            let otherPort = null;
            
            // 接続先デバイスとポートを特定
            if (connection.from.device === device) {
                otherDevice = connection.to.device;
                otherPort = connection.to.port;
            } else {
                otherDevice = connection.from.device;
                otherPort = connection.from.port;
            }
            
            if (!otherDevice || !otherPort) continue;
            
            // 接続先ポートの実際の座標を計算
            const otherPortX = otherDevice.x + otherPort.x * otherDevice.width;
            const otherPortY = otherDevice.y + otherPort.y * otherDevice.height;
            
            // デバイス中央から接続先ポートへの線と、デバイスの輪郭との交点を計算
            const deviceCenterX = device.x + device.width / 2;
            const deviceCenterY = device.y + device.height / 2;
            
            const intersections = this.getLineRectIntersection(
                deviceCenterX, deviceCenterY,
                otherPortX, otherPortY,
                device.x, device.y, device.width, device.height
            );
            
            if (intersections.length > 0) {
                // 最も適切な交点を選択（接続先に近い方）
                let bestIntersection = intersections[0];
                let minDistance = Infinity;
                
                for (const intersection of intersections) {
                    const distance = Math.sqrt(
                        Math.pow(intersection.x - otherPortX, 2) + 
                        Math.pow(intersection.y - otherPortY, 2)
                    );
                    if (distance < minDistance) {
                        minDistance = distance;
                        bestIntersection = intersection;
                    }
                }
                
                // 衝突回避：他の動的ポートとの距離をチェック
                const newRelativeX = (bestIntersection.x - device.x) / device.width;
                const newRelativeY = (bestIntersection.y - device.y) / device.height;
                
                const adjustedPosition = this.avoidPortCollision(
                    device, nic, newRelativeX, newRelativeY, bestIntersection.side
                );
                
                // NICポートの位置を更新（衝突回避済み）
                nic.x = adjustedPosition.x;
                nic.y = adjustedPosition.y;
                nic.side = adjustedPosition.side;
            }
        }
    }

    // 動的ポートの衝突回避（枠上での移動）
    avoidPortCollision(device, currentNic, targetX, targetY, targetSide) {
        const MIN_DISTANCE = 10; // 最小間隔（ピクセル）
        const STEP_SIZE = 0.03; // 調整ステップサイズ（相対座標）
        const MAX_ATTEMPTS = 10; // 最大試行回数
        
        let adjustedX = targetX;
        let adjustedY = targetY;
        let adjustedSide = targetSide;
        
        // 全ての動的ポートとの衝突をチェック（同じ辺でなくても近接していれば対象）
        const conflictingPorts = device.ports.nics.filter(otherNic => 
            otherNic !== currentNic && 
            otherNic.isDynamic
        );
        
        if (conflictingPorts.length === 0) {
            return { x: adjustedX, y: adjustedY, side: adjustedSide };
        }
        
        // 衝突回避：枠の上を移動
        for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
            let hasCollision = false;
            
            for (const otherNic of conflictingPorts) {
                const distance = this.calculatePortDistance(
                    device, adjustedX, adjustedY, otherNic.x, otherNic.y
                );
                
                if (distance < MIN_DISTANCE) {
                    hasCollision = true;
                    
                    // 枠の上での位置調整
                    const adjustment = this.adjustPortOnFrame(
                        adjustedX, adjustedY, adjustedSide, otherNic, STEP_SIZE
                    );
                    adjustedX = adjustment.x;
                    adjustedY = adjustment.y;
                    
                    // 調整後の位置を枠上に固定
                    switch (adjustedSide) {
                        case 'top': adjustedY = 0; break;
                        case 'bottom': adjustedY = 1; break;
                        case 'left': adjustedX = 0; break;
                        case 'right': adjustedX = 1; break;
                    }
                    break;
                }
            }
            
            if (!hasCollision) break;
        }
        
        return { x: adjustedX, y: adjustedY, side: adjustedSide };
    }

    // 端子間の距離を計算
    calculatePortDistance(device, x1, y1, x2, y2) {
        const absX1 = device.x + x1 * device.width;
        const absY1 = device.y + y1 * device.height;
        const absX2 = device.x + x2 * device.width;
        const absY2 = device.y + y2 * device.height;
        
        return Math.sqrt(Math.pow(absX1 - absX2, 2) + Math.pow(absY1 - absY2, 2));
    }

    // 枠の上でのポート位置調整
    adjustPortOnFrame(x, y, side, conflictingNic, stepSize) {
        let adjustedX = x;
        let adjustedY = y;
        
        // 衝突している端子から離れる方向に移動
        const deltaX = x - conflictingNic.x;
        const deltaY = y - conflictingNic.y;
        
        switch (side) {
            case 'top':
            case 'bottom':
                // 上辺・下辺：x座標を調整
                if (Math.abs(deltaX) > 0.01) {
                    adjustedX = deltaX > 0 ? 
                        Math.min(1, x + stepSize) : 
                        Math.max(0, x - stepSize);
                } else {
                    // 完全に重なっている場合はランダムに移動
                    adjustedX = Math.random() > 0.5 ? 
                        Math.min(1, x + stepSize) : 
                        Math.max(0, x - stepSize);
                }
                break;
            case 'left':
            case 'right':
                // 左辺・右辺：y座標を調整
                if (Math.abs(deltaY) > 0.01) {
                    adjustedY = deltaY > 0 ? 
                        Math.min(1, y + stepSize) : 
                        Math.max(0, y - stepSize);
                } else {
                    // 完全に重なっている場合はランダムに移動
                    adjustedY = Math.random() > 0.5 ? 
                        Math.min(1, y + stepSize) : 
                        Math.max(0, y - stepSize);
                }
                break;
        }
        
        return { x: adjustedX, y: adjustedY };
    }

    // 全ての単一NICデバイスの動的ポート位置を更新
    updateAllDynamicNICPositions() {
        for (const device of this.devices.values()) {
            if (this.isSingleNICDevice(device)) {
                this.updateDynamicNICPosition(device);
            }
        }
    }

    // 座標変換
    screenToWorld(screenX, screenY) {
        return {
            x: (screenX - this.panX) / this.scale,
            y: (screenY - this.panY) / this.scale
        };
    }

    worldToScreen(worldX, worldY) {
        return {
            x: worldX * this.scale + this.panX,
            y: worldY * this.scale + this.panY
        };
    }

    // ポインタ位置取得（キャンバス座標系）
    getPointerPos(event) {
        const rect = this.canvas.getBoundingClientRect();
        let clientX, clientY;
        
        if (event.touches && event.touches.length > 0) {
            clientX = event.touches[0].clientX;
            clientY = event.touches[0].clientY;
        } else if (event.changedTouches && event.changedTouches.length > 0) {
            clientX = event.changedTouches[0].clientX;
            clientY = event.changedTouches[0].clientY;
        } else {
            clientX = event.clientX;
            clientY = event.clientY;
        }
        
        return {
            x: (clientX - rect.left - this.panX) / this.scale,
            y: (clientY - rect.top - this.panY) / this.scale
        };
    }
    
    // ドラッグ用の拡張座標取得（キャンバス外も許可）
    getDragPointerPos(event) {
        const rect = this.canvas.getBoundingClientRect();
        let clientX, clientY;
        
        if (event.touches && event.touches.length > 0) {
            clientX = event.touches[0].clientX;
            clientY = event.touches[0].clientY;
        } else if (event.changedTouches && event.changedTouches.length > 0) {
            clientX = event.changedTouches[0].clientX;
            clientY = event.changedTouches[0].clientY;
        } else {
            clientX = event.clientX;
            clientY = event.clientY;
        }
        
        // キャンバス外でも動作するように座標変換
        return {
            x: (clientX - rect.left - this.panX) / this.scale,
            y: (clientY - rect.top - this.panY) / this.scale,
            screenX: clientX,
            screenY: clientY
        };
    }

    
    // 統一されたポインタ移動処理
    handlePointerMove(event) {
        console.log('🔄 handlePointerMove called:', {
            isDragging: this.isDragging,
            selectedDevice: !!this.selectedDevice,
            pendingDevice: !!this.pendingDevice
        });

        // デバイスドラッグ中は拡張座標を使用（キャンバス外も許可）
        const pos = this.isDragging && this.selectedDevice ?
                   this.getDragPointerPos(event) : this.getPointerPos(event);
        this.currentMousePos = { x: pos.x, y: pos.y };
        
        // フローティングドラッグプレビューの位置更新
        const screenX = event.clientX || (event.touches && event.touches[0] ? event.touches[0].clientX : (event.changedTouches && event.changedTouches[0] ? event.changedTouches[0].clientX : null));
        const screenY = event.clientY || (event.touches && event.touches[0] ? event.touches[0].clientY : (event.changedTouches && event.changedTouches[0] ? event.changedTouches[0].clientY : null));
        if (screenX !== null && screenY !== null) {
            this.updateDragPreview(screenX, screenY);
        }
        
        // ドラッグ準備状態からの移行判定
        if (this.dragPrepared && this.selectedDevice && !this.isDragging) {
            // ドラッグ開始位置からの移動距離を計算
            const startX = this.touchStartPos.x;
            const startY = this.touchStartPos.y;
            const distance = Math.sqrt((pos.x - startX) ** 2 + (pos.y - startY) ** 2);
            
            // ドラッグしきい値を超えた場合、実際のドラッグモードに入る
            if (distance > this.dragThreshold) {
                this.isDragging = true;
                this.dragPrepared = false;
                console.log('ドラッグ開始:', this.selectedDevice.name);

                // 削除ゾーン表示を開始
                this.showDeleteZone();
            }
        }
        
        if (this.isDragging && this.selectedDevice) {
            // パレットから作成されたデバイスで、まだマップに追加されていない場合
            if (this.pendingDevice && !this.dragStarted) {
                console.log('First drag movement detected, adding device to map:', this.pendingDevice.type);
                this.devices.set(this.pendingDevice.id, this.pendingDevice);
                this.dragStarted = true;
            }

            this.selectedDevice.x = pos.x - this.dragOffset.x;
            this.selectedDevice.y = pos.y - this.dragOffset.y;

            // ドラッグ中のパレット領域判定で削除ゾーンの表示を更新
            this.updateDeleteZoneVisibility(event);
        } else if (this.isPanning && this.lastPanPoint) {
            // パン処理：スクリーン座標で計算
            const rect = this.canvas.getBoundingClientRect();
            const currentScreenX = event.clientX || (event.touches && event.touches[0] ? event.touches[0].clientX : this.lastPanPoint.screenX);
            const currentScreenY = event.clientY || (event.touches && event.touches[0] ? event.touches[0].clientY : this.lastPanPoint.screenY);
            
            const deltaX = currentScreenX - this.lastPanPoint.screenX;
            const deltaY = currentScreenY - this.lastPanPoint.screenY;
            
            this.panX += deltaX;
            this.panY += deltaY;
            
            this.lastPanPoint.screenX = currentScreenX;
            this.lastPanPoint.screenY = currentScreenY;
        }
        
        this.scheduleRender();
    }
    
    // フレーム制限付き描画スケジューラ
    scheduleRender() {
        if (this.renderScheduled) return;
        
        const now = performance.now();
        const timeSinceLastRender = now - this.lastRenderTime;
        
        if (timeSinceLastRender >= this.renderThrottle) {
            this.render();
            this.lastRenderTime = now;
        } else {
            this.renderScheduled = true;
            requestAnimationFrame(() => {
                this.renderScheduled = false;
                this.render();
                this.lastRenderTime = performance.now();
            });
        }
    }


    // グローバルタッチ移動処理
    handleGlobalTouchMove(event) {
        if (this.isDragging && this.selectedDevice) {
            const pos = this.getDragPointerPos(event);
            this.selectedDevice.x = pos.x - this.dragOffset.x;
            this.selectedDevice.y = pos.y - this.dragOffset.y;
            this.currentMousePos = { x: pos.x, y: pos.y };
            this.scheduleRender();
        }
    }

    // グローバルタッチエンド処理
    handleGlobalTouchEnd(event) {
        // ドロップ位置のスクリーン座標を記録
        if (event.changedTouches && event.changedTouches.length > 0) {
            const touch = event.changedTouches[0];
            this.lastDropScreenPos = {
                x: touch.clientX || 0,
                y: touch.clientY || 0
            };
        }
        
        this.finalizeDrag();
    }

    // デバイス作成（論理回路シミュレータのcreateComponentと同じ役割）
    createDevice(deviceType, x, y) {
        const id = `${deviceType}-${Date.now()}`;
        const deviceCount = Array.from(this.devices.values()).filter(d => d.type === deviceType).length + 1;

        const isL2Device = (deviceType === 'onu' || deviceType === 'switch');
        const isRouter = (deviceType === 'router');

        const device = {
            id,
            type: deviceType,
            name: `${this.getDeviceDisplayName(deviceType)}-${deviceCount}`,
            x: x,
            y: y,
            width: isRouter ? 90 : 85,
            height: isRouter ? 85 : 75,
            macAddress: isL2Device ? undefined : this.generateMACAddress(deviceType, deviceCount),
            arpTable: isL2Device ? undefined : new Map(),
            macTable: deviceType === 'switch' ? new Map() : undefined,
            config: deviceType === 'internet' ? this.createInternetConfig(deviceCount) : (isL2Device ? {
                ipAddress: '',
                subnetMask: '',
                defaultGateway: '',
                dhcpEnabled: false
            } : {
                ipAddress: this.getDefaultIP(deviceType, deviceCount),
                subnetMask: '255.255.255.0',
                defaultGateway: '192.168.1.1',
                dhcpEnabled: (deviceType === 'pc' || deviceType === 'server' || deviceType === 'dns'),
                // 複数LAN対応のDHCP設定
                lan1: {
                    ipAddress: this.getDefaultIP(deviceType, deviceCount),
                    subnetMask: '255.255.255.0',
                    defaultGateway: this.getDefaultIP(deviceType, deviceCount),
                    macAddress: isRouter ? this.generateMACAddress('router-lan1', deviceCount) : undefined,
                    dhcpEnabled: isRouter,
                    dhcpPoolStart: this.getDHCPPoolStart(deviceType, deviceCount, 1),
                    dhcpPoolEnd: this.getDHCPPoolEnd(deviceType, deviceCount, 1),
                    dhcpAllocatedIPs: new Map()
                },
                lan2: {
                    ipAddress: this.getLAN2DefaultIP(deviceType, deviceCount),
                    subnetMask: '255.255.255.0',
                    defaultGateway: this.getLAN2DefaultIP(deviceType, deviceCount),
                    macAddress: isRouter ? this.generateMACAddress('router-lan2', deviceCount) : undefined,
                    dhcpEnabled: isRouter,
                    dhcpPoolStart: this.getDHCPPoolStart(deviceType, deviceCount, 2),
                    dhcpPoolEnd: this.getDHCPPoolEnd(deviceType, deviceCount, 2),
                    dhcpAllocatedIPs: new Map()
                },
                lan3: {
                    ipAddress: this.getLAN3DefaultIP(deviceType, deviceCount),
                    subnetMask: '255.255.255.0',
                    defaultGateway: this.getLAN3DefaultIP(deviceType, deviceCount),
                    macAddress: isRouter ? this.generateMACAddress('router-lan3', deviceCount) : undefined,
                    dhcpEnabled: isRouter,
                    dhcpPoolStart: this.getDHCPPoolStart(deviceType, deviceCount, 3),
                    dhcpPoolEnd: this.getDHCPPoolEnd(deviceType, deviceCount, 3),
                    dhcpAllocatedIPs: new Map()
                },
                dhcpLeaseTime: 3600,
                // 後方互換性のための旧設定（LAN1と同期）
                dhcpServerEnabled: isRouter,
                dhcpPoolStart: this.getDHCPPoolStart(deviceType, deviceCount, 1),
                dhcpPoolEnd: this.getDHCPPoolEnd(deviceType, deviceCount, 1),
                dhcpAllocatedIPs: new Map()
            }),
            // ルーターのWAN設定を初期化
            wanConfig: isRouter ? {
                macAddress: this.generateMACAddress('router-wan', deviceCount),
                dhcpEnabled: false, // デフォルトは固定IP
                ipAddress: '',
                subnetMask: '255.255.255.0',
                defaultGateway: '',
                dnsServers: ['8.8.8.8', '8.8.4.4'],
                isConnected: false
            } : undefined,
            // ルーターのNAT (NAPT/IPマスカレード) 設定を初期化
            natEnabled: isRouter ? true : undefined,
            natTable: isRouter ? new Map() : undefined,
            nextNatPort: isRouter ? 10001 : undefined,
            zIndex: this.nextZIndex++,
            ports: this.getDevicePorts(deviceType)
        };

        return device;
    }

    // インターネットデバイス用の設定を作成
    createInternetConfig(deviceCount) {
        return {
            // インターネットデバイスはDHCPサーバーとしてのみ機能（クライアントとしては機能しない）
            ipAddress: '', // インターネットデバイスはIPアドレス不要
            subnetMask: '',
            defaultGateway: '',
            dhcpEnabled: false, // インターネットデバイス自体はDHCPクライアントではない

            // ISP1-6のDHCPサーバー設定（全て同一セグメント）
            isp1: {
                dhcpEnabled: false,
                name: 'ISP1',
                network: '203.0.113.0',
                ipAddress: '203.0.113.1', // ISP1のゲートウェイIP
                subnetMask: '255.255.255.0',
                dhcpPoolStart: '203.0.113.10',
                dhcpPoolEnd: '203.0.113.50',
                dhcpAllocatedIPs: new Map(),
                gateway: '203.0.113.1'
            },
            isp2: {
                dhcpEnabled: false,
                name: 'ISP2',
                network: '203.0.113.0',
                ipAddress: '203.0.113.1', // 同じセグメント
                subnetMask: '255.255.255.0',
                dhcpPoolStart: '203.0.113.51',
                dhcpPoolEnd: '203.0.113.90',
                dhcpAllocatedIPs: new Map(),
                gateway: '203.0.113.1'
            },
            isp3: {
                dhcpEnabled: false,
                name: 'ISP3',
                network: '203.0.113.0',
                ipAddress: '203.0.113.1',
                subnetMask: '255.255.255.0',
                dhcpPoolStart: '203.0.113.91',
                dhcpPoolEnd: '203.0.113.130',
                dhcpAllocatedIPs: new Map(),
                gateway: '203.0.113.1'
            },
            isp4: {
                dhcpEnabled: false,
                name: 'ISP4',
                network: '203.0.113.0',
                ipAddress: '203.0.113.1',
                subnetMask: '255.255.255.0',
                dhcpPoolStart: '203.0.113.131',
                dhcpPoolEnd: '203.0.113.170',
                dhcpAllocatedIPs: new Map(),
                gateway: '203.0.113.1'
            },
            isp5: {
                dhcpEnabled: false,
                name: 'ISP5',
                network: '203.0.113.0',
                ipAddress: '203.0.113.1',
                subnetMask: '255.255.255.0',
                dhcpPoolStart: '203.0.113.171',
                dhcpPoolEnd: '203.0.113.210',
                dhcpAllocatedIPs: new Map(),
                gateway: '203.0.113.1'
            },
            isp6: {
                dhcpEnabled: false,
                name: 'ISP6',
                network: '203.0.113.0',
                ipAddress: '203.0.113.1',
                subnetMask: '255.255.255.0',
                dhcpPoolStart: '203.0.113.211',
                dhcpPoolEnd: '203.0.113.250',
                dhcpAllocatedIPs: new Map(),
                gateway: '203.0.113.1'
            },

            // DHCP共通設定
            dhcpLeaseTime: 3600,

            // 後方互換性のため既存の設定も維持（isp1をデフォルトとして使用）
            dhcpServerEnabled: true,
            dhcpPoolStart: '203.0.113.10',
            dhcpPoolEnd: '203.0.113.250',
            dhcpAllocatedIPs: new Map()
        };
    }

    // 実際のデバイスドラッグ開始（狭い画面用）
    startActualDeviceDrag(deviceType, event) {
        console.log('startActualDeviceDrag called with:', deviceType);
        
        // パレットアイテムの場合は、適切なキャンバス座標にデバイスを作成
        let x, y;
        const canvasRect = this.canvas.getBoundingClientRect();
        
        if (event.touches && event.touches.length > 0) {
            const touch = event.touches[0];
            // タッチ位置がキャンバス内かチェック
            const isWithinCanvas = touch.clientX >= canvasRect.left && touch.clientX <= canvasRect.right &&
                                 touch.clientY >= canvasRect.top && touch.clientY <= canvasRect.bottom;
            
            if (isWithinCanvas) {
                x = (touch.clientX - canvasRect.left - this.panX) / this.scale;
                y = (touch.clientY - canvasRect.top - this.panY) / this.scale;
            } else {
                x = (canvasRect.width / 2 - this.panX) / this.scale;
                y = (canvasRect.height / 2 - this.panY) / this.scale;
            }
        } else {
            x = (canvasRect.width / 2 - this.panX) / this.scale;
            y = (canvasRect.height / 2 - this.panY) / this.scale;
        }
        
        const device = this.createDevice(deviceType, x, y);
        device.isNewFromPalette = true;
        
        this.pendingDevice = device;
        this.selectedDevice = device;
        this.isDragging = true;
        this.dragOffset = { x: 0, y: 0 };
        this.dragStarted = false;
        
        // グローバルタッチハンドラーを設定
        this.setupGlobalTouchHandlers();
        
        console.log('Actual device drag started:', device.type);
    }
    
    // グローバルタッチハンドラーの設定
    setupGlobalTouchHandlers() {
        // グローバルなタッチムーブとタッチエンドイベントを追加
        const handleGlobalTouchMove = (event) => {
            if (this.isDragging) {
                event.preventDefault();
                this.handlePointerMove(event);
            }
        };
        
        const handleGlobalTouchEnd = (event) => {
            if (this.isDragging) {
                event.preventDefault();
                this.handlePointerUp(event);
            }
            // イベントリスナーを削除
            document.removeEventListener('touchmove', handleGlobalTouchMove);
            document.removeEventListener('touchend', handleGlobalTouchEnd);
        };
        
        document.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
        document.addEventListener('touchend', handleGlobalTouchEnd, { passive: false });
    }

    // デバイスドラッグ中のフローティングプレビュー表示
    showDragPreview(deviceType, screenX, screenY) {
        this.removeDragPreview();

        const preview = document.createElement('div');
        preview.className = 'device-drag-floating-preview';
        preview.id = 'device-drag-floating-preview';
        
        const icon = document.createElement('div');
        icon.className = 'preview-icon';
        icon.textContent = this.getDeviceIcon(deviceType);
        
        const name = document.createElement('div');
        name.className = 'preview-name';
        name.textContent = this.getDeviceDisplayName(deviceType);
        
        preview.appendChild(icon);
        preview.appendChild(name);
        
        preview.style.left = `${screenX}px`;
        preview.style.top = `${screenY}px`;
        
        document.body.appendChild(preview);
        this.dragPreviewElement = preview;
    }

    // ドラッグプレビューの位置更新
    updateDragPreview(screenX, screenY) {
        if (this.dragPreviewElement) {
            this.dragPreviewElement.style.left = `${screenX}px`;
            this.dragPreviewElement.style.top = `${screenY}px`;
        }
    }

    // ドラッグプレビューの削除
    removeDragPreview() {
        if (this.dragPreviewElement) {
            this.dragPreviewElement.remove();
            this.dragPreviewElement = null;
        }
        const existing = document.getElementById('device-drag-floating-preview');
        if (existing) {
            existing.remove();
        }
    }

    // パレットエリアの座標範囲を取得
    getPaletteRect() {
        const palette = document.querySelector('.device-palette');
        if (palette) {
            return palette.getBoundingClientRect();
        }
        return null;
    }
    
    // スクリーン座標がパレットエリア内かチェック
    isInPaletteArea(screenX, screenY) {
        const paletteRect = this.getPaletteRect();
        if (!paletteRect) {
            console.log('⚠️ パレット要素が見つかりません');
            return false;
        }

        const isInside = screenX >= paletteRect.left &&
                        screenX <= paletteRect.right &&
                        screenY >= paletteRect.top &&
                        screenY <= paletteRect.bottom;

        return isInside;
    }

    // 削除ゾーンの表示
    showDeleteZone() {
        const palette = document.querySelector('.device-palette');
        if (palette) {
            palette.classList.add('delete-zone');
        }
    }

    // 削除ゾーンの非表示
    hideDeleteZone() {
        const palette = document.querySelector('.device-palette');
        if (palette) {
            palette.classList.remove('delete-zone');
            palette.classList.remove('delete-zone-active');
        }
    }

    // ドラッグ中の削除ゾーン表示更新
    updateDeleteZoneVisibility(event) {
        if (!this.isDragging || !this.selectedDevice) return;

        const screenX = event.clientX || (event.touches && event.touches[0] ? event.touches[0].clientX : 0);
        const screenY = event.clientY || (event.touches && event.touches[0] ? event.touches[0].clientY : 0);

        const palette = document.querySelector('.device-palette');
        if (!palette) return;

        const paletteRect = palette.getBoundingClientRect();
        const isOverPalette = screenX >= paletteRect.left &&
                             screenX <= paletteRect.right &&
                             screenY >= paletteRect.top &&
                             screenY <= paletteRect.bottom;

        // パレット上の場合は削除ゾーンを強調表示
        if (isOverPalette) {
            if (!palette.classList.contains('delete-zone-active')) {
                palette.classList.add('delete-zone-active');
            }
        } else {
            palette.classList.remove('delete-zone-active');
        }
    }

    // ドラッグ完了処理（論理回路シミュレータと同じロジック）
    finalizeDrag() {
        console.log('🏁 finalizeDrag called:', {
            pendingDevice: !!this.pendingDevice,
            dragStarted: this.dragStarted,
            isDragging: this.isDragging,
            selectedDevice: !!this.selectedDevice
        });

        // ドラッグプレビューを削除
        this.removeDragPreview();

        // パレットから作成されたデバイスで、実際のドラッグが開始されていない場合
        if (this.pendingDevice && !this.dragStarted) {
            console.log('❌ Removing device - drag not started');
            this.pendingDevice = null;
            this.selectedDevice = null;
            this.isDragging = false;
            return;
        }

        // 新規デバイス配置（パレットからドラッグ）
        if (this.pendingDevice && this.dragStarted) {
            // ドロップ位置がパレットエリア内かチェック
            if (this.isInPaletteArea(this.lastDropScreenPos.x, this.lastDropScreenPos.y)) {
                // パレットエリアにドロップされた場合は削除
                console.log('New device dropped in palette area - removing');
                this.devices.delete(this.pendingDevice.id);
                this.updateStatus('デバイス配置をキャンセルしました');
            } else {
                // 正常配置
                this.updateStatus(`${this.pendingDevice.name}を配置しました`);
            }
            this.updateControlButtons();
        }

        // 既存デバイスのドラッグ完了 - 削除判定（パレット領域にドロップされた場合のみ削除）
        if (this.selectedDevice && this.isDragging && !this.pendingDevice) {
            const deviceName = this.selectedDevice.name; // 削除前に名前を保存

            // 最終的にパレット領域にドロップされた場合のみ削除
            const isInPaletteArea = this.isInPaletteArea(this.lastDropScreenPos.x, this.lastDropScreenPos.y);

            if (isInPaletteArea) {
                // デバイスを削除（関連する接続も自動的に削除される）
                this.removeDevice(this.selectedDevice.id);
                this.updateStatus(`${deviceName}を削除しました`);
            }
        }
        
        // ドラッグ終了時に、接続されている単一NICデバイスのポート位置を更新
        if (this.selectedDevice && this.isSingleNICDevice(this.selectedDevice)) {
            this.updateDynamicNICPosition(this.selectedDevice);
            
            // 接続先デバイスも単一NICなら更新
            const nic = this.selectedDevice.ports.nics[0];
            if (nic.connected) {
                const connection = nic.connected;
                const otherDevice = connection.from.device === this.selectedDevice ? 
                    connection.to.device : connection.from.device;
                if (this.isSingleNICDevice(otherDevice)) {
                    this.updateDynamicNICPosition(otherDevice);
                }
            }
        }

        // クリーンアップ
        this.isDragging = false;
        this.dragPrepared = false;
        this.pendingDevice = null;
        this.dragStarted = false;
        this.selectedDevice = null;

        // 削除ゾーンを非表示
        this.hideDeleteZone();

        // グローバルイベントリスナーを削除
        if (this.globalMouseMoveHandler) {
            document.removeEventListener('mousemove', this.globalMouseMoveHandler);
            document.removeEventListener('mouseup', this.globalMouseUpHandler);
        }
        
        this.scheduleRender();
    }

    // マウスイベント処理（論理回路シミュレータ風）
    handleMouseDown(e) {
        e.preventDefault();
        
        // タッチイベント由来でない場合のみ重複チェック
        if (e.type !== 'touchstart') {
            // タッチイベントの直後にマウスイベントが発生した場合はスキップ（iOS対応）
            const currentTime = Date.now();
            if (this.touchEventProcessed && currentTime - this.lastTouchTime < 100) {
                console.log('重複マウスイベントをスキップ:', currentTime - this.lastTouchTime, 'ms後');
                return;
            }
        }
        
        const pos = this.getPointerPos(e);
        
        this.touchStartTime = Date.now();
        this.touchStartPos = { x: pos.x, y: pos.y };
        this.currentMousePos = { x: pos.x, y: pos.y };
        this.lastClickPosition = pos;
        
        // 1. 端子を優先チェック（接続開始の意図を尊重）
        const port = this.getPortAt(pos.x, pos.y);
        if (port) {
            this.startConnection(port);
            return;
        }
        
        // 2. 接続線をチェック
        const connection = this.getConnectionAt(pos.x, pos.y);
        if (connection) {
            const currentTime = Date.now();
            
            if (this.selectedConnection === connection &&
                currentTime - this.lastClickTime < this.doubleClickDelay) {
                // ダブルクリック：接続線を削除
                this.removeConnection(connection.id);
                this.selectedConnection = null;
                this.updateStatus('接続線を削除しました');
                this.scheduleRender();
                return;
            }
            
            // シングルクリック：接続線を選択
            this.selectedConnection = connection;
            this.selectedDevice = null;
            this.lastClickTime = currentTime;
            this.updateStatus(`接続線を選択しました`);
            this.scheduleRender();
            return;
        }
        
        // 3. デバイスをチェック
        const device = this.getDeviceAt(pos.x, pos.y);
        if (device) {
            // Pingモードの場合は特別な処理
            if (this.isPingMode) {
                this.handlePingDeviceSelection(device);
                return;
            }

            // DHCPモードの場合は特別な処理
            if (this.isDHCPMode) {
                this.executeDHCPForDevice(device);
                return;
            }
            
            this.selectedDevice = device;
            this.selectedConnection = null;
            
            // ドラッグ準備状態（実際のドラッグは移動が検出されてから開始）
            this.isDragging = false; // 最初はドラッグモードではない
            this.dragPrepared = true; // ドラッグ準備状態
            this.dragOffset = {
                x: pos.x - device.x,
                y: pos.y - device.y
            };
            this.updateStatus(`${device.name}を選択しました`);
            
            // グローバルマウスリスナーを追加（キャンバス外でのドラッグ対応）
            document.addEventListener('mousemove', this.globalMouseMoveHandler);
            document.addEventListener('mouseup', this.globalMouseUpHandler);
        } else {
            // 4. 空白エリアをクリック
            this.selectedDevice = null;
            this.selectedConnection = null;
            this.dragPrepared = false; // ドラッグ準備状態をリセット
            this.isPanning = true;
            
            // パン開始位置をスクリーン座標で記録
            const screenX = e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
            const screenY = e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 0);
            this.lastPanPoint = { 
                screenX: screenX, 
                screenY: screenY 
            };
            
            // 接続をキャンセル
            if (this.connectionStart) {
                this.connectionStart = null;
                this.updateStatus('接続をキャンセルしました');
            }
        }
        
        this.updateControlButtons();
        this.scheduleRender();
    }

    handleMouseMove(e) {
        const pos = this.getPointerPos(e);
        this.currentMousePos = { x: pos.x, y: pos.y };
        this.handlePointerMove(e);
    }

    handleMouseUp(e) {
        this.handlePointerUp(e);
    }
    
    // グローバルマウス移動処理
    handleGlobalMouseMove(e) {
        console.log('🖱️ Global mouse move:', {
            isDragging: this.isDragging,
            selectedDevice: !!this.selectedDevice,
            pendingDevice: !!this.pendingDevice,
            dragStarted: this.dragStarted
        });

        if (this.isDragging && this.selectedDevice) {
            console.log('✅ Calling handlePointerMove from global mouse move');
            // 統一処理を使用
            this.handlePointerMove(e);
        } else {
            console.log('❌ Not calling handlePointerMove - conditions not met');
        }
    }
    
    // グローバルマウスアップ処理
    handleGlobalMouseUp(e) {
        this.handlePointerUp(e);
        
        // グローバルリスナーを削除
        document.removeEventListener('mousemove', this.globalMouseMoveHandler);
        document.removeEventListener('mouseup', this.globalMouseUpHandler);
    }
    
    // 統一されたポインタアップ処理
    handlePointerUp(e) {
        const pos = this.getPointerPos(e);

        // ドロップ位置のスクリーン座標を記録（最優先で実行）
        if (e.clientX !== undefined && e.clientY !== undefined) {
            this.lastDropScreenPos = { x: e.clientX, y: e.clientY };
        } else if (e.changedTouches && e.changedTouches.length > 0) {
            const touch = e.changedTouches[0];
            this.lastDropScreenPos = { x: touch.clientX, y: touch.clientY };
        } else if (e.touches && e.touches.length > 0) {
            // フォールバック: まだタッチが残っている場合
            const touch = e.touches[0];
            this.lastDropScreenPos = { x: touch.clientX, y: touch.clientY };
        }

        
        // 接続中の場合
        if (this.connectionStart) {
            let port = this.getPortAt(pos.x, pos.y);
            
            // 直接端子が見つからない場合、スマート接続を試行
            if (!port) {
                const device = this.getDeviceAt(pos.x, pos.y);
                if (device) {
                    port = this.findBestPort(device, this.connectionStart);
                }
            }
            
            if (port && port !== this.connectionStart) {
                this.completeConnection(this.connectionStart, port);
            }
            
            this.connectionStart = null;
            this.scheduleRender();
        }
        
        // デバイスのドラッグ終了時の処理（finalizeDragで統一）
        if (this.isDragging && (this.selectedDevice || this.pendingDevice)) {
            this.finalizeDrag();
        } else if (this.dragPrepared && this.selectedDevice) {
            // ドラッグされずに終了した場合（単純なクリックまたはダブルクリック）
            this.handleDeviceClick(this.selectedDevice);
        }
        
        // 残りのクリーンアップ
        this.isDragging = false;
        this.dragPrepared = false; // ドラッグ準備状態をリセット
        this.isPanning = false;
        this.lastPanPoint = null;
    }

    // タッチイベント処理
    handleTouchStart(e) {
        e.preventDefault();
        
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            
            // タッチを擬似的なマウスイベントに変換
            const syntheticEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                touches: [touch],
                preventDefault: () => e.preventDefault(),
                type: 'touchstart' // タッチイベント由来であることを示す
            };
            
            this.handleMouseDown(syntheticEvent);
            
            // マウスダウン処理後にタッチイベント処理フラグを設定
            this.lastTouchTime = Date.now();
            this.touchEventProcessed = true;
            
            // 一定時間後にフラグをリセット
            setTimeout(() => {
                this.touchEventProcessed = false;
            }, 200);
        } else if (e.touches.length === 2) {
            // ピンチズーム開始
            this.isPanning = false; // ピンチ中はパンを無効化
            this.lastPinchDistance = this.getPinchDistance(e.touches);
            this.lastPinchCenter = this.getPinchCenter(e.touches);
        }
    }

    handleTouchMove(e) {
        e.preventDefault();
        
        if (e.touches.length === 1 && !this.lastPinchDistance) {
            const touch = e.touches[0];
            
            // タッチを擬似的なマウスイベントに変換
            const syntheticEvent = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                touches: [touch],
                preventDefault: () => e.preventDefault()
            };
            
            // currentMousePosを更新
            const pos = this.getPointerPos(syntheticEvent);
            this.currentMousePos = { x: pos.x, y: pos.y };
            
            this.handleMouseMove(syntheticEvent);
        } else if (e.touches.length === 2 && this.lastPinchDistance) {
            // ピンチズーム処理
            const currentDistance = this.getPinchDistance(e.touches);
            const currentCenter = this.getPinchCenter(e.touches);
            
            const scaleChange = currentDistance / this.lastPinchDistance;
            const newScale = Math.max(0.5, Math.min(3, this.scale * scaleChange));
            
            if (newScale !== this.scale) {
                const rect = this.canvas.getBoundingClientRect();
                const centerX = currentCenter.x - rect.left;
                const centerY = currentCenter.y - rect.top;
                
                this.panX = centerX - (centerX - this.panX) * (newScale / this.scale);
                this.panY = centerY - (centerY - this.panY) * (newScale / this.scale);
                this.scale = newScale;
            }
            
            this.lastPinchDistance = currentDistance;
            this.lastPinchCenter = currentCenter;
            this.scheduleRender();
        }
    }

    handleTouchEnd(e) {
        e.preventDefault();
        
        if (e.touches.length === 0) {
            // タッチエンドをマウスアップとして処理
            const touch = e.changedTouches && e.changedTouches[0];
            if (touch) {
                const syntheticEvent = {
                    clientX: touch.clientX,
                    clientY: touch.clientY,
                    changedTouches: [touch],
                    preventDefault: () => e.preventDefault()
                };
                this.handlePointerUp(syntheticEvent);
            }
            
            this.lastPinchDistance = null;
            this.lastPinchCenter = null;
        } else if (e.touches.length === 1) {
            this.lastPinchDistance = null;
            this.lastPinchCenter = null;
        }
    }

    // ピンチズーム用ヘルパー
    getPinchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getPinchCenter(touches) {
        return {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2
        };
    }

    // ホイールズーム
    handleWheel(e) {
        e.preventDefault();
        
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const scaleFactor = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.5, Math.min(3, this.scale * scaleFactor));
        
        if (newScale !== this.scale) {
            this.panX = mouseX - (mouseX - this.panX) * (newScale / this.scale);
            this.panY = mouseY - (mouseY - this.panY) * (newScale / this.scale);
            this.scale = newScale;
            this.scheduleRender();
        }
    }

    // 右クリック（コンテキストメニュー）イベント処理
    handleContextMenu(e) {
        e.preventDefault();
        const pos = this.getPointerPos(e);
        const connection = this.getConnectionAt(pos.x, pos.y);
        if (connection) {
            this.removeConnection(connection.id);
            if (this.selectedConnection === connection) {
                this.selectedConnection = null;
            }
            this.updateStatus('接続線を削除しました');
            this.scheduleRender();
        }
    }

    // 指定座標のデバイス取得
    getDeviceAt(x, y) {
        // Z-indexの高い順（手前から）にチェック
        const sortedDevices = Array.from(this.devices.values())
            .sort((a, b) => b.zIndex - a.zIndex);
        
        for (const device of sortedDevices) {
            if (x >= device.x && x <= device.x + device.width &&
                y >= device.y && y <= device.y + device.height) {
                return device;
            }
        }
        return null;
    }
    
    // 指定座標の接続線取得
    getConnectionAt(x, y) {
        const tolerance = 8;
        
        for (const connection of this.connections) {
            let fromDevice, toDevice, fromPortId, toPortId;
            
            // 新しい形式（from/to オブジェクト）と古い形式の両方をサポート
            if (connection.from && connection.to) {
                // 新しい形式
                fromDevice = connection.from.device;
                toDevice = connection.to.device;
                fromPortId = connection.from.port.id;
                toPortId = connection.to.port.id;
            } else {
                // 古い形式（後方互換性）
                fromDevice = this.devices.get(connection.fromDevice);
                toDevice = this.devices.get(connection.toDevice);
                fromPortId = connection.fromPort;
                toPortId = connection.toPort;
            }
            
            if (!fromDevice || !toDevice) continue;
            
            const fromPort = this.getPortPosition(fromDevice, fromPortId);
            const toPort = this.getPortPosition(toDevice, toPortId);
            
            if (!fromPort || !toPort) continue;
            
            // ベジェ曲線に対する当たり判定
            const distance = this.pointToBezierDistance(x, y, fromDevice, toDevice, fromPortId, toPortId);
            
            if (distance <= tolerance) {
                return connection;
            }
        }
        
        return null;
    }

    // 点とベジェ曲線の距離を計算
    pointToBezierDistance(px, py, fromDevice, toDevice, fromPortId, toPortId) {
        // 接続パスを取得
        const connectionPath = this.getConnectionPath(fromDevice, toDevice);
        
        if (!connectionPath.isBezier) {
            // 直線の場合は従来の計算
            return this.pointToLineDistance(px, py, connectionPath.startX, connectionPath.startY, connectionPath.endX, connectionPath.endY);
        }
        
        // ベジェ曲線の場合：曲線上のサンプル点との最小距離を計算
        let minDistance = Infinity;
        const samples = 20; // サンプル点数
        
        for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            const point = this.getPointOnCubicBezierCurve(
                t,
                connectionPath.startX, connectionPath.startY,
                connectionPath.cp1X, connectionPath.cp1Y,
                connectionPath.cp2X, connectionPath.cp2Y,
                connectionPath.endX, connectionPath.endY
            );
            
            const dx = px - point.x;
            const dy = py - point.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < minDistance) {
                minDistance = distance;
            }
        }
        
        return minDistance;
    }
    
    // 点と線分の距離を計算
    pointToLineDistance(px, py, x1, y1, x2, y2) {
        const A = px - x1;
        const B = py - y1;
        const C = x2 - x1;
        const D = y2 - y1;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        
        if (lenSq === 0) return Math.sqrt(A * A + B * B);
        
        let param = dot / lenSq;
        
        let xx, yy;
        
        if (param < 0) {
            xx = x1;
            yy = y1;
        } else if (param > 1) {
            xx = x2;
            yy = y2;
        } else {
            xx = x1 + param * C;
            yy = y1 + param * D;
        }
        
        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    // スマート接続用の最適ポート検索（NIC用・1対1制限）
    findBestPort(device, startPort) {
        const ports = device.ports;
        if (!ports || !ports.nics || ports.nics.length === 0) return null;
        
        // 未使用のNICポートのみを探す（1対1制限）
        for (const port of ports.nics) {
            // 既に使用されているかチェック
            const isUsed = this.connections.some(conn =>
                (conn.fromDevice === device.id && conn.fromPort === port.id) ||
                (conn.toDevice === device.id && conn.toPort === port.id) ||
                (conn.from && conn.from.device === device && conn.from.port === port) ||
                (conn.to && conn.to.device === device && conn.to.port === port) ||
                port.connected
            );
            
            if (!isUsed) {
                return { device, port, type: 'nic' };
            }
        }
        
        // 全ポートが使用中の場合：繋ぎ直し用に最適なポートを選択
        // 1. startPort.device との間にすでに接続があるポートを優先
        if (startPort && startPort.device) {
            for (const port of ports.nics) {
                const connWithStart = this.connections.find(conn => {
                    const devA = conn.from?.device || this.devices.get(conn.fromDevice);
                    const devB = conn.to?.device || this.devices.get(conn.toDevice);
                    const portA = conn.from?.port || devA?.ports?.nics?.find(p => p.id === conn.fromPort);
                    const portB = conn.to?.port || devB?.ports?.nics?.find(p => p.id === conn.toPort);
                    return (devA === device && portA === port && devB === startPort.device) ||
                           (devB === device && portB === port && devA === startPort.device);
                });
                if (connWithStart) {
                    return { device, port, type: 'nic' };
                }
            }
        }

        // 2. 単一NICデバイスやその他は先頭のポートを返す
        return { device, port: ports.nics[0], type: 'nic' };
    }
    
    // 接続線削除
    removeConnection(connectionId) {
        const connectionIndex = this.connections.findIndex(c => c.id === connectionId);
        if (connectionIndex === -1) return;
        
        const connection = this.connections[connectionIndex];
        
        // 接続されているポートの接続情報をクリア
        if (connection.from && connection.to) {
            // 新しい形式
            connection.from.port.connected = null;
            connection.to.port.connected = null;
        } else {
            // 古い形式の場合は、デバイスとポートを検索してクリア
            const fromDevice = this.devices.get(connection.fromDevice);
            const toDevice = this.devices.get(connection.toDevice);
            
            if (fromDevice) {
                const fromPort = fromDevice.ports?.nics?.find(p => p.id === connection.fromPort);
                if (fromPort) fromPort.connected = null;
            }
            
            if (toDevice) {
                const toPort = toDevice.ports?.nics?.find(p => p.id === connection.toPort);
                if (toPort) toPort.connected = null;
            }
        }
        
        const devA = connection.from?.device || (connection.fromDevice ? this.devices.get(connection.fromDevice) : null);
        const devB = connection.to?.device || (connection.toDevice ? this.devices.get(connection.toDevice) : null);

        this.connections.splice(connectionIndex, 1);
        console.log('接続線削除:', connectionId);

        if (devA) this.updateDynamicNICPosition(devA);
        if (devB) this.updateDynamicNICPosition(devB);
    }
    
    // デバイス削除
    removeDevice(deviceId) {
        const device = this.devices.get(deviceId);
        if (!device) return;
        
        // このデバイスに関連する接続線をすべて削除（新旧形式両対応）
        const connectionsToRemove = this.connections.filter(conn => {
            // 古い形式の場合
            if (conn.fromDevice === deviceId || conn.toDevice === deviceId) {
                return true;
            }
            // 新しい形式の場合
            if (conn.from && conn.from.device && conn.from.device.id === deviceId) {
                return true;
            }
            if (conn.to && conn.to.device && conn.to.device.id === deviceId) {
                return true;
            }
            return false;
        });

        console.log('削除対象の接続:', connectionsToRemove.length, '個');
        connectionsToRemove.forEach(conn => {
            console.log('接続削除中:', conn.id, 'from:', conn.fromDevice, 'to:', conn.toDevice);
            this.removeConnection(conn.id);
        });
        console.log('削除後の接続数:', this.connections.length);
        
        // デバイスを削除
        this.devices.delete(deviceId);
        console.log('デバイス削除:', deviceId);
        
        this.updateControlButtons();
        this.scheduleRender();
    }
    
    // 作業領域外かどうかをチェック
    isOutsideWorkArea(x, y) {
        // キャンバスの実際の表示領域を取得
        const canvasRect = this.canvas.getBoundingClientRect();
        const canvasWidth = canvasRect.width;
        const canvasHeight = canvasRect.height;
        
        // ワールド座標での作業領域を計算（削除用の広いマージン）
        const deleteMargin = 100; // 削除判定のマージン（広め）
        const worldBounds = {
            left: -this.panX / this.scale - deleteMargin,
            top: -this.panY / this.scale - deleteMargin,
            right: (canvasWidth - this.panX) / this.scale + deleteMargin,
            bottom: (canvasHeight - this.panY) / this.scale + deleteMargin
        };
        
        return x < worldBounds.left || x > worldBounds.right ||
               y < worldBounds.top || y > worldBounds.bottom;
    }



    // 接続開始（1対1制限チェック付き）
    startConnection(port) {
        this.connectionStart = port;
        const portLabel = port.port.label || port.port.id;
        if (port.port.connected) {
            this.updateStatus(`${port.device.name}の${portLabel}ポートから接続の繋ぎ直しを開始しました`);
        } else {
            this.updateStatus(`${port.device.name}の${portLabel}ポートから接続を開始しました`);
        }
        console.log('接続開始:', port.type, 'on', port.device.type);
    }
    
    // 接続完了（NIC間接続・1対1制限）
    completeConnection(startPort, endPort) {
        console.log('接続完了試行:', startPort.type, '->', endPort.type);

        // 接続の妥当性をチェック
        // 1. 同一デバイス間接続の禁止
        if (startPort.device === endPort.device) {
            this.updateStatus('同じデバイス同士は接続できません');
            return;
        }

        // 2. 既に全く同じポート同士で接続されている場合は通知して終了
        const isExactSameConnection = this.connections.some(conn => {
            const devA = conn.from?.device || this.devices.get(conn.fromDevice);
            const devB = conn.to?.device || this.devices.get(conn.toDevice);
            const portA = conn.from?.port || devA?.ports?.nics?.find(p => p.id === conn.fromPort);
            const portB = conn.to?.port || devB?.ports?.nics?.find(p => p.id === conn.toPort);
            return (devA === startPort.device && portA === startPort.port && devB === endPort.device && portB === endPort.port) ||
                   (devB === startPort.device && portB === startPort.port && devA === endPort.device && portA === endPort.port);
        });

        if (isExactSameConnection) {
            this.updateStatus('既に接続されています');
            return;
        }

        // 3. 既存の接続を削除（古いエッジの自動切断）
        // startPort に接続されていた既存の接続を削除
        const startExistingConns = this.connections.filter(conn => {
            const devA = conn.from?.device || this.devices.get(conn.fromDevice);
            const devB = conn.to?.device || this.devices.get(conn.toDevice);
            const portA = conn.from?.port || devA?.ports?.nics?.find(p => p.id === conn.fromPort);
            const portB = conn.to?.port || devB?.ports?.nics?.find(p => p.id === conn.toPort);
            return (devA === startPort.device && portA === startPort.port) ||
                   (devB === startPort.device && portB === startPort.port);
        });
        startExistingConns.forEach(conn => this.removeConnection(conn.id));

        // endPort に接続されていた既存の接続を削除
        const endExistingConns = this.connections.filter(conn => {
            const devA = conn.from?.device || this.devices.get(conn.fromDevice);
            const devB = conn.to?.device || this.devices.get(conn.toDevice);
            const portA = conn.from?.port || devA?.ports?.nics?.find(p => p.id === conn.fromPort);
            const portB = conn.to?.port || devB?.ports?.nics?.find(p => p.id === conn.toPort);
            return (devA === endPort.device && portA === endPort.port) ||
                   (devB === endPort.device && portB === endPort.port);
        });
        endExistingConns.forEach(conn => this.removeConnection(conn.id));

        // 4. NIC間接続作成（1対1接続）
        const connection = {
            id: 'conn_' + Date.now(),
            from: { 
                deviceId: startPort.device.id, 
                portId: startPort.port.id,
                device: startPort.device, 
                port: startPort.port 
            },
            to: { 
                deviceId: endPort.device.id, 
                portId: endPort.port.id,
                device: endPort.device, 
                port: endPort.port 
            },
            type: 'ethernet',
            selected: false
        };
        
        // ポートに接続情報を設定
        startPort.port.connected = connection;
        endPort.port.connected = connection;
        
        this.connections.push(connection);
        
        // 単一NICデバイスの場合、動的NICポート位置を更新
        this.updateDynamicNICPosition(startPort.device);
        this.updateDynamicNICPosition(endPort.device);
        
        const startLabel = startPort.port.label || startPort.port.id;
        const endLabel = endPort.port.label || endPort.port.id;
        this.updateStatus(`${startPort.device.name}の${startLabel} と ${endPort.device.name}の${endLabel} を接続しました`);
        console.log('接続作成完了:', connection.id, '-', connection.from.device.name, '→', connection.to.device.name);
        
        // WAN接続の自動IP割り当てをチェック
        this.checkAndAssignWANIP(connection);
        
        // ONU ↔ インターネット接続時の追加チェック
        const fromDevice = connection.from.device;
        const toDevice = connection.to.device;
        
        if ((fromDevice.type === 'onu' && toDevice.type === 'internet') ||
            (fromDevice.type === 'internet' && toDevice.type === 'onu')) {
            console.log('ONU-インターネット接続検出、既存のONU接続をチェック中...');
            this.checkExistingONUConnections(fromDevice.type === 'onu' ? fromDevice : toDevice);
        }

        // インターネット側DHCP処理: PC/サーバー等がONU経由でインターネットに接続された場合
        this.checkAndAssignInternetDHCP(connection);

        // 接続開始状態をクリア
        this.connectionStart = null;
        this.scheduleRender();
    }

    // インターネット側DHCP処理（PC ↔ ONU接続時の自動グローバルIP割り当て）
    checkAndAssignInternetDHCP(connection) {
        const fromDevice = connection.from.device;
        const toDevice = connection.to.device;

        let clientDevice = null;

        // PC/サーバーがONUに接続された場合をチェック
        if ((fromDevice.type === 'pc' || fromDevice.type === 'server') && toDevice.type === 'onu') {
            clientDevice = fromDevice;
        } else if ((toDevice.type === 'pc' || toDevice.type === 'server') && fromDevice.type === 'onu') {
            clientDevice = toDevice;
        }

        if (clientDevice) {
            console.log(`🌐 インターネット側DHCP処理開始: ${clientDevice.name}`);

            // インターネット接続を確認してグローバルIP自動割り当て
            const success = this.checkAndAssignInternetIP(clientDevice);

            if (success) {
                console.log(`✅ ${clientDevice.name} に自動的にグローバルIPを割り当て完了`);
                this.updateStatus(`${clientDevice.name} にグローバルIPアドレスが自動割り当てされました`);
            } else {
                console.log(`❌ ${clientDevice.name} のグローバルIP自動割り当てに失敗`);
            }
        }
    }

    // スイッチ関連接続の処理（スイッチ経由でのDHCP対応）
    handleSwitchConnection(connection) {
        const fromDevice = connection.from.device;
        const toDevice = connection.to.device;
        
        // スイッチが接続されたときに、スイッチ経由でルーターに接続されているクライアントを探索
        let switchDevice = null;
        let connectedDevice = null;
        
        if (fromDevice.type === 'switch') {
            switchDevice = fromDevice;
            connectedDevice = toDevice;
        } else if (toDevice.type === 'switch') {
            switchDevice = toDevice;
            connectedDevice = fromDevice;
        }
        
        if (!switchDevice) return;
        
        console.log('🔍 スイッチDHCP処理開始:', switchDevice.name, '接続デバイス:', connectedDevice.name);
        
        // スイッチに接続されているすべてのデバイスを探索
        const switchConnections = this.getDeviceConnections(switchDevice);
        console.log('🔍 スイッチの全接続数:', switchConnections.length);
        
        // スイッチ経由でルーターに接続されているかチェック
        let routerDevice = null;
        let routerPort = null;
        
        for (const conn of switchConnections) {
            const otherDevice = conn.from.device === switchDevice ? conn.to.device : conn.from.device;
            const otherPort = conn.from.device === switchDevice ? conn.to.port : conn.from.port;
            
            if (otherDevice.type === 'router') {
                // WANポート接続は除外
                if (otherPort.id !== 'wan') {
                    routerDevice = otherDevice;
                    routerPort = otherPort;
                    console.log('✅ スイッチ経由ルーター発見:', routerDevice.name, 'ポート:', routerPort.label);
                    break;
                }
            }
        }
        
        if (!routerDevice) {
            console.log('⏭️ スイッチ経由のルーター接続が見つかりません');
            return;
        }
        
        // スイッチに接続されているデバイスを処理（再帰的に）
        this.processSwitchDevicesRecursively(switchDevice, routerDevice, routerPort, new Set());
        // スイッチ自体はL2機器のためIPアドレス割り当て対象外
    }
    
    // デバイスに接続されているすべての接続を取得
    getDeviceConnections(device) {
        return this.connections.filter(conn => 
            conn.from.device === device || conn.to.device === device
        );
    }
    
    // スイッチに接続されているデバイスを再帰的に処理（多段スイッチ対応）
    processSwitchDevicesRecursively(switchDevice, routerDevice, routerPort, visitedDevices) {
        console.log('🔄 再帰スイッチDHCP処理:', switchDevice.name, 'visited:', Array.from(visitedDevices));
        
        // 無限ループ防止
        if (visitedDevices.has(switchDevice.id)) {
            console.log('⏭️ 既に処理済みのスイッチをスキップ:', switchDevice.name);
            return;
        }
        visitedDevices.add(switchDevice.id);
        
        const switchConnections = this.getDeviceConnections(switchDevice);
        
        for (const conn of switchConnections) {
            const otherDevice = conn.from.device === switchDevice ? conn.to.device : conn.from.device;
            
            // ルーターとの直接接続は除外
            if (otherDevice === routerDevice) {
                continue;
            }
            
            if (['pc', 'server', 'dns'].includes(otherDevice.type)) {
                console.log('🔍 スイッチ経由クライアント発見 (再帰):', otherDevice.name);
                this.assignDHCPToClient(otherDevice, routerDevice, routerPort, 'switch');
            } else if (otherDevice.type === 'switch' && !visitedDevices.has(otherDevice.id)) {
                console.log('🔍 さらにスイッチを発見、再帰処理:', otherDevice.name);
                // 再帰的に次のスイッチも処理
                this.processSwitchDevicesRecursively(otherDevice, routerDevice, routerPort, visitedDevices);
            }
        }
    }
    
    // クライアントデバイスにDHCPでIPアドレスを割り当て
    assignDHCPToClient(clientDevice, routerDevice, routerPort, connectionType = 'direct') {
        console.log('📋 DHCP割り当て開始:', {
            client: clientDevice.name,
            router: routerDevice.name,
            clientDHCP: clientDevice.config?.dhcpEnabled,
            connectionType: connectionType
        });
        
        // クライアントデバイスがDHCP有効かどうかチェック
        if (!clientDevice.config || !clientDevice.config.dhcpEnabled) {
            console.log('⏭️ クライアントのDHCP無効のため、IP割り当てをスキップ:', clientDevice.name);
            return;
        }
        
        // ルーターのどのLANに接続されているか判定
        const lanConfig = this.determineLANConnection(clientDevice, routerDevice);
        console.log('🔍 LAN判定結果:', {
            lanConfig: lanConfig,
            lan1Enabled: routerDevice.config.lan1?.dhcpEnabled,
            lan2Enabled: routerDevice.config.lan2?.dhcpEnabled,
            lan3Enabled: routerDevice.config.lan3?.dhcpEnabled
        });
        
        if (!lanConfig) {
            console.log('❌ 対応するLAN設定が見つかりません:', routerDevice.name);
            return;
        }
        
        if (!lanConfig.dhcpEnabled) {
            console.log('⏭️ ルーターのLAN DHCP無効のため、IP割り当てをスキップ:', routerDevice.name, this.getLANName(routerDevice, lanConfig));
            return;
        }
        
        // DHCP設定を初期化（必要に応じて）
        if (!lanConfig.dhcpAllocatedIPs) {
            lanConfig.dhcpAllocatedIPs = new Map();
        }
        
        const connectionDesc = connectionType === 'switch' ? 'スイッチ経由' : '直接接続';
        console.log('🌐 LAN DHCP処理開始 (' + connectionDesc + '):', clientDevice.name, '←', routerDevice.name, this.getLANName(routerDevice, lanConfig));
        
        // IPアドレスを割り当て
        const assignedIP = this.allocateDHCPAddressFromLAN(lanConfig, clientDevice, routerDevice);
        
        if (assignedIP) {
            // IPアドレスとネットワーク設定を更新
            clientDevice.config.ipAddress = assignedIP.ip;
            clientDevice.config.subnetMask = lanConfig.subnetMask || '255.255.255.0';
            clientDevice.config.defaultGateway = lanConfig.defaultGateway || lanConfig.ipAddress;

            console.log('🔧 DHCP設定更新:', {
                client: clientDevice.name,
                ip: assignedIP.ip,
                subnet: clientDevice.config.subnetMask,
                gateway: clientDevice.config.defaultGateway,
                lanSubnet: lanConfig.subnetMask,
                lanGateway: lanConfig.defaultGateway
            });
            clientDevice.config.dnsServers = ['8.8.8.8', '8.8.4.4'];
            
            // lan1.ipAddress も同期して更新
            if (clientDevice.config.lan1) {
                clientDevice.config.lan1.ipAddress = assignedIP.ip;
            }
            
            const lanName = this.getLANName(routerDevice, lanConfig);
            console.log('✅ LAN DHCP割り当て完了 (' + connectionDesc + '):', clientDevice.name, 'IP:', assignedIP.ip, 'ゲートウェイ:', lanConfig.ipAddress, '(' + lanName + ')');
            this.updateStatus(`🔗 ${clientDevice.name} が ${routerDevice.name}の${lanName}から${connectionDesc}でIP ${assignedIP.ip} を取得しました`);
            
            // デバイス表示を即座に更新（DHCP配信時の描画遅延を防ぐ）
            this.render();
        } else {
            console.log('❌ LAN DHCP割り当てに失敗:', clientDevice.name, '→', routerDevice.name);
            this.updateStatus(`❌ ${routerDevice.name}のDHCPプールが満杯のため、${clientDevice.name}にIPを割り当てできませんでした`);
        }
    }

    // LAN側DHCP処理: PC/サーバー等がルーターのLANポートに接続された場合の自動IP割り当て
    checkAndAssignLANIP(connection) {
        const fromDevice = connection.from.device;
        const toDevice = connection.to.device;
        const fromPort = connection.from.port;
        const toPort = connection.to.port;
        
        let clientDevice = null;
        let routerDevice = null;
        let routerPort = null;
        
        // 直接接続：クライアントデバイス（PC、サーバー、DNS等）とルーターの接続を検出
        if (fromDevice.type === 'router' && ['pc', 'server', 'dns'].includes(toDevice.type)) {
            routerDevice = fromDevice;
            clientDevice = toDevice;
            routerPort = fromPort;
        } else if (toDevice.type === 'router' && ['pc', 'server', 'dns'].includes(fromDevice.type)) {
            routerDevice = toDevice;
            clientDevice = fromDevice;
            routerPort = toPort;
        }
        // スイッチ経由接続：スイッチが関連する接続の場合、既存の接続を調査してDHCP処理
        else if (fromDevice.type === 'switch' || toDevice.type === 'switch') {
            console.log('🔍 スイッチ関連接続検出:', fromDevice.name, '↔', toDevice.name);
            this.handleSwitchConnection(connection);
            return; // スイッチ接続は別処理で対応
        }
        
        if (!clientDevice || !routerDevice || !routerPort) {
            // LAN接続ではない場合は何もしない
            return;
        }
        
        // WANポートへの接続は除外
        if (routerPort.id === 'wan') {
            return;
        }
        
        console.log('🔍 直接LAN接続検出:', clientDevice.name, '→', routerDevice.name, 'ポート:', routerPort.label);
        
        // 統一されたDHCP処理を使用
        this.assignDHCPToClient(clientDevice, routerDevice, routerPort, 'direct');
    }

    // ONU-インターネット接続時に既存のONU接続をチェック
    checkExistingONUConnections(onuDevice) {
        console.log('🔍 checkExistingONUConnections開始:', onuDevice.name);
        
        // ONUに接続されているインターネットを探す
        const internetDevice = this.findConnectedInternet(onuDevice);
        if (!internetDevice) {
            console.log('❌ ONUに接続されているインターネットが見つかりません');
            return;
        }
        
        console.log('✅ ONUに接続されたインターネット:', internetDevice.name);
        
        // ONUに接続されている全デバイスをチェック
        for (const connection of this.connections) {
            let otherDevice = null;
            
            if (connection.from.device === onuDevice) {
                otherDevice = connection.to.device;
            } else if (connection.to.device === onuDevice) {
                otherDevice = connection.from.device;
            }
            
            // ルーターのWAN接続を発見した場合
            if (otherDevice && otherDevice.type === 'router') {
                const isWANConnection = this.isRouterWANConnection(connection);
                if (isWANConnection) {
                    console.log('🔍 既存のルーターWAN接続を発見:', otherDevice.name, 'WAN DHCP:', otherDevice.wanConfig?.dhcpEnabled);
                    
                    // WAN DHCPが有効な場合、直接IP割り当てを実行
                    if (otherDevice.wanConfig && otherDevice.wanConfig.dhcpEnabled) {
                        console.log('🌐 ONU経由でのWAN IP割り当て開始:', otherDevice.name);
                        
                        // ONU → インターネット接続のISPポートを判定
                        const onuToInternetISP = this.detectONUInternetISP(onuDevice, internetDevice);
                        console.log('🔍 ONU経由のルーターWAN ISP判定結果:', onuToInternetISP);

                        // グローバルIPを割り当て（判定されたISPを使用）
                        const globalIP = this.assignGlobalIP(otherDevice, internetDevice, onuToInternetISP);
                        if (globalIP) {
                            // WAN設定を更新
                            if (!otherDevice.wanConfig) {
                                otherDevice.wanConfig = {};
                            }
                            
                            otherDevice.wanConfig.ipAddress = globalIP.ip;
                            otherDevice.wanConfig.subnetMask = '255.255.255.0';
                            otherDevice.wanConfig.defaultGateway = globalIP.gateway;
                            otherDevice.wanConfig.dnsServers = ['8.8.8.8', '8.8.4.4'];
                            otherDevice.wanConfig.isConnected = true;
                            otherDevice.wanConfig.internetDevice = internetDevice;
                            otherDevice.wanConfig.availableGlobalIP = globalIP;
                            
                            console.log('✅ ONU経由WAN設定完了:', otherDevice.name, 'IP:', globalIP.ip);
                            this.updateStatus(`🌐 ${otherDevice.name} のWANがONU経由でグローバルIP ${globalIP.ip} を取得しました`);
                            
                            // デバイス表示を即座に更新（DHCP配信時の描画遅延を防ぐ）
                            this.render();
                        } else {
                            console.log('❌ グローバルIP割り当てに失敗:', otherDevice.name);
                        }
                    } else {
                        console.log('⏭️ WAN DHCPが無効のため、IP割り当てをスキップ:', otherDevice.name);
                    }
                }
            }
            // サーバー/PC/DNS等の直接接続を発見した場合
            else if (otherDevice && ['server', 'pc', 'dns'].includes(otherDevice.type)) {
                console.log('🔍 既存のデバイス接続を発見:', otherDevice.name, 'タイプ:', otherDevice.type, 'DHCP:', otherDevice.config?.dhcpEnabled);
                
                // DHCPが有効な場合、直接IP割り当てを実行
                if (otherDevice.config && otherDevice.config.dhcpEnabled) {
                    console.log('🌐 ONU経由でのデバイス IP割り当て開始:', otherDevice.name, '(' + otherDevice.type + ')');

                    // ONU → インターネット接続のISPポートを判定
                    const onuToInternetISP = this.detectONUInternetISP(onuDevice, internetDevice);
                    console.log('🔍 ONU経由のISP判定結果:', onuToInternetISP);

                    // グローバルIPを割り当て（判定されたISPを使用）
                    const globalIP = this.assignGlobalIP(otherDevice, internetDevice, onuToInternetISP);
                    if (globalIP) {
                        // 設定を更新
                        otherDevice.config.ipAddress = globalIP.ip;
                        otherDevice.config.subnetMask = '255.255.255.0';
                        otherDevice.config.defaultGateway = globalIP.gateway;
                        otherDevice.config.dnsServers = ['8.8.8.8', '8.8.4.4'];
                        
                        // lan1.ipAddress も同期して更新
                        if (otherDevice.config.lan1) {
                            otherDevice.config.lan1.ipAddress = globalIP.ip;
                        }
                        otherDevice.config.isInternetConnected = true;
                        otherDevice.config.internetDevice = internetDevice;
                        otherDevice.config.availableGlobalIP = globalIP;
                        
                        console.log('✅ ONU経由デバイス設定完了:', otherDevice.name, '(' + otherDevice.type + ')', 'IP:', globalIP.ip);
                        this.updateStatus(`🌐 ${otherDevice.name} がONU経由でグローバルIP ${globalIP.ip} を取得しました`);
                        
                        // デバイス表示を即座に更新（DHCP配信時の描画遅延を防ぐ）
                        this.render();
                    } else {
                        console.log('❌ グローバルIP割り当てに失敗:', otherDevice.name);
                    }
                } else {
                    console.log('⏭️ DHCPが無効のため、IP割り当てをスキップ:', otherDevice.name, '(' + otherDevice.type + ')');
                }
            }
        }
    }

    // インターネット機器のISP設定（有効/無効・プール範囲）変更を、
    // 既にONU経由で接続済みのルーター/PC/サーバー等に反映する
    redistributeInternetISPConnections(internetDevice) {
        if (!internetDevice || internetDevice.type !== 'internet') return;

        console.log(`\n=== インターネットISP設定の再配布開始: ${internetDevice.name} ===`);

        // このインターネット機器に直接つながっている全ONUを検出
        const connectedONUs = [];
        for (const connection of this.connections) {
            let onuDevice = null;
            if (connection.from.device === internetDevice && connection.to.device.type === 'onu') {
                onuDevice = connection.to.device;
            } else if (connection.to.device === internetDevice && connection.from.device.type === 'onu') {
                onuDevice = connection.from.device;
            }
            if (onuDevice && !connectedONUs.includes(onuDevice)) {
                connectedONUs.push(onuDevice);
            }
        }

        console.log(`🔍 再評価対象のONU数: ${connectedONUs.length}`);

        // 各ONUの先につながっているルーター/PC/サーバー等のグローバルIPを再評価
        for (const onuDevice of connectedONUs) {
            this.checkExistingONUConnections(onuDevice);
        }

        console.log(`=== インターネットISP設定の再配布終了 ===\n`);
    }

    // ルーターのWAN接続かどうかを判定
    isRouterWANConnection(connection) {
        if (connection.from.device.type === 'router' && connection.from.port.id === 'wan') {
            return true;
        }
        if (connection.to.device.type === 'router' && connection.to.port.id === 'wan') {
            return true;
        }
        return false;
    }

    // ONUに接続されているインターネットデバイスを検索
    findConnectedInternet(onuDevice) {
        if (onuDevice.type !== 'onu') {
            console.log('findConnectedInternet: ONUではないデバイス:', onuDevice.name);
            return null;
        }
        
        console.log('findConnectedInternet: ONUの接続をチェック中:', onuDevice.name);
        console.log('現在の接続数:', this.connections.length);
        
        // ONUの全ポートをチェック
        for (const connection of this.connections) {
            let otherDevice = null;
            
            if (connection.from.device === onuDevice) {
                otherDevice = connection.to.device;
                console.log('  接続先:', otherDevice.name, 'タイプ:', otherDevice.type);
            } else if (connection.to.device === onuDevice) {
                otherDevice = connection.from.device;
                console.log('  接続元:', otherDevice.name, 'タイプ:', otherDevice.type);
            }
            
            if (otherDevice && otherDevice.type === 'internet') {
                console.log('  インターネットデバイス発見:', otherDevice.name);
                return otherDevice;
            }
        }
        
        console.log('  インターネットデバイスが見つかりません');
        return null;
    }

    // WAN接続の自動IP割り当てチェック
    checkAndAssignWANIP(connection) {
        const fromDevice = connection.from.device;
        const toDevice = connection.to.device;
        const fromPort = connection.from.port;
        const toPort = connection.to.port;
        
        // インターネット接続の自動IP割り当てをチェック（ルーターのWANポートまたはPCの直接接続）
        let targetDevice = null;
        let internet = null;
        let isWANConnection = false;
        
        // ルーターのWANポート接続をチェック（直接 or ONU経由）
        if (fromDevice.type === 'router' && fromPort.id === 'wan') {
            if (toDevice.type === 'internet') {
                // 直接接続
                targetDevice = fromDevice;
                internet = toDevice;
                isWANConnection = true;
            } else if (toDevice.type === 'onu') {
                // ONU経由接続: ONUの向こう側のインターネットを探す
                console.log('ONU経由接続検出:', fromDevice.name, '→', toDevice.name);
                const internetDevice = this.findConnectedInternet(toDevice);
                console.log('ONUの向こう側のインターネット:', internetDevice ? internetDevice.name : 'なし');
                if (internetDevice) {
                    targetDevice = fromDevice;
                    internet = internetDevice;
                    isWANConnection = true;
                    console.log('ONU経由WAN接続設定完了:', targetDevice.name, '→', internet.name);
                }
            }
        } else if (toDevice.type === 'router' && toPort.id === 'wan') {
            if (fromDevice.type === 'internet') {
                // 直接接続
                targetDevice = toDevice;
                internet = fromDevice;
                isWANConnection = true;
            } else if (fromDevice.type === 'onu') {
                // ONU経由接続: ONUの向こう側のインターネットを探す
                console.log('ONU経由接続検出（逆向き）:', fromDevice.name, '→', toDevice.name);
                const internetDevice = this.findConnectedInternet(fromDevice);
                console.log('ONUの向こう側のインターネット（逆向き）:', internetDevice ? internetDevice.name : 'なし');
                if (internetDevice) {
                    targetDevice = toDevice;
                    internet = internetDevice;
                    isWANConnection = true;
                    console.log('ONU経由WAN接続設定完了（逆向き）:', targetDevice.name, '→', internet.name);
                }
            }
        }
        // PCの直接接続をチェック
        else if (fromDevice.type === 'pc' && toDevice.type === 'internet') {
            targetDevice = fromDevice;
            internet = toDevice;
            isWANConnection = false;
        } else if (toDevice.type === 'pc' && fromDevice.type === 'internet') {
            targetDevice = toDevice;
            internet = fromDevice;
            isWANConnection = false;
        }
        // サーバーの直接接続もサポート
        else if (fromDevice.type === 'server' && toDevice.type === 'internet') {
            targetDevice = fromDevice;
            internet = toDevice;
            isWANConnection = false;
        } else if (toDevice.type === 'server' && fromDevice.type === 'internet') {
            targetDevice = toDevice;
            internet = fromDevice;
            isWANConnection = false;
        }
        // サーバーのONU経由接続もサポート
        else if (fromDevice.type === 'server' && toDevice.type === 'onu') {
            // ONU経由接続: ONUの向こう側のインターネットを探す
            console.log('サーバー→ONU経由接続検出:', fromDevice.name, '→', toDevice.name);
            const internetDevice = this.findConnectedInternet(toDevice);
            console.log('ONUの向こう側のインターネット（サーバー→ONU）:', internetDevice ? internetDevice.name : 'なし');
            if (internetDevice) {
                targetDevice = fromDevice;
                internet = internetDevice;
                isWANConnection = false;
                console.log('ONU経由サーバー接続設定完了:', targetDevice.name, '→', internet.name);
            }
        } else if (toDevice.type === 'server' && fromDevice.type === 'onu') {
            // ONU経由接続: ONUの向こう側のインターネットを探す
            console.log('ONU→サーバー経由接続検出:', fromDevice.name, '→', toDevice.name);
            const internetDevice = this.findConnectedInternet(fromDevice);
            console.log('ONUの向こう側のインターネット（ONU→サーバー）:', internetDevice ? internetDevice.name : 'なし');
            if (internetDevice) {
                targetDevice = toDevice;
                internet = internetDevice;
                isWANConnection = false;
                console.log('ONU経由サーバー接続設定完了（逆向き）:', targetDevice.name, '→', internet.name);
            }
        }
        // DNSサーバーの直接接続もサポート
        else if (fromDevice.type === 'dns' && toDevice.type === 'internet') {
            targetDevice = fromDevice;
            internet = toDevice;
            isWANConnection = false;
        } else if (toDevice.type === 'dns' && fromDevice.type === 'internet') {
            targetDevice = toDevice;
            internet = fromDevice;
            isWANConnection = false;
        }
        // DNSサーバーのONU経由接続もサポート
        else if (fromDevice.type === 'dns' && toDevice.type === 'onu') {
            // ONU経由接続: ONUの向こう側のインターネットを探す
            console.log('DNSサーバー→ONU経由接続検出:', fromDevice.name, '→', toDevice.name);
            const internetDevice = this.findConnectedInternet(toDevice);
            console.log('ONUの向こう側のインターネット（DNS→ONU）:', internetDevice ? internetDevice.name : 'なし');
            if (internetDevice) {
                targetDevice = fromDevice;
                internet = internetDevice;
                isWANConnection = false;
                console.log('ONU経由DNSサーバー接続設定完了:', targetDevice.name, '→', internet.name);
            }
        } else if (toDevice.type === 'dns' && fromDevice.type === 'onu') {
            // ONU経由接続: ONUの向こう側のインターネットを探す
            console.log('ONU→DNSサーバー経由接続検出:', fromDevice.name, '→', toDevice.name);
            const internetDevice = this.findConnectedInternet(fromDevice);
            console.log('ONUの向こう側のインターネット（ONU→DNS）:', internetDevice ? internetDevice.name : 'なし');
            if (internetDevice) {
                targetDevice = toDevice;
                internet = internetDevice;
                isWANConnection = false;
                console.log('ONU経由DNSサーバー接続設定完了（逆向き）:', targetDevice.name, '→', internet.name);
            }
        }
        
        // デバッグ: 接続検出結果を表示
        console.log('🔍 接続検出結果:', {
            fromDevice: fromDevice.name,
            toDevice: toDevice.name,
            fromType: fromDevice.type,
            toType: toDevice.type,
            targetDevice: targetDevice ? targetDevice.name : 'なし',
            internet: internet ? internet.name : 'なし',
            isWANConnection
        });
        
        if (targetDevice && internet) {
            // グローバルIPアドレスを自動割り当て
            const dhcpEnabled = isWANConnection ? 
                (targetDevice.wanConfig && targetDevice.wanConfig.dhcpEnabled) : 
                targetDevice.config.dhcpEnabled;
            console.log('🔍 インターネット接続検出:', targetDevice.name, 'DHCP:', dhcpEnabled, 'isWAN:', isWANConnection);
            console.log('🔍 WAN設定確認:', targetDevice.wanConfig);

            // ISPポート判定（直接接続 vs ONU経由で判定方法を切り替え）
            let connectedISP = null;

            // ONU経由接続かどうかを判定
            const isViaONU = this.isConnectionViaONU(targetDevice, internet);
            if (isViaONU) {
                // ONU経由の場合、ONUデバイスを探してISP判定
                const onuDevice = this.findONUBetween(targetDevice, internet);
                if (onuDevice) {
                    connectedISP = this.detectONUInternetISP(onuDevice, internet);
                    console.log('🔍 ONU経由ISPポート判定:', connectedISP, 'ONU:', onuDevice.name);
                } else {
                    connectedISP = 'isp1'; // フォールバック
                    console.log('🔍 ONUデバイスが見つからず、デフォルトISP1を使用');
                }
            } else {
                // 直接接続の場合
                connectedISP = this.detectConnectedISP(targetDevice, internet);
                console.log('🔍 直接接続ISPポート判定:', connectedISP);
            }

            const globalIP = this.assignGlobalIP(targetDevice, internet, connectedISP);
            console.log('🔍 割り当てられたグローバルIP:', globalIP);
            
            if (globalIP) {
                if (isWANConnection) {
                    // ルーターのWAN設定を更新
                    if (!targetDevice.wanConfig) {
                        targetDevice.wanConfig = {};
                    }
                    
                    // 利用可能なグローバルIPを保存
                    targetDevice.wanConfig.availableGlobalIP = globalIP;
                    targetDevice.wanConfig.isConnected = true;
                    targetDevice.wanConfig.internetDevice = internet;
                    
                    // WAN DHCPが有効な場合のみIPアドレスを自動変更
                    if (dhcpEnabled) {
                        targetDevice.wanConfig.ipAddress = globalIP.ip;
                        targetDevice.wanConfig.subnetMask = '255.255.255.0';
                        targetDevice.wanConfig.defaultGateway = globalIP.gateway;
                        targetDevice.wanConfig.dnsServers = ['8.8.8.8', '8.8.4.4'];
                        
                        console.log('WAN設定完了:', targetDevice.name, 'IP:', targetDevice.wanConfig.ipAddress);
                        this.updateStatus(`🌐 ${targetDevice.name} のWANがDHCPでグローバルIP ${globalIP.ip} を取得しました`);
                    } else {
                        this.updateStatus(`🌐 ${targetDevice.name} のWANがインターネットに接続されました（DHCP無効）`);
                    }
                } else {
                    // PC/サーバーの直接接続設定を更新
                    // インターネット接続情報を記録（IPは条件に応じて変更）
                    targetDevice.config.isInternetConnected = true;
                    targetDevice.config.internetDevice = internet;
                    targetDevice.config.availableGlobalIP = globalIP; // 利用可能なグローバルIPを保存
                    
                    // DHCPが有効な場合のみIPアドレスを自動変更
                    if (targetDevice.config.dhcpEnabled) {
                        targetDevice.config.ipAddress = globalIP.ip;
                        targetDevice.config.subnetMask = '255.255.255.0';
                        targetDevice.config.defaultGateway = globalIP.gateway;
                        targetDevice.config.dnsServers = ['8.8.8.8', '8.8.4.4'];
                        
                        // lan1.ipAddress も同期して更新
                        if (targetDevice.config.lan1) {
                            targetDevice.config.lan1.ipAddress = globalIP.ip;
                        }
                        
                        this.updateStatus(`🌐 ${targetDevice.name} がDHCPでグローバルIP ${globalIP.ip} を取得しました`);
                        console.log('DHCP有効でグローバルIP設定:', targetDevice.name, globalIP.ip);
                    } else {
                        // DHCP無効の場合は既存のIPを維持
                        this.updateStatus(`🌐 ${targetDevice.name} がインターネットに接続されました（固定IP: ${targetDevice.config.ipAddress}）`);
                        console.log('DHCP無効でIP維持:', targetDevice.name, targetDevice.config.ipAddress);
                    }
                }
                
                console.log('インターネット自動設定完了:', targetDevice.name, 'IP:', globalIP.ip, 'Gateway:', globalIP.gateway);
                
                // デバイスの表示を即座に更新（DHCP配信時の描画遅延を防ぐ）
                this.render();
            }
        }
    }

    // ONU → インターネット接続のISPポート判定
    detectONUInternetISP(onuDevice, internetDevice) {
        // ONU → インターネット間の接続を検索
        for (const connection of this.connections) {
            let internetPort = null;

            if (connection.from.device === onuDevice && connection.to.device === internetDevice) {
                internetPort = connection.to.port?.id; // インターネット側のポートID
            } else if (connection.to.device === onuDevice && connection.from.device === internetDevice) {
                internetPort = connection.from.port?.id; // インターネット側のポートID
            }

            if (internetPort) {
                console.log(`🔍 ONU-インターネット接続検出: ${onuDevice.name} -> ${internetDevice.name} (${internetPort})`);
                return internetPort; // isp1, isp2, ... として返される
            }
        }

        console.log(`🔍 ONU-インターネット接続が見つからず、デフォルトISP1を使用`);
        return 'isp1'; // デフォルト
    }

    // 直接接続時のISPポート判定
    detectConnectedISP(clientDevice, internetDevice) {
        // デバイス間の接続を検索
        for (const connection of this.connections) {
            let internetPort = null;

            // クライアント → インターネット接続をチェック
            if (connection.from.device === clientDevice && connection.to.device === internetDevice) {
                internetPort = connection.to.port?.id; // インターネット側のポートID
            } else if (connection.to.device === clientDevice && connection.from.device === internetDevice) {
                internetPort = connection.from.port?.id; // インターネット側のポートID
            }

            if (internetPort) {
                console.log(`🔍 直接接続検出: ${clientDevice.name} -> ${internetDevice.name} (${internetPort})`);
                return internetPort; // isp1, isp2, ... として返される
            }
        }

        console.log(`🔍 直接接続が見つからず、デフォルトISP1を使用`);
        return 'isp1'; // デフォルト
    }

    // ONU経由の接続かどうかを判定
    isConnectionViaONU(targetDevice, internetDevice) {
        // targetDevice → ONU → internetDevice のパスが存在するかチェック
        for (const connection of this.connections) {
            // targetDevice → ONU 接続をチェック
            if ((connection.from.device === targetDevice && connection.to.device.type === 'onu') ||
                (connection.to.device === targetDevice && connection.from.device.type === 'onu')) {

                const onuDevice = connection.from.device === targetDevice ?
                    connection.to.device : connection.from.device;

                // ONU → internetDevice 接続をチェック
                for (const onuConnection of this.connections) {
                    if ((onuConnection.from.device === onuDevice && onuConnection.to.device === internetDevice) ||
                        (onuConnection.to.device === onuDevice && onuConnection.from.device === internetDevice)) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // targetDeviceとinternetDeviceの間にあるONUデバイスを見つける
    findONUBetween(targetDevice, internetDevice) {
        for (const connection of this.connections) {
            // targetDevice → ONU 接続をチェック
            if ((connection.from.device === targetDevice && connection.to.device.type === 'onu') ||
                (connection.to.device === targetDevice && connection.from.device.type === 'onu')) {

                const onuDevice = connection.from.device === targetDevice ?
                    connection.to.device : connection.from.device;

                // ONU → internetDevice 接続をチェック
                for (const onuConnection of this.connections) {
                    if ((onuConnection.from.device === onuDevice && onuConnection.to.device === internetDevice) ||
                        (onuConnection.to.device === onuDevice && onuConnection.from.device === internetDevice)) {
                        return onuDevice;
                    }
                }
            }
        }
        return null;
    }

    // グローバルIP割り当て（ISP別対応）
    assignGlobalIP(device, internet, preferredISP = null) {
        // インターネットデバイスのtype確認と新しいISP設定がある場合は新しい方式
        if (internet.type === 'internet' && internet.config && internet.config.isp1) {
            return this.assignGlobalIPFromISP(device, internet, preferredISP);
        }

        // 従来のグローバルIPプール方式（後方互換性）
        if (!internet.globalIPPool) {
            // グローバルIPプールを初期化（テスト用IP範囲を使用）
            internet.globalIPPool = {
                network: '203.0.113.0',
                startIP: 10,
                endIP: 250,
                assignedIPs: new Set(),
                gateway: '203.0.113.1'
            };
        }

        const pool = internet.globalIPPool;

        // 利用可能なIPアドレスを検索
        for (let i = pool.startIP; i <= pool.endIP; i++) {
            const candidateIP = `203.0.113.${i}`;
            if (!pool.assignedIPs.has(candidateIP)) {
                pool.assignedIPs.add(candidateIP);
                return {
                    ip: candidateIP,
                    gateway: pool.gateway,
                    network: pool.network,
                    isp: 'default'
                };
            }
        }

        console.warn('グローバルIPプールが枯渇しました');
        return null;
    }

    // ISP別グローバルIP割り当て
    assignGlobalIPFromISP(device, internet, preferredISP = null) {
        const config = internet.config;
        const isps = ['isp1', 'isp2', 'isp3', 'isp4', 'isp5', 'isp6'];

        console.log(`🔍 ISP別IP割り当て開始: ${device.name} <- ${internet.name}`);
        console.log(`🔍 利用可能なISP:`, isps.map(id => `${id}(${config[id]?.dhcpEnabled ? 'ON' : 'OFF'})`).join(', '));

        // ISPポートは物理的な回線（ONUの接続先）に相当するため、
        // 接続先のISPが判明している場合はそのISPのみを対象とする。
        // 無関係な他のISPがDHCP有効というだけでIPを配布してしまうと、
        // 実際にはケーブルが繋がっていないISPからIPが漏れ出すことになるため、
        // ここではフォールバック（他ISPへの取得試行）を行わない。
        let searchOrder;
        if (preferredISP && isps.includes(preferredISP)) {
            searchOrder = [preferredISP];
        } else {
            searchOrder = isps.slice();
        }

        // ISP別にIP割り当てを試行
        for (const ispId of searchOrder) {
            const isp = config[ispId];
            if (!isp || !isp.dhcpEnabled) continue;

            // IPアドレス範囲をパース
            const startOctets = isp.dhcpPoolStart.split('.');
            const endOctets = isp.dhcpPoolEnd.split('.');
            const startLastOctet = parseInt(startOctets[3]);
            const endLastOctet = parseInt(endOctets[3]);
            const networkBase = startOctets.slice(0, 3).join('.');

            // dhcpAllocatedIPsがMapでない場合は新しいMapを作成
            if (!(isp.dhcpAllocatedIPs instanceof Map)) {
                console.log(`⚠️  ${ispId}のdhcpAllocatedIPsをMapに変換中...`);
                isp.dhcpAllocatedIPs = new Map();
            }

            // 利用可能なIPアドレスを検索
            for (let i = startLastOctet; i <= endLastOctet; i++) {
                const candidateIP = `${networkBase}.${i}`;
                if (!isp.dhcpAllocatedIPs.has(candidateIP)) {
                    isp.dhcpAllocatedIPs.set(candidateIP, {
                        deviceId: device.id,
                        deviceName: device.name,
                        assignedAt: new Date().toISOString(),
                        leaseTime: config.dhcpLeaseTime
                    });

                    console.log(`✅ ${ispId.toUpperCase()}からグローバルIP割り当て:`, candidateIP, 'to', device.name);
                    return {
                        ip: candidateIP,
                        gateway: isp.gateway,
                        network: isp.network,
                        subnetMask: isp.subnetMask,
                        isp: ispId,
                        ispName: isp.name
                    };
                }
            }
        }

        console.warn('全ISPのグローバルIPプールが枯渇しました');
        return null;
    }

    // インターネット接続デバイスのDHCP状態変更処理
    handleInternetDHCPChange(device, wasUsingDHCP, nowUsingDHCP) {
        const availableGlobalIP = device.config.availableGlobalIP;
        
        if (!availableGlobalIP) {
            console.warn('利用可能なグローバルIPが見つかりません:', device.name);
            return;
        }
        
        if (!wasUsingDHCP && nowUsingDHCP) {
            // 固定IP → DHCP: グローバルIPを自動取得
            device.config.ipAddress = availableGlobalIP.ip;
            device.config.subnetMask = '255.255.255.0';
            device.config.defaultGateway = availableGlobalIP.gateway;
            device.config.dnsServers = ['8.8.8.8', '8.8.4.4'];
            
            // lan1.ipAddress も同期して更新
            if (device.config.lan1) {
                device.config.lan1.ipAddress = availableGlobalIP.ip;
            }
            
            this.updateStatus(`🌐 ${device.name} がDHCPでグローバルIP ${availableGlobalIP.ip} を取得しました`);
            console.log('DHCP有効化によるグローバルIP自動取得:', device.name, availableGlobalIP.ip);
            
        } else if (wasUsingDHCP && !nowUsingDHCP) {
            // DHCP → 固定IP: 手動設定に戻る（UIから入力された値を使用）
            // IPアドレスは既にsaveDeviceConfigで設定済み
            this.updateStatus(`🌐 ${device.name} が固定IPに変更されました（${device.config.ipAddress}）`);
            console.log('DHCP無効化による固定IP設定:', device.name, device.config.ipAddress);
        }
        
        // 画面更新
        this.scheduleRender();
    }

    // 指定座標のNICポートを取得
    getPortAt(x, y) {
        const tolerance = 15; // ポートのクリック許容範囲
        
        // Z-index順（最前面から背面）でデバイスを取得
        const sortedDevices = Array.from(this.devices.values())
            .sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0));
        
        // tolerance内の全ポートを収集
        const portsWithinTolerance = [];
        
        for (const device of sortedDevices) {
            const ports = device.ports;
            if (!ports || !ports.nics) continue;
            
            // NICポートをチェック
            for (const port of ports.nics) {
                const portX = device.x + port.x * device.width;
                const portY = device.y + port.y * device.height;
                const distance = Math.sqrt((x - portX) ** 2 + (y - portY) ** 2);
                
                if (distance <= tolerance) {
                    portsWithinTolerance.push({
                        device, port, type: 'nic',
                        portX, portY, distance
                    });
                }
            }
        }
        
        if (portsWithinTolerance.length === 0) {
            return null;
        }
        
        // 複数のポートが範囲内にある場合の選択ロジック
        if (portsWithinTolerance.length > 1) {
            // 1. 最前面のデバイスのポートを優先
            const maxZIndex = Math.max(...portsWithinTolerance.map(p => p.device.zIndex || 0));
            const topMostPorts = portsWithinTolerance.filter(p => (p.device.zIndex || 0) === maxZIndex);
            
            // 2. 距離で選択
            const bestPort = topMostPorts.reduce((best, current) =>
                current.distance < best.distance ? current : best
            );
            
            return { device: bestPort.device, port: bestPort.port, type: bestPort.type };
        }
        
        const foundPort = portsWithinTolerance[0];
        return { device: foundPort.device, port: foundPort.port, type: foundPort.type };
    }


    // すべてクリア
    clearAll() {
        this.devices.clear();
        this.connections = [];
        this.selectedDevice = null;
        this.selectedConnection = null;
        this.connectionStart = null;
        this.nextZIndex = 1;
        
        this.updateControlButtons();
        this.updateStatus('すべてクリアしました');
        this.scheduleRender();
    }

    // DHCP実行（選択したデバイスのIP取得またはDHCP選択モード）
    startDHCP() {
        if (this.devices.size === 0) {
            this.updateStatus('DHCPを実行するにはデバイスを配置してください');
            return;
        }

        // もし既にデバイスが選択されている場合、そのデバイスに対して即座にDHCP実行
        if (this.selectedDevice) {
            this.executeDHCPForDevice(this.selectedDevice);
            return;
        }

        if (!this.isDHCPMode) {
            // 他のモードを終了
            if (this.isPingMode) this.exitPingMode();
            if (this.isHTTPMode && typeof this.exitHTTPMode === 'function') this.exitHTTPMode();

            this.isDHCPMode = true;
            this.updateStatus('🔄 DHCPでIPアドレスを取得・更新したい機器をクリックしてください');
            this.updateControlButtons();
            this.render();
        } else {
            this.exitDHCPMode();
        }
    }

    // DHCPモード終了
    exitDHCPMode() {
        this.isDHCPMode = false;
        this.updateStatus('DHCPモードを終了しました');
        this.updateControlButtons();
        this.render();
    }

    // デバイス選択時のDHCP処理
    executeDHCPForDevice(device) {
        if (!device) return;

        let statusMsg = '';
        if (device.type === 'router') {
            // ルーターの場合は配下の全クライアントを再配布
            this.redistributeDHCPAddresses(device);
            statusMsg = `🔄 ${device.name} 配下のデバイスにDHCPアドレスを再配布しました`;
        } else if (device.type === 'switch' || device.type === 'onu') {
            statusMsg = `⚠️ ${device.name} はL2機器のためIPアドレスを持ちません`;
        } else {
            // PC、サーバー、DNS等の端末
            device.config.dhcpEnabled = true;
            const success = this.requestDHCPAddress(device);
            if (success) {
                statusMsg = `✅ ${device.name} のIPアドレスをDHCPで更新しました (${device.config.ipAddress})`;
            } else {
                statusMsg = `❌ ${device.name} はDHCPサーバー（ルーター）に接続されていないか、プールに空きがありません`;
            }
        }

        // 1個選択したら即座にDHCPモードを終了
        if (this.isDHCPMode) {
            this.isDHCPMode = false;
            this.updateControlButtons();
        }

        this.updateStatus(statusMsg);
        this.render();
    }

    // Ping実行（新しい視覚的インターフェース）
    startPing() {
        if (this.devices.size < 2) {
            this.updateStatus('Pingには少なくとも2台のデバイスが必要です');
            return;
        }
        
        if (!this.isPingMode) {
            // Pingモード開始
            this.isPingMode = true;
            this.pingSourceDevice = null;
            this.pingTargetDevice = null;
            this.selectedDevice = null; // 選択をリセット
            this.updateStatus('🎯 Ping送信元のデバイスをクリックしてください');
            this.updateControlButtons();
            // rAFのスロットルを待たず即座に再描画し、直前の設定変更が
            // 確実に画面へ反映された状態でPingモードに入るようにする
            this.render();
        } else {
            // Pingモード終了
            this.exitPingMode();
        }
    }
    
    // Pingモード終了
    exitPingMode() {
        this.isPingMode = false;
        this.pingSourceDevice = null;
        this.pingTargetDevice = null;
        this.updateStatus('Pingモードを終了しました');
        this.updateControlButtons();
        // rAFのスロットルを待たず即座に再描画する
        this.render();
    }
    
    // Pingを実行
    async executePing() {
        console.log('executePing called with:', this.pingSourceDevice?.name, this.pingTargetDevice?.name);
        
        if (!this.pingSourceDevice || !this.pingTargetDevice) {
            console.log('Missing ping devices, returning early');
            return;
        }
        
        // 同じデバイス間のPingチェック
        if (this.pingSourceDevice === this.pingTargetDevice) {
            await this.showPingError('同一デバイス内でのPingは実行できません。', this.pingSourceDevice, this.pingTargetDevice);
            return;
        }
        
        // 同じIPアドレス間のPingチェック
        if (this.pingSourceDevice.config.ipAddress === this.pingTargetDevice.config.ipAddress) {
            await this.showPingError(`同じIPアドレス (${this.pingSourceDevice.config.ipAddress}) を持つデバイス間でのPingは実行できません。\nIPアドレスの重複を解決してください。`, this.pingSourceDevice, this.pingTargetDevice);
            return;
        }
        
        // ネットワークループチェック
        if (this.hasNetworkLoop()) {
            const loops = this.detectNetworkLoops();
            const errorMessage = this.formatNetworkLoopErrorMessage(loops);
            await this.showPingError(errorMessage, this.pingSourceDevice, this.pingTargetDevice);
            return;
        }

        // ルーター複数NIC同一スイッチ接続チェック
        console.log('🔍 ルーター複数NIC接続チェック開始');
        const multiNICIssues = this.detectRouterMultiNICToSameSwitch();
        console.log('🔍 検出された問題:', multiNICIssues);

        if (this.hasRouterMultiNICToSameSwitch()) {
            console.log('⚠️ ルーター複数NIC問題が検出されました');
            const errorMessage = this.formatRouterMultiNICErrorMessage(multiNICIssues);
            console.log('📝 エラーメッセージ:', errorMessage);
            await this.showPingError(errorMessage, this.pingSourceDevice, this.pingTargetDevice);
            return;
        } else {
            console.log('✅ ルーター複数NIC問題は検出されませんでした');
        }
        
        // ネットワーク到達性チェック
        const reachabilityResult = this.checkNetworkReachability(this.pingSourceDevice, this.pingTargetDevice);
        if (!reachabilityResult.isReachable) {
            await this.showPingError(reachabilityResult.reason, this.pingSourceDevice, this.pingTargetDevice);
            return;
        }
        
        // 物理的な接続経路をチェック
        console.log('Finding path from', this.pingSourceDevice.name, 'to', this.pingTargetDevice.name);
        const path = this.findPath(this.pingSourceDevice, this.pingTargetDevice);
        console.log('Found path:', path.map(device => device.name));
        
        if (path.length === 0) {
            console.log('No path found between devices');
            await this.showPingError('デバイス間に物理接続経路がありません', this.pingSourceDevice, this.pingTargetDevice);
            return;
        }
        
        this.updateStatus(`🚀 Ping送信中: ${this.pingSourceDevice.name}(${this.pingSourceDevice.config.ipAddress}) → ${this.pingTargetDevice.name}(${this.pingTargetDevice.config.ipAddress})`);
        
        // Pingパケットアニメーション
        await this.animatePingWithPath(this.pingSourceDevice, this.pingTargetDevice, path);
        
        // Pingモードを継続（再度選択可能）
        this.pingSourceDevice = null;
        this.pingTargetDevice = null;
        this.updateStatus('🎯 Ping送信元のデバイスをクリックしてください');
        this.scheduleRender();
    }

    // ネットワーク到達性チェック
    checkNetworkReachability(sourceDevice, targetDevice) {
        const sourceIP = sourceDevice.config.ipAddress;
        const sourceSubnet = sourceDevice.config.subnetMask;
        const sourceGateway = sourceDevice.config.defaultGateway;
        
        const targetIP = targetDevice.config.ipAddress;
        const targetSubnet = targetDevice.config.subnetMask;
        const targetGateway = targetDevice.config.defaultGateway;
        
        // IPアドレスの有効性チェック
        if (!this.isValidIP(sourceIP) || !this.isValidIP(targetIP)) {
            return { isReachable: false, reason: '無効なIPアドレスが設定されています' };
        }
        
        if (!this.isValidIP(sourceSubnet) || !this.isValidIP(targetSubnet)) {
            return { isReachable: false, reason: '無効なサブネットマスクが設定されています' };
        }
        
        // 両方向での直接通信可能性をチェック（物理セグメント分離も考慮）
        if (this.canCommunicateDirectly(sourceDevice, targetDevice)) {
            // 両方向で同一サブネット内かつ物理的に同一セグメント内なら直接通信可能
            return {
                isReachable: true,
                reason: '同一サブネット内での直接通信',
                routingType: 'direct'
            };
        }
        
        // ターゲットがルーターの場合、特定のNICの物理接続をチェック
        if (targetDevice.type === 'router') {
            const targetNICStatus = this.checkRouterNICPhysicalConnection(targetDevice, targetIP);
            if (!targetNICStatus.isConnected) {
                return {
                    isReachable: false,
                    reason: targetNICStatus.reason
                };
            }
        }

        // 異なるサブネット間では、ルーターが必要
        // 詳細なサブネット不一致理由を取得
        const subnetMismatchReason = this.getSubnetMismatchReason(sourceIP, sourceSubnet, targetIP, targetSubnet);

        // 経路上にルーターがあるかチェック
        const path = this.findPath(sourceDevice, targetDevice);
        const hasRouter = path.some(device => device.type === 'router');
        
        if (!hasRouter) {
            return { 
                isReachable: false, 
                reason: `${subnetMismatchReason}のためルーターが必要です`
            };
        }
        
        // ゲートウェイ設定チェック
        if (!this.isValidIP(sourceGateway)) {
            return { 
                isReachable: false, 
                reason: `送信元 ${sourceDevice.name} のデフォルトゲートウェイが無効です: ${sourceGateway || '未設定'}`
            };
        }
        
        // ゲートウェイがルーターの範囲内にあるかチェック（物理ポート一致検証）
        const gatewayReachable = this.isGatewayReachable(sourceDevice, path);
        if (!gatewayReachable.isReachable) {
            return { 
                isReachable: false, 
                reason: gatewayReachable.reason
            };
        }

        // 送信先デバイス（ターゲット）がルーターでない場合、応答パケット（Reply）用のゲートウェイを検証
        if (targetDevice.type !== 'router') {
            const targetPath = [...path].reverse();
            const targetGatewayReachable = this.isGatewayReachable(targetDevice, targetPath);
            if (!targetGatewayReachable.isReachable) {
                return {
                    isReachable: false,
                    reason: `[応答側] ${targetGatewayReachable.reason}`
                };
            }
        }
        
        // ルーター経由の場合は成功
        const sourceNetwork = this.getNetworkAddress(sourceIP, sourceSubnet);
        const targetNetwork = this.getNetworkAddress(targetIP, targetSubnet);
        return { 
            isReachable: true, 
            reason: `ルーター経由での通信 (${sourceNetwork} → ${targetNetwork})`,
            routingType: 'routed'
        };
    }

    // ルーターの特定NICの物理接続状態をチェック
    checkRouterNICPhysicalConnection(router, targetIP) {
        // どのNICに対するアクセスかを判定
        const nicInfo = this.identifyRouterNIC(router, targetIP);

        if (!nicInfo.isValid) {
            return {
                isConnected: false,
                reason: `IPアドレス ${targetIP} はルーターのどのNICにも対応していません`
            };
        }

        // 該当NICが物理的に接続されているかチェック
        const isPhysicallyConnected = this.isRouterNICPhysicallyConnected(router, nicInfo.nicType);

        if (!isPhysicallyConnected) {
            return {
                isConnected: false,
                reason: `ルーターの${nicInfo.nicType}は物理的に接続されていません（ケーブル未接続）`
            };
        }

        return {
            isConnected: true,
            reason: `ルーターの${nicInfo.nicType}は物理的に接続されています`
        };
    }

    // ルーターのNIC種別を特定（IPアドレスから判定）
    identifyRouterNIC(router, targetIP) {
        const config = router.config;

        // LAN1のIPアドレスチェック
        if (config.lan1 && config.lan1.ipAddress === targetIP) {
            return {
                isValid: true,
                nicType: 'LAN1',
                nicConfig: config.lan1
            };
        }

        // LAN2のIPアドレスチェック
        if (config.lan2 && config.lan2.ipAddress === targetIP) {
            return {
                isValid: true,
                nicType: 'LAN2',
                nicConfig: config.lan2
            };
        }

        // LAN3のIPアドレスチェック
        if (config.lan3 && config.lan3.ipAddress === targetIP) {
            return {
                isValid: true,
                nicType: 'LAN3',
                nicConfig: config.lan3
            };
        }

        // WANのIPアドレスチェック
        if (config.ipAddress === targetIP) {
            return {
                isValid: true,
                nicType: 'WAN',
                nicConfig: config
            };
        }

        return {
            isValid: false,
            nicType: null,
            nicConfig: null
        };
    }

    // ルーターの特定NICが物理的に接続されているかチェック
    isRouterNICPhysicallyConnected(router, nicType) {
        const connectedDevices = this.getConnectedDevices(router);

        if (connectedDevices.length === 0) {
            // 何も接続されていない
            return false;
        }

        // WAN接続の場合
        if (nicType === 'WAN') {
            return router.wanConfig && router.wanConfig.isConnected;
        }

        // LAN接続の場合は、接続された機器の数と位置から判定
        // 実際の物理接続ポートを確認する
        for (const connectedDevice of connectedDevices) {
            const connection = this.findDirectConnection(router, connectedDevice);
            if (connection) {
                // ポート番号からNIC種別を判定
                const routerPortIndex = this.getRouterPortIndex(router, connection);
                const portNICType = this.mapPortToNICType(routerPortIndex);

                if (portNICType === nicType) {
                    return true;
                }
            }
        }

        return false;
    }

    // 接続からルーターのポートインデックスを取得
    getRouterPortIndex(router, connection) {
        // 接続形式に応じて処理
        if (connection.from && connection.to) {
            // 新しい形式
            if (connection.from.device === router) {
                return connection.from.port || 0;
            } else if (connection.to.device === router) {
                return connection.to.port || 0;
            }
        } else {
            // 古い形式の場合は推定
            if (connection.fromDevice === router.id) {
                return connection.fromPort || 0;
            } else if (connection.toDevice === router.id) {
                return connection.toPort || 0;
            }
        }
        return 0;
    }

    // ポート番号をNIC種別にマッピング
    mapPortToNICType(portIndex) {
        // ポート0-1: LAN1, ポート2: LAN2, ポート3-5: LAN3
        if (portIndex <= 1) {
            return 'LAN1';
        } else if (portIndex === 2) {
            return 'LAN2';
        } else if (portIndex >= 3) {
            return 'LAN3';
        }
        return 'LAN1'; // デフォルト
    }

    // ネットワークループエラーメッセージをフォーマット
    formatNetworkLoopErrorMessage(loops) {
        if (loops.length === 0) {
            return 'ネットワークにループが検出されましたが、詳細を取得できませんでした。';
        }

        let message = '🔄 ネットワークループエラー：\n\n';

        let selfLoopCount = 0;
        let redundantLoopCount = 0;

        for (let i = 0; i < loops.length; i++) {
            const loop = loops[i];

            if (loop.type === 'self-loop') {
                selfLoopCount++;
                message += `🚨 自己ループ: 「${loop.device.name}」(${loop.device.type})の異なるポート間が接続されています\n`;
                message += `   → ポート ${loop.fromPort?.port || '不明'} と ポート ${loop.toPort?.port || '不明'} が同一デバイス内で接続されています\n`;
                message += `   → これは**ブロードキャストストーム**を引き起こし、ネットワーク全体が停止する可能性があります！\n`;
            } else if (loop.type === 'switch-redundant') {
                redundantLoopCount++;
                message += `🔗 冗長接続: 「${loop.device1.name}」と「${loop.device2.name}」の間に${loop.connectionCount}本の接続があります\n`;
                message += `   → これはSTP(Spanning Tree Protocol)なしでは**ブロードキャストループ**を引き起こします\n`;
            }

            if (i < loops.length - 1) {
                message += '\n';
            }
        }

        message += '\n🔥 **ループの危険性**：\n';
        if (selfLoopCount > 0) {
            message += '   • **自己ループ**: パケットが同じデバイス内で無限に循環し、即座にネットワークが麻痺します\n';
        }
        if (redundantLoopCount > 0) {
            message += '   • **冗長接続**: ブロードキャストフレームが無限に循環し、ネットワーク帯域を消費します\n';
        }

        message += '\n💡 **修正方法**：\n';
        message += '   • 同一デバイスの異なるポート間のケーブルを削除してください\n';
        message += '   • スイッチ間の余分なケーブルを削除してください\n';
        message += '   • 実際のネットワークではSTPやRSTPでループを防止しますが、このシミュレータでは物理的に削除が必要です';

        return message;
    }

    // 短縮版ネットワークループエラーメッセージをフォーマット（status用）
    formatShortNetworkLoopError(loops) {
        if (loops.length === 0) {
            return 'ネットワークにループが検出されました';
        }

        let selfLoops = loops.filter(loop => loop.type === 'self-loop');
        let redundantLoops = loops.filter(loop => loop.type === 'switch-redundant');

        if (selfLoops.length > 0 && redundantLoops.length > 0) {
            return `自己ループ(${selfLoops.length}件)と冗長接続(${redundantLoops.length}件)を検出`;
        } else if (selfLoops.length > 0) {
            const deviceNames = selfLoops.map(loop => loop.device.name).join(', ');
            return `自己ループを検出: ${deviceNames}`;
        } else if (redundantLoops.length > 0) {
            return `冗長接続を検出: スイッチ間の複数ケーブル`;
        }

        return 'ネットワークループを検出';
    }

    // ルーター複数NIC接続エラーメッセージをフォーマット
    formatRouterMultiNICErrorMessage(issues) {
        if (issues.length === 0) {
            return 'ネットワーク構成に問題があります。';
        }

        let message = '❌ ネットワーク構成エラー：\n\n';

        for (let i = 0; i < issues.length; i++) {
            const issue = issues[i];
            // 重複するNICを除去してユニークなNICのみ表示
            const uniqueNICs = [...new Set(issue.connectedNICs)];

            if (uniqueNICs.length > 1) {
                // 複数の異なるNICが接続されている場合
                message += `🔧 ルーター「${issue.router.name}」の複数NIC（${uniqueNICs.join(', ')}）が同一スイッチ「${issue.switch.name}」に接続されています\n`;
            } else {
                // 同じNICに複数接続されている場合
                const nicCount = issue.connectedNICs.length;
                message += `🔧 ルーター「${issue.router.name}」の${uniqueNICs[0]}に${nicCount}本のケーブルが同一スイッチ「${issue.switch.name}」に接続されています\n`;
            }

            message += `   → これは不正な接続です。ルーターの各NICは異なるスイッチまたはデバイスに接続してください。\n`;

            if (i < issues.length - 1) {
                message += '\n';
            }
        }

        message += '\n💡 修正方法：\n';
        message += '   • ルーターの各NIC（LAN1、LAN2、LAN3）は異なるネットワークセグメントに接続する\n';
        message += '   • 同一セグメント内のデバイスは1つのNICにまとめて接続する\n';
        message += '   • 余分なケーブルを削除して正しく配線し直してください';

        return message;
    }

    // 2つのデバイス間の直接接続を検索
    findDirectConnection(device1, device2) {
        for (const connection of this.connections) {
            if (connection.from && connection.to) {
                // 新しい形式
                if ((connection.from.device === device1 && connection.to.device === device2) ||
                    (connection.from.device === device2 && connection.to.device === device1)) {
                    return connection;
                }
            } else {
                // 古い形式
                if ((connection.fromDevice === device1.id && connection.toDevice === device2.id) ||
                    (connection.fromDevice === device2.id && connection.toDevice === device1.id)) {
                    return connection;
                }
            }
        }
        return null;
    }

    // IPアドレスを32ビット整数に変換
    ipToInt(ip) {
        return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
    }
    
    // 32ビット整数をIPアドレスに変換
    intToIp(int) {
        return [(int >>> 24), (int >>> 16) & 255, (int >>> 8) & 255, int & 255].join('.');
    }
    
    // ネットワークアドレスを計算
    getNetworkAddress(ip, subnet) {
        const ipInt = this.ipToInt(ip);
        const subnetInt = this.ipToInt(subnet);
        const networkInt = ipInt & subnetInt;
        return this.intToIp(networkInt);
    }
    
    // ブロードキャストアドレスを計算
    getBroadcastAddress(ip, subnet) {
        const ipInt = this.ipToInt(ip);
        const subnetInt = this.ipToInt(subnet);
        const wildcardInt = ~subnetInt >>> 0;
        const broadcastInt = (ipInt & subnetInt) | wildcardInt;
        return this.intToIp(broadcastInt);
    }

    // ブロードキャストアドレス判定
    isBroadcastAddress(ip, subnet = '255.255.255.0', sourceDevice = null) {
        if (!ip || typeof ip !== 'string') return false;
        const trimmed = ip.trim();

        // 255.255.255.255 はリミテッド・ブロードキャストアドレス
        if (trimmed === '255.255.255.255') return true;

        if (!this.isValidIP(trimmed)) return false;

        // 送信元デバイスが指定されている場合、送信元のサブネットブロードキャストと比較
        if (sourceDevice && sourceDevice.config?.ipAddress && sourceDevice.config?.subnetMask) {
            const devBroadcast = this.getBroadcastAddress(sourceDevice.config.ipAddress, sourceDevice.config.subnetMask);
            if (trimmed === devBroadcast) return true;
        }

        // 指定サブネットマスクに基づいてホスト部オール1をチェック
        if (subnet && this.isValidIP(subnet)) {
            const ipInt = this.ipToInt(trimmed);
            const subnetInt = this.ipToInt(subnet);
            const wildcardInt = ~subnetInt >>> 0;
            if (wildcardInt !== 0 && (ipInt & wildcardInt) === wildcardInt) {
                return true;
            }
        }

        // 登録されている全デバイスのサブネットブロードキャストのいずれかと一致するか
        if (this.devices) {
            for (const dev of this.devices.values()) {
                if (dev.config?.ipAddress && dev.config?.subnetMask) {
                    const bc = this.getBroadcastAddress(dev.config.ipAddress, dev.config.subnetMask);
                    if (trimmed === bc) return true;
                }
                if (dev.type === 'router') {
                    for (const lanKey of ['lan1', 'lan2', 'lan3']) {
                        const lan = dev.config?.[lanKey];
                        if (lan?.ipAddress && lan?.subnetMask) {
                            const bc = this.getBroadcastAddress(lan.ipAddress, lan.subnetMask);
                            if (trimmed === bc) return true;
                        }
                    }
                }
            }
        }

        return false;
    }

    // ネットワークアドレス判定 (ホスト部オール0)
    isNetworkAddress(ip, subnet = '255.255.255.0') {
        if (!ip || typeof ip !== 'string') return false;
        const trimmed = ip.trim();
        if (trimmed === '0.0.0.0') return true;
        if (!this.isValidIP(trimmed)) return false;

        if (subnet && this.isValidIP(subnet)) {
            const ipInt = this.ipToInt(trimmed);
            const subnetInt = this.ipToInt(subnet);
            const wildcardInt = ~subnetInt >>> 0;
            if (wildcardInt !== 0 && (ipInt & wildcardInt) === 0) {
                return true;
            }
        }
        return false;
    }
    
    // 同一サブネット内かチェック（単一サブネットマスク）
    isInSameSubnet(ip1, ip2, subnet) {
        const network1 = this.getNetworkAddress(ip1, subnet);
        const network2 = this.getNetworkAddress(ip2, subnet);
        return network1 === network2;
    }
    
    // 両方向のサブネット判定（物理セグメント分離も考慮）
    canCommunicateDirectly(sourceDevice, targetDevice) {
        const sourceIP = sourceDevice.config.ipAddress;
        const sourceSubnet = sourceDevice.config.subnetMask;
        const targetIP = targetDevice.config.ipAddress;
        const targetSubnet = targetDevice.config.subnetMask;

        // 送信元から見て送信先が同一サブネット内か
        const sourceCanReachTarget = this.isInSameSubnet(sourceIP, targetIP, sourceSubnet);

        // 送信先から見て送信元が同一サブネット内か
        const targetCanReachSource = this.isInSameSubnet(targetIP, sourceIP, targetSubnet);

        // IPレベルで通信不可能な場合は即座にfalse
        if (!sourceCanReachTarget || !targetCanReachSource) {
            return false;
        }

        // IPレベルで通信可能でも、物理的なセグメント分離をチェック
        return this.areInSamePhysicalSegment(sourceDevice, targetDevice);
    }

    // 物理的に同一セグメント内にいるかチェック
    areInSamePhysicalSegment(sourceDevice, targetDevice) {
        // 同じデバイスなら同一セグメント
        if (sourceDevice === targetDevice) {
            return true;
        }

        // 物理経路を取得
        const path = this.findDirectPath(sourceDevice, targetDevice);

        // 物理接続がない場合は異なるセグメント
        if (!path || path.length === 0) {
            console.log(`🚫 物理接続なし: ${sourceDevice.name} と ${targetDevice.name}`);
            return false;
        }

        // 経路上にルーターがある場合は異なるセグメント
        // ルーターは複数のセグメントを分離する境界デバイス
        const hasRouterInPath = path.some((device, index) => {
            // 送信元・送信先以外でルーターがある場合
            return device.type === 'router' && index !== 0 && index !== path.length - 1;
        });

        if (hasRouterInPath) {
            console.log(`🚫 ルーター経由: ${sourceDevice.name} と ${targetDevice.name} は異なるセグメント`);
            console.log(`📍 経路: ${path.map(d => d.name).join(' → ')}`);
            return false;
        }

        // 送信先がルーターの場合、同じルーターの異なるポート間は異なるセグメント
        if (targetDevice.type === 'router') {
            return this.checkSameRouterPortCommunication(sourceDevice, targetDevice);
        }

        // 送信元がルーターの場合も同様
        if (sourceDevice.type === 'router') {
            return this.checkSameRouterPortCommunication(targetDevice, sourceDevice);
        }

        console.log(`✅ 同一セグメント: ${sourceDevice.name} と ${targetDevice.name}`);
        return true;
    }

    // 同じルーターの異なるポート間の通信チェック
    checkSameRouterPortCommunication(clientDevice, routerDevice) {
        // クライアントが接続されているルーターのLAN設定を取得
        const clientLANConfig = this.determineLANConnection(clientDevice, routerDevice);

        console.log(`🔍 ルーター通信チェック: ${clientDevice.name} → ${routerDevice.name}`);
        console.log(`📍 クライアントLAN設定:`, clientLANConfig);

        if (!clientLANConfig) {
            console.log(`🚫 LAN接続を判定できませんでした: ${clientDevice.name} → ${routerDevice.name}`);
            return false;
        }

        // クライアントのIPがLANのサブネット内にあるか確認
        const clientIP = clientDevice.config.ipAddress;
        const lanIP = clientLANConfig.ipAddress;
        const lanSubnet = clientLANConfig.subnetMask;
        const inSameSubnet = this.isInSameSubnet(clientIP, lanIP, lanSubnet);

        console.log(`📍 サブネット確認: ${clientIP} と ${lanIP}/${lanSubnet} → ${inSameSubnet ? '同一' : '異なる'}`);
        if (inSameSubnet) {
            console.log(`✅ 同一LAN内通信: ${clientDevice.name} → ${routerDevice.name}`);
        } else {
            console.log(`🚫 セグメント越え通信: ${clientDevice.name} → ${routerDevice.name}`);
        }
        return inSameSubnet;
    }
    
    // 詳細なサブネット不一致の理由を取得
    getSubnetMismatchReason(sourceIP, sourceSubnet, targetIP, targetSubnet) {
        const sourceNetwork = this.getNetworkAddress(sourceIP, sourceSubnet);
        const targetNetwork = this.getNetworkAddress(targetIP, targetSubnet);
        const sourceCIDR = this.subnetMaskToCIDR(sourceSubnet);
        const targetCIDR = this.subnetMaskToCIDR(targetSubnet);
        
        const sourceCanReachTarget = this.isInSameSubnet(sourceIP, targetIP, sourceSubnet);
        const targetCanReachSource = this.isInSameSubnet(targetIP, sourceIP, targetSubnet);
        
        if (!sourceCanReachTarget && !targetCanReachSource) {
            return `異なるネットワーク (送信元: ${sourceNetwork}/${sourceCIDR}, 送信先: ${targetNetwork}/${targetCIDR})`;
        } else if (!sourceCanReachTarget) {
            return `送信元のサブネットマスク/${sourceCIDR}では送信先に到達できません (${sourceNetwork}/${sourceCIDR} → ${targetIP})`;
        } else if (!targetCanReachSource) {
            return `送信先のサブネットマスク/${targetCIDR}では応答できません (${targetNetwork}/${targetCIDR} ← ${sourceIP})`;
        }
        
        return '不明なサブネット不一致';
    }
    
    // サブネットマスクをCIDR表記に変換（最適化 + キャッシュ）
    subnetMaskToCIDR(subnetMask) {
        // キャッシュされた結果を確認
        if (!this.cidrCache) {
            this.cidrCache = new Map();
            // 一般的なサブネットマスクを事前にキャッシュ
            this.cidrCache.set('255.255.255.0', 24);
            this.cidrCache.set('255.255.0.0', 16);
            this.cidrCache.set('255.0.0.0', 8);
            this.cidrCache.set('255.255.255.128', 25);
            this.cidrCache.set('255.255.255.192', 26);
            this.cidrCache.set('255.255.255.224', 27);
            this.cidrCache.set('255.255.255.240', 28);
            this.cidrCache.set('255.255.255.248', 29);
            this.cidrCache.set('255.255.255.252', 30);
        }

        if (this.cidrCache.has(subnetMask)) {
            return this.cidrCache.get(subnetMask);
        }

        // キャッシュにない場合は計算（最適化されたアルゴリズム）
        const subnetInt = this.ipToInt(subnetMask);

        // 高速なビットカウント（Brian Kernighan's algorithm）
        let cidr = 0;
        let mask = subnetInt;
        while (mask) {
            mask &= mask - 1; // 最下位の1ビットをクリア
            cidr++;
        }

        // 結果をキャッシュ
        this.cidrCache.set(subnetMask, cidr);
        return cidr;
    }
    
    // ゲートウェイへの到達可能性チェック（物理ポート一致検証対応）
    isGatewayReachable(sourceDevice, path) {
        if (!sourceDevice || !sourceDevice.config) {
            return { isReachable: false, reason: 'デバイス設定が無効です' };
        }

        const sourceIP = sourceDevice.config.ipAddress;
        const sourceSubnet = sourceDevice.config.subnetMask;
        const gateway = sourceDevice.config.defaultGateway;

        if (!gateway || !this.isValidIP(gateway)) {
            return {
                isReachable: false,
                reason: `${sourceDevice.name} のデフォルトゲートウェイが設定されていないか無効です`
            };
        }
        
        // ゲートウェイが同一サブネット内にあるかチェック
        if (!this.isInSameSubnet(sourceIP, gateway, sourceSubnet)) {
            return {
                isReachable: false,
                reason: `${sourceDevice.name} のデフォルトゲートウェイ (${gateway}) が自身のサブネット (${sourceIP}/${this.subnetMaskToCIDR(sourceSubnet)}) 内にありません`
            };
        }
        
        // 経路上のルーターを取得
        const routers = path.filter(device => device.type === 'router');
        if (routers.length === 0) {
            return {
                isReachable: false,
                reason: `デフォルトゲートウェイ ${gateway} に対応するルーターが経路に見つかりません`
            };
        }

        // 送信元が物理的に接続されているルーターとそのLANポートをチェック
        const router = routers[0];
        const lanConfig = this.determineLANConnection(sourceDevice, router);
        
        if (!lanConfig) {
            return {
                isReachable: false,
                reason: `${sourceDevice.name} からルーター (${router.name}) への接続ポートを特定できません`
            };
        }

        const lanName = this.getLANName(router, lanConfig);

        // 物理的に接続されているLANポートのIPとゲートウェイが一致しているか厳格にチェック
        if (lanConfig.ipAddress !== gateway) {
            return {
                isReachable: false,
                reason: `${sourceDevice.name} はルーターの ${lanName} (${lanConfig.ipAddress}) に接続されていますが、デフォルトゲートウェイに異なるIP (${gateway}) が設定されています。${lanName} のIP (${lanConfig.ipAddress}) を設定してください`
            };
        }
        
        return { isReachable: true, reason: 'ゲートウェイへの到達可能' };
    }

    // Pingエラーの詳細表示
    async showPingError(reason, sourceDevice, targetDevice) {
        // エラーメッセージの詳細情報を作成
        const errorDetails = [
            `❌ Ping失敗`,
            `送信元: ${sourceDevice.name} (${sourceDevice.config.ipAddress})`,
            `送信先: ${targetDevice.name} (${targetDevice.config.ipAddress})`,
            `理由: ${reason}`
        ];
        
        // 失敗理由に応じたアニメーション
        await this.animatePingErrorByReason(reason, sourceDevice, targetDevice);
        
        // 詳細エラーメッセージを表示
        this.updateStatus(errorDetails.join(' | '));
        
        // エラーメッセージを5秒間表示してから次の操作を促す
        await this.sleep(5000);
        
        // Pingモードを継続（再度選択可能）
        this.pingSourceDevice = null;
        this.pingTargetDevice = null;
        this.updateStatus('🎯 Ping送信元のデバイスをクリックしてください（前回のPingは失敗しました）');
        this.scheduleRender();
    }
    
    // 失敗理由に応じたPingエラーアニメーション
    async animatePingErrorByReason(reason, sourceDevice, targetDevice) {
        try {
            this.updateStatus(`🚀 Ping送信中: ${sourceDevice.config.ipAddress} → ${targetDevice.config.ipAddress}`);
            
            // 失敗理由に応じてパケットがどこまで到達するかを決定
            const path = this.findPath(sourceDevice, targetDevice);
            const isTargetSideError = reason.includes('[応答側]') || reason.includes('送信先') || reason.includes('応答');
            const reachableHops = this.calculateReachableHopsForFailure(reason, sourceDevice, targetDevice, path);
            
            if (isTargetSideError && path && path.length >= 2) {
                // 送信先側（応答側）のエラーの場合：送信元PC → ルーター → 送信先PC までは Request (青) が届く
                for (let i = 0; i < path.length - 1; i++) {
                    await this.animatePacket(path[i], path[i + 1], '🔵 ICMP Request', '#2196f3');
                    await this.sleep(150);
                }
                
                // 送信先PCで応答パケットがゲートウェイ不備のため送信不能
                await this.sleep(250);
                this.updateStatus(`❌ Ping失敗: ${targetDevice.name} はICMP Requestを受信しましたが、ゲートウェイ設定不備のため応答(Reply)を返信できません`);
                await this.blinkDevicesRed([targetDevice]);
            } else if (reachableHops > 1) {
                // スイッチなどの中継機器まで到達
                for (let i = 0; i < reachableHops - 1; i++) {
                    await this.animatePacket(path[i], path[i + 1], '🔴 ICMP Request', '#f44336');
                    await this.sleep(200);
                }
                
                // 最終到達地点で失敗表示
                await this.sleep(300);
                this.updateStatus(`❌ Ping失敗: ${path[reachableHops - 1].name}で通信が停止`);
                await this.blinkDevicesRed([path[reachableHops - 1]]);
            } else {
                // 送信元から出られない場合
                this.updateStatus(`❌ Ping失敗: ${sourceDevice.name}から送信できません`);
                await this.blinkDevicesRed([sourceDevice]);
            }
            
            await this.sleep(1000);
            
        } catch (error) {
            console.log('Error animation failed:', error);
        }
    }
    
    // Pingエラーアニメーション（後方互換性のため保持）
    async animatePingError(sourceDevice, targetDevice) {
        // 失敗したパケットのアニメーション
        try {
            // エラー表示用の赤いパケットを実際の経路に沿って動かしてから停止
            this.updateStatus(`🚀 Ping送信中... ${sourceDevice.config.ipAddress} → ${targetDevice.config.ipAddress}`);
            
            // 実際の経路を取得
            const path = this.findPath(sourceDevice, targetDevice);
            
            // 経路に沿った失敗アニメーション
            if (path.length > 0) {
                await this.animateFailedPacketAlongPath(path);
            } else {
                // 経路がない場合は従来の直線アニメーション
                await this.animateFailedPacket(sourceDevice, targetDevice);
            }
            
            // デバイスを赤く点滅させる
            await this.blinkDevicesRed([sourceDevice, targetDevice]);
            
        } catch (error) {
            console.log('Error animation failed:', error);
        }
    }
    
    // 経路に沿った失敗パケットのアニメーション
    async animateFailedPacketAlongPath(path) {
        if (path.length < 2) return;
        
        const sourceDevice = path[0];
        const targetDevice = path[path.length - 1];
        
        // ネットワーク到達性をチェックして、実際にパケットがどこまで進むかを計算
        const reachableHops = this.calculateReachableHops(sourceDevice, targetDevice, path);
        
        if (reachableHops === 0) {
            // 送信元デバイス自体から送信できない場合
            await this.animateLocalFailure(sourceDevice);
            return;
        }
        
        // 到達可能な地点まで正常に進む
        for (let i = 0; i < reachableHops - 1; i++) {
            await this.animatePacket(path[i], path[i + 1], '🔴 ICMP Request', '#f44336');
            await this.sleep(200);
        }
        
        // 最終的に失敗する箇所で30%地点まで進んで停止
        if (reachableHops < path.length) {
            await this.animateFailedPacketSegment(path[reachableHops - 1], path[reachableHops]);
        }
    }
    
    // 失敗理由に応じて、パケットがどこまで到達可能かを計算
    calculateReachableHopsForFailure(reason, sourceDevice, targetDevice, path) {
        if (!path || path.length === 0) return 0;

        const sourceIP = sourceDevice.config.ipAddress;
        const sourceSubnet = sourceDevice.config.subnetMask;
        const sourceGateway = sourceDevice.config.defaultGateway;
        const targetIP = targetDevice.config.ipAddress;

        // 送信先側（応答側）のエラーの場合：送信先まで到達
        if (reason.includes('[応答側]') || reason.includes('送信先') || reason.includes('応答')) {
            return path.length;
        }
        
        // IP設定が無効な場合：送信元から出られない
        if (reason.includes('無効なIPアドレス') || reason.includes('無効なサブネットマスク')) {
            return 1; // 送信元デバイスのみ
        }
        
        // デフォルトゲートウェイ設定エラー：同一サブネット内のスイッチまでは到達可能
        if (reason.includes('デフォルトゲートウェイが無効') || reason.includes('ゲートウェイ')) {
            // 両方向で同一サブネット内かつ物理的に同一セグメント内なら直接通信できるので、最初のスイッチまで到達
            if (path.length > 1 && this.canCommunicateDirectly(sourceDevice, targetDevice)) {
                return Math.min(2, path.length); // 最初のスイッチまで
            }
            return 1; // 異なるサブネットまたは異なるセグメントなら送信元から出られない
        }
        
        // 物理接続がない場合：送信元から出られない
        if (reason.includes('物理接続経路がありません')) {
            return 1;
        }
        
        // ルーターが必要だが存在しない場合：同一サブネット内のスイッチまで到達
        if (reason.includes('ルーターが必要') || reason.includes('異なるサブネット')) {
            // 最初のスイッチ（非ルーター）まで到達
            for (let i = 1; i < path.length; i++) {
                if (path[i].type === 'switch' || path[i].type === 'onu') {
                    return i + 1; // スイッチまで到達
                }
                if (path[i].type === 'router') {
                    return i; // ルーターの手前まで
                }
            }
            return Math.min(2, path.length); // 最低でも次のホップまで
        }
        
        // その他のエラー：送信元から出られない
        return 1;
    }
    
    // ネットワーク制約を考慮して、パケットがどこまで到達可能かを計算
    calculateReachableHops(sourceDevice, targetDevice, path) {
        const sourceIP = sourceDevice.config.ipAddress;
        const sourceSubnet = sourceDevice.config.subnetMask;
        const sourceGateway = sourceDevice.config.defaultGateway;
        
        const targetIP = targetDevice.config.ipAddress;
        const targetSubnet = targetDevice.config.subnetMask;
        
        // 同一サブネット内の場合
        if (this.isInSameSubnet(sourceIP, targetIP, sourceSubnet)) {
            // 直接通信可能な場合は、最初の中継機器（スイッチ等）まで到達
            return Math.min(2, path.length); // 送信元→次のホップまで
        }
        
        // 異なるサブネット間の場合
        // デフォルトゲートウェイが設定されていない場合
        if (!this.isValidIP(sourceGateway)) {
            return 1; // 送信元デバイスから出られない
        }
        
        // デフォルトゲートウェイが同一サブネット内にない場合
        if (!this.isInSameSubnet(sourceIP, sourceGateway, sourceSubnet)) {
            return 1; // 送信元デバイスから出られない
        }
        
        // ルーターが経路上にない場合
        const hasRouter = path.some(device => device.type === 'router');
        if (!hasRouter) {
            // 最初のスイッチまでは到達するが、その先に進めない
            const firstRouterOrEnd = path.findIndex((device, index) => 
                index > 0 && (device.type === 'router' || index === path.length - 1)
            );
            return Math.max(1, firstRouterOrEnd);
        }
        
        // ルーターがある場合、ルーターまで到達
        const routerIndex = path.findIndex((device, index) => 
            index > 0 && device.type === 'router'
        );
        
        if (routerIndex !== -1) {
            return routerIndex + 1; // ルーターの次まで
        }
        
        return 1; // フォールバック：送信元から最初のホップまで
    }
    
    // 送信元デバイスでのローカル失敗アニメーション
    async animateLocalFailure(sourceDevice) {
        // 送信元デバイス付近で小さくアニメーション
        const packet = {
            x: sourceDevice.x + sourceDevice.width / 2,
            y: sourceDevice.y + sourceDevice.height / 2,
            targetX: sourceDevice.x + sourceDevice.width / 2 + 20,
            targetY: sourceDevice.y + sourceDevice.height / 2 - 20,
            label: '❌ 送信失敗',
            color: '#f44336',
            progress: 0
        };
        
        const duration = 800;
        const startTime = Date.now();
        
        return new Promise((resolve) => {
            const animate = () => {
                const elapsed = Date.now() - startTime;
                packet.progress = Math.min(elapsed / duration, 1);
                
                const actualProgress = Math.min(packet.progress / 0.2, 1); // 20%まで移動
                
                packet.x = sourceDevice.x + sourceDevice.width / 2 + 
                          (packet.targetX - (sourceDevice.x + sourceDevice.width / 2)) * actualProgress;
                packet.y = sourceDevice.y + sourceDevice.height / 2 + 
                          (packet.targetY - (sourceDevice.y + sourceDevice.height / 2)) * actualProgress;
                
                this.renderWithPacket(packet);
                
                if (packet.progress < 0.2) {
                    requestAnimationFrame(animate);
                } else {
                    this.render();
                    resolve();
                }
            };
            
            animate();
        });
    }
    
    // セグメント内での失敗パケットアニメーション（30%地点で停止）
    async animateFailedPacketSegment(fromDevice, toDevice) {
        return new Promise((resolve) => {
            const packet = {
                x: fromDevice.x + fromDevice.width / 2,
                y: fromDevice.y + fromDevice.height / 2,
                targetX: toDevice.x + toDevice.width / 2,
                targetY: toDevice.y + toDevice.height / 2,
                label: '❌ FAILED',
                color: '#f44336',
                progress: 0
            };
            
            const duration = 1000;
            const startTime = Date.now();
            
            const animate = () => {
                const elapsed = Date.now() - startTime;
                packet.progress = Math.min(elapsed / duration, 1);
                
                // 30%の地点で停止
                const stopProgress = 0.3;
                const actualProgress = Math.min(packet.progress / stopProgress, 1);
                
                packet.x = fromDevice.x + fromDevice.width / 2 + 
                          (packet.targetX - (fromDevice.x + fromDevice.width / 2)) * actualProgress;
                packet.y = fromDevice.y + fromDevice.height / 2 + 
                          (packet.targetY - (fromDevice.y + fromDevice.height / 2)) * actualProgress;
                
                this.renderWithPacket(packet);
                
                if (packet.progress < stopProgress) {
                    requestAnimationFrame(animate);
                } else {
                    // パケットを消去して停止
                    this.render();
                    resolve();
                }
            };
            
            animate();
        });
    }
    
    // 失敗パケットのアニメーション（従来版：直線）
    async animateFailedPacket(fromDevice, toDevice) {
        return new Promise((resolve) => {
            const packet = {
                x: fromDevice.x + fromDevice.width / 2,
                y: fromDevice.y + fromDevice.height / 2,
                targetX: toDevice.x + toDevice.width / 2,
                targetY: toDevice.y + toDevice.height / 2,
                label: '❌ FAILED',
                color: '#f44336',
                progress: 0
            };
            
            const duration = 1000;
            const startTime = Date.now();
            
            const animate = () => {
                const elapsed = Date.now() - startTime;
                packet.progress = Math.min(elapsed / duration, 1);
                
                // 途中で停止（失敗を表現）
                const stopProgress = 0.3; // 30%の地点で停止
                const actualProgress = Math.min(packet.progress / stopProgress, 1);
                
                packet.x = fromDevice.x + fromDevice.width / 2 + 
                          (packet.targetX - (fromDevice.x + fromDevice.width / 2)) * actualProgress;
                packet.y = fromDevice.y + fromDevice.height / 2 + 
                          (packet.targetY - (fromDevice.y + fromDevice.height / 2)) * actualProgress;
                
                this.renderWithPacket(packet);
                
                if (packet.progress < stopProgress) {
                    requestAnimationFrame(animate);
                } else {
                    // パケットを消去して停止
                    this.render();
                    resolve();
                }
            };
            
            animate();
        });
    }
    
    // デバイスを赤く点滅
    async blinkDevicesRed(devices) {
        for (let i = 0; i < 3; i++) { // 3回点滅
            // 赤く表示
            this.errorBlinkDevices = new Set(devices.map(d => d.id));
            this.scheduleRender();
            await this.sleep(200);
            
            // 元に戻す
            this.errorBlinkDevices = null;
            this.scheduleRender();
            await this.sleep(200);
        }
    }

    // デバイスを緑に点滅（成功時）
    async blinkDevicesGreen(devices) {
        for (let i = 0; i < 3; i++) { // 3回点滅
            this.successBlinkDevices = new Set(devices.map(d => d.id));
            this.scheduleRender();
            await this.sleep(200);
            
            this.successBlinkDevices = null;
            this.scheduleRender();
            await this.sleep(200);
        }
    }

    // ループバックアドレス判定 (127.0.0.0/8, ::1, localhost)
    isLoopbackAddress(target) {
        if (!target || typeof target !== 'string') return false;
        const trimmed = target.trim().toLowerCase();
        if (trimmed === 'localhost' || trimmed === '::1') {
            return true;
        }
        // IPv4 127.0.0.0/8 (127.0.0.0 ~ 127.255.255.255)
        const match = trimmed.match(/^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
        if (match) {
            const b = parseInt(match[1], 10);
            const c = parseInt(match[2], 10);
            const d = parseInt(match[3], 10);
            if (b >= 0 && b <= 255 && c >= 0 && c <= 255 && d >= 0 && d <= 255) {
                return true;
            }
        }
        return false;
    }

    // ループバック用パケット周回アニメーション
    async animateLoopbackPacket(device, label, color, duration = 800) {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const cx = device.x + device.width / 2;
            const cy = device.y + device.height / 2;
            const radiusX = (device.width / 2) + 24;
            const radiusY = (device.height / 2) + 20;

            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                // 上から時計回りに1周 (-PI/2 から +3PI/2)
                const angle = -Math.PI / 2 + progress * 2 * Math.PI;
                const x = cx + radiusX * Math.cos(angle);
                const y = cy + radiusY * Math.sin(angle);

                const packet = {
                    x,
                    y,
                    label,
                    color
                };

                this.renderWithPackets([packet]);

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    this.render();
                    resolve();
                }
            };

            animate();
        });
    }

    // ループバックPing実行
    async executeLoopbackPing(sourceDevice, loopbackIp = '127.0.0.1') {
        console.log('🔄 executeLoopbackPing called for:', sourceDevice.name, 'target:', loopbackIp);
        this.updateStatus(`🚀 ICMP Request送信: ${sourceDevice.name} → ${loopbackIp} (ローカルループバック / 自分自身)`);
        await this.animateLoopbackPacket(sourceDevice, '🔵 ICMP Request', '#2196f3', 750);
        await this.sleep(120);

        this.updateStatus(`⬅️ ICMP Reply受信: ${loopbackIp} → ${sourceDevice.name} (ローカルループバック)`);
        await this.animateLoopbackPacket(sourceDevice, '🟢 ICMP Reply', '#4caf50', 750);
        await this.sleep(200);

        this.updateStatus(`🏓 Ping成功: ${loopbackIp} (ローカルループバック / 自分自身) からの応答を受信しました (TCP/IPスタック正常, RTT < 1ms)`);
        await this.blinkDevicesGreen([sourceDevice]);

        await this.sleep(4000);
        this.pingSourceDevice = null;
        this.pingTargetDevice = null;
        this.updateStatus('🎯 Ping送信元のデバイスをクリックしてください');
        this.scheduleRender();
    }

    // ループバックHTTP実行
    async executeLoopbackHTTP(sourceDevice, loopbackIp = '127.0.0.1') {
        console.log('🔄 executeLoopbackHTTP called for:', sourceDevice.name, 'target:', loopbackIp);
        
        const isServerDevice = sourceDevice.type === 'server' || sourceDevice.type === 'dns';

        if (isServerDevice) {
            // 自機でWebサーバーが稼働している場合
            this.updateStatus(`🌐 HTTPリクエスト送信: ${sourceDevice.name} → ${loopbackIp}:80 (GET /)`);
            if (window.httpSimulator) {
                window.httpSimulator.addToLog(`REQUEST: ${sourceDevice.name} → ${loopbackIp}:80 GET / (localhost)`);
            }
            await this.animateLoopbackPacket(sourceDevice, '🔵 HTTP GET /', '#2196f3', 800);
            await this.sleep(150);

            this.updateStatus(`🟢 HTTPレスポンス受信: ${loopbackIp} → ${sourceDevice.name} (200 OK)`);
            if (window.httpSimulator) {
                window.httpSimulator.addToLog(`RESPONSE: ${loopbackIp} 200 OK (Content-Type: text/html)`);
            }
            await this.animateLoopbackPacket(sourceDevice, '🟢 HTTP 200 OK', '#4caf50', 800);
            await this.sleep(200);

            this.updateStatus(`🌐 HTTP通信成功: ${loopbackIp} (ローカルWebサーバー) から応答を受信しました (HTTP/1.1 200 OK)`);
            await this.blinkDevicesGreen([sourceDevice]);
        } else {
            // PCやルーターなどWebサーバーが稼働していない端末の場合
            this.updateStatus(`🌐 HTTPリクエスト送信試行: ${sourceDevice.name} → ${loopbackIp}:80`);
            if (window.httpSimulator) {
                window.httpSimulator.addToLog(`CONNECT: ${sourceDevice.name} → ${loopbackIp}:80 (TCP SYN)`);
            }
            await this.animateLoopbackPacket(sourceDevice, '🔴 TCP SYN', '#f44336', 700);
            await this.sleep(200);

            if (window.httpSimulator) {
                window.httpSimulator.addToLog(`ERROR: Connection refused on ${loopbackIp}:80 (No web server running)`, 'error');
            }
            this.updateStatus(`❌ HTTP通信失敗: ${loopbackIp} への接続が拒否されました (Connection Refused: ${sourceDevice.name}内でWebサーバー(Port 80)が稼働していません)`);
            await this.blinkDevicesRed([sourceDevice]);
        }

        await this.sleep(4000);
        this.httpSourceDevice = null;
        this.httpTargetDevice = null;
        this.updateControlButtons();
        this.scheduleRender();
    }

    // ブロードキャストドメイン（同一L2セグメント・ルーター境界まで）を探索
    findBroadcastDomain(sourceDevice) {
        if (!sourceDevice || !sourceDevice.id) return { domainDevices: [], boundaryRouters: [] };

        const domainDevices = []; // 到達した全デバイス { device, path }
        const boundaryRouters = []; // 境界としてブロードキャストを遮断するルーター { device, path }
        const visited = new Set();
        const queue = [[sourceDevice]];
        visited.add(sourceDevice.id);

        while (queue.length > 0) {
            const path = queue.shift();
            const currentDevice = path[path.length - 1];

            // 現在のデバイスに接続されている隣接デバイスをチェック（新旧両方の接続形式に対応）
            for (const conn of this.connections) {
                let nextDevice = null;
                if (conn.from && conn.to) {
                    // 新しい形式
                    if (conn.from.device === currentDevice || conn.from.device?.id === currentDevice.id) {
                        nextDevice = conn.to.device;
                    } else if (conn.to.device === currentDevice || conn.to.device?.id === currentDevice.id) {
                        nextDevice = conn.from.device;
                    }
                } else {
                    // 古い形式
                    if (conn.fromDevice === currentDevice.id) {
                        nextDevice = this.devices.get(conn.toDevice);
                    } else if (conn.toDevice === currentDevice.id) {
                        nextDevice = this.devices.get(conn.fromDevice);
                    }
                }

                if (nextDevice && !visited.has(nextDevice.id)) {
                    visited.add(nextDevice.id);
                    const newPath = [...path, nextDevice];

                    if (nextDevice.type === 'router') {
                        // ルーターはブロードキャストパケットを受信し、境界として遮断（他ポートやWANへは転送しない）
                        domainDevices.push({ device: nextDevice, path: newPath });
                        boundaryRouters.push({ device: nextDevice, path: newPath });
                    } else if (nextDevice.type === 'switch' || nextDevice.type === 'hub' || nextDevice.type === 'onu') {
                        // L2機器: フラッディング・透過するため探索を継続
                        domainDevices.push({ device: nextDevice, path: newPath });
                        queue.push(newPath);
                    } else if (nextDevice.type === 'pc' || nextDevice.type === 'server' || nextDevice.type === 'dns') {
                        // エンドホスト: パケットを受信（エンドホストなのでこれ以上の転送はなし）
                        domainDevices.push({ device: nextDevice, path: newPath });
                    } else {
                        domainDevices.push({ device: nextDevice, path: newPath });
                    }
                }
            }
        }

        console.log('📡 findBroadcastDomain result:', {
            source: sourceDevice.name,
            domainDevices: domainDevices.map(d => `${d.device.name}(${d.device.type})`),
            boundaryRouters: boundaryRouters.map(r => r.device.name)
        });

        return { domainDevices, boundaryRouters };
    }

    // ブロードキャストPing実行
    async executeBroadcastPing(sourceDevice, broadcastIp = '255.255.255.255') {
        console.log('📡 executeBroadcastPing called:', sourceDevice.name, 'target:', broadcastIp);

        const sourceIP = sourceDevice.config?.ipAddress;
        const sourceSubnet = sourceDevice.config?.subnetMask || '255.255.255.0';

        if (!sourceIP || !this.isValidIP(sourceIP)) {
            alert(`${sourceDevice.name} に有効なIPアドレスが設定されていません。`);
            return;
        }

        // ネットワークループチェック
        if (this.hasNetworkLoop()) {
            const loops = this.detectNetworkLoops();
            const errorMessage = this.formatNetworkLoopErrorMessage(loops);
            alert(`ネットワークループが検出されたため、ブロードキャストストームを防止するため通信を停止しました。\n${errorMessage}`);
            return;
        }

        this.updateStatus(`📡 ブロードキャストPing開始: ${sourceDevice.name} (${sourceIP}) → ${broadcastIp} (同一セグメント内の全機器へ一斉送信)`);

        // ブロードキャストドメイン内のデバイスと境界ルーターを探索
        const { domainDevices, boundaryRouters } = this.findBroadcastDomain(sourceDevice);

        if (domainDevices.length === 0) {
            // 物理的に接続されている機器が一切ない場合
            this.showDeviceToast(sourceDevice, `📡 ブロードキャスト送信<br>接続機器なし`, 'broadcast');
            this.updateStatus(`❌ ブロードキャストPing完了: ${sourceDevice.name} のネットワーク内に通信可能な他の機器が接続されていません`);
            await this.blinkDevicesRed([sourceDevice]);
            await this.sleep(3000);
            this.pingSourceDevice = null;
            this.pingTargetDevice = null;
            this.updateControlButtons();
            this.scheduleRender();
            return;
        }

        // 送信先エンドホスト（L2中継機を除く端末やルーター）
        let targetEndDevices = domainDevices.filter(item => item.device.type !== 'switch' && item.device.type !== 'onu');
        // もしL2機器（スイッチ等）しか存在しない場合は、そのL2機器自体を終点としてアニメーション
        if (targetEndDevices.length === 0) {
            targetEndDevices = domainDevices;
        }

        // 応答対象となるデバイスを特定
        const respondingDevices = [];
        for (const item of targetEndDevices) {
            const dev = item.device;
            if (dev === sourceDevice) continue;

            if (dev.type === 'router') {
                // ルーターの場合: 送信元と同一サブネットのインターフェースを探す
                const lanConfigs = [dev.config?.lan1, dev.config?.lan2, dev.config?.lan3, dev.wanConfig];
                const matchingNIC = lanConfigs.find(nic => nic && nic.ipAddress && this.isInSameSubnet(sourceIP, nic.ipAddress, sourceSubnet));
                if (matchingNIC) {
                    respondingDevices.push({
                        device: dev,
                        path: item.path,
                        ip: matchingNIC.ipAddress
                    });
                } else if (dev.config?.ipAddress && this.isInSameSubnet(sourceIP, dev.config.ipAddress, sourceSubnet)) {
                    respondingDevices.push({
                        device: dev,
                        path: item.path,
                        ip: dev.config.ipAddress
                    });
                }
            } else {
                // PC, Server, DNS
                const devIP = dev.config?.ipAddress;
                if (devIP && this.isValidIP(devIP)) {
                    // リミテッドブロードキャストまたは同一サブネットなら応答
                    if (broadcastIp === '255.255.255.255' || this.isInSameSubnet(sourceIP, devIP, sourceSubnet)) {
                        respondingDevices.push({
                            device: dev,
                            path: item.path,
                            ip: devIP
                        });
                    }
                }
            }
        }

        // 1. 往路: ICMP Request (Broadcast) アニメーション
        this.updateStatus(`🚀 ICMP Request (Broadcast) 送信: ${sourceIP} → ${broadcastIp} (全ポートへフラッディング)`);

        // 全エンドホストへRequestパケットを並行送信
        const requestPromises = targetEndDevices.map(item => {
            return this.animatePacketAlongPath(item.path, '📡 ICMP Request (BC)', '#0284c7', {
                packetDuration: 850,
                hopDelay: 120,
                sourceDevice: sourceDevice,
                targetDevice: item.device
            });
        });

        await Promise.all(requestPromises);

        // 境界ルーターが存在する場合、ルーター上でブロードキャスト遮断トーストを表示
        for (const rItem of boundaryRouters) {
            this.showDeviceToast(rItem.device, `🛑 ブロードキャスト遮断<br>(L3境界 / 転送破棄)`, 'drop');
        }

        await this.sleep(400);

        // 2. 復路: 各受信デバイスからの個別 ICMP Echo Reply アニメーション
        if (respondingDevices.length > 0) {
            this.updateStatus(`⬅️ ICMP Reply受信中: ${respondingDevices.length}台のデバイスからユニキャスト応答を受信中...`);

            // 各デバイスから送信元への復路（reversePath）を少し時間差をつけて送信
            const replyPromises = respondingDevices.map(async (item, idx) => {
                await this.sleep(idx * 160);
                const reversePath = [...item.path].reverse();

                // 送信元のARPテーブルに応答元を登録
                if (sourceDevice.arpTable) {
                    const targetMAC = this.getDeviceMAC(item.device);
                    if (targetMAC) sourceDevice.arpTable.set(item.ip, targetMAC);
                }

                return this.animatePacketAlongPath(reversePath, '🟢 ICMP Reply', '#4caf50', {
                    packetDuration: 850,
                    hopDelay: 120,
                    sourceDevice: item.device,
                    targetDevice: sourceDevice
                });
            });

            await Promise.all(replyPromises);
            await this.sleep(250);

            // 成功ステータス表示
            const responseListStr = respondingDevices.map(d => `${d.device.name} (${d.ip})`).join(', ');
            this.updateStatus(`🏓 ブロードキャストPing成功: ${broadcastIp} への一斉同報に対し、${respondingDevices.length}台から応答を受信しました [${responseListStr}]`);
        } else {
            // 同一セグメント内に応答可能なIPを持つホストがなかった場合
            this.updateStatus(`📡 ブロードキャストPing完了: ${broadcastIp} へ送信しましたが、同一セグメント内に応答するホストがありませんでした (Request timed out)`);
            await this.blinkDevicesRed([sourceDevice]);
        }

        await this.sleep(4000);
        this.pingSourceDevice = null;
        this.pingTargetDevice = null;
        this.updateStatus('🎯 Ping送信元のデバイスをクリックしてください');
        this.updateControlButtons();
        this.scheduleRender();
    }

    // Pingモードでのデバイス選択処理
    handlePingDeviceSelection(device) {
        if (device.type === 'switch' || device.type === 'onu') {
            this.updateStatus(`⚠️ ${device.name} はL2中継機器のためPingの送信元にはなれません。端末(PC/サーバー等)を選択してください`);
            return;
        }

        if (!this.pingSourceDevice) {
            // 送信元デバイスを選択
            this.pingSourceDevice = device;
            this.updateStatus(`🔵 送信元: ${device.name} | 宛先選択ダイアログを表示します`);
            
            // Pingモードを終了してダイアログを表示
            this.exitPingMode();
            this.showDestinationDialog(device, 'ping');
        } else if (device === this.pingSourceDevice) {
            // 送信元デバイスを再選択
            this.pingSourceDevice = null;
            this.pingTargetDevice = null;
            this.updateStatus('🎯 Ping送信元のデバイスをクリックしてください');
        }
        
        this.scheduleRender();
    }
    
    // デバイス間の経路を検索（BFS + インターネットルーティング対応）
    findPath(sourceDevice, targetDevice) {
        if (sourceDevice === targetDevice) return [sourceDevice];
        
        // まず直接接続経路を試行
        const directPath = this.findDirectPath(sourceDevice, targetDevice);
        if (directPath && directPath.length > 0) {
            // ONUを透明化した経路を返す
            return this.transparentizeONUPath(directPath);
        }
        
        // 直接経路がない場合、インターネット経由を試行
        const internetPath = this.findInternetPath(sourceDevice, targetDevice);
        if (internetPath && internetPath.length > 0) {
            // ONUを透明化した経路を返す
            return this.transparentizeONUPath(internetPath);
        }
        
        return []; // 経路が見つからない
    }

    // 経路からONUを透明化（パススルーデバイスとして動作）
    transparentizeONUPath(path) {
        // ONU透明化を無効化：アニメーションパスの完全性を優先
        // ONUもアニメーション経路に含めることで、パケットが正しく物理パスを通る
        console.log('📋 パス透明化処理（ONU保持）:', path.map(d => d.name).join(' → '));
        
        // 現在はONUを透明化せず、そのままパスを返す
        // これによりアニメーションが物理接続に沿って動作する
        return path;
        
        // 将来的にONU特別処理が必要な場合は、アニメーション以外の用途で実装
        /*
        const transparentPath = [];
        for (let i = 0; i < path.length; i++) {
            const device = path[i];
            
            if (device.type === 'onu') {
                // ONUをそのまま保持（透明化しない）
                transparentPath.push(device);
            } else {
                transparentPath.push(device);
            }
        }
        return transparentPath;
        */
    }
    
    // 直接接続による経路検索
    findDirectPath(sourceDevice, targetDevice) {
        if (!sourceDevice || !targetDevice || !sourceDevice.id || !targetDevice.id) {
            return null;
        }
        const visited = new Set();
        const queue = [[sourceDevice]];
        visited.add(sourceDevice.id);
        
        while (queue.length > 0) {
            const path = queue.shift();
            const currentDevice = path[path.length - 1];
            
            // 現在のデバイスの接続をチェック（新旧両方の接続形式をサポート）
            for (const conn of this.connections) {
                let nextDevice = null;
                
                if (conn.from && conn.to) {
                    // 新しい形式
                    if (conn.from.device === currentDevice) {
                        nextDevice = conn.to.device;
                    } else if (conn.to.device === currentDevice) {
                        nextDevice = conn.from.device;
                    }
                } else {
                    // 古い形式
                    if (conn.fromDevice === currentDevice.id) {
                        nextDevice = this.devices.get(conn.toDevice);
                    } else if (conn.toDevice === currentDevice.id) {
                        nextDevice = this.devices.get(conn.fromDevice);
                    }
                }
                
                if (nextDevice && !visited.has(nextDevice.id)) {
                    const newPath = [...path, nextDevice];
                    
                    if (nextDevice === targetDevice) {
                        return newPath;
                    }
                    
                    visited.add(nextDevice.id);
                    queue.push(newPath);
                }
            }
        }
        
        return []; // 直接経路が見つからない
    }
    
    // インターネット経由の経路検索
    findInternetPath(sourceDevice, targetDevice) {
        // 送信元デバイスからインターネットに接続されたルーターを検索
        const sourceRouter = this.findInternetConnectedRouter(sourceDevice);
        // 宛先デバイスからインターネットに接続されたルーターを検索  
        const targetRouter = this.findInternetConnectedRouter(targetDevice);
        
        if (!sourceRouter || !targetRouter) {
            return []; // どちらかがインターネットに接続されていない
        }
        
        // インターネットデバイスを取得
        let internetDevice = null;
        if (sourceRouter.wanConfig?.internetDevice) {
            internetDevice = sourceRouter.wanConfig.internetDevice; // ルーターからのインターネット接続
        } else if (sourceRouter.config?.internetDevice) {
            internetDevice = sourceRouter.config.internetDevice; // PC/サーバーからの直接接続
        }
        
        if (!internetDevice || internetDevice.type !== 'internet') {
            return []; // インターネットデバイスが見つからない
        }
        
        // ソース → ソースルーター → インターネット → ターゲットルーター → ターゲット の経路を構築
        const sourceToRouter = this.findDirectPath(sourceDevice, sourceRouter);
        const targetToRouter = this.findDirectPath(targetDevice, targetRouter);
        
        if (sourceToRouter.length === 0 || targetToRouter.length === 0) {
            return []; // ルーターまでの経路が見つからない
        }
        
        // ルーターからインターネットまでの物理パス（ONUも含む）を取得
        const routerToInternet = this.findDirectPath(sourceRouter, internetDevice);
        const internetToTargetRouter = this.findDirectPath(internetDevice, targetRouter);
        
        if (routerToInternet.length === 0 || internetToTargetRouter.length === 0) {
            console.log('❌ ルーター-インターネット間の物理パスが見つかりません');
            console.log('  sourceRouter:', sourceRouter.name, 'internetDevice:', internetDevice.name);
            console.log('  targetRouter:', targetRouter.name);
            return []; // インターネット経由の物理接続が見つからない
        }
        
        // 完全な経路を構築（重複するデバイスは除去）
        const fullPath = [];
        
        // ソース → ソースルーター
        fullPath.push(...sourceToRouter);
        
        // ソースルーター → インターネット（ソースルーター重複回避）
        fullPath.push(...routerToInternet.slice(1));
        
        // インターネット → ターゲットルーター（インターネット重複回避）  
        fullPath.push(...internetToTargetRouter.slice(1));
        
        // ターゲットルーター → ターゲット（ターゲットルーター重複回避）
        fullPath.push(...targetToRouter.slice().reverse().slice(1));
        
        console.log('🔍 インターネット経由パス構築完了:');
        console.log('  sourceToRouter:', sourceToRouter.map(d => d.name).join(' → '));
        console.log('  routerToInternet:', routerToInternet.map(d => d.name).join(' → '));
        console.log('  internetToTargetRouter:', internetToTargetRouter.map(d => d.name).join(' → '));
        console.log('  targetToRouter:', targetToRouter.map(d => d.name).join(' → '));
        console.log('  fullPath:', fullPath.map(d => d.name).join(' → '));
        
        return fullPath;
    }
    
    // デバイスからインターネットに接続されたルーターまたは直接接続を検索
    findInternetConnectedRouter(device) {
        // デバイスの存在確認
        if (!device) {
            console.warn('findInternetConnectedRouter: device is null or undefined');
            return null;
        }

        // デバイス自身がインターネット接続ルーターの場合
        if (device.type === 'router' && device.wanConfig?.isConnected) {
            return device;
        }
        
        // デバイス自身がインターネットに直接接続されているPCまたはサーバーの場合
        if ((device.type === 'pc' || device.type === 'server') && device.config.isInternetConnected) {
            return device; // インターネット直接接続デバイスをルーター代わりとして返す
        }
        
        // デバイスから到達可能なインターネット接続ルーターまたは直接接続デバイスを検索
        const visited = new Set();
        const queue = [device];
        visited.add(device.id);
        
        while (queue.length > 0) {
            const currentDevice = queue.shift();
            
            // 現在のデバイスの接続をチェック
            for (const conn of this.connections) {
                let nextDevice = null;
                
                if (conn.from && conn.to) {
                    if (conn.from.device === currentDevice) {
                        nextDevice = conn.to.device;
                    } else if (conn.to.device === currentDevice) {
                        nextDevice = conn.from.device;
                    }
                }
                
                if (nextDevice && !visited.has(nextDevice.id)) {
                    // インターネット接続ルーターまたは直接接続デバイスを発見
                    if (nextDevice.type === 'router' && nextDevice.wanConfig?.isConnected) {
                        return nextDevice;
                    } else if ((nextDevice.type === 'pc' || nextDevice.type === 'server') && nextDevice.config.isInternetConnected) {
                        return nextDevice;
                    }
                    
                    visited.add(nextDevice.id);
                    queue.push(nextDevice);
                }
            }
        }
        
        return null; // インターネット接続が見つからない
    }

    // 接続されたデバイスを取得
    getConnectedDevices(device) {
        const connected = [];
        for (const connection of this.connections) {
            if (connection.from?.device === device || connection.from?.deviceId === device.id) {
                const connectedDevice = connection.to?.device || this.devices.get(connection.to?.deviceId);
                if (connectedDevice) connected.push(connectedDevice);
            } else if (connection.to?.device === device || connection.to?.deviceId === device.id) {
                const connectedDevice = connection.from?.device || this.devices.get(connection.from?.deviceId);
                if (connectedDevice) connected.push(connectedDevice);
            }
        }
        return connected;
    }

    // 経路ベースのPingアニメーション
    async animatePingWithPath(sourceDevice, targetDevice, path) {
        try {
            const startTime = Date.now();
            
            // ネットワーク情報を取得
            const sourceNetwork = this.getNetworkAddress(sourceDevice.config.ipAddress, sourceDevice.config.subnetMask);
            const targetNetwork = this.getNetworkAddress(targetDevice.config.ipAddress, targetDevice.config.subnetMask);
            const isSameSubnet = sourceNetwork === targetNetwork;
            const routingType = isSameSubnet ? '直接通信' : 'ルーター経由';
            
            // 経路情報を生成
            const routeInfo = path.map(device => `${device.name}(${device.config.ipAddress})`).join(' → ');
            
            // デバッグ: パス情報の詳細出力
            console.log('🎯 Pingアニメーション実行パス:');
            console.log('  元パス:', path.map(d => d.name).join(' → '));
            console.log('  デバイス詳細:', path.map(d => `${d.name}(${d.type})`).join(' → '));
            console.log('  IP情報:', routeInfo);
            
            // ICMP Request（送信元 → 送信先）
            this.updateStatus(`🚀 ICMP Request送信: ${sourceDevice.config.ipAddress} → ${targetDevice.config.ipAddress} (${routingType})`);
            await this.queuedAnimatePacketAlongPath(path, '🔵 ICMP Request', '#2196f3', {
                sourceDevice: sourceDevice,
                targetDevice: targetDevice
            });
            
            await this.sleep(300);
            
            // ICMP Reply（送信先 → 送信元）
            this.updateStatus(`⬅️ ICMP Reply受信: ${targetDevice.config.ipAddress} → ${sourceDevice.config.ipAddress}`);
            const reversePath = [...path].reverse();
            await this.queuedAnimatePacketAlongPath(reversePath, '🟢 ICMP Reply', '#4caf50', {
                sourceDevice: targetDevice,
                targetDevice: sourceDevice
            });
            
            const endTime = Date.now();
            const rtt = endTime - startTime; // Round Trip Time
            
            // 詳細な成功メッセージ
            const detailedResult = [
                `✅ Ping成功`,
                `送信元: ${sourceDevice.name} (${sourceDevice.config.ipAddress})`,
                `送信先: ${targetDevice.name} (${targetDevice.config.ipAddress})`,
                `ネットワーク: ${sourceNetwork} → ${targetNetwork}`,
                `経路: ${routeInfo}`,
                `ホップ数: ${path.length - 1}`,
                `RTT: ${rtt}ms`,
                `通信方式: ${routingType}`
            ].join(' | ');
            
            this.updateStatus(detailedResult);
        } catch (error) {
            this.updateStatus('❌ Ping失敗: パケット送信エラー');
        }
    }
    
    // 経路に沿ったパケットアニメーション（拡張版）
    // アニメーションキューに追加
    addToAnimationQueue(animationFunction) {
        return new Promise((resolve, reject) => {
            const queueItem = {
                execute: animationFunction,
                resolve,
                reject
            };
            
            this.animationQueue.push(queueItem);
            // console.log(`📋 アニメーションキューに追加 (キュー長: ${this.animationQueue.length})`);
            
            // キューが空いていればすぐに実行
            if (!this.isAnimationRunning) {
                this.processAnimationQueue();
            }
        });
    }
    
    // アニメーションキューを処理
    async processAnimationQueue() {
        if (this.isAnimationRunning || this.animationQueue.length === 0) {
            return;
        }
        
        this.isAnimationRunning = true;
        // console.log(`🎬 アニメーションキュー処理開始 (${this.animationQueue.length}件待機中)`);
        
        while (this.animationQueue.length > 0) {
            const queueItem = this.animationQueue.shift();
            
            try {
                // console.log(`▶️ アニメーション実行中... (残り${this.animationQueue.length}件)`);
                const result = await queueItem.execute();
                queueItem.resolve(result);
                // console.log(`✅ アニメーション完了`);
            } catch (error) {
                console.error(`❌ アニメーションエラー:`, error);
                queueItem.reject(error);
            }
        }
        
        this.isAnimationRunning = false;
        // console.log(`🏁 アニメーションキュー処理完了`);
    }
    
    // キューを使ったアニメーション実行（外部からの呼び出し用）
    async queuedAnimatePacketAlongPath(path, label, color, options = {}) {
        return this.addToAnimationQueue(async () => {
            return this.animatePacketAlongPath(path, label, color, options);
        });
    }
    
    // 2デバイス間の接続を取得
    findConnectionBetween(devA, devB) {
        if (!devA || !devB) return null;
        return this.connections.find(conn => {
            if (conn.from && conn.to) {
                return (conn.from.device === devA && conn.to.device === devB) ||
                       (conn.from.device === devB && conn.to.device === devA);
            }
            if (conn.fromDevice && conn.toDevice) {
                return (conn.fromDevice === devA.id && conn.toDevice === devB.id) ||
                       (conn.fromDevice === devB.id && conn.toDevice === devA.id);
            }
            return false;
        });
    }

    // スイッチのフラッディング対象デバイス一覧を取得（受信ポートおよび本来の宛先を除く）
    getFloodingTargetDevices(switchDevice, inPortId, targetDevice) {
        const targets = [];
        for (const conn of this.connections) {
            let otherDev = null;
            let switchPort = null;
            if (conn.from?.device === switchDevice) {
                otherDev = conn.to?.device;
                switchPort = conn.from?.port;
            } else if (conn.to?.device === switchDevice) {
                otherDev = conn.from?.device;
                switchPort = conn.to?.port;
            }
            if (otherDev && otherDev !== targetDevice && switchPort && switchPort.id !== inPortId) {
                targets.push({ device: otherDev, port: switchPort });
            }
        }
        return targets;
    }

    // スイッチのホップ転送・フラッディング判定（送信パケットリストを構築）
    handleSwitchHopPackets(currentDev, nextDev, prevDev, sourceDevice, targetDevice, label, color, offsetX, offsetY) {
        // 1. 次ホップがスイッチの場合: パケット受信ポートで送信元MACを学習
        if (nextDev.type === 'switch') {
            if (!nextDev.macTable) nextDev.macTable = new Map();
            const conn = this.findConnectionBetween(currentDev, nextDev);
            if (conn) {
                const inPort = (conn.from.device === nextDev) ? conn.from.port : conn.to.port;
                const srcPort = (conn.from.device === currentDev) ? conn.from.port : conn.to.port;
                const srcMAC = this.getDeviceMAC(currentDev, srcPort?.id) || this.getDeviceMAC(sourceDevice);
                if (srcMAC && inPort) {
                    const normalizedSrcMAC = srcMAC.toUpperCase();
                    const wasLearned = nextDev.macTable.has(normalizedSrcMAC);
                    nextDev.macTable.set(normalizedSrcMAC, { portId: inPort.id, timestamp: Date.now() });
                    if (!wasLearned) {
                        console.log(`🔌 [${nextDev.name}] 新規MAC学習: ${normalizedSrcMAC} → ${inPort.label || inPort.id}`);
                    }
                }
            }
        }

        // 2. 現在ホップがスイッチの場合: 宛先MACに応じてフォワーディングまたはフラッディング
        if (currentDev.type === 'switch') {
            if (!currentDev.macTable) currentDev.macTable = new Map();
            const inConn = prevDev ? this.findConnectionBetween(currentDev, prevDev) : null;
            const inPort = inConn ? ((inConn.from.device === currentDev) ? inConn.from.port : inConn.to.port) : null;
            const outConn = this.findConnectionBetween(currentDev, nextDev);
            const outPort = outConn ? ((outConn.from.device === currentDev) ? outConn.from.port : outConn.to.port) : null;

            // 宛先MACの特定（同一LANならtargetDeviceのMAC、ルーター経由ならrouterのMAC）
            let dstMAC = null;
            if (targetDevice.type === 'router') {
                const routerNIC = this.identifyRouterNIC(targetDevice, targetDevice.config?.ipAddress);
                dstMAC = this.getDeviceMAC(targetDevice, routerNIC?.nicType) || this.getDeviceMAC(targetDevice);
            } else {
                dstMAC = this.getDeviceMAC(targetDevice) || this.getDeviceMAC(nextDev);
            }
            const normalizedDstMAC = dstMAC ? dstMAC.toUpperCase() : null;

            // MACテーブルに登録されているかチェック
            const isDstLearned = normalizedDstMAC && currentDev.macTable.has(normalizedDstMAC);

            const packetList = [];

            if (isDstLearned) {
                // 学習済み: MACテーブルを参照して該当ポートへのみフォワーディング
                const portLabel = outPort?.label || outPort?.id || 'Port';
                const msg = `🔌 [${currentDev.name}] 宛先MAC(${normalizedDstMAC})を検索 → ${portLabel}へスイッチング転送`;
                this.updateStatus(msg);
                console.log(msg);

                packetList.push({
                    fromDevice: currentDev,
                    toDevice: nextDev,
                    label: label,
                    color: color,
                    offsetX,
                    offsetY
                });
            } else {
                // 未学習: 全ポートへフラッディング（一斉同報）
                const msg = `📢 [${currentDev.name}] 宛先MAC(${normalizedDstMAC || '不明'})は未学習 → 受信ポート以外の全ポートへフラッディング`;
                this.updateStatus(msg);
                console.log(msg);

                // 本来の転送先（nextDev）へのパケット
                packetList.push({
                    fromDevice: currentDev,
                    toDevice: nextDev,
                    label: label,
                    color: color,
                    offsetX,
                    offsetY
                });

                // 受信ポート以外の他ポートの端末/機器へも同一パケットを一斉送信
                const floodingTargets = this.getFloodingTargetDevices(currentDev, inPort?.id, nextDev);
                floodingTargets.forEach(t => {
                    packetList.push({
                        fromDevice: currentDev,
                        toDevice: t.device,
                        label: label,
                        color: color,
                        offsetX,
                        offsetY
                    });
                });
            }

            return packetList;
        }

        // 通常ノード（PC等）からの送信
        return [{ fromDevice: currentDev, toDevice: nextDev, label, color, offsetX, offsetY }];
    }


    // パスに沿ったパケットアニメーション（L2スイッチング / フラッディング演出対応）
    async animatePacketAlongPath(path, label, color, options = {}) {
        if (path.length < 2) return;

        const sourceDevice = options.sourceDevice || path[0];
        const targetDevice = options.targetDevice || path[path.length - 1];

        // 送信元のARP解決
        if (sourceDevice && targetDevice && sourceDevice.arpTable && sourceDevice.config?.ipAddress && targetDevice.config?.ipAddress) {
            const isSameSubnet = this.isInSameSubnet(
                sourceDevice.config.ipAddress, 
                targetDevice.config.ipAddress, 
                sourceDevice.config.subnetMask || '255.255.255.0'
            );

            if (isSameSubnet) {
                const targetMAC = this.getDeviceMAC(targetDevice);
                if (targetMAC) sourceDevice.arpTable.set(targetDevice.config.ipAddress, targetMAC);
            } else {
                const gwIP = sourceDevice.config.defaultGateway;
                const router = path.find(d => d.type === 'router');
                if (router && gwIP) {
                    const routerNIC = this.identifyRouterNIC(router, gwIP);
                    const routerMAC = this.getDeviceMAC(router, routerNIC?.nicType) || this.getDeviceMAC(router);
                    if (routerMAC) sourceDevice.arpTable.set(gwIP, routerMAC);
                }
            }
        }

        const {
            hopDelay = 200,
            packetDuration = 1000,
            offsetX = 0,
            offsetY = 0,
            onHopComplete = null,
            onComplete = null
        } = options;
        
        const speedMultiplier = window.animationSpeedMultiplier || 1.0;
        const adjustedHopDelay = Math.max(10, hopDelay / speedMultiplier);
        const adjustedPacketDuration = Math.max(50, packetDuration / speedMultiplier);
        
        let currentLabel = label;
        console.log(`📡 経路アニメーション開始: ${label} (${path.length}ホップ)`);
        
        for (let i = 0; i < path.length - 1; i++) {
            const currentDev = path[i];
            const nextDev = path[i + 1];
            const prevDev = (i > 0) ? path[i - 1] : null;

            // ルーター中継時のNAT (NAPT / IPマスカレード) 処理 & 可視化
            if (currentDev.type === 'router') {
                const isOutbound = this.isOutboundTraffic(currentDev, path, i, sourceDevice, targetDevice);
                const isInbound = this.isInboundTraffic(currentDev, path, i, sourceDevice, targetDevice);

                if (isOutbound) {
                    if (currentDev.natEnabled === false) {
                        const errMsg = `❌ NAT無効: プライベートIP (${sourceDevice.config?.ipAddress}) はインターネット上へ直接ルーティングできません。ルーターのNATを有効にしてください。`;
                        this.updateStatus(errMsg);
                        this.showDeviceToast(currentDev, `❌ NAT無効<br>プライベートIP転送不可`, 'snat');
                        await this.blinkDevicesRed([currentDev]);
                        return;
                    }

                    const natResult = this.processOutboundNAT(currentDev, sourceDevice, targetDevice, currentLabel, options);
                    if (natResult) {
                        currentLabel = natResult.translatedLabel;
                    }
                } else if (isInbound) {
                    const natResult = this.processInboundNAT(currentDev, sourceDevice, targetDevice, currentLabel, options);
                    if (natResult) {
                        currentLabel = natResult.translatedLabel;
                    }
                }
            }

            // スイッチホップ判定（送信パケット一覧を取得）
            const packetsToSend = this.handleSwitchHopPackets(
                currentDev, nextDev, prevDev, 
                sourceDevice, targetDevice, currentLabel, color,
                offsetX, offsetY
            );

            // 宛先端末に到達した時、宛先端末のARPテーブルにも送信元を登録
            if (i === path.length - 2 && nextDev.arpTable && sourceDevice.config?.ipAddress) {
                const srcMAC = this.getDeviceMAC(sourceDevice);
                if (srcMAC) nextDev.arpTable.set(sourceDevice.config.ipAddress, srcMAC);
            }

            console.log(`  ホップ ${i + 1}: ${currentDev.name} → ${nextDev.name} (${packetsToSend.length}パケット並行送信)`);
            
            // 複数パケット（フラッディング含む）を完全に同時にアニメーション！
            await this.animatePacketsParallel(packetsToSend, adjustedPacketDuration);
            
            if (onHopComplete) {
                onHopComplete(i, currentDev, nextDev);
            }
            
            if (i < path.length - 2 && adjustedHopDelay > 0) {
                await this.sleep(adjustedHopDelay);
            }
        }
        
        console.log(`✅ 経路アニメーション完了: ${label}`);
        
        if (onComplete) {
            onComplete();
        }
    }
    
    // 従来のPingアニメーション（後方互換性のため保持）
    async animatePing(sourceDevice, targetDevice) {
        // ICMPパケット（往復）
        try {
            // Request
            await this.animatePacket(
                sourceDevice, 
                targetDevice, 
                '🔵 ICMP Request', 
                '#2196f3'
            );
            
            await this.sleep(200);
            
            // Reply
            await this.animatePacket(
                targetDevice, 
                sourceDevice, 
                '🟢 ICMP Reply', 
                '#4caf50'
            );
            
            this.updateStatus(`Ping成功: ${sourceDevice.config.ipAddress} ↔ ${targetDevice.config.ipAddress}`);
        } catch (error) {
            this.updateStatus('Ping失敗: 接続エラー');
        }
    }

    // 2つのデバイス間の接続線のパスを取得（drawConnection関数と同じロジック）
    getConnectionPath(fromDevice, toDevice) {
        
        // デバイス間の接続を検索（新旧両方の形式をサポート）
        const connection = this.connections.find(conn => {
            
            if (conn.from && conn.to) {
                // 新しい形式
                    
                const match = (conn.from.device === fromDevice && conn.to.device === toDevice) ||
                             (conn.from.device === toDevice && conn.to.device === fromDevice);
                             
                if (match) {
                    console.log(`  接続発見: ${conn.from.device.name} → ${conn.to.device.name} (id: ${conn.id})`);
                }
                return match;
            } else {
                // 古い形式
                const match = (conn.fromDevice === fromDevice.id && conn.toDevice === toDevice.id) ||
                             (conn.fromDevice === toDevice.id && conn.toDevice === fromDevice.id);
                             
                if (match) {
                    console.log(`  接続発見(旧): ${conn.fromDevice} → ${conn.toDevice} (id: ${conn.id})`);
                }
                return match;
            }
        });
        
        if (!connection) {
            // 接続が見つからない場合は直線パス
            return {
                startX: fromDevice.x + fromDevice.width / 2,
                startY: fromDevice.y + fromDevice.height / 2,
                endX: toDevice.x + toDevice.width / 2,
                endY: toDevice.y + toDevice.height / 2,
                cp1X: 0, cp1Y: 0, cp2X: 0, cp2Y: 0,
                isBezier: false
            };
        }
        
        
        // 正確なポート位置を取得（drawConnectionと同じロジック）
        let actualFromDevice, actualToDevice, fromPortId, toPortId;
        
        if (connection.from && connection.to) {
            // 新しい形式
            actualFromDevice = connection.from.device;
            actualToDevice = connection.to.device;
            fromPortId = connection.from.port.id;
            toPortId = connection.to.port.id;
        } else {
            // 古い形式
            actualFromDevice = this.devices.get(connection.fromDevice);
            actualToDevice = this.devices.get(connection.toDevice);
            fromPortId = connection.fromPort;
            toPortId = connection.toPort;
        }
        
        if (!actualFromDevice || !actualToDevice) {
            return {
                startX: fromDevice.x + fromDevice.width / 2,
                startY: fromDevice.y + fromDevice.height / 2,
                endX: toDevice.x + toDevice.width / 2,
                endY: toDevice.y + toDevice.height / 2,
                cp1X: 0, cp1Y: 0, cp2X: 0, cp2Y: 0,
                isBezier: false
            };
        }
        
        // 実際のポート位置を取得（動的NICポート対応）
        let fromPort, toPort;
        
        // 要求されたfromDevice/toDeviceに対応するポート位置を取得
        if (actualFromDevice === fromDevice) {
            // 接続の方向が要求方向と同じ場合
            fromPort = this.getPortPosition(actualFromDevice, fromPortId);
            toPort = this.getPortPosition(actualToDevice, toPortId);
        } else {
            // 接続の方向が要求方向と逆の場合
            fromPort = this.getPortPosition(actualToDevice, toPortId);
            toPort = this.getPortPosition(actualFromDevice, fromPortId);
        }
        
        if (!fromPort || !toPort) {
            return {
                startX: fromDevice.x + fromDevice.width / 2,
                startY: fromDevice.y + fromDevice.height / 2,
                endX: toDevice.x + toDevice.width / 2,
                endY: toDevice.y + toDevice.height / 2,
                cp1X: 0, cp1Y: 0, cp2X: 0, cp2Y: 0,
                isBezier: false
            };
        }
        
        // パケットの移動方向を決定
        const isForward = (actualFromDevice === fromDevice);
        
        // drawConnection関数と同じ制御点計算（ポートの向きに応じて設定）
        const controlOffset = 30;
        
        // ポートデータを取得して制御点の向きを決定
        let fromPortData, toPortData;
        if (isForward) {
            fromPortData = this.getPortData(actualFromDevice, fromPortId);
            toPortData = this.getPortData(actualToDevice, toPortId);
        } else {
            fromPortData = this.getPortData(actualToDevice, toPortId);
            toPortData = this.getPortData(actualFromDevice, fromPortId);
        }
        
        let cp1x, cp1y, cp2x, cp2y;

        // 同一デバイス内の異なるNIC間接続の場合、視覚的に分かりやすいパスで表示
        const isLoopConnection = actualFromDevice === actualToDevice && fromPortId !== toPortId;

        if (isLoopConnection) {
            // ループ接続の場合、デバイスの外側を迂回する大きなカーブを描画
            const deviceCenterX = actualFromDevice.x + actualFromDevice.width / 2;
            const deviceCenterY = actualFromDevice.y + actualFromDevice.height / 2;
            const loopOffset = Math.max(actualFromDevice.width, actualFromDevice.height) * 0.8;

            // デバイスの右側を迂回するパス
            cp1x = fromPort.x + loopOffset;
            cp1y = fromPort.y - loopOffset / 2;
            cp2x = toPort.x + loopOffset;
            cp2y = toPort.y + loopOffset / 2;
        } else {
            // 通常の接続の場合
            // 送信元ポートの制御点を側面に応じて設定（相手に向かう方向）
            const dx = toPort.x - fromPort.x;
            const dy = toPort.y - fromPort.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const normalizedDx = length > 0 ? dx / length : 0;
            const normalizedDy = length > 0 ? dy / length : 0;

            switch (fromPortData?.side) {
                case 'right':
                    cp1x = fromPort.x + controlOffset;
                    cp1y = fromPort.y;
                    break;
                case 'left':
                    cp1x = fromPort.x - controlOffset;
                    cp1y = fromPort.y;
                    break;
                case 'top':
                    cp1x = fromPort.x;
                    cp1y = fromPort.y - controlOffset;
                    break;
                case 'bottom':
                    cp1x = fromPort.x;
                    cp1y = fromPort.y + controlOffset;
                    break;
                default:
                    // 相手の方向を考慮したデフォルト制御点
                    cp1x = fromPort.x + normalizedDx * controlOffset;
                    cp1y = fromPort.y + normalizedDy * controlOffset;
            }

            // 宛先ポートの制御点を側面に応じて設定（送信元から来る方向）
            switch (toPortData?.side) {
                case 'right':
                    cp2x = toPort.x + controlOffset;
                    cp2y = toPort.y;
                    break;
                case 'left':
                    cp2x = toPort.x - controlOffset;
                    cp2y = toPort.y;
                    break;
                case 'top':
                    cp2x = toPort.x;
                    cp2y = toPort.y - controlOffset;
                    break;
                case 'bottom':
                    cp2x = toPort.x;
                    cp2y = toPort.y + controlOffset;
                    break;
                default:
                    // 送信元から来る方向を考慮したデフォルト制御点
                    cp2x = toPort.x - normalizedDx * controlOffset;
                    cp2y = toPort.y - normalizedDy * controlOffset;
            }
        }
        
        console.log(`🔍 getConnectionPath: ${fromDevice.name} → ${toDevice.name}`);
        console.log(`  接続情報: ${actualFromDevice.name} → ${actualToDevice.name}`);
        console.log(`  方向判定: isForward = ${isForward}`);
        console.log(`  ポート位置: from(${fromPort.x}, ${fromPort.y}) → to(${toPort.x}, ${toPort.y})`);
        
        // fromPort と toPort は既に要求方向に合わせて取得済みなので、そのまま使用
        const result = {
            startX: fromPort.x,
            startY: fromPort.y,
            endX: toPort.x,
            endY: toPort.y,
            cp1X: cp1x, cp1Y: cp1y,
            cp2X: cp2x, cp2Y: cp2y,
            isBezier: true
        };
        
        console.log(`  結果パス: start(${result.startX}, ${result.startY}) → end(${result.endX}, ${result.endY})`);
        console.log(`  制御点: cp1(${result.cp1X}, ${result.cp1Y}) cp2(${result.cp2X}, ${result.cp2Y})`);
        console.log(`  ポート側面: from=${fromPortData?.side} to=${toPortData?.side}`);
        return result;
    }
    
    // デバイスの指定IDのポートを取得
    getPortById(device, portId) {
        if (!device.ports || !device.ports.nics) return null;
        return device.ports.nics.find(port => port.id === portId);
    }
    
    // 3次ベジェ曲線上の点を計算（drawConnection関数と同じ式）
    getPointOnCubicBezierCurve(t, startX, startY, cp1X, cp1Y, cp2X, cp2Y, endX, endY) {
        // drawConnection関数で使われているのと全く同じ3次ベジェ曲線の公式
        const x = Math.pow(1-t, 3) * startX + 
                  3 * Math.pow(1-t, 2) * t * cp1X + 
                  3 * (1-t) * Math.pow(t, 2) * cp2X + 
                  Math.pow(t, 3) * endX;
                  
        const y = Math.pow(1-t, 3) * startY + 
                  3 * Math.pow(1-t, 2) * t * cp1Y + 
                  3 * (1-t) * Math.pow(t, 2) * cp2Y + 
                  Math.pow(t, 3) * endY;
        
        return { x, y };
    }

    // パケットアニメーション（単一）
    async animatePacket(fromDevice, toDevice, label, color, options = {}) {
        const { duration = 1000, offsetX = 0, offsetY = 0, onComplete = null } = options;
        await this.animatePacketsParallel([
            { fromDevice, toDevice, label, color, offsetX, offsetY }
        ], duration);
        if (onComplete) onComplete();
    }

    // 複数パケット並行アニメーション（フラッディング等の同時移動対応）
    async animatePacketsParallel(packetRequests, duration = 1000) {
        if (!packetRequests || packetRequests.length === 0) return;

        return new Promise((resolve) => {
            const packets = packetRequests.map(req => {
                const connectionPath = this.getConnectionPath(req.fromDevice, req.toDevice);
                return {
                    fromDevice: req.fromDevice,
                    toDevice: req.toDevice,
                    label: req.label,
                    color: req.color,
                    path: connectionPath,
                    progress: 0,
                    x: connectionPath.startX + (req.offsetX || 0),
                    y: connectionPath.startY + (req.offsetY || 0),
                    offsetX: req.offsetX || 0,
                    offsetY: req.offsetY || 0
                };
            });

            const startTime = Date.now();

            const animate = () => {
                const elapsed = Date.now() - startTime;
                const progress = Math.min(elapsed / duration, 1);
                const easeProgress = 1 - Math.pow(1 - progress, 3);

                packets.forEach(packet => {
                    packet.progress = progress;
                    if (packet.path.isBezier) {
                        const point = this.getPointOnCubicBezierCurve(
                            easeProgress,
                            packet.path.startX, packet.path.startY,
                            packet.path.cp1X, packet.path.cp1Y,
                            packet.path.cp2X, packet.path.cp2Y,
                            packet.path.endX, packet.path.endY
                        );
                        packet.x = point.x;
                        packet.y = point.y;
                    } else {
                        packet.x = packet.path.startX + (packet.path.endX - packet.path.startX) * easeProgress;
                        packet.y = packet.path.startY + (packet.path.endY - packet.path.startY) * easeProgress;
                    }
                });

                this.renderWithPackets(packets);

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    this.render();
                    resolve();
                }
            };

            animate();
        });
    }

    // 複数パケット付きで描画
    renderWithPackets(packets) {
        this.render();
        
        this.ctx.save();
        this.ctx.translate(this.panX, this.panY);
        this.ctx.scale(this.scale, this.scale);
        
        for (const packet of packets) {
            this.ctx.fillStyle = packet.color;
            this.ctx.strokeStyle = '#fff';
            this.ctx.lineWidth = 2;
            
            this.ctx.beginPath();
            this.ctx.arc(packet.x, packet.y, 8, 0, 2 * Math.PI);
            this.ctx.fill();
            this.ctx.stroke();
            
            this.ctx.font = '10px Arial';
            this.ctx.fillStyle = '#333';
            this.ctx.textAlign = 'center';
            this.ctx.fillText(packet.label, packet.x, packet.y - 15);
        }
        
        this.ctx.restore();
    }

    // 後方互換性用
    renderWithPacket(packet) {
        this.renderWithPackets([packet]);
    }

    // スリープ関数
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // デバイス設定ダイアログ表示
    showDeviceConfig() {
        if (!this.selectedDevice) {
            this.updateStatus('設定するデバイスを選択してください');
            return;
        }
        
        // ONUは設定なし（パススルーデバイス）
        if (this.selectedDevice.type === 'onu') {
            this.updateStatus('ONUには設定項目がありません（パススルーデバイス）');
            return;
        }
        
        this.currentDeviceConfig = this.selectedDevice;
        
        document.getElementById('dialog-title').textContent = `${this.selectedDevice.name} の設定`;
        document.getElementById('device-name').value = this.selectedDevice.name;

        // 基本ネットワーク設定（PC, サーバー, DNS用）
        const basicNetworkConfig = document.getElementById('basic-network-config');
        const switchConfigSection = document.getElementById('switch-config-section');

        if (this.selectedDevice.type === 'switch') {
            // スイッチの場合は基本ネットワーク設定を非表示にし、スイッチ専用セクションを表示
            if (basicNetworkConfig) basicNetworkConfig.style.display = 'none';
            if (switchConfigSection) {
                switchConfigSection.style.display = 'block';
                this.loadSwitchConfig(this.selectedDevice);
            }
        } else {
            if (switchConfigSection) switchConfigSection.style.display = 'none';

            if (this.selectedDevice.type === 'router' || this.selectedDevice.type === 'internet') {
                // ルーター・インターネットの場合は基本ネットワーク設定を非表示
                if (basicNetworkConfig) basicNetworkConfig.style.display = 'none';
            } else {
                // その他のデバイス（PC、サーバー、DNS等）の場合は基本ネットワーク設定を表示し、値を設定
                if (basicNetworkConfig) basicNetworkConfig.style.display = 'block';
                
                const macElem = document.getElementById('device-mac-address');
                if (macElem) {
                    if (!this.selectedDevice.macAddress) {
                        this.selectedDevice.macAddress = this.generateMACAddress(this.selectedDevice.type, 1);
                    }
                    macElem.value = this.selectedDevice.macAddress;
                }

                document.getElementById('ip-address').value = this.selectedDevice.config.ipAddress || '';
                document.getElementById('subnet-mask').value = this.selectedDevice.config.subnetMask || '';
                document.getElementById('default-gateway').value = this.selectedDevice.config.defaultGateway || '';

                // ARPテーブルの読み込み
                this.loadARPTable(this.selectedDevice);
            }
        }
        
        // WAN設定（ルーターのみ表示）
        const wanConfigSection = document.getElementById('wan-config-section');
        if (wanConfigSection) {
            if (this.selectedDevice.type === 'router') {
                wanConfigSection.style.display = 'block';
                this.loadWANConfig();
            } else {
                wanConfigSection.style.display = 'none';
            }
        }

        // NAT設定（ルーターのみ表示）
        const natConfigSection = document.getElementById('nat-config-section');
        if (natConfigSection) {
            if (this.selectedDevice.type === 'router') {
                natConfigSection.style.display = 'block';
                this.loadNATConfig(this.selectedDevice);
            } else {
                natConfigSection.style.display = 'none';
            }
        }

        // DHCPサーバー設定（ルーターのみ表示）
        const dhcpServerSection = document.getElementById('dhcp-server-section');
        if (dhcpServerSection && this.selectedDevice.type === 'router') {
            dhcpServerSection.style.display = 'block';
            
            // MAC アドレスが存在しない場合は補完
            if (!this.selectedDevice.config.lan1.macAddress) this.selectedDevice.config.lan1.macAddress = this.generateMACAddress('router-lan1', 1);
            if (!this.selectedDevice.config.lan2.macAddress) this.selectedDevice.config.lan2.macAddress = this.generateMACAddress('router-lan2', 1);
            if (!this.selectedDevice.config.lan3.macAddress) this.selectedDevice.config.lan3.macAddress = this.generateMACAddress('router-lan3', 1);

            const lan1MacElem = document.getElementById('lan1-mac-address');
            if (lan1MacElem) lan1MacElem.value = this.selectedDevice.config.lan1.macAddress;
            const lan2MacElem = document.getElementById('lan2-mac-address');
            if (lan2MacElem) lan2MacElem.value = this.selectedDevice.config.lan2.macAddress;
            const lan3MacElem = document.getElementById('lan3-mac-address');
            if (lan3MacElem) lan3MacElem.value = this.selectedDevice.config.lan3.macAddress;

            // LAN1 設定
            document.getElementById('lan1-ip').value = this.selectedDevice.config.lan1.ipAddress;
            document.getElementById('lan1-subnet-mask').value = this.selectedDevice.config.lan1.subnetMask || '255.255.255.0';
            document.getElementById('lan1-default-gateway').value = this.selectedDevice.config.lan1.defaultGateway || this.selectedDevice.config.lan1.ipAddress;
            document.getElementById('lan1-dhcp-enabled').checked = this.selectedDevice.config.lan1.dhcpEnabled;
            document.getElementById('lan1-pool-start').value = this.selectedDevice.config.lan1.dhcpPoolStart;
            document.getElementById('lan1-pool-end').value = this.selectedDevice.config.lan1.dhcpPoolEnd;

            // LAN2 設定
            document.getElementById('lan2-ip').value = this.selectedDevice.config.lan2.ipAddress;
            document.getElementById('lan2-subnet-mask').value = this.selectedDevice.config.lan2.subnetMask || '255.255.255.0';
            document.getElementById('lan2-default-gateway').value = this.selectedDevice.config.lan2.defaultGateway || this.selectedDevice.config.lan2.ipAddress;
            document.getElementById('lan2-dhcp-enabled').checked = this.selectedDevice.config.lan2.dhcpEnabled;
            document.getElementById('lan2-pool-start').value = this.selectedDevice.config.lan2.dhcpPoolStart;
            document.getElementById('lan2-pool-end').value = this.selectedDevice.config.lan2.dhcpPoolEnd;

            // LAN3 設定
            document.getElementById('lan3-ip').value = this.selectedDevice.config.lan3.ipAddress;
            document.getElementById('lan3-subnet-mask').value = this.selectedDevice.config.lan3.subnetMask || '255.255.255.0';
            document.getElementById('lan3-default-gateway').value = this.selectedDevice.config.lan3.defaultGateway || this.selectedDevice.config.lan3.ipAddress;
            document.getElementById('lan3-dhcp-enabled').checked = this.selectedDevice.config.lan3.dhcpEnabled;
            document.getElementById('lan3-pool-start').value = this.selectedDevice.config.lan3.dhcpPoolStart;
            document.getElementById('lan3-pool-end').value = this.selectedDevice.config.lan3.dhcpPoolEnd;
            
            // 共通設定
            document.getElementById('dhcp-lease-time').value = this.selectedDevice.config.dhcpLeaseTime;
        } else if (dhcpServerSection) {
            dhcpServerSection.style.display = 'none';
        }

        // DNS サーバー設定（DNSサーバーのみ表示）
        const dnsServerSection = document.getElementById('dns-server-section');
        if (dnsServerSection && this.selectedDevice.type === 'dns') {
            dnsServerSection.style.display = 'block';
            this.loadDNSTable();

            // DNS レコード追加ボタンのイベントリスナー設定
            const addDnsRecordBtn = document.getElementById('add-dns-record');
            addDnsRecordBtn.removeEventListener('click', this.addDNSRecord);
            addDnsRecordBtn.addEventListener('click', this.addDNSRecord.bind(this));
        } else if (dnsServerSection) {
            dnsServerSection.style.display = 'none';
        }

        // インターネットデバイス設定（インターネットデバイスのみ表示）
        const internetIspSection = document.getElementById('internet-isp-section');
        if (internetIspSection && this.selectedDevice.type === 'internet') {
            internetIspSection.style.display = 'block';
            this.loadInternetISPConfig();
        } else if (internetIspSection) {
            internetIspSection.style.display = 'none';
        }

        document.getElementById('dialog-overlay').style.display = 'block';
        document.getElementById('device-config-dialog').style.display = 'block';
        
        // WAN DHCPチェックボックスの変更イベントを設定（ルーターのみ）
        if (this.selectedDevice.type === 'router') {
            const wanDhcpCheckbox = document.getElementById('wan-dhcp-enabled');
            if (wanDhcpCheckbox) {
                wanDhcpCheckbox.addEventListener('change', (e) => {
                    this.toggleWANFields(e.target.checked);
                });
            }
        }
        
        // Enterキーで保存機能を追加
        this.setupEnterKeyForDeviceConfig();
        
        // ダイアログのドラッグ機能を初期化
        this.initializeDialogDragging('device-config-dialog');
    }

    // インターネットデバイスのISP設定を読み込み
    loadInternetISPConfig() {
        const config = this.selectedDevice.config;

        console.log('🔍 インターネットデバイス設定を読み込み中:', this.selectedDevice.name);

        // ISP1-6の設定を読み込み
        ['isp1', 'isp2', 'isp3', 'isp4', 'isp5', 'isp6'].forEach(ispId => {
            const isp = config[ispId];
            if (isp) {
                console.log(`${ispId}: ${isp.dhcpPoolStart} - ${isp.dhcpPoolEnd} (DHCP: ${isp.dhcpEnabled})`);
                document.getElementById(`${ispId}-dhcp-enabled`).checked = isp.dhcpEnabled;
                document.getElementById(`${ispId}-pool-start`).value = isp.dhcpPoolStart;
                document.getElementById(`${ispId}-pool-end`).value = isp.dhcpPoolEnd;
            } else {
                console.warn(`${ispId}の設定が見つかりません`);
            }
        });

        // 共通設定を読み込み
        document.getElementById('isp-lease-time').value = config.dhcpLeaseTime || 3600;
    }

    // WAN設定読み込み
    loadWANConfig() {
        const router = this.selectedDevice;
        const wanConfig = router.wanConfig || {};
        
        // WAN MACアドレス設定
        if (!wanConfig.macAddress) {
            wanConfig.macAddress = this.generateMACAddress('router-wan', 1);
        }
        const wanMacElem = document.getElementById('wan-mac-address');
        if (wanMacElem) wanMacElem.value = wanConfig.macAddress;

        // WAN DHCP設定
        const wanDhcpEnabled = wanConfig.dhcpEnabled || false;
        document.getElementById('wan-dhcp-enabled').checked = wanDhcpEnabled;
        
        // WAN手動設定
        document.getElementById('wan-ip-address').value = wanConfig.ipAddress || '';
        document.getElementById('wan-subnet-mask').value = wanConfig.subnetMask || '255.255.255.0';
        document.getElementById('wan-default-gateway').value = wanConfig.defaultGateway || '';
        
        // フィールドの有効/無効状態を設定
        this.toggleWANFields(wanDhcpEnabled);
    }

    // スイッチ設定・ポート・MACアドレステーブル読み込み
    loadSwitchConfig(switchDevice) {
        if (!switchDevice.macTable) {
            switchDevice.macTable = new Map();
        }

        // 1. ポート状態テーブルの描画
        const portsBody = document.getElementById('switch-ports-body');
        if (portsBody) {
            const ports = switchDevice.ports?.nics || [];
            let html = '';
            
            ports.forEach(port => {
                let connectedInfo = null;
                for (const conn of this.connections) {
                    if (conn.from?.device === switchDevice && conn.from?.port?.id === port.id) {
                        connectedInfo = { device: conn.to.device, port: conn.to.port };
                        break;
                    } else if (conn.to?.device === switchDevice && conn.to?.port?.id === port.id) {
                        connectedInfo = { device: conn.from.device, port: conn.from.port };
                        break;
                    }
                }

                if (connectedInfo && connectedInfo.device) {
                    const devName = connectedInfo.device.name;
                    const portLabel = connectedInfo.port?.label || connectedInfo.port?.id || '';
                    html += `<tr><td><strong>${port.label}</strong></td><td><span class="status-badge connected">UP</span></td><td>${devName} (${portLabel})</td></tr>`;
                } else {
                    html += `<tr><td><strong>${port.label}</strong></td><td><span class="status-badge disconnected">DOWN</span></td><td style="color: #94a3b8; font-style: italic;">未接続</td></tr>`;
                }
            });

            portsBody.innerHTML = html;
        }

        // 2. MACアドレステーブルの描画
        this.renderSwitchMACTable(switchDevice);

        // 3. クリアボタンのイベントリスナー設定
        const clearBtn = document.getElementById('clear-mac-table-btn');
        if (clearBtn) {
            clearBtn.onclick = () => {
                switchDevice.macTable.clear();
                this.renderSwitchMACTable(switchDevice);
                this.updateStatus(`🔌 ${switchDevice.name} のMACアドレステーブルをクリアしました`);
            };
        }
    }

    // スイッチのMACアドレステーブル描画
    renderSwitchMACTable(switchDevice) {
        const macBody = document.getElementById('switch-mac-table-body');
        if (!macBody) return;

        if (!switchDevice.macTable || switchDevice.macTable.size === 0) {
            macBody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #94a3b8; font-style: italic;">学習済みエントリなし</td></tr>';
            return;
        }

        let html = '';
        switchDevice.macTable.forEach((entry, mac) => {
            const portId = typeof entry === 'string' ? entry : entry.portId;
            const port = (switchDevice.ports?.nics || []).find(p => p.id === portId);
            const portLabel = port ? port.label : portId;

            let deviceName = '-';
            for (const dev of this.devices.values()) {
                if (dev.macAddress === mac) {
                    deviceName = dev.name;
                    break;
                }
                if (dev.type === 'router') {
                    if (dev.wanConfig?.macAddress === mac) { deviceName = `${dev.name} (WAN)`; break; }
                    if (dev.config?.lan1?.macAddress === mac) { deviceName = `${dev.name} (LAN1)`; break; }
                    if (dev.config?.lan2?.macAddress === mac) { deviceName = `${dev.name} (LAN2)`; break; }
                    if (dev.config?.lan3?.macAddress === mac) { deviceName = `${dev.name} (LAN3)`; break; }
                }
            }

            html += `<tr><td><strong>${portLabel}</strong></td><td>${mac}</td><td>${deviceName}</td></tr>`;
        });

        macBody.innerHTML = html;
    }

    // ARPテーブル読み込み・描画
    loadARPTable(device) {
        if (!device.arpTable) {
            device.arpTable = new Map();
        }

        this.renderARPTable(device);

        const clearBtn = document.getElementById('clear-arp-btn');
        if (clearBtn) {
            clearBtn.onclick = () => {
                device.arpTable.clear();
                this.renderARPTable(device);
                this.updateStatus(`📋 ${device.name} のARPテーブルをクリアしました`);
            };
        }
    }

    // ARPテーブル描画
    renderARPTable(device) {
        const arpBody = document.getElementById('arp-table-body');
        if (!arpBody) return;

        if (!device.arpTable || device.arpTable.size === 0) {
            arpBody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: #94a3b8; font-style: italic;">エントリなし</td></tr>';
            return;
        }

        let html = '';
        device.arpTable.forEach((mac, ip) => {
            html += `<tr><td>${ip}</td><td>${mac}</td></tr>`;
        });

        arpBody.innerHTML = html;
    }

    // NAT設定読み込み
    loadNATConfig(router) {
        if (!router.natTable) {
            router.natTable = new Map();
        }
        if (router.natEnabled === undefined) {
            router.natEnabled = true;
        }

        const natCheckbox = document.getElementById('nat-enabled');
        if (natCheckbox) {
            natCheckbox.checked = router.natEnabled !== false;
        }

        this.renderNATTable(router);

        const clearBtn = document.getElementById('clear-nat-table-btn');
        if (clearBtn) {
            clearBtn.onclick = () => {
                router.natTable.clear();
                this.renderNATTable(router);
                this.updateStatus(`🔄 ${router.name} のNAT変換テーブルをクリアしました`);
            };
        }
    }

    // NATテーブル描画
    renderNATTable(router) {
        const natBody = document.getElementById('nat-table-body');
        if (!natBody) return;

        if (!router.natTable || router.natTable.size === 0) {
            natBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: #94a3b8; font-style: italic;">変換エントリなし</td></tr>';
            return;
        }

        let html = '';
        router.natTable.forEach((entry) => {
            const proto = entry.protocol || 'TCP';
            const local = (entry.insideLocalPort && entry.insideLocalPort !== '-') 
                ? `${entry.insideLocalIP}:${entry.insideLocalPort}` 
                : entry.insideLocalIP;
            const global = (entry.insideGlobalPort && entry.insideGlobalPort !== '-') 
                ? `${entry.insideGlobalIP}:${entry.insideGlobalPort}` 
                : entry.insideGlobalIP;
            const dest = (entry.outsideGlobalPort && entry.outsideGlobalPort !== '-') 
                ? `${entry.outsideGlobalIP}:${entry.outsideGlobalPort}` 
                : entry.outsideGlobalIP;
            const status = entry.status || 'ESTABLISHED';
            const badgeClass = (status === 'ESTABLISHED' || status === 'ACTIVE') ? 'connected' : 'disconnected';

            html += `<tr>
                <td><strong>${proto}</strong></td>
                <td style="font-family: monospace;">${local}</td>
                <td style="font-family: monospace; color: #059669; font-weight: bold;">${global}</td>
                <td style="font-family: monospace;">${dest}</td>
                <td><span class="status-badge ${badgeClass}">${status}</span></td>
            </tr>`;
        });

        natBody.innerHTML = html;
    }

    // デバイス上のフローティング通知表示（NAT変換アニメーション等）
    showDeviceToast(device, message, type = 'snat') {
        const container = this.canvas.parentElement;
        if (!container) return;

        const existing = container.querySelectorAll(`.device-nat-toast-${device.id}`);
        existing.forEach(el => el.remove());

        const toast = document.createElement('div');
        toast.className = `device-nat-toast device-nat-toast-${device.id}`;
        
        const posX = device.x * this.scale + this.panX + (device.width * this.scale) / 2;
        const posY = device.y * this.scale + this.panY - 12;

        toast.style.left = `${posX}px`;
        toast.style.top = `${posY}px`;
        let toastBg = 'rgba(5, 150, 105, 0.95)';
        if (type === 'snat') toastBg = 'rgba(5, 150, 105, 0.95)';
        else if (type === 'dnat') toastBg = 'rgba(37, 99, 235, 0.95)';
        else if (type === 'drop' || type === 'error') toastBg = 'rgba(220, 38, 38, 0.95)';
        else if (type === 'broadcast') toastBg = 'rgba(2, 132, 199, 0.95)';
        toast.style.backgroundColor = toastBg;
        toast.style.color = 'white';
        toast.innerHTML = message;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, -120%) scale(0.85)';
            setTimeout(() => toast.remove(), 300);
        }, 2600);
    }

    // LAN → WAN 方向の通信判定（SNAT / NAPT）
    isOutboundTraffic(router, path, hopIndex, sourceDevice, targetDevice) {
        if (!sourceDevice || !targetDevice) return false;
        
        const srcIP = sourceDevice.config?.ipAddress || '';
        const dstIP = targetDevice.config?.ipAddress || '';
        
        const isSrcPrivate = srcIP.startsWith('192.168.') || srcIP.startsWith('10.') || srcIP.startsWith('172.');
        const isDstGlobal = !dstIP.startsWith('192.168.') && !dstIP.startsWith('10.');
        const isForwardDirection = path.indexOf(sourceDevice) < hopIndex;
        
        return (isSrcPrivate && (isDstGlobal || targetDevice.type === 'internet' || targetDevice.type === 'server' || targetDevice.type === 'dns')) && isForwardDirection;
    }

    // WAN → LAN 方向の通信判定（DNAT / 逆変換）
    isInboundTraffic(router, path, hopIndex, sourceDevice, targetDevice) {
        if (!sourceDevice || !targetDevice) return false;
        
        const dstIP = targetDevice.config?.ipAddress || '';
        const srcIP = sourceDevice.config?.ipAddress || '';
        
        const isDstPrivate = dstIP.startsWith('192.168.') || dstIP.startsWith('10.') || dstIP.startsWith('172.');
        const isSrcGlobal = !srcIP.startsWith('192.168.') && !srcIP.startsWith('10.');
        
        return (isDstPrivate && (isSrcGlobal || sourceDevice.type === 'internet' || sourceDevice.type === 'server' || sourceDevice.type === 'dns'));
    }

    // SNAT (Source NAT / NAPT) 処理
    processOutboundNAT(router, sourceDevice, targetDevice, currentLabel, options = {}) {
        if (!router.natTable) router.natTable = new Map();

        const protocol = options.protocol || 
            (currentLabel.includes('SYN') || currentLabel.includes('ACK') || currentLabel.includes('FIN') || currentLabel.includes('TCP') ? 'TCP' :
            (currentLabel.includes('HTTP') ? 'HTTP' : 
            (currentLabel.includes('DNS') ? 'UDP' : 'ICMP')));

        const insideLocalIP = sourceDevice.config?.ipAddress || '192.168.1.10';
        
        let insideLocalPort = options.sourcePort;
        if (!insideLocalPort && protocol !== 'ICMP') {
            const devNum = parseInt(sourceDevice.id.replace(/\D/g, '')) || 1;
            insideLocalPort = 50000 + (devNum % 9000);
        }

        const insideGlobalIP = router.wanConfig?.ipAddress || router.config?.ipAddress || '203.0.113.10';
        const outsideGlobalIP = targetDevice.config?.ipAddress || '203.0.113.80';
        const outsideGlobalPort = options.destPort || (protocol === 'HTTP' ? 80 : (protocol === 'DNS' ? 53 : (protocol === 'TCP' ? 80 : '-')));

        const natKey = `${protocol}_${insideLocalIP}_${insideLocalPort || '-'}_${outsideGlobalIP}`;
        let entry = router.natTable.get(natKey);

        if (!entry) {
            router.nextNatPort = (router.nextNatPort || 10000) + 1;
            const allocatedPort = (protocol === 'ICMP') ? '-' : router.nextNatPort;
            entry = {
                id: `nat_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
                protocol,
                insideLocalIP,
                insideLocalPort: insideLocalPort || '-',
                insideGlobalIP,
                insideGlobalPort: allocatedPort,
                outsideGlobalIP,
                outsideGlobalPort: outsideGlobalPort || '-',
                status: 'ESTABLISHED',
                timestamp: new Date().toLocaleTimeString()
            };
            router.natTable.set(natKey, entry);
        }

        if (protocol === 'ICMP') {
            this.showDeviceToast(router, `🔄 NAT変換 (SNAT)<br><span style="font-family: monospace;">${insideLocalIP} ➔ ${insideGlobalIP}</span>`, 'snat');
            this.updateStatus(`🔄 [NAT変換] ${router.name}: 送信元IPを変換 (${insideLocalIP} → ${insideGlobalIP})`);
        } else {
            this.showDeviceToast(router, `🔄 NAPT変換 (IPマスカレード)<br><span style="font-family: monospace;">${insideLocalIP}:${insideLocalPort} ➔ ${insideGlobalIP}:${entry.insideGlobalPort}</span>`, 'snat');
            this.updateStatus(`🔄 [NAPT変換] ${router.name}: 送信元を変換 (${insideLocalIP}:${insideLocalPort} → ${insideGlobalIP}:${entry.insideGlobalPort})`);
        }

        let translatedLabel = currentLabel;
        if (protocol === 'ICMP') {
            translatedLabel = `🔵 ICMP Req [NAT: ${insideGlobalIP}]`;
        } else {
            const baseText = currentLabel.replace(/\[.*?\]/g, '').trim();
            translatedLabel = `${baseText} [NAT: ${insideGlobalIP}:${entry.insideGlobalPort}]`;
        }

        return { translatedLabel, entry };
    }

    // DNAT (Destination NAT / 逆変換) 処理
    processInboundNAT(router, sourceDevice, targetDevice, currentLabel, options = {}) {
        if (!router.natTable || router.natTable.size === 0) return null;

        const targetIP = targetDevice.config?.ipAddress;
        let matchingEntry = null;

        for (const entry of router.natTable.values()) {
            if (entry.insideLocalIP === targetIP) {
                matchingEntry = entry;
                break;
            }
        }

        if (!matchingEntry) {
            matchingEntry = Array.from(router.natTable.values())[0];
        }

        if (!matchingEntry) return null;

        if (matchingEntry.protocol === 'ICMP') {
            this.showDeviceToast(router, `🔄 NAT逆変換 (DNAT)<br><span style="font-family: monospace;">${matchingEntry.insideGlobalIP} ➔ ${matchingEntry.insideLocalIP}</span>`, 'dnat');
            this.updateStatus(`🔄 [NAT逆変換] ${router.name}: 宛先IPを内部アドレスに復元 (${matchingEntry.insideGlobalIP} → ${matchingEntry.insideLocalIP})`);
        } else {
            this.showDeviceToast(router, `🔄 NAPT逆変換 (宛先復元)<br><span style="font-family: monospace;">${matchingEntry.insideGlobalIP}:${matchingEntry.insideGlobalPort} ➔ ${matchingEntry.insideLocalIP}:${matchingEntry.insideLocalPort}</span>`, 'dnat');
            this.updateStatus(`🔄 [NAPT逆変換] ${router.name}: 宛先を内部アドレスに復元 (${matchingEntry.insideGlobalIP}:${matchingEntry.insideGlobalPort} → ${matchingEntry.insideLocalIP}:${matchingEntry.insideLocalPort})`);
        }

        let translatedLabel = currentLabel;
        if (matchingEntry.protocol === 'ICMP') {
            translatedLabel = `🟢 ICMP Reply [→${matchingEntry.insideLocalIP}]`;
        } else {
            const baseText = currentLabel.replace(/\[.*?\]/g, '').trim();
            const portSuffix = matchingEntry.insideLocalPort && matchingEntry.insideLocalPort !== '-' ? `:${matchingEntry.insideLocalPort}` : '';
            translatedLabel = `${baseText} [→${matchingEntry.insideLocalIP}${portSuffix}]`;
        }

        return { translatedLabel, entry: matchingEntry };
    }

    // ネットワーク構成全体のデータオブジェクトを取得
    getNetworkData() {
        const devicesData = Array.from(this.devices.values()).map(device => ({
            id: device.id,
            type: device.type,
            name: device.name,
            x: device.x,
            y: device.y,
            width: device.width,
            height: device.height,
            config: {
                ipAddress: device.config ? device.config.ipAddress : '',
                subnetMask: device.config ? device.config.subnetMask : '',
                defaultGateway: device.config ? device.config.defaultGateway : '',
                dnsServers: device.config ? device.config.dnsServers : [],
                dhcpEnabled: device.config ? device.config.dhcpEnabled : false,
                
                lan1: device.config && device.config.lan1 ? {
                    ipAddress: device.config.lan1.ipAddress,
                    subnetMask: device.config.lan1.subnetMask,
                    dhcpEnabled: device.config.lan1.dhcpEnabled,
                    dhcpPoolStart: device.config.lan1.dhcpPoolStart,
                    dhcpPoolEnd: device.config.lan1.dhcpPoolEnd,
                    dhcpAllocatedIPs: device.config.lan1.dhcpAllocatedIPs ?
                        Array.from(device.config.lan1.dhcpAllocatedIPs.entries()) : []
                } : undefined,

                lan2: device.config && device.config.lan2 ? {
                    ipAddress: device.config.lan2.ipAddress,
                    subnetMask: device.config.lan2.subnetMask,
                    dhcpEnabled: device.config.lan2.dhcpEnabled,
                    dhcpPoolStart: device.config.lan2.dhcpPoolStart,
                    dhcpPoolEnd: device.config.lan2.dhcpPoolEnd,
                    dhcpAllocatedIPs: device.config.lan2.dhcpAllocatedIPs ?
                        Array.from(device.config.lan2.dhcpAllocatedIPs.entries()) : []
                } : undefined,

                lan3: device.config && device.config.lan3 ? {
                    ipAddress: device.config.lan3.ipAddress,
                    subnetMask: device.config.lan3.subnetMask,
                    dhcpEnabled: device.config.lan3.dhcpEnabled,
                    dhcpPoolStart: device.config.lan3.dhcpPoolStart,
                    dhcpPoolEnd: device.config.lan3.dhcpPoolEnd,
                    dhcpAllocatedIPs: device.config.lan3.dhcpAllocatedIPs ?
                        Array.from(device.config.lan3.dhcpAllocatedIPs.entries()) : []
                } : undefined,

                ...['isp1', 'isp2', 'isp3', 'isp4', 'isp5', 'isp6'].reduce((isps, ispId) => {
                    const isp = device.config ? device.config[ispId] : null;
                    if (isp) {
                        isps[ispId] = {
                            dhcpEnabled: isp.dhcpEnabled,
                            name: isp.name,
                            network: isp.network,
                            ipAddress: isp.ipAddress,
                            subnetMask: isp.subnetMask,
                            dhcpPoolStart: isp.dhcpPoolStart,
                            dhcpPoolEnd: isp.dhcpPoolEnd,
                            dhcpAllocatedIPs: isp.dhcpAllocatedIPs ?
                                Array.from(isp.dhcpAllocatedIPs.entries()) : [],
                            gateway: isp.gateway
                        };
                    }
                    return isps;
                }, {}),

                dhcpPoolStart: device.config ? device.config.dhcpPoolStart : undefined,
                dhcpPoolEnd: device.config ? device.config.dhcpPoolEnd : undefined,
                dhcpAllocatedIPs: device.config && device.config.dhcpAllocatedIPs ?
                    Array.from(device.config.dhcpAllocatedIPs.entries()) : []
            },
            
            wanConfig: device.wanConfig ? {
                ipAddress: device.wanConfig.ipAddress,
                subnetMask: device.wanConfig.subnetMask,
                defaultGateway: device.wanConfig.defaultGateway,
                dhcpEnabled: device.wanConfig.dhcpEnabled,
                isConnected: device.wanConfig.isConnected
            } : undefined,

            natEnabled: device.natEnabled,
            natTable: device.natTable ? Array.from(device.natTable.values()) : undefined,
            nextNatPort: device.nextNatPort,
            dnsTable: device.dnsTable ? { ...device.dnsTable } : undefined,
            macAddress: device.macAddress,

            ports: {
                nics: device.ports && device.ports.nics ? device.ports.nics.map(port => ({
                    id: port.id,
                    x: port.x,
                    y: port.y,
                    side: port.side
                })) : []
            }
        }));

        const connectionsData = this.connections.map(connection => ({
            id: connection.id,
            from: {
                deviceId: connection.from.device.id,
                portId: connection.from.port.id
            },
            to: {
                deviceId: connection.to.device.id,
                portId: connection.to.port.id
            }
        }));

        const tcpCheckbox = document.getElementById('tcp-visibility-checkbox');
        const showTCPDetails = tcpCheckbox ? tcpCheckbox.checked : false;

        return {
            version: "1.0",
            timestamp: new Date().toISOString(),
            devices: devicesData,
            connections: connectionsData,
            tcpDetailsVisible: showTCPDetails
        };
    }

    // 文字列を圧縮してURLセーフなBase64文字列に変換
    async compressData(jsonString) {
        const byteArray = new TextEncoder().encode(jsonString);
        if (typeof CompressionStream !== 'undefined') {
            const cs = new CompressionStream('deflate-raw');
            const writer = cs.writable.getWriter();
            writer.write(byteArray);
            writer.close();
            const buffer = await new Response(cs.readable).arrayBuffer();
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        } else {
            let binary = '';
            for (let i = 0; i < byteArray.byteLength; i++) {
                binary += String.fromCharCode(byteArray[i]);
            }
            return 'raw.' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        }
    }

    // URLセーフなBase64文字列を展開して元の文字列に復元
    async decompressData(base64url) {
        let isRaw = false;
        let b64 = base64url;
        if (b64.startsWith('raw.')) {
            isRaw = true;
            b64 = b64.substring(4);
        }
        b64 = b64.replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) {
            b64 += '=';
        }
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }

        if (isRaw || typeof DecompressionStream === 'undefined') {
            return new TextDecoder().decode(bytes);
        } else {
            const ds = new DecompressionStream('deflate-raw');
            const writer = ds.writable.getWriter();
            writer.write(bytes);
            writer.close();
            const buffer = await new Response(ds.readable).arrayBuffer();
            return new TextDecoder().decode(buffer);
        }
    }

    // 共有ダイアログを開く
    async openShareDialog() {
        if (this.devices.size === 0) {
            this.updateStatus('⚠️ 共有する機器が配置されていません');
            return;
        }

        const overlay = document.getElementById('share-dialog-overlay');
        const input = document.getElementById('share-url-input');
        const copyMsg = document.getElementById('share-copy-message');
        if (!overlay) {
            console.warn('Share dialog overlay not found');
            return;
        }

        this.setupShareDialogEvents();
        if (typeof this.initializeDialogDragging === 'function') {
            this.initializeDialogDragging('share-dialog');
        }

        overlay.style.display = 'flex';
        if (copyMsg) copyMsg.style.display = 'none';
        if (input) input.value = 'URLを生成中...';

        try {
            const data = this.getNetworkData();
            const jsonStr = JSON.stringify(data);
            const compressed = await this.compressData(jsonStr);

            const baseUrl = window.location.origin + window.location.pathname;
            const shareUrl = `${baseUrl}#share=${compressed}`;

            if (input) {
                input.value = shareUrl;
                input.focus();
                input.select();
            }

            // 自動でクリップボードにコピー
            if (navigator.clipboard && navigator.clipboard.writeText) {
                try {
                    await navigator.clipboard.writeText(shareUrl);
                    if (copyMsg) copyMsg.style.display = 'flex';
                    this.updateStatus('✨ 共有用URLを生成し、クリップボードにコピーしました！');
                } catch (_) {
                    this.updateStatus('🔗 共有用URLを生成しました');
                }
            } else {
                this.updateStatus('🔗 共有用URLを生成しました');
            }
        } catch (error) {
            console.error('共有URL生成エラー:', error);
            if (input) input.value = 'URLの生成に失敗しました';
            this.updateStatus(`❌ 共有URL生成エラー: ${error.message}`);
        }
    }

    // 共有ダイアログを閉じる
    closeShareDialog() {
        const overlay = document.getElementById('share-dialog-overlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    // 共有ダイアログのイベント初期化
    setupShareDialogEvents() {
        if (this._shareDialogEventsInitialized) return;
        this._shareDialogEventsInitialized = true;

        const overlay = document.getElementById('share-dialog-overlay');
        const closeXBtn = document.getElementById('share-dialog-close-x-btn');
        const closeBtn = document.getElementById('share-dialog-close-btn');
        const copyBtn = document.getElementById('share-copy-btn');
        const input = document.getElementById('share-url-input');
        const copyMsg = document.getElementById('share-copy-message');

        if (closeXBtn) closeXBtn.onclick = () => this.closeShareDialog();
        if (closeBtn) closeBtn.onclick = () => this.closeShareDialog();
        if (overlay) {
            overlay.onclick = (e) => {
                if (e.target === overlay) this.closeShareDialog();
            };
        }

        if (input) {
            input.onclick = () => input.select();
        }

        if (copyBtn) {
            copyBtn.onclick = async () => {
                if (!input || !input.value) return;
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(input.value);
                    } else {
                        input.select();
                        document.execCommand('copy');
                    }
                    if (copyMsg) copyMsg.style.display = 'flex';
                    this.updateStatus('✨ 共有URLをクリップボードにコピーしました');
                } catch (err) {
                    input.select();
                    this.updateStatus('URLを選択しました。Ctrl+C (またはCmd+C) でコピーしてください');
                }
            };
        }
    }

    // URL（ハッシュ / パラメータ）からネットワーク構成を読み込み
    async loadNetworkFromUrl() {
        try {
            let shareData = null;
            const hash = window.location.hash;
            if (hash && hash.includes('share=')) {
                const match = hash.match(/share=([^&]+)/);
                if (match && match[1]) {
                    shareData = match[1];
                }
            }

            if (!shareData) {
                const urlParams = new URLSearchParams(window.location.search);
                if (urlParams.has('share')) {
                    shareData = urlParams.get('share');
                }
            }

            if (!shareData) return;

            const jsonStr = await this.decompressData(shareData);
            const data = JSON.parse(jsonStr);

            if (data && data.devices) {
                this.applyNetworkData(data);
                this.updateStatus('✨ 共有されたネットワーク構成を読み込みました！');
            }
        } catch (error) {
            console.error('共有URLの読み込みエラー:', error);
            this.updateStatus(`⚠️ 共有URLの構成読み込みに失敗しました: ${error.message}`);
        }
    }

    // IP設定フィールドの有効/無効切り替え
    toggleIPFields(dhcpEnabled) {
        const fields = ['ip-address', 'subnet-mask', 'default-gateway'];
        fields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            field.disabled = dhcpEnabled;
            field.style.backgroundColor = dhcpEnabled ? '#f5f5f5' : 'white';
        });
    }
    
    // WAN設定フィールドの有効/無効切り替え
    toggleWANFields(dhcpEnabled) {
        const wanFields = ['wan-ip-address', 'wan-subnet-mask', 'wan-default-gateway'];
        wanFields.forEach(fieldId => {
            const field = document.getElementById(fieldId);
            if (field) {
                field.disabled = dhcpEnabled;
                field.style.backgroundColor = dhcpEnabled ? '#f5f5f5' : 'white';
            }
        });
        
        const wanManualConfig = document.getElementById('wan-manual-config');
        if (wanManualConfig) {
            wanManualConfig.style.opacity = dhcpEnabled ? '0.6' : '1';
        }
    }

    // WAN設定保存
    saveWANConfig() {
        const router = this.currentDeviceConfig;
        
        if (!router.wanConfig) {
            router.wanConfig = {};
        }
        
        const wanDhcpEnabled = document.getElementById('wan-dhcp-enabled').checked;
        const wasUsingWANDHCP = router.wanConfig.dhcpEnabled || false;
        
        // WAN DHCP設定を保存
        router.wanConfig.dhcpEnabled = wanDhcpEnabled;
        
        if (!wanDhcpEnabled) {
            // DHCP無効時は手動設定を保存
            const wanIP = document.getElementById('wan-ip-address').value;
            const wanSubnet = document.getElementById('wan-subnet-mask').value;
            const wanGateway = document.getElementById('wan-default-gateway').value;
            
            if (wanIP && this.isLoopbackAddress(wanIP)) {
                alert('WAN IPアドレスにループバックアドレス (127.0.0.0/8) は設定できません。');
                return false;
            }

            if (wanIP && this.isBroadcastAddress(wanIP, wanSubnet)) {
                alert('WAN IPアドレスにブロードキャストアドレスは設定できません。');
                return false;
            }

            if (wanIP && this.isNetworkAddress(wanIP, wanSubnet)) {
                alert('WAN IPアドレスにネットワークアドレスは設定できません。');
                return false;
            }

            if (wanIP && this.isValidIP(wanIP)) {
                router.wanConfig.ipAddress = wanIP;
            }
            if (wanSubnet && this.isValidIP(wanSubnet)) {
                router.wanConfig.subnetMask = wanSubnet;
            }
            if (wanGateway && this.isValidIP(wanGateway)) {
                router.wanConfig.defaultGateway = wanGateway;
            }
        }
        
        // インターネット接続中のルーターのDHCP状態変更処理
        if (wanDhcpEnabled && !router.wanConfig.ipAddress) {
            // 固定IP → DHCP、またはDHCP有効のままグローバルIPを未取得の場合：
            // キャッシュされた値には頼らず、現在のケーブル接続とISP設定に基づいて改めて取得を試みる
            // （ケーブル接続時にISPのDHCPが無効だった場合や、接続後にISP設定を変更した場合に対応）
            this.refreshRouterWANConnection(router);
            if (router.wanConfig.ipAddress) {
                this.updateStatus(`🌐 ${router.name} のWANでDHCPが有効になり、グローバルIP ${router.wanConfig.ipAddress} を取得しました`);
            } else {
                this.updateStatus(`🌐 ${router.name} のWAN: 有効なISPが見つからないため、グローバルIPを取得できませんでした`);
            }
        } else if (router.wanConfig.isConnected && wasUsingWANDHCP && !wanDhcpEnabled) {
            // DHCP → 固定IP: 手動設定に変更
            this.updateStatus(`🌐 ${router.name} のWANが固定IP設定に変更されました`);
        }

        console.log('WAN設定保存完了:', router.name, 'DHCP:', wanDhcpEnabled, 'IP:', router.wanConfig.ipAddress);
    }

    // ルーターのWANポートに接続されたONUを検索
    findWANConnectedONU(router) {
        for (const connection of this.connections) {
            if (connection.from.device === router && connection.from.port?.id === 'wan' && connection.to.device.type === 'onu') {
                return connection.to.device;
            }
            if (connection.to.device === router && connection.to.port?.id === 'wan' && connection.from.device.type === 'onu') {
                return connection.from.device;
            }
        }
        return null;
    }

    // ルーターのWANポートに直接接続されたインターネット機器を検索（ONUを介さない場合）
    findWANDirectInternet(router) {
        for (const connection of this.connections) {
            if (connection.from.device === router && connection.from.port?.id === 'wan' && connection.to.device.type === 'internet') {
                return { internetDevice: connection.to.device, ispPort: connection.to.port?.id };
            }
            if (connection.to.device === router && connection.to.port?.id === 'wan' && connection.from.device.type === 'internet') {
                return { internetDevice: connection.from.device, ispPort: connection.from.port?.id };
            }
        }
        return null;
    }

    // ルーターのWAN接続を、現在の物理接続とISP設定に基づいて改めて評価しグローバルIPを取得
    refreshRouterWANConnection(router) {
        const onu = this.findWANConnectedONU(router);
        if (onu) {
            // ONU経由接続: ONUにぶら下がる全デバイス（ルーター含む）を現在の設定で再評価
            this.checkExistingONUConnections(onu);
            return;
        }

        const direct = this.findWANDirectInternet(router);
        if (direct) {
            const globalIP = this.assignGlobalIP(router, direct.internetDevice, direct.ispPort);
            if (globalIP) {
                router.wanConfig.ipAddress = globalIP.ip;
                router.wanConfig.subnetMask = '255.255.255.0';
                router.wanConfig.defaultGateway = globalIP.gateway;
                router.wanConfig.dnsServers = ['8.8.8.8', '8.8.4.4'];
                router.wanConfig.isConnected = true;
                router.wanConfig.internetDevice = direct.internetDevice;
                router.wanConfig.availableGlobalIP = globalIP;
            }
        }
    }

    // DNSテーブルを読み込む
    loadDNSTable() {
        const dnsRecords = document.getElementById('dns-records');
        dnsRecords.innerHTML = '';
        
        const dnsTable = this.currentDeviceConfig.dnsTable || {};
        
        Object.entries(dnsTable).forEach(([hostname, ipAddress]) => {
            this.createDNSRecordElement(hostname, ipAddress);
        });
        
        // 空のレコードが1つもない場合は1つ追加
        if (Object.keys(dnsTable).length === 0) {
            this.createDNSRecordElement('', '');
        }
    }

    // DNSレコード要素を作成
    createDNSRecordElement(hostname = '', ipAddress = '') {
        const dnsRecords = document.getElementById('dns-records');
        const recordDiv = document.createElement('div');
        recordDiv.className = 'dns-record-item';
        recordDiv.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px; align-items: center;';
        
        recordDiv.innerHTML = `
            <input type="text" placeholder="ホスト名" value="${hostname}" 
                   style="flex: 1; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
            <input type="text" placeholder="IPアドレス" value="${ipAddress}" 
                   style="flex: 1; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
            <button type="button" class="remove-dns-record" style="padding: 4px 8px; background: #ff4444; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 10px;">
                削除
            </button>
        `;
        
        // 削除ボタンのイベントリスナー
        const removeBtn = recordDiv.querySelector('.remove-dns-record');
        removeBtn.addEventListener('click', () => {
            recordDiv.remove();
        });
        
        dnsRecords.appendChild(recordDiv);
    }

    // DNSレコードを追加
    addDNSRecord() {
        this.createDNSRecordElement('', '');
    }

    // デバイス設定ダイアログでEnterキー機能を設定
    setupEnterKeyForDeviceConfig() {
        // 既存のイベントリスナーをクリア（重複防止）
        const dialog = document.getElementById('device-config-dialog');
        if (dialog._enterKeyHandler) {
            dialog.removeEventListener('keydown', dialog._enterKeyHandler);
        }
        
        // Enterキーイベントハンドラーを作成
        const enterKeyHandler = (event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
                // テキストエリア内では通常のEnter動作を維持
                if (event.target.tagName === 'TEXTAREA') {
                    return;
                }
                
                event.preventDefault();
                this.saveDeviceConfig();
            }
        };
        
        // イベントリスナーを設定（参照を保持）
        dialog._enterKeyHandler = enterKeyHandler;
        dialog.addEventListener('keydown', enterKeyHandler);
    }

    // デバイス設定ダイアログ非表示
    hideDeviceConfig() {
        document.getElementById('dialog-overlay').style.display = 'none';
        document.getElementById('device-config-dialog').style.display = 'none';
        this.currentDeviceConfig = null;
    }

    // 宛先選択ダイアログ表示
    showDestinationDialog(sourceDevice, communicationType) {
        console.log('showDestinationDialog called with:', sourceDevice.name, communicationType);
        
        // 少し待ってから要素を探す（コンポーネント読み込みの完了を待つ）
        setTimeout(() => {
            const overlay = document.getElementById('destination-dialog-overlay');
            const dialog = document.getElementById('destination-dialog');
            const title = document.getElementById('destination-dialog-title');
            
            console.log('DOM elements check:', {
                overlay: !!overlay,
                dialog: !!dialog,
                title: !!title,
                componentsLoaded: window.componentsLoaded
            });
            
            if (!overlay || !dialog || !title) {
                console.error('Required dialog elements not found:', {overlay: !!overlay, dialog: !!dialog, title: !!title});
                this.updateStatus('ダイアログの表示に失敗しました - コンポーネントが読み込まれていません');
                return;
            }
            
            this.showDestinationDialogInternal(sourceDevice, communicationType, overlay, dialog, title);
        }, 50);
    }
    
    // 内部的な宛先選択ダイアログ表示処理
    showDestinationDialogInternal(sourceDevice, communicationType, overlay, dialog, title) {
        // セッション管理のための一意ID生成
        const sessionId = Date.now() + '_' + Math.random().toString(36).substr(2, 9);

        // セッション情報を保存
        if (!this.communicationSessions) {
            this.communicationSessions = new Map();
        }
        this.communicationSessions.set(sessionId, {
            sourceDevice: sourceDevice,
            communicationType: communicationType,
            timestamp: Date.now()
        });

        // ダイアログ要素にセッションIDを保存（グローバル変数を避ける）
        dialog.setAttribute('data-session-id', sessionId);
        console.log('🔧 Set session ID to dialog:', sessionId, 'Dialog element:', dialog);

        // 従来の方式も保持（後方互換性のため）
        this.destinationSourceDevice = sourceDevice;
        this.destinationCommunicationType = communicationType; // 'ping' or 'http'

        console.log('🆔 Created communication session:', sessionId, {
            sourceDevice: sourceDevice.name,
            communicationType: communicationType
        });
        
        // ダイアログタイトル設定
        const titleMap = {
            'ping': 'Ping宛先を選択',
            'http': 'HTTP通信先を選択'
        };
        title.textContent = titleMap[communicationType];
        
        // 送信元デバイス情報表示
        const sourceDeviceName = document.getElementById('source-device-name');
        const sourceDeviceIp = document.getElementById('source-device-ip');
        if (sourceDeviceName) sourceDeviceName.textContent = sourceDevice.name;
        
        // IPアドレス表示時に最新の値を確実に取得
        let currentIP = sourceDevice.config.ipAddress;
        // IPアドレスが無効な場合、キャンバス表示用の現在の値を確認
        if (!currentIP || currentIP === '0.0.0.0' || currentIP === '') {
            // デバイスを再描画するために最新の設定を確認
            this.scheduleRender();
            currentIP = sourceDevice.config.ipAddress || 'IP未設定';
        }
        if (sourceDeviceIp) sourceDeviceIp.textContent = `(${currentIP})`;
        
        // 宛先選択方法の初期化
        const ipRadio = document.querySelector('input[name="destination-type"][value="ip"]');
        const ipSection = document.getElementById('ip-address-section');
        const hostnameSection = document.getElementById('hostname-section');
        const destinationIp = document.getElementById('destination-ip');
        
        if (ipRadio) ipRadio.checked = true;
        if (ipSection) ipSection.style.display = 'block';
        if (hostnameSection) hostnameSection.style.display = 'none';
        if (destinationIp) destinationIp.value = '';
        
        // ホスト名プルダウンの更新
        this.updateHostnameOptions();
        
        // クイックデバイス選択ボタンの更新
        this.updateQuickDeviceButtons(sourceDevice);
        
        // DNS解決状況をリセット
        const dnsStatus = document.getElementById('dns-resolution-status');
        const resolvedIp = document.getElementById('resolved-ip');
        if (dnsStatus) dnsStatus.style.display = 'none';
        if (resolvedIp) resolvedIp.style.display = 'none';
        
        // ダイアログ表示
        console.log('Showing dialog overlay');
        overlay.style.display = 'flex';
        
        // イベントリスナー設定（セッションIDを渡す）
        this.setupDestinationDialogEvents(sessionId);
        
        // ダイアログのドラッグ機能を初期化
        this.initializeDialogDragging('destination-dialog');
        
        console.log('Dialog setup complete');
    }

    // ダイアログのドラッグ機能を初期化
    initializeDialogDragging(dialogId) {
        const dialog = document.getElementById(dialogId);
        if (!dialog) {
            console.warn(`Dialog not found: ${dialogId}`);
            return;
        }

        // ダイアログヘッダーを取得
        let header = dialog.querySelector('.dialog-header') || dialog.querySelector('.modal-header');

        if (!header) {
            console.warn(`Dialog header not found for: ${dialogId}`);
            return;
        }

        // ドラッグ状態を管理する変数
        let isDragging = false;
        let startX, startY, startDialogX, startDialogY;

        // 初期状態では元のCSSスタイルを保持（中央配置のまま）
        // ドラッグ開始時のみ絶対座標に変換

        // ヘッダーにカーソル変更とドラッグヒントを追加
        header.style.cursor = 'move';
        header.title = 'ダイアログをドラッグして移動';

        // マウスダウンイベント（ドラッグ開始）
        const onMouseDown = (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            // 現在の表示位置を取得（transform: translate等を考慮）
            const rect = dialog.getBoundingClientRect();
            startDialogX = rect.left;
            startDialogY = rect.top;
            
            // 初回ドラッグ時：CSS中央配置から絶対位置指定に変更
            if (!dialog.style.left && !dialog.style.top) {
                // 元のCSSスタイル（transform: translate(-50%, -50%)等）を無効化
                dialog.style.position = 'fixed';
                dialog.style.left = `${startDialogX}px`;
                dialog.style.top = `${startDialogY}px`;
                dialog.style.transform = 'none';
                dialog.style.margin = '0';
                
                // デバッグログ（開発時のみ）
                if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                    console.log('🔄 ダイアログ座標系を変換:', { 
                        fromCSS: 'center positioning', 
                        toAbsolute: `${startDialogX}px, ${startDialogY}px` 
                    });
                }
            } else {
                // 既に絶対座標の場合は、CSSスタイルから取得
                startDialogX = parseInt(dialog.style.left) || 0;
                startDialogY = parseInt(dialog.style.top) || 0;
            }
            
            // デバッグログ（開発時のみ）
            if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                console.log('🖱️ ドラッグ開始:', { startX, startY, startDialogX, startDialogY });
            }
            
            // ドラッグ中のスタイル
            header.style.opacity = '0.8';
            document.body.style.userSelect = 'none'; // テキスト選択無効化
            
            e.preventDefault();
        };

        // マウス移動イベント（ドラッグ中）
        const onMouseMove = (e) => {
            if (!isDragging) return;
            
            // マウスの移動量を計算
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            // ダイアログの新しい位置を計算
            let newX = startDialogX + deltaX;
            let newY = startDialogY + deltaY;
            
            // ウィンドウ境界内に制限（固定値で計算）
            const dialogWidth = dialog.offsetWidth;
            const dialogHeight = dialog.offsetHeight;
            const windowWidth = window.innerWidth;
            const windowHeight = window.innerHeight;
            
            // 境界制限：ダイアログが完全にウィンドウ内に収まるように
            newX = Math.max(0, Math.min(newX, windowWidth - dialogWidth));
            newY = Math.max(0, Math.min(newY, windowHeight - dialogHeight));
            
            // ダイアログの位置を更新
            dialog.style.left = `${newX}px`;
            dialog.style.top = `${newY}px`;
            
            e.preventDefault();
        };

        // マウスアップイベント（ドラッグ終了）
        const onMouseUp = (e) => {
            if (!isDragging) return;
            
            isDragging = false;
            
            // スタイルを元に戻す
            header.style.opacity = '';
            document.body.style.userSelect = '';
            
            e.preventDefault();
        };

        // タッチイベント対応（スマートフォン・タブレット）
        const onTouchStart = (e) => {
            const touch = e.touches[0];
            onMouseDown({
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => e.preventDefault()
            });
        };

        const onTouchMove = (e) => {
            const touch = e.touches[0];
            onMouseMove({
                clientX: touch.clientX,
                clientY: touch.clientY,
                preventDefault: () => e.preventDefault()
            });
        };

        const onTouchEnd = (e) => {
            onMouseUp({ preventDefault: () => e.preventDefault() });
        };

        // イベントリスナー登録
        header.addEventListener('mousedown', onMouseDown);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        
        // タッチイベント（モバイル対応）
        header.addEventListener('touchstart', onTouchStart, { passive: false });
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd, { passive: false });

        console.log(`✅ ダイアログドラッグ機能を初期化: ${dialogId}`);
    }

    // 宛先選択ダイアログのイベントリスナー設定
    setupDestinationDialogEvents(sessionId) {
        // 宛先指定方法の切り替え
        const radioButtons = document.querySelectorAll('input[name="destination-type"]');
        radioButtons.forEach(radio => {
            radio.removeEventListener('change', this.handleDestinationTypeChange);
            radio.addEventListener('change', this.handleDestinationTypeChange.bind(this));
        });
        
        // ホスト名選択変更
        const hostnameSelect = document.getElementById('destination-hostname');
        hostnameSelect.removeEventListener('change', this.handleHostnameSelection);
        hostnameSelect.addEventListener('change', this.handleHostnameSelection.bind(this));
        
        // キャンセルボタン
        const cancelBtn = document.getElementById('destination-cancel-btn');
        if (cancelBtn) {
            // 古いキャンセルボタンを完全に置き換える（イベントリスナーもクリア）
            const newCancelBtn = cancelBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);
            newCancelBtn.addEventListener('click', this.hideDestinationDialog.bind(this));
        }
        
        // 実行ボタン
        const okBtn = document.getElementById('destination-ok-btn');
        console.log('Setting up OK button event listener:', !!okBtn);

        if (okBtn) {
            // 古いOKボタンを完全に置き換える（イベントリスナーもクリア）
            const newOkBtn = okBtn.cloneNode(true);
            okBtn.parentNode.replaceChild(newOkBtn, okBtn);

            // クロージャーでセッションIDを保存（確実な方法）
            const currentSessionId = sessionId;
            newOkBtn.addEventListener('click', () => {
                console.log('OK button clicked! Session ID:', currentSessionId);
                this.executeDestinationCommunicationWithSession(currentSessionId);
            });

            console.log('✅ Replaced OK button with new event listener for session:', currentSessionId);
        } else {
            console.error('OK button not found!');
        }
        
        // オーバーレイクリック（ダイアログ外のクリックのみで閉じる）
        const overlay = document.getElementById('destination-dialog-overlay');
        const dialog = document.getElementById('destination-dialog');
        
        overlay.removeEventListener('click', this.handleDestinationDialogOverlayClick);
        overlay.addEventListener('click', this.handleDestinationDialogOverlayClick.bind(this));
        
        // ダイアログ内部のクリックでは閉じないようにする
        dialog.removeEventListener('click', this.stopDestinationDialogPropagation);
        dialog.addEventListener('click', this.stopDestinationDialogPropagation.bind(this));
        
        // Enterキーで実行機能を追加
        this.setupEnterKeyForDestinationDialog();
    }

    // 宛先選択ダイアログでEnterキー機能を設定
    setupEnterKeyForDestinationDialog() {
        // 既存のイベントリスナーをクリア（重複防止）
        const dialog = document.getElementById('destination-dialog');
        if (dialog._enterKeyHandler) {
            dialog.removeEventListener('keydown', dialog._enterKeyHandler);
        }
        
        // Enterキーイベントハンドラーを作成
        const enterKeyHandler = (event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.altKey) {
                // select要素では通常のEnter動作を維持
                if (event.target.tagName === 'SELECT') {
                    return;
                }
                
                event.preventDefault();
                this.executeDestinationCommunication();
            }
        };
        
        // イベントリスナーを設定（参照を保持）
        dialog._enterKeyHandler = enterKeyHandler;
        dialog.addEventListener('keydown', enterKeyHandler);
    }

    // 宛先指定方法の切り替え
    handleDestinationTypeChange(event) {
        const value = event.target.value;
        const ipSection = document.getElementById('ip-address-section');
        const hostnameSection = document.getElementById('hostname-section');
        
        if (value === 'ip') {
            ipSection.style.display = 'block';
            hostnameSection.style.display = 'none';
        } else {
            ipSection.style.display = 'none';
            hostnameSection.style.display = 'block';
        }
    }

    // ホスト名選択時の処理
    handleHostnameSelection(event) {
        const selectedHostname = event.target.value;
        const resolvedIpDiv = document.getElementById('resolved-ip');
        const resolvedIpValue = document.getElementById('resolved-ip-value');
        
        if (selectedHostname) {
            if (selectedHostname.toLowerCase() === 'localhost') {
                resolvedIpValue.textContent = '127.0.0.1';
                resolvedIpDiv.style.display = 'block';
                return;
            }

            // DNS解決を試行（送信元デバイスからDNSサーバーへの到達可能性も確認する）
            const resolvedIp = this.resolveDNS(selectedHostname, this.destinationSourceDevice);
            if (resolvedIp) {
                resolvedIpValue.textContent = resolvedIp;
                resolvedIpDiv.style.display = 'block';
            } else {
                resolvedIpDiv.style.display = 'none';
                const recordServer = this.findDNSServerWithRecord(selectedHostname);
                const reason = recordServer
                    ? `DNSサーバー(${recordServer.name})への経路がありません`
                    : null;
                this.showDNSResolutionError(selectedHostname, reason);
            }
        } else {
            resolvedIpDiv.style.display = 'none';
        }
    }

    // ホスト名プルダウンの更新（DNSサーバーのレコードから取得 + localhost）
    updateHostnameOptions() {
        const select = document.getElementById('destination-hostname');
        select.innerHTML = '<option value="">-- ホスト名を選択 --</option>';
        
        // localhost は常に利用可能
        const localhostOption = document.createElement('option');
        localhostOption.value = 'localhost';
        localhostOption.textContent = 'localhost (127.0.0.1 - ローカルループバック)';
        select.appendChild(localhostOption);

        // DNSサーバーを探す
        const dnsServers = Array.from(this.devices.values()).filter(device => device.type === 'dns');
        
        if (dnsServers.length === 0) {
            return;
        }
        
        // すべてのDNSサーバーからレコードを収集
        const allDNSRecords = new Map();
        
        for (const dnsServer of dnsServers) {
            const dnsTable = dnsServer.dnsTable || {};
            for (const [hostname, ipAddress] of Object.entries(dnsTable)) {
                if (hostname && ipAddress && hostname.toLowerCase() !== 'localhost') {
                    // 同じホスト名で複数のIPがある場合は最初のものを使用
                    if (!allDNSRecords.has(hostname)) {
                        allDNSRecords.set(hostname, ipAddress);
                    }
                }
            }
        }
        
        if (allDNSRecords.size > 0) {
            // ホスト名順でソート
            const sortedEntries = Array.from(allDNSRecords.entries()).sort(([a], [b]) => a.localeCompare(b));
            
            for (const [hostname, ipAddress] of sortedEntries) {
                const option = document.createElement('option');
                option.value = hostname;
                option.textContent = `${hostname} (${ipAddress})`;
                select.appendChild(option);
            }
        }
    }

    // クイックデバイス選択ボタン群の更新
    updateQuickDeviceButtons(sourceDevice) {
        const container = document.getElementById('quick-device-buttons');
        if (!container) return;
        
        container.innerHTML = '';

        const iconMap = {
            'pc': '💻',
            'router': '📡',
            'switch': '🔌',
            'server': '🖥️',
            'dns': '🌐',
            'onu': '📦',
            'internet': '☁️'
        };

        const candidateDevices = Array.from(this.devices.values()).filter(dev => {
            if (dev === sourceDevice) return false;
            if (dev.type === 'switch' || dev.type === 'onu') return false;
            return true;
        });

        if (candidateDevices.length === 0) {
            container.innerHTML = '<span style="color: #94a3b8; font-size: 12px; padding: 4px;">他のノードがありません</span>';
            return;
        }

        candidateDevices.forEach(device => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'quick-node-btn';
            btn.dataset.deviceId = device.id;

            const icon = iconMap[device.type] || '💻';
            let ip = device.config?.ipAddress || '';
            if (!ip && device.config?.lan1?.ip) ip = device.config.lan1.ip;
            if (!ip && device.config?.wan?.ip) ip = device.config.wan.ip;

            btn.innerHTML = `${icon} <strong>${device.name}</strong> <span style="color: #64748b; font-size: 11px;">(${ip || 'IP未設定'})</span>`;

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectTargetDeviceForDialog(device);
            });

            container.appendChild(btn);
        });
    }

    // 宛先ダイアログでターゲットデバイスを選択反映
    selectTargetDeviceForDialog(targetDevice) {
        if (!targetDevice) return;

        let targetIp = targetDevice.config?.ipAddress || '';
        if (!targetIp && targetDevice.config?.lan1?.ip) targetIp = targetDevice.config.lan1.ip;
        if (!targetIp && targetDevice.config?.wan?.ip) targetIp = targetDevice.config.wan.ip;

        const ipInput = document.getElementById('destination-ip');
        const ipRadio = document.querySelector('input[name="destination-type"][value="ip"]');
        const ipSection = document.getElementById('ip-address-section');
        const hostnameSection = document.getElementById('hostname-section');
        const hostnameSelect = document.getElementById('destination-hostname');

        if (ipInput && targetIp) {
            ipInput.value = targetIp;
        }

        if (ipRadio) {
            ipRadio.checked = true;
            if (ipSection) ipSection.style.display = 'block';
            if (hostnameSection) hostnameSection.style.display = 'none';
        }

        if (hostnameSelect) {
            for (let i = 0; i < hostnameSelect.options.length; i++) {
                if (hostnameSelect.options[i].value === targetDevice.name) {
                    hostnameSelect.selectedIndex = i;
                    break;
                }
            }
        }

        const buttons = document.querySelectorAll('.quick-node-btn');
        buttons.forEach(btn => {
            if (btn.dataset.deviceId === targetDevice.id) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });

        this.pingTargetDevice = targetDevice;
        this.updateStatus(`🎯 宛先ノードに「${targetDevice.name} (${targetIp || 'IP未設定'})」を選択しました`);
        this.scheduleRender();

        if (ipInput) {
            ipInput.focus();
        }
    }

    // オーバーレイクリックハンドラー（ダイアログ外のみ）
    handleDestinationDialogOverlayClick(event) {
        // ダイアログ要素自体のクリックは別リスナーでstopPropagationされる
        if (event.target === document.getElementById('destination-dialog-overlay')) {
            // クリック位置からキャンバス上のデバイスをチェック
            const pos = this.getDragPointerPos(event);
            const clickedDevice = this.getDeviceAt(pos.x, pos.y);

            if (clickedDevice) {
                if (clickedDevice === this.destinationSourceDevice) {
                    this.updateStatus(`⚠️ ${clickedDevice.name} は送信元です。別の宛先ノードをクリックしてください`);
                } else {
                    // キャンバス上のノードをクリックした場合は宛先に設定！
                    this.selectTargetDeviceForDialog(clickedDevice);
                }
                return; // ダイアログは閉じない
            }

            // ノード以外の余白をクリックした場合はダイアログを閉じる
            this.hideDestinationDialog();
        }
    }

    // ダイアログ内部クリックの伝播を停止
    stopDestinationDialogPropagation(event) {
        event.stopPropagation();
    }

    // DNS解決エラー表示
    showDNSResolutionError(hostname, reason = null) {
        const statusDiv = document.getElementById('dns-resolution-status');
        const statusText = document.getElementById('dns-status-text');

        statusDiv.style.display = 'block';
        statusDiv.style.background = '#fee';
        statusDiv.style.border = '1px solid #fcc';
        const reasonText = reason || 'DNSサーバーが必要です';
        statusText.textContent = `⚠️ "${hostname}" の名前解決に失敗しました（${reasonText}）`;
        statusText.style.color = '#c33';
    }

    // 宛先選択ダイアログ非表示
    hideDestinationDialog() {
        const dialog = document.getElementById('destination-dialog');

        document.getElementById('destination-dialog-overlay').style.display = 'none';

        // ダイアログからセッションIDを削除（セッション自体は通信完了後に削除）
        if (dialog) {
            const sessionId = dialog.getAttribute('data-session-id');
            if (sessionId) {
                dialog.removeAttribute('data-session-id');
                console.log('📋 Removed session ID from dialog:', sessionId, '(session kept for communication)');
            }
        }

        this.destinationSourceDevice = null;
        this.destinationCommunicationType = null;
        this.pingTargetDevice = null;
        this.scheduleRender();
    }

    // レコードを保持しているDNSサーバーを検索（到達可能性は問わない。エラー表示・アニメーション用）
    findDNSServerWithRecord(hostname) {
        const dnsServers = Array.from(this.devices.values()).filter(device => device.type === 'dns');
        return dnsServers.find(server => (server.dnsTable || {})[hostname]) || null;
    }

    // DNS解決（sourceDeviceを指定した場合、DNSサーバーへの到達可能性を確認してから解決する）
    resolveDNS(hostname, sourceDevice = null) {
        if (!hostname || typeof hostname !== 'string') return null;
        
        // localhost は常にローカルループバックアドレスに解決
        if (hostname.toLowerCase() === 'localhost') {
            return '127.0.0.1';
        }

        // DNSサーバーを探す
        const dnsServers = Array.from(this.devices.values()).filter(device => device.type === 'dns');

        if (dnsServers.length === 0) {
            return null; // DNSサーバーが見つからない
        }

        // レコードを持つDNSサーバーの中から、到達可能なものだけを使って解決を試行
        for (const dnsServer of dnsServers) {
            const dnsTable = dnsServer.dnsTable || {};
            if (!dnsTable[hostname]) continue;

            if (sourceDevice) {
                const path = this.findPath(sourceDevice, dnsServer);
                if (!path || path.length === 0) {
                    continue; // ネットワークに繋がっていないDNSサーバーは無視
                }
            }

            return dnsTable[hostname];
        }

        // デバイス名での直接マッチングも試行（後方互換性のため）
        for (const [, device] of this.devices.entries()) {
            if (device.name !== hostname) continue;

            if (sourceDevice) {
                const path = this.findPath(sourceDevice, device);
                if (!path || path.length === 0) {
                    continue;
                }
            }

            return device.config.ipAddress;
        }

        return null; // 解決失敗
    }

    // セッションIDを指定した通信実行
    async executeDestinationCommunicationWithSession(sessionId) {
        console.log('executeDestinationCommunicationWithSession called with sessionId:', sessionId);

        // セッション管理から値を取得
        let sourceDevice, communicationType;

        if (sessionId && this.communicationSessions && this.communicationSessions.has(sessionId)) {
            const session = this.communicationSessions.get(sessionId);
            sourceDevice = session.sourceDevice;
            communicationType = session.communicationType;
            console.log('✅ Using session data:', sessionId, {
                sourceDevice: sourceDevice?.name,
                communicationType: communicationType
            });
        } else {
            console.error('❌ Session not found:', sessionId);
            console.error('❌ Available sessions:', this.communicationSessions ? Array.from(this.communicationSessions.keys()) : 'none');
            console.error('❌ This likely means an old event listener is still active');

            // セッションが見つからない場合でも、利用可能な最新のセッションを使用する
            if (this.communicationSessions && this.communicationSessions.size > 0) {
                const availableSessions = Array.from(this.communicationSessions.keys());
                const latestSession = availableSessions[availableSessions.length - 1];
                console.log('🔄 Attempting to use latest available session:', latestSession);

                return this.executeDestinationCommunicationWithSession(latestSession);
            }

            alert('通信セッションが見つかりません。もう一度実行してください。');
            return;
        }

        // 通信実行後にセッションをクリーンアップ
        try {
            const result = await this.executeDestinationCommunication(sourceDevice, communicationType);

            // 通信完了後にセッション削除
            if (this.communicationSessions && this.communicationSessions.has(sessionId)) {
                this.communicationSessions.delete(sessionId);
                console.log('🗑️ Cleaned up session after communication:', sessionId);
            }

            return result;
        } catch (error) {
            // エラーが発生してもセッションは削除
            if (this.communicationSessions && this.communicationSessions.has(sessionId)) {
                this.communicationSessions.delete(sessionId);
                console.log('🗑️ Cleaned up session after error:', sessionId);
            }
            throw error;
        }
    }

    // 宛先選択ダイアログからの通信実行
    async executeDestinationCommunication(sourceDevice = null, communicationType = null) {
        console.log('executeDestinationCommunication called', {
            passedSourceDevice: sourceDevice?.name,
            passedCommunicationType: communicationType,
            thisSourceDevice: this.destinationSourceDevice?.name,
            thisCommunicationType: this.destinationCommunicationType
        });
        
        const destinationTypeRadio = document.querySelector('input[name="destination-type"]:checked');
        console.log('Destination type radio:', destinationTypeRadio);
        
        if (!destinationTypeRadio) {
            console.error('No destination type selected');
            alert('宛先の指定方法を選択してください');
            return;
        }
        
        const destinationType = destinationTypeRadio.value;
        console.log('Destination type:', destinationType);
        let targetIp = null;
        let hostname = null;
        let needsDNSResolution = false;
        
        if (destinationType === 'ip') {
            // IPアドレス直接指定
            const ipInput = document.getElementById('destination-ip');
            console.log('IP input element:', ipInput);
            
            if (!ipInput) {
                console.error('destination-ip input not found');
                alert('IPアドレス入力欄が見つかりません');
                return;
            }
            
            targetIp = ipInput.value.trim();
            console.log('Target IP:', targetIp);
            
            if (!targetIp) {
                console.log('Empty IP address');
                alert('IPアドレスを入力してください');
                return;
            }
            
            console.log('Validating IP:', targetIp);
            if (!this.isValidIP(targetIp) && !this.isLoopbackAddress(targetIp)) {
                console.log('Invalid IP format');
                alert('有効なIPアドレスを入力してください');
                return;
            }
            console.log('IP validation passed');
        } else {
            // ホスト名指定
            hostname = document.getElementById('destination-hostname').value;
            if (!hostname) {
                alert('ホスト名を選択してください');
                return;
            }
            
            const dnsQuerySourceDevice = sourceDevice || this.destinationSourceDevice;
            targetIp = this.resolveDNS(hostname, dnsQuerySourceDevice);
            if (!targetIp) {
                // DNS解決失敗のアニメーションを実行（値を保存してから）
                const fallbackSourceDevice = dnsQuerySourceDevice;
                this.hideDestinationDialog();
                await this.executeDNSResolutionWithAnimation(fallbackSourceDevice, hostname, false);
                return;
            }
            // localhost以外はDNS解決アニメーションが必要
            if (hostname.toLowerCase() !== 'localhost') {
                needsDNSResolution = true;
            }
        }
        
        // パラメータとして渡された値を優先使用
        let finalSourceDevice, finalCommunicationType;

        if (sourceDevice && communicationType) {
            // パラメータとして渡された場合（新しいセッション管理システム）
            finalSourceDevice = sourceDevice;
            finalCommunicationType = communicationType;
            console.log('✅ Using passed parameters:', {
                sourceDevice: finalSourceDevice?.name,
                communicationType: finalCommunicationType
            });
        } else {
            // フォールバック: 従来のグローバル値またはダイアログ読み取り
            const dialog = document.getElementById('destination-dialog');
            const sessionId = dialog ? dialog.getAttribute('data-session-id') : null;
            console.log('🔍 Reading session ID from dialog:', sessionId, 'Dialog element:', dialog);

            if (sessionId && this.communicationSessions && this.communicationSessions.has(sessionId)) {
                const session = this.communicationSessions.get(sessionId);
                finalSourceDevice = session.sourceDevice;
                finalCommunicationType = session.communicationType;
                console.log('✅ Using session data from dialog:', sessionId);
            } else {
                finalSourceDevice = this.destinationSourceDevice;
                finalCommunicationType = this.destinationCommunicationType;
                console.log('⚠️ Fallback to global values');
            }
        }

        console.log('Final values - Source device:', finalSourceDevice?.name);
        console.log('Final values - Communication type:', finalCommunicationType);

        // sourceDeviceの存在確認を追加
        if (!finalSourceDevice) {
            console.error('❌ finalSourceDevice is null or undefined');
            alert('送信元デバイスが見つかりません。もう一度実行してください。');
            return;
        }

        // ループバックアドレス判定
        const isLoopback = this.isLoopbackAddress(targetIp) || (hostname && this.isLoopbackAddress(hostname));

        if (isLoopback) {
            console.log('🔄 Loopback communication detected for:', finalSourceDevice.name, 'target:', targetIp);
            this.hideDestinationDialog();

            if (finalCommunicationType === 'ping') {
                await this.executeLoopbackPing(finalSourceDevice, targetIp || '127.0.0.1');
            } else if (finalCommunicationType === 'http') {
                await this.executeLoopbackHTTP(finalSourceDevice, targetIp || '127.0.0.1');
            }
            return;
        }

        // ブロードキャストアドレス判定
        const isBroadcast = this.isBroadcastAddress(targetIp, finalSourceDevice?.config?.subnetMask, finalSourceDevice);

        if (isBroadcast) {
            console.log('📡 Broadcast communication detected for:', finalSourceDevice.name, 'target:', targetIp);
            this.hideDestinationDialog();

            if (finalCommunicationType === 'ping') {
                await this.executeBroadcastPing(finalSourceDevice, targetIp);
            } else if (finalCommunicationType === 'http') {
                alert('HTTP通信（TCP）は1対1の接続指向型プロトコルのため、ブロードキャストアドレス宛てには送信できません。\nブロードキャスト通信をテストするには Ping をご使用ください。');
            }
            return;
        }

        // 通常の宛先デバイス特定
        console.log('Finding device by IP:', targetIp);
        const targetDevice = this.findDeviceByIP(targetIp);
        console.log('Found target device:', targetDevice);
        
        if (!targetDevice) {
            console.log('Target device not found for IP:', targetIp);
            alert(`IPアドレス ${targetIp} のデバイスが見つかりません`);
            return;
        }
        
        console.log('Target device found:', targetDevice.name);

        // ダイアログを閉じる（sourceDevice使用後に実行）
        this.hideDestinationDialog();

        // DNS解決が必要な場合は最初にDNS解決アニメーションを実行
        if (needsDNSResolution) {
            await this.executeDNSResolutionWithAnimation(finalSourceDevice, hostname, true, targetDevice);
        }

        // 実際の通信実行
        console.log('🔍 Communication type:', finalCommunicationType);
        console.log('🔍 Source device:', finalSourceDevice?.name);
        console.log('🔍 Target device:', targetDevice?.name);

        if (finalCommunicationType === 'ping') {
            console.log('🏓 Calling executePingToTarget');
            await this.executePingToTarget(finalSourceDevice, targetDevice);
            console.log('✅ executePingToTarget completed');
        } else if (finalCommunicationType === 'http') {
            console.log('🌐 Calling executeHTTPToTarget');
            await this.executeHTTPToTarget(finalSourceDevice, targetDevice);
            console.log('✅ executeHTTPToTarget completed');
        } else {
            console.warn('⚠️ 不明な通信タイプ:', finalCommunicationType);
        }
    }

    // IPアドレスからデバイスを検索
    findDeviceByIP(ipAddress) {
        for (const [, device] of this.devices.entries()) {
            if (device.config && device.config.ipAddress === ipAddress) {
                return device;
            }
            if (device.type === 'router') {
                if (device.wanConfig && device.wanConfig.ipAddress === ipAddress) return device;
                if (device.config?.lan1 && device.config.lan1.ipAddress === ipAddress) return device;
                if (device.config?.lan2 && device.config.lan2.ipAddress === ipAddress) return device;
                if (device.config?.lan3 && device.config.lan3.ipAddress === ipAddress) return device;
            }
        }
        return null;
    }

    // DNS解決アニメーションの実行
    async executeDNSResolutionWithAnimation(sourceDevice, hostname, isSuccess, targetDevice = null) {
        // DNSサーバーを検索
        const dnsServers = Array.from(this.devices.values()).filter(device => device.type === 'dns');
        
        if (dnsServers.length === 0) {
            // DNSサーバーなし時のエラー演出
            this.updateStatus(`🔍 DNS解決試行中: ${hostname} (DNSサーバーを探索中...)`);
            
            // DNSサーバーがない場合の視覚的演出
            await this.animateDNSServerNotFoundError(sourceDevice, hostname);
            return;
        }
        
        // レコードを保持しているDNSサーバーをアニメーション対象として優先的に選択
        // （到達不能な場合に正しいサーバー名で経路なしメッセージを表示するため）
        const dnsServer = this.findDNSServerWithRecord(hostname) || dnsServers[0];
        
        if (isSuccess) {
            // DNS解決成功の場合
            this.updateStatus(`🔍 DNS解決中: ${hostname} → ${targetDevice.config.ipAddress}`);
            
            // 統一されたアニメーションシステムを使用してDNS解決アニメーション実行
            await this.animateDNSResolutionWithPath(sourceDevice, dnsServer, hostname, targetDevice.config.ipAddress, true);
        } else {
            // DNS解決失敗の場合
            this.updateStatus(`🔍 DNS解決試行中: ${hostname} (失敗予定)`);
            
            // 統一されたアニメーションシステムを使用してDNS解決失敗アニメーション実行
            await this.animateDNSResolutionWithPath(sourceDevice, dnsServer, hostname, null, false);
        }
    }

    // 統一されたアニメーションシステムを使用するDNS解決アニメーション
    async animateDNSResolutionWithPath(sourceDevice, dnsServer, hostname, resolvedIp, isSuccess) {
        // デバイスの存在確認
        if (!sourceDevice) {
            console.warn('animateDNSResolutionWithPath: sourceDevice is null or undefined');
            return;
        }
        if (!dnsServer) {
            console.warn('animateDNSResolutionWithPath: dnsServer is null or undefined');
            this.updateStatus(`❌ DNS解決失敗: DNSサーバーが見つかりません`);
            return;
        }

        // ソースとDNSサーバー間の経路を取得
        const pathToServer = this.findPath(sourceDevice, dnsServer);
        
        if (pathToServer.length === 0) {
            this.updateStatus(`❌ DNS解決失敗: DNSサーバー(${dnsServer.name})への経路がありません`);
            return;
        }
        
        // DNS通信用のTCP接続を作成（ポート53）
        let dnsConnectionId = null;
        const sourcePort = this.getRandomPort(1024, 65535);
        const targetPort = 53; // DNS標準ポート
        
        if (window.tcpManager) {
            try {
                // TCP接続作成（DNS用）
                dnsConnectionId = `dns_${sourceDevice.id}_to_${dnsServer.id}_${Date.now()}`;
                const connection = window.tcpManager.createConnection(
                    sourceDevice.config.ipAddress,
                    sourcePort,
                    dnsServer.config.ipAddress,
                    targetPort,
                    dnsConnectionId
                );
                
                connection.protocol = 'DNS';
                connection.query = hostname;
                
                // TCP詳細ログが有効な場合のみ3-way handshake
                const tcpVisibilityCheckbox = document.getElementById('tcp-visibility-toggle');
                const showTCPDetails = tcpVisibilityCheckbox && tcpVisibilityCheckbox.checked;
                
                if (showTCPDetails) {
                    // 3-way handshake
                    await this.simulateDNSTCPHandshake(sourceDevice, dnsServer, pathToServer, dnsConnectionId);
                }
            } catch (error) {
                console.warn('DNS TCP connection creation failed:', error);
            }
        }
        
        // DNS Query (クライアント → DNSサーバー)
        this.updateStatus(`🔍 DNS Query送信: ${sourceDevice.name} → ${dnsServer.name} (${hostname}を問い合わせ中)`);
        await this.queuedAnimatePacketAlongPath(pathToServer, '🔍 DNS Query', '#9c27b0');
        
        await this.sleep(300);
        
        if (isSuccess) {
            // DNS Response - 成功 (DNSサーバー → クライアント)
            this.updateStatus(`📋 DNS Response受信: ${dnsServer.name} → ${sourceDevice.name} (${hostname} = ${resolvedIp})`);
            const reversePathFromServer = [...pathToServer].reverse();
            await this.queuedAnimatePacketAlongPath(reversePathFromServer, '📋 DNS Response', '#4caf50');
            
            this.updateStatus(`✅ DNS解決完了: ${hostname} → ${resolvedIp}`);
        } else {
            // DNS Response - 失敗 (DNSサーバー → クライアント)
            this.updateStatus(`📋 DNS Response受信: ${dnsServer.name} → ${sourceDevice.name} (${hostname}レコード未発見)`);
            const reversePathFromServer = [...pathToServer].reverse();
            await this.queuedAnimatePacketAlongPath(reversePathFromServer, '❌ DNS Error', '#f44336');
            
            this.updateStatus(`❌ DNS解決失敗: ${hostname} (レコードが見つかりません)`);
        }
        
        // TCP接続をクローズ
        if (dnsConnectionId && window.tcpManager) {
            try {
                const tcpVisibilityCheckbox = document.getElementById('tcp-visibility-toggle');
                const showTCPDetails = tcpVisibilityCheckbox && tcpVisibilityCheckbox.checked;
                
                if (showTCPDetails) {
                    await this.simulateDNSTCPClose(sourceDevice, dnsServer, pathToServer, dnsConnectionId);
                }
                
                // TCP接続を適切に閉じる
                const connection = window.tcpManager.getConnection(dnsConnectionId);
                if (connection) {
                    connection.close();
                    window.tcpManager.removeConnection(dnsConnectionId);
                }
            } catch (error) {
                console.warn('DNS TCP connection close failed:', error);
            }
        }
        
        await this.sleep(500);
    }

    // DNS TCP 3-way handshake シミュレーション
    async simulateDNSTCPHandshake(sourceDevice, dnsServer, path, connectionId) {
        const reversePath = [...path].reverse();
        
        // SYN (クライアント → DNSサーバー)
        await this.queuedAnimatePacketAlongPath(path, '🔄 SYN', '#ff9800', {
            tcpDetails: { flag: 'SYN', seq: 1000, ack: 0, connectionId }
        });
        
        await this.sleep(150);
        
        // SYN-ACK (DNSサーバー → クライアント)  
        await this.queuedAnimatePacketAlongPath(reversePath, '🔄 SYN-ACK', '#ff9800', {
            tcpDetails: { flag: 'SYN-ACK', seq: 2000, ack: 1001, connectionId }
        });
        
        await this.sleep(150);
        
        // ACK (クライアント → DNSサーバー)
        await this.queuedAnimatePacketAlongPath(path, '✅ ACK', '#4caf50', {
            tcpDetails: { flag: 'ACK', seq: 1001, ack: 2001, connectionId }
        });
        
        if (window.tcpManager && window.tcpManager.getConnection(connectionId)) {
            window.tcpManager.getConnection(connectionId).state = 'ESTABLISHED';
        }
        
        await this.sleep(200);
    }

    // DNS TCP接続クローズ シミュレーション
    async simulateDNSTCPClose(sourceDevice, dnsServer, path, connectionId) {
        const reversePath = [...path].reverse();
        
        // FIN (クライアント → DNSサーバー)
        await this.queuedAnimatePacketAlongPath(path, '🔚 FIN', '#f44336', {
            tcpDetails: { flag: 'FIN', seq: 1500, ack: 2500, connectionId }
        });
        
        await this.sleep(150);
        
        // FIN-ACK (DNSサーバー → クライアント)
        await this.queuedAnimatePacketAlongPath(reversePath, '🔚 FIN-ACK', '#f44336', {
            tcpDetails: { flag: 'FIN-ACK', seq: 2500, ack: 1501, connectionId }
        });
        
        await this.sleep(150);
        
        // ACK (クライアント → DNSサーバー)
        await this.queuedAnimatePacketAlongPath(path, '✅ ACK', '#4caf50', {
            tcpDetails: { flag: 'ACK', seq: 1501, ack: 2501, connectionId }
        });
        
        if (window.tcpManager && window.tcpManager.getConnection(connectionId)) {
            window.tcpManager.getConnection(connectionId).state = 'CLOSED';
        }
        
        await this.sleep(200);
    }

    // ランダムポート生成ヘルパー
    getRandomPort(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // DNSサーバー未発見時のエラー演出
    async animateDNSServerNotFoundError(sourceDevice, hostname) {
        // ネットワーク内のデバイスをスキャンするアニメーション
        this.updateStatus(`🔍 DNSサーバーを探索中...`);
        
        // 全デバイスに対して探索パルスアニメーション
        const allDevices = Array.from(this.devices.values());
        const nonSourceDevices = allDevices.filter(device => device !== sourceDevice);
        
        let scanCount = 0;
        const maxScans = Math.min(3, nonSourceDevices.length);
        
        for (let i = 0; i < maxScans; i++) {
            if (nonSourceDevices.length > 0) {
                const targetDevice = nonSourceDevices[i % nonSourceDevices.length];
                
                // 探索パルスアニメーション
                if (window.animateSingleHop) {
                    await window.animateSingleHop(this, sourceDevice, targetDevice, {
                        color: '#ff9800',
                        text: '❓ DNS?',
                        className: 'dns-scan-pulse',
                        duration: 600
                    });
                }
                
                // デバイスを短時間点滅（DNS応答なし）
                this.blinkDeviceError(targetDevice, {
                    color: '#ff5722',
                    duration: 150,
                    count: 2
                });
                
                scanCount++;
                
                // スキャン間の待機時間
                if (i < maxScans - 1) {
                    await new Promise(resolve => setTimeout(resolve, 400));
                }
            }
        }
        
        // 最終エラー演出
        this.updateStatus(`❌ DNSサーバーが見つかりません`);
        
        // 送信元デバイスで長時間の赤色点滅
        this.blinkDeviceError(sourceDevice, {
            color: '#f44336',
            duration: 300,
            count: 4
        });
        
        // フローティングエラーメッセージ
        this.showFloatingErrorMessage(sourceDevice, `❌ DNSサーバーが必要です\n${hostname} を解決できません`, {
            duration: 4000,
            color: '#f44336'
        });
        
        // エラー完了まで待機
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        this.updateStatus(`DNS設定を確認してください（DNSサーバーデバイスを配置してください）`);
    }

    // デバイスエラー点滅
    blinkDeviceError(device, options = {}) {
        const {
            color = '#f44336',
            duration = 200,
            count = 3
        } = options;
        
        let blinkCount = 0;
        const blinkInterval = setInterval(() => {
            if (blinkCount >= count * 2) {
                clearInterval(blinkInterval);
                if (this.errorBlinkDevices && this.errorBlinkDevices.has(device.id)) {
                    this.errorBlinkDevices.delete(device.id);
                    if (this.errorBlinkDevices.size === 0) {
                        this.errorBlinkDevices = null;
                    }
                }
                this.scheduleRender();
                return;
            }
            
            if (blinkCount % 2 === 0) {
                // 点灯
                if (!this.errorBlinkDevices) {
                    this.errorBlinkDevices = new Set();
                }
                this.errorBlinkDevices.add(device.id);
            } else {
                // 消灯
                if (this.errorBlinkDevices) {
                    this.errorBlinkDevices.delete(device.id);
                }
            }
            
            this.scheduleRender();
            blinkCount++;
        }, duration);
    }

    // フローティングエラーメッセージ表示
    showFloatingErrorMessage(device, message, options = {}) {
        const {
            duration = 3000,
            color = '#f44336'
        } = options;
        
        const errorMessage = document.createElement('div');
        errorMessage.textContent = message;
        errorMessage.style.position = 'absolute';
        errorMessage.style.backgroundColor = color;
        errorMessage.style.color = 'white';
        errorMessage.style.padding = '8px 12px';
        errorMessage.style.borderRadius = '8px';
        errorMessage.style.fontSize = '11px';
        errorMessage.style.fontWeight = 'bold';
        errorMessage.style.zIndex = '1002';
        errorMessage.style.pointerEvents = 'none';
        errorMessage.style.border = '2px solid rgba(255,255,255,0.3)';
        errorMessage.style.boxShadow = '0 4px 12px rgba(0,0,0,0.4)';
        errorMessage.style.whiteSpace = 'pre-line';
        errorMessage.style.textAlign = 'center';
        errorMessage.style.maxWidth = '200px';
        
        // デバイスの上部に配置
        const deviceWorldPos = {
            x: device.x + device.width / 2,
            y: device.y - 50
        };
        const deviceDomPos = this.worldToDOM ? this.worldToDOM(deviceWorldPos) : {
            x: deviceWorldPos.x * (this.scale || 1) + (this.panX || 0),
            y: deviceWorldPos.y * (this.scale || 1) + (this.panY || 0)
        };
        
        errorMessage.style.left = (deviceDomPos.x - 100) + 'px';
        errorMessage.style.top = deviceDomPos.y + 'px';
        
        const canvasContainer = document.querySelector('.canvas-container');
        if (canvasContainer) {
            canvasContainer.appendChild(errorMessage);
            
            // アニメーション効果
            errorMessage.style.opacity = '0';
            errorMessage.style.transform = 'scale(0.8) translateY(10px)';
            errorMessage.style.transition = 'all 300ms ease-out';
            
            // フェードイン
            setTimeout(() => {
                errorMessage.style.opacity = '1';
                errorMessage.style.transform = 'scale(1) translateY(0)';
            }, 100);
            
            // フェードアウト
            setTimeout(() => {
                errorMessage.style.transition = 'all 800ms ease-in';
                errorMessage.style.opacity = '0';
                errorMessage.style.transform = 'scale(0.9) translateY(-10px)';
            }, duration - 800);
            
            // 削除
            setTimeout(() => {
                if (errorMessage.parentNode) {
                    errorMessage.parentNode.removeChild(errorMessage);
                }
            }, duration);
        }
    }

    // 座標変換ヘルパー（フォールバック用）
    worldToDOM(worldPos) {
        return {
            x: worldPos.x * (this.scale || 1) + (this.panX || 0),
            y: worldPos.y * (this.scale || 1) + (this.panY || 0)
        };
    }

    // 宛先指定によるPing実行
    async executePingToTarget(sourceDevice, targetDevice, targetIp = null) {
        console.log('executePingToTarget called:', sourceDevice?.name, '->', targetDevice?.name, 'IP:', targetIp);

        // ブロードキャスト宛先判定
        if (targetIp && this.isBroadcastAddress(targetIp, sourceDevice?.config?.subnetMask, sourceDevice)) {
            await this.executeBroadcastPing(sourceDevice, targetIp);
            return;
        }

        // ループバックまたは同一デバイスへのPing判定
        if (sourceDevice === targetDevice || this.isLoopbackAddress(targetIp)) {
            await this.executeLoopbackPing(sourceDevice, targetIp || '127.0.0.1');
            return;
        }

        // 一時的に従来のフィールドを設定
        this.pingSourceDevice = sourceDevice;
        this.pingTargetDevice = targetDevice;
        
        console.log('Set ping devices:', this.pingSourceDevice.name, this.pingTargetDevice.name);
        
        // 既存のPing実行処理を呼び出し
        await this.executePing();
        
        console.log('executePing completed');
    }

    // 宛先指定によるHTTP通信実行
    async executeHTTPToTarget(sourceDevice, targetDevice, targetIp = null) {
        console.log('🌐 executeHTTPToTarget が呼び出されました:', sourceDevice?.name, '→', targetDevice?.name, 'IP:', targetIp);
        
        // ループバックまたは同一デバイスへのHTTP判定
        if (sourceDevice === targetDevice || this.isLoopbackAddress(targetIp)) {
            await this.executeLoopbackHTTP(sourceDevice, targetIp || '127.0.0.1');
            return;
        }

        console.log('🔍 デバイス情報:', {
            source: { name: sourceDevice?.name, type: sourceDevice?.type },
            target: { name: targetDevice?.name, type: targetDevice?.type }
        });

        // サーバータイプかWebサーバータイプの確認
        if (targetDevice.type !== 'server' && targetDevice.type !== 'dns') {
            alert(`HTTP通信の宛先は Webサーバー または DNSサーバー である必要があります。選択されたデバイス (${targetDevice.name}) は ${targetDevice.type} タイプです。`);
            return;
        }
        
        // 同じデバイス間のHTTP通信チェック
        if (sourceDevice === targetDevice) {
            alert('同一デバイス内でのHTTP通信は実行できません。');
            return;
        }
        
        // 同じIPアドレス間のHTTP通信チェック
        if (sourceDevice.config.ipAddress === targetDevice.config.ipAddress) {
            alert(`同じIPアドレス (${sourceDevice.config.ipAddress}) を持つデバイス間でのHTTP通信は実行できません。\nIPアドレスの重複を解決してください。`);
            return;
        }
        
        // ネットワークループチェック
        if (this.hasNetworkLoop()) {
            const loops = this.detectNetworkLoops();
            const shortErrorMessage = this.formatShortNetworkLoopError(loops);
            alert(`HTTP通信エラー: ${shortErrorMessage}`);
            return;
        }
        
        // 一時的に従来のフィールドを設定
        this.httpSourceDevice = sourceDevice;
        this.httpTargetDevice = targetDevice;
        
        this.updateStatus(`🌐 HTTP通信開始: ${sourceDevice.name} → ${targetDevice.name}`);
        
        try {
            // HTTPシミュレーターを使用してHTTPリクエストを送信
            console.log('🚀 HTTPリクエスト送信開始:', sourceDevice.name, '→', targetDevice.name);
            const session = window.httpSimulator.sendRequest(sourceDevice, targetDevice, {
                method: 'GET',
                path: '/',
                serverPort: 80
            });

            if (session) {
                console.log('✅ HTTP通信セッションが開始されました:', session.id);
                console.log('📊 HTTPセッション詳細:', {
                    id: session.id,
                    connectionId: session.connection?.id,
                    localDevice: session.connection?.localDevice?.name,
                    remoteDevice: session.connection?.remoteDevice?.name
                });
            } else {
                console.error('❌ HTTP通信セッションの作成に失敗しました');
                this.updateStatus('HTTP通信の開始に失敗しました');
            }
        } catch (error) {
            console.error('HTTP通信エラー:', error);
            this.updateStatus(`HTTP通信エラー: ${error.message}`);
        }
        
        // 実行後にフィールドをクリア
        this.httpSourceDevice = null;
        this.httpTargetDevice = null;
    }

    // デバイス設定保存
    saveDeviceConfig() {
        if (!this.currentDeviceConfig) return;

        const name = document.getElementById('device-name').value;

        // DHCP状態変更の検出用（設定更新前に保存）
        const originalDhcpState = this.currentDeviceConfig.config ? this.currentDeviceConfig.config.dhcpEnabled : false;

        // 基本設定の更新（全デバイス共通）
        this.currentDeviceConfig.name = name;

        // インターネットデバイスの場合はISP設定を処理
        if (this.currentDeviceConfig.type === 'internet') {
            this.saveInternetISPConfig();
            // ISP設定（有効/無効・プール範囲）の変更を、既に接続済みのルーター/PC/サーバー等に反映
            this.redistributeInternetISPConnections(this.currentDeviceConfig);
        }
        // スイッチの場合はL2機器のためIPアドレス等の設定なし（名前のみ保存）
        else if (this.currentDeviceConfig.type === 'switch') {
            console.log('🔌 スイッチの設定を保存:', this.currentDeviceConfig.name);
        }
        // ルーター以外かつインターネット・スイッチ以外のデバイスの場合のみ基本ネットワーク設定を処理
        else if (this.currentDeviceConfig.type !== 'router') {
            const ipAddress = document.getElementById('ip-address').value.trim();
            const subnetMask = document.getElementById('subnet-mask').value.trim();
            const defaultGateway = document.getElementById('default-gateway').value.trim();

            if (ipAddress && this.isLoopbackAddress(ipAddress)) {
                alert('127.0.0.0/8 はループバックアドレス（自端末内部参照用の予約アドレス）のため、インターフェースに設定することはできません。');
                return;
            }

            if (ipAddress && !this.isValidIP(ipAddress)) {
                alert('有効なIPアドレスを入力してください');
                return;
            }

            if (subnetMask && !this.isValidIP(subnetMask)) {
                alert('有効なサブネットマスクを入力してください');
                return;
            }

            if (ipAddress && this.isBroadcastAddress(ipAddress, subnetMask)) {
                alert('ブロードキャストアドレス (例: 255.255.255.255 やホスト部がすべて1のアドレス) は、ネットワーク全体への一斉送信用アドレスのため、端末のIPアドレスとして設定することはできません。');
                return;
            }

            if (ipAddress && this.isNetworkAddress(ipAddress, subnetMask)) {
                alert('ネットワークアドレス (ホスト部がすべて0のアドレス) は、ネットワーク自体を識別するためのアドレスのため、端末のIPアドレスとして設定することはできません。');
                return;
            }

            // IPアドレス重複チェック
            if (ipAddress && this.checkIPAddressDuplication(ipAddress, this.currentDeviceConfig)) {
                alert(`IPアドレス ${ipAddress} は他のデバイスで既に使用されています。\n別のIPアドレスを選択してください。`);
                return;
            }

            // 手動IP設定を保存
            this.currentDeviceConfig.config.ipAddress = ipAddress;
            this.currentDeviceConfig.config.subnetMask = subnetMask;
            this.currentDeviceConfig.config.defaultGateway = defaultGateway;

            // lan1.ipAddress も同期して更新
            if (this.currentDeviceConfig.config.lan1) {
                this.currentDeviceConfig.config.lan1.ipAddress = ipAddress;
            }
        }
        
        // ルーターの場合はWAN設定とDHCPサーバー設定、NAT設定も保存
        if (this.currentDeviceConfig.type === 'router') {
            const natCheckbox = document.getElementById('nat-enabled');
            if (natCheckbox) {
                this.currentDeviceConfig.natEnabled = natCheckbox.checked;
            }

            // WAN設定を保存
            this.saveWANConfig();
            
            const dhcpLeaseTime = parseInt(document.getElementById('dhcp-lease-time').value) || 3600;
            
            // LAN1 設定
            const lan1IP = document.getElementById('lan1-ip').value;
            const lan1SubnetMask = document.getElementById('lan1-subnet-mask').value;
            const lan1DefaultGateway = document.getElementById('lan1-default-gateway').value;
            const lan1DHCPEnabled = document.getElementById('lan1-dhcp-enabled').checked;
            const lan1PoolStart = document.getElementById('lan1-pool-start').value;
            const lan1PoolEnd = document.getElementById('lan1-pool-end').value;

            if (lan1IP && this.isLoopbackAddress(lan1IP)) {
                alert('LAN1 IPアドレスにループバックアドレス (127.0.0.0/8) は設定できません。');
                return;
            }

            if (!this.isValidIP(lan1IP)) {
                alert('有効なLAN1 IPアドレスを入力してください');
                return;
            }

            if (!this.isValidIP(lan1SubnetMask)) {
                alert('有効なLAN1 サブネットマスクを入力してください');
                return;
            }

            if (this.isBroadcastAddress(lan1IP, lan1SubnetMask)) {
                alert('LAN1 IPアドレスにブロードキャストアドレスは設定できません。');
                return;
            }

            if (this.isNetworkAddress(lan1IP, lan1SubnetMask)) {
                alert('LAN1 IPアドレスにネットワークアドレスは設定できません。');
                return;
            }

            if (!this.isValidIP(lan1DefaultGateway)) {
                alert('有効なLAN1 デフォルトゲートウェイを入力してください');
                return;
            }

            // LAN1 IPアドレス重複チェック
            if (this.checkIPAddressDuplicationForRouter(lan1IP, this.currentDeviceConfig, 'lan1')) {
                alert(`LAN1 IPアドレス ${lan1IP} は他のデバイスで既に使用されています。\n別のIPアドレスを選択してください。`);
                return;
            }

            if (lan1DHCPEnabled) {
                if (!this.isValidIP(lan1PoolStart) || !this.isValidIP(lan1PoolEnd)) {
                    alert('有効なLAN1 IPプール範囲を入力してください');
                    return;
                }
            }
            
            // LAN2 設定
            const lan2IP = document.getElementById('lan2-ip').value;
            const lan2SubnetMask = document.getElementById('lan2-subnet-mask').value;
            const lan2DefaultGateway = document.getElementById('lan2-default-gateway').value;
            const lan2DHCPEnabled = document.getElementById('lan2-dhcp-enabled').checked;
            const lan2PoolStart = document.getElementById('lan2-pool-start').value;
            const lan2PoolEnd = document.getElementById('lan2-pool-end').value;

            if (lan2IP && this.isLoopbackAddress(lan2IP)) {
                alert('LAN2 IPアドレスにループバックアドレス (127.0.0.0/8) は設定できません。');
                return;
            }

            if (!this.isValidIP(lan2IP)) {
                alert('有効なLAN2 IPアドレスを入力してください');
                return;
            }

            if (!this.isValidIP(lan2SubnetMask)) {
                alert('有効なLAN2 サブネットマスクを入力してください');
                return;
            }

            if (this.isBroadcastAddress(lan2IP, lan2SubnetMask)) {
                alert('LAN2 IPアドレスにブロードキャストアドレスは設定できません。');
                return;
            }

            if (this.isNetworkAddress(lan2IP, lan2SubnetMask)) {
                alert('LAN2 IPアドレスにネットワークアドレスは設定できません。');
                return;
            }

            if (!this.isValidIP(lan2DefaultGateway)) {
                alert('有効なLAN2 デフォルトゲートウェイを入力してください');
                return;
            }

            // LAN2 IPアドレス重複チェック
            if (this.checkIPAddressDuplicationForRouter(lan2IP, this.currentDeviceConfig, 'lan2')) {
                alert(`LAN2 IPアドレス ${lan2IP} は他のデバイスで既に使用されています。\n別のIPアドレスを選択してください。`);
                return;
            }

            if (lan2DHCPEnabled) {
                if (!this.isValidIP(lan2PoolStart) || !this.isValidIP(lan2PoolEnd)) {
                    alert('有効なLAN2 IPプール範囲を入力してください');
                    return;
                }
            }
            
            // LAN3 設定
            const lan3IP = document.getElementById('lan3-ip').value;
            const lan3SubnetMask = document.getElementById('lan3-subnet-mask').value;
            const lan3DefaultGateway = document.getElementById('lan3-default-gateway').value;
            const lan3DHCPEnabled = document.getElementById('lan3-dhcp-enabled').checked;
            const lan3PoolStart = document.getElementById('lan3-pool-start').value;
            const lan3PoolEnd = document.getElementById('lan3-pool-end').value;

            if (lan3IP && this.isLoopbackAddress(lan3IP)) {
                alert('LAN3 IPアドレスにループバックアドレス (127.0.0.0/8) は設定できません。');
                return;
            }

            if (!this.isValidIP(lan3IP)) {
                alert('有効なLAN3 IPアドレスを入力してください');
                return;
            }

            if (!this.isValidIP(lan3SubnetMask)) {
                alert('有効なLAN3 サブネットマスクを入力してください');
                return;
            }

            if (this.isBroadcastAddress(lan3IP, lan3SubnetMask)) {
                alert('LAN3 IPアドレスにブロードキャストアドレスは設定できません。');
                return;
            }

            if (this.isNetworkAddress(lan3IP, lan3SubnetMask)) {
                alert('LAN3 IPアドレスにネットワークアドレスは設定できません。');
                return;
            }

            if (!this.isValidIP(lan3DefaultGateway)) {
                alert('有効なLAN3 デフォルトゲートウェイを入力してください');
                return;
            }

            // LAN3 IPアドレス重複チェック
            if (this.checkIPAddressDuplicationForRouter(lan3IP, this.currentDeviceConfig, 'lan3')) {
                alert(`LAN3 IPアドレス ${lan3IP} は他のデバイスで既に使用されています。\n別のIPアドレスを選択してください。`);
                return;
            }

            if (lan3DHCPEnabled) {
                if (!this.isValidIP(lan3PoolStart) || !this.isValidIP(lan3PoolEnd)) {
                    alert('有効なLAN3 IPプール範囲を入力してください');
                    return;
                }
            }
            
            // 設定を保存
            this.currentDeviceConfig.config.lan1.ipAddress = lan1IP;
            this.currentDeviceConfig.config.lan1.subnetMask = lan1SubnetMask;
            this.currentDeviceConfig.config.lan1.defaultGateway = lan1DefaultGateway;
            this.currentDeviceConfig.config.lan1.dhcpEnabled = lan1DHCPEnabled;
            this.currentDeviceConfig.config.lan1.dhcpPoolStart = lan1PoolStart;
            this.currentDeviceConfig.config.lan1.dhcpPoolEnd = lan1PoolEnd;

            this.currentDeviceConfig.config.lan2.ipAddress = lan2IP;
            this.currentDeviceConfig.config.lan2.subnetMask = lan2SubnetMask;
            this.currentDeviceConfig.config.lan2.defaultGateway = lan2DefaultGateway;
            this.currentDeviceConfig.config.lan2.dhcpEnabled = lan2DHCPEnabled;
            this.currentDeviceConfig.config.lan2.dhcpPoolStart = lan2PoolStart;
            this.currentDeviceConfig.config.lan2.dhcpPoolEnd = lan2PoolEnd;

            this.currentDeviceConfig.config.lan3.ipAddress = lan3IP;
            this.currentDeviceConfig.config.lan3.subnetMask = lan3SubnetMask;
            this.currentDeviceConfig.config.lan3.defaultGateway = lan3DefaultGateway;
            this.currentDeviceConfig.config.lan3.dhcpEnabled = lan3DHCPEnabled;
            this.currentDeviceConfig.config.lan3.dhcpPoolStart = lan3PoolStart;
            this.currentDeviceConfig.config.lan3.dhcpPoolEnd = lan3PoolEnd;
            
            this.currentDeviceConfig.config.dhcpLeaseTime = dhcpLeaseTime;
            
            // 後方互換性のために旧設定も同期
            this.currentDeviceConfig.config.dhcpServerEnabled = lan1DHCPEnabled;
            this.currentDeviceConfig.config.dhcpPoolStart = lan1PoolStart;
            this.currentDeviceConfig.config.dhcpPoolEnd = lan1PoolEnd;
            this.currentDeviceConfig.config.ipAddress = lan1IP; // メインIPはLAN1に設定
            
            // DHCP設定変更時のクライアント再配布
            this.redistributeDHCPAddresses(this.currentDeviceConfig);
        }

        // DNSサーバーの場合はDNSテーブルも保存
        if (this.currentDeviceConfig.type === 'dns') {
            const dnsRecords = document.querySelectorAll('.dns-record-item');
            const dnsTable = {};
            
            dnsRecords.forEach(record => {
                const inputs = record.querySelectorAll('input');
                const hostname = inputs[0].value.trim();
                const ipAddress = inputs[1].value.trim();
                
                // 空でない場合のみテーブルに追加
                if (hostname && ipAddress) {
                    if (this.isValidIP(ipAddress)) {
                        dnsTable[hostname] = ipAddress;
                    } else {
                        alert(`DNSレコード "${hostname}" に無効なIPアドレスが設定されています: ${ipAddress}`);
                        return;
                    }
                }
            });
            
            this.currentDeviceConfig.dnsTable = dnsTable;
            console.log('DNSテーブル保存:', dnsTable);
        }

        // ルーターの場合、既存の接続に対してDHCP設定を再適用
        if (this.currentDeviceConfig.type === 'router') {
            this.reapplyDHCPToExistingConnections(this.currentDeviceConfig);
        }

        this.hideDeviceConfig();
        this.updateStatus(`${name} の設定を更新しました`);
        this.scheduleRender();
    }

    // 既存接続に対してDHCP設定を再適用
    reapplyDHCPToExistingConnections(router) {
        console.log('🔄 DHCP設定変更 - 既存接続を再評価開始:', router.name);
        console.log('🔍 ルーター設定状態:', {
            lan1_dhcp: router.config.lan1?.dhcpEnabled,
            lan2_dhcp: router.config.lan2?.dhcpEnabled,
            lan3_dhcp: router.config.lan3?.dhcpEnabled
        });

        // このルーターに接続されているすべてのデバイスを探す
        const connectedDevices = this.getConnectedDHCPClients(router);

        console.log('🔍 接続デバイス数:', connectedDevices.length);

        connectedDevices.forEach(clientInfo => {
            const { client, lanConfig, connectionType } = clientInfo;
            const lanName = this.getLANName(router, lanConfig);
            console.log(`🔄 ${client.name} の設定を再適用中... (${connectionType}, ${lanName})`);

            // DHCP有効かチェック
            if (!client.config || !client.config.dhcpEnabled) {
                console.log(`⏭️ ${client.name} はDHCP無効のためスキップ`);
                return;
            }

            // ★★★ 重要: lanConfigのDHCP状態を再確認（設定保存直後の最新状態を取得）★★★
            const currentLanDhcpEnabled = lanConfig?.dhcpEnabled || false;
            console.log(`🔍 ${lanName} DHCP状態チェック:`, {
                lanConfig: lanConfig ? 'あり' : 'なし',
                dhcpEnabled: currentLanDhcpEnabled,
                lanConfigObject: lanConfig
            });

            if (!lanConfig || !currentLanDhcpEnabled) {
                console.log(`⏭️ ${router.name} の${lanName}でDHCP無効のためスキップ (dhcpEnabled: ${currentLanDhcpEnabled})`);
                return;
            }

            // 既存のリースを保持しつつ、設定のみ更新
            const currentIP = client.config.ipAddress;

            if (currentIP && currentIP !== '0.0.0.0') {
                // 現在のIPを保持して設定だけ更新
                client.config.subnetMask = lanConfig.subnetMask || '255.255.255.0';
                client.config.defaultGateway = lanConfig.defaultGateway || lanConfig.ipAddress;

                console.log(`✅ ${client.name} 設定更新完了:`, {
                    ip: currentIP,
                    subnet: client.config.subnetMask,
                    gateway: client.config.defaultGateway,
                    lan: lanName
                });

                this.updateStatus(`🔄 ${client.name} のDHCP設定を更新しました (IP: ${currentIP}, ${lanName})`);
            } else {
                // IPが未割り当ての場合は新規割り当て（DHCP有効なLANのみ）
                console.log(`🆕 ${client.name} に新規IP割り当て (${lanName}, DHCP: ${currentLanDhcpEnabled})`);
                this.assignDHCPToClient(client, router, null, connectionType);
            }
        });

        console.log('✅ DHCP設定再適用完了');
    }

    // ルーターに接続されているDHCPクライアントを取得
    getConnectedDHCPClients(router) {
        const connectedClients = [];

        // 直接接続を検索
        this.connections.forEach(connection => {
            let client = null;
            let routerPort = null;

            // 接続パターンを特定
            if (connection.from.device === router &&
                ['pc', 'server', 'dns'].includes(connection.to.device.type)) {
                client = connection.to.device;
                routerPort = connection.from.port;
            } else if (connection.to.device === router &&
                       ['pc', 'server', 'dns'].includes(connection.from.device.type)) {
                client = connection.from.device;
                routerPort = connection.to.port;
            }

            if (client && routerPort) {
                // どのLANに接続されているかを判定
                const lanConfig = this.determineLANConnection(client, router);
                if (lanConfig) {
                    connectedClients.push({
                        client: client,
                        lanConfig: lanConfig,
                        connectionType: 'direct'
                    });
                }
            }
        });

        // スイッチ経由の接続も検索
        this.findSwitchConnectedClients(router, connectedClients);

        return connectedClients;
    }

    // スイッチ経由で接続されているクライアントを再帰的に検索
    findSwitchConnectedClients(router, connectedClients, visitedSwitches = new Set()) {
        this.connections.forEach(connection => {
            let switchDevice = null;

            // ルーター ↔ スイッチ の接続を探す
            if (connection.from.device === router && connection.to.device.type === 'switch') {
                switchDevice = connection.to.device;
            } else if (connection.to.device === router && connection.from.device.type === 'switch') {
                switchDevice = connection.from.device;
            }

            if (switchDevice && !visitedSwitches.has(switchDevice.id)) {
                visitedSwitches.add(switchDevice.id);

                // このスイッチに接続されているクライアントを探す
                this.connections.forEach(switchConnection => {
                    let client = null;

                    if (switchConnection.from.device === switchDevice &&
                        ['pc', 'server', 'dns'].includes(switchConnection.to.device.type)) {
                        client = switchConnection.to.device;
                    } else if (switchConnection.to.device === switchDevice &&
                               ['pc', 'server', 'dns'].includes(switchConnection.from.device.type)) {
                        client = switchConnection.from.device;
                    }

                    if (client) {
                        // 重複チェック
                        const alreadyAdded = connectedClients.some(info => info.client.id === client.id);
                        if (!alreadyAdded) {
                            const lanConfig = this.determineLANConnection(client, router);
                            if (lanConfig) {
                                connectedClients.push({
                                    client: client,
                                    lanConfig: lanConfig,
                                    connectionType: 'switch'
                                });
                            }
                        }
                    }

                    // 多段スイッチの場合、再帰的に検索
                    if (switchConnection.from.device === switchDevice &&
                        switchConnection.to.device.type === 'switch') {
                        this.findSwitchConnectedClients(router, connectedClients, visitedSwitches);
                    } else if (switchConnection.to.device === switchDevice &&
                               switchConnection.from.device.type === 'switch') {
                        this.findSwitchConnectedClients(router, connectedClients, visitedSwitches);
                    }
                });
            }
        });
    }

    // インターネットデバイスのISP設定を保存
    saveInternetISPConfig() {
        const config = this.currentDeviceConfig.config;

        // ISP1-6の設定を保存
        ['isp1', 'isp2', 'isp3', 'isp4', 'isp5', 'isp6'].forEach(ispId => {
            const isp = config[ispId];
            if (isp) {
                // チェックボックスとプール設定を取得
                const dhcpEnabled = document.getElementById(`${ispId}-dhcp-enabled`).checked;
                const poolStart = document.getElementById(`${ispId}-pool-start`).value;
                const poolEnd = document.getElementById(`${ispId}-pool-end`).value;

                // IPアドレス範囲の検証
                if (dhcpEnabled) {
                    if (!this.isValidIP(poolStart) || !this.isValidIP(poolEnd)) {
                        alert(`${ispId.toUpperCase()}のIPプール設定が無効です。有効なIPアドレスを入力してください。`);
                        return false;
                    }

                    // 開始IPと終了IPの妥当性チェック
                    const startOctets = poolStart.split('.').map(n => parseInt(n));
                    const endOctets = poolEnd.split('.').map(n => parseInt(n));

                    if (startOctets[3] >= endOctets[3]) {
                        alert(`${ispId.toUpperCase()}のIPプール設定が無効です。開始IPは終了IPより小さくしてください。`);
                        return false;
                    }
                }

                // 設定を更新
                isp.dhcpEnabled = dhcpEnabled;
                isp.dhcpPoolStart = poolStart;
                isp.dhcpPoolEnd = poolEnd;

                // 既存の割り当てをクリア（設定変更時）
                // dhcpAllocatedIPsがMapでない場合は新しいMapを作成
                if (!(isp.dhcpAllocatedIPs instanceof Map)) {
                    isp.dhcpAllocatedIPs = new Map();
                } else {
                    isp.dhcpAllocatedIPs.clear();
                }

                console.log(`✅ ${ispId.toUpperCase()}設定更新:`, {
                    enabled: dhcpEnabled,
                    start: poolStart,
                    end: poolEnd
                });
            }
        });

        // 共通設定を保存
        const leaseTime = parseInt(document.getElementById('isp-lease-time').value) || 3600;
        config.dhcpLeaseTime = leaseTime;

        return true;
    }

    // IPアドレス検証
    isValidIP(ip) {
        if (!ip || typeof ip !== 'string') return false;
        const regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
        const match = ip.match(regex);
        if (!match) return false;
        
        for (let i = 1; i <= 4; i++) {
            const num = parseInt(match[i]);
            if (num < 0 || num > 255) return false;
        }
        return true;
    }

    // コントロールボタン更新
    updateControlButtons() {
        const hasDevices = this.devices.size > 0;
        const hasSelectedDevice = this.selectedDevice !== null;
        const hasPingableDevices = this.devices.size >= 2;
        
        const pingBtn = document.getElementById('ping-btn');
        pingBtn.disabled = !hasPingableDevices;
        
        // Pingボタンのテキストを動的に変更
        if (this.isPingMode) {
            pingBtn.textContent = '⏹️ Ping終了';
            pingBtn.style.backgroundColor = '#f44336';
        } else {
            pingBtn.textContent = '🚀 Ping';
            pingBtn.style.backgroundColor = '#2196f3';
        }
        
        // HTTPボタンの制御
        const httpBtn = document.getElementById('http-btn');
        if (httpBtn) {
            httpBtn.disabled = !hasPingableDevices || this.isPingMode || this.isDHCPMode;
            
            // HTTPボタンのテキストを動的に変更
            if (this.isHTTPMode) {
                httpBtn.textContent = '⏹️ HTTP終了';
                httpBtn.style.backgroundColor = '#f44336';
            } else {
                httpBtn.textContent = '🌐 HTTP';
                httpBtn.style.backgroundColor = '#2196f3';
            }
        }

        // DHCPボタンの制御
        const dhcpBtn = document.getElementById('dhcp-btn');
        if (dhcpBtn) {
            dhcpBtn.disabled = !hasDevices || this.isPingMode || this.isHTTPMode;
            
            if (this.isDHCPMode) {
                dhcpBtn.textContent = '⏹️ DHCP終了';
                dhcpBtn.style.backgroundColor = '#f44336';
            } else {
                dhcpBtn.textContent = '🔄 DHCP';
                dhcpBtn.style.backgroundColor = '#0284c7';
            }
        }
        
        document.getElementById('config-btn').disabled = !hasSelectedDevice || this.isPingMode || this.isHTTPMode || this.isDHCPMode;
    }

    // ステータス更新
    updateStatus(message) {
        document.getElementById('status-text').textContent = message || 'デバイスを配置してください';
    }

    // 描画
    render() {
        // キャンバスサイズを取得して確実にクリア
        const rect = this.canvas.getBoundingClientRect();
        this.ctx.save();
        this.ctx.setTransform(1, 0, 0, 1, 0, 0); // 変換行列をリセット
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.restore();
        
        this.ctx.save();
        this.ctx.translate(this.panX, this.panY);
        this.ctx.scale(this.scale, this.scale);
        
        // 単一NICデバイスの動的ポート位置を更新（パフォーマンス最適化）
        // JSON読み込み直後は必ず更新する（lastNICUpdateFrameがnullの場合）
        if (!this.lastNICUpdateFrame || (performance.now() - this.lastNICUpdateFrame) > 50) {
            this.updateAllDynamicNICPositions();
            this.lastNICUpdateFrame = performance.now();
        }
        
        // 接続線を描画
        this.drawConnections();
        
        // デバイスを描画
        this.drawDevices();
        
        // ペンディングデバイスを描画（マップに追加されていない場合のみ）
        if (this.pendingDevice && !this.devices.has(this.pendingDevice.id)) {
            this.drawDevice(this.pendingDevice);
        }
        
        // 接続開始時の一時的な線
        if (this.connectionStart) {
            this.drawTemporaryConnection();
        }
        
        this.ctx.restore();
        
        // パレットエリアのハイライト（デバイスドラッグ中）
        if (this.isDragging && this.selectedDevice && !this.pendingDevice) {
            this.drawPaletteDropZone();
        }
    }
    
    // パレットドロップゾーンのハイライト描画
    drawPaletteDropZone() {
        const paletteRect = this.getPaletteRect();
        if (!paletteRect) return;
        
        const canvasRect = this.canvas.getBoundingClientRect();
        
        // パレットエリアをキャンバス座標系に変換
        const x = paletteRect.left - canvasRect.left;
        const y = paletteRect.top - canvasRect.top;
        const width = paletteRect.width;
        const height = paletteRect.height;
        
        // 半透明の赤色でハイライト
        this.ctx.save();
        this.ctx.fillStyle = 'rgba(255, 99, 71, 0.3)';
        this.ctx.fillRect(x, y, width, height);
        
        // 境界線を描画
        this.ctx.strokeStyle = '#ff6347';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.strokeRect(x, y, width, height);
        this.ctx.setLineDash([]);
        
        // 削除アイコンまたはテキストを表示
        this.ctx.fillStyle = '#ff6347';
        this.ctx.font = 'bold 16px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText('🗑️ ここにドロップで削除', x + width/2, y + height/2);
        
        this.ctx.restore();
    }

    // 接続線描画
    drawConnections() {
        this.ctx.strokeStyle = '#666';
        this.ctx.lineWidth = 2;
        
        for (const connection of this.connections) {
            this.drawConnection(connection);
        }
    }

    // 個別接続線の描画
    drawConnection(connection) {
        let fromDevice, toDevice, fromPortId, toPortId;
        
        // 新しい形式（from/to オブジェクト）と古い形式の両方をサポート
        if (connection.from && connection.to) {
            // 新しい形式
            fromDevice = connection.from.device;
            toDevice = connection.to.device;
            fromPortId = connection.from.port.id;
            toPortId = connection.to.port.id;
        } else {
            // 古い形式（後方互換性）
            fromDevice = this.devices.get(connection.fromDevice);
            toDevice = this.devices.get(connection.toDevice);
            fromPortId = connection.fromPort;
            toPortId = connection.toPort;
        }
        
        if (!fromDevice || !toDevice) return;
        
        // 接続元と接続先の端子位置を取得
        const fromPort = this.getPortPosition(fromDevice, fromPortId);
        const toPort = this.getPortPosition(toDevice, toPortId);
        
        if (!fromPort || !toPort) return;
        
        // 接続線のスタイル
        this.ctx.strokeStyle = connection.selected ? '#ff9800' : '#333';
        this.ctx.lineWidth = connection.selected ? 3 : 2;
        
        // ベジェ曲線で接続線を描画
        this.ctx.beginPath();
        this.ctx.moveTo(fromPort.x, fromPort.y);
        
        // 制御点の計算（ポートの向きに応じて適切な方向に設定）
        const controlOffset = 30;

        // 送信元ポートの制御点（ポートの向きに応じて外向きに）
        const fromPortData = this.getPortData(fromDevice, fromPortId);
        const toPortData = this.getPortData(toDevice, toPortId);

        let cp1x, cp1y, cp2x, cp2y;

        // 同一デバイス内の異なるNIC間接続の場合、視覚的に分かりやすいパスで表示
        const isLoopConnection = fromDevice === toDevice && fromPortId !== toPortId;

        if (isLoopConnection) {
            // ループ接続の場合、デバイスの外側を迂回する大きなカーブを描画
            const deviceCenterX = fromDevice.x + fromDevice.width / 2;
            const deviceCenterY = fromDevice.y + fromDevice.height / 2;
            const loopOffset = Math.max(fromDevice.width, fromDevice.height) * 0.8;

            // デバイスの右側を迂回するパス
            cp1x = fromPort.x + loopOffset;
            cp1y = fromPort.y - loopOffset / 2;
            cp2x = toPort.x + loopOffset;
            cp2y = toPort.y + loopOffset / 2;
        } else {
            // 通常の接続の場合
            // 送信元ポートの制御点を側面に応じて設定（相手に向かう方向）
            const dx = toPort.x - fromPort.x;
            const dy = toPort.y - fromPort.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const normalizedDx = length > 0 ? dx / length : 0;
            const normalizedDy = length > 0 ? dy / length : 0;

            switch (fromPortData?.side) {
                case 'right':
                    cp1x = fromPort.x + controlOffset;
                    cp1y = fromPort.y;
                    break;
                case 'left':
                    cp1x = fromPort.x - controlOffset;
                    cp1y = fromPort.y;
                    break;
                case 'top':
                    cp1x = fromPort.x;
                    cp1y = fromPort.y - controlOffset;
                    break;
                case 'bottom':
                    cp1x = fromPort.x;
                    cp1y = fromPort.y + controlOffset;
                    break;
                default:
                    // 相手の方向を考慮したデフォルト制御点
                    cp1x = fromPort.x + normalizedDx * controlOffset;
                    cp1y = fromPort.y + normalizedDy * controlOffset;
            }

            // 宛先ポートの制御点を側面に応じて設定（送信元から来る方向）
            switch (toPortData?.side) {
                case 'right':
                    cp2x = toPort.x + controlOffset;
                    cp2y = toPort.y;
                    break;
                case 'left':
                    cp2x = toPort.x - controlOffset;
                    cp2y = toPort.y;
                    break;
                case 'top':
                    cp2x = toPort.x;
                    cp2y = toPort.y - controlOffset;
                    break;
                case 'bottom':
                    cp2x = toPort.x;
                    cp2y = toPort.y + controlOffset;
                    break;
                default:
                    // 送信元から来る方向を考慮したデフォルト制御点
                    cp2x = toPort.x - normalizedDx * controlOffset;
                    cp2y = toPort.y - normalizedDy * controlOffset;
            }
        }
        
        this.ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, toPort.x, toPort.y);
        this.ctx.stroke();
        
        // 接続線の中点に信号の流れを示すマーカー
        if (connection.showFlow) {
            const t = 0.5; // 中点
            const markerX = Math.pow(1-t, 3) * fromPort.x + 3 * Math.pow(1-t, 2) * t * cp1x + 3 * (1-t) * Math.pow(t, 2) * cp2x + Math.pow(t, 3) * toPort.x;
            const markerY = Math.pow(1-t, 3) * fromPort.y + 3 * Math.pow(1-t, 2) * t * cp1y + 3 * (1-t) * Math.pow(t, 2) * cp2y + Math.pow(t, 3) * toPort.y;
            
            this.ctx.fillStyle = '#4caf50';
            this.ctx.beginPath();
            this.ctx.arc(markerX, markerY, 3, 0, 2 * Math.PI);
            this.ctx.fill();
        }
    }

    // デバイスの指定NICポートの位置を取得
    getPortPosition(device, portId) {
        const ports = device.ports;
        if (!ports || !ports.nics) return null;
        
        // NICポートから検索
        for (const port of ports.nics) {
            if (port.id === portId) {
                return {
                    x: device.x + port.x * device.width,
                    y: device.y + port.y * device.height
                };
            }
        }
        
        return null;
    }

    // デバイスの指定NICポートのデータ（側面情報含む）を取得
    getPortData(device, portId) {
        const ports = device.ports;
        if (!ports || !ports.nics) return null;
        
        // NICポートから検索
        for (const port of ports.nics) {
            if (port.id === portId) {
                return port;
            }
        }
        
        return null;
    }

    // 一時的な接続線描画
    drawTemporaryConnection() {
        if (!this.connectionStart) return;
        
        const device = this.connectionStart.device;
        const port = this.connectionStart.port;
        
        const startX = device.x + port.x * device.width;
        const startY = device.y + port.y * device.height;
        
        // currentMousePosは既にワールド座標系なのでそのまま使用
        const endX = this.currentMousePos.x;
        const endY = this.currentMousePos.y;
        
        this.ctx.strokeStyle = '#ff9800';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        
        this.ctx.beginPath();
        this.ctx.moveTo(startX, startY);
        this.ctx.lineTo(endX, endY);
        this.ctx.stroke();
        
        this.ctx.setLineDash([]);
        
        // 開始ポートをハイライト
        this.ctx.strokeStyle = '#ff9800';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.arc(startX, startY, 6, 0, 2 * Math.PI);
        this.ctx.stroke();
    }

    // デバイス描画
    drawDevices() {
        // Z-indexでソート
        const sortedDevices = Array.from(this.devices.values())
            .sort((a, b) => a.zIndex - b.zIndex);
        
        for (const device of sortedDevices) {
            this.drawDevice(device);
        }
    }

    // 個別デバイス描画（HTTPハイライト対応版）
    drawDevice(device, httpHighlight = null) {
        const isSelected = this.selectedDevice && this.selectedDevice.id === device.id;
        const isConnectionStart = this.connectionStart && this.connectionStart.device && this.connectionStart.device.id === device.id;
        const isPending = this.pendingDevice && this.pendingDevice.id === device.id;
        
        this.ctx.save();
        
        // パレットからドラッグ中のプレビュー効果
        if (isPending) {
            this.ctx.globalAlpha = 0.88;
            this.ctx.shadowColor = 'rgba(33, 150, 243, 0.4)';
            this.ctx.shadowBlur = 10;
        }
        
        // Pingモードおよび宛先ダイアログ表示中でのハイライト判定
        let pingHighlight = null;
        if (this.isPingMode || this.destinationSourceDevice) {
            const src = this.pingSourceDevice || this.destinationSourceDevice;
            if (device === src) {
                pingHighlight = 'source';
            } else if (device === this.pingTargetDevice) {
                pingHighlight = 'target';
            }
        }
        
        // HTTP モードでのハイライト（引数で渡される）
        if (httpHighlight) {
            pingHighlight = httpHighlight; // 同じ描画ロジックを使用
        }
        
        // エラー点滅効果
        const errorBlink = this.errorBlinkDevices && this.errorBlinkDevices.has(device);
        const successBlink = this.successBlinkDevices && this.successBlinkDevices.has(device.id || device);
        const blinkPhase = Math.floor(Date.now() / 200) % 2; // 200msごとに点滅
        
        // デバイス背景色
        if (errorBlink && blinkPhase === 0) {
            this.ctx.fillStyle = '#ffebee'; // エラー時の点滅色（薄い赤）
        } else if (successBlink && blinkPhase === 0) {
            this.ctx.fillStyle = '#e8f5e9'; // 成功時の点滅色（薄い緑）
        } else if (this.isDHCPMode && ['pc', 'server', 'dns', 'router'].includes(device.type)) {
            this.ctx.fillStyle = '#f0f9ff'; // DHCPモード中は薄いスカイブルー
        } else if (pingHighlight === 'source' || httpHighlight === 'source') {
            this.ctx.fillStyle = '#e3f2fd'; // 送信元は青系
        } else if (pingHighlight === 'target' || httpHighlight === 'target') {
            this.ctx.fillStyle = '#ffebee'; // 送信先は赤系
        } else if (isPending) {
            this.ctx.fillStyle = '#ffffff';
        } else {
            this.ctx.fillStyle = this.getDeviceColor(device.type);
        }
        
        // デバイス枠線
        if (errorBlink && blinkPhase === 0) {
            this.ctx.strokeStyle = '#f44336'; // エラー時の枠線（赤）
            this.ctx.lineWidth = 3;
        } else if (successBlink && blinkPhase === 0) {
            this.ctx.strokeStyle = '#4caf50'; // 成功時の枠線（緑）
            this.ctx.lineWidth = 3;
        } else if (this.isDHCPMode && ['pc', 'server', 'dns', 'router'].includes(device.type)) {
            this.ctx.strokeStyle = '#0284c7'; // DHCPモード枠線（青）
            this.ctx.lineWidth = isSelected ? 4 : 2;
        } else if (pingHighlight === 'source' || httpHighlight === 'source') {
            this.ctx.strokeStyle = '#2196f3'; // 送信元は青
            this.ctx.lineWidth = 4;
        } else if (pingHighlight === 'target' || httpHighlight === 'target') {
            this.ctx.strokeStyle = '#f44336'; // 送信先は赤
            this.ctx.lineWidth = 4;
        } else if (isPending) {
            this.ctx.strokeStyle = '#2196f3';
            this.ctx.lineWidth = 2.5;
            this.ctx.setLineDash([4, 4]);
        } else {
            this.ctx.strokeStyle = isSelected ? '#2196f3' : (isConnectionStart ? '#ff9800' : '#666');
            this.ctx.lineWidth = isSelected || isConnectionStart ? 3 : 1;
        }
        
        this.ctx.fillRect(device.x, device.y, device.width, device.height);
        this.ctx.strokeRect(device.x, device.y, device.width, device.height);
        this.ctx.setLineDash([]); // 破線をリセット
        
        // 端子を描画
        this.drawDevicePorts(device);
        
        // アイコン（ルーターの場合は位置を上に調整）
        this.ctx.font = '18px Arial';
        this.ctx.fillStyle = '#333';
        this.ctx.textAlign = 'center';
        const iconYOffset = device.type === 'router' ? 18 : 20;
        this.ctx.fillText(
            this.getDeviceIcon(device.type),
            device.x + device.width / 2,
            device.y + iconYOffset
        );
        
        // デバイス名
        this.ctx.font = 'bold 9.5px Arial';
        this.ctx.fillStyle = '#1e293b';
        let displayName = device.name;
        
        // モードでのインジケーター追加
        if (pingHighlight === 'source') {
            displayName = '🔵 ' + device.name + ' (送信元)';
            this.ctx.fillStyle = '#2196f3';
        } else if (pingHighlight === 'target') {
            displayName = '🔴 ' + device.name + ' (送信先)';
            this.ctx.fillStyle = '#f44336';
        } else if (httpHighlight === 'source') {
            displayName = '🌐 ' + device.name + ' (クライアント)';
            this.ctx.fillStyle = '#2196f3';
        } else if (httpHighlight === 'target') {
            displayName = '🖥️ ' + device.name + ' (サーバー)';
            this.ctx.fillStyle = '#f44336';
        }
        
        // デバイス名の表示位置
        const nameYOffset = (device.type === 'router') ? 50 : 26;
        this.ctx.fillText(
            displayName,
            device.x + device.width / 2,
            device.y + device.height - nameYOffset
        );
        
        // IPアドレス & MACアドレス表示
        if (device.type === 'router') {
            // ルーターの場合は各ポートのIP・MAC情報を表示
            this.ctx.font = '7.5px Arial';
            this.ctx.fillStyle = '#475569';
            let ipLines = [];
            
            // WAN IPアドレス表示
            if (device.wanConfig && device.wanConfig.ipAddress && 
                device.wanConfig.ipAddress !== '0.0.0.0') {
                const wanCidr = this.subnetMaskToCIDR(device.wanConfig.subnetMask || '255.255.255.0');
                ipLines.push(`WAN: ${device.wanConfig.ipAddress}/${wanCidr}`);
            }
            
            // LANインターフェースのIP表示
            if (device.config.lan1 && device.config.lan1.ipAddress &&
                device.config.lan1.ipAddress !== '0.0.0.0') {
                const lan1Cidr = this.subnetMaskToCIDR(device.config.lan1.subnetMask || '255.255.255.0');
                ipLines.push(`L1: ${device.config.lan1.ipAddress}/${lan1Cidr}`);
            }
            if (device.config.lan2 && device.config.lan2.ipAddress &&
                device.config.lan2.ipAddress !== '0.0.0.0') {
                const lan2Cidr = this.subnetMaskToCIDR(device.config.lan2.subnetMask || '255.255.255.0');
                ipLines.push(`L2: ${device.config.lan2.ipAddress}/${lan2Cidr}`);
            }
            if (device.config.lan3 && device.config.lan3.ipAddress &&
                device.config.lan3.ipAddress !== '0.0.0.0') {
                const lan3Cidr = this.subnetMaskToCIDR(device.config.lan3.subnetMask || '255.255.255.0');
                ipLines.push(`L3: ${device.config.lan3.ipAddress}/${lan3Cidr}`);
            }
            
            // 基本IPが設定されている場合
            if (device.config.ipAddress && device.config.ipAddress !== '0.0.0.0') {
                const cidr = this.subnetMaskToCIDR(device.config.subnetMask);
                if (ipLines.length === 0 || !ipLines.some(line => line.includes(device.config.ipAddress))) {
                    ipLines.push(`LAN: ${device.config.ipAddress}/${cidr}`);
                }
            }
            
            const ipStartY = device.y + device.height - nameYOffset + 9;
            ipLines.forEach((line, index) => {
                this.ctx.fillText(
                    line,
                    device.x + device.width / 2,
                    ipStartY + (index * 9)
                );
            });
        } else if (device.type === 'switch') {
            // スイッチはL2機器情報と学習済みMAC数を表示
            this.ctx.font = '8px Arial';
            this.ctx.fillStyle = '#0284c7';
            this.ctx.fillText(
                'L2 Switch',
                device.x + device.width / 2,
                device.y + device.height - 14
            );

            this.ctx.font = '7.5px Arial';
            this.ctx.fillStyle = '#64748b';
            const macCount = device.macTable ? device.macTable.size : 0;
            const text = macCount > 0 ? `MAC: ${macCount}件学習` : 'MAC: 未学習';
            this.ctx.fillText(
                text,
                device.x + device.width / 2,
                device.y + device.height - 4
            );
        } else if (device.type !== 'onu') {
            // 端末デバイス（PC, サーバー, DNS等）は IP/CIDR と MAC アドレスを常時表示
            // 1. IPアドレス / CIDR
            this.ctx.font = '8.5px Arial';
            this.ctx.fillStyle = '#334155';
            const cidr = this.subnetMaskToCIDR(device.config.subnetMask || '255.255.255.0');
            const ipText = device.config.ipAddress ? `${device.config.ipAddress}/${cidr}` : 'IP未設定';
            this.ctx.fillText(
                ipText,
                device.x + device.width / 2,
                device.y + device.height - 14
            );

            // 2. MACアドレスまたはサブネットマスク（常時可視化）
            this.ctx.font = '7.5px monospace';
            this.ctx.fillStyle = '#64748b';
            const secondLineText = device.type === 'pc' 
                ? (device.config.subnetMask || '255.255.255.0')
                : (device.macAddress || this.getDeviceMAC(device) || '');
                
            if (secondLineText) {
                this.ctx.fillText(
                    secondLineText,
                    device.x + device.width / 2,
                    device.y + device.height - 4
                );
            }
        }
        // ONUはIP/MACアドレスを表示しない（パススルーデバイス）
        
        this.ctx.restore();
    }

    // デバイスのNICポートを描画
    drawDevicePorts(device) {
        const ports = device.ports;
        if (!ports || !ports.nics) return;
        
        // NICポート
        ports.nics.forEach(port => {
            this.drawPort(device, port, 'nic');
        });
    }

    // 個別NICポートの描画
    drawPort(device, port, type) {
        const x = device.x + port.x * device.width;
        const y = device.y + port.y * device.height;
        const radius = 4;
        
        // ホバー効果（接続開始時やマウス近接時）
        let isHovered = false;
        if (this.currentMousePos) {
            const distance = Math.sqrt((this.currentMousePos.x - x) ** 2 + (this.currentMousePos.y - y) ** 2);
            isHovered = distance <= 8;
        }
        
        // 接続状態をチェック
        const isConnected = this.connections.some(conn =>
            (conn.fromDevice === device.id && conn.fromPort === port.id) ||
            (conn.toDevice === device.id && conn.toPort === port.id)
        );
        
        // NICポートの背景色（統一デザイン）
        if (isHovered) {
            this.ctx.fillStyle = '#ff9800'; // ホバー時はオレンジ
        } else if (isConnected) {
            this.ctx.fillStyle = '#4caf50'; // 接続済みは緑
        } else {
            this.ctx.fillStyle = '#2196f3'; // 未接続は青
        }
        
        this.ctx.beginPath();
        this.ctx.arc(x, y, radius, 0, 2 * Math.PI);
        this.ctx.fill();
        
        // 端子の枠線
        this.ctx.strokeStyle = isHovered ? '#ff5722' : '#333';
        this.ctx.lineWidth = isHovered ? 2 : 1;
        this.ctx.stroke();
        
        // 端子のラベル
        if (port.label) {
            this.ctx.font = '8px Arial';
            this.ctx.fillStyle = isHovered ? '#ff5722' : '#333';
            
            let labelX = x;
            let labelY = y + 2;
            
            // 動的NICポートの場合、sideプロパティに基づいて位置調整
            if (port.side) {
                switch (port.side) {
                    case 'top':
                        // 上辺の場合：ラベルを上に表示
                        this.ctx.textAlign = 'center';
                        labelY = y - 8;
                        break;
                    case 'bottom':
                        // 下辺の場合：ラベルを下に表示
                        this.ctx.textAlign = 'center';
                        labelY = y + 12;
                        break;
                    case 'left':
                        // 左辺の場合：ラベルを左に表示
                        this.ctx.textAlign = 'right';
                        labelX = x - 8;
                        break;
                    case 'right':
                        // 右辺の場合：ラベルを右に表示
                        this.ctx.textAlign = 'left';
                        labelX = x + 8;
                        break;
                    default:
                        // デフォルト（従来の動作）
                        this.ctx.textAlign = port.x < 0.5 ? 'right' : 'left';
                        labelX = x + (port.x < 0.5 ? -8 : 8);
                        break;
                }
            } else {
                // 静的ポートの場合（従来の動作）
                this.ctx.textAlign = port.x < 0.5 ? 'right' : 'left';
                labelX = x + (port.x < 0.5 ? -8 : 8);
            }
            
            this.ctx.fillText(port.label, labelX, labelY);
        }
    }

    // デバイス色取得
    getDeviceColor(type) {
        const colors = {
            'pc': '#e3f2fd',
            'router': '#f3e5f5',
            'switch': '#e8f5e8',
            'server': '#fff3e0',
            'dns': '#f1f8e9',
            'onu': '#f3e5f5',
            'internet': '#e1f5fe'
        };
        return colors[type] || '#f5f5f5';
    }

    // デバイスアイコン取得
    getDeviceIcon(type) {
        const icons = {
            'pc': '💻',
            'router': '📡',
            'switch': '🔌',
            'server': '🖥️',
            'dns': '🌐',
            'onu': '📦',
            'internet': '☁️'
        };
        return icons[type] || '📱';
    }

    // DHCP アドレス要求（複数LAN対応・デバッグ強化）
    requestDHCPAddress(client) {
        console.log(`\n=== DHCP要求開始: ${client.name} ===`);

        // 最初にインターネット接続を確認（グローバルIP取得を優先）
        if (this.checkAndAssignInternetIP(client)) {
            console.log(`✅ インターネットからグローバルIP取得成功: ${client.name}`);
            console.log(`=== DHCP要求完了: ${client.name} ===\n`);
            return true;
        }

        console.log(`ローカルネットワーク内でのDHCP要求に移行: ${client.name}`);

        // 接続されたDHCPサーバー（ルーター）を探す
        const dhcpServerInfo = this.findDHCPServer(client);
        
        if (!dhcpServerInfo) {
            const message = `❌ DHCP失敗: ${client.name} - DHCPサーバーが見つかりません`;
            console.log(message);
            this.updateStatus(message);
            client.config.ipAddress = '0.0.0.0';
            return false;
        }
        
        const { router, lanConfig } = dhcpServerInfo;
        const lanName = this.getLANName(router, lanConfig);
        
        console.log(`DHCP: ${client.name} -> ${router.name} (${lanName})`);
        console.log(`プール範囲: ${lanConfig.dhcpPoolStart} - ${lanConfig.dhcpPoolEnd}`);
        
        // DHCPプールから利用可能なIPアドレスを割り当て
        const assignedIP = this.allocateDHCPAddressFromLAN(lanConfig, client, router);
        
        if (!assignedIP) {
            const message = `❌ DHCP失敗: ${client.name} - 利用可能なIPアドレスがありません (${lanName})`;
            console.log(message);
            this.updateStatus(message);
            client.config.ipAddress = '0.0.0.0';
            return false;
        }
        
        // クライアントにIPアドレスを設定
        client.config.ipAddress = assignedIP.ip;
        client.config.subnetMask = '255.255.255.0'; // 固定サブネットマスク
        client.config.defaultGateway = lanConfig.ipAddress; // そのLANのゲートウェイ
        
        // lan1.ipAddress も同期して更新
        if (client.config.lan1) {
            client.config.lan1.ipAddress = assignedIP.ip;
        }
        
        const message = `✅ DHCP成功: ${client.name} に ${assignedIP.ip} を割り当てました (${lanName})`;
        console.log(message);
        console.log(`=== DHCP要求完了: ${client.name} ===\n`);
        
        this.updateStatus(message);
        this.scheduleRender(); // 画面更新をスケジュール
        return true;
    }

    // DHCPサーバーを探す（複数LAN対応）
    findDHCPServer(client) {
        // 物理的に接続されたデバイスをBFSで探索
        const visited = new Set();
        const queue = [client.id];
        visited.add(client.id);
        
        while (queue.length > 0) {
            const currentId = queue.shift();
            const currentDevice = this.devices.get(currentId);
            
            if (!currentDevice) continue;
            
            // 現在のデバイスがDHCPサーバー有効なルーターかチェック
            if (currentDevice.type === 'router' && currentDevice !== client) {
                // いずれかのLANでDHCPが有効になっているかチェック
                if (currentDevice.config.lan1?.dhcpEnabled || 
                    currentDevice.config.lan2?.dhcpEnabled || 
                    currentDevice.config.lan3?.dhcpEnabled) {
                    
                    // クライアントがどのLANに接続されているか判定
                    const lanConfig = this.determineLANConnection(client, currentDevice);
                    if (lanConfig) {
                        return { router: currentDevice, lanConfig: lanConfig };
                    }
                }
            }
            
            // 隣接デバイスをキューに追加
            for (const connection of this.connections) {
                const devFrom = connection.from?.device || (connection.fromDevice ? this.devices.get(connection.fromDevice) : null);
                const devTo = connection.to?.device || (connection.toDevice ? this.devices.get(connection.toDevice) : null);
                
                let nextDevice = null;
                if (devFrom && devFrom.id === currentId && devTo && !visited.has(devTo.id)) {
                    nextDevice = devTo;
                } else if (devTo && devTo.id === currentId && devFrom && !visited.has(devFrom.id)) {
                    nextDevice = devFrom;
                }
                
                if (nextDevice) {
                    visited.add(nextDevice.id);
                    queue.push(nextDevice.id);
                }
            }
        }
        
        return null;
    }

    // クライアントが接続されているLANを判定（スイッチ経由対応）
    determineLANConnection(client, router) {
        if (!client || !router || router.type !== 'router') return null;
        console.log('🔍 LAN判定開始:', client.name, '→', router.name);
        
        // ルーターへの経路を取得してLANを判定
        const pathToRouter = this.findPath(client, router);
        console.log('📍 経路:', pathToRouter ? pathToRouter.map(d => d.name).join(' → ') : 'なし');
        
        if (pathToRouter && pathToRouter.length > 1) {
            // ルーターに直接接続されている隣接デバイスを特定
            const routerNeighbor = pathToRouter[pathToRouter.length - 2];
            console.log('🔧 ルーター隣接デバイス:', routerNeighbor?.name);
            const routerConnection = this.findDirectConnection(routerNeighbor, router);
            console.log('🔧 ルーター接続:', routerConnection);
            
            if (routerConnection) {
                // ルーター側のポートを特定
                const devFrom = routerConnection.from?.device || (routerConnection.fromDevice ? this.devices.get(routerConnection.fromDevice) : null);
                const isFromRouter = (devFrom === router) || (routerConnection.fromDevice === router.id);
                
                const routerPort = isFromRouter ? 
                    (routerConnection.from?.port || routerConnection.fromPort) : 
                    (routerConnection.to?.port || routerConnection.toPort);
                const routerPortId = (typeof routerPort === 'object' ? routerPort?.id : routerPort) || '';
                
                console.log('🔧 ルーターポートID判定:', routerPortId, 'isFromRouter:', isFromRouter);

                if (routerPortId.toLowerCase() === 'lan1') {
                    console.log('✅ LAN1を選択 (ポートID: lan1)');
                    return router.config.lan1;
                } else if (routerPortId.toLowerCase() === 'lan2') {
                    console.log('✅ LAN2を選択 (ポートID: lan2)');
                    return router.config.lan2;
                } else if (routerPortId.toLowerCase() === 'lan3') {
                    console.log('✅ LAN3を選択 (ポートID: lan3)');
                    return router.config.lan3;
                }
                
                // フォールバック: ポートインデックスによる判定
                const routerPortIndex = this.getPortIndex(router, routerConnection, isFromRouter);
                if (routerPortIndex <= 1) {
                    console.log('✅ LAN1を選択 (ポートIndex:', routerPortIndex, ')');
                    return router.config.lan1;
                } else if (routerPortIndex === 2) {
                    console.log('✅ LAN2を選択 (ポートIndex:', routerPortIndex, ')');
                    return router.config.lan2;
                } else if (routerPortIndex >= 3) {
                    console.log('✅ LAN3を選択 (ポートIndex:', routerPortIndex, ')');
                    return router.config.lan3;
                }
            }
        }

        console.log('❌ LAN接続を判定できませんでした:', client.name, '→', router.name);
        return null;
    }

    // 経路内のスイッチを検索
    findSwitchInPath(path) {
        if (!path) return null;
        
        return path.find(device => device.type === 'switch' || device.type === 'onu');
    }

    // 2つのデバイス間の直接接続を探す
    findDirectConnection(device1, device2) {
        if (!device1 || !device2) return null;
        return this.connections.find(conn => {
            const devA = conn.from?.device || (conn.fromDevice ? this.devices.get(conn.fromDevice) : null);
            const devB = conn.to?.device || (conn.toDevice ? this.devices.get(conn.toDevice) : null);
            return (devA === device1 && devB === device2) || (devA === device2 && devB === device1);
        });
    }

    // 接続におけるデバイスのポート番号を取得
    getPortIndex(device, connection, isFromDevice) {
        if (!connection || !device) return -1;
        const port = isFromDevice ? 
            (connection.from?.port || connection.fromPort) : 
            (connection.to?.port || connection.toPort);
        const portId = (typeof port === 'object' ? port?.id : port) || '';
        const ports = device.ports?.nics || [];
        
        return ports.findIndex(p => p.id === portId);
    }

    // 指定LANからDHCPアドレス割り当て（競合状態対応）
    allocateDHCPAddressFromLAN(lanConfig, client, router) {
        const poolStart = this.ipToInt(lanConfig.dhcpPoolStart);
        const poolEnd = this.ipToInt(lanConfig.dhcpPoolEnd);
        const leaseTime = router.config.dhcpLeaseTime;
        const now = Date.now();
        
        // 既存の割り当てを確認・クリーンアップ
        this.cleanupExpiredLeasesFromLAN(lanConfig, now);
        
        // クライアントが既にIPアドレスを持っているかチェック
        for (const [ip, lease] of lanConfig.dhcpAllocatedIPs.entries()) {
            if (lease.clientId === client.id && lease.expiry > now) {
                // IPアドレスが現在のプール範囲内にある場合のみリース更新
                if (ip >= poolStart && ip <= poolEnd) {
                    lease.expiry = now + (leaseTime * 1000);
                    console.log(`DHCP: リース更新 ${client.name} -> ${this.intToIp(ip)} (範囲内)`);
                    return { ip: this.intToIp(ip), lease: lease };
                } else {
                    // プール範囲外の場合は古いリースを削除
                    console.log(`DHCP: 範囲外リース削除 ${client.name} -> ${this.intToIp(ip)}`);
                    lanConfig.dhcpAllocatedIPs.delete(ip);
                }
            }
        }
        
        // 全ての既存のデバイスのIPアドレスをチェックして重複を避ける
        const existingIPs = new Set();
        
        // 現在のLANで割り当て済みのIPを収集
        for (const [ip] of lanConfig.dhcpAllocatedIPs.entries()) {
            existingIPs.add(ip);
        }
        
        // 他のデバイスの静的IPも収集（同じプール範囲内）
        for (const [, device] of this.devices.entries()) {
            if (device !== client && device.config.ipAddress && device.config.ipAddress !== '0.0.0.0') {
                const deviceIP = this.ipToInt(device.config.ipAddress);
                if (deviceIP >= poolStart && deviceIP <= poolEnd) {
                    existingIPs.add(deviceIP);
                    console.log(`DHCP: 既存IP検出 ${device.name} -> ${device.config.ipAddress}`);
                }
            }
        }
        
        // 新しいIPアドレスを探す（重複チェック強化）
        for (let ipInt = poolStart; ipInt <= poolEnd; ipInt++) {
            if (!existingIPs.has(ipInt) && !this.isIPAddressInUse(this.intToIp(ipInt))) {
                const lease = {
                    clientId: client.id,
                    clientName: client.name,
                    expiry: now + (leaseTime * 1000),
                    assignedAt: now,
                    lanName: this.getLANName(router, lanConfig)
                };
                
                lanConfig.dhcpAllocatedIPs.set(ipInt, lease);
                console.log(`DHCP: 新規割り当て ${client.name} -> ${this.intToIp(ipInt)} (${lease.lanName})`);
                return { ip: this.intToIp(ipInt), lease: lease };
            }
        }
        
        console.log(`DHCP: プール満杯 - ${client.name} への割り当て失敗`);
        return null; // プールが満杯
    }

    // IPアドレスが他のデバイスで使用中かチェック
    isIPAddressInUse(ipAddress) {
        for (const [, device] of this.devices.entries()) {
            if (device.config.ipAddress === ipAddress) {
                return true;
            }
        }
        return false;
    }

    // LAN名取得
    getLANName(router, lanConfig) {
        if (lanConfig === router.config.lan1) return 'LAN1';
        if (lanConfig === router.config.lan2) return 'LAN2';
        if (lanConfig === router.config.lan3) return 'LAN3';
        return 'Unknown LAN';
    }

    // 指定LANの期限切れリースのクリーンアップ（範囲外リースも削除）
    cleanupExpiredLeasesFromLAN(lanConfig, currentTime) {
        const toDelete = [];
        const poolStart = this.ipToInt(lanConfig.dhcpPoolStart);
        const poolEnd = this.ipToInt(lanConfig.dhcpPoolEnd);
        
        for (const [ip, lease] of lanConfig.dhcpAllocatedIPs.entries()) {
            // 期限切れまたはプール範囲外のリースを削除対象に追加
            if (lease.expiry <= currentTime) {
                console.log(`DHCP: 期限切れリース削除 ${lease.clientName} -> ${this.intToIp(ip)}`);
                toDelete.push(ip);
            } else if (ip < poolStart || ip > poolEnd) {
                console.log(`DHCP: 範囲外リース削除 ${lease.clientName} -> ${this.intToIp(ip)}`);
                toDelete.push(ip);
            }
        }
        
        for (const ip of toDelete) {
            lanConfig.dhcpAllocatedIPs.delete(ip);
        }
    }

    // DHCPアドレス割り当て（後方互換性）
    allocateDHCPAddress(dhcpServer, client) {
        // 旧バージョン互換性のため、LAN1から割り当て
        return this.allocateDHCPAddressFromLAN(dhcpServer.config.lan1 || dhcpServer.config, client, dhcpServer);
    }

    // 期限切れリースのクリーンアップ
    cleanupExpiredLeases(dhcpServer, currentTime) {
        const expired = [];
        
        for (const [ip, lease] of dhcpServer.config.dhcpAllocatedIPs.entries()) {
            if (lease.expiry <= currentTime) {
                expired.push(ip);
            }
        }
        
        for (const ip of expired) {
            dhcpServer.config.dhcpAllocatedIPs.delete(ip);
        }
    }

    // DHCP リース情報表示（複数LAN対応・デバッグ用）
    showDHCPLeases(router) {
        if (!router || router.type !== 'router') {
            console.log('ルーターではありません');
            return;
        }
        
        console.log(`\n=== ${router.name} の DHCP リース情報 ===`);
        console.log(`リース時間: ${router.config.dhcpLeaseTime}秒`);
        
        const now = Date.now();
        let totalLeases = 0;
        
        // LAN1 リース表示
        if (router.config.lan1?.dhcpEnabled) {
            console.log(`\nLAN1 (${router.config.lan1.ipAddress}):`);
            console.log(`  プール: ${router.config.lan1.dhcpPoolStart} - ${router.config.lan1.dhcpPoolEnd}`);
            const lan1Leases = router.config.lan1.dhcpAllocatedIPs.size;
            console.log(`  割り当て済み: ${lan1Leases}個`);
            
            for (const [ipInt, lease] of router.config.lan1.dhcpAllocatedIPs.entries()) {
                const ip = this.intToIp(ipInt);
                const remaining = Math.max(0, Math.floor((lease.expiry - now) / 1000));
                console.log(`    ${ip} -> ${lease.clientName} (残り${remaining}秒)`);
                totalLeases++;
            }
        }
        
        // LAN2 リース表示
        if (router.config.lan2?.dhcpEnabled) {
            console.log(`\nLAN2 (${router.config.lan2.ipAddress}):`);
            console.log(`  プール: ${router.config.lan2.dhcpPoolStart} - ${router.config.lan2.dhcpPoolEnd}`);
            const lan2Leases = router.config.lan2.dhcpAllocatedIPs.size;
            console.log(`  割り当て済み: ${lan2Leases}個`);
            
            for (const [ipInt, lease] of router.config.lan2.dhcpAllocatedIPs.entries()) {
                const ip = this.intToIp(ipInt);
                const remaining = Math.max(0, Math.floor((lease.expiry - now) / 1000));
                console.log(`    ${ip} -> ${lease.clientName} (残り${remaining}秒)`);
                totalLeases++;
            }
        }
        
        // LAN3 リース表示
        if (router.config.lan3?.dhcpEnabled) {
            console.log(`\nLAN3 (${router.config.lan3.ipAddress}):`);
            console.log(`  プール: ${router.config.lan3.dhcpPoolStart} - ${router.config.lan3.dhcpPoolEnd}`);
            const lan3Leases = router.config.lan3.dhcpAllocatedIPs.size;
            console.log(`  割り当て済み: ${lan3Leases}個`);
            
            for (const [ipInt, lease] of router.config.lan3.dhcpAllocatedIPs.entries()) {
                const ip = this.intToIp(ipInt);
                const remaining = Math.max(0, Math.floor((lease.expiry - now) / 1000));
                console.log(`    ${ip} -> ${lease.clientName} (残り${remaining}秒)`);
                totalLeases++;
            }
        }
        
        console.log(`\n総割り当て数: ${totalLeases}個`);
        console.log(`=== DHCP リース情報終了 ===\n`);
    }

    // 全ルーターのDHCP状況を表示
    showAllDHCPLeases() {
        console.log('\n=== 全ルーターのDHCP状況 ===');
        
        let routerCount = 0;
        for (const [, device] of this.devices.entries()) {
            if (device.type === 'router') {
                this.showDHCPLeases(device);
                routerCount++;
            }
        }
        
        if (routerCount === 0) {
            console.log('DHCPサーバーが見つかりません');
        }
        
        console.log('=== 全ルーター情報終了 ===\n');
    }

    // DHCP設定変更時のクライアント再配布
    redistributeDHCPAddresses(router) {
        console.log(`\n=== DHCP再配布開始: ${router.name} ===`);
        
        if (router.type !== 'router') {
            console.log('ルーターではないため、再配布をスキップ');
            return;
        }
        
        const affectedClients = [];
        
        // このルーターのDHCPを利用している全クライアントを検出
        for (const [, device] of this.devices.entries()) {
            if (device !== router && device.config && device.config.dhcpEnabled) {
                console.log(`🔍 クライアント検査中: ${device.name} (DHCP: ${device.config.dhcpEnabled})`);
                // このデバイスがこのルーターからDHCPを受けているかチェック
                const dhcpServerInfo = this.findDHCPServer(device);
                console.log(`🔍 DHCP server info:`, dhcpServerInfo);
                if (dhcpServerInfo && dhcpServerInfo.router === router) {
                    console.log(`✅ クライアント発見: ${device.name}`);
                    affectedClients.push({
                        client: device,
                        lanConfig: dhcpServerInfo.lanConfig
                    });
                }
            }
        }
        
        console.log(`影響を受けるクライアント数: ${affectedClients.length}`);
        
        if (affectedClients.length === 0) {
            console.log('再配布対象のクライアントがありません');
            console.log('=== DHCP再配布終了 ===\n');
            return;
        }
        
        // 各クライアントに新しいIPアドレスを割り当て
        let redistributedCount = 0;

        for (const { client, lanConfig } of affectedClients) {
            const oldIP = client.config.ipAddress;
            const lanName = this.getLANName(router, lanConfig);

            // ★★★ 重要: LANのDHCP有効性を再確認 ★★★
            if (!lanConfig || !lanConfig.dhcpEnabled) {
                console.log(`⏭️ ${client.name} の${lanName}はDHCP無効のため再配布をスキップ`);
                // リースを削除してIPをクリア
                this.clearClientLease(client, lanConfig);
                client.config.ipAddress = '0.0.0.0';
                continue;
            }

            // 現在のリースを削除（新しい範囲で再割り当てするため）
            this.clearClientLease(client, lanConfig);

            // 新しいIPアドレスを要求
            const success = this.requestDHCPAddress(client);

            if (success) {
                redistributedCount++;
                console.log(`✅ 再配布成功: ${client.name} ${oldIP} -> ${client.config.ipAddress} (${lanName})`);

                // ステータスメッセージを更新
                this.updateStatus(`🔄 DHCP再配布: ${client.name} ${oldIP} -> ${client.config.ipAddress}`);
            } else {
                console.log(`❌ 再配布失敗: ${client.name} (${oldIP}, ${lanName})`);
            }
        }
        
        console.log(`再配布完了: ${redistributedCount}/${affectedClients.length} 成功`);
        console.log('=== DHCP再配布終了 ===\n');
        
        // 画面更新
        this.scheduleRender();
    }

    // クライアントの現在のリースを削除
    clearClientLease(client, lanConfig) {
        const toDelete = [];
        
        // 該当クライアントのリースを全て検索して削除
        for (const [ip, lease] of lanConfig.dhcpAllocatedIPs.entries()) {
            if (lease.clientId === client.id) {
                toDelete.push(ip);
            }
        }
        
        for (const ip of toDelete) {
            lanConfig.dhcpAllocatedIPs.delete(ip);
            console.log(`リース削除: ${client.name} -> ${this.intToIp(ip)}`);
        }
        
        // IPアドレスをクリア
        client.config.ipAddress = '0.0.0.0';
    }

    // デバイスクリック処理（シングル・ダブルクリック対応）
    handleDeviceClick(device) {
        const currentTime = performance.now();
        const timeDiff = currentTime - this.lastClickTime;
        
        // ダブルクリック・ダブルタップの判定
        if (this.lastClickedDevice === device && timeDiff < this.doubleClickDelay) {
            console.log('ダブルクリック検出:', device.name);
            this.handleDoubleClick(device);
        } else {
            console.log('シングルクリック検出:', device.name);
            this.handleSingleClick(device);
        }
        
        // 状態を更新
        this.lastClickTime = currentTime;
        this.lastClickedDevice = device;
    }

    // シングルクリック処理
    handleSingleClick(device) {
        // デバイスの選択状態は維持する（設定ボタンが有効になる）
        const deviceType = this.isTouchDevice() ? 'タップ' : 'クリック';
        this.updateStatus(`${device.name}を選択しました（ダブル${deviceType}で設定画面を開きます）`);
        this.scheduleRender();
    }

    // ダブルクリック処理
    handleDoubleClick(device) {
        const actionType = this.isTouchDevice() ? 'ダブルタップ' : 'ダブルクリック';
        console.log(`${actionType}で設定画面を開く:`, device.name);
        
        // 設定画面を自動で開く
        this.showDeviceConfig();
        
        this.updateStatus(`${device.name}の設定画面を開きました`);
    }

    // ネットワーク構成を保存
    saveNetwork() {
        const data = this.getNetworkData();

        // JSONファイルとしてダウンロード
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'network-diagram.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        this.updateStatus('ネットワーク構成を保存しました');
    }

    // ネットワーク構成を読み込み
    loadNetwork() {
        document.getElementById('file-input').click();
    }

    // ネットワークデータオブジェクト（JSON復元用）の適用
    applyNetworkData(data) {
        if (!data || !data.devices) {
            throw new Error('ネットワークデータが無効です');
        }

        // 現在の構成をクリア
        this.devices.clear();
        this.connections = [];
        this.selectedDevice = null;
        this.selectedConnection = null;
        this.connectionStart = null;
        this.nextZIndex = 1;

        // デバイスを復元
        const deviceMap = new Map();
        data.devices.forEach((deviceData, index) => {
            const device = this.createDevice(deviceData.type, deviceData.x, deviceData.y);
            device.id = deviceData.id || device.id;
            device.name = deviceData.name || device.name;
            if (deviceData.width) device.width = deviceData.width;
            if (deviceData.height) device.height = deviceData.height;

            if (device.type === 'switch') {
                device.macTable = new Map();
                device.config = {
                    ipAddress: '',
                    subnetMask: '',
                    defaultGateway: '',
                    dhcpEnabled: false
                };
            } else {
                device.macAddress = deviceData.macAddress || this.generateMACAddress(device.type, index + 1);
                device.arpTable = new Map();
                if (deviceData.config) {
                    device.config = { ...deviceData.config };
                }
            }

            this.devices.set(device.id, device);
            deviceMap.set(device.id, device);

            // LAN設定の復元（ルーター用）
            if (deviceData.config) {
                if (deviceData.config.lan1) {
                    device.config.lan1 = { ...deviceData.config.lan1 };
                    if (deviceData.config.lan1.dhcpAllocatedIPs) {
                        device.config.lan1.dhcpAllocatedIPs = new Map(deviceData.config.lan1.dhcpAllocatedIPs);
                    }
                }
                if (deviceData.config.lan2) {
                    device.config.lan2 = { ...deviceData.config.lan2 };
                    if (deviceData.config.lan2.dhcpAllocatedIPs) {
                        device.config.lan2.dhcpAllocatedIPs = new Map(deviceData.config.lan2.dhcpAllocatedIPs);
                    }
                }
                if (deviceData.config.lan3) {
                    device.config.lan3 = { ...deviceData.config.lan3 };
                    if (deviceData.config.lan3.dhcpAllocatedIPs) {
                        device.config.lan3.dhcpAllocatedIPs = new Map(deviceData.config.lan3.dhcpAllocatedIPs);
                    }
                }
            }

            // WAN設定の復元（ルーター用）
            if (deviceData.wanConfig) {
                device.wanConfig = { ...deviceData.wanConfig };
                device.wanConfig.internetDevice = null;
            }

            // NAT設定の復元（ルーター用）
            if (device.type === 'router') {
                device.natEnabled = deviceData.natEnabled !== undefined ? deviceData.natEnabled : true;
                device.natTable = new Map();
                if (deviceData.natTable && Array.isArray(deviceData.natTable)) {
                    deviceData.natTable.forEach(entry => {
                        const key = `${entry.protocol}_${entry.insideLocalIP}_${entry.insideLocalPort}_${entry.outsideGlobalIP}`;
                        device.natTable.set(key, entry);
                    });
                }
                device.nextNatPort = deviceData.nextNatPort || 10001;
            }

            // DNSテーブルの復元（DNSサーバー用）
            if (deviceData.dnsTable) {
                device.dnsTable = { ...deviceData.dnsTable };
            }

            // インターネットデバイスのISP設定復元
            if (device.type === 'internet' && deviceData.config) {
                ['isp1', 'isp2', 'isp3', 'isp4', 'isp5', 'isp6'].forEach(ispId => {
                    if (deviceData.config[ispId]) {
                        device.config[ispId] = { ...deviceData.config[ispId] };
                        if (deviceData.config[ispId].dhcpAllocatedIPs) {
                            device.config[ispId].dhcpAllocatedIPs = new Map(deviceData.config[ispId].dhcpAllocatedIPs);
                        }
                    }
                });
            }

            // ポート復元
            if (deviceData.ports && deviceData.ports.nics && device.ports && device.ports.nics) {
                device.ports.nics.forEach((port, idx) => {
                    if (deviceData.ports.nics[idx]) {
                        const portData = deviceData.ports.nics[idx];
                        port.id = portData.id;
                        port.x = portData.x;
                        port.y = portData.y;
                        port.side = portData.side;
                        port.connected = null;
                    }
                });
            }
        });
        // 接続を復元
        if (data.connections && Array.isArray(data.connections)) {
            data.connections.forEach(connectionData => {
                const fromDevice = deviceMap.get(connectionData.from.deviceId);
                const toDevice = deviceMap.get(connectionData.to.deviceId);

                if (fromDevice && toDevice) {
                    const fromPort = fromDevice.ports.nics.find(p => p.id === connectionData.from.portId);
                    const toPort = toDevice.ports.nics.find(p => p.id === connectionData.to.portId);

                    if (fromPort && toPort) {
                        const connection = {
                            id: connectionData.id || `conn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                            from: {
                                deviceId: fromDevice.id,
                                portId: fromPort.id,
                                device: fromDevice,
                                port: fromPort
                            },
                            to: {
                                deviceId: toDevice.id,
                                portId: toPort.id,
                                device: toDevice,
                                port: toPort
                            },
                            type: connectionData.type || 'straight',
                            selected: false
                        };

                        fromPort.connected = connection;
                        toPort.connected = connection;
                        this.connections.push(connection);
                    }
                }
            });
        }

        // DHCP表示の更新 & 画面描画
        this.refreshDHCPDevicesDisplay();
        this.syncLAN1Addresses();
        this.updateControlButtons();
        this.panX = 0;
        this.panY = 0;
        this.scale = 1;
        this.lastNICUpdateFrame = null;
        this.updateAllDynamicNICPositions();
        this.render();
        setTimeout(() => {
            this.render();
        }, 50);

        return true;
    }


    // ファイル読み込み処理
    handleFileLoad(event) {
        const file = event.target.files[0];
        if (!file) return;

        // 重複実行防止チェック
        if (this.isLoadingFile) {
            console.log('ファイル読み込み処理中のため、重複実行をスキップします');
            event.target.value = ''; // input要素もクリア
            return;
        }

        this.isLoadingFile = true;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                // バージョンチェック
                if (!data.version) {
                    throw new Error('不正なファイル形式です');
                }

                // ここに元のhandleFileLoadの処理をコピー

                // 現在の構成をクリア（描画は後で行う）
                this.devices.clear();
                this.connections = [];
                this.selectedDevice = null;
                this.selectedConnection = null;
                this.connectionStart = null;
                this.nextZIndex = 1;

                // デバイスを復元
                const deviceMap = new Map();
                data.devices.forEach((deviceData, index) => {
                    const device = this.createDevice(deviceData.type, deviceData.x, deviceData.y);
                    device.id = deviceData.id;
                    device.name = deviceData.name;
                    device.width = deviceData.width;
                    device.height = deviceData.height;
                    
                    // MACアドレス・ARPテーブル・MACテーブルの復元・初期化
                    if (device.type === 'switch') {
                        device.macTable = new Map();
                        device.config = {
                            ipAddress: '',
                            subnetMask: '',
                            defaultGateway: '',
                            dhcpEnabled: false
                        };
                    } else {
                        device.macAddress = deviceData.macAddress || this.generateMACAddress(device.type, index + 1);
                        device.arpTable = new Map();
                        // 基本設定の復元
                        device.config = { ...deviceData.config };
                    }

                    // デバイスを即座にマップに追加（基本設定完了後、詳細設定の前）
                    this.devices.set(device.id, device);
                    deviceMap.set(device.id, device);

                    // LAN設定の復元（ルーター用）
                    if (deviceData.config.lan1) {
                        device.config.lan1 = { ...deviceData.config.lan1 };
                        // DHCPアロケーションマップの復元
                        if (deviceData.config.lan1.dhcpAllocatedIPs) {
                            device.config.lan1.dhcpAllocatedIPs = new Map(deviceData.config.lan1.dhcpAllocatedIPs);
                        }
                    }

                    if (deviceData.config.lan2) {
                        device.config.lan2 = { ...deviceData.config.lan2 };
                        if (deviceData.config.lan2.dhcpAllocatedIPs) {
                            device.config.lan2.dhcpAllocatedIPs = new Map(deviceData.config.lan2.dhcpAllocatedIPs);
                        }
                    }

                    if (deviceData.config.lan3) {
                        device.config.lan3 = { ...deviceData.config.lan3 };
                        if (deviceData.config.lan3.dhcpAllocatedIPs) {
                            device.config.lan3.dhcpAllocatedIPs = new Map(deviceData.config.lan3.dhcpAllocatedIPs);
                        }
                    }

                    // WAN設定の復元（ルーター用）
                    if (deviceData.wanConfig) {
                        device.wanConfig = { ...deviceData.wanConfig };
                        // インターネットデバイス参照は後で復元
                        device.wanConfig.internetDevice = null;
                    }

                    // NAT設定の復元（ルーター用）
                    if (device.type === 'router') {
                        device.natEnabled = deviceData.natEnabled !== undefined ? deviceData.natEnabled : true;
                        device.natTable = new Map();
                        if (deviceData.natTable && Array.isArray(deviceData.natTable)) {
                            deviceData.natTable.forEach(entry => {
                                const key = `${entry.protocol}_${entry.insideLocalIP}_${entry.insideLocalPort}_${entry.outsideGlobalIP}`;
                                device.natTable.set(key, entry);
                            });
                        }
                        device.nextNatPort = deviceData.nextNatPort || 10001;
                    }

                    // DNSテーブルの復元（DNSサーバー用）
                    if (deviceData.dnsTable) {
                        device.dnsTable = { ...deviceData.dnsTable };
                    }

                    // インターネットデバイスのISP設定復元
                    if (device.type === 'internet' && deviceData.config) {
                        ['isp1', 'isp2', 'isp3', 'isp4', 'isp5', 'isp6'].forEach(ispId => {
                            if (deviceData.config[ispId]) {
                                device.config[ispId] = { ...deviceData.config[ispId] };
                                // DHCPアロケーションマップの復元
                                if (deviceData.config[ispId].dhcpAllocatedIPs) {
                                    device.config[ispId].dhcpAllocatedIPs = new Map(deviceData.config[ispId].dhcpAllocatedIPs);
                                }
                            }
                        });
                        console.log('🔧 インターネットデバイスのISP設定を復元:', device.name);
                    }

                    // ポートを復元
                    device.ports.nics.forEach((port, index) => {
                        if (deviceData.ports.nics[index]) {
                            const portData = deviceData.ports.nics[index];
                            port.id = portData.id;
                            port.x = portData.x;
                            port.y = portData.y;
                            port.side = portData.side;
                            // 接続情報は後で接続復元時に設定するため、ここでは初期化のみ
                            port.connected = null;
                        }
                    });
                });

                // 接続を復元
                data.connections.forEach(connectionData => {
                    const fromDevice = deviceMap.get(connectionData.from.deviceId);
                    const toDevice = deviceMap.get(connectionData.to.deviceId);

                    if (fromDevice && toDevice) {
                        const fromPort = fromDevice.ports.nics.find(p => p.id === connectionData.from.portId);
                        const toPort = toDevice.ports.nics.find(p => p.id === connectionData.to.portId);

                        if (fromPort && toPort) {
                            const connection = {
                                id: connectionData.id,
                                from: {
                                    deviceId: fromDevice.id,
                                    portId: fromPort.id,
                                    device: fromDevice,
                                    port: fromPort
                                },
                                to: {
                                    deviceId: toDevice.id,
                                    portId: toPort.id,
                                    device: toDevice,
                                    port: toPort
                                },
                                type: connectionData.type,
                                selected: false
                            };

                            // ポートに接続情報を設定
                            fromPort.connected = connection;
                            toPort.connected = connection;

                            this.connections.push(connection);
                        }
                    }
                });

                // DHCPが有効なデバイスのIPアドレス表示を修正
                this.refreshDHCPDevicesDisplay();

                // 全デバイスのlan1.ipAddressをconfig.ipAddressと同期（既存のファイル互換性のため）
                this.syncLAN1Addresses();

                this.updateControlButtons();

                // ファイル読み込み後は強制的にNICポジション更新を実行
                this.lastNICUpdateFrame = null; // フレーム制限をリセット
                this.updateAllDynamicNICPositions();

                // ファイル読み込み後は即座に描画を実行
                this.render();

                // 少し遅延してもう一度描画を実行（確実に表示されるように）
                setTimeout(() => {
                    this.render();
                    // デバッグ用: 描画後にデバイス数を確認
                    console.log(`描画完了: ${this.devices.size}個のデバイス, ${this.connections.length}個の接続`);
                }, 50);

                // TCP詳細チェックボックスの状態を復元（後方互換性を考慮）
                if (data.tcpDetailsVisible !== undefined) {
                    console.log(`ファイルからTCP詳細状態を読み込み: ${data.tcpDetailsVisible}`);
                    // 少し遅延させて確実に復元処理を実行
                    setTimeout(() => {
                        const tcpCheckbox = document.getElementById('tcp-visibility-checkbox');
                        console.log(`TCPチェックボックス要素:`, tcpCheckbox);
                        if (tcpCheckbox) {
                            console.log(`復元前のチェック状態: ${tcpCheckbox.checked}`);
                            tcpCheckbox.checked = data.tcpDetailsVisible;
                            console.log(`復元後のチェック状態: ${tcpCheckbox.checked}`);
                            // グローバル変数も更新
                            window.showTCPPackets = data.tcpDetailsVisible;
                            console.log(`グローバル変数 showTCPPackets: ${window.showTCPPackets}`);
                            // changeイベントを手動で発火させて、関連する処理も実行
                            const changeEvent = new Event('change');
                            tcpCheckbox.dispatchEvent(changeEvent);
                            console.log(`TCP詳細表示状態を復元: ${data.tcpDetailsVisible ? 'ON' : 'OFF'}`);
                        } else {
                            console.error('TCPチェックボックスが見つかりませんでした');
                        }
                    }, 100);
                }

                this.updateStatus('ファイルを読み込みました');

            } catch (error) {
                console.error('ファイル読み込みエラー:', error);
                this.updateStatus(`ファイル読み込みエラー: ${error.message}`);
            } finally {
                // ファイル読み込み処理完了後、成功・失敗に関わらずfile input要素をクリア
                // これによりchangeイベントの重複発火を防止
                event.target.value = '';
                // 重複実行防止フラグもリセット
                this.isLoadingFile = false;
            }
        };

        reader.onerror = () => {
            this.updateStatus('ファイル読み込みに失敗しました');
            // エラー時もfile input要素をクリア
            event.target.value = '';
            // 重複実行防止フラグもリセット
            this.isLoadingFile = false;
        };

        reader.readAsText(file);
    }
    // DHCPが有効なデバイスの表示を更新
    refreshDHCPDevicesDisplay() {
        // 全デバイスをチェック
        Array.from(this.devices.values()).forEach(device => {
            if (device.config && device.config.dhcpEnabled) {
                // DHCPが有効でIPアドレスが0.0.0.0の場合、接続されたルーターから再取得を試行
                if (device.config.ipAddress === '0.0.0.0' || !device.config.ipAddress) {
                    this.tryDHCPRefresh(device);
                }
            }
        });
    }

    // 全デバイスのlan1.ipAddressをconfig.ipAddressと同期（ファイル読み込み時の互換性確保）
    syncLAN1Addresses() {
        Array.from(this.devices.values()).forEach(device => {
            // ルーター以外のデバイスのlan1.ipAddressを同期
            if (device.config && device.config.lan1 && device.type !== 'router') {
                if (device.config.ipAddress && device.config.ipAddress !== '0.0.0.0') {
                    device.config.lan1.ipAddress = device.config.ipAddress;
                }
            }
        });
    }

    // DHCP更新の試行
    tryDHCPRefresh(device) {
        // 接続されているルーターを検索
        const connectedRouters = this.getConnectedRouters(device);
        
        for (const router of connectedRouters) {
            // ルーターのDHCPサーバーからIPアドレスを取得を試行
            const assignedIP = this.tryAssignDHCPAddress(device, router);
            if (assignedIP && assignedIP !== '0.0.0.0') {
                console.log(`DHCP refresh: ${device.name || device.id} got IP ${assignedIP} from ${router.name || router.id}`);
                break; // 成功したら終了
            }
        }
    }

    // DHCPアドレス割り当てを試行
    tryAssignDHCPAddress(device, router) {
        if (router.type === 'router' && router.config) {
            // デバイスが接続されているLANポートを特定
            const connectedLanPort = this.getConnectedLanPort(device, router);

            if (connectedLanPort) {
                const lanConfig = router.config[connectedLanPort];
                if (lanConfig && lanConfig.dhcpEnabled) {
                    const assignedIP = this.allocateDHCPAddressFromLAN(lanConfig, device, router);
                    if (assignedIP && assignedIP !== '0.0.0.0') {
                        console.log(`✅ DHCP: ${device.name} got IP ${assignedIP.ip} from ${router.name} ${connectedLanPort}`);
                        device.config.ipAddress = assignedIP.ip;
                        device.config.subnetMask = lanConfig.subnetMask || '255.255.255.0';
                        device.config.defaultGateway = lanConfig.ipAddress;
                        return assignedIP.ip;
                    }
                } else {
                    console.log(`⚠️ ${router.name}の${connectedLanPort}はDHCPが無効です`);
                }
            } else {
                console.log(`❌ ${device.name}のLANポートを特定できませんでした (ルーター: ${router.name})`);
            }
        }
        return null;
    }

    // デバイスがルーターのどのLANポートに接続されているかを特定
    getConnectedLanPort(device, router) {
        // 直接接続の場合
        const directConnection = this.connections.find(connection => {
            return (connection.from.device === device && connection.to.device === router) ||
                   (connection.to.device === device && connection.from.device === router);
        });

        if (directConnection) {
            // ルーター側のポートIDからLAN番号を特定
            let routerPortId;
            if (directConnection.from.device === router) {
                routerPortId = directConnection.from.port?.id || directConnection.from.portId;
            } else {
                routerPortId = directConnection.to.port?.id || directConnection.to.portId;
            }

            console.log(`🔍 直接接続でのLANポート判定: ${device.name} → ${router.name}, ポートID: ${routerPortId}`);

            // ポートIDからLAN番号を判定
            if (routerPortId === 'lan1') return 'lan1';
            if (routerPortId === 'lan2') return 'lan2';
            if (routerPortId === 'lan3') return 'lan3';

            console.log(`⚠️ 警告: ルーターポート ${routerPortId} はLAN1-3ではありません`);
        }

        // 間接接続（スイッチ経由）の場合
        const connectedSwitches = this.getConnectedSwitches(device);
        for (const switchDevice of connectedSwitches) {
            const switchToRouterConnection = this.connections.find(connection => {
                return (connection.from.device === switchDevice && connection.to.device === router) ||
                       (connection.to.device === switchDevice && connection.from.device === router);
            });

            if (switchToRouterConnection) {
                // スイッチとルーター間の接続からLANポートを特定
                let routerPortId;
                if (switchToRouterConnection.from.device === router) {
                    routerPortId = switchToRouterConnection.from.port?.id || switchToRouterConnection.from.portId;
                } else {
                    routerPortId = switchToRouterConnection.to.port?.id || switchToRouterConnection.to.portId;
                }

                console.log(`🔍 スイッチ経由でのLANポート判定: ${device.name} → ${switchDevice.name} → ${router.name}, ポートID: ${routerPortId}`);

                // ポートIDからLAN番号を判定
                if (routerPortId === 'lan1') return 'lan1';
                if (routerPortId === 'lan2') return 'lan2';
                if (routerPortId === 'lan3') return 'lan3';

                console.log(`⚠️ 警告: ルーターポート ${routerPortId} はLAN1-3ではありません`);
            }
        }

        console.log(`❌ ${device.name} → ${router.name} のLAN接続を特定できませんでした`);
        return null; // 接続が見つからない場合
    }

    // デバイスに接続されたスイッチを取得
    getConnectedSwitches(device) {
        const switches = [];

        this.connections.forEach(connection => {
            let connectedDevice = null;

            if (connection.from.device === device && connection.to.device.type === 'switch') {
                connectedDevice = connection.to.device;
            } else if (connection.to.device === device && connection.from.device.type === 'switch') {
                connectedDevice = connection.from.device;
            }

            if (connectedDevice && !switches.includes(connectedDevice)) {
                switches.push(connectedDevice);
            }
        });

        return switches;
    }

    // インターネット接続確認とグローバルIP割り当て
    checkAndAssignInternetIP(device) {
        // デバイスがONU経由でインターネットに接続されているかチェック
        const internetConnection = this.findInternetConnection(device);

        if (!internetConnection) {
            console.log(`インターネット接続なし: ${device.name}`);
            return false;
        }

        const { internetDevice, onuDevice, ispPort } = internetConnection;
        console.log(`インターネット接続発見: ${device.name} -> ${onuDevice.name} -> ${internetDevice.name} (${ispPort})`);

        // 接続されているISPポートを使用してグローバルIPを取得
        const globalIP = this.getAvailableGlobalIP(internetDevice, ispPort);

        if (!globalIP) {
            console.log(`❌ グローバルIP取得失敗: ${device.name} - 利用可能なIPがありません`);
            return false;
        }

        // インターネット接続状態を設定
        device.config.isInternetConnected = true;
        device.config.internetDevice = internetDevice;
        device.config.availableGlobalIP = globalIP;

        // DHCPが有効な場合のみIPアドレスを自動変更
        if (device.config.dhcpEnabled) {
            device.config.ipAddress = globalIP.ip;
            device.config.subnetMask = '255.255.255.0';
            device.config.defaultGateway = globalIP.gateway;
            device.config.dnsServers = ['8.8.8.8', '8.8.4.4'];

            // lan1.ipAddress も同期して更新
            if (device.config.lan1) {
                device.config.lan1.ipAddress = globalIP.ip;
            }

            this.updateStatus(`🌐 ${device.name} がインターネットからグローバルIP ${globalIP.ip} を取得しました`);
            console.log(`グローバルIP設定完了: ${device.name} = ${globalIP.ip}`);
            return true;
        } else {
            // DHCP無効の場合は既存のIPを維持
            this.updateStatus(`🌐 ${device.name} がインターネットに接続されました（固定IP: ${device.config.ipAddress}）`);
            console.log(`インターネット接続設定完了（固定IP維持）: ${device.name}`);
            return false; // DHCPによるIP変更は行わない
        }
    }

    // 利用可能なグローバルIPアドレスを取得（ISP-based assignment）
    getAvailableGlobalIP(internetDevice, preferredISP = 'isp1') {
        console.log(`getAvailableGlobalIP: インターネット ${internetDevice.name} からISP ${preferredISP} でIP取得開始`);

        // インターネットデバイスのISP設定を確認
        if (!internetDevice.config || !internetDevice.config[preferredISP]) {
            console.warn(`ISP設定が見つかりません: ${preferredISP}`);
            return null;
        }

        const ispConfig = internetDevice.config[preferredISP];

        // DHCPが有効でない場合は割り当てない
        if (!ispConfig.dhcpEnabled) {
            console.log(`ISP ${preferredISP} のDHCPが無効です`);
            return null;
        }

        // Map オブジェクトの妥当性チェックと修復
        if (!ispConfig.dhcpAllocatedIPs || typeof ispConfig.dhcpAllocatedIPs.has !== 'function') {
            console.log(`ISP ${preferredISP} のMapオブジェクトを修復中...`);
            ispConfig.dhcpAllocatedIPs = new Map(
                ispConfig.dhcpAllocatedIPs instanceof Map ? ispConfig.dhcpAllocatedIPs :
                Array.isArray(ispConfig.dhcpAllocatedIPs) ? ispConfig.dhcpAllocatedIPs :
                Object.entries(ispConfig.dhcpAllocatedIPs || {})
            );
        }

        console.log(`ISP ${preferredISP} のDHCPプール範囲: ${ispConfig.dhcpPoolStart} - ${ispConfig.dhcpPoolEnd}`);

        // IPアドレス範囲をパース（既存のロジックと同様）
        const startOctets = ispConfig.dhcpPoolStart.split('.');
        const endOctets = ispConfig.dhcpPoolEnd.split('.');
        const startLastOctet = parseInt(startOctets[3]);
        const endLastOctet = parseInt(endOctets[3]);
        const networkBase = startOctets.slice(0, 3).join('.');

        // 利用可能なIPアドレスを検索
        for (let octet = startLastOctet; octet <= endLastOctet; octet++) {
            const candidateIP = `${networkBase}.${octet}`;

            if (!ispConfig.dhcpAllocatedIPs.has(candidateIP)) {
                // IPアドレスを割り当て
                ispConfig.dhcpAllocatedIPs.set(candidateIP, new Date().toISOString());

                console.log(`ISP ${preferredISP} から ${candidateIP} を割り当て`);
                console.log(`現在の割り当て済みIP数: ${ispConfig.dhcpAllocatedIPs.size}`);

                return {
                    ip: candidateIP,
                    gateway: ispConfig.gateway || '203.0.113.1',
                    network: ispConfig.network || '203.0.113.0',
                    isp: preferredISP
                };
            }
        }

        console.warn(`ISP ${preferredISP} のDHCPプールが枯渇しました`);
        return null;
    }

    // デバイスのインターネット接続を検索
    findInternetConnection(device) {
        // 直接ONU接続をチェック
        for (const connection of this.connections) {
            let onuDevice = null;

            if (connection.from.device === device && connection.to.device.type === 'onu') {
                onuDevice = connection.to.device;
            } else if (connection.to.device === device && connection.from.device.type === 'onu') {
                onuDevice = connection.from.device;
            }

            if (onuDevice) {
                // ONUのインターネット接続をチェック
                const internetConnection = this.getONUInternetConnection(onuDevice);
                if (internetConnection) {
                    const { internetDevice, ispPort } = internetConnection;
                    return { internetDevice, onuDevice, ispPort };
                }
            }
        }

        return null;
    }

    // ONUのインターネット接続を取得（ISPポート情報も含む）
    getONUInternetConnection(onuDevice) {
        for (const connection of this.connections) {
            let internetDevice = null;
            let ispPort = null;

            if (connection.from.device === onuDevice && connection.to.device.type === 'internet') {
                internetDevice = connection.to.device;
                ispPort = connection.to.port?.id; // インターネット側のポートID
            } else if (connection.to.device === onuDevice && connection.from.device.type === 'internet') {
                internetDevice = connection.from.device;
                ispPort = connection.from.port?.id; // インターネット側のポートID
            }

            if (internetDevice && ispPort) {
                console.log(`🔍 ONU ${onuDevice.name} がインターネット ${internetDevice.name} の ${ispPort} に接続`);
                return { internetDevice, ispPort };
            }
        }

        return null;
    }


    // デバイスに接続されたルーターを取得
    getConnectedRouters(device) {
        const routers = [];
        
        this.connections.forEach(connection => {
            let connectedDevice = null;
            
            if (connection.from.device === device && connection.to.device.type === 'router') {
                connectedDevice = connection.to.device;
            } else if (connection.to.device === device && connection.from.device.type === 'router') {
                connectedDevice = connection.from.device;
            }
            
            if (connectedDevice && !routers.includes(connectedDevice)) {
                routers.push(connectedDevice);
            }
        });
        
        return routers;
    }

    // 画像としてエクスポート
    exportImage() {
        // 一時的に背景を白にして画像を生成
        const originalFillStyle = this.ctx.fillStyle;
        
        // 現在のキャンバス内容をクリアして白背景で再描画
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // 現在の描画内容を再描画
        this.render();
        
        // PNG画像としてダウンロード
        const link = document.createElement('a');
        link.download = 'network-diagram.png';
        link.href = this.canvas.toDataURL('image/png');
        link.click();
        
        // 元の描画状態に戻す
        this.ctx.fillStyle = originalFillStyle;
        this.scheduleRender();

        this.updateStatus('ネットワーク図を画像として保存しました');
    }

    // ドラッグ&ドロップ機能のセットアップ
    setupDragAndDrop() {
        console.log('ドラッグ&ドロップ機能を初期化中...');

        // ドラッグオーバー状態を管理
        this.isDragOver = false;
        this.dragCounter = 0; // ドラッグエンター/リーブのカウンター

        // 全ページでのデフォルトドラッグ動作を防止
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            document.addEventListener(eventName, this.preventDefaults.bind(this), false);
        });

        // ドラッグ&ドロップのメインイベント
        document.addEventListener('dragenter', this.handleDragEnter.bind(this), false);
        document.addEventListener('dragover', this.handleDragOver.bind(this), false);
        document.addEventListener('dragleave', this.handleDragLeave.bind(this), false);
        document.addEventListener('drop', this.handleFileDrop.bind(this), false);

        console.log('ドラッグ&ドロップ機能の初期化完了');
    }

    // デフォルト動作を防止
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // ドラッグエンター処理
    handleDragEnter(e) {
        this.dragCounter++;

        // ファイルがドラッグされているかチェック
        const hasFiles = e.dataTransfer && e.dataTransfer.types &&
                         (e.dataTransfer.types.includes('Files') ||
                          Array.from(e.dataTransfer.types).includes('Files'));

        if (hasFiles) {
            if (!this.isDragOver) {
                this.isDragOver = true;
                this.showDropOverlay(true);
                console.log('ファイルドラッグ検出 - オーバーレイ表示');
            }
        }
    }

    // ドラッグオーバー処理
    handleDragOver(e) {
        const hasFiles = e.dataTransfer && e.dataTransfer.types &&
                         (e.dataTransfer.types.includes('Files') ||
                          Array.from(e.dataTransfer.types).includes('Files'));

        if (hasFiles) {
            e.dataTransfer.dropEffect = 'copy';
            console.log('ドラッグオーバー中 - コピーエフェクト設定');
        }
    }

    // ドラッグリーブ処理
    handleDragLeave(e) {
        this.dragCounter--;

        // カウンターが0になったらページから離れたと判定
        if (this.dragCounter <= 0) {
            this.dragCounter = 0;
            this.isDragOver = false;
            this.showDropOverlay(false);
            console.log('ドラッグリーブ - オーバーレイ非表示');
        }
    }

    // ファイルドロップ処理
    handleFileDrop(e) {
        console.log('ファイルドロップイベント発生');

        // ドラッグ状態をリセット
        this.dragCounter = 0;
        this.isDragOver = false;
        this.showDropOverlay(false);

        const files = e.dataTransfer.files;
        console.log('ドロップされたファイル数:', files.length);

        if (files.length > 0) {
            const file = files[0];
            console.log('ファイル情報:', {
                name: file.name,
                type: file.type,
                size: file.size
            });

            // JSONファイルかチェック
            if (file.type === 'application/json' || file.name.toLowerCase().endsWith('.json')) {
                console.log('JSONファイル検証OK:', file.name);
                this.loadDroppedFile(file);
            } else {
                console.log('非対応ファイル:', file.type);
                this.updateStatus('JSONファイルのみ読み込み可能です');
            }
        } else {
            console.log('ファイルが検出されませんでした');
        }
    }

    // ドロップされたファイルを読み込み
    loadDroppedFile(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);

                // バージョンチェック
                if (!data.version) {
                    throw new Error('不正なファイル形式です');
                }

                // handleFileLoadと同じデータ読み込み処理を直接実行

                // 現在の構成をクリア（描画は後で行う）
                this.devices.clear();
                this.connections = [];
                this.selectedDevice = null;
                this.selectedConnection = null;
                this.connectionStart = null;
                this.nextZIndex = 1;

                // デバイスを復元
                const deviceMap = new Map();
                data.devices.forEach((deviceData, index) => {
                    const device = this.createDevice(deviceData.type, deviceData.x, deviceData.y);
                    device.id = deviceData.id;
                    device.name = deviceData.name;
                    device.width = deviceData.width;
                    device.height = deviceData.height;
                    
                    // MACアドレス・ARPテーブル・MACテーブルの復元・初期化
                    if (device.type === 'switch') {
                        device.macTable = new Map();
                        device.config = {
                            ipAddress: '',
                            subnetMask: '',
                            defaultGateway: '',
                            dhcpEnabled: false
                        };
                    } else {
                        device.macAddress = deviceData.macAddress || this.generateMACAddress(device.type, index + 1);
                        device.arpTable = new Map();
                        // 基本設定の復元
                        device.config = { ...deviceData.config };
                    }

                    // デバイスを即座にマップに追加（基本設定完了後、詳細設定の前）
                    this.devices.set(device.id, device);
                    deviceMap.set(device.id, device);

                    // LAN設定の復元（ルーター用）
                    if (deviceData.config.lan1) {
                        device.config.lan1 = { ...deviceData.config.lan1 };
                        // DHCPアロケーションマップの復元
                        if (deviceData.config.lan1.dhcpAllocatedIPs) {
                            device.config.lan1.dhcpAllocatedIPs = new Map(deviceData.config.lan1.dhcpAllocatedIPs);
                        }
                    }

                    if (deviceData.config.lan2) {
                        device.config.lan2 = { ...deviceData.config.lan2 };
                        if (deviceData.config.lan2.dhcpAllocatedIPs) {
                            device.config.lan2.dhcpAllocatedIPs = new Map(deviceData.config.lan2.dhcpAllocatedIPs);
                        }
                    }

                    if (deviceData.config.lan3) {
                        device.config.lan3 = { ...deviceData.config.lan3 };
                        if (deviceData.config.lan3.dhcpAllocatedIPs) {
                            device.config.lan3.dhcpAllocatedIPs = new Map(deviceData.config.lan3.dhcpAllocatedIPs);
                        }
                    }

                    // WAN設定の復元（ルーター用）
                    if (deviceData.wanConfig) {
                        device.wanConfig = { ...deviceData.wanConfig };
                        // インターネットデバイス参照は後で復元
                        device.wanConfig.internetDevice = null;
                    }

                    // NAT設定の復元（ルーター用）
                    if (device.type === 'router') {
                        device.natEnabled = deviceData.natEnabled !== undefined ? deviceData.natEnabled : true;
                        device.natTable = new Map();
                        if (deviceData.natTable && Array.isArray(deviceData.natTable)) {
                            deviceData.natTable.forEach(entry => {
                                const key = `${entry.protocol}_${entry.insideLocalIP}_${entry.insideLocalPort}_${entry.outsideGlobalIP}`;
                                device.natTable.set(key, entry);
                            });
                        }
                        device.nextNatPort = deviceData.nextNatPort || 10001;
                    }

                    // DNSテーブルの復元（DNSサーバー用）
                    if (deviceData.dnsTable) {
                        device.dnsTable = { ...deviceData.dnsTable };
                    }

                    // インターネットデバイスのISP設定復元
                    if (device.type === 'internet' && deviceData.config) {
                        ['isp1', 'isp2', 'isp3', 'isp4', 'isp5', 'isp6'].forEach(ispId => {
                            if (deviceData.config[ispId]) {
                                device.config[ispId] = { ...deviceData.config[ispId] };
                                // DHCPアロケーションマップの復元
                                if (deviceData.config[ispId].dhcpAllocatedIPs) {
                                    device.config[ispId].dhcpAllocatedIPs = new Map(deviceData.config[ispId].dhcpAllocatedIPs);
                                }
                            }
                        });
                        console.log('🔧 インターネットデバイスのISP設定を復元:', device.name);
                    }

                    // ポートを復元
                    device.ports.nics.forEach((port, index) => {
                        if (deviceData.ports.nics[index]) {
                            const portData = deviceData.ports.nics[index];
                            port.id = portData.id;
                            port.x = portData.x;
                            port.y = portData.y;
                            port.side = portData.side;
                            // 接続情報は後で接続復元時に設定するため、ここでは初期化のみ
                            port.connected = null;
                        }
                    });
                });

                // 接続を復元
                data.connections.forEach(connectionData => {
                    const fromDevice = deviceMap.get(connectionData.from.deviceId);
                    const toDevice = deviceMap.get(connectionData.to.deviceId);

                    if (fromDevice && toDevice) {
                        const fromPort = fromDevice.ports.nics.find(p => p.id === connectionData.from.portId);
                        const toPort = toDevice.ports.nics.find(p => p.id === connectionData.to.portId);

                        if (fromPort && toPort) {
                            const connection = {
                                id: connectionData.id,
                                from: {
                                    deviceId: fromDevice.id,
                                    portId: fromPort.id,
                                    device: fromDevice,
                                    port: fromPort
                                },
                                to: {
                                    deviceId: toDevice.id,
                                    portId: toPort.id,
                                    device: toDevice,
                                    port: toPort
                                },
                                type: connectionData.type,
                                selected: false
                            };

                            // ポートに接続情報を設定
                            fromPort.connected = connection;
                            toPort.connected = connection;

                            this.connections.push(connection);
                        }
                    }
                });

                // DHCPが有効なデバイスのIPアドレス表示を修正
                this.refreshDHCPDevicesDisplay();

                // 全デバイスのlan1.ipAddressをconfig.ipAddressと同期（既存のファイル互換性のため）
                this.syncLAN1Addresses();

                this.updateControlButtons();

                // ファイル読み込み後は強制的にNICポジション更新を実行
                this.lastNICUpdateFrame = null; // フレーム制限をリセット
                this.updateAllDynamicNICPositions();

                // ファイル読み込み後は即座に描画を実行
                this.render();

                // 少し遅延してもう一度描画を実行（確実に表示されるように）
                setTimeout(() => {
                    this.render();
                    // デバッグ用: 描画後にデバイス数を確認
                    console.log(`描画完了: ${this.devices.size}個のデバイス, ${this.connections.length}個の接続`);
                }, 50);

                // TCP詳細チェックボックスの状態を復元（後方互換性を考慮）
                if (data.tcpDetailsVisible !== undefined) {
                    console.log(`ファイルからTCP詳細状態を読み込み: ${data.tcpDetailsVisible}`);
                    // 少し遅延させて確実に復元処理を実行
                    setTimeout(() => {
                        const tcpCheckbox = document.getElementById('tcp-visibility-checkbox');
                        console.log(`TCPチェックボックス要素:`, tcpCheckbox);
                        if (tcpCheckbox) {
                            console.log(`復元前のチェック状態: ${tcpCheckbox.checked}`);
                            tcpCheckbox.checked = data.tcpDetailsVisible;
                            console.log(`復元後のチェック状態: ${tcpCheckbox.checked}`);
                            // グローバル変数も更新
                            window.showTCPPackets = data.tcpDetailsVisible;
                            console.log(`グローバル変数 showTCPPackets: ${window.showTCPPackets}`);
                            // changeイベントを手動で発火させて、関連する処理も実行
                            const changeEvent = new Event('change');
                            tcpCheckbox.dispatchEvent(changeEvent);
                            console.log(`TCP詳細表示状態を復元: ${data.tcpDetailsVisible ? 'ON' : 'OFF'}`);
                        } else {
                            console.error('TCPチェックボックスが見つかりませんでした');
                        }
                    }, 100);
                }

                this.updateStatus(`ファイル「${file.name}」を読み込みました`);

            } catch (error) {
                console.error('ファイル読み込みエラー:', error);
                this.updateStatus(`ファイル読み込みエラー: ${error.message}`);
            }
        };

        reader.onerror = () => {
            this.updateStatus('ファイル読み込みに失敗しました');
        };

        reader.readAsText(file);
    }

    // ドロップオーバーレイの表示/非表示
    showDropOverlay(show) {
        let overlay = document.getElementById('drop-overlay');

        if (show && !overlay) {
            // オーバーレイを作成
            overlay = document.createElement('div');
            overlay.id = 'drop-overlay';
            overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(59, 130, 246, 0.1);
                border: 3px dashed #3b82f6;
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
                pointer-events: none;
                font-size: 2rem;
                font-weight: bold;
                color: #3b82f6;
                text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            `;
            overlay.innerHTML = `
                <div>
                    <div style="font-size: 3rem; margin-bottom: 1rem;">📁</div>
                    <div>JSONファイルをドロップして読み込み</div>
                </div>
            `;
            document.body.appendChild(overlay);
        } else if (!show && overlay) {
            // オーバーレイを削除
            overlay.remove();
        }
    }

    // ポートIDでポートを検索
    findPortById(device, portId) {
        if (!device.ports || !device.ports.nics) return null;

        for (const port of device.ports.nics) {
            if (port.id === portId) {
                return port;
            }
        }
        return null;
    }
}

// アプリケーション初期化
function initializeNetworkSimulator() {
    // DOM要素の存在確認
    const canvas = document.getElementById('network-canvas');
    if (!canvas) {
        console.warn('Canvas要素が見つかりません。コンポーネント読み込み待ち...');
        return false;
    }
    
    const simulator = new NetworkSimulator();
    
    // グローバルに公開（TCPアニメーション等で使用）
    window.simulator = simulator;
    
    // TCP機能を既存のシミュレーターに統合
    setupTCPIntegration(simulator);
    
    // アニメーション速度制御を初期化
    initializeAnimationSpeedControl();
    
    // TCP表示制御を初期化  
    initializeTCPVisibilityControl();
    
    // ログ表示制御を初期化
    initializeLogVisibilityControl();
    
    return true;
}

// コンポーネント読み込み完了後に初期化
if (window.componentsLoaded) {
    initializeNetworkSimulator();
} else {
    window.addEventListener('componentsLoaded', () => {
        console.log('コンポーネント読み込み完了、シミュレータを初期化中...');
        if (!initializeNetworkSimulator()) {
            // 要素がまだない場合は少し待ってリトライ
            setTimeout(() => {
                initializeNetworkSimulator();
            }, 100);
        }
    });
    
    // フォールバック: componentsLoadedイベントが発火しない場合
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            if (!window.simulator) {
                console.log('フォールバック初期化を実行中...');
                initializeNetworkSimulator();
            }
        }, 500);
    });
}

// デバッグ用のグローバル関数を登録
window.debugDHCP = () => {
    if (window.simulator) {
        window.simulator.showAllDHCPLeases();
    } else {
        console.warn('シミュレーターが初期化されていません');
    }
};

window.debugNetworkDevices = () => {
    if (window.simulator) {
        console.log('\n=== 全デバイス情報 ===');
        for (const [, device] of window.simulator.devices.entries()) {
            const dhcpStatus = device.config.dhcpEnabled ? 'DHCP有効' : 'DHCP無効';
            console.log(`${device.name} (${device.type}): ${device.config.ipAddress} - ${dhcpStatus}`);
        }
        console.log('=== 全デバイス情報終了 ===\n');
    } else {
        console.warn('シミュレーターが初期化されていません');
    }
};

window.redistributeAllDHCP = () => {
    if (window.simulator) {
        console.log('\n=== 全ルーターでDHCP再配布 ===');
        for (const [, device] of window.simulator.devices.entries()) {
            if (device.type === 'router') {
                window.simulator.redistributeDHCPAddresses(device);
            }
        }
    } else {
        console.warn('シミュレーターが初期化されていません');
    }
};

// TCP関連のデバッグコマンド
window.debugTCP = () => {
    if (window.tcpManager) {
        const stats = window.tcpManager.getStatistics();
        console.log('\n=== TCP接続統計 ===');
        console.log(`総接続数: ${stats.totalConnections}`);
        console.log(`アクティブ接続: ${stats.activeConnections}`);
        console.log('状態分布:', stats.stateDistribution);
        console.log('=== TCP接続統計終了 ===\n');
    } else {
        console.warn('TCPマネージャーが初期化されていません');
    }
};

console.log('🔧 デバッグコマンド:');
console.log('  debugDHCP() - DHCP状況表示');
console.log('  debugNetworkDevices() - 全デバイス情報表示');
console.log('  redistributeAllDHCP() - 全ルーターでDHCP再配布実行');
console.log('  debugTCP() - TCP接続統計表示');

// TCP機能を既存のシミュレーターに統合する関数
function setupTCPIntegration(simulator) {
    if (!simulator) {
        console.error('シミュレーターが初期化されていません');
        return;
    }
    
    // HTTP通信モード
    simulator.isHTTPMode = false;
    simulator.httpSourceDevice = null;
    simulator.httpTargetDevice = null;
    
    // HTTP通信ボタンのイベントリスナー
    const httpBtn = document.getElementById('http-btn');
    if (httpBtn) {
        httpBtn.addEventListener('click', () => {
            simulator.toggleHTTPMode();
        });
    }
    
    // TCPマネージャーのイベントリスナー設定
    setupTCPEventListeners(simulator);
    
    // TCP状態パネルの初期化
    setupTCPStatusPanel(simulator);
    
    // デバイスにTCP関連機能を追加
    extendDevicesWithTCP(simulator);
    
    console.log('TCP機能が正常に統合されました');
}

// TCPイベントリスナーの設定
function setupTCPEventListeners(simulator) {
    // TCP接続状態変更イベント
    window.tcpManager.addEventListener('connectionStateChange', (data) => {
        console.log(`TCP状態変更: ${data.connection.id} ${data.oldState} → ${data.newState}`);
        updateTCPStatusPanel(simulator);
    });
    
    // セグメント送信イベント（アニメーション表示）
    window.tcpManager.addEventListener('segmentSent', (data) => {
        animateTCPSegment(simulator, data);
    });
    
    // HTTP関連イベントはtcp-integration.jsで処理
    
    // 接続確立完了イベント
    window.tcpManager.addEventListener('connectionEstablished', (data) => {
        simulator.updateStatus(`TCP接続確立: ${data.connection.localDevice.name || data.connection.localDevice.id} ⟷ ${data.connection.remoteDevice.name || data.connection.remoteDevice.id}`);
        updateTCPStatusPanel(simulator);
    });
}

// TCP状態パネルの設定
function setupTCPStatusPanel(simulator) {
    const panel = document.getElementById('tcp-status-panel');
    if (panel) {
        // 初期は非表示
        panel.style.display = 'none';
    }
}

// TCP状態パネルの更新
function updateTCPStatusPanel(simulator) {
    const panel = document.getElementById('tcp-status-panel');
    const connectionsList = document.getElementById('tcp-connections-list');
    
    if (!panel || !connectionsList) return;
    
    const connections = window.tcpManager.getAllConnections();
    
    if (connections.length === 0) {
        connectionsList.innerHTML = '<div style="color: #666; font-style: italic;">接続なし</div>';
        // ログ表示がOFFなら非表示、ONなら表示（未定義の場合はfalseとして扱う）
        if (!window.showLogPanels) {
            panel.style.display = 'none';
        }
        return;
    }
    
    // ログ表示がONの場合のみ表示
    if (window.showLogPanels) {
        panel.style.display = 'block';
    }
    
    connectionsList.innerHTML = connections.map(conn => {
        const info = conn.getConnectionInfo();
        const stateClass = info.state.toLowerCase().replace('_', '-');
        const localName = info.localDevice;
        const remoteName = info.remoteDevice;
        
        return `
            <div class="tcp-connection-item ${stateClass}">
                <div style="font-weight: bold;">${localName}:${info.localPort} ⟷ ${remoteName}:${info.remotePort}</div>
                <div style="color: #666; font-size: 10px;">
                    状態: ${info.state} | 送信: ${info.sentSegments} | 受信: ${info.receivedSegments}
                </div>
            </div>
        `;
    }).join('');
}

// TCPセグメントのアニメーション（animation-helper.jsの関数を使用）
// この関数は削除され、animation-helper.jsのanimateTCPSegment関数が使用されます

// ワールド座標をDOM座標に変換する関数
function worldToDOM(simulator, worldPos) {
    return {
        x: worldPos.x * simulator.scale + simulator.panX,
        y: worldPos.y * simulator.scale + simulator.panY
    };
}

// TCP接続に基づいて送信元デバイスを探す関数（簡易実装）
function findDeviceByConnection(segment, targetDevice) {
    // 既存のTCP接続から送信元を探す
    const connections = window.tcpManager.getAllConnections();
    for (const conn of connections) {
        if (conn.remoteDevice === targetDevice && 
            conn.localPort === segment.sourcePort && 
            conn.remotePort === segment.destPort) {
            return conn.localDevice;
        }
    }
    
    // 見つからない場合はnull
    return null;
}

// デバイスにTCP機能を拡張
function extendDevicesWithTCP(simulator) {
    // 既存のデバイス作成関数を拡張
    const originalCreateDevice = simulator.createDevice.bind(simulator);
    simulator.createDevice = function(type, x, y) {
        const device = originalCreateDevice(type, x, y);
        
        // TCP関連機能を追加
        device.receiveSegment = function(segment, connection) {
            console.log(`${this.name || this.id} でTCPセグメント受信:`, segment.toString());
            
            if (connection) {
                connection.receiveSegment(segment);
            } else {
                console.warn('TCP接続が見つかりません:', segment.toString());
            }
        };
        
        // サーバータイプの場合はHTTPサーバー機能を有効にする
        if (type === 'server') {
            window.httpSimulator.setupSampleServer(device, 80);
        }
        
        // DNSサーバータイプの場合はDNSテーブルを初期化
        if (type === 'dns') {
            device.dnsTable = {
                'localhost': '127.0.0.1'
            };
        }
        
        return device;
    };
    
    // HTTP通信モードの切り替え
    simulator.toggleHTTPMode = function() {
        if (this.isHTTPMode) {
            // HTTP通信モードを終了
            this.isHTTPMode = false;
            this.httpSourceDevice = null;
            this.httpTargetDevice = null;
            this.updateStatus('HTTP通信モードを終了しました');
        } else {
            // HTTP通信モードを開始
            this.isHTTPMode = true;
            this.isPingMode = false; // Pingモードは無効にする
            this.pingSourceDevice = null;
            this.pingTargetDevice = null;
            this.updateStatus('HTTP通信を行うクライアントとサーバーを選択してください');
        }
        this.updateControlButtons(); // ボタンの状態を更新
        this.scheduleRender();
    };
    
    // 既存のデバイスクリックハンドラーを拡張
    const originalHandleDeviceClick = simulator.handleDeviceClick.bind(simulator);
    simulator.handleDeviceClick = function(clickedDevice, event) {
        if (this.isHTTPMode) {
            this.handleHTTPModeClick(clickedDevice);
            return;
        }
        
        // 元の処理を実行
        originalHandleDeviceClick(clickedDevice, event);
    };
    
    // HTTP通信用のデバイスクリック処理
    simulator.handleHTTPModeClick = function(clickedDevice) {
        if (clickedDevice.type === 'switch' || clickedDevice.type === 'onu') {
            this.updateStatus(`⚠️ ${clickedDevice.name} はL2中継機器のためHTTPクライアントにはなれません。端末(PC等)を選択してください`);
            return;
        }

        if (!this.httpSourceDevice) {
            // 送信元を選択
            this.httpSourceDevice = clickedDevice;
            this.updateStatus(`HTTP送信元に ${clickedDevice.name} を選択しました。宛先選択ダイアログを表示します。`);
            
            // HTTPモードを終了してダイアログを表示
            this.isHTTPMode = false;
            this.updateControlButtons();
            this.showDestinationDialog(clickedDevice, 'http');
        } else if (this.httpSourceDevice === clickedDevice) {
            // 同じデバイスをクリック → 選択解除
            this.httpSourceDevice = null;
            this.updateStatus('HTTP送信元の選択を解除しました。クライアントを選択してください。');
        }
        this.scheduleRender();
    };
    
    // HTTP通信の実行
    simulator.executeHTTPCommunication = function(client, server) {
        console.log(`HTTP通信開始: ${client.name || client.id} → ${server.name || server.id}`);
        
        // IPアドレスの検証
        if (!client.config.ipAddress || client.config.ipAddress === '0.0.0.0') {
            this.updateStatus(`❌ HTTP通信失敗: ${client.name} にIPアドレスが設定されていません`);
            return;
        }
        
        if (!server.config.ipAddress || server.config.ipAddress === '0.0.0.0') {
            this.updateStatus(`❌ HTTP通信失敗: ${server.name} にIPアドレスが設定されていません`);
            return;
        }
        
        // 同じデバイス間のHTTP通信チェック
        if (client === server) {
            this.updateStatus(`❌ HTTP通信失敗: 同一デバイス内でのHTTP通信は実行できません`);
            return;
        }
        
        // 同じIPアドレス間のHTTP通信チェック
        if (client.config.ipAddress === server.config.ipAddress) {
            this.updateStatus(`❌ HTTP通信失敗: 同じIPアドレス (${client.config.ipAddress}) を持つデバイス間でのHTTP通信は実行できません。IPアドレスの重複を解決してください。`);
            return;
        }
        
        // ネットワークループチェック
        if (this.hasNetworkLoop()) {
            const loops = this.detectNetworkLoops();
            const shortErrorMessage = this.formatShortNetworkLoopError(loops);
            this.updateStatus(`❌ HTTP通信失敗: ${shortErrorMessage}`);
            return;
        }
        
        // 通信可能性の検証
        const reachabilityResult = this.checkNetworkReachability(client, server);
        if (!reachabilityResult.isReachable) {
            this.updateStatus(`❌ HTTP通信失敗: ${client.name} と ${server.name} は通信できません (${reachabilityResult.reason})`);
            return;
        }
        
        this.updateStatus(`🌐 HTTP通信を開始中: ${client.name} → ${server.name}`);
        
        // HTTPリクエストを送信
        const session = window.httpSimulator.sendRequest(client, server, {
            method: 'GET',
            path: '/',
            headers: {
                'Host': server.config.ipAddress,
                'User-Agent': 'NetworkSimulator/1.0'
            }
        });
        
        if (!session) {
            this.updateStatus(`❌ HTTP通信失敗: セッションの作成に失敗しました`);
        }
    };
    
    // デバイス描画に HTTP モードのハイライトを追加
    const originalDrawDevice = simulator.drawDevice.bind(simulator);
    simulator.drawDevice = function(device) {
        let httpHighlight = null;
        
        if (this.isHTTPMode) {
            if (device === this.httpSourceDevice) {
                httpHighlight = 'source';
            } else if (device === this.httpTargetDevice) {
                httpHighlight = 'target';
            }
        }
        
        // 元の描画処理を呼び出し（引数を拡張）
        originalDrawDevice(device, httpHighlight);
    };
    
    // クリアボタンの処理を拡張
    const originalClearAll = simulator.clearAll.bind(simulator);
    simulator.clearAll = function() {
        // TCP接続をクリア
        window.tcpManager.clearAllConnections();
        window.httpSimulator.clearAllSessions();
        
        // HTTP通信モードをリセット
        this.isHTTPMode = false;
        this.httpSourceDevice = null;
        this.httpTargetDevice = null;
        document.getElementById('http-btn').textContent = 'HTTP';
        
        // TCP状態パネルを隠す
        const panel = document.getElementById('tcp-status-panel');
        if (panel) {
            panel.style.display = 'none';
        }
        
        // 元のクリア処理を実行
        originalClearAll();
    };
}

// TCP機能を統合
console.log('TCP統合を開始...');

// データ受信イベントリスナーを直接追加（重複防止付き）
let httpEventListenerAdded = false;
if (!httpEventListenerAdded) {
    window.tcpManager.addEventListener('dataReceived', (data) => {
        console.log('🔄 TCPManager dataReceived イベント発火!');
        console.log('🔄 Connection ID:', data.connection.id);
        console.log('📦 受信データ:', data.data);

        const connection = data.connection;
        const localDevice = connection.localDevice;
        const remoteDevice = connection.remoteDevice;

        console.log('🔍 接続詳細:', {
            id: connection.id,
            local: localDevice?.name,
            remote: remoteDevice?.name,
            localPort: connection.localPort,
            remotePort: connection.remotePort
        });

        // TCP接続IDでHTTPセッションを正確に特定
        const targetSessionId = connection.id;
        console.log('🎯 HTTPセッション検索対象:', targetSessionId);

        const session = window.httpSimulator.sessions.get(targetSessionId);
        if (session) {
            console.log('✅ HTTPセッションに転送:', targetSessionId);
            session.handleReceivedData(data.data);
        } else {
            console.log('❌ 対応するHTTPセッションが見つかりません:', targetSessionId);
            console.log('📋 利用可能なHTTPセッション:', Array.from(window.httpSimulator.sessions.keys()));
            
            // まず逆方向のTCP接続IDでHTTPセッションを検索
            const reversedId = window.httpSimulator.getReversedConnectionId ? 
                window.httpSimulator.getReversedConnectionId(targetSessionId) : null;
            
            let matchedSession = null;
            if (reversedId) {
                console.log('逆方向接続ID:', reversedId);
                matchedSession = window.httpSimulator.sessions.get(reversedId);
                if (matchedSession) {
                    console.log('逆方向接続でHTTPセッションに転送:', reversedId);
                    matchedSession.handleReceivedData(data.data);
                }
            }
            
            // 逆方向でも見つからない場合、デバイス間での代替検索（最新のセッションを優先）
            if (!matchedSession) {
                const sessionEntries = Array.from(window.httpSimulator.sessions.entries());
                // セッションを最新順（接続ID内のタイムスタンプが新しい順）にソート
                sessionEntries.sort((a, b) => {
                    const timestampA = a[0].split('_')[0].split('-')[1] || '0';
                    const timestampB = b[0].split('_')[0].split('-')[1] || '0';
                    return parseInt(timestampB) - parseInt(timestampA);
                });
                
                for (const [sessionId, session] of sessionEntries) {
                    const sessionLocal = session.connection.localDevice;
                    const sessionRemote = session.connection.remoteDevice;
                    
                    if ((sessionLocal === localDevice && sessionRemote === remoteDevice) ||
                        (sessionLocal === remoteDevice && sessionRemote === localDevice)) {
                        console.log('デバイスベース（最新優先）でHTTPセッションに転送:', sessionId);
                        session.handleReceivedData(data.data);
                        break;
                    }
                }
            }
        }
    });
    httpEventListenerAdded = true;
}

console.log('TCP-HTTP統合完了');

// アニメーション速度制御の初期化
window.animationSpeedMultiplier = 1.0;

function initializeAnimationSpeedControl() {
    const slider = document.getElementById('animation-speed-slider');
    const speedValue = document.getElementById('speed-value');
    
    if (slider && speedValue) {
        // スライダーの値が変更された時の処理
        slider.addEventListener('input', function() {
            const speed = parseFloat(this.value);
            window.animationSpeedMultiplier = speed;
            speedValue.textContent = speed + '×';
            
            console.log('アニメーション速度を変更:', speed + '×');
        });
        
        // 初期値を設定
        window.animationSpeedMultiplier = parseFloat(slider.value);
        speedValue.textContent = slider.value + '×';
        
        console.log('アニメーション速度制御を初期化しました');
    }
}

// TCP表示制御の初期化
function initializeTCPVisibilityControl() {
    const checkbox = document.getElementById('tcp-visibility-checkbox');
    if (checkbox) {
        // 初期値を設定
        window.showTCPPackets = checkbox.checked;
        
        // チェックボックスの変更イベント
        checkbox.addEventListener('change', (event) => {
            window.showTCPPackets = event.target.checked;
            console.log(`TCP詳細表示: ${window.showTCPPackets ? 'ON (全パケット)' : 'OFF (HTTPデータのみ)'}`);
        });
        
        console.log('TCP表示制御を初期化しました');
    }
}

// ログ表示制御の初期化
function initializeLogVisibilityControl() {
    const checkbox = document.getElementById('log-visibility-checkbox');
    
    if (checkbox) {
        // 初期値を設定
        window.showLogPanels = checkbox.checked;
        
        // チェックボックスの変更イベント
        checkbox.addEventListener('change', (event) => {
            window.showLogPanels = event.target.checked;
            console.log(`ログ表示: ${window.showLogPanels ? 'ON' : 'OFF'}`);
            
            // TCP詳細パネルとHTTPパネルの表示/非表示を制御
            toggleTCPDetailPanels(event.target.checked);
        });
        
        // 初期状態でパネルの表示/非表示を設定
        toggleTCPDetailPanels(checkbox.checked);
        
        console.log('ログ表示制御を初期化しました');
    }
}

// TCP詳細パネルの表示/非表示制御
function toggleTCPDetailPanels(show) {
    const tcpPanel = document.getElementById('tcp-status-panel');
    const httpPanel = document.getElementById('http-status-panel');
    
    if (tcpPanel) {
        tcpPanel.style.display = show ? 'block' : 'none';
    }
    
    if (httpPanel) {
        httpPanel.style.display = show ? 'block' : 'none';
    }
    
    console.log(`ログパネル: ${show ? '表示' : '非表示'}`);
}

// IPアドレス重複検出機能を NetworkSimulator クラスに追加
NetworkSimulator.prototype.checkIPAddressDuplication = function(ipAddress, excludeDevice) {
    // 同じIPアドレスを使用しているデバイスがないかチェック
    for (const device of this.devices.values()) {
        // 自分自身は除外
        if (device === excludeDevice) continue;
        
        // デバイス設定が存在しない場合はスキップ
        if (!device.config) continue;
        
        // メインIPアドレスをチェック
        if (device.config.ipAddress && device.config.ipAddress === ipAddress) {
            console.log(`IP重複検出: ${device.name}が${ipAddress}を使用中`);
            return true;
        }
        
        // ルーターの場合はLANインターフェースもチェック
        if (device.type === 'router') {
            if (device.config.lan1 && device.config.lan1.ipAddress === ipAddress) {
                console.log(`IP重複検出: ${device.name}のLAN1が${ipAddress}を使用中`);
                return true;
            }
            if (device.config.lan2 && device.config.lan2.ipAddress === ipAddress) {
                console.log(`IP重複検出: ${device.name}のLAN2が${ipAddress}を使用中`);
                return true;
            }
            if (device.config.lan3 && device.config.lan3.ipAddress === ipAddress) {
                console.log(`IP重複検出: ${device.name}のLAN3が${ipAddress}を使用中`);
                return true;
            }
            // WANインターフェースもチェック
            if (device.wanConfig && device.wanConfig.ipAddress === ipAddress) {
                console.log(`IP重複検出: ${device.name}のWANが${ipAddress}を使用中`);
                return true;
            }
        }
    }
    return false;
};

// ルーター用のIPアドレス重複検出
NetworkSimulator.prototype.checkIPAddressDuplicationForRouter = function(ipAddress, excludeDevice, lanInterface) {
    // 同じIPアドレスを使用しているデバイスがないかチェック
    for (const device of this.devices.values()) {
        // 自分自身は除外
        if (device === excludeDevice) continue;
        
        // デバイス設定が存在しない場合はスキップ
        if (!device.config) continue;
        
        // メインIPアドレスをチェック
        if (device.config.ipAddress && device.config.ipAddress === ipAddress) {
            console.log(`ルーターIP重複検出: ${device.name}が${ipAddress}を使用中`);
            return true;
        }
        
        // ルーターの場合はLANインターフェースもチェック
        if (device.type === 'router') {
            if (device.config.lan1 && device.config.lan1.ipAddress === ipAddress) {
                console.log(`ルーターIP重複検出: ${device.name}のLAN1が${ipAddress}を使用中`);
                return true;
            }
            if (device.config.lan2 && device.config.lan2.ipAddress === ipAddress) {
                console.log(`ルーターIP重複検出: ${device.name}のLAN2が${ipAddress}を使用中`);
                return true;
            }
            if (device.config.lan3 && device.config.lan3.ipAddress === ipAddress) {
                console.log(`ルーターIP重複検出: ${device.name}のLAN3が${ipAddress}を使用中`);
                return true;
            }
            // WANインターフェースもチェック
            if (device.wanConfig && device.wanConfig.ipAddress === ipAddress) {
                console.log(`ルーターIP重複検出: ${device.name}のWANが${ipAddress}を使用中`);
                return true;
            }
        }
    }
    
    // 同じルーター内の他のLANインターフェースもチェック
    if (excludeDevice && excludeDevice.type === 'router') {
        if (lanInterface !== 'lan1' && excludeDevice.config.lan1 && excludeDevice.config.lan1.ipAddress === ipAddress) {
            console.log(`ルーターIP重複検出: 同一ルーター内のLAN1が${ipAddress}を使用中`);
            return true;
        }
        if (lanInterface !== 'lan2' && excludeDevice.config.lan2 && excludeDevice.config.lan2.ipAddress === ipAddress) {
            console.log(`ルーターIP重複検出: 同一ルーター内のLAN2が${ipAddress}を使用中`);
            return true;
        }
        if (lanInterface !== 'lan3' && excludeDevice.config.lan3 && excludeDevice.config.lan3.ipAddress === ipAddress) {
            console.log(`ルーターIP重複検出: 同一ルーター内のLAN3が${ipAddress}を使用中`);
            return true;
        }
        if (excludeDevice.wanConfig && excludeDevice.wanConfig.ipAddress === ipAddress) {
            console.log(`ルーターIP重複検出: 同一ルーター内のWANが${ipAddress}を使用中`);
            return true;
        }
    }
    
    return false;
};

// ネットワークループ検出機能（スイッチ間の複数接続検出）
NetworkSimulator.prototype.detectNetworkLoops = function() {
    const loops = [];

    // デバッグ情報
    console.log('ループ検出開始 - 接続数:', this.connections.length);

    // 1. 自己ループ（同一デバイス内接続）を検出
    const selfLoops = this.detectSelfLoops();
    loops.push(...selfLoops);

    // 2. スイッチ間の複数接続を検出
    const switchConnections = new Map();

    // 各接続をチェック
    for (const connection of this.connections) {
        const device1 = connection.from ? connection.from.device : null;
        const device2 = connection.to ? connection.to.device : null;

        // デバッグ情報
        console.log('接続チェック:', {
            connection_id: connection.id,
            device1: device1 ? `${device1.name}(${device1.type})` : 'null',
            device2: device2 ? `${device2.name}(${device2.type})` : 'null'
        });

        // デバイスが存在し、両方がスイッチの場合のみ処理
        if (device1 && device2 && device1.type === 'switch' && device2.type === 'switch') {
            // デバイスペアのキーを作成（順序に依存しないように）
            const devicePairKey = [device1.id, device2.id].sort().join('-');

            console.log('スイッチ間接続発見:', `${device1.name} ↔ ${device2.name}`);

            if (!switchConnections.has(devicePairKey)) {
                switchConnections.set(devicePairKey, {
                    device1: device1,
                    device2: device2,
                    connections: []
                });
            }

            switchConnections.get(devicePairKey).connections.push(connection);
        }
    }

    // 複数接続があるペアを検出
    for (const [pairKey, pairData] of switchConnections) {
        if (pairData.connections.length > 1) {
            console.log(`ネットワークループ検出: ${pairData.device1.name} と ${pairData.device2.name} の間に ${pairData.connections.length} 本の接続があります`);
            loops.push({
                type: 'switch-redundant',
                device1: pairData.device1,
                device2: pairData.device2,
                connectionCount: pairData.connections.length,
                connections: pairData.connections
            });
        }
    }

    return loops;
};

// 自己ループ（同一デバイス内接続）を検出
NetworkSimulator.prototype.detectSelfLoops = function() {
    const selfLoops = [];

    console.log('🔍 自己ループ検出開始');

    for (const connection of this.connections) {
        const device1 = connection.from ? connection.from.device : null;
        const device2 = connection.to ? connection.to.device : null;

        // 同一デバイス内接続をチェック
        if (device1 && device2 && device1.id === device2.id) {
            console.log(`🔄 自己ループ検出: ${device1.name} (${device1.type}) 内でのポート間接続`);

            selfLoops.push({
                type: 'self-loop',
                device: device1,
                connection: connection,
                fromPort: connection.from,
                toPort: connection.to
            });
        }
    }

    console.log('🔍 自己ループ検出結果:', selfLoops.length, '件');
    return selfLoops;
};

// ループ状態のチェック（通信可能性判定時に使用）
NetworkSimulator.prototype.hasNetworkLoop = function() {
    const loops = this.detectNetworkLoops();
    return loops.length > 0;
};

// 同一スイッチに複数のルーターNICが接続されているかチェック
NetworkSimulator.prototype.hasRouterMultiNICToSameSwitch = function() {
    const issues = this.detectRouterMultiNICToSameSwitch();
    return issues.length > 0;
};

// 同一スイッチに複数のルーターNICが接続されている問題を検出
NetworkSimulator.prototype.detectRouterMultiNICToSameSwitch = function() {
    const issues = [];
    console.log('🔍 detectRouterMultiNICToSameSwitch: 開始');
    console.log('🔍 デバイス総数:', this.devices.size);
    console.log('🔍 接続総数:', this.connections.length);

    // 全てのスイッチを確認
    for (const [switchId, switchDevice] of this.devices) {
        if (switchDevice.type !== 'switch') continue;
        console.log('🔍 スイッチを確認中:', switchDevice.name, switchId);

        // このスイッチに接続されているルーターを収集
        const connectedRouters = new Map(); // routerId -> [connectedNICs]

        for (const connection of this.connections) {
            let routerDevice = null;
            let otherDevice = null;

            // 接続形式に応じて処理
            if (connection.from && connection.to) {
                // 新しい形式
                console.log('🔍 新形式の接続:', connection.from.device?.name, '↔', connection.to.device?.name);
                if (connection.from.device === switchDevice) {
                    otherDevice = connection.to.device;
                } else if (connection.to.device === switchDevice) {
                    otherDevice = connection.from.device;
                }
            } else {
                // 古い形式
                console.log('🔍 旧形式の接続:', connection.device1, '↔', connection.device2);
                if (connection.device1 === switchId) {
                    otherDevice = this.devices.get(connection.device2);
                } else if (connection.device2 === switchId) {
                    otherDevice = this.devices.get(connection.device1);
                }
            }

            // 接続先がルーターの場合
            if (otherDevice && otherDevice.type === 'router') {
                routerDevice = otherDevice;
                console.log('🔍 ルーターが発見:', routerDevice.name, 'スイッチ:', switchDevice.name);

                // このルーターのどのNICがスイッチに接続されているかを判定
                const connectedNIC = this.determineConnectedNIC(routerDevice, switchDevice, connection);
                console.log('🔍 接続NIC:', connectedNIC);

                if (!connectedRouters.has(routerDevice.id)) {
                    connectedRouters.set(routerDevice.id, []);
                }
                connectedRouters.get(routerDevice.id).push(connectedNIC);
            }
        }

        console.log('🔍 スイッチ', switchDevice.name, '接続ルーター情報:', Array.from(connectedRouters.entries()));

        // 同一ルーターの複数NICが同一スイッチに接続されているかチェック
        for (const [routerId, connectedNICs] of connectedRouters) {
            console.log('🔍 ルーター', routerId, 'の接続NIC数:', connectedNICs.length, 'NICs:', connectedNICs);
            if (connectedNICs.length > 1) {
                const routerDevice = this.devices.get(routerId);
                console.log('⚠️ 問題発見! ルーター', routerDevice.name, '複数NIC接続:', connectedNICs);
                issues.push({
                    type: 'router-multi-nic-same-switch',
                    router: routerDevice,
                    switch: switchDevice,
                    connectedNICs: connectedNICs,
                    message: `ルーター「${routerDevice.name}」の複数NIC（${connectedNICs.join(', ')}）が同一スイッチ「${switchDevice.name}」に接続されています`
                });
            }
        }
    }

    console.log('🔍 最終結果: 検出された問題数:', issues.length);
    return issues;
};

// ルーターのどのNICがスイッチに接続されているかを判定
NetworkSimulator.prototype.determineConnectedNIC = function(router, switchDevice, connection) {
    console.log('🔍 determineConnectedNIC: ルーター', router.name, 'スイッチ', switchDevice.name);
    console.log('🔍 接続情報:', connection);

    // 接続位置から判定する方式を使用
    let nicType = this.determineNICFromConnectionPosition(router, connection);

    // フォールバック: ポート番号からNIC種別を判定
    if (nicType === 'UNKNOWN') {
        let routerPortIndex = 0;

        if (connection.from && connection.to) {
            // 新しい形式
            console.log('🔍 新形式接続を解析中');
            if (connection.from.device === router) {
                routerPortIndex = connection.from.port || 0;
                console.log('🔍 fromポート使用:', routerPortIndex);
            } else if (connection.to.device === router) {
                routerPortIndex = connection.to.port || 0;
                console.log('🔍 toポート使用:', routerPortIndex);
            }
        } else {
            // 古い形式の場合は推定
            console.log('🔍 旧形式接続を解析中');
            if (connection.fromDevice === router.id) {
                routerPortIndex = connection.fromPort || 0;
                console.log('🔍 旧fromポート使用:', routerPortIndex);
            } else if (connection.toDevice === router.id) {
                routerPortIndex = connection.toPort || 0;
                console.log('🔍 旧toポート使用:', routerPortIndex);
            }
        }

        // ポート番号をNIC種別にマッピング
        nicType = this.mapPortToNICType(routerPortIndex);
    }

    console.log('🔍 最終判定: NIC', nicType);
    return nicType;
};

// 接続位置からNIC種別を判定
NetworkSimulator.prototype.determineNICFromConnectionPosition = function(router, connection) {
    // ルーターの接続点座標を取得
    let routerConnectionPoint = null;

    if (connection.from && connection.to) {
        if (connection.from.device === router) {
            routerConnectionPoint = { x: connection.from.x, y: connection.from.y };
        } else if (connection.to.device === router) {
            routerConnectionPoint = { x: connection.to.x, y: connection.to.y };
        }
    }

    if (!routerConnectionPoint) {
        console.log('🔍 接続点座標が取得できません');
        return 'UNKNOWN';
    }

    console.log('🔍 ルーター接続点:', routerConnectionPoint);
    console.log('🔍 ルーター位置:', { x: router.x, y: router.y });

    // ルーターの中心からの相対位置で判定
    const relativeX = routerConnectionPoint.x - router.x;
    const relativeY = routerConnectionPoint.y - router.y;

    console.log('🔍 相対位置:', { relativeX, relativeY });

    // ルーターの各NICエリアを判定（ルーターの描画仕様に合わせて調整）
    // 左側: LAN1, 右側: LAN2, 下側: LAN3 のような配置を想定
    if (relativeX < -20) {
        console.log('🔍 位置判定: LAN1 (左側)');
        return 'LAN1';
    } else if (relativeX > 20) {
        console.log('🔍 位置判定: LAN2 (右側)');
        return 'LAN2';
    } else if (relativeY > 10) {
        console.log('🔍 位置判定: LAN3 (下側)');
        return 'LAN3';
    } else if (relativeY < -10) {
        console.log('🔍 位置判定: WAN (上側)');
        return 'WAN';
    }

    console.log('🔍 位置判定: UNKNOWN (判定不能)');
    return 'UNKNOWN';
};

// 注意: initializeAnimationSpeedControl() と initializeTCPVisibilityControl() は
// 現在 initializeNetworkSimulator() 内で呼び出されています
