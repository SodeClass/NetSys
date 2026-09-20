/**
 * IPアドレス入力フィールド用のIME無効化とバリデーション機能
 * 全角文字の自動変換と入力制限を提供
 */

class IPInputHelper {
    constructor() {
        this.ipInputSelectors = [
            // デバイス設定ダイアログのIPアドレス関連フィールド
            '#ip-address',
            '#subnet-mask',
            '#default-gateway',
            '#wan-ip-address',
            '#wan-subnet-mask',
            '#wan-default-gateway',
            '#lan1-ip',
            '#lan1-pool-start',
            '#lan1-pool-end',
            '#lan2-ip',
            '#lan2-pool-start',
            '#lan2-pool-end',
            '#lan3-ip',
            '#lan3-pool-start',
            '#lan3-pool-end',
            // 宛先選択ダイアログのIPアドレスフィールド
            '#destination-ip'
        ];

        this.fullWidthToHalfWidth = {
            '０': '0', '１': '1', '２': '2', '３': '3', '４': '4',
            '５': '5', '６': '6', '７': '7', '８': '8', '９': '9',
            '．': '.', '。': '.'
        };

        this.init();
    }

    init() {
        // DOMが読み込まれた後とコンポーネントが読み込まれた後の両方で初期化
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupFields());
        } else {
            this.setupFields();
        }

        // コンポーネント読み込み完了後にも実行
        window.addEventListener('componentsLoaded', () => {
            setTimeout(() => this.setupFields(), 100); // 少し遅延を入れて確実に要素が存在するようにする
        });

        // MutationObserverでDOMの変更を監視
        this.observeDOM();
    }

    setupFields() {
        this.ipInputSelectors.forEach(selector => {
            const element = document.querySelector(selector);
            if (element && !element.dataset.ipHelperSetup) {
                this.setupIPInputField(element);
                element.dataset.ipHelperSetup = 'true';
            }
        });
    }

    observeDOM() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // 新しく追加された要素に対してIPフィールドの設定を行う
                        this.ipInputSelectors.forEach(selector => {
                            const element = node.querySelector ? node.querySelector(selector) : null;
                            if (element && !element.dataset.ipHelperSetup) {
                                this.setupIPInputField(element);
                                element.dataset.ipHelperSetup = 'true';
                            }
                        });

                        // 追加されたノード自体がIPフィールドの場合
                        this.ipInputSelectors.forEach(selector => {
                            if (node.matches && node.matches(selector) && !node.dataset.ipHelperSetup) {
                                this.setupIPInputField(node);
                                node.dataset.ipHelperSetup = 'true';
                            }
                        });
                    }
                });
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    setupIPInputField(element) {
        try {
            // IMEモードを無効化
            element.style.imeMode = 'disabled';
            element.style.webkitImeMode = 'disabled';
            element.setAttribute('inputmode', 'decimal');
            element.setAttribute('autocomplete', 'off');
            element.setAttribute('spellcheck', 'false');

            // 入力イベントリスナーを追加
            element.addEventListener('input', (e) => this.handleInput(e));
            element.addEventListener('keypress', (e) => this.handleKeyPress(e));
            element.addEventListener('paste', (e) => this.handlePaste(e));
            element.addEventListener('compositionstart', (e) => this.handleCompositionStart(e));
            element.addEventListener('compositionupdate', (e) => this.handleCompositionUpdate(e));
            element.addEventListener('compositionend', (e) => this.handleCompositionEnd(e));

            // フォーカス時にもIMEを確実に無効化
            element.addEventListener('focus', (e) => {
                e.target.style.imeMode = 'disabled';
                e.target.style.webkitImeMode = 'disabled';
            });

            console.log(`IPアドレス入力フィールドを設定しました: ${element.id || element.className}`);
        } catch (error) {
            console.error('IPアドレス入力フィールドの設定エラー:', error);
        }
    }

    handleInput(e) {
        const originalValue = e.target.value;
        const convertedValue = this.convertToHalfWidth(originalValue);
        const filteredValue = this.filterIPCharacters(convertedValue);

        if (originalValue !== filteredValue) {
            e.target.value = filteredValue;
            this.showConversionFeedback(e.target);
        }
    }

    handleKeyPress(e) {
        const char = e.key;

        // 制御キー（Backspace, Delete, Tab, Enter, Arrow keys など）は許可
        if (e.ctrlKey || e.metaKey || e.altKey ||
            ['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(char)) {
            return;
        }

        // IPアドレスに使用可能な文字（数字とピリオド）かつ全角文字の場合のみ許可
        // CIDR記法のスラッシュ（/）は明示的に阻止
        if (char === '/') {
            e.preventDefault();
            this.showCIDRWarning(e.target);
        } else if (!this.isValidIPCharacter(char) && !this.isFullWidthNumber(char) && char !== '．' && char !== '。') {
            e.preventDefault();
        }
    }

    handlePaste(e) {
        e.preventDefault();
        const pastedText = (e.clipboardData || window.clipboardData).getData('text');
        const convertedText = this.convertToHalfWidth(pastedText);
        const filteredText = this.filterIPCharacters(convertedText);

        // カーソル位置に挿入
        const startPos = e.target.selectionStart;
        const endPos = e.target.selectionEnd;
        const currentValue = e.target.value;
        const newValue = currentValue.substring(0, startPos) + filteredText + currentValue.substring(endPos);

        e.target.value = newValue;
        e.target.setSelectionRange(startPos + filteredText.length, startPos + filteredText.length);

        if (pastedText !== filteredText) {
            // CIDR記法が含まれていた場合は専用の警告を表示
            if (pastedText.includes('/')) {
                this.showCIDRWarning(e.target);
            } else {
                this.showConversionFeedback(e.target);
            }
        }
    }

    handleCompositionStart(e) {
        // IME入力開始時
        e.target.dataset.composing = 'true';
    }

    handleCompositionUpdate(e) {
        // IME入力中
        // 全角文字をリアルタイムで半角に変換
        if (e.data) {
            const converted = this.convertToHalfWidth(e.data);
            if (e.data !== converted) {
                // ブラウザによってはここで変換を妨げる可能性があるので、
                // composition終了後に処理することが安全
            }
        }
    }

    handleCompositionEnd(e) {
        // IME入力終了時
        e.target.dataset.composing = 'false';

        // 全角文字が入力された場合は半角に変換
        setTimeout(() => {
            const originalValue = e.target.value;
            const convertedValue = this.convertToHalfWidth(originalValue);
            const filteredValue = this.filterIPCharacters(convertedValue);

            if (originalValue !== filteredValue) {
                e.target.value = filteredValue;
                this.showConversionFeedback(e.target);
            }
        }, 0);
    }

    convertToHalfWidth(text) {
        let converted = text;
        for (const [fullWidth, halfWidth] of Object.entries(this.fullWidthToHalfWidth)) {
            converted = converted.replace(new RegExp(fullWidth, 'g'), halfWidth);
        }
        return converted;
    }

    filterIPCharacters(text) {
        // IPアドレスに使用可能な文字（0-9とピリオド）のみを許可
        // CIDR記法（/24など）のスラッシュは除外
        return text.replace(/[^0-9.]/g, '');
    }

    isValidIPCharacter(char) {
        return /[0-9.]/.test(char);
    }

    isFullWidthNumber(char) {
        return /[０-９．。]/.test(char);
    }

    showConversionFeedback(element) {
        // 既存のフィードバックを削除
        const existingFeedback = element.parentNode.querySelector('.ip-conversion-feedback');
        if (existingFeedback) {
            existingFeedback.remove();
        }

        // 変換フィードバックを表示
        const feedback = document.createElement('div');
        feedback.className = 'ip-conversion-feedback';
        feedback.style.cssText = `
            position: absolute;
            top: 100%;
            left: 0;
            background: #4CAF50;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 1000;
            white-space: nowrap;
            margin-top: 2px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        `;
        feedback.textContent = '全角文字を半角に変換しました';

        // 親要素の位置をrelativeに設定
        const parent = element.parentNode;
        const originalPosition = getComputedStyle(parent).position;
        if (originalPosition === 'static') {
            parent.style.position = 'relative';
        }

        parent.appendChild(feedback);

        // 2秒後にフィードバックを削除
        setTimeout(() => {
            if (feedback.parentNode) {
                feedback.remove();
            }
            // 元の位置設定を復元
            if (originalPosition === 'static') {
                parent.style.position = originalPosition;
            }
        }, 2000);
    }

    showCIDRWarning(element) {
        // 既存のフィードバックを削除
        const existingFeedback = element.parentNode.querySelector('.ip-conversion-feedback');
        if (existingFeedback) {
            existingFeedback.remove();
        }

        // CIDR記法警告フィードバックを表示
        const feedback = document.createElement('div');
        feedback.className = 'ip-conversion-feedback';
        feedback.style.cssText = `
            position: absolute;
            top: 100%;
            left: 0;
            background: #f44336;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 1000;
            white-space: nowrap;
            margin-top: 2px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        `;
        feedback.textContent = 'CIDR記法（/24）は入力できません';

        // 親要素の位置をrelativeに設定
        const parent = element.parentNode;
        const originalPosition = getComputedStyle(parent).position;
        if (originalPosition === 'static') {
            parent.style.position = 'relative';
        }

        parent.appendChild(feedback);

        // 3秒後にフィードバックを削除（警告なので少し長めに表示）
        setTimeout(() => {
            if (feedback.parentNode) {
                feedback.remove();
            }
            // 元の位置設定を復元
            if (originalPosition === 'static') {
                parent.style.position = originalPosition;
            }
        }, 3000);
    }
}

// IPInputHelperのグローバルインスタンスを作成
window.ipInputHelper = new IPInputHelper();